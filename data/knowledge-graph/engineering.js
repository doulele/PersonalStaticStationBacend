/**
 * 前端工程化 分类 - 知识点与题目
 */
export const nodes = [
  {
    id: 'eng-pkg', cat: 'engineering', name: '包管理工具', level: 1, sort: 1, deps: [],
    content: '## 包管理工具\n\n### npm\n- Node 默认包管理器\n- package.json 声明依赖\n- 语义化版本 semver\n\n### yarn\n- 并行安装更快\n- yarn.lock 锁定版本\n\n### pnpm\n- 硬链接 + 符号链接，节省磁盘\n- 严格的 node_modules 结构（幽灵依赖少）\n- 安装速度快\n\n### 版本规范\n- ^1.2.3：兼容 1.x\n- ~1.2.3：兼容 1.2.x\n- 精确 1.2.3\n\n### lock 文件\n- package-lock/yarn.lock/pnpm-lock 锁定依赖版本，保证一致性'
  },
  {
    id: 'eng-webpack', cat: 'engineering', name: 'Webpack', level: 2, sort: 2, deps: ['eng-pkg'],
    content: '## Webpack\n\n模块打包器，将各种资源打包成浏览器可用的产物。\n\n### 核心概念\n- **entry**：入口\n- **output**：输出\n- **loader**：转换非 JS 资源\n- **plugin**：扩展构建能力\n- **mode**：开发/生产\n\n### 工作流程\n1. 从 entry 出发构建依赖图\n2. loader 转换模块\n3. plugin 干预构建\n4. 输出 bundle\n\n### 优化\n- 代码分割（SplitChunks）\n- 懒加载\n- 缓存（contenthash）\n- 持久化缓存\n\n### 与 Vite 区别\n- Webpack 全量打包，Vite 按需编译'
  },
  {
    id: 'eng-vite', cat: 'engineering', name: 'Vite', level: 2, sort: 3, deps: ['eng-pkg'],
    content: '## Vite\n\n新一代构建工具，开发时利用 ESM 按需编译，极速冷启动。\n\n### 原理\n- 开发：浏览器原生 ESM + esbuild 预构建依赖\n- 生产：Rollup 打包\n\n### 优势\n- 冷启动快（无需全量打包）\n- 热更新快（HMR）\n- 配置简洁\n\n### 依赖预构建\n- 将 CommonJS 依赖转 ESM\n- 合并散装模块，减少请求\n- 缓存到 node_modules/.vite\n\n### 插件\n- @vitejs/plugin-vue\n- 自定义插件基于 Rollup 插件 API'
  },
  {
    id: 'eng-loader', cat: 'engineering', name: 'Loader 与 Plugin', level: 3, sort: 4, deps: ['eng-webpack'],
    content: '## Loader 与 Plugin\n\n### Loader\n- 转换模块（非 JS → JS）\n- 链式调用，从右到左\n- 例：css-loader、babel-loader、style-loader\n\n### Plugin\n- 扩展构建能力（整个构建生命周期）\n- 例：HtmlWebpackPlugin、MiniCssExtractPlugin、DefinePlugin\n\n### 区别\n| 维度 | Loader | Plugin |\n|---|---|---|\n| 作用 | 转换模块 | 扩展能力 |\n| 时机 | 模块解析时 | 构建全流程 |\n| 本质 | 函数 | 类（含 apply 方法）\n\n### 编写\n- loader：接收源码，返回转换后代码\n- plugin：实现 apply(compiler)'
  },
  {
    id: 'eng-lint', cat: 'engineering', name: 'ESLint 与 Prettier', level: 1, sort: 5, deps: [],
    content: '## ESLint 与 Prettier\n\n### ESLint（代码质量）\n- 静态检查，发现潜在错误与风格问题\n- 规则可配置，支持插件\n- 常用：eslint-plugin-vue、@typescript-eslint\n\n### Prettier（代码格式）\n- 统一格式化风格\n- 与 ESLint 配合（eslint-config-prettier 关闭冲突规则）\n\n### 配合\n- lint 检查质量，prettier 统一格式\n- husky + lint-staged 提交前检查\n\n### 价值\n- 团队代码风格统一\n- 提前发现错误'
  },
  {
    id: 'eng-git', cat: 'engineering', name: 'Git 工作流', level: 1, sort: 6, deps: [],
    content: '## Git 工作流\n\n### 常用命令\n- add / commit / push / pull\n- branch / checkout / merge / rebase\n- stash / cherry-pick / reset\n\n### 工作流\n- Git Flow：feature/develop/release/hotfix/main\n- GitHub Flow：main + feature 分支\n- 提交规范：Conventional Commits（feat/fix/docs）\n\n### 关键点\n- merge 保留分支历史，rebase 线性化历史\n- 冲突解决\n- 不要用 --force 推共享分支\n\n### 提交规范\n- feat：新功能、fix：修复、docs：文档\n- chore：杂项、refactor：重构'
  },
  {
    id: 'eng-cicd', cat: 'engineering', name: 'CI/CD', level: 2, sort: 7, deps: ['eng-git'],
    content: '## CI/CD\n\n### CI（持续集成）\n- 代码提交后自动构建、测试\n- 尽早发现集成问题\n\n### CD（持续交付/部署）\n- 自动部署到环境\n- 减少人工操作\n\n### 工具\n- GitHub Actions、GitLab CI、Jenkins\n\n### 前端流程\n1. 提交触发 CI\n2. 安装依赖、lint、测试、构建\n3. 部署（CDN/服务器）\n\n### 价值\n- 自动化、可重复、降低人为错误'
  },
  {
    id: 'eng-monorepo', cat: 'engineering', name: 'Monorepo', level: 3, sort: 8, deps: ['eng-pkg'],
    content: '## Monorepo\n\n多个项目在一个仓库中管理。\n\n### 工具\n- pnpm workspace\n- Turborepo / Nx / Lerna\n\n### 优势\n- 代码共享方便\n- 统一依赖与构建\n- 原子提交\n\n### 挑战\n- 构建性能\n- 依赖管理复杂\n- 权限控制\n\n### pnpm workspace\n```yaml\n# pnpm-workspace.yaml\npackages:\n  - "packages/*"\n```\n\n### 与 polyrepo 对比\n- monorepo：共享方便、构建复杂\n- polyrepo：隔离清晰、共享麻烦'
  },
  {
    id: 'eng-buildopt', cat: 'engineering', name: '构建优化', level: 3, sort: 9, deps: ['eng-webpack'],
    content: '## 构建优化\n\n### 体积优化\n- 代码分割（SplitChunks/动态 import）\n- Tree Shaking（去除无用代码）\n- 压缩（Terser/esbuild）\n- 图片压缩、字体子集化\n\n### 速度优化\n- 缓存（持久化缓存）\n- 多线程（thread-loader）\n- 减少 loader 处理范围\n- 预构建依赖\n\n### 产物分析\n- webpack-bundle-analyzer\n- 定位大体积依赖\n\n### 关键\n- Tree Shaking 依赖 ES Module\n- sideEffects 配置影响摇树\n- CDN 加载大依赖'
  }
]

