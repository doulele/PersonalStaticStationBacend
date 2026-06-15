import express from 'express'
import cors from 'cors'
import config from './config/index.js'
import routes from './routes/index.js'
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js'

const app = express()

// 禁用 ETag，防止 API 代理响应被浏览器 304 缓存
app.set('etag', false)

// CORS - 允许前端跨域请求
app.use(cors({
  origin: ['http://wellwin.top', 'http://www.wellwin.top', 'http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true
}))

// 解析请求体（增大限制以支持 base64 图片上传，腾讯云 OCR 上限 7MB）
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

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

app.listen(config.port, () => {
  console.log(`[StaticTool Backend] Server running on http://localhost:${config.port}`)
  console.log(`[StaticTool Backend] Environment: ${process.env.NODE_ENV || 'development'}`)
})

export default app
