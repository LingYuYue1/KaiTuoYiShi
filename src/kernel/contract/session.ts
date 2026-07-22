/**
 * Session-scoped application facade contract (IKernelIdealRefactorPlan §3).
 *
 * ISession binds session identity, revision tracking, command identity, event
 * continuity, and cancellation so components cannot assemble envelopes
 * incorrectly. Every state-changing method returns a CommandHandle backed by
 * the private CommandRunner — capability groups implement no lifecycle of
 * their own.
 *
 * CommandHandle semantics (exact):
 *   - execution starts eagerly when the use case returns the handle;
 *   - `result` settles exactly once even with zero event consumers;
 *   - multiple subscribers observe the same ordered sequence;
 *   - detaching from the event iterator never cancels the command;
 *   - cancellation happens only through cancelAndWait();
 *   - the event stream is hot; late subscribers resync via projection.
 */

import type { SessionId, CommandId, Revision, SessionView } from './index';
import type { NewStorySeed } from '@/src/kernel/domain/session/storyState';
import type { KernelError } from './errors';
import type { 命途ID } from '@/models/journey';
import type { NPC阶位 } from '@/models/npc';
import type { 剧情模式 } from '@/models/journey';
import type { SessionCommand, SkillDraftInput } from './commands';
import type { 命途阶段 } from '@/models/path';
import type { ContextSnapshot, ContextSnapshotKind } from './inspection';
import type { JobProjection, MessageProjection } from './projections';
import type { TurnStage } from './frames';
import type { StoryPolicy } from '@/models/settingsPlanes';

// ── Event protocol (plan §3 target event protocol) ──

export type EventMeta = Readonly<{
  commandId: CommandId;
  sequence: number;
}>;

export type GameEvent = EventMeta & (
  | { type: 'command.accepted' }
  | { type: 'turn.prepared'; view: SessionView }
  | { type: 'stage.changed'; stage: TurnStage }
  | { type: 'stage.retrying'; stage: TurnStage; attempt: number; limit: number }
  | { type: 'narrative.delta'; text: string }
  | { type: 'assistant.ready'; message: MessageProjection }
  | { type: 'command.committed'; revision: Revision; view: SessionView }
  | { type: 'command.rejected'; error: KernelError }
);

export type CommandTerminal<Result> =
  | { readonly outcome: 'committed'; readonly result: Result }
  | { readonly outcome: 'rejected'; readonly error: KernelError };

export type TurnCommit = Readonly<{
  revision: Revision;
  view: SessionView;
}>;

export type SessionCommit = Readonly<{
  revision: Revision;
  view: SessionView;
}>;

// ── Multicast event stream ──

export type Unsubscribe = () => void;

export interface MulticastEventStream<Event> extends AsyncIterable<Event> {
  subscribe(listener: (event: Event) => void): Unsubscribe;
}

// ── Command handle ──

export interface CommandHandle<Event, Result> {
  readonly commandId: CommandId;
  readonly events: MulticastEventStream<Event>;
  readonly result: Promise<CommandTerminal<Result>>;
  cancelAndWait(): Promise<CommandTerminal<Result>>;
}

// ── Projection reader ──

export interface SessionProjectionReader {
  current(): Promise<SessionView>;
  subscribe(listener: (commit: Readonly<{ view: SessionView; cause: SessionCommand['type'] | 'session.create' }>) => void): Unsubscribe;
  resync(): Promise<SessionView>;
}

// ── Capability groups ──

export interface TurnUseCases {
  advance(input: Readonly<{ text: string; openingTrigger?: string }>): CommandHandle<GameEvent, TurnCommit>;
  reroll(input: Readonly<{ turnId: string }>): CommandHandle<GameEvent, TurnCommit>;
}

export interface MediaUseCases {
  regenerateNarrativeImage(input: Readonly<{ messageId: string }>): CommandHandle<GameEvent, SessionCommit>;
}

export type { JobProjection } from './projections';

export interface SessionJobUseCases {
  list(): Promise<readonly JobProjection[]>;
  retry(input: Readonly<{ jobId: string }>): CommandHandle<GameEvent, SessionCommit>;
  cancel(input: Readonly<{ jobId: string; reason?: string }>): CommandHandle<GameEvent, SessionCommit>;
}

export interface PathUseCases {
  setPrimary(input: Readonly<{ pathId: 命途ID }>): CommandHandle<GameEvent, SessionCommit>;
  enterAwakening(): CommandHandle<GameEvent, TurnCommit>;
  declineAwakening(): CommandHandle<GameEvent, SessionCommit>;
}

export interface MessageUseCases {
  editBody(input: Readonly<{ messageId: string; body: string }>): CommandHandle<GameEvent, SessionCommit>;
}

export type CompanionPlanningEntry = Readonly<{
  npcId: string;
  name: string;
  relationship: string;
  affinity: number;
  traveling: boolean;
  priority: '高' | '中' | '低';
  suggestedAction: '继续同行互动' | '兑现承诺或冲突' | '补充关系记忆' | '适合手机联系' | '暂作背景';
  reasons: readonly string[];
  focusPoints: readonly string[];
}>;

