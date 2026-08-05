import { Router } from 'express'
import axios from 'axios'
import crypto from 'crypto'
import https from 'https'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile, exec, spawn } from 'child_process'
import { promisify } from 'util'
import HttpsProxyAgent from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import config from '../config/index.js'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

const router = Router()

// 忽略过期/自签名证书的 Agent（用于 tv.chen-dong.com 等证书过期的站点）
const insecureAgent = new https.Agent({ rejectUnauthorized: false })

// ==================== nnpp API 签名算法 ====================
// 逆向自: m1-z2.cloud.nnpp.vip:2223/static/js/main.9c13c607.js
function computeNnppSign() {
  const now = new Date()
  const localTime = new Date(now.getTime() + 60000 * now.getTimezoneOffset() + 3600000 * 8)
  const dayOfMonth = localTime.getDate()
  const dayOfWeek = localTime.getDay()

  const raw = (dayOfMonth + 18) ^ 10
  const hash1 = crypto.createHash('md5').update(String(raw), 'utf8').digest('hex')
  const hash1_10 = hash1.substring(0, 10)
  const z = crypto.createHash('md5').update(hash1_10, 'utf8').digest('hex')
  const s1ig = dayOfWeek + 11397

  return { z, s1ig }
}

// ==================== 搜索结果缓存 ====================
// key: "平台:关键词" → { results, groups, ungrouped, timestamp }
const searchCache = new Map()
const SEARCH_CACHE_MAX = 200          // 最多缓存 200 条
const SEARCH_CACHE_TTL = 30 * 60 * 1000 // 30 分钟

function getCacheKey(platform, query) {
  return `${platform}:${query.trim()}`
}

function getCachedSearch(platform, query) {
  const key = getCacheKey(platform, query)
  const entry = searchCache.get(key)
  if (entry && Date.now() - entry.timestamp < SEARCH_CACHE_TTL) {
    console.log(`[search cache] HIT "${key}" (${entry.results.length} results)`)
    return entry
  }
  return null
}

function setCachedSearch(platform, query, data) {
  const key = getCacheKey(platform, query)
  // 超出最大容量时删除最旧的一半
  if (searchCache.size >= SEARCH_CACHE_MAX) {
    const entries = [...searchCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toDelete = entries.slice(0, Math.floor(SEARCH_CACHE_MAX / 2))
    for (const [k] of toDelete) searchCache.delete(k)
    console.log(`[search cache] 清理 ${toDelete.length} 条过期缓存`)
  }
  searchCache.set(key, { ...data, timestamp: Date.now() })
  console.log(`[search cache] SET "${key}" (${data.results.length} results)`)
}

// ==================== 流媒体代理缓存 ====================
// token -> { streamUrl, referer, expires, needProxy }
const streamCache = new Map()
const STREAM_TOKEN_TTL = 10 * 60 * 1000 // 10分钟

function generateToken() {
  return crypto.randomBytes(16).toString('hex')
}

/**
 * 根据 yt-dlp proxy 配置创建 axios 可用的 httpAgent / httpsAgent
 * 同时用于 yt-dlp 取流地址 + 后端代理流媒体请求
 */
function createProxyHttpAgent() {
  const proxyUrl = config.ytDlp?.proxy || ''
  if (!proxyUrl) return null
  try {
    if (proxyUrl.startsWith('socks5://') || proxyUrl.startsWith('socks://')) {
      return new SocksProxyAgent(proxyUrl)
    }
    // HTTP / HTTPS 代理统一使用 HttpsProxyAgent（它同时支持 http 和 https 目标）
    return new HttpsProxyAgent(proxyUrl)
  } catch (err) {
    console.warn('[proxy-agent] 代理配置无效:', proxyUrl, err.message)
    return null
  }
}

// 复用同一个 agent 实例
const proxyHttpAgent = createProxyHttpAgent()
if (proxyHttpAgent) {
  console.log(`[VideoParse] 代理已配置，YouTube 等境外流媒体将走代理`)
} else {
  console.log('[VideoParse] 未配置代理（YT_DLP_PROXY），YouTube 等境外流媒体将无法访问')
}

/**
 * 判断是否需要走代理（境外平台，CDN 域名被墙）
 */
function needsProxyForUrl(url) {
  return url.includes('youtube.com') || url.includes('youtu.be') ||
    url.includes('googlevideo.com') || url.includes('ggpht.com')
}

/**
 * 返回添加了 proxy agent 的 axios 请求选项（仅当目标域名被墙时）
 */
function withOptionalProxy(baseOptions = {}, targetUrl = '') {
  if (!proxyHttpAgent || !needsProxyForUrl(targetUrl)) {
    return baseOptions
  }
  return {
    ...baseOptions,
    httpAgent: proxyHttpAgent,
    httpsAgent: proxyHttpAgent
  }
}

/**
 * 根据原始视频链接判断需要发送的 Referer
 */
function getRefererForUrl(url) {
  if (url.includes('bilibili.com') || url.includes('b23.tv')) return 'https://www.bilibili.com/'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'https://www.youtube.com/'
  if (url.includes('qq.com')) return 'https://v.qq.com/'
  if (url.includes('youku.com')) return 'https://www.youku.com/'
  if (url.includes('iqiyi.com')) return 'https://www.iqiyi.com/'
  if (url.includes('mgtv.com')) return 'https://www.mgtv.com/'
  return ''
}

// ==================== 解析接口池 ====================
// 每个接口有 name（名称）、api（接口地址模板，用 {url} 占位）、timeout（超时ms）
const PARSE_APIS = [
  { name: '线路一', api: 'https://jx.m3u8.tv/jiexi/?url={url}', timeout: 15000 },
  { name: '线路二', api: 'https://jx.xmflv.com/?url={url}', timeout: 15000 },
  { name: '线路三', api: 'https://www.8090g.cn/?url={url}', timeout: 15000 }
]

// 用于测试连通性的示例视频 URL（腾讯视频免费集）
const TEST_VIDEO_URL = 'https://v.qq.com/x/cover/mzc00200n9a1bmb.html'

// ==================== 健康检查缓存 ====================
let healthCache = null
let healthCacheTime = 0
const HEALTH_CACHE_TTL = 5 * 60 * 1000 // 5分钟缓存

/**
 * 检测单个解析接口是否可用
 * 尝试请求一个测试视频，检查是否返回有效内容
 */
async function checkApiHealth(apiEntry) {
  const testApiUrl = apiEntry.api.replace('{url}', encodeURIComponent(TEST_VIDEO_URL))
  const startTime = Date.now()

  try {
    // 使用 HEAD 或 GET 请求，设置较短的超时
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), apiEntry.timeout || 15000)

    const response = await axios.get(testApiUrl, {
      timeout: apiEntry.timeout || 15000,
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: 'https://v.qq.com/'
      },
      maxRedirects: 5,
      // 只取前 64KB 来判断连通性
      responseType: 'text',
      validateStatus: status => status < 500
    })

    clearTimeout(timeoutId)

    const responseTime = Date.now() - startTime
    const hasValidContent = response.data && response.data.length > 500

    return {
      name: apiEntry.name,
      api: apiEntry.api,
      online: hasValidContent,
      responseTime,
      statusCode: response.status
    }
  } catch (err) {
    return {
      name: apiEntry.name,
      api: apiEntry.api,
      online: false,
      responseTime: Date.now() - startTime,
      error: err.code || err.message?.substring(0, 80) || 'unknown'
    }
  }
}

/**
 * 批量检测所有解析接口
 */
async function checkAllApis() {
  const now = Date.now()
  if (healthCache && (now - healthCacheTime) < HEALTH_CACHE_TTL) {
    return healthCache
  }

  const results = await Promise.all(PARSE_APIS.map(checkApiHealth))

  const sorted = results.sort((a, b) => {
    // 在线的排在前面，按响应时间排序
    if (a.online !== b.online) return b.online ? 1 : -1
    return a.responseTime - b.responseTime
  })

  healthCache = {
    timestamp: new Date().toISOString(),
    total: sorted.length,
    online: sorted.filter(r => r.online).length,
    offline: sorted.filter(r => !r.online).length,
    results: sorted
  }
  healthCacheTime = now

  return healthCache
}

// ==================== 搜索结果缓存（VIP 视频搜索 线路1/2） ====================
const vipSearchCache = new Map()
const VIP_SEARCH_CACHE_MAX = 200
const VIP_SEARCH_CACHE_TTL = 30 * 60 * 1000 // 30 分钟

function getVipSearchCacheKey(line, keyword) {
  return `vip:line${line}:${keyword.trim()}`
}

function getVipCachedSearch(line, keyword) {
  const key = getVipSearchCacheKey(line, keyword)
  const entry = vipSearchCache.get(key)
  if (entry && Date.now() - entry.timestamp < VIP_SEARCH_CACHE_TTL) {
    console.log(`[vip search cache] HIT line${line} "${keyword}"`)
    return entry.data
  }
  return null
}

