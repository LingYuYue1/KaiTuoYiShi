import { describe, expect, it } from 'vitest';
import {
  归一化剧情编织分段,
  归一化剧情编织系列,
  归一化剧情编织系统,
  归一化剧情编织运行时,
  type 剧情编织系统,
  世界事实上限,
  世界事件上限,
} from '@/models/storyWeaving';
import { 投影排期事件 } from '@/services/storyRuntimeProjection';
import { 扫描到期世界事件, 退回未决事件 } from '@/services/dueEventScanner';
import { 裁决世界演变, type 世界演变候选 } from '@/services/worldEvolutionAdjudicator';
import { 合并世界事实, 世界事件实例ID, 世界事实身份 } from '@/utils/storyFactIdentity';

function 建分段(input: { id: string; 组号: number; 运行状态: string; 标题?: string }) {
  return 归一化剧情编织分段({
    id: input.id,
    组号: input.组号,
    标题: input.标题 ?? `分段${input.组号}`,
    处理状态: '已完成',
    运行状态: input.运行状态 as never,
    启用注入: true,
  }, input.组号);
}

function 建系统(): 剧情编织系统 {
  const series = 归一化剧情编织系列({
    id: 's',
    标题: '测试系列',
    来源类型: 'custom',
    分段列表: [
      建分段({ id: 'c', 组号: 2, 运行状态: '当前', 标题: '当前段' }),
      建分段({ id: 'n', 组号: 3, 运行状态: '未开始', 标题: '下一段' }),
      建分段({ id: 'n2', 组号: 4, 运行状态: '未开始', 标题: '再下一段' }),
    ],
  });
  return 归一化剧情编织系统({ 当前系列ID: 's', 系列列表: [series] });
}

describe('运行时归一化', () => {
  it('缺省字段落默认、非法记录剔除、超限保留最近记录', () => {
    const runtime = 归一化剧情编织运行时({
      runtimeRevision: 3,
      worldEvents: [
        { eventInstanceId: 'a', segmentId: 's1', 标题: '旧', dueAt: 2, status: 'scheduled', updatedAt: 1 },
        { eventInstanceId: '', segmentId: 's2', 标题: '坏', dueAt: 2, status: 'scheduled', updatedAt: 1 },
        ...Array.from({ length: 世界事件上限 + 2 }, (_, index) => ({
          eventInstanceId: `e${index}`, segmentId: 's', 标题: 'x', dueAt: 1, status: 'scheduled' as const, updatedAt: 1,
        })),
      ],
      factLedger: Array.from({ length: 世界事实上限 + 1 }, (_, index) => ({
        factId: `f${index}`, factType: 'news', payload: {}, sourceEventInstanceId: 'a', playerKnown: false, committedAt: 1,
      })),
    });
    expect(runtime.schemaVersion).toBe(1);
    expect(runtime.runtimeRevision).toBe(3);
    expect(runtime.worldEvents.length).toBe(世界事件上限);
    expect(runtime.worldEvents.some((event) => event.eventInstanceId === '')).toBe(false);
    expect(runtime.factLedger.length).toBe(世界事实上限);
    expect(归一化剧情编织运行时(undefined).worldEvents).toEqual([]);
  });

  it('旧档系统归一化即补齐空运行时（只读迁移不推进剧情）', () => {
    const system = 归一化剧情编织系统({ 系列列表: [归一化剧情编织系列({ id: 's', 标题: 'x' })] });
    expect(system.运行时?.runtimeRevision).toBe(0);
    expect(system.运行时?.worldEvents).toEqual([]);
  });
});

describe('排期投影', () => {
  it('为下一未开始分段生成到期事件并保持幂等', () => {
    const system = 建系统();
    const runtime = 归一化剧情编织运行时(undefined);
    const events = 投影排期事件(system, runtime, 5);
    expect(events).toHaveLength(1);
    expect(events[0].eventInstanceId).toBe(世界事件实例ID('s', 'n'));
    expect(events[0].标题).toBe('下一段');
    expect(events[0].dueAt).toBe(6);
    expect(投影排期事件(system, { ...runtime, worldEvents: events }, 5)).toEqual(events);
    expect(投影排期事件(system, { ...runtime, worldEvents: events.map((e) => ({ ...e, status: 'resolved' as const })) }, 5))
      .toHaveLength(1);
  });

  it('没有下一分段或系列未激活时不动事件列表', () => {
    const system = 建系统();
    system.系列列表[0].激活注入 = false;
    const runtime = 归一化剧情编织运行时(undefined);
    expect(投影排期事件(system, runtime, 5)).toEqual([]);
  });
});

