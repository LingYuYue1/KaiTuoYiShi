import { readFileSync } from 'fs';

const p = 'public/zhiku-presets/xianzhou-alliance-character-expansion.json';
const d = JSON.parse(readFileSync(p, 'utf8'));
const e = d.entries.find((x) => x.标题 === '椒丘');

console.log('注入字段:', Object.keys(e['注入内容']).join(' → '));
console.log('台词语料###:', e['注入内容']['台词语料'].includes('### ') ? '❌' : '✅ 无');
console.log('台词语料>引用:', e['注入内容']['台词语料'].includes('> ') ? '❌' : '✅ 无');
console.log('台词用「」:', e['注入内容']['台词语料'].includes('「') ? '✅' : '❌');
const dev = ['人物概要', '表现锚点层', '历史故事与阶段边界层', '关系边界', '事实边界', '可玩角色标签', '【', '- 名称', '使用性质', '解锁状态', '剧透等级', '不直接改写', '不自动', '没有完整记录', '不完整', '不固定', '不等同于', '只保留'];
const found = dev.filter((w) => e.原文.includes(w) || JSON.stringify(e['注入内容']).includes(w));
console.log('开发术语残留:', found.length ? found.join('、') : '✅ 无');
console.log('JSON valid:', !!JSON.parse(readFileSync(p, 'utf8')));
