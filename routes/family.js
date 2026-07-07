import { Router } from 'express'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import crypto from 'crypto'
import http from 'http'
import https from 'https'
import WebSocket from 'ws'
import config from '../config/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DATA_PATH = join(__dirname, '..', 'data', 'sleep-content.json')
const VOICES_STORE_PATH = join(__dirname, '..', 'data', 'custom-voices.json')

// ==================== 音色配置 ====================

// Qwen3-TTS 预置音色（仅用于语音克隆合成）
const QWEN3_VOICES = [
  { id: 'cherry', label: '御姐 Cherry', gender: 'female', desc: '成熟温暖', type: 'preset' },
  { id: 'stella', label: '知性 Stella', gender: 'female', desc: '温柔知性', type: 'preset' },
  { id: 'bella', label: '甜美 Bella', gender: 'female', desc: '甜美活泼', type: 'preset' },
  { id: 'luna', label: '少女 Luna', gender: 'female', desc: '清纯少女', type: 'preset' },
  { id: 'peter', label: '少年 Peter', gender: 'male', desc: '阳光少年', type: 'preset' },
  { id: 'eric', label: '温柔 Eric', gender: 'male', desc: '温柔男声', type: 'preset' },
  { id: 'brian', label: '沉稳 Brian', gender: 'male', desc: '低沉磁性', type: 'preset' }
]

// Edge TTS 免费微软音色（日常朗读使用，来自微软官方在线列表）
const EDGE_VOICES = [
  { id: 'zh-CN-XiaoxiaoNeural', label: '晓晓', gender: 'female', desc: '活泼温暖', type: 'preset' },
  { id: 'zh-CN-XiaoyiNeural', label: '晓依', gender: 'female', desc: '甜美可爱', type: 'preset' },
  { id: 'zh-CN-YunxiaNeural', label: '云夏', gender: 'male', desc: '可爱少年', type: 'preset' },
  { id: 'zh-CN-YunxiNeural', label: '云希', gender: 'male', desc: '阳光少年', type: 'preset' },
  { id: 'zh-CN-YunyangNeural', label: '云扬', gender: 'male', desc: '温暖男声', type: 'preset' },
  { id: 'zh-CN-YunjianNeural', label: '云健', gender: 'male', desc: '沉稳磁性', type: 'preset' },
  { id: 'zh-CN-liaoning-XiaobeiNeural', label: '晓北', gender: 'female', desc: '东北方言', type: 'preset' },
  { id: 'zh-CN-shaanxi-XiaoniNeural', label: '晓妮', gender: 'female', desc: '陕西方言', type: 'preset' },
  { id: 'zh-HK-HiuGaaiNeural', label: '曉佳', gender: 'female', desc: '粤语女声', type: 'preset' },
  { id: 'zh-HK-HiuMaanNeural', label: '曉曼', gender: 'female', desc: '粤语女声', type: 'preset' },
  { id: 'zh-HK-WanLungNeural', label: '雲龍', gender: 'male', desc: '粤语男声', type: 'preset' },
  { id: 'zh-TW-HsiaoChenNeural', label: '曉臻', gender: 'female', desc: '台湾国语', type: 'preset' },
  { id: 'zh-TW-HsiaoYuNeural', label: '曉雨', gender: 'female', desc: '台湾国语', type: 'preset' },
  { id: 'zh-TW-YunJheNeural', label: '雲哲', gender: 'male', desc: '台湾国语', type: 'preset' }
]

// 前端旧 ID → Edge TTS 音色映射（兼容过渡）
const VOICE_ID_TO_EDGE = {
  cherry: 'zh-CN-XiaoxiaoNeural',
  stella: 'zh-CN-XiaoruiNeural',
  bella: 'zh-CN-XiaoyiNeural',
  luna: 'zh-CN-XiaoshuangNeural',
  peter: 'zh-CN-YunxiNeural',
  eric: 'zh-CN-YunyangNeural',
  brian: 'zh-CN-YunjianNeural'
}

