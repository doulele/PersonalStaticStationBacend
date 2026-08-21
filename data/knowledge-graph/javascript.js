/**
 * JavaScript 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'js-basics', cat: 'javascript', name: '基础语法与类型', level: 1, sort: 1, deps: [],
    content: '## 基础语法与类型\n\n### 数据类型\n- **原始类型**：string/number/boolean/null/undefined/symbol/bigint\n- **引用类型**：object/array/function\n\n### 类型判断\n- typeof：判断原始类型（typeof null 为 "object" 是历史 bug）\n- instanceof：判断引用类型（原型链）\n- Object.prototype.toString.call()：最准确\n\n### 相等比较\n- == 会类型转换，=== 严格相等（推荐）\n- 0/""/null/undefined/NaN 都是 falsy 值\n\n### var/let/const\n- let/const 块级作用域，var 函数作用域\n- const 不可重新赋值（对象属性可变）\n- 存在暂时性死区（TDZ）'
  },
  {
    id: 'js-closure', cat: 'javascript', name: '作用域与闭包', level: 2, sort: 2, deps: ['js-basics'],
    content: '## 作用域与闭包\n\n### 作用域\n- 全局作用域、函数作用域、块级作用域（let/const）\n- 作用域链：从内向外查找变量\n\n### 闭包\n函数可以访问其定义时所在作用域的变量，即使函数在别处执行。\n\n```js\nfunction counter() {\n  let count = 0\n  return function() { return ++count }\n}\nconst c = counter()\nc() // 1\nc() // 2\n```\n\n### 应用与注意\n- 应用：私有变量、函数柯里化、防抖节流\n- 注意：闭包持有引用可能导致内存泄漏（如循环中 var 创建闭包）'
  },
  {
    id: 'js-prototype', cat: 'javascript', name: '原型与原型链', level: 2, sort: 3, deps: ['js-basics'],
    content: '## 原型与原型链\n\n### 核心概念\n- 每个函数都有 prototype 属性（指向原型对象）\n- 每个对象都有 __proto__（指向构造函数的 prototype）\n- 原型链的终点是 Object.prototype，其 __proto__ 为 null\n\n### 继承\n```js\nfunction Parent() {}\nParent.prototype.say = function() {}\nfunction Child() {}\nChild.prototype = Object.create(Parent.prototype)\nChild.prototype.constructor = Child\n```\n\n### instanceof 原理\n沿对象的原型链查找，看是否出现构造函数的 prototype。\n\n### class 语法糖\nclass 本质是原型的语法糖，constructor 对应构造函数。'
  },
  {
    id: 'js-this', cat: 'javascript', name: 'this 指向', level: 2, sort: 4, deps: ['js-basics'],
    content: "## this 指向\n\n### 绑定规则（优先级从高到低）\n1. **new 绑定**：指向新创建的对象\n2. **显式绑定**：call/apply/bind 指定\n3. **隐式绑定**：对象方法调用，指向调用对象\n4. **默认绑定**：严格模式 undefined，非严格 window\n\n### 箭头函数\n- 没有自己的 this，继承定义时外层作用域的 this\n- 不能作为构造函数，没有 arguments\n\n### 场景\n```js\nconst obj = { name: 'a', fn() { console.log(this.name) } }\nconst f = obj.fn\nf() // undefined（默认绑定）\nobj.fn() // 'a'（隐式绑定）\n```"
  },
  {
    id: 'js-async', cat: 'javascript', name: '异步编程', level: 2, sort: 5, deps: ['js-basics'],
    content: '## 异步编程\n\n### 演进\n回调函数 → Promise → async/await\n\n### Promise\n- 三种状态：pending/fulfilled/rejected（不可逆）\n- then 链式调用，catch 捕获错误\n- Promise.all 并行，Promise.race 竞速\n- Promise.allSettled 全部结束（成功失败都返回）\n\n### async/await\n- async 函数返回 Promise\n- await 暂停执行直到 Promise 完成\n- 用 try/catch 捕获错误\n\n### 手写要点\n- 回调地狱 → Promise 链\n- 错误处理：await 必须 try/catch，否则未捕获 reject'
  },
  {
    id: 'js-eventloop', cat: 'javascript', name: 'Event Loop', level: 3, sort: 6, deps: ['js-async'],
    content: '## Event Loop 事件循环\n\n### 宏任务与微任务\n- **宏任务**：script、setTimeout、setInterval、I/O、setImmediate\n- **微任务**：Promise.then、MutationObserver、queueMicrotask\n\n### 执行顺序\n1. 执行同步代码（当前宏任务）\n2. 清空所有微任务队列\n3. 渲染（浏览器）\n4. 取出下一个宏任务执行\n\n### 经典题\n```js\nconsole.log(1)\nsetTimeout(() => console.log(2), 0)\nPromise.resolve().then(() => console.log(3))\nconsole.log(4)\n// 输出：1 4 3 2\n```\n\n### 关键点\n- 微任务优先于下一个宏任务\n- setTimeout 0 不保证立即执行（最小延迟约 4ms）'
  },
  {
    id: 'js-es6', cat: 'javascript', name: 'ES6+ 新特性', level: 1, sort: 7, deps: ['js-basics'],
    content: '## ES6+ 新特性\n\n### 常用特性\n- **let/const**：块级作用域\n- **箭头函数**：简洁、this 继承\n- **解构赋值**：数组/对象解构\n- **模板字符串**：反引号插值\n- **展开运算符**：...spread\n- **默认参数/剩余参数**\n- **class**：类语法\n- **模块化**：import/export\n- **Map/Set**：新集合类型\n- **Symbol**：唯一值\n\n### 后续版本\n- ES2020：可选链 ?.、空值合并 ??、BigInt\n- ES2021：Promise.any、逻辑赋值\n- ES2022：class 私有字段 #、top-level await'
  },
  {
    id: 'js-proxy', cat: 'javascript', name: 'Proxy 与 Reflect', level: 3, sort: 8, deps: ['js-basics'],
    content: '## Proxy 与 Reflect\n\n### Proxy\n拦截对象的基本操作，可自定义行为。\n\n```js\nconst p = new Proxy(target, {\n  get(obj, key) { return obj[key] },\n  set(obj, key, val) { obj[key] = val; return true }\n})\n```\n\n### 常见陷阱（trap）\n- get/set：读取/写入\n- has：in 操作符\n- deleteProperty：删除\n- ownKeys：Object.keys\n\n### Reflect\n- 提供与 Proxy 陷阱一一对应的方法\n- 更规范的默认行为实现\n\n### 应用\n- Vue3 响应式核心（Proxy 替代 defineProperty）\n- 数据校验、日志、只读代理'
  },
  {
    id: 'js-iterator', cat: 'javascript', name: '迭代器与生成器', level: 3, sort: 9, deps: ['js-basics'],
    content: '## 迭代器与生成器\n\n### 迭代器（Iterator）\n- 实现 next() 方法，返回 { value, done }\n- Symbol.iterator 定义对象可迭代\n- 可被 for...of、扩展运算符消费\n\n### 生成器（Generator）\n```js\nfunction* gen() {\n  yield 1\n  yield 2\n  yield 3\n}\nconst g = gen()\ng.next() // { value: 1, done: false }\n```\n\n### 应用\n- 惰性求值（按需产生数据）\n- async/await 的底层实现（生成器 + Promise）\n- 实现无限序列\n\n### 关键点\n- yield 暂停函数执行\n- next() 可传值作为上次 yield 的返回值'
  }
]

export const questions = [
  { id: 'q-js-1', cat: 'javascript', node: 'js-basics', type: 'single', level: 1, tags: ['八股文'], q: 'typeof null 的结果是？', options: ['"null"', '"object"', '"undefined"', '"number"'], answer: 1, explain: '这是 JS 的历史遗留 bug，typeof null 返回 "object"。' },
  { id: 'q-js-2', cat: 'javascript', node: 'js-basics', type: 'multi', level: 1, tags: ['八股文'], q: '以下属于 falsy 值的有？', options: ['0', '""', 'null', '{}'], answer: [0, 1, 2], explain: '空对象 {} 是 truthy，其余都是 falsy。' },
  { id: 'q-js-3', cat: 'javascript', node: 'js-basics', type: 'judge', level: 1, tags: ['八股文'], q: 'const 声明的对象，其属性不能被修改。', options: ['正确', '错误'], answer: false, explain: 'const 禁止重新赋值，但对象属性可变。' },
  { id: 'q-js-4', cat: 'javascript', node: 'js-closure', type: 'single', level: 2, tags: ['八股文'], q: '闭包的本质是？', options: ['函数可以记住其词法作用域', '函数立即执行', '函数递归调用', '变量提升'], answer: 0, explain: '闭包使函数能访问定义时作用域的变量。' },
  { id: 'q-js-5', cat: 'javascript', node: 'js-closure', type: 'multi', level: 2, tags: ['八股文'], q: '闭包的常见应用有？', options: ['私有变量', '函数柯里化', '防抖节流', '声明全局变量'], answer: [0, 1, 2], explain: '闭包用于封装，不是声明全局变量。' },
  { id: 'q-js-6', cat: 'javascript', node: 'js-closure', type: 'judge', level: 2, tags: ['八股文'], q: '循环中使用 var 创建闭包会共享同一个变量。', options: ['正确', '错误'], answer: true, explain: 'var 无块级作用域，循环闭包共享同一变量，应改用 let。' },
  { id: 'q-js-7', cat: 'javascript', node: 'js-prototype', type: 'single', level: 2, tags: ['八股文'], q: '原型链的终点是？', options: ['Object.prototype', 'null', 'Function.prototype', 'window'], answer: 1, explain: 'Object.prototype 的 __proto__ 指向 null，是链的终点。' },
  { id: 'q-js-8', cat: 'javascript', node: 'js-prototype', type: 'multi', level: 2, tags: ['八股文'], q: '关于原型，正确的是？', options: ['函数有 prototype 属性', '对象有 __proto__', 'class 是原型的语法糖', '原型链查找从对象本身开始'], answer: [0, 1, 2, 3], explain: '以上描述均正确。' },
  { id: 'q-js-9', cat: 'javascript', node: 'js-prototype', type: 'judge', level: 2, tags: ['八股文'], q: 'instanceof 沿原型链查找构造函数的 prototype。', options: ['正确', '错误'], answer: true, explain: 'instanceof 正是基于原型链判断。' },
  { id: 'q-js-10', cat: 'javascript', node: 'js-this', type: 'single', level: 2, tags: ['八股文'], q: '箭头函数的 this 指向？', options: ['调用对象', '定义时外层作用域', 'window', 'new 的对象'], answer: 1, explain: '箭头函数无自己的 this，继承定义时外层作用域。' },
  { id: 'q-js-11', cat: 'javascript', node: 'js-this', type: 'multi', level: 2, tags: ['八股文'], q: '可以改变函数 this 指向的方法有？', options: ['call', 'apply', 'bind', 'new'], answer: [0, 1, 2], explain: 'call/apply 立即执行并指定 this，bind 返回新函数；new 也改变 this 但属于构造调用。' },
  { id: 'q-js-12', cat: 'javascript', node: 'js-this', type: 'judge', level: 2, tags: ['八股文'], q: '严格模式下，函数独立调用时 this 是 window。', options: ['正确', '错误'], answer: false, explain: '严格模式下默认绑定 this 为 undefined，非严格才是 window。' },
  { id: 'q-js-13', cat: 'javascript', node: 'js-async', type: 'single', level: 2, tags: ['八股文'], q: 'Promise 的状态从 pending 变为 fulfilled 后，还能再变吗？', options: ['能变为 rejected', '不能，状态不可逆', '能回到 pending', '可无限次变'], answer: 1, explain: 'Promise 状态一旦改变就不可逆。' },
  { id: 'q-js-14', cat: 'javascript', node: 'js-async', type: 'multi', level: 2, tags: ['八股文'], q: 'Promise.all 与 allSettled 的区别？', options: ['all 有 reject 立即失败', 'allSettled 等待全部结束', 'all 并行执行', 'allSettled 串行执行'], answer: [0, 1, 2], explain: 'allSettled 也是并行的，区别在于是否因 reject 短路。' },
  { id: 'q-js-15', cat: 'javascript', node: 'js-async', type: 'judge', level: 2, tags: ['八股文'], q: 'async 函数始终返回一个 Promise。', options: ['正确', '错误'], answer: true, explain: 'async 函数返回值会被包装成 Promise。' },
  { id: 'q-js-16', cat: 'javascript', node: 'js-eventloop', type: 'single', level: 3, tags: ['八股文'], q: '属于微任务的是？', options: ['setTimeout', 'Promise.then', 'setInterval', 'script'], answer: 1, explain: 'Promise.then 是微任务，setTimeout/setInterval/script 是宏任务。' },
  { id: 'q-js-17', cat: 'javascript', node: 'js-eventloop', type: 'multi', level: 3, tags: ['八股文'], q: '关于 Event Loop，正确的是？', options: ['先执行同步代码', '再清空微任务', '微任务优先于下一个宏任务', '宏任务优先于微任务'], answer: [0, 1, 2], explain: '每轮宏任务后先清空微任务队列，再执行下一宏任务。' },
  { id: 'q-js-18', cat: 'javascript', node: 'js-eventloop', type: 'judge', level: 3, tags: ['八股文'], q: 'setTimeout(fn, 0) 的回调会立即执行。', options: ['正确', '错误'], answer: false, explain: 'setTimeout 是宏任务，需等同步代码与微任务完成，且有最小延迟。' },
  { id: 'q-js-19', cat: 'javascript', node: 'js-es6', type: 'single', level: 1, tags: ['八股文'], q: '可选链操作符是？', options: ['??', '?.', '?:', '::'], answer: 1, explain: '?. 用于安全访问可能为 null/undefined 的属性。' },
  { id: 'q-js-20', cat: 'javascript', node: 'js-es6', type: 'multi', level: 1, tags: ['八股文'], q: 'ES6 新增的数据结构有？', options: ['Map', 'Set', 'WeakMap', 'Array'], answer: [0, 1, 2], explain: 'Array 是既有类型，Map/Set/WeakMap 是 ES6 新增。' },
  { id: 'q-js-21', cat: 'javascript', node: 'js-es6', type: 'judge', level: 1, tags: ['八股文'], q: '展开运算符 ... 可以用于数组和对象。', options: ['正确', '错误'], answer: true, explain: '... 可展开可迭代对象和对象字面量。' },
  { id: 'q-js-22', cat: 'javascript', node: 'js-proxy', type: 'single', level: 3, tags: ['八股文', '框架原理'], q: 'Vue3 响应式核心是基于哪个特性实现？', options: ['Object.defineProperty', 'Proxy', 'Object.observe', 'Symbol'], answer: 1, explain: 'Vue3 使用 Proxy 实现响应式，替代 Vue2 的 defineProperty。' },
  { id: 'q-js-23', cat: 'javascript', node: 'js-proxy', type: 'multi', level: 3, tags: ['八股文'], q: 'Proxy 相比 defineProperty 的优势？', options: ['可监听新增属性', '可监听数组索引变化', '可监听删除', '性能更高'], answer: [0, 1, 2], explain: 'Proxy 能拦截更多操作，但性能未必更高。' },
  { id: 'q-js-24', cat: 'javascript', node: 'js-proxy', type: 'judge', level: 3, tags: ['八股文'], q: 'Reflect 提供了与 Proxy 陷阱对应的默认行为方法。', options: ['正确', '错误'], answer: true, explain: 'Reflect 方法与 Proxy trap 一一对应，提供默认实现。' },
  { id: 'q-js-25', cat: 'javascript', node: 'js-iterator', type: 'single', level: 3, tags: ['八股文'], q: '使对象可被 for...of 遍历，需要实现？', options: ['Symbol.iterator', 'Symbol.toStringTag', 'next 函数', 'length 属性'], answer: 0, explain: '实现 Symbol.iterator 方法使对象成为可迭代对象。' },
  { id: 'q-js-26', cat: 'javascript', node: 'js-iterator', type: 'multi', level: 3, tags: ['八股文'], q: '生成器函数的特点是？', options: ['yield 暂停执行', 'next() 恢复执行', '可惰性求值', '不能返回多个值'], answer: [0, 1, 2], explain: '生成器通过 yield 可多次产出值。' },
  { id: 'q-js-27', cat: 'javascript', node: 'js-iterator', type: 'judge', level: 3, tags: ['八股文'], q: 'async/await 的底层可以用生成器 + Promise 实现。', options: ['正确', '错误'], answer: true, explain: 'async/await 可理解为生成器 + 自动执行器的语法糖。' },
  { id: 'q-js-28', cat: 'javascript', node: 'js-async', type: 'single', level: 3, tags: ['手写题'], q: '手写 Promise 需要实现的核心方法是？', options: ['then', 'catch', 'resolve/reject', '以上都是'], answer: 3, explain: 'Promise 规范要求 then/catch/静态 resolve、reject 等方法。' },
  { id: 'q-js-29', cat: 'javascript', node: 'js-this', type: 'single', level: 2, tags: ['手写题'], q: '手写 bind 的核心是返回一个？', options: ['新函数，内部用 apply 指定 this', '原函数', '立即执行结果', '箭头函数'], answer: 0, explain: 'bind 返回绑定 this 的新函数，调用时用 apply 执行。' },
  { id: 'q-js-30', cat: 'javascript', node: 'js-async', type: 'multi', level: 3, tags: ['场景题'], q: '处理大量并发请求且要限流的场景，适合？', options: ['Promise.all 分批', '手写并发池', 'async/await 循环', '一次性全部 Promise.all'], answer: [0, 1], explain: '一次性 all 可能压垮服务，应分批或控制并发上限。' }
]
