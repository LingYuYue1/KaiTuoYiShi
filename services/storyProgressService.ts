import type { 剧情编织分段, 剧情编织进度锚点, 剧情编织系列, 剧情编织系统, 剧情编织历史归档 } from '@/models/storyWeaving';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import type { 剧情编织门禁快照 } from '@/services/storyWeaving';

/** 与 R1 适配器（services/storyRuntime/storyWeavingRuntimeAdapter.storyUnitIdOfSegment）一致的稳定单元 ID 规则。 */
function storyUnitIdOfSegment(segment: 剧情编织分段): string {
  return 'unit:' + segment.id;
}

export function getCurrentStoryChapterLabel(system: 剧情编织系统): string {
  const normalized = 归一化剧情编织系统(system);
  const series = getActiveSeries(normalized);
  if (!series || series.激活注入 === false) return '';
  const current = getCurrentSegment(series, normalized.当前进度);
  if (!current) return `${series.标题} · 未选择章节`;
  const chapter = current.章节标题?.length ? current.章节标题.join(' / ') : current.标题;
  return `${series.标题} · ${chapter}`;
}

export type 联合裁决决策 = 'stay' | 'advance_one' | 'resolve_early' | 'deviate' | 'pause' | 'jump_to';

export interface 剧情编织推进诊断 {
  /** 归一化后的原系统；诊断绝不修改运行状态或进度锚点。 */
  system: 剧情编织系统;
  wouldProgress: boolean;
  targetSegmentId?: string;
  reasons: string[];
  completionScore: number;
  evidenceTurns: number;
}

/**
 * 只读诊断（R2）：按旧关键词评分规则计算「是否建议推进、目标分段、理由」，但绝不写入。
 * 普通回合不再由 autoAlignCanonStoryProgress 修改剧情进度；真实推进只来自联合裁决回执。
 */
export function diagnoseCanonStoryProgress(params: {
  storyWeaving: 剧情编织系统;
  turnCount: number;
  body: string;
  userInput: string;
  currentLocation?: string;
  gateSnapshot?: 剧情编织门禁快照 | null;
}): 剧情编织推进诊断 {
  const normalized = 归一化剧情编织系统(params.storyWeaving);
  const series = getActiveSeries(normalized);
  if (!series || series.激活注入 === false) {
    return { system: normalized, wouldProgress: false, reasons: ['剧情编织未启用或缺少激活系列'], completionScore: 0, evidenceTurns: 0 };
  }
  const segments = [...series.分段列表]
    .filter((segment) => segment.启用注入 !== false && segment.处理状态 === '已完成')
    .sort((a, b) => a.组号 - b.组号);
  const rawCurrent = getCurrentSegment(series, normalized.当前进度);
  if (rawCurrent && ['已经历', '已跳过', '已偏离', '暂停'].includes(rawCurrent.运行状态)) {
    const next = segments.find((segment) => segment.组号 > rawCurrent.组号 && segment.运行状态 === '未开始');
    if (next) {
      return {
        system: normalized,
        wouldProgress: true,
        targetSegmentId: next.id,
        reasons: [`后台发现锚点分段「${rawCurrent.标题}」已归档，建议迁移到下一分段「${next.标题}」`],
        completionScore: 0,
        evidenceTurns: 0,
      };
    }
  }
  const current = rawCurrent;
  if (!current || current.处理状态 !== '已完成') {
    return { system: normalized, wouldProgress: false, reasons: ['当前分段未完成分解或不存在'], completionScore: 0, evidenceTurns: 0 };
  }

  const source = `${params.currentLocation ?? ''}\n${params.userInput}\n${params.body}`;
  const crossSeries = params.turnCount >= 4 ? findCrossSeriesCanonAlignment(normalized, series, current, source) : null;
  if (crossSeries) {
    return {
      system: normalized,
      wouldProgress: true,
      targetSegmentId: crossSeries.segment.id,
      reasons: crossSeries.reasons,
      completionScore: 0,
      evidenceTurns: 0,
    };
  }

  const candidates = segments.filter((segment) =>
    segment.组号 >= current.组号 && segment.组号 <= current.组号 + 4 && !['已跳过', '已偏离', '暂停'].includes(segment.运行状态),
  );
  const scored = candidates
    .map((segment) => ({ segment, score: scoreSegmentPresence(segment, source) }))
    .sort((a, b) => b.score.value - a.score.value || b.segment.组号 - a.segment.组号);
  const best = scored[0];
  const currentScore = scored.find((item) => item.segment.id === current.id)?.score.value ?? 0;
  const completionScore = scoreCompletionSignals(current, source);
  const progressEvidence = scoreProgressEvidence(current, source, params.gateSnapshot, completionScore);
  const evidenceState = buildProgressEvidenceState({
    previous: normalized.当前进度,
    current,
    turnCount: params.turnCount,
    evidence: progressEvidence,
  });
  const alignmentDecision = decideSegmentAlignment({
    series,
    current,
    best,
    currentScore,
    source,
    completionScore,
    evidenceState,
  });
  if (alignmentDecision.allow && alignmentDecision.target) {
    return {
      system: normalized,
      wouldProgress: true,
      targetSegmentId: alignmentDecision.target.segment.id,
      reasons: alignmentDecision.reasons,
      completionScore: completionScore.value,
      evidenceTurns: evidenceState.consecutive,
    };
  }
  if (completionScore.value >= 3 && completionScore.explicitEnding) {
    return {
      system: normalized,
      wouldProgress: true,
      reasons: completionScore.reasons.length ? completionScore.reasons : ['后台判定当前分段已达到结束状态'],
      completionScore: completionScore.value,
      evidenceTurns: evidenceState.consecutive,
    };
  }
  if (evidenceState.consecutive >= 2 && progressEvidence.valid) {
    return {
      system: normalized,
      wouldProgress: true,
      reasons: [`连续 ${evidenceState.consecutive} 回合出现有效推进证据，旧规则建议归档`, ...progressEvidence.reasons],
      completionScore: completionScore.value,
      evidenceTurns: evidenceState.consecutive,
    };
  }
  return {
    system: normalized,
    wouldProgress: false,
    reasons: buildNoProgressReasons({
      best,
      currentScore,
      completionScore,
      alignmentReasons: alignmentDecision.reasons,
      progressEvidence,
      evidenceState,
    }),
    completionScore: completionScore.value,
    evidenceTurns: evidenceState.consecutive,
  };
}

