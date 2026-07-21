import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import type { API配置项, 游戏设置 } from '@/models/settings';
import { buildLeanAssistantHistoryContent } from '@/src/kernel/workflows/historyWindow';
import { DEEPSEEK_MAIN_FORMAT_GUARD } from '@/src/kernel/workflows/turnProtocol';
import { COT_FAKE_HISTORY_ASSISTANT, COT_FAKE_HISTORY_USER, isDeepSeekMainConfig } from './turnRuntime';
import { buildRerollGenerationGuard } from './rerollPolicy';

type ChatModuleMessage = Readonly<{
  role: string;
  content: string;
  _injectionPosition?: number;
  _injectionDepth?: number;
}>;

export type RequestMessagePlan = Readonly<{
  messages: 聊天消息[];
  deepSeekMainMode: NonNullable<游戏设置['deepSeekMainMode']>;
  deepSeekMainActive: boolean;
  deepSeekLockFormat: boolean;
  prefixMode: boolean;
  prefixContent?: string;
  shouldStream: boolean;
  requestMode: 'stream' | 'non-stream';
}>;

export function planRequestMessages(input: Readonly<{
  tavernMessages: readonly 聊天消息[] | null;
  recentHistory: readonly 聊天消息[];
  moduleMessages: readonly ChatModuleMessage[];
  settings: 游戏设置;
  mainConfig: Pick<API配置项, 'provider' | 'baseUrl' | 'model'>;
  opening: boolean;
  openingInstruction: string;
  enteringAwakening: boolean;
  awakeningInstruction: string;
  awakeningPhase?: 'question' | 'judgement';
  reroll?: Readonly<{ nonce: string; previousResponse: string }> | null;
  pageHidden: boolean;
}>): RequestMessagePlan {
  const messages = input.tavernMessages
    ? [...input.tavernMessages]
    : buildHistoryMessages(input);
  appendAwakeningReminder(messages, input.awakeningPhase);

  const deepSeekMainMode = input.settings.deepSeekMainMode ?? 'off';
  const deepSeekMainActive = isDeepSeekMainConfig(input.mainConfig) && deepSeekMainMode !== 'off';
  const deepSeekLockFormat = deepSeekMainActive && deepSeekMainMode === 'lock_format';
  if (deepSeekMainActive) messages.push(创建聊天消息('user', DEEPSEEK_MAIN_FORMAT_GUARD));
  if (input.reroll && !input.opening) {
    messages.push(创建聊天消息('user', buildRerollGenerationGuard(input.reroll.nonce, input.reroll.previousResponse)));
  }
  if (input.settings.enableCotFakeHistory && !input.opening && !deepSeekMainActive) {
    messages.unshift(
      创建聊天消息('user', COT_FAKE_HISTORY_USER),
      创建聊天消息('assistant', COT_FAKE_HISTORY_ASSISTANT),
    );
  }
  if (!input.tavernMessages) injectChatModules(messages, input.moduleMessages);

  const shouldStream = input.settings.enableStreaming && !input.pageHidden;
  return {
    messages,
    deepSeekMainMode,
    deepSeekMainActive,
    deepSeekLockFormat,
    prefixMode: deepSeekLockFormat,
    prefixContent: deepSeekLockFormat ? '<thinking>\n' : undefined,
    shouldStream,
    requestMode: shouldStream ? 'stream' : 'non-stream',
  };
}

function buildHistoryMessages(input: Parameters<typeof planRequestMessages>[0]): 聊天消息[] {
  const messages = input.recentHistory.flatMap((message) => {
    if (message.role === 'user' && message.content.startsWith('[系统]')) return [];
    if (message.role === 'user') return [message];
    return message.role === 'assistant' && message.parsedResponse
      ? [创建聊天消息('assistant', buildLeanAssistantHistoryContent(message))]
      : [];
  });
  if (input.opening) messages.push(创建聊天消息('user', input.openingInstruction));
  if (input.enteringAwakening && input.awakeningInstruction) {
    messages.push(创建聊天消息('user', input.awakeningInstruction));
  }
  return messages;
}

function appendAwakeningReminder(messages: 聊天消息[], phase?: 'question' | 'judgement'): void {
  if (phase !== 'judgement') return;
  messages.push(创建聊天消息(
    'user',
    '命途狭间回应回合：必须单独输出 `<狭间评判>升阶</狭间评判>`，回应玩家答案并将旅人送回现实场景。',
  ));
}

function injectChatModules(messages: 聊天消息[], modules: readonly ChatModuleMessage[]): void {
  if (modules.some((message) => message._injectionPosition !== 1)) {
    throw new Error('user/assistant 提示词模块只支持 In-Chat depth 注入');
  }
  for (const module of [...modules].sort((a, b) => (b._injectionDepth ?? 0) - (a._injectionDepth ?? 0))) {
    const index = Math.max(0, messages.length - (module._injectionDepth ?? 0));
    messages.splice(index, 0, 创建聊天消息(module.role as 'user' | 'assistant', module.content));
  }
}
