import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  bundledStoryWeavingPresets,
  getOpeningStoryWeavingAnchor,
  isSelfContainedStoryWeavingSystem,
  loadAllBundledStoryWeavingPresets,
} from '@/data/storyWeavingPreset';
import { openingChapterAnchors } from '@/data/journeyPresets';
import { 归一化剧情编织系列 } from '@/models/storyWeaving';
import type { 剧情编织系列 } from '@/models/storyWeaving';

const CANON_DIR = path.join(process.cwd(), 'public', 'data', 'story-weaving-canon');

const NEW_SERIES_IDS = [
  'story_canon_amphoreus_1_falling_wood',
  'story_canon_amphoreus_2_gate_throne',
  'story_canon_amphoreus_3_sleeping_flowers',
  'story_canon_amphoreus_4_dawn_fall',
  'story_canon_amphoreus_5_sun_hurt',
  'story_canon_amphoreus_6_hero_undying',
  'story_canon_amphoreus_7_night_return',
  'story_canon_amphoreus_8_yesterday_tomorrow',
  'story_canon_erxiang_paradise_1_welcome',
  'story_canon_erxiang_paradise_2_out_of_control',
  'story_canon_erxiang_paradise_3_so_laughter',
  'story_canon_erxiang_paradise_4_forgotten_river',
  'story_canon_erxiang_paradise_5_whistle',
] as const;

/**
 * 当前分支未提供对应开局章节锚点/官方预设的新增系列，仍随内置清单加载，
 * 供剧情推进与旧档回看使用。此处显式登记归档原因，附件测试会校验清单不会悄然扩张或过期。
 */
const ARCHIVE_ONLY_SERIES: Record<string, string> = {
  story_canon_amphoreus_4_dawn_fall: '当前分支没有「在黎明升起时坠落」的开局章节锚点与官方预设，系列仅作为内置推进轨道加载。',
  story_canon_amphoreus_6_hero_undying: '当前分支没有「英雄未死之前」的开局章节锚点与官方预设，系列仅作为内置推进轨道加载。',
  story_canon_amphoreus_7_night_return: '当前分支没有「于长夜重返大地」的开局章节锚点与官方预设，系列仅作为内置推进轨道加载。',
  story_canon_amphoreus_8_yesterday_tomorrow: '当前分支没有「成为昨日的明天」的开局章节锚点与官方预设，系列仅作为内置推进轨道加载。',
  story_canon_erxiang_paradise_3_so_laughter: '当前分支二相乐园没有「如是，众生欢笑不已」的开局章节锚点与官方预设，系列仅作为内置推进轨道加载。',
  story_canon_erxiang_paradise_4_forgotten_river: '当前分支二相乐园没有「沉于生者的忘川」的开局章节锚点与官方预设，系列仅作为内置推进轨道加载。',
};

const RUNTIME_SOURCE_ROOTS = ['components', 'data', 'hooks', 'models', 'prompts', 'services', 'styles', 'utils', 'functions', 'workers'];
const RUNTIME_ROOT_FILES = ['App.tsx', 'index.tsx', 'vite.config.ts'];

function stubCanonFetch(): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const match = url.match(/story-weaving-canon\/([^/]+\.json)$/);
    if (!match) return new Response(null, { status: 404 });
    try {
      const body = await readFile(path.join(CANON_DIR, match[1]), 'utf8');
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
}

async function readRawSeries(id: string): Promise<Partial<剧情编织系列>> {
  const text = await readFile(path.join(CANON_DIR, `${id}.json`), 'utf8');
  return JSON.parse(text) as Partial<剧情编织系列>;
}

async function collectRuntimeSourceFiles(): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (/\.(?:ts|tsx|js|mjs|cjs)$/u.test(entry.name)) files.push(full);
    }
  };
  for (const root of RUNTIME_SOURCE_ROOTS) {
    const full = path.join(process.cwd(), root);
    if (await fileExists(full)) await walk(full);
  }
  for (const file of RUNTIME_ROOT_FILES) {
    const full = path.join(process.cwd(), file);
    if (await fileExists(full)) files.push(full);
  }
  return files;
}

