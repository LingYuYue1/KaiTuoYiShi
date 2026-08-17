// R2 独立世界演变工作流（2026-08-09 计划 §5 / §6 R2）。
// - 复用现有 API 配置与队列任务机制，不新建 provider、任务系统或独立存储；
// - 世界演变只返回 WorldEvolutionCandidate，不直接调用 set世界、appendWorldEvents、剧情进度保存或自动存档；
// - <动态世界> 只作为世界演变输入线索，不再直接生成正式世界事实；
// - 到期事件先经 dueEventScanner 进入 resolution_pending（后台世界先处理）；
// - API 失败/超时/非法候选：正式世界保持不变，到期事件保持待结算，返回失败原因（主剧情仍可继续）。
// 本文件不依赖 React state（参数传入），便于独立回归直接驱动。
import type { API配置项 } from '../../models/settings';
import type { 世界状态 } from '../../models/world';
import type { GameTime, JsonValue, WorldEventInstance } from '../../models/storyRuntime';
import type { 剧情编织分段 } from '../../models/storyWeaving';
import type { StoryWeavingRuntimeProjection } from '../../services/storyRuntime/storyWeavingRuntimeAdapter';
import type { RuntimeFactCandidate } from '../../services/storyRuntime/runtimeCore';
import type { WorldEvolutionCandidate } from '../../services/storyRuntime/worldEvolutionAdjudicator';
import { chatCompletionNonStream, type ChatCompletionRequest } from '../../services/ai/chatCompletionClient';
import { extractJsonLikeText, parseJsonWithRepair } from '../../services/ai/structuredOutputRepair';
import { scanDueEvents } from '../../services/storyRuntime/dueEventScanner';
import { sha256Fingerprint } from '../../services/storyRuntime/id';
import { 解析琥珀日期序数 } from '../../models/world';

/** 把世界状态的时间转换为 GameTime（dayOrdinal 来自琥珀日期序数，minuteOfDay 来自 24 小时制时刻）。 */
export function gameTimeOf(world: Pick<世界状态, '当前日期' | '当前时间' | '开拓天数'>): GameTime {
  const dateSerial = 解析琥珀日期序数(world.当前日期);
  const dayOrdinal = dateSerial !== null ? dateSerial : Math.max(1, Math.trunc(Number(world.开拓天数) || 1));
  const clock = String(world.当前时间 ?? '').match(/(\d{1,2}):(\d{2})/);
  const minuteOfDay = clock
    ? Math.min(23, Math.max(0, Number(clock[1]))) * 60 + Math.min(59, Math.max(0, Number(clock[2])))
    : 6 * 60 + 40;
  return { dayOrdinal, minuteOfDay };
}

function anchorMinuteOfDay(anchor: string | undefined, fallback: number): number {
  if (!anchor) return fallback;
  const clock = anchor.match(/(\d{1,2}):(\d{2})\s*$/);
  if (!clock) return fallback;
  return Math.min(23, Math.max(0, Number(clock[1]))) * 60 + Math.min(59, Math.max(0, Number(clock[2])));
}

/**
 * 给适配器投影的 scheduled 实例设置真实 dueAt（R1 只保留旧文本锚点，R2 由游戏时钟转换）：
 * 下一分段事件默认下一游戏日按锚点时刻到期；无锚点时刻用当前时刻。
 */
export function scheduledInstanceWithDueAt(instance: WorldEventInstance, timelineAnchor: string | undefined, gameTime: GameTime): WorldEventInstance {
  if (instance.dueAt) return instance;
  return {
    ...instance,
    startAt: { dayOrdinal: gameTime.dayOrdinal + 1, minuteOfDay: anchorMinuteOfDay(timelineAnchor, gameTime.minuteOfDay) },
    dueAt: { dayOrdinal: gameTime.dayOrdinal + 1, minuteOfDay: anchorMinuteOfDay(timelineAnchor, gameTime.minuteOfDay) },
  };
}

/**
 * 合并持久化事件与适配器投影：
 * - 投影中已存在的实例保留持久化状态（终态/待结算跨回合不复活）；
 * - 投影中新增的下一分段实例进入世界线（scheduled + 游戏时钟 dueAt）；
 * - 持久化中不存在的旧实例保留（已排期世界事件不被静默删除）。
 */
export function mergeProjectionEvents(
  persistedEvents: WorldEventInstance[],
  projectedInstances: WorldEventInstance[],
  gameTime: GameTime,
  timelineAnchors: Record<string, string | undefined> = {},
): WorldEventInstance[] {
  const existingIds = new Set(persistedEvents.map((instance) => instance.eventInstanceId));
  const merged = persistedEvents.map((instance) => ({ ...instance }));
  for (const projected of projectedInstances) {
    if (existingIds.has(projected.eventInstanceId)) continue;
    merged.push(scheduledInstanceWithDueAt({ ...projected }, timelineAnchors[projected.eventInstanceId], gameTime));
    existingIds.add(projected.eventInstanceId);
  }
  return merged;
}

