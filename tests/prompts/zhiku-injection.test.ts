import { describe, expect, it } from 'vitest';
import { retrieveZhikuContext } from '@/services/zhikuRetrieval';
import { createPromptFixture, createZhikuFixture } from './fixtures';

describe('智库注入', () => {
  it('把被点名角色与相关背景资料交付给主剧情，且角色区先于背景区', () => {
    const { context } = createPromptFixture();
    const result = retrieveZhikuContext(createZhikuFixture(), context.recentUserInput, 5, context);

    const characterPayload = result.injection.indexOf('【基础识别】三月七');
    const locationPayload = result.injection.indexOf('空间站的指挥区域');
    expect(characterPayload).toBeGreaterThanOrEqual(0);
    expect(locationPayload).toBeGreaterThanOrEqual(0);
    expect(characterPayload).toBeLessThan(locationPayload);
  });
});
