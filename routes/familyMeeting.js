/**
 * 家庭会议系统 API
 * --------------------------------------------------------------
 * 数据存储在 data/family-meeting.json，与前端 Vuex store 结构一致。
 * 提供全量状态加载/保存 + 单个实体的 CRUD 端点。
 */
import { Router } from 'express'
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import multer from 'multer'
import { transcribe, detectEngines, cleanupTempFiles } from '../services/whisper.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DATA_PATH = join(__dirname, '..', 'data', 'family-meeting.json')

// ---- 自动备份配置 ----
const BACKUP_DIR = join(__dirname, '..', 'data', 'backups')
const MAX_BACKUPS = 30 // 保留最近30份备份
let _backupThrottle = 0  // 节流：5分钟内最多备份一次

function backupState(state) {
  try {
    // 节流：5分钟内不重复备份
    const now = Date.now()
    if (now - _backupThrottle < 5 * 60 * 1000) return
    _backupThrottle = now

    mkdirSync(BACKUP_DIR, { recursive: true })
    // 生成带时间戳的文件名
    const ts = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
    const backupPath = join(BACKUP_DIR, `family-meeting-${ts}.json`)
    writeFileSync(backupPath, JSON.stringify(state, null, 2), 'utf-8')

    // 异步清理旧备份
    cleanupOldBackups()
  } catch (e) {
    console.warn('[family-meeting] 自动备份写入失败:', e.message)
  }
}

function cleanupOldBackups() {
  try {
    if (!existsSync(BACKUP_DIR)) return
    const entries = readdirSync(BACKUP_DIR, { withFileTypes: true })
    const files = entries
      .filter(d => d.isFile() && d.name.startsWith('family-meeting-') && d.name.endsWith('.json'))
      .map(d => ({
        path: join(BACKUP_DIR, d.name),
        // 从文件名提取时间：family-meeting-2026-07-13T14-10-30.json
        name: d.name
      }))
      .sort((a, b) => b.name.localeCompare(a.name)) // 文件名倒序（最新在前）

    const toDelete = files.slice(MAX_BACKUPS)
    for (const f of toDelete) {
      try {
        unlinkSync(f.path)
      } catch {}
    }
    if (toDelete.length > 0) {
      console.log(`[family-meeting] 清理了 ${toDelete.length} 份旧备份`)
    }
  } catch {
    // 静默失败，不影响主流程
  }
}

// ---- multer 文件上传配置 ----
const uploadDir = join(__dirname, '..', 'data', 'uploads')
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
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
function loadState() {
  try {
    if (!existsSync(DATA_PATH)) return DEFAULT_STATE()
    const raw = readFileSync(DATA_PATH, 'utf-8')
    const state = JSON.parse(raw)
    // 合并默认值（兼容新增字段）
    return { ...DEFAULT_STATE(), ...state, settings: { ...DEFAULT_STATE().settings, ...(state.settings || {}) } }
  } catch (e) {
    console.error('[family-meeting] 加载状态失败:', e.message)
    return DEFAULT_STATE()
  }
}

function saveState(state) {
  try {
    mkdirSync(dirname(DATA_PATH), { recursive: true })
    writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf-8')
    // 自动备份（5分钟节流）
    backupState(state)
    return true
  } catch (e) {
    console.error('[family-meeting] 保存状态失败:', e.message)
    return false
  }
}

function uid(prefix = 'id') {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).slice(2, 8)
  return `${prefix}_${ts}${rand}`
}

// ---- 辅助：按 ID 查找并更新/删除数组中的项 ----
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

/**
 * GET /family-meeting/state
 * 获取完整状态（前端初始化时调用）
 */
router.get('/state', (_req, res) => {
  try {
    const state = loadState()
    res.json({ success: true, data: state })
  } catch (err) {
    console.error('[family-meeting] GET /state 失败:', err)
    res.status(500).json({ success: false, error: '读取数据失败' })
  }
})

/**
 * POST /family-meeting/state
 * 保存完整状态（前端 debounce 后批量同步）
 */
router.post('/state', (req, res) => {
  try {
    const state = req.body
    if (!state || typeof state !== 'object') {
      return res.status(400).json({ success: false, error: '无效的数据格式' })
    }
    const ok = saveState(state)
    if (!ok) return res.status(500).json({ success: false, error: '保存失败' })
    res.json({ success: true })
  } catch (err) {
    console.error('[family-meeting] POST /state 失败:', err)
    res.status(500).json({ success: false, error: '保存数据失败' })
  }
})

/**
 * DELETE /family-meeting/state
 * 重置所有数据
 */
