// 智智库档案「裸名触发」回归
// 背景：keyword-health 收窄设计——流萤/砂金/星期日/知更鸟/大丽花/翡翠/真珠/火花/
// 寒鸦/白露/刃 等与自然词重名的角色，刻意不让裸名触发关键词（防「火花落在刀刃上」
// 误召角色），由 AI 补充通道（aiFallbackTitles）兜底召回。
// 断言：
//   1. aiFallbackTitles 歧义词的裸名不得被触发词命中（收窄红线）
//   2. 白名单之外的角色主名（标题/关联角色ID）必须能被触发词命中（防录入漏洞）
//   3. 形态条目保护：长夜月不得并入主体裸名「三月七」
// 用法：node scripts/zhiku-bare-name-regression.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const bundlePath = path.join(os.tmpdir(), `zhiku-bare-name-${process.pid}-${Date.now()}.mjs`);

await build({
  stdin: {
    contents: ["export * from './models/zhiku';"].join('\n'),
    resolveDir: root,
    sourcefile: 'zhiku-bare-name-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  outfile: bundlePath,
  logLevel: 'silent',
  tsconfig: path.join(root, 'tsconfig.json'),
});

const api = await import(`${pathToFileURL(bundlePath).href}?v=${Date.now()}`);
const { 获取智库显式触发词, 获取智库人物名列表, 归一化智库系统 } = api;

const presetFiles = fs.readdirSync(path.join(root, 'public/zhiku-presets'))
  .filter((f) => f.endsWith('.json'))
  .sort();
const all = [];
for (const f of presetFiles) {
  const d = JSON.parse(fs.readFileSync(path.join(root, 'public/zhiku-presets', f), 'utf8'));
  for (const e of d.entries ?? d.条目 ?? []) all.push(e);
}
const system = 归一化智库系统({ 条目: all });
const entries = system.条目;

const isFormEntry = (entry) =>
  String(entry.资料类型 ?? '').includes('形态')
  || (entry.关键词 ?? []).some((k) => /^资料类型[:：]?.*形态/.test(k));

// 与 keyword-health 的 aiFallbackTitles 对齐：歧义词走 AI 补充兜底，不触发关键词
const AMBIGUOUS_TITLES = new Set([
  'Archer', '黄泉', '黑天鹅', '托帕', '砂金', '翡翠', '真珠',
  '星期日', '知更鸟', '花火', '大丽花', '火花', '归寂', '流萤',
  '白露', '罗刹', '寒鸦',
]);
// 主名不可触发但属于设计豁免的条目（本体/形态承接关系）
const DESIGN_EXEMPT_IDS = new Set(['JS-099']); // 大黑塔：裸名「黑塔」由黑塔本体档案承接

// ---- 断言 1：歧义词裸名不得被触发词命中 ----
const ambiguityBroken = [];
for (const entry of entries.filter((e) => e.分类 === 'character' && AMBIGUOUS_TITLES.has(e.标题))) {
  const triggers = 获取智库显式触发词(entry);
  const bare = entry.标题.replace(/[｜|].*$/u, '').replace(/（.*?）/gu, '').replace(/\(.*?\)/gu, '').trim();
  if (bare && triggers.some((t) => bare.includes(t) && t.length <= bare.length)) {
    ambiguityBroken.push(`${entry.id} ${entry.标题} 裸名「${bare}」被触发词命中: ${JSON.stringify(triggers)}`);
  }
}
assert(ambiguityBroken.length === 0, `歧义词收窄被破坏 ${ambiguityBroken.length} 条：\n${ambiguityBroken.join('\n')}`);
console.log(`✓ 歧义词收窄红线保持（${AMBIGUOUS_TITLES.size} 个自然词重名角色不触发关键词裸名，由 AI 补充兜底）`);

// ---- 断言 2：白名单外角色主名必须可触发 ----
const missingPrimary = [];
for (const entry of entries.filter((e) => e.分类 === 'character' && !isFormEntry(e))) {
  if (AMBIGUOUS_TITLES.has(entry.标题) || DESIGN_EXEMPT_IDS.has(entry.id)) continue;
  const primary = [];
  const roleId = String(entry.关联角色ID ?? '').trim();
  if (roleId && !/^[a-z][a-z0-9_-]*$/u.test(roleId)) primary.push(roleId);
  const title = entry.标题.replace(/[｜|].*$/u, '').replace(/（.*?）/gu, '').replace(/\(.*?\)/gu, '').trim();
  if (title && /^[\u4e00-\u9fff]{2,6}$/.test(title)) primary.push(title);
  const triggers = 获取智库显式触发词(entry);
  const missing = [...new Set(primary)].filter((name) => !triggers.some((t) => name.includes(t)));
  if (missing.length) missingPrimary.push(`${entry.id} ${entry.标题} 主名不可触发: ${missing.join('、')}（触发词: ${JSON.stringify(triggers.slice(0, 5))}）`);
}
assert(missingPrimary.length === 0, `角色主名不可触发 ${missingPrimary.length} 条（疑为录入漏洞）：\n${missingPrimary.join('\n')}`);
console.log(`✓ 白名单外角色主名全部可触发（共 ${entries.filter((e) => e.分类 === 'character' && !isFormEntry(e) && !AMBIGUOUS_TITLES.has(e.标题) && !DESIGN_EXEMPT_IDS.has(e.id)).length} 条主体档案）`);

// ---- 断言 3：形态条目保护 ----
const formEntries = entries.filter((e) => e.分类 === 'character' && isFormEntry(e));
const formBroken = [];
for (const entry of formEntries) {
  const explicit = (entry.触发关键词 ?? []).map((k) => k.trim()).filter(Boolean);
  if (explicit.length) {
    const triggers = 获取智库显式触发词(entry);
    if (triggers.join('|') !== explicit.join('|')) {
      formBroken.push(`${entry.id} ${entry.标题} 触发词被扩充: ${JSON.stringify(triggers)}`);
    }
  }
  if (entry.id === 'JS-084' && 获取智库显式触发词(entry).some((t) => t.includes('三月七'))) {
    formBroken.push('JS-084 长夜月 被并入主体裸名「三月七」');
  }
}
assert(formBroken.length === 0, `形态条目保护失效：\n${formBroken.join('\n')}`);
console.log(`✓ 形态条目保护正常（${formEntries.length} 条形态档案保持触发词字段优先）`);

fs.rmSync(bundlePath, { force: true });
console.log('ZHIKU_BARE_NAME_REGRESSION_OK');
