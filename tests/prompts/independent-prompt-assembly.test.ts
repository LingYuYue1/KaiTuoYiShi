import { describe, expect, it } from 'vitest';
import { buildNewsModelPrompt } from '@/services/ai/newsModel';
import { buildPhoneSystemPrompt } from '@/services/ai/phoneService';
import { buildVariableModelPrompt } from '@/services/ai/variableModel';
import { buildZhikuModelSystemPrompt } from '@/services/zhikuRetrieval';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import { 创建手机会话 } from '@/models/phone';
import { createPromptFixture, createVariableStateFixture } from './fixtures';

describe('独立模型提示词组装', () => {
  it.each([
    ['phone', 'builtin_phone_cot'],
    ['variable', 'builtin_variable_cot'],
    ['news', 'builtin_news_cot'],
    ['zhiku', 'builtin_zhiku_cot'],
  ])('将真实内置模块交付给 %s，并隔离其他独立模型模块', (owner, moduleId) => {
    const { traveler, world } = createPromptFixture();
    const modules = createBuiltinPromptModules();
    const required = (id: string) => {
      const item = modules.find((candidate) => candidate.id === id);
      expect(item).toMatchObject({ id, enabled: true, builtin: true });
      expect(item?.scope).toContain('calibration');
      expect(item?.content.trim()).not.toBe('');
      if (!item) throw new Error(`缺少内置提示词模块: ${id}`);
      return item;
    };
    const contents: Record<string, string> = {
      phone: buildPhoneSystemPrompt({ traveler, world, npcRecords: [], news: [], turnCount: 1, chat: 创建手机会话({ type: 'private', title: '三月七', participantIds: [] }) }, modules),
      variable: buildVariableModelPrompt(createVariableStateFixture({ 世界: world }), undefined, modules),
      news: buildNewsModelPrompt({ turnCount: 1, traveler, world, news: [], promptModules: modules }),
      zhiku: buildZhikuModelSystemPrompt([], modules),
    };
    const own = required(moduleId);
    expect(contents[owner]).toContain(own.content);
    for (const [otherOwner, otherId] of [['phone', 'builtin_phone_cot'], ['variable', 'builtin_variable_cot'], ['news', 'builtin_news_cot'], ['zhiku', 'builtin_zhiku_cot']] as Array<[string, string]>) {
      if (otherOwner === owner) continue;
      expect(contents[owner]).not.toContain(required(otherId).content);
    }
  });
});
