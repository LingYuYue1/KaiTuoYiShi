import fs from 'node:fs';
import { readTurnWorkflowSource } from './lib/turn-workflow-source.mjs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    console.error(`[deepseek-format] ${message}`);
    process.exit(1);
  }
}

const settings = read('models/settings.ts');
const gameSettings = read('components/features/Settings/GameSettings.tsx');
const sendWorkflow = readTurnWorkflowSource();
const textService = read('services/ai/text/index.ts');
const client = `${read('services/ai/chatCompletionClient.ts')}\n${read('services/ai/chatCompletionProtocol.ts')}`;
const diagnostics = read('services/ai/deepSeekDiagnostics.ts');
const repair = read('services/ai/structuredOutputRepair.ts');
const variableFacts = read('utils/variableFacts.ts');
const phoneService = read('services/ai/phoneService.ts');
const zhiku = read('services/zhikuRetrieval.ts');
const storyWeaving = read('src/kernel/workflows/storyWeaving.ts');
const gameState = read('hooks/useGameState.ts');
const settingsPlanes = read('models/settingsPlanes.ts');
const saveLoad = read('hooks/useGame.ts');
const apiSettings = read('components/features/Settings/ApiSettings.tsx');
const chatModel = read('models/chat.ts');
const turnItem = read('components/features/Chat/TurnItem.tsx');
const variableModel = read('services/ai/variableModel.ts');
const variableOutputFormat = read('prompts/cot/variableOutputFormat.ts');
const variableWorldbook = read('data/variableWorldbook.ts');
const variableCot = read('prompts/cot/variableCot.ts');

assert(settings.includes("export type DeepSeek主剧情模式 = 'off' | 'standard' | 'lock_format'"), '游戏设置必须声明 DeepSeek 主剧情模式枚举。');
assert(settings.includes('deepSeekMainMode: DeepSeek主剧情模式'), '游戏设置必须保存 deepSeekMainMode。');
assert(settings.includes("deepSeekMainMode: 'off'"), 'DeepSeek 主剧情模式默认必须关闭。');
assert(settingsPlanes.includes('deepSeekMainMode: execution.deepSeekMainMode'), '设备执行策略必须还原 deepSeekMainMode。');
assert(gameState.includes('composeSettings') && gameState.includes('deviceSettings'), '启动必须从 typed device settings 合并 DeepSeek 模式。');
assert(!saveLoad.includes('deepSeekMainMode:'), '故事读档不得写入或恢复设备级 DeepSeek 模式。');

assert(gameSettings.includes('DeepSeek 主剧情模式'), '游戏设置页必须提供 DeepSeek 主剧情模式按钮。');
assert(gameSettings.includes("'lock_format'") && gameSettings.includes('锁格式'), '游戏设置页必须提供 DeepSeek 锁格式选项。');
assert(gameSettings.includes('追加 DS 格式校验'), 'DeepSeek 标准模式 UI 必须说明会追加格式校验。');
assert(gameSettings.includes('锁定 <thinking>'), 'DeepSeek 锁格式 UI 必须说明锁定 thinking 起点。');
assert(gameSettings.includes('仅当主 API 供应商或 Base URL 命中 DeepSeek 时生效'), 'DeepSeek 模式 UI 必须说明只影响 DeepSeek 主 API。');

