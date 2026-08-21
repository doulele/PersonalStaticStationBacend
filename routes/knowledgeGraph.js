/**
 * 前端知识图谱（技能成长平台）API
 * --------------------------------------------------------------
 * 内容（知识点/题目）公开；用户学习数据需登录。
 * 提供：知识点/题目查询、随堂测验、专项刷题、点亮进度、
 *       答题记录、错题本、收藏夹、打卡、成就、经验值、雷达图、成长曲线
 */
import { Router } from 'express'
import { dbAll, dbGet, dbRun } from '../services/db.js'
import { authRequired } from '../middlewares/auth.js'

const router = Router()

// ---- 工具 ----
function uid(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}
function nowISO() { return new Date().toISOString() }
function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 答案判定（与前端 utils/quiz.js 保持一致） */
function checkAnswer(userAnswer, correctAnswer) {
  if (Array.isArray(correctAnswer)) {
    if (!Array.isArray(userAnswer) || userAnswer.length !== correctAnswer.length) return false
    const a = [...userAnswer].sort()
    const b = [...correctAnswer].sort()
    return a.every((v, i) => v === b[i])
  }
  if (typeof correctAnswer === 'boolean') {
    return (userAnswer === 0) === correctAnswer
  }
  return userAnswer === correctAnswer
}

// ---- 经验值规则 ----
const XP = { node: 5, answer: 2, checkin: 3 }

// ---- 等级阈值（与前端 meta.js 保持一致） ----
const LEVELS_XP = [
  { key: 'junior', min: 0 },
  { key: 'middle', min: 100 },
  { key: 'senior', min: 300 },
  { key: 'expert', min: 600 }
]
function getLevelKey(xp) {
  let cur = LEVELS_XP[0]
  for (const lv of LEVELS_XP) if (xp >= lv.min) cur = lv
  return cur.key
}

// ---- 成就规则（id 与前端 meta.js 一致） ----
const ACHIEVEMENTS = [
  { id: 'ach-first-node', check: s => s.learnedCount >= 1 },
  { id: 'ach-node-10', check: s => s.learnedCount >= 10 },
  { id: 'ach-node-50', check: s => s.learnedCount >= 50 },
  { id: 'ach-node-100', check: s => s.learnedCount >= 100 },
  { id: 'ach-answer-50', check: s => s.answerTotal >= 50 },
  { id: 'ach-answer-200', check: s => s.answerTotal >= 200 },
  { id: 'ach-answer-500', check: s => s.answerTotal >= 500 },
  { id: 'ach-first-checkin', check: s => s.checkinCount >= 1 },
  { id: 'ach-checkin-7', check: s => s.checkinStreak >= 7 },
  { id: 'ach-checkin-30', check: s => s.checkinStreak >= 30 },
  { id: 'ach-category-full', check: s => s.bestCategoryPercent >= 100 },
  { id: 'ach-level-middle', check: s => ['middle', 'senior', 'expert'].includes(s.levelKey) },
  { id: 'ach-level-senior', check: s => ['senior', 'expert'].includes(s.levelKey) },
  { id: 'ach-level-expert', check: s => s.levelKey === 'expert' }
]

// ---- 计算连续打卡天数 ----
function calcStreak(checkins) {
  if (!checkins.length) return 0
  const set = new Set(checkins.map(c => c.date))
  let streak = 0
  const cur = new Date()
  // 从今天或昨天开始往回数
  const today = todayStr()
  const yest = new Date(); yest.setDate(yest.getDate() - 1)
  const yestStr = `${yest.getFullYear()}-${String(yest.getMonth() + 1).padStart(2, '0')}-${String(yest.getDate()).padStart(2, '0')}`
  if (!set.has(today) && !set.has(yestStr)) return 0
  const start = set.has(today) ? new Date() : yest
  const d = new Date(start)
  while (set.has(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)) {
    streak++
    d.setDate(d.getDate() - 1)
  }
  return streak
}

// ---- 获取节点各分类总数 ----
function getCategoryNodeCounts() {
  const rows = dbAll('SELECT cat, COUNT(*) AS c FROM kg_nodes GROUP BY cat')
  const map = {}
  rows.forEach(r => { map[r.cat] = r.c })
  return map
}

