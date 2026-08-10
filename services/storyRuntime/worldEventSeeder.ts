// G1.3.1 worldEventSeeder：只从已验证 catalog definition/activation 输入创建排期。
// - seed 幂等键至少包含 runtimeBranchId + assetCatalogFingerprint + eventDefinitionId + activationOrdinal；
// - 同一开局/轨道重复 seed 不产生第二实例；
// - 标题/敌人名/新闻词句不能自由创建事件定义；
// - 没有 definition 的旧迁移候选只能保留 needs_confirmation，不能被 seed。
import type { StoryRuntimeState, GameTime, WorldEventInstance, EvidenceRef } from '../../models/storyRuntime';
import type { IdAllocator } from './runtimeCore';
import { createInstance } from './eventLifecycle';

export type SeederResult = { ok: true; state: StoryRuntimeState; created: string[] } | { ok: false; code: string; message: string };

/**
 * 从 catalog event definition + activation 创建排期实例。
 * seedIdempotencyKey = runtimeBranchId + assetCatalogFingerprint + eventDefinitionId + activationOrdinal（canonical）。
 */
export async function seedEventInstance(
  state: StoryRuntimeState,
  input: {
    eventDefinitionId: string;
    definition: { replayPolicy: WorldEventInstance['replayPolicy']; scheduling?: { dueAt?: GameTime }; origin: string };
    activationOrdinal: number;
    at: GameTime;
    source: EvidenceRef;
    allocator: IdAllocator;
    catalogFingerprint: string;
    runtimeBranchId: string;
  },
): Promise<SeederResult> {
  // 没有 definition 的候选不能被 seed。
  if (!input.definition) return { ok: false, code: 'CONFLICT', message: '没有 definition 的迁移候选不能被 seed' };

  const idempotencyKey = await input.allocator('seed', {
    runtimeBranchId: input.runtimeBranchId,
    assetCatalogFingerprint: input.catalogFingerprint,
    eventDefinitionId: input.eventDefinitionId,
    activationOrdinal: input.activationOrdinal,
  }, '');
  // 幂等：已存在同 seed key 的实例 -> 不产生第二实例。
  if (state.worldEvents.some((w) => w.idempotencyKey === idempotencyKey)) {
    return { ok: true, state, created: [] };
  }

  const instanceId = await input.allocator('event:instance', { eventDefinitionId: input.eventDefinitionId, activationOrdinal: input.activationOrdinal, at: input.at }, idempotencyKey);
  const created = await createInstance(state.worldEvents, {
    eventInstanceId: instanceId,
    eventDefinitionId: input.eventDefinitionId,
    replayPolicy: input.definition.replayPolicy,
    at: input.at,
    dueAt: input.definition.scheduling?.dueAt,
    source: input.source,
    dependencyIds: [],
    idempotencyKey,
    allocator: input.allocator,
  });
  if (!created.ok) return { ok: false, code: created.code, message: created.message };
  return { ok: true, state: { ...state, worldEvents: [...state.worldEvents, created.instance] }, created: [instanceId] };
}
