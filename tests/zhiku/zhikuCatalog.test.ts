import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveBundledZhikuCatalog } from '@/data/zhikuCatalogRepository';
import {
  bundledZhikuPresets,
  loadAllBundledZhikuPresets,
  loadBundledZhikuPreset,
  validateBundledZhikuCatalog,
  ZHIKU_BUNDLED_CATALOG_VERSION,
  ZHIKU_BUNDLED_ENTRY_COUNT,
  type BundledZhikuPreset,
} from '@/data/zhikuPreset';
import type { 智库条目, 智库系统 } from '@/models/zhiku';
import { 创建空智库系统, 归一化智库系统, 智库条目注入内容完整 } from '@/models/zhiku';
import { ZHIKU_MACHINE_ID_PATTERN, ZHIKU_CATEGORY_POLICIES, type 智库治理分类 } from '@/models/zhikuGovernance';

/** 由生产策略派生，避免测试内复制前缀表（验证器按同一策略表由前缀反推治理分类）。 */
const MACHINE_ID_PREFIX: Record<智库治理分类, string> = Object.fromEntries(
  Object.values(ZHIKU_CATEGORY_POLICIES).map((policy) => [policy.key, policy.machineIdPrefix]),
) as Record<智库治理分类, string>;

/** Manifest 预设与治理分类的稳定对应：角色 / 敌人 / 地点按名称，迁移知识库按类型，其余按术语兜底。 */
function pickPresetGovernance(presetId: string): 智库治理分类 {
  if (presetId.includes('character_rebuild') || presetId.includes('character_expansion')) return 'character';
  if (presetId.includes('enemy')) return 'enemy';
  if (presetId === 'zhiku_location_core') return 'location';
  if (presetId === 'zhiku_paths_core') return 'path';
  if (presetId === 'zhiku_aeons_core') return 'aeon';
  return 'term';
}

const LORE_INJECTION_TEMPLATE = {
  类型: 'lore',
  核心定义: '结构化注入：核心定义，占位描述内容。',
  关键事实: '结构化注入：关键事实，占位描述内容。',
  叙事用途: '结构化注入：叙事用途，占位描述内容。',
  演绎边界: '结构化注入：演绎边界，占位描述内容。',
} as const;

