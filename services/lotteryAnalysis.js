/**
 * 彩票数据分析与推荐服务
 *
 * 功能：
 * 1. 整体概率分析 - 每个号码的出现频率、冷热分布
 * 2. 位置概率分析 - 每个位置上各号码的出现频率
 * 3. 走势分析 - 遗漏值、冷热号、奇偶比、和值趋势等
 * 4. 智能推荐 - 基于多维度权重可调参数的方案生成
 */

// ==================== 彩票类型配置 ====================

const LOTTERY_CONFIG = {
  ssq: {
    name: '双色球',
    redRange: [1, 33],
    redCount: 6,
    blueRange: [1, 16],
    blueCount: 1,
    redName: '红球',
    blueName: '蓝球'
  },
  dlt: {
    name: '大乐透',
    redRange: [1, 35],
    redCount: 5,
    blueRange: [1, 12],
    blueCount: 2,
    redName: '前区',
    blueName: '后区'
  }
}

// ==================== 工具函数 ====================

/** 生成范围内的整数数组 */
function range(from, to) {
  const arr = []
  for (let i = from; i <= to; i++) arr.push(i)
  return arr
}

/** Fisher-Yates 洗牌 */
function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** 安全除法 */
function safeDiv(a, b) {
  return b === 0 ? 0 : parseFloat((a / b).toFixed(4))
}

/** 获取配置 */
function getConfig(type) {
  const cfg = LOTTERY_CONFIG[type]
  if (!cfg) throw new Error(`不支持的彩票类型: ${type}`)
  return cfg
}

// ==================== 1. 整体概率分析 ====================

/**
 * 计算每个号码的出现频率
 * @param {Array} data - 历史开奖数据
 * @param {string} type - ssq | dlt
 * @returns {Object} 红球/蓝球各号码的统计数据
 */
function computeOverallProbability(data, type) {
  const cfg = getConfig(type)
  const total = data.length

  // 初始化计数器
  const redCount = {}
  range(cfg.redRange[0], cfg.redRange[1]).forEach(n => { redCount[n] = 0 })
  const blueCount = {}
  range(cfg.blueRange[0], cfg.blueRange[1]).forEach(n => { blueCount[n] = 0 })

  // 最近出现期号
  const redLastSeen = {}
  const blueLastSeen = {}

  // 统计
  data.forEach((item, index) => {
    item.reds.forEach(r => { redCount[r] = (redCount[r] || 0) + 1; redLastSeen[r] = index })
    if (cfg.blueCount === 1) {
      blueCount[item.blue] = (blueCount[item.blue] || 0) + 1
      blueLastSeen[item.blue] = index
    } else {
      item.blues.forEach(b => { blueCount[b] = (blueCount[b] || 0) + 1; blueLastSeen[b] = index })
    }
  })

  // 组装红球统计
  const redStats = range(cfg.redRange[0], cfg.redRange[1]).map(n => ({
    number: n,
    count: redCount[n],
    frequency: safeDiv(redCount[n], total),
    missingPeriods: total - 1 - (redLastSeen[n] ?? -1), // 遗漏期数
    lastAppearance: redLastSeen[n] !== undefined ? data[redLastSeen[n]]?.date : null,
    hotScore: Math.round(safeDiv(redCount[n], total) * 100) // 热度分 0-100
  }))

  // 组装蓝球统计
  const blueStats = range(cfg.blueRange[0], cfg.blueRange[1]).map(n => ({
    number: n,
    count: blueCount[n],
    frequency: safeDiv(blueCount[n], total),
    missingPeriods: total - 1 - (blueLastSeen[n] ?? -1),
    lastAppearance: blueLastSeen[n] !== undefined ? data[blueLastSeen[n]]?.date : null,
    hotScore: Math.round(safeDiv(blueCount[n], total) * 100)
  }))

  // 热度排行
  const hotReds = [...redStats].sort((a, b) => b.count - a.count).slice(0, 10)
  const coldReds = [...redStats].sort((a, b) => b.missingPeriods - a.missingPeriods).slice(0, 10)
  const hotBlues = [...blueStats].sort((a, b) => b.count - a.count).slice(0, 6)
  const coldBlues = [...blueStats].sort((a, b) => b.missingPeriods - a.missingPeriods).slice(0, 6)

  return {
    type,
    totalPeriods: total,
    dataRange: { from: data[0]?.date, to: data[total - 1]?.date },
    redName: cfg.redName,
    blueName: cfg.blueName,
    reds: redStats,
    blues: blueStats,
    hotReds,
    coldReds,
    hotBlues,
    coldBlues
  }
}