router.delete('/state', (_req, res) => {
  try {
    saveState(DEFAULT_STATE())
    res.json({ success: true, data: DEFAULT_STATE() })
  } catch (err) {
    console.error('[family-meeting] DELETE /state 失败:', err)
    res.status(500).json({ success: false, error: '重置失败' })
  }
})

// ==================== 家庭空间 ====================

/**
 * POST /family-meeting/family
 * 创建家庭空间（同时添加管理员成员）
 * Body: { name, adminName }
 */
router.post('/family', (req, res) => {
  try {
    const { name, adminName } = req.body
    if (!name || !adminName) {
      return res.status(400).json({ success: false, error: '缺少 name 或 adminName' })
    }
    const state = loadState()
    if (state.family) {
      return res.status(409).json({ success: false, error: '家庭空间已存在' })
    }
    const adminId = uid('u')
    state.family = { id: uid('f'), name: name.trim(), adminId }
    state.members = [{ id: adminId, name: adminName.trim(), role: 'admin' }]
    state.currentUserId = adminId
    saveState(state)
    console.log(`[family-meeting] 创建家庭: ${name}, 管理员: ${adminName}`)
    res.json({ success: true, data: state.family })
  } catch (err) {
    console.error('[family-meeting] POST /family 失败:', err)
    res.status(500).json({ success: false, error: '创建失败' })
  }
})

// ==================== 成员管理 ====================

/**
 * POST /family-meeting/members
 * 添加成员
 * Body: { name, role? }
 */
