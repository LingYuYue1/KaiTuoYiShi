import { readFileSync } from 'fs';
const t = readFileSync('scripts/zhiku-archive-polish.mjs', 'utf8');
const lines = t.split('\n');
lines.forEach((l, i) => {
  if (l.includes('赞达尔') && l.trim().startsWith("'")) {
    console.log(i, '|', l.substring(0, 60));
  }
});
// 也找所有配置 key
console.log('=== 所有配置 key ===');
lines.forEach((l, i) => {
  const m = l.match(/^  '([^']+)': \{/);
  if (m) console.log(i, '|', m[1]);
});
