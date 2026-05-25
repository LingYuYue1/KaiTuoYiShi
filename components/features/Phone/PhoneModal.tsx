import { useEffect, useMemo, useState } from 'react';
import type { 角色数据结构 } from '@/models/character';
import type { 记忆系统 } from '@/models/memory';
import type { 手机联系人, 手机会话, 手机系统, 主动来信种子 } from '@/models/phone';
import type { NPC记录, NPC同行记忆条目 } from '@/models/npc';
import { 归一化NPC记录列表, 提取NPC同行记忆文本列表, 读取NPC头像 } from '@/models/npc';
import type { 新闻条目 } from '@/models/news';
import type { 世界状态 } from '@/models/world';
import type { API设置, 游戏设置 } from '@/models/settings';
import { 创建手机会话, 创建手机会话本地摘要条目, 创建手机会话本地库, 创建手机消息, 计算手机未读, type 手机消息 } from '@/models/phone';
import { buildPhoneApiConfig, generatePhoneReply } from '@/services/ai/phoneService';
import type { 忆庭系统 } from '@/models/yiting';
import { addImmediateMemory, autoCompressMemorySystemWithArchivesAsync, compressNpcMemories } from '@/hooks/useGame/memoryUtils';

interface Props {
  phone: 手机系统;
  traveler: 角色数据结构;
  world: 世界状态;
  memory: 记忆系统;
  yiting: 忆庭系统;
  news: 新闻条目[];
  apiSettings: API设置;
  gameSettings: 游戏设置;
  turnCount: number;
  npcRecords: NPC记录[];
  onPhoneChange: React.Dispatch<React.SetStateAction<手机系统>>;
  onMemoryChange: React.Dispatch<React.SetStateAction<记忆系统>>;
  onYitingChange: React.Dispatch<React.SetStateAction<忆庭系统>>;
  onNpcRecordsChange: React.Dispatch<React.SetStateAction<NPC记录[]>>;
  onClose: () => void;
}

const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
const cardClip = 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)';
const phoneShellClip =
  'polygon(28px 0, calc(100% - 28px) 0, 100% 28px, 100% calc(100% - 28px), calc(100% - 28px) 100%, 28px 100%, 0 calc(100% - 28px), 0 28px)';

type PhoneApp = 'messages' | 'contacts' | 'news';

function toPhoneContactId(npcId: string): string {
  return npcId.startsWith('npc_') ? npcId : `npc_${npcId}`;
}