// ==================== 2. 位置概率分析 ====================

/**
 * 计算每个位置上各号码的出现频率
 * 注意：数据中 reds/blues 已排序
 */
function computePositionProbability(data, type) {
  const cfg = getConfig(type)
  const total = data.length

  // 初始化每个位置的计数器: positionIndex -> { number: count }
  const redPosCount = Array.from({ length: cfg.redCount }, () => ({}))
  const bluePosCount = Array.from({ length: cfg.blueCount }, () => ({}))

  data.forEach(item => {
    item.reds.forEach((r, pos) => {
      redPosCount[pos][r] = (redPosCount[pos][r] || 0) + 1
    })
    if (cfg.blueCount === 1) {
      bluePosCount[0][item.blue] = (bluePosCount[0][item.blue] || 0) + 1
    } else {
      item.blues.forEach((b, pos) => {
        bluePosCount[pos][b] = (bluePosCount[pos][b] || 0) + 1
      })
    }
  })

  // 组装每个位置的 Top N 号码
  const redPositions = redPosCount.map((counter, pos) => {
    const list = range(cfg.redRange[0], cfg.redRange[1])
      .map(n => ({ number: n, count: counter[n] || 0, frequency: safeDiv(counter[n] || 0, total) }))
      .sort((a, b) => b.count - a.count)
    return {
      position: pos + 1,
      label: `${cfg.redName}第${pos + 1}位`,
      top5: list.slice(0, 5),
      all: list
    }
  })

  const bluePositions = bluePosCount.map((counter, pos) => {
    const list = range(cfg.blueRange[0], cfg.blueRange[1])
      .map(n => ({ number: n, count: counter[n] || 0, frequency: safeDiv(counter[n] || 0, total) }))
      .sort((a, b) => b.count - a.count)
    return {
      position: pos + 1,
      label: `${cfg.blueName}第${pos + 1}位`,
      top5: list.slice(0, 5),
      all: list
    }
  })

  return {
    type,
    totalPeriods: total,
    redPositions,
    bluePositions
  }
}

// ==================== 3. 走势分析 ====================

/**
 * 计算走势分析数据
 */
