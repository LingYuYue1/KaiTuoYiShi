/**
 * Stage 5.2 — buildStoryContextInjection pure unit tests.
 */

import { describe, expect, it } from 'vitest';
import { buildStoryContextInjection } from '@/src/kernel/domain/narrative';
import type { KernelStoryProgress } from '@/src/kernel/domain/knowledge';

describe('buildStoryContextInjection (Stage 5.2)', () => {
  it('prefers injectionHint when set', () => {
    const story: KernelStoryProgress = {
      archives: [
        { segmentTitle: 'A', summary: 'summary-a' },
      ],
      injectionHint: '# 预构建剧情注入\n锚点：灯塔',
    };

    expect(buildStoryContextInjection(story)).toBe('# 预构建剧情注入\n锚点：灯塔');
  });

  it('joins recent archive titles/summaries when no hint', () => {
    const story: KernelStoryProgress = {
      archives: [
        { segmentTitle: '港口初遇', summary: '旅人抵达港口。' },
        { segmentTitle: '灯塔守夜', summary: '风暴中守住灯火。' },
      ],
    };

    const injection = buildStoryContextInjection(story);

    expect(injection).toContain('# 剧情编织｜历史归档');
    expect(injection).toContain('港口初遇');
    expect(injection).toContain('旅人抵达港口');
    expect(injection).toContain('灯塔守夜');
    expect(injection).toContain('风暴中守住灯火');
  });

  it('returns empty for undefined story or empty archives', () => {
    expect(buildStoryContextInjection(undefined)).toBe('');
    expect(buildStoryContextInjection({ archives: [] })).toBe('');
  });
});
