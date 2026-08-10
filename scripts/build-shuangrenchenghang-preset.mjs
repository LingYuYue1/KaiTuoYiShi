/**
 * Phase 9 构建脚本：双人成行 v10.0 二创成品预设
 * 读取原 ST 预设 → 清理转换 → 生成二创 JSON + 对照表
 *
 * 重要：保留所有 prompts 条目（不只 enabled=true 的）。
 * enabled 状态按原预设 prompt_order 设置，玩家在游戏内可自行开关。
 * 只剔除真正无意义的：marker 占位 / 空内容 / 纯装饰 / 酒馆专属前端 / 使用指南。
 *
 * 运行：node scripts/build-shuangrenchenghang-preset.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const SRC = 'C:/Users/25934/Desktop/崩坏前端剧情/双人成行v10.0—青云上 (1).json';
const OUT_JSON = resolve(ROOT, 'data/builtinPresets/shuangrenchenghang.json');
const OUT_TABLE = resolve(ROOT, 'docs/2026-07-01-双人成行二创对照表.md');
const FIXED_TS = 1719400000000;

// === 恢复的 21 个条目（之前被 evaluateSkip 跳过，现强制保留）===
// A组 - COT思考区子条目 / B组 - 思考模式 / C组 - 卡COT / D组 - 分组标题（空内容属正常）
const RESTORE_IDS = new Set([
  // A组 - COT思考区子条目
  '9a5fe514-2b7c-46f0-a730-c7903ba6c821', '60d89cd3-b49f-4990-befa-6b1f477fd2c8',
  'dfad3d39-ed1a-44a6-b808-72c9d7feb93d', 'dee8df23-4bb9-4fc9-8dac-17f5ddca28c8',
  'bda99b2d-dffb-4e0f-9e6d-a7b5abc24f6f', '4b892b37-3cbc-4d36-af69-b07d0db9c8bd',
  '318fd753-3b3d-4e95-b07d-94a548d27463', 'a01febbd-dfc3-4dc0-890a-7ce95d1e3ded',
  // B组 - 思考模式
  'a4e77064-43d9-40b3-89cd-7748dd1d517e', '181a9c55-cf52-44ff-9ed8-2041f532bb88',
  '803e5ba9-05d9-4ef8-82a4-cc0cea261dab', 'c997464a-9fd5-47f9-8056-ab28e59f82bf',
  'b94ad337-fe74-4542-8108-7334d81fb6c1', 'd9306d7a-82f4-44e6-919d-b933a9418b27',
  '43224568-7552-48e9-aaaa-f9d995e6b117',
  // C组 - 卡COT
  'e2e07700-71c4-4037-94f7-593d42718a0e',
  // D组 - 分组标题（content 为空属正常，不填充内容）
  '32b1b86d-4dd2-4cfd-98ea-984ce3d26873', '2e3e5697-a32e-4fb3-8bb0-e6012bf1df1a',
  'c08a2ad5-5198-4532-aba7-0f48e7735ffd', '4678e3eb-cd25-48b8-ace2-3f89f0ea869d',
  '47e69b3c-16d3-48ab-84da-521f31a821b7',
]);

// === 8 个前端条目（保留位置，内容改为占位说明，默认关闭）===
const FRONTEND_PLACEHOLDER_IDS = new Set([
  'b1f24a1e-d7da-4e63-b030-ca4b673821a6', '6b4b5d2f-5a7e-48f1-a16f-5dd4aad617c7',
  '16c8e083-fbd3-4115-8e44-a89115d7b9e5', 'f00082d2-130e-4eff-84a4-c2ca70e06cdd',
  'fe12c2c3-feed-43e2-aae7-0d592cb106b8', '62bbcc54-a2e1-48f6-8ced-332b571db48b',
  '1a8e7910-ef77-4645-a17b-7504bbaf3b12', '29b99fc4-f68b-42df-bf88-2904ceece3d6',
]);
const PLACEHOLDER_CONTENT = '[暂未启用] 此功能为 ST 前端组件，本游戏暂不支持。保留位置作向导。';

function sanitizeIdentifier(raw) {
  const t = (raw ?? '').trim();
  return t ? t.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 64) : 'unknown';
}
function normalizeRole(raw) {
  const r = (raw ?? 'system').trim().toLowerCase();
  return (r === 'user' || r === 'assistant') ? r : 'system';
}
function inferCategory(name, identifier) {
  const t = `${name} ${identifier}`.toLowerCase();
  if (/cot|chain.?of.?thought|think|reasoning|思考/.test(t)) return 'cot';
  if (/format|response.?format|output.?format|xml|json|格式|文风|style/.test(t)) return 'format';
  if (/persona|narrator|character.?card|活人感|叙事|人格/.test(t)) return 'persona';
  if (/jailbreak|nsfw|jail.?break|unlock|越狱|解锁|双子|出发/.test(t)) return 'jailbreak';
  if (/dev.?mode|developer/.test(t)) return 'devmode';
  if (/style|writing.?style|tone|prose/.test(t)) return 'style';
  return 'custom';
}
function evaluateSkip(p) {
  const name = p.name ?? '';
  const content = (p.prompt ?? p.content ?? '').trim();
  // 恢复的 21 个条目 + 8 个前端占位条目：强制保留，不被后续规则跳过
  if (RESTORE_IDS.has(p.identifier)) return { skip: false, reason: '' };
  if (FRONTEND_PLACEHOLDER_IDS.has(p.identifier)) return { skip: false, reason: '' };
  if (p.marker === true) return { skip: true, reason: 'ST 原生占位（marker=true）' };
  if (!content) return { skip: true, reason: '空内容' };
  const withoutTags = content.replace(/<\/?[a-zA-Z][\s\S]*?>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  if (withoutTags.trim().length === 0) return { skip: true, reason: '纯 XML 标签（孤立标记）' };
  if (/^[┏┓┗┛━═─\-|=•●○■□◆◇★☆※]+$/u.test(content.trim())) return { skip: true, reason: '纯装饰符号' };
  if (/视觉交互|前端交互|音乐播放器|日期卡片|快捷回复|小剧场|变量更新/.test(name)) return { skip: true, reason: '酒馆专属前端（游戏端有独立 UI）' };
  if (/使用指南/.test(name)) return { skip: true, reason: '使用指南说明文本' };
  return { skip: false, reason: '' };
}

const raw = JSON.parse(readFileSync(SRC, 'utf8'));
const prompts = raw.prompts ?? [];
const orderGroup = (raw.prompt_order ?? [])[0] ?? { order: [] };
const enabledMap = new Map();
const orderIndexMap = new Map();
orderGroup.order.forEach((o, i) => {
  enabledMap.set(o.identifier, o.enabled);
  orderIndexMap.set(o.identifier, i);
});
const modules = [];
const tableRows = [];

// 遍历所有 prompts（不只 enabled=true），保留全部可选功能给玩家自选。
// enabled 状态：21 个恢复条目按原 prompts 条目 p.enabled；8 个前端占位统一 false；其余按 prompt_order。
for (let pi = 0; pi < prompts.length; pi++) {
  const p = prompts[pi];
  const { skip, reason } = evaluateSkip(p);
  const name = p.name ?? '';
  const isPlaceholder = FRONTEND_PLACEHOLDER_IDS.has(p.identifier);
  const isRestored = RESTORE_IDS.has(p.identifier);
  // 前端占位条目：内容替换为占位说明；其余条目保留原内容（D组分组标题 content 为空属正常）
  const content = isPlaceholder ? PLACEHOLDER_CONTENT : (p.prompt ?? p.content ?? '').trim();
  const role = normalizeRole(p.role);
  const wordCount = content.length;
  // 恢复的 21 个条目按原 prompts 条目 enabled；前端占位统一 false；其余按 prompt_order
  const isEnabled = isPlaceholder ? false : (isRestored ? (p.enabled ?? false) : (enabledMap.get(p.identifier) ?? false));
  const orderIdx = orderIndexMap.has(p.identifier) ? orderIndexMap.get(p.identifier) : (100000 + pi);
  if (skip) {
    tableRows.push({ identifier: p.identifier, name, role, wordCount, action: '剔除', newId: '—', reason });
    continue;
  }
  const newId = `st_import_${sanitizeIdentifier(p.identifier)}_${FIXED_TS}`;
  const category = inferCategory(name, p.identifier);
  modules.push({
    id: newId, title: name, description: `双人成行 · ${category} · ${p.identifier}${isEnabled ? '' : '（默认关闭）'}`,
    content, role, source: 'st_preset', builtin: false, replaceable: 'extensible',
    category, enabled: isEnabled, order: orderIdx * 10 + 100, scope: ['all'],
    injectionPosition: p.injection_position ?? 0,
    injectionDepth: p.injection_depth ?? 0, injectionOrder: p.injection_order ?? 0,
    injectionTrigger: Array.isArray(p.injection_trigger) ? p.injection_trigger : [],
    createdAt: FIXED_TS, updatedAt: FIXED_TS,
  });
  const keepReason = isPlaceholder
    ? `前端占位（${isEnabled ? '默认启用' : '默认关闭'}，内容已替换为占位说明）`
    : `转为 ${category} 类 st_import 模块（${isEnabled ? '默认启用' : '默认关闭，玩家可选'}）`;
  tableRows.push({ identifier: p.identifier, name, role, wordCount, action: '保留', newId, reason: keepReason });
}

const preset = {
  id: 'adapted_shuangrenchenghang', name: '双人成行 v10.0（二创成品）',
  importedAt: 0, updatedAt: 0, modules, worldbookEntries: [],
  samplingParams: {
    temperature: raw.temperature, topP: raw.top_p, topK: raw.top_k, topA: raw.top_a, minP: raw.min_p,
    repetitionPenalty: raw.repetition_penalty, frequencyPenalty: raw.frequency_penalty,
    presencePenalty: raw.presence_penalty, maxContext: raw.openai_max_context, maxTokens: raw.openai_max_tokens,
  },
  assistantPrefill: raw.assistant_prefill ?? '思考已结束。',
  isBuiltin: true, presetType: 'adapted',
};
writeFileSync(OUT_JSON, JSON.stringify(preset, null, 2), 'utf8');
console.log(`✓ 二创 JSON: ${OUT_JSON} (${modules.length} modules)`);

const kept = tableRows.filter((r) => r.action === '保留');
const removed = tableRows.filter((r) => r.action === '剔除');
const keptOn = kept.filter((r) => r.reason.includes('默认启用'));
const keptOff = kept.filter((r) => r.reason.includes('默认关闭'));

let md = `# 双人成行 v10.0 二创对照表\n\n> 生成时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}\n> 源文件：双人成行v10.0—青云上 (1).json\n> 二创成品：data/builtinPresets/shuangrenchenghang.json\n\n## 概览\n\n| 项目 | 数量 |\n|------|------|\n| 原预设 prompts 总数 | ${tableRows.length} |\n| 保留（转为 st_import 模块） | ${kept.length}（其中默认启用 ${keptOn.length}，默认关闭 ${keptOff.length}） |\n| 剔除 | ${removed.length} |\n\n## 顶层参数\n\n| 参数 | 原值 | 二创处理 |\n|------|------|----------|\n| temperature | ${raw.temperature} | 保留（写入 samplingParams） |\n| top_p | ${raw.top_p} | 保留（写入 samplingParams） |\n| top_k | ${raw.top_k} | 保留（写入 samplingParams） |\n| openai_max_context | ${raw.openai_max_context} | 保留（写入 samplingParams.maxContext） |\n| openai_max_tokens | ${raw.openai_max_tokens} | 保留（写入 samplingParams.maxTokens） |\n| assistant_prefill | ${raw.assistant_prefill} | 保留（写入 assistantPrefill，sendWorkflow 读取） |\n\n## 保留条目 · 默认启用（${keptOn.length} 条）\n\n| # | 原 identifier | 原 name | role | 字数 | 二创模块 id | 类别/状态 |\n|---|---------------|---------|------|------|-------------|-----------|\n`;
keptOn.forEach((r, i) => { md += `| ${i + 1} | \`${r.identifier}\` | ${r.name} | ${r.role} | ${r.wordCount} | \`${r.newId}\` | ${r.reason} |\n`; });
md += `\n## 保留条目 · 默认关闭（${keptOff.length} 条，玩家可自行开启）\n\n| # | 原 identifier | 原 name | role | 字数 | 二创模块 id | 类别/状态 |\n|---|---------------|---------|------|------|-------------|-----------|\n`;
keptOff.forEach((r, i) => { md += `| ${i + 1} | \`${r.identifier}\` | ${r.name} | ${r.role} | ${r.wordCount} | \`${r.newId}\` | ${r.reason} |\n`; });
md += `\n## 剔除条目（${removed.length} 条）\n\n| # | 原 identifier | 原 name | role | 字数 | 剔除理由 |\n|---|---------------|---------|------|------|----------|\n`;
removed.forEach((r, i) => { md += `| ${i + 1} | \`${r.identifier}\` | ${r.name} | ${r.role} | ${r.wordCount} | ${r.reason} |\n`; });
md += `\n## 冲突处理说明\n\n切换到本二创预设时，系统会自动识别 ST 模块中的 CoT/格式条目，自动禁用内置 \`builtin_main_plot_cot\` 和 \`builtin_response_format\`，改用本预设的版本。\n\n如输出异常，可在「提示词设置」中手动重新启用内置模块。\n`;
writeFileSync(OUT_TABLE, md, 'utf8');
console.log(`✓ 对照表: ${OUT_TABLE} (保留 ${kept.length}=默认开${keptOn.length}+默认关${keptOff.length}, 剔除 ${removed.length})`);
