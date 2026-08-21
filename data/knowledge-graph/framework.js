/**
 * 框架原理专项 分类 - 知识点与题目（Vue/React 底层原理深度剖析）
 */
export const nodes = [
  {
    id: 'fw-reactivity', cat: 'framework', name: '响应式系统原理', level: 3, sort: 1, deps: [],
    content: '## 响应式系统原理\n\n### Vue2 defineProperty\n- 遍历对象属性劫持 getter/setter\n- 递归处理嵌套对象\n- 局限：新增/删除/数组索引\n\n### Vue3 Proxy\n- 代理整个对象\n- Reflect 反射默认行为\n- track（收集）/trigger（派发）\n\n### 依赖收集\n- effect 执行读取属性 → track\n- 属性修改 → trigger 重新执行\n- WeakMap → Map → Set 三级结构\n\n### 关键\n- 响应式是惰性收集\n- computed 有缓存，watch 无'
  },
  {
    id: 'fw-vdom', cat: 'framework', name: '虚拟 DOM 与 Diff', level: 3, sort: 2, deps: [],
    content: '## 虚拟 DOM 与 Diff 原理\n\n### 为什么需要虚拟 DOM\n- 减少真实 DOM 操作\n- 跨平台抽象\n- 便于 diff 计算最小更新\n\n### Vue diff（双端比较）\n- 头头/尾尾/头尾/尾头四次比较\n- key 建立映射\n- 移动/复用/增删\n\n### React diff（单向）\n- 同层比较\n- type + key 判断复用\n- 单向遍历\n\n### 复杂度\n- 从 O(n³) 优化到 O(n)\n- 同层 + key 是关键'
  },
  {
    id: 'fw-compiler', cat: 'framework', name: '模板编译原理', level: 3, sort: 3, deps: [],
    content: '## 模板编译原理\n\n### Vue 编译流程\n1. **parse**：模板 → AST\n2. **transform**：AST 优化（静态标记）\n3. **generate**：AST → render 函数\n\n### 静态提升\n- 静态节点标记（patchFlag）\n- 跳过静态子树 diff\n- 提升到渲染函数外\n\n### 编译优化\n- 静态节点缓存\n- 动态节点收集\n- block tree（靶向更新）\n\n### JSX 编译\n- Babel 转 createElement\n- 运行时创建虚拟 DOM\n\n### 关键\n- 编译时优化是 Vue3 性能关键'
  },
  {
    id: 'fw-scheduler', cat: 'framework', name: '调度与 Fiber', level: 3, sort: 4, deps: ['fw-vdom'],
    content: '## 调度与 Fiber 原理\n\n### 为什么需要调度\n- 长任务阻塞主线程\n- 需要可中断的渲染\n\n### Fiber 结构\n- 链表：child/sibling/return\n- 每个节点可独立工作\n- workInProgress 双缓冲\n\n### 调度流程\n1. 计算优先级（lane）\n2. 时间切片（5ms）\n3. 可中断渲染阶段\n4. 不可中断提交阶段\n\n### 优先级\n- 用户交互 > 动画 > 数据更新\n- MessageChannel 模拟微任务调度\n\n### 价值\n- 解决卡顿，支持并发'
  },
  {
    id: 'fw-hooks', cat: 'framework', name: 'Hooks 实现原理', level: 3, sort: 5, deps: ['fw-scheduler'],
    content: '## Hooks 实现原理\n\n### 为什么有顺序规则\n- Hooks 用链表存储状态\n- 依赖调用顺序定位状态\n- 条件调用会导致错位\n\n### useState\n- 状态存 fiber 的 hook 链表\n- 每次渲染按顺序取值\n\n### useEffect\n- 副作用队列\n- commit 后执行\n- 依赖比较（Object.is）\n\n### 关键\n- 必须顶层调用\n- 只能在函数组件/自定义 Hook\n- 顺序稳定是前提'
  },
  {
    id: 'fw-router', cat: 'framework', name: '路由实现原理', level: 2, sort: 6, deps: [],
    content: '## 路由实现原理\n\n### hash 模式\n- 监听 hashchange\n- # 后内容不发送服务器\n\n### history 模式\n- pushState/replaceState\n- 监听 popstate\n- 需服务端回退配置\n\n### 实现要点\n- 解析路径匹配路由表\n- 渲染对应组件\n- 维护导航栈\n\n### 关键\n- history 前进后退触发 popstate\n- pushState 不触发 popstate\n- 需手动触发更新'
  },
  {
    id: 'fw-ssr', cat: 'framework', name: 'SSR 与水合', level: 3, sort: 7, deps: ['fw-compiler'],
    content: '## SSR 与水合原理\n\n### SSR 流程\n1. 服务端渲染组件 → HTML 字符串\n2. 返回给浏览器\n3. 客户端加载 JS\n4. 水合（hydrate）绑定事件\n\n### 水合（Hydration）\n- 复用服务端 HTML\n- 只绑定事件，不重建 DOM\n- 要求两端渲染一致\n\n### 同构\n- 同一组件服务端/客户端运行\n- 数据需要序列化传递\n\n### 注意\n- 服务端无 window/document\n- 首屏数据预取\n- 避免两端不一致导致水合失败'
  },
  {
    id: 'fw-state', cat: 'framework', name: '状态管理原理', level: 3, sort: 8, deps: ['fw-reactivity'],
    content: '## 状态管理原理\n\n### Vuex/Pinia\n- 基于 Vue 响应式\n- state 响应式，getter 派生\n- action 修改（Pinia 直接改）\n\n### Redux\n- 单一数据源\n- reducer 纯函数\n- 发布订阅通知更新\n\n### 核心\n- 单向数据流\n- 状态可预测\n- 时间旅行调试\n\n### 选择\n- Vue 用 Pinia\n- React 可用 Redux/Zustand/Jotai\n- 按需引入，不过度设计'
  }
]

