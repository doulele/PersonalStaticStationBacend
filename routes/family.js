import { Router } from 'express'
import { existsSync, mkdirSync, unlinkSync, createReadStream, statSync, writeFileSync, readdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, extname, resolve } from 'path'
import crypto from 'crypto'
import WebSocket from 'ws'
import { dbGet, dbAll, dbRun } from '../services/db.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// ==================== 音色配置 ====================
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

// ==================== Edge TTS ====================
const WIN_EPOCH = 11644473600
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const SEC_MS_GEC_VERSION = '1-143.0.3650.75'
const EDGE_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'

function generateSecMsGec() {
  const nowSec = Math.floor(Date.now() / 1000)
  let ticks = nowSec + WIN_EPOCH
  ticks = ticks - (ticks % 300)
  const windowsTicks = Math.floor(ticks * 10_000_000)
  return crypto.createHash('sha256')
    .update(`${windowsTicks}${TRUSTED_CLIENT_TOKEN}`)
    .digest('hex')
    .toUpperCase()
}

function generateMuid() {
  return crypto.randomBytes(16).toString('hex').toUpperCase()
}

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
      const configMsg = JSON.stringify({
        context: {
          synthesis: {
            audio: {
              metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: false },
              outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
            }
          }
        }
      })

      const now = dateToString()
      ws.send(`X-Timestamp:${now}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${configMsg}`)

      const escapedText = text
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;')

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
          if (data.length < 2) return
          const headerLength = (data[0] << 8) | data[1]
          const offset = 2 + headerLength
          if (offset < data.length) {
            const audioData = data.subarray(offset)
            if (audioData.length > 0) audioChunks.push(audioData)
          }
        } catch {
          const separator = Buffer.from('Path:audio\r\n')
          const idx = data.indexOf(separator)
          if (idx !== -1) {
            const audioData = data.subarray(idx + separator.length)
            if (audioData.length > 0) audioChunks.push(audioData)
          }
        }
      } else {
        const msg = data.toString()
        if (msg.includes('Path:')) {
          const pathMatch = msg.match(/Path:(\S+)/)
          const path = pathMatch ? pathMatch[1] : '?'
          if (path === 'turn.end') ws.close()
        }
      }
    })

    ws.on('close', (code) => {
      if (audioChunks.length > 0) {
        resolve(Buffer.concat(audioChunks).toString('base64'))
      } else {
        reject(new Error('未收到 Edge TTS 音频数据'))
      }
    })

    ws.on('error', reject)
    setTimeout(() => { try { ws.close() } catch (e) { } reject(new Error('Edge TTS 请求超时')) }, 30000)
  })
}

// ==================== 辅助 ====================
const VALID_CATEGORIES = ['whitenoise', 'classics', 'story', 'fable', 'lullaby', 'poetry']

function parseRawId(idStr) {
  const stripped = String(idStr).includes('-') ? String(idStr).split('-').slice(1).join('-') : String(idStr)
  const num = Number(stripped)
  return isNaN(num) ? stripped : num
}

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

const router = Router()

// ==================== 睡眠内容 API ====================

