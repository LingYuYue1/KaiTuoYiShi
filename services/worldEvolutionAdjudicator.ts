// 世界演变裁决（确定性）：候选只允许引用本次到期集合；非法候选整体拒绝，正式世界不变。
// resolve 提交事实（factId 内容寻址），reschedule 重排到指定/下一游戏日，ignore 记 missed。
import type { 世界事件实例, 世界事实 } from '@/models/storyWeaving';
import { 世界事实身份 } from '@/utils/storyFactIdentity';

export interface 世界演变候选事实 {
  factType: string;
  payload?: Record<string, unknown>;
  /** 玩家是否知晓：只有 true 才进入展示文本，默认 false。 */
  playerKnown?: boolean;
}

export interface 世界演变候选 {
  eventInstanceId: string;
  action: 'resolve' | 'reschedule' | 'ignore';
  toStatus?: 'resolved' | 'missed' | 'superseded';
  /** reschedule 目标游戏日序；缺省为下一游戏日。 */
  dueAt?: number;
  outcome?: string;
  facts?: 世界演变候选事实[];
  note?: string;
}

export type 世界演变裁决结果 =
  | { ok: true; events: 世界事件实例[]; facts: 世界事实[] }
  | { ok: false; message: string };

export function 裁决世界演变(params: {
  candidates: 世界演变候选[];
  events: 世界事件实例[];
  dueInstanceIds: string[];
  runtimeRevision: number;
  当前游戏日: number;
}): 世界演变裁决结果 {
  const dueIds = new Set(params.dueInstanceIds);
  const byId = new Map(params.events.map((event) => [event.eventInstanceId, event]));
  for (const candidate of params.candidates) {
    if (!dueIds.has(candidate.eventInstanceId) || !byId.has(candidate.eventInstanceId)) {
      return { ok: false, message: `候选引用了非到期事件：${candidate.eventInstanceId || '(空)'}` };
    }
    if (!['resolve', 'reschedule', 'ignore'].includes(candidate.action)) {
      return { ok: false, message: `候选动作非法：${candidate.action}` };
    }
  }

  const now = Date.now();
  const facts: 世界事实[] = [];
  const next = params.events.map((event) => {
    const candidate = params.candidates.find((item) => item.eventInstanceId === event.eventInstanceId);
    if (!candidate) return event;
    const outcome = candidate.outcome?.trim() || candidate.note?.trim() || undefined;
    if (candidate.action === 'reschedule') {
      return {
        ...event,
        status: 'scheduled' as const,
        dueAt: Math.max(params.当前游戏日 + 1, Math.trunc(candidate.dueAt ?? params.当前游戏日 + 1)),
        resolutionKey: undefined,
        outcome,
        updatedAt: now,
      };
    }
    if (candidate.action === 'ignore') {
      return { ...event, status: 'missed' as const, outcome, resolvedAt: params.当前游戏日, updatedAt: now };
    }
    for (const fact of candidate.facts ?? []) {
      const factType = typeof fact.factType === 'string' ? fact.factType.trim() : '';
      if (!factType) continue;
      const payload = fact.payload ?? {};
      facts.push({
        factId: 世界事实身份({
          sourceEventInstanceId: event.eventInstanceId,
          sourceRevision: params.runtimeRevision,
          factType,
          payload,
        }),
        factType,
        payload,
        sourceEventInstanceId: event.eventInstanceId,
        playerKnown: fact.playerKnown === true,
        committedAt: params.当前游戏日,
      });
    }
    return {
      ...event,
      status: candidate.toStatus ?? ('resolved' as const),
      outcome,
      resolvedAt: params.当前游戏日,
      updatedAt: now,
    };
  });

  return { ok: true, events: next, facts };
}