assert(sendWorkflow.includes('isDeepSeekMainConfig'), '主剧情必须有 DeepSeek 主 API 检测。');
assert(!sendWorkflow.includes('resolveMainStoryConfig'), 'DeepSeek reasoner 适配不得继续局限在主剧情局部逻辑。');
assert(sendWorkflow.includes('sendChatMessage(input.config'), '主剧情发送必须使用共享请求层。');
assert(sendWorkflow.includes('!deepSeekMainActive'), 'DeepSeek 专用模式必须跳过 CoT 伪装历史。');
assert(sendWorkflow.includes("prefixContent: deepSeekLockFormat ? '<thinking>\\n' : undefined"), 'DeepSeek 锁格式必须从 thinking 起点续写。');
assert(sendWorkflow.includes('prefixContent: input.request.prefixContent'), '主剧情请求必须透传最终 assistant prefill 内容。');
assert(!sendWorkflow.includes("prefixContent: '<正文>\\n'"), 'DeepSeek 锁格式不得再锁到正文起点，否则会跳过思维链。');
assert(sendWorkflow.includes('DEEPSEEK_MAIN_FORMAT_GUARD'), 'DeepSeek 标准/锁格式必须追加专属格式守卫。');
assert(sendWorkflow.includes("messages.push(创建聊天消息('user', DEEPSEEK_MAIN_FORMAT_GUARD))"), 'DeepSeek 格式守卫必须作为最后 user 消息进入主请求。');
assert(sendWorkflow.includes('getMainProtocolIssues'), 'DeepSeek 主剧情必须校验 thinking/正文/记忆/动态世界/变量草稿协议。');
assert(sendWorkflow.includes('buildProtocolRetryGuard'), 'DeepSeek 协议失败时必须追加重试守卫。');
assert(sendWorkflow.includes('Math.max(2, configured)'), 'DeepSeek 专用模式至少要保留一次协议失败重试。');
assert(sendWorkflow.includes("deepSeekMainMode: request.deepSeekMainActive ? request.deepSeekMainMode : 'off'"), 'debugContext 必须记录本轮 DeepSeek 模式。');
assert(sendWorkflow.includes('generation.result.deepSeekDiagnostics?.model'), 'debugContext 必须记录 DeepSeek 实际模型。');
assert(sendWorkflow.includes('deepSeekProtocolIssues: generation.deepSeekProtocolIssues'), 'debugContext 必须记录 DeepSeek 协议校验失败项。');
assert(sendWorkflow.includes('const shouldStream = input.settings.enableStreaming && !input.pageHidden'), '主剧情真实请求是否流式只能由流式设置和页面可见性决定。');
assert(sendWorkflow.includes('streaming: input.request.shouldStream'), '主剧情必须把真实流式开关传给 text service。');
assert(sendWorkflow.includes('mainRequestMode: request.requestMode') && chatModel.includes("mainRequestMode?: 'stream' | 'non-stream'"), 'debugContext 必须保存本轮主剧情真实请求模式。');
assert(!sendWorkflow.includes('forcePreviewStream'), 'DeepSeek 不得再通过 forcePreviewStream 把主剧情强制改为非流式。');
assert(!sendWorkflow.includes('enableStreaming && !forcePreviewStream'), '主剧情流式判断不得再被 DeepSeek 供应商整体压掉。');
assert(textService.includes('prefixMode?: boolean') && textService.includes('prefixContent?: string'), '主剧情 text service 必须传递 prefixMode/prefixContent。');

