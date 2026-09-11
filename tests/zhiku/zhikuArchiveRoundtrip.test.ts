import { describe, expect, it } from 'vitest';
import {
  buildPersistedZhikuSystem,
  mergeBundledZhikuSystem,
  migrateZhikuRuntimeUnlockOverrides,
} from '@/data/zhikuPreset';
import type { 智库条目, 智库系统 } from '@/models/zhiku';
import { 创建智库条目, 归一化智库系统 } from '@/models/zhiku';

const MIGRATION_AT = 1;

function findEntryById(system: 智库系统, id: string): 智库条目 | undefined {
  return system.条目.find((entry) => entry.id === id);
}

describe('智库内置目录持久化与合并完整性', () => {
  const bundledBuiltin = {
    ...创建智库条目({
      标题: '姬子',
      分类: 'character',
      原文: '姬子的内置档案正文',
      摘要: '姬子内置摘要',
      builtin: true,
    }),
    id: 'builtin_himeko',
  };
  const bundledSystem = 归一化智库系统({ 条目: [bundledBuiltin] });

  const savedBuiltin = {
    ...创建智库条目({
      标题: '姬子',
      分类: 'character',
      原文: '本地残缺正文',
      builtin: true,
      运行时解锁状态: '已解锁（运行时）',
    }),
    id: 'builtin_himeko',
  };
  const savedCustom = {
    ...创建智库条目({
      标题: '自制术语',
      分类: 'term',
      原文: '自制术语的正文内容',
    }),
    id: 'custom_term_1',
  };
  // 存档条目顺序与合并结果顺序刻意不同，验证按 id 而非按数组位置对齐。
  const savedSystem = 归一化智库系统({ 条目: [savedCustom, savedBuiltin] });

  it('合并后条目按 id 对齐且自定义条目完整保留', () => {
    const merged = mergeBundledZhikuSystem(bundledSystem, savedSystem, MIGRATION_AT);

    const mergedCustom = findEntryById(merged, 'custom_term_1');
    const mergedBuiltin = findEntryById(merged, 'builtin_himeko');
    expect(mergedCustom).toBeDefined();
    expect(mergedCustom?.原文).toBe('自制术语的正文内容');
    expect(mergedBuiltin?.原文).toBe('姬子的内置档案正文');
    expect(merged.条目).toHaveLength(2);
  });

  it('持久化保留运行时解锁覆盖并剥离内置正文，自定义条目正文完整保留', () => {
    const merged = mergeBundledZhikuSystem(bundledSystem, savedSystem, MIGRATION_AT);
    const persisted = buildPersistedZhikuSystem(merged);

    const persistedCustom = findEntryById(persisted, 'custom_term_1');
    const persistedBuiltin = findEntryById(persisted, 'builtin_himeko');
    expect(persistedCustom?.原文).toBe('自制术语的正文内容');
    expect(persistedBuiltin).toBeDefined();
    expect(persistedBuiltin?.运行时解锁状态).toBe('已解锁（运行时）');
    expect(persistedBuiltin?.原文).toBe('');
    expect(persistedBuiltin?.摘要).toBe('');
  });

  it('持久化恢复后再次合并：覆盖仍挂在内置条目上、自定义条目唯一、内置正文从内置目录回填', () => {
    const merged = mergeBundledZhikuSystem(bundledSystem, savedSystem, MIGRATION_AT);
    const persisted = buildPersistedZhikuSystem(merged);
    const normalized = 归一化智库系统(persisted);
    const mergedAgain = mergeBundledZhikuSystem(bundledSystem, normalized, MIGRATION_AT);

    const builtin = findEntryById(mergedAgain, 'builtin_himeko');
    const customMatches = mergedAgain.条目.filter((entry) => entry.id === 'custom_term_1');
    expect(builtin?.运行时解锁状态).toBe('已解锁（运行时）');
    expect(builtin?.原文).toBe('姬子的内置档案正文');
    expect(customMatches).toHaveLength(1);
    expect(customMatches[0]?.原文).toBe('自制术语的正文内容');
    expect(new Set(mergedAgain.条目.map((entry) => entry.id)).size).toBe(mergedAgain.条目.length);
  });
});

