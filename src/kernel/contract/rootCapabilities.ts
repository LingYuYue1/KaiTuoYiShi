/**
 * Typed root capabilities (IKernelIdealRefactorPlan §3 target public kernel).
 *
 * Each group exposes application use cases and projection DTOs — never a
 * repository, service module, IndexedDB facade, or arbitrary key/value store.
 * Implementations live in application/rootCapabilities.ts and are composed
 * once in appKernel.ts.
 */

import type { 存档数据 } from '@/models/settings';
import type { SessionDirectory } from './session';
import type { CommandHandle, GameEvent, ISession, SessionCommit, Unsubscribe } from './session';
import type { SessionId } from './commands';
import type { DeviceUseCases } from './device';

// ── Saves ──

export type SaveSummary = Readonly<{
  id: number;
  type: import('@/models/settings').存档类型;
  timestamp: number;
  saveTree?: import('@/utils/saveTree').存档树元信息;
  travelerName: string;
  turnCount: number;
  worldPeriodName: string;
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  lastSummary: string;
  sizeBytes: number;
}>;

export interface SavesUseCases {
  list(): Promise<readonly SaveSummary[]>;
  /** Persist a story-only save payload (device fields are stripped by the storage boundary). */
  saveStory(save: 存档数据): Promise<number>;
  saveSession(sessionId: SessionId, type: import('@/models/settings').存档类型): Promise<number>;
  followAutosave(session: ISession): Promise<Unsubscribe>;
  loadStory(id: number): Promise<存档数据 | null>;
  deleteStory(id: number): Promise<void>;
  exportStory(id: number): Promise<void>;
  deleteTree(rootId: string): Promise<number>;
  exportTree(rootId: string): Promise<void>;
  importAndPersist(file: File): Promise<number>;
  repairCatalog(): Promise<void>;
  rebuildSummaries(batchLimit?: number): Promise<number>;
  summarizeDesktopAssets(): Promise<import('@/services/desktop/desktopAssetMirror').DesktopAssetMaintenanceSummary>;
  cleanupDesktopAssets(): Promise<import('@/services/desktop/desktopAssetMirror').DesktopAssetMaintenanceSummary>;
  previewDesktopMigrationBackup(): Promise<import('@/services/desktop/desktopMigrationBackup').DesktopMigrationBackupPreview | null>;
  backupDesktop(reason?: import('@/services/desktop/desktopSaveBackup').DesktopSaveBackupReason): Promise<import('@/services/desktop/desktopSaveBackup').DesktopSaveBackupSummary | null>;
  backupDesktopMigration(): Promise<import('@/services/desktop/desktopMigrationBackup').DesktopMigrationBackupSummary | null>;
  restoreDesktopMirror(): Promise<number>;
  restoreDesktopBackup(path: string): Promise<number>;
  restoreIntoSession(id: number, sessionId: SessionId): Promise<CommandHandle<GameEvent, SessionCommit>>;
}

export interface MigrationUseCases {
  inspect(sessionId: string): Promise<import('@/src/kernel/application/sessionMigration').SessionMigrationInspection>;
  inspectPortableSaves(): Promise<import('@/src/kernel/application/portableSaveMigration').PortableSaveMigrationInspection>;
  migrateV2(
    sessionId: string,
    options?: Readonly<{ recoverDevicePreferences: boolean }>,
  ): Promise<Readonly<{ warnings: readonly string[] }>>;
  migratePortableSaves(
    options: Readonly<{ recoverDevicePreferences: boolean }>,
  ): Promise<Readonly<{ warnings: readonly string[] }>>;
}

// ── Onboarding ──

export interface OnboardingUseCases {
  /** Validate and construct the initial story state for a new session seed. */
  prepareStoryState(seed: import('@/src/kernel/domain/session/storyState').NewStorySeed):
    import('@/src/kernel/domain/session/storyState').StoryState;
  loadOpeningPresets(): Promise<readonly import('@/models/openingPreset').OpeningPlayerPreset[]>;
  replaceOpeningPresets(presets: readonly import('@/models/openingPreset').OpeningPlayerPreset[]): Promise<readonly import('@/models/openingPreset').OpeningPlayerPreset[]>;
  generateTravelerTemplate(
    context: import('@/services/ai/travelerTemplate').TravelerTemplateContext,
  ): Promise<import('@/services/ai/travelerTemplate').TravelerTemplateDraft>;
  generateSkillDraft(
    config: import('@/models/settings').API配置项,
    context: import('@/services/ai/skillGenerator').战技生成上下文,
  ): Promise<import('@/services/ai/skillGenerator').战技生成草稿>;
  parseOpeningArchive(
    config: import('@/models/settings').API配置项,
    input: import('@/services/ai/openingArchive').OpeningArchiveParseInput,
    retryCount?: number,
  ): Promise<import('@/models/world').开局整理档案>;
}

