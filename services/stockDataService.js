/**
 * 股票测评 — 数据采集层
 * ------------------------------------------------------------
 * 数据源：
 *   1. 东方财富 push2 clist     全市场行情+估值快照（一次拉全市场，缓存60s）
 *   2. 东方财富 datacenter F10  财务主要指标/利润表（按代码缓存当日）
 *   3. 东方财富 emweb F10       资产负债表-商誉（按代码缓存当日，仅详情页使用）
 *   4. 腾讯 ifzq fqkline        历史K线（技术面/风险指标计算，盘中缓存10min、非交易30min）
 *   5. 东方财富 datacenter      融资融券/机构调研/龙虎榜（增强数据，缓存当日）
 *
 * 注意：datacenter 接口有并发限流，所有请求均带重试，并控制并发数。
 */
import { cacheGet, cacheSet } from './cacheService.js'

const EASTMONEY_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  Referer: 'https://quote.eastmoney.com/'
}
const EMWEB_HEADERS = {
  ...EASTMONEY_HEADERS,
  Referer: 'https://emweb.securities.eastmoney.com/'
}
const TENXUN_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36',
  Referer: 'https://gu.qq.com/'
}

/** 沪深A股（主板+创业板+科创板，剔除北交所） */
const MARKET_FS = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
/** clist 行情字段：价格/涨跌幅/换手/量比/PE动/代码/市场/名称/总市值/流通市值/PB/60日涨跌/年初至今/行业/PE(TTM)/PE静/ROE加权/股息率/总资产 */
const CLIST_FIELDS = 'f2,f3,f8,f9,f10,f12,f13,f14,f20,f21,f23,f24,f25,f100,f114,f115,f183,f133,f135'

const CLIST_BASE = 'https://push2delay.eastmoney.com/api/qt/clist/get'
const DC_BASE = 'https://datacenter-web.eastmoney.com/api/data/v1/get'

// ==================== 基础工具 ====================

/** GET JSON（带超时+重试，应对 datacenter 限流；支持外部取消信号 signal，客户端断开时可中止请求链） */
async function getJsonWithRetry(url, headers = EASTMONEY_HEADERS, retries = 2, timeout = 12000, signal) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeout)
    const onAbort = () => controller.abort()
    if (signal) signal.addEventListener('abort', onAbort, { once: true })
    try {
      const res = await fetch(url, { headers, signal: controller.signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = await res.json()
      if (j && j.success === false && j.message !== 'ok') throw new Error(`EM ${j.message}`)
      return j
    } catch (e) {
      lastErr = e
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      if (i < retries) await new Promise(r => setTimeout(r, 600 * (i + 1)))
    } finally {
      clearTimeout(timer)
      if (signal) signal.removeEventListener('abort', onAbort)
    }
  }
  throw lastErr || new Error('fetch failed')
}

