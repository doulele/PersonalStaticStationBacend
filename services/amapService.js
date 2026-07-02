import axios from 'axios'
import config from '../config/index.js'

const AMAP_KEY = config.amapWebServiceKey || process.env.AMAP_WEB_SERVICE_KEY || ''

/**
 * 地址 → 经纬度（地理编码）
 * @param {string} address
 * @returns {Promise<{lng:number, lat:number, formatted_address:string}|null>}
 */
export async function geocode(address) {
  if (!AMAP_KEY) return null
  try {
    const { data } = await axios.get('https://restapi.amap.com/v3/geocode/geo', {
      params: { key: AMAP_KEY, address, output: 'JSON' },
      timeout: 5000
    })
    if (data.status === '1' && data.geocodes?.length > 0) {
      const geo = data.geocodes[0]
      const [lng, lat] = geo.location.split(',').map(Number)
      // city 可能为空数组 [] 或字符串，需要做兼容处理
      const city = Array.isArray(geo.city) ? (geo.city[0] || '') : (geo.city || '')
      return { lng, lat, formatted_address: geo.formatted_address, city }
    }
    return null
  } catch (err) {
    console.error('[Amap] 地理编码失败:', err.message)
    return null
  }
}

/**
 * 逆地理编码（经纬度 → 地址）
 * @param {number} lng
 * @param {number} lat
 * @returns {Promise<string|null>}
 */
export async function regeocode(lng, lat) {
  if (!AMAP_KEY) return null
  try {
    const { data } = await axios.get('https://restapi.amap.com/v3/geocode/regeo', {
      params: { key: AMAP_KEY, location: `${lng},${lat}`, output: 'JSON', radius: 1000, extensions: 'base' },
      timeout: 5000
    })
    if (data.status === '1' && data.regeocode) {
      return data.regeocode.formatted_address
    }
    return null
  } catch (err) {
    console.error('[Amap] 逆地理编码失败:', err.message)
    return null
  }
}

/**
 * 搜索周边 POI（支持自定义类型 + 分页 + 关键词）
 * @param {number} lng
 * @param {number} lat
 * @param {number} radius - 搜索半径（米），默认 50000
 * @param {string} [types] - POI 类型，默认景点类。支持分类代码(推荐，如 110000|110100) 或中文名
 * @param {number} [page=1] - 页码
 * @param {number} [offset=25] - 每页数量
 * @param {string} [keywords] - 搜索关键词（匹配 POI 名称），多个用 | 分隔
 * @returns {Promise<Array>}
 */
export async function searchNearby(lng, lat, radius = 50000, types, page = 1, offset = 25, keywords, strictScenic = true) {
  if (!AMAP_KEY) return []
  const typeStr = types || ''  // 允许空字符串 = 不限类型
  try {
    const params = {
      key: AMAP_KEY,
      location: `${lng},${lat}`,
      radius,
      offset,
      page,
      extensions: 'all',
      output: 'JSON'
    }
    // 仅在指定了类型时才传 types，空字符串 = 不限类型（搜全部）
    if (typeStr) params.types = typeStr
    // 关键词：辅助匹配 POI 名称，提高景点类召回率
    if (keywords) params.keywords = keywords

    const { data } = await axios.get('https://restapi.amap.com/v3/place/around', {
      params,
      timeout: 8000
    })
    if (data.status === '1' && data.pois) {
      // 获取总页数，如果结果很多则多拿几页
      const totalCount = parseInt(data.count) || 0
      const totalPages = Math.min(Math.ceil(totalCount / offset), 4) // 最多拿 4 页

      let allPois = [...data.pois]

      // 如果有多页且当前是第一页，并行拉取剩余页
      if (totalPages > 1 && page === 1) {
        const extraPages = []
        for (let p = 2; p <= totalPages; p++) {
          extraPages.push(
            axios.get('https://restapi.amap.com/v3/place/around', {
              params: { ...params, page: p },
              timeout: 8000
            }).then(res => (res.data?.status === '1' && res.data?.pois) ? res.data.pois : [])
             .catch(() => [])
          )
        }
        const extraResults = await Promise.all(extraPages)
        for (const pagePois of extraResults) {
          allPois.push(...pagePois)
        }
      }

      // 过滤链：
      //   strictScenic=true（景区搜索）：宗教过滤 → 垃圾POI过滤 → 景区白名单 → 映射 → 去重
      //   strictScenic=false（通用搜索，如美食/酒店）：仅宗教过滤 → 映射 → 去重
      const filtered = strictScenic
        ? allPois.filter(p => !isReligiousOnly(p) && !isNonScenicJunk(p) && isScenicPOI(p))
        : allPois.filter(p => !isReligiousOnly(p))
      const mapped = filtered.map(poi => ({
          id: poi.id,
          name: poi.name,
          address: poi.address,
          province: normalizeProvince(poi.pname || ''),
          city: poi.cityname || '',
          district: poi.adname || '',
          lat: parseFloat(poi.location.split(',')[1]),
          lng: parseFloat(poi.location.split(',')[0]),
          type: poi.type,
          distance: parseInt(poi.distance),
          photos: poi.photos?.slice(0, 3).map(p => p.url) || [],
          rating: parseScenicRating(poi),
          level: parseScenicLevel(poi),
          features: parseScenicFeatures(poi),
          cost: poi.biz_ext?.cost || ''
        }))
      return deduplicatePois(mapped)
    }
    return []
  } catch (err) {
    console.error('[Amap] 周边搜索失败:', err.message)
    return []
  }
}