function computeTrendAnalysis(data, type) {
  const cfg = getConfig(type)
  const total = data.length

  // ---- 遗漏值 ----
  const redMissing = {}
  const blueMissing = {}
  range(cfg.redRange[0], cfg.redRange[1]).forEach(n => { redMissing[n] = [] })
  range(cfg.blueRange[0], cfg.blueRange[1]).forEach(n => { blueMissing[n] = [] })

  // ---- 每期统计 ----
  const periodStats = data.map((item, index) => {
    const reds = item.reds
    const blues = cfg.blueCount === 1 ? [item.blue] : item.blues

    const redSum = reds.reduce((a, b) => a + b, 0)
    const blueSum = blues.reduce((a, b) => a + b, 0)
    const oddReds = reds.filter(n => n % 2 === 1).length
    const evenReds = cfg.redCount - oddReds
    const oddBlues = blues.filter(n => n % 2 === 1).length

    // 连号
    let consecutiveReds = 0
    for (let i = 1; i < reds.length; i++) {
      if (reds[i] - reds[i - 1] === 1) consecutiveReds++
    }
    let consecutiveBlues = 0
    for (let i = 1; i < blues.length; i++) {
      if (blues[i] - blues[i - 1] === 1) consecutiveBlues++
    }

    return {
      date: item.date,
      index,
      reds,
      blues,
      redSum,
      blueSum,
      oddReds,
      evenReds,
      oddBlues,
      evenBlues: cfg.blueCount - oddBlues,
      consecutiveReds,
      consecutiveBlues
    }
  })

  // ---- 遗漏值序列 ----
  // 从最后一期往回推算遗漏
  const currentRedMissing = {}
  const currentBlueMissing = {}
  range(cfg.redRange[0], cfg.redRange[1]).forEach(n => { currentRedMissing[n] = total })
  range(cfg.blueRange[0], cfg.blueRange[1]).forEach(n => { currentBlueMissing[n] = total })

  for (let i = total - 1; i >= 0; i--) {
    const item = data[i]
    item.reds.forEach(r => { currentRedMissing[r] = 0 })
    if (cfg.blueCount === 1) {
      currentBlueMissing[item.blue] = 0
    } else {
      item.blues.forEach(b => { currentBlueMissing[b] = 0 })
    }

    // 记录当前的遗漏值
    for (const n of range(cfg.redRange[0], cfg.redRange[1])) {
      redMissing[n].push(currentRedMissing[n])
    }
    for (const n of range(cfg.blueRange[0], cfg.blueRange[1])) {
      blueMissing[n].push(currentBlueMissing[n])
    }

    // 所有遗漏值 +1
    for (const n of range(cfg.redRange[0], cfg.redRange[1])) {
      if (currentRedMissing[n] > 0) currentRedMissing[n]++
    }
    for (const n of range(cfg.blueRange[0], cfg.blueRange[1])) {
      if (currentBlueMissing[n] > 0) currentBlueMissing[n]++
    }
  }

  // 最新的遗漏值（当前冷号）
  const latestRedMissing = range(cfg.redRange[0], cfg.redRange[1]).map(n => ({
    number: n,
    missing: currentRedMissing[n] === total ? total : currentRedMissing[n] // 从未出现
  })).sort((a, b) => b.missing - a.missing)

  const latestBlueMissing = range(cfg.blueRange[0], cfg.blueRange[1]).map(n => ({
    number: n,
    missing: currentBlueMissing[n] === total ? total : currentBlueMissing[n]
  })).sort((a, b) => b.missing - a.missing)

  // ---- 滚动频率（最近 30/50/100 期） ----
  const rollingWindows = [30, 50, 100]
  const rollingFrequency = {}

  rollingWindows.forEach(window => {
    const slice = data.slice(Math.max(0, total - window))
    const redFreq = {}
    const blueFreq = {}
    range(cfg.redRange[0], cfg.redRange[1]).forEach(n => { redFreq[n] = 0 })
    range(cfg.blueRange[0], cfg.blueRange[1]).forEach(n => { blueFreq[n] = 0 })

    slice.forEach(item => {
      item.reds.forEach(r => { redFreq[r]++ })
      if (cfg.blueCount === 1) {
        blueFreq[item.blue]++
      } else {
        item.blues.forEach(b => { blueFreq[b]++ })
      }
    })

    rollingFrequency[window] = {
      reds: range(cfg.redRange[0], cfg.redRange[1]).map(n => ({
        number: n, count: redFreq[n], frequency: safeDiv(redFreq[n], slice.length)
      })),
      blues: range(cfg.blueRange[0], cfg.blueRange[1]).map(n => ({
        number: n, count: blueFreq[n], frequency: safeDiv(blueFreq[n], slice.length)
      }))
    }
  })

  // ---- 奇偶比分布 ----
  const oddEvenDistribution = {}
  periodStats.forEach(ps => {
    const key = `${ps.oddReds}:${ps.evenReds}`
    oddEvenDistribution[key] = (oddEvenDistribution[key] || 0) + 1
  })

  // ---- 和值分布 ----
  const sumBuckets = {}
  periodStats.forEach(ps => {
    const bucket = Math.floor(ps.redSum / 10) * 10
    const key = `${bucket}-${bucket + 9}`
    sumBuckets[key] = (sumBuckets[key] || 0) + 1
  })

  return {
    type,
    totalPeriods: total,
    dataRange: { from: data[0]?.date, to: data[total - 1]?.date },
    latestRedMissing,
    latestBlueMissing,
    rollingFrequency,
    oddEvenDistribution,
    sumBuckets,
    periodStats: periodStats.slice(-100) // 最近100期详细统计，前端走势图使用
  }
}

