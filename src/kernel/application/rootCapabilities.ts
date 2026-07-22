/**
 * Root capability implementations.
 * Thin typed use cases over ports and host services — composed once in appKernel.
 */

import type { 存档数据 } from '@/models/settings';
import type { SaveCatalogPort } from '@/src/kernel/ports/SaveCatalog';
import type { KernelSessionDirectory } from './sessionDirectory';
import { hydrateRuntimeZhiku } from '@/data/zhikuPreset';
import type {
  CloudUseCases,
  ContentUseCases,
  DiagnosticsUseCases,
  OnboardingUseCases,
  SavesUseCases,
  SaveSummary,
} from '@/src/kernel/contract/rootCapabilities';
import type { HostUseCases } from '@/src/kernel/contract/rootCapabilities';
import type { PreferenceStore } from '@/src/kernel/ports/PreferenceStore';
import { createStoryState, type NewStorySeed, type StoryState } from '@/src/kernel/domain/session/storyState';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';
import { CONTENT_LIBRARY_KEY } from '@/src/kernel/adapters/browser/PreferenceExecutionContextProvider';
import { createDefaultSettingsPlanes, type ContentLibrary } from '@/models/settingsPlanes';
import { OPENING_PLAYER_PRESETS_KEY, type OpeningPlayerPreset } from '@/models/openingPreset';
import { buildDesktopReleaseInfo } from '@/services/desktop/desktopReleaseInfo';
import type { Clock } from '@/src/kernel/ports/Clock';
import type { KernelLogger } from '@/src/kernel/ports/KernelLogger';
import type { KernelLogProjection } from '@/src/kernel/contract/logging';
import { SAVE_POLICY_KEY } from '@/src/kernel/adapters/browser/PreferenceExecutionContextProvider';
import type { SavePolicy } from '@/models/settingsPlanes';
import { createPortableSave } from './portableSave';

export function createSavesUseCases(catalog: SaveCatalogPort, sessions: KernelSessionDirectory, preferences: PreferenceStore, clock: Clock): SavesUseCases {
  return {
    async list(): Promise<readonly SaveSummary[]> {
      const items = await catalog.getSaveList();
      return structuredClone(items);
    },
    saveStory: (save: 存档数据) => catalog.saveGame(save),
    async saveSession(sessionId, type) {
      return catalog.saveGame(createPortableSave(await sessions.readStory(sessionId), type, clock.now()));
    },
    async followAutosave(session) {
      let pending = Promise.resolve();
      await session.projection.current();
      return session.projection.subscribe((commit) => {
        if (!isTurnCommit(commit.cause)) return;
        pending = pending.then(async () => {
          const policy = (await preferences.get<SavePolicy>(SAVE_POLICY_KEY)) ?? createDefaultSettingsPlanes().save;
          if (!policy.autosaveOnTurn) return;
          await catalog.saveGame(createPortableSave(await sessions.readStory(session.id), 'auto', clock.now()));
        }).catch((error: unknown) => {
          console.error('Autosave subscriber failed:', error);
        });
      });
    },
    loadStory: (id: number) => catalog.loadSave(id),
    deleteStory: (id: number) => catalog.deleteSave(id),
    async exportStory(id) {
      const save = await catalog.loadSave(id);
      if (!save) throw new Error(`Save not found: ${id}`);
      await catalog.exportSavePackage(save);
    },
    deleteTree: (rootId) => catalog.deleteSaveTree(rootId),
    async exportTree(rootId) {
      const saves = await catalog.loadSaveTree(rootId);
      if (saves.length === 0) throw new Error(`Save tree not found: ${rootId}`);
      await catalog.exportSaveTreePackage(saves);
    },
    async importAndPersist(file) {
      const imported = await catalog.importSaveFileAsMany(file);
      const now = clock.now();
      for (let index = 0; index < imported.length; index += 1) {
        await catalog.saveGame({
          ...imported[index],
          id: 0,
          type: 'imported',
          timestamp: now + index,
        });
      }
      return imported.length;
    },
    repairCatalog: () => catalog.repairSaveDatabase(),
    rebuildSummaries: (batchLimit) => catalog.rebuildSaveSummariesBatch(batchLimit),
    summarizeDesktopAssets: () => catalog.summarizeDesktopAssets(),
    cleanupDesktopAssets: () => catalog.cleanupUnreferencedDesktopAssets(),
    previewDesktopMigrationBackup: () => catalog.previewDesktopStateBeforeOneTimeMigration(),
    backupDesktop: (reason) => catalog.backupCurrentSavesToDesktop(reason),
    backupDesktopMigration: () => catalog.backupDesktopStateBeforeOneTimeMigration(),
    restoreDesktopMirror: () => catalog.restoreSavesFromDesktopMirror(),
    restoreDesktopBackup: (path) => catalog.restoreSavesFromDesktopBackup(path),
    async restoreIntoSession(id, sessionId) {
      const save = await catalog.loadSave(id);
      if (!save) throw new Error(`Save not found: ${id}`);
      const story = await storyFromSave(save);
      return sessions.restore(sessionId, story);
    },
  };
}

