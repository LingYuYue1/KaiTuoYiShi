import type { 角色数据结构 } from '@/models/character';
import type { 聊天消息 } from '@/models/chat';
import type { 相册系统 } from '@/models/imageGeneration';
import type { 记忆系统 } from '@/models/memory';
import type { 新闻条目 } from '@/models/news';
import type { NPC记录 } from '@/models/npc';
import type { 手机系统 } from '@/models/phone';
import type { 剧情节点 } from '@/models/plot';
import type { 队列任务记录 } from '@/models/queueTask';
import type { API配置项, API设置, 游戏设置, 主题预设 } from '@/models/settings';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { 世界状态 } from '@/models/world';
import type { 世界书 } from '@/models/worldbook';
import type { 忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';

/** Complete serializable game graph owned by the kernel session. */
export type RuntimeGameState = Readonly<{
  旅人: 角色数据结构;
  世界: 世界状态;
  chatHistory: readonly 聊天消息[];
  记忆: 记忆系统;
  忆庭: 忆庭系统;
  智库: 智库系统;
  手机: 手机系统;
  NPC: readonly NPC记录[];
  相册: 相册系统;
  新闻: readonly 新闻条目[];
  剧情: readonly 剧情节点[];
  剧情编织: 剧情编织系统;
  variableBatches: readonly 变量命令批次[];
  queueTasks: readonly 队列任务记录[];
  apiSettings: API设置;
  gameSettings: 游戏设置;
  currentTheme: 主题预设;
  worldbooks: readonly 世界书[];
  turnCount: number;
}>;

export type MutableRuntimeGameState = {
  -readonly [Key in keyof RuntimeGameState]: RuntimeGameState[Key] extends readonly (infer Item)[]
    ? Item[]
    : RuntimeGameState[Key];
};

export type RuntimeStateUpdate<Value> = Value | ((previous: Value) => Value);
export type RuntimeStateSetter<Value> = (update: RuntimeStateUpdate<Value>) => void;

/** Mutable, non-React draft used only while one kernel command is executing. */
export type RuntimeDraftState = MutableRuntimeGameState & {
  hasSave: boolean;
  loading: boolean;
  workflowHint: string;
  workflowStatus: 'searching' | 'done' | '';
  liveRecallSummary: string;
  liveRecallFullContent: string;
  pendingVariable: boolean;
  pendingOpeningTrigger: string | null;
  abortControllerRef: { current: AbortController | null };
  set旅人: RuntimeStateSetter<MutableRuntimeGameState['旅人']>;
  set世界: RuntimeStateSetter<MutableRuntimeGameState['世界']>;
  setChatHistory: RuntimeStateSetter<MutableRuntimeGameState['chatHistory']>;
  set记忆: RuntimeStateSetter<MutableRuntimeGameState['记忆']>;
  set忆庭: RuntimeStateSetter<MutableRuntimeGameState['忆庭']>;
  set智库: RuntimeStateSetter<MutableRuntimeGameState['智库']>;
  set手机: RuntimeStateSetter<MutableRuntimeGameState['手机']>;
  setNPC: RuntimeStateSetter<MutableRuntimeGameState['NPC']>;
  set相册: RuntimeStateSetter<MutableRuntimeGameState['相册']>;
  set新闻: RuntimeStateSetter<MutableRuntimeGameState['新闻']>;
  set剧情: RuntimeStateSetter<MutableRuntimeGameState['剧情']>;
  set剧情编织: RuntimeStateSetter<MutableRuntimeGameState['剧情编织']>;
  setVariableBatches: RuntimeStateSetter<MutableRuntimeGameState['variableBatches']>;
  setQueueTasks: RuntimeStateSetter<MutableRuntimeGameState['queueTasks']>;
  setGameSettings: RuntimeStateSetter<MutableRuntimeGameState['gameSettings']>;
  setHasSave: RuntimeStateSetter<boolean>;
  setLoading: RuntimeStateSetter<boolean>;
  setWorkflowHint: RuntimeStateSetter<string>;
  setWorkflowStatus: RuntimeStateSetter<'searching' | 'done' | ''>;
  setLiveRecallSummary: RuntimeStateSetter<string>;
  setLiveRecallFullContent: RuntimeStateSetter<string>;
  setPendingVariable: RuntimeStateSetter<boolean>;
  setTurnCount: RuntimeStateSetter<number>;
  setPendingOpeningTrigger: RuntimeStateSetter<string | null>;
};

export function cloneRuntimeGameState(state: RuntimeGameState): MutableRuntimeGameState {
  return structuredClone(state) as MutableRuntimeGameState;
}

export function resolveActiveModelConfig(state: RuntimeGameState): API配置项 {
  const activeId = state.apiSettings.activeConfigId;
  if (!activeId) throw new Error('Active API configuration is required');
  const config = state.apiSettings.configs.find((candidate) => candidate.id === activeId);
  if (!config) throw new Error(`Active API configuration not found: ${activeId}`);
  return { ...config, enableClaudeMode: state.gameSettings.enableClaudeMode === true };
}