// 用户自定义音色存储
function loadCustomVoices() {
  try {
    if (existsSync(VOICES_STORE_PATH)) {
      return JSON.parse(readFileSync(VOICES_STORE_PATH, 'utf-8'))
    }
  } catch (e) { console.error('[family] 读取自定义音色失败:', e) }
  return []
}

function saveCustomVoices(voices) {
  try {
    mkdirSync(dirname(VOICES_STORE_PATH), { recursive: true })
    writeFileSync(VOICES_STORE_PATH, JSON.stringify(voices, null, 2), 'utf-8')
  } catch (e) { console.error('[family] 保存自定义音色失败:', e) }
}

// ==================== 工具函数 ====================

// 发送 HTTPS POST 请求到 DashScope
function dashscopePost(hostname, path, body, apiKey) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify(body)
    const options = {
      hostname,
      port: 443,
      path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }
    const req = https.request(options, (resp) => {
      let data = ''
      resp.on('data', chunk => { data += chunk })
      resp.on('end', () => {
        try {
          resolve({ status: resp.statusCode, body: JSON.parse(data) })
        } catch (e) {
          resolve({ status: resp.statusCode, body: data, parseError: true })
        }
      })
    })
    req.on('error', (e) => reject(e))
    req.write(postData)
    req.end()
  })
}

// 从 URL 下载音频并转为 base64（支持 http 和 https）
function downloadAudioAsBase64(url) {
  return new Promise((resolve, reject) => {
    const isHttps = url.startsWith('https://')
    const client = isHttps ? https : http
    client.get(url, (resp) => {
      // 处理重定向
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        return downloadAudioAsBase64(resp.headers.location).then(resolve).catch(reject)
      }
      const chunks = []
      resp.on('data', chunk => chunks.push(chunk))
      resp.on('end', () => {
        const buffer = Buffer.concat(chunks)
        resolve(buffer.toString('base64'))
      })
      resp.on('error', reject)
    }).on('error', reject)
  })
}

// ==================== Edge TTS 免费语音合成 ====================

// ==================== Edge TTS DRM ====================

const WIN_EPOCH = 11644473600 // 1601-01-01 到 1970-01-01 的秒数差
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const SEC_MS_GEC_VERSION = '1-143.0.3650.75'
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'

/** 生成 Sec-MS-GEC 令牌：SHA256(5分钟粒度Windows文件时间 + TrustedClientToken) */
function generateSecMsGec() {
  const nowSec = Math.floor(Date.now() / 1000)
  let ticks = nowSec + WIN_EPOCH
  ticks = ticks - (ticks % 300) // 向下取整到5分钟
  const windowsTicks = Math.floor(ticks * 10_000_000) // 转换为100纳秒单位
  return crypto.createHash('sha256')
    .update(`${windowsTicks}${TRUSTED_CLIENT_TOKEN}`)
    .digest('hex')
    .toUpperCase()
}

/** 生成随机设备标识符 */
function generateMuid() {
  return crypto.randomBytes(16).toString('hex').toUpperCase()
}

