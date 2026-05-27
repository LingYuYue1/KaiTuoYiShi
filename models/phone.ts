export type 手机会话类型 = 'private' | 'group' | 'system';
export type 手机消息角色 = 'player' | 'contact' | 'system';
export type 主动来信来源 = 'main_story' | 'news' | 'memory' | 'plot' | 'system';
export type 主动来信类型 =
  | 'injury'
  | 'victory'
  | 'defeat'
  | 'location_change'
  | 'important_item'
  | 'relationship'
  | 'news'
  | 'quest'
  | 'time'
  | 'custom';
export type 主动来信优先级 = 'low' | 'normal' | 'high' | 'urgent';
export type 主动来信状态 = 'pending' | 'generated' | 'dismissed' | 'expired';
export type 手机联系人状态 = 'available' | 'known_locked' | 'story_locked' | 'unavailable' | 'hidden';
export type 手机会话本地摘要来源 = 'private' | 'group' | 'system';

export interface 手机会话本地摘要条目 {
  id: string;
  turn: number;
  summary: string;
  source: 手机会话本地摘要来源;
  messageCount: number;
  createdAt: number;
  sourceSeedId?: string;
}

export interface 手机会话本地库 {
  threshold: number;
  entries: 手机会话本地摘要条目[];
  compressedSummaries: string[];
  lastCompressedTurn?: number;
}

export interface 手机联系人 {
  id: string;
  npcId?: string;
  name: string;
  avatar?: string;
  organization?: string;
  relationLabel?: string;
  available: boolean;
  status?: 手机联系人状态;
  lastActiveTurn?: number;
  unlockSource?: 'story' | 'seed' | 'manual' | 'system';
}

export interface 手机消息 {
  id: string;
  senderId: string;
  senderName: string;
  role: 手机消息角色;
  avatar?: string;
  content: string;
  turn: number;
  timestamp: number;
  sourceSeedId?: string;
}

export interface 手机会话 {
  id: string;
  type: 手机会话类型;
  title: string;
  participantIds: string[];
  messages: 手机消息[];
  localArchive?: 手机会话本地库;
  unread: number;
  pinned?: boolean;
  updatedAt: number;
}

export interface 主动来信种子 {
  id: string;
  turn: number;
  source: 主动来信来源;
  triggerType: 主动来信类型;
  priority: 主动来信优先级;
  targetType: 'private' | 'group';
  targetId: string;
  title: string;
  context: string;
  relatedNpcIds: string[];
  expiresAfterTurns?: number;
  status: 主动来信状态;
}

export interface 手机系统 {
  contacts: 手机联系人[];
  chats: 手机会话[];
  messageSeeds: 主动来信种子[];
  unreadTotal: number;
  wallpapers?: {
    home?: string;
    chat?: string;
  };
}

let phoneMessageCounter = 0;
let phoneChatCounter = 0;

export function 创建手机消息(input: {
  senderId: string;
  senderName: string;
  role: 手机消息角色;
  avatar?: string;
  content: string;
  turn: number;
  sourceSeedId?: string;
}): 手机消息 {
  return {
    id: `phone_msg_${Date.now()}_${++phoneMessageCounter}`,
    senderId: input.senderId,
    senderName: input.senderName,
    role: input.role,
    avatar: input.avatar,
    content: input.content,
    turn: input.turn,
    timestamp: Date.now(),
    sourceSeedId: input.sourceSeedId,
  };
}

export function 创建手机会话(input: {
  type: 手机会话类型;
  title: string;
  participantIds: string[];
  pinned?: boolean;
  messages?: 手机消息[];
  unread?: number;
}): 手机会话 {
  return {
    id: `phone_chat_${Date.now()}_${++phoneChatCounter}`,
    type: input.type,
    title: input.title,
    participantIds: input.participantIds,
    messages: input.messages ?? [],
    localArchive: input.messages
      ? {
          ...创建手机会话本地库(input.type),
          entries: [],
          compressedSummaries: [],
        }
      : 创建手机会话本地库(input.type),
    unread: Math.max(0, Number(input.unread) || 0),
    pinned: input.pinned,
    updatedAt: Date.now(),
  };
}

export function 创建手机会话本地库(type: 手机会话类型): 手机会话本地库 {
  return {
    threshold: type === 'group' ? 12 : type === 'system' ? 8 : 8,
    entries: [],
    compressedSummaries: [],
    lastCompressedTurn: undefined,
  };
}