function setVipCachedSearch(line, keyword, data) {
  const key = getVipSearchCacheKey(line, keyword)
  if (vipSearchCache.size >= VIP_SEARCH_CACHE_MAX) {
    const entries = [...vipSearchCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toDelete = entries.slice(0, Math.floor(VIP_SEARCH_CACHE_MAX / 2))
    for (const [k] of toDelete) vipSearchCache.delete(k)
    console.log(`[vip search cache] 清理 ${toDelete.length} 条过期缓存`)
  }
  vipSearchCache.set(key, { data, timestamp: Date.now() })
  console.log(`[vip search cache] SET line${line} "${keyword}" (${data.length} results)`)
}

// ==================== ylu.cc Cookie 缓存 ====================
let yluCookieCache = ''
let yluCookieExpires = 0

async function getYluCookie() {
  if (yluCookieCache && Date.now() < yluCookieExpires) {
    return yluCookieCache
  }
  try {
    const homeResp = await axios.get('https://ylu.cc/', {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    })
    const setCookie = homeResp.headers['set-cookie']
    if (setCookie && Array.isArray(setCookie)) {
      yluCookieCache = setCookie.map(c => c.split(';')[0]).join('; ')
      yluCookieExpires = Date.now() + 30 * 60 * 1000 // 30 分钟有效
      console.log(`[ylu cookie] 已缓存:`, yluCookieCache.substring(0, 60) + '...')
    }
  } catch (e) {
    console.warn('[ylu cookie] 获取失败:', e.message)
  }
  return yluCookieCache
}

/**
 * 通用视频搜索结果解析器（与前端 parseVideoResults 逻辑一致）
 * 兼容 cloud.nnpp.vip、ylu.cc 及各种中文视频站API返回格式
 */
function parseVipVideoResults(data) {
  const items = []

  // 多种可能的列表路径
  let list = data?.info || data?.list || data?.data?.list || data?.data || (Array.isArray(data) ? data : [])

  // 顶层分类（如 cloud.nnpp.vip 返回的 {"type":"tv","data":[...]}）
  const topType = data?.type || ''

  // 如果 list 是对象（如 {0: {...}, 1: {...}}），转为数组
  if (list && typeof list === 'object' && !Array.isArray(list)) {
    const vals = Object.values(list).filter(v => v && typeof v === 'object')
    const looksLikeItems = vals.length > 0 && vals.some(v =>
      v.vod_name || v.vod_pic || v.title || v.name || v.pic || v.source
    )
    if (looksLikeItems) {
      list = vals
    }
  }

  if (!Array.isArray(list)) {
    return []
  }

  list.forEach(raw => normalizeItem(raw, topType))

  function normalizeItem(raw, parentType) {
    if (!raw || typeof raw !== 'object') return

    // === 标题 ===
    const title = raw.vod_name || raw.title || raw.name || raw.vodName ||
      raw.vod_title || raw.video_name || raw.videoName || raw.show_name || ''

    // === 图片（优先从 item 自身取，再尝试 source 等嵌套对象） ===
    const src = raw.source || {}
    const extra = raw.extra || {}
    const vodData = raw.vod_data || {}
    const pic = raw.vod_pic || raw.pic || raw.vodPic || raw.img || raw.image ||
      raw['img:'] || raw.img_url || raw.vod_img || raw.vod_pic_url || raw.pic_url ||
      raw.cover || raw.cover_url || raw.poster || raw.thumbnail || raw.thumb || raw.thumb_url ||
      raw.vod_image_url || raw.vod_cover || raw.vod_thumb ||
      raw.vod_pic_thumb || raw.pic_thumb || raw.screenshot || raw.logo ||
      // source 嵌套
      src.vod_pic || src.pic || src.vodPic || src.img || src.image ||
      src.cover || src.poster || src.thumbnail || src.vod_pic_url || src.pic_url || src.thumb || src.vod_thumb ||
      // extra 嵌套
      extra.vod_pic || extra.pic || extra.cover || extra.thumbnail || extra.thumb || extra.img ||
      // vod_data 嵌套
      vodData.vod_pic || vodData.pic || vodData.cover || vodData.thumbnail || vodData.img || ''

    // === 分类/类型 ===
    const type = raw.type_name || raw.vod_class || raw.type || parentType ||
      raw.vod_type || raw.vodType || raw.category || raw.vod_category || raw.class_name || ''

    // === 描述 ===
    const desc = raw.vod_remarks || raw.vod_content || raw.desc || raw.description ||
      raw.remarks || raw.vod_blurb || raw.content || raw.summary || raw.vod_summary ||
      (raw.year ? `${raw.year}年` : '') || ''

    // 过滤无效图片值（字符串 "null"、"undefined" 等）
    const filteredPic = (pic && pic !== 'null' && pic !== 'undefined') ? pic : ''

    // === 播放URL（优先取第一集地址） ===
    let url = raw.vod_play_url || raw.vodPlayUrl || raw.url || raw.vod_url ||
      raw.link || raw.href || raw.vod_link || raw.play_url || ''

    // nnpp.vip 格式：从 source.eps 提取第一集
    if (!url && raw.source?.eps && Array.isArray(raw.source.eps) && raw.source.eps.length > 0) {
      url = raw.source.eps[0].url || ''
    }

    // === 额外保存剧集列表（供前端使用） ===
    const episodes = raw.source?.eps?.map(ep => ({
      name: ep?.name || ep?.title || '',
      url: ep?.url || ''
    })) || []

    if (title) {
      const item = { title, pic: filteredPic, type, desc, url }
      if (raw.id) item._sourceId = raw.id // 保留原始 ID（供 ylu.cc 等构造播放页）
      if (raw.flag !== undefined) item._sourceFlag = raw.flag // 保留 flag（供 ylu.cc 构造播放页 URL）
      if (raw.flag_name) item._flagName = raw.flag_name
      if (raw.from) item._from = raw.from
      if (episodes.length > 0) item.episodes = episodes
      items.push(item)
    }
  }

  return items
}

// ==================== 共享海报搜索（TMDB + 豆瓣 双源互补） ====================

const TMDB_API_KEY = config.tmdbApiKey || ''
const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

/**
 * 辅助：从标题中提取年份（如 "流浪地球 (2019)"、"Avatar 2009"）
 */
function extractYear(title) {
  const m = String(title || '').match(/[\(（]?(\d{4})[\)）]?/)
  return m ? m[1] : ''
}

/**
 * 辅助：规范化标题（去空格、统一小写、去标点）
 */
function normTitle(t) {
  return String(t || '')
    .replace(/[\s\-_·•\.\,，。！!？?：:；;、\(\)（）\[\]【】《》<>"']/g, '')
    .toLowerCase()
}

/**
 * 通过 TMDB 搜索海报封面
 * @returns {Promise<string>} - 海报 URL（原始尺寸），失败返回空
 */
async function searchTMDBPoster(title) {
  if (!TMDB_API_KEY) return ''
  try {
    const cleanTitle = String(title || '').replace(/[\(（]\d{4}[\)）]/g, '').trim()
    const year = extractYear(title)

    // 多语言搜索（中文 + 英文），提升命中率
    const queries = [cleanTitle]
    // 如果标题含中文字符，也尝试去掉年份后的英文部分再搜一次
    if (/[\u4e00-\u9fa5]/.test(cleanTitle) && cleanTitle.length > 1) {
      queries.push(cleanTitle.replace(/\s+/g, ' ').split(' ')[0])
    }

    // 并行尝试 multi search（电影+电视剧+人）和 movie search
    const searchUrls = queries.flatMap(q => {
      const encoded = encodeURIComponent(q)
      const params = `api_key=${TMDB_API_KEY}&query=${encoded}&language=zh-CN&page=1${year ? `&primary_release_year=${year}&year=${year}` : ''}`
      return [
        `${TMDB_BASE}/search/multi?${params}`,
        `${TMDB_BASE}/search/movie?${params}`
      ]
    })

    for (const url of searchUrls) {
      try {
        const res = await axios.get(url, {
          timeout: 6000,
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })

        const items = res.data?.results || []
        if (items.length === 0) continue

        // 标题匹配
        const rn = normTitle(title)
        const best = items.find(item => {
          const mediaTitle = item.title || item.name || ''
          const tn = normTitle(mediaTitle)
          return tn === rn || (tn && rn && (tn.includes(rn) || rn.includes(tn)))
        }) || items[0]

        if (best && best.poster_path) {
          const posterUrl = `${TMDB_IMAGE_BASE}${best.poster_path}`
          console.log(`[poster] TMDB 匹配: "${title}" → ${best.title || best.name} (${best.media_type || 'movie'})`)
          return posterUrl
        }
      } catch (e) {
        // 单次请求失败继续尝试下一个
      }
    }
  } catch (e) {
    console.log('[poster] TMDB 全局失败:', e.message)
  }
  return ''
}

/**
 * 通过豆瓣搜索海报封面
 * @returns {Promise<string>} - 豆瓣图片 URL（原始尺寸），失败返回空
 */
async function searchDoubanPoster(title) {
  try {
    const dRes = await axios.get('https://movie.douban.com/j/subject_suggest', {
      params: { q: title },
      timeout: 8000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Referer': 'https://movie.douban.com/'
      }
    })

    const list = dRes.data || []
    if (list.length === 0) return ''

    const rn = normTitle(title)
    const best = list.find(item => {
      const tn = normTitle(item.title)
      return tn === rn || (tn && rn && (tn.includes(rn) || rn.includes(tn)))
    }) || list[0]

    if (best && best.img) {
      let rawPic = best.img
      rawPic = rawPic
        .replace(/\/view\/.*\/public\//, '/view/photo/m/public/')
        .replace(/\/s_ratio_poster\//, '/l_ratio_poster/')
      console.log(`[poster] 豆瓣匹配: "${title}" → ${best.title}`)
      return rawPic
    }
  } catch (e) {
    console.log(`[poster] 豆瓣请求失败 "${title}": ${e.message}`)
  }
  return ''
}

/**
 * 统一海报搜索入口：TMDB → 豆瓣 → 兜底
 * @param {string} title - 视频标题
 * @returns {Promise<string>} - 经过 image-proxy 代理的海报 URL，无结果返回空
 */
async function searchPosterImage(title) {
  if (!title) return ''

  // 1. TMDB（国际内容覆盖好）
  let rawPic = await searchTMDBPoster(title)

  // 2. 豆瓣（中文内容覆盖好）
  if (!rawPic) {
    rawPic = await searchDoubanPoster(title)
  }

  // 3. 通过 image-proxy 代理（统一处理防盗链）
  if (rawPic) {
    const proxyBase = `/staticTool/api/video-parse/ytdlp/image-proxy`
    return `${proxyBase}?url=${encodeURIComponent(rawPic)}`
  }

  return ''
}

/**
 * 批量回填搜索结果的海报封面
 * @param {Array} results - 搜索结果数组（会被原地修改）
 * @param {number} limit - 最多处理前 N 条（0 = 全部）
 * @param {string} tag - 日志标签
 */
async function enrichPosters(results, limit = 0, tag = '') {
  const items = limit > 0 ? results.slice(0, limit) : results
  const needCover = items.filter(r => !r.pic)
  if (needCover.length === 0) return

  const prefix = tag ? `[${tag}]` : ''
  console.log(`${prefix} 无封面 ${needCover.length} 条，TMDB + 豆瓣搜索中...`)

  const tasks = needCover.map(async (r) => {
    const pic = await searchPosterImage(r.title)
    return { item: r, pic }
  })

  const posterResults = await Promise.all(tasks)
  let count = 0
  for (const { item, pic } of posterResults) {
    if (pic) {
      item.pic = pic
      count++
    }
  }
  console.log(`${prefix} 海报回填完成: ${count}/${needCover.length} 条`)
}

// ==================== VIP视频 线路代理搜索 ====================

/**
 * GET /video-parse/proxy-search/line1
 * 代理线路一（cloud.nnpp.vip）搜索请求
 * Query: ?keyword=视频名称
 * 返回: { code: 0, data: [{title, pic, type, desc, url}, ...] }
 */
router.get('/proxy-search/line1', async (req, res, next) => {
  try {
    const { keyword } = req.query
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ code: -1, message: '缺少搜索关键词 ?keyword=' })
    }

    const kw = keyword.trim()

    // 缓存检查
    const cached = getVipCachedSearch(1, kw)
    if (cached) {
      return res.json({ code: 0, data: cached, cached: true })
    }

    const { z, s1ig } = computeNnppSign()
    const targetUrl = `https://m1-a1.cloud.nnpp.vip:2223/api/v/?z=${z}&jx=${encodeURIComponent(kw)}&s1ig=${s1ig}`

    console.log(`[proxy line1] 代理请求: "${kw}"`)
    console.log(`[proxy line1] 目标URL: ${targetUrl}`)

    const response = await axios.get(targetUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://m1-a1.cloud.nnpp.vip/'
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    })

    const results = parseVipVideoResults(response.data)
    setVipCachedSearch(1, kw, results)

    console.log(`[proxy line1] 解析完成: ${results.length} 条结果`)

    // 回填封面：TMDB → 豆瓣（双源互补，前5条并行搜索）
    await enrichPosters(results, 5, 'proxy line1')

    if (results.length > 0) {
      console.log(`[proxy line1] 第一条:`, JSON.stringify(results[0]))
    }

    res.json({ code: 0, data: results, total: results.length })
  } catch (err) {
    console.error('[proxy line1] 代理失败:', err.message)
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({ code: -1, message: '线路一搜索超时，请重试' })
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(502).json({ code: -1, message: '线路一接口暂时不可用' })
    }
    next(err)
  }
})

/**
 * GET /video-parse/proxy-search/line2
 * 代理线路二（ylu.cc）搜索请求（JSONP → JSON 转换）
 * Query: ?keyword=视频名称
 * 返回: { code: 0, data: [{title, pic, type, desc, url}, ...] }
 */
router.get('/proxy-search/line2', async (req, res, next) => {
  try {
    const { keyword } = req.query
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ code: -1, message: '缺少搜索关键词 ?keyword=' })
    }

    const kw = keyword.trim()

    // 缓存检查
    const cached = getVipCachedSearch(2, kw)
    if (cached) {
      return res.json({ code: 0, data: cached, cached: true })
    }

    const ts = Date.now()
    const cbName = `ylu_cb_${ts}`
    const targetUrl = `https://ylu.cc/api.php?out=jsonp&wd=${encodeURIComponent(kw)}&cb=${cbName}&_=${ts}`

    console.log(`[proxy line2] 代理请求: "${kw}"`)
    console.log(`[proxy line2] 目标URL: ${targetUrl}`)

    // ylu.cc 需要 cookie 才会返回数据，否则返回"请勿非法调用"
    const yluCookie = await getYluCookie()
    console.log(`[proxy line2] ylu.cc cookie:`, yluCookie ? yluCookie.substring(0, 60) + '...' : '(无)')

    const response = await axios.get(targetUrl, {
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://ylu.cc/',
        ...(yluCookie ? { Cookie: yluCookie } : {})
      }
    })

    // 提取 JSONP 响应中的 JSON 数据
    let jsonData = null
    const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

    console.log(`[proxy line2] 原始响应前500字符:`, text.substring(0, 500))

    // 尝试匹配 callback(JSON) 格式
    const jsonpRegex = new RegExp(`${cbName.replace(/\$/g, '\\$')}\\s*\\(([\\s\\S]*)\\)\\s*;?\\s*$`, 'i')
    const match = text.match(jsonpRegex)
    if (match) {
      try {
        jsonData = JSON.parse(match[1])
        console.log(`[proxy line2] JSONP 解析成功，JSON根类型:`, Array.isArray(jsonData) ? 'Array' : typeof jsonData, ', keys:', Object.keys(jsonData || {}).join(', '))
      } catch (e) {
        console.error('[proxy line2] JSONP 匹配到但 JSON.parse 失败:', e.message)
      }
    } else {
      console.log('[proxy line2] JSONP 正则未匹配到 cbName')
    }

    // 回退：尝试直接当 JSON 解析
    if (!jsonData) {
      try {
        jsonData = JSON.parse(text)
        console.log(`[proxy line2] 直接 JSON 解析成功`)
      } catch {
        // 最后尝试宽松提取：去掉 callback 前缀
        const cleaned = text.replace(/^[^(]*\(/, '').replace(/\)\s*;?\s*$/, '')
        try {
          jsonData = JSON.parse(cleaned)
          console.log(`[proxy line2] 宽松提取 JSON 解析成功`)
        } catch {
          console.error('[proxy line2] 无法解析响应:', text.substring(0, 300))
          return res.json({ code: 0, data: [], total: 0, message: '未找到相关视频' })
        }
      }
    }

    console.log(`[proxy line2] 解析后 JSON 数据:`, JSON.stringify(jsonData).substring(0, 500))
    let results = parseVipVideoResults(jsonData)

    // ylu.cc 搜索结果没有直接播放URL，构造播放页 URL
    // 格式: https://ylu.cc/?index{id}-{flag}-1.htm
    results = results.map(r => {
      if (!r.url && r._sourceId) {
        const flag = r._sourceFlag !== undefined ? r._sourceFlag : 3
        r.url = `https://ylu.cc/?index${r._sourceId}-${flag}-1.htm`
      }
      return r
    })

    console.log(`[proxy line2] 解析结果: ${results.length} 条`)

    // 回填封面：TMDB → 豆瓣（双源互补，前5条并行搜索）
    await enrichPosters(results, 5, 'proxy line2')

    setVipCachedSearch(2, kw, results)

    res.json({ code: 0, data: results, total: results.length })
  } catch (err) {
    console.error('[proxy line2] 代理失败:', err.message)
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({ code: -1, message: '线路二搜索超时，请重试' })
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(502).json({ code: -1, message: '线路二接口暂时不可用' })
    }
    next(err)
  }
})

// ==================== HLS 流代理 ====================
// 问题：m3u8 内的 .ts 分片来自 CDN（如 c.baisiweiting.com:18443），浏览器端因 SSL/CORS 无法直接加载
// 方案：后端代理整个 HLS 流，重写 m3u8 中的分片 URL，使所有请求走后端

/**
 * GET /video-parse/hls-proxy?url=<encoded_m3u8_url>
 * 代理 m3u8 播放列表，将所有分片 URL 重写为走本后端代理
 */
router.get('/hls-proxy', async (req, res, next) => {
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({ code: -1, message: '缺少 m3u8 地址参数 ?url=' })
    }

    console.log(`[hls-proxy] 获取 m3u8: ${url.substring(0, 120)}...`)

    const targetUrl = new URL(url)

    const response = await axios.get(url, {
      timeout: 15000,
      responseType: 'text',
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': targetUrl.origin + '/',
        'Origin': targetUrl.origin,
        // 模拟正常浏览器请求的 sec-fetch 头
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Dest': 'empty',
        'Connection': 'keep-alive'
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    })

    let m3u8Content = response.data

    // 检测是否返回了 HTML 页面（如 CloudFlare 拦截页、反爬验证页）
    if (typeof m3u8Content === 'string' && (m3u8Content.trim().startsWith('<!') || m3u8Content.trim().startsWith('<html'))) {
      console.error('[hls-proxy] 源站返回 HTML 拦截页，非 m3u8 内容（前200字符）:', m3u8Content.substring(0, 200))
      return res.status(502).json({
        code: -1,
        message: '视频源站开启了反爬保护（CloudFlare/验证页），无法获取播放列表。请尝试切换播放线路或使用外部播放。'
      })
    }

    // 使用站点相对路径，本地走 Vite proxy，线上走 nginx proxy
    const segProxyBase = `/staticTool/api/video-parse/hls-segment?url=`
    const playlistProxyBase = `/staticTool/api/video-parse/hls-proxy?url=`

    /**
     * 使用标准 URL 构造函数将 uri 转为源站绝对地址
     */
    function resolveAbsUrl(uri) {
      try {
        return new URL(uri, targetUrl).href
      } catch {
        return uri
      }
    }

    // 重写 m3u8 中的所有资源 URL 为代理 URL
    const lines = m3u8Content.split('\n')
    const rewritten = lines.map(line => {
      const trimmed = line.trim()

      // 重写 EXT-X-KEY URI（加密密钥）
      if (trimmed.startsWith('#EXT-X-KEY') && trimmed.includes('URI=')) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
          return `URI="${segProxyBase}${encodeURIComponent(resolveAbsUrl(uri))}"`
        }).replace(/URI=(?!")/g, () => {
          // 无引号的 URI 格式: URI=key.key
          const rest = trimmed.substring(trimmed.indexOf('URI=') + 4)
          const uri = rest.split(',')[0].trim()
          if (!uri || uri.startsWith('"')) return `URI="${segProxyBase}${encodeURIComponent(resolveAbsUrl(uri))}"`
          return `URI="${segProxyBase}${encodeURIComponent(resolveAbsUrl(uri))}"`
        })
      }

      // 重写 EXT-X-MAP URI（fmp4 初始化段）
      if (trimmed.startsWith('#EXT-X-MAP') && trimmed.includes('URI=')) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
          return `URI="${segProxyBase}${encodeURIComponent(resolveAbsUrl(uri))}"`
        })
      }

      // 跳过其他注释行、空行
      if (!trimmed || trimmed.startsWith('#')) return line

      // 重写资源 URL：.m3u8 子播放列表走 hls-proxy，.ts 分片走 hls-segment
      const absoluteUrl = resolveAbsUrl(trimmed)
      const isPlaylist = /\.m3u8(\?|$)/i.test(absoluteUrl)
      const proxyBase = isPlaylist ? playlistProxyBase : segProxyBase
      return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
    })

    m3u8Content = rewritten.join('\n')

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    })
    res.send(m3u8Content)
  } catch (err) {
    console.error('[hls-proxy] 失败:', err.message, err.code)
    // 详细的错误信息
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({ code: -1, message: '获取 m3u8 超时，视频源站无响应' })
    }
    if (err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
      return res.status(502).json({ code: -1, message: '视频源站域名解析失败，可能已下线' })
    }
    if (err.code === 'ECONNREFUSED') {
      return res.status(502).json({ code: -1, message: '视频源站拒绝连接' })
    }
    if (err.response?.status === 403) {
      return res.status(502).json({ code: -1, message: '视频源站拒绝访问（403），可能开启了防盗链' })
    }
    if (err.response?.status === 404) {
      return res.status(502).json({ code: -1, message: '视频链接已失效（404）' })
    }
    if (err.response?.status) {
      return res.status(502).json({ code: -1, message: `视频源站返回 ${err.response.status} 错误` })
    }
    next(err)
  }
})
// ==================== HLS 分片代理 ====================
/**
 * GET /video-parse/hls-segment?url=<encoded_ts_url>
 * 代理 .ts 分片数据
 */
