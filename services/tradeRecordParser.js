/**
 * 交易记录 OCR 文本解析器（多行版本）
 * 从券商截图 OCR 文本中提取买入/卖出记录
 *
 * 策略：跨多行分段解析
 * - 识别 "买入" 或 "卖出" 作为记录起点
 * - 后续多行包含日期、数量、价格、金额
 * - 遇到下一个 "买入/卖出" 或文本末尾视为当前记录结束
 */

const BUY_KEYWORDS = /(买入|融资买入|担保品买入|证券买入|开仓|建仓|加仓)/
const SELL_KEYWORDS = /(卖出|融券卖出|担保品卖出|证券卖出|平仓|降仓|清仓|减仓|赎回|转出|调减|减持)/

/**
 * 从 OCR 文本中解析交易记录
 */
export function parseTradeRecords(ocrText) {
  if (!ocrText) return []

  const lines = ocrText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0)

  // 按 "买入/卖出" 分段，每个段代表一条交易记录
  const records = []
  let currentRecord = null
  let currentType = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 检测交易方向：先排除含括号的特殊词（如"降仓（无买入）"应归为 sell）
    const isSellFirst = SELL_KEYWORDS.test(line)
    const isBuyFirst = !isSellFirst && BUY_KEYWORDS.test(line)
    if (isSellFirst || isBuyFirst) {
      // 保存之前的记录
      if (currentRecord) {
        records.push(finalizeRecord(currentRecord, currentType))
      }
      // 开始新记录
      currentRecord = { lines: [] }
      currentType = isSellFirst ? 'sell' : 'buy'
      continue
    }

    // 其他行加入当前记录（但忽略明显无关的行）
    if (currentRecord && !isNoiseLine(line)) {
      currentRecord.lines.push(line)
    }
  }

  // 处理最后一条记录
  if (currentRecord) {
    records.push(finalizeRecord(currentRecord, currentType))
  }

  return records.filter(Boolean)
}

/**
 * 判断是否为无关行（噪声过滤）
 */
function isNoiseLine(line) {
  // 标题、按钮、日期时间戳相关
  const noisePatterns = [
    /^东方财富$/,
    /^交易操作分析$/,
    /^交易记录$/,
    /^查看行情$/,
    /^持仓盈亏$/,
    /^当日参考盈亏$/,
    /^持股天数$/,
    /^个股仓位$/,
    /^现价$/,
    /^成本价$/,
    /^税费合计$/,
    /^\d{2}:\d{2}$/,
    /^共\d+条交易记录$/,
    /^[-+]?\d+\.\d+[%％]$/,
    /^[-+]?\d+\.\d{2,3}%$/,
    /^-$/,
    /^[A-Z]{1,3}\d{5,6}$/, // 股票代码
    /^\d{4}\/\d{1,2}\/\d{1,2}\s+\d{4}\/\d{1,2}\/\d{1,2}$/, // K线日期范围
  ]
  return noisePatterns.some(p => p.test(line))
}

/**
 * 从已收集的多行文本中提取一条交易记录
 */
function finalizeRecord(record, type) {
  const allText = record.lines.join(' ')
  if (!allText) return null

  // 提取日期
  const date = extractDate(record.lines.join('\n'))
  if (!date) return null

  // 提取价格（优先从"价格"关键字后面提取）
  const price = extractPrice(record.lines)
  if (!price) return null

  // 提取数量（100的倍数）
  const shares = extractShares(record.lines)
  if (!shares) return null

  // 提取费用（如有）
  const fee = extractFee(record.lines)

  return {
    type,
    price: +price.toFixed(3),
    shares,
    date,
    fee: fee !== null ? +fee.toFixed(2) : null,
    note: '截图导入',
  }
}

/**
 * 从多行中提取日期
 */
function extractDate(text) {
  // YYYY-MM-DD HH:MM:SS  或  YYYY-MM-DD
  const fullMatch = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (fullMatch) {
    return `${fullMatch[1]}-${fullMatch[2].padStart(2, '0')}-${fullMatch[3].padStart(2, '0')}`
  }
  // YYYYMMDD
  const compact = text.match(/(\d{4})(\d{2})(\d{2})/)
  if (compact) {
    return `${compact[1]}-${compact[2]}-${compact[3]}`
  }
  return ''
}

/**
 * 从多行中提取价格：优先在 "价格" 关键词后面的行中查找
 */
function extractPrice(lines) {
  // 先找 "价格" 关键字所在行，取其后面行中的数字
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '价格' || lines[i].includes('价格')) {
      // 向后查找含小数点的行（1~10000范围内的数字）
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const matches = lines[j].match(/(\d+\.\d{2,3})/g)
        if (matches) {
          for (const m of matches) {
            const v = parseFloat(m)
            if (v >= 0.01 && v <= 10000) return +v.toFixed(3)
          }
        }
      }
    }
  }
  // 退化：找第一个合理价格（排除大金额）
  const amounts = []
  for (const line of lines) {
    const matches = line.match(/(\d+\.\d{2,3})/g)
    if (!matches) continue
    for (const m of matches) {
      const v = parseFloat(m)
      // 价格通常 < 10000，金额通常 > 100（但我们仍需要区分）
      if (v >= 0.01 && v <= 10000) amounts.push(v)
    }
  }
  // 如果有多个数字，取较小的（价格通常小于金额）
  if (amounts.length >= 2) {
    amounts.sort((a, b) => a - b)
    return +amounts[0].toFixed(3)
  }
  return amounts[0] ? +amounts[0].toFixed(3) : null
}

/**
 * 从多行中提取股数（100的倍数，100~9999999）
 * 优先在 "数量" 关键词后面的行中查找
 */
function extractShares(lines) {
  // 先找 "数量" 关键字所在行
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '数量' || lines[i].includes('数量')) {
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const m = lines[j].match(/^(\d{2,6})$/)
        if (m) {
          const v = parseInt(m[1])
          if (v >= 100 && v <= 9999999 && v % 100 === 0) return v
        }
      }
    }
  }
  // 退化：找纯数字行（100的倍数）
  for (const line of lines) {
    const m = line.match(/^(\d{2,6})$/)
    if (m) {
      const v = parseInt(m[1])
      if (v >= 100 && v <= 9999999 && v % 100 === 0) return v
    }
  }
  return null
}

/**
 * 从多行中提取费用
 * 优先在 "费用" 关键字后面的行中查找数字
 * "费用"行可能是 "--"（无费用）、空行、或直接跟数字
 */
function extractFee(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === '费用' || lines[i].includes('费用')) {
      for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
        const m = lines[j].match(/(\d+\.\d{1,2})/)
        if (m) {
          const v = parseFloat(m[1])
          if (v >= 0 && v <= 100) return v
        }
      }
    }
  }
  return null
}