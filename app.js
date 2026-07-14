import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import config from './config/index.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'
import { initDatabase } from './services/db.js'

const app = express()

// 禁用 ETag，防止 API 代理响应被浏览器 304 缓存
app.set('etag', false)

// CORS - 允许前端跨域请求
app.use(cors({
  origin: ['http://wellwin.top', 'http://www.wellwin.top', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
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