router.get('/sleep-content', (req, res) => {
  try {
    const { category } = req.query

    if (!category || category === 'all') {
      const rows = dbAll('SELECT category, item_data FROM sleep_content')
      const allData = {}
      for (const row of rows) {
        if (!allData[row.category]) allData[row.category] = []
        allData[row.category].push(JSON.parse(row.item_data))
      }
      // 白噪音：优先用服务器音频目录里的真实文件（按文件名生成记录）
      const audioItems = scanWhitenoiseAudio()
      if (audioItems.length) {
        allData.whitenoise = audioItems.map((a, i) => ({
          id: `file-${i}`,
          label: a.label,
          category: a.category,
          type: 'custom',
          color: 'default',
          audioUrl: a.url,
          _size: a.size
        }))
      }
      return res.json({ success: true, data: allData })
    }

    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({
        success: false,
        error: `无效的分类参数，支持: ${VALID_CATEGORIES.join(', ')}`
      })
    }

    // 单独请求白噪音分类时，同样优先返回音频目录文件
    if (category === 'whitenoise') {
      const audioItems = scanWhitenoiseAudio()
      if (audioItems.length) {
        const items = audioItems.map((a, i) => ({
          id: `file-${i}`,
          label: a.label,
          category: a.category,
          type: 'custom',
          color: 'default',
          audioUrl: a.url,
          _size: a.size
        }))
        return res.json({ success: true, data: { whitenoise: items } })
      }
    }

    const rows = dbAll('SELECT item_data FROM sleep_content WHERE category = ?', [category])
    return res.json({
      success: true,
      data: { [category]: rows.map(r => JSON.parse(r.item_data)) }
    })
  } catch (err) {
    console.error('[family] 获取睡眠内容失败:', err)
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

router.post('/sleep-content', (req, res) => {
  try {
    const { category } = req.body
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `无效的分类: ${category}` })
    }

    const rows = dbAll('SELECT item_data FROM sleep_content WHERE category = ?', [category])
    const maxId = rows.reduce((max, row) => {
      const item = JSON.parse(row.item_data)
      const num = Number(item.id)
      return isNaN(num) ? max : Math.max(max, num)
    }, 0)

    const newItem = buildSleepItem(category, req.body, maxId + 1)
    const id = `${category}:${newItem.id}`

    dbRun('INSERT INTO sleep_content (id, category, item_data) VALUES (?,?,?)',
      [id, category, JSON.stringify(newItem)])

    return res.json({ success: true, data: newItem })
  } catch (err) {
    console.error('[family] 新增睡眠内容失败:', err)
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

router.put('/sleep-content/:id', (req, res) => {
  try {
    const { category } = req.body
    const rawId = parseRawId(req.params.id)
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `无效的分类: ${category}` })
    }

    const allRows = dbAll('SELECT id, item_data FROM sleep_content WHERE category = ?', [category])
    let targetRow = null
    for (const row of allRows) {
      const item = JSON.parse(row.item_data)
      if (item.id == rawId || String(item.id) === String(rawId)) {
        targetRow = row
        break
      }
    }
    if (!targetRow) return res.status(404).json({ success: false, error: '内容不存在' })

    const existing = JSON.parse(targetRow.item_data)
    const updated = updateSleepItem(category, existing, req.body)

    dbRun('UPDATE sleep_content SET item_data = ? WHERE id = ?',
      [JSON.stringify(updated), targetRow.id])

    return res.json({ success: true, data: updated })
  } catch (err) {
    console.error('[family] 更新睡眠内容失败:', err)
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

router.delete('/sleep-content/:id', (req, res) => {
  try {
    const { category } = req.body
    const rawId = parseRawId(req.params.id)
    if (!VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ success: false, error: `无效的分类: ${category}` })
    }

    const allRows = dbAll('SELECT id, item_data FROM sleep_content WHERE category = ?', [category])
    let targetId = null
    for (const row of allRows) {
      const item = JSON.parse(row.item_data)
      if (item.id == rawId || String(item.id) === String(rawId)) {
        targetId = row.id
        break
      }
    }
    if (!targetId) return res.status(404).json({ success: false, error: '内容不存在' })

    dbRun('DELETE FROM sleep_content WHERE id = ?', [targetId])
    return res.json({ success: true })
  } catch (err) {
    console.error('[family] 删除睡眠内容失败:', err)
    return res.status(500).json({ success: false, error: '服务器内部错误' })
  }
})

// ==================== TTS 语音合成 ====================

