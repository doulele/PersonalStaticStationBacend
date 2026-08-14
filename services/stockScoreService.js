/**
 * 股票测评 — 六维评分引擎
 * ------------------------------------------------------------
 * 六个维度：估值 / 成长性 / 盈利质量 / 技术面 / 资金情绪 / 风险
 * 三种投资周期：short 短线 / mid 中长线 / long 长线（权重随周期变化）
 *
 * 打分方法：
 *   - 分位数法：在全市场增强池内计算横截面分位（正向指标得分=分位×100，反向=100-分位）
 *   - 固定阈值法：按预设区间给分
 *   - 条件组合法：均线多头排列等
 * 缺失处理：子指标缺失→权重分摊；整维度缺失→维度权重按比例分摊到其他维度
 * 否决项：ST / 资产负债率>100% / 商誉>50% / 连续两年亏损且营收<1亿 → 强制"回避"
 */
import { getMarketSnapshot, getFinData, getKline, getEnhanceData, pMap, isSt, isTradingTime } from './stockDataService.js'
import { cacheGet, cacheSet } from './cacheService.js'

// ==================== 1. 周期配置 ====================

export const HORIZONS = {
  short: {
    key: 'short', label: '短线',
    holdingPeriod: '1~2周',
    dimWeights: { valuation: 5, growth: 10, quality: 10, technical: 35, sentiment: 30, risk: 10 },
    techSubWeights: { trend: 30, momentum: 30, volatility: 15, volume: 15, pattern: 10 },
    rsiPeriod: 6,
    desc: '技术面权重35%，资金情绪权重30%，侧重量价与短线动量'
  },
  mid: {
    key: 'mid', label: '中长线',
    holdingPeriod: '1~3个月',
    dimWeights: { valuation: 15, growth: 25, quality: 25, technical: 20, sentiment: 10, risk: 5 },
    techSubWeights: { trend: 35, momentum: 25, volatility: 15, volume: 15, pattern: 10 },
    rsiPeriod: 14,
    desc: '成长与盈利质量权重各25%，兼顾估值与技术'
  },
  long: {
    key: 'long', label: '长线',
    holdingPeriod: '6个月以上',
    dimWeights: { valuation: 30, growth: 20, quality: 30, technical: 10, sentiment: 5, risk: 5 },
    techSubWeights: { trend: 40, momentum: 20, volatility: 15, volume: 15, pattern: 10 },
    rsiPeriod: 24,
    desc: '估值与盈利质量合计权重60%，弱化短期波动'
  }
}

export function getHorizon(key) {
  return HORIZONS[key] || HORIZONS.short
}

// ==================== 2. 技术指标计算 ====================

/** 简单移动平均 */
function sma(arr, p) {
  if (!arr || arr.length < p) return null
  return arr.slice(-p).reduce((a, b) => a + b, 0) / p
}

/** 指数移动平均 */
function ema(arr, p) {
  if (!arr || arr.length < p) return null
  const k = 2 / (p + 1)
  let e = arr[0]
  for (let i = 1; i < arr.length; i++) e = arr[i] * k + e * (1 - k)
  return e
}

/** RSI（Wilder 平滑） */
function rsi(prices, period) {
  if (!prices || prices.length < period + 1) return null
  let avgG = 0, avgL = 0
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1]
    if (d >= 0) avgG += d; else avgL -= d
  }
  avgG /= period; avgL /= period
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1]
    avgG = (avgG * (period - 1) + Math.max(d, 0)) / period
    avgL = (avgL * (period - 1) + Math.max(-d, 0)) / period
  }
  if (avgL === 0) return 100
  return 100 - 100 / (1 + avgG / avgL)
}

/** MACD：返回 {dif, dea, hist, goldenCross, histRise3, deadCross} */
function macd(closes) {
  if (!closes || closes.length < 35) return null
  const e12 = ema(closes, 12), e26 = ema(closes, 26)
  if (e12 == null || e26 == null) return null
  const difArr = [], deaArr = []
  // 用简化差分法计算 DIF/DEA 序列
  let dif = 0, dea = 0, deaEma = 0, first = true
  const kDea = 2 / 10
  for (let i = 0; i < closes.length; i++) {
    const e12i = ema(closes.slice(0, i + 1), 12)
    const e26i = ema(closes.slice(0, i + 1), 26)
    if (e12i == null || e26i == null) continue
    dif = e12i - e26i
    dea = first ? dif : dif * kDea + dea * (1 - kDea)
    first = false
    difArr.push(dif); deaArr.push(dea)
  }
  const n = difArr.length
  const difLast = difArr[n - 1], deaLast = deaArr[n - 1]
  const hist = (difLast - deaLast) * 2
  const histArr = difArr.map((d, i) => (d - deaArr[i]) * 2)
  const last3 = histArr.slice(-4)
  const histRise3 = last3.length === 4 && last3[3] > last3[2] && last3[2] > last3[1] && last3[1] > last3[0]
  let goldenCross = false, deadCross = false
  for (let i = Math.max(1, n - 3); i < n; i++) {
    if (difArr[i - 1] <= deaArr[i - 1] && difArr[i] > deaArr[i]) goldenCross = true
    if (difArr[i - 1] >= deaArr[i - 1] && difArr[i] < deaArr[i]) deadCross = true
  }
  return { dif: difLast, dea: deaLast, hist, goldenCross, deadCross, histRise3 }
}

/** ADX(14)：返回 {adx, pdi, mdi} */
function adx(closes, highs, lows) {
  if (!closes || closes.length < 30) return null
  const period = 14
  let trArr = [], pdiArr = [], mdiArr = [], atr = 0, pdm = 0, mdm = 0
  for (let i = 1; i < closes.length; i++) {
    const up = highs[i] - highs[i - 1]
    const dn = lows[i - 1] - lows[i]
    const pDm = up > dn && up > 0 ? up : 0
    const mDm = dn > up && dn > 0 ? dn : 0
    const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]))
    trArr.push(tr)
    if (i < period + 1) {
      atr += tr; pdm += pDm; mdm += mDm
    }
    if (i === period) {
      atr /= period; pdm /= period; mdm /= period
    } else if (i > period) {
      atr = (atr * (period - 1) + tr) / period
      pdm = (pdm * (period - 1) + pDm) / period
      mdm = (mdm * (period - 1) + mDm) / period
    }
    if (atr > 0) {
      pdiArr.push(pdm / atr * 100)
      mdiArr.push(mdm / atr * 100)
    }
  }
  const dxArr = []
  for (let i = 0; i < pdiArr.length; i++) {
    const s = pdiArr[i] + mdiArr[i]
    if (s > 0) dxArr.push(Math.abs(pdiArr[i] - mdiArr[i]) / s * 100)
  }
  if (dxArr.length < period) return null
  let adxVal = dxArr.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < dxArr.length; i++) adxVal = (adxVal * (period - 1) + dxArr[i]) / period
  return { adx: adxVal, pdi: pdiArr[pdiArr.length - 1], mdi: mdiArr[mdiArr.length - 1] }
}

/**
 * KDJ(9,3,3)：返回 { k, d, j, goldenCross, deadCross, overbought, oversold }
 * 经典算法：RSV = (C - L9) / (H9 - L9) * 100，K/D 用 SMA(X,3,1)（1/3 平滑）
 */
function kdj(closes, highs, lows) {
  if (!closes || closes.length < 20) return null
  const n = closes.length
  const period = 9
  let k = 50, d = 50
  let prevK = 50, prevD = 50
  let j = 50
  let goldenCross = false, deadCross = false
  for (let i = period - 1; i < n; i++) {
    const hh = Math.max(...highs.slice(i - period + 1, i + 1))
    const ll = Math.min(...lows.slice(i - period + 1, i + 1))
    const rsv = hh === ll ? 50 : (closes[i] - ll) / (hh - ll) * 100
    const newK = (2 / 3) * prevK + (1 / 3) * rsv
    const newD = (2 / 3) * prevD + (1 / 3) * newK
    // 金叉/死叉检测（近3日）
    if (i >= n - 3) {
      if (prevK <= prevD && newK > newD) goldenCross = true
      if (prevK >= prevD && newK < newD) deadCross = true
    }
    prevK = newK; prevD = newD
    k = newK; d = newD
  }
  j = 3 * k - 2 * d
  return {
    k, d, j,
    goldenCross, deadCross,
    overbought: k > 80 && d > 80,
    oversold: k < 20 && d < 20
  }
}

/** 最大回撤（最近 n 个交易日） */
function maxDrawdown(closes, n) {
  if (!closes || closes.length < 2) return 0
  const arr = closes.slice(-n)
  let peak = arr[0], mdd = 0
  for (const c of arr) {
    if (c > peak) peak = c
    const dd = (c - peak) / peak
    if (dd < mdd) mdd = dd
  }
  return mdd
}

