import type { 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';
import { 构造剧情编织系列, 构造剧情编织系统, 归一化剧情编织系统, 归一化剧情编织系列 } from '@/models/storyWeaving';
import type { 开局档案 } from '@/models/world';
import { loadAllOrThrow, type ResourceProgress } from '@/data/resourceBundle';

export const bundledStoryWeavingPresets: BundledStoryWeavingPreset[] = [
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
    id: 'story_canon_side_herta_crown_of_mundane_and_divine',
    title: '【支线】黑塔空间站-庸与神的冠冕',
    description: '已分解内置剧情编织：黑塔空间站版本活动剧情。',
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

/**
 * 开局章节锚点 → 内置原著系列/分段组。
 * 数据真源：`bundledStoryWeavingPresets` 列出的系列 + `public/data/story-weaving-canon/<内置预设ID>.json`；
 * `data/storyWeavingCanonDecomposed.json` 是历史归档快照，运行时加载器不读取（由 story-weaving-canon-integrity 测试锁定）。
 * 一个系列可承载多个锚点（同一章节的多个官方预设，或同一系列的多个开局阶段），这是有意复用，不另建重复系列。
 */
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
  // 该章节锚点同时服务 official_amphoreus_falling_wood 与 official_amphoreus_refugee 两个官方预设，二者共享此系列第 1 段。
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
  planarcadia_welcome: {
    seriesId: 'story_canon_erxiang_paradise_1_welcome',
    segmentGroup: 1,
    note: '二相乐园其一开局，从列车抵达乐园、幻月满盈与欢迎广播注入。',
  },
  planarcadia_pigeon_river: {
    seriesId: 'story_canon_erxiang_paradise_2_out_of_control',
    segmentGroup: 1,
    note: '二相乐园其二开局，从鸽川区共愿帮灭门、告死魔模仿犯与公司调查线注入。',
  },
  planarcadia_academy: {
    // 有意复用：绘世学院线属于二相乐园其一系列（第 3 段），与 planarcadia_welcome 共享同一系列，不新建重复系列。
    seriesId: 'story_canon_erxiang_paradise_1_welcome',
    segmentGroup: 3,
    note: '二相乐园其一绘世学院开局，从真珠临摹绘世遗作、模因病毒与火花大会前置注入。',
  },
  planarcadia_ink_residue: {
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

export function getOpeningStoryWeavingAnchor(chapterId?: string): { seriesId: string; segmentGroup: number; note: string } | undefined {
  const id = chapterId?.trim();
  return id ? OPENING_STORY_WEAVING_ANCHORS[id] : undefined;
}

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
    ?? targetSeries.分段列表.at(0);
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

/**
 * 网络段：取回全部内置原著原文（响应体读完即计数），不做解析。
 */
export async function fetchAllBundledStoryWeavingPresetsText(
  onProgress?: ResourceProgress,
): Promise<string[]> {
  return loadAllOrThrow({
    items: bundledStoryWeavingPresets,
    fetchOne: fetchCanonSeries,
    label: (preset) => preset.id,
    onProgress,
  });
}

/**
 * 加工段：解析 + 可信构造。无进度上报（进度只属于网络段）。
 */
export function 加工内置原著系列(texts: readonly string[]): 剧情编织系统 {
  const series = bundledStoryWeavingPresets.map((preset, index) => 构造CanonSeries(preset, texts[index]));
  return 构造剧情编织系统({
    系列列表: series,
    当前系列ID: CANON_START_SERIES_ID,
  });
}

/**
 * 载入全部内置原著剧情系列。真源是 `public/data/story-weaving-canon/<预设ID>.json`，
 * 缺任何一个文件即整体失败——没有「从智库条目合成」的降级版本。
 */
export async function loadAllBundledStoryWeavingPresets(
  onProgress?: ResourceProgress,
): Promise<剧情编织系统> {
  return 加工内置原著系列(await fetchAllBundledStoryWeavingPresetsText(onProgress));
}

type PersistedStoryWeavingSystem = 剧情编织系统 & { persistenceVersion?: number };

export function mergeBundledStoryWeavingPresets(saved: 剧情编织系统 | null | undefined, bundled: 剧情编织系统): 剧情编织系统 {
  if (!saved?.系列列表.length) return bundled;
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
      return {
        ...segment,
        ...savedSegment,
        原文内容: segment.原文内容,
        字数: segment.字数,
      };
    });
    if (persistenceVersion === 2) {
      return 构造剧情编织系列({
        ...presetSeries,
        激活注入: savedSeries.激活注入,
        当前分段组号: savedSeries.当前分段组号,
        当前阶段概括: savedSeries.当前阶段概括,
        分段列表: mergedSegments,
        createdAt: savedSeries.createdAt,
        updatedAt: Math.max(savedSeries.updatedAt, presetSeries.updatedAt),
      });
    }
    return 构造剧情编织系列({
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
  return 构造剧情编织系统({
    系列列表: [...mergedCanon, ...customSeries],
    当前系列ID: normalizedSaved.当前系列ID || bundled.当前系列ID,
    当前进度: normalizedSaved.当前进度 ?? bundled.当前进度,
  });
}

/**
 * 持久化投影：剥掉正文与章节、只留运行态，输入必须是**可信构造结果**。
 * 不含归一化——保存链路的边界归一化由调用方在入口完成。
 */
export function 投影持久化剧情编织系统(system: 剧情编织系统): 剧情编织系统 {
  return {
    persistenceVersion: 3,
    系列列表: system.系列列表.map((series) => {
      if (series.来源类型 !== 'canon') return series;
      return {
        ...series,
        来源智库条目ID: [],
        原始文本: undefined,
        章节列表: [],
        分段列表: series.分段列表.map((segment) => {
          const persistedSegment = { ...segment } as { 原文内容?: string };
          delete persistedSegment.原文内容;
          return persistedSegment;
        }),
      } as unknown as 剧情编织系列;
    }),
    当前系列ID: system.当前系列ID,
    当前进度: system.当前进度,
  } as 剧情编织系统;
}

/**
 * 保存边界：运行时多个入口传入的状态可能未经归一化，先归一化再投影。
 * 启动链路已知输入可信，应直接调用 投影持久化剧情编织系统，避免 27 个系列被重建一遍。
 */
export function buildPersistedStoryWeavingSystem(system: 剧情编织系统): 剧情编织系统 {
  return 投影持久化剧情编织系统(归一化剧情编织系统(system));
}

export function hydratePersistedStoryWeavingSystem(
  saved: 剧情编织系统 | null | undefined,
  bundled: 剧情编织系统,
): 剧情编织系统 {
  if (!saved?.系列列表.length) return bundled;
  const canonBaseline = 构造剧情编织系统({
    系列列表: bundled.系列列表.filter((series) => series.来源类型 === 'canon'),
    当前系列ID: bundled.当前系列ID,
    当前进度: bundled.当前进度,
    运行时: bundled.运行时,
  });
  return mergeBundledStoryWeavingPresets(saved, canonBaseline);
}

export function isSelfContainedStoryWeavingSystem(system: 剧情编织系统 | null | undefined): boolean {
  if (!system?.系列列表.length) return false;
  return system.系列列表.every((series) => series.来源类型 !== 'canon' || (
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

/**
 * 网络段：取回单个原著文件（响应体读完才 resolve）。
 */
async function fetchCanonSeries(preset: BundledStoryWeavingPreset): Promise<string> {
  const response = await fetch(getCanonResourceUrl(preset.id));
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

/** 加工段单文件：解析 + 可信构造，不逐字段清洗（仓内文件已是运行时形状）。 */
function 构造CanonSeries(preset: BundledStoryWeavingPreset, text: string): 剧情编织系列 {
  const raw = JSON.parse(text) as 剧情编织系列;
  return 构造剧情编织系列({
    ...raw,
    来源类型: 'canon',
    内置预设ID: preset.id,
  });
}

