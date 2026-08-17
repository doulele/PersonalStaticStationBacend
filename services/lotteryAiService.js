/**
 * 彩票 AI 智能选号服务 - 基于 DeepSeek
 * 根据历史开奖数据的完整统计分析结果，生成智能选号推荐
 *
 * 优化点（A/B/C）：
 * A. 补齐统计特征（位置概率、滚动频率、奇偶比分布、和值分布、完整遗漏榜）
 * B. Prompt 加入合理区间约束（和值、奇偶比、区间分布、连号）
 * C. 后置硬校验 + 智能补全（用统计得分高的号码替换不合理号码）
 */
import axios from 'axios'
import config from '../config/index.js'
import {
  LOTTERY_CONFIG,
  computeOverallProbability,
  computePositionProbability,
  computeTrendAnalysis
} from './lotteryAnalysis.js'

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'

const SYSTEM_PROMPT = `你是一个资深的彩票数据分析专家。用户会给你某彩票（双色球或大乐透）的历史开奖完整统计分析数据，你需要基于这些数据生成一组最接近历史统计规律的最优选号推荐。

## 重要免责声明
彩票开奖是完全随机的独立事件，历史数据无法预测未来。你的推荐仅供娱乐参考，请理性购彩。

## 你的任务
1. 综合历史频率（热号）、遗漏值（冷号回补）、位置概率、近期滚动频率等多维特征，生成 {groupCount} 组最优选号方案
2. 每组号码必须符合彩票规则（号码范围、不重复、升序排列），并尽量落在下方"合理区间"内
3. 为每组方案给出简短的分析理由（说明为何选这些号）

## 合理区间约束（尽量满足）
- 和值：双色球红球和值多集中在 60-140；大乐透前区和值多集中在 60-130
- 奇偶比：避免全奇或全偶，优先 3:3 / 2:4 / 4:2（双色球6红球），大乐透前区5球优先 2:3 / 3:2
- 区间分布：号码在整体范围内分布尽量均匀，避免过度集中在某一小段
- 连号：允许 0-1 组连号，避免大量连号

## 彩票规则
- 双色球(ssq)：红球 6 个（1-33 不重复，升序）+ 蓝球 1 个（1-16）
- 大乐透(dlt)：前区 5 个（1-35 不重复，升序）+ 后区 2 个（1-12 不重复，升序）

## 输出格式（严格 JSON，不要 markdown 包裹）
{
  "summary": "一段 50-100 字的整体选号思路概述，说明你参考了哪些统计特征",
  "plans": [
    {
      "reds": [1, 5, 12, 18, 25, 33],
      "blues": [7],
      "reason": "这组方案的理由（20字内）"
    }
  ]
}

## 注意事项
- reds 为红球/前区号码，blues 为蓝球/后区号码，均为升序数组
- blues 数组长度：双色球为 1，大乐透为 2
- 号码必须是整数且在合法范围内
- 只基于提供的统计特征做合理推断，不要编造`


/**
 * 计算号码的"推荐得分"（用于后置智能补全）
 * 得分越高越值得推荐，综合了热度、遗漏回补、近期频率
 */
function buildScoreMap(overall, trend, type) {
  const cfg = LOTTERY_CONFIG[type]
  const total = overall.totalPeriods || 1

  const redScore = {}
  const blueScore = {}

  // 整体概率（热度）
  const redProbMap = {}
  overall.reds.forEach(r => { redProbMap[r.number] = r })
  const blueProbMap = {}
  overall.blues.forEach(b => { blueProbMap[b.number] = b })

  // 近期30期滚动频率
  const rolling30 = trend.rollingFrequency?.[30]
  const recentRedFreq = {}
  const recentBlueFreq = {}
  if (rolling30) {
    rolling30.reds.forEach(r => { recentRedFreq[r.number] = r.count })
    rolling30.blues.forEach(b => { recentBlueFreq[b.number] = b.count })
  }

  // 红球得分
  for (let n = cfg.redRange[0]; n <= cfg.redRange[1]; n++) {
    const p = redProbMap[n]
    const freq = p?.frequency || 0
    const missing = p?.missingPeriods || 0
    const recent = recentRedFreq[n] || 0
    // 综合得分：热度 + 遗漏回补 + 近期频率
    redScore[n] = (
      freq * 100 +                      // 整体热度
      Math.min(missing / Math.max(1, total), 1) * 40 +  // 遗漏回补（适度）
      Math.min(recent / Math.max(1, 30), 1) * 30         // 近期频率
    )
  }

  // 蓝球得分
  for (let n = cfg.blueRange[0]; n <= cfg.blueRange[1]; n++) {
    const p = blueProbMap[n]
    const freq = p?.frequency || 0
    const missing = p?.missingPeriods || 0
    const recent = recentBlueFreq[n] || 0
    blueScore[n] = (
      freq * 100 +
      Math.min(missing / Math.max(1, total), 1) * 40 +
      Math.min(recent / Math.max(1, 30), 1) * 30
    )
  }

  return { redScore, blueScore }
}


