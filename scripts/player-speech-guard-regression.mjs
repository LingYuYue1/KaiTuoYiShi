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

const mod = await import(pathToFileURL(`${process.cwd()}/.tmp-regression/player-speech/playerSpeechGuard.js`).href);
const { normalizePlayerSpeechInBody, replaceBodyInRawResponse, shouldRenderAsNarrationForPlayerLine } = mod;

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

const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
const renderers = fs.readFileSync('components/features/Chat/MessageRenderers.tsx', 'utf8');
const chatList = fs.readFileSync('components/features/Chat/ChatList.tsx', 'utf8');

assert(sendWorkflow.includes("from '@/utils/playerSpeechGuard'"), 'sendWorkflow 必须使用玩家发言守卫清洗正文。');
assert(sendWorkflow.includes('replaceBodyInRawResponse'), 'sendWorkflow 必须保存清洗后的原始消息正文块。');
assert(sendWorkflow.includes('userInput,'), 'sendWorkflow 清洗玩家气泡时必须传入本回合玩家输入。');
assert(renderers.includes('shouldRenderAsNarrationForPlayerLine'), '渲染层必须对旧消息玩家气泡做兜底归属检查。');
assert(chatList.includes('previousUserInput'), 'ChatList 必须把 AI 回复对应的上一条玩家输入传给渲染层。');

console.log('player speech guard regression ok');
