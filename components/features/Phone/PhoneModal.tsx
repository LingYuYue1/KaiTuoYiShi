import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import type { 角色数据结构 } from '@/models/character';
import type { 聊天消息 } from '@/models/chat';
import type { 记忆系统 } from '@/models/memory';
import type { 手机联系人, 手机会话, 手机系统, 主动来信种子 } from '@/models/phone';
import type { NPC记录, NPC同行记忆条目 } from '@/models/npc';
import { 格式化NPC关系, 归一化NPC记录列表, 提取NPC同行记忆文本列表, 读取NPC头像 } from '@/models/npc';
import type { 新闻条目 } from '@/models/news';
import type { 世界状态 } from '@/models/world';
import type { API设置, 游戏设置 } from '@/models/settings';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库系统 } from '@/models/zhiku';
import type { 相册系统 } from '@/models/imageGeneration';
import { 创建手机会话, 创建手机会话本地摘要条目, 创建手机会话本地库, 创建手机消息, 计算手机未读, type 手机消息 } from '@/models/phone';
import { buildPhoneApiConfig, generatePhoneReply } from '@/services/ai/phoneService';
import type { 忆庭系统 } from '@/models/yiting';
import { addImmediateMemory, autoCompressMemorySystemWithArchivesAsync, compressNpcMemoryLedger } from '@/hooks/useGame/memoryUtils';
import {
  type PhoneMemoryCommitIntent,
  type PhoneDualWriteResult,
} from '@/services/phoneMemoryDualWrite';
import type { 队列任务记录 } from '@/models/queueTask';
import {
  BUILTIN_PHONE_WALLPAPERS,
  DEFAULT_PHONE_CHAT_WALLPAPER,
  DEFAULT_PHONE_HOME_WALLPAPER,
} from '@/data/builtinPhoneWallpapers';
import { 解析相册资源引用 } from '@/utils/albumActions';
import { ResilientImage } from '@/components/ui/ResilientImage';

interface Props {
  phone: 手机系统;
  traveler: 角色数据结构;
  world: 世界状态;
  memory: 记忆系统;
  yiting: 忆庭系统;
  news: 新闻条目[];
  storyWeaving: 剧情编织系统;
  zhiku: 智库系统;
  apiSettings: API设置;
  gameSettings: 游戏设置;
  turnCount: number;
  mainChatHistory: 聊天消息[];
  npcRecords: NPC记录[];
  album?: 相册系统;
  onPhoneChange: React.Dispatch<React.SetStateAction<手机系统>>;
  onMemoryChange: React.Dispatch<React.SetStateAction<记忆系统>>;
  onYitingChange: React.Dispatch<React.SetStateAction<忆庭系统>>;
  onNpcRecordsChange: React.Dispatch<React.SetStateAction<NPC记录[]>>;
  /** 手机记忆双写上层串行事务入口（useGame.commitPhoneMemory）：PhoneModal 只提交意图。 */
  onCommitPhoneMemory?: (intent: PhoneMemoryCommitIntent) => Promise<PhoneDualWriteResult | undefined>;
  /** 手机记忆双写单侧失败时上报，由上层写入可持久化的 queueTasks。 */
  onPhoneMemoryWriteFailure?: (task: 队列任务记录) => void;
  onClose: () => void;
}

const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const cardClip = 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)';
const phoneShellClip =
  'polygon(28px 0, calc(100% - 28px) 0, 100% 28px, 100% calc(100% - 28px), calc(100% - 28px) 100%, 28px 100%, 0 calc(100% - 28px), 0 28px)';
const phoneShellSurface =
  'radial-gradient(circle at 50% 0%, rgba(var(--tj-tech-cyan, var(--tj-accent-primary)), 0.16), transparent 32%), linear-gradient(180deg, rgba(var(--tj-bubble), 0.99), rgba(var(--tj-surface-strong), 0.98))';
const phoneScreenSurface =
  'linear-gradient(180deg, rgba(var(--tj-surface), 0.98), rgba(var(--tj-bg-secondary), 0.96))';
const phoneCardSurface =
  'linear-gradient(135deg, rgba(var(--tj-bubble), 0.96), rgba(var(--tj-surface-strong), 0.82))';

type PhoneApp = 'messages' | 'contacts' | 'news' | 'wallpapers';
type MobilePhoneView = 'list' | 'chat' | 'contact';
type MessageListMode = 'private' | 'group';

function toPhoneContactId(npcId: string): string {
  return npcId.startsWith('npc_') ? npcId : `npc_${npcId}`;
}

