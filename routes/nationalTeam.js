/**
 * 国家队动向监测 — API 路由
 * ------------------------------------------------------------
 * GET  /national-team/signal     — 获取今日信号
 * GET  /national-team/etf-data   — 获取ETF数据
 * GET  /national-team/history    — 获取历史信号对比
 * GET  /national-team/anomalies  — 获取异动列表
 * GET  /national-team/status     — 数据源状态
 * GET  /national-team/trigger-log— 触发日志
 * POST /national-team/trigger    — 手动触发采集
 */
import { Router } from 'express'
import {
  runDailyTask, getTodaySignal, getSignalHistory, getAllAgencySignals,
  getETFData, getETFHistory, getAnomalies, getDataSourceStatus,
  createTriggerLog, updateTriggerLog, getLatestTriggerLog, getTriggerLogs
} from '../services/nationalTeamService.js'

const router = Router()

/** 获取今天的日期字串 */
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

/**
 * GET /national-team/signal
 * 获取今日信号（默认总览），支持 ?date=&agency=
 */
router.get('/signal', (req, res) => {
  try {
    const date = req.query.date || todayStr()
    const agency = req.query.agency || 'overview'
    const signal = getTodaySignal(date, agency)

    if (!signal) {
      return res.json({ code: 0, data: null, message: '该日期暂无信号数据，请先触发数据采集' })
    }

    // 解析 JSON 字段
    if (signal.etf_scores && typeof signal.etf_scores === 'string') {
      try { signal.etf_scores = JSON.parse(signal.etf_scores) } catch { /* keep as string */ }
    }

    res.json({ code: 0, data: signal })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

/**
 * GET /national-team/etf-data
 * 获取ETF每日数据，支持 ?date= 和 ?days=
 */
router.get('/etf-data', (req, res) => {
  try {
    const date = req.query.date
    const days = parseInt(req.query.days) || 0

    if (date) {
      const data = getETFData(date)
      return res.json({ code: 0, data })
    }

    if (days > 0) {
      const data = getETFHistory(days)
      // 按日期+代码分组
      const grouped = {}
      for (const row of data) {
        if (!grouped[row.date]) grouped[row.date] = {}
        grouped[row.date][row.code] = row
      }
      return res.json({ code: 0, data, grouped })
    }

    const data = getETFData()
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

/**
 * GET /national-team/history
 * 获取历史信号数据，用于图表
 * ?days=90&agency=overview
 */
router.get('/history', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90
    const agency = req.query.agency

    if (agency) {
      const data = getSignalHistory(days, agency)
      return res.json({ code: 0, data })
    }

    // 如果没有指定机构，返回所有机构
    const data = getAllAgencySignals(days)
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

/**
 * GET /national-team/anomalies
 * 获取近N日异动列表 ?days=7
 */
router.get('/anomalies', (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7
    const data = getAnomalies(days)
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

/**
 * GET /national-team/status
 * 获取数据源状态
 */
router.get('/status', (req, res) => {
  try {
    const status = getDataSourceStatus()
    const latestLog = getLatestTriggerLog()
    res.json({ code: 0, data: { ...status, latestLog } })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

/**
 * GET /national-team/trigger-log
 * 获取触发日志列表
 */
router.get('/trigger-log', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20
    const data = getTriggerLogs(limit)
    res.json({ code: 0, data })
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

/**
 * POST /national-team/trigger
 * 手动触发数据采集+信号计算
 */
router.post('/trigger', async (req, res) => {
  try {
    const log = createTriggerLog()
    const date = req.body?.date || todayStr()

    // 立即返回"已开始"
    res.json({ code: 0, data: { logId: log.id, status: 'running', message: '任务已启动，正在采集数据...' } })

    // 后台异步执行
    try {
      const result = await runDailyTask(date)
      updateTriggerLog(log.id, 'success', {
        data_count: result.etfCount,
        duration_ms: result.duration,
        source_used: result.sourceUsed
      })
      console.log(`[NT] 手动触发完成: ${result.etfCount}只ETF, ${result.duration}ms`)
    } catch (err) {
      updateTriggerLog(log.id, 'failed', {
        error_msg: err.message
      })
      console.error('[NT] 手动触发失败:', err.message)
    }
  } catch (err) {
    res.status(500).json({ code: -1, message: err.message })
  }
})

export default router
