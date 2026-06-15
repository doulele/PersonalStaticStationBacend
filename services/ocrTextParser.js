/**
 * OCR 文本 + 坐标 → 彩票号码解析器
 *
 * 策略优先级：空间布局 → 标记拆分 → 行内解析 → 全量分块
 * 空间解析结果会经过可信度检查，不通过则回退到文本策略
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEBUG_FILE = path.join(__dirname, '..', 'ocr_debug.log')

function debugLog(msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19)
  const line = `[${ts}] ${msg}\n`
  process.stdout.write(line)  // 直接写 stdout，不受 pm2 缓冲影响
  try { fs.appendFileSync(DEBUG_FILE, line) } catch (_) {}
}

// 每次启动清空旧日志
try { fs.writeFileSync(DEBUG_FILE, `=== OCR Debug Log ${new Date().toISOString()} ===\n\n`) } catch (_) {}

// ── 彩票规则常量 ──
const SSQ = {
  RANGE_RED: [1, 33], RANGE_BLUE: [1, 16],
  FRONT_COUNT: 6, BACK_COUNT: 1, TOTAL: 7
}
const DLT = {
  RANGE_FRONT: [1, 35], RANGE_BACK: [1, 12],
  FRONT_COUNT: 5, BACK_COUNT: 2, TOTAL: 7
}

// 圈码标记字符（含各种 OCR 变体）
const MARKER_CHARS = '\u2460-\u2473\u2776-\u277F\u24EB-\u24F4'
const MARKER_RE = /[\u2460-\u2473\u2776-\u277F\u24EB-\u24F4]/
const MARKER_SPLIT_RE = /(?=[\u2460-\u2473\u2776-\u277F\u24EB-\u24F4])/

// 元数据关键词（这些行不包含号码）
const META_KEYS = /[年月日元倍票号券价]|开奖|合计|感谢|公益|周年|单式|地址|电话|-|\/|\./

/**
 * @param {string} ocrText
 * @param {object[]} [detections] - TextDetections（含 ItemPolygon）
 */
