import { Router } from 'express'
import { readFileSync, existsSync, writeFileSync, mkdirSync, unlinkSync, createReadStream, statSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'
import crypto from 'crypto'
import WebSocket from 'ws'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DATA_PATH = join(__dirname, '..', 'data', 'sleep-content.json')

// ==================== 音色配置 ====================

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

// ==================== 工具函数 ====================

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
 * 获取所有可用音色（仅 Edge TTS 免费音色）
 * GET /family/tts-voices
 */
router.get('/tts-voices', (req, res) => {
  return res.json({
    success: true,
    data: {
      ttsAvailable: true,                      // Edge TTS 始终可用（免费，无需 API Key）
      defaultVoice: 'zh-CN-YunjianNeural',     // Edge TTS 默认音色：云健
      presetVoices: EDGE_VOICES,               // Edge TTS 免费音色列表
      allVoices: EDGE_VOICES
    }
  })
})

// ==================== 我的声音（用户录音/上传） ====================

// 用户专属声音文件存储目录与元数据
const VOICES_DIR = join(__dirname, '..', 'data', 'voices')
const VOICES_META_PATH = join(__dirname, '..', 'data', 'voices.json')
// 文件 URL 前缀需与前端 API_BASE（/staticTool/api/family）保持一致
const VOICE_FILE_BASE = '/staticTool/api/family'

// 支持的音频格式 → Content-Type
const VOICE_MIME = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  webm: 'audio/webm',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  opus: 'audio/ogg'
}

function loadVoicesMeta() {
  try {
    if (existsSync(VOICES_META_PATH)) {
      return JSON.parse(readFileSync(VOICES_META_PATH, 'utf-8'))
    }
  } catch (e) { console.error('[family/voices] 读取元数据失败:', e) }
  return []
}

function saveVoicesMeta(list) {
  try {
    mkdirSync(dirname(VOICES_META_PATH), { recursive: true })
    writeFileSync(VOICES_META_PATH, JSON.stringify(list, null, 2), 'utf-8')
  } catch (e) { console.error('[family/voices] 保存元数据失败:', e) }
}

/** 列出用户声音（仅返回元信息，音频通过 /voices/file/:filename 获取） */
router.get('/voices', (req, res) => {
  const list = loadVoicesMeta()
  res.json({
    success: true,
    data: list.map(v => ({
      id: v.id,
      name: v.name,
      url: `${VOICE_FILE_BASE}/voices/file/${v.filename}`,
      size: v.size || 0,
      duration: v.duration || 0,
      createdAt: v.createdAt || null
    }))
  })
})

/** 新增用户声音（录音或上传），音频以 base64 传入 */
router.post('/voices', (req, res) => {
  try {
    const { name, audio, format } = req.body
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: '请填写声音名称' })
    }
    if (!audio || typeof audio !== 'string') {
      return res.status(400).json({ success: false, error: '缺少音频数据' })
    }

    const ext = (format || 'mp3').toString().toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!VOICE_MIME[ext]) {
      return res.status(400).json({ success: false, error: `不支持的音频格式：${format || '未知'}` })
    }

    mkdirSync(VOICES_DIR, { recursive: true })
    const id = crypto.randomUUID()
    const filename = `${id}.${ext}`
    const filePath = join(VOICES_DIR, filename)

    // 去除可能的 data URI 前缀
    const base64 = audio.includes(',') ? audio.split(',')[1] : audio
    let buf
    try {
      buf = Buffer.from(base64, 'base64')
    } catch (e) {
      return res.status(400).json({ success: false, error: '音频数据无效' })
    }
    if (buf.length === 0) {
      return res.status(400).json({ success: false, error: '音频内容为空' })
    }

    writeFileSync(filePath, buf)

    const meta = {
      id,
      name: name.trim().slice(0, 40),
      filename,
      size: buf.length,
      duration: Number(req.body.duration) || 0,
      createdAt: new Date().toISOString()
    }
    const list = loadVoicesMeta()
    list.push(meta)
    saveVoicesMeta(list)

    console.log(`[family/voices] 新增声音: ${meta.name} (${filename}, ${buf.length} bytes)`)

    res.json({
      success: true,
      data: {
        id,
        name: meta.name,
        url: `${VOICE_FILE_BASE}/voices/file/${filename}`,
        size: meta.size,
        duration: meta.duration
      }
    })
  } catch (e) {
    console.error('[family/voices] 上传失败:', e)
    res.status(500).json({ success: false, error: '保存失败' })
  }
})

/** 删除用户声音 */
router.delete('/voices/:id', (req, res) => {
  try {
    const { id } = req.params
    const list = loadVoicesMeta()
    const idx = list.findIndex(v => v.id === id)
    if (idx === -1) return res.status(404).json({ success: false, error: '声音不存在' })

    const removed = list.splice(idx, 1)[0]
    saveVoicesMeta(list)

    try {
      const p = join(VOICES_DIR, removed.filename)
      if (existsSync(p)) unlinkSync(p)
    } catch (e) { console.error('[family/voices] 删除文件失败:', e) }

    res.json({ success: true })
  } catch (e) {
    console.error('[family/voices] 删除失败:', e)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

/** 提供用户声音音频文件（支持 Range 以兼容浏览器拖动进度） */
router.get('/voices/file/:filename', (req, res) => {
  const filename = req.params.filename
  // 防目录穿越
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    return res.status(400).end()
  }
  const filePath = join(VOICES_DIR, filename)
  if (!existsSync(filePath)) return res.status(404).end()

  const ext = extname(filename).slice(1).toLowerCase()
  const contentType = VOICE_MIME[ext] || 'application/octet-stream'
  const total = statSync(filePath).size
  const range = req.headers.range

  res.setHeader('Content-Type', contentType)
  res.setHeader('Accept-Ranges', 'bytes')

  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range)
    if (m) {
      const start = parseInt(m[1], 10)
      const end = m[2] ? parseInt(m[2], 10) : total - 1
      if (start >= total) {
        res.status(416).setHeader('Content-Range', `bytes */${total}`)
        return res.end()
      }
      const clampedEnd = Math.min(end, total - 1)
      res.status(206)
      res.setHeader('Content-Range', `bytes ${start}-${clampedEnd}/${total}`)
      res.setHeader('Content-Length', clampedEnd - start + 1)
      const stream = createReadStream(filePath, { start, end: clampedEnd })
      stream.on('error', () => res.status(500).end())
      stream.pipe(res)
      return
    }
  }

  res.setHeader('Content-Length', total)
  const full = createReadStream(filePath)
  full.on('error', () => res.status(500).end())
  full.pipe(res)
})

export default router
