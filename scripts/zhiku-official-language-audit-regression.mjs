import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const presetRoot = path.join(root, 'public', 'zhiku-presets');
const ignoredKeys = new Set([
  '来源',
  '关键词',
  '触发关键词',
  '辅助关键词',
  '资料类型',
  '使用范围',
  '关联角色ID',
  '关联形态ID',
]);
const forbiddenTerms = [
  '本档案',
  '写作时',
  '本回合',
  '注入建议',
  '优先注入',
  '语料只用于学习',
  '触发语境',
  '禁止 AI 臆造',
  '禁止AI臆造',
  '示例台词不得',
  '不得原句搬运',
  '口吻参考',
  '不照抄',
  '当前叙事',
  '纳入建议',
  '档案包',
  '写法收束',
  '写法上',
  '主剧情应当',
  '模型需要',
  '用于锚定',
  '提示词',
  '主剧情',
  'Agent',
  '角色ID',
  'UI分组',
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function scanValue(value, where) {
  if (typeof value === 'string') {
    for (const term of forbiddenTerms) {
      assert(!value.includes(term), `${where} leaked developer language: ${term}`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (ignoredKeys.has(key)) continue;
    scanValue(child, `${where}.${key}`);
  }
}

const files = fs.readdirSync(presetRoot).filter((name) => name.endsWith('.json')).sort();
assert(files.length === 23, `expected 23 project presets, got ${files.length}`);

let entryCount = 0;
let characterCount = 0;
for (const fileName of files) {
  const payload = JSON.parse(fs.readFileSync(path.join(presetRoot, fileName), 'utf8'));
  scanValue(payload.description, `${fileName}.description`);
  for (const entry of payload.entries ?? []) {
    entryCount += 1;
    if (entry.分类 === 'character') characterCount += 1;
    scanValue(entry, `${fileName}/${entry.标题}`);
    scanValue(entry.摘要, `${fileName}/${entry.标题}.摘要`);
    scanValue(entry.原文, `${fileName}/${entry.标题}.原文`);
    scanValue(entry.注入内容, `${fileName}/${entry.标题}.注入内容`);
    scanValue(entry.外貌锚点, `${fileName}/${entry.标题}.外貌锚点`);
    scanValue(entry.性格锚点, `${fileName}/${entry.标题}.性格锚点`);
    scanValue(entry.说话方式, `${fileName}/${entry.标题}.说话方式`);
    scanValue(entry.关系边界, `${fileName}/${entry.标题}.关系边界`);
    scanValue(entry.禁止误写, `${fileName}/${entry.标题}.事实边界`);
  }
}

assert(entryCount === 162, `expected 162 project entries, got ${entryCount}`);
assert(characterCount === 99, `expected 99 active character entries after Zandar removal, got ${characterCount}`);

const auditSource = fs.readFileSync(new URL('./zhiku-project-language-audit.mjs', import.meta.url), 'utf8');
assert(!auditSource.includes("path.resolve(root, '..'"), 'project audit must not traverse outside the repository');

console.log(JSON.stringify({ files: files.length, entries: entryCount, characters: characterCount }));
console.log('ZHIKU_PROJECT_LANGUAGE_AUDIT_OK');