export const questions = [
  { id: 'q-eng-1', cat: 'engineering', node: 'eng-pkg', type: 'single', level: 1, tags: ['八股文'], q: '通过硬链接节省磁盘、安装更快的包管理器是？', options: ['npm', 'yarn', 'pnpm', 'bower'], answer: 2, explain: 'pnpm 用硬链接 + 符号链接，节省磁盘空间。' },
  { id: 'q-eng-2', cat: 'engineering', node: 'eng-pkg', type: 'multi', level: 1, tags: ['八股文'], q: 'lock 文件的作用有？', options: ['锁定依赖版本', '保证团队一致性', '加速安装', '加快运行速度'], answer: [0, 1, 2], explain: 'lock 文件锁定版本保证一致，安装更稳定。' },
  { id: 'q-eng-3', cat: 'engineering', node: 'eng-pkg', type: 'judge', level: 1, tags: ['八股文'], q: '^1.2.3 表示兼容 1.x 版本。', options: ['正确', '错误'], answer: true, explain: '^ 允许次版本和补丁更新，~ 只允许补丁。' },
  { id: 'q-eng-4', cat: 'engineering', node: 'eng-webpack', type: 'single', level: 2, tags: ['八股文'], q: 'Webpack 的入口配置项是？', options: ['output', 'entry', 'module', 'resolve'], answer: 1, explain: 'entry 指定打包入口。' },
  { id: 'q-eng-5', cat: 'engineering', node: 'eng-webpack', type: 'multi', level: 2, tags: ['八股文'], q: 'Webpack 的核心概念有？', options: ['entry', 'loader', 'plugin', 'router'], answer: [0, 1, 2], explain: 'router 不是 Webpack 概念。' },
  { id: 'q-eng-6', cat: 'engineering', node: 'eng-webpack', type: 'judge', level: 2, tags: ['八股文'], q: 'Webpack 会全量打包所有模块构建依赖图。', options: ['正确', '错误'], answer: true, explain: 'Webpack 从 entry 出发构建依赖图并打包。' },
  { id: 'q-eng-7', cat: 'engineering', node: 'eng-vite', type: 'single', level: 2, tags: ['八股文'], q: 'Vite 生产构建使用的打包器是？', options: ['esbuild', 'Rollup', 'Webpack', 'SWC'], answer: 1, explain: 'Vite 开发用 esbuild，生产用 Rollup 打包。' },
  { id: 'q-eng-8', cat: 'engineering', node: 'eng-vite', type: 'multi', level: 2, tags: ['八股文'], q: 'Vite 的优势有？', options: ['冷启动快', 'HMR 快', '配置简洁', '无需构建'], answer: [0, 1, 2], explain: 'Vite 仍需要构建，只是开发时按需编译。' },
  { id: 'q-eng-9', cat: 'engineering', node: 'eng-vite', type: 'judge', level: 2, tags: ['八股文'], q: 'Vite 开发时利用浏览器原生 ESM 按需加载。', options: ['正确', '错误'], answer: true, explain: 'Vite 开发服务器基于原生 ESM 实现按需编译。' },
  { id: 'q-eng-10', cat: 'engineering', node: 'eng-loader', type: 'single', level: 3, tags: ['八股文'], q: 'Loader 的执行顺序是？', options: ['从左到右', '从右到左', '随机', '并行'], answer: 1, explain: 'Loader 链式从右到左执行。' },
  { id: 'q-eng-11', cat: 'engineering', node: 'eng-loader', type: 'multi', level: 3, tags: ['八股文'], q: 'Loader 与 Plugin 的区别？', options: ['Loader 转换模块', 'Plugin 扩展能力', 'Plugin 有 apply 方法', 'Loader 是类'], answer: [0, 1, 2], explain: 'Loader 是函数，Plugin 是含 apply 方法的类。' },
  { id: 'q-eng-12', cat: 'engineering', node: 'eng-loader', type: 'judge', level: 3, tags: ['八股文'], q: 'HtmlWebpackPlugin 属于 Loader。', options: ['正确', '错误'], answer: false, explain: 'HtmlWebpackPlugin 是 Plugin，生成 HTML 文件。' },
  { id: 'q-eng-13', cat: 'engineering', node: 'eng-lint', type: 'single', level: 1, tags: ['八股文'], q: '负责统一代码格式化的工具是？', options: ['ESLint', 'Prettier', 'Jest', 'Webpack'], answer: 1, explain: 'Prettier 统一格式化，ESLint 检查质量。' },
  { id: 'q-eng-14', cat: 'engineering', node: 'eng-lint', type: 'multi', level: 1, tags: ['八股文'], q: '提交前自动检查代码常用的工具有？', options: ['husky', 'lint-staged', 'ESLint', 'Prettier'], answer: [0, 1, 2, 3], explain: 'husky 注册钩子，lint-staged 只检查暂存文件。' },
  { id: 'q-eng-15', cat: 'engineering', node: 'eng-lint', type: 'judge', level: 1, tags: ['八股文'], q: 'ESLint 与 Prettier 功能完全重复。', options: ['正确', '错误'], answer: false, explain: 'ESLint 查质量，Prettier 管格式，各司其职。' },
  { id: 'q-eng-16', cat: 'engineering', node: 'eng-git', type: 'single', level: 1, tags: ['八股文'], q: '拉取远程分支并合并到当前分支的命令是？', options: ['git fetch', 'git pull', 'git clone', 'git push'], answer: 1, explain: 'git pull = fetch + merge。' },
  { id: 'q-eng-17', cat: 'engineering', node: 'eng-git', type: 'multi', level: 1, tags: ['八股文'], q: 'Conventional Commits 的常见类型有？', options: ['feat', 'fix', 'docs', 'chore'], answer: [0, 1, 2, 3], explain: 'feat/fix/docs/chore 都是常见提交类型。' },
  { id: 'q-eng-18', cat: 'engineering', node: 'eng-git', type: 'judge', level: 1, tags: ['八股文'], q: 'rebase 会使提交历史线性化。', options: ['正确', '错误'], answer: true, explain: 'rebase 重新应用提交，产生线性历史。' },
  { id: 'q-eng-19', cat: 'engineering', node: 'eng-cicd', type: 'single', level: 2, tags: ['八股文'], q: '代码提交后自动构建测试属于？', options: ['CI', 'CD', 'CR', 'DevOps'], answer: 0, explain: 'CI 持续集成，提交后自动构建测试。' },
  { id: 'q-eng-20', cat: 'engineering', node: 'eng-cicd', type: 'multi', level: 2, tags: ['八股文'], q: '常见 CI/CD 工具有？', options: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'ESLint'], answer: [0, 1, 2], explain: 'ESLint 是代码检查工具，非 CI/CD。' },
  { id: 'q-eng-21', cat: 'engineering', node: 'eng-cicd', type: 'judge', level: 2, tags: ['八股文'], q: '前端 CI 流程通常包含 lint、测试、构建。', options: ['正确', '错误'], answer: true, explain: '标准前端 CI 包含质量检查与构建。' },
  { id: 'q-eng-22', cat: 'engineering', node: 'eng-monorepo', type: 'single', level: 3, tags: ['八股文'], q: 'pnpm 实现 Monorepo 的配置文件是？', options: ['pnpm-workspace.yaml', 'package.json', 'vite.config', 'lerna.json'], answer: 0, explain: 'pnpm 用 pnpm-workspace.yaml 声明工作区。' },
  { id: 'q-eng-23', cat: 'engineering', node: 'eng-monorepo', type: 'multi', level: 3, tags: ['八股文'], q: 'Monorepo 的优势有？', options: ['代码共享方便', '统一依赖', '原子提交', '构建必然更快'], answer: [0, 1, 2], explain: 'Monorepo 构建可能更复杂，未必更快。' },
  { id: 'q-eng-24', cat: 'engineering', node: 'eng-monorepo', type: 'judge', level: 3, tags: ['八股文'], q: 'Turborepo 和 Nx 是 Monorepo 构建工具。', options: ['正确', '错误'], answer: true, explain: 'Turborepo/Nx 提供增量构建与任务编排。' },
  { id: 'q-eng-25', cat: 'engineering', node: 'eng-buildopt', type: 'single', level: 3, tags: ['八股文'], q: '去除无用代码的优化是？', options: ['Tree Shaking', '代码分割', '压缩', '缓存'], answer: 0, explain: 'Tree Shaking 摇掉未使用的代码。' },
  { id: 'q-eng-26', cat: 'engineering', node: 'eng-buildopt', type: 'multi', level: 3, tags: ['八股文'], q: '分析产物体积可用？', options: ['webpack-bundle-analyzer', 'source-map-explorer', 'vite build --report', 'ESLint'], answer: [0, 1, 2], explain: 'ESLint 是代码检查，不做体积分析。' },
  { id: 'q-eng-27', cat: 'engineering', node: 'eng-buildopt', type: 'judge', level: 3, tags: ['八股文'], q: 'Tree Shaking 依赖 ES Module 静态结构。', options: ['正确', '错误'], answer: true, explain: 'ESM 静态导入/导出才可被摇树分析。' },
  { id: 'q-eng-28', cat: 'engineering', node: 'eng-vite', type: 'single', level: 2, tags: ['场景题'], q: '开发中依赖很多 CommonJS 模块导致慢，Vite 的解决是？', options: ['预构建依赖', '全量打包', '禁用缓存', '改为 require'], answer: 0, explain: 'esbuild 预构建将 CJS 转 ESM 并缓存。' }
]
