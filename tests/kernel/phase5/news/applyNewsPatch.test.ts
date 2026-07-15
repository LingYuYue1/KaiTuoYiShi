/**
 * Stage 5.3 — applyNewsPatch pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  applyNewsPatch,
  type KernelNewsEntry,
  type KernelNewsSystem,
} from '@/src/kernel/domain/news';

function entry(
  partial: Pick<KernelNewsEntry, 'id' | 'title'> & Partial<KernelNewsEntry>,
): KernelNewsEntry {
  return {
    id: partial.id,
    title: partial.title,
    body: partial.body ?? '',
    issueNumber: partial.issueNumber ?? 1,
    createdAtTurn: partial.createdAtTurn ?? 1,
  };
}

function system(entries: KernelNewsEntry[]): KernelNewsSystem {
  return { entries };
}

describe('applyNewsPatch (Stage 5.3)', () => {
  it('adds new entries immutably', () => {
    const current = system([
      entry({ id: 'n1', title: '旧闻', body: '旧', issueNumber: 1, createdAtTurn: 1 }),
    ]);
    const frozen = JSON.stringify(current);

    const next = applyNewsPatch(current, {
      add: [
        entry({ id: 'n2', title: '新闻', body: '正文', issueNumber: 2, createdAtTurn: 5 }),
      ],
      update: [],
      removeIds: [],
    });

    expect(next.entries).toHaveLength(2);
    expect(next.entries.map((e) => e.id)).toEqual(['n2', 'n1']);
    expect(JSON.stringify(current)).toBe(frozen);
  });

  it('updates title and body for an existing id', () => {
    const current = system([
      entry({ id: 'n1', title: '旧标题', body: '旧正文', issueNumber: 3, createdAtTurn: 4 }),
    ]);

    const next = applyNewsPatch(current, {
      add: [],
      update: [{ id: 'n1', title: '新标题', body: '新正文' }],
      removeIds: [],
    });

    expect(next.entries).toHaveLength(1);
    expect(next.entries[0]).toEqual({
      id: 'n1',
      title: '新标题',
      body: '新正文',
      issueNumber: 3,
      createdAtTurn: 4,
    });
  });

  it('removes entries by id', () => {
    const current = system([
      entry({ id: 'keep', title: '保留' }),
      entry({ id: 'drop', title: '删除' }),
    ]);

    const next = applyNewsPatch(current, {
      add: [],
      update: [],
      removeIds: ['drop'],
    });

    expect(next.entries.map((e) => e.id)).toEqual(['keep']);
  });

  it('applies update then remove then add in order', () => {
    const current = system([
      entry({ id: 'a', title: 'A', body: 'a', issueNumber: 1, createdAtTurn: 1 }),
      entry({ id: 'b', title: 'B', body: 'b', issueNumber: 1, createdAtTurn: 2 }),
    ]);

    const next = applyNewsPatch(current, {
      add: [entry({ id: 'c', title: 'C', body: 'c', issueNumber: 2, createdAtTurn: 3 })],
      update: [{ id: 'a', title: 'A2', body: 'a2' }],
      removeIds: ['b'],
    });

    expect(next.entries.map((e) => e.id)).toEqual(['c', 'a']);
    expect(next.entries.find((e) => e.id === 'a')?.title).toBe('A2');
  });

  it('throws when update targets a missing id', () => {
    const current = system([entry({ id: 'n1', title: '存在' })]);

    expect(() =>
      applyNewsPatch(current, {
        add: [],
        update: [{ id: 'missing', title: 'x', body: 'y' }],
        removeIds: [],
      }),
    ).toThrow(/update id not found: missing/);
  });

  it('throws when remove targets a missing id', () => {
    expect(() =>
      applyNewsPatch(system([]), {
        add: [],
        update: [],
        removeIds: ['ghost'],
      }),
    ).toThrow(/remove id not found: ghost/);
  });

  it('throws when add id already exists', () => {
    expect(() =>
      applyNewsPatch(system([entry({ id: 'n1', title: '旧' })]), {
        add: [entry({ id: 'n1', title: '重复' })],
        update: [],
        removeIds: [],
      }),
    ).toThrow(/add id already exists: n1/);
  });

  it('throws on invalid patch shape', () => {
    expect(() =>
      applyNewsPatch(system([]), {
        add: null as unknown as [],
        update: [],
        removeIds: [],
      }),
    ).toThrow(/patch\.add must be an array/);
  });

  it('throws on empty update title', () => {
    expect(() =>
      applyNewsPatch(system([entry({ id: 'n1', title: 't' })]), {
        add: [],
        update: [{ id: 'n1', title: '  ', body: 'b' }],
        removeIds: [],
      }),
    ).toThrow(/patch\.update\.title must be a non-empty string/);
  });
});
