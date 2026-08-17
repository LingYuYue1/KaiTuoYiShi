import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

execFileSync(
  process.execPath,
  [
    'node_modules/typescript/bin/tsc',
    'utils/playerSpeechGuard.ts',
    '--outDir',
    '.tmp-regression/player-speech',
    '--module',
    'ES2022',
    '--target',
    'ES2022',
    '--moduleResolution',
    'Bundler',
    '--skipLibCheck',
  ],
  { stdio: 'inherit' },
);

execFileSync(
  process.execPath,
  [
    'node_modules/esbuild/bin/esbuild',
    'utils/presetMerger.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--outfile=.tmp-regression/player-speech/presetMerger.mjs',
  ],
  { stdio: 'inherit' },
);

execFileSync(
  process.execPath,
  [
    'node_modules/esbuild/bin/esbuild',
    'utils/narrativeBodyParser.ts',
    '--bundle',
    '--format=esm',
    '--platform=node',
    '--outfile=.tmp-regression/player-speech/narrativeBodyParser.mjs',
  ],
  { stdio: 'inherit' },
);

const mod = await import(pathToFileURL(`${process.cwd()}/.tmp-regression/player-speech/playerSpeechGuard.js`).href);
const parser = await import(pathToFileURL(`${process.cwd()}/.tmp-regression/player-speech/narrativeBodyParser.mjs`).href);
const presetMerger = await import(pathToFileURL(`${process.cwd()}/.tmp-regression/player-speech/presetMerger.mjs`).href);
const { normalizeInlineSpeakerTags, normalizePlayerSpeechInBody, replaceBodyInRawResponse, shouldRenderAsNarrationForPlayerLine } = mod;
const { parseNarrativeBody, serializeNarrativeBody } = parser;
const { mergeWithBuiltin } = presetMerger;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalize(body, input = '', mode = 'no-control', playerAliases = []) {
  return normalizePlayerSpeechInBody({
    body,
    playerName: '凌',
    playerAliases,
    userInput: input,
    mode,
  });
}

assert(
  normalize('【凌】轰隆——！！！', '我看向前方') === '【旁白】轰隆——！！！',
  '拟声词不能挂在玩家头像下。',
);

assert(
  normalize('【凌】轰隆隆——！！！', '我看向前方') === '【旁白】轰隆隆——！！！',
  '长拟声词不能挂在玩家头像下。',
);

assert(
  normalize('【凌】吼——！！！', '我后退一步') === '【旁白】吼——！！！',
  '生物/怪物吼叫不能挂在玩家头像下。',
);

assert(
  normalize('【凌】小心，右侧舱门要塌了！', '我看向三月七') === '【旁白】小心，右侧舱门要塌了！',
  '玩家未说出口的 NPC/旁白式台词不能挂玩家名。',
);

assert(
  normalize('【旁白】“我是凌，巡海游侠。”', '我说：“我是凌，巡海游侠。”') === '【凌】我是凌，巡海游侠。',
  '玩家明确说出口的旁白引号句应转为玩家气泡。',
);

assert(
  normalize('【凌】我是凌，巡海游侠。', '我说：“我是凌，巡海游侠。”') === '【凌】我是凌，巡海游侠。',
  '有玩家输入证据的玩家台词应保留玩家气泡。',
);

assert(
  normalize('【牢凌】我是凌。', '我说：“我是凌。”', 'no-control', ['牢凌']) === '【凌】我是凌。',
  '玩家别名标签也必须在最终清洗中归属到玩家并统一为主显示名。',
);

assert(
  normalize('【凌】小心，右侧舱门要塌了！', '', 'expansion') === '【凌】小心，右侧舱门要塌了！',
  '抢话模式允许短暂自然化补写，不要求玩家台词逐字出现在输入中。',
);

