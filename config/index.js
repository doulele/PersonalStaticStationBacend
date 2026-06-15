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
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || ''
}
