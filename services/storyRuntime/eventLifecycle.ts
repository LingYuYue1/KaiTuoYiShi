// G1.3.1 eventLifecycle：统一事件生命周期（无任何特例名称）。
// - 合法迁移表集中定义；once 终态后同一 definition 新实例拒绝或转后果候选；
// - allow_new_instance 必须有新结构化来源/时间/原因/实例 ID；
// - repeatable 也必须新实例 ID + 新来源事实；
// - player_early 保留提前结算事实，标记后续原定事件 superseded/cancelled；
// - world_background 结算 playerParticipated=false，不自动生成知识；
// - 终态无普通恢复路径。
import type { WorldEventInstance, WorldEventInstanceStatus, WorldEventOutcome, WorldEventReplayPolicy, WorldEventResolutionMode, GameTime, EvidenceRef } from '../../models/storyRuntime';
import type { IdAllocator } from './runtimeCore';
import { canonicalJsonStringify } from './normalization';

export type TransitionResult = { ok: true; instance: WorldEventInstance } | { ok: false; code: string; message: string };

// 合法迁移表（集中定义）。
export const EVENT_TRANSITIONS: Record<WorldEventInstanceStatus, { to: WorldEventInstanceStatus[]; terminal: boolean }> = {
  scheduled: { to: ['active', 'blocked', 'cancelled', 'superseded', 'missed'], terminal: false },
  blocked: { to: ['scheduled', 'active', 'cancelled', 'superseded', 'missed'], terminal: false },
  active: { to: ['resolution_pending', 'resolved', 'cancelled', 'superseded'], terminal: false },
  resolution_pending: { to: ['resolved', 'active', 'cancelled', 'superseded'], terminal: false },
  resolved: { to: ['archived'], terminal: true },
  cancelled: { to: ['archived'], terminal: true },
  superseded: { to: ['archived'], terminal: true },
  missed: { to: ['archived'], terminal: true },
  archived: { to: [], terminal: true },
};
export const TERMINAL_STATES: WorldEventInstanceStatus[] = ['resolved', 'cancelled', 'superseded', 'missed', 'archived'];
export const NON_TERMINAL_STATES: WorldEventInstanceStatus[] = ['scheduled', 'active', 'blocked', 'resolution_pending'];

export function isTerminal(status: WorldEventInstanceStatus): boolean {
  return TERMINAL_STATES.includes(status);
}

/** 合法迁移检查。 */
export function canTransition(from: WorldEventInstanceStatus, to: WorldEventInstanceStatus): boolean {
  return EVENT_TRANSITIONS[from]?.to.includes(to) ?? false;
}

/** 应用迁移：返回新实例（纯）。 */
export function transition(
  instance: WorldEventInstance,
  to: WorldEventInstanceStatus,
  opts: { at?: GameTime; resolutionMode?: WorldEventResolutionMode; outcome?: WorldEventOutcome; terminalFactId?: string } = {},
): TransitionResult {
  if (!canTransition(instance.status, to)) {
    return { ok: false, code: 'INVALID_COMMAND', message: instance.eventInstanceId + ': 非法迁移 ' + instance.status + ' -> ' + to };
  }
  const next: WorldEventInstance = { ...instance, status: to };
  if (opts.at) {
    if (to === 'resolved' || to === 'cancelled' || to === 'superseded' || to === 'missed') next.resolvedAt = opts.at;
    if (to === 'active' && !next.startAt) next.startAt = opts.at;
  }
  if (opts.resolutionMode) next.resolutionMode = opts.resolutionMode;
  if (opts.outcome) next.outcome = opts.outcome;
  if (opts.terminalFactId) next.terminalFactId = opts.terminalFactId;
  return { ok: true, instance: next };
}

/** player_early 结算：保留提前结算事实（mode=player_early）。
 * 只 supersede 与该实例有显式因果关系的后续原定实例（parentInstanceId 指向它 / dependencyIds 包含它 /
 * 它被该实例依赖 / 同 occurrence 的后续实例由调用方通过 causalityPredicate 提供）；
 * 不得把同 definition 的其他独立合法实例全部清掉。 */