const expansionFinalBody = normalize('【凌】小心，右侧舱门要塌了！', '', 'expansion');
assert(
  serializeNarrativeBody(parseNarrativeBody(expansionFinalBody, { traveler: { 姓名: '凌', 别名: '' }, userInput: '', partial: false })) === expansionFinalBody,
  '抢话模式已经确认的规范玩家标签，最终序列化不能再次降级为旁白。',
);

const streamingPlayerSegments = parseNarrativeBody('【凌】我先去看看。', {
  traveler: { 姓名: '凌', 别名: '' },
  userInput: '',
  partial: true,
});
assert(
  streamingPlayerSegments.some((segment) => segment.kind === 'dialogue' && segment.speaker === '凌' && segment.stability === 'stable'),
  '流式正文中显式闭合的玩家标签无需等待换行或结束即可确定玩家说话者。',
);

const incompleteNarrationQuote = parseNarrativeBody('【旁白】“我会先', {
  traveler: { 姓名: '凌', 别名: '' },
  userInput: '我说：“我会先处理舱门。”',
  partial: true,
});
assert(
  incompleteNarrationQuote.every((segment) => segment.kind !== 'dialogue'),
  '流式未闭合引号不能提前提升为玩家头像。',
);

const completeNarrationQuote = parseNarrativeBody('【旁白】“我会先处理舱门。”', {
  traveler: { 姓名: '凌', 别名: '' },
  userInput: '我说：“我会先处理舱门。”',
  partial: true,
});
assert(
  completeNarrationQuote.some((segment) => segment.kind === 'dialogue' && segment.speaker === '凌'),
  '引号闭合且有输入证据后，旁白引号应与最终渲染一致地提升为玩家头像。',
);

assert(
  serializeNarrativeBody(parseNarrativeBody('【凌】我先去看看。', { traveler: { 姓名: '凌', 别名: '' } })) === '【凌】我先去看看。',
  '规范玩家标签一旦进入共享解析器，不能再因缺少输入证据被二次降级为旁白。',
);

const mergedPresetModules = mergeWithBuiltin([{
  id: 'st_import_perspective_conflict',
  title: '第三人称视角',
  description: '冲突人称',
  category: 'persona',
  content: '请使用第三人称叙述。',
  enabled: true,
  builtin: false,
  order: 100,
  scope: ['main'],
  source: 'st_preset',
  createdAt: 1,
  updatedAt: 1,
}]);
const mergedPerspectiveIds = mergedPresetModules
  .filter((module) => module.id.startsWith('builtin_perspective_'))
  .map((module) => `${module.id}:${module.enabled}`);
assert(
  mergedPerspectiveIds.join('|') === 'builtin_perspective_first:false|builtin_perspective_second:true|builtin_perspective_third:false',
  'ST 预设人称冲突不得静默切换内置人称模块。',
);
assert(
  mergedPresetModules.some((module) => module.id === 'st_import_perspective_addendum' && module.content.includes('不得据此修改或覆盖游戏设置中的当前叙述人称')),
  'ST 人称要求只能以不覆盖游戏设置的附加约束保留。',
);

assert(
  normalize('【凌】“我是凌。” 你抬起手。', '我说：“我是凌。”') === '【凌】我是凌。\n【旁白】你抬起手。',
  '玩家台词后混入动作时应拆成玩家台词 + 旁白。',
);

const inlineSpeakerTags = normalizeInlineSpeakerTags('【旁白】刀锋落下。【瓦尔特】……冷静。【旁白】月台终于安静。');
assert(
  inlineSpeakerTags === '【旁白】刀锋落下。\n【瓦尔特】……冷静。\n【旁白】月台终于安静。',
  '同一行里连续出现多个【旁白】/【角色名】标签时，必须拆成多行渲染。',
);

const normalizedInlineBody = normalize('【旁白】刀锋落下。【瓦尔特】……冷静。【旁白】月台终于安静。', '');
assert(
  normalizedInlineBody === '【旁白】刀锋落下。\n【瓦尔特】……冷静。\n【旁白】月台终于安静。',
  '正文落库清洗必须先拆分行内角色标签。',
);

