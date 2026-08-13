// 生成《主剧情提示词注入顺序全量文档》：按真实注入顺序排列全部提示词，内容写全。
// 组成：
//   1. 注入顺序表（本文档硬编码，与 systemPromptBuilder.ts / sendWorkflow.ts / mainRequestFinalizer.ts 组装顺序对齐）
//   2. 模块/世界书全文（自动从 createBuiltinPromptModules / createBuiltinWorldbooks 导出，与代码一字不差）
//   3. 硬编码段/override 段/独立链附加段（人工维护于 scripts/prompt-injection-data/*.md，改代码后需同步）
// 运行：npx esbuild scripts/dump-prompt-injection-order.ts --bundle --format=esm --platform=node --outfile=scripts/_dump-prompt-injection-order.mjs && node scripts/_dump-prompt-injection-order.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createBuiltinPromptModules } from '../data/builtinPromptModules';
import { createBuiltinWorldbooks } from '../data/worldbookPresets';
import { PROMPT_MODULE_TOP_THRESHOLD } from '../models/prompts';

const OUT = 'docs/superpowers/specs/2026-08-12-main-prompt-full-content-in-order.md';
const DATA_DIR = 'scripts/prompt-injection-data';

// ── 读取人工数据文件，按 <!-- id --> 标记解析 ──
function readSections(file: string): Map<string, string> {
  const text = readFileSync(join(DATA_DIR, file), 'utf8');
  const map = new Map<string, string>();
  const parts = text.split('\n<!-- ');
  for (const part of parts) {
    const endIdx = part.indexOf(' -->');
    if (endIdx === -1) continue;
    const id = part.slice(0, endIdx).trim();
    const body = part.slice(endIdx + 4).trim();
    map.set(id, body);
  }
  return map;
}

const sections = new Map<string, string>();
for (const f of ['sections-main.md', 'sections-send.md', 'sections-calibration.md']) {
  for (const [k, v] of readSections(f)) sections.set(k, v);
}

const modules = createBuiltinPromptModules();
const worldbooks = createBuiltinWorldbooks();
const bytes = (s: string) => `${Math.max(1, Math.round(Buffer.byteLength(s, 'utf8') / 102.4) / 10)}KB`;

// ── 模块分类（按注入位置，与 builder 的 scope 过滤逻辑对齐） ──
const scopeOf = (m: { scope?: string[] }) => {
  const s = m.scope && m.scope.length ? m.scope : ['all'];
  return s;
};
const isCalibration = (m: { scope?: string[] }) => scopeOf(m).includes('calibration');
const isTop = (m: { order: number }) => m.order < PROMPT_MODULE_TOP_THRESHOLD;
const isMainish = (m: { scope?: string[] }) => {
  const s = scopeOf(m);
  return s.includes('main') || s.includes('all') || s.includes('pathAwakening') || s.includes('battle');
};

const topModules = modules.filter((m) => isTop(m)).sort((a, b) => a.order - b.order);
const bottomMainModules = modules
  .filter((m) => !isTop(m) && !isCalibration(m) && isMainish(m))
  .sort((a, b) => a.order - b.order);
const openingModules = modules.filter((m) => !isTop(m) && !isCalibration(m) && scopeOf(m).includes('opening')).sort((a, b) => a.order - b.order);
const calibrationModules = modules.filter((m) => isCalibration(m)).sort((a, b) => a.order - b.order);

