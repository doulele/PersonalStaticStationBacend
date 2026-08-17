/**
 * 股票推荐与测评系统 — 路由
 * ------------------------------------------------------------
 * GET /stock-recommend/list            股票列表（筛选/排序/分页）
 * GET /stock-recommend/detail/:code    股票详情（六维评分+K线+风险+资金情绪）
 * GET /stock-recommend/search          搜索联想（代码/名称）
 * GET /stock-recommend/industries      行业列表（东财行业）
 * GET /stock-recommend/config/horizons 周期权重配置
 */
import { Router } from 'express'
import { buildScorePool, buildStockDetail, HORIZONS } from '../services/stockScoreService.js'
import { getMarketSnapshot } from '../services/stockDataService.js'

const router = Router()

/** 数值参数解析 */
function num(q, key) {
  if (q[key] === undefined || q[key] === '') return null
  const v = Number(q[key])
  return isNaN(v) ? null : v
}
function bool(q, key) {
  const v = q[key]
  return v === 'true' || v === '1' ? true : (v === 'false' || v === '0' ? false : null)
}

const SORTABLE = {
  score: 'score', price: 'price', changePct: 'changePct', peTtm: 'peTtm',
  pb: 'pb', roe: 'roe', marketCap: 'marketCap', turnoverRate: 'turnoverRate',
  star: 'star', conclusion: 'conclusion'
}

// 推荐结论排序权重（推荐强度降序）
const CONCLUSION_ORDER = { '重点关注': 5, '可关注': 4, '中性': 3, '谨慎': 2, '回避': 1 }

/** 客户端断开信号：请求已响应后不会误取消（后台构建继续预热） */
function disconnectSignal(req, res) {
  const ac = new AbortController()
  req.on('close', () => {
    if (!res.writableEnded) ac.abort()
  })
  return ac.signal
}

