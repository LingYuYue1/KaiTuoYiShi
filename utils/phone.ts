import type { 聊天消息 } from '@/models/chat';
import type { 相册系统 } from '@/models/imageGeneration';
import type { NPC记录 } from '@/models/npc';
import { 格式化NPC关系, 读取NPC头像 } from '@/models/npc';
import type {
  手机会话,
  手机会话本地库,
  手机会话本地摘要条目,
  手机联系人,
  手机消息,
  手机系统,
  主动来信种子,
} from '@/models/phone';
import { 创建手机消息, 创建手机会话本地库 } from '@/models/phone';
import type { 游戏设置 } from '@/models/settings';
import type { 世界状态 } from '@/models/world';
import { 解析相册资源引用 } from '@/utils/albumActions';

// ── id 归一化（唯一出口，消除三处重复 startsWith('npc_')）──
export function canonicalContactId(id: string): string {
  return id.startsWith('npc_') ? id : `npc_${id}`;
}

export function normalizeParticipantId(contacts: 手机联系人[], id: string): string {
  if (!id) return '';
  const direct = contacts.find((contact) => contact.id === id || contact.npcId === id);
  return direct?.id ?? canonicalContactId(id);
}

// ── 剧情兜底联系人 ──
export const FALLBACK_STORY_CONTACTS: Array<
  Pick<手机联系人, 'id' | 'name' | 'organization' | 'relationLabel' | 'avatar'> & { aliases: string[] }
> = [
  { id: 'canon_march_7th', name: '三月七', aliases: ['三月七', '三月'], organization: '星穹列车', relationLabel: '伙伴', avatar: '三' },
  { id: 'canon_dan_heng', name: '丹恒', aliases: ['丹恒'], organization: '星穹列车', relationLabel: '伙伴', avatar: '丹' },
  { id: 'canon_himeko', name: '姬子', aliases: ['姬子'], organization: '星穹列车', relationLabel: '列车组', avatar: '姬' },
  { id: 'canon_welt', name: '瓦尔特', aliases: ['瓦尔特', '杨叔'], organization: '星穹列车', relationLabel: '列车组', avatar: '瓦' },
  { id: 'canon_pompom', name: '帕姆', aliases: ['帕姆'], organization: '星穹列车', relationLabel: '列车长', avatar: '帕' },
  { id: 'canon_asta', name: '艾丝妲', aliases: ['艾丝妲'], organization: '黑塔空间站', relationLabel: '已认识', avatar: '艾' },
  { id: 'canon_arlan', name: '阿兰', aliases: ['阿兰'], organization: '黑塔空间站', relationLabel: '已认识', avatar: '阿' },
  { id: 'canon_bronya', name: '布洛妮娅', aliases: ['布洛妮娅'], organization: '贝洛伯格', relationLabel: '已认识', avatar: '布' },
  { id: 'canon_seele', name: '希儿', aliases: ['希儿'], organization: '地火', relationLabel: '已认识', avatar: '希' },
  { id: 'canon_sampo', name: '桑博', aliases: ['桑博'], organization: '贝洛伯格', relationLabel: '已认识', avatar: '桑' },
  { id: 'canon_natasha', name: '娜塔莎', aliases: ['娜塔莎'], organization: '地火', relationLabel: '已认识', avatar: '娜' },
  { id: 'canon_gepard', name: '杰帕德', aliases: ['杰帕德'], organization: '银鬃铁卫', relationLabel: '已认识', avatar: '杰' },
];

export function buildFallbackContactsFromStory(params: {
  mainChatHistory: 聊天消息[];
  world: 世界状态;
  existingContacts: 手机联系人[];
  turnCount: number;
}): 手机联系人[] {
  if (params.existingContacts.length > 0) return [];
  const recentText = [
    params.world.当前地点,
    ...params.mainChatHistory
      .slice(-18)
      .map((message) => message.parsedResponse?.body || message.content),
  ].join('\n');
  const unlocked = FALLBACK_STORY_CONTACTS
    .filter((contact) => contact.aliases.some((alias) => recentText.includes(alias)))
    .slice(0, 8)
    .map((contact) => ({
      id: contact.id,
      name: contact.name,
      avatar: contact.avatar,
      organization: contact.organization,
      relationLabel: contact.relationLabel,
      available: true,
      status: 'available' as const,
      unlockSource: 'story' as const,
      lastActiveTurn: params.turnCount,
    }));
  if (unlocked.length) return unlocked;
  return FALLBACK_STORY_CONTACTS.slice(0, 2).map((contact) => ({
    id: contact.id,
    name: contact.name,
    avatar: contact.avatar,
    organization: contact.organization,
    relationLabel: contact.relationLabel,
    available: true,
    status: 'available' as const,
    unlockSource: 'system' as const,
    lastActiveTurn: params.turnCount,
  }));
}

