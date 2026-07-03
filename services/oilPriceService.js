/**
 * 油价服务 — 提供全国油价数据、历史走势、调价预测
 *
 * 数据来源：
 *   - 全国各省基准零售价（发改委定价，手动维护参考表）
 *   - 国际原油期货 K 线（东方财富 API）→ 模拟零售价历史走势
 *   - 调价窗口预测（基于 10 日均线变化）
 */

import axios from 'axios'
import https from 'https'
import iconv from 'iconv-lite'
import { cacheGet, cacheSet } from './cacheService.js'

// ==================== 全国各省油价参考表 ====================
// 单位：元/升，以省会为准。实际各地市价格差异极小（同省统一）
const PROVINCE_PRICES = {
  '北京':   { '92号汽油': 7.88, '95号汽油': 8.39, '98号汽油': 9.89, '0号柴油': 7.60 },
  '上海':   { '92号汽油': 7.85, '95号汽油': 8.35, '98号汽油': 9.85, '0号柴油': 7.54 },
  '广东':   { '92号汽油': 7.91, '95号汽油': 8.57, '98号汽油': 10.57,'0号柴油': 7.57 },
  '浙江':   { '92号汽油': 7.86, '95号汽油': 8.36, '98号汽油': 9.86, '0号柴油': 7.55 },
  '江苏':   { '92号汽油': 7.86, '95号汽油': 8.36, '98号汽油': 9.86, '0号柴油': 7.53 },
  '四川':   { '92号汽油': 7.99, '95号汽油': 8.54, '98号汽油': 9.28, '0号柴油': 7.61 },
  '湖北':   { '92号汽油': 7.89, '95号汽油': 8.45, '98号汽油': 9.95, '0号柴油': 7.55 },
  '山东':   { '92号汽油': 7.86, '95号汽油': 8.43, '98号汽油': 9.15, '0号柴油': 7.48 },
  '湖南':   { '92号汽油': 7.84, '95号汽油': 8.33, '98号汽油': 9.33, '0号柴油': 7.62 },
  '河南':   { '92号汽油': 7.89, '95号汽油': 8.43, '98号汽油': 9.28, '0号柴油': 7.54 },
  '福建':   { '92号汽油': 7.85, '95号汽油': 8.38, '98号汽油': 9.88, '0号柴油': 7.55 },
  '安徽':   { '92号汽油': 7.85, '95号汽油': 8.40, '98号汽油': 9.60, '0号柴油': 7.60 },
  '河北':   { '92号汽油': 7.88, '95号汽油': 8.32, '98号汽油': 9.14, '0号柴油': 7.56 },
  '重庆':   { '92号汽油': 7.96, '95号汽油': 8.41, '98号汽油': 9.48, '0号柴油': 7.63 },
  '陕西':   { '92号汽油': 7.78, '95号汽油': 8.22, '98号汽油': 9.72, '0号柴油': 7.45 },
  '云南':   { '92号汽油': 8.04, '95号汽油': 8.63, '98号汽油': 9.31, '0号柴油': 7.63 },
  '贵州':   { '92号汽油': 8.02, '95号汽油': 8.47, '98号汽油': 9.37, '0号柴油': 7.67 },
  '广西':   { '92号汽油': 7.95, '95号汽油': 8.59, '98号汽油': 9.73, '0号柴油': 7.62 },
  '海南':   { '92号汽油': 9.00, '95号汽油': 9.56, '98号汽油': 10.82,'0号柴油': 7.65 },
  '江西':   { '92号汽油': 7.85, '95号汽油': 8.43, '98号汽油': 9.93, '0号柴油': 7.61 },
}

// 同省可能有多个城市，目前数据只到省级。如需城市细分可在此补充
const EXTRA_CITIES = {
  '广东': { '深圳': {}, '珠海': {}, '东莞': {}, '佛山': {} },
  '浙江': { '宁波': {}, '温州': {}, '绍兴': {} },
  '江苏': { '苏州': {}, '无锡': {}, '常州': {} },
  '山东': { '青岛': {}, '烟台': {}, '潍坊': {} },
  '福建': { '厦门': {}, '泉州': {}, '福州': {} },
}

/**
 * 获取某省份的城市列表及其油价
 * @param {string} province
 * @returns {{name:string, prices:object}[]}
 */