/** 列表接口 */
router.get('/list', async (req, res) => {
  const q = req.query
  const horizon = ['short', 'mid', 'long'].includes(q.horizon) ? q.horizon : 'short'
  const page = Math.max(1, num(q, 'page') || 1)
  const pageSize = [20, 50, 100].includes(Number(q.pageSize)) ? Number(q.pageSize) : 20
  const signal = disconnectSignal(req, res)

  // 快筛条件（影响池子构成）
  const quickFilters = {
    industry: q.industry || null,
    minPe: num(q, 'minPe'), maxPe: num(q, 'maxPe'),
    minPb: num(q, 'minPb'), maxPb: num(q, 'maxPb'),
    minDiv: num(q, 'minDividend'), maxDiv: num(q, 'maxDividend'),
    minTurnover: num(q, 'minTurnoverRate'), maxTurnover: num(q, 'maxTurnoverRate'),
    // 市值：前端传亿元
    minMarketCap: num(q, 'minMarketCap') != null ? num(q, 'minMarketCap') * 1e8 : null,
    maxMarketCap: num(q, 'maxMarketCap') != null ? num(q, 'maxMarketCap') * 1e8 : null
  }

  // 评分类筛选（池内过滤）
  const finFilters = {
    minRoe: num(q, 'minRoe'), maxRoe: num(q, 'maxRoe'),
    minRevGrowth: num(q, 'minRevenueGrowth'), maxRevGrowth: num(q, 'maxRevenueGrowth'),
    minProfitGrowth: num(q, 'minProfitGrowth'), maxProfitGrowth: num(q, 'maxProfitGrowth'),
    // 单季同比（成长细化）
    minQRev: num(q, 'minQRevGrowth'), maxQRev: num(q, 'maxQRevGrowth'),
    minQProfit: num(q, 'minQProfitGrowth'), maxQProfit: num(q, 'maxQProfitGrowth'),
    minGross: num(q, 'minGrossMargin'), maxGross: num(q, 'maxGrossMargin'),
    minNet: num(q, 'minNetMargin'), maxNet: num(q, 'maxNetMargin'),
    minOcf: num(q, 'minOcfRatio'),
    maxGoodwill: num(q, 'maxGoodwillRatio'),
    maxDebt: num(q, 'maxDebtRatio'),
    maxVol20: num(q, 'maxVolatility20'),
    minVolRatio: num(q, 'minVolumeRatio'), maxVolRatio: num(q, 'maxVolumeRatio'),
    minChg5d: num(q, 'minChg5d'), maxChg5d: num(q, 'maxChg5d'),
    minScore: num(q, 'minScore'), maxScore: num(q, 'maxScore'),
    riskLevel: q.riskLevel || null,
    conclusion: q.conclusion ? String(q.conclusion).split(',').filter(Boolean) : null,
    isAboveMa60: bool(q, 'isAboveMa60'),
    // 技术面扩展筛选
    techFlags: {
      bullAlign: bool(q, 'techBullAlign'),
      macdGolden: bool(q, 'techMacdGolden'),
      kdjGolden: bool(q, 'techKdjGolden'),
      breakHigh20: bool(q, 'techBreakHigh20'),
      kdjOversold: bool(q, 'techKdjOversold')
    },
    minTechScore: num(q, 'minTechScore'),
    maxTechScore: num(q, 'maxTechScore')
  }

  try {
    // 强制刷新：refresh=1 时绕过缓存重建评分池
    const force = q.refresh === '1' || q.refresh === 'true'
    const { stocks, meta } = await buildScorePool(horizon, quickFilters, 300, signal, force)

    let list = stocks
    if (meta?.stage === 'base') {
      // 基础池阶段：股票尚无 F10 明细，评分类筛选暂不生效；
      // 后台完整池构建完成后（meta.stage='full'）前端轮询刷新即恢复筛选
    } else {
      list = stocks.filter(s => {
        const b = s.basic
        const f = finFilters
        if (f.minRoe != null && (b.roe == null || b.roe < f.minRoe)) return false
        if (f.maxRoe != null && (b.roe == null || b.roe > f.maxRoe)) return false
        if (f.minRevGrowth != null) {
          const g = s.details?.find(d => d.key === 'growth')?.subItems?.find(i => i.name === '营收累计同比')?.raw
          if (g == null || g * 100 < f.minRevGrowth) return false
        }
        if (f.maxRevGrowth != null) {
          const g = s.details?.find(d => d.key === 'growth')?.subItems?.find(i => i.name === '营收累计同比')?.raw
          if (g != null && g * 100 > f.maxRevGrowth) return false
        }
        if (f.minProfitGrowth != null) {
          const g = s.details?.find(d => d.key === 'growth')?.subItems?.find(i => i.name === '净利累计同比')?.raw
          if (g == null || g * 100 < f.minProfitGrowth) return false
        }
        if (f.maxProfitGrowth != null) {
          const g = s.details?.find(d => d.key === 'growth')?.subItems?.find(i => i.name === '净利累计同比')?.raw
          if (g != null && g * 100 > f.maxProfitGrowth) return false
        }
        if (f.minGross != null) {
          const g = s.details?.find(d => d.key === 'quality')?.subItems?.find(i => i.name === '毛利率')?.raw
          if (g == null || g < f.minGross) return false
        }
        if (f.maxGross != null) {
          const g = s.details?.find(d => d.key === 'quality')?.subItems?.find(i => i.name === '毛利率')?.raw
          if (g != null && g > f.maxGross) return false
        }
        if (f.minOcf != null) {
          const g = s.details?.find(d => d.key === 'quality')?.subItems?.find(i => i.name === '经营现金流/净利润')?.raw
          if (g == null || g < f.minOcf) return false
        }
        if (f.minScore != null && s.total < f.minScore) return false
        if (f.maxScore != null && s.total > f.maxScore) return false
        if (f.riskLevel && s.riskLevel !== f.riskLevel) return false
        if (f.conclusion && f.conclusion.length && !f.conclusion.includes(s.conclusion)) return false
        if (f.isAboveMa60 === true && !s.aboveMa60) return false
        if (f.isAboveMa60 === false && s.aboveMa60) return false
        // 技术面扩展筛选
        const tf = s.techFlags || {}
        if (f.techFlags.bullAlign === true && !tf.bullAlign) return false
        if (f.techFlags.macdGolden === true && !tf.macdGolden) return false
        if (f.techFlags.kdjGolden === true && !tf.kdjGolden) return false
        if (f.techFlags.kdjOversold === true && !tf.kdjOversold) return false
        if (f.techFlags.breakHigh20 === true && !tf.breakHigh20) return false
        if (f.minTechScore != null && (s.dimScores?.technical == null || s.dimScores.technical < f.minTechScore)) return false
        if (f.maxTechScore != null && (s.dimScores?.technical == null || s.dimScores.technical > f.maxTechScore)) return false
        // ===== 补全筛选：从 details 子指标提取 raw 值 =====
        const rawOf = (dimKey, name) => s.details?.find(d => d.key === dimKey)?.subItems?.find(i => i.name === name)?.raw
        // 单季营收/净利同比（成长）
        const qRev = rawOf('growth', '单季营收同比')
        const qProfit = rawOf('growth', '单季净利同比')
        if (f.minQRev != null && (qRev == null || qRev * 100 < f.minQRev)) return false
        if (f.maxQRev != null && (qRev != null && qRev * 100 > f.maxQRev)) return false
        if (f.minQProfit != null && (qProfit == null || qProfit * 100 < f.minQProfit)) return false
        if (f.maxQProfit != null && (qProfit != null && qProfit * 100 > f.maxQProfit)) return false
        // 净利率（盈利质量）
        const netMargin = rawOf('quality', '净利率')
        if (f.minNet != null && (netMargin == null || netMargin < f.minNet)) return false
        if (f.maxNet != null && (netMargin != null && netMargin > f.maxNet)) return false
        // 商誉/净资产（上限）
        const goodwill = rawOf('quality', '商誉/净资产')
        if (f.maxGoodwill != null && (goodwill != null && goodwill * 100 > f.maxGoodwill)) return false
        // 资产负债率（上限）
        const debt = rawOf('risk', '资产负债率')
        if (f.maxDebt != null && (debt != null && debt > f.maxDebt)) return false
        // 20日波动率（上限）
        const vol20 = rawOf('risk', '20日波动率')
        if (f.maxVol20 != null && (vol20 != null && vol20 > f.maxVol20)) return false
        // 量比（资金情绪）
        const volRatio = rawOf('sentiment', '量比(资金活跃度)')
        if (f.minVolRatio != null && (volRatio == null || volRatio < f.minVolRatio)) return false
        if (f.maxVolRatio != null && (volRatio != null && volRatio > f.maxVolRatio)) return false
        // 5日涨跌幅（资金情绪）
        const chg5d = rawOf('sentiment', '5日涨跌幅')
        if (f.minChg5d != null && (chg5d == null || chg5d * 100 < f.minChg5d)) return false
        if (f.maxChg5d != null && (chg5d != null && chg5d * 100 > f.maxChg5d)) return false
        return true
      })
    }

    // 排序
    const sortBy = SORTABLE[q.sortBy] ? q.sortBy : 'score'
    const sortOrder = q.sortOrder === 'asc' ? 1 : -1
    list.sort((a, b) => {
      let va, vb
      if (sortBy === 'score') { va = a.total; vb = b.total }
      else if (sortBy === 'star') { va = a.star; vb = b.star }
      else if (sortBy === 'conclusion') {
        va = CONCLUSION_ORDER[a.conclusion] ?? 0
        vb = CONCLUSION_ORDER[b.conclusion] ?? 0
      } else { va = a.basic[sortBy] ?? a[sortBy]; vb = b.basic[sortBy] ?? b[sortBy] }
      if (va == null) return 1
      if (vb == null) return -1
      return (va - vb) * sortOrder
    })

    const total = list.length
    const start = (page - 1) * pageSize
    const rows = list.slice(start, start + pageSize).map(s => ({
      code: s.basic.code,
      name: s.basic.name,
      industry: s.basic.industry,
      price: s.basic.price,
      changePct: s.basic.changePct,
      score: s.total,
      star: s.star,
      conclusion: s.conclusion,
      riskLevel: s.riskLevel,
      reasonShort: s.reasonShort,
      peTtm: s.basic.peTtm,
      pb: s.basic.pb,
      roe: s.basic.roe,
      marketCap: s.basic.marketCap,
      turnoverRate: s.basic.turnoverRate
    }))

    res.json({ code: 0, data: { total, list: rows, page, pageSize, meta } })
  } catch (e) {
    if (e?.name === 'AbortError') return // 客户端已断开，无需响应
    console.error('[stockRecommend] list error:', e.message)
    res.status(500).json({ code: 1, message: '服务暂不可用，请稍后重试' })
  }
})

