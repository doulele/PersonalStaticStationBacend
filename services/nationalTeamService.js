/**
 * 国家队动向监测 — 数据采集 + 信号计算引擎
 * ------------------------------------------------------------
 * 数据源：
 *   主源: 新浪财经 (hq.sinajs.cn) — ETF实时行情
 *   备源: 东方财富 (push2.eastmoney.com) — ETF份额/规模数据
 *
 * 计算：三因子加权评分 (量能50% + 份额30% + 方向20%)
 * 防误判：连续3日确认、份额暴增过滤
 */
import { dbAll, dbGet, dbRun, dbTransaction } from './db.js'
import http from 'http'
import https from 'https'

// ==================== 常量配置 ====================

/** 6只核心宽基ETF */
const ETF_LIST = [
  { code: '510300', name: '沪深300ETF', exchange: 'sh' },
  { code: '510050', name: '上证50ETF', exchange: 'sh' },
  { code: '510500', name: '中证500ETF', exchange: 'sh' },
  { code: '512100', name: '中证1000ETF', exchange: 'sh' },
  { code: '588000', name: '科创50ETF', exchange: 'sh' },
  { code: '563000', name: '中证A500ETF', exchange: 'sh' }
]

/** 机构配置：名称 + 专属ETF池（用于视角信号计算） */
const AGENCIES = [
  { key: 'overview',  label: '总览',     etfs: ['510300','510050','510500','512100','588000','563000'] },
  { key: 'zghj',      label: '中央汇金',  etfs: ['510300','510050'] },
  { key: 'zjgs',      label: '证金公司',  etfs: ['510300','510500','510050'] },
  { key: 'sbjj',      label: '社保基金',  etfs: ['510300','510050','510500','512100','588000','563000'] },
  { key: 'wgj',       label: '外管局平台', etfs: ['510050','510300'] },
  { key: 'djj',       label: '国家大基金', etfs: ['588000','512100'] }
]

/** 信号等级映射 */
const SIGNAL_LEVELS = {
  extreme_low:  { min: 0,  max: 30,  label: '极度低估', color: '#ff4757', suggestion: '分批加仓，建议权益类仓位提至70%以上', position: 75 },
  low:          { min: 30, max: 40,  label: '低估区间', color: '#ff6b81', suggestion: '可适度加仓，建议权益类仓位60%-70%', position: 65 },
  normal:       { min: 40, max: 50,  label: '正常区间', color: '#ffa502', suggestion: '持有观望，保持现有仓位不变', position: 50 },
  high:         { min: 50, max: 70,  label: '高估区间', color: '#1e90ff', suggestion: '分批卖出，每涨5%减仓1/10', position: 35 },
  extreme_high: { min: 70, max: 100, label: '泡沫区间', color: '#ff4757', suggestion: '清仓离场，全部转为现金或债券', position: 10 }
}

// ==================== HTTP 请求工具 ====================

function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const { timeout = 10000, headers = {} } = options
    const req = https.get(url, {
      timeout,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
        ...headers
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')) })
  })
}

// ==================== 数据采集 ====================

/**
 * 从新浪获取ETF行情数据
 * 格式: var hq_str_sh510300="名称,今开,昨收,当前,最高,最低,...,成交量,成交额,..."
 */