export type CompanionPlanningProjection = Readonly<{
  summary: string;
  entries: readonly CompanionPlanningEntry[];
}>;

export interface CompanionUseCases {
  planning(): Promise<CompanionPlanningProjection>;
  setTier(input: Readonly<{ npcId: string; tier: NPC阶位 }>): CommandHandle<GameEvent, SessionCommit>;
  setTraveling(input: Readonly<{ npcId: string; traveling: boolean }>): CommandHandle<GameEvent, SessionCommit>;
}

export interface MemoryUseCases {
  compress(input: Readonly<{
    layer: 'immediate' | 'short' | 'middle';
    force: boolean;
  }>): CommandHandle<GameEvent, SessionCommit>;
}

export interface WorldUseCases {
  setStoryMode(input: Readonly<{ mode: 剧情模式 }>): CommandHandle<GameEvent, SessionCommit>;
}

export interface StoryPolicyUseCases {
  replace(policy: StoryPolicy): CommandHandle<GameEvent, SessionCommit>;
}

export type SkillSaveInput = Readonly<{
  skillId?: string;
  slot: Readonly<{ kind: 'normal' | 'path'; index: number; pathId?: 命途ID; pathStage?: 命途阶段 }>;
  draft: SkillDraftInput;
}>;

export type SkillDraftGenerationInput = Readonly<{
  slot: Readonly<{ kind: 'normal' | 'path'; index: number; pathId?: 命途ID; pathStage?: 命途阶段 }>;
  existingSkillNames: readonly string[];
  userHint?: string;
  currentDraft?: Readonly<{
    name?: string;
    description?: string;
    source?: string;
    keywords?: readonly string[];
    cost?: string;
    cooldown?: string;
    notes?: string;
  }>;
}>;

export type GeneratedSkillDraft = Readonly<{
  name: string;
  description: string;
  source: string;
  keywords: readonly string[];
  cost: string;
  cooldown: string;
  notes: string;
}>;

export interface SkillUseCases {
  generateDraft(input: SkillDraftGenerationInput): Promise<GeneratedSkillDraft>;
  save(input: SkillSaveInput): CommandHandle<GameEvent, SessionCommit>;
  delete(input: Readonly<{ skillId: string }>): CommandHandle<GameEvent, SessionCommit>;
  setEnabled(input: Readonly<{ skillId: string; enabled: boolean }>): CommandHandle<GameEvent, SessionCommit>;
}

export interface InventoryUseCases {
  use(input: Readonly<{ itemId: string; count?: number }>): CommandHandle<GameEvent, SessionCommit>;
  drop(input: Readonly<{ itemId: string; count?: number }>): CommandHandle<GameEvent, SessionCommit>;
  undoDrop(input: Readonly<{ dropCommandId: CommandId }>): CommandHandle<GameEvent, SessionCommit>;
}

export interface ZhikuUseCases {
  create(input: Readonly<{ draft: import('@/models/zhiku').智库条目草稿 }>): CommandHandle<GameEvent, SessionCommit>;
  update(input: Readonly<{
    entryId: string;
    patch: Partial<Omit<import('@/models/zhiku').智库条目, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>>;
  }>): CommandHandle<GameEvent, SessionCommit>;
  delete(input: Readonly<{ entryId: string }>): CommandHandle<GameEvent, SessionCommit>;
  refreshBundled(): CommandHandle<GameEvent, SessionCommit>;
}

export interface PlotUseCases {
  importText(input: Readonly<{ text: string; title: string; fileName?: string; chaptersPerSegment: number }>): CommandHandle<GameEvent, SessionCommit>;
  importJson(input: Readonly<{ json: string }>): CommandHandle<GameEvent, SessionCommit>;
  restoreBundled(): CommandHandle<GameEvent, SessionCommit>;
  renameSeries(input: Readonly<{ seriesId: string; title: string }>): CommandHandle<GameEvent, SessionCommit>;
  rebuildSeries(input: Readonly<{ seriesId: string; chaptersPerSegment: number }>): CommandHandle<GameEvent, SessionCommit>;
  toggleSeriesInjection(input: Readonly<{ seriesId: string }>): CommandHandle<GameEvent, SessionCommit>;
  setCurrent(input: Readonly<{ seriesId: string; group: number }>): CommandHandle<GameEvent, SessionCommit>;
  setSegmentStatus(input: Readonly<{ seriesId: string; segmentId: string; status: import('@/models/storyWeaving').剧情编织运行状态 }>): CommandHandle<GameEvent, SessionCommit>;
  saveSegment(input: Readonly<{ seriesId: string; segmentId: string; draft: import('./commands').StorySegmentDraftInput }>): CommandHandle<GameEvent, SessionCommit>;
  deleteSeries(input: Readonly<{ seriesId: string }>): CommandHandle<GameEvent, SessionCommit>;
  decompose(input: Readonly<{ seriesId: string; segmentId: string }>): CommandHandle<GameEvent, SessionCommit>;
  decomposeBatch(input: Readonly<{ seriesId: string; mode: 'pending' | 'from-current' | 'all' }>): CommandHandle<GameEvent, SessionCommit>;
}

