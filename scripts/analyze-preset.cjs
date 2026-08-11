/* eslint-disable no-console */
// 临时分析脚本：查看双人成行预设 JSON 的更详细内容
const fs = require('fs');
const path = require('path');

const file = path.resolve('C:\\Users\\25934\\Desktop\\崩坏前端剧情\\双人成行v10.0—青云上 (1).json');
const raw = fs.readFileSync(file, 'utf8');
const data = JSON.parse(raw);

// 把输出重定向到文件
const outPath = path.resolve('scripts/_preset-dump.txt');
const lines = [];
const origLog = console.log;
console.log = (...args) => {
  const s = args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  lines.push(s);
  origLog(s);
};

// 看 main / nsfw 这两个特殊条目的内容
console.log('=== main 条目内容 ===');
const mainEntry = data.prompts.find(p => p.identifier === 'main');
if (mainEntry) {
  console.log('name:', mainEntry.name);
  console.log('role:', mainEntry.role);
  console.log('content (前 1500 字符):');
  console.log(mainEntry.content.slice(0, 1500));
  console.log('\n... content 总长:', mainEntry.content.length);
}

console.log('\n\n=== nsfw 条目内容 ===');
const nsfwEntry = data.prompts.find(p => p.identifier === 'nsfw');
if (nsfwEntry) {
  console.log('name:', nsfwEntry.name);
  console.log('role:', nsfwEntry.role);
  console.log('content:');
  console.log(nsfwEntry.content);
}

// 查看 prompts 60-末尾
console.log('\n\n=== prompts 列表（60-末尾）===');
data.prompts.slice(60).forEach((p, i) => {
  const idx = i + 60;
  const id = p.identifier || '?';
  const name = p.name || '';
  const marker = p.marker ? ' [marker]' : '';
  const role = p.role || '';
  const contentLen = (p.prompt ?? p.content ?? '').length;
  console.log(`  [${idx}] id="${id}" name="${name}" role="${role}" contentLen=${contentLen}${marker}`);
});

// 看 extensions 详细
console.log('\n\n=== extensions 详细 ===');
const ext = data.extensions;
if (ext) {
  for (const key of Object.keys(ext)) {
    const v = ext[key];
    if (Array.isArray(v)) {
      console.log(`  ${key}: Array[${v.length}]`);
      if (key === 'regex_scripts' && v.length > 0) {
        console.log('    regex_scripts[0]:', JSON.stringify(v[0], null, 2).slice(0, 800));
      }
    } else if (typeof v === 'object' && v) {
      console.log(`  ${key}: object keys=[${Object.keys(v).join(',')}]`);
      console.log('    详情（前 400 字符）:', JSON.stringify(v).slice(0, 400));
    } else {
      console.log(`  ${key}: ${typeof v} = ${JSON.stringify(v).slice(0, 100)}`);
    }
  }
}

// 统计 marker / 非 marker 条目
const markerCount = data.prompts.filter(p => p.marker === true).length;
const nonMarkerCount = data.prompts.length - markerCount;
console.log(`\n\n=== 统计 ===`);
console.log(`prompts 总数: ${data.prompts.length}`);
console.log(`  marker (ST 原生占位): ${markerCount}`);
console.log(`  非 marker: ${nonMarkerCount}`);

// prompt_order 中 enabled 状态
const orderList = data.prompt_order?.[0]?.order ?? [];
const enabledCount = orderList.filter(o => o.enabled !== false).length;
const disabledCount = orderList.length - enabledCount;
console.log(`\nprompt_order 总数: ${orderList.length}`);
console.log(`  enabled: ${enabledCount}`);
console.log(`  disabled: ${disabledCount}`);

// 看一下非 marker 中 enabled 的条目名称
console.log('\n=== enabled 且非 marker 的条目（实际生效）===');
const enabledNonMarker = [];
for (const o of orderList) {
  if (o.enabled === false) continue;
  const p = data.prompts.find(pp => pp.identifier === o.identifier);
  if (!p || p.marker) continue;
  enabledNonMarker.push(p);
}
enabledNonMarker.forEach((p, i) => {
  const contentLen = (p.prompt ?? p.content ?? '').length;
  console.log(`  [${i}] ${p.name} (id=${p.identifier.slice(0, 8)}.. role=${p.role} len=${contentLen})`);
});
console.log(`  共 ${enabledNonMarker.length} 条实际生效`);

// 写入文件
fs.writeFileSync(outPath, lines.join('\n'), 'utf8');
origLog(`\n已写入 ${outPath}`);
