import type { 聊天消息 } from '@/models/chat';
import type { 存档数据 } from '@/models/settings';
import type { 存档树元信息 } from '@/utils/saveTree';

export type SaveNodeBaseMode = 'checkpoint' | 'delta';

export interface SaveNodeDeltaPayload {
  baseSaveId: number;
  chatHistoryMode: 'append' | 'replace';
  chatBaseLength: number;
  chatHistory: 聊天消息[];
  fields: Partial<Pick<
    存档数据,
    | '旅人'
    | '世界'
    | '记忆'
    | '忆庭'
    | '智库'
    | '手机'
    | 'NPC'
    | '相册'
    | '新闻'
    | '剧情'
    | '剧情编织'
    | 'variableBatches'
    | 'queueTasks'
    | 'gameSettings'
    | 'apiSettings'
    | 'theme'
  >>;
}

export interface SaveNodeDeltaRecord {
  nodeId: string;
  rootId: string;
  parentNodeId?: string;
  saveId: number;
  type: 存档数据['type'];
  timestamp: number;
  turnCount: number;
  baseMode: SaveNodeBaseMode;
  chatFromIndex: number;
  chatTail: Array<{
    role: string;
    contentLength: number;
    hasParsedBody: boolean;
  }>;
  assetIds: string[];
  counters: {
    chatMessages: number;
    memories: number;
    yitingArchives: number;
    zhikuEntries: number;
    phoneContacts: number;
    npcRecords: number;
    albumAssets: number;
    albumEntries: number;
    newsItems: number;
    plotNodes: number;
    variableBatches: number;
    queueTasks: number;
  };
  contentHash: string;
  deltaPayload?: SaveNodeDeltaPayload;
  createdAt: number;
}

type SaveWithTree = 存档数据 & {
  saveTree?: 存档树元信息;
  saveStorage?: {
    mode: SaveNodeBaseMode;
    baseSaveId?: number;
  };
};

const CHAT_TAIL_LIMIT = 8;

const DELTA_FIELDS: Array<keyof SaveNodeDeltaPayload['fields']> = [
  '旅人',
  '世界',
  '记忆',
  '忆庭',
  '智库',
  '手机',
  'NPC',
  '相册',
  '新闻',
  '剧情',
  '剧情编织',
  'variableBatches',
  'queueTasks',
  'gameSettings',
  'apiSettings',
  'theme',
];

export function buildSaveNodeDeltaRecord(
  save: 存档数据,
  saveId: number,
  options?: {
    baseSave?: 存档数据 | null;
    baseSaveId?: number;
    storageMode?: SaveNodeBaseMode;
  },
): SaveNodeDeltaRecord | null {
  const tree = (save as SaveWithTree).saveTree;
  if (!tree?.rootId || !tree.nodeId) return null;
  const chatHistory = Array.isArray(save.chatHistory) ? save.chatHistory : [];
  const chatTailSource = chatHistory.slice(-CHAT_TAIL_LIMIT);
  const baseMode: SaveNodeBaseMode =
    options?.storageMode === 'delta' && options.baseSave && Number.isFinite(options.baseSaveId)
      ? 'delta'
      : 'checkpoint';

  return {
    nodeId: tree.nodeId,
    rootId: tree.rootId,
    parentNodeId: tree.parentNodeId,
    saveId,
    type: save.type,
    timestamp: Number(save.timestamp) || Date.now(),
    turnCount: Number(save.turnCount) || chatHistory.length + 1,
    baseMode,
    chatFromIndex: Math.max(0, chatHistory.length - chatTailSource.length),
    chatTail: chatTailSource.map((message) => ({
      role: String(message.role ?? ''),
      contentLength: String(message.content ?? '').length,
      hasParsedBody: Boolean(message.parsedResponse?.body),
    })),
    assetIds: collectAssetIds(save),
    counters: buildCounters(save, chatHistory.length),
    contentHash: hashSaveCheckpoint(save),
    deltaPayload: baseMode === 'delta' && options?.baseSave && Number.isFinite(options.baseSaveId)
      ? buildDeltaPayload(save, options.baseSave, Number(options.baseSaveId))
      : undefined,
    createdAt: Date.now(),
  };
}

export function buildDeltaOnlyStoredSave(save: 存档数据, baseSaveId: number): 存档数据 {
  const tree = (save as SaveWithTree).saveTree;
  return {
    id: save.id,
    type: save.type,
    timestamp: save.timestamp,
    turnCount: save.turnCount,
    旅人: {
      ...save.旅人,
      背包: [],
      战技列表: [],
    },
    世界: {
      ...save.世界,
    },
    chatHistory: [],
    记忆: {} as 存档数据['记忆'],
    忆庭: undefined,
    智库: undefined,
    手机: undefined,
    NPC: [],
    相册: {
      assets: [],
      entries: [],
      tasks: [],
    },
    新闻: [],
    剧情: [],
    剧情编织: undefined,
    variableBatches: [],
    queueTasks: [],
    gameSettings: save.gameSettings,
    apiSettings: save.apiSettings,
    theme: save.theme,
    saveTree: tree,
    saveStorage: {
      mode: 'delta',
      baseSaveId,
    },
  } as 存档数据;
}

