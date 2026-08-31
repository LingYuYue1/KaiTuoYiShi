import { describe, expect, it } from 'vitest';
import { buildVariableModelPrompt } from '@/services/ai/variableModel';
import { createPromptFixture, createVariableStateFixture } from './fixtures';

// 不传内置模块：提示词中的动态内容只能来自传入的变量状态，静态文本无法伪造。
const PROBE_LOCATION = '变异探针地点ZQ7';

describe('变量状态 fixture', () => {
  it('覆盖的根键真正进入变量模型提示词', () => {
    const { world } = createPromptFixture();
    const state = createVariableStateFixture({ 世界: { ...world, 当前地点: PROBE_LOCATION } });
    const prompt = buildVariableModelPrompt(state, undefined, []);

    expect(prompt).toContain(PROBE_LOCATION);
  });

  it('未覆盖的根键在生产入口里落到缺省分支', () => {
    const empty = buildVariableModelPrompt(createVariableStateFixture(), undefined, []);

    expect(empty).not.toContain(PROBE_LOCATION);
    expect(empty).toContain('未知');
  });
});
