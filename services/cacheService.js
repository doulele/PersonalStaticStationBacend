/**
 * 简易内存缓存 — 减少对高德 API 的重复调用
 *
 * 设计原则：
 *   - 热点搜索（region-hot）：缓存 1 小时（热门景点排行不常变）
 *   - IP 定位：缓存 30 分钟（IP 在短时间内不会跳变）
 *   - 地理编码：缓存 24 小时（经纬度几乎不变）
 *   - 其他查询（搜索/动态规划）：不缓存（需要实时结果）
 */

const store = new Map()

/**
 * 获取缓存
 * @param {string} key
 * @returns {any|null}
 */
export function cacheGet(key) {
  const entry = store.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    store.delete(key)
    return null
  }
  return entry.value
}

/**
 * 设置缓存
 * @param {string} key
 * @param {any} value
 * @param {number} ttlMs - 过期时间（毫秒）
 */
export function cacheSet(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs })
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
