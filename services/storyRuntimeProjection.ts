// 世界演变排期投影（lean）：为激活系列的下一未开始分段生成一条到期事件，
// dueAt = 下一游戏日；已有实例（无论终态）不重建，保证重投影幂等。
import type { 剧情编织系统, 剧情编织运行时, 世界事件实例 } from '@/models/storyWeaving';
import { 世界事件上限 } from '@/models/storyWeaving';
import { 获取激活剧情系列 } from '@/services/storyProgressService';
import { 世界事件实例ID } from '@/utils/storyFactIdentity';

export function 投影排期事件(system: 剧情编织系统, runtime: 剧情编织运行时, 当前游戏日: number): 世界事件实例[] {
  const series = 获取激活剧情系列(system);
  if (!series || !series.激活注入) return runtime.worldEvents;
  const 当前组号 = system.当前进度?.当前分段组号 ?? series.当前分段组号;
  const next = series.分段列表
    .filter((segment) => segment.启用注入 && segment.处理状态 === '已完成' && segment.运行状态 === '未开始' && segment.组号 > 当前组号)
    .sort((a, b) => a.组号 - b.组号).at(0);
  if (!next) return runtime.worldEvents;
  const eventInstanceId = 世界事件实例ID(series.id, next.id);
  if (runtime.worldEvents.some((event) => event.eventInstanceId === eventInstanceId)) return runtime.worldEvents;
  const instance: 世界事件实例 = {
    eventInstanceId,
    segmentId: next.id,
    标题: next.标题,
    dueAt: Math.max(1, Math.trunc(当前游戏日) + 1),
    status: 'scheduled',
    updatedAt: Date.now(),
  };
  return [...runtime.worldEvents, instance].slice(-世界事件上限);
}