/**
 * 从K线计算全部技术指标（供技术面+风险维度使用）
 * @returns {object|null} 数据不足（<70根K线）返回 null
 */
export function computeTech(kline, rsiPeriod = 14) {
  if (!kline || kline.length < 70) return null
  const closes = kline.map(k => k.close)
  const highs = kline.map(k => k.high)
  const lows = kline.map(k => k.low)
  const vols = kline.map(k => k.volume || 0)
  const n = closes.length
  const last = closes[n - 1]

  const ma5 = sma(closes, 5), ma10 = sma(closes, 10), ma20 = sma(closes, 20)
  const ma60 = sma(closes, 60), ma120 = sma(closes, Math.min(120, n))
  const ma20Prev = sma(closes.slice(0, -5), 20)

  // 均线排列
  const bullAlign = ma5 > ma10 && ma10 > ma20
  const strongAlign = bullAlign && ma20 > ma60
  const ma20Up = ma20Prev != null && ma20 > ma20Prev
  const aboveMa20 = last > ma20
  const aboveMa60 = ma60 != null && last > ma60
  // 站上均线比例
  const aboveArr = [ma20 != null && last > ma20, ma60 != null && last > ma60, ma120 != null && last > ma120]
  const aboveRatio = aboveArr.filter(Boolean).length / aboveArr.length

  const macdObj = macd(closes)
  const rsiVal = rsi(closes, rsiPeriod)
  const adxObj = adx(closes, highs, lows)
  const kdjObj = kdj(closes, highs, lows)

  // 动量（月度收益率：1月≈20交易日）
  const ret = d => (n - 1 >= d && closes[n - 1 - d] > 0) ? last / closes[n - 1 - d] - 1 : null
  const mom1 = ret(20), mom3 = ret(60), mom6 = ret(120), mom12 = ret(240)

  // 波动率（年化%）
  const calcVol = p => {
    if (n - 1 < p) return null
    const arr = closes.slice(-(p + 1))
    const rets = []
    for (let i = 1; i < arr.length; i++) rets.push(arr[i] / arr[i - 1] - 1)
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length
    return Math.sqrt(varr) * Math.sqrt(252) * 100
  }
  const vol20 = calcVol(20), vol60 = calcVol(60)

  // 夏普（60日）
  const calcSharpe = p => {
    if (n - 1 < p) return null
    const arr = closes.slice(-(p + 1))
    const rets = []
    for (let i = 1; i < arr.length; i++) rets.push(arr[i] / arr[i - 1] - 1)
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length
    const varr = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length
    const sd = Math.sqrt(varr)
    return sd === 0 ? null : mean / sd * Math.sqrt(252)
  }
  const sharpe60 = calcSharpe(60)

  const mdd1y = maxDrawdown(closes, 240)

  // 布林带 (20, 2)
  let boll = null
  if (ma20 != null) {
    const std = Math.sqrt(closes.slice(-20).reduce((a, b) => a + (b - ma20) ** 2, 0) / 20)
    const upper = ma20 + 2 * std, lower = ma20 - 2 * std
    boll = upper === lower ? 0.5 : (last - lower) / (upper - lower)
  }

  // OBV 趋势（近20日线性方向）
  let obvTrend = null
  {
    const obv = []
    let o = 0
    for (let i = 1; i < n; i++) {
      if (closes[i] > closes[i - 1]) o += vols[i]
      else if (closes[i] < closes[i - 1]) o -= vols[i]
      obv.push(o)
    }
    const obv20 = obv.slice(-20)
    if (obv20.length >= 5) {
      const obvUp = obv20[obv20.length - 1] > obv20[0]
      const priceUp = closes[n - 1] > closes[n - 21]
      obvTrend = obvUp && priceUp ? 1 : (obvUp || priceUp ? 0 : -1)
    }
  }

  // 量能
  const volAvg20 = vols.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, vols.length)
  const volAvg5 = vols.slice(-5).reduce((a, b) => a + b, 0) / Math.min(5, vols.length)
  const volRatio5 = volAvg20 > 0 ? volAvg5 / volAvg20 : null
  const volSurge = volAvg20 > 0 ? vols[vols.length - 1] / volAvg20 : null

  // 突破20日高点
  const high20Prev = Math.max(...highs.slice(-21, -1))
  const breakHigh20 = last > high20Prev
  const breakVolUp = volSurge != null && volSurge > 1.2
  const nearHigh20 = high20Prev > 0 && last / high20Prev > 0.95

  // 日均振幅
  let amplitude = null
  {
    const arr = kline.slice(-20)
    if (arr.length >= 5) amplitude = arr.reduce((a, k) => a + (k.high - k.low) / k.close, 0) / arr.length * 100
  }

  const chg5d = n - 1 >= 5 && closes[n - 6] > 0 ? last / closes[n - 6] - 1 : null
  const chg20d = n - 1 >= 20 && closes[n - 21] > 0 ? last / closes[n - 21] - 1 : null

  return {
    closes, last,
    ma5, ma10, ma20, ma60, ma120,
    bullAlign, strongAlign, ma20Up, aboveMa20, aboveRatio,
    macd: macdObj, rsi: rsiVal, adx: adxObj, kdj: kdjObj,
    mom1, mom3, mom6, mom12, vol20, vol60, sharpe60, mdd1y,
    boll, obvTrend, volRatio5, volSurge, breakHigh20, breakVolUp, nearHigh20,
    amplitude, chg5d, chg20d
  }
}

// ==================== 3. 财务衍生指标 ====================

function quarterOf(dateStr) {
  const m = String(dateStr || '').match(/(\d{4})-(\d{2})/)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]) }
}

/**
 * 从 F10 利润表计算增速指标
 * 单季 = 当期累计 - 同年上一报告期累计（一季度即当期累计）
 * 同比 = 当期 / 去年同期 - 1
 */
function computeGrowth(incomeRows, field) {
  if (!Array.isArray(incomeRows) || incomeRows.length < 2) return { quarterly: null, accum: null }
  const rows = incomeRows
    .map(r => ({ q: quarterOf(r.REPORT_DATE), v: Number(r[field] || 0), raw: r }))
    .filter(r => r.q)
    .sort((a, b) => a.q.year - b.q.year || a.q.month - b.q.month)
  const cur = rows[rows.length - 1]
  const curYear = cur.q.year, curMonth = cur.q.month

  // 同年上一期（月份更小的最新一期）
  const sameYearPrev = rows.filter(r => r.q.year === curYear && r.q.month < curMonth).pop()
  // 去年同期
  const lastYearSame = rows.find(r => r.q.year === curYear - 1 && r.q.month === curMonth)
  // 去年同期单季：去年同期的"同年上一期"（或 Q1 则 0）
  const lastYearPrev = rows.filter(r => r.q.year === curYear - 1 && r.q.month < curMonth).pop()

  const curSingle = cur.v - (sameYearPrev ? sameYearPrev.v : 0)
  const prevSingle = lastYearPrev ? lastYearSame.v - lastYearPrev.v : (lastYearSame ? lastYearSame.v : null)

  let quarterly = null
  if (lastYearSame && prevSingle != null && prevSingle !== 0) {
    quarterly = curSingle / prevSingle - 1
  }
  let accum = null
  if (lastYearSame && lastYearSame.v !== 0) {
    accum = cur.v / lastYearSame.v - 1
  }
  return { quarterly, accum }
}

/**
 * 财务派生指标
 * @returns {object|null}
 */
function computeFinMetrics(fin, stock) {
  if (!fin || !fin.mainRows || !fin.mainRows.length) return null
  const main = fin.mainRows[0] || {}
  const incomeRows = fin.incomeRows || []

  const rev = computeGrowth(incomeRows, 'OPERATE_INCOME')
  const profit = computeGrowth(incomeRows, 'PARENT_NETPROFIT')

  const roe = main.ROEJQ != null ? Number(main.ROEJQ) : (stock.roe ?? null)
  // ROE 趋势：连续上升季度数
  let roeTrend = 0
  const roes = fin.mainRows.map(r => Number(r.ROEJQ)).filter(v => !isNaN(v))
  if (roes.length >= 2) {
    let i = roes.length - 1
    while (i > 0 && roes[i] > roes[i - 1]) { roeTrend++; i-- }
  }

  // 经营现金流/净利润（累计）：每股经营现金流 × 总股本 / 归母净利
  let ocfRatio = null
  {
    const ocfPerShare = Number(main.MGJYXJJE)
    const parentProfit = incomeRows.length ? Number(incomeRows[incomeRows.length - 1].PARENT_NETPROFIT) : NaN
    const shares = stock.price > 0 && stock.marketCap > 0 ? stock.marketCap / stock.price : null
    if (!isNaN(ocfPerShare) && ocfPerShare !== 0 && shares && !isNaN(parentProfit) && parentProfit > 0) {
      ocfRatio = (ocfPerShare * shares) / parentProfit
    }
  }

  return {
    reportDate: fin.reportDate,
    roe,
    roeTrend,
    grossMargin: main.XSMLL != null ? Number(main.XSMLL) : null,
    netMargin: main.XSJLL != null ? Number(main.XSJLL) : null,
    ocfRatio,
    debtRatio: main.ZCFZL != null ? Number(main.ZCFZL) : null,
    eps: main.EPSJB != null ? Number(main.EPSJB) : null,
    qRevGrowth: rev.quarterly,
    qProfitGrowth: profit.quarterly,
    accRevGrowth: rev.accum,
    accProfitGrowth: profit.accum,
    // 净资产（元）≈ 总市值 / PB
    netAsset: stock.pb > 0 ? stock.marketCap / stock.pb : null
  }
}