// ── 世界书条目分类（与 utils/worldbook.ts 的准入逻辑对齐） ──
const PROMPT_LIKE_IDS = new Set(['builtin_worldview_overview']);
const isPromptLike = (e: any) => e.type === 'system_rule' || PROMPT_LIKE_IDS.has(e.id);
const stableEntries: Array<{ entry: any; bookTitle: string }> = [];
const mainEntries: Array<{ entry: any; bookTitle: string }> = [];
const depthEntries: Array<{ entry: any; bookTitle: string }> = [];
for (const book of worldbooks as any[]) {
  for (const e of book.entries) {
    const item = { entry: e, bookTitle: book.title ?? book.id };
    if (e.injectAtDepth) depthEntries.push(item);
    else if (isPromptLike(e)) stableEntries.push(item);
    else mainEntries.push(item);
  }
}
const entryMeta = (e: any) => [
  `id: \`${e.id}\``,
  `type: ${e.type ?? '-'}`,
  e.injectMode ? `注入: ${e.injectMode}` : '',
  e.keywords?.length ? `关键词: ${e.keywords.slice(0, 10).join(' / ')}${e.keywords.length > 10 ? ' …' : ''}` : '',
  `scope: [${(e.scope ?? []).join(', ')}]`,
  e.priority !== undefined ? `priority: ${e.priority}` : '',
  `默认: ${e.enabled ? '开' : '**关**'}`,
  `约 ${bytes(e.content)}`,
].filter(Boolean).join(' ｜ ');

// ── 渲染工具 ──
const lines: string[] = [];
const push = (s = '') => lines.push(s);
const renderModule = (m: any) => {
  const meta = [
    `id: \`${m.id}\``,
    `order: ${m.order}`,
    `scope: [${(m.scope ?? []).join(', ')}]`,
    `默认: ${m.enabled ? '开' : '**关**'}`,
    m.storyModeGate?.length ? `storyModeGate: [${m.storyModeGate.join(', ')}]` : '',
    m.openingSourceGate?.length ? `openingSourceGate: [${m.openingSourceGate.join(', ')}]` : '',
    m.injectionTrigger?.length ? `trigger: [${m.injectionTrigger.join(', ')}]` : '',
    `约 ${bytes(m.content)}`,
  ].filter(Boolean).join(' ｜ ');
  push(`#### ${m.title}`);
  push('');
  push(`> ${meta}`);
  if (m.description) push(`> 说明：${m.description}`);
  push('');
  push('````text');
  push(m.content);
  push('````');
  push('');
};
const renderWorldbookEntry = (item: { entry: any; bookTitle: string }) => {
  const { entry: e, bookTitle } = item;
  push(`#### ${e.title ?? e.name ?? e.id}`);
  push('');
  push(`> ${entryMeta(e)}`);
  push('');
  push('````text');
  push(e.content);
  push('````');
  push('');
};

// ── 文档头 ──
push('# 主剧情提示词注入顺序全量文档（2026-08-12 核对版）');
push('');
push('> **用途**：本项目全部提示词的顺序底图 + 全文对照。任何提示词改动（内容、位置、开关、体量）都先在此核对「在哪、为什么、和谁相邻」。');
push('> **生成方式**：脚本 `scripts/dump-prompt-injection-order.ts` 自动导出模块/世界书全文 + 拼装 `scripts/prompt-injection-data/*.md`（人工维护的硬编码段/override 段/独立链附加段，改代码后需同步）。运行：`npm run dump:prompt-order`。');
push('> **取代**：`2026-08-01-main-prompt-injection-order.md`（截至 commit `8414d7b`，多处已过时：忆庭互斥已取消、手机摘要只留待处理来信、新增全知性防护块、智库 V3 注入块标题、记忆分层上限改为长/中全量+短30）。');
push('> **配套**：`2026-07-26-injected-prompts-full-content.md`（旧版模块/世界书分组全文，脚本 `scripts/dump-injected-prompts.ts` 生成）。');
push('');
push('## 一次主剧情请求的结构总览');
push('');
push('```');
push('① buildSystemPrompt()  → 26 段，段间 "\n\n---\n\n" 连接（第四部分给开局分支的独立 12 段）');
push('② 尾部追加：天气片段（\n\n）→ 重roll生成约束（\n）→ ST 方案 B/D 模块（\n\n---\n\n）');
push('③ apiMessages（B0 伪装历史 → B1 历史窗口 → B2 开局/踏入指令 → B3 狭间评判提醒 → B4 DeepSeek守卫 → B5 重roll守卫 → B6 区E执法块 → B7 depth 注入 → B8 相似度重试）');
push('④ assistant prefill（DeepSeek lock_format 强制 <thinking>\\n，否则用预设）');
push('```');
push('');
push('前缀缓存策略（DeepSeek / OpenAI-compatible）：大块固定协议（模块群、世界书稳定规则）在前，高波动块（时间、场景、记忆、智库、NPC）在后。这是段 3 在段 13 之前、时间锚点在第 14 段的唯一原因，改顺序前必须先想清楚缓存影响。');
push('');
push('## 目录');
push('');
push('1. 第一部分：主剧情 system prompt 26 段（每段全文）');
push('2. 第二部分：发送侧尾部追加（A1-A3）');
push('3. 第三部分：apiMessages 与 assistant prefill（B0-B9）');
push('4. 第四部分：开局分支（12 段，独立流程）');
push('5. 第五部分：7 条 calibration 独立链（不进主剧情，各自独立请求）');
push('6. 附录 A：召回 query（决定忆庭/智库内容）');
push('7. 附录 B：冻结清单与已知待修项');
push('');

