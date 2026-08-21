/**
 * 大前端与全栈 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'fs-node', cat: 'fullstack', name: 'Node.js 核心', level: 2, sort: 1, deps: [],
    content: '## Node.js 核心\n\n基于 Chrome V8 的 JS 运行时。\n\n### 事件循环\n- 与浏览器不同，Node 有多个阶段\n- timers → pending callbacks → poll → check → close\n- setImmediate 在 check 阶段，process.nextTick 优先于微任务\n\n### 特点\n- 单线程 + 事件驱动 + 非阻塞 I/O\n- 适合 I/O 密集，不适合 CPU 密集\n\n### 关键\n- libuv 提供事件循环与线程池\n- 异步 API 不阻塞主线程\n- 理解 process.nextTick 与 setImmediate 顺序'
  },
  {
    id: 'fs-express', cat: 'fullstack', name: 'Express 与 Koa', level: 2, sort: 2, deps: ['fs-node'],
    content: "## Express 与 Koa\n\n### Express\n- 经典 Web 框架，中间件机制\n- app.use 注册中间件\n- 路由、模板、静态资源\n\n```js\nconst app = express()\napp.get('/api', (req, res) => res.json({ ok: true }))\n```\n\n### Koa\n- 由 Express 原班人马打造\n- 洋葱模型中间件（async/await）\n- ctx 上下文替代 req/res\n\n### 洋葱模型\n- 中间件按顺序进入，逆序返回\n- await next() 是关键\n\n### 选择\n- Express 生态成熟，Koa 更现代轻量"
  },
  {
    id: 'fs-nestjs', cat: 'fullstack', name: 'NestJS', level: 3, sort: 3, deps: ['fs-express'],
    content: "## NestJS\n\n基于 TypeScript 的企业级 Node 框架。\n\n### 特点\n- 模块化、依赖注入\n- 装饰器风格（类似 Angular）\n- 支持多种 HTTP 底层（Express/Fastify）\n\n### 核心概念\n- Module（模块）\n- Controller（控制器）\n- Service / Provider\n- 依赖注入（DI）\n\n```ts\n@Controller('users')\nexport class UsersController {\n  @Get()\n  findAll() { ... }\n}\n```\n\n### 价值\n- 结构清晰、可维护\n- 适合大型项目"
  },
  {
    id: 'fs-electron', cat: 'fullstack', name: 'Electron', level: 3, sort: 4, deps: ['fs-node'],
    content: '## Electron\n\n用 Web 技术构建桌面应用。\n\n### 进程模型\n- **主进程**：管理窗口、系统能力\n- **渲染进程**：页面 UI（每个窗口独立）\n- **预加载脚本**：安全桥接\n\n### 通信\n- IPC（ipcMain / ipcRenderer）\n- contextBridge 暴露安全 API\n\n### 特点\n- Chromium + Node.js\n- 跨平台（Win/Mac/Linux）\n\n### 缺点\n- 包体积大（内置 Chromium）\n- 内存占用高\n\n### 应用\n- VS Code、Slack、飞书'
  },
  {
    id: 'fs-tauri', cat: 'fullstack', name: 'Tauri', level: 3, sort: 5, deps: ['fs-node'],
    content: '## Tauri\n\n用 Rust 构建的轻量桌面应用框架。\n\n### 与 Electron 对比\n| 维度 | Tauri | Electron |\n|---|---|---|\n| 后端 | Rust | Node.js |\n| 体积 | 小（几 MB） | 大（上百 MB） |\n| 内存 | 低 | 高 |\n\n### 特点\n- 前端任意框架，后端 Rust\n- 复用系统 WebView（不打包 Chromium）\n- 安全性好\n\n### 优势\n- 包体积小、性能好\n\n### 局限\n- Rust 学习成本\n- 生态较新'
  },
  {
    id: 'fs-graphql', cat: 'fullstack', name: 'GraphQL', level: 3, sort: 6, deps: ['fs-node'],
    content: '## GraphQL\n\n查询语言，客户端按需获取数据。\n\n### 核心\n- Schema 定义类型\n- Query（查询）、Mutation（变更）、Subscription（订阅）\n\n```graphql\nquery {\n  user(id: 1) {\n    name\n    posts { title }\n  }\n}\n```\n\n### 优势\n- 按需获取，避免 over-fetching\n- 单一端点\n- 类型系统\n\n### 与 REST 区别\n- REST 多端点，GraphQL 单端点\n- GraphQL 由客户端决定字段\n\n### 注意\n- N+1 问题（DataLoader 解决）\n- 缓存更复杂'
  },
  {
    id: 'fs-module', cat: 'fullstack', name: '模块系统', level: 2, sort: 7, deps: ['fs-node'],
    content: '## 模块系统\n\n### CommonJS（Node 默认）\n- require / module.exports\n- 同步加载\n- 运行时解析\n\n### ES Module\n- import / export\n- 静态结构（可 Tree Shaking）\n- 异步加载\n\n### 区别\n| 维度 | CJS | ESM |\n|---|---|---|\n| 语法 | require | import |\n| 加载 | 同步 | 异步 |\n| 结构 | 动态 | 静态 |\n| 树摇 | 不支持 | 支持 |\n\n### 循环依赖\n- CJS 返回部分导出\n- ESM 引用提升（活绑定）'
  },
  {
    id: 'fs-stream', cat: 'fullstack', name: '流与 Buffer', level: 2, sort: 8, deps: ['fs-node'],
    content: "## 流与 Buffer\n\n### Buffer\n- 二进制数据容器\n- 固定大小、高效\n- 用于网络/文件 I/O\n\n### Stream（流）\n- 分块处理数据，节省内存\n- 类型：Readable/Writable/Duplex/Transform\n- pipe 管道连接\n\n```js\nfs.createReadStream('in.txt')\n  .pipe(transform)\n  .pipe(fs.createWriteStream('out.txt'))\n```\n\n### 优势\n- 处理大文件不占满内存\n- 边读边处理\n\n### 应用\n- 文件上传/下载、压缩、日志"
  },
  {
    id: 'fs-process', cat: 'fullstack', name: '进程与线程', level: 3, sort: 9, deps: ['fs-node'],
    content: '## 进程与线程\n\n### 进程\n- 独立资源分配单元\n- child_process / cluster 创建多进程\n\n### 线程\n- CPU 密集任务用 worker_threads\n- 共享内存（SharedArrayBuffer）\n\n### cluster 模块\n- 主进程 fork 子进程\n- 利用多核 CPU\n\n### 关键\n- Node 单线程，CPU 密集会阻塞\n- 用 worker_threads 处理计算\n- 进程间通信（IPC）\n\n### 选择\n- I/O 密集：单线程即可\n- CPU 密集：worker_threads / cluster'
  }
]

export const questions = [
  { id: 'q-fs-1', cat: 'fullstack', node: 'fs-node', type: 'single', level: 2, tags: ['八股文'], q: 'Node.js 事件循环的实现库是？', options: ['libuv', 'libevent', 'V8', 'epoll'], answer: 0, explain: 'libuv 提供事件循环与异步 I/O。' },
  { id: 'q-fs-2', cat: 'fullstack', node: 'fs-node', type: 'multi', level: 2, tags: ['八股文'], q: 'Node.js 的特点有？', options: ['单线程', '事件驱动', '非阻塞 I/O', '适合 CPU 密集'], answer: [0, 1, 2], explain: 'Node 单线程不适合 CPU 密集任务。' },
  { id: 'q-fs-3', cat: 'fullstack', node: 'fs-node', type: 'judge', level: 2, tags: ['八股文'], q: 'process.nextTick 的执行优先级高于 Promise 微任务。', options: ['正确', '错误'], answer: true, explain: 'nextTick 队列优先于 Promise 微任务队列。' },
  { id: 'q-fs-4', cat: 'fullstack', node: 'fs-express', type: 'single', level: 2, tags: ['八股文'], q: 'Koa 中间件的执行模型是？', options: ['洋葱模型', '线性模型', '树形模型', '环形模型'], answer: 0, explain: 'Koa 中间件是洋葱模型，进出两阶段。' },
  { id: 'q-fs-5', cat: 'fullstack', node: 'fs-express', type: 'multi', level: 2, tags: ['八股文'], q: 'Express 中间件可做的事有？', options: ['日志记录', '鉴权', '解析请求体', '响应处理'], answer: [0, 1, 2, 3], explain: '中间件可处理请求的各个环节。' },
  { id: 'q-fs-6', cat: 'fullstack', node: 'fs-express', type: 'judge', level: 2, tags: ['八股文'], q: 'Koa 用 ctx 上下文替代 Express 的 req/res。', options: ['正确', '错误'], answer: true, explain: 'Koa 封装 ctx，统一请求响应。' },
  { id: 'q-fs-7', cat: 'fullstack', node: 'fs-nestjs', type: 'single', level: 3, tags: ['八股文'], q: 'NestJS 的核心设计思想是？', options: ['依赖注入', '全局变量', '函数式', '组件化无依赖'], answer: 0, explain: 'NestJS 基于 DI 依赖注入组织代码。' },
  { id: 'q-fs-8', cat: 'fullstack', node: 'fs-nestjs', type: 'multi', level: 3, tags: ['八股文'], q: 'NestJS 的核心概念有？', options: ['Module', 'Controller', 'Service', 'Provider'], answer: [0, 1, 2, 3], explain: 'Module/Controller/Service/Provider 是 NestJS 核心。' },
  { id: 'q-fs-9', cat: 'fullstack', node: 'fs-nestjs', type: 'judge', level: 3, tags: ['八股文'], q: 'NestJS 默认基于 TypeScript。', options: ['正确', '错误'], answer: true, explain: 'NestJS 面向 TS 设计，装饰器风格。' },
  { id: 'q-fs-10', cat: 'fullstack', node: 'fs-electron', type: 'single', level: 3, tags: ['八股文'], q: 'Electron 中管理窗口和系统能力的进程是？', options: ['主进程', '渲染进程', 'Worker', '预加载'], answer: 0, explain: '主进程管理窗口与系统能力。' },
  { id: 'q-fs-11', cat: 'fullstack', node: 'fs-electron', type: 'multi', level: 3, tags: ['八股文'], q: 'Electron 的进程类型有？', options: ['主进程', '渲染进程', '预加载脚本', 'Service Worker'], answer: [0, 1, 2], explain: '主/渲染/预加载是 Electron 的进程模型。' },
  { id: 'q-fs-12', cat: 'fullstack', node: 'fs-electron', type: 'judge', level: 3, tags: ['八股文'], q: 'Electron 因内置 Chromium 导致包体积大。', options: ['正确', '错误'], answer: true, explain: '内置 Chromium 是 Electron 体积大的主因。' },
  { id: 'q-fs-13', cat: 'fullstack', node: 'fs-tauri', type: 'single', level: 3, tags: ['八股文'], q: 'Tauri 后端使用的语言是？', options: ['Rust', 'Go', 'C++', 'Node'], answer: 0, explain: 'Tauri 用 Rust 编写后端。' },
  { id: 'q-fs-14', cat: 'fullstack', node: 'fs-tauri', type: 'multi', level: 3, tags: ['八股文'], q: 'Tauri 相比 Electron 的优势？', options: ['体积小', '内存占用低', '性能好', '生态更成熟'], answer: [0, 1, 2], explain: 'Tauri 生态较新，成熟度不如 Electron。' },
  { id: 'q-fs-15', cat: 'fullstack', node: 'fs-tauri', type: 'judge', level: 3, tags: ['八股文'], q: 'Tauri 复用系统 WebView 而不打包 Chromium。', options: ['正确', '错误'], answer: true, explain: 'Tauri 用系统 WebView，大幅减小体积。' },
  { id: 'q-fs-16', cat: 'fullstack', node: 'fs-graphql', type: 'single', level: 3, tags: ['八股文'], q: 'GraphQL 中修改数据的操作是？', options: ['Mutation', 'Query', 'Subscription', 'Action'], answer: 0, explain: 'Mutation 用于变更数据。' },
  { id: 'q-fs-17', cat: 'fullstack', node: 'fs-graphql', type: 'multi', level: 3, tags: ['八股文'], q: 'GraphQL 的操作类型有？', options: ['Query', 'Mutation', 'Subscription', 'WebSocket'], answer: [0, 1, 2], explain: 'Query/Mutation/Subscription 是三大操作。' },
  { id: 'q-fs-18', cat: 'fullstack', node: 'fs-graphql', type: 'judge', level: 3, tags: ['八股文'], q: 'GraphQL 使用单一端点，客户端按需取字段。', options: ['正确', '错误'], answer: true, explain: '单端点 + 按需字段是 GraphQL 核心特性。' },
  { id: 'q-fs-19', cat: 'fullstack', node: 'fs-module', type: 'single', level: 2, tags: ['八股文'], q: '支持 Tree Shaking 的模块规范是？', options: ['ESM', 'CommonJS', 'AMD', 'UMD'], answer: 0, explain: 'ESM 静态结构可被摇树优化。' },
  { id: 'q-fs-20', cat: 'fullstack', node: 'fs-module', type: 'multi', level: 2, tags: ['八股文'], q: 'CommonJS 与 ESM 的区别？', options: ['require vs import', '同步 vs 异步', '动态 vs 静态', '都能树摇'], answer: [0, 1, 2], explain: 'CJS 不能树摇，ESM 可以。' },
  { id: 'q-fs-21', cat: 'fullstack', node: 'fs-module', type: 'judge', level: 2, tags: ['八股文'], q: 'ESM 的 import 是静态结构，编译期可分析。', options: ['正确', '错误'], answer: true, explain: 'ESM 静态导入导出可被静态分析。' },
  { id: 'q-fs-22', cat: 'fullstack', node: 'fs-stream', type: 'single', level: 2, tags: ['八股文'], q: '流处理大文件的主要优势是？', options: ['节省内存', '提升 CPU', '减小文件', '加密文件'], answer: 0, explain: '流分块处理，不占满内存。' },
  { id: 'q-fs-23', cat: 'fullstack', node: 'fs-stream', type: 'multi', level: 2, tags: ['八股文'], q: 'Node 流的类型有？', options: ['Readable', 'Writable', 'Duplex', 'Transform'], answer: [0, 1, 2, 3], explain: '四种流类型覆盖读写转换场景。' },
  { id: 'q-fs-24', cat: 'fullstack', node: 'fs-stream', type: 'judge', level: 2, tags: ['八股文'], q: 'pipe 用于连接可读流和可写流。', options: ['正确', '错误'], answer: true, explain: 'pipe 将数据从可读流导向可写流。' },
  { id: 'q-fs-25', cat: 'fullstack', node: 'fs-process', type: 'single', level: 3, tags: ['八股文'], q: 'Node 处理 CPU 密集任务推荐用？', options: ['worker_threads', 'setTimeout', 'Promise', 'async'], answer: 0, explain: 'worker_threads 用多线程处理计算任务。' },
  { id: 'q-fs-26', cat: 'fullstack', node: 'fs-process', type: 'multi', level: 3, tags: ['八股文'], q: 'Node 多进程方案有？', options: ['cluster', 'child_process', 'worker_threads', 'Promise.all'], answer: [0, 1, 2], explain: 'Promise.all 不是多进程方案。' },
  { id: 'q-fs-27', cat: 'fullstack', node: 'fs-process', type: 'judge', level: 3, tags: ['八股文'], q: 'cluster 模块可利用多核 CPU。', options: ['正确', '错误'], answer: true, explain: 'cluster 创建多进程利用多核。' },
  { id: 'q-fs-28', cat: 'fullstack', node: 'fs-graphql', type: 'single', level: 3, tags: ['场景题'], q: 'GraphQL 的 N+1 查询问题可用哪个库解决？', options: ['DataLoader', 'Lodash', 'Axios', 'Mongoose'], answer: 0, explain: 'DataLoader 批量合并查询，解决 N+1。' }
]
