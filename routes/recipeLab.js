/**
 * 食验室 · 灵感灶 API
 * 菜谱推荐、随机抽取
 */
import { Router } from 'express'

const router = Router()

// ==================== 菜谱库（30道家常菜） ====================
const RECIPES = [
  { id: 1, name: '番茄炒蛋', icon: '🍳', ingredients: ['番茄', '鸡蛋', '葱', '盐', '糖', '油'], seasonings: ['盐', '糖', '油'], steps: ['番茄切块，鸡蛋打散加少许盐搅匀', '热锅凉油，倒入蛋液炒至凝固盛出', '锅中再加油，放入番茄块翻炒出汁', '倒入炒好的鸡蛋，加盐、糖调味', '撒葱花翻炒均匀出锅'], time: 10, difficulty: '简单', taste: 'light', substitutes: '没有番茄可用番茄酱代替' },
  { id: 2, name: '青椒肉丝', icon: '🫑', ingredients: ['猪肉', '青椒', '大蒜', '姜', '酱油', '盐', '淀粉', '油'], seasonings: ['酱油', '盐', '淀粉', '油'], steps: ['猪肉切丝，加酱油、淀粉腌制10分钟', '青椒切丝，大蒜切片', '热锅凉油，下肉丝滑炒至变色盛出', '锅中加油，爆香蒜片姜丝', '下青椒翻炒至断生，倒入肉丝', '加盐调味，翻炒均匀出锅'], time: 15, difficulty: '简单', taste: 'heavy' },
  { id: 3, name: '麻婆豆腐', icon: '🫘', ingredients: ['豆腐', '猪肉末', '豆瓣酱', '花椒', '大蒜', '葱', '酱油', '淀粉', '油'], seasonings: ['豆瓣酱', '花椒', '酱油', '淀粉', '油'], steps: ['豆腐切小块，焯水沥干', '热锅凉油，下肉末炒至变色', '加入豆瓣酱炒出红油', '加入蒜末、花椒炒香', '倒入适量水，放入豆腐', '加酱油调味，小火煮3分钟', '水淀粉勾芡，撒葱花出锅'], time: 20, difficulty: '中等', taste: 'heavy', substitutes: '没有豆瓣酱可用酱油+辣椒粉代替' },
  { id: 4, name: '清炒时蔬', icon: '🥬', ingredients: ['青菜', '大蒜', '盐', '油'], seasonings: ['盐', '油'], steps: ['青菜洗净切段，大蒜切片', '热锅凉油，爆香蒜片', '放入青菜大火快炒', '加盐调味，炒至断生即可出锅'], time: 5, difficulty: '简单', taste: 'light' },
  { id: 5, name: '红烧肉', icon: '🥩', ingredients: ['猪肉', '酱油', '糖', '料酒', '葱', '姜', '八角', '桂皮', '油'], seasonings: ['酱油', '糖', '料酒', '八角', '桂皮', '油'], steps: ['猪肉切块焯水', '锅中放少许油，加糖炒出糖色', '放入肉块翻炒上色', '加入酱油、料酒、葱姜、八角桂皮', '加开水没过肉块，大火烧开转小火', '炖40分钟至肉酥烂，大火收汁'], time: 60, difficulty: '中等', taste: 'heavy' },
  { id: 6, name: '蛋炒饭', icon: '🍚', ingredients: ['米饭', '鸡蛋', '火腿', '葱', '盐', '油'], seasonings: ['盐', '油'], steps: ['鸡蛋打散，火腿切丁', '热锅凉油，倒入蛋液炒散盛出', '锅中加油，放入米饭炒散', '加入火腿丁、炒好的鸡蛋', '加盐调味，翻炒均匀', '撒葱花出锅'], time: 10, difficulty: '简单', taste: 'light' },
  { id: 7, name: '酸辣土豆丝', icon: '🥔', ingredients: ['土豆', '辣椒', '醋', '大蒜', '盐', '油'], seasonings: ['醋', '盐', '油'], steps: ['土豆去皮切细丝，泡水去淀粉', '辣椒切丝，大蒜切片', '热锅凉油，爆香蒜片和辣椒', '放入土豆丝大火快炒', '加盐、醋调味，翻炒至断生'], time: 10, difficulty: '简单', taste: 'sweet' },
  { id: 8, name: '宫保鸡丁', icon: '🍗', ingredients: ['鸡肉', '花生', '辣椒', '大蒜', '姜', '酱油', '醋', '糖', '淀粉', '油'], seasonings: ['酱油', '醋', '糖', '淀粉', '油'], steps: ['鸡肉切丁，加酱油、淀粉腌制', '花生炒熟备用', '调碗汁：酱油、醋、糖、淀粉、水', '热锅凉油，下鸡丁滑炒至变色', '加入辣椒段、蒜姜爆香', '倒入碗汁翻炒', '加入花生翻炒均匀出锅'], time: 20, difficulty: '中等', taste: 'sweet' },
  { id: 9, name: '西红柿牛腩汤', icon: '🍅', ingredients: ['牛肉', '番茄', '洋葱', '姜', '盐', '料酒', '油'], seasonings: ['盐', '料酒', '油'], steps: ['牛肉切块焯水', '番茄切块，洋葱切丝', '热锅加油，炒香洋葱', '加入番茄炒出汁', '放入牛肉、姜片、料酒', '加足量水，大火烧开转小火炖1小时', '加盐调味出锅'], time: 75, difficulty: '中等', taste: 'light' },
  { id: 10, name: '蒜蓉西兰花', icon: '🥦', ingredients: ['西兰花', '大蒜', '盐', '油'], seasonings: ['盐', '油'], steps: ['西兰花切小朵焯水', '大蒜切末', '热锅凉油，小火炒香蒜末', '放入西兰花翻炒', '加盐调味即可'], time: 8, difficulty: '简单', taste: 'light' },
  { id: 11, name: '糖醋排骨', icon: '🦴', ingredients: ['排骨', '糖', '醋', '酱油', '料酒', '姜', '油'], seasonings: ['糖', '醋', '酱油', '料酒', '油'], steps: ['排骨焯水沥干', '热锅加油，放入排骨煎至两面金黄', '加入姜片、料酒、酱油', '加水没过排骨，大火烧开转小火', '炖30分钟后加入糖和醋', '大火收汁至浓稠'], time: 45, difficulty: '中等', taste: 'sweet' },
  { id: 12, name: '干煸四季豆', icon: '🫛', ingredients: ['四季豆', '猪肉末', '辣椒', '大蒜', '酱油', '盐', '油'], seasonings: ['酱油', '盐', '油'], steps: ['四季豆去筋切段', '锅中多放油，煸炒四季豆至表皮起皱盛出', '锅中留底油，下肉末炒散', '加入辣椒段、蒜末爆香', '倒入四季豆，加酱油、盐', '翻炒均匀出锅'], time: 15, difficulty: '中等', taste: 'heavy' },
  { id: 13, name: '葱油拌面', icon: '🍜', ingredients: ['面条', '葱', '酱油', '糖', '油'], seasonings: ['酱油', '糖', '油'], steps: ['面条煮熟过凉水', '葱切段，锅中多放油', '小火炸葱段至金黄', '加入酱油、糖调成葱油汁', '面条沥干，淋上葱油汁拌匀'], time: 15, difficulty: '简单', taste: 'light' },
  { id: 14, name: '鱼香肉丝', icon: '🐟', ingredients: ['猪肉', '木耳', '胡萝卜', '青椒', '大蒜', '姜', '豆瓣酱', '酱油', '醋', '糖', '淀粉', '油'], seasonings: ['豆瓣酱', '酱油', '醋', '糖', '淀粉', '油'], steps: ['猪肉切丝腌制', '木耳泡发切丝，胡萝卜青椒切丝', '调鱼香汁：酱油、醋、糖、淀粉', '热锅凉油滑炒肉丝盛出', '爆香豆瓣酱、蒜姜', '下蔬菜丝翻炒，倒入肉丝和鱼香汁', '大火翻炒均匀出锅'], time: 20, difficulty: '中等', taste: 'sweet' },
  { id: 15, name: '可乐鸡翅', icon: '🍗', ingredients: ['鸡翅', '可乐', '酱油', '姜', '料酒', '油'], seasonings: ['酱油', '料酒', '油'], steps: ['鸡翅洗净划刀，加姜片料酒焯水', '热锅加油，放入鸡翅煎至两面金黄', '倒入可乐和酱油', '大火烧开转中火煮15分钟', '大火收汁至浓稠'], time: 25, difficulty: '简单', taste: 'sweet' },
  { id: 16, name: '地三鲜', icon: '🍆', ingredients: ['土豆', '茄子', '青椒', '大蒜', '酱油', '盐', '淀粉', '油'], seasonings: ['酱油', '盐', '淀粉', '油'], steps: ['土豆、茄子、青椒切滚刀块', '茄子裹淀粉炸至金黄', '土豆炸至表面微黄', '锅中留底油爆香蒜末', '倒入所有食材，加酱油、盐', '翻炒均匀出锅'], time: 20, difficulty: '中等', taste: 'heavy' },
  { id: 17, name: '玉米排骨汤', icon: '🌽', ingredients: ['排骨', '玉米', '胡萝卜', '姜', '盐'], seasonings: ['盐'], steps: ['排骨焯水洗净', '玉米切段，胡萝卜切块', '所有食材放入锅中，加足量水', '大火烧开转小火炖1小时', '加盐调味出锅'], time: 75, difficulty: '简单', taste: 'light' },
  { id: 18, name: '蚝油生菜', icon: '🥬', ingredients: ['生菜', '大蒜', '蚝油', '酱油', '淀粉', '油'], seasonings: ['蚝油', '酱油', '淀粉', '油'], steps: ['生菜洗净焯水摆盘', '大蒜切末', '热锅加油，小火炒香蒜末', '加入蚝油、酱油、水淀粉勾芡', '将芡汁淋在生菜上'], time: 8, difficulty: '简单', taste: 'light' },
  { id: 19, name: '回锅肉', icon: '🥩', ingredients: ['猪肉', '蒜苗', '豆瓣酱', '豆豉', '姜', '酱油', '糖', '油'], seasonings: ['豆瓣酱', '豆豉', '酱油', '糖', '油'], steps: ['猪肉整块煮至八分熟，切薄片', '蒜苗切段', '热锅少许油，下肉片煸炒出油卷曲', '加入豆瓣酱、豆豉炒出红油', '加姜片、蒜苗翻炒', '加酱油、糖调味出锅'], time: 30, difficulty: '中等', taste: 'heavy' },
  { id: 20, name: '皮蛋豆腐', icon: '🫘', ingredients: ['豆腐', '皮蛋', '葱', '酱油', '醋', '香油'], seasonings: ['酱油', '醋', '香油'], steps: ['豆腐切块摆盘', '皮蛋切碎放在豆腐上', '调汁：酱油、醋、香油', '淋上酱汁，撒葱花即可'], time: 5, difficulty: '简单', taste: 'light' },
  { id: 21, name: '黄焖鸡', icon: '🍗', ingredients: ['鸡肉', '土豆', '香菇', '青椒', '姜', '酱油', '糖', '料酒', '油'], seasonings: ['酱油', '糖', '料酒', '油'], steps: ['鸡肉切块焯水', '土豆切块，香菇泡发', '热锅加油，炒糖色', '下鸡块翻炒上色', '加姜片、料酒、酱油', '加水和香菇、土豆炖20分钟', '加青椒收汁出锅'], time: 35, difficulty: '中等', taste: 'heavy' },
  { id: 22, name: '拍黄瓜', icon: '🥒', ingredients: ['黄瓜', '大蒜', '醋', '酱油', '辣椒油', '盐', '香油'], seasonings: ['醋', '酱油', '辣椒油', '盐', '香油'], steps: ['黄瓜洗净拍碎切段', '大蒜切末', '调汁：蒜末、醋、酱油、辣椒油、盐、香油', '淋在黄瓜上拌匀即可'], time: 5, difficulty: '简单', taste: 'heavy' },
  { id: 23, name: '清蒸鲈鱼', icon: '🐟', ingredients: ['鱼', '葱', '姜', '酱油', '料酒', '盐', '油'], seasonings: ['酱油', '料酒', '盐', '油'], steps: ['鱼处理干净，两面划刀', '鱼身抹盐、料酒，放姜片', '上锅蒸8-10分钟', '倒掉蒸出的汁水', '撒上葱丝，淋热油和酱油'], time: 20, difficulty: '中等', taste: 'light' },
  { id: 24, name: '蛋花汤', icon: '🥚', ingredients: ['鸡蛋', '番茄', '葱', '盐', '香油'], seasonings: ['盐', '香油'], steps: ['番茄切块，鸡蛋打散', '锅中加水烧开，放入番茄', '水开后缓缓倒入蛋液', '加盐调味，淋香油，撒葱花'], time: 8, difficulty: '简单', taste: 'light' },
  { id: 25, name: '孜然牛肉', icon: '🥩', ingredients: ['牛肉', '洋葱', '孜然粉', '辣椒粉', '酱油', '料酒', '淀粉', '油'], seasonings: ['孜然粉', '辣椒粉', '酱油', '料酒', '淀粉', '油'], steps: ['牛肉切片，加酱油、料酒、淀粉腌制', '洋葱切丝', '热锅多油，下牛肉滑炒至变色盛出', '锅中留油，炒洋葱至软', '倒入牛肉，加孜然粉、辣椒粉', '大火翻炒均匀出锅'], time: 15, difficulty: '中等', taste: 'heavy' },
  { id: 26, name: '蒜蓉粉丝蒸虾', icon: '🦐', ingredients: ['虾', '粉丝', '大蒜', '葱', '酱油', '油'], seasonings: ['酱油', '油'], steps: ['粉丝泡软铺盘底', '虾开背去虾线摆在粉丝上', '大蒜切末，热油炒香', '蒜蓉铺在虾上，淋酱油', '上锅蒸6-8分钟', '撒葱花，淋热油'], time: 20, difficulty: '中等', taste: 'light' },
  { id: 27, name: '肉末茄子', icon: '🍆', ingredients: ['茄子', '猪肉末', '大蒜', '葱', '豆瓣酱', '酱油', '糖', '油'], seasonings: ['豆瓣酱', '酱油', '糖', '油'], steps: ['茄子切条，撒盐腌制后挤干水分', '热锅多油，煸炒茄子至软盛出', '锅中留油，下肉末炒散', '加豆瓣酱炒出红油', '加蒜末、茄子翻炒', '加酱油、糖调味，撒葱花出锅'], time: 20, difficulty: '中等', taste: 'heavy' },
  { id: 28, name: '老醋花生', icon: '🥜', ingredients: ['花生', '洋葱', '青椒', '醋', '糖', '酱油', '盐'], seasonings: ['醋', '糖', '酱油', '盐'], steps: ['花生炒熟或油炸至酥脆', '洋葱青椒切小丁', '调汁：醋、糖、酱油、盐搅匀', '所有食材混合，淋汁拌匀'], time: 10, difficulty: '简单', taste: 'sweet' },
  { id: 29, name: '酸菜鱼', icon: '🐟', ingredients: ['鱼', '酸菜', '辣椒', '花椒', '姜', '大蒜', '料酒', '盐', '淀粉', '油'], seasonings: ['花椒', '料酒', '盐', '淀粉', '油'], steps: ['鱼片加料酒、盐、淀粉腌制', '酸菜切丝', '热锅加油，爆香姜蒜、辣椒花椒', '下酸菜翻炒，加水煮开', '逐片放入鱼片煮至变白', '出锅撒葱花'], time: 30, difficulty: '困难', taste: 'heavy' },
  { id: 30, name: '素炒三丝', icon: '🥕', ingredients: ['土豆', '胡萝卜', '青椒', '大蒜', '盐', '醋', '油'], seasonings: ['盐', '醋', '油'], steps: ['土豆、胡萝卜、青椒切丝', '土豆丝泡水去淀粉', '热锅凉油，爆香蒜末', '下三丝大火快炒', '加盐、醋调味出锅'], time: 10, difficulty: '简单', taste: 'light' }
]

