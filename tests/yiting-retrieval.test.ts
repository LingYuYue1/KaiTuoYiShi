import { beforeEach, describe, expect, it, vi } from 'vitest';
import { 创建空忆庭系统, type 回忆条目 } from '@/models/yiting';
import { 创建默认记忆系统设置, 归一化记忆系统设置, type API配置项 } from '@/models/settings';
import {
  YITING_INJECTION_ORIGINAL_TOTAL_LIMIT,
  buildYitingInjection,
  retrieveYitingContextWithModel,
} from '@/services/yitingRetrieval';

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

function buildEntry(回合: number, 原文: string, 摘要: string, 名称?: string): 回忆条目 {
  return {
    id: `entry-${回合}`,
    ...(名称 ? { 名称 } : {}),
    回合,
    时间戳: '2026-09-13T00:00:00.000Z',
    摘要,
    原文,
  };
}

function buildRecallSettings(完整原文条数N: number) {
  return 归一化记忆系统设置({
    剧情回忆完整原文条数N: 完整原文条数N,
    忆庭召回API: {
      provider: 'openai_compatible',
      baseUrl: 'https://recall.example/v1',
      apiKey: 'sk-recall',
      model: 'recall-model',
    },
  });
}

beforeEach(() => {
  nonStreamMock.mockReset();
  nonStreamMock.mockResolvedValue('强回忆：1\n弱回忆：无');
});

describe('忆庭候选分层（完整原文条数 N）', () => {
  function buildArchive() {
    const system = 创建空忆庭系统();
    for (let turn = 1; turn <= 25; turn += 1) {
      system.回忆档案.push(buildEntry(turn, `旧原文${turn}`, `旧摘要${turn}`, `旧回忆${turn}`));
    }
    return system;
  }

  it('最近 N 条候选展示原文，更早的相关候选只展示概括', async () => {
    const system = buildArchive();
    await retrieveYitingContextWithModel(system, '旧回忆5', 8, buildRecallSettings(5), mainConfig);

    const userPrompt = nonStreamMock.mock.calls[0][1].messages[0].content;
    expect(userPrompt).toContain('原文：\n旧原文24');
    expect(userPrompt).toContain('短期记忆：\n旧摘要5');
    expect(userPrompt).not.toContain('原文：\n旧原文5');
  });

  it('N 覆盖全部条目时，早期相关候选也展示原文', async () => {
    const system = buildArchive();
    await retrieveYitingContextWithModel(system, '旧回忆5', 8, buildRecallSettings(25), mainConfig);

    const userPrompt = nonStreamMock.mock.calls[0][1].messages[0].content;
    expect(userPrompt).toContain('原文：\n旧原文5');
  });
});

describe('强回忆原文注入护栏', () => {
  it('单条原文超过上限时截断', () => {
    const tail = '结尾标记不应出现';
    const injection = buildYitingInjection([buildEntry(1, `开头标记${'甲'.repeat(3000)}${tail}`, '摘要')], []);

    expect(injection).toContain('开头标记');
    expect(injection).not.toContain(tail);
    expect(injection.length).toBeLessThan(2000);
  });

  it('总预算用尽后，剩余强回忆降级为摘要', () => {
    const strongEntries = Array.from({ length: 6 }, (_, index) => {
      const turn = index + 1;
      return buildEntry(turn, `原文${turn}开头${'乙'.repeat(2000)}原文${turn}尾巴`, `摘要${turn}号`);
    });
    const injection = buildYitingInjection(strongEntries, []);

    expect(injection).toContain('摘要6号');
    expect(injection).not.toContain('原文6尾巴');
    expect(injection.length).toBeLessThan(YITING_INJECTION_ORIGINAL_TOTAL_LIMIT + 500);
  });

  it('原文为空时回退摘要；弱回忆只注入摘要', () => {
    const injection = buildYitingInjection(
      [buildEntry(1, '', '强回忆只有摘要')],
      [buildEntry(2, '弱回忆原文', '弱回忆摘要')],
    );

    expect(injection).toContain('强回忆只有摘要');
    expect(injection).toContain('弱回忆摘要');
    expect(injection).not.toContain('弱回忆原文');
  });
});

describe('剧情回忆完整原文条数N 设置', () => {
  it('默认 20，非法值回退默认', () => {
    expect(创建默认记忆系统设置().剧情回忆完整原文条数N).toBe(20);
    expect(归一化记忆系统设置({ 剧情回忆完整原文条数N: 0 }).剧情回忆完整原文条数N).toBe(20);
  });
});