// ── 联系人派生 / 合并 ──
export function deriveContacts(normalizedNpcRecords: NPC记录[], album?: 相册系统): 手机联系人[] {
  return normalizedNpcRecords
    .filter((npc) => npc.关系 !== 'enemy')
    .map((npc) => ({
      id: canonicalContactId(npc.id),
      npcId: npc.id,
      name: npc.姓名,
      avatar: 解析相册资源引用(album, 读取NPC头像(npc, '手机')),
      organization: undefined,
      relationLabel: 格式化NPC关系(npc.好感度, Boolean(npc.亲密关系)),
      available: true,
      lastActiveTurn: npc.最近回合,
    }));
}

export function mergeContacts(
  phoneContacts: 手机联系人[],
  derivedContacts: 手机联系人[],
  fallbackStoryContacts: 手机联系人[],
  normalizedNpcRecords: NPC记录[],
  album?: 相册系统,
): 手机联系人[] {
  return [...phoneContacts, ...fallbackStoryContacts]
    .map((contact) => {
      const derived =
        derivedContacts.find((item) => item.id === contact.id) ??
        derivedContacts.find((item) => item.npcId && item.npcId === contact.npcId);
      return {
        ...derived,
        ...contact,
        avatar: 解析相册资源引用(album, contact.avatar || derived?.avatar),
        organization: contact.organization || (contact as { faction?: string }).faction || derived?.organization,
        relationLabel: derived?.relationLabel || contact.relationLabel,
        available: contact.available,
        lastActiveTurn: contact.lastActiveTurn ?? derived?.lastActiveTurn,
      };
    })
    .filter((contact) => {
      if (contact.relationLabel === '敌人') return false;
      if (contact.status === 'hidden') return false;
      if (contact.npcId) {
        const npc = normalizedNpcRecords.find((item) => item.id === contact.npcId);
        if (npc?.关系 === 'enemy') return false;
      }
      return contact.available;
    });
}

export function deriveAddableContacts(
  normalizedNpcRecords: NPC记录[],
  phoneContacts: 手机联系人[],
  album?: 相册系统,
): 手机联系人[] {
  return normalizedNpcRecords
    .filter((npc) => npc.关系 !== 'enemy')
    .filter(
      (npc) => !phoneContacts.some((contact) => contact.npcId === npc.id || contact.id === canonicalContactId(npc.id)),
    )
    .map((npc) => ({
      id: canonicalContactId(npc.id),
      npcId: npc.id,
      name: npc.姓名,
      avatar: 解析相册资源引用(album, 读取NPC头像(npc, '手机')),
      organization: undefined,
      relationLabel: 格式化NPC关系(npc.好感度, Boolean(npc.亲密关系)),
      available: true,
      status: 'available' as const,
      unlockSource: 'manual' as const,
      lastActiveTurn: npc.最近回合,
    }));
}

// ── 解析器（UI 直接调用，不进 hook）──
export function resolveContactForChat(contacts: 手机联系人[], chat?: 手机会话): 手机联系人 | undefined {
  if (!chat) return undefined;
  const participantId = chat.participantIds[0];
  return contacts.find((contact) => contact.id === participantId || contact.npcId === participantId);
}

export function resolveContactByParticipantId(
  contacts: 手机联系人[],
  normalizedNpcRecords: NPC记录[],
  participantId: string,
): 手机联系人 | undefined {
  const direct = contacts.find((contact) => contact.id === participantId || contact.npcId === participantId);
  if (direct) return direct;
  const npc = normalizedNpcRecords.find((item) => item.id === participantId || `npc_${item.id}` === participantId);
  if (!npc || npc.关系 === 'enemy') return undefined;
  return {
    id: canonicalContactId(npc.id),
    npcId: npc.id,
    name: npc.姓名,
    avatar: 读取NPC头像(npc, '手机'),
    organization: undefined,
    relationLabel: 格式化NPC关系(npc.好感度, Boolean(npc.亲密关系)),
    available: true,
    lastActiveTurn: npc.最近回合,
  };
}