/** 详情接口 */
router.get('/detail/:code', async (req, res) => {
  const horizon = ['short', 'mid', 'long'].includes(req.query.horizon) ? req.query.horizon : 'short'
  const signal = disconnectSignal(req, res)
  try {
    const detail = await buildStockDetail(req.params.code, horizon, signal)
    if (!detail) {
      return res.json({ code: 1, message: '未找到该股票' })
    }
    res.json({ code: 0, data: detail })
  } catch (e) {
    if (e?.name === 'AbortError') return // 客户端已断开，无需响应
    console.error('[stockRecommend] detail error:', e.message)
    res.status(500).json({ code: 1, message: '服务暂不可用，请稍后重试' })
  }
})

/** 搜索联想 */
router.get('/search', async (req, res) => {
  const keyword = String(req.query.keyword || '').trim()
  if (!keyword) return res.json({ code: 0, data: [] })
  try {
    const market = await getMarketSnapshot()
    const kw = keyword.toUpperCase()
    const matched = market
      .filter(s => s.code.includes(kw) || (s.name && s.name.includes(keyword)))
      .slice(0, 10)
      .map(s => ({ code: s.code, name: s.name, industry: s.industry }))
    res.json({ code: 0, data: matched })
  } catch (e) {
    console.error('[stockRecommend] search error:', e.message)
    res.status(500).json({ code: 1, message: '搜索失败' })
  }
})

