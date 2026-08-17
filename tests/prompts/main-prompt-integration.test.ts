import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from '@/hooks/useGame/systemPromptBuilder';
import { 创建空记忆系统 } from '@/models/memory';
import { createPromptFixture, createStoryWeavingFixture, createZhikuFixture } from './fixtures';

describe('主剧情最终提示词', () => {
  it('把玩家、当前地点、剧情滑窗与角色资料组装为无残留占位符的运行时提示词', () => {
    const { traveler, world, settings, context } = createPromptFixture();
    const result = buildSystemPrompt(
      traveler,
      world,
      创建空记忆系统(),
      settings,
      context.turnCount,
      [],
      context,
      [],
      [],
      [],
      createStoryWeavingFixture(),
      createZhikuFixture(),
    );

    expect(result.systemPrompt).toContain(traveler.姓名);
    expect(result.systemPrompt).toContain(world.当前地点);
    expect(result.systemPrompt).toContain('主控舱段警报');
    expect(result.systemPrompt).toContain('三月七');
    expect(result.systemPrompt).toContain('章节剧情素材与预热');
    expect(result.systemPrompt).toContain('本回合角色档案与设定参考');
    expect(result.systemPrompt).not.toMatch(/\{(?:playerName|wordCountTarget|personLabel)\}/);
  });
});
