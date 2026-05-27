import type { 智库条目 } from '@/models/zhiku';
import type { 剧情编织分段, 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化剧情编织系统, 归一化剧情编织系列 } from '@/models/storyWeaving';
import { bundledZhikuPresets, loadBundledZhikuPreset } from '@/data/zhikuPreset';

const STORY_PRESET_IDS = new Set([
  'zhiku_herta_station_chapter1',
  'zhiku_jarilo_vi_chapters',
  'zhiku_jarilo_vi_sunrise_chapters',
  'zhiku_xianzhou_luofu_travel_chapters',
  'zhiku_xianzhou_luofu_cloud_tree_chapters',
  'zhiku_xianzhou_luofu_aftermath_chapters',
]);

const CANON_START_SERIES_ID = 'story_canon_zhiku_herta_station_chapter1';

export interface BundledStoryWeavingPreset {
  id: string;
  title: string;
  description: string;
  zhikuPresetId: string;
}

export const bundledStoryWeavingPresets: BundledStoryWeavingPreset[] = bundledZhikuPresets
  .filter((preset) => STORY_PRESET_IDS.has(preset.id))
  .map((preset) => ({
    id: `story_canon_${preset.id}`,
    title: preset.title,
    description: preset.description,
    zhikuPresetId: preset.id,
  }));

export async function loadBundledStoryWeavingPreset(preset: BundledStoryWeavingPreset): Promise<剧情编织系列 | null> {
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
  const series = await Promise.all(bundledStoryWeavingPresets.map(loadBundledStoryWeavingPreset));
  return 归一化剧情编织系统({
    系列列表: series.filter((item): item is 剧情编织系列 => Boolean(item)),
    当前系列ID: CANON_START_SERIES_ID,
  });
}

export function mergeBundledStoryWeavingPresets(saved: 剧情编织系统 | null | undefined, bundled: 剧情编织系统): 剧情编织系统 {
  if (!saved?.系列列表?.length) return bundled;
  const savedById = new Map(saved.系列列表.map((series) => [series.id, series]));
  const customSeries = saved.系列列表.filter((series) => series.来源类型 !== 'canon' || !series.内置预设ID);
  const mergedCanon = bundled.系列列表.map((presetSeries) => {
    const savedSeries = savedById.get(presetSeries.id);
    if (!savedSeries) return presetSeries;
    const savedSegments = new Map(savedSeries.分段列表.map((segment) => [segment.id, segment]));
    return 归一化剧情编织系列({
      ...presetSeries,
      激活注入: savedSeries.激活注入,
      当前分段组号: savedSeries.当前分段组号,
      分段列表: presetSeries.分段列表.map((segment) => {
        const savedSegment = savedSegments.get(segment.id);
        return savedSegment
          ? {
              ...segment,
              启用注入: savedSegment.启用注入,
              运行状态: savedSegment.运行状态,
              updatedAt: savedSegment.updatedAt,
            }
          : segment;
      }),
      createdAt: savedSeries.createdAt,
      updatedAt: Math.max(savedSeries.updatedAt, presetSeries.updatedAt),
    });
  });
  return 归一化剧情编织系统({
    系列列表: [...mergedCanon, ...customSeries],
    当前系列ID: saved.当前系列ID || bundled.当前系列ID,
  });
}

function buildCanonSeriesFromZhikuEntries(preset: BundledStoryWeavingPreset, entries: 智库条目[]): 剧情编织系列 {
  const now = 1779580800000;
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
      开局已成立事实: index === 0 ? ['黑塔空间站正遭遇反物质军团入侵，星核猎手正在按剧本行动。'] : [],
      前段延续事实: index > 0 ? [entries[index - 1]?.摘要 || '前一段剧情已经发生，当前段应承接其后果。'] : [],
      本段结束状态: entry.摘要 ? [entry.摘要] : [],
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
          事件结果: entry.摘要 ? [entry.摘要] : [],
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

function extractKnownNames(entry: 智库条目): string[] {
  const text = `${entry.标题}\n${entry.摘要}\n${entry.关键词.join(' ')}`;
  return ['开拓者', '卡芙卡', '银狼', '三月七', '丹恒', '姬子', '瓦尔特', '帕姆', '艾丝妲', '阿兰', '黑塔', '可可利亚', '布洛妮娅', '希儿', '桑博', '娜塔莎']
    .filter((name) => text.includes(name));
}

function extractKnownLocations(entry: 智库条目): string[] {
  const text = `${entry.标题}\n${entry.摘要}\n${entry.关键词.join(' ')}`;
  return ['黑塔空间站', '星穹列车', '雅利洛-Ⅵ', '贝洛伯格', '下层区', '上层区', '仙舟罗浮']
    .filter((name) => text.includes(name));
}

function extractKnownFactions(entry: 智库条目): string[] {
  const text = `${entry.标题}\n${entry.摘要}\n${entry.关键词.join(' ')}`;
  return ['星核猎手', '星穹列车', '反物质军团', '黑塔空间站', '银鬃铁卫', '地火', '星际和平公司']
    .filter((name) => text.includes(name));
}