// ==================== 4. 分位基准 ====================

const PCT_METRICS = ['peTtm', 'pb', 'div', 'roe', 'gross', 'net', 'qRev', 'qProfit', 'accRev', 'accProfit', 'mom1', 'mom3', 'mom6', 'mom12', 'sharpe', 'vol20', 'vol60', 'mdd', 'amplitude', 'chg5d', 'chgYtd', 'pegGrowth']

/**
 * 构建横截面分位基准（升序数组）
 * @param {Array<object>} ctxs 增强上下文数组（含 raw 原始指标）
 */
function buildBase(ctxs) {
  const base = {}
  for (const m of PCT_METRICS) {
    const arr = ctxs.map(c => c.raw?.[m]).filter(v => v != null && !isNaN(v) && isFinite(v))
    arr.sort((a, b) => a - b)
    base[m] = arr
  }
  return base
}

/** 返回 value 在升序数组中的分位（0-100） */
function pct(value, arr) {
  if (value == null || !arr || !arr.length) return 50
  let lo = 0, hi = arr.length - 1
  if (value <= arr[0]) return 0
  if (value >= arr[arr.length - 1]) return 100
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= value) lo = mid + 1
    else hi = mid - 1
  }
  return Math.round((hi + 1) / arr.length * 100)
}

const pctUp = (v, arr) => v == null ? null : pct(v, arr)
const pctDown = (v, arr) => v == null ? null : 100 - pct(v, arr)

// ==================== 5. 子指标打分 ====================

function thresh(v, rules, dft = null) {
  if (v == null) return dft
  for (const [min, max, s] of rules) {
    if (v >= min && v <= max) return s
  }
  return dft
}

