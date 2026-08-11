// R2 世界演变裁决器（2026-08-09 计划 §6 R2）。
// 只负责世界演变候选的规范化、校验、生命周期迁移与参与者边界，是薄纯函数层：
// - 候选只能来自世界演变工作流（模型），不能直接写 resolved/正式事实；
// - 玩家不在场时不得生成玩家参与、知情或功劳（参与者边界强制 world_due）；
// - 非法候选整体拒绝（ok=false），正式世界保持不变；到期事件保持待结算；
// - 应用只作用于内存副本（simulatedWorldEvents），不写 React state、设置存储或存档。
import type { CommittedWorldFact, EvidenceRef, GameTime, JsonValue, PublicScope, WorldEventInstance, WorldEventInstanceStatus, WorldEventOutcome, WorldEventResolutionMode } from '../../models/storyRuntime';
import { canTransition, isTerminal, transition } from './eventLifecycle';
import { factIdentity } from './factLedger';
import { canonicalJsonStringify } from './normalization';

/** 世界演变候选（模型输出 → 候选，不直接写状态）。 */
export interface WorldEvolutionCandidate {
  candidateId: string;
  /** 目标事件实例（create_instance 时为目标新实例 id）。 */
  eventInstanceId: string;
  action: 'transition' | 'resolve' | 'supersede' | 'create_instance';
  /** transition 目标状态（resolve/supersede 忽略）。 */
  toStatus?: WorldEventInstanceStatus;
  resolutionMode?: WorldEventResolutionMode;
  outcome?: WorldEventOutcome;
  /** 候选附带的事实提议（世界事实：world_due，无玩家参与）。 */
  facts: Array<{ factType: string; payload: Record<string, JsonValue>; publicScope?: PublicScope }>;
  /** 一句话来源说明（<动态世界> 线索 / 到期事件），只作诊断。 */
  note?: string;
}

export interface WorldEvolutionAdjudicationInput {
  candidates: WorldEvolutionCandidate[];
  currentEvents: WorldEventInstance[];
  dueInstanceIds: string[];
  gameTime: GameTime;
  runtimeRevision: number;
}

export interface WorldEvolutionAdjudication {
  ok: true;
  simulatedEvents: WorldEventInstance[];
  acceptedCandidateIds: string[];
  rejectedCandidateIds: string[];
  /** 待提交世界事实（规范化后，提交点再统一入账本去重）。 */
  factsToCommit: CommittedWorldFact[];
  messages: string[];
}

export type WorldEvolutionAdjudicationResult = WorldEvolutionAdjudication | { ok: false; code: string; message: string };

const LEGAL_TRANSITION_TARGETS: Partial<Record<WorldEventInstanceStatus, WorldEventInstanceStatus[]>> = {
  scheduled: ['active', 'blocked', 'cancelled', 'superseded', 'missed'],
  blocked: ['scheduled', 'active', 'cancelled', 'superseded', 'missed'],
  active: ['resolution_pending', 'resolved', 'cancelled', 'superseded'],
  resolution_pending: ['resolved', 'active', 'cancelled', 'superseded'],
};
const WORLD_EVENT_STATUSES = new Set<WorldEventInstanceStatus>([
  'scheduled', 'blocked', 'active', 'resolution_pending', 'resolved', 'cancelled', 'superseded', 'missed', 'archived',
]);

function normalizePublicScope(raw: unknown): PublicScope | undefined | null {
  if (raw === undefined) return undefined;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const scope = raw as Record<string, unknown>;
  const stringList = (value: unknown): string[] | null => Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value as string[]
    : null;
  if (scope.kind === 'private') return { kind: 'private' };
  if (scope.kind === 'local') {
    const locationIds = stringList(scope.locationIds);
    const anchorIds = scope.anchorIds === undefined ? undefined : stringList(scope.anchorIds);
    return locationIds && anchorIds !== null ? { kind: 'local', locationIds, anchorIds } : null;
  }
  if (scope.kind === 'faction') {
    const factionIds = stringList(scope.factionIds);
    return factionIds ? { kind: 'faction', factionIds } : null;
  }
  if (scope.kind === 'public') {
    const regionIds = scope.regionIds === undefined ? undefined : stringList(scope.regionIds);
    return regionIds !== null ? { kind: 'public', regionIds } : null;
  }
  if (scope.kind === 'broadcast') {
    const networkIds = stringList(scope.networkIds);
    const recipientIds = scope.recipientIds === undefined ? undefined : stringList(scope.recipientIds);
    return networkIds && recipientIds !== null ? { kind: 'broadcast', networkIds, recipientIds } : null;
  }
  return null;
}

/** 候选事实身份（与 factLedger 身份规则一致；世界事实 revision 用当前 revision）。 */
export function worldFactIdentity(eventInstanceId: string, runtimeRevision: number, factType: string, payload: Record<string, JsonValue>): string {
  return factIdentity(eventInstanceId, runtimeRevision, factType, payload);
}

