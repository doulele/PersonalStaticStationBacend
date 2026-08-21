import { initDatabase, dbGet, dbAll } from './services/db.js'

await initDatabase()

const tables = dbGet("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name LIKE 'kg_%'")
const iv = dbGet('SELECT COUNT(*) c FROM kg_interview_questions')
const hot = dbGet('SELECT COUNT(*) c FROM kg_interview_questions WHERE hot = 1')
const exams = dbGet("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='kg_exams'")
const cats = dbAll('SELECT cat, COUNT(*) c FROM kg_interview_questions GROUP BY cat ORDER BY c DESC')

console.log('kg_tables:', tables.c)
console.log('interview questions:', iv.c, '| hot:', hot.c)
console.log('exams table:', exams.c)
console.log('byCat:', JSON.stringify(cats))
console.log('sample:', JSON.stringify(dbGet('SELECT id, q FROM kg_interview_questions LIMIT 1')))
