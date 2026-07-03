/**
 * 油价 API 路由
 *
 * GET  /oil-price/provinces    — 所有省份列表
 * GET  /oil-price/current?province=北京  — 某省当前油价
 * GET  /oil-price/history?province=北京  — 某省历史走势（四油品）
 * GET  /oil-price/national-avg — 全国均价
 * GET  /oil-price/forecast     — 调价预测
 */

import { Router } from 'express'
import axios from 'axios'
import { getCityPrices, getProvinceHistory, getNationalAvg, getForecast } from '../services/oilPriceService.js'

const router = Router()

// 省份列表
router.get('/provinces', (req, res) => {
  try {
    const provinces = [
      '北京', '上海', '广东', '浙江', '江苏', '四川', '湖北',
      '山东', '湖南', '河南', '福建', '安徽', '河北', '重庆',
      '陕西', '云南', '贵州', '广西', '海南', '江西'
    ]
    res.json({ success: true, data: provinces })
  } catch (err) {
    console.error('[油价] 省份列表错误:', err.message)
    res.status(500).json({ error: '获取省份列表失败' })
  }
})

// 某省当前油价
router.get('/current', (req, res) => {
  try {
    const province = req.query.province
    if (!province) {
      return res.status(400).json({ error: '缺少 province 参数' })
    }

    const cities = getCityPrices(province)
    if (!cities.length) {
      return res.status(404).json({ error: `未找到"${province}"的油价数据` })
    }

    res.json({ success: true, data: { province, cities } })
  } catch (err) {
    console.error('[油价] 查询失败:', err.message)
    res.status(500).json({ error: '获取油价数据失败' })
  }
})

// 历史走势（四油品）
router.get('/history', async (req, res) => {
  try {
    const province = req.query.province
    if (!province) {
      return res.status(400).json({ error: '缺少 province 参数' })
    }

    const result = await getProvinceHistory(province)
    if (!result) {
      return res.status(404).json({ error: `未找到"${province}"的历史数据` })
    }

    res.json({ success: true, data: { province, ...result } })
  } catch (err) {
    console.error('[油价] 历史查询失败:', err.message)
    res.status(500).json({ error: '获取历史走势失败' })
  }
})

// 全国均价
router.get('/national-avg', (req, res) => {
  try {
    const avg = getNationalAvg()
    res.json({ success: true, data: avg })
  } catch (err) {
    console.error('[油价] 均价查询失败:', err.message)
    res.status(500).json({ error: '获取全国均价失败' })
  }
})

// 调价预测
router.get('/forecast', async (req, res) => {
  try {
    const forecast = await getForecast()
    res.json({ success: true, data: forecast })
  } catch (err) {
    console.error('[油价] 预测查询失败:', err.message)
    res.status(500).json({ error: '获取调价预测失败' })
  }
})

// IP 定位代理（避免前端直接请求第三方被 CORS 拦截）
router.get('/ip-locate', async (req, res) => {
  const clientIP = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress
  console.log(`[油价] IP定位请求，客户端IP: ${clientIP}`)

  const services = [
    async () => {
      const resp = await axios.get('https://ipapi.co/json/', { timeout: 6000 })
      const d = resp.data
      return d.latitude && d.longitude ? { lat: d.latitude, lng: d.longitude, city: d.city, region: d.region } : null
    },
    async () => {
      const resp = await axios.get('http://ip-api.com/json/?lang=zh-CN', { timeout: 6000 })
      const d = resp.data
      return d.status === 'success' && d.lat && d.lon ? { lat: d.lat, lng: d.lon, city: d.city, region: d.regionName } : null
    },
    async () => {
      const resp = await axios.get('https://api.ip.sb/geoip/', { timeout: 6000 })
      const d = resp.data
      return d.latitude && d.longitude ? { lat: d.latitude, lng: d.longitude, city: d.city, region: d.region } : null
    }
  ]
  for (const svc of services) {
    try {
      const result = await svc()
      if (result) {
        console.log(`[油价] 定位成功: ${result.city || result.region}`)
        return res.json({ success: true, data: result })
      }
    } catch (err) { console.log(`[油价] 定位服务失败:`, err.message); continue }
  }

  // 全部失败 → 返回 null 让前端走默认北京
  console.log('[油价] 所有定位服务不可用，返回默认')
  res.json({ success: true, data: null })
})

export default router
