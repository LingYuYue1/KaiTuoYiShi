import { describe, expect, it, vi } from 'vitest';
import { 创建默认剧情编织系统设置, 归一化剧情编织系统设置 } from '@/models/settings';
import type { 世界事件实例 } from '@/models/storyWeaving';
import { 归一化剧情编织运行时 } from '@/models/storyWeaving';
import {
  buildWorldEvolutionPrompt,
  parseWorldEvolutionResponse,
  runWorldEvolutionStep,
} from '@/services/worldEvolution';
import type { API配置项 } from '@/models/settings';

const config: API配置项 = {
  id: 'main',
  name: '主 API',
  provider: 'openai_compatible',
  baseUrl: 'https://main.example/v1',
  apiKey: 'sk-main',
  model: 'main-model',
  createdAt: 0,
  updatedAt: 0,
};

const 事件 = (eventInstanceId: string, dueAt = 3): 世界事件实例 => ({
  eventInstanceId,
  segmentId: 'n',
  标题: `事件${eventInstanceId}`,
  dueAt,
  status: 'resolution_pending',
  resolutionKey: `due:0:${eventInstanceId}`,
  updatedAt: 0,
});

describe('世界演变开关迁移', () => {
  it('新档默认开启，旧档缺省/整个对象缺失关闭，显式值保留', () => {
    expect(创建默认剧情编织系统设置().世界演变).toBe(true);
    expect(归一化剧情编织系统设置(undefined).世界演变).toBe(false);
    expect(归一化剧情编织系统设置({ enabled: true }).世界演变).toBe(false);
    expect(归一化剧情编织系统设置({ enabled: true, 世界演变: true }).世界演变).toBe(true);
    expect(归一化剧情编织系统设置({ enabled: true, 世界演变: false }).世界演变).toBe(false);
  });
});

describe('世界演变响应解析', () => {
  it('支持裸数组与 candidates 包装，非法项整体拒绝', () => {
    const parsed = parseWorldEvolutionResponse('[{"eventInstanceId":"a","action":"resolve","facts":[{"factType":"world_event","payload":{},"playerKnown":true}]}]');
    expect(parsed?.[0]).toMatchObject({ eventInstanceId: 'a', action: 'resolve' });
    expect(parsed?.[0].facts?.[0].playerKnown).toBe(true);
    expect(parseWorldEvolutionResponse('{"candidates":[{"eventInstanceId":"a","action":"ignore"}]}')).toHaveLength(1);
    expect(parseWorldEvolutionResponse('[{"eventInstanceId":"a","action":"explode"}]')).toBeNull();
    expect(parseWorldEvolutionResponse('[{"action":"resolve"}]')).toBeNull();
    expect(parseWorldEvolutionResponse('not json')).toBeNull();
  });

  it('提示词包含到期事件与线索', () => {
    const prompt = buildWorldEvolutionPrompt({ 当前游戏日: 4, dueEvents: [事件('a')], clues: ['远处传来警报'] });
    expect(prompt).toContain('a｜事件a｜第 3 日到期');
    expect(prompt).toContain('远处传来警报');
  });
});

describe('runWorldEvolutionStep', () => {
  it('无到期事件且无线索时不调用模型', async () => {
    const callModel = vi.fn();
    const result = await runWorldEvolutionStep({
      config,
      events: [],
      dueInstanceIds: [],
      clues: [],
      当前游戏日: 4,
      callModel,
    });
    expect(result).toEqual({ ok: true, skipped: true, candidates: [] });
    expect(callModel).not.toHaveBeenCalled();
  });

  it('到期事件触发调用并返回候选；仅线索也可触发', async () => {
    const callModel = vi.fn().mockResolvedValue('[{"eventInstanceId":"a","action":"resolve"}]');
    const byDue = await runWorldEvolutionStep({
      config,
      events: [事件('a')],
      dueInstanceIds: ['a'],
      clues: [],
      当前游戏日: 4,
      callModel,
    });
    expect(byDue).toMatchObject({ ok: true, skipped: false });
    expect(callModel).toHaveBeenCalledTimes(1);

    const byClue = await runWorldEvolutionStep({
      config,
      events: [],
      dueInstanceIds: [],
      clues: ['广场上人群聚集'],
      当前游戏日: 4,
      callModel,
    });
    expect(byClue).toMatchObject({ ok: true, skipped: false });
  });

  it('未配置 / 解析失败 / 调用异常一律非阻断失败', async () => {
    const base = { events: [事件('a')], dueInstanceIds: ['a'], clues: [], 当前游戏日: 4 };
    expect((await runWorldEvolutionStep({ ...base, config: null })).ok).toBe(false);
    expect((await runWorldEvolutionStep({ ...base, config, callModel: vi.fn().mockResolvedValue('nope') })).ok).toBe(false);
    expect((await runWorldEvolutionStep({ ...base, config, callModel: vi.fn().mockRejectedValue(new Error('boom')) })).ok).toBe(false);
  });

  it('运行时归一化保留终态事件且空运行时可用', () => {
    const runtime = 归一化剧情编织运行时({ worldEvents: [{ ...事件('a'), status: 'resolved', resolvedAt: 3 }] });
    expect(runtime.worldEvents[0].status).toBe('resolved');
    expect(归一化剧情编织运行时(undefined).runtimeRevision).toBe(0);
  });
});