/** 去掉块注释与整行注释，避免把“退役说明”误判成运行时引用。 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, '')
    .replace(/^[ \t]*\/\/.*$/gmu, '');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('新增翁法罗斯与二相乐园原著系列完整性', () => {
  it('每个新增系列都在内置清单中登记一次，且资源目录没有未登记的同类文件', async () => {
    const manifestIds = bundledStoryWeavingPresets.map((preset) => preset.id);
    for (const id of NEW_SERIES_IDS) {
      expect(manifestIds.filter((entry) => entry === id)).toHaveLength(1);
      const entry = bundledStoryWeavingPresets.find((preset) => preset.id === id);
      expect(entry?.title.trim().length).toBeGreaterThan(0);
      expect(entry?.description.trim().length).toBeGreaterThan(0);
    }
    const onDisk = (await readdir(CANON_DIR))
      .filter((name) => name.startsWith('story_canon_amphoreus') || name.startsWith('story_canon_erxiang'))
      .map((name) => name.replace(/\.json$/u, ''))
      .sort();
    expect(onDisk).toEqual([...NEW_SERIES_IDS].sort());
  });

  it('每个新增系列的 JSON 文件名、内部 ID 与内置预设 ID 一致', async () => {
    for (const id of NEW_SERIES_IDS) {
      const raw = await readRawSeries(id);
      expect(raw.id).toBe(id);
      expect(raw.内置预设ID).toBe(id);
      expect(raw.来源类型).toBe('canon');
    }
  });

  it('每个新增系列归一化后是可自包含轨道，分段元数据完整且正文非空', async () => {
    for (const id of NEW_SERIES_IDS) {
      const raw = await readRawSeries(id);
      const series = 归一化剧情编织系列(raw);
      expect(series.id).toBe(id);
      expect(series.章节列表.length).toBeGreaterThan(0);
      expect(series.分段列表.length).toBeGreaterThan(0);
      expect(isSelfContainedStoryWeavingSystem({ 系列列表: [series] })).toBe(true);
      expect(series.分段列表.filter((segment) => segment.是否开局组).map((segment) => segment.组号)).toEqual([1]);
      const segmentIds = series.分段列表.map((segment) => segment.id);
      const segmentGroups = series.分段列表.map((segment) => segment.组号);
      expect(new Set(segmentIds).size).toBe(segmentIds.length);
      expect(new Set(segmentGroups).size).toBe(segmentGroups.length);
      expect(segmentGroups).toEqual(segmentGroups.map((_, index) => index + 1));
      for (const segment of series.分段列表) {
        expect(segment.id.trim().length).toBeGreaterThan(0);
        expect(segment.标题.trim().length).toBeGreaterThan(0);
        expect(segment.原文内容.trim().length).toBeGreaterThan(0);
        expect(`${segment.本段概括}${segment.原文摘要}`.trim().length).toBeGreaterThan(0);
        expect(segment.字数).toBeGreaterThan(0);
        expect(['待处理', '处理中', '已完成', '失败']).toContain(segment.处理状态);
        expect(['未开始', '当前', '已经历', '已跳过', '已偏离', '暂停']).toContain(segment.运行状态);
      }
    }
  });

  it('每个新增系列都能通过运行时加载器从 public 资源路径完整加载', async () => {
    stubCanonFetch();
    const bundled = await loadAllBundledStoryWeavingPresets();
    for (const id of NEW_SERIES_IDS) {
      const series = bundled.系列列表.find((item) => item.id === id);
      expect(series, `运行时缺少内置系列：${id}`).toBeDefined();
      expect(series?.内置预设ID).toBe(id);
      expect(series?.来源类型).toBe('canon');
      expect(series?.分段列表.length).toBeGreaterThan(0);
      expect(series?.分段列表.every((segment) => segment.原文内容.trim().length > 0)).toBe(true);
    }
  });

  it('每个新增系列要么由开局章节锚点到达，要么在测试中登记为归档轨道', () => {
    const anchoredSeries = new Set(
      openingChapterAnchors
        .map((chapter) => getOpeningStoryWeavingAnchor(chapter.id)?.seriesId)
        .filter((seriesId): seriesId is string => Boolean(seriesId)),
    );
    const undocumented = NEW_SERIES_IDS.filter((id) => !anchoredSeries.has(id) && !ARCHIVE_ONLY_SERIES[id]);
    expect(undocumented, '未接入开局锚点的系列必须注明归档原因').toEqual([]);
    const staleNotes = Object.keys(ARCHIVE_ONLY_SERIES).filter((id) => anchoredSeries.has(id));
    expect(staleNotes, '已接入开局锚点的系列不应再登记为归档轨道').toEqual([]);
  });
});

describe('原著数据真源与退役快照', () => {
  it('运行时加载器只请求 public/data/story-weaving-canon，不触碰退役的 storyWeavingCanonDecomposed.json', async () => {
    const requested: string[] = [];
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requested.push(url);
      const match = url.match(/story-weaving-canon\/([^/]+)\.json$/u);
      if (!match) return new Response(null, { status: 404 });
      const id = match[1];
      const body = JSON.stringify({
        id,
        标题: id,
        来源类型: 'canon',
        章节列表: [{ id: `${id}_chapter_1`, 序号: 1, 标题: '第一章', 内容: '章节内容' }],
        分段列表: [{
          id: `${id}_segment_1`,
          组号: 1,
          标题: '第一章',
          原文内容: '段落正文',
          原文摘要: '摘要',
          本段概括: '概括',
          是否开局组: true,
          处理状态: '已完成',
          运行状态: '当前',
          字数: 4,
        }],
        每段章数: 1,
        激活注入: true,
        当前分段组号: 1,
      });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const bundled = await loadAllBundledStoryWeavingPresets();
    expect(bundled.系列列表).toHaveLength(bundledStoryWeavingPresets.length);
    const canonRequests = requested.filter((url) => url.includes('story-weaving-canon'));
    expect(canonRequests).toHaveLength(bundledStoryWeavingPresets.length);
    for (const preset of bundledStoryWeavingPresets) {
      expect(canonRequests.some((url) => url.endsWith(`/data/story-weaving-canon/${preset.id}.json`))).toBe(true);
    }
    expect(requested.some((url) => url.includes('storyWeavingCanonDecomposed'))).toBe(false);
  });

  it('退役快照不在可服务静态目录，也不再被任何运行时源码引用', async () => {
    expect(await fileExists(path.join(process.cwd(), 'public', 'data', 'storyWeavingCanonDecomposed.json'))).toBe(false);
    const offenders: string[] = [];
    for (const file of await collectRuntimeSourceFiles()) {
      const source = stripComments(await readFile(file, 'utf8'));
      if (source.includes('storyWeavingCanonDecomposed')) offenders.push(path.relative(process.cwd(), file));
    }
    expect(offenders, '退役数据文件不得再被运行时源码引用').toEqual([]);
  });
});
