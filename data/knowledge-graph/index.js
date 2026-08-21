/**
 * 前端知识图谱 - 数据聚合入口
 * 汇总 14 个分类的知识点与题目，供 db.js 首次启动时导入
 */
import { nodes as htmlNodes, questions as htmlQuestions } from './html.js'
import { nodes as cssNodes, questions as cssQuestions } from './css.js'
import { nodes as jsNodes, questions as jsQuestions } from './javascript.js'
import { nodes as tsNodes, questions as tsQuestions } from './typescript.js'
import { nodes as vueNodes, questions as vueQuestions } from './vue.js'
import { nodes as reactNodes, questions as reactQuestions } from './react.js'
import { nodes as mpNodes, questions as mpQuestions } from './mini-program.js'
import { nodes as engNodes, questions as engQuestions } from './engineering.js'
import { nodes as mfNodes, questions as mfQuestions } from './micro-frontend.js'
import { nodes as gfxNodes, questions as gfxQuestions } from './graphics.js'
import { nodes as fsNodes, questions as fsQuestions } from './fullstack.js'
import { nodes as netNodes, questions as netQuestions } from './network.js'
import { nodes as bgwNodes, questions as bgwQuestions } from './baguwen.js'
import { nodes as fwNodes, questions as fwQuestions } from './framework.js'

export const ALL_NODES = [
  ...htmlNodes, ...cssNodes, ...jsNodes, ...tsNodes,
  ...vueNodes, ...reactNodes, ...mpNodes, ...engNodes,
  ...mfNodes, ...gfxNodes, ...fsNodes, ...netNodes,
  ...bgwNodes, ...fwNodes
]

export const ALL_QUESTIONS = [
  ...htmlQuestions, ...cssQuestions, ...jsQuestions, ...tsQuestions,
  ...vueQuestions, ...reactQuestions, ...mpQuestions, ...engQuestions,
  ...mfQuestions, ...gfxQuestions, ...fsQuestions, ...netQuestions,
  ...bgwQuestions, ...fwQuestions
]