function isTurnCommit(cause: string): boolean {
  return cause === 'turn.advance' || cause === 'turn.reroll' || cause === 'path.awakening.enter';
}

async function storyFromSave(save: 存档数据): Promise<StoryState> {
  return {
    traveler: save.旅人,
    world: save.世界,
    conversation: {
      history: save.chatHistory,
      turnJournal: save.turnJournal,
      turnCount: save.turnCount!,
    },
    memory: { system: save.记忆, yiting: save.忆庭! },
    characters: { npcs: save.NPC! },
    phone: save.手机!,
    album: save.相册!,
    news: save.新闻!,
    plot: { nodes: save.剧情!, weaving: save.剧情编织! },
    systems: { variableBatches: save.variableBatches! },
    turn: { pendingOpeningTrigger: save.pendingOpeningTrigger },
    policy: save.policy,
    content: {
      zhikuRuntime: await hydrateRuntimeZhiku(save.智库),
      worldbookTriggerStates: save.worldbookTriggerStates,
    },
    jobs: { records: save.jobs },
  };
}

export function createOnboardingUseCases(preferences: PreferenceStore): OnboardingUseCases {
  return {
    prepareStoryState(seed: NewStorySeed): StoryState {
      if (!seed.traveler?.姓名?.trim()) throw new Error('开局需要旅人姓名');
      if (!seed.world) throw new Error('开局需要世界状态');
      if (!seed.zhikuRuntime) throw new Error('开局需要已水合的智库运行时');
      return createStoryState(seed);
    },
    async loadOpeningPresets() {
      const presets = await preferences.get<OpeningPlayerPreset[]>(OPENING_PLAYER_PRESETS_KEY);
      return Array.isArray(presets) ? structuredClone(presets) : [];
    },
    async replaceOpeningPresets(presets) {
      const next = structuredClone(presets);
      await preferences.set(OPENING_PLAYER_PRESETS_KEY, next);
      return next;
    },
    async generateTravelerTemplate(context) {
      const api = await preferences.get<import('@/models/settings').API设置>('apiSettings');
      const activeId = api?.activeConfigId;
      if (!activeId) throw new Error('请先在设置中选择主剧情 API。');
      const config = api.configs.find((candidate) => candidate.id === activeId);
      if (!config) throw new Error(`找不到主剧情 API 配置：${activeId}`);
      const module = await import('@/services/ai/travelerTemplate');
      return module.generateTravelerTemplate(config, context);
    },
    async generateSkillDraft(config, context) {
      const module = await import('@/services/ai/skillGenerator');
      return module.generateSkillDraft(config, context);
    },
    async parseOpeningArchive(config, input, retryCount) {
      const module = await import('@/services/ai/openingArchive');
      return module.parseOpeningArchiveWithAI(config, input, retryCount);
    },
  };
}

export function createDiagnosticsUseCases(logger: KernelLogger, logs: KernelLogProjection): DiagnosticsUseCases {
  return {
    async listApiErrorReports() {
      const module = await import('@/services/ai/apiErrorReportService');
      return module.loadApiErrorReports();
    },
    async clearApiErrorReports(): Promise<void> {
      const module = await import('@/services/ai/apiErrorReportService');
      await module.clearApiErrorReports();
    },
    recordKernelLog(input) {
      logger.write(input);
    },
    listKernelLogs() {
      return logs.list();
    },
    subscribeKernelLogs(listener) {
      return logs.subscribe(listener);
    },
    clearKernelLogs() {
      logs.clear();
    },
  };
}