export function getCityPrices(province) {
  const base = PROVINCE_PRICES[province]
  if (!base) return []

  const cities = [{ name: province, prices: formatPrices(base) }]

  // 如果该省有额外城市，使用省会价格
  if (EXTRA_CITIES[province]) {
    for (const cityName of Object.keys(EXTRA_CITIES[province])) {
      cities.push({ name: cityName, prices: formatPrices(base) })
    }
  }

  return cities
}

function formatPrices(p) {
  return {
    '92号汽油': p['92号汽油'].toFixed(2),
    '95号汽油': p['95号汽油'].toFixed(2),
    '98号汽油': p['98号汽油'].toFixed(2),
    '0号柴油': p['0号柴油'].toFixed(2),
  }
}

/**
 * 获取全国平均油价
 */
export function getNationalAvg() {
  const types = ['92号汽油', '95号汽油', '98号汽油', '0号柴油']
  const sums = { '92号汽油': 0, '95号汽油': 0, '98号汽油': 0, '0号柴油': 0 }
  const provs = Object.keys(PROVINCE_PRICES)
  provs.forEach(p => {
    types.forEach(t => { sums[t] += PROVINCE_PRICES[p][t] })
  })
  return types.map(t => ({
    type: t,
    value: (sums[t] / provs.length).toFixed(2)
  }))
}

// ==================== 原油期货数据源 ====================
// 多数据源容灾：新浪实时行情 → 新浪K线 → 腾讯实时行情 → 东方财富
// 新浪 hq.sinajs.cn 是国内最稳定的行情接口，十多年来从未挂过

// 共享 HTTP Agent，避免 socket hang up（连接复用+超时控制）
const httpAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  timeout: 8000,
  rejectUnauthorized: false,
})

// 通用请求配置
const REQ_CONFIG = {
  timeout: 8000,
  httpsAgent: httpAgent,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  },
}

// ====================================================================
// 数据源 1：新浪财经实时行情（hq.sinajs.cn — 国内最稳定）
// 格式: var hq_str_hf_CL="价格,昨收,开盘,...,时间"
// hf_CL=WTI原油期货, nf_SC0=上海原油连续
// ====================================================================
async function fetchOilQuoteFromSina() {
  try {
    console.log('[油价] 新浪实时行情...')
    const res = await axios.get('https://hq.sinajs.cn/list=hf_CL,nf_SC0', {
      ...REQ_CONFIG,
      headers: {
        ...REQ_CONFIG.headers,
        'Referer': 'https://finance.sina.com.cn/',
      },
      // 新浪接口返回GBK编码
      responseType: 'arraybuffer',
    })
    // 解码GBK（iconv-lite 0.6.3 ESM导入）
    const raw = iconv.decode(Buffer.from(res.data), 'gbk')

    console.log(`[油价] 新浪原始响应(前250字): ${raw.slice(0, 250)}`)

    const results = []
    const lines = raw.split('\n').filter(Boolean)
    for (const line of lines) {
      // 解析 var hq_str_xxx="values"
      const m = line.match(/hq_str_(\w+)="(.+)"/)
      if (!m) continue
      const symbol = m[1]
      const fields = m[2].split(',')

      // 新浪期货字段格式因内外盘不同:
      // ===== 外盘 hf_CL (WTI原油) =====
      // [0]最新价 [1]? [2]昨收 [3]今开 [4]最高 [5]最低 [6]时间 [7]买价 [8]卖价 ... [13]名称
      // 真实数据: "69.078,,69.050,69.070,69.260,68.300,14:43:05,68.690,68.430,..."
      // ===== 内盘 nf_SC0 (上海原油) =====
      // [0]名称 [1]成交量 [2]昨结算 [3]今开 [4]最高 [5]最低 [6]现价 [7]买价 [8]卖价 [9]成交额 [10]昨收
      // 真实数据: "上海原油连续,144308,433.700,445.400,433.400,0.000,441.600,..."

      let name, price, prevClose

      if (symbol.startsWith('hf_')) {
        // 外盘期货
        name = fields[13] || symbol
        price = parseFloat(fields[0] || '0')
        prevClose = parseFloat(fields[2] || '0')
      } else {
        // 内盘期货 (nf_)
        name = fields[0] || symbol
        price = parseFloat(fields[6] || '0')  // 现价
        prevClose = parseFloat(fields[10] || fields[2] || '0')  // 昨收/昨结算
      }

      if (price > 0) {
        const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0
        results.push({ symbol, name, price, changePct, prevClose })
      }
    }

    for (const r of results) {
      console.log(`[油价] 新浪 ${r.name}(${r.symbol}): ¥${r.price}，涨跌 ${r.changePct.toFixed(2)}%`)
    }

    if (results.length > 0) {
      const wti = results.find(r => r.symbol === 'hf_CL')
      const sc = results.find(r => r.symbol === 'nf_SC0')

      // 缓存实时报价（5分钟有效）
      cacheSet('oil:realtime:quote', { wti, sc, all: results }, 5 * 60 * 1000)

      if (wti) {
        return { price: wti.price, changePct: wti.changePct, name: `WTI原油(新浪)` }
      }
      if (sc) {
        return { price: sc.price, changePct: sc.changePct, name: `${sc.name}(新浪)` }
      }
    }
  } catch (err) {
    console.log('[油价] 新浪实时行情:', err.message)
  }
  return null
}

