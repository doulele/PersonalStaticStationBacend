/**
 * Vue.js 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'vue-options', cat: 'vue', name: 'Options API', level: 1, sort: 1, deps: [],
    content: '## Options API\n\nVue2 传统写法，按选项组织组件逻辑。\n\n### 常用选项\n- data：响应式数据\n- methods：方法\n- computed：计算属性（缓存）\n- watch：侦听器\n- props/emits：父子通信\n- mixins：混入复用\n\n### computed 与 watch\n- computed：依赖变化才重算，有缓存\n- watch：监听变化执行副作用（异步）\n\n### 局限\n- 同一功能逻辑分散在不同选项，大型组件难维护\n- mixins 命名冲突、来源不清晰'
  },
  {
    id: 'vue-composition', cat: 'vue', name: 'Composition API', level: 2, sort: 2, deps: ['vue-options'],
    content: "## Composition API\n\nVue3 引入，按逻辑组织代码，setup 中编写。\n\n### 核心 API\n- ref / reactive：响应式\n- computed / watch / watchEffect\n- 生命周期钩子（onMounted 等）\n- provide / inject\n\n### 优势\n- 逻辑复用更清晰（组合式函数）\n- 更好的 TS 类型推导\n- 按功能组织，避免逻辑分散\n\n```js\nimport { ref, computed } from 'vue'\nconst count = ref(0)\nconst double = computed(() => count.value * 2)\n```\n\n### 注意\n- ref 需 .value 访问（模板中自动解包）\n- setup 语法糖 <script setup>"
  },
  {
    id: 'vue-reactivity', cat: 'vue', name: '响应式原理', level: 3, sort: 3, deps: ['vue-composition'],
    content: '## 响应式原理\n\n### Vue2\n- Object.defineProperty 劫持对象属性 getter/setter\n- 局限：无法监听新增/删除属性，需 $set；数组需重写方法\n\n### Vue3\n- Proxy 代理整个对象\n- 可监听新增/删除/数组索引变化\n- Reflect 配合实现默认行为\n\n### 依赖收集与派发\n- effect 执行时读取属性 → track 收集依赖\n- 属性变化 → trigger 派发更新\n- WeakMap: target → Map(key → Set(effect))\n\n### 关键点\n- ref 包装基本类型，reactive 包装对象\n- 响应式是"惰性"的：被读取才收集依赖'
  },
  {
    id: 'vue-lifecycle', cat: 'vue', name: '生命周期', level: 1, sort: 4, deps: ['vue-options'],
    content: '## 生命周期\n\n### Vue2 八大钩子\n- 创建：beforeCreate、created\n- 挂载：beforeMount、mounted\n- 更新：beforeUpdate、updated\n- 销毁：beforeDestroy、destroyed\n\n### Vue3（Composition）\n- onBeforeMount、onMounted、onBeforeUpdate、onUpdated、onBeforeUnmount、onUnmounted\n- setup 替代 beforeCreate/created\n\n### 关键点\n- created：可访问数据，未挂载 DOM\n- mounted：可访问 DOM\n- 父子挂载顺序：子先 mounted，父后 mounted\n- 异步请求常放 created/mounted'
  },
  {
    id: 'vue-pinia', cat: 'vue', name: 'Pinia 与 Vuex', level: 2, sort: 5, deps: ['vue-composition'],
    content: "## Pinia 与 Vuex\n\n### Vuex\n- state/getters/mutations/actions\n- mutation 同步修改 state，action 处理异步\n- 模块化 module\n\n### Pinia（Vue3 推荐）\n```js\nimport { defineStore } from 'pinia'\nexport const useStore = defineStore('main', {\n  state: () => ({ count: 0 }),\n  getters: { double: s => s.count * 2 },\n  actions: { increment() { this.count++ } }\n})\n```\n\n### Pinia 优势\n- 更简洁 API，去掉了 mutation\n- 更好的 TS 支持\n- 可直接修改 state\n- 模块化按 store 划分"
  },
  {
    id: 'vue-router', cat: 'vue', name: 'Vue Router', level: 2, sort: 6, deps: ['vue-options'],
    content: '## Vue Router\n\n### 路由模式\n- hash：带 #，兼容性好\n- history：无 #，需服务端配置回退\n\n### 核心\n- 动态路由：/user/:id\n- 嵌套路由：children\n- 导航守卫：beforeEach、beforeRouteEnter\n- 懒加载：component: () => import(...)\n\n### 导航守卫\n- 全局 beforeEach（登录拦截）\n- 路由独享 beforeEnter\n- 组件内 beforeRouteEnter/Update/Leave\n\n### 编程式导航\n- router.push / replace / go\n- 传参：query（?a=1）或 params（动态段）'
  },
  {
    id: 'vue-ssr', cat: 'vue', name: 'SSR 与 Nuxt', level: 3, sort: 7, deps: ['vue-composition'],
    content: '## SSR 与 Nuxt\n\n### SSR（服务端渲染）\n- 服务端生成 HTML，首屏快、SEO 好\n- 同构：同一份代码客户端/服务端运行\n\n### Nuxt3\n- 约定式路由（pages 目录）\n- 自动导入组件/组合式函数\n- 数据获取：useFetch、useAsyncData\n- 支持 SSG/SSR/CSR 混合\n\n### 注意事项\n- 服务端无 window/document，需在 onMounted 访问\n- 生命周期差异：服务端无 mounted\n- 数据序列化：服务端数据需可序列化\n\n### 优势\n- 首屏性能、SEO、用户体验'
  },
  {
    id: 'vue-diff', cat: 'vue', name: 'Diff 算法', level: 3, sort: 8, deps: ['vue-reactivity'],
    content: '## Diff 算法\n\n比较新旧虚拟 DOM，最小化更新真实 DOM。\n\n### 核心策略\n- 同层比较（不跨层）\n- 双端比较：新前/新后/旧前/旧后\n- key 标识节点复用\n\n### 过程\n1. 头头、尾尾、头尾、尾头比较\n2. 命中则移动/复用\n3. 未命中用 key 建立映射\n4. 新增/删除节点\n\n### key 的作用\n- 唯一标识节点，提升 diff 效率\n- 避免用 index 作 key（顺序变化导致错误复用）\n\n### 复杂度\n- 无 key：O(n)\n- 有 key：接近 O(n)（双端优化）'
  },
  {
    id: 'vue-nexttick', cat: 'vue', name: 'nextTick', level: 2, sort: 9, deps: ['vue-reactivity'],
    content: "## nextTick\n\nDOM 更新是异步的，nextTick 在更新后执行回调。\n\n### 原理\n- 数据变化 → 触发 watcher，但 DOM 更新异步批处理\n- nextTick 将回调放入微任务队列（Promise）\n- DOM 更新完成后执行\n\n### 使用\n```js\nimport { nextTick } from 'vue'\ncount.value++\nawait nextTick()\n// 此时 DOM 已更新\n```\n\n### 应用\n- 修改数据后立即操作 DOM\n- 获取更新后的 DOM 尺寸/位置"
  }
]

export const questions = [
  { id: 'q-vue-1', cat: 'vue', node: 'vue-options', type: 'single', level: 1, tags: ['八股文'], q: '有缓存、依赖变化才重算的是？', options: ['computed', 'watch', 'methods', 'data'], answer: 0, explain: 'computed 有缓存，依赖不变不重算。' },
  { id: 'q-vue-2', cat: 'vue', node: 'vue-options', type: 'multi', level: 1, tags: ['八股文'], q: 'Options API 的局限有？', options: ['逻辑分散难维护', 'mixins 命名冲突', '来源不清晰', '无法复用'], answer: [0, 1, 2], explain: 'Options API 可复用（mixins），但存在冲突与可读性问题。' },
  { id: 'q-vue-3', cat: 'vue', node: 'vue-options', type: 'judge', level: 1, tags: ['八股文'], q: 'watch 适合执行异步操作或副作用。', options: ['正确', '错误'], answer: true, explain: 'watch 监听变化执行副作用，computed 用于派生值。' },
  { id: 'q-vue-4', cat: 'vue', node: 'vue-composition', type: 'single', level: 2, tags: ['八股文'], q: '在 JS 中访问 ref 的值需要？', options: ['.value', '.current', '.get()', '直接访问'], answer: 0, explain: 'ref 在 JS 中通过 .value 访问（模板自动解包）。' },
  { id: 'q-vue-5', cat: 'vue', node: 'vue-composition', type: 'multi', level: 2, tags: ['八股文'], q: 'Composition API 的优势有？', options: ['逻辑复用清晰', '更好 TS 推导', '按功能组织', '完全不需要生命周期'], answer: [0, 1, 2], explain: '仍需生命周期钩子，只是写法变化。' },
  { id: 'q-vue-6', cat: 'vue', node: 'vue-composition', type: 'judge', level: 2, tags: ['八股文'], q: '<script setup> 中定义的变量会自动暴露给模板。', options: ['正确', '错误'], answer: true, explain: 'script setup 中顶层绑定可直接在模板使用。' },
  { id: 'q-vue-7', cat: 'vue', node: 'vue-reactivity', type: 'single', level: 3, tags: ['八股文', '框架原理'], q: 'Vue3 响应式基于？', options: ['Object.defineProperty', 'Proxy', 'Object.observe', '脏检查'], answer: 1, explain: 'Vue3 用 Proxy + Reflect 实现响应式。' },
  { id: 'q-vue-8', cat: 'vue', node: 'vue-reactivity', type: 'multi', level: 3, tags: ['框架原理'], q: 'Vue3 响应式相比 Vue2 的改进？', options: ['可监听新增属性', '可监听删除', '可监听数组索引', '无需 $set'], answer: [0, 1, 2, 3], explain: 'Proxy 全面解决 defineProperty 的局限。' },
  { id: 'q-vue-9', cat: 'vue', node: 'vue-reactivity', type: 'judge', level: 3, tags: ['框架原理'], q: '响应式依赖收集发生在属性被读取时。', options: ['正确', '错误'], answer: true, explain: 'effect 读取属性时 track 收集依赖。' },
  { id: 'q-vue-10', cat: 'vue', node: 'vue-lifecycle', type: 'single', level: 1, tags: ['八股文'], q: '可以访问 DOM 的生命周期是？', options: ['created', 'beforeCreate', 'mounted', 'setup'], answer: 2, explain: 'mounted 时 DOM 已挂载，可访问。' },
  { id: 'q-vue-11', cat: 'vue', node: 'vue-lifecycle', type: 'multi', level: 2, tags: ['八股文'], q: '关于父子生命周期顺序，正确的是？', options: ['父 beforeCreate 先', '子 mounted 先于父 mounted', '父 created 先于子', '父 mounted 先于子'], answer: [0, 1, 2], explain: '挂载阶段子组件先 mounted，父后 mounted。' },
  { id: 'q-vue-12', cat: 'vue', node: 'vue-lifecycle', type: 'judge', level: 1, tags: ['八股文'], q: '异步数据请求通常放在 created 或 mounted。', options: ['正确', '错误'], answer: true, explain: '这两个阶段适合发起初始化请求。' },
  { id: 'q-vue-13', cat: 'vue', node: 'vue-pinia', type: 'single', level: 2, tags: ['八股文'], q: 'Pinia 相比 Vuex 去掉了哪个概念？', options: ['state', 'mutation', 'getters', 'actions'], answer: 1, explain: 'Pinia 去掉了 mutation，直接在 actions 中改 state。' },
  { id: 'q-vue-14', cat: 'vue', node: 'vue-pinia', type: 'multi', level: 2, tags: ['八股文'], q: 'Vuex 的核心概念有？', options: ['state', 'getters', 'mutations', 'actions'], answer: [0, 1, 2, 3], explain: 'Vuex 四要素 state/getters/mutations/actions。' },
  { id: 'q-vue-15', cat: 'vue', node: 'vue-pinia', type: 'judge', level: 2, tags: ['八股文'], q: 'Pinia 对 TypeScript 的支持优于 Vuex。', options: ['正确', '错误'], answer: true, explain: 'Pinia 为 Vue3 设计，TS 类型推导更好。' },
  { id: 'q-vue-16', cat: 'vue', node: 'vue-router', type: 'single', level: 2, tags: ['八股文'], q: '无需服务端配置、兼容性更好的路由模式是？', options: ['hash', 'history', 'abstract', 'memory'], answer: 0, explain: 'hash 模式无需服务端回退配置。' },
  { id: 'q-vue-17', cat: 'vue', node: 'vue-router', type: 'multi', level: 2, tags: ['八股文'], q: '导航守卫的类型有？', options: ['全局 beforeEach', '路由独享 beforeEnter', '组件内守卫', 'afterEach'], answer: [0, 1, 2], explain: 'afterEach 是全局后置钩子，非守卫。' },
  { id: 'q-vue-18', cat: 'vue', node: 'vue-router', type: 'judge', level: 2, tags: ['八股文'], q: '动态路由 /user/:id 通过 params 获取 id。', options: ['正确', '错误'], answer: true, explain: '动态段通过 route.params.id 获取。' },
  { id: 'q-vue-19', cat: 'vue', node: 'vue-ssr', type: 'single', level: 3, tags: ['八股文'], q: 'SSR 的主要优势是？', options: ['首屏快 + SEO 好', '减少代码量', '无需服务端', '提升 CSS 性能'], answer: 0, explain: 'SSR 服务端生成 HTML，首屏快且利于 SEO。' },
  { id: 'q-vue-20', cat: 'vue', node: 'vue-ssr', type: 'multi', level: 3, tags: ['八股文'], q: 'SSR 开发中需要注意？', options: ['服务端无 window', '服务端无 mounted', '数据需可序列化', '客户端无需水合'], answer: [0, 1, 2], explain: 'SSR 需要客户端水合（hydrate），不是无需。' },
  { id: 'q-vue-21', cat: 'vue', node: 'vue-ssr', type: 'judge', level: 3, tags: ['八股文'], q: 'Nuxt3 采用约定式路由（pages 目录自动生成路由）。', options: ['正确', '错误'], answer: true, explain: 'Nuxt3 基于 pages 目录约定自动生成路由。' },
  { id: 'q-vue-22', cat: 'vue', node: 'vue-diff', type: 'single', level: 3, tags: ['八股文', '框架原理'], q: 'Diff 算法中标识节点复用的属性是？', options: ['key', 'id', 'ref', 'name'], answer: 0, explain: 'key 唯一标识节点，用于 diff 复用判断。' },
  { id: 'q-vue-23', cat: 'vue', node: 'vue-diff', type: 'multi', level: 3, tags: ['框架原理'], q: 'Vue diff 的策略有？', options: ['同层比较', '双端比较', 'key 复用', '跨层比较'], answer: [0, 1, 2], explain: 'diff 不跨层比较，只同层。' },
  { id: 'q-vue-24', cat: 'vue', node: 'vue-diff', type: 'judge', level: 3, tags: ['八股文'], q: '列表渲染用 index 作为 key 是最佳实践。', options: ['正确', '错误'], answer: false, explain: 'index 作 key 在顺序变化时会错误复用，应用稳定唯一 id。' },
  { id: 'q-vue-25', cat: 'vue', node: 'vue-nexttick', type: 'single', level: 2, tags: ['八股文'], q: 'DOM 更新后执行回调应使用？', options: ['nextTick', 'setTimeout', 'watch', 'computed'], answer: 0, explain: 'nextTick 在 DOM 异步更新后执行回调。' },
  { id: 'q-vue-26', cat: 'vue', node: 'vue-nexttick', type: 'judge', level: 2, tags: ['八股文'], q: 'Vue 的 DOM 更新是同步的。', options: ['正确', '错误'], answer: false, explain: 'Vue 批量异步更新 DOM，需 nextTick 获取更新后结果。' },
  { id: 'q-vue-27', cat: 'vue', node: 'vue-nexttick', type: 'multi', level: 2, tags: ['八股文'], q: 'nextTick 的应用场景有？', options: ['修改数据后操作 DOM', '获取更新后尺寸', '异步批处理', '声明响应式'], answer: [0, 1, 2], explain: '声明响应式是 ref/reactive 的职责。' },
  { id: 'q-vue-28', cat: 'vue', node: 'vue-reactivity', type: 'single', level: 3, tags: ['框架原理'], q: '依赖收集的存储结构是？', options: ['WeakMap(target→Map(key→Set))', '数组', '对象', 'Map(target→Set)'], answer: 0, explain: 'WeakMap 存 target，Map 存 key，Set 存 effect。' },
  { id: 'q-vue-29', cat: 'vue', node: 'vue-composition', type: 'single', level: 2, tags: ['场景题'], q: '跨层级组件通信推荐使用？', options: ['provide/inject', 'props 层层传', '全局变量', '事件总线'], answer: 0, explain: 'provide/inject 适合跨层级传值，props 层层传较繁琐。' },
  { id: 'q-vue-30', cat: 'vue', node: 'vue-router', type: 'single', level: 2, tags: ['场景题'], q: '路由懒加载的写法是？', options: ['() => import()', 'require()', 'import 顶层', '动态 require'], answer: 0, explain: '动态 import() 实现路由级代码分割。' }
]
