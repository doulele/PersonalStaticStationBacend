import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { authRequired, generateJwt, USERS_FILE } from '../middlewares/auth.js'

const router = Router()

// 确保 data 目录存在（与 user.js 共用）
const DATA_DIR = path.join(process.cwd(), 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}', 'utf-8')

// ==================== 注册 ====================

/**
 * POST /auth/register
 * Body: { email, password, nickname }
 */
router.post('/register', (req, res) => {
  try {
    const { email, password, nickname } = req.body

    // 参数校验
    if (!email || !password || !nickname) {
      return res.status(400).json({ error: '请填写邮箱、密码和昵称' })
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '请提供有效的邮箱地址' })
    }
    if (password.length < 6) {
      return res.status(400).json({ error: '密码长度不能少于6位' })
    }
    if (nickname.length < 2 || nickname.length > 20) {
      return res.status(400).json({ error: '昵称长度应为2-20个字符' })
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))

    // 检查邮箱是否已被注册
    const existingUser = Object.values(users).find(u => u.email === email)
    if (existingUser) {
      return res.status(409).json({ error: '该邮箱已被注册' })
    }

    // 创建新用户
    const userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const salt = bcrypt.genSaltSync(10)
    const passwordHash = bcrypt.hashSync(password, salt)

    users[userId] = {
      userId,
      email,
      passwordHash,
      nickname,
      pinHash: null,           // 旧系统兼容字段
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      tokens: []               // 旧系统兼容字段
    }

    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')

    // 生成 JWT token
    const token = generateJwt(userId, email)

    res.status(201).json({
      success: true,
      data: {
        token,
        userId,
        email,
        nickname,
        createdAt: users[userId].createdAt
      }
    })
  } catch (err) {
    console.error('[Auth] 注册失败:', err.message)
    res.status(500).json({ error: '注册失败，请稍后重试' })
  }
})

// ==================== 登录 ====================

/**
 * POST /auth/login
 * Body: { email, password }
 */
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body

    if (!email || !password) {
      return res.status(400).json({ error: '请填写邮箱和密码' })
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))

    // 查找用户
    const user = Object.values(users).find(u => u.email === email)
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    // 验证密码
    if (!user.passwordHash) {
      return res.status(401).json({ error: '该账号未设置密码，请使用昵称+PIN登录' })
    }

    const isPasswordValid = bcrypt.compareSync(password, user.passwordHash)
    if (!isPasswordValid) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    // 更新最后登录时间
    user.lastLogin = new Date().toISOString()
    users[user.userId] = user
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')

    // 生成 JWT token
    const token = generateJwt(user.userId, user.email)

    res.json({
      success: true,
      data: {
        token,
        userId: user.userId,
        email: user.email,
        nickname: user.nickname,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    })
  } catch (err) {
    console.error('[Auth] 登录失败:', err.message)
    res.status(500).json({ error: '登录失败，请稍后重试' })
  }
})

// ==================== 获取个人信息 ====================

/**
 * GET /auth/profile
 * 需要认证
 */
router.get('/profile', authRequired, (req, res) => {
  try {
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
    const user = users[req.userId]
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    res.json({
      success: true,
      data: {
        userId: user.userId,
        email: user.email,
        nickname: user.nickname,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      }
    })
  } catch (err) {
    console.error('[Auth] 获取信息失败:', err.message)
    res.status(500).json({ error: '获取用户信息失败' })
  }
})

// ==================== 修改密码 ====================

/**
 * POST /auth/change-password
 * 需要认证
 * Body: { oldPassword, newPassword }
 */
router.post('/change-password', authRequired, (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body

    if (!oldPassword || !newPassword) {
      return res.status(400).json({ error: '请填写旧密码和新密码' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6位' })
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
    const user = users[req.userId]

    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: '该账号不支持密码修改' })
    }

    const isValid = bcrypt.compareSync(oldPassword, user.passwordHash)
    if (!isValid) {
      return res.status(400).json({ error: '旧密码错误' })
    }

    const salt = bcrypt.genSaltSync(10)
    user.passwordHash = bcrypt.hashSync(newPassword, salt)
    users[req.userId] = user
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')

    res.json({ success: true, message: '密码修改成功' })
  } catch (err) {
    console.error('[Auth] 修改密码失败:', err.message)
    res.status(500).json({ error: '修改密码失败' })
  }
})

export default router