router.post('/tts/edge', async (req, res) => {
  try {
    const { text, voice = 'zh-CN-XiaoxiaoNeural', speed = 1.0 } = req.body
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'text 参数不能为空' })
    }

    const trimmedText = text.trim().slice(0, 3000)
    const validSpeed = Math.max(0.5, Math.min(2.0, Number(speed) || 1.0))
    const ratePercent = Math.round((validSpeed - 1) * 100)
    const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`
    const validVoice = EDGE_VOICES.find(v => v.id === voice) ? voice : 'zh-CN-XiaoxiaoNeural'

    console.log(`[family/tts/edge] 合成: voice=${validVoice}, speed=${rateStr}, len=${trimmedText.length}`)
    const audioBase64 = await edgeTtsPromise(trimmedText, validVoice, rateStr)

    return res.json({
      success: true,
      data: { audio: audioBase64, format: 'mp3', voice: validVoice, speed: validSpeed, engine: 'edge' }
    })
  } catch (err) {
    console.error('[family/tts/edge] 失败:', err.message)
    return res.status(502).json({ success: false, error: 'Edge TTS 合成失败', fallback: true })
  }
})

router.get('/tts-voices', (req, res) => {
  return res.json({
    success: true,
    data: {
      ttsAvailable: true,
      defaultVoice: 'zh-CN-YunjianNeural',
      presetVoices: EDGE_VOICES,
      allVoices: EDGE_VOICES
    }
  })
})

// ==================== 我的声音 ====================

const VOICES_DIR = join(__dirname, '..', 'data', 'voices')
const VOICE_FILE_BASE = '/staticTool/api/family'

// ==================== 白噪音音频 ====================
// 白噪音真实音频文件目录（服务器独立目录，不在代码仓库内）
// 优先级：环境变量 WHITENOISE_AUDIO_DIR > 后端项目 data/whitenoise（默认）
const WHITENOISE_DIR = process.env.WHITENOISE_AUDIO_DIR
  ? resolve(process.env.WHITENOISE_AUDIO_DIR)
  : join(__dirname, '..', 'data', 'whitenoise')
const WHITENOISE_FILE_BASE = '/staticTool/api/family'
const WHITENOISE_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.webm']

/**
 * 白噪音类别分组规则：按关键词把文件归到语义类别，同类相邻显示
 * 顺序即列表显示顺序，未命中任何类别的归入「其他」并排在最后
 */
const WHITENOISE_CATEGORIES = [
  { name: '雨声', keywords: ['雨', '雷暴'] },
  { name: '森林', keywords: ['森林', '树叶', '微风'] },
  { name: '水声', keywords: ['海浪', '海滩', '瀑布', '溪流', '山溪', '深海', '水石', '落水'] },
  { name: '鸟虫鸣', keywords: ['鸟', '虫', '蛙'] },
  { name: '纯噪音', keywords: ['白噪音', '粉红噪音', '布朗噪音'] },
  { name: '篝火', keywords: ['篝火', '壁炉'] },
  { name: '场景', keywords: ['咖啡馆', '火车', '日出', '夜晚'] },
  { name: '乐器', keywords: ['风铃', '钢琴', '长笛', '钟声', '颂钵'] }
]

/** 根据文件名（去后缀）判断所属类别，未命中返回「其他」 */
function categorizeNoise(label) {
  for (const cat of WHITENOISE_CATEGORIES) {
    if (cat.keywords.some(k => label.includes(k))) return cat.name
  }
  return '其他'
}

/**
 * 扫描白噪音音频目录，返回 [{ label, filename, url, size, category }]
 * 按「类别分组 + 类内名称排序」排列，同类声音相邻
 */
function scanWhitenoiseAudio() {
  if (!existsSync(WHITENOISE_DIR)) return []
  try {
    const files = readdirSync(WHITENOISE_DIR)
      .filter(f => WHITENOISE_EXT.includes(extname(f).toLowerCase()))

    // 计算类别并排序：类别顺序 → 类内名称自然排序
    const withCategory = files.map(f => {
      const label = f.replace(/\.[^.]+$/, '')
      return { filename: f, label, category: categorizeNoise(label) }
    })
    const categoryOrder = [...WHITENOISE_CATEGORIES.map(c => c.name), '其他']
    const categoryIndex = c => {
      const i = categoryOrder.indexOf(c)
      return i === -1 ? categoryOrder.length : i
    }
    withCategory.sort((a, b) => {
      const ca = categoryIndex(a.category), cb = categoryIndex(b.category)
      if (ca !== cb) return ca - cb
      return a.label.localeCompare(b.label, 'zh-Hans-CN', { numeric: true })
    })

    return withCategory.map(({ label, filename, category }) => ({
      label,
      filename,
      category,
      url: `${WHITENOISE_FILE_BASE}/whitenoise/file/${encodeURIComponent(filename)}`,
      size: (() => { try { return statSync(join(WHITENOISE_DIR, filename)).size } catch { return 0 } })()
    }))
  } catch (e) {
    console.error('[family/whitenoise] 扫描音频目录失败:', e)
    return []
  }
}

const VOICE_MIME = {
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  webm: 'audio/webm', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg'
}

router.get('/voices', (req, res) => {
  const list = dbAll('SELECT * FROM voices ORDER BY createdAt DESC')
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

    const now = new Date().toISOString()
    dbRun(
      'INSERT INTO voices (id, name, filename, size, duration, createdAt) VALUES (?,?,?,?,?,?)',
      [id, name.trim().slice(0, 40), filename, buf.length, Number(req.body.duration) || 0, now]
    )

    console.log(`[family/voices] 新增声音: ${name.trim().slice(0, 40)} (${filename}, ${buf.length} bytes)`)

    res.json({
      success: true,
      data: {
        id, name: name.trim().slice(0, 40),
        url: `${VOICE_FILE_BASE}/voices/file/${filename}`,
        size: buf.length,
        duration: Number(req.body.duration) || 0
      }
    })
  } catch (e) {
    console.error('[family/voices] 上传失败:', e)
    res.status(500).json({ success: false, error: '保存失败' })
  }
})

router.delete('/voices/:id', (req, res) => {
  try {
    const { id } = req.params
    const voice = dbGet('SELECT * FROM voices WHERE id = ?', [id])
    if (!voice) return res.status(404).json({ success: false, error: '声音不存在' })

    dbRun('DELETE FROM voices WHERE id = ?', [id])

    try {
      const p = join(VOICES_DIR, voice.filename)
      if (existsSync(p)) unlinkSync(p)
    } catch (e) { console.error('[family/voices] 删除文件失败:', e) }

    res.json({ success: true })
  } catch (e) {
    console.error('[family/voices] 删除失败:', e)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

router.get('/voices/file/:filename', (req, res) => {
  const filename = req.params.filename
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

// ==================== 白噪音音频文件下载 ====================
// 从服务器独立目录（WHITENOISE_DIR）读取音频文件并流式返回，支持 Range 分段（循环播放用）
router.get('/whitenoise/file/:filename', (req, res) => {
  let filename = req.params.filename
  try { filename = decodeURIComponent(filename) } catch { /* 保持原样 */ }
  // 安全校验：禁止路径穿越
  if (filename.includes('/') || filename.includes('\\') || filename.includes('..') || filename.includes('\0')) {
    return res.status(400).end()
  }
  const filePath = join(WHITENOISE_DIR, filename)
  if (!existsSync(filePath)) return res.status(404).end()

  const ext = extname(filename).slice(1).toLowerCase()
  const contentType = VOICE_MIME[ext] || 'audio/mpeg'
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