// ====================================================================
// 数据源 2：新浪财经日K线
// 尝试多个 endpoint 和 symbol 格式
// ====================================================================
async function fetchOilKlineFromSina() {
  // 优先 stock2 JSONP（已确认 SC0 返回2005条真实数据）
  // 备选 money.finance 和 vip.stock.finance
  const candidates = [
    { url: 'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20tmp=/InnerFuturesNewService.getDailyKLine',
      symbol: 'SC0', name: '上海原油SC0(JSONP)', jsonp: true },
    { url: 'https://stock2.finance.sina.com.cn/futures/api/jsonp.php/var%20tmp=/InnerFuturesNewService.getDailyKLine',
      symbol: 'CL',  name: 'WTI原油(JSONP)', jsonp: true },
    { url: 'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData',
      symbol: 'SC0', name: '上海原油SC0(money)' },
    { url: 'https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData',
      name: 'WTI原油CL(money)', symbol: 'CL' },
  ]

  for (const { url, symbol, name, jsonp } of candidates) {
    try {
      console.log(`[油价] 新浪K线 尝试: ${name}`)
      const params = jsonp
        ? { symbol }
        : { symbol, scale: 240, ma: 'no', datalen: 2000 }

      const res = await axios.get(url, {
        ...REQ_CONFIG,
        params,
        timeout: 15000,  // K线数据量大，适当放宽超时
        headers: {
          ...REQ_CONFIG.headers,
          'Referer': 'https://finance.sina.com.cn/',
        },
        responseType: 'text',
      })

      let data = res.data
      // JSONP格式：var xxx=(JSON);  可能有前置script标签，用[\s\S]匹配多行
      if (jsonp && typeof data === 'string') {
        const match = data.match(/\(([\s\S]+)\)/)
        if (match) {
          try { data = JSON.parse(match[1]) } catch (e) {
            console.log(`[油价] 新浪K线 ${name}: JSON解析失败: ${e.message}`)
            continue
          }
        }
      }

      // 检查是否为合法数组
      if (!Array.isArray(data) || data.length === 0) {
        console.log(`[油价] 新浪K线 ${name}: 无数据 (类型:${typeof data}，前80字:${JSON.stringify(data).slice(0, 80)})`)
        continue
      }

      const klines = data
        .map(item => ({
          date: item.day || item.d || item.date,
          close: parseFloat(item.close || item.c),
        }))
        .filter(k => k.date && !isNaN(k.close) && k.close > 0)

      if (klines.length > 0) {
        const last = klines[klines.length - 1]
        console.log(`[油价] 新浪K线 ${name} 成功: ${klines.length}条，${last.close}`)
        cacheSet('oil:futures:kline', klines, 2 * 60 * 60 * 1000)
        return klines
      }
      console.log(`[油价] 新浪K线 ${name}: 解析后0条有效数据`)
    } catch (err) {
      console.log(`[油价] 新浪K线 ${name}:`, err.message)
    }
  }

  console.log('[油价] 新浪K线 全部候选失败')
  return null
}

