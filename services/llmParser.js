/**
 * 使用 DeepSeek (兼容 OpenAI API) 解析 OCR 文本，提取结构化彩票号码
 * 使用 axios 替代原生 fetch（兼容更多 Node 版本）
 */
import axios from 'axios'

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'

const SYSTEM_PROMPT = `你是一个彩票 OCR 文本解析器。我会给你一张中国彩票照片经过 OCR 识别后的原始文本，你需要从中提取所有注的开奖号码信息，并以 JSON 格式返回。

## 彩票类型判断
- 双色球 (SSQ)：红球 6 个（01-33）+ 蓝球 1 个（01-16）
- 大乐透 (DLT)：前区 5 个（01-35）+ 后区 2 个（01-12）

## 输出格式
一张照片可能包含多注（多个号组），必须以 groups 数组返回。单注格式如下：

{
  "groups": [
    {
      "type": "ssq",
      "issue": "期号，如 2025055 或 25074",
      "numbers": {
        "reds": [1, 5, 12, 18, 22, 30],
        "blue": 7
      }
    },
    {
      "type": "ssq",
      "issue": "2025055",
      "numbers": {
        "reds": [3, 8, 15, 22, 26, 31],
        "blue": 12
      }
    }
  ]
}

大乐透的单注格式：
{
  "type": "dlt",
  "issue": "25074",
  "numbers": {
    "fronts": [3, 8, 15, 22, 31],
    "backs": [5, 9]
  }
}

## 规则
- 只返回 JSON，不要任何解释，不要用 markdown 代码块包裹
- type 字段必须是小写 "ssq" 或 "dlt"
- 照片上每一注都要单独列为一个 group，不要合并遗漏
- 期号可能在票面顶部只出现一次，所有 group 共用同一个 issue
- 号码必须按升序排列
- OCR 常见错误需要修正：比如 "l"→1、"o"→0、"O"→0、"T"→7、"S"→5、"Z"→2
- OCR 数字粘连需要拆分：比如 "121416"→12,14,16、"0911"→09,11、"010203"→01,02,03
- 日期、流水号、金额、条码等噪音数据全部忽略，只关注彩票号码区域
- 期号常见模式：2024开头7位(双色球)、25开头5-6位(大乐透)、或单独出现`

/**
 * 调用 DeepSeek API 解析 OCR 文本
 * @param {string} ocrText - 腾讯云 OCR 返回的原始文本
 * @param {string} apiKey - DeepSeek API Key
 * @returns {Promise<object|null>} 结构化彩票号码，或 null
 */
export async function parseWithDeepSeek(ocrText, apiKey) {
  if (!ocrText || !apiKey) {
    console.warn('[LLM] 缺少参数: ocrText=' + !!ocrText + ', apiKey=' + !!apiKey)
    return null
  }

  try {
    const response = await axios.post(
      DEEPSEEK_API,
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `OCR 识别文本：\n${ocrText}` }
        ],
        temperature: 0,
        max_tokens: 1000,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 15000
      }
    )

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) {
      console.error('[LLM] DeepSeek 返回空内容, 完整响应:', JSON.stringify(response.data).slice(0, 500))
      return null
    }

    console.log('[LLM] DeepSeek 原始返回:', content.slice(0, 200))

    // 尝试解析 JSON（兼容 markdown 代码块包裹的情况）
    const parsed = extractJson(content)
    if (!parsed) {
      console.error('[LLM] 无法从返回内容中提取 JSON:', content)
      return null
    }

    console.log('[LLM] JSON 解析成功:', JSON.stringify(parsed).slice(0, 300))

    // 校验并规范化（支持多组 groups 数组）
    const result = normalizeResult(parsed)
    if (!result || result.length === 0) {
      console.error('[LLM] normalizeResult 失败, 原始 parsed:', JSON.stringify(parsed))
    }
    return result
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.error('[LLM] DeepSeek 请求超时')
    } else if (err.response) {
      const status = err.response.status
      const detail = JSON.stringify(err.response.data || {}).slice(0, 300)
      console.error(`[LLM] DeepSeek API 返回错误 ${status}:`, detail)
    } else {
      console.error('[LLM] DeepSeek 请求失败:', err.message, err.stack?.split('\n')[1]?.trim())
    }
    return null
  }
}

/**
 * 从 LLM 返回内容中提取 JSON 对象
 * 兼容以下格式：
 *   1. 纯 JSON: {"type": "ssq", ...}
 *   2. Markdown: ```json\n{...}\n```
 *   3. Markdown 无语言标记: ```\n{...}\n```
 */
function extractJson(content) {
  const trimmed = content.trim()

  // 直接尝试解析
  try { return JSON.parse(trimmed) } catch {}

  // 尝试提取 markdown 代码块中的 JSON
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1].trim()) } catch {}
  }

  // 尝试找到第一个 { 到最后一个 } 之间的内容
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) } catch {}
  }

  return null
}

/**
 * 规范化 LLM 解析结果，确保数组格式、数字类型正确
 * 支持单注和多注 groups 两种格式
 * @returns {object[]} 规范化后的号组数组
 */
function normalizeResult(parsed) {
  if (!parsed || typeof parsed !== 'object') return []

  // 新格式：{ groups: [...] }
  if (Array.isArray(parsed.groups) && parsed.groups.length > 0) {
    const groups = parsed.groups.map(normalizeGroup).filter(Boolean)
    console.log(`[LLM] 解析到 ${groups.length} 个号组`)
    return groups
  }

  // 兼容旧格式：单注 { type: "ssq", ... }
  const single = normalizeGroup(parsed)
  return single ? [single] : []
}

/**
 * 规范化单个号组
 */
function normalizeGroup(group) {
  if (!group || typeof group !== 'object') return null

  const rawType = (group.type || '').toLowerCase()
  const type = ['ssq', 'dlt'].includes(rawType) ? rawType : null
  if (!type) return null

  const result = {
    type,
    issue: typeof group.issue === 'string' ? group.issue : (group.issue != null ? String(group.issue) : ''),
    numbers: {}
  }

  const ns = group.numbers || {}
  const toNumArr = (v, min, max) => {
    if (!Array.isArray(v)) return []
    return v
      .map(n => Number(n))
      .filter(n => !isNaN(n) && n >= min && n <= max)
      .sort((a, b) => a - b)
  }
  const toNum = (v, min, max) => {
    const n = Number(v)
    return (!isNaN(n) && n >= min && n <= max) ? n : null
  }

  if (type === 'ssq') {
    result.numbers.reds = toNumArr(ns.reds, 1, 33).slice(0, 6)
    result.numbers.blue = toNum(ns.blue, 1, 16)
  } else if (type === 'dlt') {
    result.numbers.fronts = toNumArr(ns.fronts, 1, 35).slice(0, 5)
    result.numbers.backs = toNumArr(ns.backs, 1, 12).slice(0, 2)
  }

  return result
}
