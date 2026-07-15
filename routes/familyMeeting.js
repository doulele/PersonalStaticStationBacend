/**
 * 家庭会议系统 API（SQLite 版）
 * --------------------------------------------------------------
 * 数据存储在 SQLite 表 family_meeting_state 中，state 为 JSON blob。
 * 保持与前端 Vuex store 结构一致的全量状态同步模式。
 */
import { Router } from 'express'
import { existsSync, mkdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { transcribe, detectEngines, cleanupTempFiles } from '../services/whisper.js'
import { dbGet, dbRun, dbAll, getFamilyId } from '../services/db.js'
import { authRequired } from '../middlewares/auth.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ---- multer 文件上传配置 ----
const uploadDir = join(__dirname, '..', 'data', 'uploads')
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['audio/webm', 'audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/mp4', 'audio/x-m4a', 'application/octet-stream']
    if (allowed.includes(file.mimetype) || file.originalname.match(/\.(webm|wav|mp3|ogg|m4a|opus)$/i)) {
      cb(null, true)
    } else {
      cb(new Error(`不支持的音频格式: ${file.mimetype}`))
    }
  }
})

// ---- 默认空状态 ----
const DEFAULT_STATE = () => ({
  family: null,
  members: [],
  currentUserId: null,
  meetings: [],
  agendaItems: [],
  records: [],
  patches: [],
  tasks: [],
  emotionLogs: [],
  settings: {
    autoDeleteAudio: true,
    hotwords: '决定,结论,先搁置,行动项,待定',
    transcribeMode: 'mock',
    backendUrl: ''
  }
})

// ---- 工具函数 ----

/**
 * 加载状态：根据登录用户的 userId 查找其家庭ID，再加载共享的家庭状态
 * 如果用户不属于任何家庭，返回默认空状态
 */
function loadState(userId) {
  try {
    const familyId = getFamilyId(userId)
    if (!familyId) return DEFAULT_STATE()

    const row = dbGet('SELECT state FROM family_meeting_state WHERE familyId = ?', [familyId])
    if (!row || !row.state) return DEFAULT_STATE()
    const state = JSON.parse(row.state)
    const merged = { ...DEFAULT_STATE(), ...state, settings: { ...DEFAULT_STATE().settings, ...(state.settings || {}) } }

    // 自动修复：旧数据里创建家庭时管理员成员 ID 用了随机 uid，和真实 userId 不一致
    // 根据 membership 表把当前用户补进成员列表，并修正单管理员场景下的 ID
    const memberships = dbAll(
      'SELECT userId, memberName, role FROM family_meeting_memberships WHERE familyId = ?',
      [familyId]
    )
    const myMembership = memberships.find(m => m.userId === userId)
    if (myMembership && !merged.members.find(m => m.id === userId)) {
      const adminMembers = merged.members.filter(m => m.role === 'admin')
      if (adminMembers.length === 1) {
        // 唯一的管理员就是旧数据里被随机 ID 化的当前用户，直接替换 ID
        adminMembers[0].id = userId
        if (!adminMembers[0].name && myMembership.memberName) {
          adminMembers[0].name = myMembership.memberName
        }
        if (merged.family?.adminId) merged.family.adminId = userId
      } else {
        // 无法确定对应哪个旧成员，新增一条当前用户记录
        merged.members.push({
          id: userId,
          name: myMembership.memberName || '',
          role: myMembership.role || 'member'
        })
      }
    }

    // 再确保其他 membership 用户也都有成员条目
    for (const ms of memberships) {
      if (ms.userId === userId) continue
      const exists = merged.members.find(m => m.id === ms.userId)
      if (!exists) {
        merged.members.push({
          id: ms.userId,
          name: ms.memberName || '',
          role: ms.role || 'member'
        })
      } else if (ms.memberName && !exists.name) {
        exists.name = ms.memberName
      }
    }

    return merged
  } catch (e) {
    console.error(`[family-meeting] 加载状态失败 (userId=${userId}):`, e.message)
    return DEFAULT_STATE()
  }
}

/**
 * 保存状态：根据 state.family.id 或用户 membership 确定 familyId
 * 自动创建 membership（如果用户尚未有记录）
 */
