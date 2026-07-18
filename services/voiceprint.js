/**
 * 声纹识别服务
 * 封装 Python 脚本调用，提供声纹注册和说话人识别能力
 *
 * 依赖:
 *   - Python 3 + speechbrain (或 resemblyzer)
 *   - ffmpeg (音频切片)
 *
 * 安装:
 *   pip install speechbrain
 *   # 或轻量方案:
 *   pip install resemblyzer
 *
 *   # ffmpeg (Ubuntu/Debian):
 *   sudo apt install ffmpeg
 *   # ffmpeg (Windows):
 *   choco install ffmpeg  或 从 ffmpeg.org 下载
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { dbAll, dbGet, dbRun, getFamilyId } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts')
const ENROLL_SCRIPT = path.join(SCRIPTS_DIR, 'enroll_voiceprint.py')
const IDENTIFY_SCRIPT = path.join(SCRIPTS_DIR, 'identify_speakers.py')
const DATA_DIR = path.join(__dirname, '..', 'data', 'voiceprints')

// 确保声纹数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

// ==================== Python 命令查找 ====================

async function findPython() {
  let lastError = null

  // 优先尝试已知的绝对路径（pm2 环境下 PATH 可能不完整）
  const knownPaths = [
    '/usr/local/bin/python3.10',
    '/usr/local/python3.10/bin/python3.10',
    '/usr/bin/python3.10',
    '/usr/bin/python3'
  ]
  for (const p of knownPaths) {
    console.log(`[voiceprint] 检查 Python 路径: ${p}, exists=${fs.existsSync(p)}`)
    if (fs.existsSync(p)) {
      try {
        await execPromise(p, ['--version'], 5000)
        console.log(`[voiceprint] ✓ 找到 Python: ${p}`)
        return p
      } catch (e) {
        lastError = e.message
        console.log(`[voiceprint] 路径 ${p} 存在但 --version 失败: ${lastError}`)
      }
    }
  }

  // 回退到 PATH 查找
  for (const cmd of ['python3.10', 'python3', 'python']) {
    console.log(`[voiceprint] 尝试 PATH 命令: ${cmd}`)
    try {
      await execPromise(cmd, ['--version'], 5000)
      console.log(`[voiceprint] ✓ 通过 PATH 找到 Python: ${cmd}`)
      return cmd
    } catch (e) {
      lastError = e.message
      console.log(`[voiceprint] 命令 ${cmd} 失败: ${lastError}`)
    }
  }

  // 检查 venv
  const venvPython = process.platform === 'win32'
    ? path.join(__dirname, '..', 'venv', 'Scripts', 'python.exe')
    : path.join(__dirname, '..', 'venv', 'bin', 'python')
  console.log(`[voiceprint] 检查 venv: ${venvPython}, exists=${fs.existsSync(venvPython)}`)
  if (fs.existsSync(venvPython)) {
    console.log(`[voiceprint] ✓ 使用 venv Python: ${venvPython}`)
    return venvPython
  }

  // 最后兜底：直接用已知路径（不验证 --version）
  // 即使 spawn --version 失败，Python 脚本本身可能可以运行
  for (const p of knownPaths) {
    if (fs.existsSync(p)) {
      console.log(`[voiceprint] ⚠ --version 验证失败，但直接使用已知路径: ${p}`)
      return p
    }
  }

  console.error('[voiceprint] ✗ 未找到任何 Python 环境，最后错误:', lastError)
  return null
}

// ==================== 声纹 CRUD ====================

/**
 * 检查声纹表是否存在，不存在则创建
 */
export function ensureVoiceprintTable() {
  dbRun(`
    CREATE TABLE IF NOT EXISTS family_voiceprints (
      id TEXT PRIMARY KEY,
      familyId TEXT NOT NULL,
      memberId TEXT NOT NULL,
      memberName TEXT DEFAULT '',
      embedding TEXT NOT NULL,
      embeddingDim INTEGER DEFAULT 192,
      engine TEXT DEFAULT 'speechbrain',
      audioDuration REAL DEFAULT 0,
      enrolledAt TEXT,
      UNIQUE(familyId, memberId)
    )
  `)
}

/**
 * 注册声纹 — 从音频文件提取特征向量并存入数据库
 * @param {object} params
 * @param {string} params.familyId - 家庭ID
 * @param {string} params.memberId - 成员ID
 * @param {string} params.memberName - 成员名称（用于日志）
 * @param {string} params.audioPath - 音频文件路径
 * @returns {Promise<{success: boolean, data?: object, error?: string}>}
 */
