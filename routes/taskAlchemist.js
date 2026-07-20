/**
 * 第二人生·任务炼金术士 API
 * 
 * 核心数据：
 *   - ta_tasks: 任务（精力标签、时间税、赎罪任务、心流会话）
 *   - ta_focus_sessions: 心流专注记录
 *   - ta_achievements: 成就徽章
 *   - ta_fragments: 记忆碎片
 *   - ta_cards: 传奇卡牌
 *   - ta_daily_reports: 日报/周报
 *   - ta_settings: 用户设置（伙伴选择、日常作息）
 */
import { Router } from 'express'
import { dbGet, dbAll, dbRun, dbTransaction } from '../services/db.js'
import { authRequired, authOptional } from '../middlewares/auth.js'

const router = Router()

// ==================== 用户设置 ====================

/** 获取/初始化用户设置 */
router.get('/settings', authRequired, (req, res) => {
  let settings = dbGet('SELECT * FROM ta_settings WHERE userId = ?', [req.userId])
  if (!settings) {
    const defaultSettings = {
      partnerType: 'tsundere',
      partnerName: '毒舌傲娇狐',
      partnerEmoji: '🦊',
      wakeUpTime: '08:00',
      napHabit: 'none',
      freeCoins: 0,
      snoozeCountToday: 0,
      silenceUntil: null,
      blindBoxDate: null,
      blindBoxKeyword: null,
      partnerMinutes: 0,
      dailyResetDate: new Date().toISOString().slice(0, 10)
    }
    const id = 'tas_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    dbRun(
      `INSERT INTO ta_settings (id, userId, settings) VALUES (?, ?, ?)`,
      [id, req.userId, JSON.stringify(defaultSettings)]
    )
    settings = { id, userId: req.userId, settings: JSON.stringify(defaultSettings) }
  }
  res.json({
    success: true,
    data: {
      ...JSON.parse(settings.settings),
      id: settings.id
    }
  })
})

/** 更新用户设置 */
router.put('/settings', authRequired, (req, res) => {
  const { partnerType, partnerName, partnerEmoji, wakeUpTime, napHabit, freeCoins, snoozeCountToday, silenceUntil, blindBoxDate, blindBoxKeyword, partnerMinutes, dailyResetDate } = req.body

  const existing = dbGet('SELECT * FROM ta_settings WHERE userId = ?', [req.userId])
  if (!existing) {
    return res.status(404).json({ error: '请先初始化设置' })
  }

  const current = JSON.parse(existing.settings)
  const updated = {
    ...current,
    ...(partnerType !== undefined && { partnerType }),
    ...(partnerName !== undefined && { partnerName }),
    ...(partnerEmoji !== undefined && { partnerEmoji }),
    ...(wakeUpTime !== undefined && { wakeUpTime }),
    ...(napHabit !== undefined && { napHabit }),
    ...(freeCoins !== undefined && { freeCoins }),
    ...(snoozeCountToday !== undefined && { snoozeCountToday }),
    ...(silenceUntil !== undefined && { silenceUntil }),
    ...(blindBoxDate !== undefined && { blindBoxDate }),
    ...(blindBoxKeyword !== undefined && { blindBoxKeyword }),
    ...(partnerMinutes !== undefined && { partnerMinutes }),
    ...(dailyResetDate !== undefined && { dailyResetDate })
  }

  dbRun('UPDATE ta_settings SET settings = ? WHERE userId = ?', [JSON.stringify(updated), req.userId])
  res.json({ success: true, data: updated })
})

// ==================== 任务 CRUD ====================

/** 获取所有任务 */
router.get('/tasks', authRequired, (req, res) => {
  const rows = dbAll('SELECT * FROM ta_tasks WHERE userId = ? AND status != ? ORDER BY createdAt DESC', [req.userId, 'deleted'])
  const tasks = rows.map(r => ({
    ...JSON.parse(r.taskData),
    id: r.taskId
  }))
  res.json({ success: true, data: tasks })
})