// ── 第一部分：主剧情 26 段 ──
push('---');
push('');
push('# 第一部分：主剧情 system prompt（26 段）');
push('');
push('> 组装：`systemPromptBuilder.ts:49` `buildSystemPrompt()`。段间以 `\\n\\n---\\n\\n` 连接。`scope` 判定 `:89-90`：`进行中狭间` 存在 → 强制 `pathAwakening`，否则取 `worldbookCtx.currentScope`（普通回合 = `main`）。');
push('> 体量粗估：稳定协议区（段 1-3）约 70-80KB，占绝对主体；全部运行时数据块（段 6-26）合计通常 10-30KB。**内容优化的收益最大区在段 3。**');
push('');

const segTitle: Record<string, string> = {
  'seg-04': '思维链输出语言',
  'seg-05': '心声开关',
  'seg-06': '开局档案（长期锚点）',
  'seg-07': '当前角色',
  'seg-08': '战技系统',
  'seg-09': '背包概览',
  'seg-10': '主线进度',
  'seg-11': '近期新闻',
  'seg-12': '手机通讯摘要',
  'seg-14': '当前时间锚点（变量一致性硬约束）',
  'seg-15': '当前场景',
  'seg-16': '主剧情运行锚点',
  'seg-17': '即时剧情回顾 ｜ 剧情回忆 ｜ 全知性防护（override）',
  'seg-18': '剧情编织滑窗（override）',
  'seg-19': '智库注入（override）',
  'seg-20': '命途狭间状态',
  'seg-21': '近期事件',
  'seg-22': '分层记忆',
  'seg-23': '角色在场状态',
  'seg-24': '本回合 NPC 关系与记忆强制承接',
  'seg-25': '本回合人物关系连续性核对',
  'seg-26': '已知伙伴与路人',
};

// 段 1
push('## 段 1 · 顶部模块群');
push('');
push('来源：`systemPromptBuilder.ts:104` `injectPromptModules(..., \'top\')`，`order < PROMPT_MODULE_TOP_THRESHOLD (30)`。');
push('模块间以 `\\n\\n---\\n\\n` 连接。**`builtin_dev_mode` 默认关，`builtin_narrator_persona` 默认开**——它是整份 prompt 的第一段实质内容，含全局「规则冲突仲裁」六层表（与段 3 优先级链、段 16 运行锚点是三个不同维度，勿合并）。');
push('');
for (const m of topModules) renderModule(m);