export interface DueScanOutcome {
  events: WorldEventInstance[];
  dueInstanceIds: string[];
  cycles: string[];
}

/** 薄封装 dueEventScanner：构造最小扫描状态，只返回迁移后的事件副本与到期 id（不写任何正式状态）。 */
export function scanDueWorldEvents(events: WorldEventInstance[], runtimeRevision: number, now: GameTime): DueScanOutcome {
  const scanState = {
    schemaVersion: 3,
    runtimeRevision,
    worldEvents: events,
  } as unknown as Parameters<typeof scanDueEvents>[0];
  const result = scanDueEvents(scanState, now);
  if (!result.ok) return { events, dueInstanceIds: [], cycles: [] };
  return { events: result.state.worldEvents, dueInstanceIds: result.dueInstanceIds, cycles: result.cycles };
}

function normalizeText(text: string): string {
  return String(text ?? '').replace(/\s+/g, '').trim();
}

const END_STATE_PREFIX_RE = /^(玩家|主角|他们|他|她|其|我|已|已经|终于|最终|成功|顺利|随后|接着|并在|并)/;
const END_STATE_NON_COMPLETION_RE = /(未|没有|尚未|还没|没能|未能|并未|不曾|无法|否认|如果|若|计划|准备|试图|打算|想要|即将|将要|将会|以后|未来|预计|预定|目标|可能|回忆|梦见|假设|设想|传闻|预告)/;
/** 完成要素宽松匹配：正文命中 ≥2 个完成要素视为分段完成（AI 自然表达无需逐字命中结束状态）。 */
const FACT_POINT_HIT_THRESHOLD = 2;
/** 完成要素命中排除的泛称（提到开拓者/列车组 ≠ 分段完成）。 */
const FACT_POINT_EXCLUDE_TERMS = new Set(['开拓者', '列车组', '无名客', '星穹列车', '主角', '玩家']);

interface EndStateMatch {
  endState: string;
  startOffset: number;
  endOffset: number;
}

function normalizedTextWithOffsets(text: string): { normalized: string; offsets: number[] } {
  let normalized = '';
  const offsets: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    if (/\s/.test(text[index])) continue;
    normalized += text[index];
    offsets.push(index);
  }
  return { normalized, offsets };
}

/** 结束状态 → 候选片段：完整文本，以及去掉角色/时态前缀后仍保留完成动作的核心片段。 */
function endStateFragments(endState: string): string[] {
  const normalized = normalizeText(endState);
  if (!normalized) return [];
  const fragments: string[] = [normalized];
  let stripped = normalized;
  for (let index = 0; index < 4; index += 1) {
    const next = stripped.replace(END_STATE_PREFIX_RE, '');
    if (next === stripped) break;
    stripped = next;
  }
  if (stripped !== normalized && stripped.length >= 4) fragments.push(stripped);
  return fragments;
}

function clausePrefixOf(text: string, endOffset: number): string {
  const prefix = text.slice(0, endOffset);
  const boundary = Math.max(
    prefix.lastIndexOf('。'), prefix.lastIndexOf('！'), prefix.lastIndexOf('？'),
    prefix.lastIndexOf('；'), prefix.lastIndexOf('，'), prefix.lastIndexOf(','),
    prefix.lastIndexOf('!'), prefix.lastIndexOf('?'), prefix.lastIndexOf(';'),
  );
  return prefix.slice(boundary + 1);
}

/** 只接受正文中明确出现的完整/核心结束片段；否定、条件和计划语境不构成完成。 */
function findEndStateMatch(
  body: string,
  endStates: string[],
  options?: { completionTerms?: string[]; excludeTerms?: string[] },
): EndStateMatch | undefined {
  const source = normalizedTextWithOffsets(body);
  if (!source.normalized) return undefined;
  for (const endState of endStates) {
    const fragments = endStateFragments(endState);
    for (const fragment of fragments) {
      const normalizedIndex = source.normalized.indexOf(fragment);
      if (normalizedIndex < 0) continue;
      const clausePrefix = clausePrefixOf(source.normalized, normalizedIndex);
      if (END_STATE_NON_COMPLETION_RE.test(clausePrefix)) continue;
      const startOffset = source.offsets[normalizedIndex];
      const lastOffset = source.offsets[normalizedIndex + fragment.length - 1];
      if (startOffset === undefined || lastOffset === undefined) continue;
      return { endState, startOffset, endOffset: lastOffset + 1 };
    }
  }
  // 完成要素宽松匹配：正文命中 ≥2 个完成要素（引号内名词/涉及地点短名/关键事件名）视为完成。
  // 返回的 endState 取第一条原始结束状态——裁决器 payloadHitsEndState 按结束状态原文判定，宽松匹配不改变回执契约。
  if (options?.completionTerms && options.completionTerms.length > 0) {
    const hit = countCompletionTermHits(body, options.completionTerms, options.excludeTerms ?? []);
    if (hit.matched && hit.firstOffset) {
      return { endState: endStates[0], startOffset: hit.firstOffset.start, endOffset: hit.firstOffset.end };
    }
  }
  return undefined;
}