/** 并发控制：同时最多 limit 个任务，单个失败不影响整体；支持外部取消信号 signal（中断后剩余任务不再发起） */
export async function pMap(items, limit, fn, signal) {
  const results = new Array(items.length)
  let idx = 0
  let aborted = false
  const onAbort = () => { aborted = true }
  if (signal) {
    if (signal.aborted) aborted = true
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    async function worker() {
      while (idx < items.length && !aborted) {
        const i = idx++
        try { results[i] = await fn(items[i], i, signal) } catch (e) {
          if (signal?.aborted || aborted) throw new DOMException('Aborted', 'AbortError')
          results[i] = undefined
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, worker))
  } finally {
    if (signal) signal.removeEventListener('abort', onAbort)
  }
  return results
}

/** 东财 "-"/空值 → null，数字字符串 → Number */
const toNum = v => (v === '-' || v === '' || v === null || v === undefined) ? null : Number(v)

/** 当日剩余毫秒（财务/增强数据缓存到当天结束） */
function msUntilMidnight() {
  const now = new Date()
  const mid = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return mid - now
}

/** 代码 → 东财 SECUCODE（600519 → 600519.SH） */
export function secucodeOf(code) {
  const c = String(code)
  const mkt = /^(6|9)/.test(c) ? 'SH' : /^(0|2|3)/.test(c) ? 'SZ' : ''
  return mkt ? `${c}.${mkt}` : ''
}

/** 代码 → 腾讯市场前缀（600519 → sh600519） */
export function tencentSymbol(code) {
  const c = String(code)
  const mk = /^(6|9)/.test(c) ? 'sh' : /^(0|2|3)/.test(c) ? 'sz' : ''
  return mk ? `${mk}${c}` : ''
}

/** 是否 ST / 退市整理 */
export function isSt(name = '') {
  return /ST|退/.test(name)
}

// ==================== 1. 全市场行情快照 ====================

function normalizeStock(d) {
  return {
    code: String(d.f12),
    name: d.f14 || '',
    market: String(d.f13 || ''),
    price: toNum(d.f2),
    changePct: toNum(d.f3),
    turnoverRate: toNum(d.f8),          // 换手率 %
    volumeRatio: toNum(d.f10),          // 量比
    peDyn: toNum(d.f9),                 // 市盈率(动)
    peTtm: toNum(d.f114),               // 市盈率(TTM)
    peStatic: toNum(d.f115),            // 市盈率(静)
    pb: toNum(d.f23),                   // 市净率
    marketCap: toNum(d.f20),            // 总市值（元）
    floatMarketCap: toNum(d.f21),       // 流通市值（元）
    chg60d: toNum(d.f24),               // 60日涨跌幅 %
    chgYtd: toNum(d.f25),               // 年初至今涨跌幅 %
    industry: d.f100 === '-' || d.f100 === '' ? null : d.f100, // 东财行业
    roe: toNum(d.f183),                 // ROE加权 %
    dividendYield: toNum(d.f133),       // 股息率 %
    totalAssets: toNum(d.f135),         // 总资产（元）
    isSt: isSt(d.f14)
  }
}

/**
 * 判断当前是否处于 A 股交易时段（9:30-11:30, 13:00-15:00，周一至周五）
 * 用于智能缓存 TTL：交易时段行情持续变化用短缓存，非交易时段数据不变用长缓存。
 */
export function isTradingTime(now = new Date()) {
  const day = now.getDay()
  if (day === 0 || day === 6) return false // 周末
  const h = now.getHours()
  const m = now.getMinutes()
  const t = h * 60 + m
  return (t >= 9 * 60 + 30 && t <= 11 * 60 + 30) || (t >= 13 * 60 && t <= 15 * 60)
}

/**
 * 行情快照智能缓存时长：
 *   - 交易时段：2 分钟（盘中实时，价格持续变动）
 *   - 非交易时段：60 分钟（收盘后价格不变，拉一次足够，避免无谓重建）
 * 准确性无损：非交易时段数据本身不变化，长缓存不会产生"过期错误"。
 */
function marketTtlMs() {
  return isTradingTime() ? 2 * 60_000 : 60 * 60_000
}

/**
 * 拉取全市场行情快照（分页拉取，串行，智能缓存）
 * 注意：东财对单页 pz 有上限裁剪（实测当前 IP 最多 100 条/页），
 * 因此先用第一页探测实际 pageSize，再按 ceil(total/pageSize) 动态分页，保证拿满全市场。
 * 带完整性校验：拉到不足 total 的 90% 时整体重试一次；仍不足则不缓存（避免残缺数据被复用）。
 * @returns {Array} 标准化后的股票数组
 */
// 快照单飞锁：多个接口（list/industries/industry-ranking）共享同一快照，
// 避免冷启动时并发重复拉取 56 页行情，打爆数据源。
let snapshotInflight = null

export async function getMarketSnapshot() {
  const cached = cacheGet('stockrec:market')
  if (cached) return cached

  if (snapshotInflight) return snapshotInflight

  snapshotInflight = _fetchMarketSnapshot().finally(() => { snapshotInflight = null })
  return snapshotInflight
}

async function _fetchMarketSnapshot() {
  const fetchAll = async () => {
    const url = pn => `${CLIST_BASE}?pn=${pn}&pz=500&po=0&np=1&fltt=2&invt=2&fid=f12&fs=${MARKET_FS}&fields=${CLIST_FIELDS}`
    const first = await getJsonWithRetry(url(1), EASTMONEY_HEADERS, 3)
    const total = first?.data?.total || 0
    // 探测东财实际返回的每页条数（可能被裁剪到 100），动态决定页数
    const pageSize = first?.data?.diff?.length || 100
    const pages = Math.max(1, Math.ceil(total / pageSize))
    // 并发 3 页（东财对 clist 单页裁剪较宽松，3 并发不会触发限流），显著缩短快照耗时
    const others = await pMap(Array.from({ length: pages - 1 }, (_, i) => i + 2), 3, async pn => {
      const j = await getJsonWithRetry(url(pn), EASTMONEY_HEADERS, 3)
      return j
    })
    const diff = [first, ...others].flatMap(j => j?.data?.diff || [])
    const stocks = diff.map(normalizeStock).filter(s => s.code && s.price > 0)
    return { stocks, total }
  }

  let { stocks, total } = await fetchAll()
  if (total > 0 && stocks.length < total * 0.9) {
    console.warn(`[stockData] 快照不完整 ${stocks.length}/${total}，重试...`)
    await new Promise(r => setTimeout(r, 1500))
    ;({ stocks, total } = await fetchAll())
  }
  if (total > 0 && stocks.length < total * 0.9) {
    console.warn(`[stockData] 快照仍不完整 ${stocks.length}/${total}，本次不缓存`)
    return stocks
  }
  cacheSet('stockrec:market', stocks, marketTtlMs())
  return stocks
}

// ==================== 2. F10 财务数据 ====================

function dcUrl(reportName, filter, sortColumn, pageSize, source = 'HSF10', client = 'PC') {
  const sort = sortColumn ? `&sortColumns=${sortColumn}&sortTypes=-1` : ''
  return `${DC_BASE}?reportName=${reportName}&columns=ALL&filter=${encodeURIComponent(filter)}&pageSize=${pageSize}${sort}&source=${source}&client=${client}`
}

/** 从报告期推导最近年报日（2026-03-31 → 2025-12-31；2026-12-31 → 2026-12-31） */
function nearestAnnualDate(reportDateStr) {
  const m = String(reportDateStr || '').match(/(\d{4})-(\d{2})/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  return month >= 12 ? `${year}-12-31` : `${year - 1}-12-31`
}

/**
 * 获取单只股票的财务数据
 * @param {string} code 股票代码
 * @param {{goodwill?: boolean}} [opts] goodwill=true 时额外获取商誉（详情页使用）
 * @returns {{mainRows:Array, incomeRows:Array, goodwill:number|null, reportDate:string|null}}
 */
export async function getFinData(code, opts = {}, signal) {
  const key = 'stockrec:fin:' + code
  const cached = cacheGet(key)
  if (cached) return cached

  const sc = secucodeOf(code)
  if (!sc) return null
  try {
    // main + income 并行拉取；商誉用「最近年报日」独立并发，不再串行等待 main 返回，
    // 将 F10 整条链路从 3 段串行压缩为 2 段并行，冷启动显著提速。
    const annual = nearestAnnualDate(new Date().toISOString().slice(0, 10))
    const [main, income, bal] = await Promise.all([
      getJsonWithRetry(dcUrl('RPT_F10_FINANCE_MAINFINADATA', `(SECUCODE="${sc}")`, 'REPORT_DATE', 8), EMWEB_HEADERS, 2, 12000, signal),
      getJsonWithRetry(dcUrl('RPT_F10_FINANCE_GINCOME', `(SECUCODE="${sc}")`, 'REPORT_DATE', 5), EMWEB_HEADERS, 2, 12000, signal),
      opts.goodwill && annual
        ? getJsonWithRetry(
            `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/zcfzbAjaxNew?companyType=4&reportDateType=0&reportType=1&dates=${annual}&code=${sc.replace('.', '')}`,
            EMWEB_HEADERS, 1, 12000, signal
          ).catch(() => null)
        : Promise.resolve(null)
    ])
    const mainRows = main?.result?.data || []
    const goodwill = bal?.data?.[0]?.GOODWILL ?? null
    const fin = {
      mainRows,
      incomeRows: income?.result?.data || [],
      goodwill,
      reportDate: mainRows[0]?.REPORT_DATE || null
    }
    cacheSet(key, fin, msUntilMidnight())
    return fin
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    return null
  }
}

// ==================== 3. K线数据 ====================

/**
 * 获取前复权日K线（缓存：盘中 10 分钟，非交易 30 分钟）
 * 技术指标（均线/MACD/波动率）对 10 分钟粒度完全不敏感，
 * 放宽盘中缓存可显著减少池子重建时对腾讯源的重复拉取压力。
 * @returns {Array<{date,open,close,high,low,volume}>}
 */
export async function getKline(code, days = 320, signal) {
  const key = 'stockrec:kline:' + code
  const cached = cacheGet(key)
  if (cached) return cached

  const sym = tencentSymbol(code)
  if (!sym) return []
  try {
    const j = await getJsonWithRetry(`https://ifzq.gtimg.cn/appstock/app/fqkline/get?param=${sym},day,,,${days},qfq`, TENXUN_HEADERS, 1, 12000, signal)
    const data = j?.data?.[sym]
    const rows = data?.qfqday || data?.day || []
    const k = rows
      .map(r => ({
        date: r[0],
        open: Number(r[1]),
        close: Number(r[2]),
        high: Number(r[3]),
        low: Number(r[4]),
        volume: Array.isArray(r[5]) ? Number(r[5][0]) : Number(r[5])
      }))
      .filter(x => x.close > 0)
    cacheSet(key, k, isTradingTime() ? 10 * 60_000 : 30 * 60_000)
    return k
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    return []
  }
}

// ==================== 4. 增强数据（详情页用） ====================

/**
 * 获取增强数据：融资融券 / 机构调研 / 龙虎榜（分析师预测接口已停用）
 * 全部尽力而为，失败返回 null/空数组
 * @returns {{margin:object|null, surveys:Array, lhb:Array}}
 */
export async function getEnhanceData(code, signal) {
  const key = 'stockrec:enh:' + code
  const cached = cacheGet(key)
  if (cached) return cached

  const sc = secucodeOf(code)
  const out = { margin: null, surveys: [], lhb: [] }
  if (!sc) return out

  const tasks = [
    ['margin', () => getJsonWithRetry(dcUrl('RPTA_WEB_RZRQ_GGMX', `(SCODE="${code}")`, 'DATE', 6, 'WEB', 'WEB'), EASTMONEY_HEADERS, 1, 6000, signal)],
    ['surveys', () => getJsonWithRetry(dcUrl('RPT_ORG_SURVEYNEW', `(SECURITY_CODE="${code}")`, 'RECEIVE_END_DATE', 5, 'WEB', 'WEB'), EASTMONEY_HEADERS, 1, 6000, signal)],
    ['lhb', () => getJsonWithRetry(dcUrl('RPT_BILLBOARD_DAILYDETAILS', `(SECURITY_CODE="${code}")`, '', 3, 'WEB', 'WEB'), EASTMONEY_HEADERS, 1, 6000, signal)]
  ]
  await Promise.allSettled(tasks.map(async ([k, fn]) => {
    try {
      const j = await fn()
      const rows = j?.result?.data
      if (Array.isArray(rows) && rows.length) {
        if (k === 'margin') out.margin = rows
        else out[k] = rows
      }
    } catch { /* 忽略单个数据源失败 */ }
  }))

  cacheSet(key, out, msUntilMidnight())
  return out
}

export default { getMarketSnapshot, getFinData, getKline, getEnhanceData, pMap, secucodeOf, isSt }