// ====================================================================
// 数据源 3：腾讯实时行情（qt.gtimg.cn）
// ====================================================================
async function fetchOilQuoteFromTencent() {
  // 多个可能的 symbol 格式
  const symbols = ['fuSCM', 'szSCM', 'shSCM', 'scm', 'SCM']
  for (const sym of symbols) {
    try {
      console.log(`[油价] 腾讯行情 尝试: ${sym}`)
      const res = await axios.get(`https://qt.gtimg.cn/q=${sym}`, {
        ...REQ_CONFIG,
        headers: {
          ...REQ_CONFIG.headers,
          'Referer': 'https://finance.qq.com/',
        },
        responseType: 'arraybuffer',
      })
      const raw = Buffer.from(res.data).toString('utf-8')
      console.log(`[油价] 腾讯(${sym}) 响应(前120字): ${raw.slice(0, 120)}`)

      // 跳过 "none_match" — symbol不存在
      if (raw.includes('none_match')) continue

      // 格式: v_xxxx="1~名称~代码~最新价~..."
      const m = raw.match(/v_\w+="([^"]+)"/)
      if (m) {
        const fields = m[1].split('~')
        const name = fields[1] || sym
        const price = parseFloat(fields[3] || '0')
        const prevClose = parseFloat(fields[4] || '0')
        const changePct = parseFloat(fields[5] || '0') || (prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0)

        if (price > 0) {
          console.log(`[油价] 腾讯 ${name}: ¥${price}，涨跌 ${changePct.toFixed(2)}%`)
          return { price, changePct, name: `${name}(腾讯)` }
        }
      }
    } catch (err) {
      console.log(`[油价] 腾讯(${sym}):`, err.message)
    }
  }
  console.log('[油价] 腾讯 所有symbol均无匹配')
  return null
}

// ====================================================================
// 数据源 4：东方财富 K线（作为新浪K线的备用）
// rc=100=参数错误，需要修正secid格式和API参数
// ====================================================================
async function fetchOilKlineFromEastMoney() {
  // 修正后的secid列表：东方财富期货K线
  const candidates = [
    // 国内原油 — INE(上海国际能源交易中心)市场代码可能是 8 或 113
    { secid: '8.SC0001', name: '国内原油(SC0001)' },
    { secid: '8.sc0001', name: '国内原油小写' },
    { secid: '113.scm',  name: '国内原油(113.scm)' },
    { secid: '113.SCM',  name: '国内原油(113.SCM)' },
    // WTI原油连续
    { secid: '112.CL00Y', name: 'WTI原油(112)' },
    { secid: '100.CL',    name: 'WTI原油(100.CL)' },
    // 布伦特
    { secid: '112.BZ00Y', name: '布伦特(112)' },
  ]

  for (const { secid, name } of candidates) {
    try {
      const params = { secid, klt: 101, lmt: 130,
        fields1: 'f1,f2,f3,f4,f5,f6',
        fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61',
      }
      const res = await axios.get('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
        ...REQ_CONFIG,
        params,
        headers: { ...REQ_CONFIG.headers, 'Referer': 'https://quote.eastmoney.com/' },
      })
      const klineData = res.data?.data
      const rc = res.data?.rc ?? '?'
      if (klineData?.klines?.length > 0) {
        const klines = klineData.klines.map(line => {
          const parts = line.split(',')
          return { date: parts[0], close: parseFloat(parts[2]) }
        }).filter(k => k.date && !isNaN(k.close) && k.close > 0)

        if (klines.length > 0) {
          console.log(`[油价] 东方财富 ${name}(${secid}): ${klines.length}条，${klines[klines.length - 1].close}`)
          cacheSet('oil:futures:kline', klines, 2 * 60 * 60 * 1000)
          return klines
        }
      }
      console.log(`[油价] 东方财富 ${name}(${secid}): rc=${rc}`)
    } catch (err) {
      console.log(`[油价] 东方财富 ${name}(${secid}):`, err.code || err.message)
    }
  }

  // 如果上面全部失败，尝试去掉 fields2 试试（有时候字段格式会导致拒绝）
  console.log('[油价] 东方财富 简化参数重试...')
  try {
    const res = await axios.get('https://push2his.eastmoney.com/api/qt/stock/kline/get', {
      ...REQ_CONFIG,
      params: {
        secid: '8.SC0001',
        klt: 101,
        lmt: 130,
      },
      headers: { ...REQ_CONFIG.headers, 'Referer': 'https://quote.eastmoney.com/' },
    })
    console.log(`[油价] 东方财富 简化参数 响应: rc=${res.data?.rc}，data类型=${typeof res.data?.data}`)
  } catch (err) {
    console.log(`[油价] 东方财富 简化参数:`, err.code || err.message)
  }

  return null
}