function saveState(userId, state) {
  try {
    // 优先从 state 中获取 familyId（创建家庭时），否则从 membership 查找
    const familyId = state?.family?.id || getFamilyId(userId)
    if (!familyId) {
      console.warn(`[family-meeting] saveState: 用户 ${userId} 没有家庭空间，无法保存`)
      return false
    }

    // 从成员列表中提取当前用户的名称和角色，写入 membership
    const me = state?.members?.find(m => m.id === userId)
    const memberName = me?.name || ''
    const role = me?.role || 'member'

    dbRun(
      'INSERT OR IGNORE INTO family_meeting_memberships (id, familyId, userId, memberName, role, joinedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [uid('ms'), familyId, userId, memberName, role, new Date().toISOString()]
    )

    dbRun(
      'INSERT OR REPLACE INTO family_meeting_state (familyId, state) VALUES (?, ?)',
      [familyId, JSON.stringify(state)]
    )
    return true
  } catch (e) {
    console.error(`[family-meeting] 保存状态失败 (userId=${userId}):`, e.message)
    return false
  }
}

function uid(prefix = 'id') {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${ts}${rand}`
}

function findIndex(arr, id) {
  return arr.findIndex(item => item.id === id)
}

function patchItem(arr, id, patch) {
  const idx = findIndex(arr, id)
  if (idx !== -1) Object.assign(arr[idx], patch)
  return idx !== -1
}

function removeItem(arr, id) {
  const idx = findIndex(arr, id)
  if (idx !== -1) arr.splice(idx, 1)
  return idx !== -1
}

const router = Router()

// ==================== 全量状态 ====================

router.get('/state', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    res.json({ success: true, data: state })
  } catch (err) {
    console.error(`[family-meeting] GET /state 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '读取数据失败' })
  }
})

router.post('/state', authRequired, (req, res) => {
  try {
    const state = req.body
    if (!state || typeof state !== 'object') {
      return res.status(400).json({ success: false, error: '无效的数据格式' })
    }
    const ok = saveState(req.userId, state)
    if (!ok) return res.status(500).json({ success: false, error: '保存失败' })
    res.json({ success: true })
  } catch (err) {
    console.error(`[family-meeting] POST /state 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '保存数据失败' })
  }
})

router.delete('/state', authRequired, (req, res) => {
  try {
    const familyId = getFamilyId(req.userId)
    if (!familyId) {
      return res.status(404).json({ success: false, error: '没有家庭空间可重置' })
    }
    // 重置家庭状态（所有成员都能看到重置后的空状态）
    const emptyState = { ...DEFAULT_STATE(), family: { id: familyId } }
    dbRun('INSERT OR REPLACE INTO family_meeting_state (familyId, state) VALUES (?, ?)',
      [familyId, JSON.stringify(emptyState)])
    res.json({ success: true, data: emptyState })
  } catch (err) {
    console.error(`[family-meeting] DELETE /state 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '重置失败' })
  }
})

// ==================== 家庭空间 ====================

