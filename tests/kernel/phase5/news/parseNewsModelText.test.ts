/**
 * Stage 5.3 — parseNewsModelText pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import { parseNewsModelText } from '@/src/kernel/domain/news';

describe('parseNewsModelText (Stage 5.3)', () => {
  it('parses formal English field names', () => {
    const patch = parseNewsModelText(JSON.stringify({
      add: [
        {
          id: 'n1',
          title: '标题',
          body: '正文',
          issueNumber: 2,
          createdAtTurn: 7,
        },
      ],
      update: [{ id: 'n0', title: '改', body: '写' }],
      removeIds: ['old'],
    }));

    expect(patch).toEqual({
      add: [
        {
          id: 'n1',
          title: '标题',
          body: '正文',
          issueNumber: 2,
          createdAtTurn: 7,
        },
      ],
      update: [{ id: 'n0', title: '改', body: '写' }],
      removeIds: ['old'],
    });
  });

  it('parses legacy Chinese keys', () => {
    const patch = parseNewsModelText(JSON.stringify({
      新增: [
        {
          id: 'n2',
          标题: '中文',
          正文: '',
          issueNumber: 1,
          回合: 3,
        },
      ],
      更新: [],
      删除: [],
    }));

    expect(patch.add[0]).toEqual({
      id: 'n2',
      title: '中文',
      body: '',
      issueNumber: 1,
      createdAtTurn: 3,
    });
  });

  it('throws on malformed JSON', () => {
    expect(() => parseNewsModelText('{ not json }')).toThrow(/malformed JSON/);
  });

  it('throws when add entry misses required number fields', () => {
    expect(() =>
      parseNewsModelText(JSON.stringify({
        add: [{ id: 'n1', title: 't', body: 'b' }],
      })),
    ).toThrow(/issueNumber must be a finite number/);
  });

  it('throws on empty rawText', () => {
    expect(() => parseNewsModelText('   ')).toThrow(/non-empty string/);
  });
});
