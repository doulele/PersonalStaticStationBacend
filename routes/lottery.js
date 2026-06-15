import { Router } from 'express'
import { proxyRequest } from '../services/httpProxy.js'
import config from '../config/index.js'

const router = Router()

const { target, appId, appSecret } = config.upstreams.lottery

// QPS 限制：免费版每秒 1 次，用上次请求时间戳控制
let lastRequestTime = 0
const QPS_INTERVAL = 1200 // 1.2 秒间隔，保守避免触发限流

async function delay() {
  const now = Date.now()
  const wait = lastRequestTime + QPS_INTERVAL - now
  if (wait > 0) {
    await new Promise(resolve => setTimeout(resolve, wait))
  }
  lastRequestTime = Date.now()
}

function hasCredentials() {
  return !!(appId && appSecret)
}

/**
 * 彩票 API 代理 → RollToolsApi (mxnzp.com)
 * POST /lottery/query   body: { lottery_id, lottery_no }
 * POST /lottery/latest  body: { lottery_id }
 * POST /lottery/history body: { lottery_id, page_size }
 * 敏感信息 (app_id/app_secret) 仅存后端，不外泄
 */

// aim_lottery 接口的 code 使用小写（与 latest/history 一致）
// 注意：mxnzp API 可能不再接受 cj 前缀（如 cjssq），统一使用纯小写
const AIM_LOTTERY_CODE_MAP = {
  ssq: 'ssq',
  dlt: 'cjdlt',
  cjdlt: 'cjdlt',    // 前端 cjdlt → 映射为 dlt
  fc3d: 'fc3d',
  pls3: 'pls3',
  pls5: 'pls5',
  qlc: 'qlc',
  qxc: 'qxc'
}

function getAimCode(lotteryId) {
  return AIM_LOTTERY_CODE_MAP[lotteryId.toLowerCase()] || lotteryId.toLowerCase()
}

// 按期号查询开奖结果
router.post('/query', async (req, res, next) => {
  try {
    if (!hasCredentials()) {
      return res.json({ code: -1, msg: 'API 密钥未配置', data: null })
    }

    const { lottery_id, lottery_no } = req.body
    if (!lottery_id || !lottery_no) {
      return res.json({ code: -1, msg: '缺少必要参数', data: null })
    }

    await delay()

    const aimCode = getAimCode(lottery_id)
    // mxnzp aim_lottery 接口要求去 "20" 前缀的短格式期号（如 "26064" 而非 "2026064"）
    const shortIssue = String(lottery_no).length === 7 && String(lottery_no).startsWith('20')
      ? String(lottery_no).slice(2)
      : String(lottery_no)
    // app_id/app_secret 作为 URL 查询参数（mxnzp API 要求）
    const params = new URLSearchParams({
      code: aimCode,
      expect: shortIssue,
      app_id: appId,
      app_secret: appSecret
    })

    const targetUrl = `${target}/aim_lottery?${params.toString()}`
    console.log(`[lottery/query] ${lottery_id} 期号=${lottery_no} → ${shortIssue} code=${aimCode}`)

    const result = await proxyRequest(targetUrl, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'json'
    })

    // 标准化期号：aim_lottery 接口返回的 expect 可能不带 "20" 前缀（如 "26064"），统一补全为 "2026064"
    const responseData = result.data
    if (responseData?.data?.expect) {
      const rawExpect = String(responseData.data.expect)
      if (rawExpect.length === 5 && !rawExpect.startsWith('20')) {
        responseData.data.expect = '20' + rawExpect
        console.log(`[lottery/query] 期号标准化: ${rawExpect} → ${responseData.data.expect}`)
      }
    }

    res.json(responseData)
  } catch (err) {
    next(err)
  }
})

// 查询最新开奖结果
router.post('/latest', async (req, res, next) => {
  try {
    if (!hasCredentials()) {
      return res.json({ code: -1, msg: 'API 密钥未配置', data: null })
    }

    const { lottery_id } = req.body
    if (!lottery_id) {
      return res.json({ code: -1, msg: '缺少 lottery_id', data: null })
    }

    await delay()

    // 使用标准化的 code 值，app_id/app_secret 放在 URL 参数中
    const params = new URLSearchParams({
      code: getAimCode(lottery_id),
      app_id: appId,
      app_secret: appSecret
    })

    const targetUrl = `${target}/latest?${params.toString()}`
    console.log(`[lottery/latest] ${lottery_id} → code=${getAimCode(lottery_id)}`)

    const result = await proxyRequest(targetUrl, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'json'
    })

    res.json(result.data)
  } catch (err) {
    next(err)
  }
})

// 查询历史开奖
router.post('/history', async (req, res, next) => {
  try {
    if (!hasCredentials()) {
      return res.json({ code: -1, msg: 'API 密钥未配置', data: null })
    }

    const { lottery_id, page, page_size } = req.body
    if (!lottery_id) {
      return res.json({ code: -1, msg: '缺少 lottery_id', data: null })
    }

    await delay()

    // mxnzp API 使用小写 code，分页参数为 page（页码）
    const params = new URLSearchParams({
      code: getAimCode(lottery_id),
      app_id: appId,
      app_secret: appSecret
    })
    // page_size 映射为分页条数（如 API 支持 count/size 等参数，可在此调整）
    if (page) params.set('page', String(page))
    if (page_size) params.set('count', String(page_size))

    const targetUrl = `${target}/history?${params.toString()}`
    console.log(`[lottery/history] ${lottery_id} → code=${getAimCode(lottery_id)} page=${page || 1} count=${page_size || 50}`)

    const result = await proxyRequest(targetUrl, {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'json'
    })

    res.json(result.data)
  } catch (err) {
    next(err)
  }
})

export default router
