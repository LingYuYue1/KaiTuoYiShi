import {
  PORTABLE_SAVE_SCHEMA_VERSION,
  创建空API设置,
  创建默认游戏设置,
  type API设置,
  type 游戏设置,
  type 存档数据,
  type 存档类型,
  type 主题预设,
} from '@/models/settings';
import { createDefaultSettingsPlanes, splitSettings } from '@/models/settingsPlanes';
import { createStoryState, type StoryState, type TurnJournalEntry, type TurnSnapshot } from '@/src/kernel/domain/session/storyState';
import type { PortableSaveMigrationStorage } from '@/src/kernel/ports/PortableSaveMigrationStorage';
import type { PreferenceStore } from '@/src/kernel/ports/PreferenceStore';
import {
  APPEARANCE_PREFERENCES_KEY,
  EXECUTION_POLICY_KEY,
  SAVE_POLICY_KEY,
} from '@/src/kernel/adapters/browser/PreferenceExecutionContextProvider';
import { createPortableSave, readPortableSave } from './portableSave';
import { 创建空智库系统 } from '@/models/zhiku';

export type PortableSaveMigrationInspection = Readonly<{ requiredCount: number; currentCount: number }>;

export class PortableSaveMigrationUseCases {
  constructor(private readonly storage: PortableSaveMigrationStorage, private readonly preferences: PreferenceStore) {}

  async inspect(): Promise<PortableSaveMigrationInspection> {
    const rows = await this.storage.readAllRaw();
    let requiredCount = 0;
    let currentCount = 0;
    for (const row of rows) {
      const version = record(row).portableSchemaVersion;
      if (version === PORTABLE_SAVE_SCHEMA_VERSION) {
        readPortableSave(row);
        currentCount += 1;
      } else if (version === undefined) {
        requireUnversionedSave(row);
        requiredCount += 1;
      } else {
        throw new Error(`无法迁移存档结构版本：${String(version)}`);
      }
    }
    return { requiredCount, currentCount };
  }

  async migrate(options: Readonly<{ recoverDevicePreferences: boolean }>): Promise<Readonly<{ warnings: readonly string[] }>> {
    const rows = await this.storage.readAllRaw();
    const warnings: string[] = [];
    const legacyRows: LegacyPortableSave[] = [];
    const next = rows.map((row) => {
      const version = record(row).portableSchemaVersion;
      if (version === PORTABLE_SAVE_SCHEMA_VERSION) return readPortableSave(row);
      if (version !== undefined) throw new Error(`无法迁移存档结构版本：${String(version)}`);
      const legacy = requireUnversionedSave(row);
      legacyRows.push(legacy);
      return convertUnversionedSave(legacy, warnings);
    });
    for (const save of next) readPortableSave(save);
    if (legacyRows.length === 0) return { warnings };

    if (options.recoverDevicePreferences) {
      const source = [...legacyRows].sort((a, b) => b.timestamp - a.timestamp).find((save) => save.gameSettings || save.apiSettings);
      if (source) await recoverDevicePreferences(this.preferences, source);
    }
    await this.storage.replaceAllCurrent(next);
    warnings.push(`已升级 ${legacyRows.length} 个便携存档；普通读档路径不会再读取旧结构。`);
    return { warnings };
  }
}

type LegacyPortableSave = Readonly<{
  id: number;
  type: 存档类型;
  timestamp: number;
  turnCount?: number;
  旅人: StoryState['traveler'];
  世界: StoryState['world'];
  chatHistory: StoryState['conversation']['history'];
  记忆: StoryState['memory']['system'];
  忆庭?: StoryState['memory']['yiting'];
  智库?: StoryState['content']['zhikuRuntime'];
  手机?: StoryState['phone'];
  NPC?: StoryState['characters']['npcs'];
  相册?: StoryState['album'];
  新闻?: StoryState['news'];
  剧情?: StoryState['plot']['nodes'];
  剧情编织?: StoryState['plot']['weaving'];
  variableBatches?: StoryState['systems']['variableBatches'];
  queueTasks?: readonly unknown[];
  gameSettings?: 游戏设置;
  apiSettings?: API设置;
  theme?: 主题预设;
  pendingOpeningTrigger?: string | null;
  saveTree?: unknown;
  saveStorage?: unknown;
}>;

function requireUnversionedSave(value: unknown): LegacyPortableSave {
  const save = record(value);
  for (const field of ['旅人', '世界', '记忆']) {
    if (!save[field] || typeof save[field] !== 'object' || Array.isArray(save[field])) throw new Error(`旧存档缺少对象字段：${field}`);
  }
  if (!Array.isArray(save.chatHistory)) throw new Error('旧存档缺少 chatHistory');
  if (typeof save.id !== 'number' || !Number.isFinite(save.id) || typeof save.timestamp !== 'number' || !Number.isFinite(save.timestamp)) {
    throw new Error('旧存档 id 或 timestamp 无效');
  }
  if (!['manual', 'auto', 'backup', 'imported'].includes(String(save.type))) throw new Error(`旧存档类型无效：${String(save.type)}`);
  return structuredClone(value) as LegacyPortableSave;
}

