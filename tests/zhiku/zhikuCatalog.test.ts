import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBundledZhikuCatalog } from '@/data/zhikuCatalogRepository';
import { loadBundledZhikuPreset, validateBundledZhikuCatalog, type BundledZhikuPreset } from '@/data/zhikuPreset';
import type { 智库系统 } from '@/models/zhiku';
import { 创建智库条目, 归一化智库系统 } from '@/models/zhiku';

const buildEntry = (input: Parameters<typeof 创建智库条目>[0]) => (
  创建智库条目({ 原文: '可读正文', ...input })
);

const validSystem = (): 智库系统 => 归一化智库系统({ 条目: [buildEntry({ 标题: '琥珀纪', 分类: 'term' })] });

describe('validateBundledZhikuCatalog', () => {
  it('接受每条都有标题、分类与正文的目录', () => {
    const system = 归一化智库系统({
      条目: [
        buildEntry({ 标题: '正文条目', 分类: 'term', 原文: '正文内容' }),
        buildEntry({ 标题: '摘要条目', 分类: 'faction', 原文: '', 摘要: '摘要内容' }),
      ],
    });
    expect(() => validateBundledZhikuCatalog(system)).not.toThrow();
  });

  it('拒绝空目录', () => {
    expect(() => validateBundledZhikuCatalog(归一化智库系统({ 条目: [] }))).toThrow();
  });

  it('拒绝没有可阅读正文的条目', () => {
    const system = 归一化智库系统({
      条目: [buildEntry({ 标题: '空条目', 分类: 'term', 原文: '', 摘要: '  ' })],
    });
    expect(() => validateBundledZhikuCatalog(system)).toThrow();
  });

  it('拒绝使用已退役分类的条目', () => {
    for (const 分类 of ['npc', 'item', 'system'] as const) {
      const system = 归一化智库系统({
        条目: [buildEntry({ 标题: '退役条目', 分类 })],
      });
      expect(() => validateBundledZhikuCatalog(system)).toThrow();
    }
  });

  it('拒绝重复 ID 的条目', () => {
    const a = { ...buildEntry({ 标题: '甲', 分类: 'term' }), id: 'dup_id' };
    const b = { ...buildEntry({ 标题: '乙', 分类: 'faction' }), id: 'dup_id' };
    // 传入未经归一化的原始系统：归一化会按 id 去重，校验器需要自行发现重复。
    expect(() => validateBundledZhikuCatalog({ 条目: [a, b] })).toThrow();
  });
});