/** 生成符合 Python date_to_string() 格式的时间戳（无逗号） */
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function dateToString() {
  const d = new Date()
  const day = DAY_NAMES[d.getUTCDay()]
  const mon = MONTH_NAMES[d.getUTCMonth()]
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const yyyy = d.getUTCFullYear()
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${day} ${mon} ${dd} ${yyyy} ${hh}:${mm}:${ss} GMT+0000 (Coordinated Universal Time)`
}

// ==================== Edge TTS 合成 ====================

/**
 * 通过微软 Edge TTS WebSocket 免费合成语音
 * @param {string} text - 朗读文本
 * @param {string} voice - 音色 ID，如 zh-CN-XiaoxiaoNeural
 * @param {string} rateStr - 语速，如 "+20%" / "-30%" / "+0%"
 * @returns {Promise<string>} base64 编码的 mp3 音频
 */
function edgeTtsPromise(text, voice = 'zh-CN-XiaoxiaoNeural', rateStr = '+0%') {
  return new Promise((resolve, reject) => {
    const connectionId = crypto.randomUUID().replace(/-/g, '')
    const secMsGec = generateSecMsGec()
    const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`

    const ws = new WebSocket(wsUrl, {
      headers: {
        'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': EDGE_UA,
        'Cookie': `muid=${generateMuid()};`
      }
    })

    const audioChunks = []

    ws.on('open', () => {
      // 发送音频格式配置
      const configMsg = JSON.stringify({
        context: {
          synthesis: {
            audio: {
              metadataoptions: {
                sentenceBoundaryEnabled: false,
                wordBoundaryEnabled: false
              },
              outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
            }
          }
        }
      })

      const now = dateToString()
      ws.send(`X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${configMsg}`)

      // 发送 SSML（带语速控制）
      const escapedText = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')

      // 根据音色 ID 提取 lang（如 zh-CN-XiaoxiaoNeural → zh-CN, zh-HK-HiuGaaiNeural → zh-HK）
      const voiceParts = voice.split('-')
      const lang = voiceParts.slice(0, -1).join('-')

      const ssml = `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xmlns:mstts="https://www.w3.org/2001/mstts" xml:lang="${lang}">
        <voice name="${voice}">
          <prosody rate="${rateStr}" pitch="+0Hz">
            ${escapedText}
          </prosody>
        </voice>
      </speak>`

      const rid = crypto.randomUUID().replace(/-/g, '')
      const ssmlTimestamp = now + 'Z'
      ws.send(`X-RequestId:${rid}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ssmlTimestamp}\r\nPath:ssml\r\n\r\n${ssml}`)
    })

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        try {
          // 新协议：前2字节为头部长度（big-endian uint16），之后是\r\n分隔的头部，最后是音频数据
          if (data.length < 2) return
          const headerLength = (data[0] << 8) | data[1]
          const offset = 2 + headerLength
          if (offset < data.length) {
            const audioData = data.subarray(offset)
            if (audioData.length > 0) {
              audioChunks.push(audioData)
            }
          }
        } catch {
          // 降级：尝试旧协议的 Path:audio 解析
          const separator = Buffer.from('Path:audio\r\n')
          const idx = data.indexOf(separator)
          if (idx !== -1) {
            const audioData = data.subarray(idx + separator.length)
            if (audioData.length > 0) {
              audioChunks.push(audioData)
            }
          }
        }
      } else {
        // 文本消息（turn.start / audio.metadata / turn.end / 错误信息）
        const msg = data.toString()
        if (msg.includes('Path:')) {
          const pathMatch = msg.match(/Path:(\S+)/)
          const path = pathMatch ? pathMatch[1] : '?'
          if (path === 'turn.end') {
            console.log('[family/tts/edge] 合成完成，关闭连接')
            ws.close()
          }
        }
      }
    })

    ws.on('close', (code) => {
      console.log(`[family/tts/edge] WebSocket 关闭, code=${code}, audioChunks=${audioChunks.length}`)
      if (audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks).toString('base64'))
      } else {
        reject(new Error('未收到 Edge TTS 音频数据'))
      }
    })

    ws.on('error', reject)

    // 30 秒超时
    setTimeout(() => {
      try { ws.close() } catch (e) {}
      reject(new Error('Edge TTS 请求超时'))
    }, 30000)
  })
}

// ==================== 睡眠内容 API ====================

// 允许的 category 值
const VALID_CATEGORIES = ['whitenoise', 'classics', 'story', 'fable', 'lullaby', 'poetry']

const router = Router()

// ==================== 睡眠内容 API ====================

/**
 * 获取睡眠内容数据
 * GET /family/sleep-content?category=whitenoise|classics|story|fable|lullaby|poetry|all
 */
