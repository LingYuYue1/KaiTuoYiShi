/**
 * Stage 5.2 — buildKnowledgeInjection pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeInjection,
  type KernelStoryProgress,
  type KernelYitingSystem,
  type KernelZhikuSystem,
} from '@/src/kernel/domain/knowledge';

describe('buildKnowledgeInjection (Stage 5.2)', () => {
  it('combines non-empty yiting, story, and unlocked zhiku parts', () => {
    const yiting: KernelYitingSystem = {
      entries: [
        {
          id: 'm1',
          name: '【回忆001】',
          turn: 1,
          summary: '港口相遇。',
          keywords: ['港口', '向导'],
        },
      ],
    };
    const story: KernelStoryProgress = {
      archives: [{ segmentTitle: '港口初遇', summary: '抵达港口。' }],
    };
    const zhiku: KernelZhikuSystem = {
      entries: [
        {
          id: 'z1',
          title: '向导档案',
          category: 'character',
          unlockStatus: '已解锁',
        },
        {
          id: 'z2',
          title: '隐藏势力',
          category: 'lore',
          unlockStatus: '未解锁',
        },
      ],
    };

    const injection = buildKnowledgeInjection({
      yiting,
      story,
      zhiku,
      query: '港口向导',
      yitingLimit: 4,
    });

    expect(injection).toContain('# 即时剧情回顾｜剧情回忆');
    expect(injection).toContain('# 剧情编织｜历史归档');
    expect(injection).toContain('# 智库｜已解锁资料');
    expect(injection).toContain('向导档案');
    expect(injection).not.toContain('隐藏势力');
  });

  it('returns empty when nothing contributes', () => {
    expect(
      buildKnowledgeInjection({
        query: '',
        yiting: { entries: [] },
        story: { archives: [] },
        zhiku: { entries: [] },
      }),
    ).toBe('');
  });

  it('uses story injectionHint in the combined block', () => {
    const injection = buildKnowledgeInjection({
      query: 'anything',
      story: {
        archives: [],
        injectionHint: '# 自定义剧情\n提示内容',
      },
    });

    expect(injection).toBe('# 自定义剧情\n提示内容');
  });
});
