import type { ExecutionFrame, PhoneCommand, SessionCommandEnvelope } from '@/src/kernel/contract';
import type { ExecutionContextProvider, PhoneReplyGenerator, SessionRepository } from '@/src/kernel/ports';
import { resolveCommandSettings } from './turn/turnExecutionState';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import type { NPC记录, NPC同行记忆条目 } from '@/models/npc';
import { 格式化NPC关系, 提取NPC同行记忆文本列表, 读取NPC头像 } from '@/models/npc';
import type { 手机会话, 手机会话本地摘要来源, 手机联系人, 手机消息, 手机系统, 主动来信种子 } from '@/models/phone';
import { 创建手机会话本地库, 计算手机未读, 归一化手机系统 } from '@/models/phone';
import { addImmediateMemory, autoCompressMemorySystemWithArchivesAsync, compressNpcMemoryLedger } from '@/src/kernel/workflows/memoryUtils';
import { executeSessionCommand, type StateReduction } from './executeSessionCommand';
import type { Clock } from '@/src/kernel/ports/Clock';

export type PhoneCommandEnvelope = SessionCommandEnvelope & { readonly command: PhoneCommand };

type Dependencies = Readonly<{
  sessions: SessionRepository;
  context: ExecutionContextProvider;
  replies: PhoneReplyGenerator;
  signal: AbortSignal;
  clock: Clock;
}>;

export async function* executePhoneCommand(envelope: PhoneCommandEnvelope, dependencies: Dependencies): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, dependencies.sessions, (base) => reducePhoneCommand(envelope, base, dependencies));
}

async function reducePhoneCommand(envelope: PhoneCommandEnvelope, base: SessionSnapshot, dependencies: Dependencies): Promise<StateReduction> {
  const command = envelope.command;
  switch (command.type) {
    case 'phone.dismiss-seed': return mutatePhone(base, (phone) => ({ ...phone, messageSeeds: phone.messageSeeds.map((seed) => seed.id === command.seedId ? { ...seed, status: 'dismissed' as const } : seed) }));
    case 'phone.mark-read': return mutatePhone(base, (phone) => ({ ...phone, chats: phone.chats.map((chat) => chat.id === command.chatId ? { ...chat, unread: 0 } : chat) }));
    case 'phone.add-contact': return addContact(base, command.npcId, command.updatedAt);
    case 'phone.open-private-chat': return openPrivateChat(envelope.commandId, base, command.npcId, command.createdAt);
    case 'phone.create-group': return createGroup(envelope.commandId, base, command.npcIds, command.title, command.createdAt);
    case 'phone.rename-group': return mutateChat(base, command.chatId, (chat) => {
      const title = command.title.trim().slice(0, 24);
      if (chat.type !== 'group' || !title) throw new Error('群聊名称不能为空。');
      return { ...chat, title, updatedAt: command.updatedAt };
    });
    case 'phone.add-group-member': return addGroupMember(base, command.chatId, command.npcId, command.updatedAt);
    case 'phone.set-wallpaper': return mutatePhone(base, (phone) => ({ ...phone, wallpapers: { ...(phone.wallpapers ?? {}), [command.slot]: command.assetRef } }));
    case 'phone.send': return sendPhoneMessage(envelope.commandId, base, command, dependencies);
    case 'phone.generate-seed': return generateSeed(envelope.commandId, base, command, dependencies);
  }
}

function addContact(base: SessionSnapshot, npcId: string, now: number): StateReduction {
  const npc = requireContactableNpc(base, npcId);
  return mutatePhone(base, (phone) => phone.contacts.some((contact) => contact.npcId === npc.id)
    ? phone
    : { ...phone, contacts: [contactFromNpc(npc, now, 'manual'), ...phone.contacts] });
}

function openPrivateChat(commandId: string, base: SessionSnapshot, npcId: string, now: number): StateReduction {
  const npc = requireContactableNpc(base, npcId);
  return mutatePhone(base, (phone) => {
    const contact = phone.contacts.find((item) => item.npcId === npc.id) ?? contactFromNpc(npc, now, 'manual');
    const existing = phone.chats.find((chat) => chat.type === 'private' && chat.participantIds.some((id) => id === contact.id || id === npc.id));
    if (existing) return { ...phone, contacts: phone.contacts.some((item) => item.id === contact.id) ? phone.contacts : [contact, ...phone.contacts], chats: phone.chats.map((chat) => chat.id === existing.id ? { ...chat, unread: 0 } : chat) };
    const chat = createChat(`phone_chat_${commandId}`, 'private', contact.name, [contact.id], now);
    return { ...phone, contacts: [contact, ...phone.contacts.filter((item) => item.id !== contact.id)], chats: [chat, ...phone.chats] };
  });
}

