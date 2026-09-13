import { describe, expect, it } from 'vitest';
import { 创建空角色 } from '@/models/character';
import { 创建空世界状态 } from '@/models/world';
import type { 世界事实 } from '@/models/storyWeaving';
import { 构造世界事实视图, 世界事实文本行 } from '@/services/storyFactConsumerView';
import { buildNewsUserMessage, type NewsModelRequest } from '@/services/ai/newsModel';

const 事实 = (factId: string, payload: Record<string, unknown>, playerKnown = true): 世界事实 => ({
  factId,
  factType: 'world_event',
  payload,
  sourceEventInstanceId: 'a',
  playerKnown,
  committedAt: 3,
});

function 建请求(overrides: Partial<NewsModelRequest> = {}): NewsModelRequest {
  return {
    config: {
      id: 'main', name: '主 API', provider: 'openai_compatible',
      baseUrl: 'https://main.example/v1', apiKey: 'sk', model: 'm', createdAt: 0, updatedAt: 0,
    },
    turnCount: 6,
    userInput: '继续前进',
    body: '列车缓缓驶离站台。',
    traveler: 创建空角色(),
    world: 创建空世界状态(),
    news: [],
    ...overrides,
  };
}

describe('世界事实消费视图', () => {
  it('优先玩家已知事实，退化到本回合事实，payload 摘要优先', () => {
    const view = 构造世界事实视图([
      事实('f1', { 摘要: '列车停运' }),
      事实('f2', { 摘要: '幕后交易' }, false),
    ], [事实('f3', {})]);
    expect(世界事实文本行(view)).toEqual(['world_event：列车停运']);
    expect(世界事实文本行(构造世界事实视图([], [事实('f3', {})]))).toEqual(['world_event：(无摘要)']);
    expect(世界事实文本行(构造世界事实视图([事实('f4', { 摘要: 'x' }), 事实('f5', { 摘要: 'y' })]), 1)).toEqual(['world_event：y']);
  });

  it('有事实视图时新闻提示词改用事实章节，缺省回退回合窗口', () => {
    const withFacts = buildNewsUserMessage(建请求({
      worldFacts: ['world_event：列车停运'],
      recentTurns: ['旧窗口不应出现'],
    }));
    expect(withFacts).toContain('本回合已提交的世界事实（只读，不得改写）');
    expect(withFacts).toContain('world_event：列车停运');
    expect(withFacts).not.toContain('旧窗口不应出现');
    expect(withFacts).not.toContain('本次新闻窗口内的近期回合');

    const withoutFacts = buildNewsUserMessage(建请求({ recentTurns: ['第 4 回合：抵达站台'] }));
    expect(withoutFacts).toContain('本次新闻窗口内的近期回合');
    expect(withoutFacts).toContain('第 4 回合：抵达站台');
    expect(buildNewsUserMessage(建请求())).toContain('（无额外窗口上下文，仅使用本回合正文）');
  });
});