// 段 2
push('## 段 2 · 世界书稳定规则');
push('');
push('来源：`systemPromptBuilder.ts:109-112` `buildPromptLikeWorldbookInjection`（`utils/worldbook.ts:493`）。');
push('准入：`type === \'system_rule\'` 或 id 白名单 `builtin_worldview_overview`，且 `injectAtDepth === false`。按 priority 降序，条目间 `\\n\\n---\\n\\n`。渲染格式：`# 世界书｜{条目标题}` + `来源：{世界书名} / {类型标签} / 优先级 {priority}` + 正文（占位符已替换）。');
push('');
push(`> 当前内置命中：${stableEntries.length} 条（稳态常驻为 \`builtin_worldview_overview\` 星海概观，约 8.4KB）。`);
push('');
for (const item of stableEntries) renderWorldbookEntry(item);

// 段 3
push('## 段 3 · 底部模块群（order ≥ 30）');
push('');
push('来源：`systemPromptBuilder.ts:117-119` `injectPromptModules(..., \'bottom\')`。**最大块，稳态约 60-70KB**。');
push('过滤链：`enabled` → scope 含当前 scope（main/pathAwakening/opening/all）→ `openingSourceGate`（仅 opening）→ `storyModeGate`（剧情方向四选一，运行时派生）→ `injectionTrigger`（ST 预设兼容）→ `order ≥ 30`。calibration 模块不在此（见第五部分）。');
push('占位符替换管线：`{wordCountTarget}` / `{personLabel}` / `{playerName}` →（传 worldbookCtx 时）世界书占位符 →（传 macroCtx 时）ST 宏引擎。');
push('');
push('### 普通主剧情回合（scope=main）默认命中的模块');
push('');
const defaultOn = bottomMainModules.filter((m) => m.enabled);
const defaultOff = bottomMainModules.filter((m) => !m.enabled);
push(`> 默认开 ${defaultOn.length} 个（合计约 ${bytes(defaultOn.reduce((s, m) => s + m.content, ''))}）；默认关 ${defaultOff.length} 个（改设置才会进来）。以下按 order 升序列出**全部** main 系模块全文。`);
push('');
push('#### 默认开（按注入顺序）');
push('');
for (const m of defaultOn) renderModule(m);
if (defaultOff.length) {
  push('#### 默认关（改设置才会进来）');
  push('');
  for (const m of defaultOff) renderModule(m);
}
// pathAwakening 专属模块
const pathModules = bottomMainModules.filter((m) => {
  const s = scopeOf(m);
  return !s.includes('main') && s.includes('pathAwakening');
});
if (pathModules.length) {
  push('#### 命途狭间专属（scope=pathAwakening，替换同 order 的 main 模块）');
  push('');
  for (const m of pathModules) renderModule(m);
}

// 段 4-12、14-26（硬编码/override，取自数据文件）
const hardcodedOrder = [
  'seg-04', 'seg-05', 'seg-06', 'seg-07', 'seg-08', 'seg-09', 'seg-10', 'seg-11', 'seg-12',
  'seg-14', 'seg-15', 'seg-16', 'seg-17', 'seg-18', 'seg-19', 'seg-20', 'seg-21', 'seg-22', 'seg-23', 'seg-24', 'seg-25', 'seg-26',
];
const numOf: Record<string, number> = { 'seg-04': 4, 'seg-05': 5, 'seg-06': 6, 'seg-07': 7, 'seg-08': 8, 'seg-09': 9, 'seg-10': 10, 'seg-11': 11, 'seg-12': 12, 'seg-14': 14, 'seg-15': 15, 'seg-16': 16, 'seg-17': 17, 'seg-18': 18, 'seg-19': 19, 'seg-20': 20, 'seg-21': 21, 'seg-22': 22, 'seg-23': 23, 'seg-24': 24, 'seg-25': 25, 'seg-26': 26 };
for (const id of hardcodedOrder) {
  const body = sections.get(id);
  if (!body) continue;
  push(`## 段 ${numOf[id]} · ${segTitle[id]}`);
  push('');
  push(body);
  push('');
  // 段 13（世界书主注入）按注入顺序位于段 12 与段 14 之间
  if (id === 'seg-12') {
    push('## 段 13 · 世界书主注入');
    push('');
    push('来源：`systemPromptBuilder.ts:160-170` `buildWorldbookInjection`（`utils/worldbook.ts:469`）。与段 2 同一套渲染，准入条件取反（非 system_rule、非白名单、非 injectAtDepth），按 priority 降序。同时把 `injectAtDepth` 条目转成 ChatModuleMessage 交给 B7 depth 插入。');
    push('渲染格式：`# ${提示词|世界书}｜{条目标题}`（system_rule 恒被段 2 抢走，此处实际恒为「世界书」）+ 来源行 + 正文。');
    push('');
    push(`> 当前内置候选池：${mainEntries.length} 条（关键词命中才注入；下限 0.8KB 常驻 \`builtin_paths_overview\`，内置上限约 3.0KB 全命中；玩家自建条目无预算）。`);
    push('');
    for (const item of mainEntries) renderWorldbookEntry(item);
    push('');
  }
}

