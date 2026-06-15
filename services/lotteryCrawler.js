/**
 * 彩票全量历史数据爬虫服务
 * 从 datachart.500.com 爬取双色球/大乐透全量历史开奖数据
 * 同时支持从 RollToolsApi (mxnzp.com) 获取近期数据
 */
import axios from 'axios'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { proxyRequest } from './httpProxy.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.resolve(__dirname, '..', 'cache')

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ==================== 500.com 爬虫 ====================

/**
 * 从 datachart.500.com 爬取全量历史数据
 * @param {'ssq' | 'dlt'} type
 * @returns {Promise<Array<{date: string, reds: number[], blue?: number, blues?: number[]}>>}
 */
export async function crawlFrom500(type) {
  const url = get500Url(type)
  console.log(`[Crawler] 开始从 500.com 爬取 ${type === 'ssq' ? '双色球' : '大乐透'} 全量数据...`)
  console.log(`[Crawler] URL: ${url}`)

  const response = await axios.get(url, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Referer': 'https://datachart.500.com/'
    },
    timeout: 30000,
    responseType: 'text'
  })

  const html = response.data
  console.log(`[Crawler] 获取到 HTML，长度: ${html.length}`)

  const rows = parse500Rows(html, type)
  console.log(`[Crawler] 解析到 ${rows.length} 期原始数据`)

  // 数据验证：过滤异常数据
  const validRows = rows.filter(row => validateRow(row, type))
  const invalidCount = rows.length - validRows.length
  if (invalidCount > 0) {
    console.warn(`[Crawler] ⚠️ 过滤掉 ${invalidCount} 条异常数据`)
  }
  console.log(`[Crawler] 有效数据 ${validRows.length} 期`)

  // 按日期升序排列
  validRows.sort((a, b) => a.date.localeCompare(b.date))

  if (validRows.length > 0) {
    console.log(`[Crawler] 数据范围: ${validRows[0].date} ~ ${validRows[validRows.length - 1].date}`)
  }

  return validRows
}

function get500Url(type) {
  const now = new Date()
  const year = now.getFullYear()
  const endIssue = `${String(year).slice(2)}999` // 最新期号

  if (type === 'ssq') {
    // 双色球 2003 年开始
    return `https://datachart.500.com/ssq/history/newinc/history.php?start=03001&end=${endIssue}`
  } else {
    // 大乐透 2007 年开始
    return `https://datachart.500.com/dlt/history/newinc/history.php?start=07001&end=${endIssue}`
  }
}

/**
 * 解析 500.com HTML 表格行
 */
function parse500Rows(html, type) {
  const results = []

  // 匹配所有 t_tr1 行（数据行）
  const rowRegex = /<tr[^>]*class="t_tr1"[^>]*>([\s\S]*?)<\/tr>/gi
  let rowMatch

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const rowHtml = rowMatch[1]
    const cells = extractCells(rowHtml)

    if (cells.length < 4) continue // 至少需要: 期号, 号码1, 号码2, 日期

    const record = type === 'ssq'
      ? parseSSQRow(cells)
      : parseDLTRow(cells)

    if (record) {
      results.push(record)
    }
  }

  return results
}

/**
 * 从行 HTML 中提取所有 <td> 内容（去除 HTML 标签）
 */
function extractCells(rowHtml) {
  const cells = []
  const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi
  let match

  while ((match = cellRegex.exec(rowHtml)) !== null) {
    // 去除内部 HTML 标签，只保留文本
    const text = match[1].replace(/<[^>]+>/g, '').trim()
    cells.push(text)
  }

  return cells
}

/**
 * 解析双色球行
 * 500.com 当前表格列（每个红球独立 <td>）:
 *   期号 | 红球1 | 红球2 | 红球3 | 红球4 | 红球5 | 红球6 | 蓝球 | 快乐星期天 | 奖池奖金 | 一等注数 | 一等金额 | 二等注数 | 二等金额 | 总投注额 | 开奖日期
 * 注意: 奖池、金额等含逗号(如 658,469,423)，需排除
 */