/**
 * 兼容 helper（R2 起只读）：保留签名与归一化，不再修改剧情进度。
 * 普通回合的真实推进只来自联合裁决回执（applyAdjudicatedStoryProgress）。
 */
export function autoAlignCanonStoryProgress(params: {
  storyWeaving: 剧情编织系统;
  turnCount: number;
  body: string;
  userInput: string;
  currentLocation?: string;
  gateSnapshot?: 剧情编织门禁快照 | null;
}): { system: 剧情编织系统; changed: boolean; progressed: boolean } {
  return {
    system: 归一化剧情编织系统(params.storyWeaving),
    changed: false,
    progressed: false,
  };
}

/**
 * 按联合裁决回执推进剧情编织（R2 唯一正式推进入口）：
 * - 归档锚点自愈：当前分段已归档（已经历/已跳过/已偏离/暂停）时迁移到下一分段——这是状态一致性修复，
 *   不是正文推进（decision 保持原值，仅修复进度锚点指向）；
 * - advance_one：当前分段归档为「已经历」，下一未开始分段进入「当前」，一次推进一格；
 * - stay / resolve_early / deviate / pause：不修改任何分段运行状态与进度锚点（玩家焦点不移动）。
 */
export function applyAdjudicatedStoryProgress(params: {
  storyWeaving: 剧情编织系统;
  turnCount: number;
  decision: 联合裁决决策;
  completedUnitIds: string[];
  reasons: string[];
  /** jump_to 目标分段（AI 申报 + 正文背书）。 */
  targetSegmentId?: string;
}): { system: 剧情编织系统; changed: boolean } {
  const normalized = 归一化剧情编织系统(params.storyWeaving);
  // 归一化层既有行为：输入锚点已归档时，归一化会自愈到当前运行段（归档锚点自愈，非正文推进）。
  const inputAnchorId = params.storyWeaving.当前进度?.当前分段ID;
  const normalizedAnchorId = normalized.当前进度?.当前分段ID;
  const anchorHealed = Boolean(inputAnchorId && normalizedAnchorId && inputAnchorId !== normalizedAnchorId);
  const series = getActiveSeries(normalized);
  if (!series || series.激活注入 === false) {
    return { system: normalized, changed: anchorHealed };
  }
  const segments = [...series.分段列表]
    .filter((segment) => segment.启用注入 !== false && segment.处理状态 === '已完成')
    .sort((a, b) => a.组号 - b.组号);
  const current = getCurrentSegment(series, normalized.当前进度);
  // 显式自愈兜底：归一化未覆盖的归档锚点（当前段仍是归档状态）时迁移到下一分段。
  if (current && ['已经历', '已跳过', '已偏离', '暂停'].includes(current.运行状态)) {
    const next = segments.find((segment) => segment.组号 > current.组号 && segment.运行状态 === '未开始');
    if (next) {
      const nextSeries: 剧情编织系列 = {
        ...series,
        当前分段组号: next.组号,
        分段列表: series.分段列表.map((segment) =>
          segment.id === next.id
            ? { ...segment, 运行状态: '当前' as const, updatedAt: Date.now() }
            : segment,
        ),
        updatedAt: Date.now(),
      };
      const nextSystem = 归一化剧情编织系统({
        ...normalized,
        当前系列ID: series.id,
        系列列表: normalized.系列列表.map((item) => item.id === series.id ? nextSeries : item),
        当前进度: buildProgressAnchor({
          previous: normalized.当前进度,
          series,
          current: next,
          completedSegment: current.运行状态 === '已经历' ? current : undefined,
          turnCount: params.turnCount,
          reasons: [`后台发现锚点分段「${current.标题}」已归档，自动迁移到下一分段`],
          switchNote: `归档锚点自动迁移到「${next.标题}」`,
        }),
      });
      return { system: nextSystem, changed: true };
    }
  }
  // 跳段对齐：AI 申报「进入分段N」且正文背书目标分段要素 → 直接对齐目标分段，
  // 中间分段（当前之后、目标之前）标记已跳过，目标分段标记当前。
  if (params.decision === 'jump_to' && params.targetSegmentId && current) {
    const target = segments.find((segment) =>
      segment.id === params.targetSegmentId && segment.组号 > current.组号 && segment.运行状态 === '未开始',
    );
    if (target) {
      const nextSeries: 剧情编织系列 = {
        ...series,
        当前分段组号: target.组号,
        分段列表: series.分段列表.map((segment) => {
          if (segment.id === target.id) return { ...segment, 运行状态: '当前' as const, updatedAt: Date.now() };
          if (segment.id === current.id) return { ...segment, 运行状态: '已经历' as const, updatedAt: Date.now() };
          if (segment.组号 > current.组号 && segment.组号 < target.组号 && segment.运行状态 === '未开始') {
            return { ...segment, 运行状态: '已跳过' as const, updatedAt: Date.now() };
          }
          return segment;
        }),
        updatedAt: Date.now(),
      };
      const nextSystem = 归一化剧情编织系统({
        ...normalized,
        当前系列ID: series.id,
        系列列表: normalized.系列列表.map((item) => item.id === series.id ? nextSeries : item),
        当前进度: buildProgressAnchor({
          previous: normalized.当前进度,
          series,
          current: target,
          completedSegment: current,
          turnCount: params.turnCount,
          reasons: params.reasons.length ? params.reasons : ['AI 申报跳段对齐到目标分段'],
          switchNote: `跳段对齐到「${target.标题 || `第 ${target.组号} 段`}」`,
        }),
      });
      return { system: nextSystem, changed: true };
    }
  }
  if (params.decision !== 'advance_one') {
    return { system: normalized, changed: anchorHealed };
  }
  if (!current) return { system: normalized, changed: anchorHealed };
  const currentUnitId = storyUnitIdOfSegment(current);
  if (!params.completedUnitIds.includes(currentUnitId)) {
    return { system: normalized, changed: anchorHealed };
  }
  const next = segments.find((segment) => segment.组号 > current.组号 && segment.运行状态 === '未开始');
  const settled = settleCurrentSegment({
    normalized,
    series,
    current,
    next,
    turnCount: params.turnCount,
    reasons: params.reasons.length ? params.reasons : ['联合裁决：当前单元有明确完成证据，推进一格'],
    mode: next ? 'advance' : 'complete',
    gateSnapshot: undefined,
  });
  return { system: settled, changed: true };
}

