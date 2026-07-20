/**
 * 永恒档案 API
 * 
 * 核心数据：
 *   - ea_files: 文件档案（元数据、标签、版本链、安全等级）
 *   - ea_file_versions: 文件版本链
 *   - ea_shares: 分享链接
 *   - ea_recycle_bin: 回收站
 *   - ea_settings: 用户设置
 */
import { Router } from 'express'
import { dbGet, dbAll, dbRun, dbTransaction } from '../services/db.js'
import { authRequired, authOptional } from '../middlewares/auth.js'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'

const router = Router()

// 文件上传配置
const uploadDir = path.join(process.cwd(), 'data', 'uploads', 'eternalArchive')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userDir = path.join(uploadDir, req.userId || 'anonymous')
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true })
    }
    cb(null, userDir)
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8) + path.extname(file.originalname)
    cb(null, uniqueName)
  }
})

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
})

// ==================== 文件 CRUD ====================

/** 获取所有文件 */
router.get('/files', authRequired, (req, res) => {
  const rows = dbAll(
    'SELECT * FROM ea_files WHERE userId = ? AND status != ? ORDER BY uploadDate DESC',
    [req.userId, 'deleted']
  )
  const files = rows.map(r => ({
    ...JSON.parse(r.fileData),
    id: r.fileId,
    userId: r.userId,
    storagePath: r.storagePath
  }))
  res.json({ success: true, data: files })
})

/** 上传文件 */
router.post('/files', authRequired, upload.single('file'), (req, res) => {
  const file = req.file
  if (!file) {
    return res.status(400).json({ error: '请选择要上传的文件' })
  }

  const fileId = 'ea_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const now = new Date().toISOString()

  // 解析前端传来的元数据
  let metadata = {}
  try {
    if (req.body.metadata) {
      metadata = JSON.parse(req.body.metadata)
    }
  } catch { }

  // 计算文件哈希
  let fileHash = ''
  try {
    const fileBuffer = fs.readFileSync(file.path)
    fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex')
  } catch { }

  // 检查去重
  if (fileHash) {
    const existing = dbGet(
      'SELECT * FROM ea_files WHERE fileHash = ? AND userId = ? AND status != ?',
      [fileHash, req.userId, 'deleted']
    )
    if (existing) {
      // 删除刚上传的文件
      try { fs.unlinkSync(file.path) } catch { }
      return res.json({
        success: true,
        duplicate: true,
        data: {
          existingFileId: existing.fileId,
          existingFileName: JSON.parse(existing.fileData).name,
          message: '该文件已存在于您的档案馆中'
        }
      })
    }
  }

  const fileData = {
    id: fileId,
    name: metadata.name || file.originalname,
    description: metadata.description || '',
    category: metadata.category || '其他',
    tags: metadata.tags || [],
    securityLevel: metadata.securityLevel || 'B',
    size: file.size,
    type: file.mimetype,
    uploadDate: now,
    updateDate: now,
    versions: [{ id: 'v1', date: now, note: '初始版本', fileName: file.originalname }],
    versionChain: null,
    ocrText: metadata.ocrText || '',
    relatedTasks: [],
    freshUntil: metadata.freshUntil || null,
    isColdStorage: false,
    viewCount: 0,
    downloadCount: 0
  }

  dbRun(
    `INSERT INTO ea_files (fileId, userId, fileData, storagePath, fileHash, fileSize, mimeType, status, uploadDate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [fileId, req.userId, JSON.stringify(fileData), file.path, fileHash, file.size, file.mimetype, 'active', now]
  )

  res.json({
    success: true,
    data: { ...fileData, storagePath: file.path }
  })
})

/** 批量上传元数据（不含文件本身，用于前端同步） */
router.post('/files/batch', authRequired, (req, res) => {
  const { files } = req.body
  if (!Array.isArray(files)) {
    return res.status(400).json({ error: 'files 必须是数组' })
  }

  const now = new Date().toISOString()
  let created = 0
  let duplicates = 0

  for (const fileData of files) {
    const fileId = fileData.id || 'ea_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const existing = dbGet('SELECT * FROM ea_files WHERE fileId = ? AND userId = ?', [fileId, req.userId])
    if (existing) {
      duplicates++
      continue
    }

    dbRun(
      `INSERT INTO ea_files (fileId, userId, fileData, storagePath, fileHash, fileSize, mimeType, status, uploadDate)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fileId, req.userId, JSON.stringify({ ...fileData, id: fileId }), '', '', fileData.size || 0, fileData.type || '', 'active', now]
    )
    created++
  }

  res.json({ success: true, data: { created, duplicates } })
})

/** 更新文件 */
router.put('/files/:id', authRequired, (req, res) => {
  const { id } = req.params
  const updates = req.body

  const existing = dbGet('SELECT * FROM ea_files WHERE fileId = ? AND userId = ?', [id, req.userId])
  if (!existing) {
    return res.status(404).json({ error: '文件不存在' })
  }

  const current = JSON.parse(existing.fileData)
  const updated = { ...current, ...updates, updateDate: new Date().toISOString() }

  dbRun('UPDATE ea_files SET fileData = ? WHERE fileId = ? AND userId = ?', [JSON.stringify(updated), id, req.userId])
  res.json({ success: true, data: updated })
})

