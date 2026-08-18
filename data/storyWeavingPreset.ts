import type { 智库条目 } from '@/models/zhiku';
import type { 剧情编织分段, 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化剧情编织系统, 归一化剧情编织系列 } from '@/models/storyWeaving';
import { bundledZhikuPresets, loadBundledZhikuPreset } from '@/data/zhikuPreset';
import type { 开局档案 } from '@/models/world';

const decomposedStoryWeavingPresets: BundledStoryWeavingPreset[] = [
  {
    id: 'story_canon_zhiku_herta_station_chapter1',
    title: '黑塔空间站-今天是昨天的明天',
    description: '已分解内置剧情编织：黑塔空间站开局主线。',
    zhikuPresetId: 'zhiku_herta_station_chapter1',
  },
  {
    id: 'story_canon_zhiku_jarilo_vi_chapters',
    title: '雅利洛-VI-于枯索的冬夜里',
    description: '已分解内置剧情编织：雅利洛-VI 主线前段。',
    zhikuPresetId: 'zhiku_jarilo_vi_chapters',
  },
  {
    id: 'story_canon_zhiku_jarilo_vi_sunrise_chapters',
    title: '雅利洛-VI-黎明将至',
    description: '已分解内置剧情编织：雅利洛-VI 主线后段。',
    zhikuPresetId: 'zhiku_jarilo_vi_sunrise_chapters',
  },
  {
    id: 'story_canon_side_herta_crown_of_mundane_and_divine',
    title: '【支线】黑塔空间站-庸与神的冠冕',
    description: '已分解内置剧情编织：黑塔空间站版本活动剧情。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_zhiku_xianzhou_luofu_travel_chapters',
    title: '仙舟罗浮其一-乘槎驭风仙窟游',
    description: '已分解内置剧情编织：仙舟罗浮主线开端。',
    zhikuPresetId: 'zhiku_xianzhou_luofu_travel_chapters',
  },
  {
    id: 'story_canon_zhiku_xianzhou_luofu_cloud_tree_chapters',
    title: '仙舟罗浮其二-云树百丈蔽重楼',
    description: '已分解内置剧情编织：仙舟罗浮建木危机。',
    zhikuPresetId: 'zhiku_xianzhou_luofu_cloud_tree_chapters',
  },
  {
    id: 'story_canon_zhiku_xianzhou_luofu_aftermath_chapters',
    title: '仙舟罗浮其三-安灵布奠，天清路远',
    description: '已分解内置剧情编织：仙舟罗浮主线收束。',
    zhikuPresetId: 'zhiku_xianzhou_luofu_aftermath_chapters',
  },
  {
    id: 'story_canon_side_belobog_future_market',
    title: '【支线】贝洛伯格-冬梦激醒',
    description: '已分解内置剧情编织：贝洛伯格版本活动剧情。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_side_xianzhou_foxian_tale',
    title: '【支线】仙舟罗浮-狐斋志异',
    description: '已分解内置剧情编织：仙舟罗浮版本活动剧情。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_penacony_noise_and_fury',
    title: '匹诺康尼其一-喧哗与骚动',
    description: '已分解内置剧情编织：匹诺康尼开端。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_penacony_cat_among_pigeons',
    title: '匹诺康尼其二-鸽群中的猫',
    description: '已分解内置剧情编织：匹诺康尼中段。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_penacony_in_our_time',
    title: '匹诺康尼其三-在我们的时代里',
    description: '已分解内置剧情编织：匹诺康尼高潮段。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_penacony_farewell_penacony',
    title: '匹诺康尼其四-再见，匹诺康尼',
    description: '已分解内置剧情编织：匹诺康尼收束段。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_penacony_depart_on_eighth_day',
    title: '匹诺康尼其五-在第八日启程',
    description: '已分解内置剧情编织：匹诺康尼后续启程。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_amphoreus_1_falling_wood',
    title: '翁法罗斯英雄纪其一-落木逐火英雄纪',
    description: '已分解内置剧情编织：翁法罗斯英雄纪其一。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_amphoreus_2_gate_throne',
    title: '翁法罗斯英雄纪其二-门扉之启，王座之终',
    description: '已分解内置剧情编织：翁法罗斯英雄纪其二。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_amphoreus_3_sleeping_flowers',
    title: '翁法罗斯英雄纪其三-走过安眠地的花丛',
    description: '已分解内置剧情编织：翁法罗斯英雄纪其三。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_amphoreus_4_dawn_fall',
    title: '翁法罗斯英雄纪其四-在黎明升起时坠落',
    description: '已分解内置剧情编织：翁法罗斯英雄纪其四。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_amphoreus_5_sun_hurt',
    title: '翁法罗斯英雄纪其五-因为太阳将要毁伤',
    description: '已分解内置剧情编织：翁法罗斯英雄纪其五。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_amphoreus_6_hero_undying',
    title: '翁法罗斯英雄纪其六-英雄未死之前',
    description: '已分解内置剧情编织：翁法罗斯英雄纪其六。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_amphoreus_7_night_return',
    title: '翁法罗斯英雄纪其七-于长夜重返大地',
    description: '已分解内置剧情编织：翁法罗斯英雄纪其七。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_amphoreus_8_yesterday_tomorrow',
    title: '翁法罗斯英雄纪其八-成为昨日的明天',
    description: '已分解内置剧情编织：翁法罗斯英雄纪其八。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_penacony_memory_is_the_overture',
    title: '匹诺康尼其六-记忆是梦的开场白',
    description: '已分解内置剧情编织：匹诺康尼其六（记忆是梦的开场白）。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_erxiang_paradise_1_welcome',
    title: '二相乐园其一-欢迎来到乐园',
    description: '已分解内置剧情编织：二相乐园其一。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_erxiang_paradise_2_out_of_control',
    title: '二相乐园其二-献给破晓的失控',
    description: '已分解内置剧情编织：二相乐园其二。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_erxiang_paradise_3_so_laughter',
    title: '二相乐园其三-如是，众生欢笑不已',
    description: '已分解内置剧情编织：二相乐园其三。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_erxiang_paradise_4_forgotten_river',
    title: '二相乐园其四-沉于生者的忘川',
    description: '已分解内置剧情编织：二相乐园其四。',
    zhikuPresetId: '',
  },
  {
    id: 'story_canon_erxiang_paradise_5_whistle',
    title: '二相乐园其五-鸣笛于归寂之时',
    description: '已分解内置剧情编织：二相乐园其五。',
    zhikuPresetId: '',
  },
];