async function fetchSinaQuotes(_dateStr) {
  const codes = ETF_LIST.map(e => `${e.exchange}${e.code}`).join(',')
  const url = `https://hq.sinajs.cn/list=${codes}`
  console.log(`[NT] 采集新浪行情: ${codes}`)

  const raw = await httpGet(url, { timeout: 10000 })
  const results = {}

  for (const etf of ETF_LIST) {
    const prefix = `hq_str_${etf.exchange}${etf.code}`
    const regex = new RegExp(`${prefix}="([^"]*)"`)
    const match = raw.match(regex)
    if (!match) continue

    const fields = match[1].split(',')
    // 新浪格式字段索引:
    // 0:名称 1:今开 2:昨收 3:当前价 4:最高 5:最低
    // 8:成交量(股) 9:成交额(元) 30:日期
    results[etf.code] = {
      code: etf.code,
      name: fields[0] || etf.name,
      open_price: parseFloat(fields[1]) || null,
      close_price: parseFloat(fields[3]) || parseFloat(fields[2]) || null,
      high_price: parseFloat(fields[4]) || null,
      low_price: parseFloat(fields[5]) || null,
      volume: parseFloat(fields[8]) || null,
      amount: parseFloat(fields[9]) || null,
      source: 'sina'
    }
  }

  return results
}

/**
 * 从东方财富获取ETF份额数据（备用 + 份额数据）
 * 使用 stock/get 逐只串行查询（带重试），f49=总份额 f116=总净资产
 * 如果东方财富不可用，降级为无份额数据
 */
