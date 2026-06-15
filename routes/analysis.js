/**
 * 彩票分析 API 路由
 *
 * 提供走势分析、概率计算、智能推荐等数据接口
 */

import { Router } from 'express'
import { readCache } from '../services/lotteryCrawler.js'
import {
  computeOverallProbability,
  computePositionProbability,
  computeTrendAnalysis,
  generateRecommendations,
  generateOverallPlans,
  generatePositionPlans
} from '../services/lotteryAnalysis.js'

const router = Router()

/**
 * 校验并获取缓存数据
 */
function getCachedData(type) {
  if (!['ssq', 'dlt'].includes(type)) {
    return { error: '类型无效，仅支持 ssq / dlt' }
  }
  const data = readCache(type)
  if (!data || data.length === 0) {
    return { error: `暂无 ${type} 缓存数据，请先运行爬取脚本` }
  }
  return { data }
}

// ==================== 走势分析 ====================

/**
 * GET /analysis/trend/:type
 * 获取走势分析数据（遗漏值、冷热号、奇偶比、和值分布等）
 */
router.get('/trend/:type', (req, res) => {
  const { type } = req.params
  const result = getCachedData(type)
  if (result.error) {
    return res.json({ code: -1, msg: result.error, data: null })
  }

  const trend = computeTrendAnalysis(result.data, type)

  res.json({
    code: 1,
    msg: 'ok',
    data: trend
  })
})

// ==================== 整体概率方案 ====================

/**
 * GET /analysis/overall/:type
 * 获取整体概率分析 + 生成一批推荐方案
 * query: planCount=5 同批次方案数量
 */
router.get('/overall/:type', (req, res) => {
  const { type } = req.params
  const planCount = parseInt(req.query.planCount) || 5

  const result = getCachedData(type)
  if (result.error) {
    return res.json({ code: -1, msg: result.error, data: null })
  }

  const probability = computeOverallProbability(result.data, type)
  const plans = generateOverallPlans(result.data, type, planCount)

  res.json({
    code: 1,
    msg: 'ok',
    data: {
      probability,
      plans: plans.plans
    }
  })
})

/**
 * GET /analysis/overall/refresh/:type
 * "换一批" — 仅重新生成方案（概率数据使用缓存）
 * query: planCount=5
 */
router.get('/overall/refresh/:type', (req, res) => {
  const { type } = req.params
  const planCount = parseInt(req.query.planCount) || 5

  const result = getCachedData(type)
  if (result.error) {
    return res.json({ code: -1, msg: result.error, data: null })
  }

  const plans = generateOverallPlans(result.data, type, planCount)

  res.json({
    code: 1,
    msg: 'ok',
    data: {
      plans: plans.plans
    }
  })
})

// ==================== 位置概率方案 ====================

/**
 * GET /analysis/position/:type
 * 获取位置概率分析 + 生成一批位置方案
 * query: planCount=5
 */
router.get('/position/:type', (req, res) => {
  const { type } = req.params
  const planCount = parseInt(req.query.planCount) || 5

  const result = getCachedData(type)
  if (result.error) {
    return res.json({ code: -1, msg: result.error, data: null })
  }

  const probability = computePositionProbability(result.data, type)
  const plans = generatePositionPlans(result.data, type, planCount)

  res.json({
    code: 1,
    msg: 'ok',
    data: {
      probability,
      plans: plans.plans
    }
  })
})

/**
 * GET /analysis/position/refresh/:type
 * "换一批" — 仅重新生成位置方案
 * query: planCount=5
 */
router.get('/position/refresh/:type', (req, res) => {
  const { type } = req.params
  const planCount = parseInt(req.query.planCount) || 5

  const result = getCachedData(type)
  if (result.error) {
    return res.json({ code: -1, msg: result.error, data: null })
  }

  const plans = generatePositionPlans(result.data, type, planCount)

  res.json({
    code: 1,
    msg: 'ok',
    data: {
      plans: plans.plans
    }
  })
})

// ==================== 智能推荐（可调参数） ====================

/**
 * POST /analysis/recommend/:type
 * 智能推荐 — 支持丰富的可调参数
 *
 * body:
 * {
 *   planCount: 5,           // 方案数量
 *   hotWeight: 35,          // 热号权重 (0-100)
 *   coldWeight: 25,         // 冷号权重 (0-100)
 *   missingWeight: 20,      // 遗漏回补权重 (0-100)
 *   randomWeight: 20,       // 随机扰动权重 (0-100)
 *   recentPeriods: 50,      // 近期范围(期数)
 *   oddEvenBalance: 60,     // 奇偶平衡偏好 (0-100)
 *   sumTargetMin: null,     // 和值下限
 *   sumTargetMax: null,     // 和值上限
 *   consecutiveAllow: true, // 是否允许连号
 *   consecutiveMax: 2,      // 最多连号组数
 *   excludeNumbers: [],     // 排除的号码
 *   fixedReds: [],          // 必选红球/前区
 *   fixedBlues: [],         // 必选蓝球/后区
 *   seed: null              // 随机种子(相同种子=相同结果)
 * }
 */