router.post('/family', authRequired, (req, res) => {
  try {
    const { name, adminName } = req.body
    if (!name || !adminName) {
      return res.status(400).json({ success: false, error: '缺少 name 或 adminName' })
    }
    const state = loadState(req.userId)
    if (state.family) {
      return res.status(409).json({ success: false, error: '家庭空间已存在' })
    }
    // 使用真实登录用户 ID 作为成员 ID，确保前端能匹配当前用户
    state.family = { id: uid('f'), name: name.trim(), adminId: req.userId }
    state.members = [{ id: req.userId, name: adminName.trim(), role: 'admin' }]
    state.currentUserId = req.userId
    saveState(req.userId, state)
    console.log(`[family-meeting] 创建家庭: ${name}, 管理员: ${adminName}, userId: ${req.userId}`)
    res.json({ success: true, data: state.family })
  } catch (err) {
    console.error(`[family-meeting] POST /family 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '创建失败' })
  }
})

/** 🚪 退出家庭空间 — 移除当前用户的 membership，如果家庭无剩余成员则清理数据 */
router.post('/family/leave', authRequired, (req, res) => {
  try {
    const familyId = getFamilyId(req.userId)
    if (!familyId) {
      return res.status(404).json({ success: false, error: '你当前没有加入任何家庭空间' })
    }

    // 获取当前家庭信息
    const row = dbGet('SELECT state FROM family_meeting_state WHERE familyId = ?', [familyId])
    let familyName = '未知'
    if (row?.state) {
      try {
        familyName = JSON.parse(row.state)?.family?.name || '未知'
      } catch { }
    }

    // 删除该用户的 membership
    dbRun('DELETE FROM family_meeting_memberships WHERE userId = ?', [req.userId])

    // 从共享状态中移除该用户对应的成员
    if (row?.state) {
      try {
        const state = JSON.parse(row.state)
        // 移除该用户在 members 中的记录
        state.members = state.members.filter(m => m.id !== req.userId)
        // 从所有会议的参与者中移除
        state.meetings.forEach(m => {
          m.participants = m.participants.filter(p => p !== req.userId)
        })
        dbRun(
          'INSERT OR REPLACE INTO family_meeting_state (familyId, state) VALUES (?, ?)',
          [familyId, JSON.stringify(state)]
        )
      } catch { }
    }

    // 检查家庭是否还有剩余成员
    const remaining = dbGet(
      'SELECT COUNT(*) as cnt FROM family_meeting_memberships WHERE familyId = ?',
      [familyId]
    )
    if (!remaining || remaining.cnt === 0) {
      dbRun('DELETE FROM family_meeting_state WHERE familyId = ?', [familyId])
      console.log(`[family-meeting] 家庭「${familyName}」(familyId=${familyId}) 无剩余成员，已清理全部数据`)
    }

    console.log(`[family-meeting] 用户 ${req.userId} 已退出家庭「${familyName}」`)
    res.json({ success: true, message: `已退出家庭空间「${familyName}」` })
  } catch (err) {
    console.error(`[family-meeting] POST /family/leave 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '退出失败' })
  }
})

// ==================== 成员管理 ====================

router.post('/members', authRequired, (req, res) => {
  try {
    const { name, role } = req.body
    if (!name) return res.status(400).json({ success: false, error: '缺少成员姓名' })
    const state = loadState(req.userId)
    if (!state.family) return res.status(400).json({ success: false, error: '请先创建家庭空间' })
    const member = { id: uid('u'), name: name.trim(), role: role || 'member' }
    state.members.push(member)
    saveState(req.userId, state)
    res.json({ success: true, data: member })
  } catch (err) {
    console.error(`[family-meeting] POST /members 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

router.delete('/members/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!state.family) return res.status(404).json({ success: false, error: '家庭空间不存在' })
    if (!removeItem(state.members, id)) {
      return res.status(404).json({ success: false, error: '成员不存在' })
    }
    state.meetings.forEach(m => {
      m.participants = m.participants.filter(p => p !== id)
    })
    if (state.currentUserId === id) state.currentUserId = null
    saveState(req.userId, state)
    res.json({ success: true })
  } catch (err) {
    console.error(`[family-meeting] DELETE /members 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

router.put('/members/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!patchItem(state.members, id, req.body)) {
      return res.status(404).json({ success: false, error: '成员不存在' })
    }
    saveState(req.userId, state)
    res.json({ success: true, data: state.members.find(m => m.id === id) })
  } catch (err) {
    console.error(`[family-meeting] PUT /members 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

// ==================== 当前用户 ====================

router.put('/current-user', authRequired, (req, res) => {
  try {
    const { userId } = req.body
    const state = loadState(req.userId)
    if (!state.members.find(m => m.id === userId)) {
      return res.status(404).json({ success: false, error: '成员不存在' })
    }
    state.currentUserId = userId
    saveState(req.userId, state)
    res.json({ success: true, data: state.members.find(m => m.id === userId) })
  } catch (err) {
    console.error(`[family-meeting] PUT /current-user 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '切换失败' })
  }
})

// ==================== 会议 ====================

