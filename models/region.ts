import type { 世界状态 } from '@/models/world';
import type { 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';

/** 无法结构化确认时统一落到 unknown，避免把自由文本猜成某条剧情线的区域。 */
export const 未知区域ID = 'unknown';

export const 区域名称表: Record<string, string> = {
  herta_space_station: '黑塔空间站',
  jarilo_vi: '雅利洛-VI',
  xianzhou_luofu: '仙舟罗浮',
  penacony: '匹诺康尼',
  amphoreus: '翁法罗斯',
  erxiang_paradise: '二相乐园',
  [未知区域ID]: '未知区域',
};

export function 区域显示名称(regionId: string): string {
  return 区域名称表[regionId] ?? regionId;
}

/** 区域别名单一数据源：世界地点推断、系列区域推断与跨系列门控共用同一张表。 */
export const 区域别名表: Array<[string, string[]]> = [
  ['herta_space_station', ['黑塔空间站', '黑塔', '空间站', '主控舱段', '支援舱段', '收容舱段']],
  ['jarilo_vi', ['雅利洛', '贝洛伯格', '雪原', '永冬岭', '银鬃铁卫', '下层区', '上层区', '地火', '磐岩镇', '大矿区', '残响回廊', '克里珀堡']],
  ['xianzhou_luofu', ['仙舟罗浮', '仙舟', '罗浮', '星槎', '建木', '丹鼎司', '太卜司', '神策府', '工造司', '长乐天', '鳞渊境']],
  ['penacony', ['匹诺康尼', '白日梦酒店', '白日梦', '黄金的时刻', '黄金时刻', '晖长石', '流梦礁', '朝露公馆', '梦境', '家族', '星期日', '流萤']],
  ['amphoreus', ['翁法罗斯', '奥赫玛', '永恒之地', '悬锋城', '刻法勒', '万敌']],
  ['erxiang_paradise', ['二相乐园', '乐园']],
];

const 读文本 = (value: unknown): string => (typeof value === 'string' ? value : '');

function 归一化区域文本(value: unknown): string {
  const source = Array.isArray(value)
    ? value.map((item) => 读文本(item).replace(/\s+/g, '').toLowerCase()).filter(Boolean).join('｜')
    : 读文本(value).replace(/\s+/g, '').toLowerCase();
  return source;
}

/**
 * 软推断：返回文本命中的全部区域 ID（聚合索引可能同时收录多个地区，只适合做参考）。
 */
export function 推断区域ID列表(value: unknown): string[] {
  const source = 归一化区域文本(value);
  if (!source) return [];
  return 区域别名表
    .filter(([, aliases]) => aliases.some((alias) => source.includes(alias.toLowerCase())))
    .map(([id]) => id);
}

/**
 * 硬推断：命中多个区域时返回 unknown，宁缺勿错，不把模糊文本导向某条剧情线。
 */
export function 推断区域ID(value: unknown): string {
  const matches = 推断区域ID列表(value);
  return matches.length === 1 ? matches[0] : 未知区域ID;
}

/**
 * 系列区域：优先使用显式 `区域ID`（兼容写入中文名的情况），否则从标题与索引保守推断。
 */
export function 推断系列区域ID(
  series?: Pick<剧情编织系列, '区域ID' | '标题' | '作品名' | '涉及地点索引' | '涉及派系索引'>,
): string {
  const explicit = 读文本(series?.区域ID).trim();
  if (explicit) {
    if (区域别名表.some(([id]) => id === explicit)) return explicit;
    const inferred = 推断区域ID(explicit);
    return inferred === 未知区域ID ? explicit : inferred;
  }
  return 推断区域ID([
    series?.标题,
    series?.作品名,
    ...(series?.涉及地点索引 ?? []),
    ...(series?.涉及派系索引 ?? []),
  ]);
}

/** 源文是否提及指定区域：用于跨系列纠偏的强位移判定，替代按地区硬编码的正则表。 */
export function 源文命中区域(source: string, regionId: string): boolean {
  const normalized = 归一化区域文本(source);
  if (!normalized) return false;
  const aliases = 区域别名表.find(([id]) => id === regionId)?.[1];
  if (!aliases) return false;
  return aliases.some((alias) => normalized.includes(alias.toLowerCase()));
}

export interface 剧情区域连续性输入 {
  currentRegionId?: string;
  currentLocation?: string;
  openingRegionId?: string;
  seriesRegionId?: string;
  seriesTitle?: string;
  seriesLocations?: string[];
}

export type 剧情区域连续性判定 =
  | { action: 'allow'; mode: 'stay'; reasons: string[] }
  | { action: 'hold'; codes: string[]; suppressStoryInjection: boolean; reasons: string[] };

/**
 * 剧情区域连续性纯裁决器：只负责剧情编织自身的系列/区域一致性；
 * 变量地点写入不经过这里裁决，避免把自由文本地点升级成硬事实。
 */
export function 评估剧情区域连续性(input: 剧情区域连续性输入): 剧情区域连续性判定 {
  const currentRegion = 读文本(input.currentRegionId).trim() || 推断区域ID(input.currentLocation);
  const openingRegion = 读文本(input.openingRegionId).trim() || 未知区域ID;
  const seriesRegion = 读文本(input.seriesRegionId).trim()
    || 推断区域ID([input.seriesTitle, ...(input.seriesLocations ?? [])]);
  const baselineRegion = currentRegion !== 未知区域ID ? currentRegion : openingRegion;
  const knownBaseline = Boolean(baselineRegion) && baselineRegion !== 未知区域ID;
  const knownSeries = Boolean(seriesRegion) && seriesRegion !== 未知区域ID;

  if (knownBaseline && knownSeries && baselineRegion !== seriesRegion) {
    return {
      action: 'hold',
      codes: ['CURRENT_REGION_SERIES_MISMATCH'],
      suppressStoryInjection: true,
      reasons: [`当前区域 ${baselineRegion} 与剧情系列区域 ${seriesRegion} 不一致，已暂停剧情推进与注入，等待确认转场或保持原轨道。`],
    };
  }

  return { action: 'allow', mode: 'stay', reasons: [] };
}

/** 确认转场：把指定系列的区域重绑到当前区域。 */
export function 重绑系列区域(
  system: 剧情编织系统,
  seriesId: string,
  regionId: string,
  now = Date.now(),
): 剧情编织系统 {
  const target = regionId.trim();
  if (!target || target === 未知区域ID) return system;
  return {
    ...system,
    系列列表: system.系列列表.map((series) =>
      series.id === seriesId ? { ...series, 区域ID: target, updatedAt: now } : series),
  };
}

/** 保持轨道：把世界当前区域校正回系列区域。 */
export function 校正世界区域(world: 世界状态, regionId: string): 世界状态 {
  const target = regionId.trim();
  return !target || target === 未知区域ID ? world : { ...world, 当前区域ID: target };
}