export async function enrollVoiceprint({ familyId, memberId, memberName, audioPath }) {
  if (!familyId || !memberId || !audioPath) {
    return { success: false, error: '缺少必要参数: familyId, memberId, audioPath' }
  }

  if (!fs.existsSync(audioPath)) {
    return { success: false, error: `音频文件不存在: ${audioPath}` }
  }

  ensureVoiceprintTable()

  // 浏览器 MediaRecorder 默认录制 webm/opus，librosa/soundfile 不支持
  // 需要先用 ffmpeg 转换为 16kHz 单声道 WAV
  let convertedPath = null
  const ext = path.extname(audioPath).toLowerCase()
  const needsConversion = ext === '.webm' || ext === '.ogg' || ext === '.opus'

  if (needsConversion) {
    console.log('[voiceprint] 检测到 webm/opus 格式，使用 ffmpeg 转换为 WAV...')
    convertedPath = path.join(os.tmpdir(), `vp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.wav`)
    try {
      await execPromise('ffmpeg', [
        '-y', '-i', audioPath,
        '-ar', '16000',        // 16kHz 采样率
        '-ac', '1',            // 单声道
        '-sample_fmt', 's16',  // 16-bit PCM
        '-f', 'wav',
        convertedPath
      ], 30000)
      console.log('[voiceprint] ffmpeg 转换完成:', convertedPath)
    } catch (ffErr) {
      console.error('[voiceprint] ffmpeg 转换失败:', ffErr.message)
      return { success: false, error: `音频格式转换失败（webm→wav）。请确保服务器已安装 ffmpeg: ${ffErr.message}` }
    }
  }

  const effectiveAudioPath = convertedPath || audioPath

  const pythonCmd = await findPython()
  if (!pythonCmd) {
    return {
      success: false,
      error: '未检测到 Python 环境。请安装 Python 3 并执行:\n' +
        '  pip install speechbrain torch torchaudio\n' +
        '  # 或轻量方案: pip install resemblyzer librosa'
    }
  }

  // 确保 Python 脚本存在
  if (!fs.existsSync(ENROLL_SCRIPT)) {
    return { success: false, error: '声纹注册脚本不存在，请联系管理员' }
  }

  try {
    // 尝试 speechbrain，失败则回退 resemblyzer
    let engine = 'speechbrain'
    let result

    try {
      const res = await execPromise(pythonCmd, [
        ENROLL_SCRIPT,
        '--audio', effectiveAudioPath,
        '--engine', 'speechbrain'
      ], 120000)
      result = parsePythonJson(res.stdout)
    } catch (e) {
      // speechbrain 失败，尝试 resemblyzer
      const fallback = await execPromise(pythonCmd, [
        ENROLL_SCRIPT,
        '--audio', effectiveAudioPath,
        '--engine', 'resemblyzer'
      ], 60000)
      result = parsePythonJson(fallback.stdout)
      engine = 'resemblyzer'
    }

    if (!result.success) {
      return { success: false, error: result.error || '声纹提取失败' }
    }

    // 存入数据库
    const id = 'vp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
    const embedding = JSON.stringify(result.embedding)
    const audioDuration = result.audioDuration || 0

    // 先删除该成员的旧声纹（replace）
    dbRun(
      'DELETE FROM family_voiceprints WHERE familyId = ? AND memberId = ?',
      [familyId, memberId]
    )

    dbRun(
      `INSERT INTO family_voiceprints (id, familyId, memberId, memberName, embedding, embeddingDim, engine, audioDuration, enrolledAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, familyId, memberId, memberName || '', embedding, result.embeddingDim || 192, engine, audioDuration, new Date().toISOString()]
    )

    return {
      success: true,
      data: {
        id,
        memberId,
        memberName,
        embeddingDim: result.embeddingDim,
        engine,
        enrolledAt: new Date().toISOString()
      }
    }
  } catch (err) {
    console.error('[voiceprint] 注册失败:', err.message)
    return { success: false, error: err.message }
  } finally {
    // 清理 ffmpeg 转换的临时 WAV 文件
    if (convertedPath && fs.existsSync(convertedPath)) {
      try { fs.unlinkSync(convertedPath) } catch { }
    }
  }
}

/**
 * 查询成员的声纹状态
 * @param {string} familyId
 * @param {string} memberId
 * @returns {{ enrolled: boolean, engine?: string, enrolledAt?: string, embeddingDim?: number }}
 */
export function getVoiceprintStatus(familyId, memberId) {
  ensureVoiceprintTable()
  const row = dbGet(
    'SELECT engine, enrolledAt, embeddingDim FROM family_voiceprints WHERE familyId = ? AND memberId = ?',
    [familyId, memberId]
  )
  if (!row) return { enrolled: false }

  return {
    enrolled: true,
    engine: row.engine,
    enrolledAt: row.enrolledAt,
    embeddingDim: row.embeddingDim
  }
}

/**
 * 获取家庭所有已注册的声纹（不包含 embedding 数据，仅元信息）
 */
export function listVoiceprints(familyId) {
  ensureVoiceprintTable()
  return dbAll(
    'SELECT id, memberId, memberName, engine, embeddingDim, audioDuration, enrolledAt FROM family_voiceprints WHERE familyId = ?',
    [familyId]
  )
}

/**
 * 删除成员的声纹
 */
export function deleteVoiceprint(familyId, memberId) {
  ensureVoiceprintTable()
  const result = dbRun(
    'DELETE FROM family_voiceprints WHERE familyId = ? AND memberId = ?',
    [familyId, memberId]
  )
  return { success: true, deleted: result.changes > 0 }
}

/**
 * 删除家庭的所有声纹（解散家庭时调用）
 */
export function deleteFamilyVoiceprints(familyId) {
  ensureVoiceprintTable()
  dbRun('DELETE FROM family_voiceprints WHERE familyId = ?', [familyId])
}

// ==================== 说话人识别 ====================

/**
 * 识别音频中各分段的说话人
 *
 * @param {object} params
 * @param {string} params.audioPath - 会议音频路径
 * @param {Array} params.segments - whisper 分段 [{start, end, text}, ...]
 * @param {string} params.familyId - 家庭ID（用于加载该家庭的声纹）
 * @param {number} params.threshold - 置信度阈值 (0-1)，默认 0.5
 * @returns {Promise<{success: boolean, segments?: Array, summary?: object, error?: string}>}
 */
export async function identifySpeakers({ audioPath, segments, familyId, threshold = 0.5 }) {
  if (!audioPath || !segments || !familyId) {
    return { success: false, error: '缺少必要参数' }
  }

  if (!fs.existsSync(audioPath)) {
    return { success: false, error: `音频文件不存在: ${audioPath}` }
  }

  // 加载该家庭的声纹
  ensureVoiceprintTable()
  const voiceprints = dbAll(
    'SELECT memberId, memberName, embedding FROM family_voiceprints WHERE familyId = ?',
    [familyId]
  )

  if (voiceprints.length === 0) {
    // 没有声纹 → 不做匹配，直接返回带空说话人的结果
    return {
      success: true,
      segments: segments.map(s => ({ ...s, speakerId: null, speakerName: null, confidence: 0 })),
      summary: { total: segments.length, matched: 0, unmatched: segments.length },
      note: '该家庭暂无已注册声纹'
    }
  }

  // 解析 embedding
  const vpData = voiceprints.map(v => ({
    memberId: v.memberId,
    memberName: v.memberName,
    embedding: JSON.parse(v.embedding)
  }))

  if (!fs.existsSync(IDENTIFY_SCRIPT)) {
    return { success: false, error: '说话人识别脚本不存在' }
  }

  const pythonCmd = await findPython()
  if (!pythonCmd) {
    return {
      success: false,
      error: '未检测到 Python 环境，无法进行说话人识别'
    }
  }

  try {
    const result = await execPromise(pythonCmd, [
      IDENTIFY_SCRIPT,
      '--audio', audioPath,
      '--segments', JSON.stringify(segments),
      '--voiceprints', JSON.stringify(vpData),
      '--threshold', String(threshold)
    ], 300000) // 5分钟超时

    return parsePythonJson(result.stdout)
  } catch (err) {
    console.error('[voiceprint] 说话人识别失败:', err.message)
    return {
      success: false,
      error: `说话人识别失败: ${err.message}`,
      // 降级：返回不带说话人的分段
      segments: segments.map(s => ({ ...s, speakerId: null, speakerName: null, confidence: 0 }))
    }
  }
}

// ==================== 工具函数 ====================

/**
 * 从 Python 脚本的 stdout 中安全提取 JSON 结果
 * Python 可能输出模型加载信息等额外内容，需要提取最后一组有效的 JSON
 */
function parsePythonJson(stdout) {
  const trimmed = stdout.trim()
  // 直接尝试解析
  try { return JSON.parse(trimmed) } catch {}
  // 找到第一个 { 和最后一个 }，提取 JSON 子串
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start !== -1 && end !== -1 && end > start) {
    return JSON.parse(trimmed.slice(start, end + 1))
  }
  throw new Error(`无法解析 Python 输出: ${trimmed.slice(0, 200)}`)
}

function execPromise(cmd, args = [], timeout = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', data => { stdout += data.toString() })
    child.stderr.on('data', data => { stderr += data.toString() })

    child.on('close', code => {
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
      } else {
        reject(new Error(`${cmd} 退出码 ${code}: ${stderr.trim() || stdout.trim()}`))
      }
    })

    child.on('error', err => {
      reject(new Error(`无法执行 ${cmd}: ${err.message}`))
    })
  })
}