router.get('/hls-segment', async (req, res, next) => {
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).end()
    }

    const targetUrl = new URL(url)

    const response = await axios.get(url, {
      timeout: 30000,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': targetUrl.origin + '/',
        'Origin': targetUrl.origin,
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'Sec-Fetch-Dest': 'empty'
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false })
    })

    res.set({
      'Content-Type': response.headers['content-type'] || 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
      'Content-Length': response.headers['content-length'] || ''
    })

    response.data.pipe(res)
  } catch (err) {
    console.error('[hls-segment] 代理分片失败:', err.message)
    // 分片偶发失败不中断整个流，返回 502 让 hls.js 重试
    if (!res.headersSent) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.status(502).end()
    }
  }
})

// ==================== 路由 ====================

/**
 * GET /video-parse/check-apis
 * 检测所有解析接口的可用性，缓存5分钟
 */
router.get('/check-apis', async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === '1'
    if (forceRefresh) {
      healthCache = null
      healthCacheTime = 0
    }
    const result = await checkAllApis()
    res.json({ code: 0, data: result })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /video-parse/proxy
 * 代理解析请求：通过后端转发到指定的解析接口
 * Query:
 *   ?url=<视频链接>&api=<解析接口地址模板>
 * 返回: HTML 页面内容（iframe 可直接加载）
 */
router.get('/proxy', async (req, res, next) => {
  try {
    const { url: videoUrl, api: apiTemplate } = req.query

    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '缺少视频链接参数 ?url=' })
    }
    if (!apiTemplate) {
      return res.status(400).json({ code: -1, message: '缺少解析接口参数 ?api=' })
    }

    const parseUrl = apiTemplate.replace('{url}', encodeURIComponent(videoUrl))

    const response = await axios.get(parseUrl, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Referer: new URL(videoUrl).origin
      },
      maxRedirects: 10,
      responseType: 'text'
    })

    // 返回解析页面内容，让前端 iframe 加载
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'SAMEORIGIN',
      'Cache-Control': 'no-store'
    })
    res.send(response.data)
  } catch (err) {
    next(err)
  }
})

/**
 * GET /video-parse/auto
 * 自动选择最快的可用解析接口，返回解析结果
 * Query: ?url=<视频链接>
 * 返回: { code: 0, data: { api, parseUrl, parseHtml } }
 */
router.get('/auto', async (req, res, next) => {
  try {
    const { url: videoUrl } = req.query

    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '缺少视频链接参数 ?url=' })
    }

    // 先获取健康检查结果，找到最快在线的接口
    const health = await checkAllApis()
    const onlineApis = health.results.filter(r => r.online)

    if (onlineApis.length === 0) {
      return res.status(503).json({
        code: -1,
        message: '所有解析接口暂不可用，请稍后重试',
        data: { health }
      })
    }

    // 使用最快响应的接口
    const bestApi = onlineApis[0]
    const parseUrl = bestApi.api.replace('{url}', encodeURIComponent(videoUrl))

    return res.json({
      code: 0,
      data: {
        apiName: bestApi.name,
        apiTemplate: bestApi.api,
        parseUrl,
        health
      }
    })
  } catch (err) {
    next(err)
  }
})

// ==================== yt-dlp 集成 ====================

const { binPath, timeout, cookieFile, proxy, verbose } = config.ytDlp || {}
const searchTimeout = Math.min(timeout || 60000, 30000) // 搜索最多等 30 秒

// 按平台 Cookie 管理：cookies 目录 + 各平台文件
const COOKIES_DIR = path.join(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '../cookies')
const PLATFORM_COOKIE_MAP = {
  douyin: 'douyin.txt',
  kuaishou: 'kuaishou.txt',
  bilibili: 'bilibili.txt'
}
// 确保 cookies 目录存在
try {
  fs.mkdirSync(COOKIES_DIR, { recursive: true })
} catch { /* ignore */ }

// 根据 URL 判断所属平台并返回对应 cookie 文件路径（不存在则回退到全局 cookieFile）
function getCookieFileForUrl(url) {
  const u = (url || '').toLowerCase()
  let platform = null
  if (u.includes('douyin.com') || u.includes('iesdouyin.com')) platform = 'douyin'
  else if (u.includes('kuaishou.com') || u.includes('gifshow.com')) platform = 'kuaishou'
  else if (u.includes('bilibili.com') || u.includes('b23.tv') || u.includes('bilibili.tv')) platform = 'bilibili'
  if (platform) {
    const p = path.join(COOKIES_DIR, PLATFORM_COOKIE_MAP[platform])
    if (fs.existsSync(p)) return p
  }
  return cookieFile || null
}

// 标准化视频 URL：将某些平台的非标准分享链接转为 yt-dlp 可识别的格式
// 返回 null 表示该链接不是有效的视频链接（如搜索页、列表页等）
function normalizeVideoUrl(url) {
  if (!url) return url
  try {
    const urlObj = new URL(url)

    // 抖音：/jingxuan/music?modal_id=XXX 或 /user/XXX?modal_id=YYY → /video/{modal_id}
    if ((urlObj.hostname.includes('douyin.com') || urlObj.hostname.includes('iesdouyin.com'))
        && urlObj.searchParams.has('modal_id')
        && !urlObj.pathname.startsWith('/video/')) {
      const modalId = urlObj.searchParams.get('modal_id')
      if (modalId) {
        console.log(`[url normalize] 抖音分享链接 → https://www.douyin.com/video/${modalId}`)
        return `https://www.douyin.com/video/${modalId}`
      }
    }

    // 快手 / 抖音搜索页、分类页、发现页 → 非视频链接
    const nonVideoPaths = ['/search/', '/discover', '/explore', '/category/', '/tag/', '/topic/']
    const isNonVideo = nonVideoPaths.some(p => urlObj.pathname.startsWith(p))
    const isKwaiOrDouyin = urlObj.hostname.includes('kuaishou.com') ||
      urlObj.hostname.includes('douyin.com') || urlObj.hostname.includes('iesdouyin.com')
    if (isKwaiOrDouyin && isNonVideo) {
      console.log(`[url normalize] 非视频链接被拒绝: ${url}`)
      return null
    }
  } catch { /* URL 解析失败则不转换 */ }
  return url
}

// ==================== 好看视频自定义提取 ====================
// yt-dlp 不支持 haokan.baidu.com，通过解析页面 __PRELOADED_STATE__ 获取视频信息

function isHaokanUrl(url) {
  try {
    const u = new URL(url)
    return u.hostname.includes('haokan.baidu.com')
  } catch { return false }
}

/**
 * 解析"分:秒"格式的时长字符串为秒数
 */
function parseHaokanDuration(str) {
  if (!str || typeof str !== 'string') return 0
  const parts = str.split(':')
  if (parts.length === 2) return parseInt(parts[0]) * 60 + parseInt(parts[1])
  if (parts.length === 3) return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
  return parseInt(str) || 0
}

/**
 * 从好看视频页面提取视频信息
 * 返回 null 或 { title, thumbnail, duration, uploader, formats, ... }
 */
async function extractHaokanVideo(videoUrl) {
  const resp = await axios.get(videoUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://haokan.baidu.com/',
      'Accept-Language': 'zh-CN,zh;q=0.9'
    },
    timeout: 15000,
    httpsAgent: insecureAgent
  })
  const html = resp.data

  // 提取 window.__PRELOADED_STATE__
  const stateMatch = html.match(/window\.__PRELOADED_STATE__\s*=\s*(\{[\s\S]*?\});/)
  if (!stateMatch) {
    console.log('[haokan extract] 页面中未找到 __PRELOADED_STATE__')
    return null
  }

  let state
  try { state = JSON.parse(stateMatch[1]) } catch (e) {
    console.log('[haokan extract] JSON 解析失败:', e.message)
    return null
  }

  // 查找当前视频数据：优先 curVideoMeta，否则从 curVideoRelate 中按 vid 匹配
  let videoData = state.curVideoMeta
  if (!videoData || !videoData.playurl) {
    const vidMatch = videoUrl.match(/[?&]vid=(\d+)/)
    const targetVid = vidMatch ? vidMatch[1] : null
    const relateList = state.curVideoRelate || []
    videoData = relateList.find(v => String(v.vid || v.id) === targetVid) || relateList[0]
  }
  if (!videoData || !videoData.playurl) {
    console.log('[haokan extract] 未找到有效的视频数据')
    return null
  }

  const title = videoData.title || ''
  const playUrl = videoData.playurl
  console.log(`[haokan extract] 成功: "${title.substring(0, 40)}"`)

  return {
    id: videoData.vid || videoData.id || '',
    title: title,
    fulltitle: title,
    thumbnail: videoData.poster_big || videoData.poster || '',
    description: videoData.description || videoData.desc || '',
    duration: parseHaokanDuration(videoData.duration),
    uploader: videoData.author || videoData.author_name || videoData.source || '',
    webpageUrl: videoUrl,
    extractor: 'haokan-custom',
    formats: [{
      formatId: '0',
      ext: 'mp4',
      resolution: '',
      height: videoData.height || 720,
      width: videoData.width || 1280,
      filesize: videoData.filesize || null,
      tbr: null,
      vcodec: 'h264',
      acodec: 'aac',
      formatNote: '默认',
      protocol: 'https',
      url: playUrl
    }]
  }
}

// 将 B站 Set-Cookie 数组转换为 Netscape 格式 cookie 文件并保存
function saveBilibiliCookie(setCookieArr) {
  if (!Array.isArray(setCookieArr) || setCookieArr.length === 0) return false
  let lines = ['# Netscape HTTP Cookie File', '# This file is managed by PersonalStaticStation backend. Do not edit by hand.', '']
  for (const raw of setCookieArr) {
    if (typeof raw !== 'string' || !raw) continue
    // 解析 Set-Cookie: name=value; Domain=x; Path=y; Expires=z; HttpOnly; Secure
    const [cookiePart, ...attrParts] = raw.split(';')
    const eqIdx = cookiePart.indexOf('=')
    if (eqIdx <= 0) continue
    const name = cookiePart.slice(0, eqIdx).trim()
    const value = cookiePart.slice(eqIdx + 1).trim()
    let domain = ''
    let pathVal = '/'
    let expires = 0
    let httpOnly = false
    let secure = false
    for (const attr of attrParts) {
      const a = attr.trim()
      const lower = a.toLowerCase()
      const [k, ...v] = a.split('=')
      if (lower === 'httponly') httpOnly = true
      else if (lower === 'secure') secure = true
      else if (k.toLowerCase() === 'domain') domain = v.join('=').trim()
      else if (k.toLowerCase() === 'path') pathVal = v.join('=').trim()
      else if (k.toLowerCase() === 'expires') {
        const t = Date.parse(v.join('='))
        if (!isNaN(t)) expires = Math.floor(t / 1000)
      }
    }
    // 默认域名为 bilibili.com（如果未指定）
    if (!domain) domain = '.bilibili.com'
    if (!domain.startsWith('.')) domain = '.' + domain
    // 过期时间默认为会话末尾（30天），避免立即失效
    if (!expires) expires = Math.floor(Date.now() / 1000) + 30 * 24 * 3600
    const includeSub = 'TRUE'
    const flag = secure ? 'TRUE' : 'FALSE'
    const httpOnlyPrefix = httpOnly ? '#HttpOnly_' : ''
    lines.push(`${httpOnlyPrefix}${domain}\t${includeSub}\t${pathVal}\t${flag}\t${expires}\t${name}\t${value}`)
  }
  const filePath = path.join(COOKIES_DIR, 'bilibili.txt')
  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
    return true
  } catch (err) {
    console.error('[bili-qrcode] 保存 cookie 失败:', err.message)
    return false
  }
}

// 全局状态：yt-dlp 是否可用
let ytDlpVersion = null
let ytDlpAvailable = false
let ytDlpCheckDone = false

/**
 * 异步检测 yt-dlp 是否安装
 */
async function checkYtDlp() {
  if (ytDlpCheckDone) return ytDlpAvailable
  ytDlpCheckDone = true
  try {
    const { stdout } = await execFileAsync(binPath, ['--version'], { timeout: 10000 })
    ytDlpVersion = stdout.trim()
    ytDlpAvailable = true
    console.log(`[VideoParse] yt-dlp v${ytDlpVersion} detected`)
    return true
  } catch (err) {
    console.warn(`[VideoParse] yt-dlp NOT found (${err.message}). yt-dlp features disabled.`)
    console.warn(`[VideoParse] Install: download yt-dlp.exe from https://github.com/yt-dlp/yt-dlp/releases`)
    ytDlpAvailable = false
    return false
  }
}

// 模块加载时启动检测（不阻塞）
checkYtDlp()

/**
 * 执行 yt-dlp 命令，统一处理超时和错误
 */
async function runYtDlp(args, maxTimeout = timeout, url = '') {
  const finalArgs = [...args]
  if (proxy) {
    finalArgs.unshift('--proxy', proxy)
  }
  // 按平台使用 cookie（优先对应平台的 cookie 文件，回退全局 cookieFile）
  const effectiveCookie = url ? getCookieFileForUrl(url) : cookieFile
  if (effectiveCookie) {
    finalArgs.unshift('--cookies', effectiveCookie)
  }
  if (verbose) {
    console.log(`[yt-dlp] ${binPath} ${finalArgs.join(' ')}`)
  }

  // 使用 exec 而非 execFile，因为 Windows 上 yt-dlp.exe 路径可能包含空格
  const cmd = `"${binPath}" ${finalArgs.map(a => `"${a}"`).join(' ')}`
  const { stdout, stderr } = await execAsync(cmd, {
    timeout: maxTimeout,
    maxBuffer: 10 * 1024 * 1024 // 10MB
  })
  return { stdout: stdout.trim(), stderr: stderr.trim() }
}

/**
 * GET /video-parse/ytdlp/status
 * 检测 yt-dlp 是否可用，返回版本信息
 */
router.get('/ytdlp/status', async (req, res) => {
  try {
    const available = await checkYtDlp()
    res.json({
      code: 0,
      data: {
        available,
        version: ytDlpVersion,
        binPath,
        tips: available
          ? 'yt-dlp 已就绪，支持 B站、YouTube 等站点直接提取视频流地址'
          : 'yt-dlp 未安装。请下载 yt-dlp.exe 放到服务器的 PATH 目录或设置环境变量 YT_DLP_PATH'
      }
    })
  } catch (err) {
    res.json({ code: 0, data: { available: false, error: err.message } })
  }
})

/**
 * POST /video-parse/ytdlp/extract
 * 提取视频信息（标题、格式列表、缩略图等），不下载视频
 * Body: { url: "视频链接" }
 * 返回: { code, data: { title, thumbnail, duration, formats, ... } }
 */
