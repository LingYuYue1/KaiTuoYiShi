import type { API设置, 游戏设置, 主题预设 } from '@/models/settings';
import type { 世界书 } from '@/models/worldbook';
import { splitSettings } from '@/models/settingsPlanes';
import type { StoryState, TurnJournalEntry, TurnSnapshot } from '@/src/kernel/domain/session/storyState';
import { readSessionRecord, SESSION_SCHEMA_VERSION } from '@/src/kernel/domain/session/schema';
import type { PreferenceStore } from '@/src/kernel/ports/PreferenceStore';
import type { SessionMigrationStorage } from '@/src/kernel/ports/SessionMigrationStorage';
import { APPEARANCE_PREFERENCES_KEY, CONTENT_LIBRARY_KEY, EXECUTION_POLICY_KEY, SAVE_POLICY_KEY } from '@/src/kernel/adapters/browser/PreferenceExecutionContextProvider';
import type { ContentLibrary } from '@/models/settingsPlanes';
import { normalizeWorldbooks } from '@/utils/worldbook';

export type SessionMigrationInspection =
  | Readonly<{ status: 'none' | 'current' }>
  | Readonly<{ status: 'v2-required'; travelerName: string; turnCount: number }>
  | Readonly<{ status: 'unsupported'; schemaVersion: unknown }>;

export class SessionMigrationUseCases {
  constructor(private readonly storage: SessionMigrationStorage, private readonly preferences: PreferenceStore) {}

  async inspect(sessionId: string): Promise<SessionMigrationInspection> {
    const raw = await this.storage.readRaw(sessionId);
    if (!raw) return { status: 'none' };
    if (raw.schemaVersion === SESSION_SCHEMA_VERSION) return { status: 'current' };
    if (raw.schemaVersion !== 2) return { status: 'unsupported', schemaVersion: raw.schemaVersion };
    const runtime = requireV2Runtime(raw);
    return { status: 'v2-required', travelerName: runtime.旅人.姓名, turnCount: runtime.turnCount };
  }

  async migrateV2(
    sessionId: string,
    options: Readonly<{ recoverDevicePreferences: boolean }> = { recoverDevicePreferences: false },
  ): Promise<Readonly<{ warnings: readonly string[] }>> {
    const raw = await this.storage.readRaw(sessionId);
    if (!raw || raw.schemaVersion !== 2) throw new Error('No V2 session is available for migration');
    const runtime = requireV2Runtime(raw);
    const planes = splitSettings(runtime.gameSettings, runtime.apiSettings, runtime.currentTheme);
    const warnings: string[] = [];
    const story = convertStory(runtime, planes.story, warnings);
    const next = { schemaVersion: SESSION_SCHEMA_VERSION, sessionId, revision: raw.revision, state: { story } };
    readSessionRecord(next);

    const currentContent = await this.preferences.get<ContentLibrary>(CONTENT_LIBRARY_KEY);
    const contentBase = currentContent ?? planes.content;
    const content = {
      ...contentBase,
      worldbooks: normalizeWorldbooks([...(contentBase.worldbooks ?? []), ...runtime.worldbooks]),
    };
    const writes: Promise<void>[] = [this.preferences.set(CONTENT_LIBRARY_KEY, structuredClone(content))];
    if (options.recoverDevicePreferences) {
      writes.push(
        this.preferences.set('apiSettings', structuredClone(runtime.apiSettings)),
        this.preferences.set(EXECUTION_POLICY_KEY, structuredClone(planes.execution)),
        this.preferences.set(APPEARANCE_PREFERENCES_KEY, structuredClone(planes.appearance)),
        this.preferences.set(SAVE_POLICY_KEY, structuredClone(planes.save)),
      );
      warnings.push('已按 User 的显式选择，从 V2 档案恢复设备设置（包括 API 配置）。');
    } else {
      warnings.push('已保留当前设备设置；V2 档案中的 API、主题与设备策略未覆盖当前配置。');
    }
    await Promise.all(writes);
    await this.storage.replaceV2(sessionId, next);
    return { warnings };
  }
}

