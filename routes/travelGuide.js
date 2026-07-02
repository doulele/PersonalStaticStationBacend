import { Router } from 'express'
import axios from 'axios'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import config from '../config/index.js'
import { geocode, searchNearby, regeocode, searchPOI, searchRegionHotspots, searchProvinceHotspots, ipLocate, normalizePoiName, SCENIC_TYPES, SCENIC_TYPE_CODES } from '../services/amapService.js'
import { getAiRecommendation } from '../services/travelAiService.js'
import { cacheGet, cacheSet } from '../services/cacheService.js'

const router = Router()

// 常见城市名列表（用于从非标准地址中提取城市名）
const KNOWN_CITIES = [
  '北京', '上海', '广州', '深圳', '杭州', '南京', '成都', '重庆', '武汉', '西安',
  '苏州', '天津', '长沙', '郑州', '东莞', '青岛', '沈阳', '宁波', '昆明', '大连',
  '厦门', '合肥', '佛山', '福州', '哈尔滨', '济南', '长春', '温州', '石家庄', '常州',
  '泉州', '南宁', '贵阳', '南昌', '太原', '烟台', '嘉兴', '南通', '金华', '珠海',
  '惠州', '徐州', '海口', '乌鲁木齐', '绍兴', '中山', '台州', '兰州', '无锡', '汕头',
  '洛阳', '宜昌', '镇江', '襄阳', '三亚', '丽江', '桂林', '黄山', '大理', '拉萨',
  '秦皇岛', '连云港', '张家界', '延边', '呼伦贝尔', '阿坝', '乐山', '安顺', '敦煌', '开封',
  '平遥', '大同', '承德', '保定', '丹东', '本溪', '吉林', '齐齐哈尔', '北海', '西宁',
  '银川', '延安', '衡阳', '海东'
]

/**
 * 从非标准地址中提取城市名
 * 例如 "连云港交界口" → "连云港", "北京朝阳区" → "北京"
 */
function extractCityName(input) {
  if (!input || typeof input !== 'string') return null
  // 优先匹配已知城市名（按长度降序，避免"吉林"匹配到"吉林市"之前）
  const sorted = [...KNOWN_CITIES].sort((a, b) => b.length - a.length)
  for (const city of sorted) {
    if (input.includes(city)) return city
  }
  // 兜底：取前2~3个汉字尝试
  const chineseChars = input.replace(/[^\u4e00-\u9fa5]/g, '')
  if (chineseChars.length >= 3) return chineseChars.slice(0, 3)
  if (chineseChars.length >= 2) return chineseChars.slice(0, 2)
  return null
}

/**
 * 提取景区核心名称（去掉"景区""风景区""旅游区"等后缀）
 * "连岛景区" → "连岛"，"故宫博物院" → "故宫"
 */
function extractCoreScenicName(name) {
  if (!name) return ''
  // 去掉常见后缀
  let core = name.replace(/(风景区|旅游区|游览区|度假区|景区|公园|园林|名胜|古迹|博物院|博物馆)$/g, '')
  // 如果去掉后缀后太短（≤1字），保留原名（防止"西湖"变成"西"）
  if (core.length <= 1) core = name
  return core
}

// ==================== API 路由 ====================

/**
 * GET /travel/region-hot
 * 获取指定地区或省份热门景点 Top 20（高德实时搜索）
 * Query: region=华东          → 按大区域搜索
 * Query: region=华中&province=河南 → 按省份精确搜索
 */
router.get('/region-hot', async (req, res) => {
  const { region, province } = req.query
  if (!region && !province) return res.status(400).json({ error: '请提供地区或省份参数' })

  // 缓存 key，按地区和省份区分
  const cacheKey = province
    ? `region-hot:province:${province}`
    : `region-hot:region:${region}`
  const cached = cacheGet(cacheKey)
  if (cached) {
    console.log(`[Travel] 命中缓存: ${cacheKey}`)
    return res.json({ success: true, data: cached, source: 'amap', cached: true })
  }

  try {
    const pois = province
      ? await searchProvinceHotspots(province)
      : await searchRegionHotspots(region)
    // 热点排行缓存 1 小时
    cacheSet(cacheKey, pois, 60 * 60 * 1000)
    res.json({ success: true, data: pois, source: 'amap' })
  } catch (err) {
    console.error('[Travel] 区域热门搜索失败:', err.message)
    res.status(500).json({ error: '区域热门搜索失败' })
  }
})

/**
 * Haversine 公式计算两点距离（米），在路由层用于子景点距离过滤
 */
function haversineDist(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * POST /travel/plan-dynamic
 * 动态生成规划数据（子景点 + 餐饮 + 住宿），放在 /:id 之前避免冲突
 * Body: { lat, lng, name, address?, city? }
 */
router.post('/plan-dynamic', async (req, res) => {
  const { lat, lng, name, address, city: reqCity } = req.body
  if (!lat || !lng) return res.status(400).json({ error: '缺少经纬度' })

  try {
    // 提取城市名（从 address 或直接传入的 city）
    const city = reqCity || extractCityName(address) || ''
    const coreName = extractCoreScenicName(name)

    // === 子景点三路搜索策略（去掉路2b无限制全量拉取的脏数据源） ===
    // 路1：周边类型码搜索（最高可信度—8km 按景区类型码精确匹配，拉满4页不遗漏）
    // 路2a：周边关键词搜索（中等可信度—8km，不限类型，用母景点简称做多关键词组合搜，
    //       关键：大沙湾/苏马湾等子景点名称不含"连岛"，但"连岛"+"景区"组合搜能命中）
    // 路3：城市级文本搜索（兜底—不限距离，用母景点全名在城中搜更宽泛）
    const SCENIC_TAIL_CHARS = /[山湖海滩岛湾河江谷峰泉瀑]/
    const nearbyKeywords = coreName
      ? `${coreName}|${coreName.split('').filter(c => !SCENIC_TAIL_CHARS.test(c)).join('')}`
      : null
    const [nearbyTyped, nearbyKeyword, textSpots, foodPois, hotelPois] = await Promise.all([
      searchNearby(lng, lat, 8000, SCENIC_TYPE_CODES, 1, 20, undefined, true),
      coreName
        ? searchNearby(lng, lat, 8000, '', 1, 15, nearbyKeywords, false)
        : Promise.resolve([]),
      (city && name)
        ? searchPOI(name, city, 30, '')
        : (city && coreName)
          ? searchPOI(coreName, city, 30, '')
          : Promise.resolve([]),
      searchNearby(lng, lat, 15000, '中餐厅|外国餐厅|快餐厅|休闲餐饮场所|咖啡厅|茶艺馆|冷饮店|甜品店|糕饼店|海鲜酒楼|烧烤|火锅|小吃快餐|农家菜', 1, 25, undefined, false),
      searchNearby(lng, lat, 20000, '宾馆酒店|旅馆招待所|青年旅舍|经济型住宿|酒店宾馆|度假村|农家院|民宿|公寓|商务酒店|快捷酒店|星级酒店', 1, 25, undefined, false)
    ])

    // === 智能合并去重（可信度排序：类型码精搜 > 关键词近搜 > 无关键词近搜 > 文本远搜）===
    const mergedSpots = []
    const existingNames = new Set()
    const parentExactNames = new Set([name, normalizePoiName(name), coreName].filter(Boolean))

    // 判断某 POI 是否与母景点同名（仅精确匹配）
    // 注意：不能用包含匹配！否则"连岛景区大沙湾"会因包含"连岛景区"被误判
    // 连岛游客中心/售票处等由 isSpotsJunkName 单独过滤
    const isSameAsParent = (p) => {
      if (parentExactNames.has(p.name)) return true
      if (parentExactNames.has(normalizePoiName(p.name))) return true
      return false
    }

    // 统一的去重+过滤辅助
    const tryAddSpot = (p, source) => {
      if (existingNames.has(p.name)) return
      if (isSameAsParent(p)) return
      if (isSpotsJunkName(p.name)) return
      existingNames.add(p.name)
      p._source = source
      p._dist = p.distance || haversineDist(lat, lng, p.lat, p.lng)
      mergedSpots.push(p)
    }

    // 按可信度顺序合并：路1 > 路2a > 路3
    for (const p of nearbyTyped) tryAddSpot(p, 'typed')
    for (const p of nearbyKeyword) tryAddSpot(p, 'keyword')
    for (const p of textSpots) {
      if (existingNames.has(p.name)) continue
      const dist = haversineDist(lat, lng, p.lat, p.lng)
      if (dist > 30000) continue   // 文本搜索结果只保留 30km 内
      tryAddSpot(p, 'text')
    }

    // === 按评分/热度从高到低排序 ===
    // 优先：评分 > 景区评级 > 距离
    mergedSpots.sort((a, b) => {
      // 1) 评分：有 > 无，高 > 低
      const ra = parseFloat(a.rating) || 0
      const rb = parseFloat(b.rating) || 0
      if (ra !== rb) return rb - ra

      // 2) 景区评级：5A(30) > 4A(20) > 3A(10) > 未知(0)
      const levelScore = (level) => {
        if (!level) return 0
        if (level.includes('5')) return 30
        if (level.includes('4')) return 20
        if (level.includes('3')) return 10
        return 0
      }
      if (levelScore(a.level) !== levelScore(b.level)) return levelScore(b.level) - levelScore(a.level)

      // 3) 距离兜底
      return (a._dist || Infinity) - (b._dist || Infinity)
    })

    const spots = mergedSpots.map((p, i) => ({
      id: `dyn_spot_${i}_${Date.now()}`,
      name: p.name, lat: p.lat, lng: p.lng,
      stay_duration: 30, default_order: i + 1, ticket_price: 0,
      highlight: p.address?.slice(0, 25) || '',
      desc: p.address || ''
    }))

    const foods = foodPois.slice(0, 12).map((p, i) => ({
      id: `dyn_food_${i}_${Date.now()}`,
      name: p.name, recommend_dish: p.type || '',
      lat: p.lat, lng: p.lng,
      price_per_person: 50,
      highlight: p.address?.slice(0, 25) || ''
    }))

    const hotels = hotelPois.slice(0, 8).map((p, i) => ({
      id: `dyn_hotel_${i}_${Date.now()}`,
      name: p.name, price_range: '价格待查',
      lat: p.lat, lng: p.lng,
      highlight: p.address?.slice(0, 25) || ''
    }))

    res.json({
      success: true,
      data: { attraction: { id: 0, name: name || '未知景点', lat, lng }, spots, foods, hotels }
    })
  } catch (err) {
    console.error('[Travel] 动态规划失败:', err.message)
    res.status(500).json({ error: '动态生成规划数据失败' })
  }
})

/**
 * POST /travel/spot-search
 * 手动添加景点时的搜索建议接口（输入关键词 → 下拉建议列表）
 * 策略：关键词 + 城市限定 + 景区类型过滤，并限制在母景点周边 30km 内
 * Body: { keyword, city, lng, lat }
 */
router.post('/spot-search', async (req, res) => {
  const { keyword, city, lng, lat } = req.body
  if (!keyword || !keyword.trim()) {
    return res.json({ success: true, data: [] })
  }
  try {
    // 调用文本搜索 + 景区类型过滤，不限数量（offset=20），搜索与母景点同城市的 POI
    const pois = await searchPOI(keyword.trim(), city || '', 20, null)  // null=不传types,不过滤类型
    // 过滤垃圾 + 限制在 30km 内
    const filtered = pois
      .filter(p => !isSpotsJunkName(p.name))
      .filter(p => {
        if (!lng || !lat) return true
        const dist = haversineDistance(lat, lng, p.lat, p.lng)
        return dist <= 30000
      })
      .map(p => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        address: p.address || '',
        type: p.type || '',
        distance: p.distance || (lng && lat ? haversineDistance(lat, lng, p.lat, p.lng) : 0)
      }))
      .slice(0, 15)
    res.json({ success: true, data: filtered })
  } catch (err) {
    console.error('[Travel] 景点搜索失败:', err.message)
    res.status(500).json({ error: '搜索失败' })
  }
})