/** 创建任务 */
router.post('/tasks', authRequired, (req, res) => {
  const taskData = req.body
  const taskId = 'ta_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const now = new Date().toISOString()

  dbRun(
    `INSERT INTO ta_tasks (taskId, userId, status, taskData, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [taskId, req.userId, taskData.status || 'active', JSON.stringify({ ...taskData, id: taskId, createdAt: now, updatedAt: now }), now, now]
  )

  res.json({ success: true, data: { id: taskId, ...taskData, createdAt: now, updatedAt: now } })
})

/** 更新任务 */
router.put('/tasks/:id', authRequired, (req, res) => {
  const { id } = req.params
  const taskData = req.body
  const now = new Date().toISOString()

  const existing = dbGet('SELECT * FROM ta_tasks WHERE taskId = ? AND userId = ?', [id, req.userId])
  if (!existing) {
    return res.status(404).json({ error: '任务不存在' })
  }

  const current = JSON.parse(existing.taskData)
  const updated = { ...current, ...taskData, id, updatedAt: now }

  dbRun(
    'UPDATE ta_tasks SET status = ?, taskData = ?, updatedAt = ? WHERE taskId = ? AND userId = ?',
    [taskData.status || existing.status, JSON.stringify(updated), now, id, req.userId]
  )

  res.json({ success: true, data: updated })
})

/** 删除任务 */
router.delete('/tasks/:id', authRequired, (req, res) => {
  const { id } = req.params
  const result = dbRun('DELETE FROM ta_tasks WHERE taskId = ? AND userId = ?', [id, req.userId])
  if (result.changes === 0) {
    return res.status(404).json({ error: '任务不存在' })
  }
  res.json({ success: true })
})

/** 批量保存任务（覆盖全量同步） */
router.post('/tasks/sync', authRequired, (req, res) => {
  const { tasks } = req.body
  if (!Array.isArray(tasks)) {
    return res.status(400).json({ error: 'tasks 必须是数组' })
  }

  dbTransaction(() => {
    // 先删除该用户所有非删除任务
    dbRun('DELETE FROM ta_tasks WHERE userId = ?', [req.userId])

    const now = new Date().toISOString()
    for (const task of tasks) {
      dbRun(
        `INSERT INTO ta_tasks (taskId, userId, status, taskData, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [task.id, req.userId, task.status || 'active', JSON.stringify(task), task.createdAt || now, now]
      )
    }
  })

  res.json({ success: true, data: { count: tasks.length } })
})

// ==================== 心流专注记录 ====================

/** 获取心流会话列表 */
router.get('/focus-sessions', authRequired, (req, res) => {
  const rows = dbAll(
    'SELECT * FROM ta_focus_sessions WHERE userId = ? ORDER BY startTime DESC LIMIT 50',
    [req.userId]
  )
  const sessions = rows.map(r => JSON.parse(r.sessionData))
  res.json({ success: true, data: sessions })
})

/** 记录心流会话 */
router.post('/focus-sessions', authRequired, (req, res) => {
  const sessionData = req.body
  const sessionId = 'tafs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)

  dbRun(
    `INSERT INTO ta_focus_sessions (sessionId, userId, sessionData, createdAt)
     VALUES (?, ?, ?, ?)`,
    [sessionId, req.userId, JSON.stringify(sessionData), new Date().toISOString()]
  )

  res.json({ success: true, data: { id: sessionId } })
})

// ==================== 成就系统 ====================

/** 获取成就列表 */
router.get('/achievements', authRequired, (req, res) => {
  let row = dbGet('SELECT * FROM ta_achievements WHERE userId = ?', [req.userId])
  if (!row) {
    // 初始化默认成就
    const defaultAchievements = initDefaultAchievements()
    const id = 'taa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    dbRun(
      'INSERT INTO ta_achievements (id, userId, achievements) VALUES (?, ?, ?)',
      [id, req.userId, JSON.stringify(defaultAchievements)]
    )
    row = { achievements: JSON.stringify(defaultAchievements) }
  }
  res.json({ success: true, data: JSON.parse(row.achievements) })
})

/** 更新成就 */
router.put('/achievements', authRequired, (req, res) => {
  const { achievements } = req.body
  if (!Array.isArray(achievements)) {
    return res.status(400).json({ error: 'achievements 必须是数组' })
  }

  const existing = dbGet('SELECT * FROM ta_achievements WHERE userId = ?', [req.userId])
  if (existing) {
    dbRun('UPDATE ta_achievements SET achievements = ? WHERE userId = ?', [JSON.stringify(achievements), req.userId])
  } else {
    const id = 'taa_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    dbRun('INSERT INTO ta_achievements (id, userId, achievements) VALUES (?, ?, ?)', [id, req.userId, JSON.stringify(achievements)])
  }

  res.json({ success: true })
})

// ==================== 碎片与卡牌 ====================

/** 获取碎片 */
router.get('/fragments', authRequired, (req, res) => {
  let row = dbGet('SELECT * FROM ta_fragments WHERE userId = ?', [req.userId])
  const fragments = row ? JSON.parse(row.fragments || '[]') : []
  res.json({ success: true, data: fragments })
})