function convertUnversionedSave(save: LegacyPortableSave, warnings: string[]): 存档数据 {
  const settings = save.gameSettings ?? 创建默认游戏设置();
  const apiSettings = save.apiSettings ?? 创建空API设置();
  const planes = save.gameSettings
    ? splitSettings(settings, apiSettings, save.theme ?? 'deepspace')
    : createDefaultSettingsPlanes(save.theme ?? 'deepspace');
  const defaults = createStoryState({
    traveler: save.旅人,
    world: save.世界,
    initialNpcRecords: [...(save.NPC ?? [])],
    zhikuRuntime: save.智库 ?? 创建空智库系统(),
    policy: planes.story,
  });
  const turnCount = Number.isSafeInteger(save.turnCount) && Number(save.turnCount) > 0
    ? Number(save.turnCount)
    : save.chatHistory.length + 1;
  const { history, journal } = migrateTurnHistory(save, defaults, turnCount, warnings);
  const settingsRecord = settings as unknown as Record<string, unknown>;
  const story: StoryState = {
    ...defaults,
    conversation: { history, turnJournal: journal, turnCount },
    memory: { system: save.记忆, yiting: save.忆庭 ?? defaults.memory.yiting },
    characters: { npcs: save.NPC ?? defaults.characters.npcs },
    phone: save.手机 ?? defaults.phone,
    album: save.相册 ?? defaults.album,
    news: save.新闻 ?? defaults.news,
    plot: { nodes: save.剧情 ?? defaults.plot.nodes, weaving: save.剧情编织 ?? defaults.plot.weaving },
    systems: { variableBatches: save.variableBatches ?? defaults.systems.variableBatches },
    turn: { pendingOpeningTrigger: save.pendingOpeningTrigger ?? null },
    content: {
      zhikuRuntime: save.智库 ?? defaults.content.zhikuRuntime,
      worldbookTriggerStates: isNumberRecord(settingsRecord.worldbookTriggerStates) ? settingsRecord.worldbookTriggerStates : {},
    },
    jobs: { records: [] },
  };
  if (save.queueTasks?.length) warnings.push(`存档 ${save.id} 的 ${save.queueTasks.length} 个瞬时队列状态未迁移。`);
  return {
    ...createPortableSave(story, save.type, save.timestamp),
    id: save.id,
    ...copyStorageMetadata(save),
  };
}

function migrateTurnHistory(
  save: LegacyPortableSave,
  defaults: StoryState,
  turnCount: number,
  warnings: string[],
): { history: StoryState['conversation']['history']; journal: readonly TurnJournalEntry[] } {
  const history = save.chatHistory.map((message) => {
    const next = { ...message } as typeof message & { preTurnSnapshot?: unknown };
    delete next.preTurnSnapshot;
    return next;
  });
  const latest = [...save.chatHistory].reverse().find((message) => message.role === 'assistant') as
    | (StoryState['conversation']['history'][number] & { preTurnSnapshot?: Record<string, unknown> })
    | undefined;
  if (!latest?.preTurnSnapshot) return { history, journal: [] };
  const raw = latest.preTurnSnapshot;
  const fallback = (field: keyof TurnSnapshot, value: unknown) => raw[field] === undefined ? value : raw[field];
  const snapshot = {
    旅人: fallback('旅人', save.旅人), 世界: fallback('世界', save.世界), 记忆: fallback('记忆', save.记忆),
    忆庭: fallback('忆庭', save.忆庭 ?? defaults.memory.yiting), 智库: fallback('智库', save.智库 ?? defaults.content.zhikuRuntime),
    手机: fallback('手机', save.手机 ?? defaults.phone), NPC: fallback('NPC', save.NPC ?? []),
    相册: fallback('相册', save.相册 ?? defaults.album), 新闻: fallback('新闻', save.新闻 ?? []),
    剧情: fallback('剧情', save.剧情 ?? []), 剧情编织: fallback('剧情编织', save.剧情编织 ?? defaults.plot.weaving),
    variableBatches: fallback('variableBatches', save.variableBatches ?? []), jobs: [], queueTasks: [],
    turnCount: fallback('turnCount', Math.max(1, turnCount - 1)),
    pendingOpeningTrigger: fallback('pendingOpeningTrigger', null),
  } as TurnSnapshot;
  warnings.push(`存档 ${save.id} 的旧消息回滚快照已迁移到 TurnJournal。`);
  return {
    history,
    journal: [{
      turnIndex: Math.max(1, turnCount - 1),
      committedRevision: 0,
      committedAt: Number(latest.timestamp) || save.timestamp,
      preTurnSnapshot: snapshot,
    }],
  };
}

async function recoverDevicePreferences(preferences: PreferenceStore, save: LegacyPortableSave): Promise<void> {
  const planes = splitSettings(save.gameSettings ?? 创建默认游戏设置(), save.apiSettings ?? 创建空API设置(), save.theme ?? 'deepspace');
  await Promise.all([
    preferences.set('apiSettings', structuredClone(save.apiSettings ?? 创建空API设置())),
    preferences.set(EXECUTION_POLICY_KEY, structuredClone(planes.execution)),
    preferences.set(APPEARANCE_PREFERENCES_KEY, structuredClone(planes.appearance)),
    preferences.set(SAVE_POLICY_KEY, structuredClone(planes.save)),
  ]);
}

function copyStorageMetadata(save: LegacyPortableSave): Record<string, unknown> {
  return {
    ...(save.saveTree === undefined ? {} : { saveTree: save.saveTree }),
    ...(save.saveStorage === undefined ? {} : { saveStorage: save.saveStorage }),
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('存档记录必须是对象');
  return value as Record<string, unknown>;
}

function isNumberRecord(value: unknown): value is Record<string, number> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value).every((item) => typeof item === 'number' && Number.isFinite(item));
}
