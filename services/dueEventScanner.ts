// 到期扫描（确定性）：自身已到期且未被领取的 scheduled 事件按 ID 稳定排序领取，
// 领取即写 resolutionKey（due:<revision>:<id>）；终态事件与已领取事件不动。
import type { 世界事件实例 } from '@/models/storyWeaving';

export interface 到期扫描结果 {
  events: 世界事件实例[];
  dueInstanceIds: string[];
}

export function 扫描到期世界事件(
  events: 世界事件实例[],
  runtimeRevision: number,
  当前游戏日: number,
): 到期扫描结果 {
  const due = events
    .filter((event) => event.status === 'scheduled' && !event.resolutionKey && event.dueAt <= 当前游戏日)
    .map((event) => event.eventInstanceId)
    .sort();
  // 无到期事件时返回原数组：调用方据此判断运行时未变，避免每回合重建存档对象。
  if (due.length === 0) return { events, dueInstanceIds: [] };
  const dueIds = new Set(due);
  return {
    events: events.map((event) => dueIds.has(event.eventInstanceId)
      ? { ...event, status: 'resolution_pending' as const, resolutionKey: `due:${runtimeRevision}:${event.eventInstanceId}`, updatedAt: Date.now() }
      : event),
    dueInstanceIds: due,
  };
}

/** 本回合未被裁决的领取退回 scheduled：清空领取标记，留给下一回合重试（失败非阻断）。 */
export function 退回未决事件(events: 世界事件实例[]): 世界事件实例[] {
  const 有待退事件 = events.some((event) => event.status === 'resolution_pending' && event.resolutionKey);
  if (!有待退事件) return events;
  return events.map((event) => event.status === 'resolution_pending' && event.resolutionKey
    ? { ...event, status: 'scheduled' as const, resolutionKey: undefined, updatedAt: Date.now() }
    : event);
}