// ====================================================================
// 数据源 5：新浪实时报价整合（作为统一实时行情节口）
// ====================================================================
async function fetchOilRealtimeQuote() {
  // 优先新浪（国内最稳）
  let quote = await fetchOilQuoteFromSina()
  if (quote) return quote

  // 其次腾讯
  quote = await fetchOilQuoteFromTencent()
  if (quote) return quote

  // 从缓存的实时行情中提取
  const cached = cacheGet('oil:realtime:quote')
  if (cached?.wti) {
    return { price: cached.wti.price, changePct: cached.wti.changePct, name: 'WTI原油(缓存)' }
  }
  if (cached?.sc) {
    return { price: cached.sc.price, changePct: cached.sc.changePct, name: '上海原油(缓存)' }
  }

  return null
}

// ====================================================================
// 统一 K 线获取（多源容灾）
// 优先级：新浪K线(SC) → 新浪K线(WTI) → 东方财富K线 → 本地累积历史
// ====================================================================
async function fetchOilFuturesKline() {
  const cached = cacheGet('oil:futures:kline')
  if (cached) return cached

  // 1. 新浪K线（最可靠）
  const sinaResult = await fetchOilKlineFromSina()
  if (sinaResult) return sinaResult

  // 2. 东方财富K线
  const emResult = await fetchOilKlineFromEastMoney()
  if (emResult) return emResult

  // 3. 降级：用累积的实时行情构建历史
  //    每次调用时记录当前价格，靠多次调用积累足够的历史数据点
  const accumulated = getAccumulatedHistory()
  if (accumulated && accumulated.length >= 2) {
    console.log(`[油价] 使用本地累积历史: ${accumulated.length}条`)
    return accumulated
  }

  // 4. 尝试获取实时行情作为单个数据点
  const quote = await fetchOilRealtimeQuote()
  if (quote) {
    const today = new Date().toISOString().slice(0, 10)
    const point = { date: today, close: quote.price }
    addToAccumulatedHistory(point)
    console.log(`[油价] 记录实时行情: ${today} $${quote.price}`)
  }

  console.log('[油价] 全部K线数据源均不可用')
  return null
}

// ====================================================================
// 本地累积历史（基于实时行情节点的降级方案）
// 当所有K线API都不可用时，用每次获取的实时价格逐步构建历史
// ====================================================================
function getAccumulatedHistory() {
  return cacheGet('oil:futures:accumulated') || null
}

function addToAccumulatedHistory(point) {
  let list = cacheGet('oil:futures:accumulated') || []
  // 去重同一天
  list = list.filter(k => k.date !== point.date)
  list.push(point)
  // 按日期排序
  list.sort((a, b) => a.date.localeCompare(b.date))
  // 最多保留130条
  if (list.length > 130) list = list.slice(-130)
  // 缓存12小时
  cacheSet('oil:futures:accumulated', list, 12 * 60 * 60 * 1000)
}

// ====================================================================
// 获取原油变化率（核心预测指标）
// ====================================================================
async function getOilChangeRate() {
  // 策略1：K线数据（最准确）
  const klines = await fetchOilFuturesKline()
  if (klines && klines.length >= 10) {
    const today = new Date()
    const lastAdjDaysBack = 14
    const lastAdjDate = new Date(today.getTime() - lastAdjDaysBack * 86400000)
    const lastAdjStr = lastAdjDate.toISOString().slice(0, 10)

    let baselineClose = null
    for (const k of klines) {
      if (k.date >= lastAdjStr) {
        baselineClose = k.close
        break
      }
      baselineClose = k.close
    }
    if (!baselineClose && klines.length > 0) {
      baselineClose = klines[0].close
    }

    const recent10 = klines.slice(-10)
    const avgRecent = recent10.reduce((s, k) => s + k.close, 0) / recent10.length
    const pctChange = ((avgRecent - baselineClose) / baselineClose) * 100

    console.log(`[油价] K线预测：基准价=${baselineClose.toFixed(2)}，近10日均价=${avgRecent.toFixed(2)}，变化率=${pctChange.toFixed(2)}%`)
    return { pctChange, source: 'kline' }
  }

  // 策略2：实时行情涨跌幅
  const quote = await fetchOilRealtimeQuote()
  if (quote) {
    console.log(`[油价] 行情预测：${quote.name} 涨跌幅=${quote.changePct}%`)
    return { pctChange: quote.changePct, source: 'quote' }
  }

  return null
}