// ==================== 4. 智能推荐引擎 ====================

/**
 * 智能推荐方案生成
 *
 * @param {Array} data - 历史数据
 * @param {string} type - 彩票类型
 * @param {Object} options - 可调参数
 * @param {number} options.planCount - 生成方案数量 (默认5)
 * @param {number} options.hotWeight - 热号权重 0-100 (默认35)
 * @param {number} options.coldWeight - 冷号回补权重 0-100 (默认25)
 * @param {number} options.missingWeight - 遗漏回补权重 0-100 (默认20)
 * @param {number} options.randomWeight - 随机扰动权重 0-100 (默认20)
 * @param {number} options.recentPeriods - 近期范围期数 (默认50)
 * @param {number} options.oddEvenBalance - 奇偶平衡偏好 0-100 (默认60，越高越均衡)
 * @param {number} options.sumTargetMin - 和值下限 (null=不限制)
 * @param {number} options.sumTargetMax - 和值上限 (null=不限制)
 * @param {boolean} options.consecutiveAllow - 是否允许连号 (默认true)
 * @param {number} options.consecutiveMax - 最多连号组数 (默认2)
 * @param {number[]} options.excludeNumbers - 排除的号码
 * @param {number[]} options.fixedReds - 必选红球
 * @param {number[]} options.fixedBlues - 必选蓝球
 * @param {number} options.seed - 随机种子 (传相同种子生成相同方案)
 */
