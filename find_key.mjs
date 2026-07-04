import fs from 'fs';
const s = fs.readFileSync('data/sleep-content.json', 'utf-8');
const keys = ['"fable"', '"story"'];
for (const k of keys) {
  const i = s.indexOf(k);
  console.log(k, 'at', i);
  if (i >= 0) console.log('  context:', JSON.stringify(s.substring(i, i + 20)));
}