describe('resolveBundledZhikuCatalog', () => {
  const makeDeps = (overrides: {
    loadFresh?: () => Promise<智库系统>;
    loadCached?: () => Promise<智库系统 | null>;
    saveCache?: (system: 智库系统) => Promise<void>;
  }) => ({
    loadFresh: overrides.loadFresh ?? vi.fn(),
    loadCached: overrides.loadCached ?? (() => Promise.resolve(null)),
    saveCache: overrides.saveCache ?? (() => Promise.resolve()),
  });

  it('新鲜目录有效时返回 network 且写入缓存', async () => {
    const fresh = validSystem();
    const saveCache = vi.fn(() => Promise.resolve());
    const loadCached = vi.fn(() => Promise.resolve(null));

    const result = await resolveBundledZhikuCatalog({
      ...makeDeps({ loadFresh: () => Promise.resolve(fresh), loadCached }),
      saveCache,
    });

    expect(result.source).toBe('network');
    expect(result.system).toBe(fresh);
    expect(result.loadError).toBeUndefined();
    expect(saveCache).toHaveBeenCalledTimes(1);
    expect(saveCache).toHaveBeenCalledWith(fresh);
    expect(loadCached).not.toHaveBeenCalled();
  });

  it('新鲜目录抛错且缓存有效时返回 cache 并保留加载错误', async () => {
    const cachedRaw = 归一化智库系统({ 条目: [buildEntry({ 标题: '缓存条目', 分类: 'term', 原文: '缓存正文' })] });
    const originalFailure = new Error('拉取失败');
    const loadCached = vi.fn(() => Promise.resolve(cachedRaw));

    const result = await resolveBundledZhikuCatalog({
      ...makeDeps({ loadFresh: () => Promise.reject(originalFailure), loadCached }),
    });

    expect(result.source).toBe('cache');
    expect(result.loadError).toBe(originalFailure);
    expect(result.system).toEqual(归一化智库系统(cachedRaw));
  });

  it('新鲜目录为非法空目录时也回退到缓存', async () => {
    const cached = validSystem();
    const result = await resolveBundledZhikuCatalog({
      ...makeDeps({ loadFresh: () => Promise.resolve(归一化智库系统({ 条目: [] })), loadCached: () => Promise.resolve(cached) }),
    });

    expect(result.source).toBe('cache');
    expect(result.system).toEqual(归一化智库系统(cached));
    expect(result.loadError).toBeInstanceOf(Error);
  });

  it('新鲜目录抛错且没有缓存时抛出原始错误', async () => {
    const originalFailure = new Error('崭新失败');
    await expect(resolveBundledZhikuCatalog({
      ...makeDeps({ loadFresh: () => Promise.reject(originalFailure), loadCached: () => Promise.resolve(null) }),
    })).rejects.toBe(originalFailure);
  });

  it('新鲜与缓存都不可用时抛出包含两处失败的 AggregateError', async () => {
    const loadFailure = new Error('新鲜失败');
    const cacheFailureSource = {
      条目: [buildEntry({ 标题: '坏条目', 分类: 'term', 原文: '', 摘要: '' })],
    };
    let caught: unknown;
    try {
      await resolveBundledZhikuCatalog({
        ...makeDeps({ loadFresh: () => Promise.reject(loadFailure), loadCached: () => Promise.resolve(cacheFailureSource) }),
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    const aggregate = caught as AggregateError;
    expect(aggregate.errors).toHaveLength(2);
    expect(aggregate.errors[0]).toBe(loadFailure);
    expect(aggregate.errors[1]).toBeInstanceOf(Error);
  });
});

describe('loadBundledZhikuPreset 解析', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const preset: BundledZhikuPreset = { id: 'zhiku_test', title: '测试', description: '', path: '/zhiku-presets/test.json' };

  const stubFetchJson = (payload: unknown) => {
    vi.stubGlobal('fetch', vi.fn((): Promise<Response> => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    } as unknown as Response)));
  };

  it('404 响应直接拒绝', async () => {
    vi.stubGlobal('fetch', vi.fn((): Promise<Response> => Promise.resolve({ ok: false, status: 404 } as Response)));
    await expect(loadBundledZhikuPreset(preset)).rejects.toThrow();
  });

  it('缺少条目、空条目或缺少标题 / 分类的载荷都拒绝', async () => {
    for (const payload of [
      {},
      { entries: [] },
      { entries: [{ 分类: 'character' }] },
      { entries: [{ 标题: 'x' }] },
    ]) {
      stubFetchJson(payload);
      await expect(loadBundledZhikuPreset(preset)).rejects.toThrow();
    }
  });

  it('合法载荷生成带预设前缀 ID 的内置系统', async () => {
    stubFetchJson({
      entries: [
        { 标题: '术语一', 分类: 'term', 原文: '术语一正文' },
        { 标题: '术语二', 分类: 'term', 原文: '术语二正文' },
      ],
    });
    const system = await loadBundledZhikuPreset(preset);
    expect(system.条目.map((entry) => entry.id)).toEqual(['zhiku_test_1', 'zhiku_test_2']);
    expect(system.条目.every((entry) => entry.builtin)).toBe(true);
  });

  it('同一预设重复生成的条目 ID 保持稳定', async () => {
    const payload = {
      entries: [
        { 标题: '术语甲', 分类: 'term', 原文: '甲正文' },
        { 标题: '术语乙', 分类: 'term', 原文: '乙正文' },
      ],
    };
    stubFetchJson(payload);
    const first = await loadBundledZhikuPreset(preset);
    stubFetchJson(payload);
    const second = await loadBundledZhikuPreset(preset);
    expect(second.条目.map((entry) => entry.id)).toEqual(first.条目.map((entry) => entry.id));
  });
});