function clampScore(v, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

/** 加权聚合（有效子项权重归一化） */
function weighted(items) {
  const valid = items.filter(i => i.score != null && i.weight > 0)
  if (!valid.length) return null
  const ws = valid.reduce((a, i) => a + i.weight, 0)
  return valid.reduce((a, i) => a + i.score * i.weight, 0) / ws
}

// ==================== 6. 六维评分 ====================

/**
 * 对单只股票评分
 * @param {object} ctx { stock, fin, tech, enhance, raw }
 * @param {object} base 分位基准
 * @param {object} horizon 周期配置
 * @returns {object} 完整评分对象
 */
export function scoreStock(ctx, base, horizon) {
  const { stock, tech } = ctx
  const fin = ctx.fin || null
  const enhance = ctx.enhance || {}
  const fm = computeFinMetrics(fin, stock)
  const raw = ctx.raw || {}

  // ---------- 估值维度 ----------
  const peTtm = raw.peTtm
  const pb = raw.pb
  const div = raw.div
  const pegGrowth = raw.pegGrowth
  const peg = (peTtm != null && peTtm > 0 && pegGrowth != null && pegGrowth > 0) ? peTtm / pegGrowth : null
  const valuationItems = [
    { name: 'PE(TTM)横截面分位', value: peTtm != null ? peTtm.toFixed(2) : '数据缺失', raw: peTtm, score: pctDown(peTtm, base.peTtm), weight: 30 },
    { name: 'PB横截面分位', value: pb != null ? pb.toFixed(2) : '数据缺失', raw: pb, score: pctDown(pb, base.pb), weight: 30 },
    { name: '股息率', value: div != null ? div.toFixed(2) + '%' : '数据缺失', raw: div, score: div != null ? pctUp(div, base.div) : null, weight: 20 },
    { name: 'PEG(PE/增速)', value: peg != null ? peg.toFixed(2) : '数据缺失', raw: peg, score: thresh(peg, [[0, 0.8, 90], [0.8, 1.5, 70], [1.5, 999, 40]]), weight: 20 }
  ]

  // ---------- 成长性维度 ----------
  const growthItems = [
    { name: '单季营收同比', value: fm?.qRevGrowth != null ? (fm.qRevGrowth * 100).toFixed(1) + '%' : '数据缺失', raw: fm?.qRevGrowth ?? null, score: pctUp(fm?.qRevGrowth, base.qRev), weight: 25 },
    { name: '单季净利同比', value: fm?.qProfitGrowth != null ? (fm.qProfitGrowth * 100).toFixed(1) + '%' : '数据缺失', raw: fm?.qProfitGrowth ?? null, score: pctUp(fm?.qProfitGrowth, base.qProfit), weight: 25 },
    { name: '营收累计同比', value: fm?.accRevGrowth != null ? (fm.accRevGrowth * 100).toFixed(1) + '%' : '数据缺失', raw: fm?.accRevGrowth ?? null, score: pctUp(fm?.accRevGrowth, base.accRev), weight: 20 },
    { name: '净利累计同比', value: fm?.accProfitGrowth != null ? (fm.accProfitGrowth * 100).toFixed(1) + '%' : '数据缺失', raw: fm?.accProfitGrowth ?? null, score: pctUp(fm?.accProfitGrowth, base.accProfit), weight: 20 },
    { name: 'ROE连续上升', value: fm?.roeTrend != null ? fm.roeTrend + '个季度' : '数据缺失', raw: fm?.roeTrend ?? null, score: fm?.roeTrend != null ? Math.min(100, 40 + fm.roeTrend * 20) : null, weight: 10 }
  ]

  // ---------- 盈利质量维度 ----------
  const roeScore = (() => {
    if (fm?.roe == null) return null
    const abs = thresh(fm.roe, [[20, 999, 95], [10, 20, 80], [5, 10, 60], [0, 5, 35], [-999, 0, 20]])
    return clampScore(abs * 0.6 + pct(fm.roe, base.roe) * 0.4)
  })()
  const qualityItems = [
    { name: 'ROE(净资产收益率)', value: fm?.roe != null ? fm.roe.toFixed(2) + '%' : '数据缺失', raw: fm?.roe ?? null, score: roeScore, weight: 25 },
    { name: '毛利率', value: fm?.grossMargin != null ? fm.grossMargin.toFixed(2) + '%' : '数据缺失', raw: fm?.grossMargin ?? null, score: pctUp(fm?.grossMargin, base.gross), weight: 20 },
    { name: '净利率', value: fm?.netMargin != null ? fm.netMargin.toFixed(2) + '%' : '数据缺失', raw: fm?.netMargin ?? null, score: pctUp(fm?.netMargin, base.net), weight: 15 },
    { name: '经营现金流/净利润', value: fm?.ocfRatio != null ? fm.ocfRatio.toFixed(2) : '数据缺失', raw: fm?.ocfRatio ?? null, score: thresh(fm?.ocfRatio, [[1, 999, 90], [0.5, 1, 70], [-999, 0.5, 40]]), weight: 20 },
    { name: '商誉/净资产', value: fm?.netAsset && fin?.goodwill != null ? (fin.goodwill / fm.netAsset * 100).toFixed(1) + '%' : '未检测', raw: fm?.netAsset && fin?.goodwill != null ? fin.goodwill / fm.netAsset : null, score: thresh(fm?.netAsset && fin?.goodwill != null ? fin.goodwill / fm.netAsset : null, [[0, 0.1, 90], [0.1, 0.3, 70], [0.3, 0.5, 40], [0.5, 999, 15]]), weight: 20 }
  ]

  // ---------- 技术面维度 ----------
  const techItems = computeTechItems(ctx, tech, horizon, base)

  // ---------- 资金情绪维度 ----------
  const sentimentItems = computeSentimentItems(ctx, enhance, base)

  // ---------- 风险维度 ----------
  const riskItems = computeRiskItems(ctx, fm, base)

  // 否决项检查
  const veto = checkVeto(stock, fm, fin)

  // 维度聚合
  const dimWeights = horizon.dimWeights
  const dims = {
    valuation: { score: weighted(valuationItems), weight: dimWeights.valuation, items: valuationItems },
    growth: { score: weighted(growthItems), weight: dimWeights.growth, items: growthItems },
    quality: { score: weighted(qualityItems), weight: dimWeights.quality, items: qualityItems },
    technical: { score: weighted(techItems), weight: dimWeights.technical, items: techItems },
    sentiment: { score: weighted(sentimentItems), weight: dimWeights.sentiment, items: sentimentItems },
    risk: { score: weighted(riskItems), weight: dimWeights.risk, items: riskItems }
  }

  const validDims = Object.values(dims).filter(d => d.score != null)
  const totalWeight = validDims.reduce((a, d) => a + d.weight, 0)
  let total = totalWeight > 0 ? validDims.reduce((a, d) => a + d.score * d.weight, 0) / totalWeight : 0
  total = Math.round(total)

  if (veto.vetoed) total = Math.min(total, 40)

  const riskLevel = dims.risk.score != null
    ? (dims.risk.score >= 70 ? '低' : dims.risk.score >= 55 ? '中' : '高')
    : '中'
  const conclusion = conclude(total, riskLevel, veto.vetoed)
  const star = total >= 90 ? 5 : total >= 80 ? 4 : total >= 70 ? 3 : total >= 60 ? 2 : 1

  return {
    basic: {
      code: stock.code, name: stock.name, industry: stock.industry,
      price: stock.price, changePct: stock.changePct,
      marketCap: stock.marketCap, floatMarketCap: stock.floatMarketCap,
      peTtm, pb, roe: fm?.roe ?? stock.roe, dividendYield: div,
      reportDate: fm?.reportDate || null, isSt: stock.isSt
    },
    total, star, conclusion, riskLevel, vetoed: veto.vetoed, vetoReason: veto.reason,
    aboveMa60: tech?.aboveMa60 ?? false,
    techFlags: {
      bullAlign: tech?.bullAlign ?? false,
      strongAlign: tech?.strongAlign ?? false,
      macdGolden: tech?.macd?.goldenCross ?? false,
      macdDead: tech?.macd?.deadCross ?? false,
      kdjGolden: tech?.kdj?.goldenCross ?? false,
      kdjDead: tech?.kdj?.deadCross ?? false,
      kdjOversold: tech?.kdj?.oversold ?? false,
      kdjOverbought: tech?.kdj?.overbought ?? false,
      rsi: tech?.rsi ?? null,
      breakHigh20: tech?.breakHigh20 ?? false
    },
    dimScores: {
      valuation: Math.round(dims.valuation.score ?? 0),
      growth: Math.round(dims.growth.score ?? 0),
      quality: Math.round(dims.quality.score ?? 0),
      technical: Math.round(dims.technical.score ?? 0),
      sentiment: Math.round(dims.sentiment.score ?? 0),
      risk: Math.round(dims.risk.score ?? 0)
    },
    details: [
      { dimension: '估值', key: 'valuation', score: Math.round(dims.valuation.score ?? 0), weight: dimWeights.valuation, subItems: valuationItems },
      { dimension: '成长性', key: 'growth', score: Math.round(dims.growth.score ?? 0), weight: dimWeights.growth, subItems: growthItems },
      { dimension: '盈利质量', key: 'quality', score: Math.round(dims.quality.score ?? 0), weight: dimWeights.quality, subItems: qualityItems },
      { dimension: '技术面', key: 'technical', score: Math.round(dims.technical.score ?? 0), weight: dimWeights.technical, subItems: techItems },
      { dimension: '资金情绪', key: 'sentiment', score: Math.round(dims.sentiment.score ?? 0), weight: dimWeights.sentiment, subItems: sentimentItems },
      { dimension: '风险', key: 'risk', score: Math.round(dims.risk.score ?? 0), weight: dimWeights.risk, subItems: riskItems }
    ],
    reasonShort: buildReasonShort(dims, veto.vetoed),
    reason: buildReason(ctx, dims, total, conclusion, riskLevel, horizon, veto, fm),
    riskMetrics: buildRiskMetrics(ctx, fm)
  }
}

/** 技术面子指标（子类权重随周期变化） */
/** KDJ 显示文案 */
function kdjLabel(k) {
  if (!k) return '数据缺失'
  if (k.goldenCross) return '金叉'
  if (k.deadCross) return '死叉'
  if (k.overbought) return '超买'
  if (k.oversold) return '超卖'
  const j = k.j
  if (j > 50) return '偏多'
  return '偏空'
}

/** KDJ 打分：金叉/超卖高，死叉/超买低 */
function kdjScore(k) {
  if (!k) return null
  let s = 50
  if (k.goldenCross) s = 78
  else if (k.deadCross) s = 32
  if (k.oversold) s = Math.max(s, 70)
  if (k.overbought) s = Math.min(s, 40)
  if (k.j > 80) s = Math.min(s, 55)
  if (k.j < 20) s = Math.max(s, 65)
  return Math.max(0, Math.min(100, s))
}

function computeTechItems(ctx, tech, horizon, base) {
  const subW = horizon.techSubWeights
  if (!tech) return []
  const { stock } = ctx

  // 趋势类
  let maScore = 40
  if (tech.bullAlign) maScore = 60
  if (tech.strongAlign) maScore = 80
  if (tech.aboveMa20 && tech.ma20Up) maScore = Math.min(100, maScore + 20)
  const trendItems = [
    { name: '均线多头排列', value: tech.strongAlign ? 'MA5>10>20>60' : tech.bullAlign ? 'MA5>10>20' : '未形成', raw: null, score: maScore, weight: 40 },
    { name: '价格站上均线比例', value: Math.round(tech.aboveRatio * 100) + '%', raw: tech.aboveRatio, score: tech.aboveRatio * 100, weight: 30 },
    { name: 'MACD', value: tech.macd?.goldenCross ? '金叉' : tech.macd?.histRise3 ? '柱状增长' : '一般', raw: null, score: (() => {
      const m = tech.macd
      if (!m) return null
      let s = m.deadCross ? 35 : 55
      if (m.goldenCross) s = 60
      if (m.histRise3) s += 40
      return Math.min(100, s)
    })(), weight: 30 }
  ]

  // 动量类
  const mom1 = tech.mom1 != null ? Math.min(tech.mom1 * 100, 100) : null
  const rsiVal = tech.rsi
  let rsiScore = null
  if (rsiVal != null) {
    if (rsiVal > 30 && rsiVal < 70) rsiScore = 80
    else if (rsiVal >= 70 && rsiVal <= 80) rsiScore = 60
    else if (rsiVal >= 20 && rsiVal <= 30) rsiScore = 55
    else rsiScore = 30
    if (rsiVal >= 40 && rsiVal <= 60 && rsiVal > 50) rsiScore = Math.min(100, rsiScore + 20)
  }
  const momentumItems = [
    { name: '1月动量', value: mom1 != null ? mom1.toFixed(1) + '%' : '数据缺失', raw: tech.mom1, score: tech.mom1 != null ? Math.min(pctUp(tech.mom1, base.mom1), tech.mom1 > 0.5 ? 65 : 100) : null, weight: 30 },
    { name: '3月动量', value: tech.mom3 != null ? (tech.mom3 * 100).toFixed(1) + '%' : '数据缺失', raw: tech.mom3, score: pctUp(tech.mom3, base.mom3), weight: 25 },
    { name: '12月动量', value: tech.mom12 != null ? (tech.mom12 * 100).toFixed(1) + '%' : '数据缺失', raw: tech.mom12, score: pctUp(tech.mom12, base.mom12), weight: 20 },
    { name: 'RSI(' + horizon.rsiPeriod + ')', value: rsiVal != null ? rsiVal.toFixed(1) : '数据缺失', raw: rsiVal, score: rsiScore, weight: 15 },
    { name: 'KDJ', value: kdjLabel(tech.kdj), raw: tech.kdj?.j ?? null, score: kdjScore(tech.kdj), weight: 15 },
    { name: '夏普比率(60日)', value: tech.sharpe60 != null ? tech.sharpe60.toFixed(2) : '数据缺失', raw: tech.sharpe60, score: pctUp(tech.sharpe60, base.sharpe), weight: 10 }
  ]

  // 波动类
  const volatilityItems = [
    { name: '20日波动率', value: tech.vol20 != null ? tech.vol20.toFixed(1) + '%' : '数据缺失', raw: tech.vol20, score: pctDown(tech.vol20, base.vol20), weight: 30 },
    { name: '布林带位置', value: tech.boll != null ? (tech.boll * 100).toFixed(0) + '%' : '数据缺失', raw: tech.boll, score: thresh(tech.boll, [[0.4, 0.6, 80], [0.6, 0.8, 75], [0.2, 0.4, 65], [0.8, 1.0, 60], [-999, 0.2, 45], [1.0, 999, 45]]), weight: 25 },
    { name: '最大回撤(60日)', value: tech.mdd1y != null ? (tech.mdd1y * 100).toFixed(1) + '%' : '数据缺失', raw: tech.mdd1y, score: pctDown(tech.mdd1y, base.mdd), weight: 25 },
    { name: '日均振幅', value: tech.amplitude != null ? tech.amplitude.toFixed(2) + '%' : '数据缺失', raw: tech.amplitude, score: tech.amplitude != null ? Math.round(100 - 40 * Math.abs(pct(tech.amplitude, base.amplitude) - 50) / 50) : null, weight: 20 }
  ]

  // 量能类
  const turnoverRanges = {
    short: [[2, 8, 80], [1, 2, 60], [8, 15, 60], [0.5, 1, 50], [15, 999, 40], [-999, 0.5, 35]],
    mid: [[1.5, 6, 80], [0.8, 1.5, 60], [6, 10, 60], [10, 15, 45], [0.4, 0.8, 50], [-999, 0.4, 35]],
    long: [[1, 5, 80], [0.5, 1, 60], [5, 8, 60], [8, 12, 45], [0.3, 0.5, 50], [-999, 0.3, 35]]
  }
  const volumeItems = [
    { name: '量比(5日)', value: tech.volRatio5 != null ? tech.volRatio5.toFixed(2) : '数据缺失', raw: tech.volRatio5, score: thresh(tech.volRatio5, [[1, 2, 80], [0.5, 1, 60], [2, 3, 60], [3, 999, 45], [-999, 0.5, 40]]), weight: 30 },
    { name: 'OBV趋势', value: tech.obvTrend === 1 ? '价量齐升' : tech.obvTrend === 0 ? '背离' : '走弱', raw: tech.obvTrend, score: tech.obvTrend === 1 ? 80 : tech.obvTrend === 0 ? 65 : tech.obvTrend === -1 ? 40 : null, weight: 25 },
    { name: '换手率', value: stock.turnoverRate != null ? stock.turnoverRate.toFixed(2) + '%' : '数据缺失', raw: stock.turnoverRate, score: thresh(stock.turnoverRate, turnoverRanges[horizon.key] || turnoverRanges.mid), weight: 25 },
    { name: '成交量异动', value: tech.volSurge != null ? tech.volSurge.toFixed(2) + 'x' : '数据缺失', raw: tech.volSurge, score: thresh(tech.volSurge, [[1.5, 3, 90], [1, 1.5, 70], [0.7, 1, 60], [3, 999, 50], [-999, 0.7, 45]]), weight: 20 }
  ]

  // 形态类
  const patternItems = [
    { name: '突破20日高点', value: tech.breakHigh20 ? '已突破' : tech.nearHigh20 ? '接近前高' : '未突破', raw: tech.breakHigh20 ? 1 : 0, score: tech.breakHigh20 ? (tech.breakVolUp ? 80 : 60) : (tech.nearHigh20 ? 60 : 50), weight: 100 }
  ]

  const sub = {
    trend: weighted(trendItems),
    momentum: weighted(momentumItems),
    volatility: weighted(volatilityItems),
    volume: weighted(volumeItems),
    pattern: weighted(patternItems)
  }
  const items = [...trendItems, ...momentumItems, ...volatilityItems, ...volumeItems, ...patternItems]
  // 附加子类信息（用于详情展示）
  items.sub = sub
  items.subWeights = subW
  return items
}

/** 资金情绪维度 */
function computeSentimentItems(ctx, enhance, base) {
  const { stock, tech } = ctx
  const chg5d = tech?.chg5d ?? null

  // 融资余额 5日变化率
  let marginChg = null
  if (enhance?.margin && Array.isArray(enhance.margin) && enhance.margin.length >= 2) {
    const cur = Number(enhance.margin[0].RZYE)
    const prev = Number(enhance.margin[Math.min(5, enhance.margin.length) - 1].RZYE)
    if (cur > 0 && prev > 0) marginChg = cur / prev - 1
  }

  // 机构调研（近30天）
  let surveyCount = null
  if (Array.isArray(enhance?.surveys) && enhance.surveys.length) {
    const cutoff = Date.now() - 30 * 24 * 3600 * 1000
    surveyCount = enhance.surveys.filter(r => {
      const d = new Date(String(r.RECEIVE_END_DATE || r.NOTICE_DATE || '').replace(' ', 'T'))
      return !isNaN(d) && d.getTime() >= cutoff
    }).length
  }

  // 龙虎榜（近5日）
  let lhbScore = 55
  if (Array.isArray(enhance?.lhb) && enhance.lhb.length) {
    const cutoff = Date.now() - 5 * 24 * 3600 * 1000
    const near = enhance.lhb.find(r => {
      const d = new Date(String(r.TRADE_DATE || '').replace(' ', 'T'))
      return !isNaN(d) && d.getTime() >= cutoff
    })
    if (near) {
      const buy = Number(near.TOTAL_BUY || 0)
      const sell = Number(near.TOTAL_SELL || 0)
      lhbScore = buy > sell ? 70 : buy < sell ? 45 : 60
    }
  }

  const volRatio = stock.volumeRatio
  return [
    { name: '5日涨跌幅', value: chg5d != null ? (chg5d * 100).toFixed(1) + '%' : '数据缺失', raw: chg5d, score: chg5d != null ? Math.min(pctUp(chg5d, base.chg5d), chg5d > 0.3 ? 60 : 100) : null, weight: 25 },
    { name: '年初至今涨跌幅', value: stock.chgYtd != null ? stock.chgYtd.toFixed(1) + '%' : '数据缺失', raw: stock.chgYtd, score: stock.chgYtd != null ? Math.min(pctUp(stock.chgYtd, base.chgYtd), stock.chgYtd > 80 ? 60 : 100) : null, weight: 15 },
    { name: '融资余额5日变化', value: marginChg != null ? (marginChg * 100).toFixed(1) + '%' : '未检测', raw: marginChg, score: thresh(marginChg, [[0.05, 999, 85], [0.02, 0.05, 75], [0, 0.02, 60], [-999, 0, 40]]), weight: 20 },
    { name: '机构调研热度', value: surveyCount != null ? surveyCount + '次/30天' : '未检测', raw: surveyCount, score: thresh(surveyCount, [[5, 999, 90], [3, 5, 80], [1, 3, 65], [0, 0, 50]]), weight: 20 },
    { name: '龙虎榜', value: lhbScore === 70 ? '净买入上榜' : lhbScore === 45 ? '净卖出上榜' : lhbScore === 60 ? '上榜' : '未上榜', raw: lhbScore, score: lhbScore, weight: 10 },
    { name: '量比(资金活跃度)', value: volRatio != null ? volRatio.toFixed(2) : '数据缺失', raw: volRatio, score: thresh(volRatio, [[1, 3, 75], [3, 999, 85], [0.8, 1, 60], [-999, 0.8, 45]]), weight: 10 }
  ]
}

/** 风险维度 */
function computeRiskItems(ctx, fm, base) {
  const { stock, tech } = ctx
  const isFinance = stock.industry && /银行|证券|保险|多元金融/.test(stock.industry)
  const debtRatio = fm?.debtRatio != null ? fm.debtRatio : null
  const goodwillRatio = fm?.netAsset && ctx.fin?.goodwill != null ? ctx.fin.goodwill / fm.netAsset : null
  return [
    { name: '20日波动率', value: tech?.vol20 != null ? tech.vol20.toFixed(1) + '%' : '数据缺失', raw: tech?.vol20 ?? null, score: pctDown(tech?.vol20, base.vol20), weight: 20 },
    { name: '60日波动率', value: tech?.vol60 != null ? tech.vol60.toFixed(1) + '%' : '数据缺失', raw: tech?.vol60 ?? null, score: pctDown(tech?.vol60, base.vol60), weight: 20 },
    { name: '最大回撤(1年)', value: tech?.mdd1y != null ? (tech.mdd1y * 100).toFixed(1) + '%' : '数据缺失', raw: tech?.mdd1y ?? null, score: pctDown(tech?.mdd1y, base.mdd), weight: 20 },
    { name: '资产负债率', value: debtRatio != null ? debtRatio.toFixed(1) + '%' : '未检测', raw: debtRatio, score: isFinance ? null : thresh(debtRatio, [[-999, 50, 85], [50, 70, 70], [70, 85, 50], [85, 100, 30], [100, 999, 10]]), weight: 20 },
    { name: '商誉/净资产', value: goodwillRatio != null ? (goodwillRatio * 100).toFixed(1) + '%' : '未检测', raw: goodwillRatio, score: thresh(goodwillRatio, [[0, 0.1, 90], [0.1, 0.3, 70], [0.3, 0.5, 40], [0.5, 999, 10]]), weight: 15 },
    { name: '流动性(换手率)', value: stock.turnoverRate != null ? stock.turnoverRate.toFixed(2) + '%' : '数据缺失', raw: stock.turnoverRate, score: thresh(stock.turnoverRate, [[1, 999, 80], [0.5, 1, 60], [-999, 0.5, 40]]), weight: 5 }
  ]
}

// ==================== 7. 否决项 / 结论 / 理由 ====================

function checkVeto(stock, fm, fin) {
  const reasons = []
  if (stock.isSt) reasons.push('ST/退市整理')
  if (fm?.debtRatio != null && fm.debtRatio > 100) reasons.push('资产负债率超过100%')
  if (fm?.netAsset && fin?.goodwill != null && fin.goodwill / fm.netAsset > 0.5) reasons.push('商誉占净资产超过50%')
  // 连续两年净利润亏损且营收低于1亿
  if (fin?.incomeRows && Array.isArray(fin.incomeRows)) {
    const annuals = fin.incomeRows
      .filter(r => String(r.REPORT_DATE || '').includes('-12-31'))
      .sort((a, b) => String(b.REPORT_DATE).localeCompare(String(a.REPORT_DATE)))
      .slice(0, 2)
    if (annuals.length === 2) {
      const allLoss = annuals.every(r => Number(r.PARENT_NETPROFIT || r.NETPROFIT || 0) < 0)
      const smallRev = annuals.every(r => Number(r.OPERATE_INCOME || 0) < 1e8)
      if (allLoss && smallRev) reasons.push('连续两年亏损且营收低于1亿')
    }
  }
  if (reasons.length) return { vetoed: true, reason: reasons.join('、') }
  return { vetoed: false, reason: null }
}

function conclude(total, riskLevel, vetoed) {
  if (vetoed) return '回避'
  if (total >= 85) return riskLevel === '低' ? '重点关注' : '可关注'
  if (total >= 75) return riskLevel === '高' ? '中性' : '可关注'
  if (total >= 60) return '中性'
  if (total >= 40) return '谨慎'
  return '回避'
}

const DIM_GOOD = {
  valuation: '估值偏低',
  growth: '成长加速',
  quality: '盈利优质',
  technical: '技术走强',
  sentiment: '资金活跃',
  risk: '风险可控'
}
const DIM_BAD = {
  valuation: '估值偏高',
  growth: '成长承压',
  quality: '盈利偏弱',
  technical: '技术走弱',
  sentiment: '资金流出',
  risk: '风险偏高'
}

function buildReasonShort(dims, vetoed) {
  if (vetoed) return '触发风险否决，建议回避'
  const entries = Object.entries(dims).filter(([, d]) => d.score != null).sort((a, b) => b[1].score - a[1].score)
  const good = entries.filter(([, d]) => d.score >= 72).slice(0, 2).map(([k]) => DIM_GOOD[k])
  const bad = entries.filter(([, d]) => d.score <= 50).map(([k]) => DIM_BAD[k])
  const parts = [...good]
  if (bad.length) parts.push(bad[0])
  if (!parts.length) parts.push('评分中等')
  return parts.join('+')
}

function buildReason(ctx, dims, total, conclusion, riskLevel, horizon, veto, fm) {
  const { stock } = ctx
  const lines = []
  if (veto.vetoed) {
    lines.push(`该股综合评分 ${total} 分，触发风险否决（${veto.reason}），结论强制为"回避"。`)
  } else {
    lines.push(`该股综合评分 ${total} 分，属于"${conclusion}"，风险等级${riskLevel}。`)
    const entries = Object.entries(dims).filter(([, d]) => d.score != null).sort((a, b) => b[1].score - a[1].score)
    const good = entries.filter(([, d]) => d.score >= 70).slice(0, 3).map(([k]) => DIM_GOOD[k])
    const bad = entries.filter(([, d]) => d.score <= 50).slice(0, 2).map(([k]) => DIM_BAD[k])
    if (good.length) lines.push(`主要优势：${good.join('、')}。`)
    if (bad.length) lines.push(`主要风险：${bad.join('、')}。`)
    else lines.push(`暂无明显短板。`)
    if (horizon.key === 'short') lines.push('短线视角侧重量价关系与资金活跃度，请注意止损纪律。')
    if (horizon.key === 'long') lines.push('长线视角侧重估值安全边际与盈利质量，可忽略短期波动。')
    if (fm?.reportDate) lines.push(`财务数据报告期：${fm.reportDate.slice(0, 10)}。`)
  }
  lines.push(`当前模式：${horizon.label}（${horizon.desc}）。`)
  lines.push(`本工具评分仅供参考，不构成任何投资建议。`)
  return lines.join('\n')
}

function buildRiskMetrics(ctx, fm) {
  const { stock, tech } = ctx
  const goodwillRatio = fm?.netAsset && ctx.fin?.goodwill != null ? ctx.fin.goodwill / fm.netAsset : null
  return {
    beta: null, // 无指数数据，暂不计算
    volatility20: tech?.vol20 ?? null,
    volatility60: tech?.vol60 ?? null,
    maxDrawdown1y: tech?.mdd1y != null ? tech.mdd1y * 100 : null,
    debtRatio: fm?.debtRatio ?? null,
    goodwillRatio: goodwillRatio != null ? goodwillRatio * 100 : null,
    turnoverRate: stock.turnoverRate,
    isSt: stock.isSt
  }
}

// ==================== 8. 池子构建（列表/详情共用） ====================

/**
 * 基础快筛评分（clist 字段，用于池子选取排序）
 * 权重随周期变化：短线重资金活跃+动量，长线重估值+盈利质量，
 * 保证池子构成与周期评分模型匹配，避免"基本面池+技术面评分"的错配导致分数集中。
 */
function baseScore(stock, market, horizonKey = 'short') {
  const arr = (key, valid) => market.map(s => s[key]).filter(valid).sort((a, b) => a - b)
  const peArr = arr('peTtm', v => v != null && v > 0)
  const pbArr = arr('pb', v => v != null && v > 0)
  const roeArr = arr('roe', v => v != null && !isNaN(v))
  const turnArr = arr('turnoverRate', v => v != null)
  const vrArr = arr('volumeRatio', v => v != null)
  const divArr = arr('dividendYield', v => v != null)
  const chgArr = arr('chg60d', v => v != null)
  const ytdArr = arr('chgYtd', v => v != null)
  const P = (v, a, up = true) => v == null ? 50 : (up ? pct(v, a) : 100 - pct(v, a))

  const valuation = P(stock.peTtm, peArr, false) * 0.6 + P(stock.pb, pbArr, false) * 0.4
  const quality = P(stock.roe, roeArr)
  const sentiment = P(stock.turnoverRate, turnArr) * 0.5 + P(stock.volumeRatio, vrArr) * 0.3 + P(stock.chg60d, chgArr) * 0.2
  const momentum = P(stock.chg60d, chgArr) * 0.6 + P(stock.chgYtd, ytdArr) * 0.4
  const dividend = P(stock.dividendYield, divArr)

  if (horizonKey === 'short') return sentiment * 0.45 + momentum * 0.25 + quality * 0.2 + valuation * 0.1
  if (horizonKey === 'long') return valuation * 0.4 + quality * 0.3 + dividend * 0.15 + momentum * 0.15
  return quality * 0.3 + valuation * 0.25 + momentum * 0.2 + sentiment * 0.15 + dividend * 0.1
}

/** 快筛条件（clist 字段可筛）→ 全市场过滤 */
function applyQuickFilters(stocks, qf) {
  if (!qf) return stocks
  return stocks.filter(s => {
    if (qf.industry && s.industry !== qf.industry) return false
    if (qf.minMarketCap != null && (!s.marketCap || s.marketCap < qf.minMarketCap)) return false
    if (qf.maxMarketCap != null && (!s.marketCap || s.marketCap > qf.maxMarketCap)) return false
    if (qf.minPe != null && (s.peTtm == null || s.peTtm < qf.minPe)) return false
    if (qf.maxPe != null && (s.peTtm == null || s.peTtm > qf.maxPe)) return false
    if (qf.minPb != null && (s.pb == null || s.pb < qf.minPb)) return false
    if (qf.maxPb != null && (s.pb == null || s.pb > qf.maxPb)) return false
    if (qf.minDiv != null && (s.dividendYield == null || s.dividendYield < qf.minDiv)) return false
    if (qf.maxDiv != null && (s.dividendYield == null || s.dividendYield > qf.maxDiv)) return false
    if (qf.minTurnover != null && (s.turnoverRate == null || s.turnoverRate < qf.minTurnover)) return false
    if (qf.maxTurnover != null && (s.turnoverRate == null || s.turnoverRate > qf.maxTurnover)) return false
    return true
  })
}

/** 构建分位基准并缓存（供详情页使用），返回 base */
let lastBase = { horizon: null, base: null, range: null, builtAt: 0 }

export function getCachedBase() {
  return (Date.now() - lastBase.builtAt < 5 * 60_000) ? lastBase.base : null
}

/** 获取最近一次评分池的原始总分区间（用于详情页与列表页一致的分数拉伸） */
export function getCachedRange() {
  return (Date.now() - lastBase.builtAt < 5 * 60_000) ? lastBase.range : null
}

/**
 * 总分拉伸：把池内原始总分线性映射到 35~93 区间（保留排序、拉开视觉区分度）。
 * 仅在区间有效且非 veto 时使用，veto 股保持 ≤40 的原始分。
 */
function stretchScore(total, range) {
  if (!range || range.min == null || range.max == null || range.max <= range.min) return total
  return Math.round(35 + (total - range.min) / (range.max - range.min) * 58)
}

/**
 * 构建"评分池"：SWR（Stale-While-Revalidate）两阶段模式
 * ------------------------------------------------------------
 * 阶段A（秒级）：全市场 → 快筛 → 基础分排序取池 → 立即返回基础列表
 * 阶段B（分钟级）：后台对池内股票补 F10 + K线 → 完整六维评分 → 写缓存
 * 接口行为：
 *   - 完整池缓存命中 → 直接返回完整结果（meta.stage='full'）
 *   - 未命中 → 先返回阶段A基础列表（meta.stage='base'），同时后台异步构建完整池；
 *     前端轮询（或用户刷新）命中缓存后得到完整结果。
 * 收益：接口从"等 1~2 分钟"变为"秒级出列表"，服务器不再让用户阻塞等待；
 *       完整池构建失败也只影响 stage，不影响已返回的基础列表。
 *
 * 并发保护：
 *   - 基础池单飞：同一筛选只构建一次
 *   - 完整池全局串行：任何时刻最多 1 个完整池构建在跑（防多条件并发打爆数据源）
 *   - 断连取消：所有等待该构建的请求断开后，自动 abort 构建，不再浪费数据源
 *
 * @param {string} horizonKey short/mid/long
 * @param {object} quickFilters 快筛条件（clist 字段）
 * @param {number} poolSize 池子大小（默认300）
 * @param {AbortSignal} [signal] 客户端断开信号（请求已响应后不会误取消）
 * @returns {{stocks:Array, base:object, meta:object}}
 */

// 基础池单飞锁（阶段A）
const inflightBasePools = new Map() // baseCacheKey -> Promise

// 完整池后台构建记录（阶段B）：cacheKey -> { ctrl, refs, listeners, promise, ... }
const fullBuilds = new Map()
// 完整池构建全局串行队列：同一时刻仅允许 1 个完整池构建在跑
const fullBuildQueue = []
let fullBuildBusy = false

export async function buildScorePool(horizonKey = 'short', quickFilters = {}, poolSize = 300, signal) {
  const sig = JSON.stringify(quickFilters || {})
  const cacheKey = `stockrec:pool:${horizonKey}:${poolSize}:${Buffer.from(sig).toString('base64')}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  // 已有该条件的完整池构建在跑/排队 → 注册断连信号，直接返回基础池
  if (fullBuilds.has(cacheKey)) {
    attachBuildSignal(cacheKey, signal)
  } else {
    // 启动后台完整构建（串行队列），不阻塞当前请求
    const startedKey = startFullPoolBuild(horizonKey, quickFilters, poolSize)
    attachBuildSignal(startedKey, signal)
  }
  return buildBasePool(horizonKey, quickFilters, poolSize)
}

/** 阶段A：基础池（快筛 + baseScore 排序取池，秒级） */
async function buildBasePool(horizonKey, quickFilters, poolSize) {
  const baseSig = JSON.stringify(quickFilters || {})
  const baseKey = `stockrec:poolbase:${horizonKey}:${poolSize}:${Buffer.from(baseSig).toString('base64')}`
  const cached = cacheGet(baseKey)
  if (cached) return cached

  if (inflightBasePools.has(baseKey)) return inflightBasePools.get(baseKey)

  const promise = _buildBasePoolInner(horizonKey, quickFilters, poolSize, baseKey)
    .finally(() => inflightBasePools.delete(baseKey))
  inflightBasePools.set(baseKey, promise)
  return promise
}

async function _buildBasePoolInner(horizonKey, quickFilters, poolSize, baseKey) {
  const market = await getMarketSnapshot()
  const normal = market.filter(s => !s.isSt)
  const filtered = applyQuickFilters(normal, quickFilters)

  const scored = filtered.map(s => ({ s, bs: baseScore(s, normal, horizonKey) }))
  scored.sort((a, b) => b.bs - a.bs)
  const pool = scored.slice(0, poolSize)

  const stocks = pool.map(({ s, bs }) => {
    const score = Math.round(bs)
    return {
      basic: { ...s },
      total: score,
      score,
      star: score >= 90 ? 5 : score >= 80 ? 4 : score >= 70 ? 3 : score >= 60 ? 2 : 1,
      conclusion: '评分构建中',
      riskLevel: '中',
      reasonShort: '完整评分构建中，稍后自动更新',
      details: [],
      dimScores: {},
      vetoed: false,
      aboveMa60: null,
      techFlags: {},
      horizon: horizonKey
    }
  })

  const result = {
    stocks,
    base: null,
    meta: {
      stage: 'base',
      pending: true,
      horizon: horizonKey,
      poolSize: stocks.length,
      updateTime: new Date().toISOString()
    }
  }
  cacheSet(baseKey, result, isTradingTime() ? 2 * 60_000 : 30 * 60_000)
  return result
}

/** 注册断连信号：请求断开后引用计数归零 → 取消后台构建 */
function attachBuildSignal(cacheKey, signal) {
  if (!signal || signal.aborted) return
  const b = fullBuilds.get(cacheKey)
  if (!b) return
  b.refs++
  const onAbort = () => {
    b.refs--
    b.listeners.delete(signal)
    if (b.refs <= 0) b.ctrl.abort()
  }
  b.listeners.set(signal, onAbort)
  signal.addEventListener('abort', onAbort, { once: true })
}

/** 启动后台完整池构建（若该条件已有构建则复用） */
function startFullPoolBuild(horizonKey, quickFilters, poolSize) {
  const sig = JSON.stringify(quickFilters || {})
  const cacheKey = `stockrec:pool:${horizonKey}:${poolSize}:${Buffer.from(sig).toString('base64')}`
  if (fullBuilds.has(cacheKey)) return cacheKey

  const b = {
    ctrl: new AbortController(),
    refs: 0,
    listeners: new Map(),
    cacheKey,
    horizonKey,
    quickFilters,
    poolSize
  }
  fullBuilds.set(cacheKey, b)
  b.promise = runFullPoolBuild(b).finally(() => {
    for (const [sig, fn] of b.listeners) sig.removeEventListener('abort', fn)
    b.listeners.clear()
    fullBuilds.delete(cacheKey)
  })
  return cacheKey
}

/** 完整池构建（串行执行：同一时刻仅 1 个在跑） */
async function runFullPoolBuild(b) {
  await new Promise(resolve => {
    if (!fullBuildBusy) { fullBuildBusy = true; resolve() }
    else fullBuildQueue.push(resolve)
  })
  try {
    const result = await _buildScorePoolInner(b.horizonKey, b.quickFilters, b.poolSize, b.cacheKey, b.ctrl.signal)
    // 构建被取消（所有请求已断开）则不写缓存，避免缓存半成品/无用功
    if (!b.ctrl.signal.aborted) {
      cacheSet(b.cacheKey, result, isTradingTime() ? 2 * 60_000 : 30 * 60_000)
    }
    return result
  } catch (e) {
    if (e?.name !== 'AbortError') console.error('[stockScore] 评分池构建失败:', e.message)
    return null
  } finally {
    const next = fullBuildQueue.shift()
    if (next) next()
    else fullBuildBusy = false
  }
}

async function _buildScorePoolInner(horizonKey, quickFilters, poolSize, cacheKey, signal) {
  const horizon = getHorizon(horizonKey)
  const market = await getMarketSnapshot()
  // 剔除 ST
  const normal = market.filter(s => !s.isSt)
  const filtered = applyQuickFilters(normal, quickFilters)

  // 基础分排序取池（权重随周期）
  const scored = filtered.map(s => ({ s, bs: baseScore(s, normal, horizonKey) }))
  scored.sort((a, b) => b.bs - a.bs)
  const pool = scored.slice(0, poolSize).map(x => x.s)

  // 补 F10 财务（支持断连取消）
  const withFin = (await pMap(pool, 20, async s => {
    const fin = await getFinData(s.code, {}, signal)
    return { stock: s, fin }
  }, signal)).filter(Boolean)

  // 补 K线 + 技术指标（支持断连取消）
  const enriched = await pMap(withFin, 20, async ctx => {
    const kline = await getKline(ctx.stock.code, 320, signal)
    const tech = kline.length ? computeTech(kline, horizon.rsiPeriod) : null
    return { ...ctx, tech, raw: null }
  }, signal)

  // 计算原始指标（供分位基准 + 评分）
  const ctxs = enriched.map(ctx => {
    const fm = computeFinMetrics(ctx.fin, ctx.stock)
    const raw = {
      peTtm: ctx.stock.peTtm != null && ctx.stock.peTtm > 0 ? ctx.stock.peTtm : null,
      pb: ctx.stock.pb != null && ctx.stock.pb > 0 ? ctx.stock.pb : null,
      div: ctx.stock.dividendYield,
      roe: fm?.roe ?? null,
      gross: fm?.grossMargin ?? null,
      net: fm?.netMargin ?? null,
      qRev: fm?.qRevGrowth ?? null,
      qProfit: fm?.qProfitGrowth ?? null,
      accRev: fm?.accRevGrowth ?? null,
      accProfit: fm?.accProfitGrowth ?? null,
      pegGrowth: fm?.accProfitGrowth ?? null,
      mom1: ctx.tech?.mom1 ?? null,
      mom3: ctx.tech?.mom3 ?? null,
      mom6: ctx.tech?.mom6 ?? null,
      mom12: ctx.tech?.mom12 ?? null,
      sharpe: ctx.tech?.sharpe60 ?? null,
      vol20: ctx.tech?.vol20 ?? null,
      vol60: ctx.tech?.vol60 ?? null,
      mdd: ctx.tech?.mdd1y ?? null,
      amplitude: ctx.tech?.amplitude ?? null,
      chg5d: ctx.tech?.chg5d ?? null,
      chgYtd: ctx.stock.chgYtd
    }
    return { ...ctx, raw }
  })

  // 分位基准（横截面）
  const poolBase = buildBase(ctxs.filter(c => c.raw))
  // 估值/质量类指标用全市场分布（clist 已有全市场数据），避免池内同质化导致区分度被压缩
  const marketBase = {}
  for (const m of ['peTtm', 'pb', 'div', 'roe']) {
    const arr = market.map(s => s[m]).filter(v => v != null && !isNaN(v) && isFinite(v)).sort((a, b) => a - b)
    marketBase[m] = arr
  }
  const base = { ...poolBase, ...marketBase }
  lastBase = { horizon: horizonKey, base, builtAt: Date.now() }

  // 完整评分
  const scoredStocks = ctxs.map(ctx => {
    const result = scoreStock({ ...ctx, enhance: null }, base, horizon)
    return { ...result, horizon: horizonKey }
  })

  // 总分拉伸（仅非 veto 股）：拉大区分度，保证列表页出现绿/黄/红三档；veto 股保持低分
  const noVeto = scoredStocks.filter(x => !x.vetoed)
  const range = noVeto.length
    ? { min: Math.min(...noVeto.map(x => x.total)), max: Math.max(...noVeto.map(x => x.total)) }
    : null
  if (range) {
    lastBase.range = range
    for (const s of scoredStocks) {
      if (s.vetoed) continue
      s.total = stretchScore(s.total, range)
      s.conclusion = conclude(s.total, s.riskLevel, false)
      s.star = s.total >= 90 ? 5 : s.total >= 80 ? 4 : s.total >= 70 ? 3 : s.total >= 60 ? 2 : 1
      s.reason = s.reason.replace(/综合评分 \d+ 分/, `综合评分 ${s.total} 分`)
    }
  }

  const result = {
    stocks: scoredStocks,
    base,
    meta: {
      stage: 'full',
      horizon: horizonKey,
      poolSize: scoredStocks.length,
      updateTime: new Date().toISOString()
    }
  }
  // 注意：缓存写入统一由 runFullPoolBuild 处理（取消时不缓存）
  return result
}

// ==================== 9. 详情构建 ====================

/**
 * 构建单只股票详情（含完整六维 + K线 + 增强数据）
 * 结果级缓存 2 分钟：避免用户反复打开同一只股票时重复构建；
 * 支持断连信号 signal：客户端中途离开时中止底层请求。
 */
// code:horizon -> { ttl, data }
const detailCache = new Map()

export async function buildStockDetail(code, horizonKey = 'short', signal) {
  const dkey = `${code}:${horizonKey}`
  const cachedDetail = detailCache.get(dkey)
  if (cachedDetail && Date.now() < cachedDetail.ttl) return cachedDetail.data

  const horizon = getHorizon(horizonKey)
  const market = await getMarketSnapshot()
  const stock = market.find(s => s.code === String(code))
  if (!stock) return null

  // 优先使用分位基准（列表池构建时生成）；未就绪时降级为空基准（分位子指标取中性分）
  const base = getCachedBase() || {}

  const [fin, kline, enhance] = await Promise.all([
    getFinData(code, { goodwill: true }, signal),
    getKline(code, 320, signal),
    getEnhanceData(code, signal)
  ])
  const tech = kline.length ? computeTech(kline, horizon.rsiPeriod) : null
  const fm = computeFinMetrics(fin, stock)
  const raw = {
    peTtm: stock.peTtm != null && stock.peTtm > 0 ? stock.peTtm : null,
    pb: stock.pb != null && stock.pb > 0 ? stock.pb : null,
    div: stock.dividendYield,
    roe: fm?.roe ?? null, gross: fm?.grossMargin ?? null, net: fm?.netMargin ?? null,
    qRev: fm?.qRevGrowth ?? null, qProfit: fm?.qProfitGrowth ?? null,
    accRev: fm?.accRevGrowth ?? null, accProfit: fm?.accProfitGrowth ?? null,
    pegGrowth: fm?.accProfitGrowth ?? null,
    mom1: tech?.mom1 ?? null, mom3: tech?.mom3 ?? null, mom6: tech?.mom6 ?? null, mom12: tech?.mom12 ?? null,
    sharpe: tech?.sharpe60 ?? null, vol20: tech?.vol20 ?? null, vol60: tech?.vol60 ?? null,
    mdd: tech?.mdd1y ?? null, amplitude: tech?.amplitude ?? null,
    chg5d: tech?.chg5d ?? null, chgYtd: stock.chgYtd
  }

  const result = scoreStock({ stock, fin, tech, enhance, raw }, base, horizon)

  // 与列表页一致的分数拉伸（同一缓存窗口内区间一致；无区间或 veto 时保持原分）
  const range = getCachedRange()
  if (range && !result.vetoed) {
    result.total = stretchScore(result.total, range)
    result.conclusion = conclude(result.total, result.riskLevel, false)
    result.star = result.total >= 90 ? 5 : result.total >= 80 ? 4 : result.total >= 70 ? 3 : result.total >= 60 ? 2 : 1
    result.reason = result.reason.replace(/综合评分 \d+ 分/, `综合评分 ${result.total} 分`)
  }

  // 资金情绪数据（详情展示用）
  const fundFlow = {
    margin: Array.isArray(enhance?.margin) ? enhance.margin.slice(0, 5).map(r => ({
      date: String(r.DATE || '').slice(0, 10),
      rzye: Number(r.RZYE || 0),
      rzmre: Number(r.RZMRE || 0),
      rzche: Number(r.RZCHE || 0)
    })) : [],
    surveys: (enhance?.surveys || []).map(r => ({
      date: String(r.RECEIVE_END_DATE || '').slice(0, 10),
      orgType: r.ORG_TYPE || '',
      num: r.RECEIVE_NUM != null ? Number(r.RECEIVE_NUM) : null
    })),
    lhb: (enhance?.lhb || []).map(r => ({
      date: String(r.TRADE_DATE || '').slice(0, 10),
      explanation: r.EXPLANATION || '',
      buy: Number(r.TOTAL_BUY || 0),
      sell: Number(r.TOTAL_SELL || 0)
    }))
  }

  const data = {
    ...result,
    basic: { ...result.basic, industry: stock.industry, name: stock.name },
    kline: kline.slice(-320),
    fundFlow,
    horizon: horizonKey,
    updateTime: new Date().toISOString()
  }
  // 详情缓存：交易时段 10 分钟、非交易 30 分钟。
  // 详情页访问频率高且常来回切换周期/代码，拉长 TTL 可显著降低对东财/腾讯的重复请求压力；
  // 盘中评分对分钟级行情不敏感（K线缓存同为 10 分钟档），10 分钟延迟在可接受范围。
  detailCache.set(dkey, { ttl: Date.now() + (isTradingTime() ? 10 * 60_000 : 30 * 60_000), data })
  // 防缓存无限增长：清理过期条目
  if (detailCache.size > 200) {
    const now = Date.now()
    for (const [k, v] of detailCache) if (now > v.ttl) detailCache.delete(k)
  }
  return data
}

export default { HORIZONS, getHorizon, buildScorePool, buildStockDetail, getCachedBase, getCachedRange, computeTech }
