import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, createSystemPromptInput } from '@/hooks/useGame/systemPromptBuilder';
import { 创建空世界书 } from '@/models/worldbook';
import { createProbeWorldbookEntry, createPromptFixture } from './fixtures';

function buildMainPrompt(extra: Omit<Parameters<typeof createSystemPromptInput>[0], 'scope'>): string {
  return buildSystemPrompt(createSystemPromptInput({ ...extra, scope: 'main' })).systemPrompt;
}

describe('系统提示词占位符与装配', () => {
  it('世界书条目仅在世界书上下文存在时注入，且占位符按旅人信息替换', () => {
    const { traveler, world, settings, context } = createPromptFixture();
    const fingerprint = 'PROBE_WORLDBOOK_PAYLOAD';
    settings.enableWorldbookInjection = true;
    const worldbooks = [创建空世界书({ entries: [createProbeWorldbookEntry('probe-entry', fingerprint)] })];
    const turnCount = context.turnCount;

    const withoutCtx = buildMainPrompt({ traveler, world, settings, turnCount, worldbooks });
    expect(withoutCtx).not.toContain(fingerprint);

    const withCtx = buildMainPrompt({
      traveler, world, settings, turnCount, worldbooks,
      worldbookCtx: { ...context, originalProtagonist: '星' },
    });
    expect(withCtx).toContain(`${fingerprint}=${traveler.姓名}|原作主角星`);
    expect(withCtx).not.toMatch(/\{(?:playerName|originalProtagonist\w*)\}/);
  });

  it('主链装配产物携带旅人与场景特征数据', () => {
    const { traveler, world, settings, context } = createPromptFixture();
    const prompt = buildMainPrompt({ traveler, world, settings, turnCount: context.turnCount });

    expect(prompt).toContain(traveler.姓名);
    expect(prompt).toContain(world.当前地点);
    expect(prompt).not.toMatch(/\{(?:playerName|wordCountTarget|personLabel)\}/);
  });
});