const CANON_START_SERIES_ID = 'story_canon_zhiku_herta_station_chapter1';

const OPENING_STORY_WEAVING_ANCHORS: Record<string, { seriesId: string; segmentGroup: number; note: string }> = {
  herta_station_incident: {
    seriesId: 'story_canon_zhiku_herta_station_chapter1',
    segmentGroup: 1,
    note: '黑塔空间站序章开局，从空间站危机前段注入。',
  },
  belobog_arrival: {
    seriesId: 'story_canon_zhiku_jarilo_vi_chapters',
    segmentGroup: 2,
    note: '雅利洛-VI 初抵贝洛伯格阶段开局，黑塔空间站序章只作前置背景，直接从永冬雪原与贝洛伯格城门注入。',
  },
  belobog_underworld: {
    seriesId: 'story_canon_zhiku_jarilo_vi_chapters',
    segmentGroup: 5,
    note: '雅利洛-VI 下层区阶段开局，贝洛伯格前段只作前置背景。',
  },
  belobog_cocolia_crisis: {
    seriesId: 'story_canon_zhiku_jarilo_vi_sunrise_chapters',
    segmentGroup: 5,
    note: '贝洛伯格可可利亚危机前夜开局，前中段只作前置背景，直接从残响回廊与北方雪原入口注入。',
  },
  luofu_arrival: {
    seriesId: 'story_canon_zhiku_xianzhou_luofu_travel_chapters',
    segmentGroup: 1,
    note: '仙舟罗浮初抵阶段开局，黑塔与雅利洛主线只作前置背景。',
  },
  luofu_kafka_interrogation: {
    seriesId: 'story_canon_zhiku_xianzhou_luofu_travel_chapters',
    segmentGroup: 8,
    note: '太卜司审问前后开局，罗浮初抵与追踪前段只作前置背景。',
  },
  luofu_phantylia_crisis: {
    seriesId: 'story_canon_zhiku_xianzhou_luofu_cloud_tree_chapters',
    segmentGroup: 4,
    note: '建木灾变阶段开局，罗浮前中段与丹鼎司前置只作背景，直接从鳞渊境与建木玄根危机注入。',
  },
  penacony_invitation: {
    seriesId: 'story_canon_penacony_noise_and_fury',
    segmentGroup: 3,
    note: '匹诺康尼盛会邀约阶段开局，此前主线只作前置背景，直接从白日梦酒店入场与宾客身份核验注入。',
  },
  penacony_dream_edge: {
    seriesId: 'story_canon_penacony_noise_and_fury',
    segmentGroup: 8,
    note: '匹诺康尼梦境边界异动阶段开局，入梦前段只作前置背景，直接从筑梦边缘与秘密据点天台注入。',
  },
  penacony_reverie_crisis: {
    seriesId: 'story_canon_penacony_in_our_time',
    segmentGroup: 10,
    note: '匹诺康尼美梦崩塌前夜开局，前中段只作前置背景，直接从热砂会场、匹诺康尼大剧院与总摊牌前注入。',
  },
  amphoreus_falling_wood: {
    seriesId: 'story_canon_amphoreus_1_falling_wood',
    segmentGroup: 1,
    note: '翁法罗斯英雄纪其一开局，从分离车厢坠入命运重渊、雅努萨波利斯难民与奥赫玛初战注入。',
  },
  amphoreus_gate_throne: {
    seriesId: 'story_canon_amphoreus_2_gate_throne',
    segmentGroup: 1,
    note: '翁法罗斯英雄纪其二开局，从纷争试炼、白厄失联与黑潮危机注入。',
  },
  amphoreus_sleeping_flowers: {
    seriesId: 'story_canon_amphoreus_3_sleeping_flowers',
    segmentGroup: 6,
    note: '翁法罗斯英雄纪其三的斯缇科西亚开局，从遐蝶获准前往冥界、赛飞儿带路与冥界之门开启注入。',
  },
  amphoreus_sun_hurt: {
    seriesId: 'story_canon_amphoreus_5_sun_hurt',
    segmentGroup: 1,
    note: '翁法罗斯英雄纪其五的循环裂隙开局，从黑潮侵入奥赫玛、再创世与循环终局注入。',
  },
  erxiang_paradise_welcome: {
    seriesId: 'story_canon_erxiang_paradise_1_welcome',
    segmentGroup: 1,
    note: '二相乐园其一开局，从列车抵达乐园、幻月满盈与欢迎广播注入。',
  },
  erxiang_paradise_pigeon_river: {
    seriesId: 'story_canon_erxiang_paradise_2_out_of_control',
    segmentGroup: 1,
    note: '二相乐园其二开局，从鸽川区共愿帮灭门、告死魔模仿犯与公司调查线注入。',
  },
  erxiang_paradise_academy: {
    seriesId: 'story_canon_erxiang_paradise_1_welcome',
    segmentGroup: 3,
    note: '二相乐园其一绘世学院开局，从真珠临摹绘世遗作、模因病毒与火花大会前置注入。',
  },
  erxiang_paradise_ink_residue: {
    seriesId: 'story_canon_erxiang_paradise_5_whistle',
    segmentGroup: 5,
    note: '二相乐园其五终局开局，从舞台春秋、归寂决战与残卷余波注入。',
  },
};

