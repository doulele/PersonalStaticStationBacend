/**
 * 内存 + 磁盘两级缓存
 * ------------------------------------------------------------
 * 内存缓存：热点数据，进程生命周期内有效（重启失效）
 * 磁盘缓存：可选持久化，重启后仍可复用（TTL 依然生效，过期自动失效）
 *
 * 持久化仅用于"当日不变"类数据（如 F10 财务、增强数据），
 * 通过 cacheSet(key, value, ttlMs, true) / cacheGet(key, true) 启用。
 * 磁盘文件存放于 data/stockrec-cache/，按 key 的 md5 命名，原子写入，
 * 避免服务重启后冷启动需重新爬取数百个外部接口请求。
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const store = new Map()

// 磁盘缓存目录
const DISK_DIR = path.join(process.cwd(), 'data', 'stockrec-cache')

function diskFileOf(key) {
  const hash = crypto.createHash('md5').update(key).digest('hex')
  return path.join(DISK_DIR, hash + '.json')
}

/** 读磁盘缓存（判断 TTL，过期则删除文件返回 null） */
function diskCacheGet(key) {
  try {
    const f = diskFileOf(key)
    if (!fs.existsSync(f)) return null
    const j = JSON.parse(fs.readFileSync(f, 'utf8'))
    if (!j || Date.now() > j.expiresAt) {
      try { fs.unlinkSync(f) } catch { /* ignore */ }
      return null
    }
    return j // { value, expiresAt }
  } catch {
    return null
  }
}

/** 写磁盘缓存（原子替换，避免半写文件；失败不影响功能，退回纯内存缓存） */
function diskCacheSet(key, value, ttlMs) {
  try {
    if (!fs.existsSync(DISK_DIR)) fs.mkdirSync(DISK_DIR, { recursive: true })
    const f = diskFileOf(key)
    const tmp = f + '.tmp'
    fs.writeFileSync(tmp, JSON.stringify({ expiresAt: Date.now() + ttlMs, value }))
    fs.renameSync(tmp, f)
  } catch (e) {
    console.error('[cache] 磁盘缓存写入失败:', e.message)
  }
}

/**
 * 获取缓存
 * @param {string} key
 * @param {boolean} [persist] 是否启用磁盘兜底（内存 miss 时尝试读磁盘）
 * @returns {any|null}
 */
export function cacheGet(key, persist = false) {
  const entry = store.get(key)
  if (entry) {
    if (Date.now() > entry.expiresAt) {
      store.delete(key)
      return null
    }
    return entry.value
  }
  if (persist) {
    const j = diskCacheGet(key)
    if (j) {
      store.set(key, { value: j.value, expiresAt: j.expiresAt })
      return j.value
    }
  }
  return null
}

/**
 * 设置缓存
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs - 过期时间（毫秒）
 * @param {boolean} [persist] 是否同时落盘（仅"当日不变"类数据启用）
 */
export function cacheSet(key, value, ttlMs, persist = false) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
  if (persist) diskCacheSet(key, value, ttlMs)
}

/**
 * 删除缓存（用于强制刷新等场景）
 * @returns {boolean} 是否删除成功
 */
export function cacheDel(key) {
  return store.delete(key)
}

/**
 * 清理过期缓存（可定时调用）
 */
export function cachePrune() {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.expiresAt) store.delete(key)
  }
}

// 每 10 分钟自动清理一次过期缓存
setInterval(cachePrune, 10 * 60 * 1000)

export default { cacheGet, cacheSet, cachePrune }
