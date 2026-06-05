import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const gameState = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const useGame = fs.readFileSync('hooks/useGame.ts', 'utf8');
const client = fs.readFileSync('services/ai/chatCompletionClient.ts', 'utf8');
const apiTools = fs.readFileSync('services/ai/apiTools.ts', 'utf8');
const apiSettings = fs.readFileSync('components/features/Settings/ApiSettings.tsx', 'utf8');
const gameSettings = fs.readFileSync('components/features/Settings/GameSettings.tsx', 'utf8');
const settingTabs = [
  'components/features/Settings/ApiSettings.tsx',
  'components/features/Settings/ImageGenerationSettingsTab.tsx',
  'components/features/Settings/MemorySystemSettings.tsx',
  'components/features/Settings/NewsSystemSettingsTab.tsx',
  'components/features/Settings/PhoneSystemSettingsTab.tsx',
  'components/features/Settings/StoryWeavingSettingsTab.tsx',
  'components/features/Settings/VariableUpdateSettings.tsx',
  'components/features/Settings/YitingSettingsTab.tsx',
  'components/features/Settings/ZhikuSettingsTab.tsx',
];
const runtimeBuilders = [
  'hooks/useGame.ts',
  'hooks/useGame/newsWorkflow.ts',
  'services/ai/imagePromptTokenizer.ts',
  'services/ai/phoneService.ts',
  'services/storyWeaving.ts',
];

assert(settings.includes("'claude_compatible'"), 'AI 提供商必须包含 claude_compatible。');
assert(settings.includes('enableClaudeMode?: boolean'), 'API 配置项必须能携带运行时 Claude 模式。');
assert(settings.includes('enableClaudeMode: boolean'), '游戏设置必须保存 Claude 专用模式开关。');
assert(settings.includes('enableClaudeMode: false'), 'Claude 专用模式默认必须关闭。');
assert(gameState.includes('enableClaudeMode: savedGame.enableClaudeMode ?? defaults.enableClaudeMode'), '旧存档读取必须归一化 Claude 模式。');
assert(useGame.includes('enableClaudeMode: state.gameSettings.enableClaudeMode === true'), '主 API 运行时配置必须注入 Claude 模式。');

assert(apiSettings.includes("value: 'claude_compatible'") && apiSettings.includes('Claude 兼容'), 'API 设置页必须提供 Claude 兼容选项。');
assert(!apiSettings.includes('◆ Claude 专用模式'), 'API 设置页不得重复显示 Claude 专用模式开关。');
assert(gameSettings.includes('Claude 专用模式'), '游戏设定页必须显示 Claude 专用模式开关。');
assert(gameSettings.includes('enableClaudeMode'), '游戏设定页必须能修改 enableClaudeMode。');
assert(gameSettings.includes('OpenAI 兼容 Claude 中转请保持关闭'), '游戏设定页必须说明 OpenAI 兼容 Claude 中转不要开启 Claude 模式。');
for (const file of settingTabs) {
  const text = fs.readFileSync(file, 'utf8');
  assert(text.includes('claude_compatible') && text.includes('Claude 兼容'), `${file} 必须提供 Claude 兼容选项。`);
}
for (const file of runtimeBuilders) {
  const text = fs.readFileSync(file, 'utf8');
  assert(text.includes('enableClaudeMode'), `${file} 必须传递 Claude 专用模式。`);
}

assert(client.includes("config.enableClaudeMode === true"), 'Claude 分支必须受 enableClaudeMode 显式控制。');
assert(client.includes("config.provider === 'claude_compatible'"), 'Claude 分支必须支持 claude_compatible provider。');
assert(!client.includes("model.includes('claude')"), '不得再通过模型名自动切换 Claude 分支。');
assert(!client.includes("url.includes('anthropic') || model.includes('claude')"), '不得再通过 Base URL / 模型名自动切换 Claude 分支。');
assert(client.includes('normalizeClaudeMessages'), 'Claude 请求必须归一化 messages。');
assert(client.includes('buildClaudeRequestBody'), 'Claude 流式和非流式必须复用请求体白名单。');
assert(client.includes('completionClaudeNonStream'), 'Claude 必须有独立非流式 /messages 连接测试路径。');
assert(client.includes('parseClaudeTextResponse'), 'Claude 非流式响应必须解析 content[].text。');
assert(client.includes("normalized[normalized.length - 1]?.role !== 'user'"), 'Claude messages 最后一条必须补成 user。');
assert(client.includes("'anthropic-dangerous-direct-browser-access': 'true'"), '浏览器直连 Claude 必须带 direct browser access header。');

const claudeRequestBodyFunction = client.slice(client.indexOf('function buildClaudeRequestBody'), client.indexOf('function claudeHeaders'));
const claudeFunction = client.slice(client.indexOf('async function streamClaude'), client.indexOf('async function completionClaudeNonStream'));
assert(!claudeRequestBodyFunction.includes('temperature:'), 'Claude Messages API 默认请求体不得上传 temperature。');
assert(client.includes('max_tokens'), 'Claude Messages API 必须使用 max_tokens。');
assert(claudeFunction.includes('/messages'), 'Claude Messages API 必须请求 /messages。');
assert(client.includes('buildClaudeRequestBody(config, messages, request, false)'), 'Claude 非流式请求必须设置 stream:false。');
assert(client.includes("part?.type === 'text'"), 'Claude 非流式解析必须只读取 text content block。');
assert(client.includes('formatClaudeError'), 'Claude 错误必须提供中文诊断提示。');
assert(client.includes('/chat/completions'), 'OpenAI 兼容路径必须继续请求 /chat/completions。');

assert(apiTools.includes("config.provider === 'claude' || config.provider === 'claude_compatible'"), '获取模型列表必须支持 Claude 兼容。');

console.log('claude compatible regression ok');