async function fetchEastMoneyShares() {
  const results = {}
  const codes = ETF_LIST.map(e => e.code).join(',')
  console.log(`[NT] 采集东方财富份额: ${codes}`)

  for (const etf of ETF_LIST) {
    let success = false
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=1.${etf.code}&fields=f43,f44,f45,f46,f47,f48,f49,f116,f117`
        const raw = await httpGet(url, {
          timeout: 10000,
          headers: { 'Referer': 'https://quote.eastmoney.com/' }
        })
        const json = JSON.parse(raw)
        const d = json?.data
        if (!d || d.f43 == null) {
          if (attempt === 0) { await new Promise(r => setTimeout(r, 1000)); continue }
          console.warn(`[NT] 东方财富 ${etf.code} 无数据`)
          break
        }

        results[etf.code] = {
          code: etf.code,
          name: etf.name,
          close_price: d.f43 != null ? d.f43 / 1000 : null,
          open_price: d.f46 != null ? d.f46 / 1000 : null,
          high_price: d.f44 != null ? d.f44 / 1000 : null,
          low_price: d.f45 != null ? d.f45 / 1000 : null,
          volume: d.f47 != null ? d.f47 : null,
          amount: d.f48 != null ? d.f48 : null,
          total_shares: d.f49 != null ? d.f49 : null,
          total_nav: d.f116 != null ? d.f116 : null,
          source: 'eastmoney'
        }
        success = true
        break
      } catch (err) {
        if (attempt === 0) {
          await new Promise(r => setTimeout(r, 1000))
        } else {
          console.warn(`[NT] 东方财富 ${etf.code} 查询失败:`, err.message)
        }
      }
    }
    if (success) {
      // 串行延迟避免限流
      await new Promise(r => setTimeout(r, 500))
    }
  }

  if (Object.keys(results).length === 0) {
    console.warn('[NT] 东方财富份额数据全部获取失败，降级为无份额模式')
  } else {
    console.log(`[NT] 东方财富采集成功: ${Object.keys(results).length} 只ETF`)
  }
  return results
}

/**
 * 合并多源数据（新浪优先，东方财富补充）
 */
async function collectETFData(dateStr) {
  let quoteData = {}
  let shareData = {}
  let sourceUsed = 'sina'

  // 主源：新浪
  try {
    quoteData = await fetchSinaQuotes(dateStr)
    console.log(`[NT] 新浪采集成功: ${Object.keys(quoteData).length} 只ETF`)
  } catch (err) {
    console.warn('[NT] 新浪采集失败:', err.message)
  }

  // 备源：东方财富
  try {
    shareData = await fetchEastMoneyShares()
    console.log(`[NT] 东方财富采集成功: ${Object.keys(shareData).length} 只ETF`)
  } catch (err) {
    console.warn('[NT] 东方财富采集失败:', err.message)
  }

  if (Object.keys(quoteData).length === 0 && Object.keys(shareData).length === 0) {
    throw new Error('所有数据源均不可用')
  }

  // 合并：新浪主源 + 东方财富补充
  if (Object.keys(quoteData).length === 0) {
    sourceUsed = 'eastmoney'
  }

  const merged = {}
  for (const etf of ETF_LIST) {
    const sina = quoteData[etf.code] || {}
    const em = shareData[etf.code] || {}
    merged[etf.code] = {
      code: etf.code,
      name: etf.name,
      close_price: sina.close_price ?? em.close_price ?? null,
      open_price: sina.open_price ?? em.open_price ?? null,
      high_price: sina.high_price ?? em.high_price ?? null,
      low_price: sina.low_price ?? em.low_price ?? null,
      volume: sina.volume ?? em.volume ?? null,
      amount: sina.amount ?? em.amount ?? null,
      total_shares: em.total_shares ?? null,
      total_nav: em.total_nav ?? null,
      source: sourceUsed
    }
  }

  return { data: merged, sourceUsed }
}

// ==================== 信号计算 ====================

/**
 * 计算份额/资金净变化（需昨天数据对比）
 * 优先用真实 total_shares，降级用 amount（成交额）变化估算
 */
function calcShareChange(code, today, yesterday) {
  const prev = yesterday?.[code]
  if (!prev) return { change: null, changePct: null, skip: false }

  // 优先使用真实份额数据
  if (today?.total_shares && prev?.total_shares) {
    const change = today.total_shares - prev.total_shares
    const changePct = prev.total_shares > 0 ? (change / prev.total_shares) * 100 : 0
    const skip = Math.abs(changePct) > 5
    return { change, changePct, skip }
  }

  // 降级：用成交额变化估算资金流向（amount 日间变化率）
  if (today?.amount && prev?.amount && prev.amount > 0) {
    const change = today.amount - prev.amount
    const changePct = (change / prev.amount) * 100
    const skip = Math.abs(changePct) > 100  // 成交额变化超过100%视为异常
    return { change, changePct, skip }
  }

  return { change: null, changePct: null, skip: false }
}

/**
 * 计算单日量能因子得分 (0-100)
 * 当日成交额 ÷ 过去20日均值，比值≥2.5得100分，≤0.5得0分，线性插值
 */
function calcVolumeFactor(todayAmount, historyAmounts) {
  if (!todayAmount || historyAmounts.length === 0) return 0
  const avg = historyAmounts.reduce((a, b) => a + b, 0) / historyAmounts.length
  if (avg === 0) return 0
  const ratio = todayAmount / avg
  // 线性映射: ratio 0.5→0, 2.5→100
  const score = ((ratio - 0.5) / (2.5 - 0.5)) * 100
  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * 计算单日资金流向因子得分 (0-100)（原份额因子）
 * 当日资金净变化 ÷ 过去5日净变化均值
 * 净变化为正得正分，净变化≤0得0分
 */
function calcShareFactor(todayChange, historyChanges, volumeFactorScore = 0) {
  if (todayChange == null) return 0
  if (todayChange <= 0) return 0

  // 历史数据不足时，用量能因子估算（成交额暴增 ≈ 资金流入）
  if (historyChanges.length === 0) {
    return Math.round(volumeFactorScore * 0.6)
  }

  const avgRaw = historyChanges.reduce((a, b) => a + b, 0) / historyChanges.length
  const avg = avgRaw < 0 ? Math.abs(avgRaw) : (avgRaw || 1)
  const ratio = todayChange / avg
  return Math.max(0, Math.min(100, Math.round(ratio * 50)))
}

/**
 * 计算单日方向因子得分 (0-100)
 * 当日ETF涨跌幅 - 沪深300指数涨跌幅
 * 跑赢≥1%得100分，跑输≥1%得0分，线性插值
 */
function calcDirectionFactor(etfPct, hs300Pct) {
  if (etfPct == null || hs300Pct == null) return 50
  const diff = etfPct - hs300Pct
  // 线性映射: diff -1%→0, diff +1%→100
  const score = ((diff - (-1)) / (1 - (-1))) * 100
  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * 获取历史数据用于因子计算
 */
function getHistoricalData(allData, code, dateStr, days) {
  const sorted = allData
    .filter(d => d.code === code && d.date < dateStr)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, days)

  return {
    amounts: sorted.map(d => d.amount).filter(Boolean),
    shareChanges: sorted.map(d => d.share_change).filter(v => v != null),
    closes: sorted.map(d => d.close_price).filter(Boolean)
  }
}

/**
 * 查询昨日各ETF数据
 */
function getYesterdayData(allData, dateStr) {
  const yesterday = {}
  for (const etf of ETF_LIST) {
    const row = allData
      .filter(d => d.code === etf.code && d.date < dateStr)
      .sort((a, b) => b.date.localeCompare(a.date))[0]
    if (row) yesterday[etf.code] = row
  }
  return yesterday
}

/**
 * 计算国家队预估成本线
 * 取过去90天中份额增长>2%的交易日，成交均价按份额增量加权平均
 */
function calcCostLine(allData, etfCodes) {
  const tradingDays = allData
    .filter(d => etfCodes.includes(d.code) && d.share_change_pct != null && d.share_change_pct > 2 && d.amount && d.volume)
  if (tradingDays.length === 0) return null

  let totalWeight = 0
  let weightedSum = 0
  for (const d of tradingDays) {
    const avgPrice = d.amount / d.volume
    const weight = d.share_change || 0
    weightedSum += avgPrice * weight
    totalWeight += weight
  }
  return totalWeight > 0 ? weightedSum / totalWeight : null
}

/**
 * 计算连续信号天数（防误判：连续3日确认）
 */
function calcConsecutiveDays(allSignals, agency, dateStr, signalLevel) {
  if (signalLevel !== 'extreme_low' && signalLevel !== 'low') return 1

  let count = 1
  let checkDate = dateStr
  for (let i = 0; i < 10; i++) {
    const prev = new Date(checkDate)
    prev.setDate(prev.getDate() - 1)
    checkDate = prev.toISOString().slice(0, 10)

    const sig = allSignals.find(s => s.date === checkDate && s.agency === agency)
    if (sig && (sig.signal_level === 'extreme_low' || sig.signal_level === 'low')) {
      count++
    } else {
      break
    }
  }
  return count
}

/**
 * 获取信号等级信息
 */
function getSignalLevel(score) {
  for (const [key, config] of Object.entries(SIGNAL_LEVELS)) {
    if (score >= config.min && score < config.max) {
      return { key, ...config }
    }
  }
  return { key: 'normal', ...SIGNAL_LEVELS.normal }
}

/**
 * 获取历史ETF数据（最近N天）
 */
function getRecentETFData(allData, days = 20) {
  if (allData.length === 0) return []
  const dates = [...new Set(allData.map(d => d.date))].sort().reverse().slice(0, days)
  return allData.filter(d => dates.includes(d.date))
}

/**
 * ==================== 主执行流程 ====================
 * 采集数据 → 计算份额变化 → 计算各机构信号 → 存储
 */
export async function runDailyTask(dateStr) {
  const startTime = Date.now()
  console.log(`\n[NT] ===== 开始执行每日任务: ${dateStr} =====`)

  // 1. 采集数据
  console.log('[NT] 步骤1/4: 采集ETF数据...')
  const { data: todayData, sourceUsed } = await collectETFData(dateStr)

  // 2. 获取历史数据
  console.log('[NT] 步骤2/4: 加载历史数据...')
  const allData = dbAll('SELECT * FROM nt_etf_daily ORDER BY date, code')
  const yesterdayData = getYesterdayData(allData, dateStr)

  // 3. 计算份额变化并保存
  console.log('[NT] 步骤3/4: 计算份额变化...')
  const savedETFData = {}
  for (const etf of ETF_LIST) {
    const today = todayData[etf.code]
    if (!today) continue

    const { change, changePct, skip } = calcShareChange(etf.code, today, yesterdayData)

    const row = {
      code: etf.code,
      name: etf.name,
      close_price: today.close_price,
      open_price: today.open_price,
      high_price: today.high_price,
      low_price: today.low_price,
      volume: today.volume,
      amount: today.amount,
      total_shares: today.total_shares,
      total_nav: today.total_nav,
      share_change: skip ? null : change,
      share_change_pct: skip ? null : changePct,
      data_source: today.source
    }
    savedETFData[etf.code] = row

    // 保存到数据库
    dbRun(`
      INSERT OR REPLACE INTO nt_etf_daily
        (date, code, name, close_price, open_price, high_price, low_price,
         volume, amount, total_shares, total_nav, share_change, share_change_pct, data_source)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [dateStr, row.code, row.name, row.close_price, row.open_price, row.high_price, row.low_price,
        row.volume, row.amount, row.total_shares, row.total_nav, row.share_change, row.share_change_pct, row.data_source])

    if (skip) {
      console.log(`[NT] ⚠️ ${etf.code} ${etf.name} 份额暴增过滤: ${changePct?.toFixed(2)}%`)
    }
  }

  // 重新加载（含今天数据）
  const allDataFresh = dbAll('SELECT * FROM nt_etf_daily ORDER BY date, code')
  const allSignals = dbAll('SELECT * FROM nt_signals ORDER BY date')

  // 计算沪深300指数涨跌幅（用510300近似，因为沪深300ETF跟踪沪深300）
  const todayHS300ETF = allDataFresh.filter(d => d.date === dateStr && d.code === '510300')[0]
  const prevHS300ETF = yesterdayData['510300']
  const hs300Change = (todayHS300ETF?.close_price && prevHS300ETF?.close_price)
    ? ((todayHS300ETF.close_price - prevHS300ETF.close_price) / prevHS300ETF.close_price) * 100
    : null

  // 4. 计算每个机构的信号
  console.log('[NT] 步骤4/4: 计算各机构信号...')
  for (const agency of AGENCIES) {
    // 汇总该机构专属ETF池的数据
    let totalVolume = 0, totalAmount = 0, totalShares = 0, totalNav = 0
    let totalShareChange = 0
    const etfScores = {}
    let combinedVolumeScore = 0, combinedShareScore = 0, combinedDirectionScore = 0
    let validCount = 0
    let totalWeight = 0

    for (const code of agency.etfs) {
      const today = savedETFData[code]
      if (!today || today.close_price == null) continue

      const history = getHistoricalData(allDataFresh, code, dateStr, 20)
      const prevClose = yesterdayData[code]?.close_price

      // 涨跌幅
      const etfPct = prevClose ? ((today.close_price - prevClose) / prevClose) * 100 : null

      // 三因子得分
      const vScore = calcVolumeFactor(today.amount, history.amounts)
      const sScore = calcShareFactor(today.share_change, history.shareChanges, vScore)
      const dScore = calcDirectionFactor(etfPct, hs300Change)

      etfScores[code] = { volume: vScore, share: sScore, direction: dScore }

      // 按成交额加权
      const weight = today.amount || 1
      combinedVolumeScore += vScore * weight
      combinedShareScore += sScore * weight
      combinedDirectionScore += dScore * weight
      totalWeight += weight
      validCount++

      totalVolume += today.volume || 0
      totalAmount += today.amount || 0
      if (today.share_change != null) totalShareChange += today.share_change
    }

    if (validCount === 0) continue

    // 加权平均各因子分
    combinedVolumeScore = Math.round(combinedVolumeScore / totalWeight)
    combinedShareScore = Math.round(combinedShareScore / totalWeight)
    combinedDirectionScore = Math.round(combinedDirectionScore / totalWeight)

    // 综合评分 = 量能×50% + 份额×30% + 方向×20%
    const overallScore = Math.round(
      combinedVolumeScore * 0.50 +
      combinedShareScore * 0.30 +
      combinedDirectionScore * 0.20
    )

    const signalLevel = getSignalLevel(overallScore)
    const consecutiveDays = calcConsecutiveDays(allSignals, agency.key, dateStr, signalLevel.key)

    // 计算成本线
    const costLine = calcCostLine(allDataFresh, agency.etfs)

    // 防误判：连续3日确认
    let finalSuggestion = signalLevel.suggestion
    let isBurst = 0
    if (signalLevel.key === 'extreme_low' || signalLevel.key === 'low') {
      if (consecutiveDays < 3) {
        finalSuggestion = `【等待确认】${signalLevel.suggestion}（已连续${consecutiveDays}天买入信号，需连续3天确认）`
      }
    }

    // 保存信号
    dbRun(`
      INSERT OR REPLACE INTO nt_signals
        (date, agency, overall_score, volume_factor, share_factor, direction_factor,
         signal_level, signal_label, suggestion, suggested_position, is_burst,
         consecutive_days, cost_line, hs300_change, etf_scores)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `, [
      dateStr, agency.key, overallScore, combinedVolumeScore, combinedShareScore, combinedDirectionScore,
      signalLevel.key, signalLevel.label, finalSuggestion, signalLevel.position, isBurst,
      consecutiveDays, costLine, hs300Change, JSON.stringify(etfScores)
    ])

    console.log(`[NT] ${agency.label}: ${overallScore}分 (${signalLevel.label}) | 量能${combinedVolumeScore} 份额${combinedShareScore} 方向${combinedDirectionScore}`)
  }

  const duration = Date.now() - startTime
  console.log(`[NT] ===== 任务完成，耗时 ${duration}ms =====\n`)
  return { success: true, duration, sourceUsed, etfCount: Object.keys(savedETFData).length }
}

