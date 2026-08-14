/**
 * 使用 DeepSeek Vision API 解析券商交易记录截图
 * 直接发送图片给 DeepSeek（支持 vision 的 deepseek-chat 模型）
 */

import axios from 'axios'

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'

const SYSTEM_PROMPT = `你是一个券商交易记录截图解析器。我会给你一张A股交易记录截图，你需要从中提取所有买入和卖出记录，以 JSON 格式返回。

## 识别规则
- 识别图中所有交易记录行（买入/卖出）
- 每条记录包含：日期、方向(买入/卖出)、成交价格、成交数量(股)
- 如果截图显示了成交时间（时分秒或时分），识别到 time 字段，格式 HH:mm:ss（如 14:57:23；截图只有时分则补 ":00"）；截图没有显示时间则 time 留空字符串 ""
- 忽略手续费、印花税等费用行
- 忽略汇总统计行
- 如果图中包含"买入"、"融资买入"、"证券买入"、"担保品买入"等关键词，方向为 "buy"
- 如果图中包含"卖出"、"融券卖出"、"证券卖出"、"担保品卖出"等关键词，方向为 "sell"
- 日期格式统一为 YYYY-MM-DD（如原图为 20260801 则转为 2026-08-01）
- 价格保留原始精度（如 8.503）
- 数量必须是整数
- 同时识别截图顶部的股票名称（2-6个汉字）和股票代码（6位数字），填入 stock 字段
- 如果截图明确不包含股票名称或代码，对应字段留空字符串 ""，不要编造

## 输出格式
{
  "stock": { "code": "301077", "name": "星华新材" },
  "records": [
    { "type": "buy", "price": 8.50, "shares": 1000, "date": "2026-08-01", "time": "14:57:23" },
    { "type": "sell", "price": 10.80, "shares": 500, "date": "2026-08-11", "time": "09:41:05" }
  ]
}

## 注意事项
- 只返回 JSON，不要任何解释，不要用 markdown 代码块包裹
- 如果图中没有交易记录，返回 { "stock": null, "records": [] }
- stock 只包含截图中的真实股票信息，必须从截图中读取，绝不能凭交易记录猜测或编造
- OCR 常见错误需要修正：l→1, o→0, O→0, T→7, S→5, Z→2`

/**
 * 调用 DeepSeek Vision API 解析交易记录截图
 * @param {string} base64Image - 图片 base64（不含 data:image 前缀）
 * @param {string} apiKey - DeepSeek API Key
 * @returns {Promise<{records: object[], stock: object|null}>} 交易记录数组 + 识别到的股票信息
 */
export async function parseTradeRecordsWithAI(base64Image, apiKey) {
  if (!base64Image || !apiKey) return { records: [], stock: null }

  try {
    const response = await axios.post(
      DEEPSEEK_API,
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              },
              {
                type: 'text',
                text: '请识别这张券商交易记录截图中的所有买卖记录。'
              }
            ]
          }
        ],
        temperature: 0,
        max_tokens: 2000
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 30000
      }
    )

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) {
      console.error('[TradeAI] DeepSeek 返回空内容')
      return { records: [], stock: null }
    }

    console.log('[TradeAI] 原始返回:', content.slice(0, 300))

    // 解析 JSON
    const parsed = extractJson(content)
    if (!parsed) {
      console.error('[TradeAI] 无法解析返回 JSON')
      return { records: [], stock: null }
    }

    // 校验并规范化
    const records = normalizeRecords(parsed)
    const stock = normalizeStock(parsed)
    console.log(`[TradeAI] 识别到 ${records.length} 条交易记录, stock:`, stock)
    return { records, stock }
  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.error('[TradeAI] 请求超时')
    } else if (err.response) {
      console.error(`[TradeAI] API 错误 ${err.response.status}:`, JSON.stringify(err.response.data).slice(0, 300))
    } else {
      console.error('[TradeAI] 请求失败:', err.message)
    }
    return { records: [], stock: null }
  }
}

function extractJson(content) {
  const trimmed = content.trim()
  try { return JSON.parse(trimmed) } catch {}

  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1].trim()) } catch {}
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) } catch {}
  }

  return null
}

function normalizeRecords(parsed) {
  if (!parsed || typeof parsed !== 'object') return []

  const records = Array.isArray(parsed.records) ? parsed.records : (Array.isArray(parsed) ? parsed : [])

  return records
    .filter(r => r && typeof r === 'object')
    .map(r => ({
      type: r.type === 'buy' || r.type === 'sell' ? r.type : null,
      price: parseFloat(r.price) || 0,
      shares: parseInt(r.shares) || 0,
      date: normalizeDate(r.date),
      time: normalizeTime(r.time),
      note: 'AI截图导入'
    }))
    .filter(r => r.type && r.price > 0 && r.shares > 0)
}

function normalizeStock(parsed) {
  if (!parsed || typeof parsed !== 'object') return null
  const s = parsed.stock
  if (!s || typeof s !== 'object') return null
  const code = String(s.code || '').trim()
  const name = String(s.name || '').trim()
  if (!/^\d{6}$/.test(code) && !name) return null
  return { code: /^\d{6}$/.test(code) ? code : '', name: name || '' }
}

function normalizeDate(d) {
  if (!d) return ''
  const s = String(d).trim()
  // YYYYMMDD → YYYY-MM-DD
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
  }
  // 已是 YYYY-MM-DD 或 YYYY/MM/DD
  return s.replace(/\//g, '-')
}

function normalizeTime(t) {
  if (!t) return ''
  const m = String(t).trim().match(/([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?/)
  if (!m) return ''
  const hh = m[1].padStart(2, '0')
  const mm = m[2]
  const ss = m[3] ? m[3] : '00'
  // 限定 A 股交易时段（09:15~15:30），避免误匹配
  const minutes = parseInt(hh, 10) * 60 + parseInt(mm, 10)
  if (minutes < 9 * 60 + 15 || minutes > 15 * 60 + 30) return ''
  return `${hh}:${mm}:${ss}`
}
