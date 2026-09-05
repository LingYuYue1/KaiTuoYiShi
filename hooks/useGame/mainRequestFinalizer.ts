import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import {
  COT_FAKE_HISTORY_ASSISTANT,
  COT_FAKE_HISTORY_USER,
  DEEPSEEK_MAIN_FORMAT_GUARD,
} from './mainResponseProtocol';
import type { ChatModuleMessage } from './promptAssembly';
import type { PromptScope } from './promptAssembly';
import { buildRerollGenerationGuard } from './workflowRetry';

export type MainStoryMessageMode =
  | 'standard'
  | 'cot_pseudo'
  | 'deepseek_standard'
  | 'deepseek_prefix'
  | 'tavern_v2';

export const OPENING_TURN_INSTRUCTION =
  '请根据当前角色、当前场景、世界书与内置提示词，直接生成第 0 回合开场叙事。不要等待玩家再次输入。';

export const AWAKENING_JUDGEMENT_REMINDER =
  '⚠ 命途狭间·回应回合提醒:你上一回合已出三题,玩家本轮给出了答案。本回合**必须**在所有标签之外、**单独**写一行 `<狭间评判>升阶</狭间评判>`。命途狭间没有失败、滞留或退转;三问只是让玩家明确自己的道路。漏掉这个标签会让玩家永远卡在虚境无法升阶——这是必须避免的错误。同时正文里要让命途意志回应玩家答案、确认其道路,再把旅人从虚境拉回现实场景。';

export function buildAwakeningEnterInstruction(pathId: string): string {
  return `玩家选择踏入「命途狭间」(命途 ID: ${pathId})。请按 pathAwakening 流程生成第一道诘问,不要推进主剧情,不要等玩家再次发言。`;
}

export function deriveMainStoryMessageMode(input: {
  tavernV2Active: boolean;
  deepSeekMainActive: boolean;
  deepSeekLockFormat: boolean;
  enableCotFakeHistory: boolean;
}): MainStoryMessageMode {
  if (input.tavernV2Active) return 'tavern_v2';
  if (input.deepSeekMainActive) return input.deepSeekLockFormat ? 'deepseek_prefix' : 'deepseek_standard';
  if (input.enableCotFakeHistory) return 'cot_pseudo';
  return 'standard';
}

export function buildCotPseudoTaskSequence(realUserInput: string): 聊天消息[] {
  return [
    创建聊天消息('assistant', `以下是用户最新输入内容：\n<用户输入>${realUserInput}</用户输入>`),
    创建聊天消息('user', COT_FAKE_HISTORY_USER),
    创建聊天消息('assistant', COT_FAKE_HISTORY_ASSISTANT),
  ];
}

export function insertDepthIntoHistory(
  history: 聊天消息[],
  depthMessages: ChatModuleMessage[],
): 聊天消息[] {
  if (!depthMessages.length) return history;
  const sorted = [...depthMessages].sort(
    (a, b) => (b._injectionDepth ?? 0) - (a._injectionDepth ?? 0),
  );
  const result = [...history];
  for (const message of sorted) {
    const depth = message._injectionDepth ?? 0;
    const insertIndex = Math.max(0, result.length - depth);
    result.splice(insertIndex, 0, 创建聊天消息(normalizeRole(message.role), message.content));
  }
  return result;
}

export interface MainRequestSource {
  scope: PromptScope;
  awakeningPhase?: 'question' | 'judgement';
  systemPrompt: string;
  chatModuleMessages: ChatModuleMessage[];
  preTurnHistory: 聊天消息[];
  latestUserInput: string;
  tavernMessages: 聊天消息[] | null;
  deepSeekMainActive: boolean;
  deepSeekLockFormat: boolean;
  enableCotFakeHistory: boolean;
  reroll: { nonce: string; previousResponse: string } | null;
  prefixMode?: boolean;
  prefixContent?: string;
  provider?: string;
}

export interface FinalizedMainRequest {
  systemPrompt: string;
  messages: 聊天消息[];
  prefixMode: boolean;
  prefixContent?: string;
  mode: MainStoryMessageMode;
}

export function finalizeMainRequest(source: MainRequestSource): FinalizedMainRequest {
  const enableCot = source.scope === 'main' && source.enableCotFakeHistory && !source.deepSeekMainActive;
  const mode = deriveMainStoryMessageMode({
    tavernV2Active: Boolean(source.tavernMessages?.length),
    deepSeekMainActive: source.deepSeekMainActive,
    deepSeekLockFormat: source.deepSeekLockFormat,
    enableCotFakeHistory: enableCot,
  });
  const claude = source.provider === 'claude';
  const split = splitModuleMessages(source.chatModuleMessages);
  let systemPrompt = source.systemPrompt.trim();
  if (claude && split.depthMessages.length) {
    systemPrompt = appendToSystemPrompt(systemPrompt, split.depthMessages.map((item) => item.content));
  }
  const history = claude
    ? source.preTurnHistory
    : insertDepthIntoHistory(source.preTurnHistory, split.depthMessages);
  const messages = [
    ...history,
    ...split.positionZeroCompat,
    ...buildTurnConstraints(source),
    ...buildTaskSequence(mode, source.latestUserInput, source.tavernMessages),
  ];
  const prefixMode = source.prefixMode === true && Boolean(source.prefixContent);
  const prefixContent = prefixMode ? source.prefixContent : undefined;
  return {
    systemPrompt,
    messages,
    prefixMode,
    prefixContent,
    mode,
  };
}

function splitModuleMessages(modules: ChatModuleMessage[]): {
  depthMessages: ChatModuleMessage[];
  positionZeroCompat: 聊天消息[];
} {
  const ordered = [...modules].sort((a, b) => (a._injectionOrder ?? 0) - (b._injectionOrder ?? 0));
  return {
    depthMessages: ordered.filter((item) => item._injectionPosition === 1),
    positionZeroCompat: ordered
      .filter((item) => item._injectionPosition === 0)
      .map((item) => 创建聊天消息(normalizeRole(item.role), item.content)),
  };
}

function buildTurnConstraints(source: MainRequestSource): 聊天消息[] {
  const constraints: 聊天消息[] = [];
  if (source.deepSeekMainActive) {
    constraints.push(创建聊天消息('user', DEEPSEEK_MAIN_FORMAT_GUARD));
  }
  if (source.reroll) {
    constraints.push(创建聊天消息(
      'user',
      buildRerollGenerationGuard(source.reroll.nonce, source.reroll.previousResponse),
    ));
  }
  if (source.awakeningPhase === 'judgement') {
    constraints.push(创建聊天消息('user', AWAKENING_JUDGEMENT_REMINDER));
  }
  return constraints;
}

function buildTaskSequence(
  mode: MainStoryMessageMode,
  latestUserInput: string,
  tavernMessages: 聊天消息[] | null,
): 聊天消息[] {
  if (mode === 'tavern_v2' && tavernMessages?.length) return tavernMessages;
  if (mode === 'cot_pseudo') return buildCotPseudoTaskSequence(latestUserInput);
  return latestUserInput ? [创建聊天消息('user', latestUserInput)] : [];
}

function appendToSystemPrompt(systemPrompt: string, chunks: string[]): string {
  const text = chunks.map((item) => item.trim()).filter(Boolean).join('\n\n---\n\n');
  return text ? `${systemPrompt}\n\n---\n\n${text}` : systemPrompt;
}

function normalizeRole(role: string): 'user' | 'assistant' {
  return role === 'assistant' ? 'assistant' : 'user';
}
