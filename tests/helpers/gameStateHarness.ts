import type { Dispatch, SetStateAction } from 'react';
import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { ActiveWorkflowStore } from '@/hooks/useGame/activeWorkflow';
import { TURN_STATUS_IDLE, type TurnStatus } from '@/hooks/useGame/turnStatus';
import type { API设置, API配置项, DeviceSettings, 游戏设置 } from '@/models/settings';
import { 创建默认游戏设置 } from '@/models/settings';
import { 创建空角色, type 角色数据结构 } from '@/models/character';
import { 创建空世界状态, type 世界状态 } from '@/models/world';
import { 创建空记忆系统, type 记忆系统 } from '@/models/memory';
import { 创建空忆庭系统, type 忆庭系统 } from '@/models/yiting';
import { 创建空智库系统, type 智库系统 } from '@/models/zhiku';
import { 创建空手机系统, type 手机系统 } from '@/models/phone';
import { 创建空相册系统, type 相册系统 } from '@/models/imageGeneration';
import { 归一化剧情编织系统, type 剧情编织系统 } from '@/models/storyWeaving';
import type { 聊天消息 } from '@/models/chat';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { 队列任务记录 } from '@/models/queueTask';
import type { NPC记录 } from '@/models/npc';
import type { WorkflowRecoveryJournal } from '@/services/workflowRecovery';

export interface StateCell<T> {
  get: () => T;
  set: Dispatch<SetStateAction<T>>;
}

function createCell<T>(initial: T): StateCell<T> {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    },
  };
}

/**
 * 把 StateCell 表绑定为对象上的 React 风格访问器（get/set 直连 cell）。
 * 方法字段（setXxx / 动作函数）由调用方显式装配，不在此推断命名。
 */
function bindCells(target: object, bindings: Record<string, StateCell<unknown>>): void {
  for (const [key, cell] of Object.entries(bindings)) {
    Object.defineProperty(target, key, {
      get: () => cell.get(),
      set: (next: unknown) => cell.set(next),
      enumerable: true,
      configurable: true,
    });
  }
}

/**
 * 行为测试用最小 UseGameStateReturn：同步 React 风格 cell（读取即最新值），
 * 只实现工作流事务实际消费的字段；其余字段不会被测试路径触碰。
 */
export interface GameStateHarness {
  state: UseGameStateReturn;
  activeWorkflow: ActiveWorkflowStore;
  apiConfig: API配置项;
  getActiveConfig: () => API配置项;
  cells: {
    旅人: StateCell<角色数据结构>;
    世界: StateCell<世界状态>;
    chatHistory: StateCell<聊天消息[]>;
    记忆: StateCell<记忆系统>;
    忆庭: StateCell<忆庭系统>;
    智库: StateCell<智库系统>;
    手机: StateCell<手机系统>;
    NPC: StateCell<NPC记录[]>;
    相册: StateCell<相册系统>;
    新闻: StateCell<新闻条目[]>;
    剧情: StateCell<剧情节点[]>;
    剧情编织: StateCell<剧情编织系统>;
    variableBatches: StateCell<变量命令批次[]>;
    queueTasks: StateCell<队列任务记录[]>;
    turnCount: StateCell<number>;
    gameSettings: StateCell<游戏设置>;
    loading: StateCell<boolean>;
    turnStatus: StateCell<TurnStatus>;
    pendingVariable: StateCell<boolean>;
    pendingOpeningTrigger: StateCell<string | null>;
    macroGlobalVars: StateCell<Record<string, string>>;
    worldbookTriggerStates: StateCell<Record<string, number>>;
  };
  setGameSettings: (updater: SetStateAction<游戏设置>) => void;
}

