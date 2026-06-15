import { Router } from 'express'
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { signTc3 } from '../services/tencentSigner.js'
import { parseWithDeepSeek } from '../services/llmParser.js'
import { parseLotteryFromOcrText } from '../services/ocrTextParser.js'
import config from '../config/index.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEBUG_FILE = path.join(__dirname, '..', 'ocr_debug.log')

function debugLog(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const line = `[${ts}] ${msg}\n`
  process.stdout.write(line)
  try { fs.appendFileSync(DEBUG_FILE, line) } catch (_) {}
}

const router = Router()
const { secretId, secretKey, endpoint, region, action, version } = config.tencentOcr

/**
 * 调用腾讯云 OCR
 * @returns {{ text: string, rawDetections: array } | null}
 */
async function callTencentOCR(base64Image) {
  const payload = JSON.stringify({
    ImageBase64: base64Image,
    EnableDetectSplit: true
  })

  const headers = signTc3(secretId, secretKey, 'ocr', endpoint, region, action, version, payload)

  console.log(`[ocr] 调用 GeneralAccurateOCR，图片约 ${(base64Image.length / 1024).toFixed(1)}KB`)

  const response = await axios.post(`https://${endpoint}`, payload, {
    headers,
    timeout: 15000
  })

  const result = response.data

  if (result.Response?.Error) {
    console.error('[ocr] 腾讯云返回错误:', result.Response.Error)
    return null
  }

  const textDetections = result.Response?.TextDetections || []
  const text = textDetections.map(t => t.DetectedText).join('\n')

  console.log(`[ocr] 识别完成，共 ${textDetections.length} 行，${text.length} 字符`)

  return { text, rawDetections: textDetections }
}

/**
 * 彩票 OCR + LLM 智能解析
 * POST /ocr/parse-lottery
 * Body: { image: "base64数据" }
 * 返回: { code: 0, data: { type: "ssq", issue: "2025055", numbers: { reds: [...], blue: N } } }
 */
router.post('/parse-lottery', async (req, res) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.json({ code: -1, message: '请提供图片 base64 数据', data: null })
    }

    if (!secretId || !secretKey) {
      return res.json({ code: -1, message: 'OCR 服务未配置', data: null })
    }

    // 去掉 data:image/xxx;base64, 前缀
    const base64Image = image.replace(/^data:image\/\w+;base64,/, '')

    // 步骤1: 腾讯云 OCR
    const ocrResult = await callTencentOCR(base64Image)
    if (!ocrResult) {
      return res.json({ code: -1, message: 'OCR 识别失败', data: null })
    }

    // 步骤2: DeepSeek LLM 解析（仅在前端明确要求时启用）
    const useAI = req.body.useAI === true
    if (useAI) {
      const deepseekKey = config.deepseekApiKey
      if (deepseekKey) {
        const groups = await parseWithDeepSeek(ocrResult.text, deepseekKey)
        if (Array.isArray(groups) && groups.length > 0) {
          console.log(`[ocr] LLM 解析成功: ${groups.length} 注, type=${groups[0].type}, issue=${groups[0].issue}`)
          return res.json({
            code: 0,
            data: {
              groups,
              ocrText: ocrResult.text,
              source: 'deepseek'
            },
            message: 'ok'
          })
        }
        console.warn('[ocr] LLM 解析失败，回退到基础解析')
      } else {
        console.warn('[ocr] 请求了 AI 解析但 DeepSeek API Key 未配置')
      }
    }

    // ── 🔍 打印 rawDetections 每项的关键信息 ──
    if (ocrResult.rawDetections && ocrResult.rawDetections.length > 0) {
      debugLog('═══════════════════════════════════════')
      debugLog(`[ocr.detections] 共 ${ocrResult.rawDetections.length} 项:`)
      ocrResult.rawDetections.forEach((d, i) => {
        const ip = d.ItemPolygon
        debugLog(`  [${i}] "${d.DetectedText}" ${ip ? `(X:${ip.X?.toFixed(0) || '-'}, Y:${ip.Y?.toFixed(0) || '-'}, W:${ip.Width?.toFixed(0) || '-'}, H:${ip.Height?.toFixed(0) || '-'})` : '(无坐标)'}`)
      })
      debugLog('═══════════════════════════════════════')
    }

    // 回退：未配置 DeepSeek 或 LLM 解析失败时，用基础解析 OCR 文本 + 坐标
    const groups = parseLotteryFromOcrText(ocrResult.text, ocrResult.rawDetections)
    if (groups.length > 0) {
      console.log(`[ocr] 基础解析成功: ${groups.length} 注, type=${groups[0].type}`)
    } else {
      console.warn('[ocr] 基础解析也未提取到号码')
    }
    res.json({
      code: 0,
      data: {
        groups,
        ocrText: ocrResult.text,
        rawDetections: ocrResult.rawDetections,
        source: 'ocr_only'
      },
      message: groups.length > 0 ? 'ok (基础 OCR 解析)' : 'ok (未提取到号码)'
    })
  } catch (err) {
    console.error('[ocr] parse-lottery 异常:', err.message)
    res.json({ code: -1, message: `请求失败: ${err.message}`, data: null })
  }
})

/**
 * 腾讯云 OCR 代理（兼容旧接口）
 * POST /ocr/recognize
 * Body: { image: "base64字符串" }
 * 返回: { code: 0, data: { text: "识别文本" } }
 */
router.post('/recognize', async (req, res) => {
  try {
    const { image } = req.body

    if (!image) {
      return res.json({ code: -1, message: '请提供图片 base64 数据', data: null })
    }

    if (!secretId || !secretKey) {
      return res.json({
        code: -1,
        message: 'OCR 服务未配置，请在 .env 中设置 TENCENT_SECRET_ID 和 TENCENT_SECRET_KEY',
        data: null
      })
    }

    const base64Image = image.replace(/^data:image\/\w+;base64,/, '')
    const ocrResult = await callTencentOCR(base64Image)

    if (!ocrResult) {
      return res.json({ code: -1, message: 'OCR 识别失败', data: null })
    }

    res.json({
      code: 0,
      data: { text: ocrResult.text, detections: ocrResult.rawDetections },
      message: 'ok'
    })
  } catch (err) {
    console.error('[ocr] 请求异常:', err.message)
    res.json({
      code: -1,
      message: `OCR 请求失败: ${err.message}`,
      data: null
    })
  }
})

export default router