export function 创建手机会话本地摘要条目(input: {
  turn: number;
  summary: string;
  source: 手机会话本地摘要来源;
  messageCount: number;
  sourceSeedId?: string;
}): 手机会话本地摘要条目 {
  return {
    id: `phone_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    turn: Math.max(0, Number(input.turn) || 0),
    summary: input.summary.trim(),
    source: input.source,
    messageCount: Math.max(0, Number(input.messageCount) || 0),
    createdAt: Date.now(),
    sourceSeedId: input.sourceSeedId,
  };
}

export function 计算手机未读(phone: Pick<手机系统, 'chats' | 'messageSeeds'>): number {
  const chatUnread = phone.chats.reduce((sum, chat) => sum + Math.max(0, Number(chat.unread) || 0), 0);
  const seedUnread = phone.messageSeeds.filter((seed) => seed.status === 'pending').length;
  return chatUnread + seedUnread;
}

export function 创建空手机系统(): 手机系统 {
  return {
    contacts: [],
    chats: [],
    messageSeeds: [],
    unreadTotal: 0,
    wallpapers: {},
  };
}

function 归一化手机壁纸(raw: unknown): 手机系统['wallpapers'] {
  if (!raw || typeof raw !== 'object') return {};
  const candidate = raw as Record<string, unknown>;
  return {
    home: typeof candidate.home === 'string' ? candidate.home : typeof candidate.桌面 === 'string' ? candidate.桌面 : undefined,
    chat: typeof candidate.chat === 'string' ? candidate.chat : typeof candidate.聊天 === 'string' ? candidate.聊天 : undefined,
  };
}

export function 归一化手机系统(input?: Partial<手机系统> | null): 手机系统 {
  const base = 创建空手机系统();
  const chats = Array.isArray(input?.chats) ? input.chats : base.chats;
  const seeds = Array.isArray(input?.messageSeeds) ? input.messageSeeds : [];
  const normalizedChats = chats.map((chat) => ({
    id: chat.id || `chat_${Date.now()}`,
    type: chat.type ?? 'private',
    title: chat.title || '未命名会话',
    participantIds: Array.isArray(chat.participantIds) ? chat.participantIds : [],
    messages: Array.isArray(chat.messages)
      ? chat.messages.map((message) => ({
          ...message,
          avatar: typeof message.avatar === 'string' ? message.avatar : undefined,
        }))
      : [],
    localArchive: {
      ...创建手机会话本地库(chat.type ?? 'private'),
      ...(chat.localArchive ?? {}),
      entries: Array.isArray(chat.localArchive?.entries)
        ? chat.localArchive.entries
            .map((entry) => ({
              ...entry,
              summary: typeof entry.summary === 'string' ? entry.summary.trim() : '',
              source: entry.source ?? 'private',
              messageCount: Math.max(0, Number(entry.messageCount) || 0),
              createdAt: Number(entry.createdAt) || Date.now(),
            }))
            .filter((entry) => entry.summary)
        : [],
      compressedSummaries: Array.isArray(chat.localArchive?.compressedSummaries)
        ? chat.localArchive.compressedSummaries.filter((item) => typeof item === 'string' && item.trim())
        : [],
      lastCompressedTurn: Number(chat.localArchive?.lastCompressedTurn) || undefined,
    },
    unread: Math.max(0, Number(chat.unread) || 0),
    pinned: Boolean(chat.pinned),
    updatedAt: Number(chat.updatedAt) || Date.now(),
  }));
  const normalizedSeeds = seeds.map((seed) => ({
    id: seed.id || `phone_seed_${Date.now()}`,
    turn: Math.max(0, Number(seed.turn) || 0),
    source: seed.source ?? 'system',
    triggerType: seed.triggerType ?? 'custom',
    priority: seed.priority ?? 'normal',
    targetType: seed.targetType ?? 'private',
    targetId: seed.targetId || '',
    title: seed.title || '未命名来信',
    context: seed.context || '',
    relatedNpcIds: Array.isArray(seed.relatedNpcIds) ? seed.relatedNpcIds : [],
    expiresAfterTurns: seed.expiresAfterTurns,
    status: seed.status ?? 'pending',
  }));
  return {
    contacts: Array.isArray(input?.contacts)
      ? input.contacts.map((contact) => ({
          ...contact,
          available: Boolean(contact.available),
          status:
            contact.status ??
            (contact.available === false ? 'unavailable' : contact.npcId ? 'available' : 'known_locked'),
          unlockSource: contact.unlockSource,
        }))
      : [],
    chats: normalizedChats,
    messageSeeds: normalizedSeeds,
    unreadTotal: 计算手机未读({ chats: normalizedChats, messageSeeds: normalizedSeeds }),
    wallpapers: 归一化手机壁纸((input as { wallpapers?: unknown; 壁纸?: unknown } | null | undefined)?.wallpapers ?? (input as { 壁纸?: unknown } | null | undefined)?.壁纸),
  };
}