export function parseLotteryFromOcrText(ocrText, detections) {
  if (!ocrText || !ocrText.trim()) return []

  // ── 🔍 阶段0：原始 OCR 文本 ──
  debugLog('═══════════════════════════════════════')
  debugLog('[ocrTextParser.raw] 原始 OCR 文本:')
  debugLog(ocrText.substring(0, 2000))
  debugLog('───────────────────────────────────────')

  const cleanedText = cleanOcrText(ocrText)

  // ── 🔍 阶段1：清洗后对比 ──
  debugLog('[ocrTextParser.cleaned] 清洗后文本:')
  debugLog(cleanedText.substring(0, 2000))
  debugLog('───────────────────────────────────────')

  const lines = cleanedText.split('\n').map(l => l.trim()).filter(Boolean)
  const fullText = lines.join(' ')

  // 容错 OCR 变体："大乐运"、"大乐逃" 等 → 大乐透
  const isDLT = /大乐[透运逃逸]|超级大乐[透运逃逸]|DLT|dlt/i.test(fullText)
  // 二次确认：排除 SSQ 特有的关键词
  const isSSQ = /双色球|SSQ|ssq|红色球|蓝色球/i.test(fullText)
  const type = isDLT && !isSSQ ? 'dlt' : 'ssq'
  const rules = type === 'ssq' ? SSQ : DLT

  const issue = extractIssue(lines, fullText)

  // ── 🔍 阶段2：逐行数字提取 + 元数据过滤 ──
  debugLog('[ocrTextParser.lines] 逐行分析:')
  const allNumbers = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const nums = line.match(/\b\d{1,2}\b/g)
    const extractedNums = nums ? nums.map(Number).filter(n => n >= 1 && n <= 99) : []
    const isMeta = META_KEYS.test(line) && !/^\d{1,2}(\s+\d{1,2})+$/.test(line.trim())
    debugLog(`  [${i}] "${line.substring(0, 80)}" → 数字:${extractedNums.length}个 ${extractedNums.join(',')} | META过滤:${isMeta}`)
    if (nums) allNumbers.push(...extractedNums)
  }
  debugLog('───────────────────────────────────────')

  const hasDetections = detections && detections.length > 0
  debugLog(`[ocrTextParser] type=${type} issue=${issue} 总数字=${allNumbers.length} detections=${detections?.length || 0} 需≥${rules.TOTAL}`)

  if (allNumbers.length < rules.TOTAL) {
    debugLog('[ocrTextParser] ❌ 数字不足，放弃解析')
    return []
  }

  let groups = []
  let spatialTrusted = false

  // 预估应有组数（含元数据行可能掺入的噪音数字，取上限）
  const expectedGroups = Math.max(1, Math.floor(allNumbers.length / rules.TOTAL))

  // ════ 策略1：空间布局解析 ════
  if (hasDetections) {
    const spatialResult = parseBySpatialLayout(detections, type, rules)
    const trustScore = assessSpatialTrust(spatialResult.groups, lines, rules, type)
    console.log(`[ocrTextParser.spatial] ${spatialResult.groups.length} 组, 可信度=${trustScore.toFixed(1)}`)

    if (trustScore >= 0.4 && spatialResult.groups.length > 0 && spatialResult.groups.length >= expectedGroups * 0.5) {
      groups = spatialResult.groups
      spatialTrusted = true
    } else if (trustScore >= 0.4 && spatialResult.groups.length > 0) {
      // 空间结果可信但组数不足 → 作为种子，同时尝试文本策略补充
      groups = spatialResult.groups
      console.log(`[ocrTextParser.spatial] 空间 ${spatialResult.groups.length} 组 (需≥${Math.ceil(expectedGroups*0.5)})，作为种子同时跑文本策略`)
    } else {
      console.warn('[ocrTextParser.spatial] 空间解析不可信，回退文本策略')
    }
  }

  // ════ 策略2：标记拆分 ════
  const markerGroups = parseByMarkers(fullText, type, rules)
  if (markerGroups.length > 0) {
    console.log(`[ocrTextParser.markers] → ${markerGroups.length} 组`)
    groups = mergeGroups(groups, markerGroups)
  }

  // ════ 策略3：行内解析 ════
  if (groups.length < expectedGroups) {
    const lineGroups = parseByLines(lines, type, rules)
    if (lineGroups.length > 0) {
      console.log(`[ocrTextParser.lines] → ${lineGroups.length} 组`)
      groups = mergeGroups(groups, lineGroups)
    }
  }

  // ════ 策略4：全量分块 ════
  if (groups.length < expectedGroups) {
    const cleanNums = extractCleanNumbers(lines)
    const chunkGroups = parseByChunking(cleanNums, type, rules)
    if (chunkGroups.length > 0) {
      console.log(`[ocrTextParser.chunk] → ${chunkGroups.length} 组, 有效=${cleanNums.length}`)
      groups = mergeGroups(groups, chunkGroups)
    }
  }

  // 去重
  const seen = new Set()
  const unique = []
  for (const g of groups) {
    const key = type === 'ssq'
      ? `${g.numbers.reds.join(',')}|${g.numbers.blue}`
      : `${g.numbers.fronts.join(',')}|${g.numbers.backs.join(',')}`
    if (!seen.has(key)) {
      seen.add(key)
      g.issue = issue
      unique.push(g)
    }
  }

  debugLog(`[ocrTextParser] ✅ 最终=${unique.length} 组 (spatialTrusted=${spatialTrusted}) type=${type}`)
  if (unique.length > 0) {
    for (const g of unique) {
      debugLog(`  ${type==='ssq' ? `红:${g.numbers.reds} 蓝:${g.numbers.blue}` : `前:${g.numbers.fronts} 后:${g.numbers.backs}`}`)
    }
  }
  if (unique.length === 0) {
    debugLog('[ocrTextParser] ❌ 原文: ' + fullText.substring(0, 300))
  }
  return unique.slice(0, 10)
}

// ═══════════════════════════════════════════════════════
//  策略1：空间布局解析
// ═══════════════════════════════════════════════════════