function createGroup(commandId: string, base: SessionSnapshot, npcIds: readonly string[], titleInput: string, now: number): StateReduction {
  const unique = Array.from(new Set(npcIds));
  const npcs = unique.map((id) => requireContactableNpc(base, id));
  if (npcs.length < 2) return rejected('创建群聊至少需要 2 位可联系对象。');
  const title = titleInput.trim().slice(0, 24) || `${npcs.slice(0, 2).map((npc) => npc.姓名).join('、')}的小队频道`;
  return mutatePhone(base, (phone) => {
    const contacts = [...phone.contacts];
    for (const npc of npcs) if (!contacts.some((contact) => contact.npcId === npc.id)) contacts.unshift(contactFromNpc(npc, now, 'manual'));
    const participantIds = npcs.map((npc) => contacts.find((contact) => contact.npcId === npc.id)!.id);
    return { ...phone, contacts, chats: [createChat(`phone_chat_${commandId}`, 'group', title, participantIds, now), ...phone.chats] };
  });
}

function addGroupMember(base: SessionSnapshot, chatId: string, npcId: string, now: number): StateReduction {
  const npc = requireContactableNpc(base, npcId);
  return mutatePhone(base, (phone) => {
    const contact = phone.contacts.find((item) => item.npcId === npc.id) ?? contactFromNpc(npc, now, 'manual');
    return {
      ...phone,
      contacts: phone.contacts.some((item) => item.id === contact.id) ? phone.contacts : [contact, ...phone.contacts],
      chats: phone.chats.map((chat) => chat.id !== chatId ? chat : chat.type !== 'group' || chat.participantIds.includes(contact.id)
        ? chat
        : { ...chat, participantIds: [...chat.participantIds, contact.id], updatedAt: now }),
    };
  });
}

async function sendPhoneMessage(
  commandId: string,
  base: SessionSnapshot,
  command: Extract<PhoneCommand, { type: 'phone.send' }>,
  dependencies: Dependencies,
): Promise<StateReduction> {
  const text = command.text.trim();
  if (!text) return rejected('手机消息不能为空。');
  const story = base.state.story;
  const phone = 归一化手机系统(story.phone);
  const chat = phone.chats.find((candidate) => candidate.id === command.chatId);
  if (!chat) return rejected('手机会话不存在。');
  const contact = chat.type === 'private' ? resolvePrivateContact(phone, base, chat) : undefined;
  const playerMessage = createMessage(`${commandId}_player`, 'player', story.traveler.姓名 || '我', 'player', text, story.conversation.turnCount, command.createdAt);
  const chatWithPlayer = { ...chat, messages: [...chat.messages, playerMessage], unread: 0, updatedAt: command.createdAt };
  return completeReply(commandId, base, phone, chatWithPlayer, contact, undefined, text, dependencies);
}

