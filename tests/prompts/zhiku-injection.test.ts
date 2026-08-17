import { describe, expect, it } from 'vitest';
import { retrieveZhikuContext } from '@/services/zhikuRetrieval';
import { createPromptFixture, createZhikuFixture } from './fixtures';

describe('智库注入', () => {
  it('把被点名角色与相关背景资料分区交付给主剧情', () => {
    const { context } = createPromptFixture();
    const result = retrieveZhikuContext(createZhikuFixture(), context.recentUserInput, 5, context);

    expect(result.injection).toContain('三月七');
    expect(result.injection).toContain('空间站主控舱段');
    expect(result.injection).toContain('在场角色档案（性格与演技指导）');
    expect(result.injection).toContain('强相关背景参考');
  });
});