router.post('/recommend/:type', (req, res) => {
  const { type } = req.params

  const result = getCachedData(type)
  if (result.error) {
    return res.json({ code: -1, msg: result.error, data: null })
  }

  const options = {
    planCount: req.body.planCount ?? 5,
    hotWeight: req.body.hotWeight ?? 35,
    coldWeight: req.body.coldWeight ?? 25,
    missingWeight: req.body.missingWeight ?? 20,
    randomWeight: req.body.randomWeight ?? 20,
    recentPeriods: req.body.recentPeriods ?? 50,
    oddEvenBalance: req.body.oddEvenBalance ?? 60,
    sumTargetMin: req.body.sumTargetMin ?? null,
    sumTargetMax: req.body.sumTargetMax ?? null,
    consecutiveAllow: req.body.consecutiveAllow ?? true,
    consecutiveMax: req.body.consecutiveMax ?? 2,
    excludeNumbers: req.body.excludeNumbers ?? [],
    fixedReds: req.body.fixedReds ?? [],
    fixedBlues: req.body.fixedBlues ?? [],
    seed: req.body.seed ?? null
  }

  console.log(`[analysis/recommend] ${type} 生成推荐, 参数:`, JSON.stringify(options, null, 0))

  const recommendation = generateRecommendations(result.data, type, options)

  res.json({
    code: 1,
    msg: 'ok',
    data: recommendation
  })
})

/**
 * POST /analysis/recommend/refresh/:type
 * "换一批" — 使用相同参数重新生成（不传seed则自然随机）
 */
router.post('/recommend/refresh/:type', (req, res) => {
  const { type } = req.params

  const result = getCachedData(type)
  if (result.error) {
    return res.json({ code: -1, msg: result.error, data: null })
  }

  const options = {
    planCount: req.body.planCount ?? 5,
    hotWeight: req.body.hotWeight ?? 35,
    coldWeight: req.body.coldWeight ?? 25,
    missingWeight: req.body.missingWeight ?? 20,
    randomWeight: req.body.randomWeight ?? 20,
    recentPeriods: req.body.recentPeriods ?? 50,
    oddEvenBalance: req.body.oddEvenBalance ?? 60,
    sumTargetMin: req.body.sumTargetMin ?? null,
    sumTargetMax: req.body.sumTargetMax ?? null,
    consecutiveAllow: req.body.consecutiveAllow ?? true,
    consecutiveMax: req.body.consecutiveMax ?? 2,
    excludeNumbers: req.body.excludeNumbers ?? [],
    fixedReds: req.body.fixedReds ?? [],
    fixedBlues: req.body.fixedBlues ?? [],
    seed: null // 刷新时不传种子，自然随机
  }

  const recommendation = generateRecommendations(result.data, type, options)

  res.json({
    code: 1,
    msg: 'ok',
    data: {
      plans: recommendation.plans
    }
  })
})

// ==================== 分析配置参数说明 ====================

/**
 * GET /analysis/params-info
 * 返回可调参数的说明（供前端显示提示和滑块配置）
 */
router.get('/params-info', (req, res) => {
  res.json({
    code: 1,
    msg: 'ok',
    data: {
      params: [
        {
          key: 'hotWeight',
          label: '热号权重',
          description: '最近出现频繁的号码被选中的概率高低',
          min: 0,
          max: 100,
          default: 35,
          step: 5,
          tips: '增大倾向于选近期热门号，减小则降低热门号优先级'
        },
        {
          key: 'coldWeight',
          label: '冷号回补权重',
          description: '长期未出现的号码"冷号回补"的概率',
          min: 0,
          max: 100,
          default: 25,
          step: 5,
          tips: '增大倾向于赌冷号反弹，根据概率论长期未出的号码迟早会出现'
        },
        {
          key: 'missingWeight',
          label: '遗漏回补权重',
          description: '根据遗漏期数长度给予回补概率加成',
          min: 0,
          max: 100,
          default: 20,
          step: 5,
          tips: '遗漏越久的号码被选中概率越大，模拟"物极必反"的规律'
        },
        {
          key: 'randomWeight',
          label: '随机扰动',
          description: '随机因素在最终选择中的占比',
          min: 0,
          max: 100,
          default: 20,
          step: 5,
          tips: '增大则结果更随机多变，减小则更依赖数据分析，但也会更"机械"'
        },
        {
          key: 'recentPeriods',
          label: '近期范围(期)',
          description: '用于计算"近期热度"的参考期数',
          min: 10,
          max: 200,
          default: 50,
          step: 10,
          tips: '值越小越关注最近走势，值越大越平滑'
        },
        {
          key: 'oddEvenBalance',
          label: '奇偶平衡度',
          description: '对红球奇偶数平衡的偏好程度',
          min: 0,
          max: 100,
          default: 60,
          step: 10,
          tips: '0=不在意，100=极度偏好均衡。历史上双色球奇偶比3:3出现最多'
        },
        {
          key: 'consecutiveMax',
          label: '最大连号组数',
          description: '允许方案中最多的相邻号码对数',
          min: 0,
          max: 5,
          default: 2,
          step: 1,
          tips: '0=不允许任何连号，值越大允许多组连号'
        },
        {
          key: 'sumTargetMin',
          label: '和值下限',
          description: '红球号码总和的最小值（null=不限制）',
          min: null,
          max: null,
          default: null,
          tips: '双色球常见和值范围80-130，大乐透常见和值范围60-110'
        },
        {
          key: 'sumTargetMax',
          label: '和值上限',
          description: '红球号码总和的最大值（null=不限制）',
          min: null,
          max: null,
          default: null,
          tips: '配合下限使用可限定和值区间'
        }
      ]
    }
  })
})

export default router