/**
 * POST /travel/food-search
 * 手动添加美食时的搜索建议接口
 * Body: { keyword, city, lng, lat }
 */
router.post('/food-search', async (req, res) => {
  const { keyword, city, lng, lat } = req.body
  if (!keyword || !keyword.trim()) {
    return res.json({ success: true, data: [] })
  }
  try {
    const pois = await searchPOI(keyword.trim(), city || '', 15, null)
    // 正向过滤：仅保留餐饮类 POI（用 type 字段判断，不误杀美食名称）
    const FOOD_TYPE_PATTERN = /餐饮|餐厅|饭店|美食|小吃|咖啡|茶|酒吧|冷饮|烧烤|火锅|快餐|酒楼|食府|海鲜|甜点|糕饼|农家菜|西餐|日料|韩料|面馆|粉店|自助餐/
    const isFoodPOI = (p) => FOOD_TYPE_PATTERN.test(p.type || '') || FOOD_TYPE_PATTERN.test(p.name || '')
    const filtered = pois
      .filter(isFoodPOI)
      .filter(p => {
        if (!lng || !lat) return true
        const dist = haversineDistance(lat, lng, p.lat, p.lng)
        return dist <= 30000
      })
      .map(p => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        address: p.address || '',
        type: p.type || '',
        distance: p.distance || (lng && lat ? haversineDistance(lat, lng, p.lat, p.lng) : 0)
      }))
      .slice(0, 15)
    res.json({ success: true, data: filtered })
  } catch (err) {
    console.error('[Travel] 美食搜索失败:', err.message)
    res.status(500).json({ error: '搜索失败' })
  }
})

/**
 * POST /travel/hotel-search
 * 手动添加酒店时的搜索建议接口
 * Body: { keyword, city, lng, lat }
 */
router.post('/hotel-search', async (req, res) => {
  const { keyword, city, lng, lat } = req.body
  if (!keyword || !keyword.trim()) {
    return res.json({ success: true, data: [] })
  }
  try {
    const pois = await searchPOI(keyword.trim(), city || '', 15, null)
    // 正向过滤：仅保留住宿类 POI（用 type 字段判断，不误杀酒店名称）
    const HOTEL_TYPE_PATTERN = /酒店|宾馆|旅馆|民宿|公寓|客栈|招待所|度假村|青年旅舍|农家院|住宿|商务酒店|快捷酒店|星级酒店|露营地|房车/
    const isHotelPOI = (p) => HOTEL_TYPE_PATTERN.test(p.type || '') || HOTEL_TYPE_PATTERN.test(p.name || '')
    const filtered = pois
      .filter(isHotelPOI)
      .filter(p => {
        if (!lng || !lat) return true
        const dist = haversineDistance(lat, lng, p.lat, p.lng)
        return dist <= 30000
      })
      .map(p => ({
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        address: p.address || '',
        type: p.type || '',
        distance: p.distance || (lng && lat ? haversineDistance(lat, lng, p.lat, p.lng) : 0)
      }))
      .slice(0, 15)
    res.json({ success: true, data: filtered })
  } catch (err) {
    console.error('[Travel] 酒店搜索失败:', err.message)
    res.status(500).json({ error: '搜索失败' })
  }
})

/**
 * POST /travel/food-recommend
 * 美食推荐（无关键词，基于景点坐标搜索周边餐饮）
 * Body: { city, lng, lat }
 */
router.post('/food-recommend', async (req, res) => {
  const { lng, lat } = req.body
  if (!lng || !lat) {
    return res.json({ success: true, data: [] })
  }
  try {
    const foodTypes = '中餐厅|外国餐厅|快餐厅|休闲餐饮场所|咖啡厅|茶艺馆|冷饮店|甜品店|糕饼店|海鲜酒楼|烧烤|火锅|小吃快餐|农家菜'
    const foodPois = await searchNearby(lng, lat, 15000, foodTypes, 1, 25, undefined, false)
    const foods = foodPois.slice(0, 12).map((p) => ({
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      address: p.address || '',
      type: p.type || '',
      distance: p.distance || 0,
      recommend_dish: (p.type || '').split(';').pop() || '',
      highlight: (p.address || '').slice(0, 30),
      price_per_person: 50
    }))
    res.json({ success: true, data: foods })
  } catch (err) {
    console.error('[Travel] 美食推荐失败:', err.message)
    res.status(500).json({ error: '推荐失败' })
  }
})

/**
 * POST /travel/hotel-recommend
 * 酒店推荐（无关键词，基于景点坐标搜索周边住宿）
 * Body: { city, lng, lat }
 */
router.post('/hotel-recommend', async (req, res) => {
  const { lng, lat } = req.body
  if (!lng || !lat) {
    return res.json({ success: true, data: [] })
  }
  try {
    const hotelTypes = '宾馆酒店|旅馆招待所|青年旅舍|经济型住宿|酒店宾馆|度假村|农家院|民宿|公寓|商务酒店|快捷酒店|星级酒店'
    const hotelPois = await searchNearby(lng, lat, 20000, hotelTypes, 1, 25, undefined, false)
    const hotels = hotelPois.slice(0, 8).map((p) => ({
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      address: p.address || '',
      type: p.type || '',
      distance: p.distance || 0,
      price_range: '价格待查',
      highlight: (p.address || '').slice(0, 30),
      rating: p.rating || ''
    }))
    res.json({ success: true, data: hotels })
  } catch (err) {
    console.error('[Travel] 酒店推荐失败:', err.message)
    res.status(500).json({ error: '推荐失败' })
  }
})

/**
 * POST /travel/geocode
 * 地址转经纬度
 */
router.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body
    if (!address) return res.status(400).json({ error: '请提供地址' })

    // 缓存：同一地址的经纬度几乎不变，缓存 24 小时
    const cacheKey = `geocode:${address}`
    const cached = cacheGet(cacheKey)
    if (cached) {
      console.log(`[Travel] 地理编码命中缓存: ${address}`)
      return res.json({ success: true, data: cached })
    }

    const result = await geocode(address)
    if (!result) return res.json({ success: false, message: '未找到该地址' })
    cacheSet(cacheKey, result, 24 * 60 * 60 * 1000)
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * GET /travel/ip-locate
 * IP 定位兜底方案：通过客户端公网 IP 获取大致经纬度
 * 用于浏览器 Geolocation API 不可用的情况（非 HTTPS、用户拒绝等）
 *
 * 优先级：高德 IP 定位（国内极快极稳）→ ip-api.com → ipapi.co → 默认位置
 */
router.get('/ip-locate', async (req, res) => {
  try {
    // 从 X-Forwarded-For / X-Real-IP 获取真实客户端 IP
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.headers['x-real-ip']
      || req.ip
      || req.connection?.remoteAddress
      || ''

    // 缓存：按 IP 缓存 30 分钟（IP 在短时间内不会跳变）
    const cacheKey = `ip-locate:${clientIp}`
    const cached = cacheGet(cacheKey)
    if (cached) {
      console.log(`[Travel] IP 定位命中缓存: ${clientIp}`)
      return res.json({ success: true, data: { ...cached, cached: true } })
    }

    // 过滤本地/内网 IP（这些无法被 IP 定位服务识别）
    const isPrivateIp = /^(::1|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|localhost)$/.test(clientIp) || !clientIp

    // 默认位置（北京天安门）
    let lng = 116.397
    let lat = 39.908
    let address = '默认位置'
    let source = 'default'

    if (!isPrivateIp) {
      // 方案一（优先）：高德 IP 定位 — 国内稳定、快速
      try {
        const amapResult = await ipLocate(clientIp)
        if (amapResult) {
          lng = amapResult.lng
          lat = amapResult.lat
          address = amapResult.address || amapResult.city || address
          source = 'amap-ip'
        }
      } catch (_) { /* 高德失败，继续降级 */ }

      // 方案二/三：境外免费 IP 定位服务（高德失败时降级使用）
      if (source === 'default') {
        const fallbackServices = [
          async () => {
            const { data } = await axios.get(`http://ip-api.com/json/${clientIp}?lang=zh-CN&fields=status,lat,lon,city,regionName,country`, { timeout: 4000 })
            if (data && data.status === 'success' && data.lat && data.lon) {
              return { lng: data.lon, lat: data.lat, address: [data.city, data.regionName, data.country].filter(Boolean).join('，') }
            }
            return null
          },
          async () => {
            const { data } = await axios.get(`https://ipapi.co/${clientIp}/json/`, { timeout: 4000 })
            if (data && data.latitude && data.longitude) {
              return { lng: data.longitude, lat: data.latitude, address: [data.city, data.region, data.country_name].filter(Boolean).join('，') }
            }
            return null
          }
        ]
        for (const fn of fallbackServices) {
          try {
            const result = await fn()
            if (result) {
              lng = result.lng
              lat = result.lat
              address = result.address || address
              source = 'ip'
              break
            }
          } catch (_) { /* try next service */ }
        }
      }
    }

    const result = { lng, lat, address, source }
    // 非默认位置才缓存（默认位置说明所有方式都失败了，不应缓存）
    if (source !== 'default') {
      cacheSet(cacheKey, result, 30 * 60 * 1000)
    }
    res.json({ success: true, data: result })
  } catch (err) {
    res.status(500).json({ success: false, error: 'IP 定位失败' })
  }
})