export function resolveSeedContact(
  contacts: 手机联系人[],
  normalizedNpcRecords: NPC记录[],
  seed: 主动来信种子,
): 手机联系人 {
  const ids = [seed.targetId, ...seed.relatedNpcIds].filter(Boolean);
  const existing = contacts.find(
    (contact) => ids.includes(contact.id) || (contact.npcId && ids.includes(contact.npcId)),
  );
  if (existing) return existing;
  const npc = normalizedNpcRecords.find((item) => ids.includes(item.id));
  if (npc) {
    const hiddenEnemy = npc.关系 === 'enemy';
    return {
      id: canonicalContactId(npc.id),
      npcId: npc.id,
      name: npc.姓名,
      avatar: 读取NPC头像(npc, '手机'),
      organization: undefined,
      relationLabel: 格式化NPC关系(npc.好感度, Boolean(npc.亲密关系)),
      available: !hiddenEnemy,
      lastActiveTurn: npc.最近回合,
    };
  }
  return {
    id: seed.targetId || `seed_${seed.id}`,
    name: seed.title.replace(/注意到|发来|来信|提醒/g, '').trim() || '未知联系人',
    available: true,
    relationLabel: '联系人',
  };
}

// ── 群聊 ──
export function findExistingGroupChat(
  phoneChats: 手机会话[],
  contacts: 手机联系人[],
  participantIds: string[],
  title: string,
): 手机会话 | undefined {
  const normalized = participantIds.map((id) => normalizeParticipantId(contacts, id)).filter(Boolean).sort();
  return phoneChats.find((chat) => {
    if (chat.type !== 'group') return false;
    const current = chat.participantIds.map((id) => normalizeParticipantId(contacts, id)).filter(Boolean).sort();
    const sameParticipants =
      normalized.length > 0 &&
      normalized.length === current.length &&
      normalized.every((id, index) => id === current[index]);
    return sameParticipants || (title.trim() && chat.title.trim() === title.trim());
  });
}

export function buildStandardGroupTitle(participantContacts: 手机联系人[], seedTitle = ''): string {
  const names = Array.from(new Set(participantContacts.map((item) => item.name).filter(Boolean)));
  const organizations = Array.from(new Set(participantContacts.map((item) => item.organization).filter(Boolean)));
  if (organizations.length === 1 && names.length >= 3) {
    const organization = organizations[0] as string;
    if (organization.includes('列车')) return '列车组频道';
    return `${organization}频道`;
  }
  if (names.length >= 3) return `${names.slice(0, 2).join('、')}等人的频道`;
  if (names.length === 2) return `${names.join('、')}的小队频道`;
  const cleanedSeedTitle = seedTitle
    .replace(/拉人入群|拉.*入群|邀请.*入群|建群|群聊|来信|提醒|注意到/g, '')
    .replace(/[「」《》【】[\]（）()]/g, '')
    .trim();
  if (cleanedSeedTitle && !/入群|拉人|邀请/.test(cleanedSeedTitle)) return `${cleanedSeedTitle}频道`;
  return '临时频道';
}

