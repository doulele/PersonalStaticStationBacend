import { Router } from 'express'
import axios from 'axios'
import config from '../config/index.js'
import { geocode, searchNearby, regeocode, searchPOI, searchRegionHotspots, searchProvinceHotspots, ipLocate, normalizePoiName, SCENIC_TYPES, SCENIC_TYPE_CODES } from '../services/amapService.js'
import { getAiRecommendation } from '../services/travelAiService.js'

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

// ==================== Mock 数据 ====================
const mockPlans = {
  1: {
    attraction: { id: 1, name: '故宫博物院', lat: 39.916345, lng: 116.397155 },
    spots: [
      { id: 101, name: '午门', lat: 39.9139, lng: 116.3970, stay_duration: 20, default_order: 1, ticket_price: 0, highlight: '故宫正门，气势恢宏的城门建筑', desc: '故宫正门，气势恢宏的城门建筑，检票入口。' },
      { id: 102, name: '太和殿', lat: 39.9155, lng: 116.3972, stay_duration: 40, default_order: 2, ticket_price: 0, highlight: '故宫最大殿宇，皇帝登基大典举办地', desc: '故宫最大的宫殿，皇帝登基、大婚等重大典礼的举办地。' },
      { id: 103, name: '中和殿', lat: 39.9160, lng: 116.3973, stay_duration: 15, default_order: 3, ticket_price: 0, highlight: '皇帝前往太和殿前休憩之所', desc: '皇帝前往太和殿前休息和准备的地方。' },
      { id: 104, name: '保和殿', lat: 39.9165, lng: 116.3974, stay_duration: 20, default_order: 4, ticket_price: 0, highlight: '清代殿试场所，皇家最高学府', desc: '清代殿试的举办场所，建筑精美。' },
      { id: 105, name: '乾清宫', lat: 39.9180, lng: 116.3975, stay_duration: 30, default_order: 5, ticket_price: 0, highlight: '正大光明匾所在地', desc: '明代和清初皇帝的寝宫，正大光明匾所在地。' },
      { id: 106, name: '交泰殿', lat: 39.9185, lng: 116.3976, stay_duration: 15, default_order: 6, ticket_price: 0, highlight: '皇后接受朝贺的宫殿', desc: '皇后生日接受朝贺的地方。' },
      { id: 107, name: '坤宁宫', lat: 39.9190, lng: 116.3977, stay_duration: 20, default_order: 7, ticket_price: 0, highlight: '皇后寝宫，清代祭祀重地', desc: '皇后的寝宫，清代改为祭祀场所。' },
      { id: 108, name: '御花园', lat: 39.9198, lng: 116.3975, stay_duration: 40, default_order: 8, ticket_price: 0, highlight: '600年古树参天的皇家园林', desc: '皇家园林，古树参天，亭台楼阁错落有致。' },
      { id: 109, name: '神武门', lat: 39.9205, lng: 116.3973, stay_duration: 10, default_order: 9, ticket_price: 0, highlight: '故宫北门出口，可远眺景山', desc: '故宫北门，出口处，可远眺景山。' }
    ],
    foods: [
      { id: 201, name: '四季民福烤鸭店', recommend_dish: '北京烤鸭', lat: 39.9148, lng: 116.4035, price_per_person: 150, highlight: '景观位可观东华门，故宫旁人气名店' },
      { id: 202, name: '故宫冰窖餐厅', recommend_dish: '宫廷糕点套餐', lat: 39.9172, lng: 116.3978, price_per_person: 80, highlight: '故宫院内唯一餐厅，皇家庭院中用餐' },
      { id: 203, name: '老北京炸酱面大王', recommend_dish: '炸酱面', lat: 39.9200, lng: 116.4000, price_per_person: 45, highlight: '三代传承，地道京味炸酱面' },
      { id: 204, name: '护国寺小吃', recommend_dish: '豆汁焦圈', lat: 39.9215, lng: 116.3985, price_per_person: 30, highlight: '老北京传统小吃集合，品种超百种' },
      { id: 205, name: '东来顺饭庄', recommend_dish: '铜锅涮羊肉', lat: 39.9155, lng: 116.4050, price_per_person: 120, highlight: '百年老字号，手切鲜羊肉一绝' }
    ],
    hotels: [
      { id: 301, name: '北京王府井希尔顿酒店', price_range: '800-1500元/晚', lat: 39.9180, lng: 116.4100, highlight: '步行10分钟直达故宫东华门' },
      { id: 302, name: '北京饭店', price_range: '600-1200元/晚', lat: 39.9120, lng: 116.4080, highlight: '百年传奇酒店，长安街核心位置' },
      { id: 303, name: '如家精选(故宫店)', price_range: '300-500元/晚', lat: 39.9205, lng: 116.4040, highlight: '性价比之选，步行可达神武门' },
      { id: 304, name: '景山花园酒店', price_range: '500-800元/晚', lat: 39.9220, lng: 116.3990, highlight: '紧邻景山公园，屋顶可观故宫全景' }
    ]
  },
  2: {
    attraction: { id: 2, name: '上海迪士尼乐园', lat: 31.1444, lng: 121.6608 },
    spots: [
      { id: 401, name: '米奇大街', lat: 31.1430, lng: 121.6585, stay_duration: 30, default_order: 1, ticket_price: 0, highlight: '入园首站，米奇米妮合影打卡点', desc: '入园第一站，购物和拍照的好地方，米奇米妮见面点。' },
      { id: 402, name: '探险岛', lat: 31.1445, lng: 121.6600, stay_duration: 60, default_order: 2, ticket_price: 0, highlight: '翱翔·飞越地平线，排队必玩项目', desc: '翱翔·飞越地平线、雷鸣山漂流等热门项目所在地。' },
      { id: 403, name: '宝藏湾', lat: 31.1450, lng: 121.6615, stay_duration: 50, default_order: 3, ticket_price: 0, highlight: '加勒比海盗主题，沉落宝藏之战', desc: '加勒比海盗主题区，沉落宝藏之战不容错过。' },
      { id: 404, name: '梦幻世界', lat: 31.1440, lng: 121.6620, stay_duration: 70, default_order: 4, ticket_price: 0, highlight: '七个小矮人矿山车，全家欢乐', desc: '七个小矮人矿山车、小飞侠天空奇遇等家庭项目。' },
      { id: 405, name: '明日世界', lat: 31.1435, lng: 121.6630, stay_duration: 50, default_order: 5, ticket_price: 0, highlight: '创极速光轮，科技感爆棚', desc: '创极速光轮、巴斯光年星际营救等科技感十足的项目。' },
      { id: 406, name: '奇想花园', lat: 31.1425, lng: 121.6595, stay_duration: 40, default_order: 6, ticket_price: 0, highlight: '旋转木马+夜晚烟花最佳观赏区', desc: '旋转木马、小飞象，夜晚烟花秀最佳观赏区域。' }
    ],
    foods: [
      { id: 501, name: '皇家宴会厅', recommend_dish: '公主主题套餐', lat: 31.1430, lng: 121.6590, price_per_person: 350, highlight: '城堡内用餐，与迪士尼公主合影' },
      { id: 502, name: '巴波萨烧烤', recommend_dish: '烤猪肋排', lat: 31.1450, lng: 121.6615, price_per_person: 100, highlight: '海盗主题餐厅，氛围感满分' },
      { id: 503, name: '部落丰盛堂', recommend_dish: '火鸡腿饭', lat: 31.1445, lng: 121.6600, price_per_person: 85, highlight: '迪士尼招牌火鸡腿，排队也要吃' },
      { id: 504, name: '米奇好伙伴美味集市', recommend_dish: '米奇头披萨', lat: 31.1430, lng: 121.6585, price_per_person: 90, highlight: '米奇造型美食，拍照出片率100%' },
      { id: 505, name: '星露台餐厅', recommend_dish: '芝士牛肉汉堡', lat: 31.1435, lng: 121.6630, price_per_person: 80, highlight: '科幻主题餐厅，汉堡配薯条经典组合' }
    ],
    hotels: [
      { id: 601, name: '上海迪士尼乐园酒店', price_range: '2000-4000元/晚', lat: 31.1400, lng: 121.6650, highlight: '梦幻城堡酒店，专属入园通道' },
      { id: 602, name: '玩具总动员酒店', price_range: '800-1500元/晚', lat: 31.1390, lng: 121.6640, highlight: '巴斯光年主题，亲子家庭首选' },
      { id: 603, name: '上海邻家美利亚酒店', price_range: '600-1200元/晚', lat: 31.1410, lng: 121.6580, highlight: '步行5分钟入园，性价比超高' }
    ]
  }
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
  try {
    // 优先按省份精确搜索（当点击地图省份时）
    const pois = province
      ? await searchProvinceHotspots(province)
      : await searchRegionHotspots(region)
    res.json({ success: true, data: pois, source: 'amap' })
  } catch (err) {
    console.error('[Travel] 区域热门搜索失败:', err.message)
    res.status(500).json({ error: '区域热门搜索失败' })
  }
})

