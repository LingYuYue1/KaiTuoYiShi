// R3 统一事实层（2026-08-09 计划 §6 R3）：裁决事实物化入口 + 薄消费视图。
// - 纯函数、不持久化、不猜剧情：只从 factLedger / worldEvents / adjudication / 结构化 payload 派生；
// - 禁止通过正文关键词、旧新闻、NPC 名称猜测、旧滑窗或 世界.全局事件 字符串反推事实；
// - 本模块不调用任何 set/save，不建立 Outbox / ProjectionStore / IndexedDB。
import type { CommittedWorldFact, GameTime, JsonValue, WorldEventInstance } from '../../models/storyRuntime';
import type { RuntimeFactCandidate } from './runtimeCore';
import type { StoryUnit } from './storyWeavingRuntimeAdapter';
import type { 剧情编织分段 } from '../../models/storyWeaving';
import { adjudicationFactIdentity } from './storyTurnAdjudicator';
import { isTerminal, transition } from './eventLifecycle';
import { factIdentity } from './factLedger';
import { canonicalJsonStringify } from './normalization';
import { sha256Fingerprint } from './id';

// ═══════════════ 一、唯一事实入口：把裁决接受的候选物化为 CommittedWorldFact ═══════════════

export interface MaterializeAdjudicationInput {
  adjudication: { decision: 'stay' | 'advance_one' | 'resolve_early' | 'deviate' | 'pause' | 'jump_to'; committedFactIds: string[]; supersededEventIds: string[] };
  /** 本回合全部 confirmed evidence（玩家线候选）。 */
  evidenceCandidates: RuntimeFactCandidate[];
  events: WorldEventInstance[];
  committedFacts: CommittedWorldFact[];
  gameTime: GameTime;
  runtimeRevision: number;
}

export interface MaterializeAdjudicationResult {
  /** 追加后的事实账本（只追加幂等，同一证据不产生第二份）。 */
  facts: CommittedWorldFact[];
  /** 应用事件迁移后的世界事件（resolve_early：目标 player_early、后续原定事件 superseded）。 */
  events: WorldEventInstance[];
  /** 本回合实际新增的事实 id（裁决回执的 committedFactIds 中未重复的部分）。 */
  newlyCommittedFactIds: string[];
  appliedEventMigrations: string[];
}

/** 与 factLedger 一致的事实去重（eventInstanceId + factType + canonical payload，跨 revision 幂等）。 */
function findCommittedFact(candidate: RuntimeFactCandidate, committedFacts: CommittedWorldFact[]): CommittedWorldFact | undefined {
  const payload = canonicalJsonStringify(candidate.payload ?? {});
  return committedFacts.find((fact) =>
    fact.eventInstanceId === candidate.eventInstanceId
    && fact.factType === candidate.factType
    && canonicalJsonStringify(fact.payload ?? {}) === payload,
  );
}

export function isFactCommitted(candidate: RuntimeFactCandidate, committedFacts: CommittedWorldFact[]): boolean {
  return findCommittedFact(candidate, committedFacts) !== undefined;
}

/** 物化单个候选为 CommittedWorldFact（factId = factIdentity(eventInstanceId, runtimeRevision, factType, payload)）。 */
export function materializeFactCandidate(candidate: RuntimeFactCandidate, gameTime: GameTime, runtimeRevision: number): CommittedWorldFact {
  return {
    factId: factIdentity(candidate.eventInstanceId, runtimeRevision, candidate.factType, candidate.payload ?? {}),
    eventInstanceId: candidate.eventInstanceId,
    sourceRevision: runtimeRevision,
    factType: candidate.factType,
    payload: candidate.payload ?? {},
    occurredAt: candidate.occurredAt ?? gameTime,
    committedAt: gameTime,
    publicScope: candidate.publicScope ?? { kind: 'private' },
    evidenceRefs: candidate.evidenceRefs ?? [],
    evidenceLevel: candidate.evidenceLevel ?? 'supported',
    invalidatesEventInstanceIds: [],
    playerParticipated: candidate.playerParticipated === true,
    playerObserverVisible: candidate.playerObserverVisible === true,
    createdBy: candidate.createdBy,
  };
}

