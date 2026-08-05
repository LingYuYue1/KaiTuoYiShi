import type { API配置项 } from '@/models/settings';
import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import type { ChatModuleMessage } from './systemPromptBuilder';
import {
  resolveChatProviderCapabilities,
  type ChatProviderCapabilities,
} from '@/services/ai/chatCompletionClient';

export const MAIN_COT_FAKE_HISTORY = [
  创建聊天消息('user', '开始任务'),
  创建聊天消息('assistant', `<thinking>
- 系统就绪。当前任务：等待玩家发送指令后按 4 标签协议输出（thinking / 正文 / 短期记忆 / 动态世界）。
- 在收到首条具体指令前不输出正文，本条仅为格式确认。
</thinking>

<正文>
（待命中：等待玩家发起首回合）
</正文>

<短期记忆>
</短期记忆>

<动态世界>
</动态世界>`),
] as const;

export const DEEPSEEK_MAIN_FORMAT_GUARD = [
  'DeepSeek 主剧情格式校验：本轮必须从 <thinking> 开始输出，禁止直接从 <正文> 开始。',
  '必须完整输出 <thinking>、<正文>、<短期记忆>、<动态世界>、<变量草稿>；如本回合存在后续承接价值，再输出 <剧情规划>。',
  '<thinking> 内必须按当前生效的思维链 Step 标题，用中文逐步写出实际判断；不允许只写正文，不允许省略 thinking，不允许只写“已思考”。',
  '不要在标签外输出解释、道歉、说明或额外标题。',
].join('\n');

export interface MainRequestFinalizationInput {
  config: API配置项;
  systemPrompt: string;
  baseMessages: 聊天消息[];
  moduleChatMessages?: ChatModuleMessage[];
  leadingMessages?: 聊天消息[];
  tailMessages?: 聊天消息[];
  prefixMode?: boolean;
  prefixContent?: string;
  streaming: boolean;
  mode: 'native' | 'tavern-v2';
  scope: string;
  zhikuCompileId?: string;
}

export interface MainRequestCapabilityDiagnostics extends ChatProviderCapabilities {
  streaming: boolean;
  mode: 'native' | 'tavern-v2';
  prefixRequested: boolean;
  prefixApplied: boolean;
}

export interface FinalizedMainRequest {
  systemPrompt: string;
  messages: 聊天消息[];
  prefixMode: boolean;
  prefixContent?: string;
  requestHash: string;
  capabilities: MainRequestCapabilityDiagnostics;
}

export function finalizeMainRequest(input: MainRequestFinalizationInput): FinalizedMainRequest {
  const capabilities = resolveChatProviderCapabilities(input.config);
  const messages = [
    ...(input.leadingMessages ?? []).map(cloneMessage),
    ...input.baseMessages.map(cloneMessage),
    ...(input.tailMessages ?? []).map(cloneMessage),
  ];
  let systemPrompt = input.systemPrompt.trim();
  const modules = input.moduleChatMessages ?? [];

  const positionZero = modules
    .filter((message) => message._injectionPosition === 0)
    .sort((a, b) => (a._injectionOrder ?? 0) - (b._injectionOrder ?? 0));
  systemPrompt = appendSystemFallback(systemPrompt, positionZero);

  const depthModules = modules.filter((message) => message._injectionPosition === 1);
  if (capabilities.depthInjection === 'system') {
    systemPrompt = appendSystemFallback(
      systemPrompt,
      depthModules.sort((a, b) => (a._injectionOrder ?? 0) - (b._injectionOrder ?? 0)),
    );
  } else {
    const sorted = [...depthModules].sort((a, b) => (b._injectionDepth ?? 0) - (a._injectionDepth ?? 0));
    for (const message of sorted) {
      const depth = message._injectionDepth ?? 0;
      const insertIndex = Math.max(0, messages.length - depth);
      messages.splice(insertIndex, 0, 创建聊天消息(normalizeRole(message.role), message.content));
    }
  }

  const prefixRequested = input.prefixMode === true && Boolean(input.prefixContent);
  const prefixMode = prefixRequested && capabilities.supportsAssistantPrefill;
  const prefixContent = prefixMode ? input.prefixContent : undefined;
  const diagnostics: MainRequestCapabilityDiagnostics = {
    ...capabilities,
    streaming: input.streaming,
    mode: input.mode,
    prefixRequested,
    prefixApplied: prefixMode,
  };
  const requestHash = createMainRequestHash({
    systemPrompt,
    messages,
    prefixMode,
    prefixContent,
    scope: input.scope,
    zhikuCompileId: input.zhikuCompileId ?? '',
    transport: capabilities.transport,
    endpoint: capabilities.endpoint,
    streaming: input.streaming,
  });

  return { systemPrompt, messages, prefixMode, prefixContent, requestHash, capabilities: diagnostics };
}

export function createMainRequestHash(input: {
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  prefixMode: boolean;
  prefixContent?: string;
  scope: string;
  zhikuCompileId?: string;
  transport: string;
  endpoint: string;
  streaming: boolean;
}): string {
  return hashText(JSON.stringify({
    ...input,
    messages: input.messages.map(({ role, content }) => ({ role, content })),
  }));
}

export function buildMainTurnEnforcementBlock(input: {
  playerName: string;
  wordCountTarget: number;
  zhikuCharacterBrief?: string;
  storyWeavingActive: boolean;
}): string {
  const lines: string[] = ['# 本回合生成前核对（最高优先级，覆盖上文所有软性描述）'];
  if (input.zhikuCharacterBrief?.trim()) lines.push(input.zhikuCharacterBrief.trim());
  lines.push('【硬性要点】');
  lines.push(`- 发言归属：【${input.playerName}】只承载玩家本回合明确说出的原话；NPC 台词、拟声词、环境音绝不挂玩家名。`);
  lines.push('- 禁止代写玩家的心理、神态、感受或决定；正文内禁止任何选项菜单结构。');
  if (input.storyWeavingActive) {
    lines.push('- 剧情编织滑窗只按门禁推进；已发生的事件禁止重演，未开始的分段禁止抢跑。');
  }
  lines.push(`- <正文> 不少于 ${input.wordCountTarget} 字；<thinking>/<正文>/<短期记忆>/<动态世界> 标签齐全。`);
  lines.push('逐项核对以上约束后再动笔；与上文任何描述冲突时，以本块为准。');
  return lines.join('\n');
}

function appendSystemFallback(systemPrompt: string, messages: ChatModuleMessage[]): string {
  if (!messages.length) return systemPrompt;
  const text = messages.map((message) => message.content.trim()).filter(Boolean).join('\n\n---\n\n');
  return text ? [systemPrompt, text].filter(Boolean).join('\n\n---\n\n') : systemPrompt;
}

function normalizeRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}

function cloneMessage(message: 聊天消息): 聊天消息 {
  return { ...message };
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