// ==================== API 端点 ====================

/** 获取全部菜谱 */
router.get('/recipes', (req, res) => {
  res.json({ success: true, data: RECIPES })
})

/** 推荐菜谱 */
router.post('/recommend', (req, res) => {
  const { ingredients = [], time = 'all', taste = 'all' } = req.body
  if (ingredients.length === 0) {
    return res.status(400).json({ error: '至少输入一种食材' })
  }

  const userTags = ingredients.map(normalizeIngredient)
  const results = RECIPES.map(r => {
    const { pct, missing } = calcMatch(r, userTags)
    return { ...r, matchPercent: pct, missing }
  })
    .filter(r => {
      if (time !== 'all' && r.time > parseInt(time)) return false
      if (taste !== 'all' && r.taste !== taste) return false
      return true
    })
    .sort((a, b) => b.matchPercent - a.matchPercent)
    .slice(0, 6)

  res.json({ success: true, data: results })
})

/** 随机抽取 */
router.post('/random', (req, res) => {
  const { mode = 'safe', ingredients = [] } = req.body
  let pool = RECIPES

  if (mode === 'safe' || mode === 'consume') {
    const userTags = ingredients.map(normalizeIngredient)
    const scored = RECIPES.map(r => {
      const { pct, missing } = calcMatch(r, userTags)
      return { ...r, matchPercent: pct, missing }
    })

    if (mode === 'safe') {
      pool = scored.filter(r => r.matchPercent >= 30)
    } else {
      // 极限消耗：按匹配度排序取前10
      pool = scored.sort((a, b) => b.matchPercent - a.matchPercent).slice(0, 10)
    }
  }

  if (pool.length === 0) {
    return res.json({ success: true, data: null })
  }

  const picked = pool[Math.floor(Math.random() * pool.length)]
  res.json({ success: true, data: picked })
})