router.post('/ytdlp/extract', async (req, res, next) => {
  try {
    if (!ytDlpAvailable) {
      return res.status(503).json({
        code: -1,
        message: 'yt-dlp 未安装或不可用。请在服务器上安装 yt-dlp 后重试。'
      })
    }

    let { url: videoUrl } = req.body
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '缺少视频链接' })
    }
    videoUrl = normalizeVideoUrl(videoUrl)
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '请使用具体视频的链接，当前链接可能为搜索页或列表页' })
    }

    // 好看视频：yt-dlp 不支持，使用页面解析
    if (isHaokanUrl(videoUrl)) {
      const haokanData = await extractHaokanVideo(videoUrl)
      if (haokanData) {
        return res.json({ code: 0, data: haokanData })
      }
      // 页面解析失败则继续走 yt-dlp（保底）
    }

    // -j: 输出 JSON 信息
    // --no-playlist: 不下载整个播放列表
    // --no-check-certificate: 忽略 SSL 证书
    const { stdout } = await runYtDlp([
      '-j',
      '--no-playlist',
      '--no-check-certificate',
      videoUrl
    ], timeout, videoUrl)

    const info = JSON.parse(stdout)

    // 整理返回给前端的有用信息
    res.json({
      code: 0,
      data: {
        id: info.id,
        title: info.title,
        fulltitle: info.fulltitle,
        thumbnail: info.thumbnail,
        description: info.description?.substring(0, 500) || '',
        duration: info.duration,
        durationString: info.duration_string,
        uploader: info.uploader,
        uploadDate: info.upload_date,
        webpageUrl: info.webpage_url,
        extractor: info.extractor_key,
        // 格式列表（精简，只返回关键字段）
        formats: (info.formats || []).map(f => ({
          formatId: f.format_id,
          ext: f.ext,
          resolution: f.resolution,
          width: f.width,
          height: f.height,
          filesize: f.filesize,
          tbr: f.tbr,           // 总比特率
          vcodec: f.vcodec,
          acodec: f.acodec,
          formatNote: f.format_note,
          protocol: f.protocol
        }))
      }
    })
  } catch (err) {
    // yt-dlp 错误通常输出到 stderr，尝试解析
    if (err.stderr) {
      console.error('[yt-dlp extract error]', err.stderr.substring(0, 500))
      return res.status(400).json({
        code: -1,
        message: '视频提取失败，可能是链接无效或平台不支持',
        detail: err.stderr.substring(0, 300)
      })
    }
    next(err)
  }
})

/**
 * POST /video-parse/ytdlp/stream-url
 * 获取视频的直接流媒体地址（m3u8 或 mp4）
 * Body: { url, formatId? }
 *   - url: 视频链接
 *   - formatId: 可选，指定格式ID（如 "best"、"bestvideo+bestaudio"、具体ID），默认 "best"
 * 返回: { code, data: { url, formatId, ext, protocol } }
 */
router.post('/ytdlp/stream-url', async (req, res, next) => {
  try {
    if (!ytDlpAvailable) {
      return res.status(503).json({
        code: -1,
        message: 'yt-dlp 未安装或不可用'
      })
    }

    let { url: videoUrl, formatId } = req.body
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '缺少视频链接' })
    }
    videoUrl = normalizeVideoUrl(videoUrl)
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '请使用具体视频的链接，当前链接可能为搜索页或列表页' })
    }

    // 好看视频：直接返回页面解析出的 playurl
    if (isHaokanUrl(videoUrl)) {
      const haokanData = await extractHaokanVideo(videoUrl)
      if (haokanData && haokanData.formats && haokanData.formats[0] && haokanData.formats[0].url) {
        return res.json({
          code: 0,
          data: {
            url: haokanData.formats[0].url,
            formatId: '0',
            ext: 'mp4',
            protocol: 'https',
            title: haokanData.title
          }
        })
      }
    }

    // -g: 获取直接流地址（不下载）
    // -f: 指定格式（不指定时让 yt-dlp 自动选择，兼容B站等平台）
    const args = [
      '-g',
      '--no-playlist',
      '--no-check-certificate',
      videoUrl
    ]
    if (formatId) {
      args.unshift('-f', formatId)
    }
    const { stdout } = await runYtDlp(args, timeout, videoUrl)

    // yt-dlp -g 输出可能是多行（video + audio 分开时），取第一行视频流
    const lines = stdout.split('\n').filter(Boolean)
    const streamUrl = lines[0]

    // 判断流类型
    let streamType = 'unknown'
    if (streamUrl.includes('.m3u8') || streamUrl.includes('/m3u8')) {
      streamType = 'm3u8'
    } else if (streamUrl.includes('.mp4') || streamUrl.includes('/mp4')) {
      streamType = 'mp4'
    } else {
      streamType = 'direct'
    }

    // 生成代理 token → 前端通过后端代理访问流媒体，避免 CORS / token 过期
    const referer = getRefererForUrl(videoUrl)
    const needProxy = needsProxyForUrl(videoUrl)
    const token = generateToken()
    streamCache.set(token, { streamUrl, referer, needProxy, expires: Date.now() + STREAM_TOKEN_TTL })

    // 清理过期条目
    for (const [key, val] of streamCache) {
      if (val.expires < Date.now()) streamCache.delete(key)
    }

    const proxyUrl = `/staticTool/api/video-parse/ytdlp/proxy-stream/${token}`

    // 音频流也生成代理 token
    let audioProxyUrl = null
    if (lines[1]) {
      const audioToken = generateToken()
      streamCache.set(audioToken, { streamUrl: lines[1], referer, needProxy, expires: Date.now() + STREAM_TOKEN_TTL })
      audioProxyUrl = `/staticTool/api/video-parse/ytdlp/proxy-stream/${audioToken}`
    }

    res.json({
      code: 0,
      data: {
        url: proxyUrl,
        formatId,
        type: streamType,
        audioUrl: audioProxyUrl
      }
    })
  } catch (err) {
    if (err.stderr) {
      console.error('[yt-dlp stream error]', err.stderr.substring(0, 500))
      return res.status(400).json({
        code: -1,
        message: '获取流地址失败，可能是链接无效或平台不支持',
        detail: err.stderr.substring(0, 300)
      })
    }
    // 超时
    if (err.killed || err.code === 'ETIMEDOUT') {
      return res.status(504).json({
        code: -1,
        message: '提取超时，yt-dlp 执行时间过长'
      })
    }
    next(err)
  }
})

// ==================== 音频流缓存 ====================
// key: 视频URL → { proxyUrl, expires, title }
const audioStreamCache = new Map()
const AUDIO_STREAM_CACHE_TTL = 30 * 60 * 1000 // 30 分钟
const AUDIO_CACHE_MAX = 100

function getCachedAudioStream(videoUrl) {
  const entry = audioStreamCache.get(videoUrl)
  if (entry && Date.now() - entry.timestamp < AUDIO_STREAM_CACHE_TTL) {
    console.log(`[audio cache] HIT "${videoUrl.substring(0, 50)}..."`)
    return entry
  }
  return null
}

function setCachedAudioStream(videoUrl, data) {
  if (audioStreamCache.size >= AUDIO_CACHE_MAX) {
    const entries = [...audioStreamCache.entries()]
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toDelete = entries.slice(0, Math.floor(AUDIO_CACHE_MAX / 2))
    for (const [k] of toDelete) audioStreamCache.delete(k)
    console.log(`[audio cache] 清理 ${toDelete.length} 条过期音频缓存`)
  }
  audioStreamCache.set(videoUrl, { ...data, timestamp: Date.now() })
  console.log(`[audio cache] SET "${videoUrl.substring(0, 50)}..."`)
}

// ==================== 音频流提取端点 ====================

/**
 * POST /video-parse/ytdlp/audio-stream
 * 专门提取纯音频流地址（-f bestaudio），用于音乐播放场景
 * Body: { url: "视频链接" }
 * 返回: { code, data: { url: "代理后的音频流URL", title, duration, thumbnail } }
 *
 * 缓存策略：
 * - 同一视频URL的音频流地址缓存 30 分钟
 * - 前端拿到代理URL后可继续在客户端缓存
 */
router.post('/ytdlp/audio-stream', async (req, res, next) => {
  try {
    if (!ytDlpAvailable) {
      return res.status(503).json({
        code: -1,
        message: 'yt-dlp 未安装或不可用'
      })
    }

    let { url: videoUrl } = req.body
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '缺少视频链接' })
    }
    videoUrl = normalizeVideoUrl(videoUrl)
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '请使用具体视频的链接，当前链接可能为搜索页或列表页' })
    }

    // ========== 缓存检查 ==========
    const cached = getCachedAudioStream(videoUrl)
    if (cached) {
      return res.json({
        code: 0,
        data: {
          url: cached.proxyUrl,
          title: cached.title || '',
          duration: cached.duration || 0,
          thumbnail: cached.thumbnail || '',
          cached: true
        }
      })
    }

    console.log(`[yt-dlp audio] 提取音频流: "${videoUrl.substring(0, 60)}..."`)

    // 阶段1: 获取视频元信息
    let title = ''
    let duration = 0
    let thumbnail = ''
    try {
      const { stdout } = await runYtDlp([
        '-j', '--no-playlist', '--no-check-certificate', videoUrl
      ], timeout, videoUrl)
      const info = JSON.parse(stdout)
      title = info.title || ''
      duration = info.duration || 0
      thumbnail = info.thumbnail || ''
    } catch (err) {
      // 元信息获取失败不阻塞，继续获取音频流
      console.warn('[yt-dlp audio] 获取元信息失败:', (err.stderr || err.message || '').substring(0, 200))
    }

    // 阶段2: 获取纯音频流地址
    // -f bestaudio: 只选最佳音频格式
    // -g: 输出直接流地址
    const { stdout } = await runYtDlp([
      '-f', 'bestaudio',
      '-g',
      '--no-playlist',
      '--no-check-certificate',
      videoUrl
    ], timeout, videoUrl)

    const audioStreamUrl = stdout.split('\n').filter(Boolean)[0]
    if (!audioStreamUrl || !audioStreamUrl.startsWith('http')) {
      return res.status(400).json({
        code: -1,
        message: '未能提取到音频流地址，该平台可能不支持纯音频提取'
      })
    }

    // 生成代理 token
    const referer = getRefererForUrl(videoUrl)
    const needProxy = needsProxyForUrl(videoUrl)
    const token = generateToken()
    streamCache.set(token, {
      streamUrl: audioStreamUrl,
      referer,
      needProxy,
      expires: Date.now() + STREAM_TOKEN_TTL
    })

    // 清理过期 streamCache
    for (const [key, val] of streamCache) {
      if (val.expires < Date.now()) streamCache.delete(key)
    }

    const proxyUrl = `/staticTool/api/video-parse/ytdlp/proxy-stream/${token}`

    // 缓存结果
    setCachedAudioStream(videoUrl, {
      proxyUrl,
      title,
      duration,
      thumbnail
    })

    res.json({
      code: 0,
      data: {
        url: proxyUrl,
        title,
        duration,
        thumbnail,
        cached: false
      }
    })
  } catch (err) {
    if (err.stderr) {
      console.error('[yt-dlp audio error]', err.stderr.substring(0, 500))
      return res.status(400).json({
        code: -1,
        message: '提取音频流失败，可能是链接无效或平台不支持',
        detail: err.stderr.substring(0, 300)
      })
    }
    if (err.killed || err.code === 'ETIMEDOUT') {
      return res.status(504).json({
        code: -1,
        message: '提取超时，yt-dlp 执行时间过长，请重试'
      })
    }
    next(err)
  }
})

// ==================== 视频下载 / 音频转换端点 ====================

/**
 * POST /video-parse/ytdlp/download
 * 用 yt-dlp 下载视频（或转音频 MP3）并回传给浏览器
 * Body: { url, formatId?, audioOnly?, title? }
 *   - url: 视频链接
 *   - formatId: 可选，指定格式ID（如 best、bestvideo+bestaudio），默认 best
 *   - audioOnly: 若为 true，则提取为 MP3 音频（等价转音频功能）
 *   - title: 可选，用于设置下载文件名
 */
router.post('/ytdlp/download', async (req, res, next) => {
  try {
    let { url: videoUrl, formatId, audioOnly, title: givenTitle } = req.body
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '缺少视频链接' })
    }
    videoUrl = normalizeVideoUrl(videoUrl)
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '请使用具体视频的链接，当前链接可能为搜索页或列表页' })
    }

    // 好看视频自定义下载（不依赖 yt-dlp，直接从 CDN 流式转发）
    if (isHaokanUrl(videoUrl) && !audioOnly) {
      const haokanData = await extractHaokanVideo(videoUrl)
      if (!haokanData || !haokanData.formats || !haokanData.formats[0] || !haokanData.formats[0].url) {
        return res.status(400).json({ code: -1, message: '提取好看视频信息失败' })
      }
      const playUrl = haokanData.formats[0].url
      const title = givenTitle || haokanData.title || 'video'
      const safeBase = title.replace(/[\\/:*?"<>|\r\n]+/g, '_').substring(0, 120)
      const downloadName = `${safeBase}.mp4`

      const streamResp = await axios({
        method: 'get',
        url: playUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://haokan.baidu.com/'
        },
        timeout: 120000,
        httpsAgent: insecureAgent
      })

      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
      res.setHeader('Content-Type', 'application/octet-stream')
      if (streamResp.headers['content-length']) {
        res.setHeader('Content-Length', streamResp.headers['content-length'])
      }
      streamResp.data.pipe(res)
      streamResp.data.on('error', (err) => {
        console.error('[haokan download stream error]', err.message)
        if (!res.headersSent) res.status(500).json({ code: -1, message: '下载中断' })
      })
      return
    }

    if (!ytDlpAvailable) {
      return res.status(503).json({ code: -1, message: 'yt-dlp 未安装或不可用' })
    }

    // 创建临时目录用于下载
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-'))
    const outTemplate = path.join(tmpDir, 'output.%(ext)s')
    const audioOutTemplate = path.join(tmpDir, 'output.%(ext)s')

    const args = [
      '--no-playlist',
      '--no-check-certificate',
      '-o', audioOnly ? audioOutTemplate : outTemplate
    ]
    if (proxy) args.push('--proxy', proxy)
    if (cookieFile) args.push('--cookies', cookieFile)

    if (audioOnly) {
      // 转音频：提取最佳音频并转 MP3（需要 ffmpeg，yt-dlp 会自动调用）
      args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0')
    } else {
      // 下载视频：不指定 -f 时让 yt-dlp 自动选择并合并最佳格式
      // -f best 对 B站等平台不适用，yt-dlp 会自动选 bestvideo+bestaudio 并合并
      if (formatId) {
        args.push('-f', formatId)
      }
    }
    args.push(videoUrl)

    // 使用 spawn 执行，避免 exec 内存 buffer 限制
    // 使用完整命令字符串（yt-dlp 路径可能含空格）
    const cmd = `"${binPath}" ${args.map(a => `"${a}"`).join(' ')}`
    await new Promise((resolvePromise, rejectPromise) => {
      const proc = spawn(cmd, { shell: true, windowsHide: true })
      let stderr = ''
      proc.stderr.on('data', d => { stderr += d.toString() })
      proc.on('error', err => rejectPromise(err))
      proc.on('close', code => {
        if (code === 0) resolvePromise()
        else rejectPromise(new Error(stderr || `yt-dlp 退出码 ${code}`))
      })
    })

    // 找到下载好的文件
    const files = fs.readdirSync(tmpDir)
    const file = files.find(f => f.startsWith('output.'))
    if (!file) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return res.status(400).json({ code: -1, message: '下载失败，未生成文件' })
    }
    const filePath = path.join(tmpDir, file)

    // 生成下载文件名（去除非法字符）
    const base = givenTitle || 'video'
    const safeBase = base.replace(/[\\/:*?"<>|\r\n]+/g, '_').substring(0, 120)
    const ext = path.extname(file) || (audioOnly ? '.mp3' : '.mp4')
    const downloadName = `${safeBase}${ext}`

    // 流式回传文件，触发浏览器下载
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    const stat = fs.statSync(filePath)
    res.setHeader('Content-Length', stat.size)
    const contentType = audioOnly ? 'audio/mpeg' : 'application/octet-stream'
    res.setHeader('Content-Type', contentType)

    const readStream = fs.createReadStream(filePath)
    readStream.on('end', () => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })
    readStream.on('error', (err) => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      console.error('[yt-dlp download stream error]', err.message)
      if (!res.headersSent) res.status(500).json({ code: -1, message: '文件读取失败' })
    })
    readStream.pipe(res)
  } catch (err) {
    console.error('[yt-dlp download error]', (err.stderr || err.message || '').substring(0, 500))
    return res.status(400).json({
      code: -1,
      message: '下载失败，可能是链接无效或平台不支持',
      detail: (err.message || '').substring(0, 300)
    })
  }
})