router.get('/sleep-content', (req, res) => {
  try {
    const { category } = req.query

    if (!existsSync(DATA_PATH)) {
      return res.status(404).json({ success: false, error: '数据文件不存在，请稍后重试' })
    }

    const rawData = readFileSync(DATA_PATH, 'utf-8')
    const allData = JSON.parse(rawData)

    if (!category || category === 'all') {
      return res.json({ success: true, data: allData })
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `无效的分类参数，支持: ${VALID_CATEGORIES.join(', ')}`
      })
    }

    return res.json({
      success: true,
      data: {
        [category]: allData[category] || []
      }
    })
  } catch (err) {
    console.error('[family] 获取睡眠内容失败:', err)
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/**
 * 新增睡眠内容
 * POST /family/sleep-content
 * Body: { category, title, content, author/artist?, dynasty?, type?, color?, audio_url? }
 */
router.post('/sleep-content', (req, res) => {
  try {
    const { category } = req.body
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `无效的分类: ${category}` })
    }
    const allData = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    const list = allData[category] || []
    const maxId = list.reduce((max, item) => {
      const num = Number(item.id)
      return isNaN(num) ? max : Math.max(max, num)
    }, 0)
    const newItem = buildSleepItem(category, req.body, maxId + 1)
    list.push(newItem)
    writeFileSync(DATA_PATH, JSON.stringify(allData, null, 2), 'utf-8')
    return res.json({ success: true, data: newItem })
  } catch (err) {
    console.error('[family] 新增睡眠内容失败:', err)
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/** 解析前端传入的 id，去除分类前缀（如 lullaby-1 → 1） */
function parseRawId(idStr) {
  const stripped = String(idStr).includes('-') ? String(idStr).split('-').slice(1).join('-') : String(idStr)
  const num = Number(stripped)
  return isNaN(num) ? stripped : num
}

/** 根据分类构建 item 对象 */
function buildSleepItem(category, body, newId) {
  const base = { id: newId }
  if (category === 'whitenoise') {
    Object.assign(base, { id: body.title || body.id || String(newId), label: body.title || '', type: body.type || '', color: body.color || 'default' })
  } else {
    base.title = body.title || ''
    base.content = body.content || ''
    if (body.author) base.author = body.author
    if (body.artist) base.artist = body.artist
    if (body.source) base.source = body.source
    if (body.dynasty) base.dynasty = body.dynasty
    if (body.type) base.type = body.type
    if (category === 'lullaby') base.audio_url = body.audio_url || ''
    base.stars = body.stars || 4
    base.reason = body.reason || ''
  }
  return base
}

/**
 * 更新睡眠内容
 * PUT /family/sleep-content/:id
 * Body: { category, title, content, ... }
 */
router.put('/sleep-content/:id', (req, res) => {
  try {
    const { category } = req.body
    const rawId = parseRawId(req.params.id)
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `无效的分类: ${category}` })
    }
    const allData = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    const list = allData[category]
    if (!list) return res.status(404).json({ success: false, error: '分类不存在' })
    const idx = list.findIndex(item => item.id == rawId || String(item.id) === String(rawId))
    if (idx === -1) return res.status(404).json({ success: false, error: '内容不存在' })
    const updated = updateSleepItem(category, list[idx], req.body)
    list[idx] = updated
    writeFileSync(DATA_PATH, JSON.stringify(allData, null, 2), 'utf-8')
    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('[family] 更新睡眠内容失败:', err)
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

/** 更新 item 字段 */
function updateSleepItem(category, existing, body) {
  const updated = { ...existing }
  if (category === 'whitenoise') {
    if (body.title) updated.label = body.title
    if (body.type) updated.type = body.type
    if (body.color) updated.color = body.color
  } else {
    if (body.title) updated.title = body.title
    if (body.content !== undefined) updated.content = body.content
    if (body.author !== undefined) { updated.author = body.author; delete updated.artist }
    if (body.artist !== undefined) { updated.artist = body.artist; delete updated.author }
    if (body.source !== undefined) updated.source = body.source
    if (body.dynasty !== undefined) updated.dynasty = body.dynasty
    if (body.type !== undefined) updated.type = body.type
    if (body.reason !== undefined) updated.reason = body.reason
    if (body.stars !== undefined) updated.stars = body.stars
    if (category === 'lullaby' && body.audio_url !== undefined) updated.audio_url = body.audio_url
  }
  return updated
}

/**
 * 删除睡眠内容
 * DELETE /family/sleep-content/:id
 * Body: { category }
 */
router.delete('/sleep-content/:id', (req, res) => {
  try {
    const { category } = req.body
    const rawId = parseRawId(req.params.id)
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `无效的分类: ${category}` })
    }
    const allData = JSON.parse(readFileSync(DATA_PATH, 'utf-8'))
    const list = allData[category]
    if (!list) return res.status(404).json({ success: false, error: '分类不存在' })
    const idx = list.findIndex(item => item.id == rawId || String(item.id) === String(rawId))
    if (idx === -1) return res.status(404).json({ success: false, error: '内容不存在' })
    list.splice(idx, 1)
    writeFileSync(DATA_PATH, JSON.stringify(allData, null, 2), 'utf-8')
    return res.json({ success: true })
  } catch (err) {
    console.error('[family] 删除睡眠内容失败:', err)
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

// ==================== TTS 语音合成 ====================

/**
 * Edge TTS 免费语音合成（微软 Edge 浏览器同款，日常朗读主力）
 * POST /family/tts/edge
 * Body: { text, voice?, speed? }
 * - voice: Edge TTS 音色 ID，如 zh-CN-XiaoxiaoNeural
 * - speed: 语速倍率 0.5~2.0
 */
router.post('/tts/edge', async (req, res) => {
  try {
    const { text, voice = 'zh-CN-XiaoxiaoNeural', speed = 1.0 } = req.body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'text 参数不能为空' })
    }

    const trimmedText = text.trim().slice(0, 3000)
    const validSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0))

    // 语速转换为 SSML prosody rate 格式（如 "+20%", "-30%"）
    const ratePercent = Math.round((validSpeed - 1) * 100)
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`

    // 确保 voice 在支持列表中
    const validVoice = EDGE_VOICES.find(v => v.id === voice) ? voice : 'zh-CN-XiaoxiaoNeural'

    console.log(`[family/tts/edge] 合成: voice=${validVoice}, speed=${rateStr}, len=${trimmedText.length}`)

    const audioBase64 = await edgeTtsPromise(trimmedText, validVoice, rateStr)

    return res.json({
      success: true,
      data: {
        audio: audioBase64,
        format: 'mp3',
        voice: validVoice,
        speed: validSpeed,
        engine: 'edge'
      }
    })
  } catch (err) {
    console.error('[family/tts/edge] 失败:', err.message)
    return res.status(502).json({
      success: false,
      error: 'Edge TTS 合成失败',
      fallback: true
    })
  }
})

/**
 * Qwen3-TTS 语音合成（仅用于语音克隆自定义音色，需密码）
 * POST /family/tts
 * Body: { text, customVoiceId, speed?, clonePassword }
 */
router.post('/tts', async (req, res) => {
  try {
    const { text, customVoiceId, speed = 1.0, clonePassword } = req.body

    // 语音克隆需要密码验证
    if (config.voiceClonePassword && clonePassword !== config.voiceClonePassword) {
      return res.status(403).json({
        success: false,
        error: '语音克隆需要授权密码',
        needPassword: true
      })
    }

    if (!customVoiceId) {
      return res.status(400).json({
        success: false,
        error: '请使用语音克隆音色或使用 /tts/edge 免费接口',
        fallback: true
      })
    }

    if (!config.dashscopeApiKey || !config.dashscopeWorkspaceId) {
      return res.status(503).json({
        success: false,
        error: '语音克隆需要配置 DASHSCOPE_API_KEY 和 DASHSCOPE_WORKSPACE_ID',
        fallback: true
      })
    }

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'text 参数不能为空' })
    }

    const trimmedText = text.trim().slice(0, 1000)
    const validSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0))

    const result = await dashscopePost(
      `${config.dashscopeWorkspaceId}.cn-beijing.maas.aliyuncs.com`,
      '/api/v1/services/aigc/multimodal-generation/generation',
      {
        model: 'qwen3-tts-vc-2026-01-22',
        input: { text: trimmedText, voice: customVoiceId },
        parameters: { speech_rate: validSpeed, format: 'mp3' }
      },
      config.dashscopeApiKey
    )

    if (result.status !== 200 || result.body.code) {
      console.error('[family/tts/clone] 错误:', result.status, JSON.stringify(result.body).slice(0, 300))
      return res.status(502).json({
        success: false,
        error: `声音复刻合成失败: ${result.body.message || result.status}`,
        fallback: true
      })
    }

    const audioResult = result.body.output?.audio
    if (!audioResult) {
      return res.status(502).json({ success: false, error: 'TTS 响应缺少音频数据', fallback: true })
    }

    let audioBase64
    if (typeof audioResult === 'string') {
      audioBase64 = audioResult
    } else if (audioResult.url) {
      try {
        audioBase64 = await downloadAudioAsBase64(audioResult.url)
      } catch (downloadErr) {
        console.error('[family/tts] 下载音频失败:', downloadErr.message)
        return res.status(502).json({ success: false, error: '下载 TTS 音频失败', fallback: true })
      }
    } else {
      return res.status(502).json({ success: false, error: 'TTS 音频格式异常', fallback: true })
    }

    return res.json({
      success: true,
      data: {
        audio: audioBase64,
        format: 'mp3',
        voice: customVoiceId,
        speed: validSpeed,
        isCloned: true,
        usage: result.body.usage || null
      }
    })
  } catch (err) {
    console.error('[family/tts] 异常:', err)
    return res.status(500).json({ success: false, error: 'TTS 服务异常', fallback: true })
  }
})

// ==================== 语音克隆（声音复刻）API ====================

/**
 * 注册自定义音色（声音复刻）
 * POST /family/tts/enroll
 * Body: { audioBase64, audioUrl?, name }
 * - audioBase64: 参考音频的 base64（不含 data URI 前缀）
 * - audioUrl: 参考音频的公网 URL（二选一，优先使用 URL）
 * - name: 音色名称
 *
 * 要求：音频 10~20 秒，清晰朗读，无背景音，WAV/MP3/M4A
 */
router.post('/tts/enroll', async (req, res) => {
  try {
    // 语音克隆需要密码验证
    if (config.voiceClonePassword && req.body.clonePassword !== config.voiceClonePassword) {
      return res.status(403).json({
        success: false,
        error: '语音克隆需要授权密码',
        needPassword: true
      })
    }

    if (!config.dashscopeApiKey || !config.dashscopeWorkspaceId) {
      return res.status(503).json({
        success: false,
        error: '语音克隆需要配置 DASHSCOPE_API_KEY 和 DASHSCOPE_WORKSPACE_ID'
      })
    }

    const { audioBase64, audioUrl, name } = req.body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ success: false, error: '请提供音色名称' })
    }

    // 构建音频数据
    let audioData
    if (audioUrl && audioUrl.startsWith('https://')) {
      audioData = audioUrl
    } else if (audioBase64) {
      // 构造 data URI
      const mimeType = audioBase64.startsWith('/9j/') ? 'image/jpeg' :
                       audioBase64.startsWith('UklGR') ? 'audio/wav' : 'audio/mpeg'
      audioData = `data:${mimeType};base64,${audioBase64}`
    } else {
      return res.status(400).json({ success: false, error: '请提供参考音频（audioBase64 或 audioUrl）' })
    }

    const preferredName = name.trim().slice(0, 20)

    console.log(`[family/tts/enroll] 创建音色: ${preferredName}`)

    const result = await dashscopePost(
      `${config.dashscopeWorkspaceId}.cn-beijing.maas.aliyuncs.com`,
      '/api/v1/services/audio/tts/customization',
      {
        model: 'qwen-voice-enrollment',
        input: {
          action: 'create',
          target_model: 'qwen3-tts-vc-2026-01-22',
          preferred_name: preferredName,
          audio: { data: audioData }
        }
      },
      config.dashscopeApiKey
    )

    if (result.status !== 200) {
      console.error('[family/tts/enroll] 注册失败:', result.status, JSON.stringify(result.body).slice(0, 300))
      return res.status(502).json({
        success: false,
        error: `音色注册失败: ${result.body.message || result.body.code || result.status}`
      })
    }

    if (result.body.code) {
      console.error('[family/tts/enroll] DashScope 错误:', result.body)
      return res.status(502).json({
        success: false,
        error: result.body.message || '音色注册失败'
      })
    }

    const voiceId = result.body.output?.voice
    if (!voiceId) {
      console.error('[family/tts/enroll] 未返回 voice_id')
      return res.status(502).json({
        success: false,
        error: '音色注册失败：未返回音色 ID'
      })
    }

    // 保存到本地存储
    const customVoices = loadCustomVoices()
    const newVoice = {
      id: voiceId,
      name: preferredName,
      createdAt: new Date().toISOString(),
      model: 'qwen3-tts-vc-2026-01-22'
    }
    customVoices.push(newVoice)
    saveCustomVoices(customVoices)

    console.log(`[family/tts/enroll] 音色注册成功: ${preferredName} → ${voiceId}`)

    return res.json({
      success: true,
      data: {
        voiceId,
        name: preferredName,
        label: `${preferredName} (我的)`,
        type: 'custom',
        createdAt: newVoice.createdAt
      }
    })
  } catch (err) {
    console.error('[family/tts/enroll] 异常:', err)
    return res.status(500).json({ success: false, error: '音色注册异常' })
  }
})

/**
 * 获取所有可用音色（预置 + 自定义）
 * GET /family/tts-voices
 */
router.get('/tts-voices', (req, res) => {
  // Edge TTS 始终可用（免费，无需 API Key）
  const edgeAvailable = true
  // 语音克隆仅在配置了 API Key 时可用
  const cloneAvailable = !!(config.dashscopeApiKey && config.dashscopeWorkspaceId)
  // 语音克隆是否需要密码
  const cloneNeedPassword = !!config.voiceClonePassword
  const customVoices = loadCustomVoices()

  // 将自定义音色转为前端格式
  const customVoiceList = customVoices.map(v => ({
    id: v.id,
    label: `${v.name} (我的)`,
    desc: '自定义克隆音色',
    type: 'custom',
    createdAt: v.createdAt,
    voiceId: v.id
  }))

  return res.json({
    success: true,
    data: {
      ttsAvailable: edgeAvailable,          // Edge TTS 始终可用
      cloneAvailable,                        // 语音克隆是否配置
      cloneNeedPassword,                     // 语音克隆是否需要密码
      defaultVoice: 'zh-CN-YunjianNeural',  // Edge TTS 默认音色：云健
      presetVoices: EDGE_VOICES,             // Edge TTS 免费音色列表
      customVoices: customVoiceList,         // 用户自定义音色
      allVoices: [
        ...EDGE_VOICES,
        ...customVoiceList
      ]
    }
  })
})

/**
 * 删除自定义音色
 * DELETE /family/tts/voice/:voiceId
 */
router.delete('/tts/voice/:voiceId', (req, res) => {
  try {
    const { voiceId } = req.params
    const customVoices = loadCustomVoices()
    const idx = customVoices.findIndex(v => v.id === voiceId)

    if (idx === -1) {
      return res.status(404).json({ success: false, error: '音色不存在' })
    }

    const removed = customVoices.splice(idx, 1)[0]
    saveCustomVoices(customVoices)

    console.log(`[family/tts/voice] 已删除音色: ${removed.name} (${voiceId})`)

    return res.json({ success: true, data: { deleted: voiceId } })
  } catch (err) {
    console.error('[family/tts/voice] 删除失败:', err)
    return res.status(500).json({ success: false, error: '删除音色失败' })
  }
})

export default router
