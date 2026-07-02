import { Router } from 'express'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

const router = Router()

const DATA_DIR = path.join(process.cwd(), 'data')
const USERS_FILE = path.join(DATA_DIR, 'users.json')
const PLANS_FILE = path.join(DATA_DIR, 'user_plans.json')
const PREFS_FILE = path.join(DATA_DIR, 'user_preferences.json')

// 初始化
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}', 'utf-8')
if (!fs.existsSync(PLANS_FILE)) fs.writeFileSync(PLANS_FILE, '[]', 'utf-8')
if (!fs.existsSync(PREFS_FILE)) fs.writeFileSync(PREFS_FILE, '{}', 'utf-8')

// 简单 token 生成
function generateToken(userId, pin) {
  return crypto.createHash('sha256').update(`${userId}:${pin}:${Date.now()}`).digest('hex').slice(0, 32)
}

// 验证 token
function verifyToken(req) {
  const token = req.headers['x-auth-token']
  if (!token) return null
  try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
    for (const [userId, user] of Object.entries(users)) {
      if (user.tokens && user.tokens.includes(token)) {
        return userId
      }
    }
  } catch { /* ignore */ }
  return null
}

// ==================== Phase 3: 轻型用户身份标识 ====================

/**
 * POST /user/identify
 * 昵称 + 4位PIN 身份标识，返回 token
 * Body: { nickname, pin }
 */
router.post('/identify', (req, res) => {
  try {
    const { nickname, pin } = req.body
    if (!nickname || !pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ error: '请提供昵称和4位数字PIN' })
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))

    // 查找已有用户（昵称+PIN匹配）
    let userId = Object.keys(users).find(uid => {
      const u = users[uid]
      return u.nickname === nickname && u.pinHash === crypto.createHash('sha256').update(pin).digest('hex')
    })

    if (!userId) {
      // 新用户注册
      userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      users[userId] = {
        userId,
        nickname,
        pinHash: crypto.createHash('sha256').update(pin).digest('hex'),
        createdAt: new Date().toISOString(),
        tokens: []
      }
    }

    const token = generateToken(userId, pin)
    users[userId].tokens = [...(users[userId].tokens || []), token].slice(-5) // 保留最近5个token
    users[userId].lastLogin = new Date().toISOString()

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')

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
 * Headers: x-auth-token
 */
router.get('/plans', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const allPlans = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf-8'))
    const userPlans = allPlans.filter(p => p.userId === userId)
    userPlans.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))

    res.json({
      success: true,
      data: userPlans.map(p => ({
        planId: p.planId,
        planName: p.planName,
        savedAt: p.savedAt,
        summary: p.summary
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
 * Headers: x-auth-token
 * Body: { planName, planData }
 */
router.post('/plans', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const { planName, planData } = req.body
    if (!planName || !planData) return res.status(400).json({ error: '缺少行程名称或数据' })

    const allPlans = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf-8'))
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const record = {
      planId,
      planName,
      userId,
      planData,
      savedAt: new Date().toISOString(),
      summary: planData.summary || {}
    }

    allPlans.push(record)
    fs.writeFileSync(PLANS_FILE, JSON.stringify(allPlans, null, 2), 'utf-8')

    res.json({ success: true, data: { planId, savedAt: record.savedAt } })
  } catch (err) {
    console.error('[User] 保存行程失败:', err.message)
    res.status(500).json({ error: '保存失败' })
  }
})

/**
 * DELETE /user/plans/:id
 * 删除行程
 * Headers: x-auth-token
 */
router.delete('/plans/:id', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const { id } = req.params
    const allPlans = JSON.parse(fs.readFileSync(PLANS_FILE, 'utf-8'))
    const idx = allPlans.findIndex(p => p.planId === id && p.userId === userId)
    if (idx === -1) return res.status(404).json({ error: '行程不存在' })

    allPlans.splice(idx, 1)
    fs.writeFileSync(PLANS_FILE, JSON.stringify(allPlans, null, 2), 'utf-8')

    res.json({ success: true })
  } catch (err) {
    console.error('[User] 删除行程失败:', err.message)
    res.status(500).json({ error: '删除失败' })
  }
})

// ==================== Phase 4: 用户偏好 ====================

/**
 * GET /user/preferences
 * 获取用户偏好
 * Headers: x-auth-token
 */
router.get('/preferences', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf-8'))
    const userPrefs = prefs[userId] || {
      preferredTypes: [],      // ['自然', '人文', '网红']
      budgetLevel: 'medium',   // 'low' | 'medium' | 'high'
      preferredFoodTypes: [],  // ['中餐', '西餐', '小吃']
      stayCorrectionFactor: 1.0 // 停留时间修正系数
    }

    res.json({ success: true, data: userPrefs })
  } catch (err) {
    console.error('[User] 获取偏好失败:', err.message)
    res.status(500).json({ error: '获取偏好失败' })
  }
})

/**
 * POST /user/preferences
 * 保存用户偏好
 * Headers: x-auth-token
 * Body: { preferredTypes, budgetLevel, preferredFoodTypes, stayCorrectionFactor }
 */
router.post('/preferences', (req, res) => {
  try {
    const userId = verifyToken(req)
    if (!userId) return res.status(401).json({ error: '请先进行身份标识' })

    const { preferredTypes, budgetLevel, preferredFoodTypes, stayCorrectionFactor } = req.body
    const prefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf-8'))

    prefs[userId] = {
      preferredTypes: preferredTypes || [],
      budgetLevel: budgetLevel || 'medium',
      preferredFoodTypes: preferredFoodTypes || [],
      stayCorrectionFactor: stayCorrectionFactor || 1.0,
      updatedAt: new Date().toISOString()
    }

    fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2), 'utf-8')
    res.json({ success: true, data: prefs[userId] })
  } catch (err) {
    console.error('[User] 保存偏好失败:', err.message)
    res.status(500).json({ error: '保存偏好失败' })
  }
})

export default router