// ==================== 无水印下载 ====================

/**
 * POST /video-parse/ytdlp/no-watermark-download
 * 先提取视频元信息，过滤掉带水印的格式，再下载最佳无水印版本
 * Body: { url, title? }
 *   - url: 视频链接（抖音/快手等）
 *   - title: 可选，用于设置下载文件名
 */
router.post('/ytdlp/no-watermark-download', async (req, res, next) => {
  try {
    let { url: videoUrl, title: givenTitle } = req.body
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '缺少视频链接' })
    }
    videoUrl = normalizeVideoUrl(videoUrl)
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '请使用具体视频的链接，当前链接可能为搜索页或列表页' })
    }

    // 好看视频无水印下载（好看视频无水印问题，直接转发 CDN）
    if (isHaokanUrl(videoUrl)) {
      const haokanData = await extractHaokanVideo(videoUrl)
      if (!haokanData || !haokanData.formats || !haokanData.formats[0] || !haokanData.formats[0].url) {
        return res.status(400).json({ code: -1, message: '提取好看视频信息失败' })
      }
      const playUrl = haokanData.formats[0].url
      const title = givenTitle || haokanData.title || 'video'
      const safeBase = title.replace(/[\\/:*?"<>|\r\n]+/g, '_').substring(0, 120)
      const downloadName = `${safeBase}.mp4`

      const streamResp = await axios({
        method: 'get',
        url: playUrl,
        responseType: 'stream',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://haokan.baidu.com/'
        },
        timeout: 120000,
        httpsAgent: insecureAgent
      })

      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
      res.setHeader('Content-Type', 'application/octet-stream')
      if (streamResp.headers['content-length']) {
        res.setHeader('Content-Length', streamResp.headers['content-length'])
      }
      streamResp.data.pipe(res)
      streamResp.data.on('error', (err) => {
        console.error('[haokan no-wm download stream error]', err.message)
        if (!res.headersSent) res.status(500).json({ code: -1, message: '下载中断' })
      })
      return
    }

    if (!ytDlpAvailable) {
      return res.status(503).json({ code: -1, message: 'yt-dlp 未安装或不可用' })
    }

    // Step 1: dump-json 获取所有格式
    let videoInfo
    try {
      const result = await runYtDlp(['-j', '--no-playlist', videoUrl], timeout * 2, videoUrl)
      videoInfo = JSON.parse(result.stdout)
    } catch (e) {
      return res.status(400).json({ code: -1, message: '提取视频信息失败: ' + ((e.stderr || e.message || '').substring(0, 200)) })
    }

    // Step 2: 过滤无水印格式
    const formats = videoInfo.formats || []
    let cleanFormats = formats.filter(f => {
      const note = (f.format_note || '').toLowerCase()
      const acodec = (f.acodec || '').toLowerCase()
      // 排除明显的水印标记 / 只有音频的 / 纯图片格式
      if (note.includes('watermark') || note.includes('水印')) return false
      if (note.includes('logo') || note.includes('贴纸')) return false
      return true
    })

    if (cleanFormats.length === 0) {
      cleanFormats = formats
    }

    // 分离视频流和音频流
    const videoFormats = cleanFormats.filter(f => f.vcodec && f.vcodec !== 'none' && f.width > 0)
    const audioFormats = cleanFormats.filter(f => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none'))
    const combinedFormats = cleanFormats.filter(f => f.vcodec && f.vcodec !== 'none' && f.acodec && f.acodec !== 'none')

    let formatSelector = 'best'
    if (combinedFormats.length > 0) {
      // 优先选择音视频一体的格式，按分辨率降序
      combinedFormats.sort((a, b) => (b.height || 0) - (a.height || 0))
      formatSelector = combinedFormats[0].format_id
    } else if (videoFormats.length > 0 && audioFormats.length > 0) {
      // 视频流 + 音频流合并
      videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0))
      audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0))
      formatSelector = `${videoFormats[0].format_id}+${audioFormats[0].format_id}`
    } else if (videoFormats.length > 0) {
      videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0))
      formatSelector = videoFormats[0].format_id
    }

    console.log(`[no-watermark] selected format: ${formatSelector}, clean/total: ${cleanFormats.length}/${formats.length}`)

    // Step 3: 使用选中的 format 下载
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-nw-'))
    const outTemplate = path.join(tmpDir, 'output.%(ext)s')

    const args = [
      '--no-playlist',
      '--no-check-certificate',
      '-o', outTemplate,
      '-f', formatSelector
    ]
    if (proxy) args.push('--proxy', proxy)
    if (cookieFile) args.push('--cookies', cookieFile)
    args.push(videoUrl)

    const cmd = `"${binPath}" ${args.map(a => `"${a}"`).join(' ')}`
    await new Promise((resolvePromise, rejectPromise) => {
      const proc = spawn(cmd, { shell: true, windowsHide: true })
      let stderr = ''
      proc.stderr.on('data', d => { stderr += d.toString() })
      proc.on('error', err => rejectPromise(err))
      proc.on('close', code => {
        if (code === 0) resolvePromise()
        else rejectPromise(new Error(stderr || `yt-dlp 退出码 ${code}`))
      })
    })

    // 找到下载好的文件
    const files = fs.readdirSync(tmpDir)
    const file = files.find(f => f.startsWith('output.'))
    if (!file) {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      return res.status(400).json({ code: -1, message: '无水印下载失败，未生成文件' })
    }
    const filePath = path.join(tmpDir, file)

    // 生成下载文件名
    const base = givenTitle || 'video'
    const safeBase = base.replace(/[\\/:*?"<>|\r\n]+/g, '_').substring(0, 120)
    const ext = path.extname(file) || '.mp4'
    const downloadName = `${safeBase}_无水印${ext}`

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`)
    const stat = fs.statSync(filePath)
    res.setHeader('Content-Length', stat.size)
    res.setHeader('Content-Type', 'application/octet-stream')

    const readStream = fs.createReadStream(filePath)
    readStream.on('end', () => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    })
    readStream.on('error', (err) => {
      fs.rmSync(tmpDir, { recursive: true, force: true })
      console.error('[no-watermark download stream error]', err.message)
      if (!res.headersSent) res.status(500).json({ code: -1, message: '文件读取失败' })
    })
    readStream.pipe(res)
  } catch (err) {
    console.error('[no-watermark download error]', (err.stderr || err.message || '').substring(0, 500))
    return res.status(400).json({
      code: -1,
      message: '无水印下载失败，可能该视频不支持去水印',
      detail: (err.message || '').substring(0, 300)
    })
  }
})

// ==================== B站 二维码登录 ====================

/**
 * POST /video-parse/ytdlp/bili-qrcode
 * 获取 B站扫码登录二维码
 * 返回: { code, data: { url, qrcodeKey, expiresIn } }
 */
router.post('/ytdlp/bili-qrcode', async (req, res) => {
  try {
    const resp = await axios.get(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/generate',
      {
        params: { source: 'main-fe-header' },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com/'
        },
        timeout: 15000
      }
    )
    const data = resp.data?.data
    if (!data?.url || !data?.qrcode_key) {
      return res.json({ code: -1, message: '获取二维码失败，请重试' })
    }
    res.json({
      code: 0,
      data: {
        url: data.url,
        qrcodeKey: data.qrcode_key,
        expiresIn: data.qrcode_expires_in || 180
      }
    })
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data).substring(0, 200) : (err.code || err.message)
    console.error('[bili-qrcode] 生成二维码失败:', detail)
    res.json({
      code: -1,
      message: '生成二维码失败，请检查服务器网络',
      detail: err.response?.status ? `B站接口返回 ${err.response.status}` : (err.code || '网络不通')
    })
  }
})

/**
 * GET /video-parse/ytdlp/bili-qrcode/status?qrcodeKey=xxx
 * 轮询扫码状态，扫码成功后自动保存 cookie
 * status: 0=pending 1=scanned 2=success -1=expired
 */
router.get('/ytdlp/bili-qrcode/status', async (req, res) => {
  const { qrcodeKey } = req.query
  if (!qrcodeKey) {
    return res.status(400).json({ code: -1, message: '缺少 qrcodeKey' })
  }
  try {
    const resp = await axios.get(
      'https://passport.bilibili.com/x/passport-login/web/qrcode/poll',
      {
        params: { qrcode_key: qrcodeKey },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 15000
      }
    )
    const data = resp.data?.data
    const code = data?.code
    // B站 poll 返回: code=0 成功(附带 url 和 cookies), code=86038 已扫码, code=86090 未扫码
    if (code === 0 && data?.url) {
      // 登录成功，保存 cookie
      // poll 接口的 Set-Cookie 不完整，需要再请求 data.url 获取完整登录 cookie
      let setCookies = resp.headers['set-cookie'] || []
      try {
        const redirectResp = await axios.get(data.url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Referer': 'https://www.bilibili.com/'
          },
          maxRedirects: 5,
          timeout: 15000
        })
        // 合并 poll 响应和重定向响应的 Set-Cookie
        const redirectCookies = redirectResp.headers['set-cookie'] || []
        // 去重：同名 cookie 以后者为准
        const cookieMap = new Map()
        for (const c of [...setCookies, ...redirectCookies]) {
          const name = c.split('=')[0]
          cookieMap.set(name, c)
        }
        setCookies = Array.from(cookieMap.values())
      } catch (redirectErr) {
        console.error('[bili-qrcode] 获取重定向 cookie 失败（降级使用 poll 的 Set-Cookie）:', redirectErr.message)
      }
      const saved = saveBilibiliCookie(setCookies)
      if (saved) {
        // 立即验证 cookie 是否有效，获取昵称一起返回
        try {
          const cookieFile = path.join(COOKIES_DIR, 'bilibili.txt')
          const cookieContent = fs.readFileSync(cookieFile, 'utf8')
          const verifyResp = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Referer': 'https://www.bilibili.com/',
              'Cookie': cookieContent.split('\n')
                .map(line => line.replace(/^#HttpOnly_/, ''))
                .filter(line => line && !line.startsWith('#') && line.includes('\t'))
                .map(line => {
                  const parts = line.split('\t')
                  if (parts.length >= 7) return `${parts[5]}=${parts[6]}`
                  return ''
                })
                .filter(Boolean).join('; ')
            },
            timeout: 10000
          })
          const nickname = verifyResp.data?.data?.uname || ''
          const isValid = verifyResp.data?.data?.isLogin === true
          return res.json({
            code: 0,
            data: {
              status: 'success',
              saved: true,
              nickname,
              valid: isValid,
              message: isValid ? `登录成功，欢迎 ${nickname}` : `Cookie 已保存但验证未通过${nickname ? '（' + nickname + '）' : ''}，请重试`
            }
          })
        } catch (verifyErr) {
          console.error('[bili-qrcode] 验证 cookie 失败:', verifyErr.message)
        }
      }
      return res.json({
        code: 0,
        data: { status: 'success', saved, message: saved ? '登录成功，Cookie 已保存' : '登录成功，但保存 Cookie 失败' }
      })
    }
    if (code === 86038) {
      return res.json({ code: 0, data: { status: 'scanned', message: '已扫码，等待确认' } })
    }
    if (code === 86090 || code === 86101) {
      return res.json({ code: 0, data: { status: 'pending', message: '等待扫码' } })
    }
    // 其他状态码视为过期或失败
    return res.json({ code: 0, data: { status: 'expired', message: '二维码已过期，请重新获取' } })
  } catch (err) {
    console.error('[bili-qrcode] 轮询失败:', err.message)
    res.json({ code: -1, message: '轮询登录状态失败，请重试' })
  }
})

/**
 * GET /video-parse/ytdlp/cookies/:platform
 * 查询某平台是否已配置 cookie 文件，B站额外验证 cookie 有效性
 */
router.get('/ytdlp/cookies/:platform', async (req, res) => {
  const platform = (req.params.platform || '').toLowerCase()
  const file = PLATFORM_COOKIE_MAP[platform]
  if (!file) return res.json({ code: 0, data: { configured: false } })
  const p = path.join(COOKIES_DIR, file)
  const configured = fs.existsSync(p) && fs.statSync(p).size > 0
  if (!configured) return res.json({ code: 0, data: { configured: false } })

  // B站额外验证 cookie 是否有效（调用 B站用户信息接口）
  if (platform === 'bilibili') {
    try {
      const cookieContent = fs.readFileSync(p, 'utf8')
      const resp = await axios.get('https://api.bilibili.com/x/web-interface/nav', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com/',
          'Cookie': cookieContent.split('\n')
            .map(line => line.replace(/^#HttpOnly_/, ''))
            .filter(line => line && !line.startsWith('#') && line.includes('\t'))
            .map(line => {
              const parts = line.split('\t')
              if (parts.length >= 7) return `${parts[5]}=${parts[6]}`
              return ''
            })
            .filter(Boolean)
            .join('; ')
        },
        timeout: 10000
      })
      const valid = resp.data?.data?.isLogin === true
      res.json({ code: 0, data: { configured: true, valid, nickname: valid ? (resp.data.data.uname || '') : '' } })
    } catch (err) {
      console.error('[bili-cookie-check] 验证失败:', err.message)
      // 接口失败不判定为失效，保留文件存在状态
      res.json({ code: 0, data: { configured: true, valid: null } })
    }
  } else {
    res.json({ code: 0, data: { configured: true } })
  }
})

// ==================== 流媒体代理端点 ====================

/**
 * GET /video-parse/ytdlp/proxy-stream/:token
 * 代理 HLS/m3u8 流：获取 m3u8 内容，重写分片URL指向本代理
 * 非 m3u8 的媒体文件（mp4 等）直接代理转发
 */
router.get('/ytdlp/proxy-stream/:token', async (req, res) => {
  try {
    const { token } = req.params
    const entry = streamCache.get(token)
    if (!entry || entry.expires < Date.now()) {
      streamCache.delete(token)
      return res.status(404).json({ code: -1, message: '流地址已过期，请重新提取' })
    }

    const { streamUrl, referer, needProxy } = entry
    const fetchHeaders = {
      'Referer': referer || '',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Origin': referer ? new URL(referer).origin : ''
    }

    // 判断是否为 m3u8
    const isM3u8 = streamUrl.includes('.m3u8') || streamUrl.includes('/m3u8') ||
      streamUrl.includes('m3u8')

    // 境外流媒体（YouTube等）需要走代理
    const axiosOptions = needProxy && proxyHttpAgent
      ? { httpAgent: proxyHttpAgent, httpsAgent: proxyHttpAgent }
      : {}

    if (!isM3u8) {
      // 非 m3u8（mp4 等）：直接代理转发
      const response = await axios.get(streamUrl, {
        responseType: 'stream',
        headers: fetchHeaders,
        timeout: 300000,
        ...axiosOptions
      })
      const ct = response.headers['content-type'] || 'video/mp4'
      res.set({
        'Content-Type': ct,
        'Access-Control-Allow-Origin': '*',
        'Accept-Ranges': 'bytes',
        'Content-Length': response.headers['content-length'] || ''
      })
      response.data.pipe(res)
      return
    }

    // m3u8：获取内容并重写 URL
    const response = await axios.get(streamUrl, {
      responseType: 'text',
      headers: fetchHeaders,
      timeout: 15000,
      ...axiosOptions
    })

    let m3u8Content = response.data
    const isMaster = m3u8Content.includes('#EXT-X-STREAM-INF')

    // 辅助：将 URL 编码为代理地址
    function makeSegmentProxyUrl(originalUrl) {
      try {
        const resolved = new URL(originalUrl, streamUrl).href
        const encoded = Buffer.from(resolved).toString('base64')
        const encodedRef = Buffer.from(referer || '').toString('base64')
        return `/staticTool/api/video-parse/ytdlp/proxy-segment?seg=${encodeURIComponent(encoded)}&ref=${encodeURIComponent(encodedRef)}`
      } catch {
        return originalUrl
      }
    }

    if (isMaster) {
      // 主播放列表：重写子 m3u8 URL
      m3u8Content = m3u8Content.split('\n').map(line => {
        const trimmed = line.trim()
        if (trimmed && !trimmed.startsWith('#') && (trimmed.endsWith('.m3u8') || trimmed.includes('.m3u8'))) {
          const resolvedUrl = new URL(trimmed, streamUrl).href
          const subToken = generateToken()
          streamCache.set(subToken, { streamUrl: resolvedUrl, referer, needProxy, expires: Date.now() + STREAM_TOKEN_TTL })
          return `/staticTool/api/video-parse/ytdlp/proxy-stream/${subToken}`
        }
        return line
      }).join('\n')
    } else {
      // 媒体播放列表：重写分片和密钥 URL
      m3u8Content = m3u8Content.split('\n').map(line => {
        const trimmed = line.trim()
        // 重写 EXT-X-KEY 中的 URI
        if (trimmed.startsWith('#EXT-X-KEY') && trimmed.includes('URI=')) {
          return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => `URI="${makeSegmentProxyUrl(uri)}"`)
        }
        // 重写分片文件（.ts, .m4s, .aac 等）
        if (trimmed && !trimmed.startsWith('#') && !trimmed.endsWith('.m3u8')) {
          return makeSegmentProxyUrl(trimmed)
        }
        return line
      }).join('\n')
    }

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    })
    res.send(m3u8Content)
  } catch (err) {
    console.error('[proxy-stream error]', err.message)
    if (!res.headersSent) {
      res.status(500).json({ code: -1, message: '代理流失败: ' + err.message })
    }
  }
})

/**
 * GET /video-parse/ytdlp/proxy-segment
 * 代理 HLS 分片/密钥请求，附加正确的 Referer 和 User-Agent
 * Query: seg=<base64_encoded_url>&ref=<base64_encoded_referer>
 */
router.get('/ytdlp/proxy-segment', async (req, res) => {
  try {
    const { seg, ref } = req.query
    if (!seg) {
      return res.status(400).json({ code: -1, message: '缺少分片URL' })
    }

    const segmentUrl = Buffer.from(seg, 'base64').toString('utf-8')
    const referer = ref ? Buffer.from(ref, 'base64').toString('utf-8') : ''

    if (!segmentUrl.startsWith('http')) {
      return res.status(400).json({ code: -1, message: '无效的分片URL' })
    }

    const response = await axios.get(segmentUrl, {
      responseType: 'stream',
      headers: {
        'Referer': referer,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Origin': referer ? new URL(referer).origin : ''
      },
      timeout: 30000,
      ...withOptionalProxy({}, segmentUrl)
    })

    res.set({
      'Content-Type': response.headers['content-type'] || 'video/mp2t',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600'
    })

    response.data.pipe(res)
  } catch (err) {
    console.error('[proxy-segment error]', err.message)
    if (!res.headersSent) {
      res.status(500).json({ code: -1, message: '代理分片失败' })
    }
  }
})

// ==================== 搜索结果智能过滤与分组 ====================

// 解说/吐槽/二创/非正片类关键词 — 命中任意一个即过滤
// 注意：很多词在正片标题中也常见，需要更精确的匹配
const COMMENTARY_PATTERNS = [
  // 明确解说/吐槽类
  /解说.*[剧影集]|剧.*解说|吐槽.*[剧影集]|剧.*吐槽/i,
  /reaction\s*(to|视频)/i, /reacc/i,
  /观后感|读后|拉片|锐评/,
  // 混剪/cut
  /混剪|纯cut\b/i,
  // 预告花絮类
  /预告[片篇]|花絮|片花|幕后/,
  // 盘点排名类
  /名场面|TOP\s*\d/i,
  // 速看/几分钟类
  /一口气.*[看剧完]|[几分]分钟.*[看剧完]|速看|省流/,
  // 评价/观感类（"搞笑"单独出现可能是正片标签，需要更多上下文）
  /爆笑|笑死|离谱|神经病|沙雕/,
  // 安利种草
  /安利|种草|必看.*[推荐]|[推荐].*必看/,
  // ★新增：非正片内容精准过滤
  // 模仿/翻拍
  /模仿.*[台词语录片段]|[人物角色].*模仿|翻拍/,
  // 舞蹈/歌唱表演
  /舞蹈|[跳编]舞|说唱|演唱[会奏]|古风舞|中国舞|练舞|学舞/,
  // 教程教学
  /教程|教学|详细完整版|简单易[学懂]|零基础|新手向/,
  // 八卦/调侃/搞笑段子
  /调侃|回复超好笑|原因[超真]?[好笑逗]|竟遭.*打电话|爆料|八卦|内幕/,
  // 真实评价/最真实
  /最真实|真实的?[评价看法感受]|真实[的]?(?:评价|感受|看法)/,
  // 采访/访谈/心路历程
  /心路历程|专访|独家?采访|讲述.*遇到|讲述.*趣事/,
  // 用户评价/读后/观后
  /[说谈谈聊聊讲讲]说.*[到看观]底|怎么[评价看].*[这那]|.*有点.*好看|这[部本].*怎么/,
  // 游戏/动漫相关
  /无期迷途|追番|8月番|游戏.*剧情|角色.*攻略/,
  // 广告/推广类
  /广告[片界圈]|带货|推广/,
  // 居民/路人评价
  /当地居民|上海[爷叔姐妹兄弟]|[路网]友.*评价|群众.*评价/,
  // 纯背景音乐/配乐
  /BGM|配乐|背景音乐|OST|纯音乐|伴奏/,
]

// 剧集编号模式 — 用于识别正片剧集
const EPISODE_REGEX = [
  /第\s*(\d+)\s*[集话期]/,
  /[Ee][Pp]?\s*0*(\d+)/,
  /^P\s*(\d+)\b/i,
  /【(\d+)】/,
  /\[(\d+)\]/,
  /[（(](\d+)[）)]/,
  /#\s*(\d+)/,
]

// 提取集号时需过滤的非集号数字（年份、分辨率等）
const NON_EPISODE_NUMBERS = new Set([
  '1080', '2160', '720', '480', '360', '4', '8',
  '2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027',
])

/**
 * 判断标题是否为解说/二创内容（应过滤）
 */
function isCommentary(title) {
  return COMMENTARY_PATTERNS.some(p => p.test(title))
}

/**
 * 从标题提取剧集号，找不到返回 0
 */
function extractEpisodeNumber(title) {
  for (const re of EPISODE_REGEX) {
    const m = title.match(re)
    if (m) {
      const num = parseInt(m[1], 10)
      if (NON_EPISODE_NUMBERS.has(String(num))) continue
      if (num >= 1 && num <= 200) return num
    }
  }
  // 回退：标题末尾或开头出现的小数字（如 "繁花 01"）
  const bareMatch = title.match(/(?:^|\s)(\d{1,2})(?:\s|$|\.|\uff0c|，)/)
  if (bareMatch) {
    const num = parseInt(bareMatch[1], 10)
    if (num >= 1 && num <= 100) return num
  }
  return 0
}

/**
 * 从标题提取剧名（去掉剧集号、方括号标签等）
 */
function extractShowName(title, epNum) {
  let name = title
  // 去掉剧集编号
  if (epNum > 0) {
    name = name.replace(/第\s*\d+\s*[集话期]/g, '')
    name = name.replace(/[Ee][Pp]?\s*\d+/g, '')
    name = name.replace(/\bP\s*\d+\b/gi, '')
    name = name.replace(/【\d+】/g, '')
    name = name.replace(/\[(\d+)\]/g, '')
    name = name.replace(/[（(](\d+)[）)]/g, '')
    name = name.replace(/#\s*\d+/g, '')
  }
  // 清理质量/分辨率/平台标签（【4K】【1080P】【全集】【B站】等），但保留可能的剧名标签
  name = name.replace(/【(?:4K|1080[Pp]|2160[Pp]|720[Pp]|高清|超清|全集|完结|更新|连载|付费|独播|B站|bilibili|官方|MV|PV|OP|ED|CM)】/g, '')
  name = name.replace(/\[(?:4K|1080[Pp]|2160[Pp]|720[Pp]|高清|超清|全集|完结|更新|连载|付费|独播)\]/, '')
  // 尝试从剩余的【xxx】中提取剧名
  const bracketMatch = name.match(/【([^】]{2,20})】/)
  if (bracketMatch) {
    // 有【xxx】可能是剧名，用里面的内容
    let inner = bracketMatch[1]
    // 去除通用的标签词
    inner = inner.replace(/^(?:国产|日剧|韩剧|美剧|动漫|动画|电影|电视剧)/, '')
    if (inner.length >= 2) {
      return inner.replace(/\s+/g, ' ').trim()
    }
  }
  // 清理所有【】和[]
  name = name.replace(/【[^】]*】/g, '')
  name = name.replace(/\[[^\]]*\]/g, '')
  name = name.replace(/[「」]/g, '')
  // 清理分隔符和多余空格
  name = name.replace(/[_\-\|｜·]/g, ' ')
  name = name.replace(/\s+/g, ' ').trim()
  // 如果清理后为空，从原始标题中取前段非标签部分
  if (!name || name.length < 2) {
    // 去掉所有标签后的原始标题
    let raw = title
      .replace(/【[^】]*】/g, '')
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/（[^）]*）/g, '')
      .replace(/[_\-\|｜·]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (raw.length < 2) {
      raw = title.replace(/\s+/g, ' ').trim()
    }
    return raw.substring(0, 20).replace(/\s+/g, ' ').trim()
  }
  return name
}

/**
 * 对搜索结果进行过滤和分组
 * 返回 { groups: [{showName, episodes[], thumbnail, uploader}], ungrouped: [...] }
 */
function filterAndGroupResults(rawResults) {
  console.log(`[SearchFilter] 原始结果数: ${rawResults.length}`)
  rawResults.forEach((r, i) => {
    console.log(`[SearchFilter]   [${i}] title="${r.title}" | uploader="${r.uploader || ''}" | isCommentary=${isCommentary(r.title)} | epNum=${extractEpisodeNumber(r.title)}`)
  })

  // 1. 过滤解说/二创
  const filtered = rawResults.filter(r => !isCommentary(r.title))
  const removed = rawResults.filter(r => isCommentary(r.title))
  console.log(`[SearchFilter] 过滤掉 ${removed.length} 条解说/二创:`)
  removed.forEach(r => console.log(`[SearchFilter]   ✗ "${r.title}"`))

  // 2. 标记每个结果的剧集号
  const withEpNum = filtered.map(r => ({
    ...r,
    epNum: extractEpisodeNumber(r.title)
  }))

  console.log(`[SearchFilter] 过滤后 ${filtered.length} 条:`)
  withEpNum.forEach((r, i) => {
    console.log(`[SearchFilter]   [${i}] epNum=${r.epNum} showName="${extractShowName(r.title, r.epNum)}" title="${r.title}"`)
  })

  // 3. 分组：有剧集号的归入剧集组，否则为独立视频
  const epResults = withEpNum.filter(r => r.epNum > 0)
  const standalone = withEpNum.filter(r => r.epNum === 0)
  console.log(`[SearchFilter] 有集号: ${epResults.length} 条, 无集号: ${standalone.length} 条`)

  // 4. 按 showName 聚合剧集组
  const groupMap = new Map()
  for (const r of epResults) {
    const showName = extractShowName(r.title, r.epNum)
    const key = `${showName}|${r.uploader || ''}`
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        showName,
        uploader: r.uploader || '',
        thumbnail: r.thumbnail || '',
        episodes: []
      })
    }
    const group = groupMap.get(key)
    // 取第一个有效缩略图
    if (!group.thumbnail && r.thumbnail) group.thumbnail = r.thumbnail
    group.episodes.push(r)
  }

  // 5. 组内按剧集号排序 + 去重
  const groups = []
  for (const [, g] of groupMap) {
    // 按剧集号排序
    g.episodes.sort((a, b) => a.epNum - b.epNum)
    // 去重：相同剧集号只保留第一个
    const seen = new Set()
    g.episodes = g.episodes.filter(e => {
      if (seen.has(e.epNum)) return false
      seen.add(e.epNum)
      return true
    })
    // 至少1集就算剧集组（用户可点"获取全部剧集"展开）
    if (g.episodes.length >= 1) {
      groups.push(g)
    } else {
      standalone.push(...g.episodes)
    }
  }

  console.log(`[SearchFilter] 最终: ${groups.length} 个剧目分组, ${standalone.length} 个独立视频`)
  groups.forEach((g, i) => {
    console.log(`[SearchFilter]   剧目[${i}] "${g.showName}" ${g.episodes.length}集: ${g.episodes.map(e => `#${e.epNum}`).join(', ')}`)
  })
  standalone.forEach((s, i) => {
    console.log(`[SearchFilter]   独立[${i}] "${s.title}" (epNum=${s.epNum})`)
  })

  return { groups, ungrouped: standalone }
}

/**
 * POST /video-parse/ytdlp/search
 * 按名称搜索视频（支持 YouTube、B站等）
 * Body: { query: "搜索关键词", platform?: "youtube"|"bilibili"|"auto", limit?: number }
 * 返回: { code, data: { results, groups, ungrouped, total } }
 */
/**
 * 判断查询是否像电视剧/电影名称（中文为主）
 */
function isMediaQuery(query) {
  const trimmed = query.trim()
  // 排除 URL
  if (/^https?:\/\//i.test(trimmed)) return false
  // 排除纯英文/数字
  if (/^[a-zA-Z0-9\s]+$/.test(trimmed)) return false
  return true
}

/**
 * 执行单次 yt-dlp 搜索，返回解析后的结果数组
 */
async function doSearch(searchQuery, timeoutMs) {
  try {
    const isBili = searchQuery.startsWith('bilisearch')
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-check-certificate',
      // 伪装成现代浏览器，解决 B站 412 / YouTube 反爬
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      ...(isBili ? [
        '--add-header', 'Referer:https://www.bilibili.com/',
        '--add-header', 'Accept-Language:zh-CN,zh;q=0.9,en;q=0.8',
        '--add-header', 'Origin:https://www.bilibili.com',
      ] : [
        '--add-header', 'Accept-Language:zh-CN,zh;q=0.9,en;q=0.8',
      ]),
      searchQuery
    ]
    // B站搜索传 B站 URL 让 runYtDlp 通过 getCookieFileForUrl 自动加载 cookies/bilibili.txt
    const result = await runYtDlp(args, timeoutMs, isBili ? 'https://www.bilibili.com/' : '')
    const lines = (result.stdout || '').split('\n').filter(Boolean)
    return lines.map(line => {
      try {
        const info = JSON.parse(line)
        let thumbnail = info.thumbnail || ''
        if (!thumbnail && Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
          thumbnail = info.thumbnails[0].url || ''
        }
        return {
          id: info.id,
          title: info.title || info.fulltitle || '',
          thumbnail,
          duration: info.duration || 0,
          durationString: info.duration_string || '',
          uploader: info.uploader || '',
          webpageUrl: info.webpage_url || '',
          platform: info.extractor_key || '',
          uploaderUrl: (info.uploader_url || info.channel_url
            || (info.uploader_id ? `https://space.bilibili.com/${info.uploader_id}` : ''))
        }
      } catch {
        return null
      }
    }).filter(Boolean)
  } catch (err) {
    const isNetworkBlocked = err.stderr && (
      err.stderr.includes('Network is unreachable') ||
      err.stderr.includes('urlopen error')
    )
    if (isNetworkBlocked) {
      console.log(`[yt-dlp search] 搜索被墙: ${searchQuery}`)
    } else {
      console.error(`[yt-dlp search] 搜索失败: ${searchQuery}`, (err.stderr || err.message || '').substring(0, 300))
    }
    return []
  }
}

