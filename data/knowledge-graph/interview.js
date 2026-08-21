/**
 * 专属面试题库（区别于专项刷题的 411 道基础题）
 * --------------------------------------------------------------
 * 特点：
 *  - 偏综合面试场景（跨知识点的综合题、高频追问、实战题）
 *  - hot: true 表示高频面试题（高频题专区数据源）
 *  - node 为空，不关联知识点节点（不参与学习地图点亮）
 * 结构：{ id, cat, type, level, hot, tags, q, options, answer, explain }
 */
export const interviewQuestions = [
  // ==================== JavaScript ====================
  { id: 'iv-js-1', cat: 'javascript', type: 'single', level: 2, hot: true, tags: ['高频追问'], q: '0.1 + 0.2 === 0.3 的结果是什么？', options: ['true', 'false', 'NaN', '报错'], answer: 1, explain: '浮点数二进制存储精度问题，0.1+0.2 约等于 0.30000000000000004，用 toFixed 或乘整后计算解决。' },
  { id: 'iv-js-2', cat: 'javascript', type: 'multi', level: 2, hot: true, tags: ['实战题'], q: '深拷贝相比浅拷贝，以下说法正确的是？', options: ['浅拷贝只复制一层引用', 'JSON.parse(JSON.stringify()) 会丢失函数和 undefined', 'structuredClone 是浏览器原生深拷贝 API', '浅拷贝修改嵌套对象会影响原对象'], answer: [0, 1, 2, 3], explain: '浅拷贝复制一层引用，嵌套对象共享；JSON 序列化会丢失 function/undefined/Symbol；structuredClone 是原生深拷贝；以上均正确。' },
  { id: 'iv-js-3', cat: 'javascript', type: 'single', level: 2, hot: true, tags: ['高频追问'], q: '防抖（debounce）的核心思想是？', options: ['连续触发时只执行最后一次', '固定时间间隔执行一次', '立即执行后锁住一段时间', '每次触发都执行'], answer: 0, explain: '防抖：触发后重置计时器，只执行最后一次；节流：固定间隔执行一次。' },
  { id: 'iv-js-4', cat: 'javascript', type: 'judge', level: 2, hot: false, tags: ['高频追问'], q: '事件委托利用的是事件冒泡机制，将子元素事件绑定到父元素上。', options: ['正确', '错误'], answer: true, explain: '事件委托正是利用冒泡，在父元素统一处理子元素事件，减少监听器数量。' },
  { id: 'iv-js-5', cat: 'javascript', type: 'single', level: 3, hot: false, tags: ['实战题'], q: '以下哪种方式能安全地在异步循环中按顺序处理结果？', options: ['for + async/await', 'Promise.all 直接映射', 'setTimeout 递归', 'Array.forEach + async 回调'], answer: 0, explain: 'for...of + await 串行执行；forEach 中的 async 不会等待，会并发乱序。' },
  { id: 'iv-js-6', cat: 'javascript', type: 'multi', level: 3, hot: true, tags: ['高频追问'], q: '关于微任务与宏任务的执行顺序，正确的是？', options: ['每执行一个宏任务后清空全部微任务', 'Promise.then 属于微任务', 'setTimeout 属于宏任务', '微任务队列在宏任务之前优先清空'], answer: [0, 1, 2, 3], explain: '事件循环：同步代码 → 清空微任务 → 渲染 → 下一个宏任务，每轮宏任务后都会清空微任务队列。' },

  // ==================== CSS ====================
  { id: 'iv-css-1', cat: 'css', type: 'single', level: 2, hot: true, tags: ['高频追问'], q: 'flex: 1 表示什么？', options: ['flex-grow:1; flex-shrink:1; flex-basis:0%', 'flex-grow:1; flex-shrink:0; flex-basis:auto', '宽度等于内容', '等分父容器宽度'], answer: 0, explain: 'flex:1 是 flex-grow:1、flex-shrink:1、flex-basis:0% 的缩写，表示等分剩余空间。' },
  { id: 'iv-css-2', cat: 'css', type: 'multi', level: 2, hot: true, tags: ['高频追问'], q: '以下哪些方式可以触发 BFC（块级格式化上下文）？', options: ['overflow: hidden', 'display: flex', 'position: absolute', 'float: left'], answer: [0, 1, 2, 3], explain: 'overflow 非 visible、flex/grid、绝对定位、浮动、display: flow-root 等都能触发 BFC。' },
  { id: 'iv-css-3', cat: 'css', type: 'single', level: 2, hot: false, tags: ['高频追问'], q: 'CSS 选择器优先级从高到低排列正确的是？', options: ['!important > 内联 > id > class > 标签', '内联 > !important > id > class > 标签', 'id > !important > 内联 > class > 标签', 'class > id > 内联 > !important > 标签'], answer: 0, explain: '!important 最高，其次是内联样式、id 选择器、class/属性/伪类、标签/伪元素。' },
  { id: 'iv-css-4', cat: 'css', type: 'judge', level: 2, hot: false, tags: ['实战题'], q: '水平垂直居中可以用父元素 display:grid + place-items:center 实现。', options: ['正确', '错误'], answer: true, explain: 'grid 布局中 place-items: center 可让子元素水平垂直居中，是简洁方案。' },

  // ==================== HTML & 浏览器 ====================
  { id: 'iv-html-1', cat: 'html', type: 'single', level: 1, hot: false, tags: ['高频追问'], q: '<!DOCTYPE html> 的作用是？', options: ['声明文档类型，触发标准模式渲染', '定义页面标题', '引入外部样式', '声明编码格式'], answer: 0, explain: 'DOCTYPE 声明让浏览器以标准模式渲染，避免怪异模式（Quirks Mode）导致的兼容性问题。' },
  { id: 'iv-html-2', cat: 'html', type: 'multi', level: 2, hot: true, tags: ['高频追问'], q: '浏览器渲染流程的正确顺序包含哪些步骤？', options: ['解析 HTML 构建 DOM 树', '解析 CSS 构建 CSSOM', '合并生成渲染树（Render Tree）', '布局（Layout）与绘制（Paint）'], answer: [0, 1, 2, 3], explain: '标准流程：HTML→DOM、CSS→CSSOM、合成渲染树、布局、绘制、合成。' },
  { id: 'iv-html-3', cat: 'html', type: 'single', level: 2, hot: true, tags: ['高频追问'], q: '重排（reflow）与重绘（repaint）的关系是？', options: ['重排一定会引起重绘，重绘不一定重排', '重绘一定会引起重排', '两者互不影响', '只有重排没有重绘'], answer: 0, explain: '重排（布局变化）会导致重绘；而仅颜色变化等重绘不一定触发重排。优化重点是减少重排。' },
  { id: 'iv-html-4', cat: 'html', type: 'judge', level: 2, hot: false, tags: ['实战题'], q: '将 script 标签放在 body 底部或使用 defer 属性，可避免阻塞 DOM 解析。', options: ['正确', '错误'], answer: true, explain: '普通 script 会阻塞解析；放底部或用 defer/async 可避免阻塞。' },

  // ==================== 框架 ====================
  { id: 'iv-fw-1', cat: 'framework', type: 'multi', level: 3, hot: true, tags: ['高频追问'], q: 'Vue3 相比 Vue2 的核心变化有哪些？', options: ['Composition API 组合式 API', 'Proxy 替代 defineProperty 实现响应式', 'Fragment 支持多根节点', '性能更好且体积更小'], answer: [0, 1, 2, 3], explain: 'Vue3 引入 Composition API、Proxy 响应式、多根节点、Tree-shaking 优化等，以上均正确。' },
  { id: 'iv-fw-2', cat: 'framework', type: 'single', level: 3, hot: false, tags: ['高频追问'], q: '虚拟 DOM 的核心优势是？', options: ['减少直接操作真实 DOM 的次数，通过 diff 最小化更新', '完全替代真实 DOM', '让浏览器渲染更快', '不用再写 HTML'], answer: 0, explain: '虚拟 DOM 用 JS 对象描述界面，diff 后批量更新真实 DOM，降低操作成本并抽象跨平台能力。' },
  { id: 'iv-fw-3', cat: 'framework', type: 'multi', level: 3, hot: false, tags: ['实战题'], q: 'Vue 中 nextTick 的使用场景是？', options: ['DOM 更新完成后执行回调', '修改数据后立即获取最新 DOM 尺寸', '代替 setTimeout', '只能用在组件内部'], answer: [0, 1], explain: 'nextTick 在下次 DOM 更新循环结束后执行，常用于数据变化后读取最新 DOM；它不是 setTimeout 替代品。' },
  { id: 'iv-fw-4', cat: 'framework', type: 'single', level: 3, hot: true, tags: ['高频追问'], q: 'diff 算法中，列表渲染为什么要用 key？', options: ['让虚拟节点可复用和高效移动，避免不必要的重建', '提高 CSS 优先级', '让样式生效', '必须唯一且不能变化'], answer: 0, explain: 'key 帮助 diff 识别节点身份，实现复用与最小移动；用 index 作 key 在列表增删时会产生错误复用。' },

  // ==================== Node.js ====================
  { id: 'iv-node-1', cat: 'node', type: 'multi', level: 3, hot: true, tags: ['高频追问'], q: 'Node.js 事件循环（libuv）与浏览器事件循环的区别是？', options: ['Node 有 poll、check 等额外阶段', 'process.nextTick 优先级高于微任务队列', 'setImmediate 与 setTimeout 顺序不固定', '两者完全没有区别'], answer: [0, 1, 2], explain: 'Node 的 libuv 有多阶段模型；nextTick 在微任务之前执行；setImmediate 与 setTimeout 顺序受调用时机影响。' },
  { id: 'iv-node-2', cat: 'node', type: 'single', level: 2, hot: false, tags: ['高频追问'], q: 'CommonJS 与 ESM 的核心区别是？', options: ['CJS 同步加载，ESM 异步且静态分析', 'ESM 同步加载，CJS 异步', '两者加载方式相同', 'CJS 支持 tree-shaking'], answer: 0, explain: 'CommonJS 是同步 require、运行时求值；ESM 是静态 import、可异步加载并支持 tree-shaking。' },
  { id: 'iv-node-3', cat: 'node', type: 'multi', level: 3, hot: false, tags: ['实战题'], q: 'Node 服务应对高并发的常用手段有？', options: ['使用异步非阻塞 I/O', '集群（cluster）多进程', '引入消息队列削峰', '同步阻塞所有请求'], answer: [0, 1, 2], explain: '异步 I/O + 多进程集群 + 队列削峰是常见方案；同步阻塞会拖垮服务。' },

  // ==================== 工程化 ====================
  { id: 'iv-eng-1', cat: 'engineering', type: 'single', level: 2, hot: true, tags: ['高频追问'], q: 'Webpack 的打包核心思想是？', options: ['从入口出发递归构建依赖图，按规则打包成 bundle', '直接压缩所有文件', '仅做文件合并', '浏览器原生解析'], answer: 0, explain: 'Webpack 从入口模块递归解析依赖，通过 loader 转换、plugin 扩展，最终输出 chunk/bundle。' },
  { id: 'iv-eng-2', cat: 'engineering', type: 'multi', level: 2, hot: true, tags: ['高频追问'], q: 'Vite 相比 Webpack 的优势主要体现在？', options: ['开发环境基于原生 ESM，启动和热更新极快', '生产构建使用 Rollup', '按需编译，无需打包整个应用', '无法使用 loader 体系'], answer: [0, 1, 2], explain: 'Vite 开发用 esbuild + 原生 ESM 按需加载，生产用 Rollup 打包；它也有插件体系但以 Rollup 生态为主。' },
  { id: 'iv-eng-3', cat: 'engineering', type: 'multi', level: 3, hot: true, tags: ['实战题'], q: '常见的前端性能优化手段有哪些？', options: ['代码分割与懒加载', '资源压缩与 CDN 缓存', '图片懒加载与格式优化', '减少 DOM 操作与重排'], answer: [0, 1, 2, 3], explain: '加载性能与运行时性能双管齐下，以上四项都是核心优化手段。' },

  // ==================== 网络 ====================
  { id: 'iv-net-1', cat: 'network', type: 'single', level: 2, hot: true, tags: ['高频追问'], q: 'HTTPS 相比 HTTP 主要多了哪一层安全机制？', options: ['TLS/SSL 加密层，提供加密传输与身份认证', '数据压缩层', '内容缓存层', '连接复用层'], answer: 0, explain: 'HTTPS 在 HTTP 与 TCP 之间加入 TLS/SSL，实现加密、完整性校验与服务器身份认证。' },
  { id: 'iv-net-2', cat: 'network', type: 'multi', level: 2, hot: false, tags: ['高频追问'], q: 'TCP 三次握手的作用是？', options: ['确认双方收发能力正常', '同步初始序列号', '建立可靠连接', '直接传输数据'], answer: [0, 1, 2], explain: '三次握手同步序列号并确认双方收发能力，建立可靠连接；数据传输在握手完成后进行。' },
  { id: 'iv-net-3', cat: 'network', type: 'multi', level: 3, hot: true, tags: ['高频追问'], q: '从输入 URL 到页面展示的完整过程包含？', options: ['DNS 解析域名', '建立 TCP 连接并发送 HTTP 请求', '服务器响应并下载资源', '浏览器解析渲染页面'], answer: [0, 1, 2, 3], explain: '完整链路：DNS → TCP/TLS → HTTP 请求响应 → 解析 HTML/CSS/JS → 渲染。这是面试必考题。' },
  { id: 'iv-net-4', cat: 'network', type: 'multi', level: 3, hot: false, tags: ['高频追问'], q: 'HTTP/2 相比 HTTP/1.1 的改进有？', options: ['多路复用，一个连接并行多个请求', '头部压缩（HPACK）', '二进制分帧', '服务端推送'], answer: [0, 1, 2, 3], explain: 'HTTP/2 核心特性：多路复用、HPACK 头部压缩、二进制分帧、服务端推送。' },

  // ==================== TypeScript ====================
  { id: 'iv-ts-1', cat: 'typescript', type: 'multi', level: 2, hot: true, tags: ['高频追问'], q: 'TypeScript 相比 JavaScript 的优势是？', options: ['静态类型检查，编译期发现错误', '提供接口、泛型等类型抽象', '更好的 IDE 智能提示', '运行时性能更高'], answer: [0, 1, 2], explain: 'TS 是 JS 的超集，优势在类型安全与开发体验；编译产物仍是 JS，运行时性能无提升。' },
  { id: 'iv-ts-2', cat: 'typescript', type: 'single', level: 3, hot: false, tags: ['高频追问'], q: 'interface 与 type 的主要区别是？', options: ['interface 可声明合并，type 可定义联合/交叉等类型', 'type 可以声明合并', 'interface 不能描述对象', '两者完全等价'], answer: 0, explain: 'interface 支持声明合并（同名自动合并），type 更灵活（联合类型、工具类型等）。' },

  // ==================== 安全 ====================
  { id: 'iv-sec-1', cat: 'security', type: 'multi', level: 3, hot: true, tags: ['实战题'], q: '防范 XSS（跨站脚本攻击）的措施有？', options: ['对用户输入进行转义/过滤', '使用 CSP 内容安全策略', 'Cookie 设置 HttpOnly', '对输出编码'], answer: [0, 1, 2, 3], explain: 'XSS 防护：输入校验转义、输出编码、CSP、HttpOnly Cookie 等，以上均为有效手段。' },
  { id: 'iv-sec-2', cat: 'security', type: 'single', level: 3, hot: false, tags: ['高频追问'], q: 'CSRF 攻击的本质是？', options: ['利用用户已登录的 Cookie 发起伪造请求', '注入恶意脚本', 'SQL 注入数据库', '暴力破解密码'], answer: 0, explain: 'CSRF 利用浏览器自动携带 Cookie 的特性，诱导用户触发伪造的跨站请求；防范用 Token/同源校验。' },

  // ==================== 浏览器存储 ====================
  { id: 'iv-sto-1', cat: 'storage', type: 'multi', level: 2, hot: true, tags: ['高频追问'], q: 'localStorage、sessionStorage、Cookie 的区别是？', options: ['localStorage 持久化且容量约 5MB', 'sessionStorage 关闭标签页后清除', 'Cookie 随请求自动发送且有大小限制', '三者数据都会自动发到服务端'], answer: [0, 1, 2], explain: 'Cookie 会自动随请求发送，localStorage/sessionStorage 不会自动上传；三者容量和生命周期不同。' },
  { id: 'iv-sto-2', cat: 'storage', type: 'judge', level: 2, hot: false, tags: ['实战题'], q: 'IndexedDB 是一种浏览器内置的非关系型数据库，适合存储大量结构化数据。', options: ['正确', '错误'], answer: true, explain: 'IndexedDB 是浏览器内置的 NoSQL 数据库，容量大、支持事务与索引，适合离线存储大量数据。' },

  // ==================== 小程序 ====================
  { id: 'iv-mp-1', cat: 'mini-program', type: 'multi', level: 2, hot: true, tags: ['高频追问'], q: '小程序相比 H5 的优势与限制，正确的是？', options: ['有原生渲染能力和系统能力（相机、蓝牙等）', '通过微信审核发布，封闭生态', '无需下载安装即可使用', '开发完全自由无限制'], answer: [0, 1, 2], explain: '小程序具备原生能力与免安装优势，但生态封闭需审核；开发受平台限制。' },
  { id: 'iv-mp-2', cat: 'mini-program', type: 'single', level: 2, hot: false, tags: ['高频追问'], q: '小程序 setData 性能优化的关键是？', options: ['控制数据量、避免频繁且大体积的 setData', 'setData 越多越好', '只在 onLoad 调用一次', '数据必须全部塞入 data'], answer: 0, explain: 'setData 涉及逻辑层与视图层通信，应合并调用、减少数据量、按需更新。' },

  // ==================== 跨端 ====================
  { id: 'iv-xp-1', cat: 'cross-platform', type: 'single', level: 3, hot: false, tags: ['高频追问'], q: 'Taro/uni-app 多端框架的基本原理是？', options: ['一套代码编译到多端（web/小程序/App）', '每端写一套代码', '只在浏览器运行', '将 H5 直接嵌入 App'], answer: 0, explain: '多端框架通过编译时转换与运行时适配，实现一套代码多端运行。' },
  { id: 'iv-xp-2', cat: 'cross-platform', type: 'multi', level: 3, hot: false, tags: ['高频追问'], q: 'React Native 与 Flutter 的主要区别是？', options: ['RN 通过 JS 桥接调用原生组件', 'Flutter 自绘 UI 引擎（Skia）渲染', 'Flutter 性能通常更一致', 'RN 渲染完全脱离原生'], answer: [0, 1, 2], explain: 'RN 用 JS 桥接原生组件；Flutter 用 Dart + Skia 自绘；Flutter 渲染一致性更好，RN 依赖原生组件。' },

  // ==================== 微前端 ====================
  { id: 'iv-mf-1', cat: 'micro-frontend', type: 'multi', level: 3, hot: false, tags: ['高频追问'], q: '微前端主要解决什么问题？', options: ['大型应用拆分与独立部署', '不同团队技术栈隔离共存', '子应用按需加载', '消除所有代码重复'], answer: [0, 1, 2], explain: '微前端解决巨石应用协作难题：拆分部署、技术栈隔离、按需加载；但无法消除重复依赖。' },
  { id: 'iv-mf-2', cat: 'micro-frontend', type: 'judge', level: 3, hot: false, tags: ['高频追问'], q: 'qiankun 基于 single-spa 实现，通过 HTML Entry 加载子应用并做 JS 沙箱隔离。', options: ['正确', '错误'], answer: true, explain: 'qiankun 是 single-spa 的封装，采用 HTML Entry + 快照/代理沙箱实现隔离。' },

  // ==================== 图形学 ====================
  { id: 'iv-gfx-1', cat: 'graphics', type: 'multi', level: 3, hot: false, tags: ['高频追问'], q: 'Canvas 与 SVG 的区别正确的是？', options: ['Canvas 基于像素绘制，适合高频更新', 'SVG 基于矢量描述，缩放不失真', 'SVG 节点多时性能下降', 'Canvas 支持事件绑定'], answer: [0, 1, 2], explain: 'Canvas 像素级适合游戏/图表高频更新但不便绑定事件；SVG 矢量、可绑定事件但节点过多性能差。' },
  { id: 'iv-gfx-2', cat: 'graphics', type: 'single', level: 3, hot: false, tags: ['实战题'], q: '前端动画性能优化最推荐的方式是？', options: ['使用 transform 和 opacity（合成层）', '频繁修改 top/left', '用 JS 操作样式循环', '使用 setTimeout 驱动'], answer: 0, explain: 'transform/opacity 走合成器线程不触发重排，配合 will-change 是最佳动画方案。' },

  // ==================== 全栈 ====================
  { id: 'iv-fs-1', cat: 'fullstack', type: 'single', level: 2, hot: true, tags: ['实战题'], q: 'JWT 认证机制的特点是？', options: ['无状态，服务端不保存会话', '必须依赖服务端 Session', '每次请求都要查数据库验证', 'Token 无法设置过期时间'], answer: 0, explain: 'JWT 自包含签名信息，服务端无状态校验；可设过期时间，无需服务端存储会话。' },
  { id: 'iv-fs-2', cat: 'fullstack', type: 'multi', level: 3, hot: false, tags: ['实战题'], q: '设计前端监控体系通常需要覆盖哪些维度？', options: ['JS 错误与未捕获异常上报', '接口请求成功率与耗时', '页面性能指标（FP/FCP/LCP）', '用户行为与 PV/UV 统计'], answer: [0, 1, 2, 3], explain: '前端监控 = 错误监控 + 接口监控 + 性能监控 + 行为统计，四者缺一不可。' },
  { id: 'iv-fs-3', cat: 'fullstack', type: 'judge', level: 2, hot: false, tags: ['高频追问'], q: '前端工程化中，CI/CD 的核心价值是自动化构建、测试与部署，保障交付质量与效率。', options: ['正确', '错误'], answer: true, explain: 'CI/CD 实现代码提交后自动 lint、测试、构建、部署，是工程化质量保障的关键环节。' }
]