function getActiveSeries(system: 剧情编织系统): 剧情编织系列 | undefined {
  return system.系列列表.find((item) => item.id === system.当前系列ID)
    ?? system.系列列表.find((item) => item.激活注入 !== false);
}

function getCurrentSegment(series: 剧情编织系列, anchor?: 剧情编织进度锚点): 剧情编织分段 | undefined {
  return series.分段列表.find((segment) => segment.id === anchor?.当前分段ID)
    ?? series.分段列表.find((segment) => segment.组号 === anchor?.当前分段组号 && segment.运行状态 === '当前')
    ?? series.分段列表.find((segment) => segment.组号 === series.当前分段组号 && segment.运行状态 === '当前')
    ?? series.分段列表.find((segment) => segment.组号 === series.当前分段组号)
    ?? series.分段列表.find((segment) => segment.运行状态 === '当前');
}

function findCrossSeriesCanonAlignment(
  system: 剧情编织系统,
  activeSeries: 剧情编织系列,
  activeCurrent: 剧情编织分段,
  source: string,
): { series: 剧情编织系列; segment: 剧情编织分段; reasons: string[] } | null {
  if (activeSeries.来源类型 !== 'canon') return null;
  const activeScore = scoreCanonSeriesPresence(activeSeries, source);
  const candidates = system.系列列表
    .filter((series) =>
      series.id !== activeSeries.id &&
      series.来源类型 === 'canon' &&
      series.激活注入 !== false &&
      !isSideCanonSeries(series)
    )
    .map((series) => {
      const score = scoreCanonSeriesPresence(series, source);
      const completedSegments = series.分段列表
        .filter((segment) => segment.启用注入 !== false && segment.处理状态 === '已完成')
        .sort((a, b) => a.组号 - b.组号);
      const segmentScores = completedSegments
        .map((segment) => ({ segment, score: scoreSegmentPresence(segment, source) }))
        .sort((a, b) => b.score.value - a.score.value || a.segment.组号 - b.segment.组号);
      const bestSegment = segmentScores[0]?.score.value >= 4 ? segmentScores[0].segment : completedSegments[0];
      return { series, score, bestSegment };
    })
    .filter((item): item is { series: 剧情编织系列; score: { value: number; reasons: string[] }; bestSegment: 剧情编织分段 } => Boolean(item.bestSegment))
    .sort((a, b) => b.score.value - a.score.value);
  const best = candidates[0];
  if (!best || best.score.value < 8 || best.score.value - activeScore.value < 4) return null;
  const strongWorldShift = hasStrongCrossSeriesWorldShift(source, best.series);
  if (!strongWorldShift) return null;
  return {
    series: best.series,
    segment: best.bestSegment,
    reasons: uniqueText([
      `跨系列纠偏：近期正文/地点强命中「${best.series.标题}」`,
      `原锚点「${activeSeries.标题} / ${activeCurrent.标题}」与当前上下文不匹配`,
      ...best.score.reasons,
    ], 8),
  };
}

function isSideCanonSeries(series: 剧情编织系列): boolean {
  const text = `${series.id}\n${series.标题}\n${series.作品名 ?? ''}`;
  return /(^|_)side_|【支线】|支线/.test(text);
}

function hasStrongCrossSeriesWorldShift(source: string, targetSeries: 剧情编织系列): boolean {
  const normalizedSource = normalizeText(source);
  const targetText = normalizeText([
    targetSeries.id,
    targetSeries.标题,
    targetSeries.作品名,
    targetSeries.涉及地点索引.join(' '),
    targetSeries.涉及派系索引.join(' '),
  ].join(' '));
  const worldSignals = [
    { target: /jarilo|雅利洛|贝洛伯格|银鬃铁卫|下层区|地火/i, source: /雅利洛|贝洛伯格|雪原|永冬岭|银鬃铁卫|下层区|地火|磐岩镇|克里珀堡/ },
    { target: /xianzhou|luofu|仙舟|罗浮|建木|丹鼎司|太卜司/i, source: /仙舟|罗浮|星槎|建木|丹鼎司|太卜司|神策府|工造司|长乐天/ },
    { target: /penacony|匹诺康尼|白日梦|黄金的时刻|晖长石/i, source: /匹诺康尼|白日梦|黄金的时刻|黄金时刻|晖长石|梦境|家族|星期日|流萤/ },
  ];
  return worldSignals.some((signal) => signal.target.test(targetText) && signal.source.test(normalizedSource));
}