function parseBySpatialLayout(detections, type, rules) {
  const numberItems = extractNumberItems(detections)

  if (numberItems.length < rules.TOTAL) {
    console.log(`[ocrTextParser.spatial] 仅 ${numberItems.length} 个数字项`)
    return { groups: [], rows: [] }
  }

  // 估算平均行高（用中位数，排除标题等极端高度的干扰）
  const heights = detections
    .map(d => d.ItemPolygon?.Height || d.Polygon?.Height || 0)
    .filter(h => h > 0)
    .sort((a, b) => a - b)
  const medianHeight = heights.length > 0
    ? heights[Math.floor(heights.length / 2)]
    : 30

  // 紧阈值：同行 Y 差不超过字高的 1/3
  const rowThreshold = Math.max(medianHeight * 0.33, 4)

  debugLog(`[ocrTextParser.spatial] medianHeight=${medianHeight.toFixed(1)} rowThreshold=${rowThreshold.toFixed(1)} items=${numberItems.length}`)

  // 按 Y 排序后聚类成行
  const sorted = [...numberItems].sort((a, b) => a.y - b.y)
  const rows = []

  for (const item of sorted) {
    let placed = false
    // 检查是否属于已有的某行
    for (let i = rows.length - 1; i >= 0; i--) {
      const rowCenter = rows[i]._cy / rows[i].items.length
      if (Math.abs(item.y - rowCenter) < rowThreshold) {
        rows[i].items.push(item)
        rows[i]._cy += item.y
        placed = true
        break
      }
    }
    if (!placed) {
      rows.push({ items: [item], _cy: item.y })
    }
  }

  console.log(`[ocrTextParser.spatial] 聚类:`, rows.map((r, i) => `${r.items.length}个 Y≈${(r._cy / r.items.length).toFixed(0)}`).join(' | '))

  // 每行内按 X 排序，提取号码；同时收集残行用于相邻合并
  const groups = []
  const orphans = [] // { nums, yCenter } — 无法独立成组的行
  const maxNum = Math.max(rules.RANGE_FRONT?.[1] || 35, rules.RANGE_BACK?.[1] || 16, 35)

  for (const row of rows) {
    row.items.sort((a, b) => a.x - b.x)
    const validNums = row.items.map(it => it.num).filter(n => n >= 1 && n <= maxNum)
    const yCenter = row._cy / row.items.length

    if (validNums.length >= rules.TOTAL) {
      const chunk = validNums.slice(0, rules.TOTAL)
      const g = makeGroup(chunk, type, rules)
      if (g) groups.push(g)
    } else if (validNums.length >= rules.FRONT_COUNT && validNums.length >= rules.FRONT_COUNT + 1) {
      // 接近完整，尝试宽松匹配
      const fronts = validNums.slice(0, rules.FRONT_COUNT)
      const backs = validNums.slice(rules.FRONT_COUNT, rules.FRONT_COUNT + rules.BACK_COUNT)
      if (fronts.length >= rules.FRONT_COUNT && backs.length >= 1) {
        const g = makeGroup([...fronts, ...backs], type, rules)
        if (g) groups.push(g)
      }
    } else if (validNums.length > 0) {
      // 保存为孤儿行，稍后尝试相邻合并
      orphans.push({ nums: validNums, y: yCenter })
    }
  }

  // ════ 相邻行合并：前区行（5个）+ 后区行（2个）合并为完整组 ════
  // 约束：仅合并 Y 间距 ≤ 1.5 倍字高的行（防止跨组越界）
  const maxYGap = medianHeight * 1.5
  if (orphans.length >= 2) {
    // 先按 Y 排序确保相邻
    orphans.sort((a, b) => a.y - b.y)
    const merged = new Set()
    for (let i = 0; i < orphans.length; i++) {
      if (merged.has(i)) continue
      const a = orphans[i]
      for (let j = i + 1; j < orphans.length; j++) {
        if (merged.has(j)) continue
        const b = orphans[j]
        // 行间距过大 → 属于不同组，跳过
        if (Math.abs(b.y - a.y) > maxYGap) break
        const combined = [...a.nums, ...b.nums]
        // 尝试 a 为前区、b 为后区
        if (a.nums.length >= rules.FRONT_COUNT && b.nums.length >= rules.BACK_COUNT && combined.length >= rules.TOTAL) {
          const fronts = a.nums.slice(0, rules.FRONT_COUNT)
          const backs = b.nums.slice(0, rules.BACK_COUNT)
          const g = makeGroup([...fronts, ...backs], type, rules)
          if (g) {
            groups.push(g)
            merged.add(i)
            merged.add(j)
            debugLog(`[ocrTextParser.spatial] 合并行 Y=${a.y.toFixed(0)}+${b.y.toFixed(0)} → ${fronts.length}+${backs.length}`)
            break
          }
        }
        // 尝试 b 为前区、a 为后区
        if (b.nums.length >= rules.FRONT_COUNT && a.nums.length >= rules.BACK_COUNT && combined.length >= rules.TOTAL) {
          const fronts = b.nums.slice(0, rules.FRONT_COUNT)
          const backs = a.nums.slice(0, rules.BACK_COUNT)
          const g = makeGroup([...fronts, ...backs], type, rules)
          if (g) {
            groups.push(g)
            merged.add(i)
            merged.add(j)
            debugLog(`[ocrTextParser.spatial] 合并行(反向) Y=${b.y.toFixed(0)}+${a.y.toFixed(0)} → ${fronts.length}+${backs.length}`)
            break
          }
        }
      }
    }
  }

  return { groups, rows }
}