export function createContentUseCases(preferences: PreferenceStore): ContentUseCases {
  return {
    async projection() {
      const content = (await preferences.get<ContentLibrary>(CONTENT_LIBRARY_KEY)) ?? createDefaultSettingsPlanes().content;
      return {
        worldbookCount: content.worldbooks.length,
        promptModuleCount: content.promptModules.length,
      };
    },
    async replaceWorldbooks(worldbooks) {
      const next = structuredClone(worldbooks);
      const content = (await preferences.get<ContentLibrary>(CONTENT_LIBRARY_KEY)) ?? createDefaultSettingsPlanes().content;
      await preferences.set(CONTENT_LIBRARY_KEY, { ...content, worldbooks: next });
      return next;
    },
    async extractRegexScripts(preset) {
      const regex = await import('@/src/kernel/workflows/tavernRegexProcessor');
      return regex.extractTavernRegexScripts(preset);
    },
    async analyzeRegexScript(script) {
      const regex = await import('@/src/kernel/workflows/tavernRegexProcessor');
      return regex.analyzeTavernRegexScript(script);
    },
    async dryRunRegexScript(script, sample) {
      const regex = await import('@/src/kernel/workflows/tavernRegexProcessor');
      return regex.dryRunTavernRegexScript(script, sample);
    },
    async storyChapterLabel(system) {
      const storyProgress = await import('@/src/kernel/domain/story/storyProgress');
      return storyProgress.getCurrentStoryChapterLabel(system);
    },
    async analyzeStoryWeaving(system) {
      const [planning, weaving] = await Promise.all([
        import('@/src/kernel/domain/story/storyPlanningAnalysis'),
        import('@/src/kernel/workflows/storyWeaving'),
      ]);
      return {
        planning: planning.buildStoryPlanningAnalysis(system),
        diagnostics: weaving.getStoryWeavingInjectionDiagnostics(system),
      };
    },
  };
}

export function createCloudUseCases(preferences: PreferenceStore, catalog: SaveCatalogPort): CloudUseCases {
  return {
    async isConfigured(): Promise<boolean> {
      const config = await preferences.get<{ token?: string; repo?: string }>('githubCloudSaveConfig');
      return Boolean(config?.token && config?.repo);
    },
    async configurationForEditor() {
      const config = await preferences.get<{
        owner: string;
        repo: string;
        branch: string;
        rootPath: string;
        token: string;
      }>('githubCloudSaveConfig');
      return config ? structuredClone(config) : null;
    },
    async updateConfiguration(config): Promise<void> {
      await preferences.set('githubCloudSaveConfig', structuredClone(config));
    },
    async account(token) {
      const cloud = await import('@/services/githubCloudSave');
      return cloud.getGitHubAccountInfo(token);
    },
    async bind(token) {
      const cloud = await import('@/services/githubCloudSave');
      return cloud.bindGitHubCloudAccount(token);
    },
    async list(config) {
      const cloud = await import('@/services/githubCloudSave');
      const manifest = await cloud.listGitHubCloudSaves(config);
      return { updatedAt: manifest.updatedAt, saves: manifest.saves };
    },
    async syncAllLocal(config, onProgress) {
      const cloud = await import('@/services/githubCloudSave');
      const summaries = await catalog.getSaveList();
      if (summaries.length === 0) throw new Error('本地还没有可上传的存档。');
      const saves: 存档数据[] = [];
      for (const summary of summaries) {
        const save = await catalog.loadSave(summary.id);
        if (!save) throw new Error(`本地存档目录与内容不一致：${summary.id}`);
        saves.push({ ...save, id: summary.id, type: summary.type });
      }
      const manifest = await cloud.uploadAllSavesToGitHubCloud(
        config,
        saves,
        (current, total, label) => onProgress({ current, total, label }),
      );
      return { updatedAt: manifest.updatedAt, saves: manifest.saves };
    },
    async replaceLocalFromCloud(config, onProgress) {
      const cloud = await import('@/services/githubCloudSave');
      const manifest = await cloud.listGitHubCloudSaves(config);
      if (manifest.saves.length === 0) throw new Error('云端还没有可下载的存档。');
      const downloaded: 存档数据[] = [];
      for (let index = 0; index < manifest.saves.length; index += 1) {
        const item = manifest.saves[index];
        const label = `${item.travelerName || 'traveler'} · 第 ${item.turnCount} 回合`;
        onProgress({ label, current: index, total: manifest.saves.length });
        const data = await cloud.downloadSaveFromGitHubCloud(config, item);
        downloaded.push({
          ...data,
          id: item.localSaveId ?? index + 1,
          type: item.saveType === 'auto' || item.saveType === 'backup' || item.saveType === 'imported'
            ? item.saveType
            : 'manual',
          timestamp: item.timestamp || data.timestamp,
        });
        onProgress({ label, current: index + 1, total: manifest.saves.length });
      }
      await catalog.replaceAllSaves(downloaded);
      return {
        manifest: { updatedAt: manifest.updatedAt, saves: manifest.saves },
        restoredCount: downloaded.length,
      };
    },
  };
}

