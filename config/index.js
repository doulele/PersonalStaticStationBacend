import dotenv from 'dotenv'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: resolve(__dirname, '..', '.env') })

export default {
  port: parseInt(process.env.PORT, 10) || 3001,

  // 上游目标配置
  upstreams: {
    fund: {
      target: 'https://fund.eastmoney.com',
      headers: {
        Referer: 'https://fund.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    },
    push2: {
      target: 'https://push2delay.eastmoney.com',
      headers: {
        Referer: 'https://quote.eastmoney.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    },
    qt: {
      target: 'https://qt.gtimg.cn',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    },
    ifzq: {
      target: 'https://web.ifzq.gtimg.cn',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    },
  lottery: {
    target: 'https://www.mxnzp.com/api/lottery/common',
    appId: process.env.MXNZP_APP_ID || '',
    appSecret: process.env.MXNZP_APP_SECRET || ''
  }
  },

  // 腾讯云 OCR 配置
  tencentOcr: {
    secretId: process.env.TENCENT_SECRET_ID || '',
    secretKey: process.env.TENCENT_SECRET_KEY || '',
    endpoint: 'ocr.tencentcloudapi.com',
    region: 'ap-guangzhou',
    action: 'GeneralAccurateOCR',
    version: '2018-11-19'
  },

  // DeepSeek API Key（可选，配置后启用 LLM 智能解析彩票号码）
  // 获取地址：https://platform.deepseek.com/api_keys
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',

  // 彩票数据爬取密码（前端隐藏按钮使用，请修改为强密码）
  crawlPassword: process.env.CRAWL_PASSWORD || 'lottery_sync_2024',

  // 高德地图 Web 服务 API Key（后端使用：POI搜索、地理编码等）
  amapWebServiceKey: process.env.AMAP_WEB_SERVICE_KEY || ''
}