router.post('/ytdlp/search', async (req, res, next) => {
  try {
    if (!ytDlpAvailable) {
      return res.status(503).json({
        code: -1,
        message: 'yt-dlp 未安装或不可用'
      })
    }

    const { query, platform = 'bilibili', limit = 10 } = req.body
    if (!query || !query.trim()) {
      return res.status(400).json({ code: -1, message: '缺少搜索关键词' })
    }

    const trimmedQuery = query.trim()
    const maxLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 20)
    const searchPlatform = String(platform || 'bilibili')

    // ========== 缓存检查 ==========
    const cached = getCachedSearch(searchPlatform, trimmedQuery)
    if (cached) {
      return res.json({ code: 0, data: cached.data, cached: true })
    }

    console.log(`[yt-dlp search] query="${trimmedQuery}" platform="${searchPlatform}" limit=${maxLimit}`)

    // ========== 构建搜索任务 ==========
    const searchTasks = []

    switch (searchPlatform) {
      case 'douyin':
      case 'kuaishou':
      case 'haokan':
      case 'weishi':
        // 抖音/快手/好看/微视无名称搜索协议，返回空提示（前端已引导用户粘贴链接）
        return res.json({ code: 0, data: { query: trimmedQuery, platform: searchPlatform, total: 0, groupCount: 0, results: [], groups: [], ungrouped: [] }, cached: false })
      case 'bilibili':
      default:
        searchTasks.push({ label: 'Bilibili', searchQuery: `bilisearch${maxLimit}:${trimmedQuery}` })
        break
    }

    // ========== 并行执行搜索 ==========
    const settled = await Promise.allSettled(
      searchTasks.map(t => doSearch(t.searchQuery, searchTimeout))
    )

    // 合并去重
    const seenIds = new Set()
    const allResults = []
    for (let i = 0; i < settled.length; i++) {
      const s = settled[i]
      const label = searchTasks[i].label
      if (s.status === 'fulfilled' && s.value.length > 0) {
        const newOnes = []
        for (const r of s.value) {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id)
            newOnes.push(r)
          }
        }
        allResults.push(...newOnes)
        console.log(`[yt-dlp search] ${label}: ${s.value.length} 条, 去重后新增 ${newOnes.length} 条`)
      } else {
        console.log(`[yt-dlp search] ${label}: 无结果`)
      }
    }

    console.log(`[yt-dlp search] 合并去重后共 ${allResults.length} 条`)

    // 智能过滤和分组
    const { groups, ungrouped } = filterAndGroupResults(allResults)

    const responseData = {
      query: trimmedQuery,
      platform: searchPlatform,
      total: allResults.length,
      groupCount: groups.length,
      results: allResults,
      groups: groups.map(g => ({
        showName: g.showName,
        uploader: g.uploader,
        thumbnail: g.thumbnail,
        episodeCount: g.episodes.length,
        episodes: g.episodes
      })),
      ungrouped
    }

    // 缓存结果
    setCachedSearch(searchPlatform, trimmedQuery, { results: allResults, data: responseData })

    res.json({
      code: 0,
      data: responseData
    })
  } catch (err) {
    if (err.stderr) {
      console.error('[yt-dlp search error]', err.stderr.substring(0, 500))
      return res.status(400).json({
        code: -1,
        message: '搜索失败，请检查关键词或稍后重试',
        detail: err.stderr.substring(0, 300)
      })
    }
    if (err.killed || err.code === 'ETIMEDOUT') {
      return res.status(504).json({
        code: -1,
        message: '搜索超时，请稍后重试'
      })
    }
    next(err)
  }
})

