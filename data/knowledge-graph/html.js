/**
 * HTML 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'html-semantic', cat: 'html', name: '语义化标签', level: 1, sort: 1, deps: [],
    content: '## 语义化标签\n\n用有明确含义的标签描述内容结构，而非只用 div 堆砌。\n\n### 常用语义标签\n- **header/footer**：页头/页脚\n- **nav**：导航区域\n- **main**：页面主体（每页唯一）\n- **section**：主题分组（通常带标题）\n- **article**：独立成篇内容\n- **aside**：侧边栏/补充内容\n- **figure + figcaption**：图文组合\n\n### 好处\n1. SEO 友好，搜索引擎能识别结构\n2. 无障碍：屏幕阅读器准确播报\n3. 代码可读性、可维护性更高\n\n### 注意\n- 标题层级 h1-h6 不要跳级\n- 纯装饰内容不要滥用语义标签'
  },
  {
    id: 'html-form', cat: 'html', name: '表单与验证', level: 1, sort: 2, deps: ['html-semantic'],
    content: '## 表单与验证\n\n表单负责收集用户输入，浏览器原生提供基础验证。\n\n### 常用元素\n- **input**：text/password/email/number/date/file/radio/checkbox\n- **select + option**：下拉选择\n- **textarea**：多行文本\n- **label**：关联控件，提升可点击区域与无障碍\n\n### 原生验证属性\n- `required` 必填\n- `pattern` 正则校验\n- `minlength/maxlength` 长度\n- `min/max/step` 数值范围\n- `type="email"` 邮箱格式\n\n### 关键点\n- 服务端必须再次校验（前端校验可被绕过）\n- label 的 for 与控件 id 关联\n- novalidate 可关闭原生校验'
  },
  {
    id: 'html-seo', cat: 'html', name: 'SEO 基础', level: 1, sort: 3, deps: ['html-semantic'],
    content: '## SEO 基础\n\n搜索引擎优化：让页面更容易被理解与收录。\n\n### 核心手段\n- **title / meta description**：标题与描述\n- **语义化标签**：清晰文档大纲\n- **alt 属性**：图片替代文本\n- **OG 标签**：社交分享预览\n- **结构化数据**：JSON-LD（Article/FAQ）\n- **移动端适配**：viewport meta\n\n### 注意\n- SPA SEO 弱，需 SSR/SSG/预渲染\n- robots.txt 控制抓取，sitemap.xml 帮助收录\n- canonical 避免重复收录'
  },
  {
    id: 'html-attributes', cat: 'html', name: '属性与全局属性', level: 1, sort: 4, deps: ['html-semantic'],
    content: '## 属性与全局属性\n\n### 常用全局属性\n- **id**：唯一标识\n- **class**：样式类\n- **data-\\***：自定义数据\n- **title**：悬停提示\n- **hidden**：隐藏元素\n- **lang**：语言标识（SEO/无障碍重要）\n- **tabindex**：键盘 Tab 顺序\n\n### 布尔属性\n- disabled、checked、required、readonly、selected：存在即生效\n- disabled 不提交值，readonly 会提交值'
  },
  {
    id: 'html-canvas-svg', cat: 'html', name: 'Canvas 与 SVG', level: 2, sort: 5, deps: [],
    content: '## Canvas 与 SVG\n\n### Canvas（位图，脚本绘制）\n- 基于像素，通过 JS API 绘制（getContext("2d")）\n- 适合：游戏、大数据图表、图像处理\n- 放大模糊，单个元素不可绑定事件\n\n### SVG（矢量，DOM 节点）\n- 基于 XML，图形是 DOM 一部分\n- 适合：图标、Logo、清晰度要求高的场景\n- 可 CSS 控制、可绑定事件、放大不失真\n\n### 对比\n| 维度 | Canvas | SVG |\n|---|---|---|\n| 渲染 | 像素位图 | 矢量 DOM |\n| 大量节点性能 | 优 | 劣 |\n| 交互事件 | 手动命中检测 | 原生支持 |'
  },
  {
    id: 'html-media', cat: 'html', name: '多媒体与音视频', level: 2, sort: 6, deps: [],
    content: '## 多媒体与音视频\n\nHTML5 原生支持音视频播放。\n\n### 基本用法\n```html\n<video controls poster="cover.jpg">\n  <source src="movie.mp4" type="video/mp4">\n  您的浏览器不支持 video 标签\n</video>\n```\n\n### 常用属性\n- controls 控制条、autoplay 自动播放、loop 循环、muted 静音、preload 预加载\n\n### 关键点\n- 多 source 提供格式兼容（mp4/webm）\n- 带声音 autoplay 多数浏览器禁止，需交互后播放\n- HLS(m3u8) PC 需 MSE 支持（如 hls.js）'
  },
  {
    id: 'html-a11y', cat: 'html', name: '无障碍设计', level: 2, sort: 7, deps: ['html-semantic'],
    content: '## 无障碍设计（A11y）\n\n让所有用户（含残障人士）都能使用 Web 产品。\n\n### 核心手段\n- 语义化标签：正确结构\n- ARIA 属性：role、aria-label、aria-hidden、aria-expanded\n- 键盘可达性：Tab 顺序、焦点样式\n- 对比度 ≥ 4.5:1（WCAG AA）\n- alt 文本、label 关联表单\n\n### 原则\n- 优先原生语义，ARIA 只"告知"不能"改变"行为\n- 不要移除 outline 而不提供替代\n- 动态内容用 aria-live 播报'
  },
  {
    id: 'html-webcomponents', cat: 'html', name: 'Web Components', level: 3, sort: 8, deps: ['html-semantic'],
    content: '## Web Components\n\n一组原生 API，用于创建可复用自定义元素。\n\n### 三大核心 API\n- **Custom Elements**：customElements.define 定义自定义元素\n- **Shadow DOM**：attachShadow 实现样式与 DOM 隔离\n- **HTML Templates**：template 惰性渲染片段\n\n### 生命周期\n- connectedCallback：挂载时\n- disconnectedCallback：移除时\n- attributeChangedCallback：observedAttributes 变化时\n\n### 应用场景\n- 跨框架复用组件、设计系统、微前端组件共享\n- 注意：Shadow DOM 样式隔离是双刃剑'
  },
  {
    id: 'html-storage', cat: 'html', name: '拖拽与存储', level: 2, sort: 9, deps: [],
    content: '## 拖拽与 Web 存储\n\n### 原生拖拽 API\n- draggable="true" 使元素可拖\n- 事件：dragstart/dragover/drop\n- dragover 必须 preventDefault 才能触发 drop\n\n### Web Storage\n- **localStorage**：永久存储，约 5MB，同源共享\n- **sessionStorage**：会话级，标签页关闭即清\n- 均存字符串，对象需 JSON 序列化\n\n### 与 Cookie 区别\n- Cookie 每次请求都携带（4KB），Storage 不随请求发送\n- Cookie 可设置过期时间与 HttpOnly'
  }
]

export const questions = [
  { id: 'q-html-1', cat: 'html', node: 'html-semantic', type: 'single', level: 1, tags: ['八股文'], q: '以下哪个标签用于定义页面导航区域？', options: ['<section>', '<nav>', '<aside>', '<main>'], answer: 1, explain: '<nav> 专门定义导航链接区域。<section> 是主题分组，<aside> 侧边补充，<main> 页面主体。' },
  { id: 'q-html-2', cat: 'html', node: 'html-semantic', type: 'multi', level: 1, tags: ['八股文'], q: '语义化标签带来的好处包括哪些？', options: ['提升 SEO 收录', '改善无障碍体验', '代码更可读', '必然提升加载速度'], answer: [0, 1, 2], explain: '语义化利于 SEO、无障碍与可读性；与加载速度无必然关系。' },
  { id: 'q-html-3', cat: 'html', node: 'html-semantic', type: 'judge', level: 1, tags: ['八股文'], q: '<main> 标签在同一个页面中应该只出现一次。', options: ['正确', '错误'], answer: true, explain: 'W3C 规范建议 <main> 每页唯一，代表页面主体。' },
  { id: 'q-html-4', cat: 'html', node: 'html-form', type: 'single', level: 1, tags: ['八股文'], q: '下列哪个 input 属性可启用 HTML5 原生邮箱格式校验？', options: ['type="text"', 'type="email"', 'type="url"', 'type="password"'], answer: 1, explain: 'type="email" 让浏览器提交时自动校验邮箱格式。' },
  { id: 'q-html-5', cat: 'html', node: 'html-form', type: 'single', level: 1, tags: ['八股文'], q: 'label 标签的 for 属性应与哪个属性值对应？', options: ['控件的 name', '控件的 id', '控件的 class', '控件的 value'], answer: 1, explain: 'for 与目标控件 id 对应，点击 label 即激活控件。' },
  { id: 'q-html-6', cat: 'html', node: 'html-form', type: 'multi', level: 1, tags: ['八股文', '场景题'], q: '关于表单验证，正确的是？', options: ['前端验证可被绕过，服务端必须再校验', 'required 表示必填', 'pattern 支持正则校验', 'novalidate 后仍执行前端验证'], answer: [0, 1, 2], explain: '前端验证只是体验优化；novalidate 关闭原生校验，故 D 错误。' },
  { id: 'q-html-7', cat: 'html', node: 'html-seo', type: 'single', level: 1, tags: ['八股文'], q: '对 SPA 的 SEO 提升最有效的措施是？', options: ['增加 div', '使用 SSR/SSG', '删除 meta', '增大图片'], answer: 1, explain: 'SPA 内容由 JS 动态渲染难被抓取，SSR/SSG 预渲染成静态 HTML。' },
  { id: 'q-html-8', cat: 'html', node: 'html-seo', type: 'judge', level: 1, tags: ['八股文'], q: '图片的 alt 属性对 SEO 没有作用。', options: ['正确', '错误'], answer: false, explain: 'alt 是图片内容的重要信号，利于无障碍与图片 SEO。' },
  { id: 'q-html-9', cat: 'html', node: 'html-seo', type: 'single', level: 2, tags: ['八股文'], q: '防止重复内容被收录的规范标签是？', options: ['rel="canonical"', 'rel="preload"', 'name="robots"', 'charset'], answer: 0, explain: 'rel="canonical" 声明权威 URL，避免重复内容多次收录。' },
  { id: 'q-html-10', cat: 'html', node: 'html-attributes', type: 'single', level: 1, tags: ['八股文'], q: '关于 disabled 与 readonly，正确的是？', options: ['两者完全相同', 'disabled 值仍会提交', 'readonly 值会提交', 'readonly 只对 select 生效'], answer: 2, explain: 'disabled 不可交互且不提交；readonly 只读但值会提交。' },
  { id: 'q-html-11', cat: 'html', node: 'html-attributes', type: 'multi', level: 1, tags: ['八股文'], q: '属于 HTML 全局属性的是？', options: ['id', 'class', 'data-*', 'href'], answer: [0, 1, 2], explain: 'href 是 a/link 特定标签属性，非全局属性。' },
  { id: 'q-html-12', cat: 'html', node: 'html-attributes', type: 'single', level: 2, tags: ['八股文'], q: '用于自定义数据存储且不污染样式语义的属性是？', options: ['data-*', 'title', 'rel', 'name'], answer: 0, explain: 'data-* 用于自定义数据，可通过 dataset 读取，是最佳实践。' },
  { id: 'q-html-13', cat: 'html', node: 'html-canvas-svg', type: 'single', level: 2, tags: ['八股文'], q: '需要大量节点且高频重绘的实时图表，更适合用？', options: ['SVG', 'Canvas', 'CSS 动画', 'GIF'], answer: 1, explain: 'Canvas 基于像素渲染，大量节点高频重绘性能优于 SVG。' },
  { id: 'q-html-14', cat: 'html', node: 'html-canvas-svg', type: 'multi', level: 2, tags: ['八股文'], q: '关于 Canvas 与 SVG，正确的是？', options: ['SVG 放大不失真', 'Canvas 适合像素级操作', 'SVG 节点可绑定事件', 'Canvas 单元素可直接绑定事件'], answer: [0, 1, 2], explain: 'Canvas 是位图，单个图形无法直接绑定事件，需坐标命中检测。' },
  { id: 'q-html-15', cat: 'html', node: 'html-canvas-svg', type: 'judge', level: 2, tags: ['八股文'], q: 'SVG 图形是 DOM 的一部分，可以用 CSS 控制样式。', options: ['正确', '错误'], answer: true, explain: 'SVG 是矢量 DOM，可被 CSS 样式化与事件绑定。' },
  { id: 'q-html-16', cat: 'html', node: 'html-media', type: 'single', level: 1, tags: ['八股文'], q: '移动端要自动播放带声音的视频，通常需要？', options: ['设置 loop', '设置 muted', '设置 controls', '设置 preload'], answer: 1, explain: '多数浏览器禁止带声音 autoplay，需 muted 静音或用户交互后播放。' },
  { id: 'q-html-17', cat: 'html', node: 'html-media', type: 'multi', level: 2, tags: ['场景题'], q: '关于音视频标签，正确的是？', options: ['多 source 提供格式兼容', 'controls 显示控制条', 'HLS 在 PC 端常用 hls.js 支持', 'autoplay 所有浏览器都支持'], answer: [0, 1, 2], explain: 'autoplay 受自动播放策略限制，并非所有浏览器无条件支持。' },
  { id: 'q-html-18', cat: 'html', node: 'html-media', type: 'judge', level: 1, tags: ['八股文'], q: 'video 标签的 preload 属性可控制预加载策略。', options: ['正确', '错误'], answer: true, explain: 'preload 取值 auto/metadata/none 控制预加载程度。' },
  { id: 'q-html-19', cat: 'html', node: 'html-a11y', type: 'single', level: 2, tags: ['八股文'], q: 'WCAG AA 要求的文本与背景最低对比度是？', options: ['2:1', '3:1', '4.5:1', '7:1'], answer: 2, explain: 'WCAG AA 标准正文对比度不低于 4.5:1。' },
  { id: 'q-html-20', cat: 'html', node: 'html-a11y', type: 'multi', level: 2, tags: ['八股文'], q: '提升无障碍的正确做法有？', options: ['label 关联表单控件', '图片提供 alt', '移除 outline 无替代', '动态内容 aria-live 播报'], answer: [0, 1, 3], explain: '移除 outline 而不提供替代会破坏键盘可达性，是错误的。' },
  { id: 'q-html-21', cat: 'html', node: 'html-a11y', type: 'judge', level: 2, tags: ['八股文'], q: 'ARIA 属性可以改变元素的交互行为。', options: ['正确', '错误'], answer: false, explain: 'ARIA 只"告知"辅助技术，不改变原生交互行为。' },
  { id: 'q-html-22', cat: 'html', node: 'html-webcomponents', type: 'single', level: 3, tags: ['八股文'], q: 'Web Components 实现样式与 DOM 隔离的 API 是？', options: ['Custom Elements', 'Shadow DOM', 'HTML Templates', 'Service Worker'], answer: 1, explain: 'Shadow DOM 通过 attachShadow 实现样式与 DOM 的隔离。' },
  { id: 'q-html-23', cat: 'html', node: 'html-webcomponents', type: 'multi', level: 3, tags: ['八股文'], q: 'Web Components 三大核心 API 是？', options: ['Custom Elements', 'Shadow DOM', 'HTML Templates', 'WebSocket'], answer: [0, 1, 2], explain: 'WebSocket 是通信协议，不属于 Web Components。' },
  { id: 'q-html-24', cat: 'html', node: 'html-webcomponents', type: 'judge', level: 3, tags: ['八股文'], q: 'Shadow DOM 内的样式无法被外部 CSS 轻易穿透。', options: ['正确', '错误'], answer: true, explain: 'Shadow DOM 提供样式封装隔离，外部样式难以穿透（::part 等除外）。' },
  { id: 'q-html-25', cat: 'html', node: 'html-storage', type: 'single', level: 2, tags: ['八股文'], q: '标签页关闭后即被清除的存储是？', options: ['localStorage', 'sessionStorage', 'Cookie', 'IndexedDB'], answer: 1, explain: 'sessionStorage 会话级存储，标签页关闭即清。' },
  { id: 'q-html-26', cat: 'html', node: 'html-storage', type: 'multi', level: 2, tags: ['八股文'], q: 'localStorage 与 Cookie 的区别有？', options: ['localStorage 不随请求发送', 'Cookie 有 4KB 限制', 'localStorage 容量更大', 'localStorage 可设 HttpOnly'], answer: [0, 1, 2], explain: 'HttpOnly 是 Cookie 的特性，localStorage 无此概念且可被 JS 读取。' },
  { id: 'q-html-27', cat: 'html', node: 'html-storage', type: 'judge', level: 2, tags: ['八股文'], q: '拖拽时必须在 dragover 事件中 preventDefault 才能触发 drop。', options: ['正确', '错误'], answer: true, explain: 'dragover 默认禁止 drop，需 preventDefault 解除。' }
]
