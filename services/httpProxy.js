import axios from 'axios'
import iconv from 'iconv-lite'

/**
 * 通用 HTTP 代理转发
 * @param {string} targetUrl - 上游完整 URL
 * @param {object} options
 * @param {object} options.headers - 自定义 headers
 * @param {string} options.responseType - 响应类型 'json' | 'text' | 'buffer'
 * @param {string} options.responseEncoding - 当 responseType='buffer' 时，用什么编码解码。如 'gbk'
 * @returns {Promise<object>} { data, contentType }
 */
export async function proxyRequest(targetUrl, options = {}) {
  const { headers = {}, responseType = 'json' } = options

  const config = {
    url: targetUrl,
    method: 'GET',
    headers,
    timeout: 30000,
    responseType: responseType === 'buffer' ? 'arraybuffer' : 'text'
  }

  const res = await axios(config)

  let data = res.data

  // 如果是 buffer 模式且指定了编码，进行转码
  if (responseType === 'buffer' && options.responseEncoding) {
    data = iconv.decode(Buffer.from(data), options.responseEncoding)
  }

  // 自动尝试 JSON 解析
  if (responseType === 'json' && typeof data === 'string') {
    try {
      data = JSON.parse(data)
    } catch (_) {
      // 不是 JSON，保持原样
    }
  }

  return {
    data,
    contentType: res.headers['content-type'] || ''
  }
}

/**
 * 通过直接 fetch upstream js 文件并提取 JSONP 数据
 * 许多东方财富接口返回的是 var xxx = {...}; 格式的 JS 文件
 */
export async function fetchUpstreamJs(targetUrl, varNames, headers = {}) {
  const res = await axios.get(targetUrl, {
    headers,
    timeout: 15000,
    responseType: 'text'
  })

  const text = res.data
  const result = {}

  for (const varName of varNames) {
    // 尝试匹配 var varName = {...};
    const patterns = [
      new RegExp(`var\\s+${varName}\\s*=\\s*(\\{[^;]*\\})\\s*;?`, 's'),
      new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[^;]*\\])\\s*;?`, 's'),
      new RegExp(`var\\s+${varName}\\s*=\\s*"([^"]*)"\\s*;?`),
      new RegExp(`var\\s+${varName}\\s*=\\s*'([^']*)'\\s*;?`),
      // 处理 jsonpgz 回调格式: jsonpgz({...})
      new RegExp(`${varName}\\s*\\(\\s*(\\{[^;]*\\})\\s*\\)`, 's')
    ]

    for (const pattern of patterns) {
      const match = text.match(pattern)
      if (match) {
        try {
          result[varName] = JSON.parse(match[1])
        } catch (_) {
          // key 没有引号的 object literal，尝试用 eval
          try {
            const fn = new Function(`return ${match[1]}`)
            result[varName] = fn()
          } catch (_2) {
            result[varName] = match[1]
          }
        }
        break
      }
    }
  }

  return result
}