export function applyPlayerEarlyResolution(
  instances: WorldEventInstance[],
  resolvedInstanceId: string,
  definitionId: string,
  opts: { at: GameTime; terminalFactId?: string; evidence?: EvidenceRef[]; causalityPredicate?: (candidate: WorldEventInstance, resolved: WorldEventInstance) => boolean },
): { instances: WorldEventInstance[]; supersededIds: string[] } {
  const resolved = instances.find((i) => i.eventInstanceId === resolvedInstanceId);
  const supersededIds: string[] = [];
  const next = instances.map((instance) => {
    if (instance.eventInstanceId === resolvedInstanceId) {
      const r = transition(instance, 'resolved', { at: opts.at, resolutionMode: 'player_early', outcome: 'normal', terminalFactId: opts.terminalFactId });
      return r.ok ? r.instance : instance;
    }
    // 只 supersede 有因果关系的后续原定实例：parent/dependency 显式关联，或调用方 causalityPredicate 判定。
    const hasCausality = (resolved !== undefined)
      && (instance.parentInstanceId === resolvedInstanceId
        || instance.dependencyIds.includes(resolvedInstanceId)
        || (opts.causalityPredicate ? opts.causalityPredicate(instance, resolved) : false));
    if (instance.eventDefinitionId === definitionId && !TERMINAL_STATES.includes(instance.status) && hasCausality) {
      const r = transition(instance, 'superseded', { at: opts.at });
      if (r.ok) { supersededIds.push(instance.eventInstanceId); return r.instance; }
    }
    return instance;
  });
  return { instances: next, supersededIds };
}

/**
 * 创建新实例：replayPolicy 决定是否允许与是否要求新来源。
 * - once：同 definition 已有终态 -> ALREADY_TERMINAL；
 * - allow_new_instance / repeatable：必须有新的结构化来源（非空 evidence），且
 *   source 的 canonical fingerprint 不得与同 definition 历史实例的 source 相同（同源不得创建第二实例）。
 */
export async function createInstance(
  instances: WorldEventInstance[],
  input: {
    eventInstanceId: string;
    eventDefinitionId: string;
    replayPolicy: WorldEventReplayPolicy;
    at: GameTime;
    dueAt?: GameTime;
    source: EvidenceRef;
    dependencyIds?: string[];
    idempotencyKey: string;
    allocator: IdAllocator;
  },
): Promise<{ ok: true; instance: WorldEventInstance } | { ok: false; code: string; message: string }> {
  const existingDefinition = instances.filter((w) => w.eventDefinitionId === input.eventDefinitionId);
  const terminalOfSame = existingDefinition.filter((w) => isTerminal(w.status));
  if (input.replayPolicy === 'once') {
    if (terminalOfSame.length > 0) {
      return { ok: false, code: 'ALREADY_TERMINAL', message: 'once 事件已有终态，不允许再次创建同一事件定义: ' + input.eventDefinitionId };
    }
    if (existingDefinition.length > 0) {
      return { ok: false, code: 'CONFLICT', message: 'once 事件已存在未终态实例: ' + input.eventDefinitionId };
    }
  }
  if (input.replayPolicy === 'allow_new_instance' || input.replayPolicy === 'repeatable') {
    // 必须有新的结构化来源：来源证据非空。
    if (!input.source || typeof input.source.kind !== 'string') {
      return { ok: false, code: 'MISSING_EVIDENCE', message: '新实例必须有结构化来源证据' };
    }
    // 同 definition 历史实例的 canonical source fingerprint 完全一致 -> 同源，拒绝第二实例。
    const sourceFp = canonicalJsonStringify(input.source);
    const sameSource = existingDefinition.find((w) => canonicalJsonStringify(w.source) === sourceFp);
    if (sameSource) {
      return { ok: false, code: 'CONFLICT', message: '同 definition 已存在相同来源的实例，不允许重复创建: ' + input.eventDefinitionId + '（source 相同）' };
    }
  }
  // 新实例 ID 必须与所有既有实例不同。
  if (instances.some((w) => w.eventInstanceId === input.eventInstanceId)) {
    return { ok: false, code: 'CONFLICT', message: '实例 ID 已存在（allocator 碰撞）: ' + input.eventInstanceId };
  }
  const instance: WorldEventInstance = {
    eventInstanceId: input.eventInstanceId,
    eventDefinitionId: input.eventDefinitionId,
    status: 'scheduled',
    startAt: input.at,
    replayPolicy: input.replayPolicy,
    participantIds: [],
    dependencyIds: input.dependencyIds || [],
    publicFactIds: [],
    idempotencyKey: input.idempotencyKey,
    source: input.source,
  };
  if (input.dueAt !== undefined) instance.dueAt = input.dueAt;
  return { ok: true, instance };
}
