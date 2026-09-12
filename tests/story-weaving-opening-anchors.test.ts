import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  alignStoryWeavingToOpeningArchive,
  bundledStoryWeavingPresets,
  getOpeningStoryWeavingAnchor,
  loadAllBundledStoryWeavingPresets,
} from '@/data/storyWeavingPreset';
import {
  getOfficialOpeningPreset,
  getOfficialOpeningPresetsByRegion,
  getOpeningChapterAnchor,
} from '@/data/journeyPresets';
import { 根据官方开局预设创建开局档案 } from '@/models/world';
import type { 剧情编织系统, 剧情编织系列 } from '@/models/storyWeaving';

const CANON_DIR = path.join(process.cwd(), 'public', 'data', 'story-weaving-canon');

interface OfficialOpeningAlignment {
  presetId: string;
  chapterId: string;
  seriesId: string;
  segmentGroup: number;
  /** 共享章节或复用系列的有意设计说明；没有复用时省略。 */
  reuseNote?: string;
}

/**
 * 官方翁法罗斯/二相乐园预设的对齐真值表。
 * 注意两处有意复用：
 * - official_amphoreus_falling_wood 与 official_amphoreus_refugee 共享同一章节锚点；
 * - official_planarcadia_welcome 与 official_planarcadia_academy 复用二相乐园其一系列的不同分段。
 * 这些复用不新建重复系列，测试名会把复用意图显式写出来。
 */
const OFFICIAL_ALIGNMENTS: OfficialOpeningAlignment[] = [
  {
    presetId: 'official_amphoreus_falling_wood',
    chapterId: 'amphoreus_falling_wood',
    seriesId: 'story_canon_amphoreus_1_falling_wood',
    segmentGroup: 1,
    reuseNote: '与 official_amphoreus_refugee 共享章节锚点，收敛到同一系列第 1 段。',
  },
  {
    presetId: 'official_amphoreus_refugee',
    chapterId: 'amphoreus_falling_wood',
    seriesId: 'story_canon_amphoreus_1_falling_wood',
    segmentGroup: 1,
    reuseNote: '共享章节锚点是有意设计，不另建难民专属系列。',
  },
  {
    presetId: 'official_amphoreus_golden_thread',
    chapterId: 'amphoreus_gate_throne',
    seriesId: 'story_canon_amphoreus_2_gate_throne',
    segmentGroup: 1,
  },
  {
    presetId: 'official_amphoreus_styx',
    chapterId: 'amphoreus_sleeping_flowers',
    seriesId: 'story_canon_amphoreus_3_sleeping_flowers',
    segmentGroup: 6,
  },
  {
    presetId: 'official_amphoreus_loop',
    chapterId: 'amphoreus_sun_hurt',
    seriesId: 'story_canon_amphoreus_5_sun_hurt',
    segmentGroup: 1,
  },
  {
    presetId: 'official_planarcadia_welcome',
    chapterId: 'planarcadia_welcome',
    seriesId: 'story_canon_erxiang_paradise_1_welcome',
    segmentGroup: 1,
    reuseNote: '与 official_planarcadia_academy 复用二相乐园其一系列。',
  },
  {
    presetId: 'official_planarcadia_pigeon_river',
    chapterId: 'planarcadia_pigeon_river',
    seriesId: 'story_canon_erxiang_paradise_2_out_of_control',
    segmentGroup: 1,
  },
  {
    presetId: 'official_planarcadia_academy',
    chapterId: 'planarcadia_academy',
    seriesId: 'story_canon_erxiang_paradise_1_welcome',
    segmentGroup: 3,
    reuseNote: '绘世学院线属于二相乐园其一系列，有意复用而不新建重复系列。',
  },
  {
    presetId: 'official_planarcadia_ink_residue',
    chapterId: 'planarcadia_ink_residue',
    seriesId: 'story_canon_erxiang_paradise_5_whistle',
    segmentGroup: 5,
  },
];

