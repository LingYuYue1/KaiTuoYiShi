import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const settings = fs.readFileSync('models/settings.ts', 'utf8');
const gameState = fs.readFileSync('hooks/useGameState.ts', 'utf8');
const useGame = fs.readFileSync('hooks/useGame.ts', 'utf8');
const client = fs.readFileSync('services/ai/chatCompletionClient.ts', 'utf8');
const finalizer = fs.readFileSync('hooks/useGame/mainRequestFinalizer.ts', 'utf8');
const sendWorkflow = fs.readFileSync('hooks/useGame/sendWorkflow.ts', 'utf8');
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
assert(/enableClaudeMode:\s*[a-zA-Z]+\.gameSettings\.enableClaudeMode\s*===\s*true/.test(useGame), '主 API 运行时配置必须注入 Claude 模式。');

assert(apiSettings.includes("value: 'claude_compatible'") && apiSettings.includes('Claude 兼容'), 'API 设置页必须提供 Claude 兼容选项。');
assert(!apiSettings.includes('◆ Claude 专用模式'), 'API 设置页不得重复显示 Claude 专用模式开关。');
assert(gameSettings.includes('Claude 专用模式'), '游戏设定页必须显示 Claude 专用模式开关。');
assert(gameSettings.includes('enableClaudeMode'), '游戏设定页必须能修改 enableClaudeMode。');
assert(gameSettings.includes('Gemini、DeepSeek、OpenAI 兼容模型仍走各自通道'), '游戏设定页必须说明 Claude 专用模式不会污染其他功能模型。');
assert(apiSettings.includes('怎么选：其他功能用 Gemini 或通用中转时'), 'API 设置页必须用玩家可读文案提示其他功能如何选择供应商。');
for (const file of settingTabs) {
  const text = fs.readFileSync(file, 'utf8');
  assert(text.includes('claude_compatible') && text.includes('Claude 兼容'), `${file} 必须提供 Claude 兼容选项。`);
}
for (const file of runtimeBuilders) {
  const text = fs.readFileSync(file, 'utf8');
  assert(text.includes('enableClaudeMode'), `${file} 必须传递 Claude 专用模式。`);
}

assert(client.includes("config.enableClaudeMode !== true"), 'Claude 分支必须受 enableClaudeMode 显式控制。');
assert(client.includes("config.provider === 'claude_compatible'"), 'Claude 分支必须支持 claude_compatible provider。');
assert(client.includes('shouldUseClaudeMessagesApi'), 'Claude 分支必须通过独立路由函数判断，避免全局开关误伤其他模型。');
assert(client.includes('export function resolveChatProviderCapabilities'), 'Provider 能力必须由传输层单点导出。');
assert(finalizer.includes('resolveChatProviderCapabilities(input.config)'), '主请求最终化必须消费传输层 Provider 能力。');
assert(finalizer.includes("depthInjection === 'system'"), 'Claude Messages 能力必须把 depth 模块归一化到 system。');
assert(sendWorkflow.includes('finalizeMainRequest({') && !sendWorkflow.includes("mainStoryConfig.provider !== 'claude'"), '主流程不得再复制 Claude provider 字符串分支。');
assert(client.includes('isLikelyClaudeModel'), 'Claude 兼容模式必须按模型名识别 Claude 系列，避免 Gemini 被送入 /messages。');
assert(client.includes("if (config.provider === 'claude') return true"), '官方 Claude 供应商必须始终走 Messages API，不能依赖全局 Claude 兼容开关。');
assert(client.includes("config.provider !== 'claude_compatible'"), 'Claude 兼容路由必须只对 claude_compatible 做模型名保护。');
assert(client.includes('return isLikelyClaudeModel(config.model)'), 'Claude 兼容路由必须只让 Claude/Opus/Sonnet/Haiku 模型进入 Messages API。');
assert(!client.includes("model.includes('claude')"), '不得再通过模型名自动切换 Claude 分支。');
assert(!client.includes("url.includes('anthropic') || model.includes('claude')"), '不得再通过 Base URL / 模型名自动切换 Claude 分支。');
assert(client.includes('normalizeClaudeMessages'), 'Claude 请求必须归一化 messages。');
assert(client.includes('buildClaudeRequestBody'), 'Claude 流式和非流式必须复用请求体白名单。');
assert(client.includes('buildClaudeTextBlocks'), 'Claude 请求必须把 system/messages content 转成 text content blocks。');
assert(client.includes('completionClaudeNonStream'), 'Claude 必须有独立非流式 /messages 连接测试路径。');
assert(client.includes('parseClaudeTextResponse'), 'Claude 非流式响应必须解析 content[].text。');
assert(client.includes('parseOpenAICompatibleTextResponse'), 'OpenAI 兼容非流式响应必须有宽容正文解析兜底。');
assert(client.includes('readOpenAICompatibleStreamDelta'), 'OpenAI 兼容流式响应必须有宽容 SSE 正文解析兜底。');
assert(client.includes("!allowAssistantTail && normalized[normalized.length - 1]?.role !== 'user'"), 'Claude 普通消息必须补 user，assistant prefill 模式必须允许 assistant 收尾。');
assert(client.includes("'anthropic-dangerous-direct-browser-access': 'true'"), '浏览器直连 Claude 必须带 direct browser access header。');
assert(client.includes("config.provider === 'claude_compatible'") && client.includes("'x-claude-code-attribution'"), 'Claude 兼容中转必须补充 Claude Code 归属头。');
assert(client.includes("'anthropic-client-name'] = 'claude-code'"), 'Claude 兼容中转必须提供客户端名称归属头。');

