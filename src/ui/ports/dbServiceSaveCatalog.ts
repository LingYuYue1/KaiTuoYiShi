/**
 * SaveCatalogPort adapter wrapping services/dbService.
 *
 * UI should depend on SaveCatalogPort, not dbService, after Phase 3 cutover.
 * This is a thin facade — no Phase 4 package semantics.
 */

import type {
  ReplaceAllSavesOptions,
  SaveCatalogPort,
  SaveListItem,
  SavePayload,
} from './SaveCatalogPort';

export type SaveCatalogStorage = Readonly<{
  getSaveList: () => Promise<readonly SaveListItem[]>;
  loadSave: (id: number) => Promise<SavePayload | null>;
  loadLatestSave: () => Promise<SavePayload | null>;
  saveGame: (data: SavePayload) => Promise<number>;
  deleteSave: (id: number) => Promise<void>;
  hasAnySave: () => Promise<boolean>;
  deleteSaveTree: (rootId: string) => Promise<number>;
  loadSaveTree: (rootId: string) => Promise<readonly SavePayload[]>;
  replaceAllSaves: (
    nextSaves: readonly SavePayload[],
    options?: ReplaceAllSavesOptions,
  ) => Promise<void>;
  exportSavePackage: (save: SavePayload) => Promise<void>;
  exportSaveTreePackage: (saves: readonly SavePayload[]) => Promise<void>;
  importSaveFileAsMany: (file: File) => Promise<readonly SavePayload[]>;
  repairSaveDatabase: () => Promise<void>;
  rebuildSaveSummariesBatch: (batchLimit?: number) => Promise<number>;
  backupCurrentSavesToDesktop: (reason?: string) => Promise<unknown>;
  backupDesktopStateBeforeOneTimeMigration: () => Promise<unknown>;
  previewDesktopStateBeforeOneTimeMigration: () => Promise<unknown>;
  restoreSavesFromDesktopMirror: () => Promise<number>;
  restoreSavesFromDesktopBackup: (backupPath: string) => Promise<number>;
  summarizeDesktopAssets: () => Promise<unknown>;
  cleanupUnreferencedDesktopAssets: () => Promise<unknown>;
}>;

export class DbServiceSaveCatalog implements SaveCatalogPort {
  constructor(private readonly storage: SaveCatalogStorage) {}

  getSaveList(): Promise<readonly SaveListItem[]> {
    return this.storage.getSaveList();
  }

  loadSave(id: number): Promise<SavePayload | null> {
    return this.storage.loadSave(id);
  }

  loadLatestSave(): Promise<SavePayload | null> {
    return this.storage.loadLatestSave();
  }

  saveGame(data: SavePayload): Promise<number> {
    return this.storage.saveGame(data);
  }

  deleteSave(id: number): Promise<void> {
    return this.storage.deleteSave(id);
  }

  hasAnySave(): Promise<boolean> {
    return this.storage.hasAnySave();
  }

  deleteSaveTree(rootId: string): Promise<number> {
    return this.storage.deleteSaveTree(rootId);
  }

  loadSaveTree(rootId: string): Promise<readonly SavePayload[]> {
    return this.storage.loadSaveTree(rootId);
  }

  replaceAllSaves(
    nextSaves: readonly SavePayload[],
    options?: ReplaceAllSavesOptions,
  ): Promise<void> {
    return this.storage.replaceAllSaves(nextSaves, options);
  }

  exportSavePackage(save: SavePayload): Promise<void> {
    return this.storage.exportSavePackage(save);
  }

  exportSaveTreePackage(saves: readonly SavePayload[]): Promise<void> {
    return this.storage.exportSaveTreePackage(saves);
  }

  importSaveFileAsMany(file: File): Promise<readonly SavePayload[]> {
    return this.storage.importSaveFileAsMany(file);
  }

  repairSaveDatabase(): Promise<void> {
    return this.storage.repairSaveDatabase();
  }

  rebuildSaveSummariesBatch(batchLimit?: number): Promise<number> {
    return this.storage.rebuildSaveSummariesBatch(batchLimit);
  }

  backupCurrentSavesToDesktop(reason?: string): Promise<unknown> {
    return this.storage.backupCurrentSavesToDesktop(reason);
  }

  backupDesktopStateBeforeOneTimeMigration(): Promise<unknown> {
    return this.storage.backupDesktopStateBeforeOneTimeMigration();
  }

  previewDesktopStateBeforeOneTimeMigration(): Promise<unknown> {
    return this.storage.previewDesktopStateBeforeOneTimeMigration();
  }

  restoreSavesFromDesktopMirror(): Promise<number> {
    return this.storage.restoreSavesFromDesktopMirror();
  }

  restoreSavesFromDesktopBackup(backupPath: string): Promise<number> {
    return this.storage.restoreSavesFromDesktopBackup(backupPath);
  }

  summarizeDesktopAssets(): Promise<unknown> {
    return this.storage.summarizeDesktopAssets();
  }

  cleanupUnreferencedDesktopAssets(): Promise<unknown> {
    return this.storage.cleanupUnreferencedDesktopAssets();
  }
}

/**
 * Production factory: lazy-imports dbService.
 * Casts are intentional — 存档数据 stays behind the opaque SavePayload boundary.
 */
export async function createDbServiceSaveCatalog(): Promise<SaveCatalogPort> {
  const db = await import('@/services/dbService');
  return new DbServiceSaveCatalog({
    getSaveList: async () =>
      (await db.getSaveList()) as unknown as readonly SaveListItem[],
    loadSave: async (id) =>
      (await db.loadSave(id)) as unknown as SavePayload | null,
    loadLatestSave: async () =>
      (await db.loadLatestSave()) as unknown as SavePayload | null,
    saveGame: (data) => db.saveGame(data as never),
    deleteSave: (id) => db.deleteSave(id),
    hasAnySave: () => db.hasAnySave(),
    deleteSaveTree: (rootId) => db.deleteSaveTree(rootId),
    loadSaveTree: async (rootId) =>
      (await db.loadSaveTree(rootId)) as unknown as readonly SavePayload[],
    replaceAllSaves: (nextSaves, options) =>
      db.replaceAllSaves(nextSaves as never, options as never),
    exportSavePackage: (save) => db.exportSavePackage(save as never),
    exportSaveTreePackage: (saves) => db.exportSaveTreePackage(saves as never),
    importSaveFileAsMany: async (file) =>
      (await db.importSaveFileAsMany(file)) as unknown as readonly SavePayload[],
    repairSaveDatabase: () => db.repairSaveDatabase(),
    rebuildSaveSummariesBatch: (batchLimit) => db.rebuildSaveSummariesBatch(batchLimit),
    backupCurrentSavesToDesktop: (reason) =>
      db.backupCurrentSavesToDesktop(reason as never),
    backupDesktopStateBeforeOneTimeMigration: () =>
      db.backupDesktopStateBeforeOneTimeMigration(),
    previewDesktopStateBeforeOneTimeMigration: () =>
      db.previewDesktopStateBeforeOneTimeMigration(),
    restoreSavesFromDesktopMirror: () => db.restoreSavesFromDesktopMirror(),
    restoreSavesFromDesktopBackup: (path) => db.restoreSavesFromDesktopBackup(path),
    summarizeDesktopAssets: () => db.summarizeDesktopAssets(),
    cleanupUnreferencedDesktopAssets: () => db.cleanupUnreferencedDesktopAssets(),
  });
}

export function createSaveCatalogFromStorage(
  storage: SaveCatalogStorage,
): SaveCatalogPort {
  return new DbServiceSaveCatalog(storage);
}