// ---- 计算用户统计（供成就判断/进度接口复用） ----
function getUserStats(userId) {
  const learnedCount = dbGet('SELECT COUNT(*) AS c FROM kg_learn_records WHERE userId = ?', [userId])?.c || 0
  const answerTotal = dbGet('SELECT COUNT(*) AS c FROM kg_answer_records WHERE userId = ?', [userId])?.c || 0
  const answerCorrect = dbGet('SELECT COUNT(*) AS c FROM kg_answer_records WHERE userId = ? AND correct = 1', [userId])?.c || 0
  const xp = dbGet('SELECT COALESCE(SUM(delta), 0) AS v FROM kg_xp_logs WHERE userId = ?', [userId])?.v || 0
  const checkins = dbAll('SELECT date FROM kg_checkins WHERE userId = ? ORDER BY date DESC', [userId])
  const checkinStreak = calcStreak(checkins)

  // 各分类完成度
  const catCounts = getCategoryNodeCounts()
  const learnedByCat = dbAll(`
    SELECT n.cat, COUNT(*) AS c FROM kg_learn_records lr
    JOIN kg_nodes n ON lr.nodeId = n.id
    WHERE lr.userId = ? GROUP BY n.cat
  `, [userId])
  const learnedMap = {}
  learnedByCat.forEach(r => { learnedMap[r.cat] = r.c })
  let bestCategoryPercent = 0
  const categoryPercent = {}
  for (const [cat, total] of Object.entries(catCounts)) {
    const learned = learnedMap[cat] || 0
    const pct = total > 0 ? Math.round((learned / total) * 100) : 0
    categoryPercent[cat] = { learned, total, percent: pct }
    if (pct > bestCategoryPercent) bestCategoryPercent = pct
  }

  return {
    learnedCount,
    answerTotal,
    answerCorrect,
    xp,
    checkins,
    checkinCount: checkins.length,
    checkinStreak,
    bestCategoryPercent,
    categoryPercent,
    levelKey: getLevelKey(xp)
  }
}

// ---- 检查并写入新达成的成就，返回新成就列表 ----
function checkAchievementsV2(userId, stats) {
  const existing = dbAll('SELECT achId FROM kg_achievements WHERE userId = ?', [userId])
  const existingIds = new Set(existing.map(r => r.achId))
  const newly = []
  for (const ach of ACHIEVEMENTS) {
    if (existingIds.has(ach.id)) continue
    if (ach.check(stats)) {
      dbRun('INSERT INTO kg_achievements (id, userId, achId, time) VALUES (?, ?, ?, ?)', [uid('ach'), userId, ach.id, nowISO()])
      existingIds.add(ach.id)
      newly.push(ach.id)
    }
  }
  return newly
}

// ---- 自动打卡（每日首次学习行为触发） ----
function autoCheckin(userId) {
  const today = todayStr()
  const exists = dbGet('SELECT id FROM kg_checkins WHERE userId = ? AND date = ?', [userId, today])
  if (exists) return false
  dbRun('INSERT INTO kg_checkins (id, userId, date) VALUES (?, ?, ?)', [uid('ck'), userId, today])
  dbRun('INSERT INTO kg_xp_logs (id, userId, delta, reason, time) VALUES (?, ?, ?, ?, ?)', [uid('xp'), userId, XP.checkin, 'checkin', nowISO()])
  return true
}

// ==================== 内容接口（公开） ====================

