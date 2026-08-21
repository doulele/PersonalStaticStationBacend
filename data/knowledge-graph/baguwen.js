/**
 * 八股文专项 分类 - 知识点与题目（高频面试八股，跨分类）
 */
export const nodes = [
  {
    id: 'bgw-js', cat: 'baguwen', name: 'JS 高频八股', level: 2, sort: 1, deps: [],
    content: '## JS 高频八股\n\n面试最常考的 JavaScript 基础与核心机制，涵盖闭包、原型、this、异步、Event Loop 等。\n\n### 复习重点\n- 闭包与作用域链\n- 原型与继承\n- this 绑定规则\n- Promise 与 async/await\n- 事件循环宏任务微任务\n\n### 备考建议\n- 能口述 + 手写核心代码\n- 理解底层原理而非死记'
  },
  {
    id: 'bgw-css', cat: 'baguwen', name: 'CSS 高频八股', level: 1, sort: 2, deps: [],
    content: '## CSS 高频八股\n\nCSS 布局与渲染机制的高频考点。\n\n### 复习重点\n- 盒模型与 box-sizing\n- Flex/Grid 布局\n- BFC 与浮动\n- 选择器优先级\n- 垂直水平居中\n- 重排重绘\n\n### 备考建议\n- 手写常见布局\n- 理解 BFC 触发与作用'
  },
  {
    id: 'bgw-html', cat: 'baguwen', name: 'HTML 高频八股', level: 1, sort: 3, deps: [],
    content: '## HTML 高频八股\n\nHTML 语义化、存储、性能相关考点。\n\n### 复习重点\n- 语义化标签\n- localStorage/sessionStorage/Cookie 区别\n- 行内/块级元素\n- meta 标签作用\n- script 的 defer/async\n\n### 备考建议\n- 对比记忆存储方案\n- 理解标签语义'
  },
  {
    id: 'bgw-network', cat: 'baguwen', name: '网络高频八股', level: 2, sort: 4, deps: [],
    content: '## 网络高频八股\n\n网络与浏览器相关高频考点。\n\n### 复习重点\n- 从输入 URL 到页面渲染\n- HTTP/HTTPS 与三次握手\n- 缓存策略（强缓存/协商缓存）\n- 跨域与 CORS\n- XSS/CSRF 安全\n\n### 备考建议\n- 画流程图口述\n- 对比记忆缓存字段'
  },
  {
    id: 'bgw-vue', cat: 'baguwen', name: 'Vue 高频八股', level: 2, sort: 5, deps: [],
    content: '## Vue 高频八股\n\nVue 框架高频面试题。\n\n### 复习重点\n- 响应式原理（defineProperty vs Proxy）\n- 生命周期\n- computed/watch 区别\n- 组件通信\n- diff 与 key\n- nextTick\n\n### 备考建议\n- 结合源码理解响应式\n- 手写关键机制'
  },
  {
    id: 'bgw-react', cat: 'baguwen', name: 'React 高频八股', level: 2, sort: 6, deps: [],
    content: '## React 高频八股\n\nReact 框架高频面试题。\n\n### 复习重点\n- 虚拟 DOM 与 diff\n- Hooks 使用规则\n- useState/useEffect/useMemo/useCallback\n- Fiber 架构\n- 性能优化（memo 等）\n\n### 备考建议\n- 理解 Hooks 底层\n- 对比 Vue 差异'
  },
  {
    id: 'bgw-engineering', cat: 'baguwen', name: '工程化高频八股', level: 2, sort: 7, deps: [],
    content: '## 工程化高频八股\n\n构建工具与工程化高频考点。\n\n### 复习重点\n- Webpack 与 Vite 区别\n- Loader 与 Plugin\n- Tree Shaking\n- 模块规范（ESM/CJS）\n- 性能优化\n\n### 备考建议\n- 理解构建原理\n- 对比记忆工具差异'
  },
  {
    id: 'bgw-ts', cat: 'baguwen', name: 'TS 高频八股', level: 2, sort: 8, deps: [],
    content: '## TypeScript 高频八股\n\nTypeScript 高频面试题。\n\n### 复习重点\n- interface 与 type 区别\n- 泛型与约束\n- 类型收窄\n- 工具类型（Partial/Pick/Omit）\n- any/unknown/never\n\n### 备考建议\n- 掌握常用工具类型\n- 理解类型推断'
  }
]

