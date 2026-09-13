import { beforeEach, describe, expect, it, vi } from 'vitest';
import { autoCompressMemorySystemWithArchivesAsync } from '@/hooks/useGame/memoryUtils';
import type { API配置项 } from '@/models/settings';
import { 创建空记忆系统, 构建记忆失败草稿 } from '@/models/memory';
import {
  MEMORY_API_NOW as NOW,
  buildMemorySettings as buildSettings,
} from '../helpers/memoryApiFixture';

vi.mock('@/services/ai/chatCompletionClient', () => ({
  chatCompletionNonStream: vi.fn(),
}));

import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';

const nonStreamMock = vi.mocked(chatCompletionNonStream);

const mainConfig: API配置项 = {
  id: 'main',
  name: '主 API',
  provider: 'openai_compatible',
  baseUrl: 'https://main.example/v1',
  apiKey: 'sk-main',
  model: 'main-model',
  createdAt: 0,
  updatedAt: 0,
};

function buildMemory(immediate: string[]) {
  const memory = 创建空记忆系统();
  memory.即时记忆 = immediate;
  return memory;
}

beforeEach(() => {
  nonStreamMock.mockReset();
});

describe('记忆压缩失败草稿', () => {
  it('请求失败：原记忆不动，留下 pending 草稿', async () => {
    nonStreamMock.mockRejectedValue(new Error('网络错误'));
    const memory = buildMemory(['甲', '乙', '丙']);

    const outcome = await autoCompressMemorySystemWithArchivesAsync(memory, 5, buildSettings(), mainConfig);

    expect(outcome.failedDraft?.kind).toBe('short');
    expect(outcome.failedDraft?.failureCode).toBe('request_failed');
    expect(outcome.memory.即时记忆).toStrictEqual(['甲', '乙', '丙']);
    expect(outcome.memory.短期记忆).toStrictEqual([]);
    expect(outcome.memory.失败草稿).toHaveLength(1);
    expect(outcome.usedFallback).toBe(true);
    expect(outcome.usedModel).toBe(false);
  });

  it('空输出：留 empty_output 草稿且不消费批次', async () => {
    nonStreamMock.mockResolvedValue('   ');
    const outcome = await autoCompressMemorySystemWithArchivesAsync(buildMemory(['甲', '乙']), 5, buildSettings(), mainConfig);

    expect(outcome.failedDraft?.failureCode).toBe('empty_output');
    expect(outcome.memory.即时记忆).toStrictEqual(['甲', '乙']);
  });

  it('同类 pending 草稿阻塞自动压缩：不重复请求、不重复造草稿', async () => {
    const memory = buildMemory(['甲', '乙']);
    const draft = 构建记忆失败草稿({
      kind: 'short',
      turn: 4,
      items: ['甲', '乙'],
      prompt: '旧提示词',
      failureCode: 'request_failed',
      failureMessage: '上次失败',
      now: NOW,
    });
    memory.失败草稿 = draft ? [draft] : [];

    const outcome = await autoCompressMemorySystemWithArchivesAsync(memory, 5, buildSettings(), mainConfig);

    expect(nonStreamMock).not.toHaveBeenCalled();
    expect(outcome.failedDraft?.id).toBe(memory.失败草稿[0].id);
    expect(outcome.memory.失败草稿).toHaveLength(1);
    expect(outcome.memory.即时记忆).toStrictEqual(['甲', '乙']);
  });

  it('关闭 API 总结：走本地摘要、不请求、不产草稿', async () => {
    const outcome = await autoCompressMemorySystemWithArchivesAsync(
      buildMemory(['甲', '乙', '丙']),
      5,
      buildSettings({ 启用中短长期API总结: false }),
      mainConfig,
    );

    expect(nonStreamMock).not.toHaveBeenCalled();
    expect(outcome.failedDraft).toBeUndefined();
    expect(outcome.draftSkipped).toBe(false);
    expect(outcome.memory.即时记忆).toStrictEqual(['丙']);
    expect(outcome.memory.短期记忆).toHaveLength(1);
    expect(outcome.usedModel).toBe(false);
  });

  it('接口未配置：本地摘要继续，不产草稿', async () => {
    const outcome = await autoCompressMemorySystemWithArchivesAsync(
      buildMemory(['甲', '乙']),
      5,
      buildSettings({ 记忆总结API: { provider: '', baseUrl: '', apiKey: '', model: '', retryCount: 0 } }),
      { ...mainConfig, baseUrl: '', apiKey: '', model: '' },
    );

    expect(outcome.failedDraft).toBeUndefined();
    expect(outcome.memory.即时记忆).toStrictEqual([]);
    expect(outcome.memory.短期记忆).toHaveLength(1);
  });

  it('材料超界：不建草稿、以本地摘要消费并标记 draftSkipped', async () => {
    nonStreamMock.mockRejectedValue(new Error('网络错误'));
    const outcome = await autoCompressMemorySystemWithArchivesAsync(
      buildMemory(['超'.repeat(2500), '乙']),
      5,
      buildSettings(),
      mainConfig,
    );

    expect(outcome.failedDraft).toBeUndefined();
    expect(outcome.draftSkipped).toBe(true);
    expect(outcome.memory.即时记忆).toStrictEqual([]);
    expect(outcome.memory.短期记忆).toHaveLength(1);
  });
});