function switchCanonSeries(params: {
  normalized: 剧情编织系统;
  fromSeries: 剧情编织系列;
  fromCurrent: 剧情编织分段;
  toSeries: 剧情编织系列;
  toCurrent: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  gateSnapshot?: 剧情编织门禁快照 | null;
}): 剧情编织系统 {
  const now = Date.now();
  const nextFromSeries: 剧情编织系列 = {
    ...params.fromSeries,
    分段列表: params.fromSeries.分段列表.map((segment) =>
      segment.id === params.fromCurrent.id && segment.运行状态 === '当前'
        ? { ...segment, 运行状态: '已偏离' as const, updatedAt: now }
        : segment,
    ),
    updatedAt: now,
  };
  const nextToSeries: 剧情编织系列 = {
    ...params.toSeries,
    当前分段组号: params.toCurrent.组号,
    分段列表: params.toSeries.分段列表.map((segment) => {
      if (segment.组号 < params.toCurrent.组号 && ['当前', '未开始'].includes(segment.运行状态)) {
        return { ...segment, 运行状态: '已经历' as const, updatedAt: now };
      }
      if (segment.id === params.toCurrent.id) {
        return { ...segment, 运行状态: '当前' as const, updatedAt: now };
      }
      return segment.运行状态 === '当前' ? { ...segment, 运行状态: '未开始' as const, updatedAt: now } : segment;
    }),
    updatedAt: now,
  };
  return 归一化剧情编织系统({
    ...params.normalized,
    当前系列ID: params.toSeries.id,
    系列列表: params.normalized.系列列表.map((series) => {
      if (series.id === params.fromSeries.id) return nextFromSeries;
      if (series.id === params.toSeries.id) return nextToSeries;
      return series;
    }),
    当前进度: buildProgressAnchor({
      previous: params.normalized.当前进度,
      series: params.toSeries,
      current: params.toCurrent,
      completedSegment: params.fromCurrent,
      turnCount: params.turnCount,
      reasons: params.reasons,
      switchNote: `后台跨系列纠偏：从「${params.fromSeries.标题}」切换到「${params.toSeries.标题} / ${params.toCurrent.标题}」`,
      archiveStatus: '已偏离',
      gateSnapshot: params.gateSnapshot,
    }),
  });
}

function alignToLaterSegment(params: {
  normalized: 剧情编织系统;
  series: 剧情编织系列;
  current: 剧情编织分段;
  target: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  currentArchiveStatus: '已经历' | '已跳过';
  gateSnapshot?: 剧情编织门禁快照 | null;
}): 剧情编织系统 {
  const now = Date.now();
  const skippedSegments = params.series.分段列表
    .filter((segment) =>
      segment.组号 < params.target.组号 &&
      segment.id !== params.current.id &&
      ['当前', '未开始'].includes(segment.运行状态),
    )
    .sort((a, b) => a.组号 - b.组号);
  const nextSeries: 剧情编织系列 = {
    ...params.series,
    当前分段组号: params.target.组号,
    分段列表: params.series.分段列表.map((segment) => {
      if (segment.id === params.current.id && ['当前', '未开始'].includes(segment.运行状态)) {
        return { ...segment, 运行状态: params.currentArchiveStatus, updatedAt: now };
      }
      if (segment.组号 < params.target.组号 && ['当前', '未开始'].includes(segment.运行状态)) {
        return { ...segment, 运行状态: '已跳过' as const, updatedAt: now };
      }
      if (segment.id === params.target.id) {
        return { ...segment, 运行状态: '当前' as const, updatedAt: now };
      }
      if (segment.运行状态 === '当前') {
        return { ...segment, 运行状态: '未开始' as const, updatedAt: now };
      }
      return segment;
    }),
    updatedAt: now,
  };
  const additionalArchives = skippedSegments.map((segment) => ({
    segment,
    status: '已跳过' as const,
    switchNote: `后台跨段纠偏到「${params.target.标题}」，中间段「${segment.标题}」仅按进度校正跳过，不写成已完成事实`,
  }));
  return 归一化剧情编织系统({
    ...params.normalized,
    当前系列ID: params.series.id,
    系列列表: params.normalized.系列列表.map((item) => item.id === params.series.id ? nextSeries : item),
    当前进度: buildProgressAnchor({
      previous: params.normalized.当前进度,
      series: params.series,
      current: params.target,
      completedSegment: params.current,
      turnCount: params.turnCount,
      reasons: params.reasons,
      switchNote: params.currentArchiveStatus === '已经历'
        ? `后台对齐到「${params.target.标题}」，当前段按已经历归档`
        : `后台对齐到「${params.target.标题}」，当前段仅按进度校正跳过`,
      archiveStatus: params.currentArchiveStatus,
      additionalArchives,
      gateSnapshot: params.gateSnapshot,
    }),
  });
}

function settleCurrentSegment(params: {
  normalized: 剧情编织系统;
  series: 剧情编织系列;
  current: 剧情编织分段;
  next?: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  mode: 'advance' | 'complete';
  gateSnapshot?: 剧情编织门禁快照 | null;
}): 剧情编织系统 {
  const now = Date.now();
  const { normalized, series, current, next } = params;
  const nextSeries: 剧情编织系列 = {
    ...series,
    当前分段组号: next?.组号 ?? current.组号,
    分段列表: series.分段列表.map((segment) => {
      if (segment.id === current.id) {
        return { ...segment, 运行状态: '已经历' as const, updatedAt: now };
      }
      if (next && segment.id === next.id) {
        return { ...segment, 运行状态: '当前' as const, updatedAt: now };
      }
      return segment.运行状态 === '当前'
        ? { ...segment, 运行状态: '未开始' as const, updatedAt: now }
        : segment;
    }),
    updatedAt: now,
  };
  return 归一化剧情编织系统({
    ...normalized,
    当前系列ID: series.id,
    系列列表: normalized.系列列表.map((item) => item.id === series.id ? nextSeries : item),
    当前进度: buildProgressAnchor({
      previous: normalized.当前进度,
      series,
      current: next ?? current,
      completedSegment: current,
      turnCount: params.turnCount,
      reasons: params.reasons,
      switchNote: next ? `当前分段已归档，后台进入「${next.标题}」` : `当前分段已归档，系列暂无下一分段`,
      completed: params.mode === 'complete',
      gateSnapshot: params.gateSnapshot,
    }),
  });
}