/** 删除文件（移入回收站） */
router.delete('/files/:id', authRequired, (req, res) => {
  const { id } = req.params
  const existing = dbGet('SELECT * FROM ea_files WHERE fileId = ? AND userId = ?', [id, req.userId])
  if (!existing) {
    return res.status(404).json({ error: '文件不存在' })
  }

  const fileData = JSON.parse(existing.fileData)
  const securityLevel = fileData.securityLevel || 'B'
  const retentionDays = securityLevel === 'S' ? 60 : securityLevel === 'A' ? 30 : 15

  // 移入回收站
  const now = new Date().toISOString()
  const recycleId = 'ear_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  dbRun(
    `INSERT INTO ea_recycle_bin (id, userId, fileId, fileData, storagePath, deletedAt, retentionDays)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [recycleId, req.userId, id, JSON.stringify(fileData), existing.storagePath, now, retentionDays]
  )

  // 标记原文件为已删除
  dbRun('UPDATE ea_files SET status = ? WHERE fileId = ? AND userId = ?', ['deleted', id, req.userId])

  res.json({ success: true, data: { retentionDays } })
})

/** 文件版本管理：添加新版本 */
router.post('/files/:id/versions', authRequired, upload.single('file'), (req, res) => {
  const { id } = req.params
  const existing = dbGet('SELECT * FROM ea_files WHERE fileId = ? AND userId = ?', [id, req.userId])
  if (!existing) {
    return res.status(404).json({ error: '文件不存在' })
  }

  const current = JSON.parse(existing.fileData)
  const versionCount = (current.versions || []).length + 1
  const newVersion = {
    id: 'v' + versionCount,
    date: new Date().toISOString(),
    note: req.body.note || `版本${versionCount}`,
    fileName: req.file ? req.file.originalname : current.name
  }

  current.versions = [...(current.versions || []), newVersion]
  current.updateDate = new Date().toISOString()

  if (req.file) {
    current.size = req.file.size
    current.type = req.file.mimetype
    // 更新存储路径
    dbRun('UPDATE ea_files SET fileData = ?, storagePath = ?, fileSize = ?, mimeType = ? WHERE fileId = ? AND userId = ?',
      [JSON.stringify(current), req.file.path, req.file.size, req.file.mimetype, id, req.userId])
  } else {
    dbRun('UPDATE ea_files SET fileData = ? WHERE fileId = ? AND userId = ?', [JSON.stringify(current), id, req.userId])
  }

  res.json({ success: true, data: newVersion })
})

// ==================== 回收站 ====================

/** 获取回收站 */
router.get('/recycle-bin', authRequired, (req, res) => {
  const rows = dbAll('SELECT * FROM ea_recycle_bin WHERE userId = ? ORDER BY deletedAt DESC', [req.userId])
  const files = rows.map(r => ({
    ...JSON.parse(r.fileData),
    id: r.fileId,
    deletedAt: r.deletedAt,
    retentionDays: r.retentionDays
  }))
  res.json({ success: true, data: files })
})

/** 从回收站恢复 */
router.post('/recycle-bin/:id/restore', authRequired, (req, res) => {
  const { id } = req.params
  const existing = dbGet('SELECT * FROM ea_recycle_bin WHERE fileId = ? AND userId = ?', [id, req.userId])
  if (!existing) {
    return res.status(404).json({ error: '回收站中未找到该文件' })
  }

  dbRun('UPDATE ea_files SET status = ? WHERE fileId = ? AND userId = ?', ['active', id, req.userId])
  dbRun('DELETE FROM ea_recycle_bin WHERE fileId = ? AND userId = ?', [id, req.userId])

  res.json({ success: true, data: { restored: true } })
})

/** 永久销毁 */
router.delete('/recycle-bin/:id', authRequired, (req, res) => {
  const { id } = req.params
  const existing = dbGet('SELECT * FROM ea_recycle_bin WHERE fileId = ? AND userId = ?', [id, req.userId])
  if (!existing) {
    return res.status(404).json({ error: '回收站中未找到该文件' })
  }

  // 删除物理文件
  if (existing.storagePath) {
    try { fs.unlinkSync(existing.storagePath) } catch { }
  }

  dbRun('DELETE FROM ea_recycle_bin WHERE fileId = ? AND userId = ?', [id, req.userId])
  dbRun('DELETE FROM ea_files WHERE fileId = ? AND userId = ? AND status = ?', [id, req.userId, 'deleted'])

  res.json({ success: true })
})

// ==================== 分享管理 ====================

/** 获取所有分享 */
router.get('/shares', authRequired, (req, res) => {
  const rows = dbAll('SELECT * FROM ea_shares WHERE userId = ? ORDER BY createdAt DESC', [req.userId])
  const shares = rows.map(r => ({
    id: r.shareId,
    ...JSON.parse(r.shareData)
  }))
  res.json({ success: true, data: shares })
})

/** 创建分享 */
router.post('/shares', authRequired, (req, res) => {
  const shareData = req.body
  const shareId = 'eas_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  const now = new Date().toISOString()

  dbRun(
    `INSERT INTO ea_shares (shareId, userId, fileId, shareData, createdAt, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [shareId, req.userId, shareData.fileId, JSON.stringify(shareData), now, 'active']
  )

  res.json({ success: true, data: { id: shareId, ...shareData, createdAt: now } })
})