export function isDeltaOnlyStoredSave(save: 存档数据 | null | undefined): boolean {
  return (save as SaveWithTree | null | undefined)?.saveStorage?.mode === 'delta';
}

export function restoreSaveFromDelta(baseSave: 存档数据, storedSave: 存档数据, delta: SaveNodeDeltaRecord): 存档数据 {
  const payload = delta.deltaPayload;
  if (!payload) return storedSave;
  const baseChat = Array.isArray(baseSave.chatHistory) ? baseSave.chatHistory : [];
  const chatHistory = payload.chatHistoryMode === 'append'
    ? [...baseChat.slice(0, payload.chatBaseLength), ...payload.chatHistory]
    : payload.chatHistory;
  return {
    ...baseSave,
    ...payload.fields,
    id: storedSave.id,
    type: storedSave.type,
    timestamp: storedSave.timestamp,
    turnCount: storedSave.turnCount,
    chatHistory,
    saveTree: (storedSave as SaveWithTree).saveTree,
    saveStorage: {
      mode: 'checkpoint',
    },
  } as 存档数据;
}

function buildDeltaPayload(save: 存档数据, baseSave: 存档数据, baseSaveId: number): SaveNodeDeltaPayload {
  const chatDelta = buildChatDelta(save.chatHistory ?? [], baseSave.chatHistory ?? []);
  const fields: SaveNodeDeltaPayload['fields'] = {};
  for (const key of DELTA_FIELDS) {
    if (key === 'apiSettings') continue;
    if (!jsonCompatibleEqual(save[key], baseSave[key])) {
      fields[key] = save[key] as never;
    }
  }
  fields.apiSettings = save.apiSettings;
  fields.gameSettings = save.gameSettings;
  fields.theme = save.theme;
  return {
    baseSaveId,
    chatHistoryMode: chatDelta.mode,
    chatBaseLength: chatDelta.baseLength,
    chatHistory: chatDelta.messages,
    fields,
  };
}

function buildChatDelta(current: 聊天消息[], base: 聊天消息[]): {
  mode: 'append' | 'replace';
  baseLength: number;
  messages: 聊天消息[];
} {
  const baseIsPrefix = base.length <= current.length && base.every((message, index) => message.id === current[index]?.id);
  if (baseIsPrefix) {
    return {
      mode: 'append',
      baseLength: base.length,
      messages: current.slice(base.length),
    };
  }
  return {
    mode: 'replace',
    baseLength: 0,
    messages: current,
  };
}

function collectAssetIds(save: 存档数据): string[] {
  const ids = new Set<string>();
  for (const asset of save.相册?.assets ?? []) {
    if (asset.id) ids.add(asset.id);
  }
  return Array.from(ids).sort();
}

function buildCounters(save: 存档数据, chatMessages: number): SaveNodeDeltaRecord['counters'] {
  return {
    chatMessages,
    memories: countArray((save.记忆 as { longTermMemories?: unknown[] } | undefined)?.longTermMemories),
    yitingArchives: countArray((save.忆庭 as { 回忆档案?: unknown[] } | undefined)?.回忆档案),
    zhikuEntries: countZhikuEntries(save.智库),
    phoneContacts: countArray((save.手机 as { contacts?: unknown[] } | undefined)?.contacts),
    npcRecords: countArray(save.NPC),
    albumAssets: countArray(save.相册?.assets),
    albumEntries: countArray(save.相册?.entries),
    newsItems: countArray(save.新闻),
    plotNodes: countArray(save.剧情),
    variableBatches: countArray(save.variableBatches),
    queueTasks: countArray(save.queueTasks),
  };
}

function countArray(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

function countZhikuEntries(value: unknown): number {
  if (!value || typeof value !== 'object') return 0;
  const maybe = value as {
    documents?: unknown[];
    entries?: unknown[];
    shards?: unknown[];
    资料?: unknown[];
  };
  return countArray(maybe.documents) + countArray(maybe.entries) + countArray(maybe.shards) + countArray(maybe.资料);
}

function hashSaveCheckpoint(save: 存档数据): string {
  const payload = JSON.stringify({
    type: save.type,
    timestamp: save.timestamp,
    turnCount: save.turnCount,
    traveler: save.旅人?.姓名,
    location: save.世界?.当前地点,
    chatCount: save.chatHistory?.length ?? 0,
    lastMessage: save.chatHistory?.at(-1)?.content?.slice(0, 240) ?? '',
    assets: collectAssetIds(save),
  });
  let hash = 2166136261;
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function jsonCompatibleEqual(
  left: unknown,
  right: unknown,
  seen = new WeakMap<object, WeakSet<object>>(),
): boolean {
  if (Object.is(left, right)) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;

  const leftObject = left as object;
  const rightObject = right as object;
  const paired = seen.get(leftObject);
  if (paired?.has(rightObject)) return true;
  if (paired) paired.add(rightObject);
  else seen.set(leftObject, new WeakSet([rightObject]));

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index += 1) {
      if (!jsonCompatibleEqual(left[index], right[index], seen)) return false;
    }
    return true;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  if (leftKeys.length !== rightKeys.length) return false;
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(rightRecord, key)) return false;
    if (!jsonCompatibleEqual(leftRecord[key], rightRecord[key], seen)) return false;
  }
  return true;
}
