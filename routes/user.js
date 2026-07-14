import { Router } from 'express'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { dbGet, dbAll, dbRun } from '../services/db.js'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'static-tool-jwt-secret-2024'

// 简单 token 生成（旧系统兼容）
function generateToken(userId, pin) {
  return crypto.createHash('sha256').update(`${userId}:${pin}:${Date.now()}`).digest('hex').slice(0, 32)
}

// 验证 token（支持 JWT Bearer Token + 旧 x-auth-token）
function verifyToken(req) {
  let token = null

  // 优先从 Authorization header 获取 Bearer JWT
  const authHeader = req.headers.authorization
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7)
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      return decoded.userId
    } catch { /* JWT 无效，回退到旧方式 */ }
  }

  // 兼容旧的 x-auth-token
  token = req.headers['x-auth-token']
  if (token) {
    try {
      const rows = dbAll('SELECT userId, tokens FROM users')
      for (const row of rows) {
        const tokens = JSON.parse(row.tokens || '[]')
        if (tokens.includes(token)) return row.userId
      }
    } catch { /* ignore */ }
  }

  return null
}

// ==================== Phase 3: 轻型用户身份标识 ====================

/**
 * POST /user/identify
 * 昵称 + 4位PIN 身份标识，返回 token
 */
router.post('/identify', (req, res) => {
  try {
    const { nickname, pin } = req.body
    if (!nickname || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: '请提供昵称和4位数字PIN' })
    }

    const pinHash = crypto.createHash('sha256').update(pin).digest('hex')

    // 查找已有用户（昵称+PIN匹配）
    let user = dbGet(
      'SELECT * FROM users WHERE nickname = ? AND pinHash = ?',
      [nickname, pinHash]
    )

    let userId
    if (!user) {
      // 新用户注册
      userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const now = new Date().toISOString()
      dbRun(
        'INSERT INTO users (userId, email, passwordHash, nickname, pinHash, createdAt, lastLogin, tokens) VALUES (?,?,?,?,?,?,?,?)',
        [userId, null, null, nickname, pinHash, now, now, '[]']
      )
    } else {
      userId = user.userId
    }

    const token = generateToken(userId, pin)

    // 更新 tokens（保留最近5个）
    const currentUser = dbGet('SELECT tokens FROM users WHERE userId = ?', [userId])
    const currentTokens = JSON.parse(currentUser.tokens || '[]')
    const newTokens = [...currentTokens, token].slice(-5)

    dbRun(
      'UPDATE users SET tokens = ?, lastLogin = ? WHERE userId = ?',
      [JSON.stringify(newTokens), new Date().toISOString(), userId]
    )

    res.json({ success: true, data: { token, userId, nickname } })
  } catch (err) {
    console.error('[User] 身份标识失败:', err.message)
    res.status(500).json({ error: '身份标识失败' })
  }
})

// ==================== Phase 3: 行程 CRUD ====================

/**
 * GET /user/plans
 * 获取用户所有行程
 */
router.get('/plans', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const plans = dbAll(
      'SELECT planId, planName, userId, savedAt, summary FROM user_plans WHERE userId = ? ORDER BY savedAt DESC',
      [userId]
    )

    res.json({
      success: true,
      data: plans.map(p => ({
        ...p,
        summary: tryParse(p.summary)
      }))
    })
  } catch (err) {
    console.error('[User] 获取行程失败:', err.message)
    res.status(500).json({ error: '获取行程失败' })
  }
})

/**
 * POST /user/plans
 * 保存行程
 */
router.post('/plans', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const { planName, planData } = req.body
    if (!planName || !planData) return res.status(400).json({ error: '缺少行程名称或数据' })

    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const now = new Date().toISOString()

    dbRun(
      'INSERT INTO user_plans (planId, planName, userId, planData, savedAt, summary) VALUES (?,?,?,?,?,?)',
      [planId, planName, userId, JSON.stringify(planData), now, JSON.stringify(planData.summary || {})]
    )

    res.json({ success: true, data: { planId, savedAt: now } })
  } catch (err) {
    console.error('[User] 保存行程失败:', err.message)
    res.status(500).json({ error: '保存失败' })
  }
})

/**
 * DELETE /user/plans/:id
 * 删除行程
 */
router.delete('/plans/:id', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const { id } = req.params
    const result = dbRun(
      'DELETE FROM user_plans WHERE planId = ? AND userId = ?',
      [id, userId]
    )
    if (result.changes === 0) return res.status(404).json({ error: '行程不存在' })

    res.json({ success: true })
  } catch (err) {
    console.error('[User] 删除行程失败:', err.message)
    res.status(500).json({ error: '删除失败' })
  }
})

// ==================== Phase 4: 用户偏好 ====================

/**
 * GET /user/preferences
 */
router.get('/preferences', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const pref = dbGet('SELECT * FROM user_preferences WHERE userId = ?', [userId])
    const data = pref ? {
      preferredTypes: tryParse(pref.preferredTypes, []),
      budgetLevel: pref.budgetLevel || 'medium',
      preferredFoodTypes: tryParse(pref.preferredFoodTypes, []),
      stayCorrectionFactor: pref.stayCorrectionFactor || 1.0
    } : {
      preferredTypes: [],
      budgetLevel: 'medium',
      preferredFoodTypes: [],
      stayCorrectionFactor: 1.0
    }

    res.json({ success: true, data })
  } catch (err) {
    console.error('[User] 获取偏好失败:', err.message)
    res.status(500).json({ error: '获取偏好失败' })
  }
})

/**
 * POST /user/preferences
 */
router.post('/preferences', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const { preferredTypes, budgetLevel, preferredFoodTypes, stayCorrectionFactor } = req.body
    const now = new Date().toISOString()

    dbRun(
      `INSERT INTO user_preferences (userId, preferredTypes, budgetLevel, preferredFoodTypes, stayCorrectionFactor, updatedAt)
       VALUES (?,?,?,?,?,?)
       ON CONFLICT(userId) DO UPDATE SET
         preferredTypes=excluded.preferredTypes,
         budgetLevel=excluded.budgetLevel,
         preferredFoodTypes=excluded.preferredFoodTypes,
         stayCorrectionFactor=excluded.stayCorrectionFactor,
         updatedAt=excluded.updatedAt`,
      [
        userId,
        JSON.stringify(preferredTypes || []),
        budgetLevel || 'medium',
        JSON.stringify(preferredFoodTypes || []),
        stayCorrectionFactor || 1.0,
        now
      ]
    )

    res.json({
      success: true,
      data: {
        preferredTypes: preferredTypes || [],
        budgetLevel: budgetLevel || 'medium',
        preferredFoodTypes: preferredFoodTypes || [],
        stayCorrectionFactor: stayCorrectionFactor || 1.0,
        updatedAt: now
      }
    })
  } catch (err) {
    console.error('[User] 保存偏好失败:', err.message)
    res.status(500).json({ error: '保存偏好失败' })
  }
})

// ==================== 辅助 ====================

function tryParse(str, defaultValue) {
  try { return JSON.parse(str) } catch { return defaultValue }
}

export default router
