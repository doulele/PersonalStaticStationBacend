/**
 * SQLite 数据库层（基于 sql.js）
 * ------------------------------------------------------------
 * sql.js 是纯 JavaScript 的 SQLite 实现，通过 WebAssembly 运行，
 * 无需安装任何原生依赖或外部数据库服务。
 *
 * 使用方式：
 *   1. app.js 启动时 await initDatabase()
 *   2. 路由中直接 import { dbAll, dbGet, dbRun } from '../services/db.js'
 *
 * 所有读写操作自动持久化到 data/app.db 文件。
 */
import initSqlJs from 'sql.js'
import fs from 'fs'
import path from 'path'

const DB_PATH = path.join(process.cwd(), 'data', 'app.db')

let _db = null // sql.js Database 实例

// ==================== 初始化 ====================

/**
 * 初始化数据库连接（必须在 app.js 启动时 await 调用）
 * 如果 data/app.db 不存在则自动创建
 */
export async function initDatabase() {
  const SQL = await initSqlJs()

  // 确保 data 目录存在
  const dir = path.dirname(DB_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })

  // 从文件加载已有数据库，或创建新数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH)
    _db = new SQL.Database(buffer)
    console.log(`[DB] 已加载数据库: ${DB_PATH} (${buffer.length} bytes)`)
  } else {
    _db = new SQL.Database()
    console.log('[DB] 创建新数据库')
  }

  // 启用 WAL 模式（更好的并发性能）
  _db.run('PRAGMA journal_mode=WAL')
  _db.run('PRAGMA foreign_keys=ON')

  // 创建所有表
  createTables()

  // 首次写入磁盘
  saveToDisk()

  console.log('[DB] 数据库初始化完成')
}

// ==================== 表定义 ====================

/** 从旧版 family_meeting_state（id=1）迁移到新版（userId 主键） */
function migrateFamilyMeetingState() {
  try {
    const result = _db.exec("PRAGMA table_info('family_meeting_state')")
    if (result.length === 0) return // 表不存在

    const columns = result[0].values.map(r => r[1])
    if (columns.includes('userId')) return // 已迁移

    console.log('[DB] 检测到旧版 family_meeting_state 表，开始迁移...')

    // 读取旧数据
    const oldData = _db.exec("SELECT state FROM family_meeting_state WHERE id = 1")
    const oldState = (oldData.length > 0 && oldData[0].values.length > 0)
      ? oldData[0].values[0][0] : null

    // 删除旧表
    _db.run('DROP TABLE family_meeting_state')

    // 创建新表
    _db.run(`
      CREATE TABLE family_meeting_state (
        userId TEXT PRIMARY KEY,
        state TEXT
      )
    `)

    // 迁移旧数据
    if (oldState) {
      try {
        const parsed = JSON.parse(oldState)
        const ownerId = parsed?.family?.adminId || 'legacy_user'
        _db.run('INSERT OR REPLACE INTO family_meeting_state (userId, state) VALUES (?, ?)', [ownerId, oldState])
        console.log(`[DB] 已迁移旧数据到用户: ${ownerId}`)
      } catch {
        console.log('[DB] 旧数据无法解析，跳过迁移')
      }
    }

    console.log('[DB] family_meeting_state 迁移完成')
  } catch (e) {
    console.error('[DB] 迁移 family_meeting_state 失败:', e.message)
  }
}

/** 为 users 表添加用户名注册相关列（兼容旧数据库迁移） */
function migrateUsersTable() {
  try {
    const result = _db.exec("PRAGMA table_info('users')")
    if (result.length === 0) return
    const columns = result[0].values.map(r => r[1])

    if (!columns.includes('username')) {
      _db.run('ALTER TABLE users ADD COLUMN username TEXT UNIQUE')
      console.log('[DB] 已添加 users.username 列')
    }
    if (!columns.includes('securityQuestion')) {
      _db.run('ALTER TABLE users ADD COLUMN securityQuestion TEXT')
      console.log('[DB] 已添加 users.securityQuestion 列')
    }
    if (!columns.includes('securityAnswerHash')) {
      _db.run('ALTER TABLE users ADD COLUMN securityAnswerHash TEXT')
      console.log('[DB] 已添加 users.securityAnswerHash 列')
    }
  } catch (e) {
    console.error('[DB] 迁移 users 表失败:', e.message)
  }
}

