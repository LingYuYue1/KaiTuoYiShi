// G1.3.1 factLedger：只追加、幂等的事实账本操作。
// - 事实身份 = 事件实例 + 来源 revision + 事实类型 + 结构化 payload（canonical）；
//   不能由标题、数组下标或新闻正文确定；
// - 同一事实重试返回同一结果（不追加第二份）；
// - 相同事件实例已有终态时，新的同义事实返回 ALREADY_TERMINAL；
// - supersedesFactId / invalidatesEventInstanceIds 只能引用已存在实体；
// - 事实产生者必须来自冻结枚举（FactCreatedBy），新闻模型不得直接成为事实来源。
import type { CommittedWorldFact, EvidenceLevel, FactCreatedBy, GameTime, JsonValue, PublicScope, StoryRuntimeState } from '../../models/storyRuntime';
import type { RuntimeFactCandidate, IdAllocator } from './runtimeCore';
import { canonicalJsonStringify } from './normalization';

export type FactLedgerResult =
  | { ok: true; state: StoryRuntimeState; fact: CommittedWorldFact }
  | { ok: false; code: string; message: string };

const TERMINAL_STATES = new Set(['resolved', 'cancelled', 'superseded', 'missed', 'archived']);
// 新闻模型不能直接成为事实来源。
const FORBIDDEN_CREATED_BY = new Set<FactCreatedBy>([]);

/**
 * 事实身份：事件实例 + 来源 revision + factType + payload canonical。
 * 不包含标题、数组下标、新闻正文或当前时间。
 */
export function factIdentity(eventInstanceId: string, sourceRevision: number, factType: string, payload: Record<string, JsonValue>): string {
  return canonicalJsonStringify({ eventInstanceId, sourceRevision, factType, payload });
}

/**
 * 只追加幂等事实：已存在同身份事实 -> 返回既有（不追加）；目标事件终态且新同义事实 -> ALREADY_TERMINAL。
 */
export async function appendFact(
  state: StoryRuntimeState,
  candidate: RuntimeFactCandidate,
  allocator: IdAllocator,
): Promise<FactLedgerResult> {
  if (FORBIDDEN_CREATED_BY.has(candidate.createdBy)) {
    return { ok: false, code: 'INVALID_SOURCE', message: '新闻模型不得直接成为事实来源' };
  }
  // 引用存在性。
  const targetInstance = state.worldEvents.find((w) => w.eventInstanceId === candidate.eventInstanceId);
  if (!targetInstance) return { ok: false, code: 'CONFLICT', message: '事实目标事件实例不存在: ' + candidate.eventInstanceId };

  const identity = factIdentity(candidate.eventInstanceId, state.runtimeRevision, candidate.factType, candidate.payload);
  // 幂等：同身份已存在 -> 返回既有。
  const existing = state.factLedger.find((f) => f.factId === identity || (
    f.eventInstanceId === candidate.eventInstanceId && f.sourceRevision === state.runtimeRevision && f.factType === candidate.factType
    && canonicalJsonStringify(f.payload) === canonicalJsonStringify(candidate.payload)
  ));
  if (existing) return { ok: true, state, fact: existing };

  // 终态事件的新同义事实 -> ALREADY_TERMINAL。
  if (TERMINAL_STATES.has(targetInstance.status)) {
    return { ok: false, code: 'ALREADY_TERMINAL', message: '相同事件实例已有终态，新同义事实拒绝: ' + candidate.eventInstanceId };
  }

  const factId = await allocator('fact', { identity }, candidate.candidateId || '');
  const fact: CommittedWorldFact = {
    factId,
    eventInstanceId: candidate.eventInstanceId,
    sourceRevision: state.runtimeRevision,
    factType: candidate.factType,
    payload: candidate.payload,
    occurredAt: candidate.occurredAt,
    committedAt: candidate.occurredAt,
    publicScope: candidate.publicScope,
    evidenceRefs: candidate.evidenceRefs,
    evidenceLevel: candidate.evidenceLevel,
    invalidatesEventInstanceIds: [],
    playerParticipated: candidate.playerParticipated,
    playerObserverVisible: candidate.playerObserverVisible,
    createdBy: candidate.createdBy,
  };
  return { ok: true, state: { ...state, factLedger: [...state.factLedger, fact] }, fact };
}

/**
 * 从候选构造 ledger 可解释回执：事实是谁产生、基于哪个 revision、哪些证据、玩家是否参与、玩家/NPC 是否知道。
 */
export function explainFact(fact: CommittedWorldFact): string {
  return 'fact ' + fact.factId + ' by ' + fact.createdBy + ' @ revision ' + fact.sourceRevision
    + ' evidence=' + fact.evidenceRefs.map((e) => e.kind).join(',')
    + ' playerParticipated=' + fact.playerParticipated
    + ' playerObserverVisible=' + fact.playerObserverVisible;
}

/** 用发生时间构造候选的最小 helper（occurredAt 必填）。 */
export function makeCandidate(
  eventInstanceId: string,
  factType: string,
  payload: Record<string, JsonValue>,
  evidence: RuntimeFactCandidate['evidenceRefs'],
  level: EvidenceLevel,
  occurredAt: GameTime,
  createdBy: FactCreatedBy,
  publicScope: PublicScope = { kind: 'private' },
): RuntimeFactCandidate {
  return {
    candidateId: '',
    eventInstanceId,
    factType,
    payload,
    occurredAt,
    publicScope,
    evidenceRefs: evidence,
    evidenceLevel: level,
    playerParticipated: false,
    playerObserverVisible: false,
    createdBy,
  };
}
