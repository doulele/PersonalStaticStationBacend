/**
 * 全局错误处理中间件
 */
export function errorHandler(err, req, res, _next) {
  console.error(`[${new Date().toISOString()}] Error ${req.method} ${req.originalUrl}:`, err.message)

  const statusCode = err.response?.status || err.status || 500
  const message = err.response?.statusText || err.message || 'Internal Server Error'

  res.status(statusCode).json({
    error: true,
    message,
    code: statusCode
  })
}

/**
 * 404 处理
 */
export function notFoundHandler(req, res) {
  res.status(404).json({
    error: true,
    message: `Not Found: ${req.method} ${req.originalUrl}`,
    code: 404
  })
}