// ── Diagnostics ──

export type ApiErrorReportProjection = Readonly<{
  id: string;
  createdAt: string;
  source: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiKeyHint: string;
  status?: number;
  requestUrl?: string;
  requestMode?: 'stream' | 'non-stream' | 'models' | 'test' | 'unknown';
  message: string;
  responseText?: string;
}>;

export interface DiagnosticsUseCases {
  listApiErrorReports(): Promise<readonly ApiErrorReportProjection[]>;
  clearApiErrorReports(): Promise<void>;
}

// ── Content ──

export interface ContentUseCases {
  /** Reusable content references visible to stories (bodies stay in the library). */
  projection(): Promise<Readonly<{ worldbookCount: number; promptModuleCount: number }>>;
  replaceWorldbooks(worldbooks: readonly import('@/models/worldbook').世界书[]): Promise<readonly import('@/models/worldbook').世界书[]>;
  extractRegexScripts(preset: unknown): Promise<readonly import('@/models/stTypes').STRegexScript[]>;
  analyzeRegexScript(script: import('@/models/stTypes').STRegexScript): Promise<TavernRegexScriptSafety>;
  dryRunRegexScript(script: import('@/models/stTypes').STRegexScript, sample: string): Promise<TavernRegexDryRunResult>;
  storyChapterLabel(system: import('@/models/storyWeaving').剧情编织系统): Promise<string>;
  analyzeStoryWeaving(system: import('@/models/storyWeaving').剧情编织系统): Promise<Readonly<{
    planning: import('./storyWeaving').StoryPlanningAnalysis | null;
    diagnostics: import('./storyWeaving').StoryWeavingInjectionDiagnostics | null;
  }>>;
}

export type TavernRegexScriptSafety = Readonly<{
  kind: 'prompt_preprocess' | 'output_postprocess' | 'display_replace' | 'blocked';
  disabled: boolean;
  risky: boolean;
  blocksProtocolTags: boolean;
  reason: string;
}>;

export type TavernRegexDryRunResult = Readonly<{
  ok: boolean;
  safety: TavernRegexScriptSafety;
  matches: number;
  before: string;
  after: string;
  warnings: readonly string[];
  error?: string;
}>;

// ── Cloud ──

export type CloudSaveConfiguration = Readonly<{
  owner: string;
  repo: string;
  branch: string;
  rootPath: string;
  token: string;
}>;

export type CloudSaveItem = Readonly<{
  cloudId: string;
  localSaveId?: number;
  saveType?: string;
  contentHash?: string;
  travelerName: string;
  turnCount: number;
  timestamp: number;
  uploadedAt: string;
  sizeBytes: number;
  path: string;
}>;

export type CloudAccountProjection = Readonly<{
  login: string;
  avatarUrl: string;
  htmlUrl: string;
}>;

export type CloudManifestProjection = Readonly<{
  updatedAt: string;
  saves: readonly CloudSaveItem[];
}>;

export type CloudSyncProgress = Readonly<{
  current: number;
  total: number;
  label: string;
}>;

export interface CloudUseCases {
  isConfigured(): Promise<boolean>;
  configurationForEditor(): Promise<CloudSaveConfiguration | null>;
  updateConfiguration(config: CloudSaveConfiguration): Promise<void>;
  account(token: string): Promise<CloudAccountProjection>;
  bind(token: string): Promise<Readonly<{ config: CloudSaveConfiguration; account: CloudAccountProjection }>>;
  list(config: CloudSaveConfiguration): Promise<CloudManifestProjection>;
  syncAllLocal(config: CloudSaveConfiguration, onProgress: (progress: CloudSyncProgress) => void): Promise<CloudManifestProjection>;
  replaceLocalFromCloud(config: CloudSaveConfiguration, onProgress: (progress: CloudSyncProgress) => void): Promise<Readonly<{ manifest: CloudManifestProjection; restoredCount: number }>>;
}

// ── Host ──

