// 搜索逻辑排查
import { getMarketSnapshot } from '../services/stockDataService.js'
const market = await getMarketSnapshot()
console.log('total:', market.length)
console.log('name含茅台:', market.filter(s => s.name && s.name.includes('茅台')).map(s => s.code + ' ' + s.name))
console.log('code含6005:', market.filter(s => s.code.includes('6005')).slice(0, 5).map(s => s.code + ' ' + s.name))
console.log('样例:', JSON.stringify(market[0]))
console.log('样例2:', JSON.stringify(market.find(s => s.code === '600519')))