async function generateSeed(
  commandId: string,
  base: SessionSnapshot,
  command: Extract<PhoneCommand, { type: 'phone.generate-seed' }>,
  dependencies: Dependencies,
): Promise<StateReduction> {
  const story = base.state.story;
  const phone = 归一化手机系统(story.phone);
  const seed = phone.messageSeeds.find((candidate) => candidate.id === command.seedId);
  if (!seed || seed.status !== 'pending') return rejected('主动来信种子不存在或已处理。');
  const overlay = await dependencies.context.captureDeviceOverlay();
  const settings = resolveCommandSettings(story, overlay);
  const cooldown = seed.targetType === 'group' ? settings.手机系统.groupCooldownTurns : settings.手机系统.contactCooldownTurns;
  const lastGenerated = phone.messageSeeds.filter((item) => item.id !== seed.id && item.status === 'generated' && item.targetType === seed.targetType && item.targetId === seed.targetId).reduce((latest, item) => Math.max(latest, item.turn || 0), 0);
  if (seed.priority !== 'urgent' && lastGenerated > 0 && story.conversation.turnCount - lastGenerated < Math.max(0, Math.trunc(cooldown || 0))) return rejected('该来信仍在冷却中。');

  let contact: 手机联系人 | undefined;
  let chat: 手机会话;
  if (seed.targetType === 'private') {
    const npcId = seed.relatedNpcIds.find((id) => story.characters.npcs.some((npc) => npc.id === id)) ?? seed.targetId.replace(/^npc_/, '');
    const npc = requireContactableNpc(base, npcId);
    contact = phone.contacts.find((item) => item.npcId === npc.id) ?? contactFromNpc(npc, command.createdAt, 'seed');
    chat = phone.chats.find((candidate) => candidate.type === 'private' && candidate.participantIds.some((id) => id === contact!.id || id === npc.id))
      ?? createChat(`phone_chat_${commandId}`, 'private', contact.name, [contact.id], command.createdAt);
  } else {
    const npcIds = seed.relatedNpcIds.map((id) => id.replace(/^npc_/, ''));
    const npcs = npcIds.map((id) => requireContactableNpc(base, id));
    if (npcs.length < 2) return rejected('群聊来信缺少至少两个已登记参与者。');
    const participantIds = npcs.map((npc) => phone.contacts.find((item) => item.npcId === npc.id)?.id ?? `npc_${npc.id}`);
    chat = phone.chats.find((candidate) => candidate.type === 'group' && (candidate.id === seed.targetId || sameMembers(candidate.participantIds, participantIds)))
      ?? createChat(`phone_chat_${commandId}`, 'group', seed.title.trim() || '临时频道', participantIds, command.createdAt);
  }
  return completeReply(commandId, base, phone, chat, contact, seed, undefined, dependencies, overlay);
}

async function completeReply(
  commandId: string,
  base: SessionSnapshot,
  phoneInput: 手机系统,
  chatInput: 手机会话,
  contact: 手机联系人 | undefined,
  seed: 主动来信种子 | undefined,
  userText: string | undefined,
  dependencies: Dependencies,
  capturedOverlay?: Awaited<ReturnType<ExecutionContextProvider['captureDeviceOverlay']>>,
): Promise<StateReduction> {
  const overlay = capturedOverlay ?? await dependencies.context.captureDeviceOverlay();
  const story = base.state.story;
  const settings = resolveCommandSettings(story, overlay);
  if (!settings.手机系统.enabled) return rejected('手机系统已在设置中关闭。');
  const contacts = buildContacts(phoneInput, story.characters.npcs);
  const reply = await dependencies.replies.generate(settings, {
    traveler: story.traveler,
    world: story.world,
    npcRecords: story.characters.npcs,
    news: story.news,
    turnCount: story.conversation.turnCount,
    chat: chatInput,
    contacts,
    contact,
    userText,
    seed,
    mainChatHistory: story.conversation.history,
    zhiku: story.content.zhikuRuntime,
  }, dependencies.signal);
  if (!reply.messages.length) return rejected('手机回复为空。');

  const now = dependencies.clock.now();
  const messages = createReplyMessages(commandId, chatInput, reply.messages, contact, contacts, story.characters.npcs, story.conversation.turnCount, seed?.id, now);
  const summary = (reply.summary ?? reply.messages.join(' / ')).trim();
  const archive = appendLocalSummary(chatInput, summary, seed ? (seed.targetType === 'group' ? 'group' : 'private') : chatInput.type === 'group' ? 'group' : 'private', reply.messages.length, seed?.id, story.conversation.turnCount, `${commandId}_summary`, now, settings.手机系统);
  const chat = { ...archive.chat, messages: [...archive.chat.messages, ...messages], unread: 0, updatedAt: now };
  const phone = recalc({
    ...phoneInput,
    contacts: contact && !phoneInput.contacts.some((item) => item.id === contact.id) ? [...phoneInput.contacts, contact] : phoneInput.contacts,
    chats: phoneInput.chats.some((candidate) => candidate.id === chat.id) ? phoneInput.chats.map((candidate) => candidate.id === chat.id ? chat : candidate) : [chat, ...phoneInput.chats],
    messageSeeds: seed ? phoneInput.messageSeeds.map((candidate) => candidate.id === seed.id ? { ...candidate, status: 'generated' as const } : candidate) : phoneInput.messageSeeds,
  });
  const memoryLine = seed ? `主动来信「${seed.title}」：${summary}` : `手机${chat.type === 'group' ? `群聊「${chat.title}」` : contact ? `私聊「${contact.name}」` : '私聊'}：${summary}`;
  const committed = await commitMemory(base, settings, memoryLine, archive.flushedSummary, contact, commandId, dependencies.signal);
  return {
    type: 'next',
    state: {
      story: {
        ...story,
        phone,
        memory: { system: committed.memory, yiting: committed.yiting },
        characters: { npcs: committed.npcs },
      },
    },
  };
}

