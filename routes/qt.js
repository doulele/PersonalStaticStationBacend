import { Router } from 'express'
import { proxyRequest } from '../services/httpProxy.js'
import config from '../config/index.js'

const router = Router()
const { target, headers } = config.upstreams.qt

/**
 * 通用请求转发：/qt/* → qt.gtimg.cn/*
 * qt.gtimg.cn 返回的是 GBK 编码的文本，需要解码
 */
router.get('/*', async (req, res, next) => {
  try {
    const upstreamPath = req.params[0] + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')
    const targetUrl = `${target}/${upstreamPath}`

    console.log(`[qt] GET ${req.params[0]}`)

    const result = await proxyRequest(targetUrl, {
      headers: { ...headers },
      responseType: 'buffer',
      responseEncoding: 'gbk'
    })

    // 腾讯接口返回的是类似 v_sh600519="1~平安银行~..." 的格式
    // 后端不做解析，原样返回给前端（由前端 stockAnalysis.js 解析）
    res.set('Content-Type', 'text/plain; charset=utf-8')
    res.send(result.data)
  } catch (err) {
    next(err)
  }
})

export default router
