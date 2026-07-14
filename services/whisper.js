/**
 * 语音转写服务
 * 支持本地 faster-whisper (Python) 和 whisper.cpp 两种引擎
 */

import { spawn } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = path.join(__dirname, '..', 'scripts')

/**
 * 检测可用的转写引擎
 * @returns {Promise<string[]>} 可用引擎列表
 */
export async function detectEngines() {
  const engines = []

  // 检测 faster-whisper (Python)
  // 依次尝试不同 Python 版本（服务器可能装了多个版本）
  const pythonCmds = ['python', 'python3', 'python3.10', 'python3.11', 'python3.12']
  let found = false
  for (const cmd of pythonCmds) {
    try {
      await execPromise(cmd, ['-c', 'import faster_whisper; print("ok")'], 5000)
      engines.push('faster-whisper')
      found = true
      break
    } catch { /* 继续尝试下一个 */ }
  }

  // 检查是否有 venv
  if (!found) {
    try {
      const venvPython = process.platform === 'win32'
        ? path.join(SCRIPTS_DIR, '..', 'venv', 'Scripts', 'python.exe')
        : path.join(SCRIPTS_DIR, '..', 'venv', 'bin', 'python')
      if (fs.existsSync(venvPython)) {
        await execPromise(venvPython, ['-c', 'import faster_whisper; print("ok")'], 5000)
        engines.push('faster-whisper')
      }
    } catch { /* ignore */ }
  }

  // 检测 whisper.cpp
  try {
    await execPromise('whisper', ['--help'], 5000)
    engines.push('whisper-cpp')
  } catch {
    const whisperExe = process.platform === 'win32' ? 'whisper.exe' : 'whisper'
    const localWhisper = path.join(SCRIPTS_DIR, whisperExe)
    if (fs.existsSync(localWhisper)) {
      engines.push('whisper-cpp')
    }
  }

  return engines
}

/**
 * 转写音频文件
 * @param {string} audioPath - 音频文件路径
 * @param {object} options
 * @param {string} options.language - 语言代码，默认 zh
 * @param {string[]} options.hotwords - 热词列表
 * @returns {Promise<{text:string, segments:Array, engine:string}>}
 */
export async function transcribe(audioPath, options = {}) {
  const { language = 'zh', hotwords = [] } = options

  if (!fs.existsSync(audioPath)) {
    throw new Error(`音频文件不存在: ${audioPath}`)
  }

  const engines = await detectEngines()

  if (engines.length === 0) {
    throw new Error(
      '未检测到可用的语音转写引擎。请安装以下任一引擎：\n' +
      '1. faster-whisper (推荐): pip install faster-whisper\n' +
      '2. whisper.cpp: 从 https://github.com/ggerganov/whisper.cpp/releases 下载\n' +
      '详细安装说明见 README'
    )
  }

  // 优先使用 faster-whisper
  if (engines.includes('faster-whisper')) {
    return transcribeWithFasterWhisper(audioPath, { language, hotwords })
  }

  // 回退到 whisper.cpp
  if (engines.includes('whisper-cpp')) {
    return transcribeWithWhisperCpp(audioPath, { language })
  }

  throw new Error('无可用转写引擎')
}

/**
 * 使用 faster-whisper (Python) 转写
 */
/**
 * 找到可用的 Python 命令
 */
async function findPython() {
  for (const cmd of ['python', 'python3', 'python3.10', 'python3.11', 'python3.12']) {
    try {
      await execPromise(cmd, ['-c', 'import faster_whisper; print("ok")'], 5000)
      return cmd
    } catch { /* 该版本没有 faster_whisper，试下一个 */ }
  }
  // 检查 venv
  const venvPython = process.platform === 'win32'
    ? path.join(SCRIPTS_DIR, '..', 'venv', 'Scripts', 'python.exe')
    : path.join(SCRIPTS_DIR, '..', 'venv', 'bin', 'python')
  if (fs.existsSync(venvPython)) return venvPython
  return 'python' // fallback
}

/**
 * 查找本地已下载的 faster-whisper 模型路径
 * 在 models 目录中搜索 HuggingFace 下载的模型快照
 */
function findLocalWhisperModel() {
  const modelsDir = path.join(SCRIPTS_DIR, '..', 'models')
  if (!fs.existsSync(modelsDir)) return null

  // 查找 models--Systran--faster-whisper-base 目录
  const entries = fs.readdirSync(modelsDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory() && entry.name.includes('faster-whisper')) {
      const snapshotsDir = path.join(modelsDir, entry.name, 'snapshots')
      if (fs.existsSync(snapshotsDir)) {
        const snapshots = fs.readdirSync(snapshotsDir)
        if (snapshots.length > 0) {
          return path.join(snapshotsDir, snapshots[0])
        }
      }
    }
  }
  return null
}

async function transcribeWithFasterWhisper(audioPath, options) {
  const { language, hotwords } = options
  const scriptPath = path.join(SCRIPTS_DIR, 'transcribe.py')

  // 优先使用环境变量指定的模型路径，其次查找本地已下载的模型，最后用 HF 模型名
  let modelPath = process.env.WHISPER_MODEL
  if (!modelPath) {
    const localModel = findLocalWhisperModel()
    modelPath = localModel || 'base'
  }

  // 确保 Python 脚本存在，不存在则创建
  if (!fs.existsSync(scriptPath)) {
    await createTranscribeScript(scriptPath)
  }

  const pythonCmd = await findPython()

  try {
    const result = await execPromise(pythonCmd, [
      scriptPath,
      '--audio', audioPath,
      '--language', language,
      '--model', modelPath,
      ...(hotwords.length > 0 ? ['--hotwords', hotwords.join(',')] : [])
    ], 300000) // 转写可能需要较长时间（5分钟）

    const parsed = JSON.parse(result.stdout)
    return {
      text: parsed.text || '',
      segments: parsed.segments || [],
      engine: 'faster-whisper'
    }
  } catch (err) {
    throw err
  }
}

