/**
 * 微前端 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'mf-overview', cat: 'micro-frontend', name: '微前端概述', level: 2, sort: 1, deps: [],
    content: '## 微前端概述\n\n将单体前端拆分为多个可独立开发部署的微应用。\n\n### 核心价值\n- 独立开发、独立部署\n- 技术栈无关（不同团队可用不同框架）\n- 增量升级、避免重构\n\n### 解决的问题\n- 大型项目难以维护\n- 团队协作冲突\n- 发布耦合\n\n### 挑战\n- 应用间通信\n- 样式/JS 隔离\n- 共享依赖\n- 路由协调\n\n### 主框架\n- qiankun、无界（wujie）、Garfish、Module Federation'
  },
  {
    id: 'mf-qiankun', cat: 'micro-frontend', name: 'qiankun', level: 3, sort: 2, deps: ['mf-overview'],
    content: "## qiankun\n\n基于 single-spa 的微前端框架。\n\n### 特点\n- 技术栈无关\n- JS 沙箱（Proxy 实现）\n- 样式隔离\n- 资源预加载\n\n### 应用注册\n```js\nregisterMicroApps([{\n  name: 'app1',\n  entry: '//localhost:8081',\n  container: '#container',\n  activeRule: '/app1'\n}])\nstart()\n```\n\n### 生命周期\n- bootstrap / mount / unmount\n- 子应用需导出对应钩子\n\n### 注意\n- 子应用需配置 webpack 输出 umd\n- 需处理 publicPath"
  },
  {
    id: 'mf-sandbox', cat: 'micro-frontend', name: 'JS 沙箱', level: 3, sort: 3, deps: ['mf-qiankun'],
    content: '## JS 沙箱\n\n隔离微应用间的全局变量污染。\n\n### 方案演进\n1. **快照沙箱**：记录/恢复 window（仅支持单实例）\n2. **Proxy 沙箱**：代理 window，多实例共存\n3. **legacy 沙箱**：兼容旧浏览器\n\n### Proxy 沙箱原理\n- 用 Proxy 代理 window\n- 子应用读写都走代理\n- 每个实例独立 fakeWindow\n\n### 关键\n- 全局变量（window.xxx）被隔离\n- 需处理 addEventListener 的清理\n- 卸载时恢复全局状态'
  },
  {
    id: 'mf-style', cat: 'micro-frontend', name: '样式隔离', level: 3, sort: 4, deps: ['mf-qiankun'],
    content: '## 样式隔离\n\n避免微应用间样式互相污染。\n\n### 方案\n1. **Shadow DOM**：天然隔离\n2. **CSS Modules / CSS-in-JS**：作用域隔离\n3. **前缀命名**：约定式\n4. **动态增删样式表**：qiankun 的 strictStyleIsolation\n\n### qiankun 处理\n- 加载子应用样式到容器\n- 卸载时移除样式\n- scoped css 前缀\n\n### 权衡\n- Shadow DOM 隔离彻底但兼容/弹窗问题\n- 前缀方式轻量但需约定\n\n### 关键\n- 全局样式尽量少\n- 组件库样式冲突需注意'
  },
  {
    id: 'mf-mf', cat: 'micro-frontend', name: 'Module Federation', level: 3, sort: 5, deps: ['mf-overview'],
    content: "## Module Federation（模块联邦）\n\nWebpack 5 提供，运行时共享模块。\n\n### 核心概念\n- **host**：宿主应用\n- **remote**：远程应用\n- **exposes**：暴露的模块\n- **shared**：共享依赖\n\n```js\nnew ModuleFederationPlugin({\n  name: 'app1',\n  filename: 'remoteEntry.js',\n  exposes: { './Button': './src/Button' },\n  shared: { react: { singleton: true } }\n})\n```\n\n### 与 qiankun 区别\n- MF 是模块级共享，qiankun 是应用级\n- MF 加载更细粒度\n\n### 价值\n- 运行时共享，减少重复依赖"
  },
  {
    id: 'mf-wujie', cat: 'micro-frontend', name: '无界（Wujie）', level: 3, sort: 6, deps: ['mf-overview'],
    content: '## 无界（Wujie）\n\n腾讯开源的微前端框架，基于 WebComponent。\n\n### 特点\n- 用 iframe + WebComponent 实现\n- 天然样式隔离（iframe）\n- 支持多实例\n\n### 原理\n- iframe 加载子应用\n- WebComponent 承载渲染\n- 代理 iframe 的 window/document 到主应用\n\n### 优势\n- 隔离彻底、接入成本低\n- 子应用无需改造（iframe 天然隔离）\n\n### 与 qiankun 对比\n- 无界隔离更彻底\n- qiankun 生态更成熟'
  },
  {
    id: 'mf-garfish', cat: 'micro-frontend', name: 'Garfish', level: 3, sort: 7, deps: ['mf-overview'],
    content: '## Garfish\n\n字节开源的微前端框架。\n\n### 特点\n- 面向大型前端应用\n- 支持 Vue/React\n- 路由驱动加载\n\n### 核心\n- 微应用管理\n- 沙箱隔离\n- 路由分发\n\n### 与其他框架对比\n- 都解决微前端隔离问题\n- 实现机制略有差异\n\n### 选择建议\n- 团队规模、技术栈、迁移成本综合考量\n- qiankun 生态最广、文档最全'
  },
  {
    id: 'mf-comm', cat: 'micro-frontend', name: '微应用通信', level: 2, sort: 8, deps: ['mf-overview'],
    content: '## 微应用通信\n\n微应用间的数据与事件传递。\n\n### 方案\n1. **URL 传参**：路由参数\n2. **全局状态**：主应用提供 store\n3. **自定义事件**：EventBus\n4. **localStorage / BroadcastChannel**：跨窗口通信\n5. **props 传递**：主应用传数据给子应用\n\n### 推荐\n- 简单数据：props/URL\n- 复杂状态：主应用 store 下发\n- 跨标签：BroadcastChannel\n\n### 注意\n- 避免子应用间直接耦合\n- 通过主应用中转\n- 数据序列化（跨应用）'
  }
]

export const questions = [
  { id: 'q-mf-1', cat: 'micro-frontend', node: 'mf-overview', type: 'single', level: 2, tags: ['八股文'], q: '微前端的核心价值不包括？', options: ['独立部署', '技术栈无关', '增量升级', '减小单应用体积到极致'], answer: 3, explain: '微前端价值在独立部署/技术栈无关/增量升级，不是极致减小体积。' },
  { id: 'q-mf-2', cat: 'micro-frontend', node: 'mf-overview', type: 'multi', level: 2, tags: ['八股文'], q: '微前端需要解决的挑战有？', options: ['应用间通信', '样式隔离', 'JS 沙箱', '路由协调'], answer: [0, 1, 2, 3], explain: '通信、隔离、路由都是微前端核心挑战。' },
  { id: 'q-mf-3', cat: 'micro-frontend', node: 'mf-overview', type: 'judge', level: 2, tags: ['八股文'], q: '微前端允许不同子应用使用不同技术栈。', options: ['正确', '错误'], answer: true, explain: '技术栈无关是微前端的重要特性。' },
  { id: 'q-mf-4', cat: 'micro-frontend', node: 'mf-qiankun', type: 'single', level: 3, tags: ['八股文'], q: 'qiankun 基于的底层框架是？', options: ['single-spa', 'iframe', 'Webpack', 'Vite'], answer: 0, explain: 'qiankun 基于 single-spa 封装。' },
  { id: 'q-mf-5', cat: 'micro-frontend', node: 'mf-qiankun', type: 'multi', level: 3, tags: ['八股文'], q: 'qiankun 子应用需要导出的生命周期有？', options: ['bootstrap', 'mount', 'unmount', 'render'], answer: [0, 1, 2], explain: '子应用需导出 bootstrap/mount/unmount 钩子。' },
  { id: 'q-mf-6', cat: 'micro-frontend', node: 'mf-qiankun', type: 'judge', level: 3, tags: ['八股文'], q: 'qiankun 子应用需配置输出 umd 格式。', options: ['正确', '错误'], answer: true, explain: '子应用需 umd 输出以便主应用加载。' },
  { id: 'q-mf-7', cat: 'micro-frontend', node: 'mf-sandbox', type: 'single', level: 3, tags: ['八股文'], q: '支持多实例共存的 JS 沙箱是？', options: ['快照沙箱', 'Proxy 沙箱', 'iframe', 'legacy 沙箱'], answer: 1, explain: 'Proxy 沙箱支持多实例，快照沙箱仅单实例。' },
  { id: 'q-mf-8', cat: 'micro-frontend', node: 'mf-sandbox', type: 'multi', level: 3, tags: ['八股文'], q: 'JS 沙箱隔离的目标包括？', options: ['全局变量隔离', '事件监听清理', '状态恢复', '样式隔离'], answer: [0, 1, 2], explain: '样式隔离是独立问题，JS 沙箱管全局变量与事件。' },
  { id: 'q-mf-9', cat: 'micro-frontend', node: 'mf-sandbox', type: 'judge', level: 3, tags: ['八股文'], q: 'Proxy 沙箱通过代理 window 实现隔离。', options: ['正确', '错误'], answer: true, explain: 'Proxy 代理 window，每个实例有独立 fakeWindow。' },
  { id: 'q-mf-10', cat: 'micro-frontend', node: 'mf-style', type: 'single', level: 3, tags: ['八股文'], q: '天然提供样式隔离的方案是？', options: ['Shadow DOM', 'CSS Modules', '前缀命名', '全局样式'], answer: 0, explain: 'Shadow DOM 天然隔离样式作用域。' },
  { id: 'q-mf-11', cat: 'micro-frontend', node: 'mf-style', type: 'multi', level: 3, tags: ['八股文'], q: '样式隔离的常见方案有？', options: ['Shadow DOM', 'CSS Modules', '前缀命名', 'CSS-in-JS'], answer: [0, 1, 2, 3], explain: '以上都是样式隔离方案。' },
  { id: 'q-mf-12', cat: 'micro-frontend', node: 'mf-style', type: 'judge', level: 3, tags: ['八股文'], q: 'Shadow DOM 隔离彻底但存在弹窗定位等兼容问题。', options: ['正确', '错误'], answer: true, explain: 'Shadow DOM 的弹窗/全局组件需特殊处理。' },
  { id: 'q-mf-13', cat: 'micro-frontend', node: 'mf-mf', type: 'single', level: 3, tags: ['八股文'], q: 'Module Federation 是哪个工具的产物？', options: ['Webpack 5', 'Vite 3', 'Rollup', 'esbuild'], answer: 0, explain: 'Module Federation 是 Webpack 5 的特性。' },
  { id: 'q-mf-14', cat: 'micro-frontend', node: 'mf-mf', type: 'multi', level: 3, tags: ['八股文'], q: 'Module Federation 的核心概念有？', options: ['host', 'remote', 'exposes', 'shared'], answer: [0, 1, 2, 3], explain: 'host/remote/exposes/shared 是 MF 核心配置。' },
  { id: 'q-mf-15', cat: 'micro-frontend', node: 'mf-mf', type: 'judge', level: 3, tags: ['八股文'], q: 'Module Federation 是运行时模块级共享。', options: ['正确', '错误'], answer: true, explain: 'MF 在运行时动态加载远程模块。' },
  { id: 'q-mf-16', cat: 'micro-frontend', node: 'mf-wujie', type: 'single', level: 3, tags: ['八股文'], q: '无界（Wujie）基于的技术是？', options: ['WebComponent', 'Proxy 沙箱', 'single-spa', 'Shadow DOM'], answer: 0, explain: '无界基于 WebComponent + iframe 实现。' },
  { id: 'q-mf-17', cat: 'micro-frontend', node: 'mf-wujie', type: 'multi', level: 3, tags: ['八股文'], q: '无界的特点有？', options: ['iframe 天然隔离', '子应用改造少', '支持多实例', '基于 WebComponent'], answer: [0, 1, 2, 3], explain: '以上都是无界特性。' },
  { id: 'q-mf-18', cat: 'micro-frontend', node: 'mf-wujie', type: 'judge', level: 3, tags: ['八股文'], q: '无界用 iframe 加载子应用实现隔离。', options: ['正确', '错误'], answer: true, explain: 'iframe 提供天然隔离，WebComponent 承载渲染。' },
  { id: 'q-mf-19', cat: 'micro-frontend', node: 'mf-garfish', type: 'single', level: 3, tags: ['八股文'], q: 'Garfish 是哪个公司开源的？', options: ['字节', '腾讯', '阿里', '百度'], answer: 0, explain: 'Garfish 是字节跳动的微前端框架。' },
  { id: 'q-mf-20', cat: 'micro-frontend', node: 'mf-garfish', type: 'judge', level: 3, tags: ['八股文'], q: 'qiankun 是当前生态最广、文档最全的微前端框架之一。', options: ['正确', '错误'], answer: true, explain: 'qiankun 生态成熟、文档丰富。' },
  { id: 'q-mf-21', cat: 'micro-frontend', node: 'mf-garfish', type: 'multi', level: 3, tags: ['八股文'], q: '微前端框架选型应考虑？', options: ['团队规模', '技术栈', '迁移成本', '社区生态'], answer: [0, 1, 2, 3], explain: '选型需综合多因素考量。' },
  { id: 'q-mf-22', cat: 'micro-frontend', node: 'mf-comm', type: 'single', level: 2, tags: ['八股文'], q: '跨标签页通信最适合用？', options: ['BroadcastChannel', 'props', 'EventBus', 'URL'], answer: 0, explain: 'BroadcastChannel 支持跨标签页广播。' },
  { id: 'q-mf-23', cat: 'micro-frontend', node: 'mf-comm', type: 'multi', level: 2, tags: ['八股文'], q: '微应用间通信方案有？', options: ['URL 传参', '全局 store', '自定义事件', 'props 传递'], answer: [0, 1, 2, 3], explain: '以上都是常见通信方案。' },
  { id: 'q-mf-24', cat: 'micro-frontend', node: 'mf-comm', type: 'judge', level: 2, tags: ['八股文'], q: '子应用间应尽量通过主应用中转通信，避免直接耦合。', options: ['正确', '错误'], answer: true, explain: '通过主应用中转降低子应用耦合。' },
  { id: 'q-mf-25', cat: 'micro-frontend', node: 'mf-qiankun', type: 'single', level: 3, tags: ['场景题'], q: 'qiankun 加载子应用资源需配置的子应用 webpack 输出是？', options: ['umd', 'esm', 'cjs', 'amd'], answer: 0, explain: 'qiankun 子应用需 umd 输出供动态加载。' },
  { id: 'q-mf-26', cat: 'micro-frontend', node: 'mf-mf', type: 'single', level: 3, tags: ['场景题'], q: 'shared 配置 singleton: true 的作用是？', options: ['共享单例依赖', '禁止共享', '强制多实例', '懒加载'], answer: 0, explain: 'singleton 保证依赖只加载一份单例。' },
  { id: 'q-mf-27', cat: 'micro-frontend', node: 'mf-comm', type: 'single', level: 2, tags: ['场景题'], q: '主应用向子应用传初始数据，最直接的方式是？', options: ['props', 'localStorage', 'BroadcastChannel', 'URL'], answer: 0, explain: 'props 是最直接的父子数据传递方式。' },
  { id: 'q-mf-28', cat: 'micro-frontend', node: 'mf-sandbox', type: 'judge', level: 3, tags: ['八股文'], q: '卸载微应用时需要清理其事件监听，避免内存泄漏。', options: ['正确', '错误'], answer: true, explain: '未清理的事件监听会导致内存泄漏。' }
]
