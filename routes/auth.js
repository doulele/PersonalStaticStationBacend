import { Router } from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import multer from 'multer'
import nodemailer from 'nodemailer'
import { authRequired, generateJwt } from '../middlewares/auth.js'
import { dbGet, dbAll, dbRun, updateUser } from '../services/db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const router = Router()

// ==================== Multer 头像上传配置 ====================

const AVATARS_DIR = path.join(__dirname, '..', 'public', 'avatars')

// 确保 avatars 目录存在
if (!fs.existsSync(AVATARS_DIR)) {
  fs.mkdirSync(AVATARS_DIR, { recursive: true })
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, AVATARS_DIR)
  },
  filename: (req, file, cb) => {
    const userId = req.userId || 'unknown'
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg'
    const timestamp = Date.now()
    const random = Math.random().toString(36).slice(2, 8)
    const filename = `${userId}_${timestamp}_${random}${ext}`
    cb(null, filename)
  }
})

const avatarUpload = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp']
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true)
    } else {
      cb(new Error('仅支持 JPEG、PNG、WebP 格式的图片'), false)
    }
  }
})

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

/** 根据用户名查找用户 */
function findUserByUsername(username) {
  return dbGet('SELECT * FROM users WHERE username = ?', [username])
}

/** 根据昵称查找用户（排除指定userId） */
function findUserByNickname(nickname, excludeUserId = null) {
  if (excludeUserId) {
    return dbGet('SELECT * FROM users WHERE nickname = ? AND userId != ?', [nickname, excludeUserId])
  }
  return dbGet('SELECT * FROM users WHERE nickname = ?', [nickname])
}

// ==================== 注册 ====================

/**
 * POST /auth/register
 * 两种注册方式：
 *   邮箱注册：{ email, password, nickname, inviteCode }
 *   用户名注册：{ username, password, nickname, securityQuestion, securityAnswer }
 */