const FALLBACK_STORY_CONTACTS: Array<Pick<手机联系人, 'id' | 'name' | 'organization' | 'relationLabel' | 'avatar'> & { aliases: string[] }> = [
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

function buildFallbackContactsFromStory(params: {
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
  return FALLBACK_STORY_CONTACTS
    .slice(0, 2)
    .map((contact) => ({
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

export function PhoneModal({
  phone,
  traveler,
  world,
  memory,
  yiting,
  news,
  storyWeaving,
  zhiku,
  apiSettings,
  gameSettings,
  turnCount,
  mainChatHistory,
  npcRecords,
  album,
  onPhoneChange,
  onMemoryChange,
  onYitingChange,
  onNpcRecordsChange,
  onCommitPhoneMemory,
  onPhoneMemoryWriteFailure,
  onClose,
}: Props) {
  const [activeApp, setActiveApp] = useState<PhoneApp | null>(null);
  const [activeChatId, setActiveChatId] = useState(phone.chats[0]?.id ?? '');
  const [activeContactId, setActiveContactId] = useState(phone.contacts[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const [sendingChatId, setSendingChatId] = useState('');
  const [generatingSeedId, setGeneratingSeedId] = useState('');
  const autoGeneratedSeedRef = useRef('');
  const [phoneError, setPhoneError] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showPendingSeeds, setShowPendingSeeds] = useState(false);
  const [messageListMode, setMessageListMode] = useState<MessageListMode>('private');
  const [showAddContact, setShowAddContact] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const [mobileView, setMobileView] = useState<MobilePhoneView>('list');
  const normalizedNpcRecords = useMemo(() => 归一化NPC记录列表(npcRecords), [npcRecords]);
  const mainConfig = useMemo(
    () => apiSettings.configs.find((config) => config.id === apiSettings.activeConfigId) ?? null,
    [apiSettings.activeConfigId, apiSettings.configs],
  );

  const derivedContacts = useMemo(
    () =>
      normalizedNpcRecords
        .filter((npc) => !npc.归档 && npc.关系 !== 'enemy')
        .map((npc) => ({
          id: toPhoneContactId(npc.id),
          npcId: npc.id,
          name: npc.姓名,
          avatar: 解析相册资源引用(album, 读取NPC头像(npc, '手机')),
          organization: undefined,
          relationLabel: 格式化NPC关系(npc.好感度, Boolean(npc.亲密关系)),
          available: true,
          lastActiveTurn: npc.最近回合,
        })),
    [album, normalizedNpcRecords],
  );
  const fallbackStoryContacts = useMemo(
    () =>
      buildFallbackContactsFromStory({
        mainChatHistory,
        world,
        existingContacts: phone.contacts,
        turnCount,
      }),
    [mainChatHistory, phone.contacts, turnCount, world],
  );

  const contacts = useMemo(() => {
    return [...phone.contacts, ...fallbackStoryContacts]
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
          available: contact.available ?? derived?.available ?? true,
          lastActiveTurn: contact.lastActiveTurn ?? derived?.lastActiveTurn,
        };
      })
      .filter((contact) => {
        if (contact.relationLabel === '敌人') return false;
        if (contact.status === 'hidden') return false;
        if (contact.npcId) {
          const npc = normalizedNpcRecords.find((item) => item.id === contact.npcId);
          if (npc?.关系 === 'enemy') return false;
          if (npc?.归档) return false; // 归档 NPC 的联系人不再展示/可聊，恢复由变量事实链触发
        }
        return contact.available !== false;
      });
  }, [album, derivedContacts, fallbackStoryContacts, normalizedNpcRecords, phone.contacts]);
  const addableNpcContacts = useMemo(
    () =>
      normalizedNpcRecords
        .filter((npc) => npc.关系 !== 'enemy')
        .filter((npc) => !npc.归档)
        .filter((npc) => !phone.contacts.some((contact) => contact.npcId === npc.id || contact.id === toPhoneContactId(npc.id)))
        .map((npc) => ({
          id: toPhoneContactId(npc.id),
          npcId: npc.id,
          name: npc.姓名,
          avatar: 解析相册资源引用(album, 读取NPC头像(npc, '手机')),
          organization: undefined,
          relationLabel: 格式化NPC关系(npc.好感度, Boolean(npc.亲密关系)),
          available: true,
          status: 'available' as const,
          unlockSource: 'manual' as const,
          lastActiveTurn: npc.最近回合,
        })),
    [normalizedNpcRecords, phone.contacts],
  );
  const activeChat = phone.chats.find((chat) => chat.id === activeChatId) ?? phone.chats[0];
  const activeContact = contacts.find((contact) => contact.id === activeContactId) ?? contacts[0];
  const getSeedCooldown = (seed: 主动来信种子) =>
    seed.targetType === 'group'
      ? gameSettings.手机系统.groupCooldownTurns
      : gameSettings.手机系统.contactCooldownTurns;
  const isSeedCoolingDown = (seed: 主动来信种子) => {
    if (seed.priority === 'urgent') return false;
    const cooldown = Math.max(0, Math.trunc(getSeedCooldown(seed) || 0));
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
  };
  const pendingSeeds = phone.messageSeeds.filter((seed) => seed.status === 'pending');
  const privateChats = useMemo(() => phone.chats.filter((chat) => chat.type !== 'group'), [phone.chats]);
  const groupChats = useMemo(() => phone.chats.filter((chat) => chat.type === 'group'), [phone.chats]);
  const visibleChats = messageListMode === 'group' ? groupChats : privateChats;
  const phoneApiConfig = buildPhoneApiConfig(gameSettings, apiSettings);
  const phoneEnabled = gameSettings.手机系统.enabled;
  const autoSeed = useMemo(() => {
    if (!phoneEnabled || !gameSettings.手机系统.autoGenerateSeeds || !phoneApiConfig || generatingSeedId) return undefined;
    return [...pendingSeeds]
      .filter((seed) => !isSeedCoolingDown(seed))
      .sort((a, b) => {
        const priorityRank = { urgent: 4, high: 3, normal: 2, low: 1 };
        return (priorityRank[b.priority] ?? 0) - (priorityRank[a.priority] ?? 0) || a.turn - b.turn;
      })[0];
  }, [gameSettings.手机系统.autoGenerateSeeds, generatingSeedId, pendingSeeds, phoneApiConfig, phoneEnabled, turnCount]);

  useEffect(() => {
    if (!activeChatId && phone.chats[0]) {
      setActiveChatId(phone.chats[0].id);
    }
  }, [activeChatId, phone.chats]);

  useEffect(() => {
    if (!activeContactId && contacts[0]) {
      setActiveContactId(contacts[0].id);
    }
  }, [activeContactId, contacts]);

  useEffect(() => {
    if (!autoSeed || autoGeneratedSeedRef.current) return;
    autoGeneratedSeedRef.current = autoSeed.id;
    void handleGenerateSeed(autoSeed);
  }, [autoSeed?.id]);

  useEffect(() => {
    setMobileView('list');
  }, [activeApp]);

  const recalc = (next: 手机系统): 手机系统 => ({
    ...next,
    unreadTotal: 计算手机未读(next),
  });

  const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const dismissSeed = (seed: 主动来信种子) => {
    onPhoneChange((prev) =>
      recalc({
        ...prev,
        messageSeeds: prev.messageSeeds.map((item) => (item.id === seed.id ? { ...item, status: 'dismissed' } : item)),
      }),
    );
  };

  const markChatRead = (chatId: string) => {
    onPhoneChange((prev) => {
      const next = {
        ...prev,
        chats: prev.chats.map((chat) => (chat.id === chatId ? { ...chat, unread: 0 } : chat)),
      };
      return recalc(next);
    });
  };

  const resolveContactForChat = (chat: 手机会话 | undefined): 手机联系人 | undefined => {
    if (!chat) return undefined;
    const participantId = chat.participantIds[0];
    return contacts.find((contact) => contact.id === participantId || contact.npcId === participantId);
  };

  const resolveContactByParticipantId = (participantId: string): 手机联系人 | undefined => {
    const direct = contacts.find((contact) => contact.id === participantId || contact.npcId === participantId);
    if (direct) return direct;
    const npc = normalizedNpcRecords.find((item) => item.id === participantId || `npc_${item.id}` === participantId);
    if (!npc || npc.关系 === 'enemy') return undefined;
    return {
      id: `npc_${npc.id}`,
      npcId: npc.id,
      name: npc.姓名,
      avatar: 读取NPC头像(npc, '手机'),
      organization: undefined,
      relationLabel: 格式化NPC关系(npc.好感度, Boolean(npc.亲密关系)),
      available: true,
      lastActiveTurn: npc.最近回合,
    };
  };

  const ensurePrivateChat = (contact: 手机联系人): 手机会话 => {
    const existing = phone.chats.find((chat) => chat.type === 'private' && chat.participantIds.includes(contact.id));
    if (existing) {
      setActiveChatId(existing.id);
      setActiveApp('messages');
      setMobileView('chat');
      markChatRead(existing.id);
      return existing;
    }

    const newChat = 创建手机会话({
      type: 'private',
      title: contact.name,
      participantIds: [contact.id],
    });
    newChat.localArchive = {
      ...(newChat.localArchive ?? 创建手机会话本地库('private')),
      threshold: gameSettings.手机系统.privateArchiveThreshold,
    };
    onPhoneChange((prev) => {
      const hasContact = prev.contacts.some((item) => item.id === contact.id);
      const next = {
        ...prev,
        contacts: hasContact ? prev.contacts : [...prev.contacts, contact],
        chats: [newChat, ...prev.chats],
      };
      return recalc(next);
    });
    setActiveChatId(newChat.id);
    setActiveApp('messages');
    setMobileView('chat');
    return newChat;
  };

  const handleAddContact = (contact: 手机联系人) => {
    onPhoneChange((prev) => {
      if (prev.contacts.some((item) => item.id === contact.id || (contact.npcId && item.npcId === contact.npcId))) {
        return prev;
      }
      return recalc({
        ...prev,
        contacts: [
          {
            ...contact,
            available: true,
            status: 'available',
            unlockSource: 'manual',
            lastActiveTurn: contact.lastActiveTurn ?? turnCount,
          },
          ...prev.contacts,
        ],
      });
    });
    setActiveContactId(contact.id);
    setShowAddContact(false);
    setPhoneError('');
  };

  const normalizeParticipantId = (id: string) => {
    if (!id) return '';
    const direct = contacts.find((contact) => contact.id === id || contact.npcId === id);
    return direct?.id ?? (id.startsWith('npc_') ? id : `npc_${id}`);
  };

  const findExistingGroupChat = (participantIds: string[], title: string) => {
    const normalized = participantIds.map(normalizeParticipantId).filter(Boolean).sort();
    return phone.chats.find((chat) => {
      if (chat.type !== 'group') return false;
      const current = chat.participantIds.map(normalizeParticipantId).filter(Boolean).sort();
      const sameParticipants =
        normalized.length > 0 &&
        normalized.length === current.length &&
        normalized.every((id, index) => id === current[index]);
      return sameParticipants || (title.trim() && chat.title.trim() === title.trim());
    });
  };

  const buildStandardGroupTitle = (participantIds: string[], seedTitle = '') => {
    const participantContacts = participantIds
      .map(normalizeParticipantId)
      .map(resolveContactByParticipantId)
      .filter((item): item is 手机联系人 => Boolean(item));
    const participantNames = Array.from(new Set(participantContacts.map((item) => item.name).filter(Boolean)));
    const organizations = Array.from(new Set(participantContacts.map((item) => item.organization).filter(Boolean)));
    if (organizations.length === 1 && participantNames.length >= 3) {
      const organization = organizations[0];
      if (organization?.includes('列车')) return '列车组频道';
      if (organization) return `${organization}频道`;
    }
    if (participantNames.length >= 3) return `${participantNames.slice(0, 2).join('、')}等人的频道`;
    if (participantNames.length === 2) return `${participantNames.join('、')}的小队频道`;
    const cleanedSeedTitle = seedTitle
      .replace(/拉人入群|拉.*入群|邀请.*入群|建群|群聊|来信|提醒|注意到/g, '')
      .replace(/[「」《》【】[\]（）()]/g, '')
      .trim();
    if (cleanedSeedTitle && !/入群|拉人|邀请/.test(cleanedSeedTitle)) return `${cleanedSeedTitle}频道`;
    return '临时频道';
  };

  const handleCreateGroupChat = () => {
    const selectedContacts = contacts.filter((contact) => groupMemberIds.includes(contact.id) && contact.available !== false);
    if (selectedContacts.length < 2) {
      setPhoneError('创建群聊至少需要选择 2 位可联系对象。');
      return;
    }
    const title = groupNameDraft.trim() || buildStandardGroupTitle(selectedContacts.map((item) => item.id));
    const groupChat = 创建手机会话({
      type: 'group',
      title,
      participantIds: selectedContacts.map((item) => item.id),
    });
    groupChat.localArchive = {
      ...(groupChat.localArchive ?? 创建手机会话本地库('group')),
      threshold: gameSettings.手机系统.groupArchiveThreshold,
    };
    onPhoneChange((prev) => recalc({ ...prev, chats: [groupChat, ...prev.chats] }));
    setActiveChatId(groupChat.id);
    setActiveApp('messages');
    setShowCreateGroup(false);
    setGroupNameDraft('');
    setGroupMemberIds([]);
    setPhoneError('');
  };

  const updateChatMessages = (chatId: string, updater: (chat: 手机会话) => 手机会话) => {
    onPhoneChange((prev) => {
      const next = {
        ...prev,
        chats: prev.chats.map((chat) => (chat.id === chatId ? updater(chat) : chat)),
      };
      return recalc(next);
    });
  };

  const appendMessagesToChat = (chatId: string, messages: 手机消息[], unread = 0) => {
    onPhoneChange((prev) => {
      const next = {
        ...prev,
        chats: prev.chats.map((chat) =>
          chat.id === chatId
            ? {
                ...chat,
                messages: [...chat.messages, ...messages],
                unread: Math.max(0, unread),
                updatedAt: Date.now(),
              }
            : chat,
        ),
      };
      return recalc(next);
    });
  };

  const appendMessagesToChatSequentially = async (chatId: string, messages: 手机消息[], unread = 0) => {
    for (let index = 0; index < messages.length; index += 1) {
      if (index > 0) await wait(620);
      appendMessagesToChat(chatId, [messages[index]], index === messages.length - 1 ? unread : 0);
    }
  };

  const createReplyMessages = (
    chat: 手机会话,
    contents: string[],
    contact?: 手机联系人,
    sourceSeedId?: string,
  ): 手机消息[] => {
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
          (npc.别名 && (npc.别名 === speakerName || npc.别名.includes(speakerName) || speakerName.includes(npc.别名))),
      );
      if (!byNpc || byNpc.关系 === 'enemy' || byNpc.归档) return undefined;
      return {
        id: `npc_${byNpc.id}`,
        npcId: byNpc.id,
        name: byNpc.姓名,
        avatar: 读取NPC头像(byNpc, '手机'),
        organization: undefined,
        relationLabel: 格式化NPC关系(byNpc.好感度, Boolean(byNpc.亲密关系)),
        available: true,
        lastActiveTurn: byNpc.最近回合,
      };
    };
    const fallbackGroupSpeakers = chat.type === 'group'
      ? chat.participantIds
          .map(resolveContactByParticipantId)
          .filter((item): item is 手机联系人 => Boolean(item))
      : [];
    return contents.map((rawContent, index) => {
      const groupMatch = chat.type === 'group' ? rawContent.match(/^([^：:]{1,18})[：:]\s*(.+)$/) : null;
      const speakerName = groupMatch?.[1]?.trim();
      const content = groupMatch?.[2]?.trim() || rawContent;
      const speaker = resolveGroupSpeaker(speakerName) ?? fallbackGroupSpeakers[index % Math.max(1, fallbackGroupSpeakers.length)];
      return 创建手机消息({
        senderId: chat.type === 'private' ? contact?.id ?? chat.id : speaker?.id ?? chat.id,
        senderName: chat.type === 'private' ? contact?.name ?? chat.title : speaker?.name ?? speakerName ?? chat.title,
        role: chat.type === 'system' ? 'system' : 'contact',
        avatar: chat.type === 'private' ? contact?.avatar : speaker?.avatar,
        content,
        turn: turnCount,
        sourceSeedId,
      });
    });
  };

  const appendPhoneLocalSummary = (
    chat: 手机会话,
    summary: string,
    source: 'private' | 'group' | 'system',
    messageCount: number,
    seedId?: string,
  ): string => {
    const entry = 创建手机会话本地摘要条目({
      turn: turnCount,
      summary,
      source,
      messageCount,
      sourceSeedId: seedId,
    });
    let shouldFlush = false;
    let flushedSummary = '';
    updateChatMessages(chat.id, (currentChat) => {
      const defaultArchive = 创建手机会话本地库(currentChat.type);
      const archive = {
        ...defaultArchive,
        ...(currentChat.localArchive ?? {}),
        threshold:
          currentChat.type === 'group'
            ? gameSettings.手机系统.groupArchiveThreshold
            : currentChat.type === 'private'
              ? gameSettings.手机系统.privateArchiveThreshold
              : defaultArchive.threshold,
      };
      const entries = [...archive.entries, entry];
      shouldFlush = entries.length >= archive.threshold;
      flushedSummary = entries.map((item) => item.summary).join('；');
      return {
        ...currentChat,
        localArchive: {
          ...archive,
          entries: shouldFlush ? [] : entries,
          compressedSummaries: shouldFlush ? [...archive.compressedSummaries, flushedSummary] : archive.compressedSummaries,
          lastCompressedTurn: shouldFlush ? turnCount : archive.lastCompressedTurn,
        },
      };
    });

    return shouldFlush ? flushedSummary : '';
  };

  const commitPhoneMemory = async (
    summary: string,
    contact?: 手机联系人,
    options: { force?: boolean; operationSourceId?: string } = {},
  ) => {
    const trimmed = summary.trim();
    if (!trimmed) return;

    // 阶段1方案E：手机压缩摘要代码强制双写（忆庭通讯档案 + NPC同行记忆【通讯记录】）。
    // 全项目返修：双写编排为上层串行事务（useGame.commitPhoneMemory → runPhoneMemoryCommit）——
    //   - PhoneModal 只提交意图（含 operationSourceId），不携带旧状态快照；
    //   - 同一时刻提交按 promise 链串行化，后一笔读取前一笔提交后的最新状态；
    //   - 双侧失败时每个失败侧生成可恢复任务，入队后立即持久化；
    //   - 未达压缩阈值时忆庭侧为 not_due，不虚报"已写入忆庭"。
    // 上层事务完成（含失败任务入队与立即持久化）；单侧失败时给出可恢复提示。
    const result = await onCommitPhoneMemory?.({
      summary: trimmed,
      contactId: contact?.npcId,
      turn: turnCount,
      operationSourceId: options.operationSourceId,
      force: options.force,
    });
    if (result && (result.sides.yiting.status === 'failed' || result.sides.npc.status === 'failed')) {
      setPhoneError('手机记忆写入单侧失败，已记录到任务队列，可稍后重试（只会补写失败的一侧）。');
    }
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    markChatRead(chatId);
    setMobileView('chat');
  };

  const handleRenameGroupChat = (chatId: string, title: string) => {
    const nextTitle = title.trim().slice(0, 24);
    if (!nextTitle) {
      setPhoneError('群聊名称不能为空。');
      return;
    }
    updateChatMessages(chatId, (chat) =>
      chat.type === 'group'
        ? {
            ...chat,
            title: nextTitle,
            updatedAt: Date.now(),
          }
        : chat,
    );
    setPhoneError('');
  };

  const handleAddGroupMember = (chatId: string, contact: 手机联系人) => {
    updateChatMessages(chatId, (chat) => {
      if (chat.type !== 'group') return chat;
      const alreadyInGroup = chat.participantIds.some((participantId) => {
        const normalized = normalizeParticipantId(participantId);
        return (
          participantId === contact.id ||
          participantId === contact.npcId ||
          normalized === contact.id ||
          (contact.npcId ? normalized === normalizeParticipantId(contact.npcId) : false)
        );
      });
      if (alreadyInGroup) return chat;
      return {
        ...chat,
        participantIds: [...chat.participantIds, contact.id],
        updatedAt: Date.now(),
      };
    });
    setPhoneError('');
  };

  const handleStartChat = (contact: 手机联系人) => {
    setActiveContactId(contact.id);
    ensurePrivateChat(contact);
    setMobileView('chat');
  };

  const handleSendPhoneMessage = async () => {
    const text = draft.trim();
    if (!text || !activeChat || sendingChatId) return;
    if (!phoneEnabled) {
      setPhoneError('手机系统已在设置中关闭。');
      return;
    }
    if (!gameSettings.手机系统.autoGenerateSeeds) {
      setPhoneError('主动来信已在设置中关闭。');
      return;
    }
    if (!phoneApiConfig) {
      setPhoneError('请先配置主 API，或在设置里填写手机系统 API。');
      return;
    }
    setPhoneError('');
    setDraft('');
    setSendingChatId(activeChat.id);

    const playerMessage = 创建手机消息({
      senderId: 'player',
      senderName: traveler.姓名 || '我',
      role: 'player',
      avatar: traveler.图像档案?.手机头像 || traveler.头像 || undefined,
      content: text,
      turn: turnCount,
    });
    const chatAfterPlayer: 手机会话 = {
      ...activeChat,
      messages: [...activeChat.messages, playerMessage],
      unread: 0,
      updatedAt: Date.now(),
    };
    updateChatMessages(activeChat.id, () => chatAfterPlayer);

    try {
      const contact = resolveContactForChat(activeChat);
      const reply = await generatePhoneReply(phoneApiConfig, {
        traveler,
        world,
        npcRecords,
        news,
        turnCount,
        chat: chatAfterPlayer,
        contacts,
        contact,
        userText: text,
        mainChatHistory,
        zhiku,
      }, phoneApiConfig.retryCount ?? 2, gameSettings.promptModules);
      await appendMessagesToChatSequentially(
        activeChat.id,
        createReplyMessages(activeChat, reply.messages, contact),
        0,
      );
      const flushedSummary = appendPhoneLocalSummary(
        chatAfterPlayer,
        reply.summary ?? reply.messages.join(' / '),
        activeChat.type === 'group' ? 'group' : 'private',
        reply.messages.length,
      );
      await commitPhoneMemory(
        `手机${activeChat.type === 'group' ? `群聊「${activeChat.title}」` : contact ? `私聊「${contact.name}」` : '私聊'}：${reply.summary ?? reply.messages.join(' / ')}`,
        contact,
        { force: true, operationSourceId: playerMessage.id },
      );
      if (flushedSummary) {
        await commitPhoneMemory(flushedSummary, contact, { operationSourceId: playerMessage.id });
      }
    } catch (err) {
      setPhoneError(`发送失败：${(err as Error).message}`);
    } finally {
      setSendingChatId('');
    }
  };

  const resolveSeedContact = (seed: 主动来信种子): 手机联系人 => {
    const ids = [seed.targetId, ...seed.relatedNpcIds].filter(Boolean);
    const existing = contacts.find((contact) => ids.includes(contact.id) || (contact.npcId && ids.includes(contact.npcId)));
    if (existing) return existing;
    const npc = normalizedNpcRecords.find((item) => ids.includes(item.id) && !item.归档);
    if (npc) {
      const hiddenEnemy = npc.关系 === 'enemy';
      return {
        id: `npc_${npc.id}`,
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
  };

  const handleGenerateSeed = async (seed: 主动来信种子) => {
    if (generatingSeedId) return;
    if (!phoneEnabled) {
      setPhoneError('手机系统已在设置中关闭。');
      return;
    }
    if (!phoneApiConfig) {
      setPhoneError('请先配置主 API，或在设置里填写手机系统 API。');
      return;
    }
    if (isSeedCoolingDown(seed)) {
      const cooldown = getSeedCooldown(seed);
      setPhoneError(`该来信仍在冷却中（${cooldown} 回合）。可以稍后再打开，紧急来信会自动绕过冷却。`);
      return;
    }
    setPhoneError('');
    setGeneratingSeedId(seed.id);

    const contact = resolveSeedContact(seed);
    if (seed.targetType === 'private' && contact.available === false) {
      setPhoneError('该对象尚未作为联系人解锁。');
      setGeneratingSeedId('');
      return;
    }
    const groupParticipantIds = (seed.relatedNpcIds.length ? seed.relatedNpcIds : [seed.targetId])
      .map(normalizeParticipantId)
      .filter(Boolean);
    const groupByTargetId = seed.targetType === 'group'
      ? phone.chats.find((item) => item.type === 'group' && item.id === seed.targetId)
      : undefined;
    const existingGroup = seed.targetType === 'group'
      ? groupByTargetId ?? findExistingGroupChat(groupParticipantIds, buildStandardGroupTitle(groupParticipantIds, seed.title))
      : undefined;
    const chat = seed.targetType === 'group'
      ? existingGroup ?? 创建手机会话({
          type: 'group',
          title: buildStandardGroupTitle(groupParticipantIds, seed.title),
          participantIds: groupParticipantIds.length >= 2 ? groupParticipantIds : [normalizeParticipantId(seed.targetId), ...groupParticipantIds].filter(Boolean),
        })
      : ensurePrivateChat(contact);

    if (seed.targetType === 'group') {
      chat.localArchive = {
        ...(chat.localArchive ?? 创建手机会话本地库('group')),
        threshold: gameSettings.手机系统.groupArchiveThreshold,
      };
    }

    if (seed.targetType === 'group') {
      onPhoneChange((prev) => {
        const exists = prev.chats.find((item) => item.id === chat.id);
        const next = {
          ...prev,
          chats: exists ? prev.chats : [chat, ...prev.chats],
        };
        return recalc(next);
      });
      setActiveChatId(chat.id);
      setActiveApp('messages');
      setMobileView('chat');
    }

    try {
      const reply = await generatePhoneReply(phoneApiConfig, {
        traveler,
        world,
        npcRecords,
        news,
        turnCount,
        chat,
        contacts,
        contact: seed.targetType === 'private' ? contact : undefined,
        seed,
        mainChatHistory,
        zhiku,
      }, phoneApiConfig.retryCount ?? 2, gameSettings.promptModules);
      onPhoneChange((prev) => {
        const hasContact = prev.contacts.some((item) => item.id === contact.id);
        const next = {
          ...prev,
          contacts: seed.targetType === 'private' && !hasContact ? [...prev.contacts, contact] : prev.contacts,
          messageSeeds: prev.messageSeeds.map((item) => (item.id === seed.id ? { ...item, status: 'generated' as const } : item)),
        };
        return recalc(next);
      });
      await appendMessagesToChatSequentially(
        chat.id,
        createReplyMessages(chat, reply.messages, seed.targetType === 'private' ? contact : undefined, seed.id),
        0,
      );
      const flushedSummary = appendPhoneLocalSummary(
        chat,
        reply.summary ?? reply.messages.join(' / '),
        seed.targetType === 'group' ? 'group' : seed.targetType === 'private' ? 'private' : 'system',
        reply.messages.length,
        seed.id,
      );
      await commitPhoneMemory(
        `主动来信「${seed.title}」：${reply.summary ?? reply.messages.join(' / ')}`,
        seed.targetType === 'private' ? contact : undefined,
        { force: true, operationSourceId: seed.id },
      );
      if (flushedSummary) {
        await commitPhoneMemory(flushedSummary, seed.targetType === 'private' ? contact : undefined, { operationSourceId: seed.id });
      }
      setActiveChatId(chat.id);
      setActiveApp('messages');
      setMobileView('chat');
    } catch (err) {
      setPhoneError(`生成来信失败：${(err as Error).message}`);
    } finally {
      setGeneratingSeedId('');
    }
  };

  const activeAppTitle =
    activeApp === 'messages' ? '短讯'
    : activeApp === 'contacts' ? '通讯录'
    : activeApp === 'news' ? '星际和平周报'
    : '壁纸';
  const activeAppSubtitle =
    activeApp === 'messages' ? 'MESSAGE APP'
    : activeApp === 'contacts' ? 'CONTACTS'
    : activeApp === 'news' ? 'NEWS FEED'
    : 'WALLPAPER';
  const homeWallpaper = 解析相册资源引用(album, phone.wallpapers?.home) || DEFAULT_PHONE_HOME_WALLPAPER;
  const chatWallpaper = activeApp === 'messages'
    ? 解析相册资源引用(album, phone.wallpapers?.chat) || DEFAULT_PHONE_CHAT_WALLPAPER
    : undefined;

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto p-3 sm:p-4"
      style={{ background: 'rgba(var(--tj-bg-primary), 0.88)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
      role="presentation"
    >
      {/* Content stops propagation so only blank scrim dismisses (desktop click-outside). */}
      <div
        className="flex w-full flex-col items-start gap-3 xl:flex-row xl:items-start"
        onClick={(e) => e.stopPropagation()}
      >
        <section
          className={`${activeApp ? 'hidden xl:flex' : 'flex'} relative h-[min(84vh,760px)] w-full max-w-[340px] flex-shrink-0 overflow-hidden p-3 xl:w-[340px]`}
          style={{
            background: phoneShellSurface,
            boxShadow:
              'inset 0 0 0 1px rgba(var(--tj-border), 0.72), inset 0 0 0 8px rgba(var(--tj-surface),0.48), 0 24px 54px rgba(var(--tj-shadow), 0.16)',
            clipPath: phoneShellClip,
          }}
        >
          <div
            className="pointer-events-none absolute left-1/2 top-2 h-1.5 w-24 -translate-x-1/2"
            style={{
              background: 'rgba(var(--tj-accent-primary), 0.22)',
              borderRadius: 999,
              boxShadow: '0 0 10px rgba(var(--tj-accent-primary),0.18)',
            }}
          />
          <div
            className="flex min-h-0 flex-1 overflow-hidden"
            style={{
              background: phoneScreenSurface,
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)',
              clipPath: cardClip,
            }}
          >
            <PhoneHome
              unread={phone.unreadTotal}
              contactCount={contacts.length}
              chatCount={phone.chats.length}
              activeApp={activeApp}
              onOpen={setActiveApp}
              onClose={onClose}
              wallpaper={homeWallpaper}
            />
          </div>
        </section>

        {activeApp && (
          <section
            className="relative flex h-[min(86vh,780px)] w-full min-w-0 flex-none overflow-hidden p-3 xl:h-[min(84vh,760px)] xl:w-[980px]"
            style={{
              background: phoneShellSurface,
              boxShadow:
                'inset 0 0 0 1px rgba(var(--tj-border), 0.7), inset 0 0 0 8px rgba(var(--tj-surface),0.48), 0 24px 54px rgba(var(--tj-shadow), 0.14)',
              clipPath: phoneShellClip,
            }}
          >
            <div
              className="flex min-h-0 w-full flex-col overflow-hidden"
              style={{
                background: chatWallpaper
                  ? `linear-gradient(180deg, rgba(var(--tj-surface), 0.88), rgba(var(--tj-bg-secondary), 0.94)), url(${chatWallpaper}) center/cover`
                  : phoneScreenSurface,
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)',
                clipPath: cardClip,
              }}
            >
              <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-5 sm:py-4" style={{ borderColor: 'rgba(var(--tj-accent-primary), 0.18)' }}>
                <div className="min-w-0">
                  <div className="truncate font-serif text-base font-bold tracking-[0.2em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                    {activeAppTitle}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
                    {activeAppSubtitle}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveApp(null)}
                  className="px-2 py-1 text-xs font-serif tracking-[0.16em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary), 0.85)',
                    background: 'rgba(var(--tj-accent-primary), 0.05)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                    clipPath: smallClip,
                  }}
                >
                  回到桌面
                </button>
              </header>

              {activeApp === 'messages' ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
                  <aside
                    className={`${mobileView === 'list' ? 'flex' : 'hidden xl:flex'} min-h-0 w-full flex-1 flex-col overflow-hidden xl:w-[292px] xl:flex-none`}
                    style={{
                      borderRight: '1px solid rgba(var(--tj-accent-primary), 0.22)',
                      background: 'rgba(var(--tj-bubble), 0.86)',
                    }}
                  >
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                            短讯列表
                          </div>
                          <div className="mt-1 text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
                            待处理来信与会话
                          </div>
                        </div>
                        <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
                          {phone.chats.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCreateGroup((v) => !v)}
                        className="mt-3 w-full py-2 text-xs font-serif tracking-[0.18em] transition-all hover:opacity-90"
                        style={{
                          color: showCreateGroup ? 'rgb(var(--tj-bg-primary))' : 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.92), rgba(var(--tj-accent-secondary),0.88))',
                          background: showCreateGroup
                            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-amber-deep),0.92))'
                            : 'rgba(var(--tj-accent-primary), 0.055)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
                          clipPath: smallClip,
                        }}
                      >
                        创建群聊
                      </button>
                      <div
                        className="mt-3 grid grid-cols-2 gap-1 p-1"
                        style={{
                          background: 'rgba(var(--tj-bg-primary), 0.36)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.16)',
                          clipPath: smallClip,
                        }}
                      >
                        {(['private', 'group'] as const).map((mode) => {
                          const active = messageListMode === mode;
                          return (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => setMessageListMode(mode)}
                              className="py-1.5 text-[11px] font-serif tracking-[0.14em] transition-all"
                              style={{
                                color: active ? 'rgb(var(--tj-bg-primary))' : 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.86), rgba(var(--tj-accent-secondary),0.82))',
                                background: active
                                  ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-amber-deep),0.92))'
                                  : 'transparent',
                                clipPath: smallClip,
                              }}
                            >
                              {mode === 'private' ? `好友 ${privateChats.length}` : `群聊 ${groupChats.length}`}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch]">
                      <div className="space-y-3">
                        {showCreateGroup && (
                          <section
                            className="space-y-2"
                            style={{
                              background: 'rgba(var(--tj-accent-primary), 0.055)',
                              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                              clipPath: smallClip,
                              padding: '10px',
                            }}
                          >
                            <div className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                              新建群聊
                            </div>
                            <input
                              value={groupNameDraft}
                              onChange={(e) => setGroupNameDraft(e.target.value)}
                              placeholder="群聊名称"
                              className="kaituo-input w-full px-2.5 py-2 text-xs"
                              style={{ clipPath: smallClip }}
                            />
                            <div className="max-h-36 touch-pan-y space-y-1 overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
                              {contacts.length === 0 ? (
                                <EmptyText text="暂无可选择联系人。" />
                              ) : (
                                contacts.map((contact) => {
                                  const checked = groupMemberIds.includes(contact.id);
                                  return (
                                    <label
                                      key={contact.id}
                                      className="flex cursor-pointer items-center gap-2 px-2 py-1.5"
                                      style={{
                                        background: checked ? 'rgba(var(--tj-accent-primary), 0.12)' : 'rgba(var(--tj-bg-primary), 0.34)',
                                        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                                        clipPath: smallClip,
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) =>
                                          setGroupMemberIds((prev) =>
                                            e.target.checked ? [...prev, contact.id] : prev.filter((id) => id !== contact.id),
                                          )
                                        }
                                      />
                                      <Avatar name={contact.name} src={contact.avatar} />
                                      <span className="min-w-0 truncate text-xs" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                                        {contact.name}
                                      </span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={handleCreateGroupChat}
                              className="w-full py-2 text-xs font-serif tracking-[0.18em] transition-all hover:opacity-90"
                              style={{
                                color: 'rgb(var(--tj-on-accent))',
                                background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))',
                                clipPath: smallClip,
                              }}
                            >
                              建立频道
                            </button>
                          </section>
                        )}
                        <section
                          className="space-y-2"
                          style={{
                            background: 'rgba(var(--tj-accent-primary), 0.04)',
                            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                            clipPath: smallClip,
                            padding: '10px',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => setShowPendingSeeds((v) => !v)}
                            className="flex w-full items-center justify-between gap-2 text-left"
                          >
                            <span className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                              待处理来信
                            </span>
                            <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
                              {pendingSeeds.length} · {showPendingSeeds ? '收起' : '展开'}
                            </span>
                          </button>
                          {showPendingSeeds ? pendingSeeds.length === 0 ? (
                            <EmptyText text="暂无来信种子。重要事件触发后会在这里出现。" />
                          ) : (
                            pendingSeeds.map((seed) => (
                              <SeedCard
                                key={seed.id}
                                seed={seed}
                                loading={generatingSeedId === seed.id}
                                coolingDown={isSeedCoolingDown(seed)}
                                onDismiss={() => dismissSeed(seed)}
                                onOpen={() => void handleGenerateSeed(seed)}
                              />
                            ))
                          ) : pendingSeeds.length > 0 ? (
                            <div className="truncate py-2 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                              有 {pendingSeeds.length} 条来信待处理，点击展开查看。
                            </div>
                          ) : (
                            <div className="truncate py-2 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
                              暂无待处理来信。
                            </div>
                          )}
                        </section>

                        <section className="space-y-2">
                          <div className="flex items-center justify-between px-1">
                            <span className="font-serif text-xs tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                              {messageListMode === 'group' ? '群聊频道' : '好友短讯'}
                            </span>
                            <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
                              {visibleChats.length}
                            </span>
                          </div>
                          {visibleChats.length === 0 ? (
                            <EmptyText text={messageListMode === 'group' ? '暂无群聊频道。创建群聊或触发群聊来信后会出现。' : '暂无好友短讯。认识角色后，私聊会出现在这里。'} />
                          ) : (
                            visibleChats.map((chat) => (
                              <ChatListItem
                                key={chat.id}
                                chat={chat}
                                avatar={resolveContactForChat(chat)?.avatar}
                                active={activeChat?.id === chat.id}
                                onClick={() => handleSelectChat(chat.id)}
                              />
                            ))
                          )}
                        </section>
                      </div>
                    </div>
                  </aside>

                  <main className={`${mobileView === 'chat' ? 'flex' : 'hidden xl:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
                    {activeChat ? (
                      <ChatSurface
                        chat={activeChat}
                        traveler={traveler}
                        contact={resolveContactForChat(activeChat)}
                        groupMembers={activeChat.type === 'group'
                          ? activeChat.participantIds
                              .map(resolveContactByParticipantId)
                              .filter((item): item is 手机联系人 => Boolean(item))
                          : []}
                        groupAddCandidates={activeChat.type === 'group'
                          ? contacts.filter((contact) => {
                              if (contact.available === false) return false;
                              return !activeChat.participantIds.some((participantId) => {
                                const normalized = normalizeParticipantId(participantId);
                                return (
                                  participantId === contact.id ||
                                  participantId === contact.npcId ||
                                  normalized === contact.id ||
                                  (contact.npcId ? normalized === normalizeParticipantId(contact.npcId) : false)
                                );
                              });
                            })
                          : []}
                        onSend={handleSendPhoneMessage}
                        draft={draft}
                        onDraftChange={setDraft}
                        onRenameGroup={handleRenameGroupChat}
                        onAddGroupMember={handleAddGroupMember}
                        loading={sendingChatId === activeChat.id}
                        error={phoneError}
                        onBack={() => setMobileView('list')}
                      />
                    ) : (
                      <div className="flex flex-1 items-center justify-center">
                        <EmptyText text="暂无会话。剧情认识角色后，聊天对象会逐步解锁。" />
                      </div>
                    )}
                  </main>
                </div>
              ) : activeApp === 'contacts' ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
                  <aside
                    className={`${mobileView === 'list' ? 'flex' : 'hidden xl:flex'} min-h-0 w-full flex-1 flex-col overflow-hidden xl:w-[280px] xl:flex-none`}
                    style={{
                      borderRight: '1px solid rgba(var(--tj-accent-primary), 0.22)',
                      background: 'rgba(var(--tj-bubble), 0.86)',
                    }}
                  >
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
                      <div className="truncate font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                        通讯录
                      </div>
                      <div className="mt-1 text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
                        已解锁联系人
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddContact((v) => !v)}
                        className="mt-3 flex w-full items-center justify-between px-3 py-2 text-left transition-all hover:opacity-90"
                        style={{
                          color: 'rgb(var(--tj-accent-primary))',
                          background: showAddContact ? 'rgba(var(--tj-accent-primary), 0.14)' : 'rgba(var(--tj-accent-primary), 0.05)',
                          boxShadow: showAddContact
                            ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.48)'
                            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
                          clipPath: smallClip,
                        }}
                      >
                        <span className="font-serif text-[12px] font-bold tracking-[0.18em]">添加好友</span>
                        <span className="text-base">{showAddContact ? '−' : '+'}</span>
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-3 py-3 [-webkit-overflow-scrolling:touch]">
                      <div className="space-y-2">
                        {showAddContact && (
                          <AddContactPanel
                            candidates={addableNpcContacts}
                            onAdd={handleAddContact}
                          />
                        )}
                        {contacts.length === 0 ? (
                          <EmptyText text="暂无可联系对象。可点击上方添加已认识角色。" />
                        ) : (
                          contacts.map((contact) => (
                            <button
                              key={contact.id}
                              type="button"
                              onClick={() => {
                                setActiveContactId(contact.id);
                                setMobileView('contact');
                              }}
                              className="w-full px-3 py-2 text-left transition-all"
                              style={{
                                background:
                                  activeContact?.id === contact.id ? 'rgba(var(--tj-accent-primary), 0.12)' : 'rgba(var(--tj-accent-primary), 0.04)',
                                boxShadow:
                                  activeContact?.id === contact.id
                                    ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)'
                                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                                clipPath: smallClip,
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <Avatar name={contact.name} src={contact.avatar} />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                                    {contact.name}
                                  </div>
                                  <div className="truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                                    {contact.relationLabel ?? '联系人'} {contact.organization ? `· ${contact.organization}` : ''}
                                  </div>
                                </div>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  </aside>

                  <main className={`${mobileView === 'contact' ? 'flex' : 'hidden xl:flex'} min-h-0 min-w-0 flex-1 flex-col`}>
                    <ContactSurface
                      contact={activeContact}
                      onOpenChat={() => {
                        if (activeContact) handleStartChat(activeContact);
                      }}
                      onBack={() => setMobileView('list')}
                    />
                  </main>
                </div>
              ) : activeApp === 'news' ? (
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <NewsSurface news={news} />
                </div>
              ) : (
                <WallpaperSurface
                  homeWallpaper={homeWallpaper}
                  chatWallpaper={解析相册资源引用(album, phone.wallpapers?.chat) || DEFAULT_PHONE_CHAT_WALLPAPER}
                  onSetHome={(src) =>
                    onPhoneChange((prev) => ({
                      ...prev,
                      wallpapers: { ...(prev.wallpapers ?? {}), home: src },
                    }))
                  }
                  onSetChat={(src) =>
                    onPhoneChange((prev) => ({
                      ...prev,
                      wallpapers: { ...(prev.wallpapers ?? {}), chat: src },
                    }))
                  }
                  onResetHome={() =>
                    onPhoneChange((prev) => ({
                      ...prev,
                      wallpapers: { ...(prev.wallpapers ?? {}), home: undefined },
                    }))
                  }
                  onResetChat={() =>
                    onPhoneChange((prev) => ({
                      ...prev,
                      wallpapers: { ...(prev.wallpapers ?? {}), chat: undefined },
                    }))
                  }
                />
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function PhoneHome({
  unread,
  contactCount,
  chatCount,
  activeApp,
  onOpen,
  onClose,
  wallpaper,
}: {
  unread: number;
  contactCount: number;
  chatCount: number;
  activeApp: PhoneApp | null;
  onOpen: (view: PhoneApp) => void;
  onClose: () => void;
  wallpaper?: string;
}) {
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={{
        background: wallpaper
          ? `linear-gradient(180deg, rgba(var(--tj-surface),0.48), rgba(var(--tj-bg-secondary),0.72)), url(${wallpaper}) center/cover`
          : phoneScreenSurface,
      }}
    >
      <div
        className="pointer-events-none absolute left-3 right-14 top-3 flex items-center justify-between gap-2 text-[9px] font-mono tracking-[0.14em]"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
      >
        <span className="truncate whitespace-nowrap">IPC-LINK 23:47</span>
        <span className="truncate whitespace-nowrap">SYNC ◆ 97%</span>
      </div>

      <div className="absolute right-3 top-3">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-[10px] font-serif tracking-[0.12em]"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.85)',
            background: 'rgba(var(--tj-accent-primary), 0.05)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
            clipPath: smallClip,
          }}
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      <div className="grid flex-1 content-start grid-cols-2 gap-3 px-4 pb-4 pt-12">
        <AppIcon
          title="短讯"
          subtitle={`${chatCount} 会话`}
          glyph="▣"
          badge={unread}
          active={activeApp === 'messages'}
          onClick={() => onOpen('messages')}
        />
        <AppIcon
          title="通讯录"
          subtitle={`${contactCount} 联系人`}
          glyph="◇"
          active={activeApp === 'contacts'}
          onClick={() => onOpen('contacts')}
        />
        <AppIcon
          title="星际周报"
          subtitle="新闻"
          glyph="☉"
          active={activeApp === 'news'}
          onClick={() => onOpen('news')}
        />
        <AppIcon title="任务便签" subtitle="未启用" glyph="✧" disabled />
        <AppIcon
          title="相册"
          subtitle="壁纸"
          glyph="◌"
          active={activeApp === 'wallpapers'}
          onClick={() => onOpen('wallpapers')}
        />
      </div>
    </div>
  );
}

function AppIcon({
  title,
  subtitle,
  glyph,
  badge = 0,
  active = false,
      disabled,
      onClick,
}: {
  title: string;
  subtitle: string;
  glyph: string;
  badge?: number;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative flex min-h-[104px] flex-col items-center justify-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-45 disabled:hover:scale-100"
      style={{
        background: disabled
          ? 'rgba(var(--tj-surface-strong), 0.68)'
          : active
            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-tech-cyan, var(--tj-accent-primary)), 0.12))'
            : phoneCardSurface,
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.42), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)),0.5), 0 10px 22px rgba(var(--tj-shadow),0.09)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.58), 0 8px 18px rgba(var(--tj-shadow),0.06)',
        clipPath: cardClip,
      }}
    >
      {badge > 0 && (
        <span
          className="absolute right-2.5 top-2.5 rounded-full px-1.5 text-[10px] font-bold"
          style={{ color: 'rgb(var(--tj-on-accent))', background: 'rgb(var(--tj-danger))' }}
        >
          {badge}
        </span>
      )}
      <span
        className="flex h-10 w-10 items-center justify-center font-serif text-xl"
        style={{
          color: disabled ? 'rgba(var(--tj-text-secondary), 0.7)' : 'rgb(var(--tj-accent-primary))',
          background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.96), rgba(var(--tj-surface-strong),0.82))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)',
          clipPath: smallClip,
        }}
      >
        {glyph}
      </span>
      <span className="font-serif text-[12px] font-semibold tracking-[0.16em]" style={{ color: disabled ? 'rgba(var(--tj-text-secondary), 0.72)' : 'rgb(var(--tj-text-primary))' }}>
        {title}
      </span>
      <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
        {subtitle}
      </span>
    </button>
  );
}

function ContactSurface({ contact, onOpenChat, onBack }: { contact?: 手机联系人; onOpenChat: () => void; onBack?: () => void }) {
  if (!contact) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <EmptyText text="暂无联系人。遇见 NPC 后可在这里查看名片、关系与对话入口。" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-4 sm:px-6" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-2 py-1 text-xs font-serif tracking-[0.14em] xl:hidden"
              style={{
                color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.92), rgba(var(--tj-accent-secondary),0.88))',
                background: 'rgba(var(--tj-accent-primary), 0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
                clipPath: smallClip,
              }}
            >
              返回
            </button>
          )}
          <Avatar name={contact.name} src={contact.avatar} />
          <div className="min-w-0">
            <div className="truncate font-serif text-lg font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
              {contact.name}
            </div>
            <div className="mt-1 text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
              {contact.relationLabel ?? '联系人'} {contact.organization ? `· ${contact.organization}` : ''}
            </div>
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold"
          style={{
            background: contact.available ? 'rgba(90, 180, 120, 0.18)' : 'rgba(220, 80, 80, 0.2)',
            color: contact.available ? 'rgb(var(--tj-sage-deep, var(--tj-accent-primary)))' : 'rgb(var(--tj-danger))',
          }}
        >
          {contact.available ? '在场' : '离线'}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
        <div className="grid gap-3 lg:grid-cols-2">
          <InfoCard label="身份" value={contact.relationLabel ?? '联系人'} />
          <InfoCard label="势力" value={contact.organization || '未知'} />
          <InfoCard label="最近回合" value={contact.lastActiveTurn != null ? `第 ${contact.lastActiveTurn} 回合` : '未记录'} />
          <InfoCard label="状态" value={contact.available ? '可以联系' : '暂不可联系'} />
        </div>
        <button
          type="button"
          onClick={onOpenChat}
          className="mt-4 w-full py-2.5 text-sm font-serif tracking-[0.24em] transition-all hover:opacity-90"
          style={{
            color: 'rgb(var(--tj-on-accent))',
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.45), 0 0 14px rgba(var(--tj-accent-primary),0.16)',
            clipPath: smallClip,
          }}
        >
          发送短讯
        </button>
        <div className="mt-4 rounded-none px-4 py-4" style={{ background: 'rgba(var(--tj-accent-primary), 0.04)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)', clipPath: smallClip }}>
          <div className="text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            点击发送短讯会建立独立会话。聊天内容由手机系统 API 生成，不会直接塞进正文，但会写入记忆供后续剧情承接。
          </div>
        </div>
      </div>
    </div>
  );
}

function AddContactPanel({
  candidates,
  onAdd,
}: {
  candidates: 手机联系人[];
  onAdd: (contact: 手机联系人) => void;
}) {
  return (
    <div
      className="mb-3 px-3 py-3"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.035)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 font-serif text-[11px] font-bold tracking-[0.2em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        可添加对象
      </div>
      {candidates.length === 0 ? (
        <div className="py-3 text-center text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.62)' }}>
          当前没有可添加的已认识角色。
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onAdd(contact)}
              className="flex w-full items-center gap-2 px-2 py-2 text-left transition-all hover:bg-[rgba(var(--tj-accent-primary),0.08)]"
              style={{
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                clipPath: smallClip,
              }}
            >
              <Avatar name={contact.name} src={contact.avatar} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                  {contact.name}
                </div>
                <div className="truncate text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary),0.65)' }}>
                  {contact.relationLabel ?? '已认识'} {contact.organization ? `· ${contact.organization}` : ''}
                </div>
              </div>
              <span className="font-serif text-lg" style={{ color: 'rgb(var(--tj-accent-primary))' }}>+</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function WallpaperSurface({
  homeWallpaper,
  chatWallpaper,
  onSetHome,
  onSetChat,
  onResetHome,
  onResetChat,
}: {
  homeWallpaper: string;
  chatWallpaper: string;
  onSetHome: (src: string) => void;
  onSetChat: (src: string) => void;
  onResetHome: () => void;
  onResetChat: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-5 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-3">
          <WallpaperPreview title="桌面预览" src={homeWallpaper} />
          <WallpaperPreview title="短讯背景" src={chatWallpaper} compact />
          <div className="grid grid-cols-2 gap-2">
            <PhoneSmallButton label="桌面默认" onClick={onResetHome} />
            <PhoneSmallButton label="短讯默认" onClick={onResetChat} />
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                内置壁纸
              </div>
              <div className="mt-1 text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                选择后会写入手机存档，玩家自定义优先于默认壁纸
              </div>
            </div>
            <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
              {BUILTIN_PHONE_WALLPAPERS.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {BUILTIN_PHONE_WALLPAPERS.map((wallpaper) => {
              const isHome = homeWallpaper === wallpaper.src;
              const isChat = chatWallpaper === wallpaper.src;
              return (
                <article
                  key={wallpaper.id}
                  className="overflow-hidden"
                  style={{
                    background: 'rgba(var(--tj-bg-primary), 0.48)',
                    boxShadow: isHome || isChat
                      ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.58), 0 0 18px rgba(var(--tj-accent-primary),0.08)'
                      : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                    clipPath: cardClip,
                  }}
                >
                  <div className="aspect-[9/16] max-h-[260px] w-full overflow-hidden">
                    <img
                      src={wallpaper.src}
                      alt={wallpaper.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="space-y-2 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-serif text-sm font-bold tracking-[0.12em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                        {wallpaper.title}
                      </h3>
                      {(isHome || isChat) && (
                        <span className="shrink-0 text-[10px]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))' }}>
                          {isHome && isChat ? '桌面/短讯' : isHome ? '桌面' : '短讯'}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                      {wallpaper.description}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <PhoneSmallButton label="设为桌面" active={isHome} onClick={() => onSetHome(wallpaper.src)} />
                      <PhoneSmallButton label="设为短讯" active={isChat} onClick={() => onSetChat(wallpaper.src)} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

function WallpaperPreview({ title, src, compact = false }: { title: string; src: string; compact?: boolean }) {
  return (
    <section
      className="overflow-hidden"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.48)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: cardClip,
      }}
    >
      <div className={compact ? 'aspect-[16/9]' : 'aspect-[9/16]'}>
        <img src={src} alt={title} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <div className="px-3 py-2 font-serif text-xs tracking-[0.16em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        {title}
      </div>
    </section>
  );
}

function PhoneSmallButton({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1.5 text-[11px] font-serif tracking-[0.12em] transition-all hover:opacity-90"
      style={{
        color: active ? 'rgb(var(--tj-bg-primary))' : 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.92), rgba(var(--tj-accent-secondary),0.88))',
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))'
          : 'rgba(var(--tj-accent-primary), 0.055)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.45)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

function NewsSurface({ news }: { news: 新闻条目[] }) {
  const latest = [...news].slice(-8).reverse();
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {latest.length === 0 ? (
          <InfoSurface
            title="星际和平周报"
            text="这里会同步右侧新闻系统中的周报条目。当前还没有已生成新闻。"
          />
        ) : (
          <div className="space-y-3">
            {latest.map((item) => (
              <article
                key={item.id}
                className="px-4 py-3"
                style={{
                  background: item.重要 ? 'rgba(var(--tj-accent-primary), 0.08)' : 'rgba(var(--tj-accent-primary), 0.04)',
                  boxShadow: item.重要
                    ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.26)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="truncate font-serif text-sm font-bold tracking-[0.16em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                    {item.标题}
                  </h4>
                  <span className="flex-shrink-0 text-[10px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>
                    {item.状态}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                  {item.正文 || '暂无正文。'}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoSurface({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <div className="font-serif text-lg font-bold tracking-[0.24em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        {title}
      </div>
      <div className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
        {text}
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-4 py-3"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.66)' }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        {value}
      </div>
    </div>
  );
}

function ChatSurface({
  chat,
  traveler,
  contact,
  groupMembers,
  groupAddCandidates,
  draft,
  loading,
  error,
  onBack,
  onDraftChange,
  onAddGroupMember,
  onRenameGroup,
  onSend,
}: {
  chat: 手机会话;
  traveler: 角色数据结构;
  contact?: 手机联系人;
  groupMembers?: 手机联系人[];
  groupAddCandidates?: 手机联系人[];
  draft: string;
  loading: boolean;
  error: string;
  onBack?: () => void;
  onDraftChange: (text: string) => void;
  onAddGroupMember?: (chatId: string, contact: 手机联系人) => void;
  onRenameGroup?: (chatId: string, title: string) => void;
  onSend: () => void;
}) {
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [renamingGroup, setRenamingGroup] = useState(false);
  const [showGroupMembers, setShowGroupMembers] = useState(false);
  const [showAddMembers, setShowAddMembers] = useState(false);
  const [groupTitleDraft, setGroupTitleDraft] = useState(chat.title);

  useEffect(() => {
    setRenamingGroup(false);
    setShowGroupMembers(false);
    setShowAddMembers(false);
    setGroupTitleDraft(chat.title);
  }, [chat.id, chat.title]);

  const submitGroupTitle = () => {
    const nextTitle = groupTitleDraft.trim();
    if (nextTitle && nextTitle !== chat.title) onRenameGroup?.(chat.id, nextTitle);
    setRenamingGroup(false);
    setGroupTitleDraft(nextTitle || chat.title);
  };

  useEffect(() => {
    const scrollToBottom = () => {
      const container = messagesScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
      messagesEndRef.current?.scrollIntoView({ block: 'end' });
    };
    scrollToBottom();
    const frame = window.requestAnimationFrame(scrollToBottom);
    return () => window.cancelAnimationFrame(frame);
  }, [chat.id, chat.messages.length]);

  return (
    <>
      <header className="relative flex flex-wrap items-start justify-between gap-3 px-4 py-4 sm:px-6" style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary), 0.2)' }}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="px-2 py-1 text-xs font-serif tracking-[0.14em] xl:hidden"
              style={{
                color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.92), rgba(var(--tj-accent-secondary),0.88))',
                background: 'rgba(var(--tj-accent-primary), 0.06)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
                clipPath: smallClip,
              }}
            >
              返回
            </button>
          )}
          <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {renamingGroup ? (
              <input
                value={groupTitleDraft}
                autoFocus
                maxLength={24}
                onChange={(e) => setGroupTitleDraft(e.target.value)}
                onBlur={submitGroupTitle}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitGroupTitle();
                  if (e.key === 'Escape') {
                    setRenamingGroup(false);
                    setGroupTitleDraft(chat.title);
                  }
                }}
                className="kaituo-input min-w-0 flex-1 px-2 py-1 font-serif text-base font-bold tracking-[0.12em]"
                style={{ clipPath: smallClip }}
              />
            ) : (
              <div className="truncate font-serif text-lg font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                {chat.title}
              </div>
            )}
            {chat.type === 'group' && !renamingGroup && (
              <button
                type="button"
                onClick={() => {
                  setGroupTitleDraft(chat.title);
                  setRenamingGroup(true);
                }}
                className="flex-shrink-0 px-2 py-1 text-[10px] font-serif tracking-[0.14em]"
                style={{
                  color: 'rgba(var(--tj-accent-primary), 0.84)',
                  background: 'rgba(var(--tj-accent-primary), 0.055)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                  clipPath: smallClip,
                }}
              >
                改名
              </button>
            )}
          </div>
          <div className="mt-1 text-[11px] tracking-[0.2em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
            {chat.type === 'group' ? 'GROUP CHANNEL' : chat.type === 'system' ? 'SYSTEM NOTICE' : 'PRIVATE LINK'}
          </div>
          <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
            本地记忆 {chat.localArchive?.entries.length ?? 0}/{chat.localArchive?.threshold ?? 0}
            {chat.localArchive?.compressedSummaries.length ? ` · 已压缩 ${chat.localArchive.compressedSummaries.length} 次` : ''}
          </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-start gap-2">
          {chat.type === 'group' && (
            <div className="flex flex-col items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowGroupMembers((v) => !v);
                  setShowAddMembers(false);
                }}
                className="px-2.5 py-1.5 text-[11px] font-serif tracking-[0.14em]"
                style={{
                  color: showGroupMembers ? 'rgb(var(--tj-bg-primary))' : 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.9), rgba(var(--tj-accent-secondary),0.86))',
                  background: showGroupMembers
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-amber-deep),0.92))'
                    : 'rgba(var(--tj-accent-primary), 0.055)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                  clipPath: smallClip,
                }}
              >
                成员 {groupMembers?.length ?? chat.participantIds.length}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddMembers((v) => !v);
                  setShowGroupMembers(false);
                }}
                className="min-w-[58px] px-2.5 py-1.5 text-[13px] font-serif font-bold tracking-[0.12em]"
                style={{
                  color: showAddMembers ? 'rgb(var(--tj-bg-primary))' : 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))',
                  background: showAddMembers
                    ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-amber-deep),0.92))'
                    : 'rgba(var(--tj-accent-primary), 0.05)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
                  clipPath: smallClip,
                }}
                aria-label="拉人入群"
                title="拉人入群"
              >
                +
              </button>
            </div>
          )}
          {chat.unread > 0 && (
            <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'rgba(220, 80, 80, 0.16)', color: 'rgb(var(--tj-danger))' }}>
              {chat.unread}
            </span>
          )}
        </div>
        {chat.type === 'group' && showGroupMembers && (
          <div
            className="absolute right-4 top-full z-20 mt-2 max-h-64 w-[min(320px,calc(100vw-48px))] overflow-y-auto px-3 py-3"
            style={{
              background: 'rgba(var(--tj-bubble), 0.98)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24), 0 18px 36px rgba(var(--tj-shadow), 0.22)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-serif text-xs font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                群聊成员
              </span>
              <button
                type="button"
                onClick={() => setShowGroupMembers(false)}
                className="px-2 py-1 text-[10px]"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
              >
                收起
              </button>
            </div>
            <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
              {(groupMembers?.length ? groupMembers : []).map((member) => (
                <div
                  key={member.id}
                  className="flex items-center gap-2 px-2 py-2"
                  style={{
                    background: 'rgba(var(--tj-accent-primary), 0.045)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                    clipPath: smallClip,
                  }}
                >
                  <Avatar name={member.name} src={member.avatar} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                      {member.name}
                    </div>
                    <div className="truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                      {member.relationLabel ?? '成员'}{member.organization ? ` · ${member.organization}` : ''}
                    </div>
                  </div>
                </div>
              ))}
              {!(groupMembers?.length) && (
                <EmptyText text="暂无可显示成员。" />
              )}
            </div>
          </div>
        )}
        {chat.type === 'group' && showAddMembers && (
          <div
            className="absolute right-4 top-full z-20 mt-2 max-h-64 w-[min(320px,calc(100vw-48px))] overflow-y-auto px-3 py-3"
            style={{
              background: 'rgba(var(--tj-bubble), 0.98)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.24), 0 18px 36px rgba(var(--tj-shadow), 0.22)',
              clipPath: cardClip,
            }}
          >
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-serif text-xs font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                拉人入群
              </span>
              <button
                type="button"
                onClick={() => setShowAddMembers(false)}
                className="px-2 py-1 text-[10px]"
                style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
              >
                收起
              </button>
            </div>
            <div className="max-h-44 space-y-2 overflow-y-auto pr-1">
              {groupAddCandidates?.length ? (
                groupAddCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => {
                      onAddGroupMember?.(chat.id, candidate);
                      setShowAddMembers(false);
                    }}
                    className="flex w-full items-center gap-2 px-2 py-2 text-left"
                    style={{
                      background: 'rgba(var(--tj-accent-primary), 0.04)',
                      boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                      clipPath: smallClip,
                    }}
                  >
                    <Avatar name={candidate.name} src={candidate.avatar} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                        {candidate.name}
                      </div>
                      <div className="truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                        {candidate.relationLabel ?? '联系人'}{candidate.organization ? ` · ${candidate.organization}` : ''}
                      </div>
                    </div>
                  </button>
                ))
              ) : (
                <EmptyText text="暂无可拉入的联系人。" />
              )}
            </div>
          </div>
        )}
      </header>
      <div ref={messagesScrollRef} className="flex-1 overflow-y-auto px-6 py-5">
        {chat.messages.length === 0 ? (
          <EmptyText text="这里还没有消息。输入短讯后，对方会通过手机系统 API 回复，并留下记忆摘要。" />
        ) : (
          <div className="space-y-3">
            {chat.messages.map((msg, index) => {
              const previous = index > 0 ? chat.messages[index - 1] : undefined;
              const turnGap = previous && previous.turn > 0 && msg.turn > previous.turn ? msg.turn - previous.turn : 0;
              const showHistoryDivider = turnGap > 1;
              return (
                <Fragment key={msg.id}>
                  {showHistoryDivider && <PhoneHistoryDivider turn={msg.turn} gap={turnGap} />}
                  <div className={`flex items-end gap-2 ${msg.role === 'player' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role !== 'player' && (
                      <Avatar
                        name={msg.senderName}
                        src={msg.avatar || (contact && msg.senderId === contact.id ? contact.avatar : undefined)}
                      />
                    )}
                    <div
                      className="max-w-[82%] px-3 py-2 text-sm leading-relaxed sm:max-w-[76%]"
                      style={{
                        color: msg.role === 'player' ? 'rgb(var(--tj-on-accent))' : 'rgba(var(--tj-text-primary), 0.94)',
                        background:
                          msg.role === 'player'
                            ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))'
                            : 'linear-gradient(135deg, rgba(var(--tj-bubble),0.98), rgba(var(--tj-surface-strong),0.88))',
                        boxShadow: msg.role === 'player'
                          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)'
                          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.62), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)),0.42)',
                        clipPath: smallClip,
                      }}
                    >
                      <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold opacity-75">
                        <span>{msg.senderName}</span>
                        {msg.turn > 0 && <span className="opacity-60">· 第 {msg.turn} 回合</span>}
                      </div>
                      {msg.content}
                    </div>
                    {msg.role === 'player' && (
                      <Avatar name={traveler.姓名 || '我'} src={traveler.图像档案?.手机头像 || traveler.头像 || undefined} />
                    )}
                  </div>
                </Fragment>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <footer className="px-4 py-3 sm:px-6 sm:py-4" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.18)' }}>
        {error && (
          <div
            className="mb-2 px-3 py-2 text-xs"
            style={{
              color: 'rgb(var(--tj-danger))',
              background: 'rgba(220, 80, 80, 0.08)',
              boxShadow: 'inset 0 0 0 1px rgba(220, 80, 80, 0.22)',
              clipPath: smallClip,
            }}
          >
            {error}
          </div>
        )}
        <div
          className="flex items-end gap-2 px-2.5 py-2 sm:px-3"
          style={{
            color: 'rgba(var(--tj-text-secondary), 0.65)',
            background: 'rgba(var(--tj-bubble), 0.96)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)',
            clipPath: smallClip,
          }}
        >
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            rows={2}
            placeholder="输入短讯..."
            className="min-h-[44px] min-w-0 flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none"
            style={{ color: 'rgb(var(--tj-text-primary))' }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={loading || !draft.trim()}
            className="flex-shrink-0 px-3 py-2 text-xs font-serif tracking-[0.16em] transition-all disabled:opacity-45 sm:px-4 sm:tracking-[0.2em]"
            style={{
              color: 'rgb(var(--tj-on-accent))',
              background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))',
              clipPath: smallClip,
            }}
          >
            {loading ? '发送中' : '发送'}
          </button>
        </div>
      </footer>
    </>
  );
}