// 第二部分：尾部追加
push('---');
push('');
push('# 第二部分：发送侧尾部追加（system prompt 之后）');
push('');
push('> 段 26 之后 `parts.join(\'\\n\\n---\\n\\n\')` 已完成，但还没发出去。`sendWorkflow.ts` 会再往尾部追加两块（天气、重roll），然后组 apiMessages。**「system prompt 的最后一段」在运行时不是「已知伙伴与路人」，而是天气 / 重roll / ST 追加块。**');
push('');
for (const id of ['aux-01', 'aux-02', 'aux-03']) {
  const body = sections.get(id);
  if (!body) continue;
  push(`## ${body.split('\n')[0]}`);
  push('');
  push(body.split('\n').slice(1).join('\n'));
  push('');
}

// 第三部分：apiMessages
push('---');
push('');
push('# 第三部分：apiMessages 与 assistant prefill');
push('');
push('> 组装：`sendWorkflow.ts:2227-2322` 组 baseMessages → `mainRequestFinalizer.ts:65` `finalizeMainRequest` 按 `leadingMessages → baseMessages → tailMessages → depth 插入` 拼装。普通主剧情回合的最终顺序：B0（队首）→ B1 历史窗口 → B2 指令 → B3 狭间提醒 → B4/B5/B6（tailMessages，按 DeepSeek守卫 → 区E → 重roll守卫 顺序）→ B7 depth（splice）→ B8 相似度重试（重发时追加）→ prefill。');
push('');
const msgTitles: Record<string, string> = {
  'msg-00': 'B0 · CoT 伪装历史',
  'msg-01': 'B1 · 历史窗口（assistant 压缩）',
  'msg-02': 'B2 · 开局指令 / 狭间踏入指令',
  'msg-03': 'B3 · 狭间评判回合提醒',
  'msg-04': 'B4 · DeepSeek 主剧情格式校验',
  'msg-05': 'B5 · 重roll末尾强约束',
  'msg-06': 'B6 · 区 E 执法块（本回合生成前核对）',
  'msg-07': 'B7 · depth 注入',
  'msg-08': 'B8 · 重roll相似度自动换写',
  'msg-09': 'C · assistant prefill',
};
for (const id of ['msg-00', 'msg-01', 'msg-02', 'msg-03', 'msg-04', 'msg-05', 'msg-06', 'msg-07', 'msg-08', 'msg-09']) {
  const body = sections.get(id);
  if (!body) continue;
  push(`## ${msgTitles[id]}`);
  push('');
  push(body);
  push('');
}

// depth 注入的条目清单
if (depthEntries.length) {
  push('### B7 附 · 深度插入条目（injectAtDepth）');
  push('');
  push(`> 当前内置：${depthEntries.length} 条，按 depth 降序 splice 进 apiMessages。`);
  push('');
  for (const item of depthEntries) renderWorldbookEntry(item);
}