export function createHostUseCases(): HostUseCases {
  return {
    isDesktopRuntime: () => isDesktopRuntime(),
    loadWorkflowRecoveryJournal: () => import('@/services/workflowRecovery').then((module) => module.loadWorkflowRecoveryJournal()),
    getDesktopAppInfo: (...args) => import('@/services/desktop/desktopBridge').then((module) => module.getDesktopAppInfo(...args)),
    writeDesktopProbe: (...args) => import('@/services/desktop/desktopBridge').then((module) => module.writeDesktopProbe(...args)),
    openDesktopDataDir: (...args) => import('@/services/desktop/desktopBridge').then((module) => module.openDesktopDataDir(...args)),
    pickDesktopFolder: (...args) => import('@/services/desktop/desktopBridge').then((module) => module.pickDesktopFolder(...args)),
    setDesktopStorageRoots: (...args) => import('@/services/desktop/desktopBridge').then((module) => module.setDesktopStorageRoots(...args)),
    checkForDesktopUpdate: (...args) => import('@/services/desktop/desktopBridge').then((module) => module.checkForDesktopUpdate(...args)),
    downloadAndInstallDesktopUpdate: (...args) => import('@/services/desktop/desktopBridge').then((module) => module.downloadAndInstallDesktopUpdate(...args)),
    buildDesktopReleaseInfo,
    listDesktopSaveMirror: (...args) => import('@/services/desktop/desktopSaveMirror').then((module) => module.listDesktopSaveMirror(...args)),
    inspectDesktopSaveMirrorHealth: (...args) => import('@/services/desktop/desktopSaveMirror').then((module) => module.inspectDesktopSaveMirrorHealth(...args)),
    repairDesktopSaveMirrorIndex: (...args) => import('@/services/desktop/desktopSaveMirror').then((module) => module.repairDesktopSaveMirrorIndex(...args)),
    repairUnresolvedDesktopSaveTransactions: (...args) => import('@/services/desktop/desktopSaveMirror').then((module) => module.repairUnresolvedDesktopSaveTransactions(...args)),
    inspectDesktopSaveDeltaMirrorHealth: (...args) => import('@/services/desktop/desktopSaveDeltaMirror').then((module) => module.inspectDesktopSaveDeltaMirrorHealth(...args)),
    repairDesktopSaveDeltaMirrorIndex: (...args) => import('@/services/desktop/desktopSaveDeltaMirror').then((module) => module.repairDesktopSaveDeltaMirrorIndex(...args)),
    listDesktopSettingsMirrorKeys: (...args) => import('@/services/desktop/desktopSettingsMirror').then((module) => module.listDesktopSettingsMirrorKeys(...args)),
    listDesktopSpecialSettingMirrors: (...args) => import('@/services/desktop/desktopSettingsMirror').then((module) => module.listDesktopSpecialSettingMirrors(...args)),
    listDesktopAssetMirror: (...args) => import('@/services/desktop/desktopAssetMirror').then((module) => module.listDesktopAssetMirror(...args)),
    inspectDesktopAssetMirrorHealth: (...args) => import('@/services/desktop/desktopAssetMirror').then((module) => module.inspectDesktopAssetMirrorHealth(...args)),
    repairDesktopAssetMirrorIndex: (...args) => import('@/services/desktop/desktopAssetMirror').then((module) => module.repairDesktopAssetMirrorIndex(...args)),
    listDesktopSaveBackups: (...args) => import('@/services/desktop/desktopSaveBackup').then((module) => module.listDesktopSaveBackups(...args)),
    loadDesktopSaveBackup: (...args) => import('@/services/desktop/desktopSaveBackup').then((module) => module.loadDesktopSaveBackup(...args)),
    deleteDesktopSaveBackup: (...args) => import('@/services/desktop/desktopSaveBackup').then((module) => module.deleteDesktopSaveBackup(...args)),
    listDesktopMigrationBackups: (...args) => import('@/services/desktop/desktopMigrationBackup').then((module) => module.listDesktopMigrationBackups(...args)),
    writeDesktopDiagnosticReport: (...args) => import('@/services/desktop/desktopDiagnostics').then((module) => module.writeDesktopDiagnosticReport(...args)),
    listDesktopDiagnosticReports: (...args) => import('@/services/desktop/desktopDiagnostics').then((module) => module.listDesktopDiagnosticReports(...args)),
    loadDesktopDiagnosticReport: (...args) => import('@/services/desktop/desktopDiagnostics').then((module) => module.loadDesktopDiagnosticReport(...args)),
    deleteDesktopDiagnosticReport: (...args) => import('@/services/desktop/desktopDiagnostics').then((module) => module.deleteDesktopDiagnosticReport(...args)),
  };
}
