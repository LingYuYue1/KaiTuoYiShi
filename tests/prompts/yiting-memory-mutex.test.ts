import { describe, expect, it } from 'vitest';
import { buildSystemPrompt, createSystemPromptInput } from '@/hooks/useGame/systemPromptBuilder';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建默认游戏设置, 归一化记忆系统设置 } from '@/models/settings';
import { createPromptFixture } from './fixtures';

const HIT = '【剧情回忆】强回忆命中标记';
const SHORT = '短期记忆标记：主控舱段口令';
const MIDDLE = '中期记忆标记：与列车长的谈话';
const LONGS = [
  '空间站的警报一直没停',
  '列车组带回了仓库钥匙',
  '三月七约好去看极光',
  '黑塔委托调查星核样本',
  '开拓者答应帮忙修引擎',
];

function buildMainPrompt(options: { 并存注入: boolean; yitingInjectionOverride?: string }) {
  const base = createPromptFixture();
  base.settings.记忆系统 = 归一化记忆系统设置({
    ...base.settings.记忆系统,
    忆庭命中并存注入: options.并存注入,
  });
  const memory = 创建空记忆系统();
  memory.短期记忆 = [SHORT];
  memory.中期记忆 = [MIDDLE];
  memory.长期记忆 = [...LONGS];

  return buildSystemPrompt(createSystemPromptInput({
    scope: 'main',
    traveler: base.traveler,
    world: base.world,
    settings: base.settings,
    turnCount: base.context.turnCount,
    memory,
    worldbookCtx: base.context,
    ...(options.yitingInjectionOverride !== undefined
      ? { yitingInjectionOverride: options.yitingInjectionOverride }
      : {}),
  })).systemPrompt;
}

describe('忆庭命中并存注入开关', () => {
  it('默认并存：命中时短/中/长记忆全部照常注入', () => {
    expect(创建默认游戏设置().记忆系统.忆庭命中并存注入).toBe(true);

    const prompt = buildMainPrompt({ 并存注入: true, yitingInjectionOverride: HIT });
    expect(prompt).toContain(HIT);
    expect(prompt).toContain(SHORT);
    expect(prompt).toContain(MIDDLE);
    for (const entry of LONGS) expect(prompt).toContain(entry);
  });

  it('关闭并存且命中：暂停短/中期注入，长期只留最近 3 条锚点', () => {
    const prompt = buildMainPrompt({ 并存注入: false, yitingInjectionOverride: HIT });

    expect(prompt).toContain(HIT);
    expect(prompt).not.toContain(SHORT);
    expect(prompt).not.toContain(MIDDLE);
    expect(prompt).not.toContain(LONGS[0]);
    expect(prompt).not.toContain(LONGS[1]);
    expect(prompt).toContain(LONGS[2]);
    expect(prompt).toContain(LONGS[3]);
    expect(prompt).toContain(LONGS[4]);
  });

  it('关闭并存但未命中（override 为空）：记忆注入保持不变', () => {
    const prompt = buildMainPrompt({ 并存注入: false, yitingInjectionOverride: '' });

    expect(prompt).toContain(SHORT);
    expect(prompt).toContain(MIDDLE);
    expect(prompt).toContain(LONGS[0]);
  });

  it('关闭并存但未传 override 且无忆庭系统：记忆注入保持不变', () => {
    const prompt = buildMainPrompt({ 并存注入: false });

    expect(prompt).toContain(SHORT);
    expect(prompt).toContain(MIDDLE);
    expect(prompt).toContain(LONGS[0]);
  });

  it('非法持久化值回退为 true（并存）', () => {
    expect(归一化记忆系统设置({ 忆庭命中并存注入: 'no' as never }).忆庭命中并存注入).toBe(true);
  });
});
