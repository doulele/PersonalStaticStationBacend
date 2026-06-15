import { Router } from 'express'
import { proxyRequest } from '../services/httpProxy.js'
import config from '../config/index.js'

const router = Router()
const { target, headers } = config.upstreams.ifzq

/**
 * 通用请求转发：/ifzq/* → web.ifzq.gtimg.cn/*
 */
router.get('/*', async (req, res, next) => {
  try {
    const upstreamPath = req.params[0] + (req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '')
    const targetUrl = `${target}/${upstreamPath}`

    console.log(`[ifzq] GET ${req.params[0]}`)

    const result = await proxyRequest(targetUrl, {
      headers: { ...headers },
      responseType: 'json'
    })

    res.json(result.data)
  } catch (err) {
    next(err)
  }
})

export default router