export const questions = [
  { id: 'q-bgw-1', cat: 'baguwen', node: 'bgw-js', type: 'single', level: 2, tags: ['八股文'], q: '请说明 JS 中 "1" + 2 的结果是？', options: ['3', '"12"', 'NaN', '报错'], answer: 1, explain: '字符串与数字相加会隐式转换为字符串拼接。' },
  { id: 'q-bgw-2', cat: 'baguwen', node: 'bgw-js', type: 'single', level: 2, tags: ['八股文'], q: '判断数组最准确的方法是？', options: ['typeof', 'instanceof Array', 'Object.prototype.toString.call', 'isNaN'], answer: 2, explain: 'toString.call 返回 [object Array]，最准确。' },
  { id: 'q-bgw-3', cat: 'baguwen', node: 'bgw-js', type: 'multi', level: 2, tags: ['八股文'], q: '实现深拷贝的方式有？', options: ['JSON.parse(JSON.stringify())', '递归遍历', 'structuredClone', '直接赋值'], answer: [0, 1, 2], explain: '直接赋值是浅拷贝，JSON 法有函数/循环引用局限。' },
  { id: 'q-bgw-4', cat: 'baguwen', node: 'bgw-js', type: 'single', level: 3, tags: ['八股文', '框架原理'], q: '闭包会导致的问题主要是？', options: ['内存泄漏风险', '变量提升', '语法错误', '类型错误'], answer: 0, explain: '闭包持有外部引用，可能造成内存泄漏。' },
  { id: 'q-bgw-5', cat: 'baguwen', node: 'bgw-css', type: 'single', level: 1, tags: ['八股文'], q: '实现元素水平垂直居中，flex 布局用？', options: ['justify-content + align-items 都 center', '只 margin', '只 padding', 'float'], answer: 0, explain: 'flex 容器 justify-content 和 align-items 居中。' },
  { id: 'q-bgw-6', cat: 'baguwen', node: 'bgw-css', type: 'single', level: 1, tags: ['八股文'], q: '清除浮动最常用的方法是？', options: ['clearfix', '加边框', '改字体', '删内容'], answer: 0, explain: 'clearfix 或触发 BFC 清除浮动。' },
  { id: 'q-bgw-7', cat: 'baguwen', node: 'bgw-css', type: 'multi', level: 2, tags: ['八股文'], q: '实现两栏布局（左固定右自适应）的方式？', options: ['flex', 'float + margin', 'grid', '绝对定位'], answer: [0, 1, 2, 3], explain: '以上方式均可实现两栏布局。' },
  { id: 'q-bgw-8', cat: 'baguwen', node: 'bgw-css', type: 'single', level: 2, tags: ['八股文'], q: '解决 1px 边框在移动端变粗，常用方案是？', options: ['transform 缩放', '增加宽度', '改颜色', '用图片'], answer: 0, explain: 'transform: scale 配合伪元素实现 0.5px 效果。' },
  { id: 'q-bgw-9', cat: 'baguwen', node: 'bgw-html', type: 'single', level: 1, tags: ['八股文'], q: 'localStorage 与 sessionStorage 的区别是？', options: ['生命周期不同', '容量不同', '作用域不同', '格式不同'], answer: 0, explain: 'sessionStorage 标签关闭即清，localStorage 持久。' },
  { id: 'q-bgw-10', cat: 'baguwen', node: 'bgw-html', type: 'multi', level: 1, tags: ['八股文'], q: '行内元素与块级元素的区别？', options: ['块级独占一行', '行内不换行', '行内可设宽高', '块级可设宽高'], answer: [0, 1, 3], explain: '行内元素宽高不生效（替换元素除外）。' },
  { id: 'q-bgw-11', cat: 'baguwen', node: 'bgw-html', type: 'single', level: 1, tags: ['八股文'], q: 'defer 与 async 的区别是？', options: ['defer 顺序执行', 'async 顺序执行', '无区别', 'defer 立即执行'], answer: 0, explain: 'defer 按顺序在解析后执行，async 加载完立即执行。' },
  { id: 'q-bgw-12', cat: 'baguwen', node: 'bgw-html', type: 'judge', level: 1, tags: ['八股文'], q: 'Cookie 每次请求都会携带到服务器。', options: ['正确', '错误'], answer: true, explain: 'Cookie 随同源请求自动发送，Storage 不会。' },
  { id: 'q-bgw-13', cat: 'baguwen', node: 'bgw-network', type: 'single', level: 2, tags: ['八股文'], q: 'HTTPS 加密使用的协议是？', options: ['TLS/SSL', 'DNS', 'TCP', 'UDP'], answer: 0, explain: 'HTTPS 在 HTTP 基础上加 TLS/SSL 加密。' },
  { id: 'q-bgw-14', cat: 'baguwen', node: 'bgw-network', type: 'multi', level: 2, tags: ['八股文'], q: '强缓存的响应头有？', options: ['Cache-Control', 'Expires', 'ETag', 'Last-Modified'], answer: [0, 1], explain: 'Cache-Control/Expires 是强缓存，ETag/Last-Modified 是协商。' },
  { id: 'q-bgw-15', cat: 'baguwen', node: 'bgw-network', type: 'single', level: 2, tags: ['八股文'], q: '协商缓存命中返回的状态码是？', options: ['304', '200', '301', '404'], answer: 0, explain: '协商缓存命中返回 304 Not Modified。' },
  { id: 'q-bgw-16', cat: 'baguwen', node: 'bgw-network', type: 'multi', level: 2, tags: ['八股文'], q: '常见的 Web 攻击有？', options: ['XSS', 'CSRF', 'SQL 注入', '图片懒加载'], answer: [0, 1, 2], explain: '图片懒加载是优化手段，不是攻击。' },
  { id: 'q-bgw-17', cat: 'baguwen', node: 'bgw-vue', type: 'single', level: 2, tags: ['八股文', '框架原理'], q: 'Vue 的 keep-alive 作用是什么？', options: ['缓存组件状态', '加速网络', '压缩代码', '优化图片'], answer: 0, explain: 'keep-alive 缓存组件实例，切换不销毁。' },
  { id: 'q-bgw-18', cat: 'baguwen', node: 'bgw-vue', type: 'single', level: 2, tags: ['八股文'], q: 'v-if 与 v-show 的区别是？', options: ['v-if 条件渲染销毁重建', '两者相同', 'v-show 不渲染', 'v-if 始终渲染'], answer: 0, explain: 'v-if 条件切换销毁/重建，v-show 只是 display 切换。' },
  { id: 'q-bgw-19', cat: 'baguwen', node: 'bgw-vue', type: 'multi', level: 2, tags: ['八股文'], q: 'Vue 组件通信方式有？', options: ['props/emits', 'provide/inject', 'Pinia', '事件总线'], answer: [0, 1, 2, 3], explain: '以上都是 Vue 组件通信方式。' },
  { id: 'q-bgw-20', cat: 'baguwen', node: 'bgw-vue', type: 'single', level: 3, tags: ['八股文', '框架原理'], q: 'Vue2 响应式无法监听数组索引变化的原因是？', options: ['defineProperty 局限', 'Proxy 缺陷', '浏览器限制', '性能问题'], answer: 0, explain: 'defineProperty 无法监听数组索引与新增属性。' },
  { id: 'q-bgw-21', cat: 'baguwen', node: 'bgw-react', type: 'single', level: 2, tags: ['八股文'], q: 'React 中 key 的作用是？', options: ['diff 复用标识', '样式标识', '事件标识', '路由标识'], answer: 0, explain: 'key 用于 diff 判断节点复用。' },
  { id: 'q-bgw-22', cat: 'baguwen', node: 'bgw-react', type: 'single', level: 2, tags: ['八股文'], q: 'setState 是同步还是异步？', options: ['可能是异步（批处理）', '总是同步', '总是异步', '无规律'], answer: 0, explain: 'React 事件中批处理异步，原生事件/定时器可能同步。' },
  { id: 'q-bgw-23', cat: 'baguwen', node: 'bgw-react', type: 'multi', level: 2, tags: ['八股文'], q: 'React 性能优化手段有？', options: ['React.memo', 'useMemo', 'useCallback', '虚拟列表'], answer: [0, 1, 2, 3], explain: '以上都是 React 优化手段。' },
  { id: 'q-bgw-24', cat: 'baguwen', node: 'bgw-react', type: 'single', level: 3, tags: ['八股文', '框架原理'], q: 'React 类组件与函数组件的主要区别？', options: ['函数组件用 Hooks', '类组件无生命周期', '函数组件无状态', '无区别'], answer: 0, explain: '函数组件通过 Hooks 获得状态与副作用能力。' },
  { id: 'q-bgw-25', cat: 'baguwen', node: 'bgw-engineering', type: 'single', level: 2, tags: ['八股文'], q: 'Webpack 与 Vite 的核心区别？', options: ['打包 vs 按需编译', '语言不同', '平台不同', '无区别'], answer: 0, explain: 'Webpack 全量打包，Vite 开发按需编译。' },
  { id: 'q-bgw-26', cat: 'baguwen', node: 'bgw-engineering', type: 'multi', level: 2, tags: ['八股文'], q: '前端性能优化维度有？', options: ['资源体积', '加载速度', '渲染性能', '网络请求'], answer: [0, 1, 2, 3], explain: '性能优化覆盖资源/加载/渲染/网络多维度。' },
  { id: 'q-bgw-27', cat: 'baguwen', node: 'bgw-engineering', type: 'single', level: 2, tags: ['八股文'], q: 'ESM 与 CommonJS 的关键区别？', options: ['静态 vs 动态', '同步 vs 异步', '都支持树摇', '语法相同'], answer: 0, explain: 'ESM 静态可树摇，CJS 动态运行时解析。' },
  { id: 'q-bgw-28', cat: 'baguwen', node: 'bgw-engineering', type: 'single', level: 2, tags: ['八股文'], q: '代码分割（Code Splitting）的目的是？', options: ['减小首屏加载', '增加功能', '提升 SEO', '美化代码'], answer: 0, explain: '代码分割按需加载，减小首屏体积。' },
  { id: 'q-bgw-29', cat: 'baguwen', node: 'bgw-ts', type: 'single', level: 2, tags: ['八股文'], q: 'interface 与 type 都能做什么？', options: ['描述对象结构', '只有 interface 能', '只有 type 能', '都不能'], answer: 0, explain: '两者都可描述对象结构，但 type 更灵活（联合等）。' },
  { id: 'q-bgw-30', cat: 'baguwen', node: 'bgw-ts', type: 'single', level: 2, tags: ['八股文'], q: 'Partial<T> 的作用是？', options: ['全部属性可选', '全部必填', '选取部分', '排除部分'], answer: 0, explain: 'Partial 将类型所有属性变为可选。' },
  { id: 'q-bgw-31', cat: 'baguwen', node: 'bgw-ts', type: 'multi', level: 2, tags: ['八股文'], q: 'unknown 与 any 的区别？', options: ['unknown 更安全', 'unknown 需收窄', 'any 跳过检查', '完全相同'], answer: [0, 1, 2], explain: 'unknown 安全需收窄，any 关闭检查。' },
  { id: 'q-bgw-32', cat: 'baguwen', node: 'bgw-ts', type: 'judge', level: 2, tags: ['八股文'], q: '泛型约束使用 extends 关键字。', options: ['正确', '错误'], answer: true, explain: '泛型用 extends 约束类型范围。' }
]