// ==================== 工具函数 ====================

const ALIAS_MAP = {
  '土豆': '土豆', '洋芋': '土豆', '马铃薯': '土豆',
  '番茄': '番茄', '西红柿': '番茄',
  '包菜': '包菜', '卷心菜': '包菜', '圆白菜': '包菜',
  '鸡蛋': '鸡蛋', '蛋': '鸡蛋',
  '猪肉': '猪肉', '猪': '猪肉',
  '牛肉': '牛肉', '牛': '牛肉',
  '鸡肉': '鸡肉', '鸡': '鸡肉',
  '米饭': '米饭', '剩饭': '米饭', '饭': '米饭',
  '面条': '面条', '面': '面条',
  '白菜': '白菜', '大白菜': '白菜',
  '蒜': '大蒜', '大蒜': '大蒜', '蒜头': '大蒜',
  '葱': '葱', '小葱': '葱', '大葱': '葱',
  '姜': '姜', '生姜': '姜',
  '辣椒': '辣椒', '辣': '辣椒',
  '豆腐': '豆腐',
  '鱼': '鱼', '鱼片': '鱼',
  '虾': '虾', '虾仁': '虾',
  '蘑菇': '蘑菇', '香菇': '蘑菇',
  '胡萝卜': '胡萝卜', '红萝卜': '胡萝卜',
  '青椒': '青椒', '菜椒': '青椒',
}

function normalizeIngredient(word) {
  const clean = word.replace(/^[半两几一些少许\d]+[个颗根片块只条份碗盘锅勺]/g, '').trim()
  return ALIAS_MAP[clean] || clean
}

function calcMatch(recipe, userTags) {
  const recipeIngs = (recipe.ingredients || []).map(normalizeIngredient)
  let matchCount = 0
  const totalWeight = recipeIngs.length || 1

  userTags.forEach(tag => {
    if (recipeIngs.some(ri => ri === tag || ri.includes(tag) || tag.includes(ri))) {
      const isSeasoning = recipe.seasonings?.some(s => normalizeIngredient(s) === tag || tag.includes(normalizeIngredient(s)))
      matchCount += isSeasoning ? 2 : 1
    }
  })

  const pct = Math.min(100, Math.round((matchCount / totalWeight) * 100))
  const missing = recipeIngs.filter(ri => !userTags.some(t => ri === t || ri.includes(t) || t.includes(ri)))
  return { pct, missing }
}

export default router
