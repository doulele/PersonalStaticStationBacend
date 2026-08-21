/**
 * TypeScript 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'ts-basics', cat: 'typescript', name: '基础类型', level: 1, sort: 1, deps: [],
    content: '## TypeScript 基础类型\n\n### 常用类型\n- string/number/boolean\n- array：number[] 或 Array<number>\n- tuple：元组 [string, number]\n- enum：枚举\n- any/unknown/never/void\n- null/undefined\n\n### any 与 unknown\n- any 关闭类型检查（危险）\n- unknown 更安全，需收窄后才能使用\n\n### never 与 void\n- void：无返回值（undefined）\n- never：永不返回（抛错/死循环），是任何类型的子类型\n\n### 类型断言\n- as 语法、尖括号语法\n- 非空断言 !'
  },
  {
    id: 'ts-interface', cat: 'typescript', name: '接口与类型别名', level: 1, sort: 2, deps: ['ts-basics'],
    content: '## 接口与类型别名\n\n### Interface\n```ts\ninterface User {\n  name: string\n  age?: number // 可选\n  readonly id: number\n}\n```\n- 可扩展：extends\n- 可声明合并（同名 interface 自动合并）\n\n### Type Alias\n```ts\ntype Point = { x: number; y: number }\n```\n- 联合类型、交叉类型、元组等更灵活\n- 不可声明合并\n\n### 选择\n- 描述对象结构优先 interface\n- 需要联合/交叉/元组等用 type'
  },
  {
    id: 'ts-generics', cat: 'typescript', name: '泛型', level: 2, sort: 3, deps: ['ts-interface'],
    content: '## 泛型\n\n让类型作为参数，实现可复用、类型安全的组件。\n\n```ts\nfunction identity<T>(arg: T): T { return arg }\ninterface ApiResponse<T> { data: T }\n```\n\n### 约束\n```ts\nfunction fn<T extends { length: number }>(arg: T) {\n  return arg.length\n}\n```\n\n### 常见泛型\n- 内置：Array<T>、Promise<T>、Partial<T>、Record<K, V>\n- 泛型约束、默认泛型参数\n\n### 价值\n- 函数返回类型与参数类型关联\n- 减少 any 滥用，保持类型推导'
  },
  {
    id: 'ts-guard', cat: 'typescript', name: '类型守卫与收窄', level: 2, sort: 4, deps: ['ts-basics'],
    content: "## 类型守卫与收窄\n\n让 TS 在分支中缩小类型范围。\n\n### 常用方式\n- typeof：判断原始类型\n- instanceof：判断类实例\n- in：判断属性存在\n- 自定义守卫：\n```ts\nfunction isString(x: unknown): x is string {\n  return typeof x === 'string'\n}\n```\n\n### 联合类型收窄\n```ts\ntype A = string | number\nfunction fn(x: A) {\n  if (typeof x === 'string') x.toUpperCase() // 收窄为 string\n}\n```\n\n### 价值\n- 让 unknown 安全转为具体类型\n- 处理联合类型的不同分支"
  },
  {
    id: 'ts-decorator', cat: 'typescript', name: '装饰器', level: 3, sort: 5, deps: ['ts-basics'],
    content: '## 装饰器\n\n声明式地给类/方法/属性附加元数据与行为。\n\n### 类型\n- 类装饰器、方法装饰器、属性装饰器、参数装饰器\n\n```ts\nfunction log(target: any, key: string, desc: PropertyDescriptor) {\n  const original = desc.value\n  desc.value = function(...args: any[]) {\n    console.log(`call ${key}`)\n    return original.apply(this, args)\n  }\n}\nclass C {\n  @log\n  method() {}\n}\n```\n\n### 应用\n- NestJS/Angular 大量使用\n- 依赖注入、路由定义、日志\n- 需开启 experimentalDecorators'
  },
  {
    id: 'ts-tsconfig', cat: 'typescript', name: 'tsconfig 配置', level: 2, sort: 6, deps: ['ts-basics'],
    content: '## tsconfig 配置\n\n### 核心选项\n- **target**：编译目标 ES 版本\n- **module**：模块规范（ESNext/CommonJS）\n- **strict**：严格模式（推荐开启）\n- **moduleResolution**：模块解析策略（node/bundler）\n- **paths**：路径别名\n- **include/exclude**：编译范围\n\n### strict 包含\n- strictNullChecks：null/undefined 检查\n- noImplicitAny：禁止隐式 any\n- strictFunctionTypes：函数类型逆变\n\n### 最佳实践\n- 开启 strict\n- 与构建工具（vite/webpack）配置保持一致'
  },
  {
    id: 'ts-advance', cat: 'typescript', name: '高级类型', level: 3, sort: 7, deps: ['ts-generics'],
    content: '## 高级类型\n\n### 常用工具类型\n- Partial<T>：全部可选\n- Required<T>：全部必填\n- Pick<T, K>：选取部分\n- Omit<T, K>：排除部分\n- Readonly<T>：只读\n- Record<K, T>：映射类型\n\n### 条件类型\n```ts\ntype T = X extends Y ? A : B\n```\n- 配合 infer 提取类型\n\n### 映射类型\n```ts\ntype Readonly<T> = { readonly [K in keyof T]: T[K] }\n```\n\n### 价值\n- 减少重复类型定义\n- 类型间转换与推导'
  },
  {
    id: 'ts-infer', cat: 'typescript', name: '类型推断', level: 2, sort: 8, deps: ['ts-basics'],
    content: '## 类型推断\n\nTS 自动推导类型，减少显式标注。\n\n### 场景\n- 变量初始化：let x = 3 → number\n- 函数返回值推断\n- 上下文推断（事件回调参数）\n\n### 最佳实践\n- 简单场景让 TS 自动推断\n- 函数签名、复杂对象建议显式标注\n- 避免过度标注，保持简洁\n\n### infer 关键字\n在条件类型中提取类型：\n```ts\ntype Return<T> = T extends (...args: any[]) => infer R ? R : never\n```'
  },
  {
    id: 'ts-typechallenge', cat: 'typescript', name: '类型体操', level: 4, sort: 9, deps: ['ts-advance'],
    content: '## 类型体操\n\n利用类型系统实现复杂类型运算，挑战类型系统极限。\n\n### 常见题型\n- 实现类型工具：DeepReadonly、TupleToUnion、Permutation\n- 递归类型\n- 数字/字符串运算（模板字面量类型）\n\n### 核心技巧\n- 条件类型 + infer + 递归\n- 联合类型分发（distributive conditional types）\n- 模板字面量类型\n\n```ts\ntype DeepReadonly<T> = {\n  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K]\n}\n```\n\n### 价值\n- 深入理解类型系统\n- 面试进阶考察点'
  }
]

export const questions = [
  { id: 'q-ts-1', cat: 'typescript', node: 'ts-basics', type: 'single', level: 1, tags: ['八股文'], q: '表示函数永不返回的类型是？', options: ['void', 'never', 'any', 'undefined'], answer: 1, explain: 'never 表示永不返回（抛错或死循环），void 表示无返回值。' },
  { id: 'q-ts-2', cat: 'typescript', node: 'ts-basics', type: 'multi', level: 1, tags: ['八股文'], q: '关于 any 与 unknown，正确的是？', options: ['any 关闭类型检查', 'unknown 更安全', 'unknown 需收窄后使用', '两者完全相同'], answer: [0, 1, 2], explain: 'unknown 需先收窄，比 any 更安全。' },
  { id: 'q-ts-3', cat: 'typescript', node: 'ts-basics', type: 'judge', level: 1, tags: ['八股文'], q: '元组类型可以定义固定长度和类型顺序的数组。', options: ['正确', '错误'], answer: true, explain: '元组如 [string, number] 固定了长度与各位置类型。' },
  { id: 'q-ts-4', cat: 'typescript', node: 'ts-interface', type: 'single', level: 1, tags: ['八股文'], q: 'interface 与 type 的一个关键区别是？', options: ['interface 可声明合并', 'type 可描述对象', 'interface 可写函数类型', 'type 不能描述联合类型'], answer: 0, explain: '同名 interface 自动合并，type 不能声明合并。' },
  { id: 'q-ts-5', cat: 'typescript', node: 'ts-interface', type: 'multi', level: 1, tags: ['八股文'], q: 'interface 支持的修饰符有？', options: ['readonly', '? 可选', 'extends 继承', 'implements'], answer: [0, 1, 2], explain: 'implements 是类实现接口的关键字，接口本身不 implements。' },
  { id: 'q-ts-6', cat: 'typescript', node: 'ts-interface', type: 'judge', level: 2, tags: ['八股文'], q: 'type 可以定义联合类型。', options: ['正确', '错误'], answer: true, explain: 'type 擅长定义联合、交叉、元组等类型。' },
  { id: 'q-ts-7', cat: 'typescript', node: 'ts-generics', type: 'single', level: 2, tags: ['八股文'], q: '泛型约束使用的关键字是？', options: ['extends', 'implements', 'super', 'typeof'], answer: 0, explain: '泛型用 extends 约束类型参数的范围。' },
  { id: 'q-ts-8', cat: 'typescript', node: 'ts-generics', type: 'multi', level: 2, tags: ['八股文'], q: '泛型的价值包括？', options: ['类型复用', '返回类型与参数关联', '减少 any 滥用', '提升运行时性能'], answer: [0, 1, 2], explain: '泛型是编译期能力，不影响运行时性能。' },
  { id: 'q-ts-9', cat: 'typescript', node: 'ts-generics', type: 'judge', level: 2, tags: ['八股文'], q: '泛型可以设置默认类型参数。', options: ['正确', '错误'], answer: true, explain: '如 function f<T = string>() 可设默认泛型。' },
  { id: 'q-ts-10', cat: 'typescript', node: 'ts-guard', type: 'single', level: 2, tags: ['八股文'], q: '自定义类型守卫函数的返回类型写法是？', options: ['x is string', 'x as string', 'x: string', 'boolean'], answer: 0, explain: '使用 x is string 类型谓词声明守卫。' },
  { id: 'q-ts-11', cat: 'typescript', node: 'ts-guard', type: 'multi', level: 2, tags: ['八股文'], q: '可用于类型收窄的方式有？', options: ['typeof', 'instanceof', 'in 操作符', '自定义守卫'], answer: [0, 1, 2, 3], explain: '以上方式均可收窄类型。' },
  { id: 'q-ts-12', cat: 'typescript', node: 'ts-guard', type: 'judge', level: 2, tags: ['八股文'], q: '类型收窄让 TS 在分支中缩小联合类型的范围。', options: ['正确', '错误'], answer: true, explain: '收窄后可在分支中使用具体类型的方法。' },
  { id: 'q-ts-13', cat: 'typescript', node: 'ts-decorator', type: 'single', level: 3, tags: ['八股文'], q: '使用装饰器需开启的编译选项是？', options: ['experimentalDecorators', 'strict', 'jsx', 'sourceMap'], answer: 0, explain: '装饰器需开启 experimentalDecorators。' },
  { id: 'q-ts-14', cat: 'typescript', node: 'ts-decorator', type: 'multi', level: 3, tags: ['八股文'], q: '装饰器的类型有？', options: ['类装饰器', '方法装饰器', '属性装饰器', '参数装饰器'], answer: [0, 1, 2, 3], explain: '四类装饰器均可定义。' },
  { id: 'q-ts-15', cat: 'typescript', node: 'ts-decorator', type: 'judge', level: 3, tags: ['八股文'], q: 'NestJS 大量使用装饰器实现依赖注入与路由。', options: ['正确', '错误'], answer: true, explain: 'NestJS 的 @Injectable/@Controller 等都是装饰器。' },
  { id: 'q-ts-16', cat: 'typescript', node: 'ts-tsconfig', type: 'single', level: 2, tags: ['八股文'], q: '开启严格模式检查的配置是？', options: ['"strict": true', '"strict": false', '"noImplicitAny": false', '"target"'], answer: 0, explain: 'strict 开启全部严格检查。' },
  { id: 'q-ts-17', cat: 'typescript', node: 'ts-tsconfig', type: 'multi', level: 2, tags: ['八股文'], q: 'strict 模式包含的检查有？', options: ['strictNullChecks', 'noImplicitAny', 'strictFunctionTypes', 'allowJs'], answer: [0, 1, 2], explain: 'allowJs 是单独配置，非 strict 子项。' },
  { id: 'q-ts-18', cat: 'typescript', node: 'ts-tsconfig', type: 'judge', level: 2, tags: ['八股文'], q: 'paths 配置可用于路径别名。', options: ['正确', '错误'], answer: true, explain: 'paths 配合 baseUrl 实现 @/ 等路径别名。' },
  { id: 'q-ts-19', cat: 'typescript', node: 'ts-advance', type: 'single', level: 3, tags: ['八股文'], q: '将类型所有属性变为可选的工具类型是？', options: ['Partial', 'Required', 'Pick', 'Omit'], answer: 0, explain: 'Partial<T> 将所有属性变为可选。' },
  { id: 'q-ts-20', cat: 'typescript', node: 'ts-advance', type: 'multi', level: 3, tags: ['八股文'], q: '条件类型常用配合的关键字是？', options: ['extends', 'infer', 'keyof', 'await'], answer: [0, 1, 2], explain: '条件类型用 extends 判断、infer 提取、keyof 取键。' },
  { id: 'q-ts-21', cat: 'typescript', node: 'ts-advance', type: 'judge', level: 3, tags: ['八股文'], q: 'Omit<T, K> 会从 T 中排除 K 指定的键。', options: ['正确', '错误'], answer: true, explain: 'Omit 是排除键，Pick 是选取键。' },
  { id: 'q-ts-22', cat: 'typescript', node: 'ts-infer', type: 'single', level: 3, tags: ['八股文'], q: '在条件类型中提取函数返回值类型的关键字是？', options: ['infer', 'typeof', 'keyof', 'extends'], answer: 0, explain: 'infer R 在条件类型中声明并推断类型变量。' },
  { id: 'q-ts-23', cat: 'typescript', node: 'ts-infer', type: 'judge', level: 2, tags: ['八股文'], q: 'let x = 3 会被推断为 number 类型。', options: ['正确', '错误'], answer: true, explain: 'TS 会从初始化值自动推断类型。' },
  { id: 'q-ts-24', cat: 'typescript', node: 'ts-infer', type: 'multi', level: 2, tags: ['八股文'], q: '类型推断的好处有？', options: ['减少冗余标注', '保持代码简洁', '仍保证类型安全', '完全不需要标注'], answer: [0, 1, 2], explain: '复杂场景仍需显式标注，不能完全省略。' },
  { id: 'q-ts-25', cat: 'typescript', node: 'ts-typechallenge', type: 'single', level: 4, tags: ['八股文'], q: '类型体操中实现递归类型的常见方式是？', options: ['条件类型 + 递归', 'for 循环', 'while 循环', '枚举'], answer: 0, explain: '类型层面无循环语句，靠条件类型递归实现。' },
  { id: 'q-ts-26', cat: 'typescript', node: 'ts-typechallenge', type: 'judge', level: 4, tags: ['八股文'], q: '联合类型在条件类型中会自动分发（distributive）。', options: ['正确', '错误'], answer: true, explain: '裸类型参数在条件类型中会对联合类型分发。' },
  { id: 'q-ts-27', cat: 'typescript', node: 'ts-typechallenge', type: 'multi', level: 4, tags: ['八股文'], q: '类型体操常用技巧有？', options: ['infer 提取', '模板字面量类型', '递归类型', '运行时反射'], answer: [0, 1, 2], explain: '类型体操在编译期，无运行时反射。' }
]