assert(
  shouldRenderAsNarrationForPlayerLine('轰隆——！！！', '我看向前方') === true,
  '渲染旧消息时，玩家名下拟声词应兜底改旁白。',
);

assert(
  shouldRenderAsNarrationForPlayerLine('轰隆隆——！！！', '我看向前方') === true,
  '渲染旧消息时，长环境音也应兜底改旁白。',
);

const rendererSource = fs.readFileSync('components/features/Chat/MessageRenderers.tsx', 'utf8');
const parserSource = fs.readFileSync('utils/narrativeBodyParser.ts', 'utf8');
assert(
  parserSource.includes('quoted && options.traveler && !shouldRenderAsNarrationForPlayerLine(quoted, options.userInput)'),
  '旁白中的整句引号只有在玩家输入有证据时才能提升为玩家气泡。',
);
assert(
  rendererSource.includes('parseNarrativeBody(content, { traveler, userInput, partial })') &&
    parserSource.includes('normalizeInlineSpeakerTags(body)'),
  '最终与流式渲染必须复用统一正文解析器，并拆分同一行内的多个角色标签。',
);

assert(
  shouldRenderAsNarrationForPlayerLine('小心，右侧舱门要塌了！', '我看向三月七') === true,
  '渲染旧消息时，玩家没说出口的台词也应兜底改旁白，避免玩家夺舍 NPC。',
);

assert(
  shouldRenderAsNarrationForPlayerLine('我是凌。', '我说：“我是凌。”') === false,
  '渲染旧消息时，有证据的玩家台词仍应显示玩家头像。',
);

const sanitizedRaw = replaceBodyInRawResponse(
  '<thinking>ok</thinking>\n<正文>\n【凌】轰隆——！！！\n</正文>\n<短期记忆>空间站震动。</短期记忆>',
  '【旁白】轰隆——！！！',
);
assert(
  sanitizedRaw.includes('【旁白】轰隆——！！！') && !sanitizedRaw.includes('【凌】轰隆'),
  '保存进原始消息的 <正文> 块也必须替换成清洗后的正文。',
);
assert(
  sanitizedRaw.includes('<thinking>ok</thinking>') && sanitizedRaw.includes('<短期记忆>空间站震动。</短期记忆>'),
  '替换 rawText 正文块时不能破坏 thinking / 记忆等其他标签。',
);

const protocolRawWithoutBody = replaceBodyInRawResponse(
  '<thinking>Step0: 读取上下文</thinking>\n<短期记忆>- 空间站震动。</短期记忆>',
  '【旁白】空间站震动。',
);
assert(
  protocolRawWithoutBody.includes('<thinking>Step0: 读取上下文</thinking>') &&
    protocolRawWithoutBody.includes('<短期记忆>- 空间站震动。</短期记忆>') &&
    !protocolRawWithoutBody.startsWith('【旁白】空间站震动。'),
  'rawText 含协议标签但缺 <正文> 时，不能把原始消息压成清洗后的纯正文。',
);

const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const renderers = fs.readFileSync('components/features/Chat/MessageRenderers.tsx', 'utf8');
const chatList = fs.readFileSync('components/features/Chat/ChatList.tsx', 'utf8');
const systemPromptBuilder = fs.readFileSync('hooks/useGame/systemPromptBuilder.ts', 'utf8');
const builtinPromptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');
const builtinWorldbookConfig = fs.readFileSync('data/builtinWorldbookConfig.ts', 'utf8');
const worldbookUtils = fs.readFileSync('utils/worldbook.ts', 'utf8');

