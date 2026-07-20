/**
 * 家庭愿望清单 & 树洞 API（SQLite 版）
 * --------------------------------------------------------------
 * 🏠 家庭空间已与家庭会议统一共享（共用 family_meeting_memberships 表）
 * 提供愿望清单 CRUD、树洞/情绪发布、通知等功能
 */
import { Router } from 'express'
import { dbAll, dbGet, dbRun, getFamilyId } from '../services/db.js'
import { authRequired, authOptional } from '../middlewares/auth.js'

const router = Router()

// ---- ID/时间工具 ----
function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
function nowISO() {
  return new Date().toISOString()
}

// ---- 动物马甲列表 ----
const ANIMAL_MASKS = [
  '树洞猫', '树洞兔', '树洞熊', '树洞鹿', '树洞鹰',
  '树洞鲸', '树洞狐', '树洞雀', '树洞龟', '树洞犬',
  '树洞蝶', '树洞鱼', '树洞鹊', '树洞蛙', '树洞蝉'
]

function randomMask() {
  return ANIMAL_MASKS[Math.floor(Math.random() * ANIMAL_MASKS.length)]
}

// ==================== 家庭信息（共享空间，只读） ====================

/** 获取家庭信息 — 从共享家庭空间读取 */
router.get('/family', authRequired, (req, res) => {
  try {
    const familyId = getFamilyId(req.userId)
    if (!familyId) return res.json({ success: true, data: null })

    // 从共享状态读取 family 和 members
    const row = dbGet('SELECT state FROM family_meeting_state WHERE familyId = ?', [familyId])
    if (!row?.state) return res.json({ success: true, data: null })

    const state = JSON.parse(row.state)
    const family = state.family || null
    const members = (state.members || []).map(m => ({
      id: m.id,
      userId: m.id,
      name: m.name || '未知',
      role: m.role || 'member'
    }))

    res.json({ success: true, data: family ? { ...family, members, inviteCode: '' } : null })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// ==================== 愿望清单 ====================

/** 获取愿望列表 */
router.get('/wishes', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const familyId = getFamilyId(userId)
    if (!familyId) return res.json({ success: true, data: [] })
    const { status, category } = req.query
    let sql = 'SELECT w.*, u.nickname as creatorName FROM wishes w LEFT JOIN users u ON w.userId = u.userId WHERE w.familyId = ? AND w.archivedAt IS NULL'
    const params = [familyId]
    if (status) { sql += ' AND w.status = ?'; params.push(status) }
    if (category && category !== 'all') { sql += ' AND w.category = ?'; params.push(category) }
    sql += ' ORDER BY CASE WHEN w.targetDate IS NULL THEN 1 ELSE 0 END, w.targetDate ASC, w.createdAt DESC'
    const wishes = dbAll(sql, params)

    // 检查即将到期的愿望，生成提醒通知
    const now = new Date()
    const threeDaysLater = new Date(now.getTime() + 3 * 86400000)
    const todayStr = now.toISOString().slice(0, 10)
    const threeDaysStr = threeDaysLater.toISOString().slice(0, 10)

    for (const w of wishes) {
      if (w.status !== '进行中' || !w.targetDate) continue
      const targetDate = w.targetDate.slice(0, 10)
      if (targetDate > threeDaysStr) continue // 超过3天，不提醒

      // 检查今天是否已经生成过提醒（避免重复）
      const existing = dbGet(
        "SELECT id FROM notifications WHERE userId = ? AND type = 'reminder' AND relatedId = ? AND createdAt >= ?",
        [w.userId, w.id, todayStr]
      )
      if (existing) continue

      const daysLeft = Math.ceil((new Date(targetDate) - now) / 86400000)
      let title, content
      if (daysLeft <= 0) {
        title = '⏰ 愿望已逾期'
        content = `「${w.title}」已逾期，需要延期吗？`
      } else if (daysLeft === 1) {
        title = '⏰ 愿望明天到期'
        content = `「${w.title}」明天就要截止了，加油冲刺！`
      } else {
        title = `⏰ 愿望还剩${daysLeft}天`
        content = `「${w.title}」还剩${daysLeft}天，抓紧完成哦～`
      }

      dbRun(
        'INSERT INTO notifications (id, userId, type, title, content, relatedId, createdAt) VALUES (?,?,?,?,?,?,?)',
        [uid('n'), w.userId, 'reminder', title, content, w.id, nowISO()]
      )
    }

    const result = wishes.map(w => ({
      ...w,
      mediaLinks: JSON.parse(w.mediaLinks || '[]'),
      subTasks: JSON.parse(w.subTasks || '[]')
    }))
    res.json({ success: true, data: result })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 获取单个愿望详情 */
router.get('/wishes/:id', authRequired, (req, res) => {
  try {
    const wish = dbGet(
      'SELECT w.*, u.nickname as creatorName FROM wishes w LEFT JOIN users u ON w.userId = u.userId WHERE w.id = ?',
      [req.params.id]
    )
    if (!wish) return res.json({ success: false, error: '愿望不存在' })
    // 获取打卡记录
    const checkins = dbAll('SELECT * FROM wish_checkins WHERE wishId = ? ORDER BY createdAt DESC', [req.params.id])
    // 获取关联树洞
    const moods = dbAll('SELECT * FROM moods WHERE wishId = ? ORDER BY createdAt DESC', [req.params.id])
    res.json({
      success: true,
      data: {
        ...wish,
        mediaLinks: JSON.parse(wish.mediaLinks || '[]'),
        subTasks: JSON.parse(wish.subTasks || '[]'),
        checkins,
        moods
      }
    })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 创建愿望 */
router.post('/wishes', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const familyId = getFamilyId(userId)
    if (!familyId) return res.json({ success: false, error: '请先加入家庭' })
    const { title, description, category, priority, targetDate, subTasks, mediaLinks } = req.body
    if (!title || !title.trim()) return res.json({ success: false, error: '愿望标题不能为空' })
    const id = uid('w')
    const now = nowISO()
    dbRun(
      `INSERT INTO wishes (id, familyId, userId, title, description, category, priority, status, progress, targetDate, createdAt, updatedAt, mediaLinks, subTasks, isShared)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, familyId, userId, title.trim(), description || '', category || '生活', priority || '中', '进行中', 0, targetDate || null, now, now, JSON.stringify(mediaLinks || []), JSON.stringify(subTasks || []), 1]
    )
    res.json({ success: true, data: { id, title: title.trim(), status: '进行中', progress: 0, createdAt: now } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 更新愿望 */
router.put('/wishes/:id', authRequired, (req, res) => {
  try {
    const wish = dbGet('SELECT * FROM wishes WHERE id = ?', [req.params.id])
    if (!wish) return res.json({ success: false, error: '愿望不存在' })
    const allowed = ['title', 'description', 'category', 'priority', 'targetDate', 'status', 'progress', 'isShared', 'mediaLinks', 'subTasks']
    const updates = []
    const params = []
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = ?`)
        params.push(key === 'mediaLinks' || key === 'subTasks' ? JSON.stringify(req.body[key]) : req.body[key])
      }
    }
    if (updates.length === 0) return res.json({ success: false, error: '无更新内容' })
    // 自动判断状态
    if (req.body.status === '已完成' || (req.body.progress >= 100 && wish.status !== '已完成')) {
      updates.push('status = ?'); params.push('已完成')
      updates.push('archiveDate = ?'); params.push(nowISO())
    }
    if (req.body.targetDate && new Date(req.body.targetDate) < new Date() && wish.status === '进行中') {
      const checkStatus = req.body.status || wish.status
      if (checkStatus === '进行中') {
        updates.push('status = ?'); params.push('逾期')
      }
    }
    updates.push('updatedAt = ?'); params.push(nowISO())
    params.push(req.params.id)
    dbRun(`UPDATE wishes SET ${updates.join(', ')} WHERE id = ?`, params)
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 删除愿望 */
router.delete('/wishes/:id', authRequired, (req, res) => {
  try {
    dbRun('DELETE FROM wish_checkins WHERE wishId = ?', [req.params.id])
    dbRun('DELETE FROM moods WHERE wishId = ?', [req.params.id])
    dbRun('DELETE FROM wishes WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 归档愿望 */
router.post('/wishes/:id/archive', authRequired, (req, res) => {
  try {
    dbRun('UPDATE wishes SET archivedAt = ?, status = ?, updatedAt = ? WHERE id = ?', [nowISO(), '已完成', nowISO(), req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 打卡愿望 */
router.post('/wishes/:id/checkin', authRequired, (req, res) => {
  try {
    const { note, progress } = req.body
    const wish = dbGet('SELECT * FROM wishes WHERE id = ?', [req.params.id])
    if (!wish) return res.json({ success: false, error: '愿望不存在' })
    const checkinId = uid('ci')
    dbRun(
      'INSERT INTO wish_checkins (id, wishId, userId, note, progress, createdAt) VALUES (?,?,?,?,?,?)',
      [checkinId, req.params.id, req.userId, note || '', progress ?? wish.progress, nowISO()]
    )
    // 更新主进度
    const newProgress = progress ?? Math.min(wish.progress + 10, 100)
    let newStatus = wish.status
    if (newProgress >= 100) newStatus = '已完成'
    dbRun('UPDATE wishes SET progress = ?, status = ?, updatedAt = ? WHERE id = ?', [newProgress, newStatus, nowISO(), req.params.id])

    // 如果完成，向家庭成员发送庆祝通知
    if (newStatus === '已完成') {
      const familyId = getFamilyId(req.userId)
      if (familyId) {
        const familyMembers = dbAll('SELECT userId FROM family_meeting_memberships WHERE familyId = ?', [familyId])
        for (const m of familyMembers) {
          if (m.userId !== req.userId) {
            dbRun(
              'INSERT INTO notifications (id, userId, type, title, content, relatedId, createdAt) VALUES (?,?,?,?,?,?,?)',
              [uid('n'), m.userId, 'celebration', '🎉 愿望达成！', `${req.user?.nickname || '家庭成员'} 完成了愿望「${wish.title}」`, req.params.id, nowISO()]
            )
          }
        }
      }
    }

    res.json({ success: true, data: { id: checkinId, progress: newProgress, status: newStatus } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 更新子任务 */
router.put('/wishes/:id/subtasks', authRequired, (req, res) => {
  try {
    const { subTasks } = req.body
    dbRun('UPDATE wishes SET subTasks = ?, updatedAt = ? WHERE id = ?', [JSON.stringify(subTasks || []), nowISO(), req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 延期愿望 */
router.post('/wishes/:id/delay', authRequired, (req, res) => {
  try {
    const { newDate } = req.body
    if (!newDate) return res.json({ success: false, error: '请提供新日期' })
    dbRun('UPDATE wishes SET targetDate = ?, status = ?, updatedAt = ? WHERE id = ?', [newDate, '进行中', nowISO(), req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// ==================== 树洞 / 情绪 ====================

/** 获取树洞流 */
router.get('/moods', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const familyId = getFamilyId(userId)
    if (!familyId) return res.json({ success: true, data: [] })
    const { limit = 50, wishId } = req.query
    let sql = 'SELECT m.*, u.nickname as creatorName FROM moods m LEFT JOIN users u ON m.userId = u.userId WHERE m.familyId = ?'
    const params = [familyId]
    if (wishId) { sql += ' AND m.wishId = ?'; params.push(wishId) }
    sql += ' ORDER BY m.createdAt DESC LIMIT ?'
    params.push(Number(limit))
    const moods = dbAll(sql, params)
    const result = moods.map(m => ({
      ...m,
      isMine: m.userId === userId
    }))
    res.json({ success: true, data: result })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 发布树洞 */
router.post('/moods', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const familyId = getFamilyId(userId)
    if (!familyId) return res.json({ success: false, error: '请先加入家庭' })
    const { content, isAnonymous = true, wishId, moodWeather } = req.body
    if (!content || !content.trim()) return res.json({ success: false, error: '内容不能为空' })
    const id = uid('mo')
    const animalMask = isAnonymous ? randomMask() : ''
    const now = nowISO()

    // SOS检测：极度负面词汇
    let sosTriggered = 0
    const sosKeywords = ['不想活了', '绝望', '崩溃', '撑不下去了', '世界末日', '活着没意思']
    if (sosKeywords.some(kw => content.includes(kw))) {
      sosTriggered = 1
      // 向所有家庭成员发送SOS通知
      const familyMembers = dbAll('SELECT userId FROM family_meeting_memberships WHERE familyId = ?', [familyId])
      for (const m of familyMembers) {
        if (m.userId !== userId) {
          dbRun(
            'INSERT INTO notifications (id, userId, type, title, content, relatedId, createdAt) VALUES (?,?,?,?,?,?,?)',
            [uid('n'), m.userId, 'sos', '💚 有人需要一些鼓励', `${isAnonymous ? animalMask : (req.user?.nickname || '家庭成员')} 需要一些温暖的话语`, id, now]
          )
        }
      }
    }

    dbRun(
      'INSERT INTO moods (id, familyId, userId, content, isAnonymous, animalMask, moodWeather, wishId, sosTriggered, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
      [id, familyId, userId, content.trim(), isAnonymous ? 1 : 0, animalMask, moodWeather || '', wishId || null, sosTriggered, now]
    )
    res.json({ success: true, data: { id, content: content.trim(), isAnonymous: !!isAnonymous, animalMask, createdAt: now } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 删除树洞 */
router.delete('/moods/:id', authRequired, (req, res) => {
  try {
    const mood = dbGet('SELECT * FROM moods WHERE id = ? AND userId = ?', [req.params.id, req.userId])
    if (!mood) return res.json({ success: false, error: '无权删除或不存在' })
    dbRun('DELETE FROM moods WHERE id = ?', [req.params.id])
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 树洞转愿望 */
router.post('/moods/:id/convert', authRequired, (req, res) => {
  try {
    const mood = dbGet('SELECT * FROM moods WHERE id = ?', [req.params.id])
    if (!mood) return res.json({ success: false, error: '树洞不存在' })
    const title = mood.content.slice(0, 50)
    const id = uid('w')
    const now = nowISO()
    dbRun(
      `INSERT INTO wishes (id, familyId, userId, title, description, category, priority, status, progress, targetDate, createdAt, updatedAt, mediaLinks, subTasks)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [id, mood.familyId, req.userId, `💡 ${title}`, mood.content, '生活', '中', '进行中', 0, null, now, now, '[]', '[]']
    )
    res.json({ success: true, data: { id, title: `💡 ${title}` } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// ==================== 互动 (拍一拍) ====================

/** 拍一拍 */
router.post('/pat', authRequired, (req, res) => {
  try {
    const { toUserId, targetType, targetId, message } = req.body
    if (!toUserId) return res.json({ success: false, error: '请指定接收人' })
    const id = uid('pat')
    const patMsg = message || `${req.user?.nickname || '有人'} 拍了拍你`
    dbRun(
      'INSERT INTO pats (id, fromUserId, toUserId, targetType, targetId, message, createdAt) VALUES (?,?,?,?,?,?,?)',
      [id, req.userId, toUserId, targetType || 'wish', targetId || null, patMsg, nowISO()]
    )
    // 发送通知
    dbRun(
      'INSERT INTO notifications (id, userId, type, title, content, relatedId, createdAt) VALUES (?,?,?,?,?,?,?)',
      [uid('n'), toUserId, 'pat', '👋 有人拍了拍你', patMsg, targetId, nowISO()]
    )
    res.json({ success: true, data: { id, message: patMsg } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// ==================== 通知 ====================

/** 获取通知列表 */
router.get('/notifications', authRequired, (req, res) => {
  try {
    const notifications = dbAll(
      'SELECT * FROM notifications WHERE userId = ? ORDER BY createdAt DESC LIMIT 100',
      [req.userId]
    )
    const unreadCount = notifications.filter(n => !n.isRead).length
    res.json({ success: true, data: notifications, unreadCount })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 标记通知已读 */
router.put('/notifications/:id/read', authRequired, (req, res) => {
  try {
    dbRun('UPDATE notifications SET isRead = 1 WHERE id = ? AND userId = ?', [req.params.id, req.userId])
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 全部已读 */
router.put('/notifications/read-all', authRequired, (req, res) => {
  try {
    dbRun('UPDATE notifications SET isRead = 1 WHERE userId = ?', [req.userId])
    res.json({ success: true })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 获取未读通知数 */
router.get('/notifications/unread-count', authRequired, (req, res) => {
  try {
    const row = dbGet('SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0', [req.userId])
    res.json({ success: true, data: row?.count || 0 })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// ==================== 数据统计 ====================

/** 个人数据看板 */
router.get('/stats/personal', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const familyId = getFamilyId(userId)
    if (!familyId) return res.json({ success: true, data: { total: 0, active: 0, completed: 0, overdue: 0, moodsCount: 0 } })
    const total = dbGet('SELECT COUNT(*) as count FROM wishes WHERE userId = ?', [userId])
    const active = dbGet('SELECT COUNT(*) as count FROM wishes WHERE userId = ? AND status = ?', [userId, '进行中'])
    const completed = dbGet('SELECT COUNT(*) as count FROM wishes WHERE userId = ? AND status = ?', [userId, '已完成'])
    const overdue = dbGet('SELECT COUNT(*) as count FROM wishes WHERE userId = ? AND status = ?', [userId, '逾期'])
    const moodsCount = dbGet('SELECT COUNT(*) as count FROM moods WHERE userId = ?', [userId])
    res.json({
      success: true,
      data: {
        total: total?.count || 0,
        active: active?.count || 0,
        completed: completed?.count || 0,
        overdue: overdue?.count || 0,
        moodsCount: moodsCount?.count || 0
      }
    })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 家庭活跃排行 */
router.get('/stats/family-ranking', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const familyId = getFamilyId(userId)
    if (!familyId) return res.json({ success: true, data: { wishes: [], moods: [] } })

    // 本月愿望完成排行
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0)
    const wishRank = dbAll(
      `SELECT w.userId, u.nickname, COUNT(*) as count FROM wishes w
       LEFT JOIN users u ON w.userId = u.userId
       WHERE w.familyId = ? AND w.status = '已完成' AND w.updatedAt >= ?
       GROUP BY w.userId ORDER BY count DESC`,
      [familyId, monthStart.toISOString()]
    )

    // 本月树洞活跃排行
    const moodRank = dbAll(
      `SELECT m.userId, u.nickname, COUNT(*) as count FROM moods m
       LEFT JOIN users u ON m.userId = u.userId
       WHERE m.familyId = ? AND m.createdAt >= ?
       GROUP BY m.userId ORDER BY count DESC`,
      [familyId, monthStart.toISOString()]
    )

    res.json({ success: true, data: { wishes: wishRank, moods: moodRank } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// ==================== AI 破局助手 ====================
// (Phase 2，暂用模拟)

/** AI 破局建议 */
router.get('/ai/breakthrough', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const wishes = dbAll(
      'SELECT * FROM wishes WHERE userId = ? AND status = ? ORDER BY updatedAt ASC',
      [userId, '进行中']
    )
    // 找出连续7天没有打卡的愿望
    const staleWishes = wishes.filter(w => {
      const lastCheckin = dbGet('SELECT createdAt FROM wish_checkins WHERE wishId = ? ORDER BY createdAt DESC LIMIT 1', [w.id])
      if (!lastCheckin) {
        const daysSinceCreation = (Date.now() - new Date(w.createdAt).getTime()) / 86400000
        return daysSinceCreation >= 7
      }
      const daysSinceCheckin = (Date.now() - new Date(lastCheckin.createdAt).getTime()) / 86400000
      return daysSinceCheckin >= 7
    })

    const suggestions = staleWishes.map(w => ({
      wishId: w.id,
      wishTitle: w.title,
      tips: [
        `💡 把「${w.title}」拆解为3个更小的里程碑`,
        '⏰ 每天花15分钟，比一次做很久更有效',
        '🎯 重新审视这个目标，是否需要调整预期？'
      ]
    }))

    res.json({ success: true, data: suggestions })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

export default router