/**
 * 调用 DeepSeek 生成智能选号推荐
 * @param {object} params
 * @param {string} params.type - ssq | dlt
 * @param {Array} params.data - 历史开奖数据 [{ reds, blue/blues, date }]
 * @param {number} params.groupCount - 生成方案组数（默认 5）
 * @returns {Promise<object|null>} { summary, plans: [{ reds, blues, reason }] }
 */
export async function getAiLotteryRecommendation({ type, data, groupCount = 5 }) {
  const apiKey = config.deepseekApiKey
  if (!apiKey) {
    console.warn('[LotteryAI] DeepSeek API Key 未配置，无法使用 AI 推荐')
    return null
  }

  if (!data || data.length === 0) {
    console.warn('[LotteryAI] 缺少历史数据')
    return null
  }

  // 复用现有分析服务生成完整统计特征
  let stats
  let scoreMap
  try {
    const overall = computeOverallProbability(data, type)
    const position = computePositionProbability(data, type)
    const trend = computeTrendAnalysis(data, type)

    scoreMap = buildScoreMap(overall, trend, type)

    stats = {
      type,
      totalPeriods: overall.totalPeriods,
      dataRange: overall.dataRange,

      // 热号 / 冷号
      hotReds: overall.hotReds.map(r => ({ number: r.number, count: r.count })),
      coldReds: overall.coldReds.map(r => ({ number: r.number, missing: r.missingPeriods })),
      hotBlues: overall.hotBlues.map(b => ({ number: b.number, count: b.count })),
      coldBlues: overall.coldBlues.map(b => ({ number: b.number, missing: b.missingPeriods })),

      // 位置概率（每个位置 Top5）
      redPositions: position.redPositions.map(p => ({
        position: p.position,
        top5: p.top5.map(t => ({ number: t.number, count: t.count }))
      })),
      bluePositions: position.bluePositions.map(p => ({
        position: p.position,
        top5: p.top5.map(t => ({ number: t.number, count: t.count }))
      })),

      // 滚动频率（近30/50/100期各号码出现次数）
      rollingFrequency: {
        recent30: trend.rollingFrequency?.[30]?.reds
          ?.sort((a, b) => b.count - a.count).slice(0, 15)
          .map(r => ({ number: r.number, count: r.count })),
        recent50: trend.rollingFrequency?.[50]?.reds
          ?.sort((a, b) => b.count - a.count).slice(0, 15)
          .map(r => ({ number: r.number, count: r.count }))
      },

      // 奇偶比分布（历史最常见的前几种）
      oddEvenDistribution: trend.oddEvenDistribution,

      // 和值分布（历史最常见的和值区间）
      sumBuckets: trend.sumBuckets,

      // 完整遗漏榜（当前遗漏值最高的号码，即最冷的号）
      latestRedMissing: trend.latestRedMissing.slice(0, 15).map(m => ({ number: m.number, missing: m.missing })),
      latestBlueMissing: trend.latestBlueMissing.slice(0, 8).map(m => ({ number: m.number, missing: m.missing })),

      // 最近 10 期开奖，供 AI 参考走势
      recent10: data.slice(-10).map(d => ({
        date: d.date,
        reds: d.reds,
        blues: type === 'ssq' ? [d.blue] : d.blues
      }))
    }
  } catch (err) {
    console.error('[LotteryAI] 统计计算失败:', err.message)
    return null
  }

  try {
    console.log(`[LotteryAI] 请求 DeepSeek 推荐，类型: ${type}，组数: ${groupCount}`)

    const response = await axios.post(
      DEEPSEEK_API,
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `请为以下彩票类型生成 ${groupCount} 组最优选号推荐：\n${JSON.stringify(stats, null, 2)}`
          }
        ],
        temperature: 0.8,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 30000
      }
    )

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) {
      console.error('[LotteryAI] DeepSeek 返回空内容')
      return null
    }

    const parsed = extractJson(content)
    if (!parsed) {
      console.error('[LotteryAI] 无法解析 AI 返回的 JSON')
      return null
    }

    const result = validateResult(parsed, type, scoreMap)
    console.log('[LotteryAI] AI 推荐成功:', result.plans.length, '组')
    return result

  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.error('[LotteryAI] DeepSeek 请求超时')
    } else if (err.response) {
      console.error(`[LotteryAI] DeepSeek API 错误 ${err.response.status}:`,
        JSON.stringify(err.response.data || {}).slice(0, 300))
    } else {
      console.error('[LotteryAI] 请求失败:', err.message)
    }
    return null
  }
}

