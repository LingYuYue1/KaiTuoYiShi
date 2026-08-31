import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { API配置项, DeepSeek主剧情模式 } from '@/models/settings';
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
import type { 相册系统 } from '@/models/imageGeneration';
import type { 解析后回复 } from '@/models/chat';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { MacroContext } from '@/utils/macroEngine';
import type { 忆庭召回结果 } from '@/services/yitingRetrieval';
import type { 智库检索结果 } from '@/services/zhikuRetrieval';
import type { 剧情编织门禁快照, 剧情编织注入诊断 } from '@/services/storyWeaving';
import type { STPresetEntryV2 } from '@/models/stTypes';
import type { ChatModuleMessage } from './promptAssembly';
import type { VariableCalibrationOverrides } from './variableWorkflow';
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
  worldAtStart: 世界状态;
  travelerAtStart: 角色数据结构;
  zhikuAtStart: 智库系统;
  phoneAtStart: 手机系统;
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
  isPathAwakeningTurn?: boolean;
  currentTriggerType?: 'swipe' | 'opening' | 'normal';
  macroCtx?: MacroContext;
  macroGlobalVarsAfterTurn?: Record<string, string>;
  worldbookTriggerStatesAfterTurn?: Record<string, number>;
  openingNewsPreprocessed?: boolean;
  openingNewsForSave?: 新闻条目[] | null;
  yitingPreview?: 忆庭召回结果 | null;
  zhikuPreview?: 智库检索结果 | null;
  yitingEnabled?: boolean;
  yitingRecallEnabled?: boolean;
  zhikuRecallEnabled?: boolean;
  storyWeavingGate?: 剧情编织门禁快照 | null;
  storyWeavingDiagnostics?: 剧情编织注入诊断 | null;
  npcLedgerSelection?: NPC账本选择结果;
  recallSummaryForTurn?: string;
  recallFullContentForTurn?: string;

  // S2→S3 bridge: builtPrompt.chatModuleMessages
  chatModuleMessages?: ChatModuleMessage[];

  // S3: system prompt + API 消息组装
  systemPrompt?: string;
  apiMessages?: 聊天消息[];
  tavernV2Messages?: 聊天消息[] | null;
  tavernV2Error?: Error | null;
  shouldTryTavernV2?: boolean;

  // S3→S4 bridge: ST V2 / DeepSeek / prefix
  deepSeekMainActive?: boolean;
  deepSeekLockFormat?: boolean;
  deepSeekMainMode?: DeepSeek主剧情模式;
  effectivePrefixMode?: boolean;
  effectivePrefixContent?: string;
  mainRequestMode?: 'stream' | 'non-stream';
  maxAttempts?: number;
  currentPresetV2ForStage?: STPresetEntryV2 | null;

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
  variableOverrides?: VariableCalibrationOverrides | null;
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
  /** 片 5a-2（题外发现 #1）：背景任务 narrativeImageWorkflow 直写 state 的相册结果的捕获值，供 S11 边界写 newest。 */
  相册After?: 相册系统;

}