router.post('/register', (req, res) => {
  try {
    const { email, username, password, nickname, inviteCode, securityQuestion, securityAnswer } = req.body

    // 判断注册方式
    const isUsernameMode = !!username && !email

    if (isUsernameMode) {
      // ========== 用户名注册（需要邀请码） ==========
      if (!username || !password || !nickname || !securityQuestion || !securityAnswer || !inviteCode) {
        return res.status(400).json({ error: '请填写所有必填项（用户名、密码、昵称、密保问题、密保答案、邀请码）' })
      }
      if (username.length < 2 || username.length > 20) {
        return res.status(400).json({ error: '用户名长度应为2-20个字符' })
      }
      if (!/^[a-zA-Z0-9_\u4e00-\u9fa5]+$/.test(username)) {
        return res.status(400).json({ error: '用户名只能包含字母、数字、下划线和中文' })
      }
      if (password.length < 6) {
        return res.status(400).json({ error: '密码长度不能少于6位' })
      }
      if (nickname.length < 2 || nickname.length > 20) {
        return res.status(400).json({ error: '昵称长度应为2-20个字符' })
      }
      if (securityAnswer.length < 2 || securityAnswer.length > 50) {
        return res.status(400).json({ error: '密保答案长度应为2-50个字符' })
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

      // 检查用户名是否已被注册
      if (findUserByUsername(username)) {
        return res.status(409).json({ error: '该用户名已被使用' })
      }

      // 检查昵称是否已被使用
      if (findUserByNickname(nickname.trim())) {
        return res.status(409).json({ error: '该昵称已被使用' })
      }

      // 创建新用户
      const userId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const salt = bcrypt.genSaltSync(10)
      const passwordHash = bcrypt.hashSync(password, salt)
      const answerHash = bcrypt.hashSync(securityAnswer.trim(), salt)
      const now = new Date().toISOString()

      dbRun(
        'INSERT INTO users (userId, username, email, passwordHash, nickname, securityQuestion, securityAnswerHash, pinHash, createdAt, lastLogin, tokens) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [userId, username, null, passwordHash, nickname, securityQuestion, answerHash, null, now, now, '[]']
      )

      const token = generateJwt(userId, username)

      res.status(201).json({
        success: true,
        data: { token, userId, username, email: null, nickname, createdAt: now }
      })

    } else {
      // ========== 邮箱注册（原有流程） ==========
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

      // 检查昵称是否已被使用
      if (findUserByNickname(nickname.trim())) {
        return res.status(409).json({ error: '该昵称已被使用' })
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
    }
  } catch (err) {
    console.error('[Auth] 注册失败:', err.message)
    res.status(500).json({ error: '注册失败，请稍后重试' })
  }
})

// ==================== 登录 ====================

/**
 * POST /auth/login
 * Body: { email, password } 或 { username, password }
 * 支持邮箱和用户名两种登录方式
 */
router.post('/login', (req, res) => {
  try {
    const { email, username, password } = req.body

    if ((!email && !username) || !password) {
      return res.status(400).json({ error: '请填写账号和密码' })
    }

    // 查找用户：优先按用户名，其次按邮箱
    let user = null
    let loginField = ''
    if (username) {
      user = findUserByUsername(username)
      loginField = '用户名'
    } else if (email) {
      user = findUserByEmail(email)
      loginField = '邮箱'
    }

    if (!user) {
      return res.status(401).json({ error: `${loginField}或密码错误` })
    }

    if (!user.passwordHash) {
      return res.status(401).json({ error: '该账号未设置密码，请使用昵称+PIN登录' })
    }

    const isPasswordValid = bcrypt.compareSync(password, user.passwordHash)
    if (!isPasswordValid) {
      return res.status(401).json({ error: `${loginField}或密码错误` })
    }

    // 更新最后登录时间
    const now = new Date().toISOString()
    dbRun('UPDATE users SET lastLogin = ? WHERE userId = ?', [now, user.userId])

    const token = generateJwt(user.userId, user.email || user.username)

    res.json({
      success: true,
      data: {
        token,
        userId: user.userId,
        email: user.email,
        username: user.username,
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
 * 兼容新旧数据库结构：动态检测 username 列是否存在
 */
router.get('/profile', authRequired, (req, res) => {
  try {
    // 检测 users 表是否有 username 列（兼容旧数据库）
    let hasUsernameCol = false
    let hasAvatarCol = false
    try {
      const cols = dbAll("PRAGMA table_info('users')")
      hasUsernameCol = cols.some(c => c.name === 'username')
      hasAvatarCol = cols.some(c => c.name === 'avatar')
    } catch { /* 忽略，按无 username 处理 */ }

    const selectFields = ['userId', 'email']
    if (hasUsernameCol) selectFields.push('username')
    selectFields.push('nickname', 'createdAt', 'lastLogin')
    if (hasAvatarCol) selectFields.push('avatar')

    const sql = `SELECT ${selectFields.join(', ')} FROM users WHERE userId = ?`

    const user = dbGet(sql, [req.userId])
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    res.json({ success: true, data: user })
  } catch (err) {
    console.error('[Auth] 获取信息失败:', err.message)
    res.status(500).json({ error: '获取用户信息失败' })
  }
})

// ==================== 更新个人资料 ====================

/**
 * PUT /auth/update-profile
 * Body: { nickname } — 修改昵称
 */
router.put('/update-profile', authRequired, (req, res) => {
  try {
    const { nickname } = req.body

    if (!nickname) {
      return res.status(400).json({ error: '昵称不能为空' })
    }
    if (nickname.length < 2 || nickname.length > 20) {
      return res.status(400).json({ error: '昵称长度应为2-20个字符' })
    }

    const user = dbGet('SELECT * FROM users WHERE userId = ?', [req.userId])
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 检查昵称是否已被其他用户使用
    const trimmedNickname = nickname.trim()
    const existing = findUserByNickname(trimmedNickname, req.userId)
    if (existing) {
      return res.status(409).json({ error: '该昵称已被其他用户使用' })
    }

    updateUser(req.userId, { nickname: trimmedNickname })

    res.json({
      success: true,
      data: { nickname: trimmedNickname },
      message: '个人资料更新成功'
    })
  } catch (err) {
    console.error('[Auth] 更新资料失败:', err.message)
    res.status(500).json({ error: '更新资料失败，请稍后重试' })
  }
})

/**
 * POST /auth/check-nickname
 * Body: { nickname } — 检查昵称是否可用
 */
router.post('/check-nickname', (req, res) => {
  try {
    const { nickname } = req.body
    if (!nickname || nickname.trim().length < 2 || nickname.trim().length > 20) {
      return res.status(400).json({ success: false, error: '昵称长度应为2-20个字符' })
    }
    const existing = findUserByNickname(nickname.trim())
    res.json({ success: true, available: !existing })
  } catch (err) {
    console.error('[Auth] 检查昵称失败:', err.message)
    res.status(500).json({ error: '检查失败' })
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

// ==================== 用户名找回密码（密保问题） ====================

/**
 * POST /auth/forgot-password-username
 * Body: { username } — 返回密保问题
 */
router.post('/forgot-password-username', (req, res) => {
  try {
    const { username } = req.body
    if (!username) {
      return res.status(400).json({ error: '请输入用户名' })
    }

    const user = findUserByUsername(username)
    if (!user) {
      return res.status(404).json({ error: '该用户名不存在' })
    }
    if (!user.securityQuestion) {
      return res.status(400).json({ error: '该账号未设置密保问题，无法找回密码' })
    }

    res.json({
      success: true,
      data: {
        securityQuestion: user.securityQuestion
      }
    })
  } catch (err) {
    console.error('[Auth] 获取密保问题失败:', err.message)
    res.status(500).json({ error: '操作失败，请稍后重试' })
  }
})

/**
 * POST /auth/reset-password-username
 * Body: { username, securityAnswer, newPassword } — 验证密保答案并重置密码
 */
router.post('/reset-password-username', (req, res) => {
  try {
    const { username, securityAnswer, newPassword } = req.body

    if (!username || !securityAnswer || !newPassword) {
      return res.status(400).json({ error: '请填写所有必填项' })
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: '新密码长度不能少于6位' })
    }

    const user = findUserByUsername(username)
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }
    if (!user.securityAnswerHash) {
      return res.status(400).json({ error: '该账号未设置密保问题' })
    }

    // 验证密保答案
    const isAnswerValid = bcrypt.compareSync(securityAnswer.trim(), user.securityAnswerHash)
    if (!isAnswerValid) {
      return res.status(400).json({ error: '密保答案错误' })
    }

    // 重置密码
    const salt = bcrypt.genSaltSync(10)
    const newHash = bcrypt.hashSync(newPassword, salt)
    dbRun('UPDATE users SET passwordHash = ? WHERE userId = ?', [newHash, user.userId])

    console.log(`[Auth] 密码重置成功（用户名）: ${username}`)
    res.json({ success: true, message: '密码重置成功，请使用新密码登录' })
  } catch (err) {
    console.error('[Auth] 重置密码失败（用户名）:', err.message)
    res.status(500).json({ error: '重置密码失败，请稍后重试' })
  }
})

// ==================== 用户搜索（用于添加家庭成员） ====================

/**
 * GET /auth/users/search?q=keyword
 * 搜索已注册用户，用于添加家庭成员时查找
 */
router.get('/users/search', authRequired, (req, res) => {
  try {
    const { q } = req.query
    if (!q || q.trim().length === 0) {
      return res.json({ success: true, data: [] })
    }

    const keyword = `%${q.trim()}%`

    // 检测 users 表是否有 username 列（兼容旧数据库）
    let hasUsernameCol = false
    try {
      const cols = dbAll("PRAGMA table_info('users')")
      hasUsernameCol = cols.some(c => c.name === 'username')
    } catch { /* 忽略，按无 username 处理 */ }

    let rows
    if (hasUsernameCol) {
      rows = dbAll(
        'SELECT userId, nickname FROM users WHERE (nickname LIKE ? OR username LIKE ?) AND userId != ? LIMIT 20',
        [keyword, keyword, req.userId]
      )
    } else {
      rows = dbAll(
        'SELECT userId, nickname FROM users WHERE nickname LIKE ? AND userId != ? LIMIT 20',
        [keyword, req.userId]
      )
    }

    res.json({
      success: true,
      data: (rows || []).map(r => ({
        userId: r.userId,
        nickname: r.nickname
      }))
    })
  } catch (err) {
    console.error('[Auth] 搜索用户失败:', err.message)
    res.status(500).json({ success: false, error: '搜索失败' })
  }
})

// ==================== 头像上传 ====================

/**
 * POST /auth/avatar
 * 上传用户头像，需要登录
 * Content-Type: multipart/form-data
 * 字段名: avatar (文件)
 */
router.post('/avatar', authRequired, avatarUpload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请选择要上传的图片' })
    }

    const avatarPath = '/avatars/' + req.file.filename

    // 先删除旧头像文件
    const user = dbGet('SELECT avatar FROM users WHERE userId = ?', [req.userId])
    if (user && user.avatar) {
      const oldFilename = user.avatar.replace('/avatars/', '')
      const oldFilePath = path.join(AVATARS_DIR, oldFilename)
      try {
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath)
          console.log('[Auth] 已删除旧头像:', oldFilename)
        }
      } catch (e) {
        console.warn('[Auth] 删除旧头像失败:', e.message)
      }
    }

    // 更新数据库
    updateUser(req.userId, { avatar: avatarPath })

    res.json({
      success: true,
      data: { avatar: avatarPath }
    })
  } catch (err) {
    console.error('[Auth] 上传头像失败:', err.message)
    res.status(500).json({ error: '上传头像失败，请稍后重试' })
  }
}, (err, req, res, next) => {
  // multer 错误处理
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '文件大小不能超过 2MB' })
    }
    return res.status(400).json({ error: err.message })
  }
  if (err) {
    return res.status(400).json({ error: err.message })
  }
  next()
})

/**
 * DELETE /auth/avatar
 * 删除用户头像，需要登录
 */
router.delete('/avatar', authRequired, (req, res) => {
  try {
    const user = dbGet('SELECT avatar FROM users WHERE userId = ?', [req.userId])
    if (!user) {
      return res.status(404).json({ error: '用户不存在' })
    }

    // 删除服务器上的头像文件
    if (user.avatar) {
      const filename = user.avatar.replace('/avatars/', '')
      const filePath = path.join(AVATARS_DIR, filename)
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath)
          console.log('[Auth] 已删除头像文件:', filename)
        }
      } catch (e) {
        console.warn('[Auth] 删除头像文件失败:', e.message)
      }
    }

    // 清空数据库中的 avatar 字段
    updateUser(req.userId, { avatar: null })

    res.json({
      success: true,
      message: '头像已删除'
    })
  } catch (err) {
    console.error('[Auth] 删除头像失败:', err.message)
    res.status(500).json({ error: '删除头像失败，请稍后重试' })
  }
})

export default router
