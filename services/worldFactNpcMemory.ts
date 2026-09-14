// 世界事实 → NPC 同行记忆（lean 版 npcKnownFacts）：只消费 AI 显式给出的 participants，
// 按姓名/别名精确匹配（或参与者串包含别名），不做文本反推；只写已追踪的同行 NPC。
// 幂等：条目 id 由内容键稳定生成，重复调用不追加。
import type { NPC记录 } from '@/models/npc';
import { 提取NPC同行记忆文本列表, 生成NPC记忆ID } from '@/models/npc';
import type { 世界事实 } from '@/models/storyWeaving';
import { 事实摘要 } from '@/services/storyFactConsumerView';

/** 每 NPC 每回合最多追加条数：世界事实是摘要线，不挤占压缩预算。 */
export const 世界事实NPC记忆上限 = 3;

function 事实文本(fact: 世界事实): string {
  return 事实摘要(fact.payload) || fact.factType.trim();
}

function 匹配NPC(npcs: NPC记录[], participant: string): NPC记录 | undefined {
  const name = participant.trim();
  if (!name) return undefined;
  return npcs.find((npc) => {
    const aliases = [npc.姓名, npc.别名].filter((item): item is string => Boolean(item?.trim()));
    return aliases.some((alias) => name === alias.trim() || name.includes(alias.trim()));
  });
}

function 可追踪(npc: NPC记录): boolean {
  return npc.阶位 === 'companion' || npc.同行 || 提取NPC同行记忆文本列表(npc).length > 0;
}

export function applyWorldFactNpcMemory(npcs: NPC记录[], facts: 世界事实[], turn: number): NPC记录[] {
  if (!facts.length) return npcs;
  const added = new Map<string, number>();
  const next = npcs.map((npc) => {
    if (!可追踪(npc)) return npc;
    const existing = 提取NPC同行记忆文本列表(npc);
    const lines: NPC记录['同行记忆'] = [];
    for (const fact of facts) {
      if ((added.get(npc.id) ?? 0) >= 世界事实NPC记忆上限) break;
      const participants = fact.participants ?? [];
      if (!participants.some((name) => 匹配NPC([npc], name) !== undefined)) continue;
      const text = 事实文本(fact);
      if (!text) continue;
      const clean = text.length > 120 ? `${text.slice(0, 118)}…` : text;
      const 摘要 = `世界事件：${clean}`;
      if (existing.some((item) => item.includes(摘要))) continue;
      lines.push({
        id: 生成NPC记忆ID('mem', turn, 摘要),
        回合: turn,
        摘要,
        来源: '其他',
        关联NPCID: [npc.id],
      });
      added.set(npc.id, (added.get(npc.id) ?? 0) + 1);
    }
    if (!lines.length) return npc;
    // 同 id 重入（同回合重跑）不重复追加。
    const knownIds = new Set((npc.同行记忆 ?? []).map((item) => item.id));
    const fresh = lines.filter((item) => !knownIds.has(item.id));
    if (!fresh.length) return npc;
    return {
      ...npc,
      同行记忆: [...(npc.同行记忆 ?? []), ...fresh],
      最近回合: Math.max(npc.最近回合, turn),
    };
  });
  const changed = next.some((npc, index) => npc !== npcs[index]);
  return changed ? next : npcs;
}
