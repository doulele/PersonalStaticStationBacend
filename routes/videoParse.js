import { Router } from 'express'
import axios from 'axios'

const router = Router()

// ==================== 解析接口池 ====================
// 每个接口有 name（名称）、api（接口地址模板，用 {url} 占位）、timeout（超时ms）
const PARSE_APIS = [
  { name: '线路一', api: 'https://jx.m3u8.tv/jiexi/?url={url}', timeout: 15000 },
  { name: '线路二', api: 'https://vip.bljiex.com/?v={url}', timeout: 15000 },
  { name: '线路三', api: 'https://jx.618g.com/?url={url}', timeout: 15000 },
  { name: '线路四', api: 'https://z1.m1907.top/?jx={url}', timeout: 15000 },
  { name: '线路五', api: 'https://jx.playerjx.com/?url={url}', timeout: 15000 },
  { name: '线路六', api: 'https://jx.nnxv.cn/tv.php?url={url}', timeout: 15000 },
  { name: '线路七', api: 'https://www.8090g.cn/jiexi/?url={url}', timeout: 15000 },
  { name: '线路八', api: 'https://www.playm3u8.cn/jiexi.php?url={url}', timeout: 15000 }
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

export default router
