import type { 剧情编织系列 } from '@/models/storyWeaving';

export type StoryContinuityPhase = 'pre_request';

export type StoryContinuityDecision =
  | { action: 'allow'; mode: 'stay' | 'advance_one'; reasons: string[] }
  | { action: 'hold'; codes: string[]; suppressStoryInjection: boolean; reasons: string[] };

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
}

const REGION_ALIASES: Array<[string, string[]]> = [
  ['herta_space_station', ['黑塔空间站', '空间站', '主控舱段', '支援舱段', '收容舱段']],
  ['jarilo_vi', ['雅利洛', '贝洛伯格', '永冬岭', '下层区', '上层区', '磐岩镇', '大矿区', '残响回廊']],
  ['xianzhou_luofu', ['仙舟罗浮', '罗浮', '长乐天', '太卜司', '鳞渊境', '丹鼎司', '工造司']],
  ['penacony', ['匹诺康尼', '白日梦酒店', '流梦礁', '朝露公馆', '梦境']],
  ['amphoreus', ['翁法罗斯', '奥赫玛', '永恒之地', '悬锋城', '刻法勒']],
  ['erxiang_paradise', ['二相乐园', '乐园']],
];

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

/**
 * 剧情区域连续性纯裁决器。
 * 只负责剧情编织自身的系列/区域注入一致性；变量地点不经过这里裁决。
 */
export function evaluateStoryContinuity(input: StoryContinuityInput): StoryContinuityDecision {
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

  return { action: 'allow', mode: 'stay', reasons: [] };
}