router.post('/members', (req, res) => {
  try {
    const { name, role } = req.body
    if (!name) return res.status(400).json({ success: false, error: '缺少成员姓名' })
    const state = loadState()
    if (!state.family) return res.status(400).json({ success: false, error: '请先创建家庭空间' })
    const member = { id: uid('u'), name: name.trim(), role: role || 'member' }
    state.members.push(member)
    saveState(state)
    res.json({ success: true, data: member })
  } catch (err) {
    console.error('[family-meeting] POST /members 失败:', err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

/**
 * DELETE /family-meeting/members/:id
 * 删除成员（同时清理关联数据）
 */
router.delete('/members/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!state.family) return res.status(404).json({ success: false, error: '家庭空间不存在' })
    if (!removeItem(state.members, id)) {
      return res.status(404).json({ success: false, error: '成员不存在' })
    }
    // 从会议参与者中移除
    state.meetings.forEach(m => {
      m.participants = m.participants.filter(p => p !== id)
    })
    // 如果删除的是当前用户，清空 currentUserId
    if (state.currentUserId === id) state.currentUserId = null
    saveState(state)
    res.json({ success: true })
  } catch (err) {
    console.error('[family-meeting] DELETE /members 失败:', err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

/**
 * PUT /family-meeting/members/:id
 * 更新成员信息
 * Body: { name?, role? }
 */
router.put('/members/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!patchItem(state.members, id, req.body)) {
      return res.status(404).json({ success: false, error: '成员不存在' })
    }
    saveState(state)
    res.json({ success: true, data: state.members.find(m => m.id === id) })
  } catch (err) {
    console.error('[family-meeting] PUT /members 失败:', err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

// ==================== 当前用户 ====================

/**
 * PUT /family-meeting/current-user
 * 切换当前操作用户
 * Body: { userId }
 */
router.put('/current-user', (req, res) => {
  try {
    const { userId } = req.body
    const state = loadState()
    if (!state.members.find(m => m.id === userId)) {
      return res.status(404).json({ success: false, error: '成员不存在' })
    }
    state.currentUserId = userId
    saveState(state)
    res.json({ success: true, data: state.members.find(m => m.id === userId) })
  } catch (err) {
    console.error('[family-meeting] PUT /current-user 失败:', err)
    res.status(500).json({ success: false, error: '切换失败' })
  }
})

// ==================== 会议 ====================

/**
 * GET /family-meeting/meetings
 * 获取所有会议列表
 */
router.get('/meetings', (_req, res) => {
  try {
    const state = loadState()
    res.json({ success: true, data: state.meetings })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

/**
 * POST /family-meeting/meetings
 * 创建会议
 * Body: { title, date?, participants?, visibility?, encrypted?, encryptPass? }
 */
router.post('/meetings', (req, res) => {
  try {
    const state = loadState()
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
    saveState(state)
    res.json({ success: true, data: meeting })
  } catch (err) {
    console.error('[family-meeting] POST /meetings 失败:', err)
    res.status(500).json({ success: false, error: '创建失败' })
  }
})

/**
 * PUT /family-meeting/meetings/:id
 * 更新会议
 */
router.put('/meetings/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!patchItem(state.meetings, id, req.body)) {
      return res.status(404).json({ success: false, error: '会议不存在' })
    }
    saveState(state)
    res.json({ success: true, data: state.meetings.find(m => m.id === id) })
  } catch (err) {
    console.error('[family-meeting] PUT /meetings 失败:', err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

/**
 * DELETE /family-meeting/meetings/:id
 * 删除会议及关联数据
 */
router.delete('/meetings/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!removeItem(state.meetings, id)) {
      return res.status(404).json({ success: false, error: '会议不存在' })
    }
    // 级联删除关联数据
    state.agendaItems = state.agendaItems.filter(a => a.meetingId !== id)
    state.records = state.records.filter(r => r.meetingId !== id)
    state.tasks = state.tasks.filter(t => t.meetingId !== id)
    state.patches = state.patches.filter(p => p.meetingId !== id)
    state.emotionLogs = state.emotionLogs.filter(e => e.meetingId !== id)
    saveState(state)
    res.json({ success: true })
  } catch (err) {
    console.error('[family-meeting] DELETE /meetings 失败:', err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// ==================== 议题 ====================

router.get('/agenda-items', (req, res) => {
  try {
    const state = loadState()
    const { meetingId } = req.query
    const items = meetingId
      ? state.agendaItems.filter(a => a.meetingId === meetingId)
      : state.agendaItems
    res.json({ success: true, data: items })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/agenda-items', (req, res) => {
  try {
    const state = loadState()
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
    saveState(state)
    res.json({ success: true, data: item })
  } catch (err) {
    console.error('[family-meeting] POST /agenda-items 失败:', err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

router.put('/agenda-items/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!patchItem(state.agendaItems, id, req.body)) {
      return res.status(404).json({ success: false, error: '议题不存在' })
    }
    saveState(state)
    res.json({ success: true, data: state.agendaItems.find(a => a.id === id) })
  } catch (err) {
    console.error('[family-meeting] PUT /agenda-items 失败:', err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

router.delete('/agenda-items/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!removeItem(state.agendaItems, id)) {
      return res.status(404).json({ success: false, error: '议题不存在' })
    }
    state.patches = state.patches.filter(p => !(p.targetType === 'agenda' && p.targetId === id))
    saveState(state)
    res.json({ success: true })
  } catch (err) {
    console.error('[family-meeting] DELETE /agenda-items 失败:', err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

/**
 * POST /family-meeting/agenda-items/:id/resonance
 * 切换共鸣
 * Body: { userId }
 */
router.post('/agenda-items/:id/resonance', (req, res) => {
  try {
    const { id } = req.params
    const { userId } = req.body
    if (!userId) return res.status(400).json({ success: false, error: '缺少 userId' })
    const state = loadState()
    const item = state.agendaItems.find(a => a.id === id)
    if (!item) return res.status(404).json({ success: false, error: '议题不存在' })
    const idx = item.resonance.indexOf(userId)
    if (idx >= 0) item.resonance.splice(idx, 1)
    else item.resonance.push(userId)
    saveState(state)
    res.json({ success: true, data: item })
  } catch (err) {
    console.error('[family-meeting] POST /agenda-items/:id/resonance 失败:', err)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// ==================== 会议记录 ====================

router.get('/records', (req, res) => {
  try {
    const state = loadState()
    const { meetingId } = req.query
    const items = meetingId
      ? state.records.filter(r => r.meetingId === meetingId).sort((a, b) => a.seq - b.seq)
      : state.records
    res.json({ success: true, data: items })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/records', (req, res) => {
  try {
    const state = loadState()
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
    saveState(state)
    res.json({ success: true, data: record })
  } catch (err) {
    console.error('[family-meeting] POST /records 失败:', err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

router.put('/records/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!patchItem(state.records, id, req.body)) {
      return res.status(404).json({ success: false, error: '记录不存在' })
    }
    saveState(state)
    res.json({ success: true, data: state.records.find(r => r.id === id) })
  } catch (err) {
    console.error('[family-meeting] PUT /records 失败:', err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

router.delete('/records/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!removeItem(state.records, id)) {
      return res.status(404).json({ success: false, error: '记录不存在' })
    }
    state.tasks = state.tasks.filter(t => t.recordId !== id)
    state.patches = state.patches.filter(p => !(p.targetType === 'record' && p.targetId === id))
    saveState(state)
    res.json({ success: true })
  } catch (err) {
    console.error('[family-meeting] DELETE /records 失败:', err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// ==================== 补丁 ====================

router.get('/patches', (req, res) => {
  try {
    const state = loadState()
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

router.post('/patches', (req, res) => {
  try {
    const state = loadState()
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
    saveState(state)
    res.json({ success: true, data: patch })
  } catch (err) {
    console.error('[family-meeting] POST /patches 失败:', err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

router.delete('/patches/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!removeItem(state.patches, id)) {
      return res.status(404).json({ success: false, error: '补丁不存在' })
    }
    saveState(state)
    res.json({ success: true })
  } catch (err) {
    console.error('[family-meeting] DELETE /patches 失败:', err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// ==================== 任务 ====================

router.get('/tasks', (req, res) => {
  try {
    const state = loadState()
    const { meetingId } = req.query
    const items = meetingId
      ? state.tasks.filter(t => t.meetingId === meetingId)
      : state.tasks
    res.json({ success: true, data: items })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/tasks', (req, res) => {
  try {
    const state = loadState()
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
    saveState(state)
    res.json({ success: true, data: task })
  } catch (err) {
    console.error('[family-meeting] POST /tasks 失败:', err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

router.put('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!patchItem(state.tasks, id, req.body)) {
      return res.status(404).json({ success: false, error: '任务不存在' })
    }
    saveState(state)
    res.json({ success: true, data: state.tasks.find(t => t.id === id) })
  } catch (err) {
    console.error('[family-meeting] PUT /tasks 失败:', err)
    res.status(500).json({ success: false, error: '更新失败' })
  }
})

router.delete('/tasks/:id', (req, res) => {
  try {
    const { id } = req.params
    const state = loadState()
    if (!removeItem(state.tasks, id)) {
      return res.status(404).json({ success: false, error: '任务不存在' })
    }
    saveState(state)
    res.json({ success: true })
  } catch (err) {
    console.error('[family-meeting] DELETE /tasks 失败:', err)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

// ==================== 情绪日志 ====================

router.get('/emotions', (req, res) => {
  try {
    const state = loadState()
    const { meetingId, userId } = req.query
    let items = state.emotionLogs
    if (meetingId) items = items.filter(e => e.meetingId === meetingId)
    if (userId) items = items.filter(e => e.userId === userId)
    res.json({ success: true, data: items })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

router.post('/emotions', (req, res) => {
  try {
    const state = loadState()
    const log = {
      id: uid('e'),
      userId: req.body.userId || state.currentUserId,
      meetingId: req.body.meetingId || null,
      level: req.body.level,
      note: req.body.note || '',
      createdAt: new Date().toISOString()
    }
    state.emotionLogs.push(log)
    saveState(state)
    res.json({ success: true, data: log })
  } catch (err) {
    console.error('[family-meeting] POST /emotions 失败:', err)
    res.status(500).json({ success: false, error: '添加失败' })
  }
})

// ==================== 设置 ====================

/**
 * GET /family-meeting/settings
 */
router.get('/settings', (_req, res) => {
  try {
    const state = loadState()
    res.json({ success: true, data: state.settings })
  } catch (err) {
    res.status(500).json({ success: false, error: '读取失败' })
  }
})

/**
 * PUT /family-meeting/settings
 */
router.put('/settings', (req, res) => {
  try {
    const state = loadState()
    Object.assign(state.settings, req.body)
    saveState(state)
    res.json({ success: true, data: state.settings })
  } catch (err) {
    console.error('[family-meeting] PUT /settings 失败:', err)
    res.status(500).json({ success: false, error: '保存失败' })
  }
})

// ==================== 备份导出 ====================

/**
 * GET /family-meeting/export
 * 导出加密 JSON 备份（不含 settings 中的敏感字段）
 */
router.get('/export', (_req, res) => {
  try {
    const state = loadState()
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
    console.error('[family-meeting] GET /export 失败:', err)
    res.status(500).json({ success: false, error: '导出失败' })
  }
})

/**
 * POST /family-meeting/import
 * 导入备份数据
 * Body: 完整备份 JSON
 */
router.post('/import', (req, res) => {
  try {
    const backup = req.body
    if (!backup || !backup.family || !backup.members) {
      return res.status(400).json({ success: false, error: '无效的备份数据' })
    }
    const state = loadState()
    // 保留现有 settings
    const currentSettings = state.settings
    // 合并导入数据
    Object.assign(state, backup, { settings: currentSettings })
    saveState(state)
    console.log(`[family-meeting] 导入备份, 家庭: ${state.family.name}`)
    res.json({ success: true, data: { family: state.family, membersCount: state.members.length, meetingsCount: state.meetings.length } })
  } catch (err) {
    console.error('[family-meeting] POST /import 失败:', err)
    res.status(500).json({ success: false, error: '导入失败' })
  }
})

// ==================== 语音转写 ====================

/** 检测可用转写引擎 */
router.get('/transcribe/engines', async (_req, res) => {
  try {
    const engines = await detectEngines()
    res.json({ success: true, data: { engines } })
  } catch (err) {
    res.status(500).json({ success: false, error: err.message })
  }
})

/** 上传音频并转写 */
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
    // 清理上传的临时文件和转写产物
    if (req.file?.path) {
      cleanupTempFiles(req.file.path)
    }
  }
})

export default router