// ── 回复消息构造 ──
export function createReplyMessages(
  chat: 手机会话,
  contents: string[],
  contacts: 手机联系人[],
  normalizedNpcRecords: NPC记录[],
  turnCount: number,
  contact?: 手机联系人,
  sourceSeedId?: string,
): 手机消息[] {
  const resolveGroupSpeaker = (speakerName?: string): 手机联系人 | undefined => {
    if (!speakerName || chat.type !== 'group') return undefined;
    const byContact = contacts.find(
      (item) => item.name === speakerName || item.name.includes(speakerName) || speakerName.includes(item.name),
    );
    if (byContact) return byContact;
    const byNpc = normalizedNpcRecords.find(
      (npc) =>
        chat.participantIds.includes(npc.id) ||
        chat.participantIds.includes(`npc_${npc.id}`) ||
        npc.姓名 === speakerName ||
        npc.姓名.includes(speakerName) ||
        speakerName.includes(npc.姓名) ||
        (npc.别名 &&
          (npc.别名 === speakerName || npc.别名.includes(speakerName) || speakerName.includes(npc.别名))),
    );
    if (!byNpc || byNpc.关系 === 'enemy') return undefined;
    return {
      id: canonicalContactId(byNpc.id),
      npcId: byNpc.id,
      name: byNpc.姓名,
      avatar: 读取NPC头像(byNpc, '手机'),
      organization: undefined,
      relationLabel: 格式化NPC关系(byNpc.好感度, Boolean(byNpc.亲密关系)),
      available: true,
      lastActiveTurn: byNpc.最近回合,
    };
  };
  const fallbackGroupSpeakers =
    chat.type === 'group'
      ? chat.participantIds
          .map((id) => resolveContactByParticipantId(contacts, normalizedNpcRecords, id))
          .filter((item): item is 手机联系人 => Boolean(item))
      : [];
  return contents.map((rawContent, index) => {
    const groupMatch = chat.type === 'group' ? rawContent.match(/^([^：:]{1,18})[：:]\s*(.+)$/) : null;
    const speakerName = groupMatch?.[1]?.trim();
    const content = groupMatch?.[2]?.trim() || rawContent;
    const speaker =
      resolveGroupSpeaker(speakerName) ?? fallbackGroupSpeakers[index % Math.max(1, fallbackGroupSpeakers.length)];
    const isPrivate = chat.type === 'private';
    return 创建手机消息({
      senderId: isPrivate ? contact?.id ?? chat.id : speaker?.id ?? chat.id,
      senderName: isPrivate ? contact?.name ?? chat.title : speaker?.name ?? '未知成员',
      role: chat.type === 'system' ? 'system' : 'contact',
      avatar: isPrivate ? contact?.avatar : speaker?.avatar,
      content,
      turn: turnCount,
      sourceSeedId,
    });
  });
}

// ── 本地归档 flush 纯计算 ──
export function computeLocalArchiveFlush(
  chat: 手机会话,
  entry: 手机会话本地摘要条目,
  thresholds: { group: number; private: number },
  turnCount: number,
): { nextArchive: 手机会话本地库; flushedSummary: string } {
  const defaultArchive = 创建手机会话本地库(chat.type);
  const threshold =
    chat.type === 'group' ? thresholds.group : chat.type === 'private' ? thresholds.private : defaultArchive.threshold;
  const archive = { ...defaultArchive, ...(chat.localArchive ?? {}), threshold };
  const entries = [...archive.entries, entry];
  const shouldFlush = entries.length >= threshold;
  const flushedSummary = entries.map((item) => item.summary).join('；');
  return {
    nextArchive: {
      ...archive,
      entries: shouldFlush ? [] : entries,
      compressedSummaries: shouldFlush ? [...archive.compressedSummaries, flushedSummary] : archive.compressedSummaries,
      lastCompressedTurn: shouldFlush ? turnCount : archive.lastCompressedTurn,
    },
    flushedSummary: shouldFlush ? flushedSummary : '',
  };
}

// ── 种子冷却 / 自动选择 ──
export function getSeedCooldown(seed: 主动来信种子, gameSettings: 游戏设置): number {
  return seed.targetType === 'group'
    ? gameSettings.手机系统.groupCooldownTurns
    : gameSettings.手机系统.contactCooldownTurns;
}

export function isSeedCoolingDown(
  seed: 主动来信种子,
  phone: 手机系统,
  turnCount: number,
  gameSettings: 游戏设置,
): boolean {
  if (seed.priority === 'urgent') return false;
  const cooldown = Math.max(0, Math.trunc(getSeedCooldown(seed, gameSettings) || 0));
  if (cooldown <= 0) return false;
  const lastGenerated = phone.messageSeeds
    .filter(
      (item) =>
        item.id !== seed.id &&
        item.status === 'generated' &&
        item.targetType === seed.targetType &&
        item.targetId === seed.targetId,
    )
    .reduce((latest, item) => Math.max(latest, item.turn || 0), 0);
  return lastGenerated > 0 && turnCount - lastGenerated < cooldown;
}

export function selectAutoSeed(
  pendingSeeds: 主动来信种子[],
  phone: 手机系统,
  turnCount: number,
  gameSettings: 游戏设置,
  generatingSeedId: string,
  phoneEnabled: boolean,
): 主动来信种子 | undefined {
  if (!phoneEnabled || !gameSettings.手机系统.autoGenerateSeeds || generatingSeedId) return undefined;
  return [...pendingSeeds]
    .filter((seed) => !isSeedCoolingDown(seed, phone, turnCount, gameSettings))
    .sort((a, b) => {
      const priorityRank = { urgent: 4, high: 3, normal: 2, low: 1 };
      return priorityRank[b.priority] - priorityRank[a.priority] || a.turn - b.turn;
    })[0];
}
