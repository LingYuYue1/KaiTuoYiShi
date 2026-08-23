import { describe, expect, it } from 'vitest';
import { buildStoryWeavingInjection } from '@/services/storyWeaving';
import { createPromptFixture, createStoryWeavingFixture } from './fixtures';

describe('剧情编织注入', () => {
  it('已历经、当前与前方分段按顺序作为运行时素材交付', () => {
    const { context } = createPromptFixture();
    const prompt = buildStoryWeavingInjection(createStoryWeavingFixture(), context);

    const previous = prompt.indexOf('PREVIOUS_SEGMENT_PAYLOAD');
    const current = prompt.indexOf('CURRENT_SEGMENT_PAYLOAD');
    const next = prompt.indexOf('NEXT_SEGMENT_PAYLOAD');
    expect(previous).toBeGreaterThanOrEqual(0);
    expect(current).toBeGreaterThanOrEqual(0);
    expect(next).toBeGreaterThanOrEqual(0);
    expect(previous).toBeLessThan(current);
    expect(current).toBeLessThan(next);
  });
});