assert(client.includes('normalizeDeepSeekPrefixBaseUrl'), '请求层必须把 DeepSeek prefix 请求切到 beta baseUrl。');
assert(client.includes('withPrefixMessages'), '请求层必须构造 DeepSeek prefix assistant 消息。');
assert(client.includes('prefix: true'), 'DeepSeek prefix assistant 消息必须带 prefix:true。');
assert(client.includes("request.prefixContent ?? '<thinking>\\n'"), 'DeepSeek prefix 请求层默认也必须从 thinking 起点续写。');
assert(!client.includes('已自动降级为标准模式'), 'DeepSeek prefix 不支持时不得隐藏重发标准模式。');
assert(client.includes('executeWithDeepSeekDiagnostics'), '流式和非流式客户端必须接入共享 DeepSeek 诊断。');
assert(client.includes('hasReasoningPayload') && client.includes('sawReasoning'), 'OpenAI 兼容解析必须记录 reasoning 活动而不展示内容。');
assert(diagnostics.includes('attempts: 1'), 'DeepSeek 诊断必须只执行配置的模型一次。');
assert(!diagnostics.includes('fetchOpenAICompatibleModelsCached') && !diagnostics.includes('fallbackModel'), 'DeepSeek 空正文不得探测或替换模型。');
assert(chatModel.includes('deepSeekProtocolIssues?: string[]'), '聊天 debugContext 类型必须保存 DeepSeek 协议失败项。');
assert(chatModel.includes('deepSeekMainOriginalModel?: string') && !chatModel.includes('deepSeekMainAdaptedModel?: string'), '聊天 debugContext 只能保存实际 DeepSeek 模型，不得保留替换模型。');
assert(turnItem.includes('【DeepSeek 主剧情诊断】') && turnItem.includes('协议校验失败项'), '请求上下文必须展示 DeepSeek 主剧情诊断。');
assert(turnItem.includes('主剧情模型：'), '请求上下文必须展示 DeepSeek 主剧情实际模型。');
assert(turnItem.includes('主剧情请求模式：'), '请求上下文必须展示本轮真实主剧情请求模式。');

assert(repair.includes('extractJsonLikeText') && repair.includes('repairLooseJsonText') && repair.includes('parseNumberedRecallLines'), '必须提供结构化输出修复工具。');
assert(variableFacts.includes('parseJsonWithRepair') && variableFacts.includes('extractJsonLikeText(block'), '变量事实解析必须使用 JSON 修复。');
assert(variableModel.includes('checkVariableModelProtocol'), '变量模型必须校验 <thinking>/<变量事实>/<变量更新> 协议完整性。');
assert(variableModel.includes('buildVariableProtocolRepairPrompt'), '变量模型协议不完整时必须追加修复提示重试。');
assert(variableModel.includes('ensureVariableProtocolFallback') && variableModel.includes('{"facts":[]}'), '变量模型协议重试仍失败时必须兜底为空 facts，避免只有 thinking。');
assert(variableModel.includes('禁止只输出 thinking'), '变量模型用户消息必须明确禁止只输出 thinking。');
assert(variableModel.includes('reviewVariableModelContent') && variableModel.includes('buildVariableContentReviewPrompt'), '变量模型必须在空 facts 且疑似漏掉重要 NPC 日常轻记忆时触发内容复审。');
assert((variableModel.includes('低风险日常轻记忆') || variableOutputFormat.includes('低风险日常轻记忆')) && (variableModel.includes('蜂蜜奶酥') || variableOutputFormat.includes('蜂蜜奶酥')), '变量模型提示必须允许重要 NPC 共同日常写入轻记忆。');
assert(variableWorldbook.includes('共同日常也属于低风险有效互动') && variableWorldbook.includes('memory/recentInteraction/sharedExperiences'), '变量世界书必须明确重要 NPC 共同日常可写轻记忆。');
assert(variableCot.includes('重要 NPC 的共同日常可以是低风险可承接结果'), '变量 CoT 必须审计重要 NPC 日常轻记忆。');
assert(phoneService.includes('parseJsonWithRepair') && phoneService.includes('normalizeStructuredModelText(raw)'), '手机 JSON 解析必须使用结构化输出修复。');
assert(zhiku.includes('normalizeStructuredModelText(raw)'), '智库编号解析必须先清理结构化模型输出。');
assert(storyWeaving.includes('parseJsonWithRepair') && storyWeaving.includes("extractJsonLikeText(raw, 'object')"), '剧情编织 JSON 解析必须使用结构化输出修复。');

assert(apiSettings.includes('deepSeekMainMode: gameSettings.deepSeekMainMode ??'), 'API 配置包必须导出 DeepSeek 主剧情模式。');
assert(apiSettings.includes('deepSeekMainMode: profile.deepSeekMainMode ??'), 'API 配置包导入必须恢复 DeepSeek 主剧情模式。');

console.log('[deepseek-format] ok');