function generateRecommendations(data, type, options = {}) {
  const cfg = getConfig(type)

  const {
    planCount = 5,
    hotWeight = 35,
    coldWeight = 25,
    missingWeight = 20,
    randomWeight = 20,
    recentPeriods = 50,
    oddEvenBalance = 60,
    sumTargetMin = null,
    sumTargetMax = null,
    consecutiveAllow = true,
    consecutiveMax = 2,
    excludeNumbers = [],
    fixedReds = [],
    fixedBlues = [],
    seed = null
  } = options

  // 如果指定了种子，使用种子随机
  const rng = seed !== null ? seededRandom(seed) : Math.random

  const total = data.length
  const recentData = data.slice(Math.max(0, total - recentPeriods))

  // 计算各项得分
  const overallProb = computeOverallProbability(data, type)
  const redProbMap = {}
  const blueProbMap = {}
  overallProb.reds.forEach(r => { redProbMap[r.number] = r })
  overallProb.blues.forEach(b => { blueProbMap[b.number] = b })

  // 近期频率
  const recentRedFreq = {}
  const recentBlueFreq = {}
  range(cfg.redRange[0], cfg.redRange[1]).forEach(n => { recentRedFreq[n] = 0 })
  range(cfg.blueRange[0], cfg.blueRange[1]).forEach(n => { recentBlueFreq[n] = 0 })
  recentData.forEach(item => {
    item.reds.forEach(r => { recentRedFreq[r]++ })
    if (cfg.blueCount === 1) {
      recentBlueFreq[item.blue]++
    } else {
      item.blues.forEach(b => { recentBlueFreq[b]++ })
    }
  })

  // 计算加权得分
  function calcScore(number, isBlue = false) {
    const prob = isBlue ? blueProbMap[number] : redProbMap[number]
    const freq = isBlue ? recentBlueFreq[number] : recentRedFreq[number]
    if (!prob) return 0

    // 标准化各项得分到 0-100
    const hotScore = prob.hotScore // 0-100
    const coldScore = Math.min(100, prob.missingPeriods * 10) // 遗漏越长分越高
    const missingNorm = Math.min(100, (prob.missingPeriods / Math.max(1, total)) * 100)
    const recentScore = Math.min(100, safeDiv(freq, recentPeriods) * 100 * 6) // 近期出现频率
    const randomBonus = Math.floor(rng() * randomWeight) // 随机扰动

    const totalWeight = hotWeight + coldWeight + missingWeight + randomWeight
    if (totalWeight === 0) return randomBonus

    const score = (
      hotScore * hotWeight +
      coldScore * coldWeight +
      missingNorm * missingWeight +
      randomBonus
    ) / Math.max(1, totalWeight)

    return score
  }

  // 排除号码
  const excludeSet = new Set(excludeNumbers)
  const fixedRedSet = new Set(fixedReds)
  const fixedBlueSet = new Set(fixedBlues)

  // 可用号码池
  const availableReds = range(cfg.redRange[0], cfg.redRange[1])
    .filter(n => !excludeSet.has(n))
  const availableBlues = range(cfg.blueRange[0], cfg.blueRange[1])
    .filter(n => !excludeSet.has(n))

  /**
   * 从号码池中按权重抽样
   */
  function weightedSample(pool, count, fixedSet, scoreFn) {
    const fixed = pool.filter(n => fixedSet.has(n))
    const needCount = count - fixed.length
    if (needCount <= 0) return [...fixed].sort((a, b) => a - b).slice(0, count)

    // 计算权重
    const candidates = pool.filter(n => !fixedSet.has(n))
    const weights = candidates.map(n => Math.max(1, scoreFn(n) * 100))

    // 加权不放回抽样
    const selected = [...fixed]
    let remaining = [...candidates]
    let remainingWeights = [...weights]

    for (let i = 0; i < needCount; i++) {
      if (remaining.length === 0) break

      const totalW = remainingWeights.reduce((a, b) => a + b, 0)
      let rand = rng() * totalW
      let idx = 0
      while (rand > 0 && idx < remainingWeights.length) {
        rand -= remainingWeights[idx]
        idx++
      }
      idx = Math.max(0, idx - 1)

      selected.push(remaining[idx])
      // 移除已选
      remaining.splice(idx, 1)
      remainingWeights.splice(idx, 1)
    }

    return selected.sort((a, b) => a - b)
  }

  /**
   * 评估方案的奇偶平衡度
   */
  function oddEvenScore(nums) {
    const oddCount = nums.filter(n => n % 2 === 1).length
    const evenCount = nums.length - oddCount
    const diff = Math.abs(oddCount - evenCount)
    const maxDiff = nums.length
    return 100 - (diff / maxDiff) * 100 // 越平衡分越高
  }

  /**
   * 评估连号数量
   */
  function consecutiveCount(nums) {
    let cnt = 0
    for (let i = 1; i < nums.length; i++) {
      if (nums[i] - nums[i - 1] === 1) cnt++
    }
    return cnt
  }

  /**
   * 评估和值是否在目标范围
   */
  function sumScore(nums, min, max) {
    const sum = nums.reduce((a, b) => a + b, 0)
    if (min === null && max === null) return 100
    if (min !== null && sum < min) return Math.max(0, 100 - (min - sum) * 2)
    if (max !== null && sum > max) return Math.max(0, 100 - (sum - max) * 2)
    return 100
  }

  // 生成方案
  const plans = []

  for (let i = 0; i < planCount * 3 && plans.length < planCount; i++) {
    // 加权抽样红球
    const reds = weightedSample(availableReds, cfg.redCount, fixedRedSet, n => calcScore(n, false))

    // 加权抽样蓝球
    const blues = weightedSample(availableBlues, cfg.blueCount, fixedBlueSet, n => calcScore(n, true))

    // 方案质量评估
    const oe = oddEvenScore(reds)
    const con = consecutiveCount(reds)
    const sum = reds.reduce((a, b) => a + b, 0)
    const sScore = sumScore(reds, sumTargetMin, sumTargetMax)

    // 不符合连号要求则跳过
    if (!consecutiveAllow && con > 0) continue
    if (con > consecutiveMax) continue

    // 奇偶平衡
    if (oddEvenBalance > 0 && oe < oddEvenBalance - 20) continue

    // 和值范围
    if (sScore < 50) continue

    // 计算综合得分
    const quality = Math.round((oe * 0.3 + sScore * 0.3 + (100 - con * 10) * 0.2 + calcRedAvgScore(reds, calcScore) * 0.2))

    const redSum = reds.reduce((a, b) => a + b, 0)
    const blueSum = blues.reduce((a, b) => a + b, 0)

    plans.push({
      id: `plan-${i + 1}`,
      reds,
      blues: cfg.blueCount === 1 ? blues[0] : blues,
      redSum,
      blueSum,
      oddReds: reds.filter(n => n % 2 === 1).length,
      evenReds: reds.filter(n => n % 2 === 0).length,
      consecutiveReds: con,
      quality,
      analysis: {
        hotReds: reds.filter(n => redProbMap[n]?.hotScore >= 50).length,
        coldReds: reds.filter(n => redProbMap[n]?.missingPeriods >= 10).length
      }
    })
  }

  // 如果方案不够，随机补充
  while (plans.length < planCount) {
    const shuffledReds = shuffle(availableReds).slice(0, cfg.redCount).sort((a, b) => a - b)
    const shuffledBlues = shuffle(availableBlues).slice(0, cfg.blueCount)
    const redSum = shuffledReds.reduce((a, b) => a + b, 0)
    const blueSum = shuffledBlues.reduce((a, b) => a + b, 0)
    plans.push({
      id: `plan-random-${plans.length + 1}`,
      reds: shuffledReds,
      blues: cfg.blueCount === 1 ? shuffledBlues[0] : shuffledBlues.sort((a, b) => a - b),
      redSum,
      blueSum,
      oddReds: shuffledReds.filter(n => n % 2 === 1).length,
      evenReds: shuffledReds.filter(n => n % 2 === 0).length,
      consecutiveReds: consecutiveCount(shuffledReds),
      quality: 30,
      analysis: { hotReds: 0, coldReds: 0 }
    })
  }

  return {
    type,
    planCount: plans.length,
    params: {
      hotWeight,
      coldWeight,
      missingWeight,
      randomWeight,
      recentPeriods,
      oddEvenBalance,
      sumTargetMin,
      sumTargetMax,
      consecutiveAllow,
      consecutiveMax,
      excludeNumbers,
      fixedReds,
      fixedBlues
    },
    plans: plans.slice(0, planCount)
  }
}