/**
 * POST /video-parse/ytdlp/playlist
 * 提取B站合集/UP主空间/番剧页面的全部视频列表
 * Body: { url: "B站页面URL", limit?: 50 }
 * 返回: { code, data: { url, total, videos: [...] } }
 */
router.post('/ytdlp/playlist', async (req, res, next) => {
  try {
    if (!ytDlpAvailable) {
      return res.status(503).json({ code: -1, message: 'yt-dlp 未安装或不可用' })
    }

    const { url: pageUrl, limit = 50 } = req.body
    if (!pageUrl) {
      return res.status(400).json({ code: -1, message: '缺少页面URL' })
    }

    const maxVideos = Math.min(Math.max(1, parseInt(limit, 10) || 50), 100)

    // --flat-playlist: 快速提取播放列表（不下载每个视频详情）
    // --playlist-end N: 限制提取数量
    const { stdout } = await runYtDlp([
      '--dump-json',
      '--flat-playlist',
      '--playlist-end', String(maxVideos),
      '--no-check-certificate',
      pageUrl
    ], timeout * 2, pageUrl) // 播放列表可能需要更长时间

    const lines = stdout.split('\n').filter(Boolean)
    const videos = lines.map(line => {
      try {
        const info = JSON.parse(line)
        let thumbnail = info.thumbnail || ''
        if (!thumbnail && Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
          thumbnail = info.thumbnails[0].url || ''
        }
        return {
          id: info.id,
          title: info.title || info.fulltitle || '',
          thumbnail,
          duration: info.duration || 0,
          durationString: info.duration_string || '',
          uploader: info.uploader || '',
          webpageUrl: info.webpage_url || (info.id ? `https://www.bilibili.com/video/${info.id}` : ''),
          platform: info.extractor_key || '',
          playlistIndex: info.playlist_index || 0
        }
      } catch {
        return null
      }
    }).filter(Boolean)

    // 按播放列表索引排序
    videos.sort((a, b) => (a.playlistIndex || 0) - (b.playlistIndex || 0))

    res.json({
      code: 0,
      data: {
        url: pageUrl,
        total: videos.length,
        videos
      }
    })
  } catch (err) {
    if (err.stderr) {
      console.error('[yt-dlp playlist error]', err.stderr.substring(0, 500))
      return res.status(400).json({
        code: -1,
        message: '提取播放列表失败，请检查链接是否有效',
        detail: err.stderr.substring(0, 300)
      })
    }
    if (err.killed || err.code === 'ETIMEDOUT') {
      return res.status(504).json({ code: -1, message: '提取超时，请稍后重试' })
    }
    next(err)
  }
})

/**
 * GET /video-parse/ytdlp/image-proxy
 * 代理外部图片，解决防盗链问题
 * Query: ?url=encodeURIComponent(原图URL)&ref=encodeURIComponent(Referer)
 */
router.get('/ytdlp/image-proxy', async (req, res) => {
  try {
    const { url, ref } = req.query
    if (!url) return res.status(400).json({ code: -1, message: '缺少 url 参数' })

    const proxyUrl = decodeURIComponent(url)
    // 安全校验：只允许 http/https 协议
    if (!/^https?:\/\//i.test(proxyUrl)) {
      return res.status(400).json({ code: -1, message: '不支持的 URL 协议' })
    }

    // 根据图片域名自动选择 Referer
    let referer = ''
    if (ref) {
      referer = decodeURIComponent(ref)
    } else if (proxyUrl.includes('douban') || proxyUrl.includes('doubanio.com')) {
      referer = 'https://movie.douban.com/'
    }
    // TMDB 图片不需要特定 Referer，直接用空

    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
    if (referer) fetchHeaders['Referer'] = referer

    const response = await axios.get(proxyUrl, {
      responseType: 'arraybuffer',
      headers: fetchHeaders,
      timeout: 10000
    })

    const contentType = response.headers['content-type'] || 'image/jpeg'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(Buffer.from(response.data))
  } catch (e) {
    console.error('[image-proxy] 代理失败:', e.message)
    res.status(502).json({ code: -1, message: '图片加载失败' })
  }
})

/**
 * GET /video-parse/ytdlp/lyrics
 * 搜索歌词（LRC格式），支持按歌名+歌手查找
 * Query: ?title=歌名&artist=歌手（artist可选）
 * 返回：{ code:0, data:{ syncedLyrics:"[00:01.00]歌词行\n...", plainLyrics:"纯文本歌词" } }
 *
 * 增强：多轮尝试不同搜索词，提高儿童/哄睡歌曲命中率
 */
router.get('/ytdlp/lyrics', async (req, res) => {
  try {
    const { title, artist } = req.query
    if (!title) return res.status(400).json({ code: -1, message: '缺少 title 参数' })

    // 构建多轮搜索词（从精确→宽泛），前一轮无结果则尝试下一轮
    const searchQueries = [title]
    if (artist) searchQueries.push(`${title} ${artist}`)
    // 清洗常见视频标题标签（如 "【儿歌】"、"（完整版）" 等），提高匹配率
    const cleanedTitle = title.replace(/【[^】]*】|（[^）]*）|\([^)]*\)|\[[^\]]*\]|\s*-\s*(完整|高清|MV|官方).*/g, '').trim()
    if (cleanedTitle && cleanedTitle !== title) searchQueries.push(cleanedTitle)
    if (artist && cleanedTitle) searchQueries.push(`${cleanedTitle} ${artist}`)

    let bestResult = null
    for (const q of searchQueries) {
      try {
        const lyricsUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(q)}`
        const searchRes = await axios.get(lyricsUrl, {
          headers: { 'User-Agent': 'PersonalStaticStation/1.0' },
          timeout: 6000
        })
        const results = searchRes.data || []
        if (results.length > 0) {
          // 优先选有 syncedLyrics 的
          bestResult = results.find(r => r.syncedLyrics) || results[0]
          break
        }
      } catch (e) { /* 该轮搜索失败，继续下一轮 */ }
    }

    if (!bestResult) {
      return res.json({ code: 0, data: { syncedLyrics: '', plainLyrics: '', message: '未找到歌词' } })
    }

    let syncedLyrics = bestResult.syncedLyrics || ''
    let plainLyrics = bestResult.plainLyrics || ''

    // 如果没有同步歌词，尝试用id获取完整信息
    if (!syncedLyrics && bestResult.id) {
      try {
        const detailRes = await axios.get(`https://lrclib.net/api/get/${bestResult.id}`, {
          headers: { 'User-Agent': 'PersonalStaticStation/1.0' },
          timeout: 5000
        })
        syncedLyrics = detailRes.data?.syncedLyrics || ''
        plainLyrics = detailRes.data?.plainLyrics || plainLyrics
      } catch (e) { /* 忽略 */ }
    }

    // 仍无同步歌词但有纯文本 → 按行拆分并均匀分配时间轴，实现基础滚动
    if (!syncedLyrics && plainLyrics) {
      const plainLines = plainLyrics.split('\n').filter(l => l.trim())
      if (plainLines.length > 0) {
        // 假设总时长 180 秒（3分钟），均匀分配时间戳
        const DURATION = 180
        const interval = DURATION / plainLines.length
        syncedLyrics = plainLines.map((line, i) => {
          const t = i * interval
          const m = String(Math.floor(t / 60)).padStart(2, '0')
          const s = String(Math.floor(t % 60)).padStart(2, '0')
          return `[${m}:${s}.00]${line.trim()}`
        }).join('\n')
      }
    }

    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.json({ code: 0, data: { syncedLyrics, plainLyrics, title: bestResult.trackName, artist: bestResult.artistName } })
  } catch (e) {
    console.error('[lyrics] 搜索失败:', e.message)
    // 降级：返回空结果而不是报错
    res.json({ code: 0, data: { syncedLyrics: '', plainLyrics: '', message: '歌词服务暂不可用' } })
  }
})
// ==================== VIP视频 线路五（tv.chen-dong.com）代理 ====================

/**
 * GET /video-parse/proxy-search/line5
 * 代理线路五（tv.chen-dong.com）搜索请求
 * Query: ?keyword=视频名称
 * 返回: { code: 0, data: [{title, pic, type, desc, _sourceId, _sourceFlag, _flagName, _from}, ...] }
 * 注意：搜索结果不含播放URL，需通过 /video-parse/cd-play 端点解析播放地址
 */
router.get('/proxy-search/line5', async (req, res, next) => {
  try {
    const { keyword } = req.query
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ code: -1, message: '缺少搜索关键词 ?keyword=' })
    }

    const kw = keyword.trim()

    // 缓存检查
    const cached = getVipCachedSearch(5, kw)
    if (cached) {
      return res.json({ code: 0, data: cached, cached: true })
    }

    const ts = Date.now()
    const cbName = `cd_cb_${ts}`
    const targetUrl = `https://tv.chen-dong.com/api.php?out=jsonp&wd=${encodeURIComponent(kw)}&cb=${cbName}&_=${ts}`

    console.log(`[proxy line5] 代理请求: "${kw}"`)
    console.log(`[proxy line5] 目标URL: ${targetUrl}`)

    const response = await axios.get(targetUrl, {
      timeout: 15000,
      httpsAgent: insecureAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://tv.chen-dong.com/',
        'Origin': 'https://tv.chen-dong.com'
      }
    })

    // 提取 JSONP 响应中的 JSON 数据
    let jsonData = null
    const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

    console.log(`[proxy line5] 原始响应前500字符:`, text.substring(0, 500))

    // 尝试匹配 callback(JSON) 格式
    const jsonpRegex = new RegExp(cbName.replace(/\$/g, '\\$') + '\\s*\\(([\\s\\S]*)\\)\\s*;?\\s*$', 'i')
    const match = text.match(jsonpRegex)
    if (match) {
      try {
        jsonData = JSON.parse(match[1])
        console.log(`[proxy line5] JSONP 解析成功`)
      } catch (e) {
        console.error('[proxy line5] JSONP 匹配到但 JSON.parse 失败:', e.message)
      }
    }

    // 回退：尝试直接当 JSON 解析
    if (!jsonData) {
      try {
        jsonData = JSON.parse(text)
        console.log(`[proxy line5] 直接 JSON 解析成功`)
      } catch {
        console.error('[proxy line5] 无法解析响应:', text.substring(0, 300))
        return res.json({ code: 0, data: [], total: 0, message: '线路五搜索无结果' })
      }
    }

    let results = parseVipVideoResults(jsonData)
    console.log(`[proxy line5] 解析结果: ${results.length} 条`)

    // chen-dong API 返回的封面图通过 image-proxy 代理（避免防盗链）
    const IMG_PROXY = `/staticTool/api/video-parse/ytdlp/image-proxy`
    let directCoverCount = 0
    for (const r of results) {
      if (r.pic && /^https?:\/\//i.test(r.pic)) {
        r.pic = `${IMG_PROXY}?url=${encodeURIComponent(r.pic)}`
        directCoverCount++
      }
    }
    if (directCoverCount > 0) {
      console.log(`[proxy line5] 接口自带封面: ${directCoverCount}/${results.length} 条`)
    }

    // 回填封面：TMDB → 豆瓣（双源互补，并行搜索全部结果）
    await enrichPosters(results, 0, 'proxy line5')

    setVipCachedSearch(5, kw, results)

    res.json({ code: 0, data: results, total: results.length })
  } catch (err) {
    console.error('[proxy line5] 代理失败:', err.message)
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({ code: -1, message: '线路五搜索超时，请重试' })
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(502).json({ code: -1, message: '线路五接口暂时不可用' })
    }
    next(err)
  }
})