/**
 * 使用 whisper.cpp 转写
 */
async function transcribeWithWhisperCpp(audioPath, options) {
  const { language } = options
  const modelPath = process.env.WHISPER_CPP_MODEL || path.join(SCRIPTS_DIR, '..', 'models', 'ggml-base.bin')

  if (!fs.existsSync(modelPath)) {
    throw new Error(`whisper.cpp 模型文件不存在: ${modelPath}。请下载模型到 models/ 目录。`)
  }

  const whisperBin = process.platform === 'win32'
    ? (fs.existsSync(path.join(SCRIPTS_DIR, 'whisper.exe')) ? path.join(SCRIPTS_DIR, 'whisper.exe') : 'whisper')
    : (fs.existsSync(path.join(SCRIPTS_DIR, 'whisper')) ? path.join(SCRIPTS_DIR, 'whisper') : 'whisper')

  const result = await execPromise(whisperBin, [
    '-m', modelPath,
    '-f', audioPath,
    '-l', language,
    '--output-txt',
    '--output-json',
    '-of', audioPath + '_out'
  ], 120000)

  // 读取 JSON 输出
  const jsonPath = audioPath + '_out.json'
  if (fs.existsSync(jsonPath)) {
    const json = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    const text = (json.transcription || []).map(s => s.text).join('')
    return {
      text,
      segments: (json.transcription || []).map(s => ({
        start: s.timestamps?.from || s.offsets?.from,
        end: s.timestamps?.to || s.offsets?.to,
        text: s.text
      })),
      engine: 'whisper-cpp'
    }
  }

  // 回退读取 txt 输出
  const txtPath = audioPath + '_out.txt'
  if (fs.existsSync(txtPath)) {
    const text = fs.readFileSync(txtPath, 'utf-8').trim()
    return { text, segments: [], engine: 'whisper-cpp' }
  }

  throw new Error('whisper.cpp 转写失败，未生成输出文件')
}

/**
 * 创建 faster-whisper Python 转写脚本
 */
async function createTranscribeScript(filePath) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const script = `#!/usr/bin/env python3
"""faster-whisper 转写脚本，由 Node.js 后端调用"""

import argparse
import json
import sys
import os

def main():
    parser = argparse.ArgumentParser(description='Whisper 转写')
    parser.add_argument('--audio', required=True, help='音频文件路径')
    parser.add_argument('--language', default='zh', help='语言代码')
    parser.add_argument('--model', default='base', help='模型名称或路径')
    parser.add_argument('--hotwords', default='', help='热词，逗号分隔')
    parser.add_argument('--device', default='cpu', help='设备 cpu/cuda')
    parser.add_argument('--compute-type', default='int8', help='计算精度')
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(json.dumps({"error": f"音频文件不存在: {args.audio}"}), file=sys.stderr)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(json.dumps({"error": "faster-whisper 未安装，请执行: pip install faster-whisper"}),
              file=sys.stderr)
        sys.exit(1)

    # 模型路径：如果指定路径存在则使用，否则作为模型名称加载
    if os.path.exists(args.model):
        model_path = args.model
    elif args.model.startswith('/') or args.model.startswith('.') or '\\\\' in args.model:
        # 是本地路径但不存在 → 回退用 base 模型（首次自动下载）
        model_path = 'base'
    else:
        model_path = args.model  # 作为 HuggingFace 模型名，自动下载

    hotwords = args.hotwords
    hotword_list = [w.strip() for w in hotwords.split(',') if w.strip()] if hotwords else None

    model = WhisperModel(model_path, device=args.device, compute_type=args.compute_type)

    # 转写参数
    transcribe_opts = {
        "language": args.language if args.language != 'auto' else None,
        "beam_size": 5,
        "vad_filter": True,
    }
    if hotword_list:
        transcribe_opts["hotwords"] = " ".join(hotword_list)

    segments, info = model.transcribe(args.audio, **transcribe_opts)

    result = {
        "text": "",
        "segments": [],
        "language": info.language,
        "duration": info.duration,
    }

    texts = []
    for segment in segments:
        texts.append(segment.text.strip())
        result["segments"].append({
            "start": round(segment.start, 2),
            "end": round(segment.end, 2),
            "text": segment.text.strip()
        })

    result["text"] = "".join(texts)
    print(json.dumps(result, ensure_ascii=False))

if __name__ == '__main__':
    main()
`

  fs.writeFileSync(filePath, script, 'utf-8')
}

/**
 * 执行命令并返回结果
 */
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

/**
 * 清理转写产生的临时文件
 */
export function cleanupTempFiles(audioPath) {
  try {
    if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath)
    const jsonPath = audioPath + '_out.json'
    if (fs.existsSync(jsonPath)) fs.unlinkSync(jsonPath)
    const txtPath = audioPath + '_out.txt'
    if (fs.existsSync(txtPath)) fs.unlinkSync(txtPath)
  } catch { /* ignore */ }
}
