import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_FILE = path.join(__dirname, '..', 'data', 'tool_clicks.json')

const router = Router()

// 读取点击数据
function readClicks() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (e) {
    console.error('[stats] 读取点击数据失败:', e.message)
  }
  return {}
}

// 写入点击数据
function writeClicks(data) {
  try {
    const dir = path.dirname(DATA_FILE)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8')
  } catch (e) {
    console.error('[stats] 写入点击数据失败:', e.message)
  }
}

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

  const clicks = readClicks()
  clicks[toolPath] = (clicks[toolPath] || 0) + 1
  writeClicks(clicks)

  res.json({ code: 1, msg: 'ok', data: { path: toolPath, clicks: clicks[toolPath] } })
})

/**
 * GET /stats/tool-ranking
 * 获取所有工具按点击量降序排列
 */
router.get('/tool-ranking', (req, res) => {
  const clicks = readClicks()
  const ranking = Object.entries(clicks)
    .map(([path, count]) => ({ path, clicks: count }))
    .sort((a, b) => b.clicks - a.clicks)

  res.json({ code: 1, msg: 'ok', data: ranking })
})

export default router
