import type { 角色数据结构 } from '@/models/character';
import type { 聊天消息 } from '@/models/chat';
import type { 世界状态 } from '@/models/world';
import type { 记忆系统 } from '@/models/memory';
import type { 游戏设置 } from '@/models/settings';
import type { 提示词模块, 提示词模块作用域 } from '@/models/prompts';
import type { 开局来源 } from '@/models/journey';
import type { 世界书 } from '@/models/worldbook';
import type { NPC记录, NPC账本选择结果 } from '@/models/npc';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';
import type { 忆庭系统 } from '@/models/yiting';
import type { 手机系统 } from '@/models/phone';
import type { FilterContext, WorldbookInjectionPlan } from '@/utils/worldbook';
import { replaceWorldbookPlaceholders } from '@/utils/worldbook';
import { processMacros, type MacroContext } from '@/utils/macroEngine';
import { getPromptPlayerName } from './systemPromptSections';

export type 命途狭间阶段 = 'question' | 'judgement';
export type PromptScope = 'main' | 'opening' | 'pathAwakening';
export type ModuleBucket = 'identity' | 'rules' | 'params' | 'protocol';

export interface ChatModuleMessage {
  role: string;
  content: string;
  _injectionPosition?: number;
  _injectionDepth?: number;
  _injectionOrder?: number;
}

export interface BuiltSystemPrompt {
  systemPrompt: string;
  chatModuleMessages: ChatModuleMessage[];
}

export interface SystemPromptInput {
  scope: PromptScope;
  traveler: 角色数据结构;
  world: 世界状态;
  settings: 游戏设置;
  modules: 提示词模块[];
  turnCount: number;
  worldbooks?: 世界书[];
  worldbookCtx?: FilterContext;
  worldbookPlan: WorldbookInjectionPlan | null;
  memory?: 记忆系统;
  npcRecords?: NPC记录[];
  news?: 新闻条目[];
  plotNodes?: 剧情节点[];
  storyWeaving?: 剧情编织系统;
  zhiku?: 智库系统;
  yiting?: 忆庭系统;
  phone?: 手机系统;
  awakeningPhase?: 命途狭间阶段;
  yitingInjectionOverride?: string;
  zhikuInjectionOverride?: string;
  npcLedgerSelection?: NPC账本选择结果;
  triggerType?: string;
  macroCtx?: MacroContext;
  storyPlanSnippets?: string[];
}

export interface PromptModuleInjectionCtx {
  wordCountTarget: number;
  personLabel: string;
  playerName: string;
  currentScope: 提示词模块作用域;
  openingSource?: 开局来源;
  triggerType?: string;
  macroCtx?: MacroContext;
  worldbookCtx?: FilterContext;
  chat: ChatModuleMessage[];
}

export function moduleBucket(m: 提示词模块): ModuleBucket {
  if (m.id === 'builtin_dev_mode' || m.id === 'builtin_narrator_persona') return 'identity';
  if (m.id.startsWith('builtin_perspective_')) return 'params';
  if (m.order >= 1000) return 'protocol';
  return 'rules';
}

export function makeModuleCtx(input: SystemPromptInput, scope: PromptScope): PromptModuleInjectionCtx {
  const personLabel =
    input.settings.narrativePerson === 'second' ? '第二人称"你"'
    : input.settings.narrativePerson === 'first' ? '第一人称"我"'
    : '第三人称"他/她"';
  return {
    wordCountTarget: input.settings.wordCountTarget,
    personLabel,
    playerName: getPromptPlayerName(input.traveler),
    currentScope: scope,
    openingSource: input.world.开局档案?.来源,
    triggerType: input.triggerType,
    macroCtx: input.macroCtx,
    worldbookCtx: input.worldbookCtx,
    chat: [],
  };
}

function moduleMatches(m: 提示词模块, ctx: PromptModuleInjectionCtx): boolean {
  if (!m.enabled) return false;
  const scope = m.scope.length ? m.scope : (['all'] as 提示词模块作用域[]);
  if (!scope.includes('all') && !scope.includes(ctx.currentScope)) return false;
  if (m.openingSourceGate?.length) {
    if (ctx.currentScope !== 'opening' || !ctx.openingSource || !m.openingSourceGate.includes(ctx.openingSource)) {
      return false;
    }
  }
  if (m.injectionTrigger?.length) {
    if (!ctx.triggerType || !m.injectionTrigger.includes(ctx.triggerType)) return false;
  }
  return true;
}

export function injectBucket(
  modules: 提示词模块[] | undefined,
  ctx: PromptModuleInjectionCtx,
  bucket: ModuleBucket,
): { systemSection: string; chatModuleMessages: ChatModuleMessage[] } {
  if (!modules || modules.length === 0) return { systemSection: '', chatModuleMessages: [] };
  const filtered = modules
    .filter((m) => moduleMatches(m, ctx) && moduleBucket(m) === bucket)
    .sort((a, b) => a.order - b.order);
  if (filtered.length === 0) return { systemSection: '', chatModuleMessages: [] };

  const systemParts: string[] = [];
  const chatMessages: ChatModuleMessage[] = [];
  for (const m of filtered) {
    const baseReplaced = m.content
      .replace(/\{wordCountTarget\}/g, String(ctx.wordCountTarget))
      .replace(/\{personLabel\}/g, ctx.personLabel)
      .replace(/\{playerName\}/g, ctx.playerName);
    const replaced = ctx.worldbookCtx
      ? replaceWorldbookPlaceholders(baseReplaced, ctx.worldbookCtx)
      : baseReplaced;
    const content = ctx.macroCtx ? processMacros(replaced, ctx.macroCtx) : replaced;
    const role = m.role ?? 'system';
    if (role === 'system') {
      systemParts.push(content);
    } else {
      chatMessages.push({
        role,
        content,
        _injectionPosition: m.injectionPosition ?? 0,
        _injectionDepth: m.injectionDepth ?? 4,
        _injectionOrder: m.injectionOrder ?? m.order,
      });
    }
  }
  return {
    systemSection: systemParts.join('\n\n---\n\n'),
    chatModuleMessages: chatMessages,
  };
}

export function assemblePromptChunks(chunks: string[], chat: ChatModuleMessage[]): BuiltSystemPrompt {
  return {
    systemPrompt: chunks.filter((chunk) => chunk.trim()).join('\n\n---\n\n'),
    chatModuleMessages: chat,
  };
}

export function buildPromptWorldbookContext(input: {
  userInput: string;
  history: 聊天消息[];
  world: 世界状态;
  travelerName: string;
  turnCount: number;
  npcNames: string[];
  scope: PromptScope;
  openingArchiveText?: string;
  worldbookTriggerStates?: Record<string, number>;
}): FilterContext {
  return {
    recentUserInput: input.userInput,
    recentAIResponse: '',
    worldName: input.world.当前时段.名称,
    travelerName: input.travelerName,
    turnCount: input.turnCount,
    startScenarioId: input.world.起航之地ID,
    startSceneName: input.world.开局档案?.章节锚点名称 ?? input.world.当前地点,
    currentLocation: input.world.当前地点,
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