/**
 * GET /video-parse/proxy-search/line6
 * 代理线路六（4kcz.com 厂长资源）搜索请求（HTML 解析）
 * Query: ?keyword=视频名称
 * 返回: { code: 0, data: [{title, pic, type, desc, url}, ...] }
 */
router.get('/proxy-search/line6', async (req, res, next) => {
  try {
    const { keyword } = req.query
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ code: -1, message: '缺少搜索关键词 ?keyword=' })
    }

    const kw = keyword.trim()

    // 缓存检查
    const cached = getVipCachedSearch(6, kw)
    if (cached) {
      return res.json({ code: 0, data: cached, cached: true })
    }

    const targetUrl = `https://www.4kcz.com/boss1O1?q=${encodeURIComponent(kw)}`
    console.log(`[proxy line6] 代理请求: "${kw}" → ${targetUrl}`)

    const response = await axios.get(targetUrl, {
      timeout: 15000,
      responseType: 'text',
      httpsAgent: insecureAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://www.4kcz.com/'
      }
    })

    const html = typeof response.data === 'string' ? response.data : String(response.data)
    console.log(`[proxy line6] HTML 响应长度: ${html.length}`)

    // 解析搜索结果：每项格式为 <li><a href="..."><img src="..." alt="标题"></a><h3 class="dytit"><a>标题</a></h3>...</li>
    const results = []
    const liRegex = /<li>\s*<a\s+href="([^"]*)"[^>]*>\s*<img\s+src="([^"]*)"\s+alt="([^"]*)"[^>]*>\s*<\/a>\s*<h3[^>]*><a[^>]*>([^<]*)<\/a>\s*<\/h3>/gi
    let match
    while ((match = liRegex.exec(html)) !== null) {
      const [_, href, pic, imgAlt, titleText] = match
      const title = (titleText || imgAlt || '').trim()
      if (!title) continue

      // 拼接完整 URL
      const detailUrl = href.startsWith('http') ? href : `https://www.4kcz.com${href.startsWith('/') ? '' : '/'}${href}`

      results.push({
        title,
        pic: (pic && /^https?:\/\//i.test(pic)) ? pic : '',
        type: '',
        desc: '来源：厂长资源',
        url: detailUrl
      })
    }

    console.log(`[proxy line6] 解析结果: ${results.length} 条`)
    if (results.length === 0) {
      return res.json({ code: 0, data: [], total: 0, message: '未找到相关视频' })
    }

    // 封面走 image-proxy 代理（避免百度/腾讯图片防盗链）
    const IMG_PROXY = `/staticTool/api/video-parse/ytdlp/image-proxy`
    for (const r of results) {
      if (r.pic && /^https?:\/\//i.test(r.pic)) {
        r.pic = `${IMG_PROXY}?url=${encodeURIComponent(r.pic)}`
      }
    }

    // 回填封面：TMDB → 豆瓣（双源互补，无封面的前5条搜索）
    await enrichPosters(results, 5, 'proxy line6')

    setVipCachedSearch(6, kw, results)
    res.json({ code: 0, data: results, total: results.length })
  } catch (err) {
    console.error('[proxy line6] 代理失败:', err.message)
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({ code: -1, message: '线路六搜索超时，请重试' })
    }
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
      return res.status(502).json({ code: -1, message: '线路六接口暂时不可用' })
    }
    next(err)
  }
})

/**
 * GET /video-parse/cd-play?id=88295&flag=0
 * 解析线路五（tv.chen-dong.com）视频的播放地址
 * 返回: { code, data: { url, title, pic, episodes: [{name, url}] } }
 * 
 * chen-dong 播放API返回JSONP格式:
 * { success, code, url: "m3u8地址", pic, title, info: [{video: ["第01集$url$", ...]}] }
 */
router.get('/cd-play', async (req, res, next) => {
  try {
    const { id, flag } = req.query
    if (!id || flag === undefined) {
      return res.status(400).json({ code: -1, message: '缺少参数 ?id=视频ID&flag=线路标识' })
    }

    const ts = Date.now()
    const cbName = `cd_play_${ts}`
    const targetUrl = `https://tv.chen-dong.com/api.php?out=jsonp&flag=${flag}&id=${id}&cb=${cbName}&_=${ts}`

    console.log(`[cd-play] 解析播放地址: id=${id}, flag=${flag}`)

    const response = await axios.get(targetUrl, {
      timeout: 15000,
      httpsAgent: insecureAgent,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Referer': 'https://tv.chen-dong.com/',
        'Origin': 'https://tv.chen-dong.com'
      }
    })

    const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data)

    // 提取 JSONP
    let jsonData = null
    const jsonpRegex = new RegExp(cbName.replace(/\$/g, '\\$') + '\\s*\\(([\\s\\S]*)\\)\\s*;?\\s*$', 'i')
    const match = text.match(jsonpRegex)
    if (match) {
      try {
        jsonData = JSON.parse(match[1])
      } catch { /* fallback below */ }
    }
    if (!jsonData) {
      try { jsonData = JSON.parse(text) } catch {
        console.error('[cd-play] 无法解析响应:', text.substring(0, 300))
        return res.status(502).json({ code: -1, message: '线路五解析失败，无法获取播放地址' })
      }
    }

    if (!jsonData.success || !jsonData.url) {
      console.error('[cd-play] API 返回异常:', JSON.stringify(jsonData).substring(0, 300))
      return res.status(502).json({ code: -1, message: '线路五解析失败，该资源暂无播放地址' })
    }

    // 提取播放列表
    const m3u8Url = jsonData.url
    const title = jsonData.title || ''
    const pic = jsonData.pic || ''

    // 解析剧集列表: "第01集$https://...index.m3u8$"
    const episodes = []
    if (jsonData.info && Array.isArray(jsonData.info)) {
      for (const info of jsonData.info) {
        if (info.video && Array.isArray(info.video)) {
          for (const item of info.video) {
            // 格式: "第01集$https://vod1.maowushi.com/.../index.m3u8$"
            const parts = item.split('$')
            if (parts.length >= 2) {
              episodes.push({
                name: parts[0] || `第${episodes.length + 1}集`,
                url: parts[1]
              })
            }
          }
        }
      }
    }

    console.log(`[cd-play] 解析完成: "${title}", ${episodes.length} 集, m3u8=${m3u8Url.substring(0, 80)}...`)

    res.json({
      code: 0,
      data: {
        url: m3u8Url,
        title,
        pic,
        episodes
      }
    })
  } catch (err) {
    console.error('[cd-play] 代理失败:', err.message)
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return res.status(504).json({ code: -1, message: '线路五播放解析超时，请重试' })
    }
    next(err)
  }
})

// ==================== HLS 流转发代理 ====================

/**
 * GET /video-parse/hls-proxy
 * 代理 HLS 子播放列表（m3u8），重写内部所有资源 URL 再次走本代理
 * Query: ?url=encodeURIComponent(原始m3u8地址)
 */
router.get('/hls-proxy', async (req, res) => {
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({ code: -1, message: '缺少 url 参数' })
    }

    const targetUrl = decodeURIComponent(url)
    if (!/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).json({ code: -1, message: '不支持的 URL 协议' })
    }

    console.log(`[hls-proxy] 代理 m3u8: ${targetUrl.substring(0, 100)}`)

    const response = await axios.get(targetUrl, {
      responseType: 'text',
      timeout: 15000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': new URL(targetUrl).origin + '/',
        'Origin': new URL(targetUrl).origin
      },
      httpsAgent: insecureAgent
    })

    let m3u8Content = response.data
    if (typeof m3u8Content !== 'string') {
      m3u8Content = String(m3u8Content)
    }

    // 使用站点相对路径，本地走 Vite proxy，线上走 nginx proxy
    const segProxyBase = `/staticTool/api/video-parse/hls-segment?url=`
    const playlistProxyBase = `/staticTool/api/video-parse/hls-proxy?url=`

    function resolveAbsUrl(uri) {
      try {
        return new URL(uri, targetUrl).href
      } catch {
        return uri
      }
    }

    const lines = m3u8Content.split('\n')
    const rewritten = lines.map(line => {
      const trimmed = line.trim()

      // EXT-X-KEY:重写密钥 URI
      if (trimmed.startsWith('#EXT-X-KEY') && trimmed.includes('URI=')) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
          return `URI="${segProxyBase}${encodeURIComponent(resolveAbsUrl(uri))}"`
        }).replace(/URI=(?!")/g, (match) => {
          const rest = trimmed.substring(trimmed.indexOf('URI=') + 4)
          const uri = rest.split(',')[0].trim()
          if (!uri || uri.startsWith('"')) return match
          return `URI="${segProxyBase}${encodeURIComponent(resolveAbsUrl(uri))}"`
        })
      }

      // EXT-X-MAP:重写 fmp4 初始化段 URI
      if (trimmed.startsWith('#EXT-X-MAP') && trimmed.includes('URI=')) {
        return trimmed.replace(/URI="([^"]+)"/g, (match, uri) => {
          return `URI="${segProxyBase}${encodeURIComponent(resolveAbsUrl(uri))}"`
        })
      }

      if (!trimmed || trimmed.startsWith('#')) return line

      const absoluteUrl = resolveAbsUrl(trimmed)
      const isPlaylist = /\.m3u8(\?|$)/i.test(absoluteUrl)
      const proxyBase = isPlaylist ? playlistProxyBase : segProxyBase
      return `${proxyBase}${encodeURIComponent(absoluteUrl)}`
    })

    res.set({
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    })
    res.send(rewritten.join('\n'))
  } catch (err) {
    console.error('[hls-proxy] 代理失败:', err.message)
    if (!res.headersSent) {
      res.status(502).json({ code: -1, message: 'HLS 代理失败: ' + err.message })
    }
  }
})

/**
 * GET /video-parse/hls-segment
 * 代理 HLS 分片（.ts / .m4s / .key 等二进制资源）
 * Query: ?url=encodeURIComponent(原始分片URL)
 */
router.get('/hls-segment', async (req, res) => {
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({ code: -1, message: '缺少 url 参数' })
    }

    const targetUrl = decodeURIComponent(url)
    if (!/^https?:\/\//i.test(targetUrl)) {
      return res.status(400).json({ code: -1, message: '不支持的 URL 协议' })
    }

    // 安全网：如果意外请求了 .m3u8 播放列表，按文本获取并返回（不走 stream 避免 500）
    const isPlaylist = /\.m3u8(\?|$)/i.test(targetUrl)
    const responseType = isPlaylist ? 'text' : 'stream'

    const response = await axios.get(targetUrl, {
      responseType,
      timeout: 30000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Referer': new URL(targetUrl).origin + '/',
        'Origin': new URL(targetUrl).origin
      },
      httpsAgent: insecureAgent
    })

    if (isPlaylist) {
      console.log(`[hls-segment] 检测到 .m3u8 意外请求，按文本返回: ${targetUrl.substring(0, 80)}`)
      res.set({
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache'
      })
      // 不重写内部 URL（上游 hls-proxy 已经处理过），直接返回原始内容
      res.send(response.data)
      return
    }

    const ct = response.headers['content-type'] || 'video/mp2t'
    res.set({
      'Content-Type': ct,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'bytes'
    })
    response.data.pipe(res)
  } catch (err) {
    console.error('[hls-segment] 代理失败:', err.message)
    if (!res.headersSent) {
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.status(502).json({ code: -1, message: '分片代理失败: ' + err.message })
    }
  }
})

// ==================== 网页标题抓取 ====================
// GET /video-parse/page-title?url=xxx
// 用于从第三方视频页面 URL 提取真实的视频标题
router.get('/page-title', async (req, res) => {
  let title = ''
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({ code: -1, message: '缺少 url 参数' })
    }

    // 策略0：优先通过 dmku.hls.one 等第三方信息接口获取标题（精确到剧集名）
    const dmkuTitle = await extractTitleFromDmku(url)
    if (dmkuTitle) {
      title = dmkuTitle
    }

    // 策略1-3：网页 HTML 抓取
    if (!title) {
      try {
        const response = await axios.get(url, {
          timeout: 8000,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml',
            'Accept-Language': 'zh-CN,zh;q=0.9'
          },
          maxRedirects: 5,
          httpsAgent: insecureAgent
        })
        const html = typeof response.data === 'string' ? response.data : String(response.data)

        // og:title
        const ogTitleMatch = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]*)"/i)
            || html.match(/<meta[^>]+content="([^"]*)"[^>]+property="og:title"/i)
        if (ogTitleMatch) title = ogTitleMatch[1]

        // <title> 标签
        if (!title) {
          const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
          if (titleMatch) title = titleMatch[1].replace(/[\r\n\t\s]+/g, ' ').trim()
        }

        // h1
        if (!title) {
          const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
          if (h1Match) title = h1Match[1].replace(/<[^>]+>/g, '').replace(/[\r\n\t\s]+/g, ' ').trim()
        }

        // 常见后缀清理
        title = title.replace(/\s*[-–—|_]\s*(腾讯视频|爱奇艺|优酷|芒果TV|哔哩哔哩|bilibili|YouTube).*$/i, '').trim()
      } catch {
        // HTML 抓取失败不影响，继续走兜底
      }
    }

    if (!title) {
      title = extractTitleFromUrl(url)
    }

    res.setHeader('Access-Control-Allow-Origin', '*')
    res.json({ code: 0, data: { title } })
  } catch (err) {
    const fallbackTitle = extractTitleFromUrl(req.query.url || '')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.json({ code: 0, data: { title: fallbackTitle } })
  }
})

// 通过 dmku.hls.one 等接口提取精确标题（剧名 => 集数）
async function extractTitleFromDmku(videoUrl) {
  try {
    const dmkuUrl = `https://dmku.hls.one/?ac=list&url=${encodeURIComponent(videoUrl)}`
    const res = await axios.get(dmkuUrl, {
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      httpsAgent: insecureAgent
    })
    const data = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
    if (data?.vod_code === 200 && data.vod_title) {
      // 尝试匹配当前播集名
      const episodeName = data.vod_episodes?.find(ep => ep.url === videoUrl)?.name
          || data.vod_episodes?.find(ep => videoUrl.includes(ep.url?.split('/').pop()?.split('.')[0]))?.name
      if (episodeName) {
        return `${data.vod_title} ${episodeName}`
      }
      return data.vod_title
    }
    return null
  } catch {
    return null
  }
}

// 从 URL 提取兜底标题
function extractTitleFromUrl(url) {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const parts = u.pathname.split('/').filter(Boolean)
    if (parts.length > 0) {
      const last = parts[parts.length - 1].replace(/\.(html?|php|aspx?|jsp)$/, '')
      return last.length > 2 ? last : host
    }
    return host
  } catch {
    return (url || '').substring(0, 30)
  }
}

export default router