function normalizeCandidate(raw: WorldEvolutionCandidate): WorldEvolutionCandidate | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.eventInstanceId !== 'string' || !raw.eventInstanceId) return null;
  if (raw.action !== 'transition' && raw.action !== 'resolve' && raw.action !== 'supersede' && raw.action !== 'create_instance') return null;
  if (!Array.isArray(raw.facts)) return null;
  const facts: Array<{ factType: string; payload: Record<string, JsonValue>; publicScope?: PublicScope }> = [];
  for (const fact of raw.facts) {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) return null;
    const factType = (fact as { factType?: unknown }).factType;
    if (typeof factType !== 'string' || !factType.trim()) return null;
    const payload = (fact as { payload?: unknown }).payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const publicScope = normalizePublicScope((fact as { publicScope?: unknown }).publicScope);
    if (publicScope === null) return null;
    facts.push({
      factType,
      payload: payload as Record<string, JsonValue>,
      publicScope,
    });
  }
  const normalized: WorldEvolutionCandidate = {
    candidateId: typeof raw.candidateId === 'string' ? raw.candidateId : 'world_cand:' + raw.eventInstanceId,
    eventInstanceId: raw.eventInstanceId,
    action: raw.action,
    facts,
    note: typeof raw.note === 'string' ? raw.note : undefined,
  };
  if (raw.action === 'transition' && typeof raw.toStatus === 'string' && WORLD_EVENT_STATUSES.has(raw.toStatus as WorldEventInstanceStatus)) {
    normalized.toStatus = raw.toStatus as WorldEventInstanceStatus;
  }
  if (raw.resolutionMode === 'player' || raw.resolutionMode === 'world_background' || raw.resolutionMode === 'shared' || raw.resolutionMode === 'player_early' || raw.resolutionMode === 'unknown') {
    normalized.resolutionMode = raw.resolutionMode;
  }
  if (raw.outcome === 'normal' || raw.outcome === 'deviated' || raw.outcome === 'escaped' || raw.outcome === 'failed' || raw.outcome === 'unknown') {
    normalized.outcome = raw.outcome;
  }
  return normalized;
}

/**
 * 裁决世界演变候选：整体校验（一个非法候选 → 整体拒绝，零应用）。
 * 合法候选按事件实例分组应用到内存副本：
 * - transition：必须走 eventLifecycle 合法迁移表；
 * - resolve：目标必须非终态（scheduled/blocked 先转 resolution_pending 再 resolved）；
 * - supersede：目标必须非终态，迁移到 superseded；
 * - create_instance：只允许创建当前不存在的实例（once 语义，且不能是已终态事件复活）。
 * 参与者边界：世界候选产生的事实一律 playerParticipated=false、playerObserverVisible=false、createdBy='world_due'。
 */