/**
 * POST /travel/plan-dynamic
 * 动态生成规划数据（周边景点 + 餐饮 + 住宿），放在 /:id 之前避免冲突
 * Body: { lat, lng, name }
 */
router.post('/plan-dynamic', async (req, res) => {
  const { lat, lng, name } = req.body
  if (!lat || !lng) return res.status(400).json({ error: '缺少经纬度' })

  try {
    const [poiSpots, foodPois, hotelPois] = await Promise.all([
      searchNearby(lng, lat, 5000),
      searchNearby(lng, lat, 3000, '中餐厅|外国餐厅|快餐厅|休闲餐饮场所|咖啡厅|茶艺馆|冷饮店|甜品店|糕饼店'),
      searchNearby(lng, lat, 8000, '宾馆酒店|旅馆招待所|青年旅舍|经济型住宿|酒店宾馆|度假村|农家院')
    ])

    const spots = poiSpots.slice(0, 8).map((p, i) => ({
      id: `dyn_spot_${i}_${Date.now()}`,
      name: p.name, lat: p.lat, lng: p.lng,
      stay_duration: 30, default_order: i + 1, ticket_price: 0,
      highlight: p.address?.slice(0, 25) || '',
      desc: p.address || ''
    }))

    const foods = foodPois.slice(0, 6).map((p, i) => ({
      id: `dyn_food_${i}_${Date.now()}`,
      name: p.name, recommend_dish: p.type || '',
      lat: p.lat, lng: p.lng,
      price_per_person: 50,
      highlight: p.address?.slice(0, 25) || ''
    }))

    const hotels = hotelPois.slice(0, 4).map((p, i) => ({
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
 * POST /travel/geocode
 * 地址转经纬度
 */
router.post('/geocode', async (req, res) => {
  try {
    const { address } = req.body
    if (!address) return res.status(400).json({ error: '请提供地址' })
    const result = await geocode(address)
    if (!result) return res.json({ success: false, message: '未找到该地址' })
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

    res.json({ success: true, data: { lng, lat, address, source } })
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
 * 搜索景点（真实高德 POI 搜索，无结果时回退 Mock）
 */
router.get('/search', async (req, res) => {
  const { keyword, city } = req.query
  if (!keyword || !keyword.trim()) {
    return res.json({ success: true, data: [] })
  }
  try {
    const pois = await searchPOI(keyword.trim(), city || undefined)

    // 给已知目的地打 mockId 标签
    const results = pois.map(poi => {
      let mockId = null
      if (poi.name.includes('故宫')) mockId = 1
      else if (poi.name.includes('迪士尼')) mockId = 2
      return { ...poi, mockId }
    })

    // 高德无结果时回退 Mock
    if (results.length === 0) {
      const kw = keyword.trim().toLowerCase()
      const mockFallback = Object.values(mockPlans)
        .map(p => ({ ...p.attraction, mockId: p.attraction.id }))
        .filter(a => a.name.toLowerCase().includes(kw))
      return res.json({ success: true, data: mockFallback, source: 'mock' })
    }

    res.json({ success: true, data: results, source: 'amap' })
  } catch (err) {
    console.error('[Travel] 搜索失败:', err.message)
    const kw = keyword.trim().toLowerCase()
    const results = Object.values(mockPlans)
      .map(p => ({ ...p.attraction, mockId: p.attraction.id }))
      .filter(a => a.name.toLowerCase().includes(kw))
    res.json({ success: true, data: results, source: 'mock-fallback' })
  }
})

/**
 * GET /travel/:id/plan
 * 获取全量规划数据（Mock）
 */
router.get('/:id/plan', (req, res) => {
  const data = mockPlans[req.params.id]
  if (!data) return res.status(404).json({ error: '景点数据不存在' })
  res.json({ success: true, data })
})

/**
 * POST /travel/generate
 * 生成攻略
 */
router.post('/generate', (req, res) => {
  const { attractionId, selectedSpotIds, selectedFoodIds, hotelId, customHotelName } = req.body
  const data = mockPlans[attractionId]
  if (!data) return res.status(404).json({ error: '景点数据不存在' })

  const orderedSpots = (selectedSpotIds || [])
    .map(id => data.spots.find(s => s.id === id))
    .filter(Boolean)
  const selectedFoods = (selectedFoodIds || [])
    .map(id => data.foods.find(f => f.id === id))
    .filter(Boolean)
  let hotelName = customHotelName || ''
  if (Number(hotelId) > 0) {
    const h = data.hotels.find(h => h.id === Number(hotelId))
    if (h) hotelName = h.name
  }

  const foodBudget = selectedFoods.reduce((s, f) => s + (f.price_per_person || 0), 0)
  const formatTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`

  const timeline = []
  let t = 480

  if (orderedSpots.length) {
    const half = Math.ceil(orderedSpots.length / 2)
    timeline.push({ type: 'section', title: '🎯 上午行程' })
    orderedSpots.slice(0, half).forEach(s => {
      timeline.push({ type: 'spot', time: formatTime(t), data: s })
      t += s.stay_duration
    })
    t += 15
  }
  if (selectedFoods.length) {
    t = Math.max(t, 690)
    timeline.push({ type: 'section', title: '🍽️ 午餐推荐' })
    timeline.push({ type: 'food', time: formatTime(t), data: selectedFoods[0] })
    t += 60
  }
  if (orderedSpots.length > 1) {
    const half = Math.ceil(orderedSpots.length / 2)
    timeline.push({ type: 'section', title: '🚶 下午行程' })
    orderedSpots.slice(half).forEach(s => {
      timeline.push({ type: 'spot', time: formatTime(t), data: s })
      t += s.stay_duration
    })
    t += 15
  }
  if (selectedFoods.length > 1) {
    t = Math.max(t, 1050)
    timeline.push({ type: 'section', title: '🍲 晚餐推荐' })
    timeline.push({ type: 'food', time: formatTime(t), data: selectedFoods[1] })
  }
  timeline.push({ type: 'section', title: '🏨 住宿安排' })
  timeline.push({ type: 'hotel', time: '21:00', data: { name: hotelName } })

  res.json({
    success: true,
    data: {
      attractionName: data.attraction.name,
      timeline,
      summary: {
        spotsCount: orderedSpots.length,
        foodsCount: selectedFoods.length,
        hotelName,
        totalBudget: foodBudget
      }
    }
  })
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

export default router
