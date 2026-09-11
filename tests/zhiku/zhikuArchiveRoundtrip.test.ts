import { describe, expect, it } from 'vitest';
import { buildPersistedZhikuSystem, mergeBundledZhikuSystem } from '@/data/zhikuPreset';
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