function refreshProgressDiagnostics(params: {
  normalized: 剧情编织系统;
  series: 剧情编织系列;
  current: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  evidenceState: 推进证据状态;
  gateSnapshot?: 剧情编织门禁快照 | null;
}): 剧情编织系统 {
  const previous = params.normalized.当前进度;
  const nextAnchor: 剧情编织进度锚点 = {
    ...buildProgressAnchor({
      previous,
      series: params.series,
      current: params.current,
      turnCount: params.turnCount,
      reasons: params.reasons,
      switchNote: '后台判定暂不切换分段，当前分段继续作为软参考。',
      gateSnapshot: params.gateSnapshot,
    }),
    已完成摘要: previous?.已完成摘要 ?? [],
    切换说明: previous?.切换说明 ?? [],
    历史归档: previous?.历史归档 ?? [],
    推进证据: params.evidenceState.evidence,
    连续推进证据回合: params.evidenceState.consecutive,
    卡段回合数: params.evidenceState.stuckTurns,
  };
  const sameAnchor = previous
    && previous.当前系列ID === nextAnchor.当前系列ID
    && previous.当前分段ID === nextAnchor.当前分段ID
    && previous.当前分段组号 === nextAnchor.当前分段组号
    && previous.推进状态 === nextAnchor.推进状态
    && previous.最近一次推进判定回合 === nextAnchor.最近一次推进判定回合
    && sameTextList(previous.最近判定理由, nextAnchor.最近判定理由)
    && sameTextList(previous.当前待解问题, nextAnchor.当前待解问题)
    && sameTextList(previous.推进证据, nextAnchor.推进证据)
    && (previous.连续推进证据回合 ?? 0) === (nextAnchor.连续推进证据回合 ?? 0)
    && (previous.卡段回合数 ?? 0) === (nextAnchor.卡段回合数 ?? 0);
  if (sameAnchor) return params.normalized;
  return 归一化剧情编织系统({
    ...params.normalized,
    当前系列ID: params.series.id,
    当前进度: nextAnchor,
  });
}

function buildNoProgressReasons(params: {
  best?: 分段评分;
  currentScore: number;
  completionScore: 完成判定评分;
  alignmentReasons: string[];
  progressEvidence: 推进证据评分;
  evidenceState: 推进证据状态;
}): string[] {
  const reasons = [
    `未推进：当前段结束判定 ${params.completionScore.value}/3，${params.completionScore.explicitEnding ? '已有明确收束证据' : '缺少明确收束证据'}`,
  ];
  if (!params.best) {
    reasons.push('未推进：没有命中可对齐的后续分段');
  } else if (params.best.segment.组号 <= 0) {
    reasons.push('未推进：候选分段无有效组号');
  } else {
    reasons.push(`未推进：最佳候选「${params.best.segment.标题}」对齐分 ${params.best.score.value}，当前段对齐分 ${params.currentScore}`);
  }
  reasons.push(...params.alignmentReasons);
  if (params.progressEvidence.blockers.length) {
    reasons.push(`未推进：命中阻断/否定词 ${params.progressEvidence.blockers.slice(0, 4).join('、')}`);
  } else if (params.progressEvidence.valid) {
    reasons.push(`推进证据累计：连续 ${params.evidenceState.consecutive}/2 回合`);
    reasons.push(...params.progressEvidence.reasons);
  } else {
    reasons.push(...params.progressEvidence.reasons);
  }
  if (params.completionScore.reasons.length) {
    reasons.push(...params.completionScore.reasons);
  }
  return uniqueText(reasons, 8);
}

function buildProgressAnchor(params: {
  previous?: 剧情编织进度锚点;
  series: 剧情编织系列;
  current: 剧情编织分段;
  completedSegment?: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  switchNote: string;
  completed?: boolean;
  archiveStatus?: 剧情编织历史归档['归档状态'];
  additionalArchives?: Array<{
    segment: 剧情编织分段;
    status: 剧情编织历史归档['归档状态'];
    switchNote: string;
  }>;
  gateSnapshot?: 剧情编织门禁快照 | null;
}): 剧情编织进度锚点 {
  const archiveStatus = params.archiveStatus ?? (params.completed ? '已完成' : '已经历');
  const completedSummary = params.completedSegment && ['已经历', '已完成'].includes(archiveStatus)
    ? params.completedSegment.本段结束状态[0]
      || params.completedSegment.本段概括
      || params.completedSegment.原文摘要
      || params.completedSegment.标题
    : '';
  const pending = [
    ...params.current.给后续参考,
    ...params.current.关键事件.flatMap((event) => event.触发条件),
  ].filter(Boolean);
  const archive = params.completedSegment
    ? buildHistoryArchiveEntry({
      previous: params.previous,
      series: params.series,
      segment: params.completedSegment,
      turnCount: params.turnCount,
      reasons: params.reasons,
      switchNote: params.switchNote,
      status: archiveStatus,
    })
    : undefined;
  const additionalArchives = (params.additionalArchives ?? [])
    .map((item) => buildHistoryArchiveEntry({
      previous: params.previous,
      series: params.series,
      segment: item.segment,
      turnCount: params.turnCount,
      reasons: params.reasons,
      switchNote: item.switchNote,
      status: item.status,
    }))
    .filter(Boolean) as 剧情编织历史归档[];
  return {
    当前系列ID: params.series.id,
    当前分段ID: params.current.id,
    当前分段组号: params.current.组号,
    推进状态: params.completed ? '已完成' : '推进中',
    已完成摘要: uniqueText([...(params.previous?.已完成摘要 ?? []), completedSummary], 12),
    当前待解问题: uniqueText(pending, 10),
    切换说明: uniqueText([...(params.previous?.切换说明 ?? []), params.switchNote], 10),
    历史归档: uniqueArchives([...(params.previous?.历史归档 ?? []), archive, ...additionalArchives].filter(Boolean) as 剧情编织历史归档[], 30),
    最近门禁结果: params.gateSnapshot?.mode ?? params.previous?.最近门禁结果,
    最近判定理由: uniqueText(params.reasons, 8),
    最近一次推进判定回合: params.turnCount,
    推进证据: [],
    连续推进证据回合: 0,
    卡段回合数: 0,
    updatedAt: Date.now(),
  };
}

