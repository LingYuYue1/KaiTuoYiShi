// R1 剧情编织运行时适配器（2026-08-09 计划 §6 R1）。
// 只消费现有剧情编织资产（models/storyWeaving），不新建资产体系、不修改任何已有状态、不写任何事实。
// - 当前分段 → 当前焦点 StoryFocus + 当前情节单元（沿用分段既有稳定 id）；
// - 当前分段关键事件 → active 情节单元（派生稳定 id = 分段 id + 事件序号，确定性）；
// - 下一分段关键事件 → scheduled 世界事件投影；旧文本时间锚点只保留原文，R2 再映射到真实 GameTime；
// - 旧 `世界.全局事件` 字符串 → 只映射为 legacy label，绝不生成已发生事实或事件实例；
// - 旧历史归档 → 只映射为终态提示，不伪造过去事实；
// - 更远未来分段（组号 > 当前+1）→ 完全排除在普通回合候选集合之外。
import type { GameTime, StoryFocus, StoryFocusStatus, WorldEventInstance } from '../../models/storyRuntime';
import type { 剧情编织分段, 剧情编织系列, 剧情编织系统, 剧情编织历史归档 } from '../../models/storyWeaving';

/** 情节单元（R1 内部 DTO：玩家线运行输入，不入冻结领域 schema）。 */
export interface StoryUnit {
  unitId: string;
  segmentId: string;
  segmentGroup: number;
  title: string;
  kind: 'current' | 'key_event' | 'future_scheduled';
  status: 'active' | 'scheduled';
  endStates: string[];
  /** 剧情编织中的旧文本时间锚点；不是 GameTime，不参与到期扫描。 */
  timelineAnchor?: string;
  dueAt?: GameTime;
  eventDefinitionId: string;
}

/** 旧历史归档映射的终态提示（只作提示，不伪造过去事实）。 */
export interface TerminalUnitHint {
  unitId: string;
  label: string;
  archivedStatus: string;
}

/** 适配器输出：玩家线 + 世界线运行输入投影。 */
export interface StoryWeavingRuntimeProjection {
  currentFocus: StoryFocus;
  currentUnit: StoryUnit;
  /** 当前分段关键事件 → active 情节单元。 */
  activeUnits: StoryUnit[];
  /** 下一分段关键事件 → scheduled 单元（只作世界线，不进入普通玩家推进候选）。 */
  scheduledUnits: StoryUnit[];
  /** scheduledUnits 对应的事件实例投影（status='scheduled'，source=schedule_record 投影，不做完成依据）。 */
  scheduledEventInstances: WorldEventInstance[];
  /** 旧 `世界.全局事件` 字符串 → 只作兼容显示 label，绝不生成已发生事实。 */
  legacyLabels: string[];
  /** 旧历史归档 → 终态提示。 */
  terminalHints: TerminalUnitHint[];
  /** 未来分段（含下一分段整体）的单元 id，普通回合不得作为推进/结算候选。 */
  excludedFutureUnits: string[];
}

/** 稳定 ID 规则：当前分段级单元 = `unit:<分段 id>`（分段 id 即既有稳定 ID）。 */
export function storyUnitIdOfSegment(segment: 剧情编织分段): string {
  return 'unit:' + segment.id;
}

/** 稳定 ID 规则：关键事件单元 = `unit:<分段 id>:event:<序号>`（序号从 1 起，确定性派生）。 */
export function storyUnitIdOfKeyEvent(segment: 剧情编织分段, index: number): string {
  return 'unit:' + segment.id + ':event:' + String(index + 1);
}

/** 事件定义 ID 与单元 ID 一一对应（same-definition 因果关系判定用）。 */
export function storyEventDefinitionIdOfUnit(unitId: string): string {
  return 'definition:' + unitId;
}

const ACTIVE_RUNTIME_STATUSES = new Set<剧情编织分段['运行状态']>(['当前', '未开始']);
const ARCHIVED_RUNTIME_STATUSES = new Set<剧情编织分段['运行状态']>(['已经历', '已跳过', '已偏离', '暂停']);

function focusStatusOfSegment(segment: 剧情编织分段): StoryFocusStatus {
  if (segment.运行状态 === '暂停') return 'blocked';
  if (segment.运行状态 === '已偏离') return 'diverged';
  if (ARCHIVED_RUNTIME_STATUSES.has(segment.运行状态)) return 'completed';
  return 'active';
}