/**
 * 获取今日信号
 */
export function getTodaySignal(dateStr, agency = 'overview') {
  return dbGet(
    'SELECT * FROM nt_signals WHERE date = ? AND agency = ?',
    [dateStr, agency]
  )
}

/**
 * 获取历史信号列表
 */
export function getSignalHistory(days = 90, agency = 'overview') {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const fromDate = d.toISOString().slice(0, 10)

  return dbAll(
    'SELECT * FROM nt_signals WHERE date >= ? AND agency = ? ORDER BY date',
    [fromDate, agency]
  )
}

/**
 * 获取所有机构在指定日期范围内的信号
 */
export function getAllAgencySignals(days = 90) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const fromDate = d.toISOString().slice(0, 10)

  return dbAll(
    'SELECT * FROM nt_signals WHERE date >= ? ORDER BY date, agency',
    [fromDate]
  )
}

/**
 * 获取ETF数据
 */
export function getETFData(dateStr) {
  if (dateStr) {
    return dbAll('SELECT * FROM nt_etf_daily WHERE date = ? ORDER BY code', [dateStr])
  }
  // 返回所有数据
  return dbAll('SELECT * FROM nt_etf_daily ORDER BY date, code')
}

/**
 * 获取ETF历史数据（用于图表，最近N天）
 */