export interface BundledStoryWeavingPreset {
  id: string;
  title: string;
  description: string;
  zhikuPresetId: string;
}

export const bundledStoryWeavingPresets: BundledStoryWeavingPreset[] = decomposedStoryWeavingPresets;

export function getOpeningStoryWeavingAnchor(chapterId?: string): { seriesId: string; segmentGroup: number; note: string } | undefined {
  const id = chapterId?.trim();
  return id ? OPENING_STORY_WEAVING_ANCHORS[id] : undefined;
}

/**
 * G1.3.2：initialize-only seed adapter —— 只允许在"开局初始化/重开/旧档读取对齐"等种子路径调用，
 * 用于把存档剧情编织系统对齐到开局档案锚点。
 * 禁止在正式回合推进（sendWorkflow）、turn snapshot 恢复（turnSnapshot）、boot hydrate（useGameState）、
 * V3 迁移/恢复（migrate/restore）路径调用，以免改写已提交运行时状态；相关禁止调用由
 * story-runtime-migration-regression 静态回归守卫。旧字段与旧存档保持可读，不做删除。
 */
export function alignStoryWeavingToOpeningArchive(system: 剧情编织系统, archive?: 开局档案): 剧情编织系统 {
  const normalized = 归一化剧情编织系统(system);
  if (!normalized.系列列表.length || !archive) return normalized;
  if (archive.主线启用 === false) {
    return 归一化剧情编织系统({
      系列列表: normalized.系列列表.map((series) => series.来源类型 === 'canon'
        ? { ...series, 激活注入: false, updatedAt: Date.now() }
        : series),
      当前系列ID: normalized.当前系列ID,
      当前进度: normalized.当前进度,
    });
  }

  const anchor = getOpeningStoryWeavingAnchor(archive.章节锚点ID);
  if (!anchor) return normalized;
  const targetSeries = normalized.系列列表.find((series) => series.id === anchor.seriesId || series.内置预设ID === anchor.seriesId);
  if (!targetSeries) return normalized;
  const targetSegment = targetSeries.分段列表.find((segment) => segment.组号 === anchor.segmentGroup)
    ?? targetSeries.分段列表.find((segment) => segment.运行状态 === '当前')
    ?? targetSeries.分段列表[0];
  if (!targetSegment) return normalized;

  const now = Date.now();
  const nextSeriesList = normalized.系列列表.map((series) => {
    if (series.id !== targetSeries.id) return series;
    return 归一化剧情编织系列({
      ...series,
      激活注入: true,
      当前分段组号: targetSegment.组号,
      当前阶段概括: archive.章节参考说明 || series.当前阶段概括,
      分段列表: series.分段列表.map((segment) => {
        if (segment.id === targetSegment.id) {
          return { ...segment, 运行状态: '当前' as const, updatedAt: now };
        }
        if (segment.组号 < targetSegment.组号 && segment.运行状态 !== '已偏离') {
          return { ...segment, 运行状态: '已跳过' as const, updatedAt: now };
        }
        return { ...segment, 运行状态: segment.运行状态 === '当前' ? '未开始' as const : segment.运行状态, updatedAt: now };
      }),
      updatedAt: now,
    });
  });

  return 归一化剧情编织系统({
    系列列表: nextSeriesList,
    当前系列ID: targetSeries.id,
    当前进度: {
      当前系列ID: targetSeries.id,
      当前分段ID: targetSegment.id,
      当前分段组号: targetSegment.组号,
      推进状态: '推进中',
      已完成摘要: [],
      当前待解问题: targetSegment.给后续参考.slice(0, 8),
      切换说明: [
        `开局章节锚点：${archive.地区名称} / ${archive.章节锚点名称}`,
        anchor.note,
      ],
      历史归档: [],
      最近门禁结果: 'soft',
      最近判定理由: [
        `新开局按章节锚点「${archive.章节锚点ID}」定位到内置剧情轨道「${targetSeries.标题}」第 ${targetSegment.组号} 段。`,
      ],
      最近一次推进判定回合: 0,
      推进证据: [archive.章节参考说明, archive.玩家介入原文].filter(Boolean).slice(0, 4),
      连续推进证据回合: 0,
      卡段回合数: 0,
      updatedAt: now,
    },
  });
}