assert(sendWorkflow.includes("from '@/utils/playerSpeechGuard'"), 'sendWorkflow 必须使用玩家发言守卫清洗正文。');
assert(sendWorkflow.includes('replaceBodyInRawResponse'), 'sendWorkflow 必须保存清洗后的原始消息正文块。');
assert(sendWorkflow.includes('userInput,'), 'sendWorkflow 清洗玩家气泡时必须传入本回合玩家输入。');
assert(parserSource.includes('shouldRenderAsNarrationForPlayerLine'), '统一解析器必须对旧消息玩家气泡做兜底归属检查。');
assert(renderers.includes('parseNarrativeBody'), '渲染层必须复用统一正文解析工具。');
assert(!renderers.includes('该行未识别为 【旁白】/【角色名】/【心声】 任一格式'), '无前缀正文应按普通旁白显示，不应在玩家界面用暗色警告。');
assert(!renderers.includes('dimmed'), '无前缀正文渲染不得继续使用 dimmed 旁白色差。');
assert(chatList.includes('previousUserInput'), 'ChatList 必须把 AI 回复对应的上一条玩家输入传给渲染层。');
assert(chatList.includes('previousUserInput={streamingPreviousUserInput}'), '流式 TurnItem 必须显式传入最近一条玩家输入，保持流式与最终归属一致。');
// 结构轮(D1, 2026-07-26): 硬编码发言归属段已删除——唯一权威在「回复格式」模块行格式段,
// 生成点兜底在 sendWorkflow 区E执法块。以下断言守卫新形态:
assert(!systemPromptBuilder.includes('buildSpeakerAttributionSection'), '硬编码发言归属段必须保持已删除状态(权威在回复格式模块)。');
assert(!systemPromptBuilder.includes('【玩家角色名】'), 'systemPromptBuilder 不得暴露输出形状的玩家角色名占位。');
assert(builtinPromptModules.includes('禁止把说明词“玩家角色名”当成角色标签输出'), '回复格式模块必须禁止玩家角色名占位泄漏。');
assert(builtinPromptModules.includes('玩家原话的具体呈现方式由本回合生效的「防抢话 / 抢话」模式决定'), '回复格式模块必须按双模式约束玩家原话承接。');
assert(builtinPromptModules.includes('防抢话只承接明确输入'), '防抢话模式必须只承接玩家明确输入。');
assert(builtinPromptModules.includes('原句【{playerName}】行') && builtinPromptModules.includes('不强制逐字'), '回复格式模块必须允许按模式自然安排玩家原话。');
assert(sendWorkflow.includes('buildMainTurnEnforcementBlock({'), 'sendWorkflow 必须在生成点前注入区E执法块（经共享构建函数）。');
assert(sendWorkflow.includes('buildMainTurnEnforcementBlock({'), '区E执法块必须经共享构建函数注入（发言归属兜底行在 mainRequestFinalizer）。');
assert(!systemPromptBuilder.includes('.replace(/玩家姓名/g'), '提示词模块注入不能把说明性“玩家姓名”替换成真实玩家名。');
assert(!systemPromptBuilder.includes('.replace(/主角姓名/g'), '提示词模块注入不能把说明性“主角姓名”替换成真实玩家名。');
assert(!worldbookUtils.includes('.replace(/玩家姓名/g'), '世界书占位替换不能把说明性“玩家姓名”替换成真实玩家名。');
assert(!worldbookUtils.includes('.replace(/主角姓名/g'), '世界书占位替换不能把说明性“主角姓名”替换成真实玩家名。');
assert(builtinPromptModules.includes('当前互动的核心玩家角色为「{playerName}」'), '叙述者人格必须声明当前互动核心玩家角色。');
assert(builtinPromptModules.includes('【{playerName}】我是某位巡海游侠'), '默认回复格式示例必须使用可替换玩家名占位。');
assert(!builtinPromptModules.includes('【玩家角色名】'), '默认提示词模块不得继续暴露输出形状的玩家角色名占位。');
assert(!builtinPromptModules.includes('我是凌，巡海游侠'), '默认提示词示例不能把凌作为主角名写死。');
assert(builtinWorldbookConfig.includes('【{playerName}】'), '默认世界书模板必须使用可替换玩家名占位。');
assert(!builtinWorldbookConfig.includes('【玩家角色名】'), '默认世界书模板不得继续暴露输出形状的玩家角色名占位。');

console.log('player speech guard regression ok');