// 第四部分：开局分支
push('---');
push('');
push('# 第四部分：开局分支（buildOpeningSystemPrompt，12 段）');
push('');
push('> 组装：`systemPromptBuilder.ts:274` `buildOpeningSystemPrompt()`——完全独立的 12 段流程，**不是** `buildSystemPrompt` 的子集：');
push('> ```');
push('> 1 顶部模块 → 2 世界书稳定规则(scope 强制 opening) → 3 底部模块 → 4 心声开关');
push('> → 5 当前角色 → 6 当前时间锚点 → 7 开局切入说明 → 8 开局档案(全量)');
push('> → 9 当前场景 → 10 近期事件 → 11 近期新闻 → 12 世界书主注入');
push('> ```');
push('> **开局回合完全不注入**：记忆（三个入口全无）、主线进度、手机、智库、剧情编织、NPC 账本 / 在场 / 连续性 / 伙伴、命途狭间、背包、战技、主剧情运行锚点、思维链输出语言。');
push('> apiMessages 侧：区 E 执法块跳过、CoT 伪装历史跳过、重roll守卫跳过。');
push('');
push('## 开局专属模块（scope=opening）');
push('');
for (const m of openingModules) renderModule(m);
push('> 另注：`scope: [all]` 的模块（`builtin_response_format` 1030 / `builtin_action_options` 1034）在 opening 流程同样注入，全文见第一部分段 3。`builtin_main_plot_cot`（1010，scope 仅 main）不注入 opening。');
push('');
push('## 其余段（复用主剧情模板）');
push('');
push('段 4 心声开关、段 5 当前角色、段 6 时间锚点、段 9 当前场景、段 10 近期事件、段 11 近期新闻的模板与主剧情同名段一致（见第一部分）；世界书稳定规则与主注入在 opening scope 下重新过滤（`worldbookCtx.currentScope = \'opening\'`）。');
push('');
push('## 开局切入说明');
push('');
const openBody = sections.get('open-01');
if (openBody) {
  push(openBody);
  push('');
}

