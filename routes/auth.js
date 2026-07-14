import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import nodemailer from 'nodemailer'

import { authRequired, generateJwt, USERS_FILE } from '../middlewares/auth.js'

const router = Router()

// 确保 data 目录存在（与 user.js 共用）
const DATA_DIR = path.join(process.cwd(), 'data')
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}', 'utf-8')

// ==================== 验证码存储（内存，重启后清空） ====================
// { email: { code, expiresAt, attempts } }
const resetCodeStore = new Map()
const CODE_EXPIRY_MS = 10 * 60 * 1000  // 验证码有效期 10 分钟
const CODE_MAX_ATTEMPTS = 5             // 最大尝试次数
const RESEND_COOLDOWN_MS = 60 * 1000    // 重新发送冷却 60 秒

// 清理过期验证码（定时任务）
setInterval(() => {
  const now = Date.now()
  for (const [email, data] of resetCodeStore.entries()) {
    if (data.expiresAt < now) {
      resetCodeStore.delete(email)
    }
  }
}, 60 * 1000)

// ==================== 邮件发送器（可选） ====================
let transporter = null

function initMailTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 465,
        secure: true, // 465 端口使用 SSL
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      })
      console.log('[Mail] SMTP 邮件服务已初始化:', SMTP_HOST)
    } catch (err) {
      console.warn('[Mail] 邮件服务初始化失败，验证码将输出到控制台:', err.message)
    }
  } else {
    console.log('[Mail] 未配置 SMTP，验证码将输出到控制台')
  }
}

// 发送验证码邮件（或打印到控制台）
async function sendResetCode(email, code) {
  const smtpFrom = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@toolhub.com'
  
  if (transporter) {
    await transporter.sendMail({
      from: smtpFrom,
      to: email,
      subject: 'ToolHub - 密码重置验证码',
      html: `
        <div style="max-width:480px;margin:0 auto;padding:24px;font-family:Arial,sans-serif;background:#f8f9fa;border-radius:8px">
          <h2 style="color:#7c3aed;margin:0 0 16px">ToolHub 密码重置</h2>
          <p style="color:#333;font-size:15px;line-height:1.6">
            您正在为账号 <strong>${email}</strong> 重置密码，验证码如下：
          </p>
          <div style="text-align:center;margin:24px 0">
            <span style="display:inline-block;font-size:32px;font-weight:bold;letter-spacing:6px;color:#7c3aed;background:#ede9fe;padding:12px 28px;border-radius:8px">${code}</span>
          </div>
          <p style="color:#666;font-size:13px">验证码 <strong>10 分钟</strong> 内有效，请勿转发给他人。</p>
          <p style="color:#999;font-size:12px;margin-top:20px">如果这不是您操作，请忽略此邮件。</p>
        </div>
      `
    })
  } else {
    // 开发模式：打印到控制台
    console.log(`\n🔑 [忘记密码] 验证码已生成`)
    console.log(`   邮箱: ${email}`)
    console.log(`   验证码: ${code}`)
    console.log(`   有效期: 10 分钟\n`)
  }
}

// 应用启动时初始化邮件服务
initMailTransporter()

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

// ==================== 忘记密码 - 发送验证码 ====================

/**
 * POST /auth/forgot-password
 * Body: { email }
 * 发送 6 位验证码到邮箱
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '请提供有效的邮箱地址' })
    }

    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))

    // 查找用户
    const user = Object.values(users).find(u => u.email === email)
    if (!user) {
      // 安全起见不暴露邮箱是否已注册，统一返回成功
      // 但为了用户体验，这里提示邮箱未注册
      return res.status(404).json({ error: '该邮箱未注册，请先注册账号' })
    }

    // 检查冷却时间
    const existing = resetCodeStore.get(email)
    if (existing && existing.sentAt && (Date.now() - existing.sentAt) < RESEND_COOLDOWN_MS) {
      const remaining = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.sentAt)) / 1000)
      return res.status(429).json({ error: `请 ${remaining} 秒后再试` })
    }

    // 生成 6 位数字验证码
    const code = String(Math.floor(100000 + Math.random() * 900000))
    const expiresAt = Date.now() + CODE_EXPIRY_MS

    // 存储验证码
    resetCodeStore.set(email, {
      code,
      expiresAt,
      attempts: 0,
      sentAt: Date.now()
    })

    // 发送验证码
    await sendResetCode(email, code)

    res.json({ success: true, message: '验证码已发送到您的邮箱' })
  } catch (err) {
    console.error('[Auth] 发送验证码失败:', err.message)
    res.status(500).json({ error: '发送验证码失败，请稍后重试' })
  }
})

// ==================== 重置密码 ====================

/**
 * POST /auth/reset-password
 * Body: { email, code, newPassword }
 * 验证验证码后重置密码
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: '请填写所有必填项' })
    }
    if (!/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: '验证码格式错误' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6位' })
    }

    // 校验验证码
    const storedData = resetCodeStore.get(email)
    if (!storedData) {
      return res.status(400).json({ error: '请先获取验证码' })
    }
    if (storedData.expiresAt < Date.now()) {
      resetCodeStore.delete(email)
      return res.status(400).json({ error: '验证码已过期，请重新获取' })
    }

    // 增加尝试次数
    storedData.attempts++
    if (storedData.attempts > CODE_MAX_ATTEMPTS) {
      resetCodeStore.delete(email)
      return res.status(400).json({ error: '错误次数过多，请重新获取验证码' })
    }

    if (storedData.code !== code) {
      return res.status(400).json({
        error: `验证码错误，还剩 ${CODE_MAX_ATTEMPTS - storedData.attempts} 次机会`
      })
    }

    // 验证码正确，更新密码
    const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'))
    const user = Object.values(users).find(u => u.email === email)

    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    const salt = bcrypt.genSaltSync(10)
    user.passwordHash = bcrypt.hashSync(newPassword, salt)
    users[user.userId] = user
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8')

    // 删除已使用的验证码
    resetCodeStore.delete(email)

    console.log(`[Auth] 密码重置成功: ${email}`)
    res.json({ success: true, message: '密码重置成功，请使用新密码登录' })
  } catch (err) {
    console.error('[Auth] 重置密码失败:', err.message)
    res.status(500).json({ error: '重置密码失败，请稍后重试' })
  }
})

export default router