export interface HostUseCases {
  isDesktopRuntime(): boolean;
  loadWorkflowRecoveryJournal(): Promise<import('@/services/workflowRecovery').WorkflowRecoveryJournal | null>;
  readonly getDesktopAppInfo: typeof import('@/services/desktop/desktopBridge').getDesktopAppInfo;
  readonly writeDesktopProbe: typeof import('@/services/desktop/desktopBridge').writeDesktopProbe;
  readonly openDesktopDataDir: typeof import('@/services/desktop/desktopBridge').openDesktopDataDir;
  readonly pickDesktopFolder: typeof import('@/services/desktop/desktopBridge').pickDesktopFolder;
  readonly setDesktopStorageRoots: typeof import('@/services/desktop/desktopBridge').setDesktopStorageRoots;
  readonly checkForDesktopUpdate: typeof import('@/services/desktop/desktopBridge').checkForDesktopUpdate;
  readonly downloadAndInstallDesktopUpdate: typeof import('@/services/desktop/desktopBridge').downloadAndInstallDesktopUpdate;
  readonly buildDesktopReleaseInfo: typeof import('@/services/desktop/desktopReleaseInfo').buildDesktopReleaseInfo;
  readonly listDesktopSaveMirror: typeof import('@/services/desktop/desktopSaveMirror').listDesktopSaveMirror;
  readonly inspectDesktopSaveMirrorHealth: typeof import('@/services/desktop/desktopSaveMirror').inspectDesktopSaveMirrorHealth;
  readonly repairDesktopSaveMirrorIndex: typeof import('@/services/desktop/desktopSaveMirror').repairDesktopSaveMirrorIndex;
  readonly repairUnresolvedDesktopSaveTransactions: typeof import('@/services/desktop/desktopSaveMirror').repairUnresolvedDesktopSaveTransactions;
  readonly inspectDesktopSaveDeltaMirrorHealth: typeof import('@/services/desktop/desktopSaveDeltaMirror').inspectDesktopSaveDeltaMirrorHealth;
  readonly repairDesktopSaveDeltaMirrorIndex: typeof import('@/services/desktop/desktopSaveDeltaMirror').repairDesktopSaveDeltaMirrorIndex;
  readonly listDesktopSettingsMirrorKeys: typeof import('@/services/desktop/desktopSettingsMirror').listDesktopSettingsMirrorKeys;
  readonly listDesktopSpecialSettingMirrors: typeof import('@/services/desktop/desktopSettingsMirror').listDesktopSpecialSettingMirrors;
  readonly listDesktopAssetMirror: typeof import('@/services/desktop/desktopAssetMirror').listDesktopAssetMirror;
  readonly inspectDesktopAssetMirrorHealth: typeof import('@/services/desktop/desktopAssetMirror').inspectDesktopAssetMirrorHealth;
  readonly repairDesktopAssetMirrorIndex: typeof import('@/services/desktop/desktopAssetMirror').repairDesktopAssetMirrorIndex;
  readonly listDesktopSaveBackups: typeof import('@/services/desktop/desktopSaveBackup').listDesktopSaveBackups;
  readonly loadDesktopSaveBackup: typeof import('@/services/desktop/desktopSaveBackup').loadDesktopSaveBackup;
  readonly deleteDesktopSaveBackup: typeof import('@/services/desktop/desktopSaveBackup').deleteDesktopSaveBackup;
  readonly listDesktopMigrationBackups: typeof import('@/services/desktop/desktopMigrationBackup').listDesktopMigrationBackups;
  readonly writeDesktopDiagnosticReport: typeof import('@/services/desktop/desktopDiagnostics').writeDesktopDiagnosticReport;
  readonly listDesktopDiagnosticReports: typeof import('@/services/desktop/desktopDiagnostics').listDesktopDiagnosticReports;
  readonly loadDesktopDiagnosticReport: typeof import('@/services/desktop/desktopDiagnostics').loadDesktopDiagnosticReport;
  readonly deleteDesktopDiagnosticReport: typeof import('@/services/desktop/desktopDiagnostics').deleteDesktopDiagnosticReport;
}

// ── Application root ──

/**
 * The application-facing kernel root: typed capability groups only.
 * React receives this through the single appKernel provider seam.
 */
export interface IKernel {
  readonly sessions: SessionDirectory;
  readonly device: DeviceUseCases;
  readonly saves: SavesUseCases;
  readonly migration: MigrationUseCases;
  readonly content: ContentUseCases;
  readonly onboarding: OnboardingUseCases;
  readonly diagnostics: DiagnosticsUseCases;
  readonly cloud: CloudUseCases;
  readonly host: HostUseCases;
}
