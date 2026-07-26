/**
 * 片 3 管线类型：TurnContext（不可变输入 + 回合工具）与 TurnDeltas（逐阶段填充的产出）。
 * 规则：TurnDeltas 全部字段可选；阶段函数返回部分 deltas，调用方 Object.assign 合并。
 *
 * 导入按需追加——每新增一个阶段就把需要的类型加进来。
 */
import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { API配置项 } from '@/models/settings';
import type { 聊天消息, 回合快照 } from '@/models/chat';
import type { 新闻条目 } from '@/models/news';
import type { 世界状态 } from '@/models/world';
import type { 角色数据结构 } from '@/models/character';
import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import type { 手机系统 } from '@/models/phone';
import type { NPC记录, NPC账本选择结果 } from '@/models/npc';
import type { 智库系统 } from '@/models/zhiku';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 解析后回复 } from '@/models/chat';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { MacroContext } from '@/utils/macroEngine';
import { createWorkflowRecoveryJournal } from '@/services/workflowRecovery';
export type WorkflowRecoveryJournal = ReturnType<typeof createWorkflowRecoveryJournal>;

/** 不可变输入 + 回合生命周期工具。 */
export interface TurnContext {
  // 输入
  state: UseGameStateReturn;
  userInput: string;
  deps: {
    getActiveConfig: () => API配置项 | null;
    onBeforeSend: () => void;
    onAfterSend: () => void;
    rerollContext?: { nonce: string; previousResponse: string } | null;
  };
  config: API配置项;
  mainStoryConfig: API配置项;
  isOpeningSystemTrigger: boolean;
  isAwakeningEnterTrigger: boolean;
  awakeningPathId: string | undefined;
  awakeningInstruction: string;
  openingInstruction: string;
  effectiveWorld: 世界状态;
  turnCountAtStart: number;
  variableBatchesAtStart: UseGameStateReturn['variableBatches'];
  queueTasksMirror: UseGameStateReturn['queueTasks'];

  // 生命周期工具
  abortController: AbortController;
  isCurrentWorkflow: () => boolean;
  assertWorkflowActive: () => void;
  streamMessageSetter: ReturnType<typeof import('@/utils/rafCoalescedSetter').createRafCoalescedSetter>;

  // 恢复日志（引用固定，内容逐阶段 update）
  recoveryJournal: WorkflowRecoveryJournal;

  // catch 块恢复用
  rollbackHistoryOnAbort: 聊天消息[];
  rollbackSnapshotOnAbort: 回合快照 | null;
}

/**
 * 逐阶段填充的产出。全部字段可选——每阶段函数只填充自己产出的字段。
 * 调用方用 Object.assign(d, await stageN_xxx(ctx, d)) 合并。
 */
export interface TurnDeltas {
  // S1: 回合开始
  recoveryJournal?: WorkflowRecoveryJournal;
  preTurnSnapshot?: 回合快照;
  userMsg?: 聊天消息;
  updatedHistory?: 聊天消息[];

  // S2: 主模型前置
  awakeningPhase?: 'question' | 'judgement' | undefined;
  currentTriggerType?: string;
  macroCtx?: MacroContext;
  openingNewsPreprocessed?: boolean;
  openingNewsForSave?: 新闻条目[] | null;
  yitingPreview?: unknown;
  zhikuPreview?: unknown;
  yitingEnabled?: boolean;
  yitingRecallEnabled?: boolean;
  zhikuRecallEnabled?: boolean;
  storyWeavingGate?: unknown;
  storyWeavingDiagnostics?: unknown;
  npcLedgerSelection?: NPC账本选择结果;
  recallSummaryForTurn?: string;
  recallFullContentForTurn?: string;

  // S2→S3 bridge: builtPrompt.chatModuleMessages
  chatModuleMessages?: unknown;

  // S3: system prompt + API 消息组装
  systemPrompt?: string;
  apiMessages?: 聊天消息[];
  tavernV2Messages?: 聊天消息[] | null;
  tavernV2Error?: unknown;
  shouldTryTavernV2?: boolean;

  // S3→S4 bridge: ST V2 / DeepSeek / prefix
  deepSeekMainActive?: boolean;
  deepSeekLockFormat?: boolean;
  deepSeekMainMode?: string;
  effectivePrefixMode?: boolean;
  effectivePrefixContent?: string;
  mainRequestMode?: string;
  maxAttempts?: number;
  currentPresetV2ForStage?: unknown;

  // S4: AI 请求 + 响应解析
  rawFullText?: string;  // S4 产出：AI 响应原文，供 S7 天气解析用
  displayText?: string;
  parsedForDisplay?: 解析后回复 | null;
  deepSeekProtocolIssuesForTurn?: string[];
  rerollSimilarityForTurn?: number | undefined;
  rerollSimilarityRetried?: boolean;

  // S5: 回复落地
  aiMsg?: 聊天消息;
  finalHistory?: 聊天消息[];

  // S6: 记忆
  mem?: 记忆系统;
  yitingWithCompression?: 忆庭系统;

  // S7: 世界/旅人
  worldAfter?: 世界状态;
  travelerAfter?: 角色数据结构;

  // S8: 变量结算
  variableOverrides?: Record<string, unknown> | null;
  failedVariableBatch?: 变量命令批次;
  pendingVariableStarted?: boolean;

  // S9: NPC
  npcAfterCompression?: NPC记录[];

  // S10: 剧情/智库
  storyWeavingForSave?: 剧情编织系统 | null;
  memoryAfterStoryProgress?: 记忆系统 | null;
  storyProgressMemoryLine?: string;
  zhikuAfterRuntimeUnlock?: 智库系统 | null;

  // S11: 后台闭包
  newsAfterGeneration?: 新闻条目[] | null;
  yitingAfterTurnRecall?: 忆庭系统;
  phoneAfterFallbackSeed?: 手机系统;
  finalHistoryForSave?: 聊天消息[];

}
