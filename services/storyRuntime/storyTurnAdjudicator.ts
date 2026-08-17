// R1 联合裁决器（2026-08-09 计划 §4 / §6 R1）。
// 每回合只执行一次，同时裁决玩家线与世界线，只允许一个正式结果：
// - 普通回合只结算当前情节单元；后续阶段已成立只能证明当前段结束，未来单元本身不是推进目标；
// - 普通回合最多推进一个情节单元；跨段只能来自明确调试、迁移或玩家已提交的提前结算事实；
// - 人物、地点、标题、动作词和模型 `<剧情规划>` 只能作为候选，不能单独成为完成事实；
// - 当前单元只有命中明确结束状态、已验证系统命令或 gameplay receipt 时才能结算；
// - 已结算、取消、被取代或错过的事件都是终态，普通回合不能复活，也不能再从旧字符串生成事实；
// - 玩家提前解决未来事件 → resolve_early + superseded，不补演原事件，玩家焦点不移动；
// - 玩家绕开主线 → 玩家线保持或偏离；后台世界事件按游戏时间推进但不得伪造玩家参与；
// - 到期后台事件进入待结算不会自动移动玩家焦点。
// 本裁决器是纯函数，只产出回执（计划 §4.1 唯一裁决接口），不写任何状态；R2 接线按回执应用。
import type { CommittedWorldFact, EvidenceRefKind, GameTime, JsonValue, StoryFocus, WorldEventInstance } from '../../models/storyRuntime';
import type { 剧情编织分段 } from '../../models/storyWeaving';
import type { RuntimeFactCandidate } from './runtimeCore';
import { factIdentity } from './factLedger';
import { isTerminal } from './eventLifecycle';
import { canonicalJsonStringify } from './normalization';
import { storyUnitIdOfKeyEvent, storyUnitIdOfSegment } from './storyWeavingRuntimeAdapter';

export type StoryTurnDecision = 'stay' | 'advance_one' | 'resolve_early' | 'deviate' | 'pause' | 'jump_to';

export interface StoryTurnAdjudication {
  decision: StoryTurnDecision;
  currentUnitId: string;
  completedUnitIds: string[];
  committedFactIds: string[];
  supersededEventIds: string[];
  /** jump_to 目标分段（AI 申报 + 正文背书通过的跳段）。 */
  targetSegmentId?: string;
  reasons: string[];
}

export interface StoryTurnAdjudicationInput {
  currentFocus: StoryFocus;
  currentSegment: 剧情编织分段;
  committedFacts: CommittedWorldFact[];
  eventInstances: WorldEventInstance[];
  confirmedEvidence: RuntimeFactCandidate[];
  gameTime: GameTime;
  runtimeRevision: number;
}

/** 已验证命令 / gameplay receipt 才构成完成证据；narrative_span 单独出现时必须命中明确结束状态。 */
const COMPLETION_EVIDENCE_KINDS = new Set<EvidenceRefKind>(['system_command', 'gameplay_receipt']);

/** 候选是否为已验证证据：evidenceLevel='confirmed' 且证据引用非空。仅提及/支持级不构成完成或结算依据。 */
export function isVerifiedEvidence(candidate: RuntimeFactCandidate): boolean {
  return candidate.evidenceLevel === 'confirmed'
    && Array.isArray(candidate.evidenceRefs)
    && candidate.evidenceRefs.length > 0;
}

/** 裁决计划提交的事实身份（使用当前真实 revision，与 factLedger 身份规则一致）。 */
export function adjudicationFactIdentity(candidate: RuntimeFactCandidate, runtimeRevision: number): string {
  return factIdentity(candidate.eventInstanceId, runtimeRevision, candidate.factType, candidate.payload ?? {});
}

function normalizeText(text: string): string {
  return String(text ?? '').replace(/\s+/g, '').trim();
}

function collectStringValues(value: JsonValue | undefined, out: string[]): void {
  if (value === null || value === undefined) return;
  if (typeof value === 'string') { out.push(value); return; }
  if (Array.isArray(value)) { for (const item of value) collectStringValues(item, out); return; }
  if (typeof value === 'object') { for (const key of Object.keys(value)) collectStringValues(value[key], out); }
}

