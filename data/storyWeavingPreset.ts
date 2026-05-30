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

const decomposedOnlyStoryWeavingPresets: BundledStoryWeavingPreset[] = [
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
];

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
  }))
  .concat(decomposedOnlyStoryWeavingPresets);

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

let decomposedCanonSystemCache: 剧情编织系统 | null | undefined;

async function loadDecomposedCanonSystem(): Promise<剧情编织系统 | null> {
  if (decomposedCanonSystemCache !== undefined) return decomposedCanonSystemCache;
  try {
    const module = await import('@/data/storyWeavingCanonDecomposed.json');
    decomposedCanonSystemCache = module.default as unknown as 剧情编织系统;
  } catch {
    decomposedCanonSystemCache = null;
  }
  return decomposedCanonSystemCache;
}

async function loadDecomposedCanonSeries(presetId: string): Promise<剧情编织系列 | null> {
  const system = await loadDecomposedCanonSystem();
  if (!system) return null;
  const series = system.系列列表?.find((item) => item.id === presetId || item.内置预设ID === presetId);
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
      开局已成立事实: index === 0 ? ['黑塔空间站正遭遇反物质军团入侵，星核猎手正在按剧本行动。'] : [],
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