export function adjudicateWorldEvolution(input: WorldEvolutionAdjudicationInput): WorldEvolutionAdjudicationResult {
  const { candidates, currentEvents, dueInstanceIds, gameTime, runtimeRevision } = input;
  const normalized = candidates.map(normalizeCandidate);
  // 非法候选整体拒绝（计划 §5.3：非法候选时正式世界状态不变）。
  for (let index = 0; index < normalized.length; index += 1) {
    if (!normalized[index]) {
      return { ok: false, code: 'INVALID_CANDIDATE', message: `世界演变候选 #${index + 1} 结构非法，整体拒绝（零应用）` };
    }
  }
  const byId = new Map(currentEvents.map((instance) => [instance.eventInstanceId, instance]));
  const dueSet = new Set(dueInstanceIds);
  let simulatedEvents = currentEvents.map((instance) => ({ ...instance }));
  const acceptedCandidateIds: string[] = [];
  const rejectedCandidateIds: string[] = [];
  const factsToCommit: CommittedWorldFact[] = [];
  const messages: string[] = [];
  const sourceRef: EvidenceRef = { kind: 'broadcast_record', broadcastId: 'world-evolution:' + runtimeRevision, deliveryId: 'sim', sourceRevision: runtimeRevision, recipientSnapshotFingerprint: 'sim' };

  const rejectAll = (candidate: WorldEvolutionCandidate, message: string): WorldEvolutionAdjudicationResult => ({
    ok: false,
    code: 'INVALID_WORLD_EVOLUTION',
    message: `候选 ${candidate.candidateId}:${message}；本批世界演变整体拒绝（零应用）`,
  });

  for (const candidate of normalized) {
    if (!candidate) continue;
    const target = byId.get(candidate.eventInstanceId);
    const dueOnly = dueSet.has(candidate.eventInstanceId);
    if (candidate.action === 'create_instance') {
      if (target) {
        return rejectAll(candidate, `create_instance 目标已存在（${candidate.eventInstanceId}）`);
      }
      const instance: WorldEventInstance = {
        eventInstanceId: candidate.eventInstanceId,
        eventDefinitionId: 'definition:' + candidate.eventInstanceId,
        status: 'scheduled',
        startAt: gameTime,
        dueAt: gameTime,
        replayPolicy: 'once',
        participantIds: [],
        dependencyIds: [],
        publicFactIds: [],
        idempotencyKey: 'world-evolution:' + candidate.eventInstanceId,
        source: sourceRef,
      };
      simulatedEvents = [...simulatedEvents, instance];
      byId.set(instance.eventInstanceId, instance);
      acceptedCandidateIds.push(candidate.candidateId);
      messages.push(`候选 ${candidate.candidateId}:新实例 ${candidate.eventInstanceId} 进入排期`);
      continue;
    }
    if (!target) {
      return rejectAll(candidate, `目标事件 ${candidate.eventInstanceId} 不存在`);
    }
    if (isTerminal(target.status)) {
      return rejectAll(candidate, `目标 ${candidate.eventInstanceId} 已是终态（${target.status}），不得复活`);
    }
    if (candidate.action === 'supersede') {
      const applied = transition(target, 'superseded', { at: gameTime });
      if (!applied.ok) {
        return rejectAll(candidate, `supersede 迁移失败（${applied.message}）`);
      }
      simulatedEvents = simulatedEvents.map((instance) => instance.eventInstanceId === target.eventInstanceId ? applied.instance : instance);
      byId.set(target.eventInstanceId, applied.instance);
      acceptedCandidateIds.push(candidate.candidateId);
      messages.push(`候选 ${candidate.candidateId}:${candidate.eventInstanceId} 标记 superseded`);
      continue;
    }
    if (candidate.action === 'resolve') {
      // 结算迁移链：resolution_pending -> resolved（直接）；active -> resolution_pending -> resolved；scheduled/blocked 先进入 active 再待结算。
      let applied: { ok: true; instance: WorldEventInstance } | { ok: false; code: string; message: string };
      if (target.status === 'resolution_pending') {
        applied = { ok: true, instance: target };
      } else if (target.status === 'active') {
        applied = transition(target, 'resolution_pending', { at: gameTime });
      } else {
        const activated = transition(target, 'active', { at: gameTime });
        if (!activated.ok) {
          return rejectAll(candidate, `resolve 无法进入结算链（${activated.message}）`);
        }
        applied = transition(activated.instance, 'resolution_pending', { at: gameTime });
      }
      if (!applied.ok) {
        return rejectAll(candidate, `resolve 迁移失败（${applied.message}）`);
      }
      const resolved = transition(applied.instance, 'resolved', {
        at: gameTime,
        resolutionMode: 'world_background',
        outcome: candidate.outcome ?? 'normal',
      });
      if (!resolved.ok) {
        return rejectAll(candidate, `resolve 结算失败（${resolved.message}）`);
      }
      simulatedEvents = simulatedEvents.map((instance) => instance.eventInstanceId === target.eventInstanceId ? resolved.instance : instance);
      byId.set(target.eventInstanceId, resolved.instance);
      acceptedCandidateIds.push(candidate.candidateId);
      messages.push(`候选 ${candidate.candidateId}:${candidate.eventInstanceId} 后台结算 resolved（world_background，dueOnly=${dueOnly}）`);
      for (const fact of candidate.facts) {
        factsToCommit.push({
          factId: worldFactIdentity(candidate.eventInstanceId, runtimeRevision, fact.factType, fact.payload),
          eventInstanceId: candidate.eventInstanceId,
          sourceRevision: runtimeRevision,
          factType: fact.factType,
          payload: fact.payload,
          occurredAt: gameTime,
          committedAt: gameTime,
          publicScope: fact.publicScope ?? { kind: 'private' },
          evidenceRefs: [sourceRef],
          evidenceLevel: 'supported',
          invalidatesEventInstanceIds: [],
          playerParticipated: false,
          playerObserverVisible: false,
          createdBy: 'world_due',
        });
      }
      continue;
    }
    // transition
    const toStatus = candidate.toStatus;
    if (!toStatus || !canTransition(target.status, toStatus)) {
      return rejectAll(candidate, `非法迁移 ${target.status} -> ${String(toStatus)}`);
    }
    const applied = transition(target, toStatus, { at: gameTime });
    if (!applied.ok) {
      return rejectAll(candidate, `transition 失败（${applied.message}）`);
    }
    simulatedEvents = simulatedEvents.map((instance) => instance.eventInstanceId === target.eventInstanceId ? applied.instance : instance);
    byId.set(target.eventInstanceId, applied.instance);
    acceptedCandidateIds.push(candidate.candidateId);
    messages.push(`候选 ${candidate.candidateId}:${candidate.eventInstanceId} ${target.status} -> ${toStatus}`);
  }

  return {
    ok: true,
    simulatedEvents,
    acceptedCandidateIds,
    rejectedCandidateIds,
    factsToCommit,
    messages,
  };
}

/** 事实去重（提交点用）：同一事件+类型+canonical payload 已存在则不重复提交。 */
export function isWorldFactDuplicate(fact: CommittedWorldFact, committedFacts: CommittedWorldFact[]): boolean {
  const payload = canonicalJsonStringify(fact.payload ?? {});
  return committedFacts.some((existing) =>
    existing.eventInstanceId === fact.eventInstanceId
    && existing.factType === fact.factType
    && canonicalJsonStringify(existing.payload ?? {}) === payload,
  );
}
