import type { NPC记录 } from '@/models/npc';
import { 提取NPC同行记忆文本列表 } from '@/models/npc';
import type { 手机系统, 主动来信种子 } from '@/models/phone';

function normalizePhoneSeedComparableText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[，。！？!?；;、,.…~～“”"'\[\]（）()《》<>]/g, '')
    .trim();
}

function isPhoneSeedTextSimilar(a: string, b: string): boolean {
  const left = normalizePhoneSeedComparableText(a);
  const right = normalizePhoneSeedComparableText(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (left.length >= 12 && right.includes(left)) return true;
  if (right.length >= 12 && left.includes(right)) return true;
  const shared = [...new Set(left)].filter((char) => right.includes(char)).length;
  return shared / Math.max(1, Math.min(left.length, right.length)) >= 0.82;
}

function hasRecentSimilarPhoneSeed(input: {
  phone: 手机系统;
  npcId: string;
  turn: number;
  title: string;
  context: string;
  windowTurns?: number;
}): boolean {
  const windowTurns = Math.max(3, input.windowTurns ?? 12);
  const currentText = `${input.title}\n${input.context}`;
  return input.phone.messageSeeds.some((seed) => {
    if (input.turn - (Number(seed.turn) || 0) > windowTurns) return false;
    const sameTarget = seed.targetId === input.npcId || seed.targetId === `npc_${input.npcId}` || seed.relatedNpcIds.includes(input.npcId);
    if (!sameTarget) return false;
    return isPhoneSeedTextSimilar(currentText, `${seed.title}\n${seed.context}`);
  });
}

export function buildFallbackPhoneSeed(input: {
  phone: 手机系统;
  npcs: NPC记录[];
  turn: number;
  userInput: string;
  body: string;
  maxSeedsPerTurn: number;
  contactCooldownTurns: number;
}): 主动来信种子 | null {
  if (input.maxSeedsPerTurn <= 0) return null;
  const pendingCount = input.phone.messageSeeds.filter((seed) => seed.status === 'pending').length;
  if (pendingCount >= input.maxSeedsPerTurn) return null;
  if (input.phone.messageSeeds.some((seed) => seed.status === 'pending')) return null;

  const cooldown = Math.max(1, Math.trunc(input.contactCooldownTurns || 3));
  const fallbackGlobalCooldown = Math.max(3, cooldown);
  const lastNonUrgentSeedTurn = input.phone.messageSeeds
    .filter((seed) => seed.priority !== 'urgent')
    .reduce((latest, seed) => Math.max(latest, Number(seed.turn) || 0), 0);
  if (lastNonUrgentSeedTurn > 0 && input.turn - lastNonUrgentSeedTurn < fallbackGlobalCooldown) return null;

  const text = `${input.userInput}\n${input.body}`;
  const candidates = input.npcs
    .filter((npc) => npc.关系 !== 'enemy')
    .filter((npc) => npc.阶位 === 'companion' || npc.同行 || 提取NPC同行记忆文本列表(npc).length > 0)
    .filter((npc) => {
      const recentTurn = Number(npc.最近回合 || 0);
      if (recentTurn < Math.max(1, input.turn - 4)) return false;
      const aliases = [npc.姓名, npc.别名].filter((item): item is string => Boolean(item?.trim()));
      return npc.同行 || aliases.some((name) => text.includes(name));
    })
    .filter((npc) => {
      const lastSeedTurn = input.phone.messageSeeds
        .filter((seed) =>
          seed.targetId === npc.id ||
          seed.targetId === `npc_${npc.id}` ||
          seed.relatedNpcIds.includes(npc.id),
        )
        .reduce((latest, seed) => Math.max(latest, Number(seed.turn) || 0), 0);
      return lastSeedTurn <= 0 || input.turn - lastSeedTurn >= cooldown;
    })
    .sort((a, b) => {
      if (a.同行 !== b.同行) return a.同行 ? -1 : 1;
      const recentDiff = Number(b.最近回合 || 0) - Number(a.最近回合 || 0);
      if (recentDiff !== 0) return recentDiff;
      return 提取NPC同行记忆文本列表(b).length - 提取NPC同行记忆文本列表(a).length;
    });

  const npc = candidates[0];
  if (!npc) return null;
  const reason = [
    input.body.replace(/\s+/g, ' ').trim().slice(0, 120),
    提取NPC同行记忆文本列表(npc).slice(-1)[0],
  ].filter(Boolean).join('；');
  const title = `${npc.姓名}的跟进短讯`;
  const context = `${npc.姓名}近期与玩家有互动，可低频发来一条跟进、确认状况或延续约定的短讯。已发生事实：${reason || '近期剧情互动。'}`;
  if (hasRecentSimilarPhoneSeed({
    phone: input.phone,
    npcId: npc.id,
    turn: input.turn,
    title,
    context,
  })) {
    return null;
  }
  return {
    id: `phone_seed_fallback_${input.turn}_${npc.id}_${Math.random().toString(36).slice(2, 8)}`,
    turn: input.turn,
    source: 'main_story',
    triggerType: npc.同行 ? 'quest' : 'relationship',
    priority: 'low',
    targetType: 'private',
    targetId: npc.id,
    title,
    context,
    relatedNpcIds: [npc.id],
    expiresAfterTurns: 6,
    status: 'pending',
  };
}


