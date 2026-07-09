/**
 * JWT 认证中间件
 * 支持 Bearer Token（新系统）和 x-auth-token（旧系统兼容）
 */
import jwt from 'jsonwebtoken'
import fs from 'fs'
import path from 'path'

const JWT_SECRET = process.env.JWT_SECRET || 'static-tool-jwt-secret-2024'
const JWT_EXPIRES_IN = '7d'
const USERS_FILE = path.join(process.cwd(), 'data', 'users.json')

/**
 * 从 JWT 或旧 token 中获取 userId
 */
function getUserIdFromToken(token) {
  // 优先尝试 JWT 验证
  try {
    const decoded = jwt.verify(token, JWT_SECRET)
    return decoded.userId
  } catch {
    // JWT 验证失败，尝试旧的 SHA256 token
    try {
      const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
      for (const [userId, user] of Object.entries(users)) {
        if (user.tokens && user.tokens.includes(token)) {
          return userId
        }
      }
    } catch { /* ignore */ }
  }
  return null
}

/**
 * 读取用户信息
 */
function getUserById(userId) {
  try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
    const user = users[userId]
    if (!user) return null
    // 不暴露密码哈希等敏感字段
    return {
      userId: user.userId,
      email: user.email || null,
      nickname: user.nickname || null,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }
  } catch {
    return null
  }
}

/**
 * 生成 JWT token
 */
export function generateJwt(userId, email) {
  return jwt.sign(
    { userId, email, type: 'auth' },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  )
}

/**
 * 必须认证中间件 — 未登录返回 401
 */
export function authRequired(req, res, next) {
  let token = null

  // 优先从 Authorization header 获取 Bearer token
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  }

  // 兼容旧的 x-auth-token
  if (!token) {
    token = req.headers['x-auth-token']
  }

  if (!token) {
    return res.status(401).json({ error: '请先登录' })
  }

  const userId = getUserIdFromToken(token)
  if (!userId) {
    return res.status(401).json({ error: '登录已过期，请重新登录' })
  }

  req.userId = userId
  req.user = getUserById(userId)
  next()
}

/**
 * 可选认证中间件 — 尝试解析用户，但不强制要求登录
 */
export function authOptional(req, res, next) {
  let token = null

  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
  }

  if (!token) {
    token = req.headers['x-auth-token']
  }

  if (token) {
    const userId = getUserIdFromToken(token)
    if (userId) {
      req.userId = userId
      req.user = getUserById(userId)
    }
  }

  next()
}

export { JWT_SECRET, USERS_FILE }