function buildMachineEntry(input: {
  id: string;
  治理分类: 智库治理分类;
  preset: BundledZhikuPreset;
  序号: number;
}): 智库条目 {
  return 归一化智库系统({
    条目: [{
      id: input.id,
      治理分类: input.治理分类,
      资料所有者: 'builtin-json',
      来源预设ID: input.preset.id,
      来源文件: input.preset.path.replace(/^\/zhiku-presets\//u, ''),
      来源序号: input.序号,
      资料版本: 1,
      辅助字段版本: 1,
      标题: `内置资料 ${input.id}`,
      分类: 'term',
      摘要: '内置摘要',
      原文: '内置原文，保证可读。',
      注入内容: LORE_INJECTION_TEMPLATE,
      关键词: ['术语:' + input.id],
      触发关键词: [input.id],
      关联条目ID: [],
      重要度: 3,
      可用于联动: true,
      builtin: true,
      createdAt: 1,
      updatedAt: 1,
    }],
  }).条目[0];
}

/** 构建完整合法的 162 条目录：23 个预设全部有货、机器 ID 全局唯一、来源序号预设内唯一、注入内容完整。 */
function buildRawValidCatalog(): 智库条目[] {
  const entries: 智库条目[] = [];
  let machineSeq = 0;
  for (const preset of bundledZhikuPresets) {
    const index = bundledZhikuPresets.indexOf(preset);
    const count = 7 + (index === 0 ? 1 : 0);
    const governance = pickPresetGovernance(preset.id);
    const prefix = MACHINE_ID_PREFIX[governance];
    for (let 序号 = 0; 序号 < count; 序号 += 1) {
      const id = `${prefix}-${String(machineSeq).padStart(3, '0')}`;
      machineSeq += 1;
      entries.push(buildMachineEntry({ id, 治理分类: governance, preset, 序号 }));
    }
  }
  return entries;
}

let cachedValidEntries: 智库条目[] | null = null;

/** 162 条目录只做一次重归一化；每次调用返回浅拷贝数组+浅拷贝条目，变异路径只做 reassign/spread，共享安全。 */
function getValidEntries(): 智库条目[] {
  if (!cachedValidEntries) cachedValidEntries = buildRawValidCatalog();
  return cachedValidEntries;
}

const validSystem = (): 智库系统 => ({
  目录版本: ZHIKU_BUNDLED_CATALOG_VERSION,
  目录修订: 7,
  条目: getValidEntries().map((entry) => ({ ...entry })),
});

describe('validateBundledZhikuCatalog', () => {
  it('接受结构完整、来源绑定正确、恰好 162 条的目录', () => {
    expect(() => validateBundledZhikuCatalog(validSystem())).not.toThrow();
  });

  it('拒绝空目录', () => {
    expect(() => validateBundledZhikuCatalog(归一化智库系统({ 条目: [] }))).toThrow();
  });

  const expectCatalogRejected = (mutate: (entries: readonly 智库条目[]) => 智库条目[]) => {
    const mutating = validSystem();
    mutating.条目 = mutate(mutating.条目);
    expect(() => validateBundledZhikuCatalog(mutating)).toThrow();
  };

  const mutateEntry0 = (next: (entry: 智库条目) => 智库条目) => (raw: readonly 智库条目[]) =>
    raw.map((entry, index) => (index === 0 ? next(entry) : entry));

  it.each([
    ['拒绝不符合机器 ID 格式的条目', mutateEntry0((entry) => ({ ...entry, id: 'legacy_random_id' }))],
    // term 前缀的条目改成星神治理分类即不一致。
    ['拒绝治理分类与 ID 前缀不一致的条目', mutateEntry0((entry) => ({ ...entry, 治理分类: 'aeon' as const }))],
    ['拒绝缺失来源预设绑定的条目', mutateEntry0((entry) => ({ ...entry, 来源预设ID: undefined, 来源文件: undefined }))],
    ['拒绝来源文件错配的条目', mutateEntry0((entry) => ({ ...entry, 来源文件: 'not-the-real-file.json' }))],
    ['拒绝重复 ID', (raw: readonly 智库条目[]) => raw.map((entry, index) => (index === 1 ? { ...entry, id: raw[0].id } : entry))],
    // 保持 ID 与 ID 前缀合法，仅复制来源槽位。
    ['拒绝重复的来源预设 + 来源序号槽位', (raw: readonly 智库条目[]) => raw.map((entry, index) => (
      index === 1 ? { ...raw[0], id: 'DD-998', 治理分类: 'location' as const } : entry
    ))],
    ['拒绝剧情分类进入内置运行目录', mutateEntry0((entry) => ({ ...entry, 分类: 'story' as const, 注入内容: undefined }))],
  ] as Array<[string, (entries: readonly 智库条目[]) => 智库条目[]]>)('%s', (_name, mutate) => {
    expectCatalogRejected(mutate);
  });

  it('拒绝注入内容存在空字段的条目', () => {
    const pristine = validSystem().条目[0];
    expect(智库条目注入内容完整(pristine)).toBe(true);

    expectCatalogRejected((raw) => raw.map((entry, index) => {
      if (index !== 0) return entry;
      const injection = entry.注入内容 as unknown as Record<string, string>;
      return {
        ...entry,
        注入内容: { ...injection, 演绎边界: '   ' } as 智库条目['注入内容'],
      };
    }));
  });

  it('拒绝目录版本不匹配', () => {
    expect(() => validateBundledZhikuCatalog({ ...validSystem(), 目录版本: 'v3:wrong-version' })).toThrow();
  });

  it('拒绝条目总数不是 162', () => {
    const system = validSystem();
    system.条目 = system.条目.slice(1);
    expect(() => validateBundledZhikuCatalog(system)).toThrow();
  });
});

describe('loadBundledZhikuPreset 解析', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const testPreset = (): BundledZhikuPreset => ({
    id: 'zhiku_test',
    title: '测试预设',
    description: '',
    path: '/zhiku-presets/test.json',
  });

  const stubFetchJson = (payload: unknown) => {
    vi.stubGlobal('fetch', vi.fn((): Promise<Response> => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(payload),
    } as unknown as Response)));
  };

  it('非 ok 响应直接拒绝', async () => {
    vi.stubGlobal('fetch', vi.fn((): Promise<Response> => Promise.resolve({ ok: false, status: 404 } as Response)));
    await expect(loadBundledZhikuPreset(testPreset())).rejects.toThrow();
  });

  it('缺少条目、空条目、缺 id、缺标题、缺分类的载荷都拒绝', async () => {
    for (const payload of [
      {},
      { entries: [] },
      { entries: [{ 标题: '术语', 分类: 'term' }] },
      { entries: [{ id: 'MY-001', 分类: 'term' }] },
      { entries: [{ id: 'MY-001', 标题: '术语' }] },
    ]) {
      stubFetchJson(payload);
      await expect(loadBundledZhikuPreset(testPreset())).rejects.toThrow();
    }
  });

  it('合法载荷保留机器 ID、推断治理分类、绑定内置来源并过滤剧情条目', async () => {
    stubFetchJson({
      entries: [
        { id: 'MY-001', 标题: '术语甲', 分类: 'term', 原文: '术语甲正文' },
        { id: 'JQ-001', 标题: '剧情甲', 分类: 'story', 原文: '剧情正文' },
      ],
    });
    const system = await loadBundledZhikuPreset(testPreset());
    expect(system.条目).toHaveLength(1);
    const kept = system.条目[0];
    expect(kept.id).toBe('MY-001');
    expect(kept.治理分类).toBe('term');
    expect(kept.资料所有者).toBe('builtin-json');
    expect(kept.来源预设ID).toBe('zhiku_test');
    expect(kept.来源文件).toBe('test.json');
    expect(kept.来源序号).toBe(0);
    expect(kept.builtin).toBe(true);
  });
});