/** 候选 payload 是否命中当前分段明确结束状态（命中即「明确完成证据」之一，规则 4.2.4）。 */
export function payloadHitsEndState(payload: Record<string, JsonValue> | undefined, endStates: string[]): boolean {
  if (!payload || !endStates.length) return false;
  const normalizedEnds = endStates.map(normalizeText).filter((item) => item.length > 0);
  if (!normalizedEnds.length) return false;
  const values: string[] = [];
  collectStringValues(payload, values);
  return values.some((raw) => {
    const normalized = normalizeText(raw);
    if (normalized.length === 0) return false;
    return normalizedEnds.some((end) => normalized === end || normalized.includes(end) || (end.includes(normalized) && normalized.length >= 4));
  });
}

function payloadEstablishesLaterSegment(payload: Record<string, JsonValue> | undefined, segment: 剧情编织分段): boolean {
  if (!payload) return false;
  const basis = payload.progressionBasis;
  const currentSegmentId = payload.currentSegmentId;
  const impliedBySegmentId = payload.impliedBySegmentId;
  const impliedBySegmentGroup = payload.impliedBySegmentGroup;
  const matchedAnchor = payload.matchedAnchor;
  return (basis === 'later_segment_state' || basis === 'later_segment_location')
    && currentSegmentId === segment.id
    && typeof impliedBySegmentId === 'string'
    && impliedBySegmentId.length > 0
    && typeof impliedBySegmentGroup === 'number'
    && impliedBySegmentGroup > segment.组号
    && typeof matchedAnchor === 'string'
    && matchedAnchor.length >= 2;
}

/** 候选是否为当前单元的完成证据：已验证系统命令 / gameplay receipt、明确结束状态，或后续阶段已成立。 */
export function isCompletionEvidence(candidate: RuntimeFactCandidate, segment: 剧情编织分段): boolean {
  if (candidate.factType !== 'unit_completed') return false;
  for (const ref of candidate.evidenceRefs) {
    if (ref.kind === 'system_command') return true;
    if (ref.kind === 'gameplay_receipt' && ref.receiptType === 'unit_completed') return true;
  }
  return payloadHitsEndState(candidate.payload, segment.本段结束状态)
    || payloadEstablishesLaterSegment(candidate.payload, segment);
}

/** 同一完成证据是否已在事实账本提交（eventInstanceId + factType + canonical payload 相同，跨 revision 去重）。 */
export function isDuplicateCommit(candidate: RuntimeFactCandidate, committedFacts: CommittedWorldFact[]): boolean {
  const payload = canonicalJsonStringify(candidate.payload ?? {});
  return committedFacts.some((fact) =>
    fact.eventInstanceId === candidate.eventInstanceId
    && fact.factType === candidate.factType
    && canonicalJsonStringify(fact.payload ?? {}) === payload,
  );
}

function sortIds(ids: Iterable<string>): string[] {
  return Array.from(new Set(ids)).sort();
}

/**
 * 联合裁决：唯一裁决接口（计划 §4.1）。
 * 决策优先级（确定性）：
 * 1. 暂停态（focus blocked/awaiting_player 或分段「暂停」）→ pause；
 * 2. 当前单元已终态/已完成 → stay（终态不可复活，验收 5）；
 * 3. 偏离态（focus diverged 或分段「已偏离」）→ deviate；
 * 4. 已验证候选指向已排期/到期未结算世界事件 → resolve_early + superseded（验收 6）；
 * 5. 已验证候选指向当前单元与已排期单元之外的实例且玩家参与 → deviate（验收 8 玩家线）；
 * 6. 已验证完成证据命中当前单元且非重复 → advance_one（验收 2/4）；
 * 7. 其余 → stay（证据不足/仅提及未来内容/后台到期不影响焦点，验收 1/3/7/8 世界线）。
 */
