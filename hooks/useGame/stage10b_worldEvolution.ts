import type { 世界事件实例, 世界事实, 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化剧情编织运行时 } from '@/models/storyWeaving';
import { appendWorldEvents } from '@/utils/worldEvents';
import { 合并世界事实 } from '@/utils/storyFactIdentity';
import { 投影排期事件 } from '@/services/storyRuntimeProjection';
import { 扫描到期世界事件, 退回未决事件 } from '@/services/dueEventScanner';
import { 裁决世界演变 } from '@/services/worldEvolutionAdjudicator';
import { runWorldEvolutionStep } from '@/services/worldEvolution';
import { 构造世界事实视图 } from '@/services/storyFactConsumerView';
import { buildStoryWeavingApiConfig } from '@/services/storyWeaving';
import { pushQueueTask } from './workflowTaskRuntime';
import type { TurnContext, TurnDeltas } from './turnTypes';

function 写回运行时(
  baseSystem: 剧情编织系统,
  runtime: ReturnType<typeof 归一化剧情编织运行时>,
  worldEvents: ReturnType<typeof 归一化剧情编织运行时>['worldEvents'],
  factLedger: 世界事实[],
  runtimeRevision: number,
): 剧情编织系统 {
  return {
    ...baseSystem,
    运行时: { ...runtime, worldEvents, factLedger, runtimeRevision, updatedAt: Date.now() },
  };
}

/** 本回合解决事件的展示文本：候选 outcome 优先，退化为玩家已知事实里的首个字符串字段。 */
function 展示文本(events: 世界事件实例[], facts: 世界事实[], 游戏日: number): string[] {
  const playerKnown = facts.filter((fact) => fact.playerKnown);
  return events
    .filter((event) => event.status === 'resolved' && event.resolvedAt === 游戏日)
    .map((event) => event.outcome
      || Object.values(playerKnown.find((fact) => fact.sourceEventInstanceId === event.eventInstanceId)?.payload ?? {})
        .find((value): value is string => typeof value === 'string' && Boolean(value.trim()))
      || '')
    .map((text) => text.trim())
    .filter(Boolean);
}

/**
 * 结算内世界演变（非阻断）：投影排期 → 到期扫描 → 仅 due∨线索 调模型 → 裁决/事实物化 →
 * 运行时写回插件自有字段，玩家已知展示文本并入 世界.全局事件；失败保持待结算、不改正式世界。
 */
export async function stage10b_worldEvolution(ctx: TurnContext, d: TurnDeltas): Promise<Partial<TurnDeltas>> {
  const { state, effectiveWorld, assertWorkflowActive, turnCountAtStart, queueTasksMirror } = ctx;
  const settings = state.deviceSettings.gameSettings.剧情编织系统;
  const baseSystem = d.storyWeavingForSave ?? state.剧情编织;
  const runtime = 归一化剧情编织运行时(baseSystem.运行时);
  const worldForWrite = { ...(d.variableOverrides?.世界 ?? d.worldAfter ?? effectiveWorld) };
  const 游戏日 = Math.max(1, Math.trunc(worldForWrite.开拓天数 || 1));
  const projected = 投影排期事件(baseSystem, runtime, 游戏日);
  const clues = (d.parsedForDisplay?.worldEvents ?? []).filter((text) => typeof text === 'string' && text.trim());
  const gated = settings.enabled && settings.currentWindow && settings.世界演变
    && !ctx.isOpeningSystemTrigger && d.isPathAwakeningTurn !== true;

  if (!gated) {
    return { storyWeavingForSave: 写回运行时(baseSystem, runtime, projected, runtime.factLedger, runtime.runtimeRevision) };
  }

  const scanned = 扫描到期世界事件(projected, runtime.runtimeRevision, 游戏日);
  pushQueueTask(state, 'world_evolution', 'pending', {
    detail: scanned.dueInstanceIds.length || clues.length
      ? '正在处理到期事件与动态世界线索。'
      : '正在检查本回合是否有待处理世界演变。',
    cancellable: true,
  }, turnCountAtStart, queueTasksMirror);

  const result = await runWorldEvolutionStep({
    config: buildStoryWeavingApiConfig(state.deviceSettings.gameSettings, state.deviceSettings.apiSettings),
    events: scanned.events,
    dueInstanceIds: scanned.dueInstanceIds,
    clues,
    当前游戏日: 游戏日,
    signal: ctx.abortController.signal,
  });
  assertWorkflowActive();

  if (!result.ok) {
    pushQueueTask(state, 'world_evolution', 'failed', { detail: result.failureReason }, turnCountAtStart, queueTasksMirror);
    return { storyWeavingForSave: 写回运行时(baseSystem, runtime, 退回未决事件(scanned.events), runtime.factLedger, runtime.runtimeRevision) };
  }
  if (result.skipped) {
    pushQueueTask(state, 'world_evolution', 'skipped', { detail: '没有到期事件或世界演变线索，已跳过。' }, turnCountAtStart, queueTasksMirror);
    return { storyWeavingForSave: 写回运行时(baseSystem, runtime, scanned.events, runtime.factLedger, runtime.runtimeRevision) };
  }

  const runtimeRevision = runtime.runtimeRevision + 1;
  const adjudicated = 裁决世界演变({
    candidates: result.candidates,
    events: scanned.events,
    dueInstanceIds: scanned.dueInstanceIds,
    runtimeRevision,
    当前游戏日: 游戏日,
  });
  if (!adjudicated.ok) {
    pushQueueTask(state, 'world_evolution', 'failed', { detail: adjudicated.message }, turnCountAtStart, queueTasksMirror);
    return { storyWeavingForSave: 写回运行时(baseSystem, runtime, 退回未决事件(scanned.events), runtime.factLedger, runtime.runtimeRevision) };
  }

  const factLedger = 合并世界事实(runtime.factLedger, adjudicated.facts);
  const labels = 展示文本(adjudicated.events, adjudicated.facts, 游戏日);
  let worldAfter = d.worldAfter;
  let variableOverrides = d.variableOverrides;
  if (labels.length) {
    const mergedWorld = { ...worldForWrite, 全局事件: appendWorldEvents(worldForWrite.全局事件, labels) };
    worldAfter = mergedWorld;
    if (variableOverrides?.世界) variableOverrides = { ...variableOverrides, 世界: mergedWorld };
  }
  pushQueueTask(state, 'world_evolution', 'success', {
    detail: `世界演变已结算：${adjudicated.facts.length} 条事实，${labels.length} 条玩家可见。`,
  }, turnCountAtStart, queueTasksMirror);
  return {
    storyWeavingForSave: 写回运行时(baseSystem, runtime, adjudicated.events, factLedger, runtimeRevision),
    worldFactView: 构造世界事实视图(factLedger, adjudicated.facts),
    worldAfter,
    variableOverrides,
  };
}
