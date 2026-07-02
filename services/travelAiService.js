/**
 * 旅游攻略 AI 智能推荐服务 - 基于 DeepSeek
 * 根据目的地和可选数据，智能推荐最佳路线、美食和住宿
 */
import axios from 'axios'
import config from '../config/index.js'

const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'

const SYSTEM_PROMPT = `你是一个资深的旅游规划专家。用户会给你一个旅游目的地的信息和可选项目（路线节点、美食、酒店），你需要根据专业知识推荐最佳选择。

## 你的任务
1. 根据目的地特点，从可选路线节点中精选并按最优游览顺序排列（考虑地理空间顺序、游览逻辑、时间效率）
2. 为每个景点推荐合理的停留时长（stayDuration，单位分钟：小型景点15-30，中型30-60，大型60-120）
3. 规划用餐时机：确保午餐在11:00-13:30之间，晚餐在17:00-19:30之间
4. 从可选美食中推荐最值得尝试的餐厅（考虑特色、性价比、位置便利性），推荐2-4家
5. 从可选酒店中推荐最合适的住宿（考虑位置、性价比、舒适度）

## 行程模式
酒店(起点) → 景点 → 景点 → 美食(午餐) → 景点 → 景点 → 美食(晚餐) → 酒店(终点)
- 上午约2-3个景点，午餐后下午1-2个景点
- 景点之间考虑地理邻近性，避免折返

## 输出格式（严格 JSON，不要 markdown 包裹）
{
  "advice": "一段 50-100 字的整体旅行建议，给用户一个简洁的行程概述",
  "spotIds": ["id1", "id2", ...],
  "foodIds": ["id1", "id2"],
  "hotelId": "id" 或 null,
  "spotNotes": { "id1": "推荐理由（10字内）", "id2": "推荐理由" },
  "foodNotes": { "id1": "推荐理由（10字内）", "id2": "推荐理由" },
  "hotelNote": "推荐理由（15字内）" 或 null,
  "timePlan": "简短的时间安排建议，如'08:30出发，上午游览A(60分钟)和B(30分钟)，11:30午餐C，下午D(90分钟)和E(45分钟)，17:30晚餐F，19:00返回酒店'（100字内）",
  "spotDurations": { "id1": 60, "id2": 30 },
  "mealAssignments": { "lunch": "foodId1", "dinner": "foodId2" }
}

## 推荐原则
- 路线节点：按合理的游览顺序排列，考虑景点位置、开放时间和游玩时长
- 如果节点有明显的空间顺序（如从南到北），请按最优路径排序
- 景点停留时长：参考景点规模和类型（寺庙15-30分钟、小型公园30分钟、博物馆60-90分钟、大型景区90-120分钟）
- 美食：优先推荐当地特色、评分高、位置便利的餐厅
- 住宿：优先推荐离最后一个景点近、性价比高的酒店
- 所有推荐都必须来自用户提供的可选列表，不要编造`


/**
 * 调用 DeepSeek 生成智能旅游推荐
 * @param {object} params
 * @param {object} params.attraction - 目的地信息 { name, lat, lng }
 * @param {Array} params.spots - 所有可选路线节点
 * @param {Array} params.foods - 所有可选美食
 * @param {Array} params.hotels - 所有可选酒店
 * @returns {Promise<object|null>}
 */