function buildHistoryArchiveEntry(params: {
  previous?: 剧情编织进度锚点;
  series: 剧情编织系列;
  segment: 剧情编织分段;
  turnCount: number;
  reasons: string[];
  switchNote: string;
  status: 剧情编织历史归档['归档状态'];
}): 剧情编织历史归档 | undefined {
  const baseSummary = params.segment.本段概括
    || params.segment.原文摘要
    || params.segment.标题;
  const summary = params.status === '已跳过'
    ? `按进度校正跳过：${baseSummary}（未确认完整经历）`
    : params.status === '已偏离'
      ? `路线已偏离：${baseSummary}（不作为已完成事实）`
      : params.segment.本段结束状态[0]
        || baseSummary;
  const roleProgressSummary = ['已跳过', '已偏离'].includes(params.status)
    ? []
    : buildRoleProgressArchiveSummary(params.segment);
  const id = `story_archive_${params.series.id}_${params.segment.id}_${params.turnCount}`;
  if (params.previous?.历史归档?.some((item) => item.id === id || (item.分段ID === params.segment.id && item.归档回合 === params.turnCount))) {
    return undefined;
  }
  return {
    id,
    系列ID: params.series.id,
    分段ID: params.segment.id,
    分段组号: params.segment.组号,
    分段标题: params.segment.标题,
    归档回合: params.turnCount,
    归档状态: params.status,
    摘要: summary,
    角色推进摘要: roleProgressSummary,
    切换说明: params.switchNote,
    判定理由: uniqueText(params.reasons, 8),
    createdAt: Date.now(),
  };
}

function buildRoleProgressArchiveSummary(segment: 剧情编织分段): string[] {
  const items = segment.角色推进.flatMap((item) => {
    const role = item.角色名.trim();
    if (!role) return [];
    const changes = uniqueText([
      ...item.本段变化,
      ...item.本段后状态,
      ...item.对后续影响,
    ], 3);
    if (!changes.length) return [];
    return [`${role}：${changes.join('；')}`];
  });
  return uniqueText(items, 8);
}