export function adjudicateStoryTurn(input: StoryTurnAdjudicationInput): StoryTurnAdjudication {
  const { currentFocus, currentSegment, committedFacts, eventInstances, confirmedEvidence, gameTime, runtimeRevision } = input;
  const currentUnitId = currentFocus.unitId && currentFocus.unitId.length > 0 ? currentFocus.unitId : storyUnitIdOfSegment(currentSegment);
  const byId = new Map(eventInstances.map((instance) => [instance.eventInstanceId, instance]));
  const terminalUnitIds = new Set(eventInstances.filter((instance) => isTerminal(instance.status)).map((instance) => instance.eventInstanceId));
  const activeUnitIds = new Set(currentSegment.关键事件.map((_, index) => storyUnitIdOfKeyEvent(currentSegment, index)));
  const reasons: string[] = [];

  const emptyReceipt = (decision: StoryTurnDecision, extra?: { completedUnitIds?: string[]; committedFactIds?: string[]; supersededEventIds?: string[] }): StoryTurnAdjudication => {
    const receipt: StoryTurnAdjudication = {
      decision,
      currentUnitId,
      completedUnitIds: extra?.completedUnitIds ?? [],
      committedFactIds: extra?.committedFactIds ?? [],
      supersededEventIds: extra?.supersededEventIds ?? [],
      reasons,
    };
    const pendingWorld = eventInstances.filter((instance) => instance.status === 'resolution_pending');
    if (pendingWorld.length > 0) {
      reasons.push(`后台世界事件 ${pendingWorld.length} 个到期进入待结算（游戏时间 dayOrdinal=${gameTime.dayOrdinal}, minuteOfDay=${gameTime.minuteOfDay}），不影响玩家焦点`);
    }
    return receipt;
  };

  // 1. 暂停态：玩家线保持暂停，不推进、不结算。
  if (currentFocus.status === 'blocked' || currentFocus.status === 'awaiting_player' || currentSegment.运行状态 === '暂停') {
    reasons.push('当前焦点处于暂停/等待玩家状态，玩家线保持');
    return emptyReceipt('pause');
  }

  // 2. 当前单元已终态/已完成：普通回合不能复活（验收 5）。
  if (currentFocus.status === 'completed' || terminalUnitIds.has(currentUnitId)) {
    reasons.push('当前单元已终态/已完成，不能再次成为当前事件或重复结算');
    return emptyReceipt('stay');
  }

  // 3. 偏离态：玩家线保持偏离，后台世界按游戏时间继续（验收 8 玩家线）。
  if (currentFocus.status === 'diverged' || currentSegment.运行状态 === '已偏离') {
    reasons.push('玩家线已偏离主线，保持偏离，不伪造玩家参与');
    return emptyReceipt('deviate');
  }

  // 证据分类（只按确定性规则，不猜剧情）。
  const verified = confirmedEvidence.filter(isVerifiedEvidence);
  const mentioned = confirmedEvidence.filter((candidate) => !isVerifiedEvidence(candidate));
  const planned: RuntimeFactCandidate[] = [];
  const currentEvidence: RuntimeFactCandidate[] = [];
  const inSegmentEvidence: RuntimeFactCandidate[] = [];
  const externalEvidence: RuntimeFactCandidate[] = [];
  const terminalTargeted: RuntimeFactCandidate[] = [];

  for (const candidate of verified) {
    const target = byId.get(candidate.eventInstanceId);
    if (target && isTerminal(target.status)) { terminalTargeted.push(candidate); continue; }
    if (candidate.eventInstanceId === currentUnitId) { currentEvidence.push(candidate); continue; }
    if (activeUnitIds.has(candidate.eventInstanceId)) { inSegmentEvidence.push(candidate); continue; }
    if (!target) { externalEvidence.push(candidate); continue; }
    if (target.status === 'scheduled' || target.status === 'blocked' || target.status === 'resolution_pending') {
      if (candidate.playerParticipated === true && candidate.createdBy === 'player_turn') planned.push(candidate);
      else externalEvidence.push(candidate);
    } else {
      externalEvidence.push(candidate);
    }
  }

  for (const candidate of mentioned) {
    if (candidate.eventInstanceId === currentUnitId) {
      reasons.push(`正文仅提及当前单元（${candidate.eventInstanceId}），无已验证系统命令/receipt/明确结束状态，不构成完成证据`);
    } else {
      reasons.push(`正文提及单元「${candidate.eventInstanceId}」（非当前单元，可能为未来内容），不足以推进或结算`);
    }
  }

  if (terminalTargeted.length > 0) {
    reasons.push(`存在指向已终态事件的确认证据 ${terminalTargeted.length} 条，终态不可复活，也不从旧字符串生成新事实`);
  }

  // 4. 提前解决未来事件：resolve_early + superseded，不补演原事件（验收 6）。
  if (planned.length > 0) {
    const committedFactIds = sortIds(planned.map((candidate) => adjudicationFactIdentity(candidate, runtimeRevision)));
    const supersededEventIds = sortIds(planned.flatMap((candidate) => {
      const target = byId.get(candidate.eventInstanceId);
      if (!target) return [];
      // 只取代以目标为父实例或依赖目标的后续原定事件；不反向取消目标的前置事件。
      return eventInstances
        .filter((instance) => instance.eventInstanceId !== target.eventInstanceId
          && !isTerminal(instance.status)
          && (instance.parentInstanceId === target.eventInstanceId
            || instance.dependencyIds.includes(target.eventInstanceId)))
        .map((instance) => instance.eventInstanceId);
    }));
    reasons.push(`玩家提前解决未来事件（${sortIds(planned.map((c) => c.eventInstanceId)).join('、')}），记录真实结果，原定事件标记 superseded，不补演原剧情`);
    if (supersededEventIds.length > 0) reasons.push('被取代的原定事件：' + supersededEventIds.join('、'));
    return emptyReceipt('resolve_early', { committedFactIds, supersededEventIds });
  }

  // 5. 玩家绕开主线：参与当前单元与已排期单元之外的实例 → 玩家线偏离（验收 8 玩家线）。
  if (externalEvidence.some((candidate) => candidate.playerParticipated === true)) {
    reasons.push('玩家参与当前单元与已排期世界事件之外的活动，玩家线偏离主线');
    return emptyReceipt('deviate');
  }

  // 5.5 跳段：AI 申报「进入分段N」且正文背书目标分段要素（jumpTargetSegmentId 候选）→ 直接对齐目标分段。
  // 跳段优先于单格推进：正文已实际写到后段时，不再一格一格爬（中间分段标记已跳过）。
  if (currentEvidence.length > 0) {
    const jumpCandidate = currentEvidence.find((candidate) => {
      const target = candidate.payload?.jumpTargetSegmentId;
      return typeof target === 'string' && target.length > 0;
    });
    if (jumpCandidate) {
      const targetSegmentId = String(jumpCandidate.payload!.jumpTargetSegmentId);
      const targetGroup = jumpCandidate.payload?.jumpTargetSegmentGroup;
      reasons.push(`AI 申报进入后段且正文背书目标分段要素，跳段对齐到 ${targetSegmentId}${targetGroup !== undefined ? `（第 ${targetGroup} 段）` : ''}`);
      return {
        ...emptyReceipt('jump_to', { completedUnitIds: [currentUnitId], committedFactIds: [] }),
        targetSegmentId,
      };
    }
  }

  // 6. 当前单元完成证据：只推进一格；同一完成证据不产生第二次结算（验收 2/4）。
  if (currentEvidence.length > 0) {
    const completionCandidates = currentEvidence.filter((candidate) => isCompletionEvidence(candidate, currentSegment));
    if (completionCandidates.length > 0) {
      const fresh = completionCandidates.filter((candidate) => !isDuplicateCommit(candidate, committedFacts));
      if (fresh.length === 0) {
        reasons.push('同一完成证据已提交过，不产生第二次结算');
        return emptyReceipt('stay');
      }
      const committedFactIds = sortIds(fresh.map((candidate) => adjudicationFactIdentity(candidate, runtimeRevision)));
      reasons.push(`当前单元有明确完成或后续阶段成立证据（${fresh.length} 条），只推进一格`);
      return emptyReceipt('advance_one', { completedUnitIds: [currentUnitId], committedFactIds });
    }
    reasons.push('当前单元存在已验证正文证据，但未命中明确结束状态、系统命令或 gameplay receipt，不推进');
  }

  if (inSegmentEvidence.length > 0) {
    reasons.push(`当前分段关键事件有确认证据（${inSegmentEvidence.length} 条），但本段结束状态未命中，保持在当前分段`);
  }
  if (externalEvidence.length > 0) {
    reasons.push('存在当前单元之外的实例活动证据，但玩家未参与，不推进玩家焦点');
  }
  if (planned.length === 0 && verified.length === 0 && mentioned.length === 0 && currentEvidence.length === 0) {
    reasons.push('本回合无完成证据与到期结算输入，保持当前焦点');
  }
  reasons.push('当前单元无明确完成证据，保持当前焦点');
  return emptyReceipt('stay');
}