function segmentUnitOf(segment: 剧情编织分段): StoryUnit {
  const unitId = storyUnitIdOfSegment(segment);
  return {
    unitId,
    segmentId: segment.id,
    segmentGroup: segment.组号,
    title: segment.标题,
    kind: 'current',
    status: 'active',
    endStates: segment.本段结束状态.slice(),
    eventDefinitionId: storyEventDefinitionIdOfUnit(unitId),
  };
}

function keyEventUnitOf(segment: 剧情编织分段, index: number): StoryUnit {
  const event = segment.关键事件[index];
  const unitId = storyUnitIdOfKeyEvent(segment, index);
  return {
    unitId,
    segmentId: segment.id,
    segmentGroup: segment.组号,
    title: event.事件名 || segment.标题 + ' 事件' + String(index + 1),
    kind: 'key_event',
    status: 'active',
    endStates: segment.本段结束状态.slice(),
    eventDefinitionId: storyEventDefinitionIdOfUnit(unitId),
  };
}

/**
 * 下一分段关键事件 → scheduled 世界事件投影。
 * 时间线条目标题与事件名一致的锚点优先，其次保留段级时间线起点。
 * 这些锚点是旧文本，R1 不伪造 GameTime/dueAt；R2 接线时由真实游戏时钟转换。
 */
function scheduledUnitOf(segment: 剧情编织分段, index: number): StoryUnit {
  const event = segment.关键事件[index];
  const unitId = storyUnitIdOfKeyEvent(segment, index);
  const matched = segment.时间线.find((entry) => entry.标题.trim() === (event.事件名 || '').trim());
  const timelineAnchor = (matched ? matched.时间锚点 : segment.时间线起点).trim();
  const unit: StoryUnit = {
    unitId,
    segmentId: segment.id,
    segmentGroup: segment.组号,
    title: event.事件名 || segment.标题 + ' 事件' + String(index + 1),
    kind: 'future_scheduled',
    status: 'scheduled',
    endStates: segment.本段结束状态.slice(),
    eventDefinitionId: storyEventDefinitionIdOfUnit(unitId),
  };
  if (timelineAnchor) unit.timelineAnchor = timelineAnchor;
  return unit;
}

function scheduledInstanceOf(unit: StoryUnit): WorldEventInstance {
  return {
    eventInstanceId: unit.unitId,
    eventDefinitionId: unit.eventDefinitionId,
    status: 'scheduled',
    replayPolicy: 'once',
    participantIds: [],
    dependencyIds: [],
    publicFactIds: [],
    idempotencyKey: 'weaving:' + unit.unitId,
    // 排期记录型证据只作为 scheduled 实例的来源说明，不能作为完成/写入依据（计划 §5.5）。
    source: { kind: 'schedule_record', scheduleId: 'weaving:' + unit.unitId, scheduleRevision: 1 },
  };
}

function unitIdsOfSegment(segment: 剧情编织分段): string[] {
  const ids = [storyUnitIdOfSegment(segment)];
  for (let i = 0; i < segment.关键事件.length; i += 1) ids.push(storyUnitIdOfKeyEvent(segment, i));
  return ids;
}

function dedupeStrings(values: string[], maxCount: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= maxCount) break;
  }
  return result;
}

/** 解析当前系列 / 当前分段（镜像 services/storyWeaving.ts 的解析优先级：显式分段 ID → 运行状态「当前」→ 进度组号 → 首个未归档）。 */
export function resolveCurrentWeavingSegment(system?: 剧情编织系统): {
  series: 剧情编织系列;
  currentSegment: 剧情编织分段;
  nextSegment?: 剧情编织分段;
} | null {
  if (!system?.系列列表?.length) return null;
  const series = system.系列列表.find((item) => item.id === system.当前系列ID) ?? system.系列列表[0];
  if (!series || series.激活注入 === false) return null;
  const completed = series.分段列表
    .filter((segment) => segment.启用注入 !== false && segment.处理状态 === '已完成')
    .sort((a, b) => a.组号 - b.组号);
  if (!completed.length) return null;
  const anchorId = system.当前进度?.当前分段ID;
  const anchorGroup = Number(system.当前进度?.当前分段组号) || series.当前分段组号;
  const currentSegment =
    completed.find((segment) => segment.id === anchorId && !ARCHIVED_RUNTIME_STATUSES.has(segment.运行状态))
    ?? completed.find((segment) => segment.运行状态 === '当前')
    ?? completed.find((segment) => segment.组号 === anchorGroup && !ARCHIVED_RUNTIME_STATUSES.has(segment.运行状态))
    ?? completed.find((segment) => segment.组号 > anchorGroup && !ARCHIVED_RUNTIME_STATUSES.has(segment.运行状态));
  if (!currentSegment) return null;
  const nextSegment = completed.find((segment) => segment.组号 === currentSegment.组号 + 1);
  return nextSegment
    ? { series, currentSegment, nextSegment }
    : { series, currentSegment };
}

