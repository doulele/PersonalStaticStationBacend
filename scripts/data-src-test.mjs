// 临时数据源验证脚本 v5（验证完删除）
const headers = { Referer: 'https://emweb.securities.eastmoney.com/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0' }
async function get(url, h = headers) { const r = await fetch(url, { headers: h }); return r.json() }
const show = (t, o) => console.log('=== ' + t + ' ===\n' + JSON.stringify(o, null, 1) + '\n')

// 1. datacenter F10 主要指标报表
try {
  const j = await get('https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_MAINFINADATA&columns=ALL&filter=(SECUCODE%3D%22600519.SH%22)&pageSize=4&sortColumns=REPORT_DATE&sortTypes=-1&source=HSF10&client=PC')
  const rows = j.result?.data || []
  const latest = rows[0] || {}
  console.log('=== F10主要指标(datacenter) rows:' + rows.length + ' ===')
  const keys = ['REPORT_DATE','EPSJB','ROEJQ','ROEKCJQ','ROEZQ','YYZSR','YYZSRTBZZ','YYZSRQJZZ','YYLRTBZZ','YYLRQJZZ','SJLR','SJLRTBZZ','SJLRQJZZ','XSMLL','XSJLL','MGJYXJJE','JYXJLYYSR','ZCFZL','MGZBGJ']
  const out = {}
  keys.forEach(k => out[k] = latest[k])
  show('茅台主要指标', out)
} catch (e) { console.log('MAINFINA ERR', e.message) }

// 2. F10 利润表（单季）
try {
  const j = await get('https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_FINANCE_GINCOME&columns=ALL&filter=(SECUCODE%3D%22600519.SH%22)&pageSize=3&sortColumns=REPORT_DATE&sortTypes=-1&source=HSF10&client=PC')
  const rows = j.result?.data || []
  const latest = rows[0] || {}
  console.log('=== F10利润表 rows:' + rows.length + ' 期:' + latest.REPORT_DATE + ' ===')
  const keys = ['REPORT_DATE','TOTAL_OPERATE_INCOME','OPERATE_INCOME','OPERATE_PROFIT','TOTAL_PROFIT','NETPROFIT','PARENT_NETPROFIT','DEDUCT_PARENT_NETPROFIT','OPERATE_COST','SALE_EXPENSE','ADMIN_EXPENSE','FINANCE_EXPENSE','ASSET_IMPAIRMENT_LOSS','TOTAL_OPERATE_COST']
  const out = {}
  keys.forEach(k => out[k] = latest[k])
  show('茅台利润表', out)
} catch (e) { console.log('GINCOME ERR', e.message) }

// 3. 资金流 push2delay 变体 + 腾讯
try {
  const a = await get('https://push2delay.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=0&klt=101&secid=1.600519&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65')
  console.log('=== 资金流 push2delay ===')
  console.log(JSON.stringify(a.data ? a.data.klines?.slice(-2) : a, null, 1))
} catch (e) { console.log('fflow3 ERR', e.message) }
try {
  const b = await get('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&invt=2&secids=1.600519&fields=f62,f184,f66,f69,f72,f75,f78,f81,f84,f87')
  console.log('=== ulist 资金字段 ===')
  console.log(JSON.stringify(b.data?.diff?.[0] || b, null, 1))
} catch (e) { console.log('fflow4 ERR', e.message) }

// 4. 北向持股报表（换参数再试）
try {
  const j = await get('https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_MUTUAL_STOCK_NORTHSTA&columns=ALL&pageSize=1&source=WEB&client=WEB&sortColumns=TRADE_DATE&sortTypes=-1&filter=(MUTUAL_TYPE%3D%22001%22)')
  console.log('=== 北向 ===')
  console.log('success:' + j.success + ' msg:' + j.message, j.result?.data?.[0] ? 'keys:' + Object.keys(j.result.data[0]).slice(0, 25).join(',') : '')
} catch (e) { console.log('north2 ERR', e.message) }