/**
 * 唯一事实入口：按裁决回执 committedFactIds 从本回合 evidence 精确选出被接受的候选，物化并写入同一账本。
 * - advance_one：只提交当前单元完成事实（unit_completed）；
 * - resolve_early：提交玩家真实解决事实；目标事件按合法迁移链结算为 player_early；
 *   adjudication.supersededEventIds 对应的后续原定事件标记 superseded（不反向取消前置事件）；
 * - stay / deviate / pause：不产生任何事实与事件迁移。
 * 全程只操作内存副本，由调用方在唯一提交点一次写入。
 */
export function materializeAdjudicatedFacts(input: MaterializeAdjudicationInput): MaterializeAdjudicationResult {
  const { adjudication, evidenceCandidates, events, committedFacts, gameTime, runtimeRevision } = input;
  const acceptedIds = new Set(adjudication.committedFactIds ?? []);
  const selected = evidenceCandidates
    .filter((candidate) => acceptedIds.has(adjudicationFactIdentity(candidate, runtimeRevision)))
    .sort((a, b) => (a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0));

  let facts = committedFacts;
  const newlyCommittedFactIds: string[] = [];
  const terminalFactByEventId = new Map<string, CommittedWorldFact>();
  for (const candidate of selected) {
    const existing = findCommittedFact(candidate, facts);
    const fact = existing ?? materializeFactCandidate(candidate, gameTime, runtimeRevision);
    terminalFactByEventId.set(candidate.eventInstanceId, fact);
    if (!existing) {
      facts = [...facts, fact];
      newlyCommittedFactIds.push(fact.factId);
    }
  }

  let eventsAfter = events;
  const appliedEventMigrations: string[] = [];
  if (adjudication.decision === 'resolve_early') {
    // 目标事件 → resolved(player_early)：scheduled/blocked 先 active → resolution_pending → resolved（合法迁移链）。
    for (const candidate of selected) {
      const target = eventsAfter.find((event) => event.eventInstanceId === candidate.eventInstanceId);
      if (!target || isTerminal(target.status)) continue;
      let current = target;
      if (current.status === 'scheduled' || current.status === 'blocked') {
        const activated = transition(current, 'active', { at: gameTime });
        if (!activated.ok) continue;
        current = activated.instance;
      }
      if (current.status === 'active') {
        const pending = transition(current, 'resolution_pending', { at: gameTime });
        if (!pending.ok) continue;
        current = pending.instance;
      }
      const terminalFact = terminalFactByEventId.get(candidate.eventInstanceId);
      const resolved = transition(current, 'resolved', {
        at: gameTime,
        resolutionMode: 'player_early',
        outcome: 'normal',
        terminalFactId: terminalFact?.factId,
      });
      if (!resolved.ok) continue;
      const resolvedInstance = terminalFact && terminalFact.publicScope.kind !== 'private'
        ? { ...resolved.instance, publicFactIds: Array.from(new Set([...(resolved.instance.publicFactIds ?? []), terminalFact.factId])) }
        : resolved.instance;
      eventsAfter = eventsAfter.map((event) => event.eventInstanceId === target.eventInstanceId ? resolvedInstance : event);
      appliedEventMigrations.push(`${target.eventInstanceId} -> resolved(player_early)`);
    }
    // 后续原定事件 → superseded（只取代因果关联的后续事件，不反向取消前置）。
    for (const supersededId of adjudication.supersededEventIds ?? []) {
      const target = eventsAfter.find((event) => event.eventInstanceId === supersededId);
      if (!target || isTerminal(target.status)) continue;
      const superseded = transition(target, 'superseded', { at: gameTime });
      if (!superseded.ok) continue;
      eventsAfter = eventsAfter.map((event) => event.eventInstanceId === supersededId ? superseded.instance : event);
      appliedEventMigrations.push(`${supersededId} -> superseded`);
    }
  }

  return { facts, events: eventsAfter, newlyCommittedFactIds, appliedEventMigrations };
}