describe('loadAllBundledZhikuPresets 读取真实内置目录', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('真实 23 个预设文件加载为 162 条完整条目', async () => {
    vi.stubGlobal('fetch', vi.fn((input: unknown): Promise<Response> => {
      const url = new URL(String(input), 'http://localhost');
      const fileName = url.pathname.replace(/^\/zhiku-presets\//u, '');
      const body = readFileSync(`${process.cwd()}/public/zhiku-presets/${fileName}`, 'utf8');
      const payload: unknown = JSON.parse(body) as unknown;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      } as unknown as Response);
    }));

    const system = await loadAllBundledZhikuPresets();
    expect(system.条目).toHaveLength(ZHIKU_BUNDLED_ENTRY_COUNT);

    const presetIds = new Set(system.条目.map((entry) => entry.来源预设ID).filter(Boolean));
    expect(presetIds.size).toBe(bundledZhikuPresets.length);
    for (const preset of bundledZhikuPresets) {
      expect(presetIds.has(preset.id)).toBe(true);
    }

    for (const entry of system.条目) {
      expect(ZHIKU_MACHINE_ID_PATTERN.test(entry.id)).toBe(true);
      expect(智库条目注入内容完整(entry)).toBe(true);
    }
    // 真实目录本身必须通过验证器：拒绝用例的合成目录只是“有效基线”，有效性以真实数据为准。
    expect(() => validateBundledZhikuCatalog(system)).not.toThrow();
    const tails = system.条目.filter((entry) => !entry.原文.trim() && !entry.摘要.trim());
    expect(tails).toEqual([]);
    expect(system.目录版本).toBe(ZHIKU_BUNDLED_CATALOG_VERSION);
    // 治理分类与机器 ID 前缀一一对应。
    const prefixToGovernance = new Map(
      Object.values(ZHIKU_CATEGORY_POLICIES).map((policy) => [policy.machineIdPrefix, policy.key]),
    );
    for (const entry of system.条目) {
      expect(prefixToGovernance.get(entry.id.slice(0, 2))).toBe(entry.治理分类);
    }
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
    const fresh = 归一化智库系统(validSystem());
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
    const cachedRaw = validSystem();
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
    const cacheFailureSource: 智库系统 = {
      ...创建空智库系统(),
      条目: [{
        id: 'broken', 标题: '坏条目', 分类: 'term', 来源预设ID: 'zhiku_term_core',
        来源文件: 'term-core.json', 来源序号: 0, 摘要: 'x', 原文: 'y', 关键词: [], 关联条目ID: [],
        重要度: 3, 可用于联动: true, builtin: true, createdAt: 1, updatedAt: 1,
      }],
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
