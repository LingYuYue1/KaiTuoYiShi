import 'fake-indexeddb/auto';
import { 初始化新局checkpoint, type 新局初始字段 } from '@/hooks/useGame/commitTurn';
import type { UseGameStateReturn } from '@/hooks/useGameState';
import { 创建空角色 } from '@/models/character';
import { 创建空世界状态 } from '@/models/world';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建空忆庭系统 } from '@/models/yiting';
import { 创建空智库系统 } from '@/models/zhiku';
import { 创建空手机系统 } from '@/models/phone';
import { 创建空相册系统 } from '@/models/imageGeneration';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';

/** 完整工作区字段 fixture：用真实 初始化新局checkpoint 建根检查点 + 活跃叶子。 */
export function buildWorkspaceFields(overrides: Partial<新局初始字段> = {}): 新局初始字段 {
  return {
    turnCount: 1,
    chatHistory: [],
    macroGlobalVars: {},
    worldbookTriggerStates: {},
    pendingOpeningTrigger: null,
    queueTasks: [],
    variableBatches: [],
    NPC: [],
    新闻: [],
    剧情: [],
    相册: 创建空相册系统(),
    手机: 创建空手机系统(),
    智库: 创建空智库系统(),
    忆庭: 创建空忆庭系统(),
    记忆: 创建空记忆系统(),
    世界: 创建空世界状态(),
    旅人: 创建空角色(),
    剧情编织: 归一化剧情编织系统(undefined),
    ...overrides,
  };
}

/**
 * 建工作区（真实存储）+ 把同一份字段投影进 React 状态，等价于一次 hydrate：
 * 工作流旁路同时读 state（UI 真值）与活跃叶子（持久化真值）。
 */
export async function seedWorkspace(
  state: UseGameStateReturn,
  overrides: Partial<新局初始字段> = {},
): Promise<void> {
  const fields = buildWorkspaceFields(overrides);
  await 初始化新局checkpoint(fields, state);
  state.set旅人(fields.旅人);
  state.set世界(fields.世界);
  state.setChatHistory(fields.chatHistory);
  state.set记忆(fields.记忆);
  state.set忆庭(fields.忆庭 ?? 创建空忆庭系统());
  state.set智库(fields.智库 ?? 创建空智库系统());
  state.set手机(fields.手机 ?? 创建空手机系统());
  state.setNPC(fields.NPC ?? []);
  state.set相册(fields.相册 ?? 创建空相册系统());
  state.set新闻(fields.新闻 ?? []);
  state.set剧情(fields.剧情 ?? []);
  state.set剧情编织(fields.剧情编织 ?? 归一化剧情编织系统(undefined));
  state.setVariableBatches(fields.variableBatches ?? []);
  state.setQueueTasks(fields.queueTasks ?? []);
  state.setTurnCount(fields.turnCount ?? 1);
  state.setPendingOpeningTrigger(fields.pendingOpeningTrigger ?? null);
}
