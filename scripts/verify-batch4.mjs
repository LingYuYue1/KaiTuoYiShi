import { readFileSync } from 'fs';

const jobs = [
  ['belobog-character-rebuild.json', '玲可'],
  ['stellaron-hunters-character-rebuild.json', '流萤'],
  ['belobog-character-rebuild.json', '卢卡'],
];

const devTerms = [
  '不可臆造', '当前信息域', '性别 / 性别表达', '性别 / 年龄', '解锁状态', '能力性质', '可写表现', '职责倾向', '非战斗用法',
  '表现锚点层', '历史故事与阶段', '关系边界', '事实边界', '使用边界', '表现收束', '故事使用规则', '角色故事层',
  '- 名称', '- 别名', '- 性别', '不补完', '关键边界', '不提前', '不要把', '不要写成', '不把', '不写',
];

for (const [f, name] of jobs) {
  const d = JSON.parse(readFileSync('public/zhiku-presets/' + f, 'utf8'));
  const e = d.entries.find((x) => x.标题 === name);
  const full = e.原文 + '\n@@@\n' + JSON.stringify(e['注入内容']);
  const found = devTerms.filter((w) => full.includes(w));
  console.log(`[${name}] 注入字段:`, Object.keys(e['注入内容']).join('→'));
  console.log(`[${name}] 台词语料###:`, e['注入内容']['台词语料'].includes('### ') ? '❌' : '✅ 无');
  console.log(`[${name}] 开发术语:`, found.length ? '❌ ' + found.join('、') : '✅ 无');
  console.log(`[${name}] 摘要:`, e.摘要 && e.摘要.length > 30 ? '✅' : '❌');
  // 演绎红线结构检查
  const red = e['注入内容']['演绎红线'];
  console.log(`[${name}] 演绎红线:`, red.startsWith('关系边界：') ? '关系边界✅' : '❌', red.includes('与他人关系（部分）：') ? '他人关系✅' : '❌');
  console.log('');
}
