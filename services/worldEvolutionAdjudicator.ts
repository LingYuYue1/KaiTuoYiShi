// 世界演变裁决（确定性）：候选只允许引用可结算集合（到期 ∪ 已排期未来事件）；非法候选整体拒绝，正式世界不变。
// resolve 到期事件→resolved；resolve 已排期未来事件→superseded（必须有 outcome，记 player_early 事实，原排期不再复演）。
// resolve 提交事实（factId 内容寻址），reschedule 重排到指定/下一游戏日，ignore 记 missed。
import { 归一化参与者名单, type 世界事件实例, type 世界事实 } from '@/models/storyWeaving';
import { 世界事实身份 } from '@/utils/storyFactIdentity';

export interface 世界演变候选事实 {
  factType: string;
  payload?: Record<string, unknown>;
  /** 玩家是否知晓：只有 true 才进入展示文本，默认 false。 */
  playerKnown?: boolean;
  /** 参与者姓名：透传给事实，NPC 记忆消费据此匹配。 */
  participants?: string[];
}

export interface 世界演变候选 {
  eventInstanceId: string;
  action: 'resolve' | 'reschedule' | 'ignore';
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
  /** 可结算集合：到期 ∪ 已排期未来事件（提前解决）。缺省回退为到期集合。 */
  resolvableInstanceIds?: string[];
  runtimeRevision: number;
  当前游戏日: number;
}): 世界演变裁决结果 {
  const resolvable = new Set(params.resolvableInstanceIds ?? params.dueInstanceIds);
  const byId = new Map(params.events.map((event) => [event.eventInstanceId, event]));
  for (const candidate of params.candidates) {
    const target = byId.get(candidate.eventInstanceId);
    if (!target || !resolvable.has(candidate.eventInstanceId)) {
      return { ok: false, message: `候选引用了不可结算事件：${candidate.eventInstanceId || '(空)'}` };
    }
    if (!['resolve', 'reschedule', 'ignore'].includes(candidate.action)) {
      return { ok: false, message: `候选动作非法：${candidate.action}` };
    }
    // scheduled（排期中）与 resolution_pending（本 revision 已领取）可结算；已终态不可再结算。
    if (target.status === 'resolved' || target.status === 'missed' || target.status === 'superseded') {
      return { ok: false, message: `候选引用了已终态事件：${candidate.eventInstanceId}` };
    }
    if (candidate.action === 'resolve' && target.status === 'scheduled') {
      const outcome = candidate.outcome?.trim() || candidate.note?.trim();
      if (!outcome) {
        return { ok: false, message: `提前解决必须给出 outcome：${candidate.eventInstanceId}` };
      }
    }
  }

  const now = Date.now();
  const facts: 世界事实[] = [];
  const candidateById = new Map(params.candidates.map((candidate) => [candidate.eventInstanceId, candidate]));
  const next = params.events.map((event) => {
    const candidate = candidateById.get(event.eventInstanceId);
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
      const participants = 归一化参与者名单(fact.participants);
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
        origin: event.status === 'scheduled' ? 'player_early' : 'world_evolution',
        ...(participants ? { participants } : {}),
      });
    }
    // resolve 已排期未来事件 = 提前解决：落 superseded，原排期不再复演。
    // （reschedule/ignore 已在上方返回，至此 action 必为 resolve。）
    if (event.status === 'scheduled') {
      return {
        ...event,
        status: 'superseded' as const,
        outcome,
        resolvedAt: params.当前游戏日,
        updatedAt: now,
      };
    }
    return {
      ...event,
      status: 'resolved' as const,
      outcome,
      resolvedAt: params.当前游戏日,
      updatedAt: now,
    };
  });

  return { ok: true, events: next, facts };
}
