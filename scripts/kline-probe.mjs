/** 临时脚本：探测腾讯K线接口可用性 v2（验证完删除） */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36'
const variants = [
  ['A 默认UA无Referer', 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,,,120,qfq', {}],
  ['B curlUA', 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,,,120,qfq', { 'User-Agent': 'curl/8.4.0' }],
  ['C 手机UA', 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,,,120,qfq', { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile' }],
  ['D 无web前缀', 'https://ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,,,120,qfq', { 'User-Agent': UA, Referer: 'https://gu.qq.com/' }],
  ['E proxy.finance.qq.com', 'https://proxy.finance.qq.com/ifzqgtimg/appstock/app/fqkline/get?param=sh600519,day,,,120,qfq', { 'User-Agent': UA }],
  ['F 带token变体', 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh600519,day,,,320,qfq&_var=kline_dayqfq', { 'User-Agent': UA, Referer: 'https://gu.qq.com/', Accept: '*/*' }],
]
for (const [name, url, h] of variants) {
  try {
    const res = await fetch(url, { headers: { ...h } })
    const text = await res.text()
    if (text.trim().startsWith('<')) {
      console.log(`${name}: HTML (len=${text.length}) ${text.slice(0, 80).replace(/\s+/g, ' ')}`)
    } else {
      const j = JSON.parse(text)
      const d = j?.data?.['sh600519']
      const arr = d?.qfqday || d?.day || []
      console.log(`${name}: OK code=${j.code} bars=${arr.length} last=${JSON.stringify(arr[arr.length - 1])}`)
    }
  } catch (e) {
    console.log(`${name}: FAIL ${e.message}`)
  }
}