export function PhoneModal({
  phone,
  traveler,
  world,
  memory,
  yiting,
  news,
  apiSettings,
  gameSettings,
  turnCount,
  npcRecords,
  onPhoneChange,
  onMemoryChange,
  onYitingChange,
  onNpcRecordsChange,
  onClose,
}: Props) {
  const [activeApp, setActiveApp] = useState<PhoneApp | null>(null);
  const [activeChatId, setActiveChatId] = useState(phone.chats[0]?.id ?? '');
  const [activeContactId, setActiveContactId] = useState(phone.contacts[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const [sendingChatId, setSendingChatId] = useState('');
  const [generatingSeedId, setGeneratingSeedId] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showAddContact, setShowAddContact] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [groupMemberIds, setGroupMemberIds] = useState<string[]>([]);
  const normalizedNpcRecords = useMemo(() => 归一化NPC记录列表(npcRecords), [npcRecords]);
  const mainConfig = useMemo(
    () => apiSettings.configs.find((config) => config.id === apiSettings.activeConfigId) ?? null,
    [apiSettings.activeConfigId, apiSettings.configs],
  );

  const derivedContacts = useMemo(
    () =>
      normalizedNpcRecords
        .filter((npc) => npc.关系 !== 'enemy')
        .map((npc) => ({
          id: toPhoneContactId(npc.id),
          npcId: npc.id,
          name: npc.姓名,
          avatar: 读取NPC头像(npc, '手机'),
          organization: npc.阵营ID,
          relationLabel: npc.阶位 === 'companion' ? '伙伴' : '路人',
          available: true,
          lastActiveTurn: npc.最近回合,
        })),
    [normalizedNpcRecords],
  );

  const contacts = useMemo(() => {
    return phone.contacts
      .map((contact) => {
        const derived =
          derivedContacts.find((item) => item.id === contact.id) ??
          derivedContacts.find((item) => item.npcId && item.npcId === contact.npcId);
        return {
          ...derived,
          ...contact,
          avatar: contact.avatar || derived?.avatar,
          organization: contact.organization || (contact as { faction?: string }).faction || derived?.organization,
          relationLabel: contact.relationLabel || derived?.relationLabel,
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
        }
        return contact.available !== false;
      });
  }, [derivedContacts, normalizedNpcRecords, phone.contacts]);
  const addableNpcContacts = useMemo(
    () =>
      normalizedNpcRecords
        .filter((npc) => npc.关系 !== 'enemy')
        .filter((npc) => !phone.contacts.some((contact) => contact.npcId === npc.id || contact.id === toPhoneContactId(npc.id)))
        .map((npc) => ({
          id: toPhoneContactId(npc.id),
          npcId: npc.id,
          name: npc.姓名,
          avatar: 读取NPC头像(npc, '手机'),
          organization: npc.阵营ID,
          relationLabel: npc.阶位 === 'companion' ? '伙伴' : '已认识',
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
  const phoneApiConfig = buildPhoneApiConfig(gameSettings, apiSettings);
  const phoneEnabled = gameSettings.手机系统.enabled;

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

  const ensurePrivateChat = (contact: 手机联系人): 手机会话 => {
    const existing = phone.chats.find((chat) => chat.type === 'private' && chat.participantIds.includes(contact.id));
    if (existing) {
      setActiveChatId(existing.id);
      setActiveApp('messages');
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

  const handleCreateGroupChat = () => {
    const selectedContacts = contacts.filter((contact) => groupMemberIds.includes(contact.id) && contact.available !== false);
    if (selectedContacts.length < 2) {
      setPhoneError('创建群聊至少需要选择 2 位可联系对象。');
      return;
    }
    const title = groupNameDraft.trim() || `${selectedContacts.slice(0, 2).map((item) => item.name).join('、')}的小队频道`;
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
      if (!byNpc || byNpc.关系 === 'enemy') return undefined;
      return {
        id: `npc_${byNpc.id}`,
        npcId: byNpc.id,
        name: byNpc.姓名,
        avatar: 读取NPC头像(byNpc, '手机'),
        organization: byNpc.阵营ID,
        relationLabel: byNpc.阶位 === 'companion' ? '伙伴' : '路人',
        available: true,
        lastActiveTurn: byNpc.最近回合,
      };
    };
    return contents.map((rawContent) => {
      const groupMatch = chat.type === 'group' ? rawContent.match(/^([^：:]{1,18})[：:]\s*(.+)$/) : null;
      const speakerName = groupMatch?.[1]?.trim();
      const content = groupMatch?.[2]?.trim() || rawContent;
      const speaker = resolveGroupSpeaker(speakerName);
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

  const commitPhoneMemory = async (summary: string, contact?: 手机联系人) => {
    const trimmed = summary.trim();
    if (!trimmed) return;
    const withImmediate = addImmediateMemory(memory, `【手机】${trimmed}`, turnCount);
    const compression = await autoCompressMemorySystemWithArchivesAsync(
      withImmediate,
      turnCount,
      gameSettings.记忆系统,
      mainConfig ?? apiSettings.configs[0] ?? { id: '', name: '', provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '', createdAt: 0, updatedAt: 0 },
    );
    onMemoryChange(compression.memory);
    if (compression.archives.length) {
      onYitingChange((prevYiting) => ({
        ...prevYiting,
        回忆档案: [...prevYiting.回忆档案, ...compression.archives],
      }));
    }
    if (contact?.npcId) {
      onNpcRecordsChange((prev) =>
        prev.map((npc) => {
          if (npc.id !== contact.npcId) return npc;
          const existingEntries = npc.同行记忆 ?? [];
          const compressedTexts = compressNpcMemories(
            [...提取NPC同行记忆文本列表(npc), trimmed],
            gameSettings.记忆系统.NPC记忆压缩阈值,
            gameSettings.记忆系统.NPC记忆压缩提示词,
          );
          const nextMemories: NPC同行记忆条目[] = compressedTexts.map((text, index) => {
            const existing = existingEntries.find((entry) => entry.摘要 === text);
            if (existing) return existing;
            return {
              id: `npc_mem_phone_${turnCount}_${index}_${Math.random().toString(36).slice(2, 6)}`,
              回合: turnCount,
              摘要: text,
              来源: '手机',
              关联NPCID: [npc.id],
            };
          });
          return {
            ...npc,
            同行记忆: nextMemories,
            最近回合: turnCount,
          };
        }),
      );
    }
  };

  const handleSelectChat = (chatId: string) => {
    setActiveChatId(chatId);
    markChatRead(chatId);
  };

  const handleStartChat = (contact: 手机联系人) => {
    setActiveContactId(contact.id);
    ensurePrivateChat(contact);
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
        memory,
        yiting,
        npcRecords,
        news,
        turnCount,
        chat: chatAfterPlayer,
        contact,
        userText: text,
      }, phoneApiConfig.retryCount ?? 2);
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
      if (flushedSummary) {
        await commitPhoneMemory(flushedSummary, contact);
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
    const npc = normalizedNpcRecords.find((item) => ids.includes(item.id));
    if (npc) {
      const hiddenEnemy = npc.关系 === 'enemy';
      return {
        id: `npc_${npc.id}`,
        npcId: npc.id,
        name: npc.姓名,
        avatar: 读取NPC头像(npc, '手机'),
        organization: npc.阵营ID,
        relationLabel: hiddenEnemy ? '敌对' : npc.阶位 === 'companion' ? '伙伴' : '路人',
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
    const existingGroup = seed.targetType === 'group'
      ? findExistingGroupChat(groupParticipantIds, seed.title || '群聊')
      : undefined;
    const chat = seed.targetType === 'group'
      ? existingGroup ?? 创建手机会话({
          type: 'group',
          title: seed.title || '群聊',
          participantIds: groupParticipantIds,
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
    }

    try {
      const reply = await generatePhoneReply(phoneApiConfig, {
        traveler,
        world,
        memory,
        yiting,
        npcRecords,
        news,
        turnCount,
        chat,
        contact: seed.targetType === 'private' ? contact : undefined,
        seed,
      }, phoneApiConfig.retryCount ?? 2);
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
      if (flushedSummary) {
        await commitPhoneMemory(flushedSummary, seed.targetType === 'private' ? contact : undefined);
      }
      setActiveChatId(chat.id);
      setActiveApp('messages');
    } catch (err) {
      setPhoneError(`生成来信失败：${(err as Error).message}`);
    } finally {
      setGeneratingSeedId('');
    }
  };

  const activeAppTitle = activeApp === 'messages' ? '短讯' : activeApp === 'contacts' ? '通讯录' : '星际和平周报';
  const activeAppSubtitle =
    activeApp === 'messages' ? 'MESSAGE APP' : activeApp === 'contacts' ? 'CONTACTS' : 'NEWS FEED';
  const homeWallpaper = phone.wallpapers?.home;
  const chatWallpaper = activeApp === 'messages' ? phone.wallpapers?.chat : undefined;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-start bg-black/60 p-3 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex h-full w-full flex-col items-start gap-3 overflow-auto xl:flex-row xl:items-start">
        <section
          className="relative flex h-[min(84vh,760px)] w-full max-w-[340px] flex-shrink-0 overflow-hidden p-3 xl:w-[340px]"
          style={{
            background:
              'radial-gradient(circle at 50% 0%, rgba(245, 217, 122, 0.11), transparent 34%), linear-gradient(180deg, rgba(24, 22, 23, 0.99), rgba(5, 5, 7, 0.995))',
            boxShadow:
              'inset 0 0 0 1px rgba(245, 217, 122, 0.46), inset 0 0 0 8px rgba(0,0,0,0.28), 0 28px 74px rgba(0, 0, 0, 0.72)',
            clipPath: phoneShellClip,
          }}
        >
          <div
            className="pointer-events-none absolute left-1/2 top-2 h-1.5 w-24 -translate-x-1/2"
            style={{
              background: 'rgba(245, 217, 122, 0.22)',
              borderRadius: 999,
              boxShadow: '0 0 10px rgba(245,217,122,0.18)',
            }}
          />
          <div
            className="flex min-h-0 flex-1 overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(12, 11, 13, 0.98), rgba(4, 5, 7, 0.99))',
              boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.32)',
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
            className="relative flex h-[min(84vh,760px)] w-full min-w-0 flex-none overflow-hidden p-3 xl:w-[980px]"
            style={{
              background:
                'radial-gradient(circle at 50% 0%, rgba(245, 217, 122, 0.08), transparent 28%), linear-gradient(180deg, rgba(18, 16, 18, 0.98), rgba(5, 5, 7, 0.99))',
              boxShadow:
                'inset 0 0 0 1px rgba(245, 217, 122, 0.26), inset 0 0 0 8px rgba(0,0,0,0.24), 0 28px 74px rgba(0, 0, 0, 0.52)',
              clipPath: phoneShellClip,
            }}
          >
            <div
              className="flex min-h-0 w-full flex-col overflow-hidden"
              style={{
                background: chatWallpaper
                  ? `linear-gradient(180deg, rgba(12, 11, 13, 0.82), rgba(4, 5, 7, 0.92)), url(${chatWallpaper}) center/cover`
                  : 'linear-gradient(180deg, rgba(12, 11, 13, 0.985), rgba(4, 5, 7, 0.995))',
                boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.28)',
                clipPath: cardClip,
              }}
            >
              <header className="flex items-center justify-between gap-4 border-b px-5 py-4" style={{ borderColor: 'rgba(245, 217, 122, 0.18)' }}>
                <div className="min-w-0">
                  <div className="truncate font-serif text-base font-bold tracking-[0.2em]" style={{ color: '#f5d97a' }}>
                    {activeAppTitle}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.18em]" style={{ color: 'rgba(200, 188, 158, 0.64)' }}>
                    {activeAppSubtitle}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveApp(null)}
                  className="px-2 py-1 text-xs font-serif tracking-[0.16em]"
                  style={{
                    color: 'rgba(245, 217, 122, 0.85)',
                    background: 'rgba(245, 217, 122, 0.05)',
                    boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.2)',
                    clipPath: smallClip,
                  }}
                >
                  回到桌面
                </button>
              </header>

              {activeApp === 'messages' ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
                  <aside
                    className="flex min-h-0 w-full flex-shrink-0 flex-col xl:w-[292px]"
                    style={{
                      borderRight: '1px solid rgba(245, 217, 122, 0.22)',
                      background: 'rgba(8, 7, 9, 0.54)',
                    }}
                  >
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(245, 217, 122, 0.2)' }}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-serif text-sm font-bold tracking-[0.18em]" style={{ color: '#f5d97a' }}>
                            短讯列表
                          </div>
                          <div className="mt-1 text-[11px] tracking-[0.16em]" style={{ color: 'rgba(200, 188, 158, 0.64)' }}>
                            待处理来信与会话
                          </div>
                        </div>
                        <span className="text-[10px]" style={{ color: 'rgba(200, 188, 158, 0.65)' }}>
                          {phone.chats.length}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowCreateGroup((v) => !v)}
                        className="mt-3 w-full py-2 text-xs font-serif tracking-[0.18em] transition-all hover:opacity-90"
                        style={{
                          color: showCreateGroup ? '#1a1325' : 'rgba(245, 217, 122, 0.88)',
                          background: showCreateGroup
                            ? 'linear-gradient(135deg, rgba(245,217,122,0.94), rgba(212,177,90,0.92))'
                            : 'rgba(245, 217, 122, 0.055)',
                          boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.28)',
                          clipPath: smallClip,
                        }}
                      >
                        创建群聊
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto px-3 py-3">
                      <div className="space-y-3">
                        {showCreateGroup && (
                          <section
                            className="space-y-2"
                            style={{
                              background: 'rgba(245, 217, 122, 0.055)',
                              boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
                              clipPath: smallClip,
                              padding: '10px',
                            }}
                          >
                            <div className="font-serif text-xs tracking-[0.18em]" style={{ color: '#f5d97a' }}>
                              新建群聊
                            </div>
                            <input
                              value={groupNameDraft}
                              onChange={(e) => setGroupNameDraft(e.target.value)}
                              placeholder="群聊名称"
                              className="kaituo-input w-full px-2.5 py-2 text-xs"
                              style={{ clipPath: smallClip }}
                            />
                            <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
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
                                        background: checked ? 'rgba(245, 217, 122, 0.12)' : 'rgba(8, 7, 9, 0.34)',
                                        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
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
                                      <span className="min-w-0 truncate text-xs" style={{ color: '#fff4d4' }}>
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
                                color: '#1a1325',
                                background: 'linear-gradient(135deg, rgba(245,217,122,0.95), rgba(212,177,90,0.95))',
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
                            background: 'rgba(245, 217, 122, 0.04)',
                            boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
                            clipPath: smallClip,
                            padding: '10px',
                          }}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-serif text-xs tracking-[0.18em]" style={{ color: '#f5d97a' }}>
                              待处理来信
                            </span>
                            <span className="text-[10px]" style={{ color: 'rgba(200, 188, 158, 0.65)' }}>
                              {pendingSeeds.length}
                            </span>
                          </div>
                        {pendingSeeds.length === 0 ? (
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
                          )}
                        </section>

                        <section className="space-y-2">
                          {phone.chats.length === 0 ? (
                            <EmptyText text="暂无会话。认识角色、建立群聊后，会话会出现在这里。" />
                          ) : (
                            phone.chats.map((chat) => (
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

                  <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                    {activeChat ? (
                      <ChatSurface
                        chat={activeChat}
                        traveler={traveler}
                        contact={resolveContactForChat(activeChat)}
                        onSend={handleSendPhoneMessage}
                        draft={draft}
                        onDraftChange={setDraft}
                        loading={sendingChatId === activeChat.id}
                        error={phoneError}
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
                    className="flex min-h-0 w-full flex-shrink-0 flex-col xl:w-[280px]"
                    style={{
                      borderRight: '1px solid rgba(245, 217, 122, 0.22)',
                      background: 'rgba(8, 7, 9, 0.54)',
                    }}
                  >
                    <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(245, 217, 122, 0.2)' }}>
                      <div className="truncate font-serif text-sm font-bold tracking-[0.18em]" style={{ color: '#f5d97a' }}>
                        通讯录
                      </div>
                      <div className="mt-1 text-[11px] tracking-[0.16em]" style={{ color: 'rgba(200, 188, 158, 0.64)' }}>
                        已解锁联系人
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowAddContact((v) => !v)}
                        className="mt-3 flex w-full items-center justify-between px-3 py-2 text-left transition-all hover:opacity-90"
                        style={{
                          color: '#f5d97a',
                          background: showAddContact ? 'rgba(245, 217, 122, 0.14)' : 'rgba(245, 217, 122, 0.05)',
                          boxShadow: showAddContact
                            ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.48)'
                            : 'inset 0 0 0 1px rgba(245, 217, 122, 0.22)',
                          clipPath: smallClip,
                        }}
                      >
                        <span className="font-serif text-[12px] font-bold tracking-[0.18em]">添加好友</span>
                        <span className="text-base">{showAddContact ? '−' : '+'}</span>
                      </button>
                    </div>
                    <div className="flex-1 overflow-y-auto px-3 py-3">
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
                              }}
                              className="w-full px-3 py-2 text-left transition-all"
                              style={{
                                background:
                                  activeContact?.id === contact.id ? 'rgba(245, 217, 122, 0.12)' : 'rgba(245, 217, 122, 0.04)',
                                boxShadow:
                                  activeContact?.id === contact.id
                                    ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)'
                                    : 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
                                clipPath: smallClip,
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <Avatar name={contact.name} src={contact.avatar} />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-semibold" style={{ color: '#fff4d4' }}>
                                    {contact.name}
                                  </div>
                                  <div className="truncate text-[11px]" style={{ color: 'rgba(200, 188, 158, 0.68)' }}>
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

                  <main className="flex min-h-0 min-w-0 flex-1 flex-col">
                    <ContactSurface
                      contact={activeContact}
                      onOpenChat={() => {
                        if (activeContact) handleStartChat(activeContact);
                      }}
                    />
                  </main>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 overflow-hidden">
                  <NewsSurface news={news} />
                </div>
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
          ? `linear-gradient(180deg, rgba(4,5,7,0.42), rgba(4,5,7,0.82)), url(${wallpaper}) center/cover`
          : undefined,
      }}
    >
      <div
        className="pointer-events-none absolute left-3 right-14 top-3 flex items-center justify-between gap-2 text-[9px] font-mono tracking-[0.14em]"
        style={{ color: 'rgba(220, 208, 178, 0.72)' }}
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
            color: 'rgba(245, 217, 122, 0.85)',
            background: 'rgba(245, 217, 122, 0.05)',
            boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
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
        <AppIcon title="相册" subtitle="未启用" glyph="◌" disabled />
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
          ? 'rgba(245, 217, 122, 0.025)'
          : active
            ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.22), rgba(245, 217, 122, 0.08))'
            : 'linear-gradient(135deg, rgba(245, 217, 122, 0.12), rgba(245, 217, 122, 0.035))',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.36), 0 0 0 1px rgba(245, 217, 122, 0.12), 0 16px 28px rgba(0,0,0,0.24)'
          : 'inset 0 0 0 1px rgba(245, 217, 122, 0.2), 0 12px 24px rgba(0,0,0,0.24)',
        clipPath: cardClip,
      }}
    >
      {badge > 0 && (
        <span
          className="absolute right-2.5 top-2.5 rounded-full px-1.5 text-[10px] font-bold"
          style={{ color: '#fff4f4', background: 'rgba(220, 80, 80, 0.65)' }}
        >
          {badge}
        </span>
      )}
      <span
        className="flex h-10 w-10 items-center justify-center font-serif text-xl"
        style={{
          color: disabled ? 'rgba(160, 148, 120, 0.7)' : '#f5d97a',
          background: 'rgba(8, 7, 9, 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.22)',
          clipPath: smallClip,
        }}
      >
        {glyph}
      </span>
      <span className="font-serif text-[12px] font-semibold tracking-[0.16em]" style={{ color: disabled ? 'rgba(160, 148, 120, 0.72)' : '#fff4d4' }}>
        {title}
      </span>
      <span className="text-[10px]" style={{ color: 'rgba(200, 188, 158, 0.62)' }}>
        {subtitle}
      </span>
    </button>
  );
}

