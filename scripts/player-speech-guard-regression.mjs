import fs from 'node:fs';
import { readTurnWorkflowSource } from './lib/turn-workflow-source.mjs';
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

const mod = await import(pathToFileURL(`${process.cwd()}/.tmp-regression/player-speech/playerSpeechGuard.js`).href);
const { normalizeInlineSpeakerTags, normalizePlayerSpeechInBody, replaceBodyInRawResponse, shouldRenderAsNarrationForPlayerLine } = mod;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function normalize(body, input = '') {
  return normalizePlayerSpeechInBody({
    body,
    playerName: '凌',
    userInput: input,
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
assert(
  rendererSource.includes('quoted && traveler && !shouldRenderAsNarrationForPlayerLine(quoted, userInput)'),
  '旁白中的整句引号只有在玩家输入有证据时才能提升为玩家气泡。',
);
assert(
  rendererSource.includes('normalizeInlineSpeakerTags(body).split'),
  '渲染旧消息时也必须拆分同一行内的多个角色标签。',
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

const sendWorkflow = readTurnWorkflowSource();
const renderers = fs.readFileSync('components/features/Chat/MessageRenderers.tsx', 'utf8');
const chatList = fs.readFileSync('components/features/Chat/ChatList.tsx', 'utf8');
const systemPromptBuilder = fs.readFileSync('src/kernel/workflows/systemPromptBuilder.ts', 'utf8');
const builtinPromptModules = fs.readFileSync('data/builtinPromptModules.ts', 'utf8');
const builtinWorldbookConfig = fs.readFileSync('data/builtinWorldbookConfig.ts', 'utf8');
const worldbookUtils = fs.readFileSync('utils/worldbook.ts', 'utf8');

assert(sendWorkflow.includes("from '@/utils/playerSpeechGuard'"), 'sendWorkflow 必须使用玩家发言守卫清洗正文。');
assert(sendWorkflow.includes('replaceBodyInRawResponse'), 'sendWorkflow 必须保存清洗后的原始消息正文块。');
assert(sendWorkflow.includes('userInput,'), 'sendWorkflow 清洗玩家气泡时必须传入本回合玩家输入。');
assert(renderers.includes('shouldRenderAsNarrationForPlayerLine'), '渲染层必须对旧消息玩家气泡做兜底归属检查。');
assert(renderers.includes('normalizeInlineSpeakerTags'), '渲染层必须复用行内角色标签拆分工具。');
assert(!renderers.includes('该行未识别为 【旁白】/【角色名】/【心声】 任一格式'), '无前缀正文应按普通旁白显示，不应在玩家界面用暗色警告。');
assert(!renderers.includes('dimmed'), '无前缀正文渲染不得继续使用 dimmed 旁白色差。');
assert(chatList.includes('previousUserInput'), 'ChatList 必须把 AI 回复对应的上一条玩家输入传给渲染层。');
assert(systemPromptBuilder.includes('buildSpeakerAttributionSection(traveler)'), '发言归属硬约束必须读取当前角色并注入真实玩家名。');
assert(systemPromptBuilder.includes('const playerTag = `【${playerName}】`;'), '发言归属硬约束必须构造真实玩家名标签。');
assert(!systemPromptBuilder.includes('【玩家角色名】'), '发言归属硬约束不得继续暴露输出形状的玩家角色名占位。');
assert(systemPromptBuilder.includes('不要生成任何包含“玩家角色名”的发言标签'), '发言归属硬约束必须禁止玩家角色名占位泄漏。');
assert(systemPromptBuilder.includes('${playerTag} 只允许承载玩家本回合输入中明确说出口的原话'), '发言归属硬约束必须把玩家原话绑定到真实玩家名标签。');
assert(systemPromptBuilder.includes('不要写成【旁白】你说'), '发言归属硬约束必须明确禁止旁白吞掉玩家原话。');
assert(systemPromptBuilder.includes('动作写进【旁白】，原话单独写成 ${playerTag}'), '发言归属硬约束必须明确动作与原话拆分。');
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
