import { Router } from 'express'
import { proxyRequest, fetchUpstreamJs } from '../services/httpProxy.js'
import config from '../config/index.js'

const router = Router()
const { target, headers } = config.upstreams.fund

/**
 * JSONP 转 JSON：获取基金历史净值数据
 * GET /fund/history/:code
 * 原始：https://fund.eastmoney.com/pingzhongdata/{code}.js
 * 返回 JSON 格式的净值趋势、经理信息、资产分配等
 *
 * ⚠️ 具体路由必须放在通配符之前，否则会被 /* 拦截
 */
router.get('/history/:code', async (req, res, next) => {
  try {
    const { code } = req.params
    const targetUrl = `https://fund.eastmoney.com/pingzhongdata/${code}.js`

    console.log(`[fund/history] ${code}`)

    const result = await fetchUpstreamJs(targetUrl, [
      'Data_netWorthTrend',
      'Data_ACWorthTrend',
      'Data_currentFundManager',
      'Data_assetAllocation',
      'fS_name',
      'fS_code'
    ], headers)

    res.json({
      code: 0,
      data: {
        name: result.fS_name || '',
        code: result.fS_code || code,
        netWorthTrend: result.Data_netWorthTrend || [],
        acWorthTrend: result.Data_ACWorthTrend || [],
        currentFundManager: result.Data_currentFundManager || [],
        assetAllocation: result.Data_assetAllocation || null
      }
    })
  } catch (err) {
    next(err)
  }
})

/**
 * JSONP 转 JSON：获取基金实时估值
 * GET /fund/estimate/:code
 * 原始：https://fundgz.1234567.com.cn/js/{code}.js
 * 返回 JSON 格式的估值数据
 *
 * ⚠️ 具体路由必须放在通配符之前，否则会被 /* 拦截
 */
router.get('/estimate/:code', async (req, res, next) => {
  try {
    const { code } = req.params
    const targetUrl = `https://fundgz.1234567.com.cn/js/${code}.js`

    console.log(`[fund/estimate] ${code}`)

    const result = await fetchUpstreamJs(targetUrl, ['jsonpgz'], {
      Referer: 'https://fund.eastmoney.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    })

    if (result.jsonpgz) {
      res.json({ code: 0, data: result.jsonpgz })
    } else {
      res.json({ code: -1, data: null, message: '未获取到估值数据' })
    }
  } catch (err) {
    next(err)
  }
})

/**
 * 通用请求转发：/fund/* → fund.eastmoney.com/*
 * 用于 js/fundcode_search.js 和 data/rankhandler.aspx 等
 *
 * ⚠️ 通配符路由放在最后，避免拦截上面的具体路由
 */
router.get('/*', async (req, res, next) => {
  try {
    const upstreamPath = req.params[0] + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')
    const targetUrl = `${target}/${upstreamPath}`

    console.log(`[fund] GET ${req.params[0]} → ${targetUrl}`)

    const result = await proxyRequest(targetUrl, {
      headers: { ...headers },
      responseType: 'text'
    })

    // 东方财富返回的通常是 JavaScript 代码，设置正确的 Content-Type
    if (upstreamPath.endsWith('.js')) {
      res.set('Content-Type', 'application/javascript; charset=utf-8')
    } else if (upstreamPath.includes('.aspx')) {
      res.set('Content-Type', 'text/html; charset=utf-8')
    }

    res.send(result.data)
  } catch (err) {
    next(err)
  }
})

export default router
