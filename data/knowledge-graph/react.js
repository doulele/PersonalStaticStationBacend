/**
 * React 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'react-jsx', cat: 'react', name: 'JSX', level: 1, sort: 1, deps: [],
    content: '## JSX\n\nJSX 是 JavaScript 的语法扩展，用类似 HTML 的语法描述 UI。\n\n### 规则\n- 必须有一个根节点（或用 Fragment）\n- 表达式用 {} 包裹\n- class 写作 className，for 写作 htmlFor\n- 事件驼峰：onClick\n\n```jsx\nconst el = <div className="box">Hello {name}</div>\n```\n\n### 本质\n- JSX 编译成 React.createElement 调用\n- 返回描述 UI 的对象（虚拟 DOM）\n\n### 条件与列表\n- 条件：&& 或三元表达式\n- 列表：map 渲染，需加 key'
  },
  {
    id: 'react-lifecycle', cat: 'react', name: '组件生命周期', level: 2, sort: 2, deps: ['react-jsx'],
    content: '## 组件生命周期\n\n### 类组件\n- 挂载：constructor、render、componentDidMount\n- 更新：shouldComponentUpdate、render、componentDidUpdate\n- 卸载：componentWillUnmount\n\n### 函数组件（Hooks）\n- useEffect 模拟 componentDidMount/DidUpdate/WillUnmount\n\n```js\nuseEffect(() => {\n  // 挂载+更新\n  return () => { /* 卸载清理 */ }\n}, [deps])\n```\n\n### 关键点\n- 空依赖 [] 只在挂载执行\n- 有依赖：依赖变化执行\n- 无依赖数组：每次渲染执行\n- 清理函数在卸载/下次执行前运行'
  },
  {
    id: 'react-hooks', cat: 'react', name: 'Hooks', level: 2, sort: 3, deps: ['react-jsx'],
    content: '## Hooks\n\n函数组件中的状态与副作用能力。\n\n### 常用 Hooks\n- useState：状态\n- useEffect：副作用\n- useMemo：缓存计算结果\n- useCallback：缓存函数\n- useRef：可变引用/DOM\n- useContext：上下文\n- useReducer：复杂状态\n\n### 自定义 Hook\n- 以 use 开头\n- 抽取可复用逻辑\n\n### 规则\n- 只在顶层调用（不能放条件/循环）\n- 只在函数组件或自定义 Hook 中调用\n- 顺序必须稳定（依赖链表存储）'
  },
  {
    id: 'react-vdom', cat: 'react', name: '虚拟 DOM 与 Diff', level: 3, sort: 4, deps: ['react-jsx'],
    content: '## 虚拟 DOM 与 Diff\n\n### 虚拟 DOM\n- JS 对象描述真实 DOM 结构\n- 减少直接操作 DOM 的开销\n\n### Diff 算法\n- 同层比较，type 不同则销毁重建\n- key 相同且 type 相同则复用\n- 跨层级不比较\n\n### key 的作用\n- 列表渲染唯一标识\n- 避免用 index（顺序变化导致错误复用）\n\n### 与 Vue 区别\n- React 单向 diff（头到尾），Vue 双端比较\n- 更新策略与调度机制不同'
  },
  {
    id: 'react-fiber', cat: 'react', name: 'Fiber 架构', level: 3, sort: 5, deps: ['react-vdom'],
    content: '## Fiber 架构\n\nReact 16 引入的可中断渲染架构。\n\n### 背景\n- 旧栈调和是递归，长任务阻塞主线程\n- Fiber 将渲染任务切片，可中断/恢复\n\n### 核心\n- Fiber 节点：虚拟 DOM 的链表结构\n- 双缓冲：current 与 workInProgress\n- 可中断的渲染阶段 + 不可中断的提交阶段\n\n### 调度\n- 优先级：用户交互 > 动画 > 数据更新\n- requestIdleCallback 思想（实际用 MessageChannel 模拟）\n- 时间切片（5ms）\n\n### 价值\n- 解决长列表卡顿\n- 支持并发模式（Concurrent Mode）'
  },
  {
    id: 'react-redux', cat: 'react', name: 'Redux 与 Zustand', level: 2, sort: 6, deps: ['react-hooks'],
    content: "## Redux 与 Zustand\n\n### Redux\n- 单一数据源 store\n- state 只读，通过 action 修改\n- reducer 纯函数\n- 中间件：redux-thunk、redux-saga\n\n### Zustand（轻量）\n```js\nimport { create } from 'zustand'\nconst useStore = create(set => ({\n  count: 0,\n  inc: () => set(s => ({ count: s.count + 1 }))\n}))\n```\n- 无 provider 包裹\n- API 极简，性能好\n\n### 选择\n- 大型项目可用 Redux（生态成熟）\n- 中小型用 Zustand 更轻量"
  },
  {
    id: 'react-router', cat: 'react', name: 'React Router', level: 2, sort: 7, deps: ['react-jsx'],
    content: '## React Router\n\n### 核心组件\n- BrowserRouter / HashRouter\n- Routes + Route\n- Link / NavLink\n- useNavigate / useParams / useLocation\n\n### v6 特性\n```jsx\n<Routes>\n  <Route path="/" element={<Home />} />\n  <Route path="/user/:id" element={<User />} />\n</Routes>\n```\n\n### 导航守卫\n- React Router 无内置守卫，需自定义组件或高阶函数\n\n### 与 Vue Router 区别\n- 声明式组件为主\n- 守卫需自行封装'
  },
  {
    id: 'react-ssr', cat: 'react', name: 'SSR 与 Next.js', level: 3, sort: 8, deps: ['react-jsx'],
    content: '## SSR 与 Next.js\n\n### Next.js（React 全栈框架）\n- 约定式路由（pages 或 app 目录）\n- 渲染模式：SSR/SSG/ISR/CSR\n\n### 数据获取\n- getServerSideProps：请求时渲染\n- getStaticProps：构建时生成\n- App Router：Server Components + Client Components\n\n### Server Components（RSC）\n- 服务端渲染，减少客户端 JS\n- "use client" 标记客户端组件\n\n### 优势\n- SEO、首屏性能、全栈能力\n- 内置路由、图片优化、API 路由'
  },
  {
    id: 'react-perf', cat: 'react', name: '性能优化', level: 2, sort: 9, deps: ['react-hooks'],
    content: '## 性能优化\n\n### 手段\n- React.memo：浅比较跳过重渲染\n- useMemo：缓存计算值\n- useCallback：缓存函数引用\n- 列表 key 优化\n- 代码分割：React.lazy + Suspense\n\n### 避免\n- 内联对象/函数作为依赖导致重复创建\n- 不必要的全局状态\n- 深比较的滥用\n\n### 虚拟列表\n- 长列表用 react-window / react-virtualized\n- 只渲染可视区域\n\n### 判断\n- 用 React DevTools Profiler 定位瓶颈\n- 不要过早优化'
  }
]

export const questions = [
  { id: 'q-react-1', cat: 'react', node: 'react-jsx', type: 'single', level: 1, tags: ['八股文'], q: 'JSX 中 class 属性应写作？', options: ['class', 'className', 'class-name', 'cls'], answer: 1, explain: 'class 是 JS 关键字，JSX 用 className。' },
  { id: 'q-react-2', cat: 'react', node: 'react-jsx', type: 'multi', level: 1, tags: ['八股文'], q: '关于 JSX，正确的是？', options: ['表达式用 {} 包裹', '编译成 createElement', '事件驼峰命名', '必须多根节点'], answer: [0, 1, 2], explain: 'JSX 可以单根节点或用 Fragment 包裹多节点。' },
  { id: 'q-react-3', cat: 'react', node: 'react-jsx', type: 'judge', level: 1, tags: ['八股文'], q: 'JSX 本质上会被编译成 React.createElement 调用。', options: ['正确', '错误'], answer: true, explain: 'JSX 是 createElement 的语法糖。' },
  { id: 'q-react-4', cat: 'react', node: 'react-lifecycle', type: 'single', level: 2, tags: ['八股文'], q: 'useEffect 依赖为空数组 [] 时的行为是？', options: ['每次渲染执行', '只在挂载执行', '从不执行', '只在卸载执行'], answer: 1, explain: '空依赖只在挂载时执行一次。' },
  { id: 'q-react-5', cat: 'react', node: 'react-lifecycle', type: 'multi', level: 2, tags: ['八股文'], q: 'useEffect 的清理函数何时执行？', options: ['组件卸载时', '下次 effect 执行前', '每次渲染前', '从不执行'], answer: [0, 1], explain: '清理函数在卸载或下次 effect 前执行。' },
  { id: 'q-react-6', cat: 'react', node: 'react-lifecycle', type: 'judge', level: 2, tags: ['八股文'], q: 'componentDidMount 对应 useEffect(() => {}, [])。', options: ['正确', '错误'], answer: true, explain: '空依赖的 useEffect 近似 componentDidMount。' },
  { id: 'q-react-7', cat: 'react', node: 'react-hooks', type: 'single', level: 2, tags: ['八股文'], q: '缓存函数引用、避免子组件不必要渲染的 Hook 是？', options: ['useCallback', 'useState', 'useRef', 'useEffect'], answer: 0, explain: 'useCallback 缓存函数，配合 memo 避免重渲染。' },
  { id: 'q-react-8', cat: 'react', node: 'react-hooks', type: 'multi', level: 2, tags: ['八股文'], q: 'Hooks 的使用规则有？', options: ['只在顶层调用', '只在函数组件/自定义 Hook 调用', '顺序必须稳定', '可放条件语句'], answer: [0, 1, 2], explain: 'Hook 不能放在条件/循环中，否则顺序错乱。' },
  { id: 'q-react-9', cat: 'react', node: 'react-hooks', type: 'judge', level: 2, tags: ['八股文'], q: 'useRef 的值变化不会触发组件重新渲染。', options: ['正确', '错误'], answer: true, explain: 'useRef 是可变引用，变更不触发渲染。' },
  { id: 'q-react-10', cat: 'react', node: 'react-vdom', type: 'single', level: 3, tags: ['八股文', '框架原理'], q: 'React diff 中 type 不同的元素会？', options: ['复用并更新', '销毁重建', '跳过', '仅改属性'], answer: 1, explain: 'type 不同直接销毁旧节点并新建。' },
  { id: 'q-react-11', cat: 'react', node: 'react-vdom', type: 'multi', level: 3, tags: ['框架原理'], q: '虚拟 DOM 的价值有？', options: ['减少直接 DOM 操作', '跨平台渲染', '便于 diff 计算', '提升所有场景性能'], answer: [0, 1, 2], explain: '虚拟 DOM 不是万能，简单场景直接操作 DOM 可能更快。' },
  { id: 'q-react-12', cat: 'react', node: 'react-vdom', type: 'judge', level: 3, tags: ['八股文'], q: '列表 key 应该使用稳定唯一的值。', options: ['正确', '错误'], answer: true, explain: '稳定唯一 key 保证 diff 正确复用。' },
  { id: 'q-react-13', cat: 'react', node: 'react-fiber', type: 'single', level: 3, tags: ['八股文', '框架原理'], q: 'Fiber 架构的核心优势是？', options: ['可中断渲染', '更小体积', '自动 SSR', '无需 key'], answer: 0, explain: 'Fiber 实现可中断、可恢复的渲染。' },
  { id: 'q-react-14', cat: 'react', node: 'react-fiber', type: 'multi', level: 3, tags: ['框架原理'], q: 'Fiber 采用的技术有？', options: ['链表结构', '双缓冲', '优先级调度', '时间切片'], answer: [0, 1, 2, 3], explain: '以上都是 Fiber 架构的关键技术。' },
  { id: 'q-react-15', cat: 'react', node: 'react-fiber', type: 'judge', level: 3, tags: ['框架原理'], q: 'Fiber 的提交阶段（commit）是可中断的。', options: ['正确', '错误'], answer: false, explain: '渲染阶段可中断，提交阶段不可中断。' },
  { id: 'q-react-16', cat: 'react', node: 'react-redux', type: 'single', level: 2, tags: ['八股文'], q: 'Redux 中修改 state 的唯一方式是？', options: ['直接改 state', 'dispatch action', '改 props', '改 store 对象'], answer: 1, explain: 'Redux 通过 dispatch action 触发 reducer 更新。' },
  { id: 'q-react-17', cat: 'react', node: 'react-redux', type: 'multi', level: 2, tags: ['八股文'], q: 'Redux 的三大原则是？', options: ['单一数据源', 'state 只读', 'reducer 纯函数', '可随意修改'], answer: [0, 1, 2], explain: 'Redux 三原则约束状态管理。' },
  { id: 'q-react-18', cat: 'react', node: 'react-redux', type: 'judge', level: 2, tags: ['八股文'], q: 'Zustand 使用前需要 Provider 包裹组件树。', options: ['正确', '错误'], answer: false, explain: 'Zustand 无需 Provider，直接使用 hook 订阅。' },
  { id: 'q-react-19', cat: 'react', node: 'react-router', type: 'single', level: 2, tags: ['八股文'], q: 'React Router v6 中定义路由的组件是？', options: ['<Switch>', '<Routes>', '<Router>', '<RouteView>'], answer: 1, explain: 'v6 用 <Routes> + <Route> 定义路由。' },
  { id: 'q-react-20', cat: 'react', node: 'react-router', type: 'multi', level: 2, tags: ['八股文'], q: 'React Router 提供的 Hook 有？', options: ['useNavigate', 'useParams', 'useLocation', 'useRoute'], answer: [0, 1, 2], explain: 'useNavigate/useParams/useLocation 是常用 Hook。' },
  { id: 'q-react-21', cat: 'react', node: 'react-router', type: 'judge', level: 2, tags: ['八股文'], q: 'React Router 内置了类似 Vue 的导航守卫。', options: ['正确', '错误'], answer: false, explain: 'React Router 无内置守卫，需自行封装。' },
  { id: 'q-react-22', cat: 'react', node: 'react-ssr', type: 'single', level: 3, tags: ['八股文'], q: 'Next.js 中标记客户端组件的指令是？', options: ['"use client"', '"use server"', '"client"', '"useEffect"'], answer: 0, explain: '"use client" 标记组件在客户端运行。' },
  { id: 'q-react-23', cat: 'react', node: 'react-ssr', type: 'multi', level: 3, tags: ['八股文'], q: 'Next.js 支持的渲染模式有？', options: ['SSR', 'SSG', 'ISR', 'CSR'], answer: [0, 1, 2, 3], explain: 'Next.js 支持多种渲染策略混合。' },
  { id: 'q-react-24', cat: 'react', node: 'react-ssr', type: 'judge', level: 3, tags: ['八股文'], q: 'Server Components 可以减少发送到客户端的 JS 体积。', options: ['正确', '错误'], answer: true, explain: 'RSC 在服务端渲染，减少客户端 JS。' },
  { id: 'q-react-25', cat: 'react', node: 'react-perf', type: 'single', level: 2, tags: ['八股文'], q: '浅比较跳过重渲染的高阶组件是？', options: ['React.memo', 'React.lazy', 'React.Fragment', 'React.StrictMode'], answer: 0, explain: 'React.memo 浅比较 props 决定是否重渲染。' },
  { id: 'q-react-26', cat: 'react', node: 'react-perf', type: 'multi', level: 2, tags: ['八股文'], q: 'React 性能优化手段有？', options: ['React.memo', 'useMemo/useCallback', '代码分割', '虚拟列表'], answer: [0, 1, 2, 3], explain: '以上都是常见优化手段。' },
  { id: 'q-react-27', cat: 'react', node: 'react-perf', type: 'judge', level: 2, tags: ['八股文'], q: '长列表渲染应使用虚拟列表只渲染可视区域。', options: ['正确', '错误'], answer: true, explain: '虚拟列表大幅减少 DOM 数量，提升长列表性能。' },
  { id: 'q-react-28', cat: 'react', node: 'react-hooks', type: 'single', level: 2, tags: ['场景题'], q: '复杂状态逻辑（多个子值联动）推荐使用？', options: ['useReducer', 'useState', 'useRef', 'useMemo'], answer: 0, explain: 'useReducer 适合管理复杂状态转换。' },
  { id: 'q-react-29', cat: 'react', node: 'react-vdom', type: 'single', level: 3, tags: ['框架原理'], q: 'React 与 Vue diff 的一个区别是？', options: ['React 单向 diff', 'Vue 单向 diff', '两者完全相同', '都跨层比较'], answer: 0, explain: 'React 单向 diff，Vue 采用双端比较优化。' },
  { id: 'q-react-30', cat: 'react', node: 'react-fiber', type: 'single', level: 3, tags: ['框架原理'], q: 'Fiber 时间切片的目标是？', options: ['避免长任务阻塞', '减少代码体积', '加快网络请求', '提升 SSR'], answer: 0, explain: '时间切片让渲染任务可分段，避免阻塞主线程。' }
]