describe('migrateZhikuRuntimeUnlockOverrides 旧 ID 迁移', () => {
  const bundledMachineEntry = 创建智库条目({
    标题: '姬子',
    分类: 'character',
    原文: '姬子的内置档案正文',
    摘要: '姬子内置摘要',
    builtin: true,
  });
  const bundledEntry = {
    ...bundledMachineEntry,
    id: 'JS-005',
    治理分类: 'character' as const,
    资料所有者: 'builtin-json' as const,
    来源预设ID: 'zhiku_character_rebuild_core',
    来源文件: 'character-rebuild-core.json',
    来源序号: 5,
  };
  const bundledSystem = 归一化智库系统({ 条目: [bundledEntry] });

  it('旧生成 ID 的运行时覆盖按标题搬到新机器 ID', () => {
    const savedBuiltin = {
      ...创建智库条目({
        标题: '姬子',
        分类: 'character',
        原文: '旧目录的正文',
        builtin: true,
        运行时解锁状态: '已解锁（剧情推进）',
        运行时解锁备注: '推进到剧情段后解锁',
      }),
      id: 'zhiku_aeons_core_3',
    };
    const migrated = migrateZhikuRuntimeUnlockOverrides(bundledSystem.条目, [savedBuiltin]);
    expect(migrated.filter((entry) => entry.id === 'zhiku_aeons_core_3')).toEqual([]);
    const remapped = migrated.find((entry) => entry.id === 'JS-005');
    expect(remapped?.标题).toBe('姬子');

    const merged = mergeBundledZhikuSystem(bundledSystem, 归一化智库系统({ 条目: migrated }), MIGRATION_AT);
    expect(merged.条目).toHaveLength(1);
    const builtin = findEntryById(merged, 'JS-005');
    expect(builtin?.运行时解锁状态).toBe('已解锁（剧情推进）');
    expect(builtin?.运行时解锁备注).toBe('推进到剧情段后解锁');
  });

  it('旧人物前缀显式 ID 的覆盖同样按标题重映射', () => {
    const savedBuiltin = {
      ...创建智库条目({
        标题: '姬子',
        分类: 'character',
        builtin: true,
        运行时解锁状态: '默认可用',
      }),
      id: 'zhiku_character_rebuild_himeko_profile',
    };
    const merged = mergeBundledZhikuSystem(bundledSystem, 归一化智库系统({ 条目: [savedBuiltin] }), MIGRATION_AT);
    expect(merged.条目).toHaveLength(1);
    expect(findEntryById(merged, 'JS-005')?.运行时解锁状态).toBe('默认可用');
  });

  it('标题在内置目录中已消失的旧内置覆盖被丢弃', () => {
    const savedBuiltin = {
      ...创建智库条目({
        标题: '已被移除的角色',
        分类: 'character',
        builtin: true,
        运行时解锁状态: '默认可用',
      }),
      id: 'zhiku_aeons_core_old_removed',
    };
    const migrated = migrateZhikuRuntimeUnlockOverrides(bundledSystem.条目, [savedBuiltin]);
    expect(migrated).toEqual([]);
  });

  it('非内置条目原样保留、已使用机器 ID 的内置条目不再迁移', () => {
    const custom = 创建智库条目({
      标题: '自制术语',
      分类: 'term',
      原文: '自制正文',
      运行时解锁状态: '默认可用',
    });
    const alreadyBundled = {
      ...创建智库条目({
        标题: '姬子',
        分类: 'character',
        builtin: true,
        运行时解锁状态: '只读',
      }),
      id: 'JS-005',
    };
    const migrated = migrateZhikuRuntimeUnlockOverrides(
      bundledSystem.条目,
      [custom, alreadyBundled],
    );
    expect(migrated.find((entry) => entry.id === custom.id)?.标题).toBe('自制术语');
    expect(migrated.find((entry) => entry.id === 'JS-005')?.运行时解锁状态).toBe('只读');
  });
});

describe('机器 ID 目录下的持久化往返', () => {
  const bundledEntry = {
    ...创建智库条目({
      标题: '姬子',
      分类: 'character',
      原文: '姬子的内置档案正文',
      摘要: '姬子内置摘要',
      关键词: ['角色:姬子'],
      触发关键词: ['姬子'],
      builtin: true,
    }),
    id: 'JS-005',
    治理分类: 'character' as const,
    资料所有者: 'builtin-json' as const,
    来源预设ID: 'zhiku_character_rebuild_core',
    来源文件: 'character-rebuild-core.json',
    来源序号: 5,
    资料版本: 1,
    辅助字段版本: 1,
  };
  const bundledSystem = 归一化智库系统({
    目录版本: 'v3:test',
    目录修订: 3,
    条目: [bundledEntry],
  });
  const savedBuiltin = {
    ...创建智库条目({
      标题: '姬子',
      分类: 'character',
      原文: '本地旧正文',
      builtin: true,
      运行时解锁状态: '已解锁（运行时）',
    }),
    id: 'zhiku_character_rebuild_himeko_profile',
  };
  const savedCustom = {
    ...创建智库条目({
      标题: '自制术语',
      分类: 'term',
      原文: '自制术语的正文内容',
    }),
    id: 'custom_term_1',
  };

  it('持久化剥离内置正文但保留治理与来源合同字段，回合并回填目录正文且覆盖唯一', () => {
    const merged = mergeBundledZhikuSystem(bundledSystem, 归一化智库系统({ 条目: [savedCustom, savedBuiltin] }), MIGRATION_AT);
    const persisted = buildPersistedZhikuSystem(merged);
    const normalized = 归一化智库系统(persisted);

    const persistedBuiltin = findEntryById(normalized, 'JS-005');
    expect(persistedBuiltin).toBeDefined();
    expect(persistedBuiltin?.原文).toBe('');
    expect(persistedBuiltin?.摘要).toBe('');
    expect(persistedBuiltin?.运行时解锁状态).toBe('已解锁（运行时）');
    expect(persistedBuiltin?.治理分类).toBe('character');
    expect(persistedBuiltin?.资料所有者).toBe('builtin-json');
    expect(persistedBuiltin?.来源预设ID).toBe('zhiku_character_rebuild_core');
    expect(persistedBuiltin?.来源文件).toBe('character-rebuild-core.json');
    expect(persistedBuiltin?.来源序号).toBe(5);
    // 自定义条目在持久化中正文完整保留。
    expect(findEntryById(normalized, 'custom_term_1')?.原文).toBe('自制术语的正文内容');

    const mergedAgain = mergeBundledZhikuSystem(bundledSystem, normalized, MIGRATION_AT);
    const overridden = mergedAgain.条目.filter((entry) => entry.id === 'JS-005');
    expect(overridden).toHaveLength(1);
    expect(overridden[0]?.运行时解锁状态).toBe('已解锁（运行时）');
    expect(overridden[0]?.原文).toBe('姬子的内置档案正文');
    expect(mergedAgain.条目.filter((entry) => entry.id === 'custom_term_1')).toHaveLength(1);
    expect(mergedAgain.目录版本).toBe('v3:test');
  });
});