export async function loadBundledStoryWeavingPreset(preset: BundledStoryWeavingPreset): Promise<剧情编织系列 | null> {
  const decomposed = await loadDecomposedCanonSeries(preset.id);
  if (decomposed) return decomposed;

  const zhikuPreset = bundledZhikuPresets.find((item) => item.id === preset.zhikuPresetId);
  if (!zhikuPreset) return null;
  const system = await loadBundledZhikuPreset(zhikuPreset);
  const storyEntries = system.条目
    .filter((entry) => entry.分类 === 'story')
    .sort(compareStoryEntries);
  if (!storyEntries.length) return null;
  return buildCanonSeriesFromZhikuEntries(preset, storyEntries);
}

export async function loadAllBundledStoryWeavingPresets(): Promise<剧情编织系统> {
  const series: 剧情编织系列[] = [];
  for (const preset of bundledStoryWeavingPresets) {
    const loaded = await loadBundledStoryWeavingPreset(preset);
    if (loaded) series.push(loaded);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  if (series.length !== bundledStoryWeavingPresets.length) {
    throw new Error(`内置原著剧情资源不完整：${series.length}/${bundledStoryWeavingPresets.length}`);
  }
  return 归一化剧情编织系统({
    系列列表: series,
    当前系列ID: CANON_START_SERIES_ID,
  });
}

type PersistedStoryWeavingSystem = 剧情编织系统 & { persistenceVersion?: number };

function preferSavedText(saved: string, bundled: string): string {
  return saved.trim() ? saved : bundled;
}

function preferSavedList<T>(saved: T[], bundled: T[]): T[] {
  return saved.length ? saved : bundled;
}

function mergeCanonKeyEvents(
  savedEvents: 剧情编织分段['关键事件'],
  bundledEvents: 剧情编织分段['关键事件'],
): 剧情编织分段['关键事件'] {
  if (!savedEvents.length) return bundledEvents;
  const usedSavedIndexes = new Set<number>();
  const merged = bundledEvents.map((bundledEvent, bundledIndex) => {
    let savedIndex = savedEvents.findIndex((event, index) =>
      !usedSavedIndexes.has(index) && event.事件名 === bundledEvent.事件名,
    );
    if (savedIndex < 0 && savedEvents[bundledIndex] && !usedSavedIndexes.has(bundledIndex)) {
      savedIndex = bundledIndex;
    }
    if (savedIndex < 0) return bundledEvent;
    usedSavedIndexes.add(savedIndex);
    const savedEvent = savedEvents[savedIndex];
    return {
      ...bundledEvent,
      ...savedEvent,
      事件名: preferSavedText(savedEvent.事件名, bundledEvent.事件名),
      事件说明: preferSavedText(savedEvent.事件说明, bundledEvent.事件说明),
      前置条件: preferSavedList(savedEvent.前置条件, bundledEvent.前置条件),
      触发条件: preferSavedList(savedEvent.触发条件, bundledEvent.触发条件),
      阻断条件: preferSavedList(savedEvent.阻断条件, bundledEvent.阻断条件),
      事件结果: preferSavedList(savedEvent.事件结果, bundledEvent.事件结果),
      对后续影响: preferSavedList(savedEvent.对后续影响, bundledEvent.对后续影响),
    };
  });
  savedEvents.forEach((event, index) => {
    if (!usedSavedIndexes.has(index)) merged.push(event);
  });
  return merged;
}

/**
 * R3 替换（完整主线资产重生成）后：内置 canon 静态剧情内容以新版 bundled asset 为唯一权威。
 * 旧档只保留运行相关状态：分段运行状态、启用/暂停状态、处理状态与更新时间；
 * 结构化内容（本段概括/结束状态/关键事件/档案等）一律采用新版内置资产，旧档非空文本不再覆盖。
 * 玩家自制剧情（来源类型 !== 'canon'）仍完全以存档内容为准。
 */
function mergeCanonSegment(
  bundled: 剧情编织分段,
  saved: 剧情编织分段,
): 剧情编织分段 {
  return {
    ...bundled,
    处理状态: saved.处理状态 ?? bundled.处理状态,
    运行状态: saved.运行状态 ?? bundled.运行状态,
    启用注入: saved.启用注入 ?? bundled.启用注入,
    最近错误: saved.最近错误,
    updatedAt: Math.max(Number(saved.updatedAt) || 0, Number(bundled.updatedAt) || 0),
  };
}

export function mergeBundledStoryWeavingPresets(saved: 剧情编织系统 | null | undefined, bundled: 剧情编织系统): 剧情编织系统 {
  if (!saved?.系列列表?.length) return bundled;
  const persistenceVersion = Number((saved as PersistedStoryWeavingSystem).persistenceVersion) || 0;
  const normalizedSaved = 归一化剧情编织系统(saved);
  const savedById = new Map(normalizedSaved.系列列表.map((series) => [series.id, series]));
  const customSeries = normalizedSaved.系列列表.filter((series) => series.来源类型 !== 'canon' || !series.内置预设ID);
  const mergedCanon = bundled.系列列表.map((presetSeries) => {
    const savedSeries = savedById.get(presetSeries.id);
    if (!savedSeries) return presetSeries;
    const savedSegments = new Map(savedSeries.分段列表.map((segment) => [segment.id, segment]));
    const mergedSegments = presetSeries.分段列表.map((segment) => {
      const savedSegment = savedSegments.get(segment.id);
      if (!savedSegment) return segment;
      if (persistenceVersion === 2) {
        return {
          ...segment,
          启用注入: savedSegment.启用注入,
          处理状态: savedSegment.处理状态,
          运行状态: savedSegment.运行状态,
          updatedAt: savedSegment.updatedAt,
        };
      }
      return mergeCanonSegment(segment, savedSegment);
    });
    if (persistenceVersion === 2) {
      return 归一化剧情编织系列({
        ...presetSeries,
        激活注入: savedSeries.激活注入,
        当前分段组号: savedSeries.当前分段组号,
        当前阶段概括: savedSeries.当前阶段概括,
        分段列表: mergedSegments,
        createdAt: savedSeries.createdAt,
        updatedAt: Math.max(savedSeries.updatedAt, presetSeries.updatedAt),
      });
    }
    return 归一化剧情编织系列({
      ...presetSeries,
      ...savedSeries,
      来源智库条目ID: presetSeries.来源智库条目ID,
      来源文件名: presetSeries.来源文件名,
      原始文本: presetSeries.原始文本,
      章节列表: presetSeries.章节列表,
      分段列表: mergedSegments,
      updatedAt: Math.max(savedSeries.updatedAt, presetSeries.updatedAt),
    });
  });
  return 归一化剧情编织系统({
    系列列表: [...mergedCanon, ...customSeries],
    当前系列ID: normalizedSaved.当前系列ID || bundled.当前系列ID,
    当前进度: normalizedSaved.当前进度 ?? bundled.当前进度,
  });
}

export function buildPersistedStoryWeavingSystem(system: 剧情编织系统): 剧情编织系统 {
  const normalized = 归一化剧情编织系统(system);
  return {
    persistenceVersion: 3,
    系列列表: normalized.系列列表.map((series) => {
      if (series.来源类型 !== 'canon') return series;
      return {
        ...series,
        来源智库条目ID: [],
        原始文本: undefined,
        章节列表: [],
        分段列表: series.分段列表.map((segment) => {
          const { 原文内容: _originalContent, ...persistedSegment } = segment;
          return persistedSegment;
        }),
      } as unknown as 剧情编织系列;
    }),
    当前系列ID: normalized.当前系列ID,
    当前进度: normalized.当前进度,
  } as 剧情编织系统;
}

export function hydratePersistedStoryWeavingSystem(
  saved: 剧情编织系统 | null | undefined,
  bundled: 剧情编织系统,
): 剧情编织系统 {
  if (!saved?.系列列表?.length) return bundled;
  const canonBaseline = 归一化剧情编织系统({
    ...bundled,
    系列列表: bundled.系列列表.filter((series) => series.来源类型 === 'canon'),
  });
  return mergeBundledStoryWeavingPresets(saved, canonBaseline);
}

/**
 * 旧存档读档兼容：
 * - 存档已有剧情编织时，以存档游标/运行状态为准，只用当前内置资产补齐缺失内容；
 * - 存档完全没有剧情编织时，才按开局档案建立初始锚点；
 * - 不读取聊天正文，不执行自动推进，也不补造旧回合事实。
 */
export function restoreStoryWeavingForLoadedSave(
  saved: 剧情编织系统 | null | undefined,
  bundled: 剧情编织系统,
  archive?: 开局档案,
): 剧情编织系统 {
  const normalizedSaved = 归一化剧情编织系统(saved);
  const normalizedBundled = 归一化剧情编织系统(bundled);
  const bundledCanon = 归一化剧情编织系统({
    系列列表: normalizedBundled.系列列表.filter((series) => series.来源类型 === 'canon'),
    当前系列ID: normalizedBundled.当前系列ID,
  });
  if (!normalizedSaved.系列列表.length) {
    return alignStoryWeavingToOpeningArchive(bundledCanon, archive);
  }
  if (!bundledCanon.系列列表.length) return normalizedSaved;
  return hydratePersistedStoryWeavingSystem(saved, bundledCanon);
}

export function isSelfContainedStoryWeavingSystem(system: 剧情编织系统 | null | undefined): boolean {
  if (!system?.系列列表?.length) return false;
  const normalized = 归一化剧情编织系统(system);
  return normalized.系列列表.every((series) => series.来源类型 !== 'canon' || (
    series.章节列表.length > 0
    && series.分段列表.length > 0
    && series.分段列表.every((segment) => segment.原文内容.trim().length > 0)
  ));
}

function getCanonResourceUrl(presetId: string): string {
  const relativePath = `data/story-weaving-canon/${presetId}.json`;
  if (typeof document !== 'undefined') {
    const moduleScriptUrl = document.querySelector<HTMLScriptElement>('script[type="module"][src]')?.src;
    if (moduleScriptUrl) return new URL(`../${relativePath}`, moduleScriptUrl).toString();
    return new URL(`/${relativePath}`, document.location.origin).toString();
  }
  return `/${relativePath}`;
}

async function fetchDecomposedCanonSeries(presetId: string): Promise<剧情编织系列 | null> {
  let lastError: unknown;
  for (const cache of ['force-cache', 'reload'] as const) {
    try {
      const response = await fetch(getCanonResourceUrl(presetId), { cache });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json() as 剧情编织系列;
    } catch (error) {
      lastError = error;
    }
  }
  console.warn(`[story-weaving] 内置原著资源加载失败：${presetId}`, lastError);
  return null;
}

async function loadDecomposedCanonSeries(presetId: string): Promise<剧情编织系列 | null> {
  const series = await fetchDecomposedCanonSeries(presetId);
  if (!series) return null;
  return 归一化剧情编织系列({
    ...series,
    来源类型: 'canon',
    内置预设ID: presetId,
    激活注入: series.激活注入 !== false,
  });
}

function buildCanonSeriesFromZhikuEntries(preset: BundledStoryWeavingPreset, entries: 智库条目[]): 剧情编织系列 {
  const now = 1779580800000;
  const openingFacts = buildCanonOpeningFacts(preset);
  const chapters = entries.map((entry, index) => {
    const content = entry.原文.trim() || entry.摘要.trim();
    return {
      id: `${preset.id}_chapter_${entry.章节序号 ?? index + 1}`,
      序号: entry.章节序号 ?? index + 1,
      标题: entry.标题,
      内容: content,
      字数: [...content].length,
    };
  });
  const segments: 剧情编织分段[] = entries.map((entry, index) => {
    const order = entry.章节序号 ?? index + 1;
    const raw = entry.原文.trim() || entry.摘要.trim();
    const fallbackEndStates = buildCanonFallbackEndStates(entry, index, entries);
    const fallbackEventResults = buildCanonFallbackEventResults(entry, fallbackEndStates);
    return {
      id: `${preset.id}_segment_${order}`,
      组号: order,
      标题: entry.标题,
      章节范围: `第${order}章`,
      章节标题: [entry.标题],
      是否开局组: index === 0,
      起始章序号: order,
      结束章序号: order,
      启用注入: true,
      原文内容: raw,
      字数: [...raw].length,
      原文摘要: entry.摘要,
      本段概括: entry.摘要,
      时间线起点: '',
      时间线终点: '',
      开局已成立事实: index === 0 ? openingFacts : [],
      前段延续事实: index > 0 ? [entries[index - 1]?.摘要 || '前一段剧情已经发生，当前段应承接其后果。'] : [],
      本段结束状态: fallbackEndStates,
      给后续参考: index < entries.length - 1 ? [entries[index + 1]?.摘要 || '后续剧情仍需按当前系列继续推进。'] : [],
      原著硬约束: [
        {
          内容: '这是内置原著剧情轨道，主剧情应承接其方向，但不能无视玩家已经造成的 IF 偏离。',
          信息可见性: { 谁知道: [], 谁不知道: [], 是否仅读者视角可见: false },
        },
      ],
      可提前铺垫: index < entries.length - 1 && entries[index + 1]?.摘要
        ? [
            {
              内容: entries[index + 1].摘要,
              信息可见性: { 谁知道: [], 谁不知道: [], 是否仅读者视角可见: true },
            },
          ]
        : [],
      登场角色: extractKnownNames(entry),
      涉及地点: extractKnownLocations(entry),
      涉及派系: extractKnownFactions(entry),
      角色档案: [],
      势力档案: [],
      地图地点档案: [],
      关键事件: [
        {
          事件名: entry.标题,
          事件说明: entry.摘要 || entry.标题,
          前置条件: [],
          触发条件: [],
          阻断条件: ['玩家已经历、跳过或偏离该段剧情时，不得重新作为当前剧情注入。'],
          事件结果: fallbackEventResults,
          对后续影响: index < entries.length - 1 && entries[index + 1]?.摘要 ? [entries[index + 1].摘要] : [],
          信息可见性: { 谁知道: [], 谁不知道: [], 是否仅读者视角可见: false },
        },
      ],
      时间线: [],
      角色推进: [],
      处理状态: '已完成',
      运行状态: index === 0 ? '当前' : '未开始',
      updatedAt: now,
    };
  });
  return 归一化剧情编织系列({
    id: preset.id,
    标题: preset.title,
    作品名: preset.title,
    来源类型: 'canon',
    来源智库条目ID: entries.map((entry) => entry.id),
    内置预设ID: preset.id,
    来源文件名: `${preset.zhikuPresetId}.json`,
    原始文本: entries.map((entry) => entry.原文).filter(Boolean).join('\n\n'),
    章节列表: chapters,
    分段列表: segments,
    每段章数: 1,
    激活注入: true,
    当前分段组号: 1,
    createdAt: now,
    updatedAt: now,
  });
}

function compareStoryEntries(a: 智库条目, b: 智库条目): number {
  const orderA = a.章节序号 ?? Number.MAX_SAFE_INTEGER;
  const orderB = b.章节序号 ?? Number.MAX_SAFE_INTEGER;
  return orderA - orderB || a.标题.localeCompare(b.标题, 'zh-Hans-CN');
}

function buildCanonOpeningFacts(preset: BundledStoryWeavingPreset): string[] {
  if (preset.id.includes('jarilo') || preset.id.includes('belobog')) {
    return ['雅利洛-VI 与贝洛伯格相关主线已成为当前剧情轨道；黑塔空间站序章只作为前置背景，不作为当前开局现场。'];
  }
  if (preset.id.includes('xianzhou') || preset.id.includes('luofu')) {
    return ['仙舟罗浮相关主线已成为当前剧情轨道；黑塔空间站与雅利洛-VI 主线只作为前置背景，不作为当前开局现场。'];
  }
  if (preset.id.includes('penacony')) {
    return ['匹诺康尼相关主线已成为当前剧情轨道；此前主线只作为前置背景，不作为当前开局现场。'];
  }
  if (preset.id.includes('herta')) {
    return ['黑塔空间站正遭遇反物质军团入侵，星核猎手正在按剧本行动。'];
  }
  return ['当前内置剧情轨道已按所选系列启动；其他地区主线只作为前置背景，不作为当前开局现场。'];
}

function buildCanonFallbackEndStates(entry: 智库条目, index: number, entries: 智库条目[]): string[] {
  const title = entry.标题.trim() || `第${entry.章节序号 ?? index + 1}段`;
  const text = `${entry.标题}\n${entry.摘要}\n${entry.关键词.join(' ')}`;
  const states: string[] = [];

  const matched = [
    { pattern: /末日兽|boss|首领|敌人|虚卒|反物质军团|战斗|击败|击退/u, state: `${title}的主要战斗或危机已被处理，敌对压力暂时解除` },
    { pattern: /登上|列车|星穹列车|跃迁|启程|旅途/u, state: `${title}的登车或启程节点已完成，剧情可进入下一站` },
    { pattern: /星核|封印|植入|取出|容器/u, state: `${title}围绕星核的核心操作已完成并产生后续承接事实` },
    { pattern: /会面|接见|谈判|对话|审问|交涉/u, state: `${title}的关键会面或对话已完成，双方立场与下一步目标已明确` },
    { pattern: /抵达|进入|前往|来到|登陆|停靠|空港|雪原|矿区|主控舱段|监控室/u, state: `${title}的地点转移已完成，主要角色已抵达本段目标区域` },
    { pattern: /机关|门|封印|阵基|能源|密钥|通道|栈桥|灯/u, state: `${title}的机关或通行障碍已被确认并处理到可进入下一阶段` },
    { pattern: /加入|离队|汇合|重聚|同行|引路|接渡/u, state: `${title}的队伍关系变化已成立，同行或离队状态已明确` },
    { pattern: /真相|线索|调查|发现|确认|获知|定位/u, state: `${title}的核心线索已被确认，下一步调查方向已明确` },
  ];

  for (const item of matched) {
    if (item.pattern.test(text)) states.push(item.state);
    if (states.length >= 3) break;
  }

  if (!states.length) states.push(`${title}的核心事件已在正文台前完成或被玩家明确越过`);
  states.push(`玩家已处理、跳过或偏离「${title}」时，本段只能作为历史参考，不得再次作为当前段复演`);
  if (index < entries.length - 1) {
    const nextTitle = entries[index + 1]?.标题?.trim();
    if (nextTitle) states.push(`剧情可以承接到后续分段「${nextTitle}」`);
  }
  return dedupeText(states, 4);
}

function buildCanonFallbackEventResults(entry: 智库条目, endStates: string[]): string[] {
  const title = entry.标题.trim() || '当前分段';
  return dedupeText([
    endStates[0] || `${title}的核心事件已完成`,
    `「${title}」的结果只作为防重复与后续承接参考，不代表强制复演原著段落`,
  ], 3);
}

function dedupeText(items: string[], maxCount: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const text = item.trim();
    if (!text) continue;
    const key = text.replace(/\s+/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
    if (result.length >= maxCount) break;
  }
  return result;
}

function extractKnownNames(entry: 智库条目): string[] {
  const text = `${entry.标题}\n${entry.摘要}\n${entry.关键词.join(' ')}`;
  return [
    '开拓者', '卡芙卡', '银狼', '三月七', '丹恒', '姬子', '瓦尔特', '帕姆',
    '艾丝妲', '阿兰', '黑塔',
    '可可利亚', '布洛妮娅', '希儿', '桑博', '娜塔莎', '杰帕德', '佩拉', '史瓦罗',
    '停云', '驭空', '符玄', '景元', '彦卿', '白露', '青雀', '素裳', '罗刹', '丹枢', '幻胧',
    '星期日', '知更鸟', '砂金', '黑天鹅', '流萤', '黄泉', '加拉赫', '花火', '米沙',
  ]
    .filter((name) => text.includes(name));
}

function extractKnownLocations(entry: 智库条目): string[] {
  const text = `${entry.标题}\n${entry.摘要}\n${entry.关键词.join(' ')}`;
  return [
    '黑塔空间站', '星穹列车',
    '雅利洛-Ⅵ', '雅利洛-VI', '贝洛伯格', '下层区', '上层区', '行政区', '磐岩镇', '大矿区', '永冬岭',
    '仙舟罗浮', '罗浮', '星槎海', '流云渡', '长乐天', '太卜司', '工造司', '丹鼎司', '鳞渊境', '建木',
    '匹诺康尼', '白日梦酒店', '黄金的时刻', '梦境边界', '筑梦边缘', '热砂海选会场', '匹诺康尼大剧院',
  ]
    .filter((name) => text.includes(name));
}

function extractKnownFactions(entry: 智库条目): string[] {
  const text = `${entry.标题}\n${entry.摘要}\n${entry.关键词.join(' ')}`;
  return [
    '星核猎手', '星穹列车', '反物质军团', '黑塔空间站',
    '银鬃铁卫', '地火', '星际和平公司',
    '云骑军', '太卜司', '丹鼎司', '工造司', '十王司',
    '家族', '猎犬家系', '橡木家系', '巡海游侠',
  ]
    .filter((name) => text.includes(name));
}
