import type { 剧情编织系列 } from '@/models/storyWeaving';

export type StoryContinuityPhase = 'pre_request' | 'post_variable' | 'post_adjudication';

export type StoryContinuityDecision =
  | { action: 'allow'; mode: 'stay' | 'advance_one'; reasons: string[] }
  | { action: 'hold'; codes: string[]; suppressStoryInjection: boolean; reasons: string[] }
  | { action: 'confirm'; kind: 'multi_segment' | 'cross_region' | 'series_repair'; proposal: Record<string, unknown>; reasons: string[] };

export interface StoryContinuityConfirmation {
  kind: 'multi_segment' | 'cross_region' | 'series_repair';
  proposal: Record<string, unknown>;
  reasons: string[];
}

export interface StoryContinuityInput {
  phase?: StoryContinuityPhase;
  currentRegionId?: string;
  currentLocation?: string;
  openingRegionId?: string;
  seriesRegionId?: string;
  seriesTitle?: string;
  seriesLocations?: string[];
  candidateRegionId?: string;
  candidateLocation?: string;
  evidenceText?: string;
}

const REGION_ALIASES: Array<[string, string[]]> = [
  ['herta_space_station', ['黑塔空间站', '空间站', '主控舱段', '支援舱段', '收容舱段']],
  ['jarilo_vi', ['雅利洛', '贝洛伯格', '永冬岭', '下层区', '上层区', '磐岩镇', '大矿区', '残响回廊']],
  ['xianzhou_luofu', ['仙舟罗浮', '罗浮', '长乐天', '太卜司', '鳞渊境', '丹鼎司', '工造司']],
  ['penacony', ['匹诺康尼', '白日梦酒店', '流梦礁', '朝露公馆', '梦境']],
  ['amphoreus', ['翁法罗斯', '奥赫玛', '永恒之地', '悬锋城', '刻法勒']],
  ['erxiang_paradise', ['二相乐园', '乐园']],
];

const TRANSITION_WORDS = ['前往', '抵达', '到达', '进入', '来到', '离开', '转移', '转场', '穿越', '传送', '登上列车', '乘坐列车', '从…前往'];

function normalize(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, '').toLowerCase() : '';
}

/** 将自由地点/系列标题映射为有限的结构化区域 ID；无法确认时返回 unknown。 */
export function inferStoryRegionId(value: unknown): string {
  const source = Array.isArray(value)
    ? value.map(normalize).filter(Boolean).join('｜')
    : normalize(value);
  if (!source) return 'unknown';
  const matches = REGION_ALIASES
    .filter(([, aliases]) => aliases.some((alias) => source.includes(normalize(alias))))
    .map(([id]) => id);
  // 聚合索引可能同时收录多个地区；这种情况只能用于软参考，不能拿第一个命中当硬门禁。
  return matches.length === 1 ? matches[0] : 'unknown';
}

export function inferStorySeriesRegion(series?: Pick<剧情编织系列, '区域ID' | '标题' | '作品名' | '涉及地点索引' | '涉及派系索引'>): string {
  if (series?.区域ID?.trim()) return series.区域ID.trim();
  return inferStoryRegionId([
    series?.标题,
    series?.作品名,
    ...(series?.涉及地点索引 ?? []),
    ...(series?.涉及派系索引 ?? []),
  ]);
}

function hasExplicitTransitionEvidence(text: string, targetRegion: string, targetLocation?: string): boolean {
  const source = normalize(text);
  if (!source || !targetRegion || targetRegion === 'unknown') return false;
  const aliases = REGION_ALIASES.find(([id]) => id === targetRegion)?.[1] ?? [];
  const targetHit = aliases.some((alias) => source.includes(normalize(alias)))
    || (targetLocation ? source.includes(normalize(targetLocation)) : false);
  return targetHit && TRANSITION_WORDS.some((word) => source.includes(normalize(word)));
}

/**
 * 剧情区域连续性纯裁决器。
 * 轨道/区域一致性优先于正文命中和变量候选；未知区域永远不自动猜测为某条系列。
 */
export function evaluateStoryContinuity(input: StoryContinuityInput): StoryContinuityDecision {
  const phase = input.phase ?? 'pre_request';
  const currentRegion = input.currentRegionId?.trim() || inferStoryRegionId(input.currentLocation);
  const openingRegion = input.openingRegionId?.trim() || 'unknown';
  const seriesRegion = input.seriesRegionId?.trim() || inferStoryRegionId([input.seriesTitle, ...(input.seriesLocations ?? [])]);
  const baselineRegion = currentRegion !== 'unknown' ? currentRegion : openingRegion;
  const knownBaseline = baselineRegion && baselineRegion !== 'unknown';
  const knownSeries = seriesRegion && seriesRegion !== 'unknown';

  if (knownBaseline && knownSeries && baselineRegion !== seriesRegion) {
    return {
      action: 'hold',
      codes: ['CURRENT_REGION_SERIES_MISMATCH'],
      suppressStoryInjection: true,
      reasons: [`当前区域 ${baselineRegion} 与剧情系列区域 ${seriesRegion} 不一致，禁止继续推进或注入错误轨道。`],
    };
  }

  if (phase === 'post_variable' || phase === 'post_adjudication') {
    const candidateRegion = input.candidateRegionId?.trim() || inferStoryRegionId(input.candidateLocation);
    if (knownBaseline && candidateRegion !== 'unknown' && candidateRegion !== baselineRegion) {
      const explicit = hasExplicitTransitionEvidence(input.evidenceText ?? '', candidateRegion, input.candidateLocation);
      if (!explicit) {
        return {
          action: 'hold',
          codes: ['CANDIDATE_REGION_SELF_ASSERTION', 'CROSS_REGION_EVIDENCE_MISSING'],
          suppressStoryInjection: true,
          reasons: [`变量候选地点映射为 ${candidateRegion}，但正文没有明确跨区域转场证据；候选不能自证当前区域。`],
        };
      }
      return {
        action: 'confirm',
        kind: 'cross_region',
        proposal: { fromRegionId: baselineRegion, toRegionId: candidateRegion, location: input.candidateLocation ?? '' },
        reasons: [`正文明确出现 ${baselineRegion} → ${candidateRegion} 转场，允许进入跨区域确认流程。`],
      };
    }
  }

  return { action: 'allow', mode: 'stay', reasons: [] };
}

/**
 * 将连续性裁决应用到变量模型返回的世界候选。
 *
 * 变量模型的结果是“候选状态”，不是无条件的正式提交。hold/confirm
 * 只冻结地点与区域游标，其他世界字段（时间、天气、全局事件等）仍然保留，
 * 这样不会因为地点需要确认而把同一批次的其他变量一起吞掉。
 */
export function applyStoryContinuityLocation<T extends { 当前地点: string; 当前区域ID: string }>(
  candidateWorld: T,
  baselineWorld: Pick<T, '当前地点' | '当前区域ID'>,
  decision?: StoryContinuityDecision,
): { world: T; status: 'applied' | 'held' | 'pending_confirmation' } {
  if (decision?.action === 'hold' || decision?.action === 'confirm') {
    return {
      world: {
        ...candidateWorld,
        当前地点: baselineWorld.当前地点,
        当前区域ID: baselineWorld.当前区域ID,
      },
      status: decision.action === 'confirm' ? 'pending_confirmation' : 'held',
    };
  }
  return { world: candidateWorld, status: 'applied' };
}