export function getETFHistory(days = 90) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const fromDate = d.toISOString().slice(0, 10)
  return dbAll(
    'SELECT * FROM nt_etf_daily WHERE date >= ? ORDER BY date, code',
    [fromDate]
  )
}

/**
 * 获取近N日异动列表
 */
export function getAnomalies(days = 7) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  const fromDate = d.toISOString().slice(0, 10)

  const allData = dbAll(
    'SELECT * FROM nt_etf_daily WHERE date >= ? ORDER BY date DESC, code',
    [fromDate]
  )

  const anomalies = []
  for (const row of allData) {
    // 份额暴增
    if (row.share_change_pct != null && Math.abs(row.share_change_pct) > 3) {
      anomalies.push({
        date: row.date,
        etfCode: row.code,
        etfName: row.name,
        type: 'share_surge',
        typeLabel: row.share_change_pct > 0 ? '份额暴增' : '份额骤降',
        description: `份额变化 ${row.share_change_pct > 0 ? '+' : ''}${row.share_change_pct.toFixed(2)}%`,
        signal: row.share_change_pct > 0 ? '买入关注' : '卖出关注',
        relatedAgency: getRelatedAgency(row.code)
      })
    }

    // 爆量（成交额 > 过去5日均值 × 3，简化版不含下影线检测）
    const history5 = allData
      .filter(d => d.code === row.code && d.date < row.date)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
    const avgAmount = history5.length > 0
      ? history5.reduce((s, d) => s + (d.amount || 0), 0) / history5.length
      : 0
    if (avgAmount > 0 && row.amount > avgAmount * 3) {
      anomalies.push({
        date: row.date,
        etfCode: row.code,
        etfName: row.name,
        type: 'volume_surge',
        typeLabel: '成交爆量',
        description: `成交额 ${(row.amount / 1e8).toFixed(1)}亿（均值 ${(avgAmount / 1e8).toFixed(1)}亿×${(row.amount / avgAmount).toFixed(1)}）`,
        signal: '买入关注',
        relatedAgency: getRelatedAgency(row.code)
      })
    }
  }

  return anomalies.slice(0, 20)
}