/** 更新碎片 */
router.put('/fragments', authRequired, (req, res) => {
  const { fragments } = req.body
  const existing = dbGet('SELECT * FROM ta_fragments WHERE userId = ?', [req.userId])
  if (existing) {
    dbRun('UPDATE ta_fragments SET fragments = ? WHERE userId = ?', [JSON.stringify(fragments || []), req.userId])
  } else {
    const id = 'tafr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    dbRun('INSERT INTO ta_fragments (id, userId, fragments) VALUES (?, ?, ?)', [id, req.userId, JSON.stringify(fragments || [])])
  }
  res.json({ success: true })
})

/** 获取卡牌 */
router.get('/cards', authRequired, (req, res) => {
  let row = dbGet('SELECT * FROM ta_cards WHERE userId = ?', [req.userId])
  const cards = row ? JSON.parse(row.cards || '[]') : []
  res.json({ success: true, data: cards })
})

/** 更新卡牌 */
router.put('/cards', authRequired, (req, res) => {
  const { cards } = req.body
  const existing = dbGet('SELECT * FROM ta_cards WHERE userId = ?', [req.userId])
  if (existing) {
    dbRun('UPDATE ta_cards SET cards = ? WHERE userId = ?', [JSON.stringify(cards || []), req.userId])
  } else {
    const id = 'tac_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    dbRun('INSERT INTO ta_cards (id, userId, cards) VALUES (?, ?, ?)', [id, req.userId, JSON.stringify(cards || [])])
  }
  res.json({ success: true })
})

// ==================== 日报 ====================

/** 获取日报历史 */
router.get('/reports', authRequired, (req, res) => {
  let row = dbGet('SELECT * FROM ta_daily_reports WHERE userId = ?', [req.userId])
  const reports = row ? JSON.parse(row.reports || '[]') : []
  res.json({ success: true, data: reports })
})

/** 保存日报 */
router.post('/reports', authRequired, (req, res) => {
  const { reports } = req.body
  const existing = dbGet('SELECT * FROM ta_daily_reports WHERE userId = ?', [req.userId])
  if (existing) {
    dbRun('UPDATE ta_daily_reports SET reports = ? WHERE userId = ?', [JSON.stringify(reports || []), req.userId])
  } else {
    const id = 'tadr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    dbRun('INSERT INTO ta_daily_reports (id, userId, reports) VALUES (?, ?, ?)', [id, req.userId, JSON.stringify(reports || [])])
  }
  res.json({ success: true })
})

// ==================== 全量数据同步 ====================

/** 一次性拉取所有数据 */
router.get('/sync-all', authRequired, (req, res) => {
  const tasks = dbAll('SELECT * FROM ta_tasks WHERE userId = ? AND status != ?', [req.userId, 'deleted'])
    .map(r => ({ ...JSON.parse(r.taskData), id: r.taskId }))

  const focusRows = dbAll('SELECT * FROM ta_focus_sessions WHERE userId = ? ORDER BY startTime DESC LIMIT 50', [req.userId])
  const focusSessions = focusRows.map(r => JSON.parse(r.sessionData))

  const achRow = dbGet('SELECT * FROM ta_achievements WHERE userId = ?', [req.userId])
  const achievements = achRow ? JSON.parse(achRow.achievements) : initDefaultAchievements()

  const fragRow = dbGet('SELECT * FROM ta_fragments WHERE userId = ?', [req.userId])
  const fragments = fragRow ? JSON.parse(fragRow.fragments || '[]') : []

  const cardRow = dbGet('SELECT * FROM ta_cards WHERE userId = ?', [req.userId])
  const cards = cardRow ? JSON.parse(cardRow.cards || '[]') : []

  const reportRow = dbGet('SELECT * FROM ta_daily_reports WHERE userId = ?', [req.userId])
  const reports = reportRow ? JSON.parse(reportRow.reports || '[]') : []

  const settingsRow = dbGet('SELECT * FROM ta_settings WHERE userId = ?', [req.userId])
  const settings = settingsRow ? JSON.parse(settingsRow.settings) : getDefaultSettings()

  res.json({
    success: true,
    data: {
      tasks,
      focusSessions,
      achievements,
      fragments,
      cards,
      reports,
      settings
    }
  })
})

