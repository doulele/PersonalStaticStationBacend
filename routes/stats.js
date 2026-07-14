import { Router } from 'express'
import { dbAll, dbGet, dbRun } from '../services/db.js'

const router = Router()

/**
 * POST /stats/tool-click
 * 记录一次工具页面点击
 * Body: { path: "/home/lifeServices/lottery" }
 */
router.post('/tool-click', (req, res) => {
  const { path: toolPath } = req.body
  if (!toolPath) {
    return res.status(400).json({ code: -1, msg: '缺少 path 参数' })
  }

  const existing = dbGet('SELECT clicks FROM tool_clicks WHERE path = ?', [toolPath])
  if (existing) {
    dbRun('UPDATE tool_clicks SET clicks = clicks + 1 WHERE path = ?', [toolPath])
  } else {
    dbRun('INSERT INTO tool_clicks (path, clicks) VALUES (?, 1)', [toolPath])
  }

  const updated = dbGet('SELECT clicks FROM tool_clicks WHERE path = ?', [toolPath])
  res.json({ code: 1, msg: 'ok', data: { path: toolPath, clicks: updated.clicks } })
})

/**
 * GET /stats/tool-ranking
 * 获取所有工具按点击量降序排列
 */
router.get('/tool-ranking', (req, res) => {
  const ranking = dbAll('SELECT path, clicks FROM tool_clicks ORDER BY clicks DESC')
  res.json({ code: 1, msg: 'ok', data: ranking })
})

export default router