// ═══════════════ 二、提前解决候选构造（正文命中下一分段关键事件的事件结果） ═══════════════

function normalizeText(text: string): string {
  return String(text ?? '').replace(/\s+/g, '').trim();
}

const EARLY_RESOLUTION_NON_COMPLETION_RE = /(未|没有|尚未|还没|没能|未能|并未|不曾|无法|否认|如果|若|计划|准备|试图|打算|想要|暂缓|推迟)/;

function clauseAt(text: string, startOffset: number, endOffset: number): string {
  const boundaries = ['。', '！', '？', '；', '，', ',', '!', '?', ';'];
  const before = text.slice(0, startOffset);
  const start = Math.max(...boundaries.map((boundary) => before.lastIndexOf(boundary)));
  const after = text.slice(endOffset);
  const nextBoundaries = boundaries
    .map((boundary) => after.indexOf(boundary))
    .filter((index) => index >= 0);
  const end = nextBoundaries.length > 0 ? endOffset + Math.min(...nextBoundaries) : text.length;
  return text.slice(start + 1, end);
}

function eventResultFragment(resultText: string): string {
  const normalized = normalizeText(resultText);
  return normalized.replace(/^(玩家|主角|他们|他|她|其|已|已经|终于|最终|成功|顺利)/g, '');
}

/** 去掉时态辅助词的核心形态（「已经/已/了/着/过」等，任意位置），用于匹配 AI 措辞变化。 */
function coreForm(text: string): string {
  return normalizeText(text)
    .replace(/已经|已|终于|最终|成功|顺利|随后|接着|了|着|过/g, '');
}

function isSpecificResolutionText(text: string): boolean {
  return coreForm(text).length >= 5;
}

interface SentenceSpan {
  text: string;
  start: number;
  end: number;
}

function splitSentences(body: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    if ('。！？；!?;'.includes(body[index])) {
      spans.push({ text: body.slice(start, index + 1), start, end: index + 1 });
      start = index + 1;
    }
  }
  if (start < body.length) spans.push({ text: body.slice(start), start, end: body.length });
  return spans;
}

/**
 * 从正文构造「玩家提前解决未来事件」的 confirmed 候选（计划 4.2 规则 7 / R3 验收 2）：
 * - 只接受下一分段关键事件的事件结果（事件完成后的结果文本）在正文中明确出现且非否定/计划语境；
 * - 候选绑定 scheduled 世界事件实例 id（storyUnitIdOfKeyEvent 规则）；
 * - 人物、地点、标题、动作词本身永不单独成为提前解决证据。
 */
export async function buildEarlyResolutionEvidence(params: {
  body: string;
  scheduledSegment: 剧情编织分段;
  scheduledUnits: StoryUnit[];
  gameTime: GameTime;
  turnCount: number;
  responseId: string;
}): Promise<RuntimeFactCandidate[]> {
  const { body, scheduledSegment, scheduledUnits, gameTime, turnCount, responseId } = params;
  if (!scheduledSegment?.关键事件?.length || scheduledUnits.length === 0) return [];
  const candidates: RuntimeFactCandidate[] = [];
  for (let index = 0; index < scheduledSegment.关键事件.length; index += 1) {
    const event = scheduledSegment.关键事件[index];
    const unit = scheduledUnits[index];
    if (!unit) continue;
    for (const resultText of event.事件结果 ?? []) {
      const normalized = normalizeText(resultText);
      if (!normalized) continue;
      const hit = findResultHit(body, normalized, eventResultFragment(resultText));
      if (!hit) continue;
      const matchedText = body.slice(hit.start, hit.end);
      candidates.push({
        candidateId: 'turn_evidence:' + unit.unitId + ':' + turnCount,
        eventInstanceId: unit.unitId,
        factType: 'resolved_early',
        payload: { 事件名: event.事件名, 事件结果: resultText },
        occurredAt: gameTime,
        publicScope: { kind: 'private' },
        evidenceRefs: [{
          kind: 'narrative_span',
          responseId,
          messageId: responseId,
          bodyFingerprint: await sha256Fingerprint(body),
          normalizationVersion: 1,
          startOffset: hit.start,
          endOffset: hit.end,
          textFingerprint: await sha256Fingerprint(matchedText),
        }],
        evidenceLevel: 'confirmed',
        playerParticipated: true,
        playerObserverVisible: false,
        createdBy: 'player_turn',
      });
      break;
    }
  }
  return candidates;
}