/** 正文命中完成要素的计数（排除泛称/角色名/否定语境），供结束状态宽松匹配与 AI 申报背书共用。 */
/** 正文命中完成要素的计数（排除泛称/角色名/否定语境），供结束状态宽松匹配与 AI 申报背书共用。
 *  同位置重叠词只保留最长（「空间站危机」覆盖窗口词「空间站」），避免同一处命中重复计数。 */
function countCompletionTermHits(
  body: string,
  terms: string[],
  excludeTerms: string[],
): { hits: string[]; matched: boolean; firstOffset?: { start: number; end: number } } {
  const source = normalizedTextWithOffsets(body);
  if (!source.normalized) return { hits: [], matched: false };
  const exclude = new Set([...FACT_POINT_EXCLUDE_TERMS, ...excludeTerms]);
  const found: Array<{ term: string; start: number; end: number }> = [];
  for (const term of terms) {
    if (exclude.has(term)) continue;
    const normalizedIndex = source.normalized.indexOf(term);
    if (normalizedIndex < 0) continue;
    const clausePrefix = clausePrefixOf(source.normalized, normalizedIndex);
    if (END_STATE_NON_COMPLETION_RE.test(clausePrefix)) continue;
    const startOffset = source.offsets[normalizedIndex];
    const lastOffset = source.offsets[normalizedIndex + term.length - 1];
    if (startOffset === undefined || lastOffset === undefined) continue;
    found.push({ term, start: startOffset, end: lastOffset + 1 });
  }
  found.sort((a, b) => b.term.length - a.term.length);
  // 区间包含去重：同一位置或嵌套在更长命中内的词只保留最长
  // （「空间站危机」覆盖「空间站」与窗口词「站危机」，避免同一处命中重复计数）。
  const deduped = found.filter((item, index) =>
    !found.slice(0, index).some((prev) => prev.start <= item.start && item.end <= prev.end),
  );
  const hits = deduped.map((item) => item.term);
  const first = deduped[0];
  return {
    hits,
    matched: hits.length >= FACT_POINT_HIT_THRESHOLD,
    firstOffset: first ? { start: first.start, end: first.end } : undefined,
  };
}

/** 正文是否命中任一完成要素（≥1，排除泛称/角色名/否定语境）：跳段背书用。 */
function countAnyCompletionTermHit(
  body: string,
  terms: string[],
  excludeTerms: string[],
): { hit: boolean; offset?: { start: number; end: number } } {
  const source = normalizedTextWithOffsets(body);
  if (!source.normalized) return { hit: false };
  const exclude = new Set([...FACT_POINT_EXCLUDE_TERMS, ...excludeTerms]);
  for (const term of terms) {
    if (exclude.has(term)) continue;
    const normalizedIndex = source.normalized.indexOf(term);
    if (normalizedIndex < 0) continue;
    const clausePrefix = clausePrefixOf(source.normalized, normalizedIndex);
    if (END_STATE_NON_COMPLETION_RE.test(clausePrefix)) continue;
    const startOffset = source.offsets[normalizedIndex];
    const lastOffset = source.offsets[normalizedIndex + term.length - 1];
    if (startOffset === undefined || lastOffset === undefined) continue;
    return { hit: true, offset: { start: startOffset, end: lastOffset + 1 } };
  }
  return { hit: false };
}

