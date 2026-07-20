import { Router } from 'express'
import fundRoutes from './fund.js'
import push2Routes from './push2.js'
import qtRoutes from './qt.js'
import ifzqRoutes from './ifzq.js'
import lotteryRoutes from './lottery.js'
import ocrRoutes from './ocr.js'
import analysisRoutes from './analysis.js'
import travelGuideRoutes from './travelGuide.js'
import userRoutes from './user.js'
import authRoutes from './auth.js'
import statsRoutes from './stats.js'
import oilPriceRoutes from './oilPrice.js'
import familyRoutes from './family.js'
import familyMeetingRoutes from './familyMeeting.js'
import videoParseRoutes from './videoParse.js'
import wishTreeHoleRoutes from './wishTreeHole.js'
import taskAlchemistRoutes from './taskAlchemist.js'
import eternalArchiveRoutes from './eternalArchive.js'
import recipeLabRoutes from './recipeLab.js'

const router = Router()

// 所有 API 路由统一禁用客户端缓存
router.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  })
  next()
})

router.use('/fund', fundRoutes)
router.use('/push2', push2Routes)
router.use('/qt', qtRoutes)
router.use('/ifzq', ifzqRoutes)
router.use('/lottery', lotteryRoutes)
router.use('/ocr', ocrRoutes)
router.use('/analysis', analysisRoutes)
router.use('/travel', travelGuideRoutes)
router.use('/user', userRoutes)
router.use('/auth', authRoutes)
router.use('/stats', statsRoutes)
router.use('/oil-price', oilPriceRoutes)
router.use('/family', familyRoutes)
router.use('/family-meeting', familyMeetingRoutes)
router.use('/video-parse', videoParseRoutes)
router.use('/wish-tree-hole', wishTreeHoleRoutes)
router.use('/task-alchemist', taskAlchemistRoutes)
router.use('/eternal-archive', eternalArchiveRoutes)
router.use('/recipe-lab', recipeLabRoutes)

// 健康检查
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

export default router