function ContactSurface({ contact, onOpenChat }: { contact?: 手机联系人; onOpenChat: () => void }) {
  if (!contact) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center">
        <EmptyText text="暂无联系人。遇见 NPC 后可在这里查看名片、关系与对话入口。" />
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(245, 217, 122, 0.2)' }}>
        <div className="flex items-center gap-3">
          <Avatar name={contact.name} src={contact.avatar} />
          <div className="min-w-0">
            <div className="truncate font-serif text-lg font-bold tracking-[0.18em]" style={{ color: '#f5d97a' }}>
              {contact.name}
            </div>
            <div className="mt-1 text-[11px] tracking-[0.18em]" style={{ color: 'rgba(200, 188, 158, 0.68)' }}>
              {contact.relationLabel ?? '联系人'} {contact.organization ? `· ${contact.organization}` : ''}
            </div>
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold"
          style={{
            background: contact.available ? 'rgba(90, 180, 120, 0.18)' : 'rgba(220, 80, 80, 0.2)',
            color: contact.available ? '#dff7e8' : '#ffd6d6',
          }}
        >
          {contact.available ? '在场' : '离线'}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
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
            color: '#1a1325',
            background: 'linear-gradient(135deg, rgba(245,217,122,0.95), rgba(212,177,90,0.95))',
            boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.45), 0 0 14px rgba(245,217,122,0.16)',
            clipPath: smallClip,
          }}
        >
          发送短讯
        </button>
        <div className="mt-4 rounded-none px-4 py-4" style={{ background: 'rgba(245, 217, 122, 0.04)', boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)', clipPath: smallClip }}>
          <div className="text-[11px] tracking-[0.18em]" style={{ color: 'rgba(200, 188, 158, 0.68)' }}>
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
        background: 'rgba(245, 217, 122, 0.035)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="mb-2 font-serif text-[11px] font-bold tracking-[0.2em]" style={{ color: '#f5d97a' }}>
        可添加对象
      </div>
      {candidates.length === 0 ? (
        <div className="py-3 text-center text-[11px] leading-relaxed" style={{ color: 'rgba(200,188,158,0.62)' }}>
          当前没有可添加的已认识角色。
        </div>
      ) : (
        <div className="space-y-2">
          {candidates.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => onAdd(contact)}
              className="flex w-full items-center gap-2 px-2 py-2 text-left transition-all hover:bg-[rgba(245,217,122,0.08)]"
              style={{
                boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
                clipPath: smallClip,
              }}
            >
              <Avatar name={contact.name} src={contact.avatar} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold" style={{ color: '#fff4d4' }}>
                  {contact.name}
                </div>
                <div className="truncate text-[10px]" style={{ color: 'rgba(200,188,158,0.65)' }}>
                  {contact.relationLabel ?? '已认识'} {contact.organization ? `· ${contact.organization}` : ''}
                </div>
              </div>
              <span className="font-serif text-lg" style={{ color: '#f5d97a' }}>+</span>
            </button>
          ))}
        </div>
      )}
    </div>
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
                  background: item.重要 ? 'rgba(245, 217, 122, 0.08)' : 'rgba(245, 217, 122, 0.04)',
                  boxShadow: item.重要
                    ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.26)'
                    : 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="truncate font-serif text-sm font-bold tracking-[0.16em]" style={{ color: '#fff4d4' }}>
                    {item.标题}
                  </h4>
                  <span className="flex-shrink-0 text-[10px] tracking-[0.14em]" style={{ color: 'rgba(245,217,122,0.78)' }}>
                    {item.状态}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.72)' }}>
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
      <div className="font-serif text-lg font-bold tracking-[0.24em]" style={{ color: '#f5d97a' }}>
        {title}
      </div>
      <div className="mt-3 max-w-md text-sm leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.68)' }}>
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
        background: 'rgba(245, 217, 122, 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] tracking-[0.16em]" style={{ color: 'rgba(200, 188, 158, 0.66)' }}>
        {label}
      </div>
      <div className="mt-1 text-sm font-semibold" style={{ color: '#fff4d4' }}>
        {value}
      </div>
    </div>
  );
}

