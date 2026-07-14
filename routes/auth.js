import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { authRequired, generateJwt } from '../middlewares/auth.js'
import { dbGet, dbRun } from '../services/db.js'

const router = Router()

// ==================== 验证码存储（内存，重启后清空） ====================
const resetCodeStore = new Map()
const CODE_EXPIRY_MS = 10 * 60 * 1000
const CODE_MAX_ATTEMPTS = 5
const RESEND_COOLDOWN_MS = 60 * 1000

setInterval(() => {
  const now = Date.now()
  for (const [email, data] of resetCodeStore.entries()) {
    if (data.expiresAt < now) resetCodeStore.delete(email)
  }
}, 60 * 1000)

// ==================== 邮件发送器 ====================
let transporter = null

function initMailTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(SMTP_PORT) || 465,
        secure: true,
        auth: { user: SMTP_USER, pass: SMTP_PASS }
      })
      console.log('[Mail] SMTP 邮件服务已初始化:', SMTP_HOST)
    } catch (err) {
      console.warn('[Mail] 邮件服务初始化失败，验证码将输出到控制台:', err.message)
    }
  } else {
    console.log('[Mail] 未配置 SMTP，验证码将输出到控制台')
  }
}

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
          <p style="color:#333;font-size:15px;line-height:1.6">您正在为账号 <strong>${email}</strong> 重置密码，验证码如下：</p>
          <div style="text-align:center;margin:24px 0">
            <span style="display:inline-block;font-size:32px;font-weight:bold;letter-spacing:6px;color:#7c3aed;background:#ede9fe;padding:12px 28px;border-radius:8px">${code}</span>
          </div>
          <p style="color:#666;font-size:13px">验证码 <strong>10 分钟</strong> 内有效，请勿转发给他人。</p>
          <p style="color:#999;font-size:12px;margin-top:20px">如果这不是您操作，请忽略此邮件。</p>
        </div>
      `
    })
  } else {
    console.log(`\n🔑 [忘记密码] 验证码已生成`)
    console.log(`   邮箱: ${email}`)
    console.log(`   验证码: ${code}`)
    console.log(`   有效期: 10 分钟\n`)
  }
}

initMailTransporter()

// ==================== 辅助函数 ====================

/** 根据邮箱查找用户 */
function findUserByEmail(email) {
  return dbGet('SELECT * FROM users WHERE email = ?', [email])
}

// ==================== 注册 ====================

/**
 * POST /auth/register
 * Body: { email, password, nickname }
 */
router.post('/register', (req, res) => {
  try {
    const { email, password, nickname, inviteCode } = req.body

    if (!email || !password || !nickname || !inviteCode) {
      return res.status(400).json({ error: '请填写所有必填项（含邀请码）' })
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

    // 验证邀请码
    const validInviteCode = process.env.INVITE_CODE
    if (!validInviteCode) {
      console.error('[Auth] 服务端未配置 INVITE_CODE 环境变量')
      return res.status(500).json({ error: '注册功能暂不可用' })
    }
    if (inviteCode !== validInviteCode) {
      return res.status(403).json({ error: '邀请码错误，无法注册' })
    }

    // 检查邮箱是否已被注册
    if (findUserByEmail(email)) {
      return res.status(409).json({ error: '该邮箱已被注册' })
    }

    // 创建新用户
    const userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    const salt = bcrypt.genSaltSync(10)
    const passwordHash = bcrypt.hashSync(password, salt)
    const now = new Date().toISOString()

    dbRun(
      'INSERT INTO users (userId, email, passwordHash, nickname, pinHash, createdAt, lastLogin, tokens) VALUES (?,?,?,?,?,?,?,?)',
      [userId, email, passwordHash, nickname, null, now, now, '[]']
    )

    const token = generateJwt(userId, email)

    res.status(201).json({
      success: true,
      data: { token, userId, email, nickname, createdAt: now }
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

    const user = findUserByEmail(email)
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: '该账号未设置密码，请使用昵称+PIN登录' })
    }

    const isPasswordValid = bcrypt.compareSync(password, user.passwordHash)
    if (!isPasswordValid) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }

    // 更新最后登录时间
    const now = new Date().toISOString()
    dbRun('UPDATE users SET lastLogin = ? WHERE userId = ?', [now, user.userId])

    const token = generateJwt(user.userId, user.email)

    res.json({
      success: true,
      data: {
        token,
        userId: user.userId,
        email: user.email,
        nickname: user.nickname,
        createdAt: user.createdAt,
        lastLogin: now
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
 */
router.get('/profile', authRequired, (req, res) => {
  try {
    const user = dbGet(
      'SELECT userId, email, nickname, createdAt, lastLogin FROM users WHERE userId = ?',
      [req.userId]
    )
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    res.json({ success: true, data: user })
  } catch (err) {
    console.error('[Auth] 获取信息失败:', err.message)
    res.status(500).json({ error: '获取用户信息失败' })
  }
})

// ==================== 修改密码 ====================

/**
 * POST /auth/change-password
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

    const user = dbGet('SELECT * FROM users WHERE userId = ?', [req.userId])
    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: '该账号不支持密码修改' })
    }

    const isValid = bcrypt.compareSync(oldPassword, user.passwordHash)
    if (!isValid) {
      return res.status(400).json({ error: '旧密码错误' })
    }

    const salt = bcrypt.genSaltSync(10)
    const newHash = bcrypt.hashSync(newPassword, salt)
    dbRun('UPDATE users SET passwordHash = ? WHERE userId = ?', [newHash, req.userId])

    res.json({ success: true, message: '密码修改成功' })
  } catch (err) {
    console.error('[Auth] 修改密码失败:', err.message)
    res.status(500).json({ error: '修改密码失败' })
  }
})

// ==================== 忘记密码 ====================

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: '请提供有效的邮箱地址' })
    }

    const user = findUserByEmail(email)
    if (!user) {
      return res.status(404).json({ error: '该邮箱未注册，请先注册账号' })
    }

    const existing = resetCodeStore.get(email)
    if (existing && existing.sentAt && (Date.now() - existing.sentAt) < RESEND_COOLDOWN_MS) {
      const remaining = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.sentAt)) / 1000)
      return res.status(429).json({ error: `请 ${remaining} 秒后再试` })
    }

    const code = String(Math.floor(100000 + Math.random() * 900000))
    resetCodeStore.set(email, {
      code, expiresAt: Date.now() + CODE_EXPIRY_MS, attempts: 0, sentAt: Date.now()
    })

    await sendResetCode(email, code)
    res.json({ success: true, message: '验证码已发送到您的邮箱' })
  } catch (err) {
    console.error('[Auth] 发送验证码失败:', err.message)
    res.status(500).json({ error: '发送验证码失败，请稍后重试' })
  }
})

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

    const storedData = resetCodeStore.get(email)
    if (!storedData) return res.status(400).json({ error: '请先获取验证码' })
    if (storedData.expiresAt < Date.now()) {
      resetCodeStore.delete(email)
      return res.status(400).json({ error: '验证码已过期，请重新获取' })
    }

    storedData.attempts++
    if (storedData.attempts > CODE_MAX_ATTEMPTS) {
      resetCodeStore.delete(email)
      return res.status(400).json({ error: '错误次数过多，请重新获取验证码' })
    }
    if (storedData.code !== code) {
      return res.status(400).json({ error: `验证码错误，还剩 ${CODE_MAX_ATTEMPTS - storedData.attempts} 次机会` })
    }

    const user = findUserByEmail(email)
    if (!user) return res.status(404).json({ error: '用户不存在' })

    const salt = bcrypt.genSaltSync(10)
    dbRun('UPDATE users SET passwordHash = ? WHERE userId = ?',
      [bcrypt.hashSync(newPassword, salt), user.userId])

    resetCodeStore.delete(email)
    console.log(`[Auth] 密码重置成功: ${email}`)
    res.json({ success: true, message: '密码重置成功，请使用新密码登录' })
  } catch (err) {
    console.error('[Auth] 重置密码失败:', err.message)
    res.status(500).json({ error: '重置密码失败，请稍后重试' })
  }
})

export default router
