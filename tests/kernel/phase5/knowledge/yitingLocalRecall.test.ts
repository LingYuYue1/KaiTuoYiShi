/**
 * Stage 5.2 — retrieveYitingLocal pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  retrieveYitingLocal,
  type KernelYitingEntry,
  type KernelYitingSystem,
} from '@/src/kernel/domain/knowledge';

function makeEntry(
  partial: Partial<KernelYitingEntry> & Pick<KernelYitingEntry, 'id' | 'name' | 'turn'>,
): KernelYitingEntry {
  return {
    summary: '',
    ...partial,
  };
}

function system(...entries: KernelYitingEntry[]): KernelYitingSystem {
  return { entries };
}

describe('retrieveYitingLocal (Stage 5.2)', () => {
  it('hits entries by keywords and builds injection', () => {
    const yiting = system(
      makeEntry({
        id: 'm1',
        name: '【回忆001】',
        turn: 1,
        summary: '在港口与向导相遇。',
        keywords: ['港口', '向导'],
      }),
      makeEntry({
        id: 'm2',
        name: '【回忆002】',
        turn: 2,
        summary: '山路上发生了暴雨。',
        keywords: ['山路', '暴雨'],
      }),
    );

    const result = retrieveYitingLocal(yiting, '港口向导在哪', 4);

    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries.some((e) => e.id === 'm1')).toBe(true);
    expect(result.injection).toContain('# 即时剧情回顾｜剧情回忆');
    expect(result.injection).toContain('港口');
  });

  it('returns empty injection for empty query', () => {
    const yiting = system(
      makeEntry({
        id: 'm1',
        name: '【回忆001】',
        turn: 1,
        summary: '有内容',
        keywords: ['港口'],
      }),
    );

    const result = retrieveYitingLocal(yiting, '   ', 4);

    expect(result.entries).toEqual([]);
    expect(result.injection).toBe('');
  });

  it('returns empty when system has no entries', () => {
    const result = retrieveYitingLocal({ entries: [] }, '港口', 4);
    expect(result.entries).toEqual([]);
    expect(result.injection).toBe('');
  });
});