/**
 * 空间解析可信度评估
 * - 组数太少（≤1但行数≥3）→ 不可信（阈值太宽合并了所有行）
 * - X 排序后的数字元序列 vs 原始文本行做交叉验证
 */
function assessSpatialTrust(groups, textLines, rules, type) {
  let score = 0

  // 1) 组数合理性
  const groupCount = groups.length
  const totalNumbers = textLines.reduce((s, l) => {
    return s + (l.match(/\b\d{1,2}\b/g) || []).length
  }, 0)
  const expectedGroups = Math.floor(totalNumbers / rules.TOTAL)
  const expectedClamped = Math.max(1, Math.min(10, expectedGroups))

  if (groupCount >= expectedClamped * 0.5) {
    score += 0.5
  } else if (groupCount >= 2) {
    score += 0.3
  } else {
    score += 0   // 仅1组 → 很可能不可信
  }

  // 2) 检查组内号码有效性
  let validGroupCount = 0
  for (const g of groups) {
    const nums = type === 'ssq'
      ? [...(g.numbers.reds || []), g.numbers.blue]
      : [...(g.numbers.fronts || []), ...(g.numbers.backs || [])]
    if (nums.length === rules.TOTAL) validGroupCount++
  }
  score += validGroupCount * 0.25

  // 3) 是否与文本行解析结果一致（交叉验证）
  // 简单检查：有几行文本自身含 ≥TOTAL 个数字
  let linesWithEnoughNums = 0
  for (const line of textLines) {
    if (META_KEYS.test(line)) continue
    const nums = (line.match(/\b\d{1,2}\b/g) || []).map(Number).filter(n => n >= 1 && n <= 99)
    if (nums.length >= rules.TOTAL) linesWithEnoughNums++
  }
  // 如果有多行满足条件但空间只返回少量 → 降低可信度
  if (linesWithEnoughNums > groupCount + 1) {
    score -= 0.3
  }

  return Math.max(0, Math.min(1, score))
}

/**
 * 从 TextDetections 提取带坐标的数字项
 * 处理两种情况：
 *   A) 一个 detection = 一个数字 → 用精确坐标
 *   B) 一个 detection = 一行数字 → 按空格拆分，估算每个数字的坐标
 */
function extractNumberItems(detections) {
  const items = []

  for (const det of detections) {
    const text = (det.DetectedText || '').trim()
    if (!text) continue

    // 获取坐标（优先 ItemPolygon，回退 Polygon 计算中心）
    let baseX, baseY, width, height
    const ip = det.ItemPolygon
    const pg = det.Polygon

    if (ip && ip.Y !== undefined) {
      baseY = ip.Y
      baseX = ip.X || 0
      width = ip.Width || 0
      height = ip.Height || 0
    } else if (pg && Array.isArray(pg) && pg.length >= 4) {
      // Polygon 是四个角的坐标 [{X,Y},{X,Y},{X,Y},{X,Y}]
      const xs = pg.map(p => p.X)
      const ys = pg.map(p => p.Y)
      baseX = Math.min(...xs)
      baseY = Math.min(...ys)
      width = Math.max(...xs) - baseX
      height = Math.max(...ys) - baseY
    } else {
      continue // 无坐标，跳过
    }

    // 跳过元数据行
    if (META_KEYS.test(text)) {
      // 但如果含圈码标记，说明是号码行（可能在日期后面跟号码）
      if (!MARKER_RE.test(text) && !/^\d{1,2}(\s+\d{1,2})+$/.test(text)) {
        continue
      }
    }

    // 提取该文本中所有 1-2 位数字
    const matches = [...text.matchAll(/\b(\d{1,2})\b/g)]

    if (matches.length === 1) {
      const num = parseInt(matches[0][1], 10)
      if (num >= 1 && num <= 99) {
        items.push({ num, y: baseY, x: baseX, w: width })
      }
    } else if (matches.length > 1) {
      // 多个数字 → 按空格拆分，估算每数字的水平位置
      const parts = text.split(/\s+/).filter(p => /^\d{1,2}$/.test(p))

      if (parts.length > 0) {
        const segW = width / Math.max(parts.length, 1)
        let cx = baseX
        for (const part of parts) {
          const num = parseInt(part, 10)
          if (num >= 1 && num <= 99) {
            items.push({ num, y: baseY, x: cx, w: segW })
          }
          cx += segW
        }
      } else {
        // 无空格分隔但有多数字 → 可能是粘连的连续数字
        const combined = text.replace(/\s+/g, '').replace(/[^\d]/g, '')
        if (/^\d{4,}$/.test(combined)) {
          let cx = baseX
          const segW = width / (combined.length / 2)
          for (let i = 0; i + 1 < combined.length; i += 2) {
            const num = parseInt(combined.substring(i, i + 2), 10)
            if (num >= 1 && num <= 99) {
              items.push({ num, y: baseY, x: cx, w: segW })
              cx += segW * 2
            }
          }
        }
      }
    }
  }

  return items
}

