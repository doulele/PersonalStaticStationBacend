/**
 * 全量历史数据爬取脚本
 * 一次性爬取双色球 + 大乐透全量数据，保存到 cache/ 目录
 *
 * 用法: node scripts/crawlFullHistory.js
 */
import { crawlFrom500, writeCache, readCache, mergeData, getCacheStats } from '../services/lotteryCrawler.js'

async function main() {
  console.log('========================================')
  console.log('  彩票全量历史数据爬取脚本')
  console.log('  数据来源: datachart.500.com')
  console.log('========================================\n')

  const types = [
    { key: 'ssq', name: '双色球 (SSQ)' },
    { key: 'dlt', name: '大乐透 (DLT)' }
  ]

  for (const { key, name } of types) {
    console.log(`\n--- 开始爬取: ${name} ---`)

    try {
      const data = await crawlFrom500(key)

      if (data.length === 0) {
        console.error(`[ERROR] ${name} 未爬取到任何数据！`)
        continue
      }

      // 写入缓存
      writeCache(key, data)

      // 验证
      const cached = readCache(key)
      console.log(`\n[完成] ${name}:`)
      console.log(`  - 总期数: ${cached.length}`)
      console.log(`  - 日期范围: ${cached[0]?.date} ~ ${cached[cached.length - 1]?.date}`)
      console.log(`  - 文件: cache/${key}_full.json`)

      // 打印前3期和后3期作为验证
      console.log(`  - 前3期样本:`)
      cached.slice(0, 3).forEach((d, i) => {
        if (key === 'ssq') {
          console.log(`    ${d.date} | 红: ${d.reds?.join(',')} | 蓝: ${d.blue}`)
        } else {
          console.log(`    ${d.date} | 前: ${d.reds?.join(',')} | 后: ${d.blues?.join(',')}`)
        }
      })

    } catch (err) {
      console.error(`[ERROR] ${name} 爬取失败:`, err.message)
    }

    // 两个请求之间延迟，避免被封
    if (key === 'ssq') {
      console.log('\n等待 3 秒后爬取下一个...')
      await new Promise(resolve => setTimeout(resolve, 3000))
    }
  }

  // 最终统计
  console.log('\n========================================')
  console.log('  爬取完成! 当前缓存统计:')
  const stats = getCacheStats()
  for (const [type, s] of Object.entries(stats)) {
    const name = type === 'ssq' ? '双色球' : '大乐透'
    console.log(`  ${name}: ${s.count} 期 (${s.firstDate} ~ ${s.lastDate})`)
  }
  console.log('========================================\n')
}

main().catch(err => {
  console.error('脚本执行失败:', err)
  process.exit(1)
})
