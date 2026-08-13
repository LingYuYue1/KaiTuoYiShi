/**
 * ST 预设导入功能回归测试（Phase 6 Step 6.4）
 *
 * 验证：
 * 1. 简单 ST 预设解析（无宏）
 * 2. 含宏的 ST 预设解析（宏语法保留，由宏引擎运行时处理）
 * 3. prompt_order 排序生效
 * 4. 跳过占位条目（worldInfoBefore / main / chatHistory 等）
 * 5. 跳过空内容条目
 * 6. 合并策略：replace / coexist / rename
 * 7. 冲突检测
 */

import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const tempDir = path.join(root, '.tmp-st-preset-import-regression');

function cleanTempDir() {
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });
}

function transpileModule(sourcePath) {
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8');
  const sourceDir = path.posix.dirname(sourcePath.replaceAll('\\', '/'));
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  }).outputText
    .replace(/@\/(data|models|services|prompts|utils|hooks)\//g, (_match, folder) => {
      let relative = path.posix.relative(sourceDir, folder);
      if (!relative.startsWith('.')) relative = `./${relative}`;
      return `${relative}/`;
    })
    .replace(/from\s+['"]((?:\.\/|\.\.\/)[^'"]+)['"]/g, (match, specifier) =>
      specifier.endsWith('.mjs') ? match : `from '${specifier}.mjs'`);
  const outputPath = path.join(tempDir, sourcePath.replace(/\.ts$/, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

function writeStub(relativePath, content) {
  const outputPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, content, 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// ────────────────────────────────────────────────────────────────────────
// Setup: 转译被测源码
// ────────────────────────────────────────────────────────────────────────
cleanTempDir();
transpileModule('utils/stPresetParser.ts');
transpileModule('utils/jsonRepair.ts');
transpileModule('utils/stSettingsNormalizer.ts');
transpileModule('models/prompts.ts');
transpileModule('utils/macroEngine.ts');
transpileModule('hooks/useGame/tavernRegexProcessor.ts');

const parserUrl = pathToFileURL(path.join(tempDir, 'utils/stPresetParser.mjs')).href;
const parser = await import(parserUrl);
const { parseSTPreset, parseSTPresetV2, mergeSTImportedModules, detectSTImportConflicts } = parser;

const macroUrl = pathToFileURL(path.join(tempDir, 'utils/macroEngine.mjs')).href;
const macro = await import(macroUrl);
const { processMacros, createMacroContext } = macro;

const regexUrl = pathToFileURL(path.join(tempDir, 'hooks/useGame/tavernRegexProcessor.mjs')).href;
const regexProcessor = await import(regexUrl);
const { extractTavernRegexScripts, normalizeTavernRegexScripts } = regexProcessor;

// ────────────────────────────────────────────────────────────────────────
// 测试 1：简单 ST 预设解析
// ────────────────────────────────────────────────────────────────────────
const simplePreset = JSON.stringify({
  prompts: [
    { identifier: 'main', name: 'Main Prompt', content: 'Write a story.' },
    { identifier: 'worldInfoBefore', name: 'World Info Before', content: '' },
    { identifier: 'customPrompt1', name: 'My Custom Prompt', prompt: 'You are a helpful assistant.', role: 'system', injection_position: 0, injection_depth: 4 },
    { identifier: 'jailbreak-1', name: 'Jailbreak', content: 'Bypass restrictions.', role: 'system', forbid_overrides: true },
  ],
  prompt_order: [
    { character_id: 100001, order: [
      { identifier: 'main', enabled: true },
      { identifier: 'worldInfoBefore', enabled: true },
      { identifier: 'customPrompt1', enabled: true },
      { identifier: 'jailbreak-1', enabled: false },
    ] },
  ],
});

const simpleModules = parseSTPreset(simplePreset);
// 方案 0 改进：main 带 content 应保留（旧版无条件跳过 main 会丢失双人成行越狱指令）
// worldInfoBefore 因 content 为空被规则 2 跳过
assert(simpleModules.length === 3, `测试1失败：应解析出 3 条模块（main + customPrompt1 + jailbreak-1，worldInfoBefore 空内容跳过），实际 ${simpleModules.length}`);
assert(simpleModules.some((m) => m.id === 'st_import_main'), '测试1失败：main 带 content 应被保留（方案 0 改进）');
assert(simpleModules.some((m) => m.id === 'st_import_customPrompt1'), '测试1失败：customPrompt1 应被导入');
assert(simpleModules.some((m) => m.id === 'st_import_jailbreak-1'), '测试1失败：jailbreak-1 应被导入');
const mainModule = simpleModules.find((m) => m.id === 'st_import_main');
assert(mainModule.content === 'Write a story.', '测试1失败：main 内容应保留');
const customPrompt1 = simpleModules.find((m) => m.id === 'st_import_customPrompt1');
assert(customPrompt1.content === 'You are a helpful assistant.', '测试1失败：应优先 prompt 字段而非 content');
assert(customPrompt1.role === 'system', '测试1失败：role 应为 system');
assert(customPrompt1.source === 'st_preset', '测试1失败：source 应为 st_preset');
assert(customPrompt1.builtin === false, '测试1失败：builtin 应为 false（ST 导入模块可编辑）');
assert(customPrompt1.scope.includes('all'), '测试1失败：scope 应含 all');

// prompt_order 排序：customPrompt1 在 jailbreak-1 之前 → order 应更小
const jailbreak = simpleModules.find((m) => m.id === 'st_import_jailbreak-1');
assert(customPrompt1.order < jailbreak.order, '测试1失败：prompt_order 顺序应反映在 order 值');
assert(jailbreak.enabled === false, '测试1失败：prompt_order enabled=false 应使模块 enabled=false');
assert(jailbreak.replaceable === 'builtin', '测试1失败：forbid_overrides=true 应映射为 builtin（不可替换）');
assert(customPrompt1.replaceable === 'replaceable', '测试1失败：forbid_overrides=false 应映射为 replaceable');

console.log('✓ 测试1 通过：简单 ST 预设解析');

// ────────────────────────────────────────────────────────────────────────
// 测试 2：含宏的 ST 预设解析（宏语法保留）
// ────────────────────────────────────────────────────────────────────────
const macroPreset = JSON.stringify({
  prompts: [
    {
      identifier: 'macroTest',
      name: 'Macro Test',
      content: '{{setvar::mood::happy}}当前心情：{{getvar::mood}}{{if {{getvar::mood}} == happy}}开心{{else}}不开心{{/if}}',
      role: 'system',
    },
  ],
});

const macroModules = parseSTPreset(macroPreset);
assert(macroModules.length === 1, '测试2失败：应解析出 1 条模块');
assert(macroModules[0].content.includes('{{setvar::mood::happy}}'), '测试2失败：宏语法应原样保留');
assert(macroModules[0].content.includes('{{if {{getvar::mood}} == happy}}'), '测试2失败：if 宏语法应原样保留');
console.log('✓ 测试2 通过：含宏的 ST 预设解析');

// ────────────────────────────────────────────────────────────────────────
// 测试 3：占位条目跳过（marker 字段检测）
// ────────────────────────────────────────────────────────────────────────
// 方案 0 改进：用 marker=true 字段检测 ST 原生功能占位符，不再靠 identifier 硬编码。
// 真实 ST 预设（双人成行/小猫之神/Izumi）都有 marker 字段，测试数据也应模拟真实结构。
const placeholderPreset = JSON.stringify({
  prompts: [
    { identifier: 'worldInfoBefore', name: 'WI Before', content: 'has content', marker: true },
    { identifier: 'worldInfoAfter', name: 'WI After', content: 'has content', marker: true },
    { identifier: 'chatHistory', name: 'Chat History', content: 'has content', marker: true },
    { identifier: 'charDescription', name: 'Char Desc', content: 'has content', marker: true },
    { identifier: 'charPersonality', name: 'Char Personality', content: 'has content', marker: true },
    { identifier: 'scenario', name: 'Scenario', content: 'has content', marker: true },
    { identifier: 'enhanceDefinitions', name: 'Enhance Defs', content: 'has content', marker: true },
    { identifier: 'dialogueExamples', name: 'Dialogue Examples', content: 'has content', marker: true },
    { identifier: 'metering', name: 'Metering', content: 'has content', marker: true },
    { identifier: 'timing', name: 'Timing', content: 'has content', marker: true },
    { identifier: 'realPrompt', name: 'Real', content: 'should keep' },
  ],
});

const placeholderModules = parseSTPreset(placeholderPreset);
assert(placeholderModules.length === 1, `测试3失败：应只保留 1 条（realPrompt），实际 ${placeholderModules.length}`);
assert(placeholderModules[0].id === 'st_import_realPrompt', '测试3失败：应只保留 realPrompt');
console.log('✓ 测试3 通过：占位条目跳过（marker 字段检测）');

// ────────────────────────────────────────────────────────────────────────
// 测试 4：空内容条目跳过
// ────────────────────────────────────────────────────────────────────────
const emptyPreset = JSON.stringify({
  prompts: [
    { identifier: 'emptyContent', name: 'Empty', content: '' },
    { identifier: 'emptyPrompt', name: 'Empty Prompt', prompt: '' },
    { identifier: 'noContentNoPrompt', name: 'Nothing' },
    { identifier: 'whitespaceOnly', name: 'WS', content: '   \n\t  ' },
    { identifier: 'validPrompt', name: 'Valid', content: 'real content' },
  ],
});

const emptyModules = parseSTPreset(emptyPreset);
assert(emptyModules.length === 1, `测试4失败：应只保留 1 条（validPrompt），实际 ${emptyModules.length}`);
assert(emptyModules[0].id === 'st_import_validPrompt', '测试4失败：应只保留 validPrompt');
console.log('✓ 测试4 通过：空内容条目跳过');

// ────────────────────────────────────────────────────────────────────────
// 测试 5：合并策略 - replace
// ────────────────────────────────────────────────────────────────────────
const existingModules = [
  { id: 'builtin_main_plot_cot', title: '内置', builtin: true },
  { id: 'st_import_oldPrompt', title: '旧导入', builtin: false, content: 'old' },
  { id: 'st_import_shared', title: '共享', builtin: false, content: 'old shared' },
];
const newModules = [
  { id: 'st_import_shared', title: '共享新', builtin: false, content: 'new shared' },
  { id: 'st_import_newOne', title: '全新', builtin: false, content: 'new' },
];

const replaceResult = mergeSTImportedModules(newModules, existingModules, 'replace');
assert(replaceResult.length === 4, `测试5失败：replace 应保留 4 条（builtin + oldPrompt + 2新覆盖/追加），实际 ${replaceResult.length}`);
assert(replaceResult.find((m) => m.id === 'builtin_main_plot_cot'), '测试5失败：内置模块应保留');
assert(replaceResult.find((m) => m.id === 'st_import_oldPrompt'), '测试5失败：旧 st_import（不在新导入中）应保留');
const sharedModule = replaceResult.find((m) => m.id === 'st_import_shared');
assert(sharedModule.content === 'new shared', '测试5失败：同 id 的旧 st_import 应被新模块覆盖');
assert(replaceResult.find((m) => m.id === 'st_import_newOne'), '测试5失败：新模块应追加');
console.log('✓ 测试5 通过：合并策略 replace');

// ────────────────────────────────────────────────────────────────────────
// 测试 6：合并策略 - coexist
// ────────────────────────────────────────────────────────────────────────
const coexistResult = mergeSTImportedModules(newModules, existingModules, 'coexist');
assert(coexistResult.length === 4, `测试6失败：coexist 应保留 4 条（3旧 + 1全新），实际 ${coexistResult.length}`);
assert(coexistResult.find((m) => m.id === 'st_import_shared').content === 'old shared', '测试6失败：coexist 应保留旧 st_import_shared');
assert(coexistResult.find((m) => m.id === 'st_import_newOne'), '测试6失败：新模块应追加');
console.log('✓ 测试6 通过：合并策略 coexist');

// ────────────────────────────────────────────────────────────────────────
// 测试 7：合并策略 - rename
// ────────────────────────────────────────────────────────────────────────
const renameResult = mergeSTImportedModules(newModules, existingModules, 'rename');
assert(renameResult.length === 5, `测试7失败：rename 应保留 5 条（3旧 + 2新重命名），实际 ${renameResult.length}`);
assert(renameResult.find((m) => m.id === 'st_import_shared'), '测试7失败：rename 应保留旧 st_import_shared');
assert(renameResult.find((m) => m.id === 'st_import_shared_2'), '测试7失败：rename 应将新 shared 重命名为 _2');
assert(renameResult.find((m) => m.id === 'st_import_shared_2').content === 'new shared', '测试7失败：新 shared 内容应保留');
console.log('✓ 测试7 通过：合并策略 rename');

// ────────────────────────────────────────────────────────────────────────
// 测试 8：冲突检测
// ────────────────────────────────────────────────────────────────────────
const conflicts = detectSTImportConflicts(newModules, existingModules);
assert(conflicts.length === 1, `测试8失败：应检测到 1 个冲突（st_import_shared），实际 ${conflicts.length}`);
assert(conflicts[0] === 'st_import_shared', '测试8失败：冲突 id 应为 st_import_shared');
console.log('✓ 测试8 通过：冲突检测');

// ────────────────────────────────────────────────────────────────────────
// 测试 9：role 规范化
// ────────────────────────────────────────────────────────────────────────
const rolePreset = JSON.stringify({
  prompts: [
    { identifier: 'sysRole', name: 'Sys', content: 'sys', role: 'system' },
    { identifier: 'userRole', name: 'User', content: 'user', role: 'user' },
    { identifier: 'assistantRole', name: 'Assistant', content: 'asst', role: 'assistant' },
    { identifier: 'unknownRole', name: 'Unknown', content: 'unk', role: 'weird_role' },
    { identifier: 'noRole', name: 'None', content: 'none' },
  ],
});
const roleModules = parseSTPreset(rolePreset);
assert(roleModules.find((m) => m.id === 'st_import_sysRole').role === 'system', '测试9失败：system role');
assert(roleModules.find((m) => m.id === 'st_import_userRole').role === 'user', '测试9失败：user role');
assert(roleModules.find((m) => m.id === 'st_import_assistantRole').role === 'assistant', '测试9失败：assistant role');
assert(roleModules.find((m) => m.id === 'st_import_unknownRole').role === 'system', '测试9失败：未知 role 应回退 system');
assert(roleModules.find((m) => m.id === 'st_import_noRole').role === 'system', '测试9失败：缺省 role 应为 system');
console.log('✓ 测试9 通过：role 规范化');

// ────────────────────────────────────────────────────────────────────────
// 测试 10：injection 字段映射
// ────────────────────────────────────────────────────────────────────────
const injectionPreset = JSON.stringify({
  prompts: [
    {
      identifier: 'injectTest',
      name: 'Inject',
      content: 'in-chat content',
      role: 'user',
      injection_position: 1,
      injection_depth: 7,
      injection_order: 42,
    },
    {
      identifier: 'relativeTest',
      name: 'Relative',
      content: 'relative content',
      role: 'system',
      injection_position: 0,
      injection_depth: 4,
      injection_order: 100,
    },
  ],
});
const injectModules = parseSTPreset(injectionPreset);
const injectMod = injectModules.find((m) => m.id === 'st_import_injectTest');
assert(injectMod.injectionPosition === 1, '测试10失败：injection_position=1 应映射为 In-Chat');
assert(injectMod.injectionDepth === 7, '测试10失败：injection_depth 应映射');
assert(injectMod.injectionOrder === 42, '测试10失败：injection_order 应映射');
const relativeMod = injectModules.find((m) => m.id === 'st_import_relativeTest');
assert(relativeMod.injectionPosition === 0, '测试10失败：injection_position=0 应映射为相对位置');
console.log('✓ 测试10 通过：injection 字段映射');

// ────────────────────────────────────────────────────────────────────────
// 测试 11：类目推断（含 jailbreak 与 devmode 区分）
// ────────────────────────────────────────────────────────────────────────
const categoryPreset = JSON.stringify({
  prompts: [
    { identifier: 'cotPrompt', name: 'Chain of Thought', content: 'think' },
    { identifier: 'fmtPrompt', name: 'Response Format', content: 'fmt' },
    { identifier: 'persPrompt', name: 'Narrator Persona', content: 'pers' },
    { identifier: 'jbPrompt', name: 'Jailbreak', content: 'jb' },
    { identifier: 'nsfwPrompt', name: 'NSFW Unlock', content: 'nsfw' },
    { identifier: 'devPrompt', name: 'Dev Mode', content: 'dev' },
    { identifier: 'styPrompt', name: 'Writing Style', content: 'sty' },
    { identifier: 'otherPrompt', name: 'Misc', content: 'misc' },
  ],
});
const catModules = parseSTPreset(categoryPreset);
assert(catModules.find((m) => m.id === 'st_import_cotPrompt').category === 'cot', '测试11失败：cot 类目');
assert(catModules.find((m) => m.id === 'st_import_fmtPrompt').category === 'format', '测试11失败：format 类目');
assert(catModules.find((m) => m.id === 'st_import_persPrompt').category === 'persona', '测试11失败：persona 类目');
assert(catModules.find((m) => m.id === 'st_import_jbPrompt').category === 'jailbreak', '测试11失败：jailbreak 类目（Jailbreak 关键词）');
assert(catModules.find((m) => m.id === 'st_import_nsfwPrompt').category === 'jailbreak', '测试11失败：jailbreak 类目（NSFW 关键词）');
assert(catModules.find((m) => m.id === 'st_import_devPrompt').category === 'devmode', '测试11失败：devmode 类目（Dev Mode 关键词）');
assert(catModules.find((m) => m.id === 'st_import_styPrompt').category === 'style', '测试11失败：style 类目');
assert(catModules.find((m) => m.id === 'st_import_otherPrompt').category === 'custom', '测试11失败：custom fallback');
console.log('✓ 测试11 通过：类目推断（jailbreak 与 devmode 区分）');

// ────────────────────────────────────────────────────────────────────────
// 测试 12：方案 0 新增 - 纯 XML 标签 / 纯装饰符号跳过
// ────────────────────────────────────────────────────────────────────────
// 这些是预设作者的包裹标记，本来用于包裹 ST 原生功能（如 ┏<context>...┗</context>）。
// ST 原生功能被跳过后，这些标记失去包裹对象变孤立，导入无意义。
const decorationPreset = JSON.stringify({
  prompts: [
    { identifier: 'openMark', name: '┏', content: '<context>', role: 'system' },
    { identifier: 'closeMark', name: '┗', content: '</context>', role: 'system' },
    { identifier: 'boxOpen', name: 'Box Open', content: '┏', role: 'system' },
    { identifier: 'boxClose', name: 'Box Close', content: '┗', role: 'system' },
    { identifier: 'separator', name: 'Separator', content: '━━━━━━━━━', role: 'system' },
    { identifier: 'equalsSep', name: 'Equals Sep', content: '═════════', role: 'system' },
    { identifier: 'comment', name: 'Comment', content: '<!-- block -->', role: 'system' },
    // 以下应保留：标签外有文字 / 装饰符号外有文字
    { identifier: 'mixedContent', name: 'Mixed', content: '<context>这是实际内容</context>', role: 'system' },
    { identifier: 'textWithMark', name: 'Text+Mark', content: '┏ 开始指令', role: 'system' },
    { identifier: 'realContent', name: 'Real', content: 'real instruction', role: 'system' },
  ],
});

const decorationModules = parseSTPreset(decorationPreset);
// 应保留 3 条：mixedContent（标签外有文字）/ textWithMark（装饰符号外有文字）/ realContent
assert(decorationModules.length === 3, `测试12失败：应解析出 3 条模块（跳过纯XML标签+纯装饰符号），实际 ${decorationModules.length}`);
assert(decorationModules.some((m) => m.id === 'st_import_mixedContent'), '测试12失败：标签外有文字应保留');
assert(decorationModules.some((m) => m.id === 'st_import_textWithMark'), '测试12失败：装饰符号外有文字应保留');
assert(decorationModules.some((m) => m.id === 'st_import_realContent'), '测试12失败：真实内容应保留');
assert(!decorationModules.some((m) => m.id === 'st_import_openMark'), '测试12失败：纯 <context> 应跳过');
assert(!decorationModules.some((m) => m.id === 'st_import_closeMark'), '测试12失败：纯 </context> 应跳过');
assert(!decorationModules.some((m) => m.id === 'st_import_boxOpen'), '测试12失败：纯 ┏ 应跳过');
assert(!decorationModules.some((m) => m.id === 'st_import_boxClose'), '测试12失败：纯 ┗ 应跳过');
assert(!decorationModules.some((m) => m.id === 'st_import_separator'), '测试12失败：纯 ━━━ 应跳过');
assert(!decorationModules.some((m) => m.id === 'st_import_equalsSep'), '测试12失败：纯 ═══ 应跳过');
assert(!decorationModules.some((m) => m.id === 'st_import_comment'), '测试12失败：纯 <!-- --> 应跳过');
console.log('✓ 测试12 通过：纯 XML 标签 / 纯装饰符号跳过');

// ────────────────────────────────────────────────────────────────────────
// 测试 13：random 宏（双人成行语法 {{random::a::b::c}}）
// ────────────────────────────────────────────────────────────────────────
{
  const ctx = createMacroContext();

  // 基础：3 个选项，每次执行必居其一
  const text1 = '{{random::苹果::香蕉::橙子}}';
  const result1 = processMacros(text1, ctx);
  assert(['苹果', '香蕉', '橙子'].includes(result1), `测试13失败：random 应返回选项之一，实际 "${result1}"`);

  // 多个 random 宏共存于同一段文本
  const text2 = '{{random::A::B}} {{random::C::D::E}}';
  const result2 = processMacros(text2, ctx);
  const parts2 = result2.split(' ');
  assert(parts2.length === 2, `测试13失败：应输出两个词，实际 "${result2}"`);
  assert(['A', 'B'].includes(parts2[0]), `测试13失败：第一个 random 应返回 A 或 B，实际 "${parts2[0]}"`);
  assert(['C', 'D', 'E'].includes(parts2[1]), `测试13失败：第二个 random 应返回 C/D/E，实际 "${parts2[1]}"`);

  // 单选项：直接返回该选项
  const text3 = '{{random::唯一选项}}';
  const result3 = processMacros(text3, ctx);
  assert(result3 === '唯一选项', `测试13失败：单选项 random 应返回该选项，实际 "${result3}"`);

  // 空选项：返回空串
  const text4 = '前缀{{random::}}后缀';
  const result4 = processMacros(text4, ctx);
  assert(result4 === '前缀后缀', `测试13失败：空 random 应返回空串，实际 "${result4}"`);

  // 选项内含空格和中文标点
  const text5 = '{{random::你好,世界::嗨,朋友}}';
  const result5 = processMacros(text5, ctx);
  assert(['你好,世界', '嗨,朋友'].includes(result5), `测试13失败：含中文标点的选项应被正确解析，实际 "${result5}"`);

  // random 与其他宏混用：random 在 setvar 之前执行
  const text6 = '{{random::mood_happy::mood_sad}}{{setvar::mood::happy}}';
  const result6 = processMacros(text6, ctx);
  assert(['mood_happy', 'mood_sad'].includes(result6), `测试13失败：random + setvar 混用应只输出 random 结果，实际 "${result6}"`);
  assert(ctx.local.mood === 'happy', `测试13失败：setvar 应正常执行，mood 应为 happy，实际 "${ctx.local.mood}"`);

  // 双人成行实际用例：正强化越狱语句
  const text7 = '✨✨✨ {{random::致我们最珍贵的,献给我们最珍视的,献予我们最宝贵的}}双生写手 ✨✨✨';
  const result7 = processMacros(text7, ctx);
  assert(result7.startsWith('✨✨✨ '), `测试13失败：双人成行用例前缀应保留，实际 "${result7}"`);
  assert(result7.endsWith('双生写手 ✨✨✨'), `测试13失败：双人成行用例后缀应保留，实际 "${result7}"`);
  const selected7 = result7.slice('✨✨✨ '.length, -'双生写手 ✨✨✨'.length);
  assert(['致我们最珍贵的,献给我们最珍视的,献予我们最宝贵的'].includes(selected7) || ['致我们最珍贵的', '献给我们最珍视的', '献予我们最宝贵的'].includes(selected7.split(',')[0]) || selected7.includes('献给') || selected7.includes('致我们') || selected7.includes('献予'),
    `测试13失败：双人成行用例应选中一个选项，实际 "${selected7}"`);

  // 统计分布：1000 次执行 2 选项 random，两个选项都应出现（概率保证）
  const options8 = ['是', '否'];
  let countYes = 0;
  for (let i = 0; i < 1000; i++) {
    const r = processMacros('{{random::是::否}}', createMacroContext());
    if (r === '是') countYes++;
  }
  assert(countYes > 0 && countYes < 1000, `测试13失败：1000 次 random 应两个选项都出现，是=${countYes}`);
  assert(countYes > 200 && countYes < 800, `测试13失败：1000 次 random 应大致均匀分布（200-800），是=${countYes}`);
}
console.log('✓ 测试13 通过：random 宏（双人成行语法 {{random::a::b::c}}）');

// ────────────────────────────────────────────────────────────────────────
// 测试 14：V2 保留式解析应保留 world_info / regex_scripts 原始字段
// ────────────────────────────────────────────────────────────────────────
{
  const v2Preset = JSON.stringify({
    prompts: [{ identifier: 'main', role: 'system', content: '主提示词' }],
    prompt_order: [{ character_id: 100001, order: [{ identifier: 'main', enabled: true }] }],
    world_info: [{
      uid: 1,
      comment: '匹诺康尼',
      key: ['匹诺康尼'],
      content: '梦境酒店设定',
      enabled: true,
    }],
    regex_scripts: [{
      id: 'dangerous_display_regex',
      script_name: '显示层替换',
      find_regex: '<正文>',
      replace_string: '',
      disabled: false,
    }],
  });
  const parsedV2 = parseSTPresetV2(v2Preset);
  assert(parsedV2.preset, '测试14失败：V2 预设应解析成功');
  assert(Array.isArray(parsedV2.preset.world_info), '测试14失败：V2 解析应保留 world_info 数组');
  assert(parsedV2.preset.world_info[0].content === '梦境酒店设定', '测试14失败：world_info 内容应原样保留');
  assert(Array.isArray(parsedV2.preset.regex_scripts), '测试14失败：V2 解析应保留 regex_scripts 数组');
  assert(parsedV2.preset.regex_scripts[0].script_name === '显示层替换', '测试14失败：regex_scripts 内容应原样保留');
}
console.log('✓ 测试14 通过：V2 保留式解析保留 world_info / regex_scripts');

// ────────────────────────────────────────────────────────────────────────
// 测试 15：V2 保留式解析应保留对象映射形式的 regex_scripts
// ────────────────────────────────────────────────────────────────────────
{
  const v2Preset = JSON.stringify({
    prompts: [{ identifier: 'main', role: 'system', content: '主提示词' }],
    prompt_order: [{ character_id: 100001, order: [{ identifier: 'main', enabled: true }] }],
    regex_scripts: {
      mapped_display_regex: {
        script_name: '对象映射显示层替换',
        find_regex: '<正文>',
        replace_string: '',
        disabled: false,
      },
    },
  });
  const parsedV2 = parseSTPresetV2(v2Preset);
  assert(parsedV2.preset, '测试15失败：V2 预设应解析成功');
  assert(parsedV2.preset.regex_scripts && !Array.isArray(parsedV2.preset.regex_scripts), '测试15失败：对象映射形式 regex_scripts 应原样保留');
  assert(parsedV2.preset.regex_scripts.mapped_display_regex.script_name === '对象映射显示层替换', '测试15失败：对象映射 regex_scripts 内容应原样保留');
}
console.log('✓ 测试15 通过：V2 保留式解析保留对象映射 regex_scripts');

// ────────────────────────────────────────────────────────────────────────
// 测试 16：V2 regex_scripts 应兼容 ST 原版驼峰字段
// ────────────────────────────────────────────────────────────────────────
{
  const v2Preset = JSON.stringify({
    prompts: [{ identifier: 'main', role: 'system', content: '主提示词' }],
    prompt_order: [{ character_id: 100001, order: [{ identifier: 'main', enabled: true }] }],
    regex_scripts: [{
      id: 'camel_regex',
      scriptName: '格式正则',
      findRegex: '/foo/g',
      replaceString: 'bar',
      disabled: false,
    }],
  });
  const parsedV2 = parseSTPresetV2(v2Preset);
  assert(parsedV2.preset, '测试16失败：V2 预设应解析成功');
  assert(parsedV2.preset.regex_scripts[0].scriptName === '格式正则', '测试16失败：驼峰字段 scriptName 应原样保留');
  const normalizedRegex = normalizeTavernRegexScripts(parsedV2.preset.regex_scripts);
  assert(normalizedRegex.length === 1, '测试16失败：驼峰字段 regex_scripts 应能被 UI normalize 读取');
  assert(normalizedRegex[0].findRegex === '/foo/g', '测试16失败：findRegex 应原样保留');
}
console.log('✓ 测试16 通过：V2 regex_scripts 兼容 ST 原版驼峰字段');

// ────────────────────────────────────────────────────────────────────────
// 清理
// ────────────────────────────────────────────────────────────────────────
fs.rmSync(tempDir, { recursive: true, force: true });
console.log('\n✓ ST 预设导入功能回归测试全部通过（16 项）');
