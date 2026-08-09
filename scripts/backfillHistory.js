/**
 * 国家队监测 — 历史数据补录脚本
 * ------------------------------------------------------------
 * 用途：用新浪历史K线接口补录过去N天的ETF日线数据
 * 运行方式：node scripts/backfillHistory.js [days]
 *
 * 新浪API返回字段: day, open, high, low, close, volume(股)
 * 成交额按 volume × close 估算
 * 份额数据(share_change/total_shares)历史接口无法获取，设为null
 */
import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import https from 'https'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'app.db')

const ETF_LIST = [
  { code: '510300', name: '沪深300ETF',  symbol: 'sh510300' },
  { code: '510050', name: '上证50ETF',   symbol: 'sh510050' },
  { code: '510500', name: '中证500ETF',  symbol: 'sh510500' },
  { code: '512100', name: '中证1000ETF', symbol: 'sh512100' },
  { code: '588000', name: '科创50ETF',   symbol: 'sh588000' },
  { code: '563000', name: '中证A500ETF', symbol: 'sh563000' }
]

// ============= HTTP =============
function httpGet(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      timeout: options.timeout || 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
        ...(options.headers || {})
      }
    }, (res) => {
      let data = ''
      res.on('data', chunk => data += chunk)
      res.on('end', () => resolve(data))
    })
    req.on('error', reject)
    req.on('timeout', () => { req.destroy(); reject(new Error('超时')) })
  })
}

// ============= 新浪历史K线 =============
/**
 * 获取单只ETF的日K线历史数据
 * @param {string} symbol - 如 sh510300
 * @param {number} count - 要获取的天数
 */
async function fetchHistoryKline(symbol, count) {
  const url = `https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/CN_MarketData.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${count}`
  console.log(`  [${symbol}] 请求历史K线，目标 ${count} 天...`)

  const raw = await httpGet(url, { timeout: 15000 })
  let klines
  try {
    klines = JSON.parse(raw)
  } catch {
    console.warn(`  [${symbol}] 返回数据无法解析: ${raw.slice(0, 200)}`)
    return []
  }

  if (!Array.isArray(klines) || klines.length === 0) {
    console.warn(`  [${symbol}] 无历史数据返回`)
    return []
  }

  const rows = []
  for (const k of klines) {
    const close = parseFloat(k.close) || null
    const volume = parseFloat(k.volume) || null
    rows.push({
      date: k.day,
      open: parseFloat(k.open) || null,
      close,
      high: parseFloat(k.high) || null,
      low: parseFloat(k.low) || null,
      volume,
      amount: (close && volume) ? close * volume : null
    })
  }

  console.log(`  [${symbol}] 获取到 ${rows.length} 条历史记录`)
  return rows
}

// ============= 主流程 =============
async function main() {
  const days = parseInt(process.argv[2]) || 90
  console.log(`\n📊 国家队监测 — 历史数据补录脚本`)
  console.log(`目标：补录过去 ${days} 天的 6 只 ETF 日线数据\n`)

  // 加载数据库
  const SQL = await initSqlJs()
  if (!fs.existsSync(DB_PATH)) {
    console.error('❌ 数据库不存在: ' + DB_PATH)
    process.exit(1)
  }
  const buf = fs.readFileSync(DB_PATH)
  const db = new SQL.Database(buf)
  console.log(`✅ 已加载数据库 (${buf.length} bytes)\n`)

  let totalInserted = 0
  let totalSkipped = 0
  const failedList = []

  for (const etf of ETF_LIST) {
    console.log(`--- ${etf.code} ${etf.name} ---`)

    try {
      const klines = await fetchHistoryKline(etf.symbol, days)
      if (klines.length === 0) {
        failedList.push(`${etf.code} ${etf.name}: 无数据`)
        continue
      }

      // 检查已存在的日期
      const result = db.exec('SELECT date FROM nt_etf_daily WHERE code = ?', [etf.code])
      const existingDates = new Set(result[0]?.values.map(v => v[0]) || [])

      let inserted = 0
      let skipped = 0

      db.run('BEGIN')
      try {
        for (const k of klines) {
          if (existingDates.has(k.date)) {
            skipped++
            continue
          }

          db.run(`
            INSERT INTO nt_etf_daily
              (date, code, name, close_price, open_price, high_price, low_price,
               volume, amount, total_shares, total_nav, share_change, share_change_pct, data_source)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
          `, [
            k.date, etf.code, etf.name,
            k.close, k.open, k.high, k.low,
            k.volume, k.amount,
            null, null, null, null,
            'sina_history'
          ])
          inserted++
        }
        db.run('COMMIT')
      } catch (err) {
        db.run('ROLLBACK')
        throw err
      }

      totalInserted += inserted
      totalSkipped += skipped
      console.log(`  新增 ${inserted} 条，跳过 ${skipped} 条（已存在）`)

      // 每只ETF之间休息0.3秒
      await new Promise(r => setTimeout(r, 300))
    } catch (err) {
      console.error(`  ❌ ${etf.code} 失败: ${err.message}`)
      failedList.push(`${etf.code} ${etf.name}: ${err.message}`)
    }
  }

  // 保存数据库
  const data = db.export()
  fs.writeFileSync(DB_PATH, Buffer.from(data))
  db.close()

  console.log(`\n✅ 补录完成！新增 ${totalInserted} 条，跳过 ${totalSkipped} 条（已存在）`)

  if (failedList.length > 0) {
    console.log(`\n⚠️  以下ETF失败：`)
    failedList.forEach(f => console.log(`   - ${f}`))
  }

  console.log(`\n数据库: ${DB_PATH}`)
  console.log(`\n⚠️  历史数据不含份额（share_change/total_shares），信号计算依赖份额字段。`)
  console.log(`   今晚 23:30 cron 自动采集时会将份额数据补上。`)
  console.log(`   目前图表已可显示多日价格线和成交额趋势。\n`)
}

main().catch(err => {
  console.error('❌ 脚本执行失败:', err.message)
  process.exit(1)
})
