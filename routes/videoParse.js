import { Router } from 'express'
import axios from 'axios'
import { execFile, exec } from 'child_process'
import { promisify } from 'util'
import config from '../config/index.js'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)

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

// ==================== yt-dlp 集成 ====================

const { binPath, timeout, cookieFile, proxy, verbose } = config.ytDlp || {}

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
async function runYtDlp(args, maxTimeout = timeout) {
  const finalArgs = [...args]
  if (proxy) {
    finalArgs.unshift('--proxy', proxy)
  }
  if (cookieFile) {
    finalArgs.unshift('--cookies', cookieFile)
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

    const { url: videoUrl } = req.body
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '缺少视频链接' })
    }

    // -j: 输出 JSON 信息
    // --no-playlist: 不下载整个播放列表
    // --no-check-certificate: 忽略 SSL 证书
    const { stdout } = await runYtDlp([
      '-j',
      '--no-playlist',
      '--no-check-certificate',
      videoUrl
    ], timeout)

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

    const { url: videoUrl, formatId = 'best' } = req.body
    if (!videoUrl) {
      return res.status(400).json({ code: -1, message: '缺少视频链接' })
    }

    // -g: 获取直接流地址（不下载）
    // -f: 指定格式
    const { stdout } = await runYtDlp([
      '-f', formatId,
      '-g',
      '--no-playlist',
      '--no-check-certificate',
      videoUrl
    ], timeout)

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

    res.json({
      code: 0,
      data: {
        url: streamUrl,
        formatId,
        type: streamType,
        audioUrl: lines[1] || null  // 单独的音频流（如果有）
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
    const result = await runYtDlp(args, timeoutMs)
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

    const { query, platform = 'auto', limit = 10 } = req.body
    if (!query || !query.trim()) {
      return res.status(400).json({ code: -1, message: '缺少搜索关键词' })
    }

    const trimmedQuery = query.trim()
    const maxLimit = Math.min(Math.max(1, parseInt(limit, 10) || 10), 30)

    console.log(`[yt-dlp search] query="${trimmedQuery}" platform="${platform}" limit=${limit} maxLimit=${maxLimit}`)

    // 构建搜索任务列表
    const searchTasks = []

    if (platform === 'youtube') {
      // 仅 YouTube
      searchTasks.push({
        label: 'YouTube',
        searchQuery: `ytsearch${maxLimit}:${trimmedQuery}`
      })
    } else if (platform === 'bilibili') {
      // 仅 Bilibili
      searchTasks.push({
        label: 'Bilibili',
        searchQuery: `bilisearch${maxLimit}:${trimmedQuery}`
      })
    } else {
      // auto / 其他平台：多平台并行搜索
      searchTasks.push({
        label: 'Bilibili',
        searchQuery: `bilisearch${maxLimit}:${trimmedQuery}`
      })
      searchTasks.push({
        label: 'YouTube',
        searchQuery: `ytsearch${maxLimit}:${trimmedQuery}`
      })
      // 如果是中文影视查询，追加"电视剧 全集"搜索
      if (isMediaQuery(trimmedQuery)) {
        const enhancedQuery = `${trimmedQuery} 电视剧 全集`
        searchTasks.push({
          label: 'Bilibili+',
          searchQuery: `bilisearch${maxLimit}:${enhancedQuery}`
        })
        searchTasks.push({
          label: 'YouTube+',
          searchQuery: `ytsearch${maxLimit}:${enhancedQuery}`
        })
      }
    }

    console.log(`[yt-dlp search] 共 ${searchTasks.length} 个搜索任务: ${searchTasks.map(t => t.label).join(', ')}`)

    // 并行执行所有搜索
    const settled = await Promise.allSettled(
      searchTasks.map(t => doSearch(t.searchQuery, timeout))
    )

    // 合并结果并去重（按 video id）
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

    // 如果过滤后有效内容太少（<3条），尝试用增强关键词再搜
    const totalValid = groups.reduce((sum, g) => sum + g.episodes.length, 0) + ungrouped.length
    if (totalValid < 3 && isMediaQuery(trimmedQuery) && platform !== 'bilibili' && platform !== 'youtube') {
      console.log(`[yt-dlp search] 有效内容太少(${totalValid}条)，使用增强关键词重试`)

      const retryQuery = `${trimmedQuery} 电视剧`
      const retryTasks = [
        { label: 'Retry-Bilibili', searchQuery: `bilisearch${maxLimit}:${retryQuery}` },
        { label: 'Retry-YouTube', searchQuery: `ytsearch${maxLimit}:${retryQuery}` }
      ]

      const retrySettled = await Promise.allSettled(
        retryTasks.map(t => doSearch(t.searchQuery, timeout))
      )

      for (let i = 0; i < retrySettled.length; i++) {
        const s = retrySettled[i]
        const label = retryTasks[i].label
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
        }
      }
    }

    // 最终过滤分组
    const finalResult = filterAndGroupResults(allResults)

    res.json({
      code: 0,
      data: {
        query: trimmedQuery,
        platform,
        total: allResults.length,
        filteredCount: allResults.length,
        groupCount: finalResult.groups.length,
        results: allResults,
        groups: finalResult.groups.map(g => ({
          showName: g.showName,
          uploader: g.uploader,
          thumbnail: g.thumbnail,
          episodeCount: g.episodes.length,
          episodes: g.episodes
        })),
        ungrouped: finalResult.ungrouped
      }
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
    ], timeout * 2) // 播放列表可能需要更长时间

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

export default router