/**
 * 从 LLM 返回内容中提取 JSON 对象
 */
function extractJson(content) {
  const trimmed = content.trim()
  try { return JSON.parse(trimmed) } catch {}
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mdMatch) { try { return JSON.parse(mdMatch[1].trim()) } catch {} }
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) } catch {}
  }
  return null
}

/**
 * 校验并清洗 AI 返回的号码，确保符合彩票规则
 * 后置硬校验 + 智能补全（C）：数量不足/重复时用高分号码补全，而非简单截断
 */
function validateResult(parsed, type, scoreMap) {
  const cfg = LOTTERY_CONFIG[type]
  const isSSQ = type === 'ssq'
  const redRange = cfg.redRange
  const redCount = cfg.redCount
  const blueRange = cfg.blueRange
  const blueCount = cfg.blueCount

  const { redScore, blueScore } = scoreMap

  const plans = (Array.isArray(parsed.plans) ? parsed.plans : [])
    .map(p => {
      // 红球/前区：清洗 + 去重 + 升序
      let reds = (Array.isArray(p.reds) ? p.reds : [])
        .map(Number)
        .filter(n => Number.isInteger(n) && n >= redRange[0] && n <= redRange[1])
      reds = [...new Set(reds)].sort((a, b) => a - b)

      // 蓝球/后区：清洗 + 去重 + 升序
      let blues = (Array.isArray(p.blues) ? p.blues : [])
        .map(Number)
        .filter(n => Number.isInteger(n) && n >= blueRange[0] && n <= blueRange[1])
      blues = [...new Set(blues)].sort((a, b) => a - b)

      // 智能补全（C）：数量不足时，用得分最高的号码补位
      reds = fillByScore(reds, redScore, redRange, redCount)
      blues = fillByScore(blues, blueScore, blueRange, blueCount)

      // 仍不足则跳过（理论上不会发生，因为号码池足够）
      if (reds.length !== redCount || blues.length !== blueCount) return null

      return {
        reds,
        blues,
        reason: String(p.reason || '').slice(0, 50)
      }
    })
    .filter(Boolean)

  return {
    summary: String(parsed.summary || '').slice(0, 200),
    plans
  }
}

/**
 * 用得分最高的号码补全不足的号码（智能补全）
 * @param {number[]} nums - 已有号码（已升序、去重）
 * @param {object} scoreMap - { number: score }
 * @param {[number, number]} range - [min, max]
 * @param {number} count - 目标数量
 */
function fillByScore(nums, scoreMap, range, count) {
  if (nums.length >= count) return nums.slice(0, count)

  const used = new Set(nums)
  const result = [...nums]

  // 从得分最高的号码中，挑未使用的补位
  const candidates = Object.keys(scoreMap)
    .map(Number)
    .filter(n => n >= range[0] && n <= range[1] && !used.has(n))
    .sort((a, b) => (scoreMap[b] || 0) - (scoreMap[a] || 0))

  for (const n of candidates) {
    if (result.length >= count) break
    result.push(n)
    used.add(n)
  }

  return result.sort((a, b) => a - b)
}