/**
 * 模拟历史走势（降级方案）
 * 
 * 核心要求：最后一点 = 当前 PROVINCE_PRICES 中的实际价格
 * 前面的点根据随机游走+确定性种子生成，保证同省每次生成的曲线一致
 */
function generateMockHistory(base) {
  const sampleCount = 13
  const now = new Date()
  const history = []

  // 用省份名做确定性种子
  let seed = 0
  for (let i = 0; i < Object.keys(PROVINCE_PRICES).join('').length; i++) {
    seed = (seed * 31 + Object.keys(PROVINCE_PRICES).join('').charCodeAt(i)) & 0x7fffffff
  }
  const seededRandom = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }

  const types = ['92号汽油', '95号汽油', '98号汽油', '0号柴油']

  // 第一步：生成随机波动因子（0~1之间），最后一点强制为1.0
  for (let i = 0; i < sampleCount; i++) {
    const daysBack = (sampleCount - 1 - i) * 14
    const d = new Date(now.getTime() - daysBack * 86400000)
    const dateStr = `${d.getMonth() + 1}/${d.getDate()}`

    const values = {}
    for (const type of types) {
      const baseVal = base[type]
      const dieselFactor = type === '0号柴油' ? 0.8 : 1.0

      if (i === sampleCount - 1) {
        // 最后一点：精确等于当前实际价格
        values[type] = baseVal
      } else {
        // 前面的点：基于当前位置在区间内随机游走
        // 波动范围 ±0.15 元，波动幅度逐渐收窄接近当前值
        const progress = i / (sampleCount - 1) // 0→1
        const maxDrift = 0.15 * dieselFactor
        // 用确定性随机生成偏移，乘以(1-progress)让晚期点更接近基准
        const drift = (seededRandom() - 0.5) * 2 * maxDrift * (1 - progress)
        const noise = (seededRandom() - 0.5) * 0.04 * dieselFactor
        values[type] = parseFloat((baseVal + drift + noise).toFixed(2))
      }
    }

    history.push({ date: dateStr, values })
  }
  return history
}

export async function getProvinceHistory(province) {
  const base = PROVINCE_PRICES[province]
  if (!base) return null

  const cacheKey = `oil:history:${province}`
  const cached = cacheGet(cacheKey)
  if (cached) return cached

  const klines = await fetchOilFuturesKline()

  let result
  if (klines && klines.length >= 2) {
    // 只取最近约 6 个月（~130 个交易日）的 K 线数据
    const RECENT_DAYS = 130
    const recentKlines = klines.length > RECENT_DAYS ? klines.slice(-RECENT_DAYS) : klines

    // 基线 = 近半年的起点，终点 = 最新的 K 线
    const baselineCrude = recentKlines[0].close
    const lastCrude = recentKlines[recentKlines.length - 1].close
    const totalCrudeChange = (lastCrude - baselineCrude) / baselineCrude
    const PASS_THROUGH_RATE = 0.35
    const totalRetailChange = totalCrudeChange * PASS_THROUGH_RATE

    // 当前零售价 ÷ (1 + 总变化率) = 半年前的零售价基线
    const types = ['92号汽油', '95号汽油', '98号汽油', '0号柴油']

    const total = recentKlines.length
    const sampleCount = 13
    const step = Math.max(1, Math.floor(total / sampleCount))

    const history = []
    for (let i = 0; i < total; i += step) {
      const k = recentKlines[i]
      const crudeChange = (k.close - baselineCrude) / baselineCrude
      const retailChange = crudeChange * PASS_THROUGH_RATE

      const d = new Date(k.date)
      const dateStr = `${d.getMonth() + 1}/${d.getDate()}`

      const values = {}
      for (const type of types) {
        const baselinePrice = base[type] / (1 + totalRetailChange)
        values[type] = parseFloat((baselinePrice * (1 + retailChange)).toFixed(2))
      }

      history.push({ date: dateStr, values })
    }

    // 补齐到 sampleCount
    while (history.length < sampleCount) {
      history.push({ ...history[history.length - 1] })
    }
    result = history.slice(-sampleCount)

    // 强制最后一点精确等于当前实际价格
    if (result.length > 0) {
      const lastPoint = result[result.length - 1]
      for (const type of types) {
        lastPoint.values[type] = base[type]
      }
    }
  } else {
    // 降级：外部 API 不可用时，用模拟数据
    console.log(`[油价] 原油K线不可用，为${province}生成模拟历史走势`)
    result = generateMockHistory(base)
  }

  // 计算全局 min/max
  let min = Infinity, max = -Infinity
  result.forEach(pt => {
    Object.values(pt.values).forEach(v => {
      if (v < min) min = v
      if (v > max) max = v
    })
  })

  const output = { history: result, minMax: { min, max } }
  cacheSet(cacheKey, output, 2 * 60 * 60 * 1000)
  return output
}

