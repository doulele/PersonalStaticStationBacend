import fs from 'fs';
const s = fs.readFileSync('data/sleep-content.json', 'utf-8');
const i = s.indexOf('"lullaby"');
console.log('lullaby pos:', i);
if (i >= 0) console.log('context:', s.substring(i, i + 200));