/** 计算红球平均得分 */
function calcRedAvgScore(reds, scoreFn) {
  const scores = reds.map(n => scoreFn(n, false))
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

/** 简单的种子随机数生成器（Mulberry32） */
function seededRandom(seed) {
  let s = typeof seed === 'number' ? seed : hashString(String(seed))
  return function () {
    s |= 0; s = s + 0x6D2B79F5 | 0
    let t = Math.imul(s ^ s >>> 15, 1 | s)
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/** 字符串转哈希 */
function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash
}

// ==================== 5. 换一批方案生成 ====================

/**
 * 生成多组整体概率方案（用于"换一批"功能）
 * 每次调用返回新的随机方案
 */
function generateOverallPlans(data, type, batchCount = 5) {
  const cfg = getConfig(type)
  const overall = computeOverallProbability(data, type)

  const redNumbers = range(cfg.redRange[0], cfg.redRange[1])
  const blueNumbers = range(cfg.blueRange[0], cfg.blueRange[1])

  // 按热度排序的号码（用于加权）
  const hotRedWeights = overall.reds.map(r => r.hotScore)
  const hotBlueWeights = overall.blues.map(b => b.hotScore)

  function weightedPick(pool, weights, count) {
    const picked = []
    const remaining = [...pool]
    const remainWeights = [...weights]

    for (let i = 0; i < count && remaining.length > 0; i++) {
      const totalW = remainWeights.reduce((a, b) => a + b, 0)
      let rand = Math.random() * totalW
      let idx = 0
      while (rand > 0 && idx < remainWeights.length) {
        rand -= remainWeights[idx]
        idx++
      }
      idx = Math.max(0, idx - 1)
      picked.push(remaining[idx])
      remaining.splice(idx, 1)
      remainWeights.splice(idx, 1)
    }
    return picked.sort((a, b) => a - b)
  }

  const plans = []
  for (let i = 0; i < batchCount; i++) {
    const reds = weightedPick(redNumbers, hotRedWeights, cfg.redCount)
    const blues = weightedPick(blueNumbers, hotBlueWeights, cfg.blueCount)
    plans.push({
      reds,
      blues: cfg.blueCount === 1 ? blues[0] : blues,
      redSum: reds.reduce((a, b) => a + b, 0),
      blueSum: cfg.blueCount === 1 ? blues[0] : blues.reduce((a, b) => a + b, 0)
    })
  }

  return {
    type,
    method: '整体概率加权',
    totalPeriods: overall.totalPeriods,
    plans
  }
}

/**
 * 生成多组位置概率方案（用于"换一批"功能）
 * 每个位置独立按该位置的概率分布抽样
 */
function generatePositionPlans(data, type, batchCount = 5) {
  const cfg = getConfig(type)
  const posProb = computePositionProbability(data, type)

  function pickByPosition(posData) {
    const pool = posData.all
    const weights = pool.map(n => n.count + 1) // +1 避免权重全零
    const totalW = weights.reduce((a, b) => a + b, 0)
    let rand = Math.random() * totalW
    let idx = 0
    while (rand > 0 && idx < weights.length) {
      rand -= weights[idx]
      idx++
    }
    idx = Math.max(0, idx - 1)
    return pool[idx].number
  }

  const plans = []
  for (let i = 0; i < batchCount; i++) {
    // 每个位置独立按概率抽取
    let reds = posProb.redPositions.map(pos => pickByPosition(pos))
    // 去重并补全（位置抽样可能重复）
    reds = dedupAndFill(reds, cfg)

    let blues = posProb.bluePositions.map(pos => pickByPosition(pos))
    blues = dedupAndFillBlues(blues, cfg)

    plans.push({
      reds: reds.sort((a, b) => a - b),
      blues: cfg.blueCount === 1 ? blues[0] : blues.sort((a, b) => a - b),
      redSum: reds.reduce((a, b) => a + b, 0),
      blueSum: cfg.blueCount === 1 ? blues[0] : blues.reduce((a, b) => a + b, 0)
    })
  }

  return {
    type,
    method: '位置概率加权',
    totalPeriods: posProb.totalPeriods,
    plans
  }
}

/** 去重并补充红球 */
function dedupAndFill(nums, cfg) {
  const seen = new Set()
  const result = []
  for (const n of nums) {
    if (!seen.has(n)) {
      seen.add(n)
      result.push(n)
    }
  }
  // 如果不够，从未选中的号码中随机补充
  if (result.length < cfg.redCount) {
    const allNums = range(cfg.redRange[0], cfg.redRange[1])
    const unused = shuffle(allNums.filter(n => !seen.has(n)))
    while (result.length < cfg.redCount && unused.length > 0) {
      result.push(unused.pop())
    }
  }
  return result.slice(0, cfg.redCount)
}

/** 去重并补充蓝球 */
function dedupAndFillBlues(nums, cfg) {
  const seen = new Set()
  const result = []
  for (const n of nums) {
    if (!seen.has(n) && result.length < cfg.blueCount) {
      seen.add(n)
      result.push(n)
    }
  }
  if (result.length < cfg.blueCount) {
    const allNums = range(cfg.blueRange[0], cfg.blueRange[1])
    const unused = shuffle(allNums.filter(n => !seen.has(n)))
    while (result.length < cfg.blueCount && unused.length > 0) {
      result.push(unused.pop())
    }
  }
  return result.slice(0, cfg.blueCount)
}

// ==================== 导出 ====================

export {
  LOTTERY_CONFIG,
  computeOverallProbability,
  computePositionProbability,
  computeTrendAnalysis,
  generateRecommendations,
  generateOverallPlans,
  generatePositionPlans
}