function parseSSQRow(cells) {
  // 找期号列（5-7位数字）
  const issueIdx = cells.findIndex(c => /^\d{5,7}$/.test(c))
  if (issueIdx === -1) return null

  // 找日期列
  const dateIdx = cells.findIndex(c => /^\d{4}-\d{2}-\d{2}$/.test(c))
  if (dateIdx === -1) return null

  // 在期号和日期之间，按列顺序收集纯数字单元格（排除含逗号的金额列）
  // 表格列顺序固定: 期号 | 红1 | 红2 | 红3 | 红4 | 红5 | 红6 | 蓝球 | ...(金额/注数)... | 日期
  const reds = []
  let blueNum = 0

  for (let i = issueIdx + 1; i < dateIdx && i < cells.length; i++) {
    const cell = cells[i]
    // 只取 1-2 位纯数字，排除含逗号的金额（如 658,469,423）、空单元格
    if (!/^\d{1,2}$/.test(cell)) continue
    const num = parseInt(cell, 10)

    if (reds.length < 6 && num >= 1 && num <= 33) {
      reds.push(num)
    } else if (reds.length === 6 && num >= 1 && num <= 16 && !blueNum) {
      blueNum = num
      break // 取到蓝球后立即停止，避免误取后续注数列
    }
  }

  if (reds.length < 6 || !blueNum) return null

  return {
    date: cells[dateIdx],
    reds,
    blue: blueNum
  }
}

/**
 * 解析大乐透行
 * 500.com 当前表格列（每个号码独立 <td>）:
 *   期号 | 前区1 | 前区2 | 前区3 | 前区4 | 前区5 | 后区1 | 后区2 | 奖池奖金 | 一等注数 | 一等金额 | 二等注数 | 二等金额 | 总投注额 | 开奖日期
 * 前区范围: 01-35, 后区范围: 01-12
 */
function parseDLTRow(cells) {
  // 找期号列（5-7位数字）
  const issueIdx = cells.findIndex(c => /^\d{5,7}$/.test(c))
  if (issueIdx === -1) return null

  // 找日期列
  const dateIdx = cells.findIndex(c => /^\d{4}-\d{2}-\d{2}$/.test(c))
  if (dateIdx === -1) return null

  // 在期号和日期之间，按列顺序收集纯数字单元格（排除含逗号的金额列）
  // 表格列顺序固定: 期号 | 前1 | 前2 | 前3 | 前4 | 前5 | 后1 | 后2 | ...(金额/注数)... | 日期
  const reds = []
  const blues = []

  for (let i = issueIdx + 1; i < dateIdx && i < cells.length; i++) {
    const cell = cells[i]
    // 只取 1-2 位纯数字，排除含逗号的金额（如 658,469,423）、空单元格
    if (!/^\d{1,2}$/.test(cell)) continue
    const num = parseInt(cell, 10)

    if (reds.length < 5 && num >= 1 && num <= 35) {
      reds.push(num)
    } else if (blues.length < 2 && num >= 1 && num <= 12) {
      blues.push(num)
    }
    if (reds.length === 5 && blues.length === 2) break
  }

  if (reds.length < 5 || blues.length < 2) return null

  return {
    date: cells[dateIdx],
    reds,
    blues
  }
}

/**
 * 验证解析出的数据行是否合法
 */
function validateRow(row, type) {
  if (!row || !row.date || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) return false

  if (type === 'ssq') {
    // 双色球: 6 红球(1-33) + 1 蓝球(1-16)
    if (!row.reds || row.reds.length !== 6) return false
    if (row.reds.some(n => n < 1 || n > 33)) return false
    if (!row.blue || row.blue < 1 || row.blue > 16) return false
  } else {
    // 大乐透: 5 前区(1-35) + 2 后区(1-12)
    if (!row.reds || row.reds.length !== 5) return false
    if (row.reds.some(n => n < 1 || n > 35)) return false
    if (!row.blues || row.blues.length !== 2) return false
    if (row.blues.some(n => n < 1 || n > 12)) return false
  }

  return true
}

// ==================== RollToolsApi 近期数据获取 ====================

/**
 * 通过 RollToolsApi 获取近期开奖数据
 * @param {'ssq' | 'dlt'} type
 * @param {number} count - 获取数量（最大300）
 * @param {string} appId
 * @param {string} appSecret
 * @returns {Promise<Array<{date: string, reds: number[], blue?: number, blues?: number[]}>>}
 */
