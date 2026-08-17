import { describe, expect, it } from 'vitest';
import { buildStoryWeavingInjection } from '@/services/storyWeaving';
import { createPromptFixture, createStoryWeavingFixture } from './fixtures';

describe('剧情编织注入', () => {
  it('将已历经、当前与前方分段作为不同运行时素材交付', () => {
    const { context } = createPromptFixture();
    const prompt = buildStoryWeavingInjection(createStoryWeavingFixture(), context);

    const section = (title: string) => {
      const start = prompt.indexOf(`【${title}】`);
      const end = prompt.indexOf('\n【', start + 1);
      return prompt.slice(start, end < 0 ? undefined : end);
    };

    expect(section('已历经的余波')).toContain('PREVIOUS_SEGMENT_PAYLOAD');
    expect(section('当前段核心素材')).toContain('CURRENT_SEGMENT_PAYLOAD');
    expect(section('前方情节预热')).toContain('NEXT_SEGMENT_PAYLOAD');
  });
});