function uniqueArchives(items: 剧情编织历史归档[], limit: number): 剧情编织历史归档[] {
  const seen = new Set<string>();
  const result: 剧情编织历史归档[] = [];
  for (const item of items) {
    const key = item.id || `${item.系列ID}_${item.分段ID}_${item.分段组号}_${item.归档回合}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result.slice(-limit);
}

function uniqueText(items: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items.map((value) => value.trim()).filter(Boolean)) {
    const key = item.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function sameTextList(left?: string[], right?: string[]): boolean {
  const a = left ?? [];
  const b = right ?? [];
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

type 分段存在评分 = { value: number; reasons: string[]; categories: string[] };
type 分段评分 = { segment: 剧情编织分段; score: 分段存在评分 };
type 完成判定评分 = { value: number; explicitEnding: boolean; reasons: string[]; blockers: string[] };
type 推进证据评分 = { valid: boolean; value: number; reasons: string[]; blockers: string[] };
type 推进证据状态 = { evidence: string[]; consecutive: number; stuckTurns: number };
type 跨段对齐判定 = {
  allow: boolean;
  target?: 分段评分;
  reasons: string[];
  currentArchiveStatus: '已经历' | '已跳过';
};

function scoreCompletionSignals(segment: 剧情编织分段, text: string): 完成判定评分 {
  const source = normalizeText(text);
  let value = 0;
  const reasons: string[] = [];
  const blockers = detectProgressBlockers(source);
  const endStates = [...segment.本段结束状态, ...segment.关键事件.flatMap((event) => event.事件结果)].filter(Boolean);
  const endingHits = countHits(source, endStates);
  if (endingHits > 0) {
    value += Math.min(3, endingHits);
    reasons.push(`命中本段结束状态 ${endingHits} 项`);
  }
  const titleTerms = splitMeaningfulTerms(segment.标题);
  const titleHits = titleTerms.filter((term) => source.includes(term)).length;
  if (titleHits >= 2) {
    value += 1;
    reasons.push('正文提及当前分段核心标题词');
  }
  const resultWords = ['结束', '完成', '离开', '登上', '抵达', '击退', '解决', '告一段落', '暂时平息', '启程', '跃迁'];
  const resultHits = resultWords.filter((word) => source.includes(word)).length;
  if (resultHits > 0) {
    value += Math.min(2, resultHits);
    reasons.push('正文出现阶段收束信号');
  }
  if (blockers.length) {
    value = Math.max(0, value - 2);
    reasons.push(`出现否定/阻断信号：${blockers.slice(0, 4).join('、')}`);
  }
  const explicitEnding = blockers.length === 0 && (endingHits > 0 || (titleHits >= 2 && resultHits >= 2));
  if (!explicitEnding) reasons.push('缺少明确结束状态或标题+收束词组合，暂不自动归档');
  return { value, explicitEnding, reasons, blockers };
}

function scoreSegmentPresence(segment: 剧情编织分段, text: string): 分段存在评分 {
  const source = normalizeText(text);
  let value = 0;
  const reasons: string[] = [];
  const categories: string[] = [];

  const titleTerms = splitMeaningfulTerms(segment.标题);
  const titleHits = titleTerms.filter((term) => source.includes(term)).length;
  if (titleHits >= 2) {
    value += 3;
    reasons.push(`命中标题词 ${titleHits} 项`);
    categories.push('标题');
  }

  const summaryTerms = splitMeaningfulTerms([
    segment.原文摘要,
    segment.本段概括,
    ...segment.关键事件.map((event) => event.事件说明),
  ].join(' ')).slice(0, 16);
  const summaryHits = summaryTerms.filter((term) => source.includes(term)).length;
  if (summaryHits >= 2) {
    value += Math.min(5, summaryHits);
    reasons.push(`命中概括关键词 ${summaryHits} 项`);
    categories.push('概括');
  }

  const roleTerms = segment.登场角色
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && source.includes(item));
  const locationTerms = segment.涉及地点
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && source.includes(item));
  const factionTerms = segment.涉及派系
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && source.includes(item));
  const entityTerms = [...roleTerms, ...locationTerms, ...factionTerms];
  if (entityTerms.length >= 2) {
    value += Math.min(3, entityTerms.length);
    reasons.push(`命中人物/地点 ${entityTerms.slice(0, 4).join('、')}`);
    if (roleTerms.length) categories.push('登场角色');
    if (locationTerms.length) categories.push('地点');
    if (factionTerms.length) categories.push('派系');
  }

  const eventTerms = splitMeaningfulTerms([
    ...segment.本段结束状态,
    ...segment.给后续参考,
    ...segment.关键事件.flatMap((event) => event.事件结果),
  ].join(' '));
  const eventHits = eventTerms.filter((term) => source.includes(term)).length;
  if (eventHits >= 2) {
    value += Math.min(3, eventHits);
    reasons.push(`命中事件结果 ${eventHits} 项`);
    categories.push('事件结果');
  }

  return { value, reasons, categories: uniqueText(categories, 8) };
}

function scoreProgressEvidence(
  segment: 剧情编织分段,
  text: string,
  gateSnapshot: 剧情编织门禁快照 | null | undefined,
  completionScore: 完成判定评分,
): 推进证据评分 {
  const source = normalizeText(text);
  const blockers = completionScore.blockers.length ? completionScore.blockers : detectProgressBlockers(source);
  const segmentScore = scoreSegmentPresence(segment, text);
  const actionWords = ['继续', '前往', '进入', '寻找', '追问', '调查', '启动', '汇报', '战斗', '迎击', '救援', '抵达', '登上', '打开', '检查', '确认', '封存', '交付', '汇合'];
  const actionHits = actionWords.filter((word) => source.includes(word));
  let value = 0;
  const reasons: string[] = [];
  if (completionScore.value >= 2) {
    value += completionScore.value;
    reasons.push(`当前段收束/结果证据 ${completionScore.value} 分`);
  }
  if (segmentScore.value >= 3) {
    value += Math.min(3, segmentScore.value);
    reasons.push(`当前段正文命中 ${segmentScore.value} 分`);
  }
  if (gateSnapshot?.mode === 'strong') {
    value += 2;
    reasons.push('最近门禁为强承接');
  }
  if (actionHits.length) {
    value += 1;
    reasons.push(`玩家/正文动作词：${actionHits.slice(0, 4).join('、')}`);
  }
  if (blockers.length) {
    return {
      valid: false,
      value: Math.max(0, value - 2),
      reasons: [`推进证据被否定/阻断信号压制：${blockers.slice(0, 4).join('、')}`],
      blockers,
    };
  }
  const valid = value >= 4 && (
    completionScore.value >= 2 ||
    gateSnapshot?.mode === 'strong' ||
    (actionHits.length > 0 && segmentScore.value >= 3)
  );
  if (!valid) {
    reasons.push('有效推进证据不足，暂不累计切段');
  }
  return { valid, value, reasons: uniqueText(reasons, 8), blockers };
}

function buildProgressEvidenceState(params: {
  previous?: 剧情编织进度锚点;
  current: 剧情编织分段;
  turnCount: number;
  evidence: 推进证据评分;
}): 推进证据状态 {
  const sameSegment = params.previous?.当前分段ID === params.current.id;
  const previousTurn = params.previous?.最近一次推进判定回合 ?? 0;
  const isNewTurn = params.turnCount > previousTurn;
  const previousStuck = sameSegment ? params.previous?.卡段回合数 ?? 0 : 0;
  const stuckTurns = sameSegment && isNewTurn ? previousStuck + 1 : previousStuck;
  if (!params.evidence.valid) {
    return { evidence: [], consecutive: 0, stuckTurns };
  }
  const previousConsecutive = sameSegment ? params.previous?.连续推进证据回合 ?? 0 : 0;
  const consecutive = sameSegment && isNewTurn
    ? previousConsecutive + 1
    : Math.max(1, previousConsecutive);
  const previousEvidence = sameSegment ? params.previous?.推进证据 ?? [] : [];
  return {
    evidence: uniqueText([...previousEvidence, ...params.evidence.reasons], 8),
    consecutive,
    stuckTurns,
  };
}

function decideSegmentAlignment(params: {
  series: 剧情编织系列;
  current: 剧情编织分段;
  best?: 分段评分;
  currentScore: number;
  source: string;
  completionScore: 完成判定评分;
  evidenceState: 推进证据状态;
}): 跨段对齐判定 {
  const { best, current, currentScore } = params;
  if (!best) {
    return { allow: false, reasons: ['未推进：没有可对齐候选分段'], currentArchiveStatus: '已跳过' };
  }
  const distance = best.segment.组号 - current.组号;
  if (distance <= 0) {
    return { allow: false, reasons: ['未推进：最佳候选仍是当前段或更早分段'], currentArchiveStatus: '已跳过' };
  }
  const advantage = best.score.value - currentScore;
  const stageSignals = detectExplicitStageJumpSignals(params.source);
  const categoryCount = best.score.categories.length;
  const canCanonJump = params.series.来源类型 === 'canon';
  const currentArchiveStatus: '已经历' | '已跳过' =
    params.completionScore.explicitEnding || params.evidenceState.consecutive >= 2 ? '已经历' : '已跳过';

  if (distance === 1) {
    const allow = best.score.value >= 5 && advantage >= 2 && (canCanonJump || best.score.value >= 7);
    return {
      allow,
      target: allow ? best : undefined,
      currentArchiveStatus,
      reasons: allow
        ? uniqueText([
          `相邻分段高置信对齐：命中「${best.segment.标题}」`,
          `对齐分 ${best.score.value}，领先当前段 ${advantage} 分`,
          ...best.score.reasons,
        ], 8)
        : uniqueText([
          `未推进：相邻分段「${best.segment.标题}」证据不足`,
          best.score.value < 5 ? '未推进：后续分段命中分低于 5' : '',
          advantage < 2 ? '未推进：后续分段相对当前段优势不足 2 分' : '',
          !canCanonJump && best.score.value < 7 ? '未推进：原创剧情推进到下一段需要至少 7 分' : '',
        ], 8),
    };
  }

  if (distance === 2) {
    const allow = canCanonJump && best.score.value >= 8 && advantage >= 3 && categoryCount >= 3;
    return {
      allow,
      target: allow ? best : undefined,
      currentArchiveStatus,
      reasons: allow
        ? uniqueText([
          `强证据跨两段纠偏：命中「${best.segment.标题}」`,
          `命中类别：${best.score.categories.join('、')}`,
          `对齐分 ${best.score.value}，领先当前段 ${advantage} 分`,
          ...best.score.reasons,
        ], 8)
        : uniqueText([
          `疑似命中后续第 ${best.segment.组号} 段「${best.segment.标题}」，但未达到跨两段纠偏阈值`,
          best.score.value < 8 ? '未推进：跨两段需要至少 8 分' : '',
          advantage < 3 ? '未推进：跨两段需要领先当前段至少 3 分' : '',
          categoryCount < 3 ? '未推进：跨两段需要至少 3 类证据共同命中' : '',
        ], 8),
    };
  }

  const allowLongJump = canCanonJump &&
    distance <= 4 &&
    best.score.value >= 10 &&
    advantage >= 4 &&
    categoryCount >= 4 &&
    stageSignals.length > 0;
  return {
    allow: allowLongJump,
    target: allowLongJump ? best : undefined,
    currentArchiveStatus,
    reasons: allowLongJump
      ? uniqueText([
        `显式阶段跳转纠偏：跨 ${distance} 段对齐到「${best.segment.标题}」`,
        `阶段跳转信号：${stageSignals.join('、')}`,
        `命中类别：${best.score.categories.join('、')}`,
        `对齐分 ${best.score.value}，领先当前段 ${advantage} 分`,
        ...best.score.reasons,
      ], 8)
      : uniqueText([
        `疑似命中后续第 ${best.segment.组号} 段「${best.segment.标题}」，但未直接大跳`,
        distance > 4 ? '未推进：自动纠偏最多只评估后 4 段' : '',
        best.score.value < 10 ? '未推进：跨三段以上需要至少 10 分' : '',
        advantage < 4 ? '未推进：跨三段以上需要领先当前段至少 4 分' : '',
        categoryCount < 4 ? '未推进：跨三段以上需要至少 4 类证据共同命中' : '',
        stageSignals.length === 0 ? '未推进：跨三段以上需要明确阶段/时空跳转词' : '',
      ], 8),
  };
}

function detectProgressBlockers(source: string): string[] {
  const normalized = normalizeText(source);
  const blockers = [
    '还没有',
    '还没',
    '尚未',
    '没有完成',
    '没有被',
    '并没有',
    '并未',
    '未能',
    '未完成',
    '暂未',
    '没能',
    '无法',
    '失败',
    '受阻',
    '中断',
    '被阻止',
  ];
  return blockers.filter((word) => normalized.includes(word));
}

function detectExplicitStageJumpSignals(source: string): string[] {
  const normalized = normalizeText(source);
  const signals: Array<[RegExp, string]> = [
    [/跳过|略过|省略/, '明确跳过'],
    [/数日后|几日后|数小时后|几小时后|半日后|翌日|第二天|一夜过去/, '时间跳转'],
    [/已经抵达|已抵达|抵达了|到达了/, '已经抵达'],
    [/离开.+前往|从.+转往|转向.+继续/, '地点转移'],
    [/直接前往|直接进入|直接来到/, '直接进入后段'],
    [/剧情进入|章节进入|进入.+阶段|进入.+章节/, '章节阶段切换'],
    [/事件已经结束|危机已经解除|告一段落/, '事件已结束'],
  ];
  return signals.flatMap(([pattern, label]) => pattern.test(normalized) ? [label] : []);
}

function scoreCanonSeriesPresence(series: 剧情编织系列, text: string): { value: number; reasons: string[] } {
  const source = normalizeText(text);
  let value = 0;
  const reasons: string[] = [];
  const titleTerms = splitMeaningfulTerms([
    series.标题,
    series.作品名,
    series.当前阶段概括,
  ].join(' '));
  const titleHits = titleTerms.filter((term) => source.includes(term));
  if (titleHits.length) {
    value += Math.min(4, titleHits.length * 2);
    reasons.push(`命中系列标题/阶段词：${titleHits.slice(0, 4).join('、')}`);
  }
  const indexTerms = uniqueText([
    ...series.涉及地点索引,
    ...series.涉及派系索引,
    ...series.核心角色,
  ], 40);
  const indexHits = indexTerms.filter((term) => term.length >= 2 && source.includes(term));
  if (indexHits.length) {
    value += Math.min(8, indexHits.length * 2);
    reasons.push(`命中系列地点/人物/派系：${indexHits.slice(0, 6).join('、')}`);
  }
  const segmentEntityTerms = uniqueText(series.分段列表.flatMap((segment) => [
    ...segment.登场角色,
    ...segment.涉及地点,
    ...segment.涉及派系,
  ]), 80);
  const segmentHits = segmentEntityTerms.filter((term) => term.length >= 2 && source.includes(term));
  if (segmentHits.length >= 2) {
    value += Math.min(6, segmentHits.length);
    reasons.push(`命中分段实体：${segmentHits.slice(0, 6).join('、')}`);
  }
  return { value, reasons };
}

function countHits(source: string, candidates: string[]): number {
  let count = 0;
  for (const candidate of candidates.slice(0, 12)) {
    const terms = splitMeaningfulTerms(candidate);
    if (terms.length >= 2 && terms.filter((term) => source.includes(term)).length >= 2) {
      count += 1;
    }
  }
  return count;
}

function splitMeaningfulTerms(text: string): string[] {
  return Array.from(new Set(
    normalizeText(text)
      .split(/[\s，。；、：:,.!?！？「」『』（）()[\]【】\-—]+/g)
      .map((item) => item.trim())
      .filter((item) => item.length >= 2 && !STOP_WORDS.has(item)),
  )).slice(0, 10);
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

const STOP_WORDS = new Set(['当前', '本段', '剧情', '玩家', '角色', '已经', '一个', '以及', '进行', '开始', '继续']);