// ═══════════════════════════════════════════════════════
//  策略2：标记拆分
// ═══════════════════════════════════════════════════════

function parseByMarkers(fullText, type, rules) {
  const segments = fullText.split(MARKER_SPLIT_RE).filter(s => s.trim())
  if (segments.length <= 1) return []

  const startIdx = MARKER_RE.test(segments[0]?.trim()) ? 0 : 1
  const groups = []

  for (let i = startIdx; i < segments.length; i++) {
    const seg = segments[i]
    if (!MARKER_RE.test(seg.trim())) continue

    const nums = (seg.match(/\b\d{1,2}\b/g) || []).map(Number).filter(n => n >= 1 && n <= 99)

    // 该段有 ≥2倍 TOTAL 的数字 → 下一个标记丢失了，拆分
    if (nums.length >= rules.TOTAL * 2) {
      for (let j = 0; j + rules.TOTAL <= nums.length; j += rules.TOTAL) {
        const chunk = nums.slice(j, j + rules.TOTAL)
        const g = makeGroup(chunk, type, rules)
        if (g) groups.push(g)
      }
    } else if (nums.length >= rules.TOTAL) {
      const g = makeGroup(nums.slice(0, rules.TOTAL), type, rules)
      if (g) groups.push(g)
      // 剩余 ≥TOTAL 也尝试
      const rest = nums.slice(rules.TOTAL)
      if (rest.length >= rules.TOTAL) {
        const g2 = makeGroup(rest.slice(0, rules.TOTAL), type, rules)
        if (g2) groups.push(g2)
      }
    }
  }

  return groups
}

// ═══════════════════════════════════════════════════════
//  策略3：行内解析
// ═══════════════════════════════════════════════════════