/** 行业评分排名（复用评分池，按行业聚合平均分/最高分） */
router.get('/industry-ranking', async (req, res) => {
  const horizon = ['short', 'mid', 'long'].includes(req.query.horizon) ? req.query.horizon : 'short'
  try {
    const { stocks } = await buildScorePool(horizon, {}, 300)
    const map = new Map()
    stocks.forEach(s => {
      const ind = s.basic?.industry
      if (!ind) return
      let g = map.get(ind)
      if (!g) { g = { industry: ind, count: 0, sum: 0, maxScore: 0, top: null }; map.set(ind, g) }
      g.count++
      g.sum += s.total
      if (s.total > g.maxScore) { g.maxScore = s.total; g.top = { code: s.basic.code, name: s.basic.name, score: s.total } }
    })
    const list = [...map.values()]
      .map(g => ({
        industry: g.industry,
        count: g.count,
        avgScore: Math.round(g.sum / g.count),
        maxScore: g.maxScore,
        top: g.top
      }))
      .sort((a, b) => b.avgScore - a.avgScore)
    res.json({ code: 0, data: list })
  } catch (e) {
    console.error('[stockRecommend] industry-ranking error:', e.message)
    res.status(500).json({ code: 1, message: '获取行业排名失败' })
  }
})

/** 行业列表 */
router.get('/industries', async (req, res) => {
  try {
    const market = await getMarketSnapshot()
    const map = new Map()
    market.forEach(s => {
      if (s.industry) map.set(s.industry, (map.get(s.industry) || 0) + 1)
    })
    const list = [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))
    res.json({ code: 0, data: list })
  } catch (e) {
    console.error('[stockRecommend] industries error:', e.message)
    res.status(500).json({ code: 1, message: '获取行业失败' })
  }
})

/** 周期配置 */
router.get('/config/horizons', (req, res) => {
  res.json({
    code: 0,
    data: Object.entries(HORIZONS).map(([key, h]) => ({
      key,
      label: h.label,
      holdingPeriod: h.holdingPeriod,
      desc: h.desc,
      dimWeights: h.dimWeights,
      techSubWeights: h.techSubWeights
    }))
  })
})

export default router