function ChatSurface({
  chat,
  traveler,
  contact,
  draft,
  loading,
  error,
  onDraftChange,
  onSend,
}: {
  chat: 手机会话;
  traveler: 角色数据结构;
  contact?: 手机联系人;
  draft: string;
  loading: boolean;
  error: string;
  onDraftChange: (text: string) => void;
  onSend: () => void;
}) {
  return (
    <>
      <header className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid rgba(245, 217, 122, 0.2)' }}>
        <div>
          <div className="font-serif text-lg font-bold tracking-[0.18em]" style={{ color: '#f5d97a' }}>
            {chat.title}
          </div>
          <div className="mt-1 text-[11px] tracking-[0.2em]" style={{ color: 'rgba(200, 188, 158, 0.68)' }}>
            {chat.type === 'group' ? 'GROUP CHANNEL' : chat.type === 'system' ? 'SYSTEM NOTICE' : 'PRIVATE LINK'}
          </div>
          <div className="mt-1 text-[11px]" style={{ color: 'rgba(160, 148, 120, 0.72)' }}>
            本地记忆 {chat.localArchive?.entries.length ?? 0}/{chat.localArchive?.threshold ?? 0}
            {chat.localArchive?.compressedSummaries.length ? ` · 已压缩 ${chat.localArchive.compressedSummaries.length} 次` : ''}
          </div>
        </div>
        {chat.unread > 0 && (
          <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: 'rgba(220, 80, 80, 0.3)', color: '#ffd6d6' }}>
            {chat.unread}
          </span>
        )}
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {chat.messages.length === 0 ? (
          <EmptyText text="这里还没有消息。输入短讯后，对方会通过手机系统 API 回复，并留下记忆摘要。" />
        ) : (
          <div className="space-y-3">
            {chat.messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-end gap-2 ${msg.role === 'player' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role !== 'player' && (
                  <Avatar
                    name={msg.senderName}
                    src={msg.avatar || (contact && msg.senderId === contact.id ? contact.avatar : undefined)}
                  />
                )}
                <div
                  className="max-w-[76%] px-3 py-2 text-sm leading-relaxed"
                  style={{
                    color: msg.role === 'player' ? '#1a1325' : 'rgba(245, 235, 205, 0.95)',
                    background:
                      msg.role === 'player'
                        ? 'linear-gradient(135deg, rgba(245,217,122,0.95), rgba(212,177,90,0.95))'
                        : 'rgba(245, 217, 122, 0.08)',
                    boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.25)',
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
            ))}
          </div>
        )}
      </div>
      <footer className="px-6 py-4" style={{ borderTop: '1px solid rgba(245, 217, 122, 0.18)' }}>
        {error && (
          <div
            className="mb-2 px-3 py-2 text-xs"
            style={{
              color: 'rgba(255, 190, 170, 0.92)',
              background: 'rgba(220, 80, 80, 0.08)',
              boxShadow: 'inset 0 0 0 1px rgba(220, 80, 80, 0.22)',
              clipPath: smallClip,
            }}
          >
            {error}
          </div>
        )}
        <div
          className="flex items-end gap-2 px-3 py-2"
          style={{
            color: 'rgba(200, 188, 158, 0.65)',
            background: 'rgba(8, 7, 9, 0.55)',
            boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.14)',
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
            className="min-h-[44px] flex-1 resize-none bg-transparent text-sm leading-relaxed outline-none"
            style={{ color: '#fff4d4' }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={loading || !draft.trim()}
            className="px-4 py-2 text-xs font-serif tracking-[0.2em] transition-all disabled:opacity-45"
            style={{
              color: '#1a1325',
              background: 'linear-gradient(135deg, rgba(245,217,122,0.95), rgba(212,177,90,0.95))',
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
        background: active ? 'rgba(245, 217, 122, 0.12)' : 'rgba(245, 217, 122, 0.04)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)' : 'inset 0 0 0 1px rgba(245, 217, 122, 0.12)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center gap-2">
        <Avatar name={chat.title} src={avatar} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-sm font-semibold" style={{ color: active ? '#f5d97a' : '#fff4d4' }}>
              {chat.title}
            </span>
            {chat.unread > 0 && (
              <span className="rounded-full px-1.5 text-[10px]" style={{ background: 'rgba(220, 80, 80, 0.4)', color: '#fff' }}>
                {chat.unread}
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(200, 188, 158, 0.62)' }}>
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
        boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-sm font-semibold" style={{ color: '#fff4d4' }}>
          {seed.title}
        </div>
        <span className="text-[10px]" style={{ color: seed.priority === 'urgent' ? '#ffd6d6' : 'rgba(245, 217, 122, 0.75)' }}>
          {seed.priority.toUpperCase()}
        </span>
      </div>
      <div className="mt-1 line-clamp-3 text-[11px] leading-relaxed" style={{ color: 'rgba(200, 188, 158, 0.7)' }}>
        {seed.context}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpen}
          disabled={loading || coolingDown}
          className="py-1 text-[11px] font-serif tracking-[0.18em] disabled:opacity-50"
          style={{
            color: '#1a1325',
            background: 'linear-gradient(135deg, rgba(245,217,122,0.95), rgba(212,177,90,0.95))',
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
            color: 'rgba(245, 217, 122, 0.85)',
            background: 'rgba(245, 217, 122, 0.04)',
            boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
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
        color: '#f5d97a',
        background: 'radial-gradient(circle at 35% 24%, rgba(245, 217, 122, 0.18), rgba(245, 217, 122, 0.04) 62%)',
        boxShadow: src
          ? '0 0 0 1px rgba(245, 217, 122, 0.54), 0 0 14px rgba(245, 217, 122, 0.12)'
          : '0 0 0 1px rgba(245, 217, 122, 0.32)',
      }}
    >
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : name[0] ?? '?'}
      <span
        className="pointer-events-none absolute inset-[5px] rounded-full"
        style={{ boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.14)' }}
      />
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return (
    <div className="px-4 py-8 text-center text-sm" style={{ color: 'rgba(200, 188, 158, 0.62)' }}>
      {text}
    </div>
  );
}