function parseByLines(lines, type, rules) {
  const groups = []
  const orphanLines = [] // { idx, nums }

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (META_KEYS.test(line) && !/^\d{1,2}(\s+\d{1,2})+$/.test(line.trim())) continue
    const nums = (line.match(/\b\d{1,2}\b/g) || []).map(Number).filter(n => n >= 1 && n <= 99)
    if (nums.length >= rules.TOTAL) {
      for (let i = 0; i + rules.TOTAL <= nums.length; i += rules.TOTAL) {
        const chunk = nums.slice(i, i + rules.TOTAL)
        const g = makeGroup(chunk, type, rules)
        if (g) groups.push(g)
        // 剩余部分作为孤儿
        const rest = nums.slice(i + rules.TOTAL)
        if (rest.length > 0) orphanLines.push({ idx: li, nums: rest })
      }
    } else if (nums.length > 0) {
      orphanLines.push({ idx: li, nums })
    }
  }

  // 相邻孤儿行合并：前区行 + 紧邻的后区行 → 完整组
  // 约束：以圈码标记（①②③④⑤）开头的行代表新组开始，不可与更前面的行合并
  if (orphanLines.length >= 2) {
    const merged = new Set()
    for (let i = 0; i < orphanLines.length; i++) {
      if (merged.has(i)) continue
      const a = orphanLines[i]
      for (let j = i + 1; j < orphanLines.length; j++) {
        if (merged.has(j)) continue
        const b = orphanLines[j]
        const bText = lines[b.idx] || ''

        // 尝试 a=前区, b=后区
        if (a.nums.length >= rules.FRONT_COUNT && b.nums.length >= rules.BACK_COUNT) {
          const fronts = a.nums.slice(0, rules.FRONT_COUNT)
          const backs = b.nums.slice(0, rules.BACK_COUNT)
          const g = makeGroup([...fronts, ...backs], type, rules)
          if (g) {
            groups.push(g)
            merged.add(i)
            merged.add(j)
            console.log(`[ocrTextParser.lines] 合并行 #${a.idx}+#${b.idx} → ${fronts.length}+${backs.length}`)
            break
          }
        }
        // 尝试 b=前区, a=后区 → 当 b 以圈码标记开头时，不可与前面的 a 合并（跨组越界）
        if (b.nums.length >= rules.FRONT_COUNT && a.nums.length >= rules.BACK_COUNT) {
          // 关键检查：b 所在行以标记开头 → 是新组的开始，不应往前合并
          if (MARKER_RE.test(bText.charAt(0))) continue
          const fronts = b.nums.slice(0, rules.FRONT_COUNT)
          const backs = a.nums.slice(0, rules.BACK_COUNT)
          const g = makeGroup([...fronts, ...backs], type, rules)
          if (g) {
            groups.push(g)
            merged.add(i)
            merged.add(j)
            console.log(`[ocrTextParser.lines] 合并行(反向) #${b.idx}+#${a.idx} → ${fronts.length}+${backs.length}`)
            break
          }
        }
      }
    }
  }

  return groups
}

// ═══════════════════════════════════════════════════════
//  策略4：过滤元数据后全量分块
// ═══════════════════════════════════════════════════════

function extractCleanNumbers(lines) {
  const cleanNums = []
  for (const line of lines) {
    if (META_KEYS.test(line)) continue
    const nums = line.match(/\b\d{1,2}\b/g)
    if (nums) cleanNums.push(...nums.map(Number).filter(n => n >= 1 && n <= 99))
  }
  return cleanNums
}

function parseByChunking(cleanNums, type, rules) {
  const groups = []
  for (let i = 0; i + rules.TOTAL <= cleanNums.length; i += rules.TOTAL) {
    const chunk = cleanNums.slice(i, i + rules.TOTAL)
    const g = makeGroup(chunk, type, rules)
    if (g) groups.push(g)
  }
  return groups
}

// ═══════════════════════════════════════════════════════
//  合并去重
// ═══════════════════════════════════════════════════════

/**
 * 合并两组号组，按号码内容去重
 */
function mergeGroups(existing, incoming) {
  const seen = new Set()
  const result = [...existing]
  for (const g of result) {
    const key = g.type === 'ssq'
      ? `${g.numbers.reds.join(',')}|${g.numbers.blue}`
      : `${g.numbers.fronts.join(',')}|${g.numbers.backs.join(',')}`
    seen.add(key)
  }
  for (const g of incoming) {
    const key = g.type === 'ssq'
      ? `${g.numbers.reds.join(',')}|${g.numbers.blue}`
      : `${g.numbers.fronts.join(',')}|${g.numbers.backs.join(',')}`
    if (!seen.has(key)) {
      seen.add(key)
      result.push(g)
    }
  }
  return result
}

// ═══════════════════════════════════════════════════════
//  号组建构
// ═══════════════════════════════════════════════════════

function makeGroup(nums, type, rules) {
  if (nums.length !== rules.TOTAL) return null
  return type === 'ssq' ? makeSSQGroup(nums, rules) : makeDLTGroup(nums, rules)
}

function makeSSQGroup(nums7, rules) {
  const reds = nums7.slice(0, rules.FRONT_COUNT)
  const blue = nums7[rules.FRONT_COUNT]
  const validReds = reds.filter(n => n >= rules.RANGE_RED[0] && n <= rules.RANGE_RED[1])
  if (validReds.length < rules.FRONT_COUNT) return null
  if (blue < rules.RANGE_BLUE[0] || blue > rules.RANGE_BLUE[1]) return null
  const uniqueReds = [...new Set(validReds)].sort((a, b) => a - b)
  if (uniqueReds.length < rules.FRONT_COUNT) return null
  let finalReds = uniqueReds.filter(n => n !== blue)
  if (finalReds.length < rules.FRONT_COUNT) finalReds = uniqueReds.slice(0, rules.FRONT_COUNT)
  if (finalReds.length !== rules.FRONT_COUNT) return null
  return { type: 'ssq', issue: '', numbers: { reds: finalReds, blue } }
}

