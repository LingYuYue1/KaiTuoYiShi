import { describe, expect, it } from 'vitest';
import { buildNewsModelPrompt } from '@/services/ai/newsModel';
import { buildPhoneSystemPrompt } from '@/services/ai/phoneService';
import { buildVariableModelPrompt } from '@/services/ai/variableModel';
import { buildZhikuModelSystemPrompt } from '@/services/zhikuRetrieval';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import { 创建手机会话 } from '@/models/phone';
import { createPromptFixture, createVariableStateFixture } from './fixtures';

describe('独立模型提示词组装', () => {
  it('将真实内置模块交付给所属模型，并隔离其他独立模型模块', () => {
    const { traveler, world } = createPromptFixture();
    const modules = createBuiltinPromptModules();
    const required = (id: string) => {
      const item = modules.find((candidate) => candidate.id === id);
      expect(item).toMatchObject({ id, enabled: true, builtin: true });
      expect(item?.scope).toContain('calibration');
      expect(item?.content.trim()).not.toBe('');
      return item!;
    };
    const newsModule = required('builtin_news_cot');
    const phoneModule = required('builtin_phone_cot');
    const variableModule = required('builtin_variable_cot');
    const zhikuModule = required('builtin_zhiku_cot');
    const phone = buildPhoneSystemPrompt({ traveler, world, npcRecords: [], news: [], turnCount: 1, chat: 创建手机会话({ type: 'private', title: '三月七', participantIds: [] }) }, modules);
    const variable = buildVariableModelPrompt(createVariableStateFixture({ 世界: world }), undefined, modules);
    const news = buildNewsModelPrompt({ turnCount: 1, traveler, world, news: [], promptModules: modules });
    const zhiku = buildZhikuModelSystemPrompt([], modules);

    expect(phone).toContain(phoneModule.content);
    expect(phone).not.toContain(newsModule.content);
    expect(phone).not.toContain(variableModule.content);
    expect(phone).not.toContain(zhikuModule.content);
    expect(variable).toContain(variableModule.content);
    expect(variable).not.toContain(newsModule.content);
    expect(variable).not.toContain(phoneModule.content);
    expect(variable).not.toContain(zhikuModule.content);
    expect(news).toContain(newsModule.content);
    expect(news).not.toContain(phoneModule.content);
    expect(news).not.toContain(variableModule.content);
    expect(news).not.toContain(zhikuModule.content);
    expect(zhiku).toContain(zhikuModule.content);
    expect(zhiku).not.toContain(newsModule.content);
    expect(zhiku).not.toContain(phoneModule.content);
    expect(zhiku).not.toContain(variableModule.content);
  });
});