function createTables() {
  _db.run(`
    CREATE TABLE IF NOT EXISTS users (
      userId    TEXT PRIMARY KEY,
      email     TEXT UNIQUE,
      passwordHash TEXT,
      nickname  TEXT,
      pinHash   TEXT,
      createdAt TEXT,
      lastLogin TEXT,
      tokens    TEXT DEFAULT '[]',
      username  TEXT UNIQUE,
      securityQuestion TEXT,
      securityAnswerHash TEXT
    )
  `)

  // 自动迁移旧数据库（添加 username / securityQuestion / securityAnswerHash 列）
  migrateUsersTable()

  _db.run(`
    CREATE TABLE IF NOT EXISTS user_plans (
      planId   TEXT PRIMARY KEY,
      planName TEXT NOT NULL,
      userId   TEXT NOT NULL,
      planData TEXT,
      savedAt  TEXT,
      summary  TEXT,
      FOREIGN KEY (userId) REFERENCES users(userId)
    )
  `)

  _db.run(`
    CREATE TABLE IF NOT EXISTS user_preferences (
      userId              TEXT PRIMARY KEY,
      preferredTypes      TEXT DEFAULT '[]',
      budgetLevel         TEXT DEFAULT 'medium',
      preferredFoodTypes  TEXT DEFAULT '[]',
      stayCorrectionFactor REAL DEFAULT 1.0,
      updatedAt           TEXT,
      FOREIGN KEY (userId) REFERENCES users(userId)
    )
  `)

  _db.run(`
    CREATE TABLE IF NOT EXISTS tool_clicks (
      path   TEXT PRIMARY KEY,
      clicks INTEGER DEFAULT 0
    )
  `)

  // 家庭会议：全量状态存为 JSON blob（按 userId 隔离）
  // 先检查是否需要从旧表迁移（旧表用 id=1，新表用 userId 做主键）
  migrateFamilyMeetingState()
  _db.run(`
    CREATE TABLE IF NOT EXISTS family_meeting_state (
      userId TEXT PRIMARY KEY,
      state TEXT
    )
  `)

  // 睡眠内容库：按分类 + 条目 JSON 存储
  _db.run(`
    CREATE TABLE IF NOT EXISTS sleep_content (
      id       TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      item_data TEXT
    )
  `)

  // 用户声音库
  _db.run(`
    CREATE TABLE IF NOT EXISTS voices (
      id        TEXT PRIMARY KEY,
      name      TEXT,
      filename  TEXT,
      size      INTEGER DEFAULT 0,
      duration  REAL DEFAULT 0,
      createdAt TEXT
    )
  `)
}

// ==================== 持久化 ====================

/** 将内存数据库写入磁盘文件 */
export function saveToDisk() {
  if (!_db) return
  const data = _db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(DB_PATH, buffer)
}

// ==================== 查询助手 ====================

/** 获取 db 实例（仅供内部/高级使用） */
export function getDb() {
  if (!_db) throw new Error('数据库尚未初始化，请先调用 initDatabase()')
  return _db
}

/**
 * 执行查询，返回所有行
 * @param {string} sql - SQL 语句
 * @param {Array} params - 参数数组
 * @returns {Array<Object>}
 */
export function dbAll(sql, params = []) {
  const stmt = _db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  const rows = []
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

/**
 * 执行查询，返回第一行
 * @param {string} sql
 * @param {Array} params
 * @returns {Object|null}
 */
export function dbGet(sql, params = []) {
  const stmt = _db.prepare(sql)
  if (params.length > 0) stmt.bind(params)
  let row = null
  if (stmt.step()) {
    row = stmt.getAsObject()
  }
  stmt.free()
  return row
}

/**
 * 执行写操作（INSERT/UPDATE/DELETE），自动保存到磁盘
 * @param {string} sql
 * @param {Array} params
 * @returns {Object} { changes, lastInsertRowId }
 */
export function dbRun(sql, params = []) {
  _db.run(sql, params)
  const result = {
    changes: _db.getRowsModified(),
  }
  saveToDisk()
  return result
}

/**
 * 执行多条 SQL（事务），自动保存
 * @param {Function} fn - (db) => { ... }
 */
export function dbTransaction(fn) {
  _db.run('BEGIN')
  try {
    fn(_db)
    _db.run('COMMIT')
    saveToDisk()
  } catch (err) {
    _db.run('ROLLBACK')
    throw err
  }
}

/**
 * 更新用户信息
 * @param {string} userId - 用户ID
 * @param {Object} fields - 要更新的字段 { nickname?, passwordHash?, ... }
 * @returns {Object} { changes }
 */
export function updateUser(userId, fields) {
  const keys = Object.keys(fields)
  if (keys.length === 0) return { changes: 0 }

  const setClauses = keys.map(k => `${k} = ?`).join(', ')
  const values = keys.map(k => fields[k])

  return dbRun(
    `UPDATE users SET ${setClauses} WHERE userId = ?`,
    [...values, userId]
  )
}

console.log('[DB] 模块已加载（需调用 initDatabase() 初始化）')