/** 一次性保存所有数据 */
router.post('/sync-all', authRequired, (req, res) => {
  const { tasks, focusSessions, achievements, fragments, cards, reports, settings } = req.body

  dbTransaction(() => {
    // 任务
    if (Array.isArray(tasks)) {
      dbRun('DELETE FROM ta_tasks WHERE userId = ?', [req.userId])
      const now = new Date().toISOString()
      for (const task of tasks) {
        dbRun(
          'INSERT INTO ta_tasks (taskId, userId, status, taskData, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)',
          [task.id, req.userId, task.status || 'active', JSON.stringify(task), task.createdAt || now, now]
        )
      }
    }

    // 心流会话
    if (Array.isArray(focusSessions)) {
      dbRun('DELETE FROM ta_focus_sessions WHERE userId = ?', [req.userId])
      for (const session of focusSessions) {
        const sessionId = session.taskId ? 'tafs_' + session.taskId + '_' + Date.now().toString(36) : 'tafs_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        dbRun(
          'INSERT INTO ta_focus_sessions (sessionId, userId, sessionData, createdAt) VALUES (?, ?, ?, ?)',
          [sessionId, req.userId, JSON.stringify(session), new Date().toISOString()]
        )
      }
    }

    // 成就
    if (Array.isArray(achievements)) {
      upsertJsonTable('ta_achievements', 'id', 'achievements', req.userId, achievements)
    }

    // 碎片
    if (Array.isArray(fragments)) {
      upsertJsonTable('ta_fragments', 'id', 'fragments', req.userId, fragments)
    }

    // 卡牌
    if (Array.isArray(cards)) {
      upsertJsonTable('ta_cards', 'id', 'cards', req.userId, cards)
    }

    // 日报
    if (Array.isArray(reports)) {
      upsertJsonTable('ta_daily_reports', 'id', 'reports', req.userId, reports)
    }

    // 设置
    if (settings) {
      const existing = dbGet('SELECT * FROM ta_settings WHERE userId = ?', [req.userId])
      if (existing) {
        dbRun('UPDATE ta_settings SET settings = ? WHERE userId = ?', [JSON.stringify(settings), req.userId])
      } else {
        const id = 'tas_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        dbRun('INSERT INTO ta_settings (id, userId, settings) VALUES (?, ?, ?)', [id, req.userId, JSON.stringify(settings)])
      }
    }
  })

  res.json({ success: true })
})

// ==================== 工具函数 ====================

function initDefaultAchievements() {
  return [
    { id: 'early_bird', name: '早起鸟儿', desc: '连续7天在8:00前完成第一个任务', icon: '🌅', unlocked: false, progress: 0, target: 7 },
    { id: 'decathlon', name: '十项全能', desc: '单日完成10个任务', icon: '🏆', unlocked: false, progress: 0, target: 10 },
    { id: 'first_penance', name: '赎罪之路', desc: '首次使用"时间税"赎罪', icon: '⚖️', unlocked: false, progress: 0, target: 1 },
    { id: 'time_master', name: '时间大师', desc: '累计提前50小时完成任务', icon: '⏰', unlocked: false, progress: 0, target: 50 },
    { id: 'focus_novice', name: '专注新手', desc: '完成10次心流专注', icon: '🧘', unlocked: false, progress: 0, target: 10 },
    { id: 'clean_master', name: '清理大师', desc: '单日完成5个低能耗任务', icon: '🧹', unlocked: false, progress: 0, target: 5 },
    { id: 'dragon_slayer', name: '屠龙勇士', desc: '完成10个高能耗任务', icon: '⚔️', unlocked: false, progress: 0, target: 10 },
    { id: 'collector', name: '碎片收集者', desc: '集齐任意3块记忆碎片', icon: '🧩', unlocked: false, progress: 0, target: 3 },
    { id: 'quarter_master', name: '季度大师', desc: '季度内完成100个任务', icon: '👑', unlocked: false, progress: 0, target: 100, isLegendary: true, fragments: 5 }
  ]
}

function getDefaultSettings() {
  return {
    partnerType: 'tsundere',
    partnerName: '毒舌傲娇狐',
    partnerEmoji: '🦊',
    wakeUpTime: '08:00',
    napHabit: 'none',
    freeCoins: 0,
    snoozeCountToday: 0,
    silenceUntil: null,
    blindBoxDate: null,
    blindBoxKeyword: null,
    partnerMinutes: 0,
    dailyResetDate: new Date().toISOString().slice(0, 10)
  }
}

function upsertJsonTable(tableName, idCol, jsonCol, userId, data) {
  const existing = dbGet(`SELECT * FROM ${tableName} WHERE userId = ?`, [userId])
  if (existing) {
    dbRun(`UPDATE ${tableName} SET ${jsonCol} = ? WHERE userId = ?`, [JSON.stringify(data), userId])
  } else {
    const id = 't_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    dbRun(`INSERT INTO ${tableName} (${idCol}, userId, ${jsonCol}) VALUES (?, ?, ?)`, [id, userId, JSON.stringify(data)])
  }
}

export default router
