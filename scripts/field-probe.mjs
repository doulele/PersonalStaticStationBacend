// 字段探测脚本 v4
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0', Referer: 'https://quote.eastmoney.com/' }
const H2 = { ...H, Referer: 'https://emweb.securities.eastmoney.com/' }
async function get(url, h = H) { const r = await fetch(url, { headers: h }); return r.json() }
const sleep = ms => new Promise(r => setTimeout(r, ms))

// 1. RESPREDICT 用 SECUCODE filter
try {
  const u = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_WEB_RESPREDICT&columns=ALL&filter=${encodeURIComponent('(SECUCODE="600519.SH")')}&pageSize=2&sortColumns=PREDICT_YEAR&sortTypes=-1&source=WEB&client=WEB`
  const j = await get(u)
  const row = j.result?.data?.[0]
  console.log('=== RESPREDICT(SECUCODE) === success:' + j.success + ' msg:' + (j.message || ''))
  if (row) console.log('keys:', Object.keys(row).join(','), '\nEPS1:', row.EPS1, 'EPS2:', row.EPS2, 'RATING_BUY_NUM:', row.RATING_BUY_NUM, 'AIMPRICEMAX:', row.DEC_AIMPRICEMAX)
  else console.log('NO DATA')
} catch (e) { console.log('predict ERR', e.message) }
await sleep(1500)

// 2. zcfzbAjaxNew dates 空
try {
  const g = await get('https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/zcfzbAjaxNew?companyType=4&reportDateType=0&reportType=1&dates=&code=SZ300015', H2)
  const first = g?.data?.[0] || {}
  console.log('=== zcfzb dates空 === rows:' + g?.data?.length + ' REPORT_DATE:' + first.REPORT_DATE + ' GOODWILL:' + first.GOODWILL)
} catch (e) { console.log('zcfzb ERR', e.message) }
await sleep(1500)

// 3. LHB 带 filter 的 keys
try {
  const u = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_BILLBOARD_DAILYDETAILS&columns=ALL&filter=${encodeURIComponent('(SECURITY_CODE="600519")')}&pageSize=1&source=WEB&client=WEB`
  const j = await get(u)
  const row = j.result?.data?.[0]
  console.log('=== LHB keys === success:' + j.success)
  if (row) {
    console.log('keys:', Object.keys(row).join(','))
    const k = Object.keys(row).find(k => /NET|AMT|BUY|SELL/.test(k))
    console.log('净额相关键:', k, '=', row[k])
  }
} catch (e) { console.log('lhb ERR', e.message) }