// 第五部分：calibration 独立链
push('---');
push('');
push('# 第五部分：7 条 calibration 独立链（不进主剧情）');
push('');
push('> `scope: calibration` 的模块**永远不出现在主剧情 prompt 里**（`injectPromptModules` 的 scope 过滤直接剔除）。它们由 `services/promptModuleScopes.ts` 按 id 前缀分发给 7 条独立请求链，`filterIndependentPromptModules` 门槛：`enabled && scope.includes(\'calibration\')`，按 order 升序，content 以 `\\n\\n` 连接。');
push('');
const calTargets = ['news', 'phone', 'variable', 'zhiku', 'yitingRecall', 'yitingArchive', 'storyWeaving'] as const;
const calMeta: Record<string, string> = {
  news: '匹配 `builtin_news_*` ｜ 组装：`services/ai/newsModel.ts` ｜ 模块：星际和平周报世界书 / 输出格式 / 思维链',
  phone: '匹配 `builtin_phone_*`/`custom_phone_*`/`st_import_phone_*` ｜ 组装：`services/ai/phoneService.ts` ｜ 模块：手机系统世界书 / 默认文风 / 输出格式 / 思维链',
  variable: '匹配 `builtin_variable_*` + `builtin_companion_archive_worldbook` ｜ 组装：`services/ai/variableModel.ts` ｜ 模块：变量系统世界书 / 输出格式 / 思维链 / 伙伴档案写作规范（最重的一路，约 47KB）',
  zhiku: '匹配 `builtin_zhiku_*`/`custom_zhiku_*` ｜ 组装：`services/zhikuRetrieval.ts`（唯一直接调 filter + 自定义排序的链）｜ 模块：AI 召回编译规则 / JSON 输出契约',
  yitingRecall: '匹配 `builtin_yiting_recall` ｜ 组装：`services/yitingRetrieval.ts` ｜ 模块：忆庭召回提示词',
  yitingArchive: '匹配 `builtin_yiting_archive_*` ｜ 组装：`services/yitingArchive.ts`（唯一带 category:format 过滤的链）｜ 模块：忆庭精炼输出格式',
  storyWeaving: '匹配 `builtin_story_weaving_*` ｜ 组装：`services/storyWeaving.ts` ｜ 模块：剧情编织世界书 / 输出格式 / 思维链',
};
for (const target of calTargets) {
  push(`## ${target} 链`);
  push('');
  push(`> ${calMeta[target]}`);
  push('');
  const targetModules = calibrationModules
    .filter((m) => {
      if (target === 'yitingRecall') return m.id === 'builtin_yiting_recall';
      if (target === 'yitingArchive') return m.id.startsWith('builtin_yiting_archive_');
      if (target === 'news') return m.id.startsWith('builtin_news_');
      if (target === 'phone') return m.id.startsWith('builtin_phone_') || m.id.startsWith('custom_phone_') || m.id.startsWith('st_import_phone_');
      if (target === 'variable') return m.id.startsWith('builtin_variable_') || m.id === 'builtin_companion_archive_worldbook';
      if (target === 'zhiku') return m.id.startsWith('builtin_zhiku_') || m.id.startsWith('custom_zhiku_');
      return m.id.startsWith('builtin_story_weaving_');
    })
    .sort((a, b) => a.order - b.order);
  push(`> 本链模块 ${targetModules.length} 个（按 order 升序，以 \`\\n\\n\` 连接后注入）：`);
  push('');
  for (const m of targetModules) renderModule(m);
  const calBody = sections.get(`cal-${target}`);
  if (calBody) {
    push('### 固定附加段与 user 上下文');
    push('');
    push(calBody);
    push('');
  }
}

// 附录 A：召回 query
push('---');
push('');
push('# 附录 A：召回 query（不进主 prompt，决定忆庭/智库的内容）');
push('');
const queryBody = sections.get('aux-query');
if (queryBody) {
  push(queryBody);
  push('');
}