async function commitMemory(base: SessionSnapshot, settings: import('@/models/settings').游戏设置, summary: string, flushed: string, contact: 手机联系人 | undefined, commandId: string, signal: AbortSignal) {
  const lines = [summary, flushed].map((line) => line.trim()).filter(Boolean).map((line) => line.startsWith('【手机】') ? line : `【手机】${line}`);
  const story = base.state.story;
  let memory = story.memory.system;
  let archives: import('@/models/yiting').回忆条目[] = [];
  for (const line of lines) {
    memory = addImmediateMemory(memory, line, story.conversation.turnCount);
    const compression = await autoCompressMemorySystemWithArchivesAsync(memory, story.conversation.turnCount, settings.记忆系统, signal);
    memory = compression.memory;
    archives = [...archives, ...compression.archives];
  }
  const yiting = archives.length ? { ...story.memory.yiting, 回忆档案: [...story.memory.yiting.回忆档案, ...archives] } : story.memory.yiting;
  let npcs = story.characters.npcs;
  if (contact?.npcId) {
    const raw = summary.replace(/^【手机】/, '').trim();
    npcs = npcs.map((npc) => {
      if (npc.id !== contact.npcId || 提取NPC同行记忆文本列表(npc).some((item) => item.includes(raw))) return npc;
      const nextEntry: NPC同行记忆条目 = { id: `npc_mem_phone_${commandId}`, 回合: story.conversation.turnCount, 摘要: raw, 来源: '手机', 关联NPCID: [npc.id] };
      const compressed = compressNpcMemoryLedger({ npcId: npc.id, entries: [...(npc.同行记忆 ?? []), nextEntry], summaries: npc.总结记忆 ?? [], threshold: settings.记忆系统.NPC记忆压缩阈值, prompt: settings.记忆系统.NPC记忆压缩提示词, turn: story.conversation.turnCount, source: '手机' });
      return { ...npc, 同行记忆: compressed.memories, 总结记忆: compressed.summaries, 最近互动: raw, 共同经历: [...new Set([...(npc.共同经历 ?? []), raw])].slice(-8), 对玩家长期印象: npc.对玩家长期印象 || '与玩家保持手机联系，已形成可承接的私下互动。', 最近回合: story.conversation.turnCount };
    });
  }
  return { memory, yiting, npcs };
}

function createReplyMessages(commandId: string, chat: 手机会话, contents: readonly string[], contact: 手机联系人 | undefined, contacts: readonly 手机联系人[], npcs: readonly NPC记录[], turn: number, seedId: string | undefined, now: number): 手机消息[] {
  return contents.map((raw, index) => {
    const groupMatch = chat.type === 'group' ? raw.match(/^([^：:]{1,18})[：:]\s*(.+)$/) : null;
    if (chat.type === 'group' && (!groupMatch?.[1]?.trim() || !groupMatch[2]?.trim())) throw new Error(`群聊回复缺少“姓名：内容”格式：${raw}`);
    const speakerName = groupMatch?.[1]?.trim();
    const speaker = chat.type === 'group' ? contacts.find((item) => item.name === speakerName || item.name.includes(speakerName!) || speakerName!.includes(item.name)) ?? contactFromNpc(npcs.find((npc) => npc.姓名 === speakerName || npc.姓名.includes(speakerName!) || speakerName!.includes(npc.姓名)) ?? missingNpc(speakerName!), now, 'system') : contact;
    if (chat.type === 'private' && !speaker) throw new Error('私聊缺少联系人身份。');
    return createMessage(`${commandId}_reply_${index}`, speaker?.id ?? chat.id, speaker?.name ?? chat.title, chat.type === 'system' ? 'system' : 'contact', chat.type === 'group' ? groupMatch![2].trim() : raw.trim(), turn, now + index, seedId, speaker?.avatar);
  });
}

