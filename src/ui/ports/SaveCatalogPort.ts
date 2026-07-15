/**
 * Thin save-catalog port for UI cutover (Phase 3 Stage 3.1 / 3.3).
 *
 * NOT Phase 4 SavePackage use case — only facades so presentation code can
 * remove direct dbService imports from SaveLoad/CloudSave/StorageManager.
 *
 * Full save/load package, tree prune, export/import ownership stays behind
 * the dbService adapter until Phase 4 Kernel application use cases own them.
 */

/**
 * Save-list row for UI. Mirrors SaveListItemSummary fields the presentation
 * layer needs without re-exporting dbService types into components.
 */
export type SaveListItem = {
  id: number;
  type: string;
  timestamp: number;
  saveTree?: {
    rootId?: string;
    nodeId?: string;
    parentNodeId?: string;
    [extra: string]: unknown;
  };
  travelerName: string;
  turnCount: number;
  worldPeriodName: string;
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  lastSummary: string;
  sizeBytes: number;
  name?: string;
  // Allow additional summary fields without forcing index signature
  // on every concrete adapter type (SaveListItemSummary has none).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [extra: string]: any;
};

/**
 * Opaque save payload. Host adapters cast to/from 存档数据.
 * Kept unknown so this port does not depend on models/settings.
 */
export type SavePayload = unknown;

/** Options for bulk replace — desktop backup reason stays a plain string. */
export type ReplaceAllSavesOptions = Readonly<{
  skipDesktopBackup?: boolean;
  desktopBackupReason?: string;
}>;

/**
 * Catalog + maintenance operations the UI needs.
 * Desktop return values are intentionally opaque (unknown) so the port
 * does not re-export desktop bridge types; call sites cast as needed.
 */
export interface SaveCatalogPort {
  getSaveList(): Promise<readonly SaveListItem[]>;
  loadSave(id: number): Promise<SavePayload | null>;
  loadLatestSave(): Promise<SavePayload | null>;
  saveGame(data: SavePayload): Promise<number>;
  deleteSave(id: number): Promise<void>;
  hasAnySave(): Promise<boolean>;

  deleteSaveTree(rootId: string): Promise<number>;
  loadSaveTree(rootId: string): Promise<readonly SavePayload[]>;
  replaceAllSaves(
    nextSaves: readonly SavePayload[],
    options?: ReplaceAllSavesOptions,
  ): Promise<void>;

  exportSavePackage(save: SavePayload): Promise<void>;
  exportSaveTreePackage(saves: readonly SavePayload[]): Promise<void>;
  importSaveFileAsMany(file: File): Promise<readonly SavePayload[]>;

  repairSaveDatabase(): Promise<void>;
  rebuildSaveSummariesBatch(batchLimit?: number): Promise<number>;

  backupCurrentSavesToDesktop(reason?: string): Promise<unknown>;
  backupDesktopStateBeforeOneTimeMigration(): Promise<unknown>;
  previewDesktopStateBeforeOneTimeMigration(): Promise<unknown>;
  restoreSavesFromDesktopMirror(): Promise<number>;
  restoreSavesFromDesktopBackup(backupPath: string): Promise<number>;
  summarizeDesktopAssets(): Promise<unknown>;
  cleanupUnreferencedDesktopAssets(): Promise<unknown>;
}