function findResultHit(body: string, full: string, fragment: string): { start: number; end: number } | undefined {
  // 1. 原文直接包含（完整文本或核心片段），且结果必须足够具体；通用的“战斗结束/危机解除”不单独构成提前解决。
  const candidates = [full, fragment].filter((item) => isSpecificResolutionText(item));
  for (const target of candidates) {
    let fromIndex = 0;
    while (fromIndex < body.length) {
      const index = body.indexOf(target, fromIndex);
      if (index < 0) break;
      const end = index + target.length;
      if (!EARLY_RESOLUTION_NON_COMPLETION_RE.test(clauseAt(body, index, end))) {
        return { start: index, end };
      }
      fromIndex = end;
    }
  }
  // 2. 分句核心形态包含：容忍「已经解除」vs「已解除」等措辞变化（证据定位到命中句）。
  const core = coreForm(fragment || full);
  if (core.length >= 5) {
    for (const sentence of splitSentences(body)) {
      if (coreForm(sentence.text).includes(core)) {
        if (EARLY_RESOLUTION_NON_COMPLETION_RE.test(sentence.text)) continue;
        return { start: sentence.start, end: sentence.end };
      }
    }
  }
  return undefined;
}

// ═══════════════ 三、薄消费视图（所有现有系统只消费这一份） ═══════════════

export interface StoryFactConsumerView {
  /** 本回合已提交事实（factId ∈ newFactIds）。 */
  turnCommittedFacts: CommittedWorldFact[];
  /** 可公开报道事实：public / broadcast。 */
  reportableFacts: CommittedWorldFact[];
  /** 玩家已知事实：玩家参与、玩家可见，或已公开。 */
  playerKnownFacts: CommittedWorldFact[];
  /** NPC 可知事实：事件 participantIds 或 payload 明确 NPC ID（不猜测名字）。 */
  npcKnownFacts: Array<{ npcId: string; facts: CommittedWorldFact[] }>;
  /** 明确地点事实：payload 合法 locationId / anchorId。 */
  locationFacts: Array<{ locationId: string; anchorId?: string; facts: CommittedWorldFact[] }>;
  /** 未终态 scheduled 事件（新闻最多作为预告，不能写成已完成）。 */
  scheduledEventPreviews: WorldEventInstance[];
}

function isPublicFact(fact: CommittedWorldFact): boolean {
  return fact.publicScope?.kind === 'public' || fact.publicScope?.kind === 'broadcast';
}

