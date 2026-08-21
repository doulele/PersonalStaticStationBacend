/**
 * 图形学与可视化 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'gfx-webgl', cat: 'graphics', name: 'WebGL', level: 3, sort: 1, deps: [],
    content: '## WebGL\n\n浏览器中的 OpenGL ES 实现，可访问 GPU 加速图形。\n\n### 核心\n- 上下文：canvas.getContext("webgl")\n- 着色器：顶点 + 片元着色器\n- 缓冲区：顶点数据\n- 绘制：drawArrays/drawElements\n\n### 渲染流程\n1. 创建着色器程序\n2. 上传顶点数据\n3. 设置 uniform\n4. 绘制\n\n### 特点\n- 高性能 GPU 渲染\n- 底层 API 复杂，学习曲线陡\n- 通常配合 Three.js 等库使用'
  },
  {
    id: 'gfx-threejs', cat: 'graphics', name: 'Three.js', level: 3, sort: 2, deps: ['gfx-webgl'],
    content: '## Three.js\n\n封装 WebGL 的 3D 图形库。\n\n### 核心三要素\n- **场景（Scene）**：容器\n- **相机（Camera）**：透视/正交\n- **渲染器（Renderer）**：WebGLRenderer\n\n```js\nconst scene = new THREE.Scene()\nconst camera = new THREE.PerspectiveCamera(75, w/h, 0.1, 1000)\nconst renderer = new THREE.WebGLRenderer()\nrenderer.render(scene, camera)\n```\n\n### 核心概念\n- 几何体（Geometry）、材质（Material）、网格（Mesh）\n- 光照（Light）、动画循环（requestAnimationFrame）\n- 模型加载（GLTF）\n\n### 应用\n- 3D 可视化、游戏、产品展示'
  },
  {
    id: 'gfx-webgpu', cat: 'graphics', name: 'WebGPU', level: 4, sort: 3, deps: ['gfx-webgl'],
    content: '## WebGPU\n\n新一代 Web 图形 API，对标 Vulkan/Metal/DX12。\n\n### 与 WebGL 区别\n- WebGPU 更底层、更现代\n- 显式资源管理\n- Compute Shader（计算着色器）\n- 更低开销\n\n### 核心概念\n- Adapter / Device\n- Pipeline（渲染/计算管线）\n- Command Encoder\n- WGSL 着色语言\n\n### 现状\n- Chrome/Edge 已支持\n- 生态发展中\n\n### 价值\n- 更好的 GPU 利用\n- 通用计算能力（GPGPU）'
  },
  {
    id: 'gfx-d3', cat: 'graphics', name: 'D3.js', level: 2, sort: 4, deps: [],
    content: '## D3.js\n\n数据驱动文档（Data-Driven Documents）。\n\n### 核心\n- 数据绑定：selection.data()\n- enter/update/exit 模式\n- 比例尺：scaleLinear/scaleOrdinal\n- 布局：force、tree、pack\n\n```js\nsvg.selectAll("rect")\n  .data(data)\n  .enter().append("rect")\n```\n\n### 特点\n- 灵活强大，自由度高\n- 学习曲线较陡\n- 适合自定义复杂可视化\n\n### 与 ECharts 对比\n- D3 灵活但代码多\n- ECharts 开箱即用'
  },
  {
    id: 'gfx-canvas2d', cat: 'graphics', name: 'Canvas2D', level: 2, sort: 5, deps: [],
    content: '## Canvas2D\n\n2D 绘图上下文，绘制图形与图像。\n\n### 核心 API\n- 路径：beginPath/moveTo/lineTo\n- 样式：fillStyle/strokeStyle\n- 图形：rect/arc/bezierCurveTo\n- 变换：translate/rotate/scale\n- 图像：drawImage\n\n### 动画\n- 清空画布 → 绘制 → requestAnimationFrame\n\n### 性能\n- 减少状态切换\n- 离屏渲染（OffscreenCanvas）\n- 批量绘制\n\n### 应用\n- 图表、游戏、图像处理'
  },
  {
    id: 'gfx-echarts', cat: 'graphics', name: 'ECharts 图表', level: 2, sort: 6, deps: ['gfx-canvas2d'],
    content: "## ECharts 图表\n\nApache 开源的可视化图表库。\n\n### 特点\n- 开箱即用、图表类型丰富\n- 交互能力（tooltip/zoom）\n- 支持 Canvas/SVG 渲染\n\n### 使用\n```js\nconst chart = echarts.init(dom)\nchart.setOption({\n  xAxis: { data: [...] },\n  series: [{ type: 'bar', data: [...] }]\n})\n```\n\n### 常见图表\n- 折线 line、柱状 bar、饼图 pie\n- 雷达 radar、散点 scatter、热力图 heatmap\n\n### 优化\n- 大数据量用 dataZoom\n- 关闭不需要的动画\n- 按需引入减少体积"
  },
  {
    id: 'gfx-shader', cat: 'graphics', name: '着色器', level: 3, sort: 7, deps: ['gfx-webgl'],
    content: '## 着色器（Shader）\n\n在 GPU 上运行的小程序。\n\n### 顶点着色器\n- 处理每个顶点的位置变换\n- gl_Position 输出裁剪坐标\n\n### 片元着色器\n- 处理每个像素的颜色\n- gl_FragColor 输出颜色\n\n### 变量\n- attribute：顶点数据\n- uniform：全局常量\n- varying：顶点→片元插值\n\n### GLSL 示例\n```glsl\n// 片元\nvoid main() {\n  gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);\n}\n```'
  },
  {
    id: 'gfx-render', cat: 'graphics', name: '渲染管线', level: 3, sort: 8, deps: ['gfx-webgl'],
    content: '## 渲染管线\n\n图形数据到屏幕像素的处理流程。\n\n### 阶段\n1. 顶点处理（顶点着色器）\n2. 图元装配\n3. 光栅化\n4. 片元处理（片元着色器）\n5. 输出合并\n\n### 变换矩阵\n- 模型矩阵 → 视图矩阵 → 投影矩阵\n- MVP 变换\n\n### 关键\n- 光栅化将几何转像素\n- 深度测试（Z-buffer）处理遮挡\n- 混合处理透明度\n\n### 价值\n- 理解图形渲染底层原理\n- 优化渲染性能'
  }
]

export const questions = [
  { id: 'q-gfx-1', cat: 'graphics', node: 'gfx-webgl', type: 'single', level: 3, tags: ['八股文'], q: 'WebGL 是浏览器中的哪套 API 实现？', options: ['OpenGL ES', 'DirectX', 'Metal', 'Vulkan'], answer: 0, explain: 'WebGL 基于 OpenGL ES 规范。' },
  { id: 'q-gfx-2', cat: 'graphics', node: 'gfx-webgl', type: 'multi', level: 3, tags: ['八股文'], q: 'WebGL 渲染需要？', options: ['着色器程序', '顶点缓冲区', 'uniform 变量', 'canvas 上下文'], answer: [0, 1, 2, 3], explain: '这些都是 WebGL 渲染的基本要素。' },
  { id: 'q-gfx-3', cat: 'graphics', node: 'gfx-webgl', type: 'judge', level: 3, tags: ['八股文'], q: 'WebGL 可以直接访问 GPU 进行硬件加速。', options: ['正确', '错误'], answer: true, explain: 'WebGL 通过 GPU 实现高性能渲染。' },
  { id: 'q-gfx-4', cat: 'graphics', node: 'gfx-threejs', type: 'single', level: 3, tags: ['八股文'], q: 'Three.js 的核心三要素是？', options: ['场景/相机/渲染器', '节点/组件/状态', '模型/纹理/灯光', 'DOM/CSS/JS'], answer: 0, explain: 'Scene/Camera/Renderer 是 Three.js 三要素。' },
  { id: 'q-gfx-5', cat: 'graphics', node: 'gfx-threejs', type: 'multi', level: 3, tags: ['八股文'], q: 'Three.js 动画循环通常使用？', options: ['requestAnimationFrame', 'setInterval', 'render 循环', 'setTimeout'], answer: [0, 2], explain: '用 rAF 驱动 render 循环，与刷新率同步。' },
  { id: 'q-gfx-6', cat: 'graphics', node: 'gfx-threejs', type: 'judge', level: 3, tags: ['八股文'], q: 'Three.js 封装了 WebGL 的底层细节。', options: ['正确', '错误'], answer: true, explain: 'Three.js 抽象 WebGL API，降低 3D 开发门槛。' },
  { id: 'q-gfx-7', cat: 'graphics', node: 'gfx-webgpu', type: 'single', level: 4, tags: ['八股文'], q: 'WebGPU 使用的着色语言是？', options: ['WGSL', 'GLSL', 'HLSL', 'MSL'], answer: 0, explain: 'WebGPU 使用 WGSL 着色语言。' },
  { id: 'q-gfx-8', cat: 'graphics', node: 'gfx-webgpu', type: 'multi', level: 4, tags: ['八股文'], q: 'WebGPU 相比 WebGL 的优势？', options: ['更底层现代', 'Compute Shader', '更低开销', '更简单 API'], answer: [0, 1, 2], explain: 'WebGPU 更底层现代但 API 更复杂。' },
  { id: 'q-gfx-9', cat: 'graphics', node: 'gfx-webgpu', type: 'judge', level: 4, tags: ['八股文'], q: 'WebGPU 支持通用计算（GPGPU）。', options: ['正确', '错误'], answer: true, explain: 'Compute Shader 使 WebGPU 可用于通用计算。' },
  { id: 'q-gfx-10', cat: 'graphics', node: 'gfx-d3', type: 'single', level: 2, tags: ['八股文'], q: 'D3.js 的核心思想是？', options: ['数据驱动文档', '组件化', '模板渲染', '声明式'], answer: 0, explain: 'D3 即 Data-Driven Documents。' },
  { id: 'q-gfx-11', cat: 'graphics', node: 'gfx-d3', type: 'multi', level: 2, tags: ['八股文'], q: 'D3 数据绑定的模式是？', options: ['enter', 'update', 'exit', 'append'], answer: [0, 1, 2], explain: 'enter/update/exit 是 D3 三大数据绑定阶段。' },
  { id: 'q-gfx-12', cat: 'graphics', node: 'gfx-d3', type: 'judge', level: 2, tags: ['八股文'], q: 'D3 比 ECharts 更灵活但代码量更多。', options: ['正确', '错误'], answer: true, explain: 'D3 自由度高、代码多，ECharts 开箱即用。' },
  { id: 'q-gfx-13', cat: 'graphics', node: 'gfx-canvas2d', type: 'single', level: 2, tags: ['八股文'], q: 'Canvas2D 绘制路径首先调用？', options: ['beginPath', 'fill', 'stroke', 'closePath'], answer: 0, explain: 'beginPath 开启新路径。' },
  { id: 'q-gfx-14', cat: 'graphics', node: 'gfx-canvas2d', type: 'multi', level: 2, tags: ['八股文'], q: 'Canvas2D 动画的步骤有？', options: ['清空画布', '绘制内容', 'requestAnimationFrame', 'setInterval 必用'], answer: [0, 1, 2], explain: '清空→绘制→rAF 循环是标准流程。' },
  { id: 'q-gfx-15', cat: 'graphics', node: 'gfx-canvas2d', type: 'judge', level: 2, tags: ['八股文'], q: 'OffscreenCanvas 可在 Worker 中离屏渲染。', options: ['正确', '错误'], answer: true, explain: 'OffscreenCanvas 支持在 Worker 中渲染。' },
  { id: 'q-gfx-16', cat: 'graphics', node: 'gfx-echarts', type: 'single', level: 2, tags: ['八股文'], q: 'ECharts 初始化实例的方法是？', options: ['echarts.init', 'new ECharts', 'echarts.create', 'echarts.render'], answer: 0, explain: 'echarts.init(dom) 初始化图表实例。' },
  { id: 'q-gfx-17', cat: 'graphics', node: 'gfx-echarts', type: 'multi', level: 2, tags: ['八股文'], q: 'ECharts 支持的图表类型有？', options: ['折线图', '柱状图', '雷达图', '热力图'], answer: [0, 1, 2, 3], explain: 'ECharts 图表类型丰富，以上都支持。' },
  { id: 'q-gfx-18', cat: 'graphics', node: 'gfx-echarts', type: 'judge', level: 2, tags: ['八股文'], q: 'ECharts 同时支持 Canvas 与 SVG 渲染。', options: ['正确', '错误'], answer: true, explain: 'ECharts 可按需切换 Canvas/SVG 渲染器。' },
  { id: 'q-gfx-19', cat: 'graphics', node: 'gfx-shader', type: 'single', level: 3, tags: ['八股文'], q: '处理每个像素颜色的着色器是？', options: ['片元着色器', '顶点着色器', '几何着色器', '计算着色器'], answer: 0, explain: '片元着色器处理像素颜色。' },
  { id: 'q-gfx-20', cat: 'graphics', node: 'gfx-shader', type: 'multi', level: 3, tags: ['八股文'], q: 'GLSL 中的变量类型有？', options: ['attribute', 'uniform', 'varying', 'let'], answer: [0, 1, 2], explain: 'GLSL 用 attribute/uniform/varying，无 let。' },
  { id: 'q-gfx-21', cat: 'graphics', node: 'gfx-shader', type: 'judge', level: 3, tags: ['八股文'], q: '着色器程序运行在 GPU 上。', options: ['正确', '错误'], answer: true, explain: '着色器是 GPU 上并行执行的小程序。' },
  { id: 'q-gfx-22', cat: 'graphics', node: 'gfx-render', type: 'single', level: 3, tags: ['八股文'], q: '将几何图形转为像素的过程是？', options: ['光栅化', '变换', '混合', '裁剪'], answer: 0, explain: '光栅化将图元转为像素。' },
  { id: 'q-gfx-23', cat: 'graphics', node: 'gfx-render', type: 'multi', level: 3, tags: ['八股文'], q: 'MVP 变换包含哪些矩阵？', options: ['模型矩阵', '视图矩阵', '投影矩阵', '旋转矩阵'], answer: [0, 1, 2], explain: 'MVP 是 Model/View/Projection 变换。' },
  { id: 'q-gfx-24', cat: 'graphics', node: 'gfx-render', type: 'judge', level: 3, tags: ['八股文'], q: '深度测试（Z-buffer）用于处理物体遮挡。', options: ['正确', '错误'], answer: true, explain: '深度测试决定像素可见性，处理遮挡。' },
  { id: 'q-gfx-25', cat: 'graphics', node: 'gfx-threejs', type: 'single', level: 3, tags: ['场景题'], q: '加载 GLTF 3D 模型的加载器是？', options: ['GLTFLoader', 'TextureLoader', 'ImageLoader', 'FontLoader'], answer: 0, explain: 'GLTFLoader 加载 glTF/glb 模型。' },
  { id: 'q-gfx-26', cat: 'graphics', node: 'gfx-echarts', type: 'single', level: 2, tags: ['场景题'], q: '大数据量图表性能优化可用？', options: ['dataZoom', '全部渲染', '增大字体', '关闭 tooltip 无用'], answer: 0, explain: 'dataZoom 支持数据窗口缩放减少渲染量。' },
  { id: 'q-gfx-27', cat: 'graphics', node: 'gfx-d3', type: 'single', level: 2, tags: ['场景题'], q: 'D3 中比例尺 scaleLinear 的作用是？', options: ['线性映射数据到坐标', '颜色映射', '时间映射', '排序'], answer: 0, explain: 'scaleLinear 线性映射数值域到像素域。' },
  { id: 'q-gfx-28', cat: 'graphics', node: 'gfx-webgpu', type: 'judge', level: 4, tags: ['八股文'], q: 'WebGPU 的 Command Encoder 用于记录渲染命令。', options: ['正确', '错误'], answer: true, explain: 'Command Encoder 记录命令提交给 GPU 执行。' }
]
