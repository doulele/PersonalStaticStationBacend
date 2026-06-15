import crypto from 'crypto'

/**
 * 腾讯云 API 3.0 签名 (TC3-HMAC-SHA256)
 * @param {string} secretId
 * @param {string} secretKey
 * @param {string} service - 服务名，如 'ocr'
 * @param {string} host - 域名，如 'ocr.tencentcloudapi.com'
 * @param {string} region - 地域，如 'ap-guangzhou'
 * @param {string} action - API 动作，如 'GeneralAccurateOCR'
 * @param {string} version - API 版本，如 '2018-11-19'
 * @param {string} payload - JSON 请求体字符串
 * @returns {object} headers 对象，包含 Authorization 等
 */
export function signTc3(secretId, secretKey, service, host, region, action, version, payload) {
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  // 1. 拼接规范请求串
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const contentType = 'application/json; charset=utf-8'
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\nx-tc-action:${action.toLowerCase()}\n`
  const signedHeaders = 'content-type;host;x-tc-action'
  const hashedRequestPayload = sha256hex(payload)
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload
  ].join('\n')

  // 2. 拼接待签名字符串
  const algorithm = 'TC3-HMAC-SHA256'
  const credentialScope = `${date}/${service}/tc3_request`
  const hashedCanonicalRequest = sha256hex(canonicalRequest)
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    hashedCanonicalRequest
  ].join('\n')

  // 3. 计算签名
  const secretDate = hmacSHA256(`TC3${secretKey}`, date)
  const secretService = hmacSHA256(secretDate, service)
  const secretSigning = hmacSHA256(secretService, 'tc3_request')
  const signature = hmacSHA256(secretSigning, stringToSign, 'hex')

  // 4. 拼接 Authorization
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    'Authorization': authorization,
    'Content-Type': contentType,
    'Host': host,
    'X-TC-Action': action,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version,
    'X-TC-Region': region
  }
}

function sha256hex(str) {
  return crypto.createHash('sha256').update(str).digest('hex')
}

function hmacSHA256(key, str, encoding) {
  const hmac = crypto.createHmac('sha256', key)
  hmac.update(str)
  return encoding === 'hex' ? hmac.digest('hex') : hmac.digest()
}
