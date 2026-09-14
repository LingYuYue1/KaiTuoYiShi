import { describe, expect, it } from 'vitest';
import {
  归一化剧情编织分段,
  归一化剧情编织系列,
  type 剧情编织分段,
  type 世界事实,
} from '@/models/storyWeaving';
import { 归一化NPC记录列表, 提取NPC同行记忆文本列表 } from '@/models/npc';
import { parseWorldEvolutionResponse } from '@/services/worldEvolution';
import { 裁决世界演变 } from '@/services/worldEvolutionAdjudicator';
import { 可展示世界事件 } from '@/services/storyFactConsumerView';
import { applyWorldFactNpcMemory, 世界事实NPC记忆上限 } from '@/services/worldFactNpcMemory';

function 事实(partial: Partial<世界事实> & { factId: string }): 世界事实 {
  return {
    factType: 'world_event',
    payload: {},
    sourceEventInstanceId: 'e',
    playerKnown: true,
    committedAt: 3,
    ...partial,
  };
}

describe('participants 解析与透传', () => {
  it('响应解析接受 participants 字符串数组', () => {
    const candidates = parseWorldEvolutionResponse(
      '[{"eventInstanceId":"a","action":"resolve","outcome":"平息","facts":[{"factType":"world_event","payload":{"事":"平息"},"playerKnown":true,"participants":["三月七", 123]}]}]',
    );
    expect(candidates?.[0]?.facts?.[0]).toMatchObject({ participants: ['三月七'] });
  });

  it('裁决透传 participants（去重裁剪），无参与者不写字段', () => {
    const events = [
      { eventInstanceId: 'a', segmentId: 's', 标题: 'a', dueAt: 3, status: 'resolution_pending' as const, updatedAt: 0 },
    ];
    const result = 裁决世界演变({
      candidates: [{
        eventInstanceId: 'a',
        action: 'resolve',
        outcome: '平息',
        facts: [
          { factType: 'world_event', payload: {}, participants: ['三月七', '三月七', ' '] },
          { factType: 'other', payload: {} },
        ],
      }],
      events,
      dueInstanceIds: ['a'],
      runtimeRevision: 4,
      当前游戏日: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.facts[0]).toMatchObject({ participants: ['三月七'] });
    expect('participants' in result.facts[1]).toBe(false);
  });
});

describe('世界事实写入 NPC 记忆', () => {
  function 同伴() {
    return 归一化NPC记录列表([{ 姓名: '三月七', 阶位: 'companion' }]);
  }

  it('参与者匹配同伴姓名追加一条世界事件记忆', () => {
    const npcs = 同伴();
    const next = applyWorldFactNpcMemory(
      npcs,
      [事实({ factId: 'f1', payload: { 结果: '残骸研究完成' }, participants: ['三月七'] })],
      8,
    );
    expect(next).not.toBe(npcs);
    const texts = 提取NPC同行记忆文本列表(next[0]);
    expect(texts).toHaveLength(1);
    expect(texts[0]).toContain('世界事件：');
    expect(texts[0]).toContain('残骸研究完成');
  });

  it('无参与者或匹配不到时返回同一引用', () => {
    const npcs = 同伴();
    expect(applyWorldFactNpcMemory(npcs, [事实({ factId: 'f1' })], 8)).toBe(npcs);
    expect(applyWorldFactNpcMemory(npcs, [事实({ factId: 'f1', participants: ['丹恒'] })], 8)).toBe(npcs);
    expect(applyWorldFactNpcMemory(npcs, [], 8)).toBe(npcs);
  });

  it('路人 NPC（非同行、无记忆）不写入', () => {
    const npcs = 归一化NPC记录列表([{ 姓名: '站员甲', 阶位: 'extra' }]);
    const next = applyWorldFactNpcMemory(
      npcs,
      [事实({ factId: 'f1', payload: { 结果: '骚动' }, participants: ['站员甲'] })],
      8,
    );
    expect(next).toBe(npcs);
  });

  it('同回合重跑幂等：不再追加', () => {
    const npcs = 同伴();
    const facts = [事实({ factId: 'f1', payload: { 结果: '残骸研究完成' }, participants: ['三月七'] })];
    const once = applyWorldFactNpcMemory(npcs, facts, 8);
    const twice = applyWorldFactNpcMemory(once, facts, 8);
    expect(twice).toBe(once);
    expect(提取NPC同行记忆文本列表(twice[0])).toHaveLength(1);
  });

  it('每 NPC 每回合追加有上限', () => {
    const npcs = 同伴();
    const facts = Array.from({ length: 世界事实NPC记忆上限 + 2 }, (_, index) =>
      事实({ factId: `f${index}`, payload: { 结果: `事件${index}` }, participants: ['三月七'] }));
    const next = applyWorldFactNpcMemory(npcs, facts, 8);
    expect(提取NPC同行记忆文本列表(next[0])).toHaveLength(世界事实NPC记忆上限);
  });
});

describe('展示门', () => {
  function 分段(id: string, 组号: number, 运行状态: 剧情编织分段['运行状态']): 剧情编织分段 {
    return 归一化剧情编织分段({
      id, 组号, 标题: id, 处理状态: '已完成', 运行状态, 启用注入: true,
    }, 组号);
  }
  const 系列列表 = [归一化剧情编织系列({
    id: 's',
    标题: '测试系列',
    来源类型: 'custom',
    分段列表: [分段('past', 1, '已经历'), 分段('cur', 2, '当前'), 分段('next', 3, '未开始')],
  })];

  function 事件(id: string, segmentId: string) {
    return { eventInstanceId: id, segmentId, 标题: id, dueAt: 3, status: 'resolved' as const, updatedAt: 0 };
  }

  it('未来分段事件不展示，当前及过去展示', () => {
    const shown = 可展示世界事件([事件('a', 'past'), 事件('b', 'cur'), 事件('c', 'next')], 系列列表, 2);
    expect(shown.map((event) => event.eventInstanceId)).toEqual(['a', 'b']);
  });

  it('分段查不到或组号未知时放行', () => {
    expect(可展示世界事件([事件('x', 'unknown')], 系列列表, 2)).toHaveLength(1);
    expect(可展示世界事件([事件('c', 'next')], 系列列表, undefined)).toHaveLength(1);
  });
});