/**
 * 构建剧情编织 → 运行时投影。
 * currentSegment 显式传入时优先；否则从 system 解析（见 resolveCurrentWeavingSegment）。
 * series 存在时用于 focusId 与未来分段排除；没有 system 时仍可用显式 currentSegment/nextSegment 构建。
 */
export function buildStoryWeavingRuntimeProjection(input: {
  system?: 剧情编织系统;
  currentSegment?: 剧情编织分段;
  nextSegment?: 剧情编织分段;
  legacyWorldEventStrings?: string[];
  historyArchives?: 剧情编织历史归档[];
  enteredAtRevision?: number;
}): StoryWeavingRuntimeProjection | null {
  const series = (input.system?.系列列表 ?? []).find((item) => item.id === input.system?.当前系列ID)
    ?? (input.system?.系列列表 ?? [])[0];
  let currentSegment = input.currentSegment;
  let nextSegment = input.nextSegment;
  if (!currentSegment) {
    const resolved = resolveCurrentWeavingSegment(input.system);
    if (!resolved) return null;
    currentSegment = resolved.currentSegment;
    nextSegment = resolved.nextSegment;
  }
  if (!nextSegment && series) {
    nextSegment = series.分段列表.find((segment) => segment.组号 === currentSegment.组号 + 1);
  }

  const currentUnit = segmentUnitOf(currentSegment);
  const activeUnits = currentSegment.关键事件.map((_, index) => keyEventUnitOf(currentSegment, index));
  const scheduledUnits = nextSegment ? nextSegment.关键事件.map((_, index) => scheduledUnitOf(nextSegment, index)) : [];
  const scheduledEventInstances = scheduledUnits.map(scheduledInstanceOf);

  // 未来分段（含下一分段整体）的单元一律排除在普通回合候选集合之外。
  const excludedFutureUnits: string[] = [];
  if (series) {
    for (const segment of series.分段列表) {
      if (segment.组号 <= currentSegment.组号) continue;
      if (segment.启用注入 === false || segment.处理状态 !== '已完成') continue;
      excludedFutureUnits.push(...unitIdsOfSegment(segment));
    }
  } else if (nextSegment) {
    excludedFutureUnits.push(...unitIdsOfSegment(nextSegment));
  }

  // 旧 世界.全局事件 字符串 → 只作 legacy label，不生成任何实例或事实。
  const legacyLabels = dedupeStrings(input.legacyWorldEventStrings ?? [], 50);

  const terminalHints: TerminalUnitHint[] = (input.historyArchives ?? [])
    .filter((archive) => archive && typeof archive.id === 'string' && archive.id)
    .slice(0, 30)
    .map((archive) => ({
      unitId: 'archive:' + archive.id,
      label: [archive.分段标题, archive.摘要].filter(Boolean).join('｜'),
      archivedStatus: archive.归档状态,
    }));

  return {
    currentFocus: {
      focusId: series ? 'focus:' + series.id + ':' + currentSegment.id : 'focus:' + currentSegment.id,
      trackId: series?.id,
      unitId: currentUnit.unitId,
      status: focusStatusOfSegment(currentSegment),
      reasonCodes: ['story_weaving:segment:' + currentSegment.运行状态],
      enteredAtRevision: input.enteredAtRevision ?? 0,
    },
    currentUnit,
    activeUnits,
    scheduledUnits,
    scheduledEventInstances,
    legacyLabels,
    terminalHints,
    excludedFutureUnits,
  };
}
