// NPC 剧情事实记忆（factId 幂等）。
//
// 对齐全项目确认问题修复计划 6.2：
// - 不再用「摘要文本包含 factType」判断是否已写入；
// - 新事实记忆以稳定 factId 为幂等键，条目 ID 由 npc.id + factId 派生，重 Roll/重试不生成第二份；
// - 两条 factType 相同但 factId 不同的事实都进入对应 NPC 记忆；
// - 旧存档没有 关联事实ID 时保留原文本，不批量重写；只对新写入使用结构化身份。

import type { NPC记录, NPC同行记忆条目 } from '@/models/npc';
import { formatFactBrief, type StoryFactConsumerView } from './storyRuntime/storyFactConsumerView';

export interface NpcKnownFactItem {
  npcId: string;
  facts: StoryFactConsumerView['turnCommittedFacts'][number][];
}

/**
 * NPC 只消费统一事实视图中的明确参与者/知情者事实（npcKnownFacts 来自事件 participantIds
 * 或 payload 明确 NPC ID，不猜测名字、不批量广播；后台世界事件不写玩家功劳）。
 * 只给本回合有新事实的 NPC 追加同行记忆；以稳定 factId 为幂等键。
 */
export function applyNpcFactMemories(
  npcs: NPC记录[],
  npcKnownFacts: NpcKnownFactItem[],
  turnCommittedFacts: StoryFactConsumerView['turnCommittedFacts'],
  turn: number,
): NPC记录[] {
  const turnCommittedIds = new Set(turnCommittedFacts.map((fact) => fact.factId));
  const relevantByNpc = new Map<string, StoryFactConsumerView['turnCommittedFacts']>();
  for (const item of npcKnownFacts) {
    const facts = item.facts.filter((fact) => turnCommittedIds.has(fact.factId));
    if (facts.length) relevantByNpc.set(item.npcId, facts);
  }
  if (relevantByNpc.size === 0) return npcs;
  let changed = false;
  const next = npcs.map((npc) => {
    const facts = relevantByNpc.get(npc.id);
    if (!facts?.length) return npc;
    const existingFactIds = new Set(
      (npc.同行记忆 ?? []).map((item) => item.关联事实ID).filter((id): id is string => Boolean(id)),
    );
    const added = facts
      .filter((fact) => !existingFactIds.has(fact.factId))
      .map((fact) => {
        const brief = formatFactBrief(fact);
        const summary = brief.length > 120 ? `${brief.slice(0, 118)}…` : brief;
        const entry: NPC同行记忆条目 = {
          // 稳定条目 ID：由 npc.id + factId 派生，重试不生成随机新 ID。
          id: `npc_fact_${npc.id}_${fact.factId}`,
          回合: turn,
          摘要: `事实记录：${summary}`,
          来源: '其他' as const,
          关联NPCID: [npc.id],
          关联事实ID: fact.factId,
        };
        return entry;
      });
    if (!added.length) return npc;
    changed = true;
    return {
      ...npc,
      同行记忆: [...(npc.同行记忆 ?? []), ...added],
      最近回合: Math.max(npc.最近回合, turn),
    };
  });
  return changed ? next : npcs;
}