// 景点类 POI types（文本搜索用，与周边搜索保持一致覆盖面）
// 注意：刻意排除"寺庙道观"——纯宗教场所不是旅游推荐目标，
// 但少林寺等同时属于"风景名胜"的仍会正常出现
export const SCENIC_TYPES = '风景名胜|公园广场|纪念馆|国家级景点|省级景点|动物园|植物园|游乐园|水族馆|旅游景点'

// 景点类 POI 分类代码（周边搜索用，高德 place/around 的 types 参数推荐使用代码以保证精确匹配）
// 110000=风景名胜  110100=公园广场(含子类公园/广场)
// 140100=纪念馆   140200=国家级景点  140300=省级景点
// 140400=动物园   140500=植物园      140600=游乐园
// 140700=水族馆   080300=博物馆      080400=展览馆
// 141100=温泉     141200=海滨海岛    141300=滑雪场
// 190700=湿地公园 110101=公园        140800=世界遗产
// 080100=科技馆   080200=天文馆      080500=美术馆
// 100000=旅游景点(大类) ← 覆盖高德归类为"旅游景点"的子景点
export const SCENIC_TYPE_CODES = '110000|110100|140100|140200|140300|140400|140500|140600|140700|080300|080400|141100|141200|141300|190700|110101|140800|080100|080200|080500|100000'

/**
 * 搜索 POI（关键字搜索）
 * @param {string} keyword
 * @param {string} [city] - 城市名，可选
 * @param {number} [offset=10] - 返回数量
 * @param {string} [types] - POI 类型，传 '' 或 null 表示不限类型
 * @param {number} [page=1] - 页码
 * @returns {Promise<Array>}
 */
export async function searchPOI(keyword, city, offset = 10, types, page = 1) {
  if (!AMAP_KEY) return []
  try {
    const params = {
      key: AMAP_KEY,
      offset,
      page,
      extensions: 'all',
      output: 'JSON'
    }
    // keywords 为空时省略该参数（仅靠 types+city 搜全城）
    if (keyword) params.keywords = keyword
    // types 有值才传，空字符串 = 不限类型
    if (types) params.types = types
    else if (types === undefined) params.types = SCENIC_TYPES
    if (city) params.city = city

    const { data } = await axios.get('https://restapi.amap.com/v3/place/text', {
      params,
      timeout: 8000
    })
    if (data.status === '1' && data.pois) {
      const mapped = data.pois
        .filter(p => !isReligiousOnly(p) && !isNonScenicJunk(p))
        .map(poi => ({
          id: poi.id,
          name: poi.name,
          address: poi.address,
          province: normalizeProvince(poi.pname || ''),
          city: poi.cityname || '',
          district: poi.adname || '',
          lat: parseFloat(poi.location.split(',')[1]),
          lng: parseFloat(poi.location.split(',')[0]),
          type: poi.type,
          photos: poi.photos?.slice(0, 3).map(p => p.url) || [],
          rating: parseScenicRating(poi),
          level: parseScenicLevel(poi),
          features: parseScenicFeatures(poi),
          cost: poi.biz_ext?.cost || ''
        }))
      return deduplicatePois(mapped)
    }
    return []
  } catch (err) {
    console.error('[Amap] POI 搜索失败:', err.message)
    return []
  }
}

/** 规范化省份名称：去掉"省""市"后缀，直辖市保留原名 */
function normalizeProvince(pname) {
  if (!pname) return ''
  return pname.replace(/(省|壮族自治区|回族自治区|维吾尔自治区|特别行政区)$/, '').replace(/市$/, '')
}

/**
 * 规范化景点名称，用于去重
 * 去除括号内容、常见后缀，使"龙门石窟"与"龙门石窟景区"能被识别为同一景点
 */