/** 撤回分享 */
router.put('/shares/:id/revoke', authRequired, (req, res) => {
  const { id } = req.params
  const existing = dbGet('SELECT * FROM ea_shares WHERE shareId = ? AND userId = ?', [id, req.userId])
  if (!existing) {
    return res.status(404).json({ error: '分享不存在' })
  }

  dbRun('UPDATE ea_shares SET status = ? WHERE shareId = ? AND userId = ?', ['revoked', id, req.userId])
  res.json({ success: true })
})

// ==================== 全量同步 ====================

/** 一次性拉取所有档案数据 */
router.get('/sync-all', authRequired, (req, res) => {
  const files = dbAll("SELECT * FROM ea_files WHERE userId = ? AND status != 'deleted' ORDER BY uploadDate DESC", [req.userId])
    .map(r => ({ ...JSON.parse(r.fileData), id: r.fileId }))

  const recycleRows = dbAll('SELECT * FROM ea_recycle_bin WHERE userId = ? ORDER BY deletedAt DESC', [req.userId])
  const recycleBin = recycleRows.map(r => ({
    ...JSON.parse(r.fileData),
    id: r.fileId,
    deletedAt: r.deletedAt,
    retentionDays: r.retentionDays
  }))

  const shareRows = dbAll("SELECT * FROM ea_shares WHERE userId = ? AND status = 'active' ORDER BY createdAt DESC", [req.userId])
  const shares = shareRows.map(r => ({
    id: r.shareId,
    ...JSON.parse(r.shareData)
  }))

  res.json({
    success: true,
    data: { files, recycleBin, shares }
  })
})

/** 一次性保存所有档案数据 */
router.post('/sync-all', authRequired, (req, res) => {
  const { files, recycleBin, shares } = req.body

  dbTransaction(() => {
    if (Array.isArray(files)) {
      // 不删除现有数据，而是 upsert
      for (const file of files) {
        const existing = dbGet('SELECT * FROM ea_files WHERE fileId = ? AND userId = ?', [file.id, req.userId])
        if (existing) {
          const current = JSON.parse(existing.fileData)
          dbRun('UPDATE ea_files SET fileData = ?, fileSize = ?, mimeType = ? WHERE fileId = ? AND userId = ?',
            [JSON.stringify({ ...current, ...file }), file.size || 0, file.type || '', file.id, req.userId])
        } else {
          const now = new Date().toISOString()
          dbRun(
            'INSERT INTO ea_files (fileId, userId, fileData, storagePath, fileHash, fileSize, mimeType, status, uploadDate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [file.id, req.userId, JSON.stringify(file), '', '', file.size || 0, file.type || '', 'active', now]
          )
        }
      }
    }

    if (Array.isArray(recycleBin)) {
      dbRun('DELETE FROM ea_recycle_bin WHERE userId = ?', [req.userId])
      for (const item of recycleBin) {
        const { deletedAt, retentionDays, ...fileData } = item
        const recycleId = 'ear_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
        dbRun(
          'INSERT INTO ea_recycle_bin (id, userId, fileId, fileData, storagePath, deletedAt, retentionDays) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [recycleId, req.userId, item.id, JSON.stringify(fileData), '', deletedAt || new Date().toISOString(), retentionDays || 15]
        )
      }
    }

    if (Array.isArray(shares)) {
      dbRun("DELETE FROM ea_shares WHERE userId = ? AND status = 'active'", [req.userId])
      for (const share of shares) {
        const { id, fileId, ...shareData } = share
        dbRun(
          'INSERT INTO ea_shares (shareId, userId, fileId, shareData, createdAt, status) VALUES (?, ?, ?, ?, ?, ?)',
          [id || 'eas_' + Date.now().toString(36), req.userId, fileId, JSON.stringify(shareData), share.createdAt || new Date().toISOString(), 'active']
        )
      }
    }
  })

  res.json({ success: true })
})

// ==================== 文件下载 ====================

/** 下载文件 */
router.get('/files/:id/download', authRequired, (req, res) => {
  const { id } = req.params
  const existing = dbGet('SELECT * FROM ea_files WHERE fileId = ? AND userId = ?', [id, req.userId])
  if (!existing) {
    return res.status(404).json({ error: '文件不存在' })
  }

  const fileData = JSON.parse(existing.fileData)

  // 增加下载计数
  fileData.downloadCount = (fileData.downloadCount || 0) + 1
  dbRun('UPDATE ea_files SET fileData = ? WHERE fileId = ? AND userId = ?', [JSON.stringify(fileData), id, req.userId])

  if (existing.storagePath && fs.existsSync(existing.storagePath)) {
    res.download(existing.storagePath, fileData.name)
  } else {
    res.status(404).json({ error: '文件存储路径不存在，可能已被清理' })
  }
})

export default router
