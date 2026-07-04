import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const fp = join(__dirname, 'data', 'sleep-content.json')

const raw = readFileSync(fp, 'utf-8')

// 找到所有 "text": "..." 字段中的未转义双引号
// 策略：先找到所有 text 字段的起始位置，然后追踪字符串结束位置
let fixed = ''
let i = 0
while (i < raw.length) {
  // 检测 "text": " 开头
  if (raw.startsWith('"text": "', i)) {
    // 找到这个位置：跳过 "text": "
    fixed += '"text": "'
    i += 9
  } else if (raw.startsWith('"text": "', i - 1) && i > 0) {
    // 跳过
    i++
    continue
  } else {
    fixed += raw[i]
    i++
  }
}

// 上面的方法不太好，让我重新来。更好的方法是用正则表达式找到 text 字段并修复内部引号。
// 实际上最简单的方法：找到 text 字段中的中文双引号并替换

// 重新来
const result = raw.replace(/"text":\s*"([\s\S]*?)"\s*(?=,\s*"[a-z])/g, (match, content) => {
  // 将文本中的 " (未转义的双引号) 替换为中文引号 ""
  const escaped = content.replace(/"(?=[^\x00-\x7F])/g, '\u201C').replace(/(?<=[^\x00-\x7F])"/g, '\u201D')
  return '"text": "' + content.replace(/"/g, '\\"') + '"'
})

// 更简单：把 text 内的所有 " 都转义
let result2 = ''
let in_text = false
let text_key_found = false
let j = 0
while (j < raw.length) {
  if (!in_text && raw.substring(j).startsWith('"text": "')) {
    result2 += '"text": "'
    j += 9
    in_text = true
    continue
  }
  if (in_text) {
    // 在 text 值内部，查找字符串结束（未转义的 "）
    if (raw[j] === '\\') {
      result2 += raw[j] + (raw[j + 1] || '')
      j += 2
      continue
    }
    if (raw[j] === '"') {
      // 看后续是不是字段分隔符（逗号+换行+下一个key，或者}换行]）
      const rest = raw.substring(j + 1)
      if (rest.match(/^\s*[,}\]\n]/) || rest.match(/^\s*$/)) {
        result2 += '"'
        j++
        in_text = false
        continue
      } else {
        // 这是文本中的引号，需要转义
        result2 += '\\"'
        j++
        continue
      }
    }
    result2 += raw[j]
    j++
  } else {
    result2 += raw[j]
    j++
  }
}

writeFileSync(fp, result2, 'utf-8')
console.log('done')