router.get('/meetings', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    res.json({ success: true, data: state.meetings })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/meetings', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    if (!state.family) return res.status(400).json({ success: false, error: '请先创建家庭空间' })
    const meeting = {
      id: uid('m'),
      familyId: state.family.id,
      title: req.body.title,
      date: req.body.date || new Date().toISOString().slice(0, 10),
      status: 'pre',
      participants: req.body.participants || [],
      visibility: req.body.visibility || 'normal',
      encrypted: !!req.body.encrypted,
      encryptPass: req.body.encryptPass || '',
      agendaLocked: false,
      createdAt: new Date().toISOString()
    }
    state.meetings.push(meeting)
    saveState(req.userId, state)
    res.json({ success: true, data: meeting })
  } catch (err) {
    console.error(`[family-meeting] POST /meetings 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '创建失败' })
  }
})

router.put('/meetings/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!patchItem(state.meetings, id, req.body)) {
      return res.status(404).json({ success: false, error: '会议不存在' })
    }
    saveState(req.userId, state)
    res.json({ success: true, data: state.meetings.find(m => m.id === id) })
  } catch (err) {
    console.error(`[family-meeting] PUT /meetings 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

router.delete('/meetings/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!removeItem(state.meetings, id)) {
      return res.status(404).json({ success: false, error: '会议不存在' })
    }
    state.agendaItems = state.agendaItems.filter(a => a.meetingId !== id)
    state.records = state.records.filter(r => r.meetingId !== id)
    state.tasks = state.tasks.filter(t => t.meetingId !== id)
    state.patches = state.patches.filter(p => p.meetingId !== id)
    state.emotionLogs = state.emotionLogs.filter(e => e.meetingId !== id)
    saveState(req.userId, state)
    res.json({ success: true })
  } catch (err) {
    console.error(`[family-meeting] DELETE /meetings 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// ==================== 议题 ====================

router.get('/agenda-items', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const { meetingId } = req.query
    const items = meetingId
      ? state.agendaItems.filter(a => a.meetingId === meetingId)
      : state.agendaItems
    res.json({ success: true, data: items })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/agenda-items', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const item = {
      id: uid('a'),
      meetingId: req.body.meetingId,
      authorId: req.body.authorId || state.currentUserId,
      title: req.body.title,
      category: req.body.category || '其他',
      desc: req.body.desc || '',
      priority: req.body.priority || 2,
      resonance: [],
      emotionLevel: req.body.emotionLevel ?? null,
      createdAt: new Date().toISOString()
    }
    state.agendaItems.push(item)
    saveState(req.userId, state)
    res.json({ success: true, data: item })
  } catch (err) {
    console.error(`[family-meeting] POST /agenda-items 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

router.put('/agenda-items/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!patchItem(state.agendaItems, id, req.body)) {
      return res.status(404).json({ success: false, error: '议题不存在' })
    }
    saveState(req.userId, state)
    res.json({ success: true, data: state.agendaItems.find(a => a.id === id) })
  } catch (err) {
    console.error(`[family-meeting] PUT /agenda-items 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

router.delete('/agenda-items/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!removeItem(state.agendaItems, id)) {
      return res.status(404).json({ success: false, error: '议题不存在' })
    }
    state.patches = state.patches.filter(p => !(p.targetType === 'agenda' && p.targetId === id))
    saveState(req.userId, state)
    res.json({ success: true })
  } catch (err) {
    console.error(`[family-meeting] DELETE /agenda-items 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

router.post('/agenda-items/:id/resonance', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const { userId } = req.body
    if (!userId) return res.status(400).json({ success: false, error: '缺少 userId' })
    const state = loadState(req.userId)
    const item = state.agendaItems.find(a => a.id === id)
    if (!item) return res.status(404).json({ success: false, error: '议题不存在' })
    const idx = item.resonance.indexOf(userId)
    if (idx >= 0) item.resonance.splice(idx, 1)
    else item.resonance.push(userId)
    saveState(req.userId, state)
    res.json({ success: true, data: item })
  } catch (err) {
    console.error(`[family-meeting] POST /agenda-items/:id/resonance 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// ==================== 会议记录 ====================

router.get('/records', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const { meetingId } = req.query
    const items = meetingId
      ? state.records.filter(r => r.meetingId === meetingId).sort((a, b) => a.seq - b.seq)
      : state.records
    res.json({ success: true, data: items })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/records', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const meetingRecords = state.records.filter(r => r.meetingId === req.body.meetingId)
    const record = {
      id: uid('r'),
      meetingId: req.body.meetingId,
      seq: meetingRecords.length + 1,
      timestamp: req.body.timestamp || new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      speakerId: req.body.speakerId || state.currentUserId,
      content: req.body.content || '',
      autoTags: req.body.autoTags || [],
      manualTags: req.body.manualTags || [],
      createdAt: new Date().toISOString()
    }
    state.records.push(record)
    saveState(req.userId, state)
    res.json({ success: true, data: record })
  } catch (err) {
    console.error(`[family-meeting] POST /records 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

router.put('/records/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!patchItem(state.records, id, req.body)) {
      return res.status(404).json({ success: false, error: '记录不存在' })
    }
    saveState(req.userId, state)
    res.json({ success: true, data: state.records.find(r => r.id === id) })
  } catch (err) {
    console.error(`[family-meeting] PUT /records 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

router.delete('/records/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!removeItem(state.records, id)) {
      return res.status(404).json({ success: false, error: '记录不存在' })
    }
    state.tasks = state.tasks.filter(t => t.recordId !== id)
    state.patches = state.patches.filter(p => !(p.targetType === 'record' && p.targetId === id))
    saveState(req.userId, state)
    res.json({ success: true })
  } catch (err) {
    console.error(`[family-meeting] DELETE /records 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// ==================== 补丁 ====================

router.get('/patches', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const { targetType, targetId, meetingId } = req.query
    let items = state.patches
    if (targetType) items = items.filter(p => p.targetType === targetType)
    if (targetId) items = items.filter(p => p.targetId === targetId)
    if (meetingId) items = items.filter(p => p.meetingId === meetingId)
    items.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    res.json({ success: true, data: items })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/patches', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const patch = {
      id: uid('p'),
      targetType: req.body.targetType,
      targetId: req.body.targetId,
      meetingId: req.body.meetingId,
      content: req.body.content,
      patchType: req.body.patchType || '补充',
      authorId: req.body.authorId || state.currentUserId,
      createdAt: new Date().toISOString()
    }
    state.patches.push(patch)
    saveState(req.userId, state)
    res.json({ success: true, data: patch })
  } catch (err) {
    console.error(`[family-meeting] POST /patches 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

router.delete('/patches/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!removeItem(state.patches, id)) {
      return res.status(404).json({ success: false, error: '补丁不存在' })
    }
    saveState(req.userId, state)
    res.json({ success: true })
  } catch (err) {
    console.error(`[family-meeting] DELETE /patches 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// ==================== 任务 ====================

router.get('/tasks', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const { meetingId } = req.query
    const items = meetingId
      ? state.tasks.filter(t => t.meetingId === meetingId)
      : state.tasks
    res.json({ success: true, data: items })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/tasks', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const task = {
      id: uid('t'),
      recordId: req.body.recordId || null,
      meetingId: req.body.meetingId,
      title: req.body.title,
      assignee: req.body.assignee || null,
      dueDate: req.body.dueDate || null,
      status: req.body.status || 'todo',
      createdAt: new Date().toISOString()
    }
    state.tasks.push(task)
    saveState(req.userId, state)
    res.json({ success: true, data: task })
  } catch (err) {
    console.error(`[family-meeting] POST /tasks 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

router.put('/tasks/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!patchItem(state.tasks, id, req.body)) {
      return res.status(404).json({ success: false, error: '任务不存在' })
    }
    saveState(req.userId, state)
    res.json({ success: true, data: state.tasks.find(t => t.id === id) })
  } catch (err) {
    console.error(`[family-meeting] PUT /tasks 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

router.delete('/tasks/:id', authRequired, (req, res) => {
  try {
    const { id } = req.params
    const state = loadState(req.userId)
    if (!removeItem(state.tasks, id)) {
      return res.status(404).json({ success: false, error: '任务不存在' })
    }
    saveState(req.userId, state)
    res.json({ success: true })
  } catch (err) {
    console.error(`[family-meeting] DELETE /tasks 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// ==================== 情绪日志 ====================

router.get('/emotions', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const { meetingId, userId } = req.query
    let items = state.emotionLogs
    if (meetingId) items = items.filter(e => e.meetingId === meetingId)
    if (userId) items = items.filter(e => e.userId === userId)
    res.json({ success: true, data: items })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/emotions', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const log = {
      id: uid('e'),
      userId: req.body.userId || state.currentUserId,
      meetingId: req.body.meetingId || null,
      level: req.body.level,
      note: req.body.note || '',
      createdAt: new Date().toISOString()
    }
    state.emotionLogs.push(log)
    saveState(req.userId, state)
    res.json({ success: true, data: log })
  } catch (err) {
    console.error(`[family-meeting] POST /emotions 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

// ==================== 设置 ====================

router.get('/settings', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    res.json({ success: true, data: state.settings })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.put('/settings', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    Object.assign(state.settings, req.body)
    saveState(req.userId, state)
    res.json({ success: true, data: state.settings })
  } catch (err) {
    console.error(`[family-meeting] PUT /settings 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '保存失败' })
  }
})

// ==================== 备份导出/导入 ====================

router.get('/export', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    const backup = {
      exportedAt: new Date().toISOString(),
      family: state.family,
      members: state.members,
      meetings: state.meetings,
      agendaItems: state.agendaItems,
      records: state.records,
      patches: state.patches,
      tasks: state.tasks,
      emotionLogs: state.emotionLogs
    }
    const json = JSON.stringify(backup, null, 2)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="family-meeting-backup-${new Date().toISOString().slice(0, 10)}.json"`)
    res.send(json)
  } catch (err) {
    console.error(`[family-meeting] GET /export 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '导出失败' })
  }
})

router.post('/import', authRequired, (req, res) => {
  try {
    const backup = req.body
    if (!backup || !backup.family || !backup.members) {
      return res.status(400).json({ success: false, error: '无效的备份数据' })
    }
    const state = loadState(req.userId)
    const currentSettings = state.settings
    Object.assign(state, backup, { settings: currentSettings })
    saveState(req.userId, state)
    console.log(`[family-meeting] 导入备份, 家庭: ${state.family.name}, userId: ${req.userId}`)
    res.json({ success: true, data: { family: state.family, membersCount: state.members.length, meetingsCount: state.meetings.length } })
  } catch (err) {
    console.error(`[family-meeting] POST /import 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '导入失败' })
  }
})

// ==================== 🔗 邀请机制 ====================

/** 生成/刷新邀请码 */
router.post('/invite/generate', authRequired, (req, res) => {
  try {
    const state = loadState(req.userId)
    if (!state.family) {
      return res.status(400).json({ success: false, error: '请先创建家庭空间' })
    }
    // 生成 6 位字母数字邀请码
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    let code = 'FAM-'
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)]
    }
    state.family.inviteCode = code
    state.family.inviteCreatedAt = new Date().toISOString()
    saveState(req.userId, state)
    console.log(`[family-meeting] 生成邀请码: ${code}, userId: ${req.userId}`)
    res.json({ success: true, data: { inviteCode: code } })
  } catch (err) {
    console.error(`[family-meeting] POST /invite/generate 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '生成失败' })
  }
})

/** 通过邀请码加入家庭 — 需登录；支持 deleteExisting 删除旧空间后加入 */
router.post('/invite/join', authRequired, (req, res) => {
  try {
    const { inviteCode, userName, deleteExisting } = req.body
    if (!inviteCode || !userName) {
      return res.status(400).json({ success: false, error: '缺少邀请码或用户名' })
    }

    // 🔒 检查当前用户是否已属于某个家庭
    const currentFamilyId = getFamilyId(req.userId)
    if (currentFamilyId) {
      // 遍历所有家庭状态，查找匹配的邀请码
      const allRows = dbAll('SELECT familyId, state FROM family_meeting_state')
      let targetFamilyId = null
      for (const row of allRows) {
        try {
          const s = JSON.parse(row.state)
          if (s.family?.inviteCode?.toUpperCase() === inviteCode.toUpperCase()) {
            targetFamilyId = row.familyId
            break
          }
        } catch { /* skip */ }
      }

      // 如果要加入的就是当前家庭
      if (targetFamilyId && targetFamilyId === currentFamilyId) {
        return res.status(400).json({ success: false, error: '不能加入自己的家庭空间' })
      }

      // 获取当前家庭名称
      let currentFamilyName = '未知'
      const currentRow = dbGet('SELECT state FROM family_meeting_state WHERE familyId = ?', [currentFamilyId])
      if (currentRow?.state) {
        try {
          currentFamilyName = JSON.parse(currentRow.state)?.family?.name || '未知'
        } catch { }
      }

      if (!deleteExisting) {
        return res.json({
          success: false,
          needConfirm: true,
          existingFamily: { name: currentFamilyName },
          error: `你当前已有家庭空间「${currentFamilyName}」，加入新空间将离开当前空间`
        })
      }

      // 🔥 确认离开当前家庭：删除 membership
      dbRun('DELETE FROM family_meeting_memberships WHERE userId = ?', [req.userId])

      // 检查旧家庭是否还有其他成员，没有则清理 state
      const remainingMembers = dbGet(
        'SELECT COUNT(*) as cnt FROM family_meeting_memberships WHERE familyId = ?',
        [currentFamilyId]
      )
      if (!remainingMembers || remainingMembers.cnt === 0) {
        dbRun('DELETE FROM family_meeting_state WHERE familyId = ?', [currentFamilyId])
        console.log(`[family-meeting] 家庭 ${currentFamilyId} 无剩余成员，已清理`)
      }

      console.log(`[family-meeting] 用户 ${req.userId} 离开旧家庭「${currentFamilyName}」`)
    }

    // 遍历所有家庭状态，查找匹配的邀请码
    const allRows = dbAll('SELECT familyId, state FROM family_meeting_state')
    let targetFamilyId = null
    let targetState = null

    for (const row of allRows) {
      try {
        const s = JSON.parse(row.state)
        if (s.family?.inviteCode?.toUpperCase() === inviteCode.toUpperCase()) {
          targetFamilyId = row.familyId
          targetState = s
          break
        }
      } catch { /* skip malformed data */ }
    }

    if (!targetState || !targetState.family) {
      return res.status(400).json({ success: false, error: '邀请码无效或家庭空间不存在' })
    }

    // 检查是否已是成员（按名称）
    const exists = targetState.members.find(m => m.name === userName.trim())
    if (exists) {
      // 确保 membership 存在
      dbRun(
        'INSERT OR IGNORE INTO family_meeting_memberships (id, familyId, userId, memberName, role, joinedAt) VALUES (?, ?, ?, ?, ?, ?)',
        [uid('ms'), targetFamilyId, req.userId, userName.trim(), exists.role || 'member', new Date().toISOString()]
      )
      return res.json({
        success: true,
        data: { ...targetState.family, existingMember: exists },
        message: '你已经是该家庭的成员'
      })
    }

    // 添加新成员到共享状态（使用 auth userId 作为成员 ID，确保与前端 authUserId 一致）
    const member = { id: req.userId, name: userName.trim(), role: 'member' }
    targetState.members.push(member)
    // 自动将新成员加入所有非私密会议的参与者列表
    targetState.meetings.forEach(m => {
      if (m.visibility !== 'private' && !m.participants.includes(member.id)) {
        m.participants.push(member.id)
      }
    })
    // 保存更新后的共享状态
    dbRun(
      'INSERT OR REPLACE INTO family_meeting_state (familyId, state) VALUES (?, ?)',
      [targetFamilyId, JSON.stringify(targetState)]
    )

    // 🔑 关键修复：为加入者创建 membership 记录，使其能访问共享的家庭数据
    dbRun(
      'INSERT OR IGNORE INTO family_meeting_memberships (id, familyId, userId, memberName, role, joinedAt) VALUES (?, ?, ?, ?, ?, ?)',
      [uid('ms'), targetFamilyId, req.userId, userName.trim(), 'member', new Date().toISOString()]
    )

    console.log(`[family-meeting] ${userName} (userId=${req.userId}) 通过邀请码 ${inviteCode} 加入家庭「${targetState.family.name}」familyId=${targetFamilyId}`)
    res.json({ success: true, data: { family: targetState.family, member, members: targetState.members } })
  } catch (err) {
    console.error(`[family-meeting] POST /invite/join 失败 (userId=${req.userId}):`, err)
    res.status(500).json({ success: false, error: '加入失败' })
  }
})

// ==================== 语音转写 ====================

router.get('/transcribe/engines', async (_req, res) => {
  try {
    const engines = await detectEngines()
    res.json({ success: true, data: { engines } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: '未上传音频文件' })
  }

  const hotwords = req.body.hotwords
    ? req.body.hotwords.split(',').map(w => w.trim()).filter(Boolean)
    : []

  try {
    const result = await transcribe(req.file.path, {
      language: req.body.language || 'zh',
      hotwords
    })
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('[family-meeting] 转写失败:', err.message)
    res.status(500).json({ success: false, error: err.message })
  } finally {
    if (req.file?.path) {
      cleanupTempFiles(req.file.path)
    }
  }
})

export default router