// ==================== 调价预测 ====================
// 国内油价每 10 个工作日调整一次
const PRICE_ADJUST_DAYS = [
  // 2026 年调价日历（工作日，跳过周末和法定假日）
  // 这里取约每 14 个自然日一个调价窗口
  '2026-01-02', '2026-01-16', '2026-02-06', '2026-02-20',
  '2026-03-06', '2026-03-20', '2026-04-03', '2026-04-17',
  '2026-05-08', '2026-05-22', '2026-06-05', '2026-06-19',
  '2026-07-03', '2026-07-17', '2026-07-31', '2026-08-14',
  '2026-09-04', '2026-09-18', '2026-10-09', '2026-10-23',
  '2026-11-06', '2026-11-20', '2026-12-04', '2026-12-18',
]

/**
 * 获取下次调价窗口及预测
 *
 * 预测逻辑：
 *  1. 获取原油变化率（10日均价与上次调价基准价的偏差百分比）
 *  2. 换算为国内零售价调整幅度：
 *     - 国际原油每变化 1%，国内汽油约调整 0.10~0.13 元/升
 *     - 换算依据：每吨≈1350升，系数≈0.7×7.35×汇率/1350 ≈ 0.12
 *  3. 变化率绝对值 < 0.4% → 搁浅（对应不足50元/吨）
 */
export async function getForecast() {
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)

  // 找下一个调价窗口
  let nextDate = null
  for (let i = 0; i < PRICE_ADJUST_DAYS.length; i++) {
    if (PRICE_ADJUST_DAYS[i] >= todayStr) {
      nextDate = PRICE_ADJUST_DAYS[i]
      break
    }
  }
  if (!nextDate) {
    nextDate = PRICE_ADJUST_DAYS[0].replace('2026', '2027')
  }

  const nextD = new Date(nextDate)
  const daysLeft = Math.max(0, Math.ceil((nextD - today) / (1000 * 60 * 60 * 24)))
  const formatNext = `${nextD.getMonth() + 1}月${nextD.getDate()}日24时`

  // 获取原油变化率
  const rateResult = await getOilChangeRate()
  let direction = 'flat'
  let changeAmount = '搁浅（不足50元/吨）'

  if (rateResult) {
    const { pctChange, source } = rateResult
    const isQuote = source === 'quote'

    // 搁浅阈值：变化率 < 0.4%
    if (Math.abs(pctChange) < 0.4) {
      direction = 'flat'
      changeAmount = '搁浅（不足50元/吨）'
    } else {
      direction = pctChange > 0 ? 'up' : 'down'

      // 换算系数：kline 数据更精确用 0.10~0.13，行情涨跌幅用 0.08~0.11（偏保守）
      const [coLo, coHi] = isQuote ? [0.08, 0.11] : [0.10, 0.13]
      const lo = (Math.abs(pctChange) * coLo).toFixed(2)
      const hi = (Math.abs(pctChange) * coHi).toFixed(2)
      const verb = direction === 'up' ? '预计上调' : '预计下调'
      changeAmount = `${verb} ${lo}~${hi} 元/升`

      console.log(`[油价] 预测完成(source=${source}): 变化率=${pctChange.toFixed(2)}%，${changeAmount}`)
    }

    // 缓存预测结果（1小时有效）
    cacheSet('oil:forecast:last', { formatNext, daysLeft, direction, changeAmount }, 3600000)
  } else {
    // 所有数据源不可用
    console.log('[油价] 所有原油数据源不可用，尝试使用上次缓存')
    const cached = cacheGet('oil:forecast:last')
    if (cached) {
      console.log('[油价] 使用缓存的调价预测')
      return { ...cached, daysLeft, nextDate: formatNext }
    }

    console.log('[油价] 无可用数据，返回空预测')
    direction = 'unknown'
    changeAmount = '实时数据暂不可用，请稍后刷新'
  }

  return { nextDate: formatNext, daysLeft, direction, changeAmount }
}