function appendLocalSummary(chat: 手机会话, summary: string, source: 手机会话本地摘要来源, messageCount: number, seedId: string | undefined, turn: number, id: string, now: number, settings: import('@/models/settings').手机系统设置) {
  const defaults = 创建手机会话本地库(chat.type);
  const threshold = chat.type === 'group' ? settings.groupArchiveThreshold : chat.type === 'private' ? settings.privateArchiveThreshold : defaults.threshold;
  const archive = { ...defaults, ...(chat.localArchive ?? {}), threshold };
  const entry = { id, turn, summary, source, messageCount, createdAt: now, sourceSeedId: seedId };
  const entries = [...archive.entries, entry];
  const flush = entries.length >= threshold;
  const flushedSummary = flush ? entries.map((item) => item.summary).join('；') : '';
  return { chat: { ...chat, localArchive: { ...archive, entries: flush ? [] : entries, compressedSummaries: flush ? [...archive.compressedSummaries, flushedSummary] : archive.compressedSummaries, lastCompressedTurn: flush ? turn : archive.lastCompressedTurn } }, flushedSummary };
}

function createChat(id: string, type: 手机会话['type'], title: string, participantIds: string[], now: number): 手机会话 {
  return { id, type, title, participantIds, messages: [], localArchive: 创建手机会话本地库(type), unread: 0, updatedAt: now };
}

function createMessage(id: string, senderId: string, senderName: string, role: 手机消息['role'], content: string, turn: number, now: number, sourceSeedId?: string, avatar?: string): 手机消息 {
  return { id: `phone_msg_${id}`, senderId, senderName, role, content, turn, timestamp: now, sourceSeedId, avatar };
}

function contactFromNpc(npc: NPC记录, now: number, source: NonNullable<手机联系人['unlockSource']>): 手机联系人 {
  return { id: `npc_${npc.id}`, npcId: npc.id, name: npc.姓名, avatar: 读取NPC头像(npc, '手机'), relationLabel: 格式化NPC关系(npc.好感度, Boolean(npc.亲密关系)), available: true, status: 'available', unlockSource: source, lastActiveTurn: npc.最近回合 ?? now };
}

function buildContacts(phone: 手机系统, npcs: readonly NPC记录[]): 手机联系人[] {
  const contacts = [...phone.contacts];
  for (const npc of npcs) if (npc.关系 !== 'enemy' && !contacts.some((contact) => contact.npcId === npc.id)) contacts.push(contactFromNpc(npc, npc.最近回合 ?? 0, 'system'));
  return contacts;
}

function resolvePrivateContact(phone: 手机系统, base: SessionSnapshot, chat: 手机会话): 手机联系人 {
  const id = chat.participantIds[0];
  const contact = phone.contacts.find((item) => item.id === id || item.npcId === id);
  if (contact) return contact;
  return contactFromNpc(requireContactableNpc(base, id.replace(/^npc_/, '')), base.state.story.conversation.turnCount, 'system');
}

function requireContactableNpc(base: SessionSnapshot, npcId: string): NPC记录 {
  const normalized = npcId.replace(/^npc_/, '');
  const npc = base.state.story.characters.npcs.find((candidate) => candidate.id === normalized);
  if (!npc || npc.关系 === 'enemy') throw new Error(`手机联系人不存在或不可联系：${npcId}`);
  return npc;
}

function missingNpc(name: string): NPC记录 {
  throw new Error(`群聊回复无法解析发言人：${name}`);
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  const a = [...left].sort(); const b = [...right].sort();
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function mutateChat(base: SessionSnapshot, chatId: string, update: (chat: 手机会话) => 手机会话): StateReduction {
  const phone = 归一化手机系统(base.state.story.phone);
  if (!phone.chats.some((chat) => chat.id === chatId)) return rejected('手机会话不存在。');
  return replacePhone(base, recalc({ ...phone, chats: phone.chats.map((chat) => chat.id === chatId ? update(chat) : chat) }));
}

function mutatePhone(base: SessionSnapshot, update: (phone: 手机系统) => 手机系统): StateReduction {
  return replacePhone(base, recalc(update(归一化手机系统(base.state.story.phone))));
}

function recalc(phone: 手机系统): 手机系统 { return { ...phone, unreadTotal: 计算手机未读(phone) }; }
function replacePhone(base: SessionSnapshot, phone: 手机系统): StateReduction { return { type: 'next', state: { story: { ...base.state.story, phone } } }; }
function rejected(message: string): StateReduction { return { type: 'rejected', error: { code: 'no_changes', message } }; }
