import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import config from './config/index.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { initDatabase } from './services/db.js'
import cron from 'node-cron'
import { runDailyTask } from './services/nationalTeamService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

// 禁用 ETag，防止 API 代理响应被浏览器 304 缓存
app.set('etag', false)

// CORS - 允许前端跨域请求
app.use(cors({
  origin: ['http://wellwin.top', 'http://www.wellwin.top', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}))

// 静态文件服务 — 头像等上传资源
app.use('/avatars', express.static(path.join(__dirname, 'public', 'avatars'), {
  maxAge: '7d',
  etag: true
}))

// 解析请求体（增大限制以支持 base64 图片/音频上传）
app.use(express.json({ limit: '25mb' }))
app.use(express.urlencoded({ extended: true, limit: '25mb' }))

// 请求日志
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`)
  })
  next()
})

// 路由
app.use('/', routes)

// 404
app.use(notFoundHandler)

// 错误处理
app.use(errorHandler)

import { createServer } from 'http'

async function startServer() {
  // 初始化 SQLite 数据库
  await initDatabase()

  // 国家队动向监测 — 每晚 23:30 自动执行
  cron.schedule('30 23 * * *', async () => {
    const dateStr = new Date().toISOString().slice(0, 10)
    console.log(`\n[NT Cron] 定时任务触发: ${dateStr} 23:30`)
    try {
      await runDailyTask(dateStr)
    } catch (err) {
      console.error('[NT Cron] 定时任务执行失败:', err.message)
    }
  }, { timezone: 'Asia/Shanghai' })
  console.log('[NT Cron] 已注册定时任务：每天 23:30 (Asia/Shanghai)')

  // ==================== 股票测评评分池预热 ====================
  // 目的：避免用户首次访问时冷启动（需 30~90s 构建评分池）。
  // 策略：服务启动后延迟预热三个周期；之后每 4 分钟检查缓存是否过期并重建。
  // 通过共享内存缓存（stockScoreService 的 cacheGet/cacheSet）避免重复计算。
  const { buildScorePool } = await import('./services/stockScoreService.js')
  let prewarmLock = false

  async function prewarmPools() {
    if (prewarmLock) return
    prewarmLock = true
    try {
      console.log('[StockRec] 评分池预热开始...')
      // 三周期并行触发完整池构建：buildScorePool 立即返回基础池（秒级），
      // 完整池在后台按 horizon 并行跑（runFullPoolBuild 已按 horizon 分键，不再互相阻塞）
      // 预热使用默认板块（沪市主板+深市主板），与前端默认筛选一致，确保缓存命中。
      const DEFAULT_BOARDS = ['sh_main', 'sz_main']
      await Promise.all(['short', 'mid', 'long'].map(h =>
        buildScorePool(h, { boards: DEFAULT_BOARDS }, null).then(() => console.log(`[StockRec] 预热触发: ${h}`))
      ))
    } catch (err) {
      console.error('[StockRec] 评分池预热失败:', err.message)
    } finally {
      prewarmLock = false
    }
  }

  // 启动后 5 秒预热一次（避免阻塞服务启动）
  setTimeout(prewarmPools, 5000)
  // 每 1 分钟检查预热（buildScorePool 内部有缓存判断，命中则跳过；配合智能 TTL 自动决定是否重建）
  cron.schedule('* * * * *', prewarmPools, { timezone: 'Asia/Shanghai' })
  console.log('[StockRec] 已注册评分池预热：启动后延迟预热 + 每 1 分钟检查（智能 TTL）')

  const server = createServer(app)

  process.on('SIGINT', () => {
    console.log('\n[StaticTool Backend] Shutting down...')
    server.close(() => process.exit(0))
  })

  server.on('error', async (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[StaticTool Backend] Port ${config.port} is in use, trying to free it...`)
      const { execSync } = await import('child_process')
      try {
        const cmd = process.platform === 'win32'
          ? `powershell -Command "Get-NetTCPConnection -LocalPort ${config.port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }"`
          : `lsof -ti:${config.port} | xargs kill -9`
        execSync(cmd, { stdio: 'ignore' })
        console.log(`[StaticTool Backend] Port ${config.port} freed, retrying...`)
        setTimeout(() => server.listen(config.port), 500)
      } catch {
        console.error(`[StaticTool Backend] Could not free port ${config.port}, please manually run: npx kill-port ${config.port}`)
        process.exit(1)
      }
    } else {
      throw err
    }
  })

  server.listen(config.port, () => {
    console.log(`[StaticTool Backend] Server running on http://localhost:${config.port}`)
    console.log(`[StaticTool Backend] Environment: ${process.env.NODE_ENV || 'development'}`)
  })
}

startServer()

export default app