function isPlayerKnownFact(fact: CommittedWorldFact): boolean {
  return fact.playerParticipated === true || fact.playerObserverVisible === true || isPublicFact(fact);
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

/** payload 中明确的结构化 NPC / 地点引用（只读字段，不猜测名称文本）。 */
export function explicitNpcIdsOfFact(fact: CommittedWorldFact): string[] {
  const payload = fact.payload ?? {};
  const direct = typeof payload.npcId === 'string' && payload.npcId.trim() ? [payload.npcId] : [];
  const list = stringList(payload.npcIds);
  const participants = stringList(payload.participantNpcIds);
  return Array.from(new Set([...direct, ...list, ...participants])).slice(0, 12);
}

export function explicitLocationRefOfFact(fact: CommittedWorldFact): { locationId: string; anchorId?: string } | null {
  const payload = fact.payload ?? {};
  const locationId = typeof payload.locationId === 'string' && payload.locationId.trim() ? payload.locationId : undefined;
  if (!locationId) return null;
  const anchorId = typeof payload.anchorId === 'string' && payload.anchorId.trim() ? payload.anchorId : undefined;
  return { locationId, anchorId };
}

/**
 * 构建统一事实消费视图：只从裁决后的 factLedger / worldEvents / adjudication / 结构化 payload 派生。
 * 禁止用正文关键词、旧新闻、NPC 名称猜测、旧滑窗或 世界.全局事件 字符串反推事实。
 */
export function buildStoryFactConsumerView(params: {
  factLedger: CommittedWorldFact[];
  worldEvents: WorldEventInstance[];
  newFactIds?: string[];
}): StoryFactConsumerView {
  const { factLedger, worldEvents } = params;
  const newFactSet = new Set(params.newFactIds ?? []);
  const eventsById = new Map(worldEvents.map((event) => [event.eventInstanceId, event]));
  const turnCommittedFacts = factLedger.filter((fact) => newFactSet.has(fact.factId));
  const reportableFacts = turnCommittedFacts.filter(isPublicFact);
  const playerKnownFacts = factLedger.filter(isPlayerKnownFact);

  const npcMap = new Map<string, CommittedWorldFact[]>();
  const pushNpcFact = (npcId: string, fact: CommittedWorldFact): void => {
    const list = npcMap.get(npcId) ?? [];
    if (list.some((existing) => existing.factId === fact.factId)) return;
    list.push(fact);
    npcMap.set(npcId, list);
  };
  for (const fact of factLedger) {
    // payload 明确 NPC ID（结构化字段，非名称猜测）。
    for (const npcId of explicitNpcIdsOfFact(fact)) pushNpcFact(npcId, fact);
    // 事件实例 participantIds 是明确参与者（结构化字段，非名称猜测）。
    const event = eventsById.get(fact.eventInstanceId);
    for (const npcId of event?.participantIds ?? []) {
      if (npcId && typeof npcId === 'string') pushNpcFact(npcId, fact);
    }
  }
  const npcKnownFacts = Array.from(npcMap.entries())
    .map(([npcId, facts]) => ({ npcId, facts: facts.slice(-20) }))
    .sort((a, b) => (a.npcId < b.npcId ? -1 : a.npcId > b.npcId ? 1 : 0));

  const locationMap = new Map<string, { anchorId?: string; facts: CommittedWorldFact[] }>();
  for (const fact of factLedger) {
    const ref = explicitLocationRefOfFact(fact);
    if (!ref) continue;
    const entry = locationMap.get(ref.locationId) ?? { anchorId: ref.anchorId, facts: [] };
    if (!entry.anchorId && ref.anchorId) entry.anchorId = ref.anchorId;
    entry.facts.push(fact);
    locationMap.set(ref.locationId, entry);
  }
  const locationFacts = Array.from(locationMap.entries())
    .map(([locationId, entry]) => ({ locationId, anchorId: entry.anchorId, facts: entry.facts.slice(-20) }))
    .sort((a, b) => (a.locationId < b.locationId ? -1 : a.locationId > b.locationId ? 1 : 0));

  const scheduledEventPreviews = worldEvents
    .filter((event) => (event.status === 'scheduled' || event.status === 'blocked') && !isTerminal(event.status))
    .sort((a, b) => (a.eventInstanceId < b.eventInstanceId ? -1 : a.eventInstanceId > b.eventInstanceId ? 1 : 0));

  return {
    turnCommittedFacts,
    reportableFacts,
    playerKnownFacts,
    npcKnownFacts,
    locationFacts,
    scheduledEventPreviews,
  };
}

/** 合并同一回合不同裁决来源的新事实 ID，并保持首次出现顺序。 */
export function mergeNewFactIds(...factIdGroups: ReadonlyArray<readonly string[]>): string[] {
  return Array.from(new Set(factIdGroups.flat()));
}

/** 格式化「已提交公共事实」简报（新闻/NPC/记忆消费用；label 不是事实 owner，只作显示）。 */
export function formatFactBrief(fact: CommittedWorldFact): string {
  const payload = fact.payload ?? {};
  const detail = typeof payload.endState === 'string'
    ? payload.endState
    : typeof payload.事件结果 === 'string'
      ? payload.事件结果
      : typeof payload.result === 'string'
        ? payload.result
        : '';
  return `${fact.factType}${detail ? '：' + detail : ''}（${fact.eventInstanceId}）`;
}