/**
 * 根据ETF代码推断关联机构
 */
function getRelatedAgency(code) {
  const map = {
    '510300': '中央汇金 / 证金公司',
    '510050': '中央汇金 / 外管局',
    '510500': '证金公司',
    '512100': '国家大基金',
    '588000': '国家大基金',
    '563000': '社保基金'
  }
  return map[code] || '总览'
}

/**
 * 获取数据源状态
 */
export function getDataSourceStatus() {
  const latest = dbGet(
    'SELECT date, data_source FROM nt_etf_daily ORDER BY date DESC LIMIT 1'
  )
  return {
    primary: 'sina',
    current: latest?.data_source || 'unknown',
    lastUpdate: latest?.date || null,
    healthy: !!latest
  }
}

/**
 * 创建触发日志
 */
export function createTriggerLog() {
  const now = new Date().toISOString()
  const result = dbRun(
    'INSERT INTO nt_trigger_logs (started_at, status) VALUES (?, ?)',
    [now, 'running']
  )
  return dbGet('SELECT * FROM nt_trigger_logs WHERE started_at = ?', [now])
}

/**
 * 更新触发日志
 */
export function updateTriggerLog(id, status, data) {
  const fields = ['status = ?', 'finished_at = ?']
  const values = [status, new Date().toISOString()]

  if (data.error_msg != null) { fields.push('error_msg = ?'); values.push(data.error_msg) }
  if (data.data_count != null) { fields.push('data_count = ?'); values.push(data.data_count) }
  if (data.duration_ms != null) { fields.push('duration_ms = ?'); values.push(data.duration_ms) }
  if (data.source_used != null) { fields.push('source_used = ?'); values.push(data.source_used) }

  values.push(id)
  return dbRun(`UPDATE nt_trigger_logs SET ${fields.join(', ')} WHERE id = ?`, values)
}

/**
 * 获取最近的触发日志
 */
export function getLatestTriggerLog() {
  return dbGet('SELECT * FROM nt_trigger_logs ORDER BY id DESC LIMIT 1')
}

/**
 * 获取触发日志列表
 */
export function getTriggerLogs(limit = 20) {
  return dbAll('SELECT * FROM nt_trigger_logs ORDER BY id DESC LIMIT ?', [limit])
}