export async function fetchRecentFromAPI(type, count, appId, appSecret) {
  const code = type === 'ssq' ? 'ssq' : 'cjdlt'
  const target = 'https://www.mxnzp.com/api/lottery/common'

  console.log(`[API Sync] 从 RollToolsApi 获取 ${type} 最近 ${count} 期...`)

  // 尝试一次性获取 count 条
  const params = new URLSearchParams({
    code,
    count: String(Math.min(count, 300)),
    app_id: appId,
    app_secret: appSecret
  })

  const url = `${target}/history?${params.toString()}`

  const result = await proxyRequest(url, {
    headers: { 'Content-Type': 'application/json' },
    responseType: 'json'
  })

  if (!result.data || result.data.code !== 1) {
    console.error(`[API Sync] API 返回错误:`, result.data?.msg)
    throw new Error(`API 返回错误: ${result.data?.msg || '未知错误'}`)
  }

  const rawList = Array.isArray(result.data.data) ? result.data.data : []
  console.log(`[API Sync] 获取到 ${rawList.length} 条原始数据`)

  // 解析为标准格式
  const parsed = rawList.map(d => {
    const date = (d.time || '').split(' ')[0]
    const parsedCode = parseOpenCode(d.openCode, type)

    if (type === 'ssq') {
      return {
        date: date || '0000-00-00',
        reds: parsedCode.reds || [],
        blue: parsedCode.blue || 0
      }
    } else {
      return {
        date: date || '0000-00-00',
        reds: parsedCode.fronts || [],
        blues: parsedCode.backs || []
      }
    }
  }).filter(item => item.date !== '0000-00-00' && item.reds.length > 0)

  // 按日期升序
  parsed.sort((a, b) => a.date.localeCompare(b.date))

  console.log(`[API Sync] 解析得到 ${parsed.length} 条有效数据`)
  return parsed
}

/**
 * 解析 RollToolsApi 返回的 openCode
 * 与前端 src/api/lottery.js 中 parseOpenCode 逻辑一致
 */
function parseOpenCode(openCode, type) {
  if (!openCode) return {}

  const cleaned = openCode.trim()
  let main = '', special = ''
  const plusIdx = cleaned.indexOf('+')

  if (plusIdx > -1) {
    main = cleaned.slice(0, plusIdx).trim()
    special = cleaned.slice(plusIdx + 1).replace(/\+/g, ',').trim()
  } else {
    main = cleaned
  }

  const mainNums = main.split(',').map(Number).filter(n => !isNaN(n) && n > 0)
  const specialNums = special.split(',').map(Number).filter(n => !isNaN(n) && n > 0)

  if (type === 'ssq') {
    return {
      reds: mainNums.slice(0, 6),
      blue: specialNums[0] || mainNums[6] || 0
    }
  } else {
    const allNums = [...mainNums, ...specialNums]
    return {
      fronts: allNums.slice(0, 5),
      backs: allNums.slice(5, 7)
    }
  }
}

// ==================== 缓存管理 ====================

/**
 * 确保缓存目录存在
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true })
  }
}

/**
 * 获取缓存文件路径
 */
function getCachePath(type) {
  return path.join(CACHE_DIR, `${type}_full.json`)
}

/**
 * 读取缓存数据
 */
export function readCache(type) {
  try {
    const filePath = getCachePath(type)
    if (!fs.existsSync(filePath)) return null
    const raw = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch (e) {
    console.error(`[Cache] 读取 ${type} 缓存失败:`, e.message)
    return null
  }
}

/**
 * 写入缓存数据
 */
export function writeCache(type, data) {
  ensureCacheDir()
  const filePath = getCachePath(type)
  // 按日期排序
  data.sort((a, b) => a.date.localeCompare(b.date))
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  console.log(`[Cache] ${type} 缓存已写入，共 ${data.length} 条`)
}

/**
 * 合并数据（去重，按日期排序）
 */
export function mergeData(existing, newData) {
  if (!existing || existing.length === 0) return newData

  const dateSet = new Set(existing.map(d => d.date))
  const merged = [...existing]

  for (const item of newData) {
    if (!dateSet.has(item.date)) {
      merged.push(item)
      dateSet.add(item.date)
    }
  }

  merged.sort((a, b) => a.date.localeCompare(b.date))
  return merged
}

/**
 * 获取缓存统计信息
 */
export function getCacheStats() {
  const stats = {}
  for (const type of ['ssq', 'dlt']) {
    const data = readCache(type)
    stats[type] = data
      ? { count: data.length, firstDate: data[0]?.date, lastDate: data[data.length - 1]?.date }
      : { count: 0, firstDate: null, lastDate: null }
  }
  return stats
}
