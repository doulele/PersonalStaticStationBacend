/**
 * 清理所有家庭空间数据脚本
 * 运行: node scripts/cleanupFamilyData.js
 *
 * 清理范围:
 *   - family_meeting_state     家庭会议全量状态
 *   - family_meeting_memberships 家庭成员关系
 *   - wish_families            愿望清单家庭空间
 *   - wish_family_members      愿望清单家庭成员
 *   - wishes                   愿望
 *   - wish_checkins            愿望打卡
 *   - moods                    树洞/情绪
 *   - pats                     拍一拍
 *   - notifications            通知
 *
 * 保留: users, user_plans, user_preferences, tool_clicks 等其他非家庭空间数据
 */

import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.join(__dirname, '..', 'data', 'app.db')

const TABLES_TO_CLEAN = [
  'family_meeting_state',
  'family_meeting_memberships',
  'wish_families',
  'wish_family_members',
  'wishes',
  'wish_checkins',
  'moods',
  'pats',
  'notifications'
]

async function main() {
  console.log('========================================')
  console.log('  清理家庭空间数据')
  console.log('========================================\n')

  // 1. 检查数据库文件是否存在
  if (!fs.existsSync(DB_PATH)) {
    console.log(`[INFO] 数据库文件不存在: ${DB_PATH}`)
    console.log('[INFO] 无需清理，数据库尚未创建')
    process.exit(0)
  }

  // 2. 备份数据库
  const backupPath = DB_PATH + '.backup.' + Date.now()
  fs.copyFileSync(DB_PATH, backupPath)
  console.log(`[BACKUP] 已备份数据库到: ${path.basename(backupPath)}`)

  // 3. 加载数据库
  const SQL = await initSqlJs()
  const buffer = fs.readFileSync(DB_PATH)
  const db = new SQL.Database(buffer)

  // 4. 逐个清理表
  for (const table of TABLES_TO_CLEAN) {
    try {
      // 先检查表是否存在
      const check = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`)
      if (check.length === 0 || check[0].values.length === 0) {
        console.log(`[SKIP] 表 ${table} 不存在`)
        continue
      }

      // 查询当前记录数
      const countResult = db.exec(`SELECT COUNT(*) FROM ${table}`)
      const count = countResult[0]?.values[0]?.[0] || 0

      // 删除所有数据
      db.run(`DELETE FROM ${table}`)
      console.log(`[OK]   ${table}: 已删除 ${count} 条记录`)
    } catch (err) {
      console.error(`[ERR]  ${table}: ${err.message}`)
    }
  }

  // 5. 重置 sqlite_sequence (如果有自增主键)
  try {
    db.run(`DELETE FROM sqlite_sequence WHERE name IN (${TABLES_TO_CLEAN.map(t => `'${t}'`).join(',')})`)
    console.log('[OK]   自增计数器已重置')
  } catch (err) {
    // sqlite_sequence 可能不存在，忽略
  }

  // 6. 保存到磁盘
  const data = db.export()
  const exportBuffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, exportBuffer)
  console.log(`\n[DONE] 数据库已保存: ${DB_PATH} (${exportBuffer.length} bytes)`)

  // 7. 关闭数据库
  db.close()

  console.log('\n========================================')
  console.log('  清理完成！')
  console.log('  备份文件: ' + path.basename(backupPath))
  console.log('  如需恢复，请将备份文件重命名为 app.db')
  console.log('========================================')
}

main().catch(err => {
  console.error('清理失败:', err)
  process.exit(1)
})
