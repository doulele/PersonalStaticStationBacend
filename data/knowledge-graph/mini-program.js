/**
 * 跨端与小程序 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'mp-lifecycle', cat: 'mini-program', name: '小程序生命周期', level: 1, sort: 1, deps: [],
    content: '## 小程序生命周期\n\n### 应用生命周期\n- onLaunch：初始化\n- onShow：前台显示\n- onHide：后台隐藏\n\n### 页面生命周期\n- onLoad：页面加载（一次）\n- onShow：页面显示\n- onReady：初次渲染完成\n- onHide / onUnload：隐藏/卸载\n\n### 组件生命周期\n- created / attached / ready / detached\n\n### 注意\n- onLoad 只执行一次，onShow 每次显示都执行\n- 页面参数在 onLoad 的 options 获取'
  },
  {
    id: 'mp-architecture', cat: 'mini-program', name: '双线程模型', level: 2, sort: 2, deps: ['mp-lifecycle'],
    content: '## 双线程模型\n\n### 架构\n- **逻辑层**：运行 JS（AppService）\n- **渲染层**：WebView 渲染（View 层）\n- 两层通过微信客户端（Native）中转通信\n\n### 特点\n- JS 无法直接操作 DOM\n- 数据通过 setData 从逻辑层传到渲染层\n- 通信是异步、序列化的\n\n### 影响\n- 不能像 H5 一样操作 DOM\n- setData 频繁会有性能开销\n- 逻辑与视图隔离，安全性更好\n\n### 对比\n- H5：单线程，JS 可直接操作 DOM\n- 小程序：双线程，需 setData 中转'
  },
  {
    id: 'mp-setdata', cat: 'mini-program', name: 'setData 原理', level: 2, sort: 3, deps: ['mp-architecture'],
    content: "## setData 原理\n\nsetData 将数据从逻辑层同步到渲染层。\n\n### 过程\n1. 逻辑层调用 setData\n2. 数据序列化传输到 Native\n3. Native 转发到渲染层 WebView\n4. 视图更新\n\n### 优化\n- 只传变化的数据（不要整个大对象）\n- 避免频繁调用（合并更新）\n- 减少一次 setData 的数据量\n- 用局部路径更新：this.setData({ 'a.b': 1 })\n\n### 限制\n- 单次传输有大小限制（约 1MB）\n- 数据不宜过大\n- 不要在循环中频繁 setData"
  },
  {
    id: 'mp-uniapp', cat: 'mini-program', name: 'UniApp', level: 2, sort: 4, deps: [],
    content: '## UniApp\n\n基于 Vue 的跨端开发框架，一套代码多端运行。\n\n### 特点\n- 语法接近 Vue（组件、指令）\n- 编译到微信/支付宝等多平台小程序、H5、App\n- 条件编译处理平台差异\n\n### 条件编译\n```js\n// #ifdef MP-WEIXIN\n// 微信专属代码\n// #endif\n```\n\n### 优势\n- 学习成本低（Vue 语法）\n- 生态丰富（uni-ui 等）\n- 支持 H5 与 App\n\n### 局限\n- 跨端仍有兼容差异\n- 底层能力依赖各平台'
  },
  {
    id: 'mp-taro', cat: 'mini-program', name: 'Taro', level: 2, sort: 5, deps: [],
    content: '## Taro\n\n京东开源的跨端框架，支持 React/Vue 语法。\n\n### 特点\n- 支持 React/Vue/Svelte 多种语法\n- 编译到小程序、H5、RN 等\n- 支持 Web Components\n\n### 核心\n- 一套代码多端编译\n- 运行时 + 编译时结合\n- 支持 Taro UI 组件库\n\n### 与 UniApp 对比\n- Taro 偏 React 生态\n- UniApp 偏 Vue 生态\n- 都有跨端编译能力\n\n### 优势\n- 多框架语法支持\n- 适合 React 团队'
  },
  {
    id: 'mp-rn', cat: 'mini-program', name: 'React Native', level: 3, sort: 6, deps: [],
    content: '## React Native\n\n用 React 语法开发原生移动应用。\n\n### 架构\n- JS 层 + 原生层（Bridge 通信）\n- 新架构：JSI + Fabric（减少 Bridge 开销）\n\n### 特点\n- 原生组件渲染，非 WebView\n- 热更新能力\n- 一套代码 iOS/Android\n\n### 与 Flutter 区别\n- RN 用 JS/React，Flutter 用 Dart\n- RN 复用原生组件，Flutter 自绘\n\n### 关键点\n- Bridge 通信有性能瓶颈\n- 新架构用 JSI 直接调用原生'
  },
  {
    id: 'mp-flutter', cat: 'mini-program', name: 'Flutter', level: 3, sort: 7, deps: [],
    content: '## Flutter\n\nGoogle 的跨端 UI 框架，用 Dart 语言。\n\n### 特点\n- 自绘引擎（Skia/Impeller），不依赖原生组件\n- 一致的高性能渲染\n- Widget 一切皆组件\n\n### 核心\n- Widget 树（声明式 UI）\n- 状态管理：setState、Provider、Bloc\n- 热重载\n\n### 优势\n- 跨 iOS/Android/Web/Desktop\n- 渲染一致、性能好\n\n### 局限\n- Dart 生态较新\n- 包体积较大\n- 与原生交互需 Platform Channel'
  },
  {
    id: 'mp-perf', cat: 'mini-program', name: '小程序性能优化', level: 2, sort: 8, deps: ['mp-setdata'],
    content: '## 小程序性能优化\n\n### 启动优化\n- 控制包体积、分包加载\n- 减少首屏数据请求\n- 预加载/预渲染\n\n### 渲染优化\n- setData 只传变化数据\n- 合并更新、减少调用\n- 避免频繁 setData 大对象\n\n### 其他\n- 图片懒加载、CDN\n- 长列表用虚拟列表/分段加载\n- 避免 setInterval 泄漏\n\n### 关键\n- setData 是小程序主要性能瓶颈\n- 监控体验评分（小程序后台）'
  }
]

export const questions = [
  { id: 'q-mp-1', cat: 'mini-program', node: 'mp-lifecycle', type: 'single', level: 1, tags: ['八股文'], q: '页面只执行一次、用于初始化的生命周期是？', options: ['onShow', 'onLoad', 'onReady', 'onHide'], answer: 1, explain: 'onLoad 页面加载时执行一次，常用于初始化。' },
  { id: 'q-mp-2', cat: 'mini-program', node: 'mp-lifecycle', type: 'multi', level: 1, tags: ['八股文'], q: '每次页面显示都会执行的生命周期有？', options: ['onShow', 'onLoad', 'onHide', 'onReady'], answer: [0, 2], explain: 'onShow/onHide 在显示隐藏时反复触发。' },
  { id: 'q-mp-3', cat: 'mini-program', node: 'mp-lifecycle', type: 'judge', level: 1, tags: ['八股文'], q: 'onLoad 每次页面显示都会执行。', options: ['正确', '错误'], answer: false, explain: 'onLoad 只执行一次，onShow 每次显示都执行。' },
  { id: 'q-mp-4', cat: 'mini-program', node: 'mp-architecture', type: 'single', level: 2, tags: ['八股文'], q: '小程序逻辑层与渲染层通信靠？', options: ['直接操作 DOM', 'setData 中转', 'WebSocket', 'localStorage'], answer: 1, explain: '双线程通过 setData 经 Native 中转通信。' },
  { id: 'q-mp-5', cat: 'mini-program', node: 'mp-architecture', type: 'multi', level: 2, tags: ['八股文'], q: '小程序双线程模型的特点？', options: ['JS 无法直接操作 DOM', '数据通过 setData 同步', '逻辑与视图隔离', '渲染层跑 JS'], answer: [0, 1, 2], explain: '渲染层是 WebView，逻辑层才是 JS 运行环境。' },
  { id: 'q-mp-6', cat: 'mini-program', node: 'mp-architecture', type: 'judge', level: 2, tags: ['八股文'], q: '小程序可以像 H5 一样用 document 操作 DOM。', options: ['正确', '错误'], answer: false, explain: '小程序双线程隔离，无 document API。' },
  { id: 'q-mp-7', cat: 'mini-program', node: 'mp-setdata', type: 'single', level: 2, tags: ['八股文'], q: 'setData 优化中，推荐的做法是？', options: ['传整个大对象', '只传变化的数据', '循环中频繁调用', '传 base64 图片'], answer: 1, explain: '只传变化数据减少序列化与传输开销。' },
  { id: 'q-mp-8', cat: 'mini-program', node: 'mp-setdata', type: 'multi', level: 2, tags: ['八股文'], q: 'setData 的性能优化点有？', options: ['合并更新', '局部路径更新', '减少调用次数', '增大数据量'], answer: [0, 1, 2], explain: '减小数据量、合并、局部更新才是优化方向。' },
  { id: 'q-mp-9', cat: 'mini-program', node: 'mp-setdata', type: 'judge', level: 2, tags: ['八股文'], q: 'setData 的数据传输是异步序列化的。', options: ['正确', '错误'], answer: true, explain: '数据需序列化跨线程传输，因此是异步的。' },
  { id: 'q-mp-10', cat: 'mini-program', node: 'mp-uniapp', type: 'single', level: 2, tags: ['八股文'], q: 'UniApp 基于的语法是？', options: ['React', 'Vue', 'Angular', 'Svelte'], answer: 1, explain: 'UniApp 使用 Vue 语法开发。' },
  { id: 'q-mp-11', cat: 'mini-program', node: 'mp-uniapp', type: 'multi', level: 2, tags: ['八股文'], q: 'UniApp 可以编译到？', options: ['微信小程序', 'H5', 'App', '浏览器扩展'], answer: [0, 1, 2], explain: 'UniApp 编译到多端小程序、H5、App。' },
  { id: 'q-mp-12', cat: 'mini-program', node: 'mp-uniapp', type: 'judge', level: 2, tags: ['八股文'], q: 'UniApp 条件编译用于处理平台差异代码。', options: ['正确', '错误'], answer: true, explain: '#ifdef/#endif 条件编译隔离平台代码。' },
  { id: 'q-mp-13', cat: 'mini-program', node: 'mp-taro', type: 'single', level: 2, tags: ['八股文'], q: 'Taro 主要面向的语法生态是？', options: ['仅 React', 'React/Vue 多语法', '仅 Vue', 'Dart'], answer: 1, explain: 'Taro 支持 React/Vue/Svelte 等多语法。' },
  { id: 'q-mp-14', cat: 'mini-program', node: 'mp-taro', type: 'judge', level: 2, tags: ['八股文'], q: 'Taro 支持编译到 React Native。', options: ['正确', '错误'], answer: true, explain: 'Taro 支持小程序、H5、RN 等多端。' },
  { id: 'q-mp-15', cat: 'mini-program', node: 'mp-taro', type: 'multi', level: 2, tags: ['八股文'], q: 'Taro 与 UniApp 的共同点？', options: ['跨端编译', '一套代码多端', '支持 H5', '都是京东开源'], answer: [0, 1, 2], explain: '只有 Taro 是京东开源，UniApp 是 DCloud。' },
  { id: 'q-mp-16', cat: 'mini-program', node: 'mp-rn', type: 'single', level: 3, tags: ['八股文'], q: 'React Native 渲染方式是？', options: ['WebView', '原生组件', 'Canvas', '自绘引擎'], answer: 1, explain: 'RN 复用原生组件渲染，非 WebView。' },
  { id: 'q-mp-17', cat: 'mini-program', node: 'mp-rn', type: 'multi', level: 3, tags: ['八股文'], q: 'RN 新架构引入的技术有？', options: ['JSI', 'Fabric', 'TurboModules', 'WebView'], answer: [0, 1, 2], explain: 'JSI/Fabric/TurboModules 是新架构核心，替换 Bridge。' },
  { id: 'q-mp-18', cat: 'mini-program', node: 'mp-rn', type: 'judge', level: 3, tags: ['八股文'], q: 'RN 的 Bridge 通信存在性能瓶颈。', options: ['正确', '错误'], answer: true, explain: 'Bridge 异步序列化有开销，新架构用 JSI 直接调用。' },
  { id: 'q-mp-19', cat: 'mini-program', node: 'mp-flutter', type: 'single', level: 3, tags: ['八股文'], q: 'Flutter 使用的语言是？', options: ['JavaScript', 'Dart', 'Kotlin', 'Swift'], answer: 1, explain: 'Flutter 用 Dart 语言开发。' },
  { id: 'q-mp-20', cat: 'mini-program', node: 'mp-flutter', type: 'multi', level: 3, tags: ['八股文'], q: 'Flutter 的特点有？', options: ['自绘引擎', '声明式 Widget', '热重载', '依赖原生组件'], answer: [0, 1, 2], explain: 'Flutter 自绘，不依赖原生组件渲染。' },
  { id: 'q-mp-21', cat: 'mini-program', node: 'mp-flutter', type: 'judge', level: 3, tags: ['八股文'], q: 'Flutter 渲染一致性好于 RN。', options: ['正确', '错误'], answer: true, explain: '自绘引擎保证跨平台渲染一致性。' },
  { id: 'q-mp-22', cat: 'mini-program', node: 'mp-perf', type: 'single', level: 2, tags: ['八股文'], q: '小程序主要的性能瓶颈通常来自？', options: ['setData 频繁调用', 'CSS 样式', '函数调用', '变量声明'], answer: 0, explain: 'setData 跨线程传输是小程序主要性能开销。' },
  { id: 'q-mp-23', cat: 'mini-program', node: 'mp-perf', type: 'multi', level: 2, tags: ['八股文'], q: '小程序启动优化的手段有？', options: ['分包加载', '减少首屏请求', '预加载', '增大包体积'], answer: [0, 1, 2], explain: '减小包体积、分包、预加载才是优化。' },
  { id: 'q-mp-24', cat: 'mini-program', node: 'mp-perf', type: 'judge', level: 2, tags: ['八股文'], q: '长列表应使用虚拟列表或分段加载优化。', options: ['正确', '错误'], answer: true, explain: '长列表虚拟化减少节点数量提升性能。' },
  { id: 'q-mp-25', cat: 'mini-program', node: 'mp-setdata', type: 'single', level: 2, tags: ['场景题'], q: '更新对象某字段的最优写法是？', options: ['setData({a:{...}})', 'setData({"a.b": 1})', '直接改 this.data', '全量 setData'], answer: 1, explain: '局部路径更新只传变化字段，效率高。' },
  { id: 'q-mp-26', cat: 'mini-program', node: 'mp-uniapp', type: 'single', level: 2, tags: ['场景题'], q: 'UniApp 中处理平台差异用？', options: ['条件编译', 'try/catch', '环境变量', 'JSON 配置'], answer: 0, explain: '条件编译 #ifdef 处理平台差异。' },
  { id: 'q-mp-27', cat: 'mini-program', node: 'mp-flutter', type: 'single', level: 3, tags: ['八股文'], q: 'Flutter 与原生交互使用的机制是？', options: ['Platform Channel', 'Bridge', 'JSI', 'setData'], answer: 0, explain: 'Flutter 通过 Platform Channel 与原生通信。' },
  { id: 'q-mp-28', cat: 'mini-program', node: 'mp-rn', type: 'single', level: 3, tags: ['八股文'], q: 'RN 新架构中直接调用原生能力的机制是？', options: ['JSI', 'WebSocket', 'REST API', 'setData'], answer: 0, explain: 'JSI 让 JS 直接调用原生，减少 Bridge 开销。' }
]