export async function getAiRecommendation({ attraction, spots, foods, hotels }) {
  const apiKey = config.deepseekApiKey
  if (!apiKey) {
    console.warn('[TravelAI] DeepSeek API Key 未配置，无法使用 AI 推荐')
    return null
  }

  if (!attraction || !attraction.name) {
    console.warn('[TravelAI] 缺少目的地信息')
    return null
  }

  // 构建精简的输入数据（去除冗余字段，控制 token）
  const formatSpot = (s) => ({
    id: s.id,
    name: s.name,
    duration: s.stay_duration || 30,
    highlight: s.highlight || '',
    desc: s.desc || ''
  })

  const formatFood = (f) => ({
    id: f.id,
    name: f.name,
    dish: f.recommend_dish || '',
    price: f.price_per_person || 0,
    highlight: f.highlight || ''
  })

  const formatHotel = (h) => ({
    id: h.id,
    name: h.name,
    price: h.price_range || '',
    highlight: h.highlight || ''
  })

  const inputData = {
    destination: {
      name: attraction.name,
      location: `${attraction.lat},${attraction.lng}`
    },
    availableSpots: (spots || []).map(formatSpot),
    availableFoods: (foods || []).map(formatFood),
    availableHotels: (hotels || []).map(formatHotel)
  }

  try {
    console.log('[TravelAI] 请求 DeepSeek 推荐，景点:', attraction.name)
    console.log('[TravelAI] 可选:', inputData.availableSpots.length, '路线 /',
      inputData.availableFoods.length, '美食 /', inputData.availableHotels.length, '酒店')

    const response = await axios.post(
      DEEPSEEK_API,
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `请为以下目的地做智能推荐：\n${JSON.stringify(inputData, null, 2)}` }
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        timeout: 30000  // AI 推理可能较慢，给 30 秒
      }
    )

    const content = response.data?.choices?.[0]?.message?.content
    if (!content) {
      console.error('[TravelAI] DeepSeek 返回空内容')
      return null
    }

    console.log('[TravelAI] DeepSeek 原始返回:', content.slice(0, 300))

    const parsed = extractJson(content)
    if (!parsed) {
      console.error('[TravelAI] 无法解析 AI 返回的 JSON')
      return null
    }

    // 校验结果
    const result = validateResult(parsed, inputData)
    console.log('[TravelAI] AI 推荐成功:',
      result.spotIds?.length, '路线 /', result.foodIds?.length, '美食 / 酒店:', result.hotelId)
    return result

  } catch (err) {
    if (err.code === 'ECONNABORTED') {
      console.error('[TravelAI] DeepSeek 请求超时')
    } else if (err.response) {
      const status = err.response.status
      const detail = JSON.stringify(err.response.data || {}).slice(0, 300)
      console.error(`[TravelAI] DeepSeek API 错误 ${status}:`, detail)
    } else {
      console.error('[TravelAI] 请求失败:', err.message)
    }
    return null
  }
}

/**
 * 从 LLM 返回内容中提取 JSON 对象
 */
function extractJson(content) {
  const trimmed = content.trim()

  // 直接尝试解析
  try { return JSON.parse(trimmed) } catch {}

  // markdown 代码块
  const mdMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (mdMatch) {
    try { return JSON.parse(mdMatch[1].trim()) } catch {}
  }

  // 提取 { 到 } 之间的内容
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try { return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1)) } catch {}
  }

  return null
}

/**
 * 校验并清洗 AI 返回结果，确保 ID 都在可选列表中
 */
function validateResult(parsed, inputData) {
  const validSpotIds = new Set(inputData.availableSpots.map(s => String(s.id)))
  const validFoodIds = new Set(inputData.availableFoods.map(f => String(f.id)))
  const validHotelIds = new Set(inputData.availableHotels.map(h => String(h.id)))

  // 过滤掉 AI 编造的 ID
  const spotIds = (Array.isArray(parsed.spotIds) ? parsed.spotIds : [])
    .map(id => String(id))
    .filter(id => validSpotIds.has(id))

  const foodIds = (Array.isArray(parsed.foodIds) ? parsed.foodIds : [])
    .map(id => String(id))
    .filter(id => validFoodIds.has(id))

  let hotelId = parsed.hotelId ? String(parsed.hotelId) : null
  if (hotelId && !validHotelIds.has(hotelId)) hotelId = null

  // 清理 notes
  const spotNotes = {}
  if (parsed.spotNotes && typeof parsed.spotNotes === 'object') {
    spotIds.forEach(id => {
      if (parsed.spotNotes[id]) spotNotes[id] = String(parsed.spotNotes[id]).slice(0, 50)
    })
  }

  const foodNotes = {}
  if (parsed.foodNotes && typeof parsed.foodNotes === 'object') {
    foodIds.forEach(id => {
      if (parsed.foodNotes[id]) foodNotes[id] = String(parsed.foodNotes[id]).slice(0, 50)
    })
  }

  return {
    advice: String(parsed.advice || '祝您旅途愉快！').slice(0, 200),
    spotIds,
    foodIds,
    hotelId,
    spotNotes,
    foodNotes,
    hotelNote: parsed.hotelNote ? String(parsed.hotelNote).slice(0, 50) : null,
    timePlan: parsed.timePlan ? String(parsed.timePlan).slice(0, 200) : null,
    spotDurations: parsed.spotDurations && typeof parsed.spotDurations === 'object' ? parsed.spotDurations : {},
    mealAssignments: parsed.mealAssignments && typeof parsed.mealAssignments === 'object' ? parsed.mealAssignments : {}
  }
}