function stubCanonFetch(): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = url.match(/story-weaving-canon\/([^/]+\.json)$/u);
    if (!match) return new Response(null, { status: 404 });
    try {
      const body = await readFile(path.join(CANON_DIR, match[1]), 'utf8');
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

function requirePreset(id: string) {
  const preset = getOfficialOpeningPreset(id);
  if (!preset) throw new Error(`缺少官方开局预设：${id}`);
  return preset;
}

function requireSeries(system: 剧情编织系统, id: string): 剧情编织系列 {
  const series = system.系列列表.find((item) => item.id === id);
  if (!series) throw new Error(`缺少内置剧情系列：${id}`);
  return series;
}

function normalizeChapterPhase(text: string): string {
  return text.replace(/[「」\s]/gu, '');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('翁法罗斯与二相乐园官方开局对齐', () => {
  it('对齐真值表覆盖两个地区的全部官方预设', () => {
    const presetIds = [
      ...getOfficialOpeningPresetsByRegion('amphoreus'),
      ...getOfficialOpeningPresetsByRegion('planarcadia'),
    ].map((preset) => preset.id).sort();
    expect(OFFICIAL_ALIGNMENTS.map((entry) => entry.presetId).sort()).toEqual(presetIds);
  });

  it('每个官方预设按稳定预设 ID 对到自己的系列、分段组与章节正文', async () => {
    stubCanonFetch();
    const bundled = await loadAllBundledStoryWeavingPresets();
    for (const entry of OFFICIAL_ALIGNMENTS) {
      const preset = requirePreset(entry.presetId);
      const anchor = getOpeningStoryWeavingAnchor(entry.chapterId);
      expect(anchor?.seriesId).toBe(entry.seriesId);
      expect(anchor?.segmentGroup).toBe(entry.segmentGroup);
      const aligned = alignStoryWeavingToOpeningArchive(bundled, 根据官方开局预设创建开局档案(preset));
      expect(aligned.当前系列ID).toBe(entry.seriesId);
      expect(aligned.当前进度?.当前分段组号).toBe(entry.segmentGroup);
      const segment = requireSeries(aligned, entry.seriesId).分段列表.find((item) => item.组号 === entry.segmentGroup);
      if (!segment) throw new Error(`系列 ${entry.seriesId} 缺少第 ${entry.segmentGroup} 段`);
      const chapter = getOpeningChapterAnchor(entry.chapterId);
      if (!chapter?.officialChapterPhase) throw new Error(`章节锚点 ${entry.chapterId} 缺少官方阶段名`);
      expect(normalizeChapterPhase(segment.标题)).toContain(normalizeChapterPhase(chapter.officialChapterPhase));
    }
  });

  it('共享章节锚点的两个翁法罗斯预设保留各自身份，并有意收敛到同一系列同一起点', async () => {
    stubCanonFetch();
    const bundled = await loadAllBundledStoryWeavingPresets();
    const falling = requirePreset('official_amphoreus_falling_wood');
    const refugee = requirePreset('official_amphoreus_refugee');
    expect(falling.chapterId).toBe(refugee.chapterId);
    const fallingArchive = 根据官方开局预设创建开局档案(falling);
    const refugeeArchive = 根据官方开局预设创建开局档案(refugee);
    expect(fallingArchive.官方预设ID).not.toBe(refugeeArchive.官方预设ID);
    expect(fallingArchive.章节参考说明).not.toBe(refugeeArchive.章节参考说明);
    const fallingAligned = alignStoryWeavingToOpeningArchive(bundled, fallingArchive);
    const refugeeAligned = alignStoryWeavingToOpeningArchive(bundled, refugeeArchive);
    expect(fallingAligned.当前系列ID).toBe('story_canon_amphoreus_1_falling_wood');
    expect(refugeeAligned.当前系列ID).toBe('story_canon_amphoreus_1_falling_wood');
    expect(fallingAligned.当前进度?.当前分段组号).toBe(1);
    expect(refugeeAligned.当前进度?.当前分段组号).toBe(1);
    expect(fallingAligned.当前进度?.切换说明).toEqual(refugeeAligned.当前进度?.切换说明);
  });

  it('二相乐园其一被两个官方预设复用为不同分段，且清单中没有重复系列', async () => {
    stubCanonFetch();
    const bundled = await loadAllBundledStoryWeavingPresets();
    const welcome = requirePreset('official_planarcadia_welcome');
    const academy = requirePreset('official_planarcadia_academy');
    expect(welcome.chapterId).not.toBe(academy.chapterId);
    const welcomeAligned = alignStoryWeavingToOpeningArchive(bundled, 根据官方开局预设创建开局档案(welcome));
    const academyAligned = alignStoryWeavingToOpeningArchive(bundled, 根据官方开局预设创建开局档案(academy));
    const reusedSeriesId = 'story_canon_erxiang_paradise_1_welcome';
    expect(welcomeAligned.当前系列ID).toBe(reusedSeriesId);
    expect(academyAligned.当前系列ID).toBe(reusedSeriesId);
    expect(welcomeAligned.当前进度?.当前分段组号).toBe(1);
    expect(academyAligned.当前进度?.当前分段组号).toBe(3);
    expect(bundledStoryWeavingPresets.filter((preset) => preset.id === reusedSeriesId)).toHaveLength(1);
    const academySeries = requireSeries(academyAligned, reusedSeriesId);
    expect(academySeries.分段列表.filter((segment) => segment.运行状态 === '当前').map((segment) => segment.组号)).toEqual([3]);
    expect(academySeries.分段列表.filter((segment) => segment.运行状态 === '已跳过').map((segment) => segment.组号)).toEqual([1, 2]);
    const welcomeSeries = requireSeries(welcomeAligned, reusedSeriesId);
    expect(welcomeSeries.分段列表.filter((segment) => segment.运行状态 === '当前').map((segment) => segment.组号)).toEqual([1]);
    expect(welcomeSeries.分段列表.filter((segment) => segment.运行状态 === '已跳过')).toEqual([]);
  });
});
