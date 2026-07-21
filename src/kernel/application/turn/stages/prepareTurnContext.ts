import { 创建聊天消息, type 聊天消息 } from '@/models/chat';
import type { NPC账本选择结果 } from '@/models/npc';
import { selectNpcLedgersForTurn } from '@/models/npc';
import { 格式化开局档案上下文 } from '@/models/world';
import {
  buildImmediateStoryReview,
  buildMainRecallQuery,
  buildZhikuKeywordRecallQuery,
} from '@/src/kernel/workflows/historyWindow';
import { getZhikuNpcNamesForTurn } from '@/src/kernel/workflows/npcPresence';
import { formatYitingRecallSummary, formatZhikuRecallSummary } from '@/src/kernel/workflows/turnProtocol';
import type { FilterContext } from '@/utils/worldbook';
import type { TurnExecutionState } from '../turnExecutionState';
import type { PreparedTurnScope } from './prepareTurnScope';
import { resolveOpeningNews } from './resolveOpeningNews';
import { retrieveRecallContext, type RecallContextResult } from './retrieveRecallContext';
import { pushQueueTask } from './turnRuntime';

export type PreparedTurnContext = Readonly<{
  history: 聊天消息[];
  worldbook: FilterContext;
  recall: RecallContextResult;
  recallSummary: string;
  recallFullContent: string;
  storyRecallInjection: string;
  npcLedgers?: NPC账本选择结果;
  newsForPrompt: Awaited<ReturnType<typeof resolveOpeningNews>>['newsForPrompt'];
}>;

export async function prepareTurnContext(input: Readonly<{
  state: TurnExecutionState;
  scope: PreparedTurnScope;
  userInput: string;
  signal: AbortSignal;
  isActive(): boolean;
  assertActive(): void;
}>): Promise<PreparedTurnContext> {
  const history = appendUserMessage(input.state, input.userInput);
  const worldbook = buildWorldbookContext(input.state, input.scope, history, input.userInput);
  const recallQuery = buildMainRecallQuery({
    userInput: input.userInput,
    history,
    currentLocation: input.scope.effectiveWorld.当前地点,
    npcNames: worldbook.npcNames,
  });
  const zhikuQuery = buildZhikuKeywordRecallQuery({ userInput: input.userInput, history });
  const openingNews = await resolveOpeningNews(
    input.state,
    input.scope,
    input.userInput,
    input.signal,
    input.isActive,
    input.assertActive,
  );
  const recall = await retrieveRecallContext(
    input.state,
    input.scope,
    { ...worldbook, npcNames: worldbook.npcNames ?? [] },
    recallQuery,
    zhikuQuery,
    input.signal,
  );
  input.assertActive();
  if (recall.yitingRecallEnabled) {
    pushQueueTask(input.state, 'yiting', 'pending', { detail: '正在检索回忆档案。', cancellable: true });
  }
  return {
    history,
    worldbook,
    recall,
    ...formatRecallContext(input.scope, history, recall),
    npcLedgers: selectNpcLedgers(input.state, input.scope, worldbook),
    newsForPrompt: openingNews.newsForPrompt,
  };
}

function appendUserMessage(state: TurnExecutionState, userInput: string): 聊天消息[] {
  const message = 创建聊天消息('user', userInput, { gameTime: `${state.turnCount}` });
  const history = [...state.chatHistory, message];
  state.chatHistory = history;
  return history;
}

function buildWorldbookContext(
  state: TurnExecutionState,
  scope: PreparedTurnScope,
  history: 聊天消息[],
  userInput: string,
): FilterContext {
  const world = scope.effectiveWorld;
  return {
    recentUserInput: userInput,
    recentAIResponse: '',
    worldName: world.当前时段?.名称 ?? '',
    travelerName: state.旅人.姓名,
    turnCount: state.turnCount,
    startScenarioId: world.起航之地ID,
    startSceneName: world.开局档案?.章节锚点名称 ?? world.当前地点,
    currentLocation: world.当前地点,
    openingRegionName: world.开局档案?.地区名称,
    openingChapterName: world.开局档案?.章节锚点名称,
    openingEntryText: world.开局档案?.玩家介入原文,
    openingSource: world.开局档案?.来源,
    openingArchiveText: 格式化开局档案上下文(world.开局档案),
    npcNames: getZhikuNpcNamesForTurn({ world, npcs: state.NPC, history, userInput, turnCount: state.turnCount }),
    originalProtagonist: world.原著主角,
    currentScope: scope.currentScope,
    storyMode: world.剧情模式,
    recentMessages: history.map((message) => message.content).filter(Boolean).slice(-100),
    messageCount: state.turnCount,
    worldbookTriggerStates: state.worldbookTriggerStates,
  };
}

function formatRecallContext(scope: PreparedTurnScope, history: 聊天消息[], recall: RecallContextResult) {
  const immediateReview = scope.isOpeningSystemTrigger ? '' : buildImmediateStoryReview(history);
  return {
    recallSummary: [
      formatZhikuRecallSummary(recall.zhikuPreview?.diagnostics),
      formatYitingRecallSummary(recall.yitingPreview?.previewText),
    ].join('\n'),
    recallFullContent: [
      recall.zhikuPreview?.injection ? `【智库完整召回】\n${recall.zhikuPreview.injection}` : '',
      recall.yitingPreview?.injection ? `【记忆完整召回】\n${recall.yitingPreview.injection}` : '',
    ].filter(Boolean).join('\n\n'),
    storyRecallInjection: [
      immediateReview ? `# 即时剧情回顾\n\n【即时剧情回顾】\n${immediateReview}` : '',
      recall.yitingPreview?.injection ?? '',
    ].filter((item) => item.trim()).join('\n\n'),
  };
}

function selectNpcLedgers(
  state: TurnExecutionState,
  scope: PreparedTurnScope,
  worldbook: FilterContext,
): NPC账本选择结果 | undefined {
  if (scope.isOpeningSystemTrigger) return undefined;
  return selectNpcLedgersForTurn({
    records: state.NPC,
    turnCount: state.turnCount,
    explicitNames: worldbook.npcNames,
    sceneNames: scope.effectiveWorld.当前时段?.人物?.map((npc) => npc.姓名),
    recalledNames: worldbook.npcNames,
  });
}