function PhoneHistoryDivider({ turn, gap }: { turn: number; gap: number }) {
  const gapLabel = gap > 1 ? `间隔 ${gap} 回合` : '稍后';
  return (
    <div className="flex items-center gap-3 py-1">
      <span
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.34))' }}
      />
      <span
        className="shrink-0 px-3 py-1 font-serif text-[11px] tracking-[0.18em]"
        style={{
          color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.86), rgba(var(--tj-accent-secondary),0.82))',
          background: 'rgba(var(--tj-bubble), 0.72)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
          clipPath: smallClip,
        }}
      >
        历史消息 · {gapLabel} · 第 {turn} 回合
      </span>
      <span
        className="h-px flex-1"
        style={{ background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.34), transparent)' }}
      />
    </div>
  );
}

function ChatListItem({
  chat,
  avatar,
  active,
  onClick,
}: {
  chat: 手机会话;
  avatar?: string;
  active: boolean;
  onClick: () => void;
}) {
  const last = chat.messages[chat.messages.length - 1];
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-2 text-left transition-all"
      style={{
        background: active ? 'rgba(var(--tj-accent-primary), 0.12)' : 'rgba(var(--tj-accent-primary), 0.04)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center gap-2">
        <Avatar name={chat.title} src={avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold" style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgb(var(--tj-text-primary))' }}>
              {chat.title}
            </span>
            {chat.unread > 0 && (
              <span className="rounded-full px-1.5 text-[10px]" style={{ background: 'rgba(220, 80, 80, 0.4)', color: '#fff' }}>
                {chat.unread}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
            {last?.content ?? '暂无消息'}
          </div>
        </div>
      </div>
    </button>
  );
}

function SeedCard({
  seed,
  loading,
  coolingDown,
  onOpen,
  onDismiss,
}: {
  seed: 主动来信种子;
  loading: boolean;
  coolingDown: boolean;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="px-3 py-2"
      style={{
        background: 'rgba(220, 80, 80, 0.08)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-semibold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          {seed.title}
        </div>
        <span className="text-[10px]" style={{ color: seed.priority === 'urgent' ? 'rgb(var(--tj-danger))' : 'rgba(var(--tj-accent-primary), 0.75)' }}>
          {seed.priority.toUpperCase()}
        </span>
      </div>
      <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
        {seed.context}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpen}
          disabled={loading || coolingDown}
          className="py-1 text-[11px] font-serif tracking-[0.18em] disabled:opacity-50"
          style={{
            color: 'rgb(var(--tj-on-accent))',
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))',
            clipPath: smallClip,
          }}
        >
          {loading ? '接入中' : coolingDown ? '冷却中' : '打开'}
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="py-1 text-[11px] font-serif tracking-[0.18em]"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.85)',
            background: 'rgba(var(--tj-accent-primary), 0.04)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
            clipPath: smallClip,
          }}
        >
          稍后
        </button>
      </div>
    </div>
  );
}

function Avatar({ name, src }: { name: string; src?: string }) {
  return (
    <div
      className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-full font-serif text-sm font-bold"
      style={{
        color: 'rgb(var(--tj-accent-primary))',
        background: 'radial-gradient(circle at 35% 24%, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-primary), 0.04) 62%)',
        boxShadow: src
          ? '0 0 0 1px rgba(var(--tj-accent-primary), 0.54), 0 0 14px rgba(var(--tj-accent-primary), 0.12)'
          : '0 0 0 1px rgba(var(--tj-accent-primary), 0.32)',
      }}
    >
      {src ? <ResilientImage src={src} alt={name} className="h-full w-full object-cover" /> : name[0] ?? '?'}
      <span
        className="pointer-events-none absolute inset-[5px] rounded-full"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)' }}
      />
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
      {text}
    </div>
  );
}
