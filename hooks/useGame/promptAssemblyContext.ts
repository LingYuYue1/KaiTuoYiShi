import type { 聊天消息 } from '@/models/chat';
import type { 世界状态 } from '@/models/world';
import type { 世界书 } from '@/models/worldbook';
import { createMacroContext, type MacroContext } from '@/utils/macroEngine';
import {
  resolveWorldbookInjectionPlan,
  type FilterContext,
  type WorldbookInjectionPlan,
} from '@/utils/worldbook';

export type PromptAssemblyScope = 'opening' | 'main' | 'pathAwakening';

export interface PromptWorldbookContextInput {
  userInput: string;
  history: 聊天消息[];
  world: 世界状态;
  travelerName: string;
  turnCount: number;
  npcNames: string[];
  scope: PromptAssemblyScope;
  openingArchiveText?: string;
  worldbookTriggerStates?: Record<string, number>;
}

export function buildPromptWorldbookContext(input: PromptWorldbookContextInput): FilterContext {
  return {
    recentUserInput: input.userInput,
    recentAIResponse: '',
    worldName: input.world.当前时段?.名称 ?? '',
    travelerName: input.travelerName,
    turnCount: input.turnCount,
    startScenarioId: input.world.起航之地ID,
    startSceneName: input.world.开局档案?.章节锚点名称 ?? input.world.当前地点,
    currentLocation: input.world.当前地点,
    currentRegionId: input.world.当前区域ID,
    openingRegionName: input.world.开局档案?.地区名称,
    openingChapterName: input.world.开局档案?.章节锚点名称,
    openingEntryText: input.world.开局档案?.玩家介入原文,
    openingSource: input.world.开局档案?.来源,
    openingArchiveText: input.openingArchiveText,
    npcNames: input.npcNames,
    originalProtagonist: input.world.原著主角,
    currentScope: input.scope,
    storyMode: input.world.剧情模式,
    recentMessages: input.history
      .map((message) => (typeof message.content === 'string' ? message.content : ''))
      .filter(Boolean)
      .slice(-100),
    messageCount: input.turnCount,
    worldbookTriggerStates: input.worldbookTriggerStates,
  };
}

export interface PromptMacroContextInput {
  history: 聊天消息[];
  playerName: string;
  turnCount: number;
  modelName?: string;
  maxContext?: number;
  globals?: Record<string, string>;
}

export function buildPromptMacroContext(input: PromptMacroContextInput): MacroContext {
  const lastMessage = input.history[input.history.length - 1];
  const lastUserMessage = [...input.history].reverse().find((message) => message.role === 'user');
  const lastAssistantMessage = [...input.history].reverse().find((message) => message.role === 'assistant');

  return createMacroContext(input.globals, {
    charName: input.playerName,
    userName: input.playerName,
    lastMessage: lastMessage?.content ?? '',
    lastUserMessage: lastUserMessage?.content ?? '',
    lastCharMessage: lastAssistantMessage?.content ?? '',
    messageCount: input.history.length,
    turnCount: input.turnCount,
    modelName: input.modelName,
    maxContext: input.maxContext,
  });
}

/** 同一固定回合使用同一伪随机序列，避免快照预览与真实请求分别重抽 probability。 */
export function resolvePromptWorldbookPlan(
  books: 世界书[] | undefined,
  context: FilterContext,
  enabled: boolean,
): WorldbookInjectionPlan | null {
  if (!enabled || !books) return null;
  return resolveWorldbookInjectionPlan(books, context, {
    random: createSeededRandom(buildWorldbookSeed(context)),
  });
}

function buildWorldbookSeed(context: FilterContext): string {
  const triggerState = Object.entries(context.worldbookTriggerStates ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, turn]) => `${id}:${turn}`)
    .join('|');
  return [
    context.currentScope ?? 'main',
    context.turnCount,
    context.messageCount ?? 0,
    context.recentUserInput,
    ...(context.recentMessages ?? []),
    triggerState,
  ].join('\u241f');
}

function createSeededRandom(seedText: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    state ^= seedText.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  state >>>= 0;

  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