export function createGameStateHarness(): GameStateHarness {
  const apiConfig: API配置项 = {
    id: 'test-config',
    name: '测试接口',
    provider: 'openai_compatible',
    baseUrl: 'https://example.test/v1',
    apiKey: 'test-key',
    model: 'test-model',
    createdAt: 1,
    updatedAt: 1,
  };
  const apiSettings: API设置 = { activeConfigId: apiConfig.id, configs: [apiConfig] };

  const cells = {
    旅人: createCell(创建空角色()),
    世界: createCell(创建空世界状态()),
    chatHistory: createCell<聊天消息[]>([]),
    记忆: createCell(创建空记忆系统()),
    忆庭: createCell(创建空忆庭系统()),
    智库: createCell(创建空智库系统()),
    手机: createCell(创建空手机系统()),
    NPC: createCell<NPC记录[]>([]),
    相册: createCell(创建空相册系统()),
    新闻: createCell<新闻条目[]>([]),
    剧情: createCell<剧情节点[]>([]),
    剧情编织: createCell(归一化剧情编织系统(undefined)),
    variableBatches: createCell<变量命令批次[]>([]),
    queueTasks: createCell<队列任务记录[]>([]),
    turnCount: createCell(1),
    gameSettings: createCell(创建默认游戏设置()),
    loading: createCell(false),
    turnStatus: createCell<TurnStatus>(TURN_STATUS_IDLE),
    pendingVariable: createCell(false),
    liveRecallSummary: createCell(''),
    liveRecallFullContent: createCell(''),
    interruptedWorkflow: createCell<WorkflowRecoveryJournal | null>(null),
    sessionEpoch: createCell(0),
    pendingOpeningTrigger: createCell<string | null>(null),
    macroGlobalVars: createCell<Record<string, string>>({}),
    worldbookTriggerStates: createCell<Record<string, number>>({}),
  };

  const activeWorkflow = {
    setLoading: cells.loading.set,
    setTurnStatus: cells.turnStatus.set,
    setLiveRecallSummary: cells.liveRecallSummary.set,
    setLiveRecallFullContent: cells.liveRecallFullContent.set,
    setPendingVariable: cells.pendingVariable.set,
    setInterruptedWorkflow: cells.interruptedWorkflow.set,
    setSessionEpoch: cells.sessionEpoch.set,
    abortControllerRef: { current: null },
    rerollContextRef: { current: null },
  } as unknown as ActiveWorkflowStore;
  bindCells(activeWorkflow, {
    loading: cells.loading,
    turnStatus: cells.turnStatus,
    liveRecallSummary: cells.liveRecallSummary,
    liveRecallFullContent: cells.liveRecallFullContent,
    pendingVariable: cells.pendingVariable,
    interruptedWorkflow: cells.interruptedWorkflow,
    sessionEpoch: cells.sessionEpoch,
  } as unknown as Record<string, StateCell<unknown>>);

  const deviceSettings = {
    get apiSettings() { return apiSettings; },
    get gameSettings() { return cells.gameSettings.get(); },
    theme: {},
    worldbooks: [],
  };

  const state = {
    set旅人: cells.旅人.set,
    set世界: cells.世界.set,
    setChatHistory: cells.chatHistory.set,
    set记忆: cells.记忆.set,
    set忆庭: cells.忆庭.set,
    set智库: cells.智库.set,
    set手机: cells.手机.set,
    setNPC: cells.NPC.set,
    set相册: cells.相册.set,
    set新闻: cells.新闻.set,
    set剧情: cells.剧情.set,
    set剧情编织: cells.剧情编织.set,
    setVariableBatches: cells.variableBatches.set,
    setQueueTasks: cells.queueTasks.set,
    setTurnCount: cells.turnCount.set,
    setPendingOpeningTrigger: cells.pendingOpeningTrigger.set,
    setMacroGlobalVars: cells.macroGlobalVars.set,
    setWorldbookTriggerStates: cells.worldbookTriggerStates.set,
    setDeviceGameSettings: cells.gameSettings.set,
    activeWorkflow,
    deviceSettings: deviceSettings as unknown as DeviceSettings,
    setView: () => {},
    setHasSave: () => {},
    setActiveTreeMeta: () => {},
  } as unknown as UseGameStateReturn;
  bindCells(state, {
    旅人: cells.旅人,
    世界: cells.世界,
    chatHistory: cells.chatHistory,
    记忆: cells.记忆,
    忆庭: cells.忆庭,
    智库: cells.智库,
    手机: cells.手机,
    NPC: cells.NPC,
    相册: cells.相册,
    新闻: cells.新闻,
    剧情: cells.剧情,
    剧情编织: cells.剧情编织,
    variableBatches: cells.variableBatches,
    queueTasks: cells.queueTasks,
    turnCount: cells.turnCount,
    pendingOpeningTrigger: cells.pendingOpeningTrigger,
    macroGlobalVars: cells.macroGlobalVars,
    worldbookTriggerStates: cells.worldbookTriggerStates,
  } as unknown as Record<string, StateCell<unknown>>);

  return {
    state,
    activeWorkflow,
    apiConfig,
    getActiveConfig: () => apiConfig,
    cells,
    setGameSettings: cells.gameSettings.set,
  };
}
