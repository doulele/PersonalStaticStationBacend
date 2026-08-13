/** 临时脚本：验证评分分布 + 详情（验证完删除） */
const t0 = Date.now()
const res = await fetch('http://localhost:3001/stock-recommend/list?horizon=short&page=1&pageSize=100')
const j = await res.json()
console.log(`list elapsed=${((Date.now() - t0) / 1000).toFixed(1)}s total=${j.data?.total} list=${j.data?.list?.length}`)
const list = j.data?.list || []
const hasScore = list.filter(x => typeof x.score === 'number')
const ge80 = hasScore.filter(x => x.score >= 80).length
const ge60 = hasScore.filter(x => x.score >= 60 && x.score < 80).length
const lt60 = hasScore.filter(x => x.score < 60).length
console.log(`dist: >=80:${ge80} 60-79:${ge60} <60:${lt60} (n=${hasScore.length})`)
if (hasScore.length) {
  console.log('range:', Math.min(...hasScore.map(x => x.score)), '-', Math.max(...hasScore.map(x => x.score)))
  const conc = {}
  hasScore.forEach(x => { conc[x.conclusion] = (conc[x.conclusion] || 0) + 1 })
  console.log('conclusions:', JSON.stringify(conc))
  console.log('top3:', hasScore.slice(0, 3).map(x => `${x.code} ${x.name} ${x.score}★${x.star} ${x.conclusion} [${x.reasonShort}]`).join(' | '))
}

// 详情验证（K线域名修复）
const d0 = Date.now()
const dr = await fetch('http://localhost:3001/stock-recommend/detail/600519?horizon=short')
const dj = await dr.json()
if (dj.code === 0) {
  const d = dj.data
  console.log(`\ndetail elapsed=${((Date.now() - d0) / 1000).toFixed(1)}s ${d.basic.name}: total=${d.total} star=${d.star} ${d.conclusion} risk=${d.riskLevel}`)
  console.log('dimScores:', JSON.stringify(d.dimScores))
  console.log('kline bars:', d.kline?.length)
  const techItems = d.details?.find(x => x.key === 'technical')?.subItems
  console.log('tech items:', techItems?.length)
  if (techItems) console.log('  ', techItems.slice(0, 4).map(i => `${i.name}:${i.score}`).join(' | '))
} else {
  console.log('detail ERROR:', dj.message)
}