const claudeRequestBodyFunction = client.slice(client.indexOf('function buildClaudeRequestBody'), client.indexOf('function claudeHeaders'));
const claudeHeadersFunction = client.slice(client.indexOf('function claudeHeaders'), client.indexOf('function formatClaudeError'));
const claudeFunction = client.slice(client.indexOf('async function streamClaude'), client.indexOf('async function completionClaudeNonStream'));
assert(!claudeRequestBodyFunction.includes('temperature:'), 'Claude Messages API 默认请求体不得上传 temperature。');
assert(claudeRequestBodyFunction.includes('content: buildClaudeTextBlocks(message.content)'), 'Claude messages[].content 必须使用 text content block 数组，兼容 Claude Code 类中转。');
assert(claudeRequestBodyFunction.includes('bodyObj.system = buildClaudeTextBlocks(claudePayload.system)'), 'Claude 根级 system 必须使用 text content block 数组，兼容要求 system 数组的中转。');
assert(claudeHeadersFunction.includes("if (config.provider === 'claude_compatible')"), 'Claude Code 归属头只能加给 Claude 兼容中转，避免影响官方 Claude。');
assert(client.includes('max_tokens'), 'Claude Messages API 必须使用 max_tokens。');
assert(claudeFunction.includes('/messages'), 'Claude Messages API 必须请求 /messages。');
assert(client.includes('buildClaudeRequestBody(config, messages, request, false)'), 'Claude 非流式请求必须设置 stream:false。');
assert(client.includes('completionGeminiNonStream'), 'Gemini 必须有真正独立的非流式 generateContent 路径。');
assert(client.includes('collectSystemMessageText(messages)'), 'Gemini 与 OpenCode Gemini 必须合并全部 system 消息。');
assert(client.includes("part?.type === 'text'"), 'Claude 非流式解析必须只读取 text content block。');
assert(client.includes("parsed?.type === 'content_block_delta'"), 'OpenAI 兼容流式解析必须兼容 Claude/Anthropic content_block_delta。');
assert(client.includes("deltaType === 'thinking_delta'"), 'OpenAI 兼容流式解析必须丢弃 thinking delta。');
assert(client.includes('return parseOpenAICompatibleTextResponse(json);'), 'OpenAI 兼容非流式路径必须使用宽容正文解析。');
assert(client.includes('const text = parseOpenAICompatibleTextResponse(json);') && client.includes('mergePrefixResult(deepSeekPayload.prefix, text)'), 'DeepSeek 非流式 prefix 合并前必须使用宽容正文解析。');
assert(client.includes('formatClaudeError'), 'Claude 错误必须提供中文诊断提示。');
assert(client.includes('/chat/completions'), 'OpenAI 兼容路径必须继续请求 /chat/completions。');

assert(apiTools.includes("config.provider === 'claude' || config.provider === 'claude_compatible'"), '获取模型列表必须支持 Claude 兼容。');

console.log('claude compatible regression ok');