export const questions = [
  { id: 'q-fw-1', cat: 'framework', node: 'fw-reactivity', type: 'single', level: 3, tags: ['框架原理'], q: 'Vue3 依赖收集的三级结构是？', options: ['WeakMap→Map→Set', 'Map→Set→Array', 'Array→Object', 'Set→Map'], answer: 0, explain: 'WeakMap 存 target，Map 存 key，Set 存 effect。' },
  { id: 'q-fw-2', cat: 'framework', node: 'fw-reactivity', type: 'multi', level: 3, tags: ['框架原理'], q: 'Vue2 defineProperty 的局限有？', options: ['无法监听新增属性', '无法监听数组索引', '需递归遍历', '无法监听删除'], answer: [0, 1, 2, 3], explain: 'defineProperty 的局限促使 Vue3 改用 Proxy。' },
  { id: 'q-fw-3', cat: 'framework', node: 'fw-reactivity', type: 'judge', level: 3, tags: ['框架原理'], q: 'computed 与 watch 都有缓存。', options: ['正确', '错误'], answer: false, explain: 'computed 有缓存，watch 无缓存只执行副作用。' },
  { id: 'q-fw-4', cat: 'framework', node: 'fw-reactivity', type: 'single', level: 3, tags: ['框架原理'], q: 'Vue3 中触发依赖更新的函数是？', options: ['trigger', 'track', 'effect', 'watch'], answer: 0, explain: 'trigger 派发更新，track 收集依赖。' },
  { id: 'q-fw-5', cat: 'framework', node: 'fw-reactivity', type: 'single', level: 3, tags: ['框架原理'], q: 'Reflect 在 Proxy 响应式中的作用是？', options: ['提供默认行为', '替代 Proxy', '加速渲染', '压缩代码'], answer: 0, explain: 'Reflect 提供与 trap 对应的默认操作。' },
  { id: 'q-fw-6', cat: 'framework', node: 'fw-vdom', type: 'single', level: 3, tags: ['框架原理'], q: 'Vue diff 采用的比较策略是？', options: ['双端比较', '单向比较', '随机比较', '全量比较'], answer: 0, explain: 'Vue 用双端（头尾）比较优化 diff。' },
  { id: 'q-fw-7', cat: 'framework', node: 'fw-vdom', type: 'multi', level: 3, tags: ['框架原理'], q: '虚拟 DOM 的优势有？', options: ['减少真实 DOM 操作', '跨平台抽象', '最小化更新', '零开销'], answer: [0, 1, 2], explain: '虚拟 DOM 也有自身开销，非零开销。' },
  { id: 'q-fw-8', cat: 'framework', node: 'fw-vdom', type: 'judge', level: 3, tags: ['框架原理'], q: 'React diff 中 type 相同且 key 相同的节点会被复用。', options: ['正确', '错误'], answer: true, explain: 'type + key 是 React 复用判断依据。' },
  { id: 'q-fw-9', cat: 'framework', node: 'fw-vdom', type: 'single', level: 3, tags: ['框架原理'], q: 'diff 算法复杂度从 O(n³) 优化到？', options: ['O(n)', 'O(n²)', 'O(log n)', 'O(1)'], answer: 0, explain: '通过同层比较与 key 优化到 O(n)。' },
  { id: 'q-fw-10', cat: 'framework', node: 'fw-compiler', type: 'single', level: 3, tags: ['框架原理'], q: 'Vue 模板编译的流程顺序是？', options: ['parse→transform→generate', 'generate→parse', 'transform→parse', 'parse→generate'], answer: 0, explain: '先 parse 成 AST，再 transform 优化，最后 generate。' },
  { id: 'q-fw-11', cat: 'framework', node: 'fw-compiler', type: 'multi', level: 3, tags: ['框架原理'], q: 'Vue3 编译期优化有？', options: ['静态提升', 'patchFlag', 'block tree', '运行时 diff'], answer: [0, 1, 2], explain: '运行时 diff 是运行时，非编译期优化。' },
  { id: 'q-fw-12', cat: 'framework', node: 'fw-compiler', type: 'judge', level: 3, tags: ['框架原理'], q: '静态节点会被提升到渲染函数外避免重复创建。', options: ['正确', '错误'], answer: true, explain: '静态提升减少重复创建与 diff 开销。' },
  { id: 'q-fw-13', cat: 'framework', node: 'fw-compiler', type: 'single', level: 3, tags: ['框架原理'], q: 'patchFlag 的作用是？', options: ['标记动态节点类型', '标记错误', '标记路由', '标记样式'], answer: 0, explain: 'patchFlag 标记动态绑定类型，靶向更新。' },
  { id: 'q-fw-14', cat: 'framework', node: 'fw-scheduler', type: 'single', level: 3, tags: ['框架原理'], q: 'Fiber 节点之间通过什么结构连接？', options: ['链表', '数组', '树', '哈希表'], answer: 0, explain: 'Fiber 用 child/sibling/return 链表连接。' },
  { id: 'q-fw-15', cat: 'framework', node: 'fw-scheduler', type: 'multi', level: 3, tags: ['框架原理'], q: 'Fiber 架构的特点有？', options: ['可中断', '可恢复', '时间切片', '双缓冲'], answer: [0, 1, 2, 3], explain: '以上都是 Fiber 核心特性。' },
  { id: 'q-fw-16', cat: 'framework', node: 'fw-scheduler', type: 'judge', level: 3, tags: ['框架原理'], q: 'Fiber 的提交阶段（commit）可以中断。', options: ['正确', '错误'], answer: false, explain: '渲染阶段可中断，提交阶段不可中断。' },
  { id: 'q-fw-17', cat: 'framework', node: 'fw-scheduler', type: 'single', level: 3, tags: ['框架原理'], q: 'Fiber 时间切片的时长大约是？', options: ['5ms', '50ms', '500ms', '1s'], answer: 0, explain: '每片约 5ms，保证不长时间阻塞。' },
  { id: 'q-fw-18', cat: 'framework', node: 'fw-scheduler', type: 'single', level: 3, tags: ['框架原理'], q: 'React 调度优先级最高的是？', options: ['用户交互', '动画', '数据更新', '日志'], answer: 0, explain: '用户交互优先级最高，需立即响应。' },
  { id: 'q-fw-19', cat: 'framework', node: 'fw-hooks', type: 'single', level: 3, tags: ['框架原理'], q: 'React Hooks 用哪种结构存储状态？', options: ['链表', '数组', '对象', 'Map'], answer: 0, explain: 'Hook 状态以链表形式存在 fiber 节点上。' },
  { id: 'q-fw-20', cat: 'framework', node: 'fw-hooks', type: 'multi', level: 3, tags: ['框架原理'], q: 'Hooks 规则背后的原因？', options: ['依赖调用顺序', '链表存储状态', '顺序错位会取错', '性能优化'], answer: [0, 1, 2], explain: 'Hooks 依赖顺序定位状态，条件调用会错位。' },
  { id: 'q-fw-21', cat: 'framework', node: 'fw-hooks', type: 'judge', level: 3, tags: ['框架原理'], q: 'useEffect 的依赖比较使用 Object.is。', options: ['正确', '错误'], answer: true, explain: 'React 用 Object.is 比较依赖是否变化。' },
  { id: 'q-fw-22', cat: 'framework', node: 'fw-hooks', type: 'single', level: 3, tags: ['框架原理'], q: 'useState 返回的 setState 为什么能触发更新？', options: ['调度更新队列', '直接改 DOM', '重载页面', '修改全局'], answer: 0, explain: 'setState 触发 fiber 调度更新。' },
  { id: 'q-fw-23', cat: 'framework', node: 'fw-router', type: 'single', level: 2, tags: ['框架原理'], q: 'history 模式监听的事件是？', options: ['popstate', 'hashchange', 'load', 'resize'], answer: 0, explain: 'history 模式监听 popstate 事件。' },
  { id: 'q-fw-24', cat: 'framework', node: 'fw-router', type: 'multi', level: 2, tags: ['框架原理'], q: 'hash 模式的特点有？', options: ['监听 hashchange', '无需服务端配置', '# 后不发送服务器', 'SEO 好'], answer: [0, 1, 2], explain: 'hash 模式 SEO 较差，history 更好。' },
  { id: 'q-fw-25', cat: 'framework', node: 'fw-router', type: 'judge', level: 2, tags: ['框架原理'], q: 'pushState 不会触发 popstate 事件。', options: ['正确', '错误'], answer: true, explain: 'pushState 不触发 popstate，需手动更新视图。' },
  { id: 'q-fw-26', cat: 'framework', node: 'fw-router', type: 'single', level: 2, tags: ['框架原理'], q: 'history 模式刷新 404 的解决方案是？', options: ['服务端回退到 index.html', '改用 hash', '禁用刷新', '加缓存'], answer: 0, explain: 'history 需服务端配置所有路径回退到入口。' },
  { id: 'q-fw-27', cat: 'framework', node: 'fw-ssr', type: 'single', level: 3, tags: ['框架原理'], q: '水合（Hydration）的作用是？', options: ['复用 HTML 绑定事件', '重新渲染 DOM', '压缩 HTML', '加密数据'], answer: 0, explain: '水合复用服务端 HTML，只绑定事件。' },
  { id: 'q-fw-28', cat: 'framework', node: 'fw-ssr', type: 'multi', level: 3, tags: ['框架原理'], q: 'SSR 开发注意事项有？', options: ['服务端无 window', '数据序列化', '两端渲染一致', '客户端无需水合'], answer: [0, 1, 2], explain: 'SSR 需要客户端水合，不是无需。' },
  { id: 'q-fw-29', cat: 'framework', node: 'fw-ssr', type: 'judge', level: 3, tags: ['框架原理'], q: '水合失败通常由两端渲染不一致导致。', options: ['正确', '错误'], answer: true, explain: '服务端与客户端渲染不一致会导致水合失败。' },
  { id: 'q-fw-30', cat: 'framework', node: 'fw-ssr', type: 'single', level: 3, tags: ['框架原理'], q: '同构渲染指的是？', options: ['同一代码两端运行', '两个代码库', '只服务端渲染', '只客户端渲染'], answer: 0, explain: '同构即同一份组件代码服务端/客户端复用。' },
  { id: 'q-fw-31', cat: 'framework', node: 'fw-state', type: 'single', level: 3, tags: ['框架原理'], q: 'Pinia 的状态本质基于？', options: ['Vue 响应式', 'Redux', 'MobX', 'Immutable'], answer: 0, explain: 'Pinia 基于 Vue 响应式系统实现。' },
  { id: 'q-fw-32', cat: 'framework', node: 'fw-state', type: 'multi', level: 3, tags: ['框架原理'], q: 'Redux 的核心原则有？', options: ['单一数据源', 'state 只读', 'reducer 纯函数', '可随意修改'], answer: [0, 1, 2], explain: 'Redux 三原则约束状态可预测性。' },
  { id: 'q-fw-33', cat: 'framework', node: 'fw-state', type: 'judge', level: 3, tags: ['框架原理'], q: '单向数据流让状态变化可预测、易调试。', options: ['正确', '错误'], answer: true, explain: '单向数据流是状态管理核心价值。' },
  { id: 'q-fw-34', cat: 'framework', node: 'fw-state', type: 'single', level: 3, tags: ['框架原理'], q: 'Redux 中间件的作用是？', options: ['处理异步/副作用', '渲染组件', '压缩代码', '路由跳转'], answer: 0, explain: '中间件拦截 action 处理异步等副作用。' },
  { id: 'q-fw-35', cat: 'framework', node: 'fw-reactivity', type: 'single', level: 3, tags: ['框架原理'], q: 'Vue3 中 ref 与 reactive 的区别？', options: ['ref 包装基本类型', 'reactive 包装基本类型', '两者相同', 'ref 不能用于对象'], answer: 0, explain: 'ref 适合基本类型（.value），reactive 适合对象。' },
  { id: 'q-fw-36', cat: 'framework', node: 'fw-vdom', type: 'single', level: 3, tags: ['框架原理'], q: 'Vue3 中标记动态子节点的优化机制是？', options: ['block tree', '递归 diff', '全量比较', '随机更新'], answer: 0, explain: 'block tree 收集动态节点靶向更新。' },
  { id: 'q-fw-37', cat: 'framework', node: 'fw-scheduler', type: 'single', level: 3, tags: ['框架原理'], q: 'React 模拟任务调度的实现基于？', options: ['MessageChannel', 'setTimeout', 'Promise', 'rAF'], answer: 0, explain: 'React 用 MessageChannel 实现宏任务调度。' },
  { id: 'q-fw-38', cat: 'framework', node: 'fw-hooks', type: 'single', level: 3, tags: ['框架原理'], q: '自定义 Hook 的命名约定是？', options: ['use 开头', 'hook 结尾', '任意命名', 'get 开头'], answer: 0, explain: '自定义 Hook 必须以 use 开头便于识别。' },
  { id: 'q-fw-39', cat: 'framework', node: 'fw-router', type: 'single', level: 2, tags: ['框架原理'], q: '前端路由的核心是？', options: ['URL 变化不刷新页面', '服务端渲染', '多页跳转', '表单提交'], answer: 0, explain: '前端路由监听 URL 变化渲染组件，不刷新页面。' },
  { id: 'q-fw-40', cat: 'framework', node: 'fw-ssr', type: 'single', level: 3, tags: ['框架原理'], q: 'SSR 相比 CSR 的主要优势是？', options: ['首屏快 + SEO', '代码更少', '无需服务端', '性能一定更高'], answer: 0, explain: 'SSR 首屏快且利于 SEO，但需要服务端。' }
]