/** 完成要素池：结束状态引号内名词（物品/专名）+ 涉及地点短名 + 关键事件名。正文命中 ≥2 个即提示分段完成。 */
function buildCompletionTermPool(segment: 剧情编织分段): string[] {
  const terms = new Set<string>();
  for (const endState of segment.本段结束状态 ?? []) {
    for (const match of String(endState).matchAll(/[“"「『]([^”"」』]{2,12})[”"」』]/g)) {
      terms.add(match[1].trim());
    }
  }
  for (const location of [
    ...(segment.涉及地点 ?? []),
    ...(segment.地图地点档案 ?? []).map((item) => item.名称),
  ]) {
    const short = String(location).split(/[·•・/\\|_\-—－]/).filter(Boolean).pop()?.trim();
    if (short && short.length >= 2 && short.length <= 12) terms.add(short);
  }
  for (const event of segment.关键事件 ?? []) {
    const name = event.事件名?.trim();
    if (name && name.length >= 2 && name.length <= 12) terms.add(name);
  }
  return Array.from(terms);
}

/** 后段事实匹配词：开局已成立事实/前段延续事实按虚词切分为名词块 + 4 字滑动窗口
 *  （正文子串命中即视为后段要素；窗口保证「模拟宇宙为Alpha测试服」→「模拟宇宙」可命中）。 */
function buildSegmentFactTerms(segment: 剧情编织分段): string[] {
  const sources = [
    ...(segment.开局已成立事实 ?? []),
    ...(segment.前段延续事实 ?? []),
  ];
  const FACT_SPLIT_RE = /(?:已|为|的|在|与|和|及|并|后|前|由|被|将|正|仍|按|从|向|到|获得|完成|抵达|进入|成为|建立|确认|加入|返回|前往|离开|携带|通过|启动|打开|关闭|封锁|授予|接收|击败|镇压|封印|平息|接管|升格|解锁|掌握|正式|成功|安全|重新|暂时|继续|决定|邀请|参与|允许|停靠|支援|赶来|追击|留守|撤离)/;
  const terms = new Set<string>();
  for (const raw of sources) {
    const cleaned = normalizeText(raw);
    if (!cleaned) continue;
    for (const part of cleaned.split(/[，,、；;：:]+/)) {
      const chunks: string[] = [];
      let rest = part;
      let guard = 0;
      while (rest.length >= 2 && guard < 8) {
        guard += 1;
        const match = rest.match(/^(.{2,12}?)(?=(?:已|为|的|在|与|和|及|并|后|前|由|被|将|正|仍|按|从|向|到|获得|完成|抵达|进入|成为|建立|确认|加入|返回|前往|离开|携带|通过|启动|打开|关闭|封锁|授予|接收|击败|镇压|封印|平息|接管|升格|解锁|掌握|正式|成功|安全|重新|暂时|继续|决定|邀请|参与|允许|停靠|支援|赶来|追击|留守|撤离))/);
        if (!match) {
          if (rest.length >= 2) chunks.push(rest);
          break;
        }
        if (match[1].length >= 2) chunks.push(match[1]);
        rest = rest.slice(match[0].length);
      }
      for (const chunk of chunks) {
        if (chunk.length >= 2 && chunk.length <= 12) terms.add(chunk);
        for (let index = 0; index + 4 <= chunk.length; index += 1) {
          terms.add(chunk.slice(index, index + 4));
        }
      }
    }
    void FACT_SPLIT_RE;
  }
  return Array.from(terms);
}

interface LaterProgressionMatch extends EndStateMatch {
  basis: 'later_segment_state' | 'later_segment_location';
  segmentId: string;
  segmentGroup: number;
}

/** 后段事实词 ≥2 命中（逐字保底失败时的宽松路径）：正文实际写到后段多要素才算后段状态建立——
 *  仅提到单个未来词（如「首领决战」）不推进（验收 2b）；实际写到（如「模拟宇宙 + Alpha测试服」）才推进。 */
function laterFactHit(body: string, segment: 剧情编织分段): EndStateMatch | undefined {
  const hit = countCompletionTermHits(body, buildSegmentFactTerms(segment), segment.登场角色 ?? []);
  if (!hit.matched || !hit.firstOffset) return undefined;
  return {
    endState: (laterStateAnchors(segment)[0] ?? segment.标题 ?? ''),
    startOffset: hit.firstOffset.start,
    endOffset: hit.firstOffset.end,
  };
}

/** AI 申报跳段候选：目标分段锚点背书（≥1 个特有锚点，天然排除跨段角色名）→ jump_to 候选。 */
async function buildDeclaredJumpCandidate(params: {
  body: string;
  declaredTarget: string;
  futureSegments: 剧情编织分段[];
  currentUnitId: string;
  currentSegment: 剧情编织分段;
  gameTime: GameTime;
  turnCount: number;
  responseId: string;
  sha256Fingerprint: (text: string) => Promise<string>;
}): Promise<RuntimeFactCandidate | null> {
  const target = params.futureSegments.find((segment) =>
    segment.标题?.includes(params.declaredTarget)
    || String(segment.组号) === params.declaredTarget.replace(/\D/g, '')
    || params.declaredTarget.includes(segment.标题 ?? ''),
  );
  if (!target) return null;
  const endorsement = countAnyCompletionTermHit(params.body, buildCompletionTermPool(target), target.登场角色 ?? []);
  if (!endorsement.hit || !endorsement.offset) return null;
  return {
    candidateId: 'turn_evidence:jump:' + target.id + ':' + params.turnCount,
    eventInstanceId: params.currentUnitId,
    factType: 'unit_completed',
    payload: {
      endState: (params.currentSegment.本段结束状态 ?? [])[0] ?? '',
      jumpTargetSegmentId: target.id,
      jumpTargetSegmentGroup: target.组号,
      declaredJump: true,
    },
    occurredAt: params.gameTime,
    publicScope: { kind: 'private' },
    evidenceRefs: [{
      kind: 'narrative_span',
      responseId: params.responseId,
      messageId: params.responseId,
      bodyFingerprint: await params.sha256Fingerprint(params.body),
      normalizationVersion: 1,
      startOffset: endorsement.offset.start,
      endOffset: endorsement.offset.end,
      textFingerprint: await params.sha256Fingerprint(params.body.slice(endorsement.offset.start, endorsement.offset.end)),
    }],
    evidenceLevel: 'confirmed',
    playerParticipated: true,
    playerObserverVisible: false,
    createdBy: 'player_turn',
  };
}

function normalizedLocation(text: string): string {
  return normalizeText(text).replace(/[·•・/\\|_\-—－（）()【】\[\]]/g, '');
}

function locationsOverlap(left: string, right: string): boolean {
  const a = normalizedLocation(left);
  const b = normalizedLocation(right);
  return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
}

function segmentLocations(segment: 剧情编织分段): string[] {
  return Array.from(new Set([
    ...segment.涉及地点,
    ...segment.地图地点档案.map((item) => item.名称),
  ].map((item) => item.trim()).filter((item) => item.length >= 2)));
}

function laterStateAnchors(segment: 剧情编织分段): string[] {
  return Array.from(new Set([
    ...segment.开局已成立事实,
    ...segment.前段延续事实,
    ...segment.本段结束状态,
    ...segment.关键事件.flatMap((event) => event.事件结果),
  ].map((item) => item.trim()).filter((item) => normalizeText(item).length >= 4)));
}

/**
 * 当前段某次结束语漏判后，只用本回合正文与当前结构化地点恢复：
 * - 正文明示后续段已经成立的状态；或
 * - 结构化地点与正文同时落在当前段未包含、后续段才出现的地点。
 * 这里只证明“当前段已经过去”，最终仍由裁决器一次推进一格。
 */
function findLaterProgressionMatch(params: {
  body: string;
  currentLocation?: string;
  currentSegment: 剧情编织分段;
  futureSegments: 剧情编织分段[];
}): LaterProgressionMatch | undefined {
  const futureSegments = params.futureSegments
    .filter((segment) => segment.组号 > params.currentSegment.组号
      && segment.启用注入 !== false
      && segment.处理状态 === '已完成')
    .sort((a, b) => a.组号 - b.组号);

  // 后段匹配按组号升序遍历，收集所有命中段（正文可能同时命中多个后段要素），
  // 由调用方决定推进一格还是跳段（命中最高组号且组号差 >1 → 正文证据驱动的跳段）。
  const matches: LaterProgressionMatch[] = [];
  for (const segment of futureSegments) {
    // 逐字保底 + 后段事实词 ≥2 命中（正文实际写到后段多要素才建立后段状态；
    // 仅提到单个未来词不推进——验收 2b）。
    const stateMatch = findEndStateMatch(params.body, laterStateAnchors(segment))
      ?? laterFactHit(params.body, segment);
    if (stateMatch) {
      matches.push({
        ...stateMatch,
        basis: 'later_segment_state',
        segmentId: segment.id,
        segmentGroup: segment.组号,
      });
    }
  }

  const currentLocation = params.currentLocation?.trim();
  if (!currentLocation) return undefined;
  const currentLocations = segmentLocations(params.currentSegment);
  // 地点守卫只挡「纯地点分支」：后段事实词已命中（matches 非空）时不得因当前地点仍在当前段而吞掉推进。
  if (matches.length === 0 && currentLocations.some((location) => locationsOverlap(location, currentLocation))) return undefined;

  for (const segment of futureSegments) {
    if (matches.some((match) => match.segmentId === segment.id)) continue;
    const futureLocation = segmentLocations(segment)
      .find((location) => locationsOverlap(location, currentLocation));
    if (!futureLocation) continue;
    const bodyLocationCandidates = Array.from(new Set([
      futureLocation,
      currentLocation,
      ...currentLocation.split(/[·•・/\\|_\-—－]/g),
    ].map((item) => item.trim()).filter((item) => item.length >= 2)));
    const locationMatch = findEndStateMatch(params.body, bodyLocationCandidates);
    if (!locationMatch) continue;
    matches.push({
      ...locationMatch,
      basis: 'later_segment_location',
      segmentId: segment.id,
      segmentGroup: segment.组号,
    });
  }
  if (matches.length === 0) return undefined;
  // 保守取「最近」命中段（最小组号）：正文已写到后段 → 渐进对齐到最近的后段，
  // 避免 4 字窗口同时命中多个后段时跳过头（正文 Alpha 测试不应跳到 Beta/列车段）。
  return matches.sort((a, b) => a.segmentGroup - b.segmentGroup)[0];
}

export function matchEndStateInBody(body: string, endStates: string[]): string | undefined {
  return findEndStateMatch(body, endStates)?.endState;
}

export interface TurnEvidenceBuildResult {
  confirmedEvidence: RuntimeFactCandidate[];
  mentioned: string[];
}

/**
 * 从主剧情正文构建回合证据候选（计划 §6 R2 步骤 2）：
 * - 命中当前分段明确结束状态 → confirmed narrative_span 候选（payload 带 endState，裁决器按 4.2.4 判定）；
 * - 当前结束语曾漏判，但本回合明确建立后续段状态，或正文与结构化地点共同证明已在后段 → 只结算当前段；
 * - 单纯提及当前段关键事件/未来单元 → 仅 mentioned（无证据引用，绝不推进）；
 * - 人物、地点、标题、动作词本身永不单独成为完成证据。
 */
export async function buildTurnEvidence(params: {
  body: string;
  currentSegment: 剧情编织分段;
  futureSegments?: 剧情编织分段[];
  currentLocation?: string;
  projection: StoryWeavingRuntimeProjection;
  gameTime: GameTime;
  turnCount: number;
  responseId: string;
  /** AI 剧情推进申报（《剧情规划》内 <剧情推进> 子块）：completed 需正文背书，targetSegment 触发跳段候选。 */
  storyAdvance?: { completed: boolean; targetSegment?: string; basis?: string };
}): Promise<TurnEvidenceBuildResult> {
  const { body, currentSegment, projection, gameTime, turnCount, responseId } = params;
  const confirmedEvidence: RuntimeFactCandidate[] = [];
  const mentioned: string[] = [];
  const currentUnitId = projection.currentFocus.unitId ?? 'unit:' + currentSegment.id;
  const endStateMatch = findEndStateMatch(body, currentSegment.本段结束状态, {
    completionTerms: buildCompletionTermPool(currentSegment),
    excludeTerms: currentSegment.登场角色 ?? [],
  });
  // AI 申报跳段优先于 laterProgression：申报「进入分段N」且目标分段锚点背书 → jump_to 候选；
  // 申报跳段成功时不生成 laterProgression 的一格推进证据（跳段让位）。
  const declaredTarget = params.storyAdvance?.targetSegment?.trim();
  const declaredJumpCandidate = declaredTarget && !endStateMatch
    ? await buildDeclaredJumpCandidate({ body, declaredTarget, futureSegments: params.futureSegments ?? [], currentUnitId, currentSegment, gameTime, turnCount, responseId, sha256Fingerprint })
    : null;
  const laterProgressionMatch = (endStateMatch || declaredJumpCandidate) ? undefined : findLaterProgressionMatch({
    body,
    currentLocation: params.currentLocation,
    currentSegment,
    futureSegments: params.futureSegments ?? [],
  });
  // laterProgression 命中（含后段事实词 ≥2）→ 本回合建立后续段状态，只结算当前段推进一格
  // （旧验收：旧游标恢复时提到后段只推一格，不跳段；AI 显式申报跳段走 jump_to 候选）。
  const completionMatch = endStateMatch ?? laterProgressionMatch;
  if (completionMatch) {
    const matchedText = body.slice(completionMatch.startOffset, completionMatch.endOffset);
    const payload: Record<string, JsonValue> = endStateMatch
      ? { endState: endStateMatch.endState }
      : {
          progressionBasis: laterProgressionMatch!.basis,
          currentSegmentId: currentSegment.id,
          impliedBySegmentId: laterProgressionMatch!.segmentId,
          impliedBySegmentGroup: laterProgressionMatch!.segmentGroup,
          matchedAnchor: laterProgressionMatch!.endState,
        };
    confirmedEvidence.push({
      candidateId: 'turn_evidence:' + currentUnitId + ':' + turnCount,
      eventInstanceId: currentUnitId,
      factType: 'unit_completed',
      payload,
      occurredAt: gameTime,
      publicScope: { kind: 'private' },
      evidenceRefs: [{
        kind: 'narrative_span',
        responseId,
        messageId: responseId,
        bodyFingerprint: await sha256Fingerprint(body),
        normalizationVersion: 1,
        startOffset: completionMatch.startOffset,
        endOffset: completionMatch.endOffset,
        textFingerprint: await sha256Fingerprint(matchedText),
      }],
      evidenceLevel: 'confirmed',
      playerParticipated: true,
      playerObserverVisible: false,
      createdBy: 'player_turn',
    });
  }
  const currentTerms = [
    ...currentSegment.关键事件.map((event) => event.事件名),
    ...currentSegment.关键事件.flatMap((event) => event.事件结果),
    ...currentSegment.登场角色,
    ...currentSegment.涉及地点,
  ].map((item) => item.trim()).filter((item) => item.length >= 2);

  // 方案A：AI 申报「完成」→ 正文背书校验（命中当前分段任一完成要素）→ 视为完成证据。
  if (params.storyAdvance?.completed === true && !completionMatch) {
    const endorsement = countCompletionTermHits(body, buildCompletionTermPool(currentSegment), currentSegment.登场角色 ?? []);
    if (endorsement.matched && endorsement.firstOffset) {
      const matchedText = body.slice(endorsement.firstOffset.start, endorsement.firstOffset.end);
      confirmedEvidence.push({
        candidateId: 'turn_evidence:' + currentUnitId + ':' + turnCount + ':declared',
        eventInstanceId: currentUnitId,
        factType: 'unit_completed',
        payload: { endState: (currentSegment.本段结束状态 ?? [])[0] ?? '', declaredCompletion: true },
        occurredAt: gameTime,
        publicScope: { kind: 'private' },
        evidenceRefs: [{
          kind: 'narrative_span',
          responseId,
          messageId: responseId,
          bodyFingerprint: await sha256Fingerprint(body),
          normalizationVersion: 1,
          startOffset: endorsement.firstOffset.start,
          endOffset: endorsement.firstOffset.end,
          textFingerprint: await sha256Fingerprint(matchedText),
        }],
        evidenceLevel: 'confirmed',
        playerParticipated: true,
        playerObserverVisible: false,
        createdBy: 'player_turn',
      });
    }
  }

  // 申报跳段候选（已在前面优先计算，declaredJumpCandidate 非空时直接并入证据）。
  if (declaredJumpCandidate) {
    confirmedEvidence.push(declaredJumpCandidate);
  }
  for (const term of currentTerms) {
    if (body.includes(term)) mentioned.push(term);
  }
  for (const unit of [...projection.scheduledUnits, ...projection.activeUnits]) {
    if (unit.unitId !== currentUnitId && unit.title && body.includes(unit.title)) {
      mentioned.push(unit.title);
    }
  }
  return {
    confirmedEvidence,
    mentioned: Array.from(new Set(mentioned)).slice(0, 12),
  };
}

export interface WorldEvolutionStepParams {
  /** 世界演变 API 配置；null 表示不可用（走 skipped/failed，正式世界不变）。 */
  config: API配置项 | null;
  events: WorldEventInstance[];
  dueInstanceIds: string[];
  /** <动态世界> 线索（只作输入，不直接生成事实）。 */
  dynamicWorldClues: string[];
  /** 旧 世界.全局事件 字符串（legacy label，不作为事实）。 */
  legacyLabels: string[];
  gameTime: GameTime;
  runtimeRevision: number;
  signal?: AbortSignal;
  /** 测试注入：替代真实 API 调用。 */
  callModel?: (config: API配置项, prompt: string) => Promise<string>;
}

export interface WorldEvolutionStepResult {
  ok: boolean;
  candidates: WorldEvolutionCandidate[];
  skipped?: boolean;
  failureReason?: string;
  rawPrompt?: string;
}

const WORLD_EVOLUTION_PROMPT = (params: {
  gameTime: GameTime;
  dueEvents: WorldEventInstance[];
  clues: string[];
  legacyLabels: string[];
}): string => {
  const dueLines = params.dueEvents.length
    ? params.dueEvents.map((event) => `- ${event.eventInstanceId}（${event.eventDefinitionId}，status=${event.status}，dueAt=${event.dueAt?.dayOrdinal ?? '?'}:${event.dueAt?.minuteOfDay ?? '?'}）`)
    : ['- 无'];
  return [
    '你是世界演变引擎：只判断「后台世界实际发生了什么」，不写玩家线。',
    '输入：当前游戏时间、到期待结算事件、<动态世界> 线索、旧字符串。',
    '规则：',
    '- 旧字符串只是兼容显示线索，不是已发生事实，不得据此结算任何事件。',
    '- 不得生成玩家参与、玩家知情或玩家功劳；你只裁决世界线。',
    '- 对到期事件可以给出 resolve（后台结算）或 supersede（被取代），也可以保持待结算。',
    '- 只能输出 JSON：{"candidates": [{"eventInstanceId":"...","action":"resolve|supersede|transition|create_instance","toStatus":"resolved|superseded|active|cancelled","resolutionMode":"world_background","outcome":"normal|deviated|failed","facts":[{"factType":"...","payload":{...}}],"note":"一句话说明"}]}',
    '- 没有可裁决内容时输出 {"candidates": []}，不要编造事件。',
    '',
    `当前游戏时间：dayOrdinal=${params.gameTime.dayOrdinal}, minuteOfDay=${params.gameTime.minuteOfDay}`,
    '到期待结算事件：',
    dueLines.join('\n'),
    params.clues.length ? `<动态世界> 线索（只作参考）：\n${params.clues.slice(0, 8).map((clue) => '- ' + clue).join('\n')}` : '<动态世界> 线索：无',
    params.legacyLabels.length ? `旧字符串（不得作为事实）：${params.legacyLabels.slice(0, 6).join('、')}` : '旧字符串：无',
  ].join('\n');
};

/**
 * 执行独立世界演变（只产生候选）：
 * - 无到期事件且无线索 → skipped（不调用 API）；
 * - 无可用 API 配置 → failed（正式世界不变，记录原因）；
 * - API 异常/返回非法 JSON → failed（正式世界不变，记录原因）；
 * - 成功 → 返回候选列表（未应用；由 worldEvolutionAdjudicator 校验后应用到内存模拟）。
 */
export async function runWorldEvolutionStep(params: WorldEvolutionStepParams): Promise<WorldEvolutionStepResult> {
  const dueEvents = params.events.filter((event) => params.dueInstanceIds.includes(event.eventInstanceId));
  const clues = (params.dynamicWorldClues ?? []).filter((clue) => typeof clue === 'string' && clue.trim()).slice(0, 8);
  const legacy = (params.legacyLabels ?? []).filter((label) => typeof label === 'string' && label.trim()).slice(0, 6);
  if (dueEvents.length === 0 && clues.length === 0) {
    return { ok: true, candidates: [], skipped: true };
  }
  if (!params.config) {
    return { ok: false, candidates: [], failureReason: '世界演变 API 未配置，正式世界保持不变，到期事件保持待结算。' };
  }
  const prompt = WORLD_EVOLUTION_PROMPT({ gameTime: params.gameTime, dueEvents, clues, legacyLabels: legacy });
  try {
    const raw = params.callModel
      ? await params.callModel(params.config, prompt)
      : await chatCompletionNonStream(params.config, {
          systemPrompt: '你是世界演变引擎，只输出 JSON，不输出其他内容。',
          messages: [{ role: 'user', content: prompt }],
          maxTokens: params.config.maxTokens ?? 2048,
          temperature: 0.2,
          signal: params.signal,
        } satisfies ChatCompletionRequest);
    const parsed = parseWorldEvolutionResponse(raw);
    if (!parsed) {
      return { ok: false, candidates: [], failureReason: '世界演变 API 返回无法解析的候选 JSON，整体拒绝，正式世界保持不变。', rawPrompt: prompt };
    }
    return { ok: true, candidates: parsed, rawPrompt: prompt };
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError'
      ? '世界演变调用被中止，未产生任何世界变更。'
      : `世界演变 API 失败（${err instanceof Error ? err.message : String(err)}），正式世界保持不变，到期事件保持待结算。`;
    return { ok: false, candidates: [], failureReason: reason, rawPrompt: prompt };
  }
}

/** 解析世界演变响应：支持裸数组或 {candidates:[...]}；结构非法返回 null（整体拒绝）。 */
export function parseWorldEvolutionResponse(raw: string): WorldEvolutionCandidate[] | null {
  if (!raw || typeof raw !== 'string') return null;
  const candidate = extractJsonLikeText(raw, 'object');
  if (!candidate) return null;
  try {
    const parsed = parseJsonWithRepair<unknown>(candidate, 'object');
    const list = Array.isArray(parsed) ? parsed : (parsed as { candidates?: unknown }).candidates;
    if (!Array.isArray(list)) return null;
    const candidates: WorldEvolutionCandidate[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const rawItem = item as Record<string, unknown>;
      if (typeof rawItem.eventInstanceId !== 'string' || typeof rawItem.action !== 'string') return null;
      candidates.push({
        candidateId: typeof rawItem.candidateId === 'string' ? rawItem.candidateId : 'world_cand:' + rawItem.eventInstanceId + ':' + candidates.length,
        eventInstanceId: rawItem.eventInstanceId,
        action: rawItem.action as WorldEvolutionCandidate['action'],
        toStatus: typeof rawItem.toStatus === 'string' ? rawItem.toStatus as WorldEvolutionCandidate['toStatus'] : undefined,
        resolutionMode: typeof rawItem.resolutionMode === 'string' ? rawItem.resolutionMode as WorldEvolutionCandidate['resolutionMode'] : undefined,
        outcome: typeof rawItem.outcome === 'string' ? rawItem.outcome as WorldEvolutionCandidate['outcome'] : undefined,
        facts: Array.isArray(rawItem.facts)
          ? rawItem.facts
              .filter((fact): fact is { factType: string; payload?: Record<string, unknown> } => Boolean(fact && typeof fact === 'object' && typeof (fact as { factType?: unknown }).factType === 'string'))
              .map((fact) => ({
                factType: fact.factType,
                payload: (fact.payload ?? {}) as Record<string, JsonValue>,
              }))
          : [],
        note: typeof rawItem.note === 'string' ? rawItem.note : undefined,
      });
    }
    return candidates;
  } catch {
    return null;
  }
}