function makeDLTGroup(nums7, rules) {
  const fronts = nums7.slice(0, rules.FRONT_COUNT)
  const backs = nums7.slice(rules.FRONT_COUNT, rules.FRONT_COUNT + rules.BACK_COUNT)
  const validFronts = fronts.filter(n => n >= rules.RANGE_FRONT[0] && n <= rules.RANGE_FRONT[1])
  const validBacks = backs.filter(n => n >= rules.RANGE_BACK[0] && n <= rules.RANGE_BACK[1])
  if (validFronts.length < rules.FRONT_COUNT || validBacks.length < rules.BACK_COUNT) return null
  const uniqueFronts = [...new Set(validFronts)].sort((a, b) => a - b)
  const uniqueBacks = [...new Set(validBacks)].sort((a, b) => a - b)
  if (uniqueFronts.length < rules.FRONT_COUNT || uniqueBacks.length < rules.BACK_COUNT) return null
  return {
    type: 'dlt', issue: '',
    numbers: { fronts: uniqueFronts.slice(0, rules.FRONT_COUNT), backs: uniqueBacks.slice(0, rules.BACK_COUNT) }
  }
}

// ═══════════════════════════════════════════════════════
//  辅助
// ═══════════════════════════════════════════════════════

function extractIssue(lines, fullText) {
  const m = fullText.match(/第\s*(\d{5,7})\s*期/)
  if (m) return m[1]
  for (const l of lines) {
    const n = l.match(/(\d{5,7})/)
    if (n && /^\d{5,7}$/.test(n[1])) return n[1]
  }
  return ''
}

function cleanOcrText(text) {
  let t = text

  // ── 步骤日志 ──
  const logStep = (label, before) => {
    if (t !== before) {
      debugLog(`[cleanOcrText] 🔧 ${label}`)
      debugLog(`  Before: ${before.substring(0, 200)}`)
      debugLog(`  After:  ${t.substring(0, 200)}`)
    }
  }

  let prev = t

  // 字母→数字
  t = t.replace(/(?<=\d)\s*[Oo]\s*(?=\d)/g, '0')
  logStep('数字间的O→0', prev); prev = t

  t = t.replace(/\b[Oo]\b/g, '0')
  logStep('独立的O→0', prev); prev = t

  t = t.replace(/(?<=\d)\s*[lI]\s*(?=\d)/g, '1')
  logStep('数字间的l/I→1', prev); prev = t

  t = t.replace(/\b[l]\b(?!.*[a-zA-Z]{2})/g, '1')
  logStep('独立的l→1', prev); prev = t

  t = t.replace(/\b[S]\b/g, (m, off) => /\d/.test(t.substring(Math.max(0, off - 10), off + 10)) ? '5' : m)
  logStep('S→5(近数字)', prev); prev = t

  t = t.replace(/\b[Z]\b/g, (m, off) => /\d/.test(t.substring(Math.max(0, off - 10), off + 10)) ? '2' : m)
  logStep('Z→2(近数字)', prev); prev = t

  t = t.replace(/\b[B]\b/g, (m, off) => /\d/.test(t.substring(Math.max(0, off - 10), off + 10)) ? '8' : m)
  logStep('B→8(近数字)', prev); prev = t

  t = t.replace(/[ \t]+/g, ' ')
  // logStep('合并空白', prev); prev = t  (太频繁，跳过日志)

  t = t.split('\n').map(l => l.trim()).join('\n')
  // logStep('trim行', prev); prev = t

  t = t.replace(/^O$/gm, '0')
  logStep('整行单O→0', prev); prev = t

  t = t.replace(/^l$/gm, '1')
  logStep('整行单l→1', prev); prev = t

  // 纯数字粘连行拆分
  t = t.split('\n').map(line => {
    if (/^\d{4,}$/.test(line.trim())) return line.trim().replace(/(\d{2})/g, '$1 ').trim()
    return line
  }).join('\n')
  logStep('纯数字粘连拆分', prev); prev = t

  t = t.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  logStep('移除控制字符', prev); prev = t

  return t
}
