/**
 * 浏览器与网络 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'net-render', cat: 'network', name: '浏览器渲染流水线', level: 3, sort: 1, deps: [],
    content: '## 浏览器渲染流水线\n\n从输入 URL 到页面呈现的完整过程。\n\n### 过程\n1. 解析 HTML 构建 DOM 树\n2. 解析 CSS 构建 CSSOM\n3. 合成渲染树（Render Tree）\n4. 布局（Layout/回流）\n5. 绘制（Paint）\n6. 合成（Composite）\n\n### 关键\n- DOM 与 CSSOM 并行解析\n- JS 会阻塞 DOM 解析（除非 async/defer）\n- 渲染树只含可见元素\n\n### 阻塞\n- CSS 阻塞渲染\n- JS 阻塞解析\n- 图片不阻塞渲染'
  },
  {
    id: 'net-reflow', cat: 'network', name: '重排与重绘', level: 2, sort: 2, deps: ['net-render'],
    content: '## 重排与重绘\n\n### 重排（Reflow）\n- 布局改变，重新计算几何\n- 触发：修改 width/height、增删 DOM、获取布局信息\n\n### 重绘（Repaint）\n- 外观改变，不影响布局\n- 触发：修改 color/background/visibility\n\n### 优化\n- 避免频繁读写布局属性（批量处理）\n- 用 transform/opacity（不触发重排）\n- 用 DocumentFragment 批量操作 DOM\n- 使用 requestAnimationFrame\n\n### 关键\n- 重排比重绘开销大\n- 读写分离避免强制同步布局'
  },
  {
    id: 'net-v8', cat: 'network', name: 'V8 引擎与 GC', level: 3, sort: 3, deps: [],
    content: '## V8 引擎与垃圾回收\n\n### V8 组成\n- Parser（解析）\n- Ignition（解释器）\n- TurboFan（优化编译器）\n- 内联缓存（Inline Cache）\n\n### 内存分代\n- **新生代**：Scavenge 算法（复制）\n- **老生代**：标记-清除 + 标记-整理\n\n### GC 算法\n- 标记清除（Mark-Sweep）\n- 标记整理（Mark-Compact）\n- 增量标记、并发标记\n\n### 内存泄漏\n- 全局变量、闭包、未清理定时器/监听器\n- 脱离 DOM 的引用'
  },
  {
    id: 'net-http', cat: 'network', name: 'HTTP 1/2/3', level: 2, sort: 4, deps: [],
    content: '## HTTP 1.1 / 2 / 3\n\n### HTTP/1.1\n- 持久连接（keep-alive）\n- 队头阻塞（同一连接串行）\n- 可多开连接\n\n### HTTP/2\n- 二进制分帧\n- 多路复用（同一连接并行）\n- 头部压缩（HPACK）\n- 服务端推送\n\n### HTTP/3\n- 基于 QUIC（UDP）\n- 0-RTT 连接\n- 解决队头阻塞（传输层）\n- 更好的弱网表现\n\n### 关键\n- HTTP/2 解决应用层队头阻塞\n- HTTP/3 解决传输层队头阻塞'
  },
  {
    id: 'net-cache', cat: 'network', name: '缓存策略', level: 2, sort: 5, deps: ['net-http'],
    content: '## 缓存策略\n\n### 强缓存\n- Cache-Control: max-age=3600\n- Expires（旧）\n- 命中则不请求服务器\n\n### 协商缓存\n- ETag / If-None-Match\n- Last-Modified / If-Modified-Since\n- 命中返回 304\n\n### Cache-Control 指令\n- max-age、no-cache、no-store、public/private\n\n### 区别\n- 强缓存不请求，协商缓存请求但返回 304\n- no-store 不缓存，no-cache 需协商\n\n### 实践\n- HTML 用协商缓存\n- 静态资源（hash 命名）用强缓存'
  },
  {
    id: 'net-cors', cat: 'network', name: 'CORS 跨域', level: 2, sort: 6, deps: ['net-http'],
    content: '## CORS 跨域\n\n### 同源策略\n- 协议 + 域名 + 端口都相同才是同源\n- 限制跨域读取\n\n### CORS 机制\n- 服务端设置响应头允许跨域\n- Access-Control-Allow-Origin\n- Access-Control-Allow-Methods/Headers\n\n### 简单请求 vs 预检\n- 简单请求：GET/POST 且无自定义头\n- 复杂请求：先发 OPTIONS 预检\n\n### 其他跨域方案\n- JSONP（仅 GET）\n- 代理（开发环境）\n- WebSocket（不限制同源）\n- postMessage'
  },
  {
    id: 'net-security', cat: 'network', name: 'Web 安全', level: 2, sort: 7, deps: ['net-cors'],
    content: '## Web 安全\n\n### XSS（跨站脚本）\n- 注入恶意脚本\n- 防御：转义、CSP、HttpOnly Cookie\n- 分类：存储型、反射型、DOM 型\n\n### CSRF（跨站请求伪造）\n- 诱导用户发起恶意请求\n- 防御：Token、SameSite Cookie、验证 Referer\n\n### 其他\n- SQL 注入：参数化查询\n- 点击劫持：X-Frame-Options\n- 中间人攻击：HTTPS\n\n### 关键\n- 永远不信任用户输入\n- 输出转义、输入校验\n- Cookie 安全属性（HttpOnly/Secure/SameSite）'
  },
  {
    id: 'net-dns', cat: 'network', name: 'DNS 与 TCP', level: 2, sort: 8, deps: [],
    content: '## DNS 与 TCP\n\n### DNS 解析\n- 域名 → IP\n- 递归查询、缓存\n- 优化：DNS 预解析（preconnect）\n\n### TCP 三次握手\n1. SYN\n2. SYN + ACK\n3. ACK\n\n### TCP 四次挥手\n- 断开连接四步\n\n### 关键\n- TCP 面向连接、可靠\n- UDP 无连接、快\n- HTTPS = HTTP + TLS\n\n### 优化\n- 减少 DNS 查询\n- 连接复用（keep-alive）\n- 预连接'
  },
  {
    id: 'net-perf', cat: 'network', name: '网络性能优化', level: 3, sort: 9, deps: ['net-http'],
    content: '## 网络性能优化\n\n### 请求优化\n- 减少请求数量（合并、雪碧图）\n- HTTP/2 多路复用\n- 资源压缩（gzip/brotli）\n\n### 加载优化\n- 懒加载、预加载（preload/prefetch）\n- 关键资源内联\n- 图片优化（WebP、响应式）\n\n### 缓存\n- CDN 加速\n- 合理缓存策略\n- Service Worker 离线缓存\n\n### 指标\n- TTFB、FCP、LCP\n- Core Web Vitals\n\n### 关键\n- 首屏优先，非关键资源延迟加载'
  }
]

export const questions = [
  { id: 'q-net-1', cat: 'network', node: 'net-render', type: 'single', level: 3, tags: ['八股文'], q: 'CSS 解析生成的树是？', options: ['DOM 树', 'CSSOM', '渲染树', 'AST'], answer: 1, explain: 'CSS 解析生成 CSSOM（CSS Object Model）。' },
  { id: 'q-net-2', cat: 'network', node: 'net-render', type: 'multi', level: 3, tags: ['八股文'], q: '渲染流水线的步骤有？', options: ['构建 DOM', '构建 CSSOM', '布局', '绘制'], answer: [0, 1, 2, 3], explain: 'DOM/CSSOM/布局/绘制是渲染关键步骤。' },
  { id: 'q-net-3', cat: 'network', node: 'net-render', type: 'judge', level: 3, tags: ['八股文'], q: 'script 标签默认会阻塞 HTML 解析。', options: ['正确', '错误'], answer: true, explain: '同步 script 阻塞解析，async/defer 可优化。' },
  { id: 'q-net-4', cat: 'network', node: 'net-reflow', type: 'single', level: 2, tags: ['八股文'], q: '修改哪个属性会触发重排？', options: ['color', 'width', 'background', 'visibility'], answer: 1, explain: 'width 改变布局触发重排，color 只重绘。' },
  { id: 'q-net-5', cat: 'network', node: 'net-reflow', type: 'multi', level: 2, tags: ['八股文'], q: '不触发重排的动画属性有？', options: ['transform', 'opacity', 'color', 'width'], answer: [0, 1, 2], explain: 'transform/opacity/color 不触发重排，width 会。' },
  { id: 'q-net-6', cat: 'network', node: 'net-reflow', type: 'judge', level: 2, tags: ['八股文'], q: '批量操作 DOM 可用 DocumentFragment 减少重排。', options: ['正确', '错误'], answer: true, explain: 'DocumentFragment 批量插入减少多次重排。' },
  { id: 'q-net-7', cat: 'network', node: 'net-v8', type: 'single', level: 3, tags: ['八股文'], q: 'V8 的解释器是？', options: ['Ignition', 'TurboFan', 'V8', 'JIT'], answer: 0, explain: 'Ignition 是 V8 解释器，TurboFan 是优化编译器。' },
  { id: 'q-net-8', cat: 'network', node: 'net-v8', type: 'multi', level: 3, tags: ['八股文'], q: 'V8 老生代使用的 GC 算法有？', options: ['标记清除', '标记整理', '复制', '引用计数'], answer: [0, 1], explain: '老生代用标记清除+标记整理，新生代用复制。' },
  { id: 'q-net-9', cat: 'network', node: 'net-v8', type: 'judge', level: 3, tags: ['八股文'], q: '未清理的定时器和事件监听器可能导致内存泄漏。', options: ['正确', '错误'], answer: true, explain: '定时器/监听器持有引用不释放会泄漏。' },
  { id: 'q-net-10', cat: 'network', node: 'net-http', type: 'single', level: 2, tags: ['八股文'], q: 'HTTP/2 实现多路复用的基础是？', options: ['二进制分帧', '头部压缩', '服务端推送', 'keep-alive'], answer: 0, explain: '二进制分帧使同一连接可并行传输。' },
  { id: 'q-net-11', cat: 'network', node: 'net-http', type: 'multi', level: 2, tags: ['八股文'], q: 'HTTP/2 的新特性有？', options: ['多路复用', '头部压缩', '服务端推送', '基于 UDP'], answer: [0, 1, 2], explain: '基于 UDP 是 HTTP/3，HTTP/2 仍基于 TCP。' },
  { id: 'q-net-12', cat: 'network', node: 'net-http', type: 'judge', level: 3, tags: ['八股文'], q: 'HTTP/3 基于 QUIC 协议（UDP）。', options: ['正确', '错误'], answer: true, explain: 'HTTP/3 基于 QUIC（UDP）解决传输层队头阻塞。' },
  { id: 'q-net-13', cat: 'network', node: 'net-cache', type: 'single', level: 2, tags: ['八股文'], q: '命中强缓存时的状态是？', options: ['200 (from cache)', '304', '500', '301'], answer: 0, explain: '强缓存命中直接取缓存，返回 200 from cache。' },
  { id: 'q-net-14', cat: 'network', node: 'net-cache', type: 'multi', level: 2, tags: ['八股文'], q: '协商缓存的验证字段有？', options: ['ETag', 'Last-Modified', 'max-age', 'If-None-Match'], answer: [0, 1, 3], explain: 'ETag/Last-Modified 是协商缓存，max-age 是强缓存。' },
  { id: 'q-net-15', cat: 'network', node: 'net-cache', type: 'judge', level: 2, tags: ['八股文'], q: '带 hash 的静态资源适合使用强缓存。', options: ['正确', '错误'], answer: true, explain: 'hash 命名内容变化即换 URL，可放心强缓存。' },
  { id: 'q-net-16', cat: 'network', node: 'net-cors', type: 'single', level: 2, tags: ['八股文'], q: '复杂请求发送预检的 HTTP 方法是？', options: ['OPTIONS', 'GET', 'POST', 'HEAD'], answer: 0, explain: '复杂跨域请求先发 OPTIONS 预检。' },
  { id: 'q-net-17', cat: 'network', node: 'net-cors', type: 'multi', level: 2, tags: ['八股文'], q: '跨域解决方案有？', options: ['CORS', 'JSONP', '代理', 'postMessage'], answer: [0, 1, 2, 3], explain: '以上都是常见跨域方案。' },
  { id: 'q-net-18', cat: 'network', node: 'net-cors', type: 'judge', level: 2, tags: ['八股文'], q: 'JSONP 只支持 GET 请求。', options: ['正确', '错误'], answer: true, explain: 'JSONP 通过 script 标签加载，仅支持 GET。' },
  { id: 'q-net-19', cat: 'network', node: 'net-security', type: 'single', level: 2, tags: ['八股文'], q: '注入恶意脚本的攻击是？', options: ['XSS', 'CSRF', 'SQL 注入', 'DDoS'], answer: 0, explain: 'XSS 跨站脚本注入恶意代码。' },
  { id: 'q-net-20', cat: 'network', node: 'net-security', type: 'multi', level: 2, tags: ['八股文'], q: '防御 XSS 的手段有？', options: ['输出转义', 'CSP', 'HttpOnly Cookie', '参数化查询'], answer: [0, 1, 2], explain: '参数化查询是防 SQL 注入，非 XSS。' },
  { id: 'q-net-21', cat: 'network', node: 'net-security', type: 'judge', level: 2, tags: ['八股文'], q: 'SameSite Cookie 可用于防御 CSRF。', options: ['正确', '错误'], answer: true, explain: 'SameSite 限制跨站携带 Cookie，防 CSRF。' },
  { id: 'q-net-22', cat: 'network', node: 'net-dns', type: 'single', level: 2, tags: ['八股文'], q: 'TCP 建立连接需要几次握手？', options: ['2 次', '3 次', '4 次', '5 次'], answer: 1, explain: 'TCP 三次握手建立连接。' },
  { id: 'q-net-23', cat: 'network', node: 'net-dns', type: 'multi', level: 2, tags: ['八股文'], q: 'TCP 的特点有？', options: ['面向连接', '可靠传输', '有序', '无连接'], answer: [0, 1, 2], explain: 'TCP 面向连接可靠有序，UDP 无连接。' },
  { id: 'q-net-24', cat: 'network', node: 'net-dns', type: 'judge', level: 2, tags: ['八股文'], q: 'HTTPS 是在 HTTP 之上增加 TLS 加密层。', options: ['正确', '错误'], answer: true, explain: 'HTTPS = HTTP + TLS 加密。' },
  { id: 'q-net-25', cat: 'network', node: 'net-perf', type: 'single', level: 3, tags: ['八股文'], q: '资源压缩常用的算法有？', options: ['gzip', 'Base64', 'MD5', 'SHA'], answer: 0, explain: 'gzip/brotli 用于资源压缩传输。' },
  { id: 'q-net-26', cat: 'network', node: 'net-perf', type: 'multi', level: 3, tags: ['八股文'], q: 'Web 性能核心指标（Core Web Vitals）有？', options: ['LCP', 'FID', 'CLS', 'TTFB'], answer: [0, 1, 2, 3], explain: 'LCP/FID/CLS 是 CWV 核心，TTFB 是重要指标。' },
  { id: 'q-net-27', cat: 'network', node: 'net-perf', type: 'judge', level: 3, tags: ['八股文'], q: 'preload 用于预加载当前页面需要的资源。', options: ['正确', '错误'], answer: true, explain: 'preload 预加载关键资源，prefetch 预取未来资源。' },
  { id: 'q-net-28', cat: 'network', node: 'net-render', type: 'single', level: 3, tags: ['场景题'], q: '避免 JS 阻塞 DOM 解析的 script 属性是？', options: ['async', 'type', 'src', 'lang'], answer: 0, explain: 'async/defer 让脚本不阻塞解析。' }
]
