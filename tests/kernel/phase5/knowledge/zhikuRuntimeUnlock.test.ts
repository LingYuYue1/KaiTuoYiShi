/**
 * Stage 5.2 — applyZhikuRuntimeUnlock pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  applyZhikuRuntimeUnlock,
  type KernelStoryArchive,
  type KernelZhikuEntry,
  type KernelZhikuSystem,
} from '@/src/kernel/domain/knowledge';

function entry(partial: Partial<KernelZhikuEntry> & Pick<KernelZhikuEntry, 'id' | 'title'>): KernelZhikuEntry {
  return {
    category: 'character',
    unlockStatus: '未解锁',
    usableForLink: true,
    ...partial,
  };
}

function system(...entries: KernelZhikuEntry[]): KernelZhikuSystem {
  return { entries };
}

describe('applyZhikuRuntimeUnlock (Stage 5.2)', () => {
  it('unlocks entry when archive title matches relatedSegment', () => {
    const zhiku = system(
      entry({
        id: 'char-1',
        title: '星核旅人',
        relatedSegment: '港口初遇',
        unlockStatus: '未解锁',
      }),
    );
    const archives: KernelStoryArchive[] = [
      { segmentTitle: '港口初遇', summary: '旅人在港口与向导相遇。' },
    ];

    const result = applyZhikuRuntimeUnlock(zhiku, archives);

    expect(result.changed).toBe(true);
    expect(result.unlocked).toHaveLength(1);
    expect(result.unlocked[0]).toMatchObject({
      id: 'char-1',
      title: '星核旅人',
      status: '已解锁',
    });
    expect(result.zhiku.entries[0].runtimeUnlockStatus).toBe('已解锁');
    expect(result.zhiku.entries[0].runtimeUnlockNote).toContain('港口初遇');
  });

  it('leaves already-open entries unchanged', () => {
    const zhiku = system(
      entry({
        id: 'char-open',
        title: '向导',
        unlockStatus: '已解锁',
        relatedSegment: '港口初遇',
      }),
    );
    const archives: KernelStoryArchive[] = [
      { segmentTitle: '港口初遇', summary: '已发生。' },
    ];

    const result = applyZhikuRuntimeUnlock(zhiku, archives);

    expect(result.changed).toBe(false);
    expect(result.unlocked).toEqual([]);
    expect(result.zhiku).toBe(zhiku);
  });

  it('no-ops when archives are empty', () => {
    const zhiku = system(
      entry({
        id: 'char-2',
        title: '商人',
        relatedSegment: '集市交易',
        unlockStatus: '未解锁',
      }),
    );

    const result = applyZhikuRuntimeUnlock(zhiku, []);

    expect(result.changed).toBe(false);
    expect(result.unlocked).toEqual([]);
    expect(result.zhiku).toBe(zhiku);
  });

  it('unlocks via unlockCondition tokens when relatedSegment does not match', () => {
    const zhiku = system(
      entry({
        id: 'char-cond',
        title: '守夜人',
        unlockStatus: '未解锁',
        unlockCondition: '完成灯塔守夜',
      }),
    );
    const archives: KernelStoryArchive[] = [
      { segmentTitle: '风暴之夜', summary: '完成灯塔守夜后众人得救。' },
    ];

    const result = applyZhikuRuntimeUnlock(zhiku, archives);

    expect(result.changed).toBe(true);
    expect(result.unlocked[0]?.id).toBe('char-cond');
    expect(result.unlocked[0]?.status).toBe('已解锁');
  });
});