// 附录 B：冻结清单与待修项
push('---');
push('');
push('# 附录 B：冻结清单与已知待修项');
push('');
push('## 冻结清单（不可触碰）');
push('');
push('沿用历轮优化的行为契约冻结清单：**标签协议**（`<thinking>` / `<正文>` / `<短期记忆>` / `<动态世界>` / `<变量草稿>` / `<狭间问答>` / `<狭间评判>` / `<天气>`）、**正文行格式**（`【旁白】` / `【角色名】` / `【心声】`）、**JSON 字段名**、**占位符**（`{wordCountTarget}` / `{personLabel}` / `{playerName}` / `{originalProtagonistSubject}` / `{openingArchiveText}`）。这些改一个字就会打断解析。');
push('');
push('## 已知风险（§2026-08-01 文档 10 项中仍存的部分）');
push('');
push('- **调试面板与真实发送路径不一致**：`contextSnapshot.ts` 复刻了 builder 调用，但缺天气片段 / 重roll约束 / 区 E 执法块三块（`contextSnapshot.ts:599-611`）。');
push('- **无 token 预算**：智库与世界书都只按字符截断单条，没有总量预算；极端回合运行时数据块可能 30KB+。');
push('- **空转死代码**：`MAIN_HISTORY_LIMIT_WITH_MEMORY` 与 `MAIN_HISTORY_LIMIT_WITHOUT_MEMORY` 同为 20；`buildRecallSystemPrompt`（yitingRetrieval.ts:145）无调用点；`SW_LEGACY_OUTPUT_FORMAT_PROMPT`（storyWeaving.ts:15）与 `VAR_LEGACY_OUTPUT_FORMAT_PROMPT`（variableModel.ts:17）import 后未使用；`prompts/cot/storyWeavingOutputFormat.ts` 与 storyWeaving.ts 内联 JSON 骨架双份维护。');
push('');
push('## 待修项（12 项内容问题，抄录过程中发现）');
push('');
push('| # | 问题 | 位置 | 收益 |');
push('| --- | --- | --- | --- |');
push('| 1 | 历史压缩摘要 3 行说明 + 4 个占位块每条重复一次，20 条 ≈ 4.8KB 纯噪声 | `historyWindow.ts:58-96` | **省 4KB 上下文** |');
push('| 2 | 重roll约束三份同义（A2 system / B5 user / B8 retry），上一版摘录注入两遍 | `sendWorkflow.ts:2180` / `:1683` / `:1697` | 重roll回合省 1-2KB |');
push('| 3 | 必输标签数量三处不一致：伪装历史说 4 个、区 E 说 4 个、DeepSeek 守卫说 5 个 | `mainRequestFinalizer.ts:12` / `:151` / `:29` | 消除模型漏 `<变量草稿>` 的口子 |');
push('| 4 | 原著主角门禁三份独立措辞 | 段 16 / 段 23 / 开局切入 | 省 0.5KB，规则唯一化 |');
push('| 5 | NPC 承接规则在段 23/24/25/26 四段重复；段 24「承接要求」按 NPC 数量重复 N 遍 | `systemPromptBuilder.ts:889-1110` + `models/npc.ts:1251` | 选中 6 个 NPC 时省 1KB+ |');
push('| 6 | 段 14 时间锚点与段 15 时空坐标字段全重叠 | `:661` / `:810` | 省 0.2KB |');
push('| 7 | 「长期人格以智库为准」在段 16 与段 26 各一份 | `:594` / `:1082` | 规则唯一化 |');
push('| 8 | 段 9 物品获取协议 1.2KB 在背包为空时也注入 | `:1113` | 空背包回合省 1.2KB |');
push('| 9 | 段 4 写 `<think>`，实际协议标签是 `<thinking>` | `:504` | 修正笔误 |');
push('| 10 | 段 6 全量版末尾「后续写法」分支不可达（死文案） | `:653-657` | 删死代码 |');
push('| 11 | 段 20-C/20-D 与段 9 用半角标点，其余段全角 | `:1291-1400` / `:1136` | 统一观感 |');
push('| 12 | `2026-07-26-injected-prompts-hardcoded-appendix.md` 已过期，描述已删除代码 | 该文档 | 标注作废 |');
push('');
push('> 第 1、2 项纯收益无风险；第 3 项影响输出正确性，优先级最高。第 5 项动到 NPC 承接语义，改前先确认不会削弱「禁止写成初识」的强度。');
push('');
push('## 改完提示词必须做的事');
push('');
push('1. `pnpm test:all-prompt`（28 个断言）必须全绿');
push('2. `pnpm tsc --noEmit` 干净');
push('3. 重跑 `npm run dump:prompt-order` 让本文档与代码对齐（模块/世界书部分自动，硬编码段需同步 `scripts/prompt-injection-data/*.md`）');
push('4. 产出对照文档到 `docs/superpowers/specs/prompt-rewrite-diffs/`');
push('');

writeFileSync(OUT, lines.join('\n'), 'utf8');
const total = Buffer.byteLength(lines.join('\n'), 'utf8') / 1024;
console.log(`已生成 ${OUT}（${total.toFixed(0)} KB）`);
console.log(`模块 ${modules.length} 个（top ${topModules.length} / bottom-main ${bottomMainModules.length} / opening ${openingModules.length} / calibration ${calibrationModules.length}），世界书 ${worldbooks.length} 本 / ${stableEntries.length + mainEntries.length + depthEntries.length} 条（稳定 ${stableEntries.length} / 主注入 ${mainEntries.length} / depth ${depthEntries.length}）`);