export function normalizePoiName(name) {
  return name
    .replace(/[（([［【][^)）\]］】]*[)）\]］】]/g, '') // 去除完整括号
    .replace(/[（([［【].*$/, '')                        // 去除不完整括号及之后
    .replace(/(景区|风景区|旅游区|游览区|公园|园林|胜地|古迹|遗址|博物院|博物馆|大峡谷|瀑布群)$/g, '')
    .trim()
}

// 地区 → 主要城市映射（用于区域热门搜索）
const REGION_CITIES = {
  '华北': ['北京', '天津', '石家庄', '太原', '呼和浩特', '呼伦贝尔', '秦皇岛', '大同'],
  '华东': ['上海', '杭州', '南京', '苏州', '青岛', '厦门', '黄山', '济南', '宁波', '南昌'],
  '华南': ['广州', '深圳', '海口', '三亚', '南宁', '桂林', '珠海', '北海'],
  '西南': ['成都', '重庆', '昆明', '贵阳', '拉萨', '丽江', '大理', '安顺', '阿坝', '乐山'],
  '西北': ['西安', '兰州', '西宁', '银川', '乌鲁木齐', '敦煌', '延安', '海东'],
  '东北': ['沈阳', '大连', '哈尔滨', '长春', '延边', '吉林', '齐齐哈尔'],
  '华中': ['武汉', '长沙', '郑州', '洛阳', '张家界', '宜昌', '开封', '衡阳']
}

// 省份 → 主要城市映射（用于省份级别精确搜索）
const PROVINCE_CITIES = {
  '北京': ['北京'],
  '天津': ['天津'],
  '上海': ['上海'],
  '重庆': ['重庆'],
  '河北': ['石家庄', '秦皇岛', '承德', '保定', '张家口'],
  '山西': ['太原', '大同', '平遥', '五台山'],
  '内蒙古': ['呼和浩特', '呼伦贝尔', '包头', '鄂尔多斯', '赤峰'],
  '辽宁': ['沈阳', '大连', '丹东', '本溪'],
  '吉林': ['长春', '吉林', '延边', '长白山', '通化'],
  '黑龙江': ['哈尔滨', '齐齐哈尔', '牡丹江', '大兴安岭', '漠河'],
  '江苏': ['南京', '苏州', '无锡', '扬州', '连云港', '镇江', '常州', '徐州'],
  '浙江': ['杭州', '宁波', '舟山', '温州', '绍兴', '嘉兴', '湖州', '台州', '丽水'],
  '安徽': ['合肥', '黄山', '安庆', '芜湖', '池州', '蚌埠'],
  '福建': ['福州', '厦门', '泉州', '武夷山', '龙岩', '漳州', '莆田'],
  '江西': ['南昌', '九江', '景德镇', '上饶', '赣州', '庐山'],
  '山东': ['济南', '青岛', '烟台', '威海', '泰安', '曲阜', '日照', '潍坊', '淄博'],
  '河南': ['郑州', '洛阳', '开封', '安阳', '南阳', '焦作', '信阳', '登封', '新乡', '平顶山'],
  '湖北': ['武汉', '宜昌', '襄阳', '荆州', '十堰', '恩施', '黄石', '咸宁'],
  '湖南': ['长沙', '张家界', '衡阳', '岳阳', '凤凰', '郴州', '株洲', '湘潭', '常德'],
  '广东': ['广州', '深圳', '珠海', '佛山', '韶关', '惠州', '东莞', '汕头', '湛江', '肇庆'],
  '广西': ['南宁', '桂林', '北海', '柳州', '梧州', '防城港', '钦州', '阳朔'],
  '海南': ['海口', '三亚', '万宁', '琼海', '文昌', '陵水'],
  '四川': ['成都', '乐山', '阿坝', '甘孜', '宜宾', '广元', '绵阳', '南充', '达州'],
  '贵州': ['贵阳', '安顺', '遵义', '黔东南', '黔南', '铜仁', '毕节'],
  '云南': ['昆明', '丽江', '大理', '西双版纳', '香格里拉', '腾冲', '玉溪', '普洱'],
  '西藏': ['拉萨', '日喀则', '林芝', '山南', '那曲'],
  '陕西': ['西安', '延安', '咸阳', '宝鸡', '渭南', '汉中', '安康'],
  '甘肃': ['兰州', '敦煌', '嘉峪关', '张掖', '天水', '甘南'],
  '青海': ['西宁', '海东', '海西', '玉树', '果洛'],
  '宁夏': ['银川', '中卫', '石嘴山', '吴忠'],
  '新疆': ['乌鲁木齐', '喀什', '吐鲁番', '伊犁', '阿勒泰', '巴音郭楞', '克拉玛依'],
  '香港': ['香港'],
  '澳门': ['澳门'],
  '台湾': ['台北', '高雄', '台中', '花莲', '台南', '垦丁']
}

// "全部" → 代表城市 + 全国性主题关键词，覆盖面更广
const ALL_REGION_KEYWORDS = [
  '北京景点', '上海景点', '杭州景点', '广州景点',
  '成都景点', '西安景点', '拉萨景点', '哈尔滨景点',
  '5A景区', '国家风景名胜区', '中国最美古镇', '中国十大名山'
]

// 类别 → emoji 粗略映射
const CATEGORY_EMOJI = {
  '风景名胜': '⛰️', '公园广场': '🌳', '寺庙道观': '🏯', '纪念馆': '🏛️',
  '游乐园': '🎢', '动物园': '🦁', '植物园': '🌺', '水族馆': '🐠'
}

/**
 * 从 POI type 字段推断景区官方评级（5A/4A/3A）
 * 高德 type 形如 "风景名胜;国家级景点;公园"
 * 国家级景点≈5A，省级景点≈4A
 */
function parseScenicLevel(poi) {
  const type = poi.type || ''
  if (type.includes('国家级景点')) return '5A'
  if (type.includes('省级景点')) return '4A'
  // deep_info 中可能有更精确的评级（如 "5A级景区"）
  const deep = poi.deep_info || ''
  const deepStr = typeof deep === 'string' ? deep : JSON.stringify(deep)
  const m = deepStr.match(/([345])A/i)
  if (m) return m[1] + 'A'
  return ''
}

/** 从 POI type 提取特色标签（最多3个） */
function parseScenicFeatures(poi) {
  const type = poi.type || ''
  const tags = []
  const typeLower = type.toLowerCase()
  if (type.includes('风景名胜') || typeLower.includes('scenic')) {
    if (!tags.includes('风景名胜')) tags.push('风景名胜')
  }
  if (type.includes('森林公园') || typeLower.includes('forest')) tags.push('森林公园')
  if (type.includes('地质公园') || typeLower.includes('geopark')) tags.push('地质奇观')
  if (type.includes('湿地') || typeLower.includes('wetland')) tags.push('湿地生态')
  if (type.includes('植物园') || typeLower.includes('botanical')) tags.push('植物园')
  if (type.includes('动物园') || typeLower.includes('zoo')) tags.push('动物园')
  if (type.includes('游乐园') || typeLower.includes('theme') || typeLower.includes('amusement')) tags.push('主题乐园')
  if (type.includes('水族馆') || typeLower.includes('aquarium')) tags.push('海洋世界')
  if (type.includes('纪念馆') || type.includes('博物馆') || typeLower.includes('museum') || typeLower.includes('memorial')) tags.push('人文历史')
  if (type.includes('滑雪') || typeLower.includes('ski')) tags.push('滑雪胜地')
  if (type.includes('温泉') || typeLower.includes('hotspring')) tags.push('温泉养生')
  if (type.includes('海滩') || type.includes('海滨') || typeLower.includes('beach')) tags.push('海滨风光')
  if (type.includes('古镇') || type.includes('古村') || typeLower.includes('ancient')) tags.push('古镇古村')
  if (type.includes('溶洞') || typeLower.includes('cave')) tags.push('溶洞奇观')
  if (type.includes('峡谷') || typeLower.includes('canyon') || typeLower.includes('gorge')) tags.push('峡谷地貌')
  if (type.includes('瀑布') || typeLower.includes('waterfall')) tags.push('瀑布飞泉')
  if (type.includes('湖泊') || type.includes('水库') || typeLower.includes('lake')) tags.push('湖光山色')
  // 去重
  return [...new Set(tags)].slice(0, 3)
}

/** 寺庙类关键词黑名单：名称命中则标记需过滤 */
const TEMPLE_NAME_BLACKLIST = /^(.*寺|.*庙|.*庵|.*观|.*宫|.*禅院|.*道观|.*教堂|.*清真寺)(?!.*风景名胜|.*旅游区|.*景区)$/

/** 判断是否为纯宗教场所（应该被过滤） */
function isReligiousOnly(poi) {
  const name = poi.name || ''
  const type = poi.type || ''
  // 如果 type 明确是纯寺庙类且不属于风景名胜大类 → 过滤
  if ((type.includes('寺庙道观') || type.includes('宗教')) && !type.includes('风景名胜') && !type.includes('国家级景点') && !type.includes('省级景点')) {
    return true
  }
  // 名称黑名单（兜底）
  if (TEMPLE_NAME_BLACKLIST.test(name)) {
    return true
  }
  return false
}

// 非景区垃圾 POI 类型（黑名单：命中任一即过滤）
// 涵盖：交通、住宿、餐饮、购物、生活服务、休闲娱乐、园区厂区、公司企业、
//       科研教育、政府机关、住宅小区、办公写字楼、仓储物流等
const NON_SCENIC_JUNK_TYPES = [
  // ========== 交通设施 ==========
  '公交车站', '停车场', '加油站', '加气站', '充电站',
  '收费站', '服务区', '公共厕所', '紧急避难场所',
  '交通设施', '道路附属设施', '火车站', '长途汽车站', '地铁站',
  '机场', '港口码头', '过境口岸', '班车站',
  // ========== 住宿 ==========
  '酒店', '宾馆', '旅馆', '民宿', '青年旅舍', '招待所', '度假村',
  '公寓', '公寓式酒店', '别墅', '客栈', '农家乐', '露营地', '房车营地',
  '经济型酒店', '连锁酒店', '星级酒店',
  // ========== 餐饮 ==========
  '中餐厅', '西餐厅', '快餐厅', '餐饮', '饭店', '饭馆', '酒楼',
  '小吃', '美食', '咖啡', '茶馆', '酒吧', '冷饮店', '甜品店',
  // ========== 购物 ==========
  '商场', '购物中心', '超市', '便利店', '市场', '批发',
  '家电卖场', '家具建材', '综合商场',
  // ========== 生活服务 ==========
  '银行', '医院', '诊所', '药店', '美容美发', '洗衣店',
  '汽车维修', '汽车销售', '4S店', '驾校', '汽车服务',
  '通讯营业厅', '打印复印', '照相馆',
  // ========== 休闲娱乐（非景区）==========
  '足浴', '浴池', '洗浴', '桑拿', 'KTV', '棋牌', '网吧',
  '按摩', '采耳', 'SPA', '健身房', '台球',
  // ========== 园区 / 厂区 ==========
  '产业园区', '工业园区', '科技园区', '软件园', '创业园',
  '高新区', '开发区', '保税区', '物流园', '产业园',
  '工厂', '厂房', '车间', '工业区',
  // ========== 公司 / 企业 ==========
  '公司企业', '公司', '集团', '企业',
  // ========== 科研 / 教育 ==========
  '科研机构', '实验室', '研究所', '研究院',
  '学校', '大学', '学院', '中学', '小学', '幼儿园', '培训机构',
  // ========== 政府 / 机关 ==========
  '政府机关', '事业单位', '街道办事处', '居委会',
  '法院', '检察院', '派出所', '交警队',
  '消防站', '人防',
  // ========== 住宅 / 办公 ==========
  '住宅小区', '居民区', '社区',
  '写字楼', '商务楼', '办公楼',
  // ========== 仓储 / 物流 ==========
  '物流', '快递', '仓储', '仓库',
  // ========== 其他不适合游玩的 ==========
  '殡葬', '墓地', '陵园', '公墓',
  '宠物服务', '房产中介', '装修', '婚庆',
  // ========== 生活服务杂项（路2b兜底时过滤） ==========
  '电力营业厅', '电信营业厅', '自来水营业厅', '燃气营业厅',
  '生活服务场所',
  '摩托车服务', '汽车维修', '汽车美容', '汽车租赁',
  '美容美发', '洗衣店', '搬家公司'
]

function isNonScenicJunk(poi) {
  const type = poi.type || ''
  const name = poi.name || ''
  // 先检查白名单：如果 type 命中景区白名单关键词，即使也命中垃圾黑名单也保留
  // （例如：type 同时包含"港口码头"和"码头"时，"码头"在白名单，不应被"港口码头"误杀）
  const matchesWhitelist = SCENIC_WHITELIST.some(kw => type.toLowerCase().includes(kw.toLowerCase()))
  if (matchesWhitelist) return false

  for (const junk of NON_SCENIC_JUNK_TYPES) {
    if (type.includes(junk)) return true
  }
  // 名称兜底：有些 POI 类型归类不准，但名称明显不是景区
  if (/酒店|宾馆|旅馆|民宿|公寓|别墅|客栈|饭店|餐厅|饭馆|酒家|食府|足浴|足道|洗浴|浴池|桑拿|KTV|网吧|棋牌/.test(name)) return true
  // 名称包含公司/企业/集团/实验室/研究所后缀
  if (/(公司|集团|企业|实验室|研究所|研究院|产业园|科技园|软件园|创业园|工业园|厂房|仓储|物流|快递|驾校|诊所|药房|药店|门诊部|卫生所|加油站|充电站|停车场|4S店|售楼处|中介)$/.test(name)) return true
  return false
}

// ========== 正向景区白名单 ==========
// POI type 必须命中至少一个关键词才算"真景区"：
// 刻意排除 —— 广场(太泛，大多只是城市空地)、水库(功能设施)、河流(太泛)、
//            普通寺庙道观(由 isReligiousOnly 统一处理)
const SCENIC_WHITELIST = [
  '风景名胜', '国家级景点', '省级景点',
  '公园', '游乐园', '主题公园', '动植物园',
  '动物园', '植物园', '水族馆',
  '博物馆', '纪念馆', '展览馆',
  '滑雪', '温泉', '漂流',
  '海滩', '海滨',
  '湿地', '森林',
  '峡谷', '溶洞', '洞穴', '瀑布',
  '古镇', '古城', '古村', '老街', '故居', '遗址',
  '山峰', '山脉', '岛屿',
  '生态园', '花海', '步道', '栈道',
  '山庄', '农庄', '采摘园',
  '名胜古迹',
  // 景区内部 POI 类型（景区大门、观景台、游客中心等）
  '观景台', '观景', '眺望',
  '游客中心', '售票处',
  '索道', '缆车', '登山',
  '湖泊', '河流', '瀑布',
  '码头', '渡口', '轮渡',
  '沙滩', '礁石',
  '步行街', '特色街区', '文化街',
  '塔', '碑', '石刻', '石窟',
  '陵园', '祠堂', '书院',
  '旅游景点', '风景区',
  // 景区子景点常见类型（大沙湾/苏马湾/邓小平像等）
  '纪念像', '纪念碑', '雕像', '塑像',
  '海滨浴场', '天然浴场', '海水浴场', '海湾',
  '岬角', '海蚀', '礁群', '礁盘',
  '沙滩公园', '阳光沙滩',
  '灯塔', '炮台', '城址', '古城墙',
  '观光', '游览', '游览区', '旅游区',
  '园林', '花园', '亭台楼阁', '廊桥',
  '竹筏', '游船', '快艇', '帆船',
  '草甸', '牧场', '花田', '梯田',
  '丹霞', '冰臼', '天坑', '红石林',
  // 缺失补充：雕塑/自然景观/文物等常见景区子类型
  '雕塑', '自然景观', '文物古迹', '文物保护',
  '地质公园', '矿山公园', '自然保护区',
  '摩崖', '题刻', '碑刻', '崖刻', '界碑',
  '观鸟', '观海', '观日', '日出', '日落',
  '海角', '海岬', '悬崖', '海蚀崖', '海蚀洞',
  '奇石', '怪石', '岩石', '岩壁',
  '牧场', '草原', '草场', '草甸',
  '樱花', '桃园', '梅园', '牡丹园', '荷花园', '菊花园',
  '鸟园', '蝴蝶', '孔雀', '鹿苑', '马场',
  '名人故居', '纪念馆', '纪念地',
  '古树', '古木', '树群', '竹林',
  '水乡', '渔村', '古港', '渡口遗址',
  '烽火台', '长城', '古道', '驿站',
  '少数民族', '民俗', '风情',
]

/** 正向白名单过滤：POI 的 type 字段必须包含至少一个景区关键词才保留 */
function isScenicPOI(poi) {
  const type = (poi.type || '').toLowerCase()
  return SCENIC_WHITELIST.some(kw => type.includes(kw.toLowerCase()))
}

// ========== 评分增强解析 ==========
// 高德 biz_ext.rating 为空时，尝试从 deep_info 中提取评分
function parseScenicRating(poi) {
  // 主来源：biz_ext.rating（高德用户综合评分，如 "4.5"）
  const bizRating = poi.biz_ext?.rating
  if (bizRating && parseFloat(bizRating) > 0) return bizRating

  // 回退来源：deep_info 中可能包含评分信息
  const di = poi.deep_info
  if (di) {
    const raw = typeof di === 'string' ? di : JSON.stringify(di)
    // 匹配各种评分格式：star_level、综合评分、评分 等
    const m = raw.match(/(?:star_level|综合评分|评分|rating|star)["\s:：=]*(\d+\.?\d*)/i)
    if (m && parseFloat(m[1]) > 0) return m[1]
  }

  return ''
}

// ========== POI 去重 ==========
// 高德多页拉取 + 不同分类代码可能返回同一景点的多个条目
// 策略：标准化名称 + 坐标距离 < 300m → 视为同一景点，保留数据更丰富的那个

/** Haversine 公式计算两点距离（米） */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000
  const toRad = d => d * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** 计算两个 POI 的"数据丰富度"得分（越高越值得保留） */
function poiDataScore(poi) {
  let score = 0
  if (poi.photos?.length) score += poi.photos.length * 10
  if (poi.rating) score += parseFloat(poi.rating) * 5
  if (poi.level) score += 15
  if (poi.features?.length) score += poi.features.length * 3
  if (poi.cost) score += 2
  return score
}

/** 对 POI 列表去重：同名 + 近距合并 */
function deduplicatePois(pois) {
  if (pois.length <= 1) return pois

  const result = []
  for (const poi of pois) {
    const normName = normalizePoiName(poi.name).toLowerCase()
    let merged = false

    for (let i = 0; i < result.length; i++) {
      const existing = result[i]
      const existingNormName = normalizePoiName(existing.name).toLowerCase()
      // 名称相似度检查：完全匹配 或 相互包含
      const nameMatch = normName === existingNormName ||
        (normName.length > 2 && existingNormName.length > 2 &&
          (normName.includes(existingNormName) || existingNormName.includes(normName)))
      if (!nameMatch) continue

      // 坐标距离检查
      const dist = haversineDistance(poi.lat, poi.lng, existing.lat, existing.lng)
      if (dist > 300) continue // > 300m 视为不同地点

      // 重复！保留数据更丰富的那个
      merged = true
      if (poiDataScore(poi) > poiDataScore(existing)) {
        result[i] = poi
      }
      break
    }

    if (!merged) result.push(poi)
  }
  return result
}

// 城市 → 省份映射（兜底用）
const CITY_TO_PROVINCE = {
  '北京': '北京', '北京市': '北京', '天津': '天津', '天津市': '天津',
  '石家庄': '河北', '石家庄市': '河北', '太原': '山西', '太原市': '山西',
  '呼和浩特': '内蒙古', '呼和浩特市': '内蒙古', '呼伦贝尔': '内蒙古', '呼伦贝尔市': '内蒙古',
  '秦皇岛': '河北', '秦皇岛市': '河北', '大同': '山西', '大同市': '山西',
  '上海': '上海', '上海市': '上海',
  '杭州': '浙江', '杭州市': '浙江', '南京': '江苏', '南京市': '江苏',
  '苏州': '江苏', '苏州市': '江苏', '青岛': '山东', '青岛市': '山东',
  '厦门': '福建', '厦门市': '福建', '黄山': '安徽', '黄山市': '安徽',
  '济南': '山东', '济南市': '山东', '宁波': '浙江', '宁波市': '浙江',
  '南昌': '江西', '南昌市': '江西',
  '广州': '广东', '广州市': '广东', '深圳': '广东', '深圳市': '广东',
  '海口': '海南', '海口市': '海南', '三亚': '海南', '三亚市': '海南',
  '南宁': '广西', '南宁市': '广西', '桂林': '广西', '桂林市': '广西',
  '珠海': '广东', '珠海市': '广东', '北海': '广西', '北海市': '广西',
  '成都': '四川', '成都市': '四川', '重庆': '重庆', '重庆市': '重庆',
  '昆明': '云南', '昆明市': '云南', '贵阳': '贵州', '贵阳市': '贵州',
  '拉萨': '西藏', '拉萨市': '西藏', '丽江': '云南', '丽江市': '云南',
  '大理': '云南', '大理': '云南', '安顺': '贵州', '安顺市': '贵州',
  '阿坝': '四川', '乐山': '四川', '乐山市': '四川',
  '西安': '陕西', '西安市': '陕西', '兰州': '甘肃', '兰州市': '甘肃',
  '西宁': '青海', '西宁市': '青海', '银川': '宁夏', '银川市': '宁夏',
  '乌鲁木齐': '新疆', '乌鲁木齐市': '新疆', '敦煌': '甘肃', '敦煌市': '甘肃',
  '延安': '陕西', '延安市': '陕西', '海东': '青海', '海东市': '青海',
  '沈阳': '辽宁', '沈阳市': '辽宁', '大连': '辽宁', '大连市': '辽宁',
  '哈尔滨': '黑龙江', '哈尔滨市': '黑龙江', '长春': '吉林', '长春市': '吉林',
  '延边': '吉林', '吉林': '吉林', '吉林市': '吉林',
  '齐齐哈尔': '黑龙江', '齐齐哈尔市': '黑龙江',
  '武汉': '湖北', '武汉市': '湖北', '长沙': '湖南', '长沙市': '湖南',
  '郑州': '河南', '郑州市': '河南', '洛阳': '河南', '洛阳市': '河南',
  '张家界': '湖南', '张家界市': '湖南', '宜昌': '湖北', '宜昌市': '湖北',
  '开封': '河南', '开封市': '河南', '衡阳': '湖南', '衡阳市': '湖南'
}

/**
 * 获取某个地区的热门景点 Top 20（区域搜索，覆盖多省）
 * @param {string} region - 地区名（华北/华东/华南/西南/西北/东北/华中）
 * @returns {Promise<Array>}
 */
export async function searchRegionHotspots(region) {
  if (!AMAP_KEY) return []

  if (region === '全部') {
    return searchAllHotspots()
  }

  const cities = REGION_CITIES[region]
  if (!cities) return []

  try {
    // 每城市搜索一次（单关键词，避免高德内部 OR 产生的重复）
    const resultsPerCity = await Promise.all(
      cities.map(city => searchPOI('热门景点', city, 10))
    )

    // poi.id 为主去重键，规范化名称为辅
    const idMap = new Map()
    const nameMap = new Map()

    function addPoi(poi, city, pos) {
      const id = poi.id || ''
      const normName = normalizePoiName(poi.name)
      const rating = parseFloat(poi.rating) || 0

      let key = id
      if (!key || !idMap.has(key)) {
        const existId = nameMap.get(normName)
        if (existId) { key = existId }
        else if (!key) { key = normName }
      }

      const entry = idMap.get(key)
      if (entry) {
        if (pos < entry.bestRank) { entry.poi = poi; entry.bestRank = pos; entry.bestCity = city }
        if (rating > entry.bestRating) entry.bestRating = rating
        if (!entry.cities.has(city)) entry.cities.add(city)
      } else {
        idMap.set(key, { poi, bestRank: pos, bestRating: rating, bestCity: city, cities: new Set([city]) })
        nameMap.set(normName, key)
      }
    }

    for (let ci = 0; ci < resultsPerCity.length; ci++) {
      const sc = cities[ci]
      resultsPerCity[ci].forEach((p, i) => addPoi(p, p.city || sc, i))
    }

    // 排序：跨城市数 + 城市内排名 + 评分（区域级，无全省搜索兜底）
    const merged = []
    for (const [, entry] of idMap) {
      const { poi, bestRank, bestCity, bestRating, cities: cset } = entry
      const province = poi.province
        || CITY_TO_PROVINCE[poi.city]
        || CITY_TO_PROVINCE[bestCity]
        || cityToProvince(poi.cityname || '', bestCity)
      // 跨城市出现是核心热度信号，排名位置反映该城市内的受欢迎程度
      merged.push({
        ...poi, province, city: bestCity, region,
        category: poi.type?.split(';')[0]?.split('|')[0] || '景点',
        emoji: CATEGORY_EMOJI[poi.type?.split(';')[0]?.split('|')[0]] || '🏞️',
        level: poi.level || '',
        features: poi.features || [],
        cost: poi.cost || '',
        _score: cset.size * 30 + Math.max(0, 10 - bestRank) * 5 + bestRating * 8
      })
    }
    merged.sort((a, b) => (b._score || 0) - (a._score || 0))
    return merged.slice(0, 20).map(({ _score, ...r }) => r)
  } catch (err) {
    console.error(`[Amap] 区域热门搜索失败 (${region}):`, err.message)
    return []
  }
}

/**
 * 获取某个省份的热门景点 Top 35
 * 策略（回归简单可靠）：
 *   1. 省份全域搜索（关键词含省份名 + 不限城市范围，高德全省匹配并按热度排序）
 *   2. 前 3 个核心城市各取少量作为补充（捕获省份搜索可能遗漏的近郊景点）
 *   3. poi.id 去重 + 名称规范化辅助去重（彻底消除重复）
 *   4. 排序：省份搜索排名 > 跨城市出现次数 > 评分
 * @param {string} province - 省份名（如 河南、四川、浙江）
 * @returns {Promise<Array>}
 */
export async function searchProvinceHotspots(province) {
  if (!AMAP_KEY) return []

  const cities = PROVINCE_CITIES[province]
  if (!cities) return []

  try {
    // 1. 省份全域搜索（关键词含省份名 + 不限城市 = 全省范围，高德自身按热度排序）
    const provinceResults = await searchPOI(province + '旅游景点', undefined, 50)

    // 过滤非目标省份的误召回结果
    const inProvince = (p) => {
      if (p.province === province) return true
      if (p.city && CITY_TO_PROVINCE[p.city] === province) return true
      // 省份名出现在地址中也算
      if (p.address && p.address.includes(province)) return true
      return false
    }
    const filteredProvince = provinceResults.filter(inProvince)

    // 2. 前 6 个核心城市补充搜索（捕获全域搜索可能遗漏的景点）
    const topCities = cities.slice(0, 6)
    const resultsPerCity = await Promise.all(
      topCities.map(city => searchPOI('热门景点', city, 10))
    )

    // ========== 去重：poi.id 主键 + 规范化名称辅助 ==========
    const idMap = new Map()
    const nameMap = new Map()

    function addPoi(poi, city, pos, source) {
      const id = poi.id || ''
      const normName = normalizePoiName(poi.name)
      const rating = parseFloat(poi.rating) || 0

      let key = id
      if (!key || !idMap.has(key)) {
        const existId = nameMap.get(normName)
        if (existId) {
          key = existId
        } else if (!key) {
          key = normName
        }
      }

      const entry = idMap.get(key)
      if (entry) {
        if (pos < entry.bestRank) { entry.poi = poi; entry.bestRank = pos; entry.bestCity = city }
        if (rating > entry.bestRating) entry.bestRating = rating
        if (source === 'city' && !entry.cities.has(city)) entry.cities.add(city)
        if (source === 'province') entry.fromProvince = true
      } else {
        idMap.set(key, {
          poi, bestRank: pos, bestRating: rating,
          bestCity: city || poi.city || '',
          cities: source === 'city' ? new Set([city]) : new Set(),
          fromProvince: source === 'province'
        })
        nameMap.set(normName, key)
      }
    }

    // 先处理省份搜索结果（这是全省热度排序的主要依据）
    filteredProvince.forEach((p, i) => addPoi(p, p.city || '', i, 'province'))

    // 再处理城市搜索
    for (let ci = 0; ci < resultsPerCity.length; ci++) {
      const sc = topCities[ci]
      resultsPerCity[ci].forEach((p, i) => addPoi(p, p.city || sc, i, 'city'))
    }

    // ========== 排序（简单透明）==========
    const region = provinceToRegion(province)
    const merged = []
    for (const [, entry] of idMap) {
      const { poi, bestCity, bestRating, cities: cset, fromProvince, bestRank } = entry
      const poiProvince = poi.province
        || CITY_TO_PROVINCE[poi.city]
        || CITY_TO_PROVINCE[bestCity]
        || province

      // 排序分数（逻辑透明）：
      //   - 省份搜索排名：第1名=90分，线性递减，第30名=0分（全省热度最真实的信号）
      //   - 城市搜索兜底：仅出现在补充城市的景点给 25 基础分（防止小城市景点被全省热门完全淹没）
      //   - 跨城市出现：每多一个城市+15分（被多个城市搜索提到=公认热门）
      //   - 评分：每星+8分（用户口碑）
      let score = 0
      if (fromProvince) {
        score += Math.max(0, 90 - bestRank * 3)
      } else {
        score += 25  // 城市搜索兜底分，相当于省份排名~22名的水平
      }
      score += cset.size * 15
      score += bestRating * 8

      merged.push({
        ...poi, province: poiProvince, city: bestCity, region,
        category: poi.type?.split(';')[0]?.split('|')[0] || '景点',
        emoji: CATEGORY_EMOJI[poi.type?.split(';')[0]?.split('|')[0]] || '🏞️',
        level: poi.level || '',
        features: poi.features || [],
        cost: poi.cost || '',
        _score: score
      })
    }

    merged.sort((a, b) => (b._score || 0) - (a._score || 0))
    return merged.slice(0, 35).map(({ _score, ...r }) => r)
  } catch (err) {
    console.error(`[Amap] 省份热门搜索失败 (${province}):`, err.message)
    return []
  }
}

/**
 * 全国热门景点搜索：精选代表城市并行搜索，去重后按跨城热度 + 评分排序
 */
async function searchAllHotspots() {
  try {
    const resultsPerKeyword = await Promise.all(
      ALL_REGION_KEYWORDS.map(kw => searchPOI(kw, undefined, 4))
    )

    // poi.id 去重
    const idMap = new Map()
    const nameMap = new Map()
    for (let i = 0; i < resultsPerKeyword.length; i++) {
      const pois = resultsPerKeyword[i]
      for (const poi of pois) {
        const id = poi.id || ''
        const normName = normalizePoiName(poi.name)
        const rating = parseFloat(poi.rating) || 0

        let key = id
        if (!key || !idMap.has(key)) {
          const existId = nameMap.get(normName)
          if (existId) { key = existId }
          else if (!key) { key = normName }
        }

        const entry = idMap.get(key)
        if (entry) {
          if (rating > entry.bestRating) { entry.poi = poi; entry.bestRating = rating }
          entry.hitCount++
        } else {
          idMap.set(key, { poi, bestRating: rating, hitCount: 1 })
          nameMap.set(normName, key)
        }
      }
    }

    // 排序：命中次数（多个城市搜索中出现 = 热度信号）+ 评分
    const merged = []
    for (const [, entry] of idMap) {
      const { poi, bestRating, hitCount } = entry
      const province = poi.province || cityToProvince(poi.cityname || '', '')
      const region = provinceToRegion(province)
      merged.push({
        ...poi, province, city: poi.city || '', region,
        category: poi.type?.split(';')[0]?.split('|')[0] || '景点',
        emoji: CATEGORY_EMOJI[poi.type?.split(';')[0]?.split('|')[0]] || '🏞️',
        level: poi.level || '',
        features: poi.features || [],
        cost: poi.cost || '',
        _score: hitCount * 20 + bestRating * 8
      })
    }
    merged.sort((a, b) => (b._score || 0) - (a._score || 0))
    return merged.slice(0, 20).map(({ _score, ...r }) => r)
  } catch (err) {
    console.error('[Amap] 全国热门搜索失败:', err.message)
    return []
  }
}

/** 省份名 → 地区映射 */
function provinceToRegion(province) {
  const map = {
    '北京': '华北', '天津': '华北', '河北': '华北', '山西': '华北', '内蒙古': '华北',
    '上海': '华东', '江苏': '华东', '浙江': '华东', '安徽': '华东', '福建': '华东', '江西': '华东', '山东': '华东',
    '广东': '华南', '广西': '华南', '海南': '华南',
    '四川': '西南', '重庆': '西南', '贵州': '西南', '云南': '西南', '西藏': '西南',
    '陕西': '西北', '甘肃': '西北', '青海': '西北', '宁夏': '西北', '新疆': '西北',
    '辽宁': '东北', '吉林': '东北', '黑龙江': '东北',
    '河南': '华中', '湖北': '华中', '湖南': '华中'
  }
  return map[province] || ''
}

/** 模糊匹配城市名获取省份（兜底方案） */
function cityToProvince(cityname, searchCity) {
  if (!cityname) return CITY_TO_PROVINCE[searchCity] || ''
  // 尝试去掉"市"后缀再匹配
  const short = cityname.replace(/市$/, '')
  return CITY_TO_PROVINCE[short] || CITY_TO_PROVINCE[cityname] || CITY_TO_PROVINCE[searchCity] || ''
}

/**
 * 高德 IP 定位（基于请求方公网 IP 获取城市级位置）
 * 比第三方境外 IP 服务更稳定、更快，适合国内服务器
 * @returns {Promise<{lng:number, lat:number, province:string, city:string, adcode:string, address:string}|null>}
 */
export async function ipLocate(clientIp) {
  if (!AMAP_KEY) return null
  try {
    const params = { key: AMAP_KEY, output: 'JSON' }
    // 传入客户端 IP，否则高德返回的是服务器 IP 的位置
    if (clientIp) params.ip = clientIp
    const { data } = await axios.get('https://restapi.amap.com/v3/ip', {
      params,
      timeout: 5000
    })
    if (data.status === '1' && data.rectangle) {
      // rectangle 格式: "左下角经度,纬度;右上角经度,纬度"
      const [sw, ne] = data.rectangle.split(';')
      const [swLng, swLat] = sw.split(',').map(Number)
      const [neLng, neLat] = ne.split(',').map(Number)
      const lng = (swLng + neLng) / 2
      const lat = (swLat + neLat) / 2
      return {
        lng,
        lat,
        province: data.province || '',
        city: data.city || '',
        adcode: data.adcode || '',
        address: [data.province, data.city].filter(Boolean).join(' ')
      }
    }
    return null
  } catch (err) {
    console.error('[Amap] IP定位失败:', err.message)
    return null
  }
}