type V2Runtime = Readonly<{
  旅人: StoryState['traveler']; 世界: StoryState['world']; chatHistory: StoryState['conversation']['history'];
  记忆: StoryState['memory']['system']; 忆庭: StoryState['memory']['yiting']; 智库: StoryState['content']['zhikuRuntime'];
  手机: StoryState['phone']; NPC: StoryState['characters']['npcs']; 相册: StoryState['album']; 新闻: StoryState['news'];
  剧情: StoryState['plot']['nodes']; 剧情编织: StoryState['plot']['weaving']; variableBatches: StoryState['systems']['variableBatches'];
  queueTasks: readonly unknown[]; apiSettings: API设置; gameSettings: 游戏设置; currentTheme: 主题预设; worldbooks: readonly 世界书[]; turnCount: number;
  pendingOpeningTrigger?: string | null;
}>;

function requireV2Runtime(raw: { state: unknown }): V2Runtime {
  const state = raw.state as { runtime?: V2Runtime };
  const runtime = state?.runtime;
  if (!runtime || typeof runtime !== 'object') throw new Error('V2 session is missing state.runtime');
  if (!runtime.旅人 || typeof runtime.旅人.姓名 !== 'string' || !Number.isSafeInteger(runtime.turnCount) || runtime.turnCount < 1) {
    throw new Error('V2 session identity or turn count is invalid');
  }
  for (const field of ['chatHistory', 'NPC', '新闻', '剧情', 'variableBatches', 'queueTasks', 'worldbooks'] as const) {
    if (!Array.isArray(runtime[field])) throw new Error(`V2 session requires ${field}`);
  }
  if (!runtime.apiSettings || !runtime.gameSettings || !runtime.currentTheme) throw new Error('V2 session device settings are incomplete');
  return structuredClone(runtime);
}

function convertStory(runtime: V2Runtime, policy: StoryState['policy'], warnings: string[]): StoryState {
  const history = runtime.chatHistory.map((message) => {
    const next = { ...message } as typeof message & { preTurnSnapshot?: unknown };
    delete next.preTurnSnapshot;
    return next;
  });
  const latestAssistant = [...runtime.chatHistory].reverse().find((message) => message.role === 'assistant') as (StoryState['conversation']['history'][number] & { preTurnSnapshot?: Record<string, unknown> }) | undefined;
  const journal = latestAssistant?.preTurnSnapshot
    ? [journalFromV2(latestAssistant.preTurnSnapshot, runtime, latestAssistant.timestamp, warnings)]
    : [];
  if (runtime.queueTasks.length) warnings.push(`${runtime.queueTasks.length} 个旧版瞬时队列状态未迁移；正式剧情数据不受影响。`);
  return {
    traveler: runtime.旅人, world: runtime.世界,
    conversation: { history, turnJournal: journal, turnCount: runtime.turnCount },
    memory: { system: runtime.记忆, yiting: runtime.忆庭 }, characters: { npcs: runtime.NPC },
    phone: runtime.手机, album: runtime.相册, news: runtime.新闻,
    plot: { nodes: runtime.剧情, weaving: runtime.剧情编织 }, systems: { variableBatches: runtime.variableBatches },
    turn: { pendingOpeningTrigger: runtime.pendingOpeningTrigger ?? null }, policy,
    content: { zhikuRuntime: runtime.智库, worldbookTriggerStates: {} }, jobs: { records: [] },
  };
}

function journalFromV2(raw: Record<string, unknown>, runtime: V2Runtime, committedAt: number, warnings: string[]): TurnJournalEntry {
  const fallback = (field: keyof TurnSnapshot, value: unknown) => {
    if (raw[field] !== undefined) return raw[field];
    warnings.push(`旧回滚快照缺少 ${field}，已使用迁移时的当前剧情切片。`);
    return value;
  };
  const snapshot = {
    旅人: fallback('旅人', runtime.旅人), 世界: fallback('世界', runtime.世界), 记忆: fallback('记忆', runtime.记忆),
    忆庭: fallback('忆庭', runtime.忆庭), 智库: fallback('智库', runtime.智库), 手机: fallback('手机', runtime.手机),
    NPC: fallback('NPC', runtime.NPC), 相册: fallback('相册', runtime.相册), 新闻: fallback('新闻', runtime.新闻),
    剧情: fallback('剧情', runtime.剧情), 剧情编织: fallback('剧情编织', runtime.剧情编织),
    variableBatches: fallback('variableBatches', runtime.variableBatches), jobs: [],
    turnCount: fallback('turnCount', Math.max(1, runtime.turnCount - 1)),
    pendingOpeningTrigger: fallback('pendingOpeningTrigger', null),
  } as TurnSnapshot;
  return { turnIndex: Math.max(1, runtime.turnCount - 1), committedRevision: 0, committedAt, preTurnSnapshot: snapshot };
}
