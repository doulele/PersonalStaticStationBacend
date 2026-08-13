/** 临时脚本：探测 clist 分页限流规律 v3（验证完删除） */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
const H = { 'User-Agent': UA, Referer: 'https://quote.eastmoney.com/' }
const FS = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
const FIELDS = 'f2,f3,f8,f9,f10,f12,f13,f14,f20,f21,f23,f24,f25,f100,f114,f115,f183,f133,f135'

async function probe(name, url, headers = H, delay = 0, jsonp = false) {
  if (delay) await new Promise(r => setTimeout(r, delay))
  try {
    const c = new AbortController()
    const t = setTimeout(() => c.abort(), 15000)
    const res = await fetch(url, { headers, signal: c.signal })
    clearTimeout(t)
    const text = await res.text()
    const j = jsonp ? JSON.parse(text.slice(text.indexOf('(') + 1, text.lastIndexOf(')'))) : JSON.parse(text)
    const n = j?.data?.diff?.length ?? 0
    console.log(`${name}: total=${j?.data?.total} diff=${n} rc=${j?.data?.rc ?? '-'}`)
  } catch (e) {
    console.log(`${name}: FAIL ${e.message}`)
  }
}

const base = (pz, extra = '') => `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=${pz}&po=0&np=1&fltt=2&invt=2&fid=f12&fs=${FS}&fields=${FIELDS}${extra}`

const run = async () => {
  // 1. JSONP 真实条数
  await probe('A JSONP cb=x pz=500', base(500, '&cb=jsonpCallback'), H, 300, true)
  // 2. 数字前缀节点
  await probe('B 82.push2   pz=500', base(500).replace('https://push2.eastmoney.com', 'https://82.push2.eastmoney.com'), H, 300)
  await probe('C 16.push2   pz=500', base(500).replace('https://push2.eastmoney.com', 'https://16.push2.eastmoney.com'), H, 300)
  // 3. HTTP/1.1（curl 默认 h1，node fetch 默认 h2 → 模拟 curl）
  await probe('D h1 push2   pz=500', base(500), H, 300)
  // 4. 再试 curl 原生（看是否冷却）
  await probe('E 冷却重试   pz=500', base(500), H, 300)
}
run()