/**
 * POST /travel/nearby
 * 搜索附近景点（使用高德分类代码精确匹配景区类 POI）
 *
 * 修复要点：
 *   1. 使用高德六位分类代码替代中文名称 ——
 *      中文名 "公园广场" 不等于 "公园"，而代码 110100 会前缀匹配子类 110101(公园)
 *   2. 多页并行拉取 ——
 *      默认 offset=25 + 最多 4 页，确保半径内景区不被遗漏
 *   3. 不加 keywords ——
 *      keywords 会与 types 做 AND 逻辑，导致名字不含泛词的景区被漏掉
 */
router.post('/nearby', async (req, res) => {
  try {
    const { lng, lat, radius } = req.body
    if (!lng || !lat) return res.status(400).json({ error: '请提供经纬度' })
    const pois = await searchNearby(lng, lat, radius || 50000, SCENIC_TYPE_CODES)
    const address = await regeocode(lng, lat)
    res.json({ success: true, data: { pois, address } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /travel/searchByCity
 * 按城市名搜索全市景点
 *
 * 核心发现：高德 text search 的 keywords 只匹配 POI 名称，不匹配地址。
 * keywords=连云港 → 只能搜到"连云港市""连云港市政府"这类名字含城市名的 POI，
 * "花果山""连岛"等名字中不含城市名，一条都出不来。
 *
 * 正确策略：keywords=景区泛词（山|岛|海|湾|...）+ city 限制城市，
 * 辅以 types 类型码兜底（抓名字不含泛词的景点如"羊窝头"）。
 */
router.post('/searchByCity', async (req, res) => {
  try {
    const { address } = req.body
    if (!address) return res.status(400).json({ error: '请提供地址' })

    let geoResult = await geocode(address)

    // 地理编码失败时的兜底：尝试从输入中提取城市名再次查询
    if (!geoResult) {
      const cityGuess = extractCityName(address)
      if (cityGuess && cityGuess !== address) {
        geoResult = await geocode(cityGuess)
      }
    }

    if (!geoResult) return res.json({ success: false, message: '未找到该地址' })

    const city = geoResult.city || address
    const cityLng = geoResult.lng
    const cityLat = geoResult.lat

    // 景区泛词（覆盖山/岛/海/湖/湾/峰/公园/老街/寺庙……几乎所有景区命名方式）
    const SCENIC_KW = '景区|山|岛|海|湖|湾|公园|名胜|风景|峰|岭|谷|涧|洞|瀑|泉|滩|浴场|湿地|森林|园林|寺庙|塔|古城|古镇|老街|遗址|故居|石窟|溶洞|峡谷'

    // 策略 1：景区泛词搜索（不限类型），4 页 × 25 = 100 条
    const [p1, p2, p3, p4] = await Promise.all([
      searchPOI(SCENIC_KW, city, 25, '', 1),
      searchPOI(SCENIC_KW, city, 25, '', 2),
      searchPOI(SCENIC_KW, city, 25, '', 3),
      searchPOI(SCENIC_KW, city, 25, '', 4)
    ])

    // 策略 2：类型码兜底（用高德 POI 分类码搜索，不依赖 name 关键词）
    // 抓取名字不含泛词但 type 属于景区的 POI（如"羊窝头"可能分类为风景名胜）
    const TYPE_CODES = '110000|110100|140100|140200|140300|140400|140500|140600|140700|140800'
    const [t1, t2] = await Promise.all([
      searchPOI('', city, 25, TYPE_CODES, 1),
      searchPOI('', city, 25, TYPE_CODES, 2)
    ])

    // 策略 3：老街/古镇专项搜索（这类景点在泛词搜索中排名靠后容易被淹没）
    const [st1, st2] = await Promise.all([
      searchPOI('老街|古镇|古城', city, 25, '', 1),
      searchPOI('老街|古镇|古城', city, 25, '', 2)
    ])

    // 合并 + id 去重 + 名称规范化去重
    const idSeen = new Set()
    const nameSeen = new Set()
    const allPois = []
    for (const poi of [...p1, ...p2, ...p3, ...p4, ...t1, ...t2, ...st1, ...st2]) {
      if (idSeen.has(poi.id)) continue
      const normName = normalizePoiName(poi.name)
      if (nameSeen.has(normName)) continue
      idSeen.add(poi.id)
      nameSeen.add(normName)
      allPois.push(poi)
    }

    // 筛选：过滤无评分或评分低于 3.5 的景点（公交站/停车场等非景区垃圾已在搜索层过滤）
    const filteredPois = allPois.filter(poi => {
      const r = parseFloat(poi.rating)
      return r >= 3.5
    })

    // 按评分降序
    filteredPois.sort((a, b) => (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0))

    // 计算距离
    const poisWithDistance = filteredPois.map(poi => ({
      ...poi,
      distance: haversineDistance(cityLat, cityLng, poi.lat, poi.lng)
    }))

    res.json({ success: true, data: { pois: poisWithDistance, address: geoResult.formatted_address, city } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * POST /travel/debugSearch
 * 调试接口：返回高德原始数据 + 各层过滤结果，用于定位丢失的景点
 * 调用方式同 /searchByCity，但输出原始 POI 数据供排查
 */
router.post('/debugSearch', async (req, res) => {
  try {
    const { address } = req.body
    if (!address) return res.status(400).json({ error: '请提供地址' })

    let geoResult = await geocode(address)

    // 地理编码失败时的兜底：尝试从输入中提取城市名再次查询
    if (!geoResult) {
      const cityGuess = extractCityName(address)
      if (cityGuess && cityGuess !== address) {
        geoResult = await geocode(cityGuess)
      }
    }

    if (!geoResult) return res.json({ success: false, message: '未找到该地址' })

    const city = geoResult.city || address

    // 直连高德 API，不经任何封装，拿原始数据
    const AMAP_KEY = config?.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || ''
    const rawPages = []
    for (let p = 1; p <= 4; p++) {
      try {
        const { data } = await axios.get('https://restapi.amap.com/v3/place/text', {
          params: { key: AMAP_KEY, keywords: city, city, offset: 25, page: p, extensions: 'all', output: 'JSON' },
          timeout: 8000
        })
        if (data.status === '1' && data.pois) {
          rawPages.push({ page: p, count: parseInt(data.count) || 0, pois: data.pois.map(p => ({
            id: p.id, name: p.name, type: p.type, address: p.address,
            typecode: p.typecode, business_area: p.business_area
          }))})
        }
      } catch (e) {
        rawPages.push({ page: p, error: e.message })
      }
    }

    // 对比：经过我们过滤后的结果
    const [p1, p2, p3, p4] = await Promise.all([
      searchPOI(city, city, 25, '', 1),
      searchPOI(city, city, 25, '', 2),
      searchPOI(city, city, 25, '', 3),
      searchPOI(city, city, 25, '', 4)
    ])

    // 分类：哪些被 isScenicPOI 拒绝了
    const allRaw = [...p1, ...p2, ...p3, ...p4]
    const scenic = allRaw.filter(p => isScenicPOI(p))
    const rejected = allRaw.filter(p => !isScenicPOI(p))

    res.json({
      success: true,
      debug: {
        city,
        geo: geoResult.formatted_address,
        // 高德原始返回（仅含 name + type + address，方便对照）
        rawGaode: rawPages,
        // 经过 isReligiousOnly 过滤后存活的所有 POI
        allAfterReligionFilter: allRaw.map(p => ({ name: p.name, type: p.type, address: p.address })),
        // 被 isScenicPOI 拒绝的（有 type 标签但不在景区关键词里）
        rejectedByScenicFilter: rejected.map(p => ({ name: p.name, type: p.type, address: p.address })),
        // 最终给前端的景区列表
        finalScenic: scenic.map(p => ({ name: p.name, type: p.type, address: p.address })),
        counts: {
          totalFromGaode: rawPages.reduce((sum, pg) => sum + (pg.count || 0), 0),
          afterReligionFilter: allRaw.length,
          scenic: scenic.length,
          rejected: rejected.length
        }
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/**
 * 判断一个 POI 是否属于"景区/景点"类
 * 通过 POI 的 type 字段匹配景区关键词，不依赖高德 types 参数
 * 覆盖：风景名胜、山岳、岛屿、海滩、公园、纪念馆、动植物园、游乐园、水族馆等
 */
const SCENIC_TYPE_KEYWORDS = [
  '风景名胜', '景区', '公园', '广场',
  '山', '岛屿', '海滩', '湖', '水库', '河流',
  '纪念馆', '博物馆', '展览馆',
  '动物园', '植物园', '水族馆', '游乐园', '主题公园',
  '寺庙', '道观', '塔', '教堂', // 人文古迹
  '古城', '古镇', '古村', '老街', '故居', '遗址',
  '峡谷', '洞穴', '瀑布', '温泉', '滑雪', '漂流',
  '国家级景点', '省级景点'
]

function isScenicPOI(poi) {
  const type = (poi.type || '').toLowerCase()
  return SCENIC_TYPE_KEYWORDS.some(kw => type.includes(kw.toLowerCase()))
}

/**
 * 判断 POI 名称是否为非景点的垃圾项（仅用于 spots 子景点筛选）
 * 命中则过滤掉，避免观光小火车/治安亭/管理处等出现在路线节点中
 */
function isSpotsJunkName(name) {
  if (!name) return true
  const n = name
  // 注意：不要用太宽泛的词（如"入口""出口""大门"），会误伤"大沙湾入口"等合法子景点
  // 交通类：观光车/游览车/摆渡车等
  if (/观光[小大]?火?车|游览车|电瓶车|摆渡车|接驳[车站]/.test(n)) return true
  // 索道/缆车纯交通工具
  if (n === '索道站' || n === '缆车站' || n.endsWith('索道站') || n.endsWith('缆车站')) return true
  // 治安/管理类（完整词，不含"管理处"→误伤"风景区管理处"的情况另行处理）
  if (/治安亭|治安岗|警务室|保安亭|值班室|监控室|消控室/.test(n)) return true
  // 纯基础设施（不含复合词如"xx管理处"）
  if (/^.{0,4}(停车场|停车区|停车位)$/.test(n)) return true
  if (/售票处|检票口|闸机/.test(n)) return true
  // 卫生间
  if (/卫生间|厕所|洗手间|公厕|公共厕所/.test(n)) return true
  // 住宿/餐饮（这些应该出现在 foods/hotels 区，不是 spots）
  if (/民宿|客栈|酒店|宾馆|旅馆|招待所|公寓|青年旅舍/.test(n)) return true
  if (/餐厅|饭店|饭馆|小吃|美食|咖啡|茶[馆社]|酒吧|冷饮|烧烤|火锅|德克士|肯德基|麦当劳|汉堡王|必胜客|华莱士|正新鸡排|蜜雪冰城|瑞幸|星巴克/.test(n)) return true
  // 商店/购物
  if (/小卖部|便利店|超市|商店|商铺|购物|纪念品|特产/.test(n)) return true
  // 其他明显非景点
  if (/医务室|医疗|诊所|药房|消防|配电|泵站|变电站|垃圾|污水处理/.test(n)) return true
  if (/国家电网|供电[所局站厅]?|电力[局站所厅]?|加油站|充电站/.test(n)) return true
  // 过短名称（1-2 个字且不含景点特征词）
  const SCENIC_CHARS = ['景','园','馆','寺','庙','塔','碑','洞','谷','峰','岛','湖','潭','瀑','泉','海','沙','滩','湾']
  if (n.length <= 2 && !SCENIC_CHARS.some(c => n.includes(c))) return true
  return false
}

/** Haversine 公式：计算两点间球面距离（米） */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
}

/**
 * GET /travel/search
 * 搜索景点（真实高德 POI 搜索）
 */
router.get('/search', async (req, res) => {
  const { keyword, city } = req.query
  if (!keyword || !keyword.trim()) {
    return res.json({ success: true, data: [] })
  }
  try {
    const pois = await searchPOI(keyword.trim(), city || undefined)
    res.json({ success: true, data: pois, source: 'amap' })
  } catch (err) {
    console.error('[Travel] 搜索失败:', err.message)
    res.status(500).json({ success: false, error: '搜索失败，请稍后重试' })
  }
})

/**
 * POST /travel/plan-timeline
 * 智能时间规划引擎：接收节点+参数 → 输出含时间计算的统一时间线
 * Body: {
 *   attraction: { name, lat, lng },
 *   selectedSpots: [{ id, name, lat, lng, stay_duration, ticket_price, ... }],
 *   selectedFoods: [{ id, name, lat, lng, price_per_person, ... }],
 *   selectedHotel: { id, name, lat, lng, price_range, ... } | null,
 *   customHotelName: string,
 *   totalDays: number,      // 默认 1
 *   startTime: string       // 默认 '08:00'
 * }
 *
 * 规划模式：酒店(起点) → 景点 → 美食(午餐) → 景点 → 美食(晚餐) → 酒店(终点)
 * 多天时：Day1终点酒店 = Day2起点酒店
 */
router.post('/plan-timeline', (req, res) => {
  try {
    const {
      attraction,
      selectedSpots = [],
      selectedFoods = [],
      selectedHotel,
      customHotelName = '',
      totalDays = 1,
      startTime = '08:00',
      transportMode = 'drive'  // 'drive' | 'transit'
    } = req.body

    if (!attraction?.name) {
      return res.status(400).json({ error: '缺少目的地信息' })
    }

    // 解析开始时间（分钟从0点算）
    const parseMinutes = (t) => {
      const [h, m] = (t || '08:00').split(':').map(Number)
      return h * 60 + (m || 0)
    }
    const formatTime = (m) => {
      const h = Math.floor(m / 60) % 24
      const min = Math.round(m % 60)
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    }

    // ========== Haversine 距离（返回整数米，与全局 haversineDistance 保持一致） ==========
    const haversineDist = (lat1, lng1, lat2, lng2) => {
      if (!lat1 || !lng1 || !lat2 || !lng2) return 0
      const R = 6371000
      const toRad = d => d * Math.PI / 180
      const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
      return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)))
    }

    // ========== 交通缓冲估算（距离和时长统一取整） ==========
    // 用户指定 transportMode 时强制使用对应模式
    const estimateTransport = (from, to) => {
      if (!from || !to) return { mode: 'walk', distance: 0, duration: 15 }
      const dist = haversineDist(from.lat, from.lng, to.lat, to.lng)
      // 速度：步行 80m/min(≈5km/h)，公交 300m/min(≈18km/h)，驾车 500m/min(≈30km/h)
      if (transportMode === 'transit') {
        // 公共交通模式：<1.5km 步行，其余公交
        if (dist < 1500) return { mode: 'walk', distance: dist, duration: Math.max(3, Math.round(dist / 80) + 3) }
        return { mode: 'transit', distance: dist, duration: Math.max(15, Math.round(dist / 300) + 15) }
      }
      // 自驾模式（默认）：<1.5km 步行，其余全部驾车（~48km/h 含红绿灯、找车位等缓冲）
      if (dist < 1500) return { mode: 'walk', distance: dist, duration: Math.max(2, Math.round(dist / 80) + 2) }
      return { mode: 'drive', distance: dist, duration: Math.max(5, Math.round(dist / 800) + 5) }
    }

    // ========== 用餐时段判断 ==========
    const LUNCH_WINDOW = { start: 660, end: 810 }   // 11:00 - 13:30
    const DINNER_WINDOW = { start: 1020, end: 1170 } // 17:00 - 19:30
    const MEAL_DURATION = 60  // 用餐默认时长

    const isMealTime = (minutes, mealType) => {
      const window = mealType === 'lunch' ? LUNCH_WINDOW : DINNER_WINDOW
      return minutes >= window.start - 30 && minutes <= window.end + 30
    }

    const getMealTag = (minutes, mealType) => {
      const window = mealType === 'lunch' ? LUNCH_WINDOW : DINNER_WINDOW
      if (minutes >= window.start && minutes <= window.end) return 'on_time'
      if (minutes < window.start) return 'early'
      return 'late'
    }

    // ========== 酒店数据 ==========
    let hotelData = null
    if (customHotelName) {
      hotelData = { id: 'custom', name: customHotelName, lat: attraction.lat, lng: attraction.lng, price_range: '' }
    } else if (selectedHotel) {
      hotelData = selectedHotel
    }

    // ========== 计算每天有效时间 ==========
    const dayStartMinutes = parseMinutes(startTime)
    const dayEndMinutes = 21 * 60  // 21:00
    const dailyEffective = dayEndMinutes - dayStartMinutes - (60 + 15 + 60 + 15)  // 扣除两餐+缓冲

    // ========== 总停留时长 ==========
    const totalSpotDuration = selectedSpots.reduce((s, sp) => s + (sp.stay_duration || 30), 0)
    const neededDays = Math.max(1, Math.ceil(totalSpotDuration / dailyEffective))
    const actualDays = Math.max(totalDays || 1, neededDays)

    // ========== 分配景点到每天（贪心） ==========
    const daySpots = Array.from({ length: actualDays }, () => [])
    let dayIdx = 0
    let dayAccum = 0
    for (const spot of selectedSpots) {
      const dur = spot.stay_duration || 30
      if (dayAccum + dur > dailyEffective && dayIdx < actualDays - 1 && daySpots[dayIdx].length > 0) {
        dayIdx++
        dayAccum = 0
      }
      daySpots[dayIdx].push(spot)
      dayAccum += dur
    }

    // ========== 分配美食 ==========
    // 午餐 + 晚餐，每天最多2餐
    const dayFoods = Array.from({ length: actualDays }, () => [])
    let foodIdx = 0
    for (let d = 0; d < actualDays && foodIdx < selectedFoods.length; d++) {
      // 午餐
      if (foodIdx < selectedFoods.length) {
        dayFoods[d].push({ ...selectedFoods[foodIdx], mealType: 'lunch' })
        foodIdx++
      }
      // 晚餐
      if (foodIdx < selectedFoods.length) {
        dayFoods[d].push({ ...selectedFoods[foodIdx], mealType: 'dinner' })
        foodIdx++
      }
    }

    // ========== 生成时间线 ==========
    const timelineNodes = []
    const allTimelineSpots = []  // For summary

    for (let d = 0; d < actualDays; d++) {
      const dayNum = d + 1
      let currentMinutes = dayStartMinutes

      // Day header
      timelineNodes.push({
        id: `day_header_${dayNum}`,
        type: 'day_header',
        day: dayNum,
        title: actualDays > 1 ? `第${dayNum}天` : '一日行程',
        startTime: formatTime(currentMinutes)
      })

      // 起点酒店：Day1=选中酒店，后续=前一天终点酒店
      let startHotel = null
      if (d === 0) {
        startHotel = hotelData
      } else {
        // 复用前一天的终点酒店
        const prevEndHotel = timelineNodes.filter(n => n.type === 'hotel' && n.role === 'end' && n.day === d)
        if (prevEndHotel.length > 0) {
          startHotel = prevEndHotel[prevEndHotel.length - 1].data
        } else {
          startHotel = hotelData
        }
      }

      if (startHotel) {
        timelineNodes.push({
          id: `hotel_start_day${dayNum}`,
          type: 'hotel',
          day: dayNum,
          role: 'start',
          order: 0,
          data: startHotel,
          startTime: formatTime(currentMinutes),
          endTime: formatTime(currentMinutes),
          state: 'pending'
        })
      }

      const spots = daySpots[d] || []
      const foods = dayFoods[d] || []

      // 午餐插入位置 = 上午景点数量（景点数的一半向上取整）
      const morningCount = spots.length > 0 ? Math.ceil(spots.length / 2) : 0
      const lunchFood = foods.find(f => f.mealType === 'lunch')
      const dinnerFood = foods.find(f => f.mealType === 'dinner')

      let spotOrder = 0
      let prevNode = startHotel || { lat: attraction.lat, lng: attraction.lng }
      let isFirstRealNode = !startHotel // 无酒店时起点未知，隐藏第一程通行时间；有酒店时展示酒店→景点的真实路程

      // 上午景点
      for (let i = 0; i < morningCount; i++) {
        const spot = spots[i]
        const transport = estimateTransport(prevNode, spot)
        currentMinutes += transport.duration

        const dur = spot.stay_duration || 30
        const node = {
          id: `spot_${spot.id}_day${dayNum}`,
          type: 'spot',
          day: dayNum,
          order: ++spotOrder,
          data: spot,
          startTime: formatTime(currentMinutes),
          endTime: formatTime(currentMinutes + dur),
          stayDuration: dur,
          state: 'pending',
          transportFromPrev: isFirstRealNode ? null : transport
        }
        isFirstRealNode = false
        allTimelineSpots.push(node)
        timelineNodes.push(node)
        currentMinutes += dur
        prevNode = spot
        spotOrder++
      }

      // 午餐
      if (lunchFood) {
        // 确保午餐时间合理
        if (currentMinutes < LUNCH_WINDOW.start - 15 && morningCount > 0) {
          // 太早了，加一点缓冲让时间接近午餐
          currentMinutes = Math.min(currentMinutes + 10, LUNCH_WINDOW.start)
        }
        if (currentMinutes > LUNCH_WINDOW.end && morningCount === 0) {
          // 没有上午景点且时间已过午餐点，跳过午餐
        } else {
          const transport = estimateTransport(prevNode, lunchFood)
          currentMinutes += Math.max(transport.duration, 5)
          const mealTag = getMealTag(currentMinutes, 'lunch')

          const node = {
            id: `food_${lunchFood.id}_day${dayNum}`,
            type: 'food',
            day: dayNum,
            order: ++spotOrder,
            data: lunchFood,
            mealType: 'lunch',
            mealTag,
            startTime: formatTime(currentMinutes),
            endTime: formatTime(currentMinutes + MEAL_DURATION),
            state: 'pending',
            transportFromPrev: isFirstRealNode ? null : transport
          }
          isFirstRealNode = false
          timelineNodes.push(node)
          currentMinutes += MEAL_DURATION
          prevNode = lunchFood
        }
      }

      // 下午景点
      for (let i = morningCount; i < spots.length; i++) {
        const spot = spots[i]
        const transport = estimateTransport(prevNode, spot)
        currentMinutes += transport.duration

        const dur = spot.stay_duration || 30
        const node = {
          id: `spot_${spot.id}_day${dayNum}`,
          type: 'spot',
          day: dayNum,
          order: ++spotOrder,
          data: spot,
          startTime: formatTime(currentMinutes),
          endTime: formatTime(currentMinutes + dur),
          stayDuration: dur,
          state: 'pending',
          transportFromPrev: isFirstRealNode ? null : transport
        }
        isFirstRealNode = false
        allTimelineSpots.push(node)
        timelineNodes.push(node)
        currentMinutes += dur
        prevNode = spot
      }

      // 晚餐
      if (dinnerFood) {
        const transport = estimateTransport(prevNode, dinnerFood)
        currentMinutes += Math.max(transport.duration, 5)
        // 确保晚餐时间不会太早
        if (currentMinutes < DINNER_WINDOW.start - 15 && spots.length > 0) {
          currentMinutes = Math.min(currentMinutes + 20, DINNER_WINDOW.start)
        }
        const mealTag = getMealTag(currentMinutes, 'dinner')

        const node = {
          id: `food_${dinnerFood.id}_day${dayNum}`,
          type: 'food',
          day: dayNum,
          order: ++spotOrder,
          data: dinnerFood,
          mealType: 'dinner',
          mealTag,
          startTime: formatTime(currentMinutes),
          endTime: formatTime(currentMinutes + MEAL_DURATION),
          state: 'pending',
          transportFromPrev: isFirstRealNode ? null : transport
        }
        isFirstRealNode = false
        timelineNodes.push(node)
        currentMinutes += MEAL_DURATION
        prevNode = dinnerFood
      }

      // 终点酒店
      if (hotelData) {
        const transport = estimateTransport(prevNode, hotelData)
        currentMinutes += Math.max(transport.duration, 5)
        // 确保不晚于21:30
        if (currentMinutes > 21 * 60 + 30) {
          currentMinutes = 21 * 60 + 30
        }

        timelineNodes.push({
          id: `hotel_end_day${dayNum}`,
          type: 'hotel',
          day: dayNum,
          role: 'end',
          order: ++spotOrder,
          data: hotelData,
          startTime: formatTime(currentMinutes),
          endTime: formatTime(currentMinutes),
          state: 'pending',
          transportFromPrev: transport
        })
      }
    }

    // ========== 预算汇总 ==========
    const spotBudget = selectedSpots.reduce((s, sp) => s + (Number(sp.ticket_price) || 0), 0)
    const foodBudget = selectedFoods.reduce((s, f) => s + (Number(f.price_per_person) || 0), 0)

    const summary = {
      attractionName: attraction.name,
      spotsCount: selectedSpots.length,
      foodsCount: selectedFoods.length,
      hotelName: customHotelName || selectedHotel?.name || '未选择',
      totalBudget: spotBudget + foodBudget,
      spotBudget,
      foodBudget,
      totalDays: actualDays,
      totalDuration: allTimelineSpots.reduce((s, n) => s + (n.stayDuration || 0), 0),
      lat: attraction.lat,
      lng: attraction.lng
    }

    res.json({
      success: true,
      data: { timelineNodes, summary }
    })
  } catch (err) {
    console.error('[Travel] 时间规划失败:', err.message)
    res.status(500).json({ error: '时间规划计算失败' })
  }
})

/**
 * POST /travel/ai-recommend
 * AI 智能推荐：使用 DeepSeek 分析目的地和可选项目，推荐最佳路线、美食、住宿
 * Body: { attraction, spots, foods, hotels }
 */
router.post('/ai-recommend', async (req, res) => {
  try {
    const { attraction, spots, foods, hotels } = req.body

    if (!attraction || !attraction.name) {
      return res.status(400).json({ error: '请提供目的地信息' })
    }

    if (!config.deepseekApiKey) {
      return res.json({
        success: true,
        data: null,
        message: 'AI 推荐服务暂未配置（缺少 DeepSeek API Key），请手动选择'
      })
    }

    const result = await getAiRecommendation({ attraction, spots, foods, hotels })

    if (!result) {
      return res.json({
        success: false,
        message: 'AI 推荐暂时不可用，请稍后重试或手动规划'
      })
    }

    res.json({ success: true, data: result })
  } catch (err) {
    console.error('[Travel] AI 推荐失败:', err.message)
    res.status(500).json({ error: 'AI 推荐服务异常' })
  }
})

/**
 * POST /travel/plan-multi
 * 多景点串联规划引擎：接收多个母景点(含子景点) + 美食 + 酒店 → 输出统一时间线
 * Body: {
 *   spots: [{ id, name, lat, lng, subSpots: [{ id, name, stay_duration, ... }], ... }],
 *   foods: [{ id, name, price_per_person, ... }],
 *   hotel: { id, name, price_range, ... } | null
 * }
 *
 * 规划模式：酒店(起点) → 母景点1子景点... → 午餐 → 母景点2子景点... → 晚餐 → 酒店(终点)
 */
router.post('/plan-multi', (req, res) => {
  try {
    const { spots: parentSpots = [], foods = [], hotel, transportMode = 'drive' } = req.body

    if (!parentSpots.length) {
      return res.status(400).json({ error: '请至少选择1个景点' })
    }

    const parseMinutes = (t) => {
      const [h, m] = (t || '08:00').split(':').map(Number)
      return h * 60 + (m || 0)
    }
    const formatTime = (m) => {
      const h = Math.floor(m / 60) % 24
      const min = Math.round(m % 60)
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    }

    const haversineDist = (lat1, lng1, lat2, lng2) => {
      if (!lat1 || !lng1 || !lat2 || !lng2) return 0
      const R = 6371000
      const toRad = d => d * Math.PI / 180
      const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
      const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    }

    const estimateTransport = (from, to) => {
      if (!from || !to) return { mode: 'walk', distance: 0, duration: 15 }
      const dist = haversineDist(from.lat, from.lng, to.lat, to.lng)
      // 速度：步行 80m/min(≈5km/h)，公交 300m/min(≈18km/h)，驾车 800m/min(≈48km/h)
      if (transportMode === 'transit') {
        if (dist < 1500) return { mode: 'walk', distance: dist, duration: Math.round(dist / 80) + 3 }
        return { mode: 'transit', distance: dist, duration: Math.round(dist / 300) + 15 }
      }
      // 自驾模式：<1.5km 步行，其余全部驾车
      if (dist < 1500) return { mode: 'walk', distance: dist, duration: Math.round(dist / 80) + 2 }
      return { mode: 'drive', distance: dist, duration: Math.round(dist / 800) + 5 }
    }

    const LUNCH_WINDOW = { start: 660, end: 810 }
    const DINNER_WINDOW = { start: 1020, end: 1170 }
    const MEAL_DURATION = 60
    const dayStartMinutes = parseMinutes('08:00')

    const getMealTag = (minutes, mealType) => {
      const window = mealType === 'lunch' ? LUNCH_WINDOW : DINNER_WINDOW
      if (minutes >= window.start && minutes <= window.end) return 'on_time'
      if (minutes < window.start) return 'early'
      return 'late'
    }

    // 展平所有子景点为一个有序列表
    const allLeafSpots = []
    parentSpots.forEach((ps, psi) => {
      const subs = ps.subSpots || []
      if (subs.length > 0) {
        subs.forEach((sub, si) => {
          allLeafSpots.push({
            ...sub,
            parentName: ps.name,
            parentId: ps.id,
            parentIndex: psi + 1,
            subIndex: si + 1,
            // 使用父景点的坐标作为兜底
            lat: sub.lat || ps.lat || 0,
            lng: sub.lng || ps.lng || 0,
            stay_duration: sub.stay_duration || 30,
            ticket_price: sub.ticket_price || 0
          })
        })
      } else {
        // 没有子景点，父景点本身作为节点
        allLeafSpots.push({
          id: ps.id,
          name: ps.name,
          lat: parseFloat(ps.lat) || 0,
          lng: parseFloat(ps.lng) || 0,
          stay_duration: 120,
          ticket_price: parseInt(String(ps.cost || '0').replace(/[^0-9]/g, '')) || 60,
          parentName: ps.name,
          parentId: ps.id,
          parentIndex: psi + 1,
          subIndex: 0,
          isParentNode: true
        })
      }
    })

    // 分配到上午/下午
    const totalSpots = allLeafSpots.length
    const morningCount = Math.ceil(totalSpots / 2)

    // 分配美食：午餐 + 晚餐
    const lunchFood = foods.length > 0 ? { ...foods[0], mealType: 'lunch' } : null
    const dinnerFood = foods.length > 1 ? { ...foods[1], mealType: 'dinner' } : null

    const hotelData = hotel || null

    // 默认中心点（第一个景点的坐标或多个景点的中心）
    const defaultCenter = (() => {
      const valid = parentSpots.filter(s => s.lat && s.lng)
      if (valid.length === 0) return { lat: 39.9, lng: 116.4 }
      return {
        lat: valid.reduce((s, v) => s + parseFloat(v.lat), 0) / valid.length,
        lng: valid.reduce((s, v) => s + parseFloat(v.lng), 0) / valid.length
      }
    })()

    const timelineNodes = []
    let currentMinutes = dayStartMinutes
    let prevNode = hotelData || defaultCenter
    let spotOrder = 0
    let isFirstRealNode = !hotelData // 无酒店时起点未知，隐藏第一程通行时间；有酒店时展示酒店→景点的真实路程
    const allTimelineSpots = []

    // 起点酒店
    timelineNodes.push({
      id: 'day_header_1',
      type: 'day_header',
      day: 1,
      title: '一日行程',
      startTime: formatTime(currentMinutes)
    })

    if (hotelData) {
      timelineNodes.push({
        id: `hotel_start_day1`,
        type: 'hotel',
        day: 1,
        role: 'start',
        order: 0,
        data: hotelData,
        startTime: formatTime(currentMinutes),
        endTime: formatTime(currentMinutes),
        state: 'pending'
      })
    }

    // 上午节点
    for (let i = 0; i < morningCount; i++) {
      const spot = allLeafSpots[i]
      const transport = estimateTransport(prevNode, spot)
      currentMinutes += transport.duration

      const dur = spot.stay_duration || 30
      const node = {
        id: `spot_${spot.id}_day1`,
        type: 'spot',
        day: 1,
        order: ++spotOrder,
        data: spot,
        startTime: formatTime(currentMinutes),
        endTime: formatTime(currentMinutes + dur),
        stayDuration: dur,
        state: 'pending',
        transportFromPrev: isFirstRealNode ? null : transport
      }
      isFirstRealNode = false
      allTimelineSpots.push(node)
      timelineNodes.push(node)
      currentMinutes += dur
      prevNode = spot
    }

    // 午餐
    if (lunchFood) {
      if (currentMinutes < LUNCH_WINDOW.start - 15 && morningCount > 0) {
        currentMinutes = Math.min(currentMinutes + 15, LUNCH_WINDOW.start)
      }
      const transport = estimateTransport(prevNode, lunchFood)
      currentMinutes += Math.max(transport.duration, 5)
      const mealTag = getMealTag(currentMinutes, 'lunch')

      timelineNodes.push({
        id: `food_${lunchFood.id}_day1`,
        type: 'food',
        day: 1,
        order: ++spotOrder,
        data: lunchFood,
        mealType: 'lunch',
        mealTag,
        startTime: formatTime(currentMinutes),
        endTime: formatTime(currentMinutes + MEAL_DURATION),
        state: 'pending',
        transportFromPrev: isFirstRealNode ? null : transport
      })
      isFirstRealNode = false
      currentMinutes += MEAL_DURATION
      prevNode = lunchFood
    }

    // 下午节点
    for (let i = morningCount; i < totalSpots; i++) {
      const spot = allLeafSpots[i]
      const transport = estimateTransport(prevNode, spot)
      currentMinutes += transport.duration

      const dur = spot.stay_duration || 30
      const node = {
        id: `spot_${spot.id}_day1`,
        type: 'spot',
        day: 1,
        order: ++spotOrder,
        data: spot,
        startTime: formatTime(currentMinutes),
        endTime: formatTime(currentMinutes + dur),
        stayDuration: dur,
        state: 'pending',
        transportFromPrev: transport
      }
      allTimelineSpots.push(node)
      timelineNodes.push(node)
      currentMinutes += dur
      prevNode = spot
    }

    // 晚餐
    if (dinnerFood) {
      if (currentMinutes < DINNER_WINDOW.start - 15 && totalSpots > 0) {
        currentMinutes = Math.min(currentMinutes + 20, DINNER_WINDOW.start)
      }
      const transport = estimateTransport(prevNode, dinnerFood)
      currentMinutes += Math.max(transport.duration, 5)
      const mealTag = getMealTag(currentMinutes, 'dinner')

      timelineNodes.push({
        id: `food_${dinnerFood.id}_day1`,
        type: 'food',
        day: 1,
        order: ++spotOrder,
        data: dinnerFood,
        mealType: 'dinner',
        mealTag,
        startTime: formatTime(currentMinutes),
        endTime: formatTime(currentMinutes + MEAL_DURATION),
        state: 'pending',
        transportFromPrev: isFirstRealNode ? null : transport
      })
      isFirstRealNode = false
      currentMinutes += MEAL_DURATION
      prevNode = dinnerFood
    }

    // 终点酒店
    if (hotelData) {
      const transport = estimateTransport(prevNode, hotelData)
      currentMinutes += Math.max(transport.duration, 5)
      if (currentMinutes > 21 * 60 + 30) {
        currentMinutes = 21 * 60 + 30
      }
      timelineNodes.push({
        id: 'hotel_end_day1',
        type: 'hotel',
        day: 1,
        role: 'end',
        order: ++spotOrder,
        data: hotelData,
        startTime: formatTime(currentMinutes),
        endTime: formatTime(currentMinutes),
        state: 'pending',
        transportFromPrev: transport
      })
    }

    const spotBudget = allLeafSpots.reduce((s, sp) => s + (Number(sp.ticket_price) || 0), 0)
    const foodBudget = foods.reduce((s, f) => s + (Number(f.price_per_person) || 0), 0)

    const summary = {
      attractionName: parentSpots.map(s => s.name).join(' → '),
      spotsCount: allLeafSpots.length,
      foodsCount: foods.length,
      hotelName: hotel?.name || '未选择',
      totalBudget: spotBudget + foodBudget,
      spotBudget,
      foodBudget,
      totalDays: 1,
      totalDuration: allTimelineSpots.reduce((s, n) => s + (n.stayDuration || 0), 0),
      lat: defaultCenter.lat,
      lng: defaultCenter.lng
    }

    res.json({
      success: true,
      data: { timelineNodes, summary }
    })
  } catch (err) {
    console.error('[Travel] 多景点规划失败:', err.message)
    res.status(500).json({ error: '多景点规划计算失败' })
  }
})

// ==================== Phase 2: 天气联动 ====================

/**
 * POST /travel/plan-weather
 * 获取指定日期+坐标的天气预报（调高德天气 API）
 * Body: { lat, lng, date?: '2026-06-28' }
 */
router.post('/plan-weather', async (req, res) => {
  try {
    const { lat, lng, date } = req.body
    if (!lat || !lng) return res.status(400).json({ error: '请提供经纬度' })

    const AMAP_KEY = config?.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || ''
    const QW_PROJECT_ID = process.env.QWEATHER_PROJECT_ID || ''
    const QW_CREDENTIAL_ID = process.env.QWEATHER_CREDENTIAL_ID || ''
    const QW_API_HOST = process.env.QWEATHER_API_HOST || ''
    let QW_PRIVATE_KEY = ''
    try {
      QW_PRIVATE_KEY = fs.readFileSync(path.join(process.cwd(), 'qweather_private.pem'), 'utf8').trim()
    } catch (_) { /* ignore */ }
    const hasQWeather = QW_PROJECT_ID && QW_CREDENTIAL_ID && QW_PRIVATE_KEY && QW_API_HOST
    if (!AMAP_KEY && !hasQWeather) return res.json({ success: true, data: null, message: '天气服务暂未配置' })

    const targetDate = date || new Date().toISOString().slice(0, 10)

    // ===== 缓存（按坐标+日期） =====
    const cacheKey = `weather:v3:${lat.toFixed(4)},${lng.toFixed(4)}:${targetDate}`
    const cached = cacheGet(cacheKey)
    if (cached) return res.json({ success: true, data: cached, cached: true })

    // ===== 并行获取数据 =====
    let amapResult = null   // 高德：基础实时天气
    let qwHourly = null     // 和风：逐小时（未来24h）
    let qwDaily = null      // 和风：逐日（未来7天）
    let qwNow = null        // 和风：实时天气
    let cityName = ''

    // 高德逆地理编码 → adcode + 城市名
    let adcode = ''
    try {
      const { data: regeo } = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
        params: { key: AMAP_KEY, location: `${lng},${lat}`, output: 'JSON' },
        timeout: 5000
      })
      adcode = regeo?.regeocode?.addressComponent?.adcode || ''
      cityName = regeo?.regeocode?.addressComponent?.city || regeo?.regeocode?.addressComponent?.province || ''
    } catch (e) { /* ignore */ }

    // 并行拉取所有天气源
    const parallel = []

    // 1) 高德基础实时天气
    if (AMAP_KEY && adcode) {
      parallel.push(
        axios.get('https://restapi.amap.com/v3/weather/weatherInfo', {
          params: { key: AMAP_KEY, city: adcode, extensions: 'base', output: 'JSON' },
          timeout: 5000
        }).then(r => {
          if (r.data?.status === '1' && r.data.lives?.length) {
            const live = r.data.lives[0]
            amapResult = {
              weather: live.weather,
              temperature: live.temperature,
              wind: live.winddirection + live.windpower + '级',
              humidity: live.humidity,
              city: live.city
            }
            if (!cityName) cityName = live.city
          }
        }).catch(() => {})
      )
    }

    // 2) 和风：实时 + 24h 逐小时 + 7d 逐日（JWT 认证）
    if (hasQWeather) {
      const loc = `${lng.toFixed(2)},${lat.toFixed(2)}`
      // 生成 JWT Token（Ed25519）
      let qwToken = ''
      try {
        const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', kid: QW_CREDENTIAL_ID })).toString('base64url')
        const now = Math.floor(Date.now() / 1000) - 30 // 提前30秒防时钟偏差
        const payload = Buffer.from(JSON.stringify({ sub: QW_PROJECT_ID, iat: now, exp: now + 3600 })).toString('base64url')
        const signingInput = `${header}.${payload}`
        const privateKey = crypto.createPrivateKey({ key: QW_PRIVATE_KEY, format: 'pem' })
        const sig = crypto.sign(null, Buffer.from(signingInput), privateKey).toString('base64url')
        qwToken = `${signingInput}.${sig}`
      } catch (e) {
        console.error('[Weather] JWT 生成失败:', e.message)
      }

      if (qwToken) {
        const qwHeaders = { Authorization: `Bearer ${qwToken}` }
        const apiBase = `https://${QW_API_HOST}`
        // 和风 now
        parallel.push(
          axios.get(`${apiBase}/v7/weather/now`, {
            headers: qwHeaders,
            params: { location: loc },
            timeout: 5000
          }).then(r => {
            if (r.data?.code === '200') qwNow = r.data.now
          }).catch(e => console.error('[Weather] 和风 now 请求失败:', e.message))
        )
        // 和风 24h
        parallel.push(
          axios.get(`${apiBase}/v7/weather/24h`, {
            headers: qwHeaders,
            params: { location: loc },
            timeout: 5000
          }).then(r => {
            if (r.data?.code === '200') qwHourly = r.data.hourly || []
          }).catch(e => console.error('[Weather] 和风 24h 请求失败:', e.message))
        )
        // 和风 7d
        parallel.push(
          axios.get(`${apiBase}/v7/weather/7d`, {
            headers: qwHeaders,
            params: { location: loc },
            timeout: 5000
          }).then(r => {
            if (r.data?.code === '200') qwDaily = r.data.daily || []
          }).catch(e => console.error('[Weather] 和风 7d 请求失败:', e.message))
        )
      }
    }

    await Promise.allSettled(parallel)

    // ===== 数据合并 =====
    // 实时天气：优先和风 now，降级高德
    let currentWeather, currentTemp, currentWind, currentHumidity
    if (qwNow) {
      currentWeather = qwNow.text
      currentTemp = qwNow.temp
      currentWind = qwNow.windDir + qwNow.windScale + '级'
      currentHumidity = qwNow.humidity
    } else if (amapResult) {
      currentWeather = amapResult.weather
      currentTemp = amapResult.temperature
      currentWind = amapResult.wind
      currentHumidity = amapResult.humidity
    } else {
      return res.json({ success: false, message: '天气数据获取失败' })
    }

    // 逐小时：来自和风 24h
    const hourly = (qwHourly || []).map(h => ({
      time: h.fxTime,
      hour: h.fxTime ? h.fxTime.slice(11, 16) : '',
      temp: h.temp,
      weather: h.text,
      icon: h.icon,
      wind: h.windDir,
      windScale: h.windScale,
      humidity: h.humidity
    }))

    // 逐日预报：优先和风 7d，降级高德 all
    let forecast = []
    if (qwDaily && qwDaily.length) {
      forecast = qwDaily.slice(0, 4).map(d => ({
        date: d.fxDate,
        dayWeather: d.textDay,
        nightWeather: d.textNight,
        dayTemp: d.tempMax,
        nightTemp: d.tempMin,
        wind: d.windDirDay,
        windScale: d.windScaleDay,
        humidity: d.humidity,
        sunrise: d.sunrise || '',
        sunset: d.sunset || '',
        moonrise: d.moonrise || '',
        uvIndex: d.uvIndex || ''
      }))
    } else if (amapResult) {
      // 降级：尝试高德 all 模式获取逐日
      try {
        const { data: amapAll } = await axios.get('https://restapi.amap.com/v3/weather/weatherInfo', {
          params: { key: AMAP_KEY, city: adcode, extensions: 'all', output: 'JSON' },
          timeout: 5000
        })
        if (amapAll?.status === '1' && amapAll.forecasts?.length) {
          const casts = amapAll.forecasts[0].casts || []
          forecast = casts.slice(0, 4).map(c => ({
            date: c.date,
            dayWeather: c.dayweather,
            nightWeather: c.nightweather,
            dayTemp: c.daytemp,
            nightTemp: c.nighttemp,
            wind: c.daywind,
            windScale: '',
            humidity: '',
            sunrise: '',
            sunset: ''
          }))
        }
      } catch (e) { /* ignore */ }
    }

    // 降雨警告
    const rainWarning =
      (currentWeather || '').includes('雨') ||
      forecast.some(f => (f.dayWeather || '').includes('雨') || (f.nightWeather || '').includes('雨'))

    const result = {
      date: targetDate,
      city: cityName || amapResult?.city || '',
      weather: currentWeather,
      temperature: currentTemp ? `${currentTemp}°C` : '',
      nightTemp: forecast[0]?.nightTemp ? `${forecast[0].nightTemp}°C` : '',
      wind: currentWind,
      humidity: currentHumidity ? `${currentHumidity}%` : '',
      visibility: '',   // 和风免费版不提供
      uvIndex: forecast[0]?.uvIndex || '',
      hourly,
      forecast,
      rainWarning
    }

    cacheSet(cacheKey, result, 30 * 60 * 1000) // 缓存30分钟（小时数据时效性更高）
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('[Travel] 天气查询失败:', err.message)
    res.status(500).json({ error: '天气查询失败' })
  }
})

// ==================== Phase 2: 交通方式规划 ====================

/**
 * POST /travel/tide
 * 潮汐预测（海滨城市专用）
 * 使用简化天文潮汐算法：基于月球过中天时间 + 12h25min 半日潮周期
 * Body: { lat, lng }
 */
router.post('/tide', (req, res) => {
  try {
    const { lat, lng } = req.body
    if (!lat || !lng) return res.status(400).json({ error: '请提供经纬度' })

    const today = new Date()
    const year = today.getFullYear()
    const month = today.getMonth() + 1
    const day = today.getDate()

    // 缓存
    const cacheKey = `tide:${lat.toFixed(2)}:${lng.toFixed(2)}:${year}-${month}-${day}`
    const cached = cacheGet(cacheKey)
    if (cached) return res.json({ success: true, data: cached, cached: true })

    /**
     * 简化潮汐预测算法：
     * 1. 计算月球过中天时间（lunar transit）近似值
     * 2. 高潮 ≈ 月球过中天 + 当地潮汐滞后（约30-90分钟）
     * 3. 半日潮周期 ≈ 12小时25分钟
     * 4. 低潮 ≈ 高潮 ± 6小时12分
     * 5. 高度用正弦曲线 + 大潮/小潮系数估算
     */

    // 儒略日计算（简化）
    const jd = (year, month, day) => {
      let y = year, m = month, d = day
      if (m <= 2) { y -= 1; m += 12 }
      const A = Math.floor(y / 100)
      const B = 2 - A + Math.floor(A / 4)
      return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5
    }

    const JD = jd(year, month, day)
    // 2000年1月1日 12:00 UT 的儒略日
    const JD2000 = 2451545.0
    const daysSinceJ2000 = JD - JD2000

    // 月球平均经度（度数）
    const moonMeanLong = (218.3165 + 13.176396 * daysSinceJ2000) % 360
    // 太阳平均经度
    const sunMeanLong = (280.4665 + 0.9856474 * daysSinceJ2000) % 360

    // 月球过中天时间（UTC小时，在格林威治子午线）
    // 简化：月球时角 = 太阳时角 - 月球赤经差
    const lunarTransitUTC = (12 + (moonMeanLong - sunMeanLong) / 15 + 12) % 24

    // 当地时区偏移（基于经度估算，每15度1小时）
    const tzOffset = Math.round(lng / 15)

    // 当地月球过中天时间
    let lunarTransitLocal = (lunarTransitUTC + tzOffset + 24) % 24

    // 沿海潮汐滞后（分钟）：中国沿海约30-90分钟
    const tideLagMinutes = 60 // 取平均值
    const lunarTransitHours = lunarTransitLocal + tideLagMinutes / 60

    // 半日潮周期 12.42 小时
    const TIDE_PERIOD = 12.42

    // 大潮/小潮系数（基于月相：新月/满月大潮，上弦/下弦小潮）
    const moonAge = (moonMeanLong - sunMeanLong + 360) % 360
    const springFactor = Math.cos(moonAge * Math.PI / 180) // -1到1，±1=大潮，0=小潮

    // 潮差：大潮约3-4米，小潮约1-2米（中国沿海平均值）
    const meanRange = 2.5
    const amplitude = meanRange / 2 * (0.6 + 0.4 * Math.abs(springFactor))

    // 生成今日4次潮汐（2高2低）
    const generateTides = () => {
      const highTides = []
      const lowTides = []

      // 平均海平面（相对于最低低潮面）
      const msl = 3.0

      for (let i = -1; i <= 2; i++) {
        // 高潮时间
        const htHour = lunarTransitHours + i * TIDE_PERIOD / 2
        const htTime = ((htHour % 24) + 24) % 24
        const htH = Math.floor(htTime)
        const htM = Math.round((htTime - htH) * 60)
        const htTimeStr = `${String(htH).padStart(2, '0')}:${String(htM % 60).padStart(2, '0')}`
        // 高潮高度
        let htHeight = msl + amplitude * (0.7 + 0.3 * springFactor * Math.cos(i * Math.PI))
        // 低潮时间（高潮后6h12m）
        const ltHour = htHour + TIDE_PERIOD / 2
        const ltTime = ((ltHour % 24) + 24) % 24
        const ltH = Math.floor(ltTime)
        const ltM = Math.round((ltTime - ltH) * 60)
        const ltTimeStr = `${String(ltH).padStart(2, '0')}:${String(ltM % 60).padStart(2, '0')}`
        // 低潮高度
        let ltHeight = msl - amplitude * (0.7 + 0.3 * springFactor * Math.cos(i * Math.PI))

        // 只保留今日 00:00-23:59 的潮汐
        if (htTime > 0 && htTime < 24) {
          highTides.push({ time: htTimeStr, height: htHeight.toFixed(1) })
        }
        if (ltTime > 0 && ltTime < 24) {
          lowTides.push({ time: ltTimeStr, height: ltHeight.toFixed(1) })
        }
      }

      // 按时间排序
      highTides.sort((a, b) => a.time.localeCompare(b.time))
      lowTides.sort((a, b) => a.time.localeCompare(b.time))

      // 去重（时间四舍五入导致）
      const uniqueHigh = highTides.filter((t, i) => i === 0 || t.time !== highTides[i - 1].time)
      const uniqueLow = lowTides.filter((t, i) => i === 0 || t.time !== lowTides[i - 1].time)

      return { highTides: uniqueHigh.slice(0, 2), lowTides: uniqueLow.slice(0, 2) }
    }

    const tides = generateTides()

    // 月相描述
    let moonPhase = ''
    const absAge = Math.abs(moonAge)
    if (absAge < 22.5) moonPhase = '🌑 新月（大潮）'
    else if (absAge < 67.5) moonPhase = '🌓 上弦月（小潮）'
    else if (absAge < 112.5) moonPhase = '🌕 满月（大潮）'
    else if (absAge < 157.5) moonPhase = '🌗 下弦月（小潮）'
    else moonPhase = '🌑 新月（大潮）'

    const result = {
      date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      highTides: tides.highTides,
      lowTides: tides.lowTides,
      moonPhase,
      note: '基于天文潮汐模型的预测值，实际潮汐可能因风力、气压等因素有所偏差，仅供参考'
    }

    // 写入结果到 res
    cacheSet(cacheKey, result, 60 * 60 * 1000)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('[Travel] 潮汐预测失败:', err.message)
    res.status(500).json({ error: '潮汐预测失败' })
  }
})

// ==================== Phase 2: 交通方式规划（续） ====================

/**
 * POST /travel/route-distance
 * 两坐标间交通方式+距离+时间（调高德路径规划 API，降级 Haversine 估算）
 * Body: { from: {lat, lng}, to: {lat, lng}, transportMode?: 'drive'|'transit' }
 */
router.post('/route-distance', async (req, res) => {
  try {
    const { from, to, transportMode = 'drive' } = req.body
    if (!from?.lat || !from?.lng || !to?.lat || !to?.lng) {
      return res.status(400).json({ error: '请提供起终点坐标' })
    }

    // 估算距离（使用全局 haversineDistance）
    const dist = haversineDistance(from.lat, from.lng, to.lat, to.lng)

    // 缓存
    const cacheKey = `route:${from.lat.toFixed(4)},${from.lng.toFixed(4)}→${to.lat.toFixed(4)},${to.lng.toFixed(4)}`
    const cached = cacheGet(cacheKey)
    if (cached) return res.json({ success: true, data: cached, cached: true })

    const AMAP_KEY = config?.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || ''

    let result = null

    if (AMAP_KEY) {
      try {
        if (dist < 3000) {
          // 步行路径规划
          const { data: walkData } = await axios.get('https://restapi.amap.com/v3/direction/walking', {
            params: {
              key: AMAP_KEY,
              origin: `${from.lng},${from.lat}`,
              destination: `${to.lng},${to.lat}`,
              output: 'JSON'
            },
            timeout: 5000
          })
          if (walkData?.status === '1' && walkData.route?.paths?.length) {
            const path = walkData.route.paths[0]
            result = {
              mode: 'walk',
              distance: parseInt(path.distance) || dist,
              duration: Math.round(parseInt(path.duration) / 60) || Math.round(dist / 80) + 3,
              cost: 0
            }
          }
        } else if (dist < 30000) {
          // 驾车/公交路径规划
          const { data: driveData } = await axios.get('https://restapi.amap.com/v3/direction/driving', {
            params: {
              key: AMAP_KEY,
              origin: `${from.lng},${from.lat}`,
              destination: `${to.lng},${to.lat}`,
              output: 'JSON'
            },
            timeout: 5000
          })
          if (driveData?.status === '1' && driveData.route?.paths?.length) {
            const path = driveData.route.paths[0]
            const duration = Math.round(parseInt(path.duration) / 60) || Math.round(dist / 800) + 5
            result = {
              mode: transportMode === 'transit' ? (dist < 5000 ? 'transit' : 'drive') : 'drive',
              distance: parseInt(path.distance) || dist,
              duration,
              cost: path.tolls ? parseInt(path.tolls) : 0
            }
          }
        }
      } catch {
        // API 调用失败，降级
      }
    }

    // 降级：Haversine 估算（尊重用户选择的交通方式）
    if (!result) {
      if (transportMode === 'transit') {
        if (dist < 1500) {
          result = { mode: 'walk', distance: dist, duration: Math.round(dist / 80) + 3, cost: 0 }
        } else {
          result = { mode: 'transit', distance: dist, duration: Math.round(dist / 300) + 15, cost: 5 }
        }
      } else {
        if (dist < 1500) {
          result = { mode: 'walk', distance: dist, duration: Math.round(dist / 80) + 2, cost: 0 }
        } else {
          result = { mode: 'drive', distance: dist, duration: Math.round(dist / 800) + 5, cost: Math.round(dist / 1000 * 3) }
        }
      }
    }

    cacheSet(cacheKey, result, 24 * 60 * 60 * 1000)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('[Travel] 路径规划失败:', err.message)
    res.status(500).json({ error: '路径规划失败' })
  }
})

// ==================== Phase 3: 打卡后动态调整 ====================

/**
 * POST /travel/plan-adjust
 * 打卡后动态调整剩余行程
 * Body: {
 *   timelineNodes: [...],
 *   currentDay: number,
 *   lastCheckedNodeIndex: number,
 *   actualTimeOffset: number  // 分钟偏差（正=超前，负=迟到）
 * }
 */
router.post('/plan-adjust', (req, res) => {
  try {
    const { timelineNodes = [], currentDay = 1, lastCheckedNodeIndex = 0, actualTimeOffset = 0 } = req.body
    if (!timelineNodes.length) return res.json({ success: false, message: '无行程数据' })

    const formatTime = (m) => {
      const h = Math.floor(m / 60) % 24
      const min = Math.round(m % 60)
      return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
    }
    const parseMinutes = (t) => {
      if (!t) return 0
      const [h, m] = t.split(':').map(Number)
      return h * 60 + (m || 0)
    }

    const nodes = JSON.parse(JSON.stringify(timelineNodes))
    const dayNodes = nodes.filter(n => n.day === currentDay || !n.day)
    const remainingNodes = dayNodes.filter((n, i) => i > lastCheckedNodeIndex && n.type !== 'day_header')

    if (!remainingNodes.length) {
      return res.json({ success: true, data: { adjustedNodes: nodes, warnings: [] } })
    }

    const warnings = []
    const absOffset = Math.abs(actualTimeOffset)

    if (absOffset < 15) {
      // 偏差不大，只需重新对齐时间
      const firstRemaining = remainingNodes[0]
      const originalStart = parseMinutes(firstRemaining.startTime)
      const newStart = originalStart + actualTimeOffset
      firstRemaining.startTime = formatTime(newStart)
      if (firstRemaining.endTime) {
        firstRemaining.endTime = formatTime(newStart + (firstRemaining.stayDuration || 30))
      }
      return res.json({
        success: true,
        data: { adjustedNodes: nodes, warnings: ['时间已微调对齐'] }
      })
    }

    let timeShift = actualTimeOffset

    for (const node of remainingNodes) {
      const dur = node.stayDuration || 30
      // 压缩策略：迟到超过30分钟，压缩后续景点停留时间
      if (timeShift < -30 && node.type === 'spot' && dur > 20) {
        const compress = Math.min(dur - 15, Math.abs(timeShift))
        node.stayDuration = dur - compress
        if (node.endTime) {
          const start = parseMinutes(node.startTime)
          node.endTime = formatTime(start + node.stayDuration)
        }
        timeShift += compress
        warnings.push(`${node.data?.name || '景点'}停留时间从${dur}分钟调整为${dur - compress}分钟`)
      }

      // 跳过策略：如果迟到超过90分钟且这是低优先级节点
      if (timeShift < -90 && node.type === 'spot' && !node.isParentNode) {
        warnings.push(`建议跳过${node.data?.name || '该景点'}以赶上后续行程`)
      }

      // 重新计算时间
      if (timeShift !== 0) {
        const start = parseMinutes(node.startTime) + timeShift
        node.startTime = formatTime(start)
        if (node.endTime) {
          node.endTime = formatTime(start + (node.stayDuration || 30))
        }
      }
    }

    // 检查用餐时间
    const lunchNode = remainingNodes.find(n => n.type === 'food' && n.mealType === 'lunch')
    if (lunchNode) {
      const lunchMinutes = parseMinutes(lunchNode.startTime)
      if (lunchMinutes > 810) warnings.push('午餐可能推迟到13:30后，建议提前用餐')
    }

    res.json({ success: true, data: { adjustedNodes: nodes, warnings } })
  } catch (err) {
    console.error('[Travel] 行程调整失败:', err.message)
    res.status(500).json({ error: '行程调整失败' })
  }
})

// ==================== Phase 3: 行程保存/历史 ====================

/**
 * POST /travel/plan-save
 * 保存行程（文件存储）
 * Body: { planName, planData: { timelineNodes, summary, ... }, userId? }
 */
router.post('/plan-save', (req, res) => {
  try {
    const { planName, planData, userId } = req.body
    if (!planName || !planData) return res.status(400).json({ error: '缺少行程名称或数据' })

    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const record = {
      planId,
      planName,
      userId: userId || 'anonymous',
      planData,
      savedAt: new Date().toISOString(),
      summary: planData.summary || {}
    }

    // 简单文件存储
    const plansDir = path.join(process.cwd(), 'data', 'plans')
    if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true })

    const filePath = path.join(plansDir, `${planId}.json`)
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8')

    res.json({ success: true, data: { planId, savedAt: record.savedAt } })
  } catch (err) {
    console.error('[Travel] 保存行程失败:', err.message)
    res.status(500).json({ error: '保存失败' })
  }
})

/**
 * GET /travel/plan-history
 * 获取行程历史列表
 * Query: ?userId=xxx
 */
router.get('/plan-history', (req, res) => {
  try {
    const { userId } = req.query
    const plansDir = path.join(process.cwd(), 'data', 'plans')

    if (!fs.existsSync(plansDir)) return res.json({ success: true, data: [] })

    const files = fs.readdirSync(plansDir).filter(f => f.endsWith('.json'))
    const plans = files.map(f => {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(plansDir, f), 'utf-8'))
        if (userId && content.userId !== userId && content.userId !== 'anonymous') return null
        return {
          planId: content.planId,
          planName: content.planName,
          savedAt: content.savedAt,
          summary: content.summary
        }
      } catch { return null }
    }).filter(Boolean)

    plans.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
    res.json({ success: true, data: plans })
  } catch (err) {
    console.error('[Travel] 获取行程历史失败:', err.message)
    res.status(500).json({ error: '获取失败' })
  }
})

// ==================== Phase 3: 外部攻略获取 ====================

/**
 * POST /travel/fetch-guide
 * 外部攻略内容获取（后端代理+清洗）
 * Body: { url }
 */
router.post('/fetch-guide', async (req, res) => {
  try {
    const { url } = req.body
    if (!url) return res.status(400).json({ error: '请提供攻略链接' })

    // 缓存
    const cacheKey = `guide:${url}`
    const cached = cacheGet(cacheKey)
    if (cached) return res.json({ success: true, data: cached, cached: true })

    // 频率限制简单检查（同一IP每分钟最多5次）
    const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip
    const rateKey = `rate:guide:${clientIp}`
    const rateCount = cacheGet(rateKey) || 0
    if (rateCount >= 5) return res.status(429).json({ error: '请求过于频繁，请稍后重试' })
    cacheSet(rateKey, rateCount + 1, 60 * 1000)

    let html = ''
    try {
      const { data } = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        maxRedirects: 3
      })
      html = typeof data === 'string' ? data : JSON.stringify(data)
    } catch (fetchErr) {
      return res.json({ success: false, message: '无法获取该攻略链接' })
    }

    // 简单HTML清洗：去除script/style标签，提取文本
    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, '\n')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/\n{3,}/g, '\n\n')
      .trim()

    // 截取前5000字
    if (text.length > 5000) text = text.slice(0, 5000) + '...(内容已截断)'

    // 提取标题
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
    const title = titleMatch ? titleMatch[1].trim() : '未知来源'

    const result = { title, text, source: url }
    cacheSet(cacheKey, result, 60 * 60 * 1000)
    res.json({ success: true, data: result })
  } catch (err) {
    console.error('[Travel] 获取攻略失败:', err.message)
    res.status(500).json({ error: '获取失败' })
  }
})

export default router
