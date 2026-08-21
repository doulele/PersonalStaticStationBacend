/**
 * CSS 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'css-box', cat: 'css', name: '盒模型', level: 1, sort: 1, deps: [],
    content: '## 盒模型\n\n每个元素都是一个矩形盒子，由 content、padding、border、margin 组成。\n\n### 两种模式\n- **content-box**（默认）：width 只包含 content\n- **border-box**：width 包含 content + padding + border\n\n```css\n* { box-sizing: border-box; }\n```\n\n### 关键点\n- border-box 更符合直觉，多数重置样式中启用\n- margin 外边距可负值，padding 不可\n- 相邻元素 margin 会合并（取较大值）\n- 内联元素（inline）上下 padding/margin 不生效'
  },
  {
    id: 'css-selector', cat: 'css', name: '选择器优先级', level: 1, sort: 2, deps: [],
    content: '## 选择器与优先级\n\n### 优先级计算（特异性）\n- **内联样式**：1000\n- **ID 选择器**：100\n- **类/属性/伪类**：10\n- **元素/伪元素**：1\n\n### 规则\n- 比较时从左到右逐位比较，数值高者胜\n- `!important` 最高（但应少用）\n- 同优先级后者覆盖前者\n\n### 常用选择器\n- 后代 `A B`、子代 `A > B`、相邻兄弟 `A + B`、通用兄弟 `A ~ B`\n- 伪类：:hover、:nth-child(n)、:not()\n- 伪元素：::before、::after'
  },
  {
    id: 'css-flexgrid', cat: 'css', name: 'Flex 与 Grid', level: 2, sort: 3, deps: ['css-box'],
    content: '## Flex 与 Grid\n\n### Flexbox（一维布局）\n- 容器：display:flex\n- 主轴/交叉轴：flex-direction\n- 对齐：justify-content（主轴）、align-items（交叉轴）\n- 伸缩：flex: 1（flex-grow:1 剩余空间分配）\n\n### Grid（二维布局）\n- 容器：display:grid\n- 列/行：grid-template-columns / rows\n- 间距：gap\n- 定位：grid-column / grid-row\n- fr 单位：按比例分配\n\n### 选择\n- 一维排列用 Flex，二维网格用 Grid\n- Grid 适合整体页面骨架，Flex 适合组件内部'
  },
  {
    id: 'css-bfc', cat: 'css', name: 'BFC 块级格式化上下文', level: 2, sort: 4, deps: ['css-box'],
    content: '## BFC（Block Formatting Context）\n\n一个独立的渲染区域，内部元素布局不影响外部。\n\n### 触发条件\n- overflow 不为 visible\n- float 不为 none\n- position 为 absolute/fixed\n- display 为 inline-block/flex/grid/flow-root\n\n### 作用\n1. 清除浮动\n2. 阻止 margin 合并\n3. 阻止元素被浮动覆盖\n4. 自适应两栏布局\n\n### 应用\n- 父元素塌陷（子元素浮动）→ 父元素触发 BFC\n- 相邻 margin 合并 → 包一层触发 BFC'
  },
  {
    id: 'css-position', cat: 'css', name: '定位', level: 1, sort: 5, deps: [],
    content: '## 定位 Position\n\n### 取值\n- **static**（默认）：正常文档流\n- **relative**：相对自身原位置偏移，不脱离文档流\n- **absolute**：相对最近的非 static 祖先定位，脱离文档流\n- **fixed**：相对视口定位，脱离文档流\n- **sticky**：滚动到阈值后固定，不脱离文档流\n\n### 关键点\n- absolute 的定位基准是"最近定位祖先"\n- fixed 不随滚动移动\n- sticky 需配合 top/bottom 且父容器高度足够'
  },
  {
    id: 'css-responsive', cat: 'css', name: '响应式布局', level: 2, sort: 6, deps: ['css-flexgrid'],
    content: '## 响应式布局\n\n让页面在不同屏幕尺寸下自适应。\n\n### 核心手段\n- **媒体查询**：@media (max-width: 768px)\n- **流式布局**：百分比、rem/vw/vh\n- **弹性图片**：max-width: 100%\n- **移动优先**：先写移动样式，再增强\n\n### 断点\n- 手机 < 768px、平板 768-1024px、桌面 > 1024px\n\n### 单位\n- rem：相对根字号\n- vw/vh：相对视口宽高\n- clamp()：min + 理想 + max'
  },
  {
    id: 'css-animation', cat: 'css', name: '动画与过渡', level: 2, sort: 7, deps: [],
    content: '## 动画与过渡\n\n### Transition（过渡）\n- 属性变化时平滑过渡\n- transition: property duration timing-function delay\n- 需要触发条件（hover/类切换）\n\n### Animation（动画）\n```css\n@keyframes fade {\n  from { opacity: 0 }\n  to { opacity: 1 }\n}\n.box { animation: fade 1s ease; }\n```\n\n### 性能\n- 优先动画 transform/opacity（不触发重排）\n- 避免动画 width/height/top/left（触发重排重绘）\n- 可用 will-change 提前提升合成层\n- requestAnimationFrame 处理 JS 动画'
  },
  {
    id: 'css-preprocessor', cat: 'css', name: '预处理器', level: 2, sort: 8, deps: [],
    content: '## 预处理器 Sass/Less\n\n在 CSS 基础上增加变量、嵌套、混合等能力。\n\n### 核心特性\n- **变量**：`$primary: #333`\n- **嵌套**：选择器嵌套，父级引用 `&`\n- **Mixin**：`@mixin` + `@include` 复用样式\n- **函数**：颜色计算、数学运算\n- **模块化**：@import/@use 拆分文件\n\n### 区别\n- Sass 用 $ 变量、Less 用 @\n- Sass 生态更丰富（常用 SCSS 语法）\n- 编译后仍是标准 CSS\n\n### 注意\n- 原生 CSS 已支持变量（--var）与嵌套，简单场景可不用预处理器'
  },
  {
    id: 'css-houdini', cat: 'css', name: 'CSS Houdini', level: 4, sort: 9, deps: ['css-animation'],
    content: '## CSS Houdini\n\n一组底层 API，让开发者扩展 CSS 引擎能力。\n\n### 核心 API\n- **Paint API**：自定义绘制（CSS Paint Worklet）\n- **Properties and Values API**：注册自定义属性类型\n- **Layout API**：自定义布局算法\n- **Animation Worklet**：高性能动画\n\n### 价值\n- 直接操作渲染引擎，绕过 JS 主线程\n- 实现 CSS 原生无法表达的视觉效果\n\n### 现状\n- 浏览器兼容性有限（Chromium 支持较好）\n- 需配合 @supports 特性检测降级'
  }
]

export const questions = [
  { id: 'q-css-1', cat: 'css', node: 'css-box', type: 'single', level: 1, tags: ['八股文'], q: '默认 box-sizing 的取值是？', options: ['border-box', 'content-box', 'padding-box', 'margin-box'], answer: 1, explain: '默认 content-box，width 只含内容区。' },
  { id: 'q-css-2', cat: 'css', node: 'css-box', type: 'multi', level: 1, tags: ['八股文'], q: '关于盒模型，正确的是？', options: ['border-box 的 width 含 padding+border', 'margin 可为负值', 'padding 可为负值', '相邻 margin 可能合并'], answer: [0, 1, 3], explain: 'padding 不能为负值，其余正确。' },
  { id: 'q-css-3', cat: 'css', node: 'css-box', type: 'judge', level: 1, tags: ['八股文'], q: 'inline 元素的上下 padding 不会占据布局空间。', options: ['正确', '错误'], answer: true, explain: '内联元素上下 padding/margin 不影响行高与布局，视觉可能溢出。' },
  { id: 'q-css-4', cat: 'css', node: 'css-selector', type: 'single', level: 1, tags: ['八股文'], q: '优先级最高的是？', options: ['!important', '内联样式', 'ID 选择器', '类选择器'], answer: 0, explain: '!important 权重最高（但应谨慎使用）。' },
  { id: 'q-css-5', cat: 'css', node: 'css-selector', type: 'single', level: 1, tags: ['八股文'], q: '.a .b 选择器匹配的是？', options: ['所有 .b 后代', '直接子元素 .b', '相邻 .b', '同层 .b'], answer: 0, explain: '空格是后代选择器，匹配 .a 内所有 .b 后代。' },
  { id: 'q-css-6', cat: 'css', node: 'css-selector', type: 'judge', level: 2, tags: ['八股文'], q: '选择器优先级相同时，后定义的样式会覆盖先定义的。', options: ['正确', '错误'], answer: true, explain: '同优先级下，源码中靠后的规则生效。' },
  { id: 'q-css-7', cat: 'css', node: 'css-flexgrid', type: 'single', level: 2, tags: ['八股文'], q: 'Grid 布局中按比例分配列宽的单位是？', options: ['px', '%', 'fr', 'rem'], answer: 2, explain: 'fr 表示剩余空间的比例份额。' },
  { id: 'q-css-8', cat: 'css', node: 'css-flexgrid', type: 'multi', level: 2, tags: ['八股文'], q: 'Flex 容器中，justify-content 与 align-items 分别控制？', options: ['justify-content 主轴对齐', 'align-items 交叉轴对齐', '两者都是主轴', '两者都是交叉轴'], answer: [0, 1], explain: 'justify-content 沿主轴、align-items 沿交叉轴对齐。' },
  { id: 'q-css-9', cat: 'css', node: 'css-flexgrid', type: 'judge', level: 2, tags: ['八股文'], q: 'Flex 是一维布局，Grid 是二维布局。', options: ['正确', '错误'], answer: true, explain: 'Flex 沿单一方向，Grid 可同时控制行列二维。' },
  { id: 'q-css-10', cat: 'css', node: 'css-bfc', type: 'single', level: 2, tags: ['八股文'], q: '以下哪个属性不会触发 BFC？', options: ['overflow:hidden', 'display:flex', 'float:left', 'position:relative'], answer: 3, explain: 'position:relative 本身不脱离文档流且不触发 BFC（absolute/fixed 才触发）。' },
  { id: 'q-css-11', cat: 'css', node: 'css-bfc', type: 'multi', level: 2, tags: ['八股文'], q: 'BFC 可以解决的问题有？', options: ['清除浮动', '阻止 margin 合并', '阻止浮动覆盖', '解决变量作用域'], answer: [0, 1, 2], explain: 'BFC 是布局概念，与变量作用域无关。' },
  { id: 'q-css-12', cat: 'css', node: 'css-bfc', type: 'judge', level: 2, tags: ['八股文'], q: '子元素浮动导致父元素高度塌陷，可让父元素触发 BFC 解决。', options: ['正确', '错误'], answer: true, explain: '触发 BFC 后父元素会包含浮动子元素，高度不塌陷。' },
  { id: 'q-css-13', cat: 'css', node: 'css-position', type: 'single', level: 1, tags: ['八股文'], q: 'absolute 定位的基准是？', options: ['视口', '最近的非 static 祖先', 'body', 'html'], answer: 1, explain: 'absolute 相对最近的非 static 定位祖先元素定位。' },
  { id: 'q-css-14', cat: 'css', node: 'css-position', type: 'single', level: 1, tags: ['八股文'], q: '不随页面滚动而移动的定位是？', options: ['relative', 'absolute', 'fixed', 'static'], answer: 2, explain: 'fixed 相对视口固定，滚动时不移动。' },
  { id: 'q-css-15', cat: 'css', node: 'css-position', type: 'judge', level: 2, tags: ['八股文'], q: 'sticky 定位的元素会脱离文档流。', options: ['正确', '错误'], answer: false, explain: 'sticky 是 relative 与 fixed 的混合，不脱离文档流。' },
  { id: 'q-css-16', cat: 'css', node: 'css-responsive', type: 'single', level: 2, tags: ['八股文'], q: '相对根元素 font-size 的长度单位是？', options: ['em', 'rem', 'vw', 'px'], answer: 1, explain: 'rem 相对根元素 html 的字号。' },
  { id: 'q-css-17', cat: 'css', node: 'css-responsive', type: 'multi', level: 2, tags: ['八股文'], q: '实现响应式的常用手段有？', options: ['媒体查询', '百分比/rem 流式布局', '弹性图片', '固定像素宽度'], answer: [0, 1, 2], explain: '固定像素宽度无法自适应不同屏幕。' },
  { id: 'q-css-18', cat: 'css', node: 'css-responsive', type: 'judge', level: 2, tags: ['八股文'], q: '移动优先意味着先写桌面样式再写移动样式。', options: ['正确', '错误'], answer: false, explain: '移动优先是先写移动基础样式，再用媒体查询增强桌面。' },
  { id: 'q-css-19', cat: 'css', node: 'css-animation', type: 'single', level: 2, tags: ['八股文'], q: '以下哪个属性动画不会触发重排？', options: ['width', 'height', 'transform', 'top'], answer: 2, explain: 'transform/opacity 只触发合成，不触发重排重绘。' },
  { id: 'q-css-20', cat: 'css', node: 'css-animation', type: 'multi', level: 2, tags: ['八股文'], q: '关于动画，正确的是？', options: ['transition 需要触发条件', 'animation 由 @keyframes 定义', 'will-change 可提升合成层', '动画 width 性能最好'], answer: [0, 1, 2], explain: '动画 width 会触发重排，性能差。' },
  { id: 'q-css-21', cat: 'css', node: 'css-animation', type: 'judge', level: 2, tags: ['八股文'], q: 'requestAnimationFrame 会与浏览器刷新率同步执行回调。', options: ['正确', '错误'], answer: true, explain: 'rAF 在每次重绘前调用回调，与刷新率同步。' },
  { id: 'q-css-22', cat: 'css', node: 'css-preprocessor', type: 'single', level: 2, tags: ['八股文'], q: 'Sass 中定义变量使用的前缀是？', options: ['@', '$', '#', '--'], answer: 1, explain: 'Sass 用 $ 定义变量，Less 用 @，原生 CSS 用 --。' },
  { id: 'q-css-23', cat: 'css', node: 'css-preprocessor', type: 'multi', level: 2, tags: ['八股文'], q: '预处理器相比原生 CSS 的优势有？', options: ['变量复用', '选择器嵌套', 'Mixin 复用', '免编译直接运行'], answer: [0, 1, 2], explain: '预处理器需编译成 CSS 才能运行。' },
  { id: 'q-css-24', cat: 'css', node: 'css-preprocessor', type: 'judge', level: 2, tags: ['八股文'], q: '原生 CSS 已经支持变量（自定义属性）。', options: ['正确', '错误'], answer: true, explain: 'CSS 自定义属性 --var 已是标准能力。' },
  { id: 'q-css-25', cat: 'css', node: 'css-houdini', type: 'single', level: 4, tags: ['八股文'], q: 'CSS Houdini 中用于自定义绘制的 API 是？', options: ['Paint API', 'Fetch API', 'Storage API', 'History API'], answer: 0, explain: 'Paint API 通过 Worklet 实现自定义绘制。' },
  { id: 'q-css-26', cat: 'css', node: 'css-houdini', type: 'judge', level: 4, tags: ['八股文'], q: 'CSS Houdini 在所有主流浏览器中都得到完整支持。', options: ['正确', '错误'], answer: false, explain: 'Houdini 兼容性有限，Chromium 支持较好，需特性检测降级。' },
  { id: 'q-css-27', cat: 'css', node: 'css-houdini', type: 'multi', level: 4, tags: ['八股文'], q: 'CSS Houdini 的价值包括？', options: ['直接扩展渲染引擎', '绕过 JS 主线程', '实现原生难以表达的视觉', '完全替代 JS'], answer: [0, 1, 2], explain: 'Houdini 扩展而非替代 JS 逻辑。' }
]