/** 题库概览：各分类节点数 + 题目统计 */
router.get('/overview', (req, res) => {
  try {
    const catCounts = getCategoryNodeCounts()
    const questionTotal = dbGet('SELECT COUNT(*) AS c FROM kg_questions')?.c || 0
    const baguwenTotal = dbGet("SELECT COUNT(*) AS c FROM kg_questions WHERE tags LIKE '%八股文%'")?.c || 0
    const frameworkTotal = dbGet("SELECT COUNT(*) AS c FROM kg_questions WHERE tags LIKE '%框架原理%'")?.c || 0
    const byCat = dbAll('SELECT cat, COUNT(*) AS c FROM kg_questions GROUP BY cat')
    const qMap = {}
    byCat.forEach(r => { qMap[r.cat] = r.c })
    res.json({ success: true, data: { catCounts, qMap, questionTotal, baguwenTotal, frameworkTotal } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 知识点列表（不含 content，用于地图渲染） */
router.get('/nodes', (req, res) => {
  try {
    const { cat } = req.query
    let sql = 'SELECT id, cat, name, level, deps, sort FROM kg_nodes'
    let params = []
    if (cat) { sql += ' WHERE cat = ?'; params = [cat] }
    sql += ' ORDER BY sort ASC'
    const rows = dbAll(sql, params)
    const nodes = rows.map(r => ({ ...r, deps: JSON.parse(r.deps || '[]') }))
    res.json({ success: true, data: nodes })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 知识点详情（含 content 与关联题目 id） */
router.get('/nodes/:id', (req, res) => {
  try {
    const node = dbGet('SELECT * FROM kg_nodes WHERE id = ?', [req.params.id])
    if (!node) return res.json({ success: false, error: '知识点不存在' })
    const qids = dbAll('SELECT id FROM kg_questions WHERE node = ?', [node.id]).map(r => r.id)
    res.json({
      success: true,
      data: {
        ...node,
        deps: JSON.parse(node.deps || '[]'),
        qids
      }
    })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 随堂测验题（某节点关联的题目） */
router.get('/nodes/:id/questions', (req, res) => {
  try {
    const rows = dbAll('SELECT * FROM kg_questions WHERE node = ?', [req.params.id])
    res.json({ success: true, data: rows.map(parseQuestion) })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

function parseQuestion(q) {
  return {
    ...q,
    tags: JSON.parse(q.tags || '[]'),
    options: JSON.parse(q.options || '[]'),
    answer: JSON.parse(q.answer)
  }
}

/** 专项刷题 / 综合筛选题目 */
router.get('/questions', (req, res) => {
  try {
    const { cat, level, tag, type, mode, limit, offset } = req.query
    const conds = []
    const params = []
    if (cat) { conds.push('cat = ?'); params.push(cat) }
    if (level) { conds.push('level = ?'); params.push(Number(level)) }
    if (tag) { conds.push('tags LIKE ?'); params.push(`%${tag}%`) }
    if (type) { conds.push('type = ?'); params.push(type) }
    let sql = 'SELECT * FROM kg_questions'
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
    if (mode === 'random') sql += ' ORDER BY RANDOM()'
    else sql += ' ORDER BY cat, id'
    const take = limit ? Number(limit) : 0
    if (take > 0) sql += ` LIMIT ${take}`
    if (offset) sql += ` OFFSET ${Number(offset)}`
    const rows = dbAll(sql, params)
    res.json({ success: true, data: rows.map(parseQuestion) })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// ==================== 用户学习接口（需登录） ====================

/** 获取用户全部学习进度 */
router.get('/progress', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const stats = getUserStats(userId)
    const learned = dbAll('SELECT nodeId, firstTime, reviewTime FROM kg_learn_records WHERE userId = ?', [userId])
    const favorites = dbAll('SELECT qid FROM kg_favorites WHERE userId = ?', [userId]).map(r => r.qid)
    const wrong = dbAll('SELECT qid FROM kg_wrong_questions WHERE userId = ? AND removed = 0', [userId]).map(r => r.qid)
    const achievements = dbAll('SELECT achId, time FROM kg_achievements WHERE userId = ?', [userId])
    res.json({
      success: true,
      data: {
        ...stats,
        learned: learned.map(l => l.nodeId),
        learnedRecords: learned,
        favorites,
        wrong,
        achievements,
        xpRules: XP,
        levels: LEVELS_XP
      }
    })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 标记已掌握（点亮节点） */
router.post('/learn', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const { nodeId } = req.body
    if (!nodeId) return res.json({ success: false, error: '缺少 nodeId' })
    const node = dbGet('SELECT id FROM kg_nodes WHERE id = ?', [nodeId])
    if (!node) return res.json({ success: false, error: '知识点不存在' })

    const exists = dbGet('SELECT id FROM kg_learn_records WHERE userId = ? AND nodeId = ?', [userId, nodeId])
    let gained = 0
    if (!exists) {
      dbRun('INSERT INTO kg_learn_records (id, userId, nodeId, firstTime, reviewTime) VALUES (?, ?, ?, ?, ?)', [uid('lr'), userId, nodeId, nowISO(), nowISO()])
      dbRun('INSERT INTO kg_xp_logs (id, userId, delta, reason, time) VALUES (?, ?, ?, ?, ?)', [uid('xp'), userId, XP.node, 'node', nowISO()])
      gained += XP.node
    } else {
      dbRun('UPDATE kg_learn_records SET reviewTime = ? WHERE userId = ? AND nodeId = ?', [nowISO(), userId, nodeId])
    }
    if (autoCheckin(userId)) gained += XP.checkin
    const stats = getUserStats(userId)
    const newAchievements = checkAchievementsV2(userId, stats)
    res.json({ success: true, data: { gained, xp: stats.xp, newAchievements, levelKey: stats.levelKey } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 提交单题答案 */
router.post('/answer', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const { qid, userAnswer, correct } = req.body
    if (!qid) return res.json({ success: false, error: '缺少 qid' })
    const isCorrect = correct ? 1 : 0
    dbRun('INSERT INTO kg_answer_records (id, userId, qid, userAnswer, correct, time) VALUES (?, ?, ?, ?, ?, ?)', [uid('ar'), userId, qid, JSON.stringify(userAnswer ?? ''), isCorrect, nowISO()])

    let gained = 0
    if (isCorrect) {
      dbRun('INSERT INTO kg_xp_logs (id, userId, delta, reason, time) VALUES (?, ?, ?, ?, ?)', [uid('xp'), userId, XP.answer, 'answer', nowISO()])
      gained += XP.answer
    } else {
      // 错题入库（不存在或已移除时重新加入）
      const wrong = dbGet('SELECT id FROM kg_wrong_questions WHERE userId = ? AND qid = ?', [userId, qid])
      if (wrong) {
        dbRun('UPDATE kg_wrong_questions SET removed = 0, addedAt = ? WHERE userId = ? AND qid = ?', [nowISO(), userId, qid])
      } else {
        dbRun('INSERT INTO kg_wrong_questions (id, userId, qid, addedAt, removed) VALUES (?, ?, ?, ?, 0)', [uid('wr'), userId, qid, nowISO()])
      }
    }
    if (autoCheckin(userId)) gained += XP.checkin
    const stats = getUserStats(userId)
    const newAchievements = checkAchievementsV2(userId, stats)
    res.json({ success: true, data: { gained, xp: stats.xp, newAchievements, levelKey: stats.levelKey } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 随堂测验批量提交（达标自动点亮节点） */
router.post('/quiz', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const { nodeId, results } = req.body
    if (!nodeId || !Array.isArray(results)) return res.json({ success: false, error: '参数错误' })

    let gained = 0
    let correctCount = 0
    for (const r of results) {
      const isCorrect = r.correct ? 1 : 0
      if (isCorrect) correctCount++
      dbRun('INSERT INTO kg_answer_records (id, userId, qid, userAnswer, correct, time) VALUES (?, ?, ?, ?, ?, ?)', [uid('ar'), userId, r.qid, JSON.stringify(r.userAnswer ?? ''), isCorrect, nowISO()])
      if (isCorrect) {
        dbRun('INSERT INTO kg_xp_logs (id, userId, delta, reason, time) VALUES (?, ?, ?, ?, ?)', [uid('xp'), userId, XP.answer, 'answer', nowISO()])
        gained += XP.answer
      } else {
        const wrong = dbGet('SELECT id FROM kg_wrong_questions WHERE userId = ? AND qid = ?', [userId, r.qid])
        if (wrong) dbRun('UPDATE kg_wrong_questions SET removed = 0, addedAt = ? WHERE userId = ? AND qid = ?', [nowISO(), userId, r.qid])
        else dbRun('INSERT INTO kg_wrong_questions (id, userId, qid, addedAt, removed) VALUES (?, ?, ?, ?, 0)', [uid('wr'), userId, r.qid, nowISO()])
      }
    }

    // 答对率 ≥ 60% 自动点亮节点
    const passRate = results.length ? correctCount / results.length : 0
    let learned = false
    if (passRate >= 0.6) {
      const exists = dbGet('SELECT id FROM kg_learn_records WHERE userId = ? AND nodeId = ?', [userId, nodeId])
      if (!exists) {
        dbRun('INSERT INTO kg_learn_records (id, userId, nodeId, firstTime, reviewTime) VALUES (?, ?, ?, ?, ?)', [uid('lr'), userId, nodeId, nowISO(), nowISO()])
        dbRun('INSERT INTO kg_xp_logs (id, userId, delta, reason, time) VALUES (?, ?, ?, ?, ?)', [uid('xp'), userId, XP.node, 'node', nowISO()])
        gained += XP.node
        learned = true
      }
    }
    if (autoCheckin(userId)) gained += XP.checkin
    const stats = getUserStats(userId)
    const newAchievements = checkAchievementsV2(userId, stats)
    res.json({ success: true, data: { gained, xp: stats.xp, newAchievements, levelKey: stats.levelKey, correctCount, total: results.length, passed: passRate >= 0.6, learned } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 手动打卡 */
router.post('/checkin', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const gained = autoCheckin(userId) ? XP.checkin : 0
    const stats = getUserStats(userId)
    const newAchievements = checkAchievementsV2(userId, stats)
    res.json({ success: true, data: { gained, xp: stats.xp, newAchievements, levelKey: stats.levelKey, checkinStreak: stats.checkinStreak } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 收藏夹列表 */
router.get('/favorites', authRequired, (req, res) => {
  try {
    const rows = dbAll(`
      SELECT
        COALESCE(q.id, iq.id) AS id,
        COALESCE(q.cat, iq.cat) AS cat,
        COALESCE(q.type, iq.type) AS type,
        COALESCE(q.level, iq.level) AS level,
        COALESCE(q.tags, iq.tags) AS tags,
        COALESCE(q.q, iq.q) AS q,
        COALESCE(q.options, iq.options) AS options,
        COALESCE(q.answer, iq.answer) AS answer,
        COALESCE(q.explain, iq.explain) AS explain,
        f.time AS fTime
      FROM kg_favorites f
      LEFT JOIN kg_questions q ON f.qid = q.id
      LEFT JOIN kg_interview_questions iq ON f.qid = iq.id
      WHERE f.userId = ? ORDER BY f.time DESC
    `, [req.userId])
    res.json({ success: true, data: rows.map(r => ({ ...parseQuestion(r), addedAt: r.fTime })) })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 添加收藏 */
router.post('/favorites', authRequired, (req, res) => {
  try {
    const { qid } = req.body
    const exists = dbGet('SELECT id FROM kg_favorites WHERE userId = ? AND qid = ?', [req.userId, qid])
    if (!exists) {
      dbRun('INSERT INTO kg_favorites (id, userId, qid, time) VALUES (?, ?, ?, ?)', [uid('fav'), req.userId, qid, nowISO()])
    }
    res.json({ success: true, data: { favorited: true } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 取消收藏 */
router.delete('/favorites/:qid', authRequired, (req, res) => {
  try {
    dbRun('DELETE FROM kg_favorites WHERE userId = ? AND qid = ?', [req.userId, req.params.qid])
    res.json({ success: true, data: { favorited: false } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 错题本列表 */
router.get('/wrong', authRequired, (req, res) => {
  try {
    const rows = dbAll(`
      SELECT
        COALESCE(q.id, iq.id) AS id,
        COALESCE(q.cat, iq.cat) AS cat,
        COALESCE(q.type, iq.type) AS type,
        COALESCE(q.level, iq.level) AS level,
        COALESCE(q.tags, iq.tags) AS tags,
        COALESCE(q.q, iq.q) AS q,
        COALESCE(q.options, iq.options) AS options,
        COALESCE(q.answer, iq.answer) AS answer,
        COALESCE(q.explain, iq.explain) AS explain,
        w.addedAt
      FROM kg_wrong_questions w
      LEFT JOIN kg_questions q ON w.qid = q.id
      LEFT JOIN kg_interview_questions iq ON w.qid = iq.id
      WHERE w.userId = ? AND w.removed = 0 ORDER BY w.addedAt DESC
    `, [req.userId])
    res.json({ success: true, data: rows.map(r => ({ ...parseQuestion(r), addedAt: r.addedAt })) })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 确认掌握，移除错题标记 */
router.post('/wrong/remove', authRequired, (req, res) => {
  try {
    const { qid } = req.body
    dbRun('UPDATE kg_wrong_questions SET removed = 1 WHERE userId = ? AND qid = ?', [req.userId, qid])
    res.json({ success: true, data: { removed: true } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 技能雷达数据（各分类完成度） */
router.get('/radar', authRequired, (req, res) => {
  try {
    const stats = getUserStats(req.userId)
    res.json({ success: true, data: stats.categoryPercent })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 成长曲线（按天统计点亮/答题数） */
router.get('/growth', authRequired, (req, res) => {
  try {
    const range = req.query.range === 'month' ? 30 : 7
    const userId = req.userId
    const learned = dbAll(`
      SELECT substr(firstTime, 1, 10) AS d, COUNT(*) AS c FROM kg_learn_records
      WHERE userId = ? GROUP BY d ORDER BY d ASC
    `, [userId])
    const answered = dbAll(`
      SELECT substr(time, 1, 10) AS d, COUNT(*) AS c, SUM(correct) AS correct FROM kg_answer_records
      WHERE userId = ? GROUP BY d ORDER BY d ASC
    `, [userId])
    // 构建近 N 天序列
    const days = []
    const map = {}
    for (let i = range - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      days.push(key)
      map[key] = { date: key, learned: 0, answered: 0, correct: 0 }
    }
    learned.forEach(r => { if (map[r.d]) map[r.d].learned = r.c })
    answered.forEach(r => { if (map[r.d]) { map[r.d].answered = r.c; map[r.d].correct = r.correct || 0 } })
    res.json({ success: true, data: days.map(d => map[d]) })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 成就状态 */
router.get('/achievements', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const stats = getUserStats(userId)
    const got = dbAll('SELECT achId, time FROM kg_achievements WHERE userId = ?', [userId])
    res.json({ success: true, data: { stats, got } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

// ==================== 面试题模块（专属面试题库） ====================

function parseInterviewQuestion(q) {
  return {
    ...q,
    hot: !!q.hot,
    tags: JSON.parse(q.tags || '[]'),
    options: JSON.parse(q.options || '[]'),
    answer: JSON.parse(q.answer)
  }
}

/** 面试题库（支持 hot / cat / type / limit 筛选） */
router.get('/interview/questions', (req, res) => {
  try {
    const { hot, cat, type, limit, mode } = req.query
    const conds = []
    const params = []
    if (hot === '1' || hot === 'true') { conds.push('hot = 1') }
    if (cat) { conds.push('cat = ?'); params.push(cat) }
    if (type) { conds.push('type = ?'); params.push(type) }
    let sql = 'SELECT * FROM kg_interview_questions'
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ')
    sql += mode === 'random' ? ' ORDER BY RANDOM()' : ' ORDER BY cat, id'
    const take = limit ? Number(limit) : 0
    if (take > 0) sql += ` LIMIT ${take}`
    const rows = dbAll(sql, params)
    res.json({ success: true, data: rows.map(parseInterviewQuestion) })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 面试题概览（各分类题数 + 高频题数） */
router.get('/interview/overview', (req, res) => {
  try {
    const total = dbGet('SELECT COUNT(*) AS c FROM kg_interview_questions')?.c || 0
    const hotTotal = dbGet('SELECT COUNT(*) AS c FROM kg_interview_questions WHERE hot = 1')?.c || 0
    const byCat = dbAll('SELECT cat, COUNT(*) AS c FROM kg_interview_questions GROUP BY cat')
    const hotByCat = dbAll('SELECT cat, COUNT(*) AS c FROM kg_interview_questions WHERE hot = 1 GROUP BY cat')
    const qMap = {}; byCat.forEach(r => { qMap[r.cat] = r.c })
    const hotMap = {}; hotByCat.forEach(r => { hotMap[r.cat] = r.c })
    res.json({ success: true, data: { total, hotTotal, qMap, hotMap } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 交卷评分：整卷提交 → 评分报告（正确率/分类分布/错题入库/经验值） */
router.post('/interview/submit', authRequired, (req, res) => {
  try {
    const userId = req.userId
    const { answers } = req.body
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.json({ success: false, error: '参数错误：缺少 answers' })
    }

    const qids = [...new Set(answers.map(a => a.qid))]
    if (qids.length === 0) return res.json({ success: false, error: '参数错误：缺少题目' })

    // 批量取题
    const placeholders = qids.map(() => '?').join(',')
    const rows = dbAll(`SELECT * FROM kg_interview_questions WHERE id IN (${placeholders})`, qids)
    const qMap = {}
    rows.forEach(q => { qMap[q.id] = q })

    let gained = 0
    let correctCount = 0
    const detail = []
    const wrongIds = []

    for (const a of answers) {
      const q = qMap[a.qid]
      if (!q) continue
      const correctAnswer = JSON.parse(q.answer)
      const isCorrect = checkAnswer(a.userAnswer, correctAnswer) ? 1 : 0
      if (isCorrect) correctCount++
      dbRun('INSERT INTO kg_answer_records (id, userId, qid, userAnswer, correct, time) VALUES (?, ?, ?, ?, ?, ?)',
        [uid('ar'), userId, q.qid, JSON.stringify(a.userAnswer ?? ''), isCorrect, nowISO()])
      if (isCorrect) {
        dbRun('INSERT INTO kg_xp_logs (id, userId, delta, reason, time) VALUES (?, ?, ?, ?, ?)',
          [uid('xp'), userId, XP.answer, 'answer', nowISO()])
        gained += XP.answer
      } else {
        const wrong = dbGet('SELECT id FROM kg_wrong_questions WHERE userId = ? AND qid = ?', [userId, q.qid])
        if (wrong) dbRun('UPDATE kg_wrong_questions SET removed = 0, addedAt = ? WHERE userId = ? AND qid = ?', [nowISO(), userId, q.qid])
        else dbRun('INSERT INTO kg_wrong_questions (id, userId, qid, addedAt, removed) VALUES (?, ?, ?, ?, 0)', [uid('wr'), userId, q.qid, nowISO()])
        wrongIds.push(q.qid)
      }
      detail.push({
        qid: q.qid,
        q: q.q,
        cat: q.cat,
        type: q.type,
        options: JSON.parse(q.options || '[]'),
        userAnswer: a.userAnswer,
        correct: !!isCorrect,
        answer: correctAnswer,
        explain: q.explain || ''
      })
    }

    const total = detail.length
    const rate = total > 0 ? Math.round((correctCount / total) * 1000) / 10 : 0

    // 记录考试
    dbRun('INSERT INTO kg_exams (id, userId, total, correct, rate, detail, time) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [uid('exam'), userId, total, correctCount, rate, JSON.stringify(detail), nowISO()])

    if (autoCheckin(userId)) gained += XP.checkin
    const stats = getUserStats(userId)
    const newAchievements = checkAchievementsV2(userId, stats)

    // 分类分布统计
    const catStats = {}
    detail.forEach(d => {
      if (!catStats[d.cat]) catStats[d.cat] = { total: 0, correct: 0 }
      catStats[d.cat].total++
      if (d.correct) catStats[d.cat].correct++
    })

    res.json({
      success: true,
      data: {
        total,
        correctCount,
        wrongCount: total - correctCount,
        rate,
        gained,
        xp: stats.xp,
        levelKey: stats.levelKey,
        newAchievements,
        wrongIds,
        catStats,
        detail
      }
    })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 考试记录（历史） */
router.get('/interview/history', authRequired, (req, res) => {
  try {
    const rows = dbAll('SELECT id, total, correct, rate, time FROM kg_exams WHERE userId = ? ORDER BY time DESC LIMIT 50', [req.userId])
    res.json({ success: true, data: rows })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

/** 单次考试详情 */
router.get('/interview/history/:id', authRequired, (req, res) => {
  try {
    const exam = dbGet('SELECT * FROM kg_exams WHERE id = ? AND userId = ?', [req.params.id, req.userId])
    if (!exam) return res.json({ success: false, error: '考试记录不存在' })
    res.json({ success: true, data: { ...exam, detail: JSON.parse(exam.detail || '[]') } })
  } catch (e) {
    res.json({ success: false, error: e.message })
  }
})

export default router