export interface AlbumUseCases {
  importReference(input: Readonly<{ targetKind: 'traveler' | 'npc'; targetId: string; name: string; src: string; mimeType: string; contentHash: string }>): CommandHandle<GameEvent, SessionCommit>;
  setReference(input: Readonly<{ entryId: string; characterId: string; enabled: boolean }>): CommandHandle<GameEvent, SessionCommit>;
  bindSlot(input: Omit<Extract<import('./commands').AlbumCommand, { type: 'album.bind-slot' }>, 'type'>): CommandHandle<GameEvent, SessionCommit>;
  deleteEntries(input: Readonly<{ entryIds: readonly string[] }>): CommandHandle<GameEvent, SessionCommit>;
  importArchive(input: Readonly<{ album: import('@/models/imageGeneration').相册系统 }>): CommandHandle<GameEvent, SessionCommit>;
  setCharacterAnchor(input: Readonly<{ targetKind: 'traveler' | 'npc'; targetId?: string; anchor?: import('@/models/npc').NPC角色锚点档案 }>): CommandHandle<GameEvent, SessionCommit>;
  generate(input: Omit<Extract<import('./commands').AlbumCommand, { type: 'album.generate' }>, 'type' | 'createdAt'>): CommandHandle<GameEvent, SessionCommit>;
  extractCharacterAnchor(input: import('@/services/ai/characterAnchorExtract').CharacterAnchorExtractInput): Promise<import('@/models/npc').NPC角色锚点档案>;
  tokenizePrompt(input: import('@/services/ai/imagePromptTokenizer').ImagePromptTokenizerInput): Promise<import('@/services/ai/imagePromptTokenizer').ImagePromptTokenizerResult | null>;
  parseScene(input: import('@/services/ai/narrativeImageParse').解析上下文): Promise<import('@/services/ai/narrativeImageParse').场景图解析结果>;
  parseStorySnapshot(input: import('@/services/ai/narrativeImageParse').解析上下文): Promise<import('@/services/ai/narrativeImageParse').故事快照解析结果>;
}

export interface PhoneUseCases {
  dismissSeed(input: Readonly<{ seedId: string }>): CommandHandle<GameEvent, SessionCommit>;
  markRead(input: Readonly<{ chatId: string }>): CommandHandle<GameEvent, SessionCommit>;
  addContact(input: Readonly<{ npcId: string }>): CommandHandle<GameEvent, SessionCommit>;
  openPrivateChat(input: Readonly<{ npcId: string }>): CommandHandle<GameEvent, SessionCommit>;
  createGroup(input: Readonly<{ npcIds: readonly string[]; title: string }>): CommandHandle<GameEvent, SessionCommit>;
  renameGroup(input: Readonly<{ chatId: string; title: string }>): CommandHandle<GameEvent, SessionCommit>;
  addGroupMember(input: Readonly<{ chatId: string; npcId: string }>): CommandHandle<GameEvent, SessionCommit>;
  setWallpaper(input: Readonly<{ slot: 'home' | 'chat'; assetRef?: string }>): CommandHandle<GameEvent, SessionCommit>;
  send(input: Readonly<{ chatId: string; text: string }>): CommandHandle<GameEvent, SessionCommit>;
  generateSeed(input: Readonly<{ seedId: string }>): CommandHandle<GameEvent, SessionCommit>;
}

export interface SessionLifecycleUseCases {
  restart(seed: NewStorySeed): CommandHandle<GameEvent, SessionCommit>;
}

export interface SessionInspectionUseCases {
  contextSnapshot(kind?: ContextSnapshotKind): Promise<ContextSnapshot>;
}

// ── Session ──

export interface ISession {
  readonly id: SessionId;
  readonly projection: SessionProjectionReader;
  readonly turns: TurnUseCases;
  readonly media: MediaUseCases;
  readonly jobs: SessionJobUseCases;
  readonly paths: PathUseCases;
  readonly messages: MessageUseCases;
  readonly companions: CompanionUseCases;
  readonly memory: MemoryUseCases;
  readonly world: WorldUseCases;
  readonly policy: StoryPolicyUseCases;
  readonly skills: SkillUseCases;
  readonly inventory: InventoryUseCases;
  readonly zhiku: ZhikuUseCases;
  readonly plot: PlotUseCases;
  readonly album: AlbumUseCases;
  readonly phone: PhoneUseCases;
  readonly lifecycle: SessionLifecycleUseCases;
  readonly inspection: SessionInspectionUseCases;
  close(options: Readonly<{ activeCommand: 'detach' | 'cancel-and-wait' }>): Promise<void>;
}

// ── Session directory ──

export interface SessionDirectory {
  exists(sessionId: SessionId): Promise<boolean>;
  open(sessionId: SessionId): Promise<ISession>;
  create(sessionId: SessionId, seed: NewStorySeed): CommandHandle<GameEvent, SessionCommit>;
}