describe('到期扫描', () => {
  it('只领取已到期且带任务，稳定排序并写入领取标记', () => {
    const events = [
      { eventInstanceId: 'b', segmentId: 's', 标题: 'b', dueAt: 3, status: 'scheduled' as const, updatedAt: 0 },
      { eventInstanceId: 'a', segmentId: 's', 标题: 'a', dueAt: 3, status: 'scheduled' as const, updatedAt: 0 },
      { eventInstanceId: 'c', segmentId: 's', 标题: 'c', dueAt: 9, status: 'scheduled' as const, updatedAt: 0 },
    ];
    const scanned = 扫描到期世界事件(events, 4, 3);
    expect(scanned.dueInstanceIds).toEqual(['a', 'b']);
    expect(scanned.events.find((event) => event.eventInstanceId === 'a')?.status).toBe('resolution_pending');
    expect(scanned.events.find((event) => event.eventInstanceId === 'a')?.resolutionKey).toBe('due:4:a');
    expect(scanned.events.find((event) => event.eventInstanceId === 'c')?.status).toBe('scheduled');
    expect(扫描到期世界事件(scanned.events, 4, 3).dueInstanceIds).toEqual([]);
  });

  it('未决事件退回 scheduled 以便下回合重试，终态不动', () => {
    const events = [
      { eventInstanceId: 'a', segmentId: 's', 标题: 'a', dueAt: 3, status: 'resolution_pending' as const, resolutionKey: 'due:4:a', updatedAt: 0 },
      { eventInstanceId: 'b', segmentId: 's', 标题: 'b', dueAt: 3, status: 'resolved' as const, resolutionKey: 'due:4:b', updatedAt: 0 },
    ];
    const reverted = 退回未决事件(events);
    expect(reverted[0]).toMatchObject({ status: 'scheduled', resolutionKey: undefined });
    expect(reverted[1]).toBe(events[1]);
  });
});

describe('世界演变裁决', () => {
  const events = [
    { eventInstanceId: 'a', segmentId: 's', 标题: 'a', dueAt: 3, status: 'resolution_pending' as const, resolutionKey: 'due:4:a', updatedAt: 0 },
    { eventInstanceId: 'b', segmentId: 's', 标题: 'b', dueAt: 3, status: 'resolution_pending' as const, resolutionKey: 'due:4:b', updatedAt: 0 },
  ];

  it('非法候选整体拒绝，正式事件不变', () => {
    const result = 裁决世界演变({
      candidates: [{ eventInstanceId: 'not-due', action: 'resolve' }],
      events,
      dueInstanceIds: ['a', 'b'],
      runtimeRevision: 4,
      当前游戏日: 3,
    });
    expect(result.ok).toBe(false);
  });

  it('resolve 提交内容寻址事实，重试幂等去重', () => {
    const candidates: 世界演变候选[] = [{
      eventInstanceId: 'a',
      action: 'resolve',
      outcome: '车站停运',
      facts: [{ factType: 'world_event', payload: { 区域: '贝洛伯格' }, playerKnown: true }],
    }];
    const first = 裁决世界演变({ candidates, events, dueInstanceIds: ['a', 'b'], runtimeRevision: 4, 当前游戏日: 3 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.events.find((event) => event.eventInstanceId === 'a')?.status).toBe('resolved');
    expect(first.facts[0].factId).toBe(世界事实身份({
      sourceEventInstanceId: 'a', sourceRevision: 4, factType: 'world_event', payload: { 区域: '贝洛伯格' },
    }));
    // 同一结算重跑（revision 未推进，事件未被持久化为终态）产生完全相同的 factId，合并去重。
    const retry = 裁决世界演变({ candidates, events, dueInstanceIds: ['a', 'b'], runtimeRevision: 4, 当前游戏日: 3 });
    expect(retry.ok).toBe(true);
    if (!retry.ok) return;
    expect(retry.facts[0].factId).toBe(first.facts[0].factId);
    expect(合并世界事实(first.facts, retry.facts)).toHaveLength(1);
  });

  it('reschedule 重排日期并清空领取标记，ignore 记 missed', () => {
    const result = 裁决世界演变({
      candidates: [
        { eventInstanceId: 'a', action: 'reschedule' },
        { eventInstanceId: 'b', action: 'ignore', note: '被玩家提前解决' },
      ],
      events,
      dueInstanceIds: ['a', 'b'],
      runtimeRevision: 4,
      当前游戏日: 3,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.events[0]).toMatchObject({ status: 'scheduled', dueAt: 4, resolutionKey: undefined });
    expect(result.events[1]).toMatchObject({ status: 'missed', outcome: '被玩家提前解决', resolvedAt: 3 });
  });
});
