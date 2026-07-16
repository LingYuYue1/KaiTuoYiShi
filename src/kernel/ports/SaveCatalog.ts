/**
 * Asynchronous save-catalog kernel submodule.
 *
 * NOT Phase 4 SavePackage use case — only facades so presentation code can
 * remove direct dbService imports from SaveLoad/CloudSave/StorageManager.
 *
 * Full save/load package, tree prune, export/import ownership stays behind
 * the dbService adapter until Phase 4 Kernel application use cases own them.
 */

import type { 存档数据, 存档类型 } from '@/models/settings';
import type { 存档树元信息 } from '@/utils/saveTree';
import type { DesktopAssetMaintenanceSummary } from '@/services/desktop/desktopAssetMirror';
import type { DesktopSaveBackupReason, DesktopSaveBackupSummary } from '@/services/desktop/desktopSaveBackup';
import type { DesktopMigrationBackupPreview, DesktopMigrationBackupSummary } from '@/services/desktop/desktopMigrationBackup';

export type SaveListItem = Readonly<{
  id: number;
  type: 存档类型;
  timestamp: number;
  saveTree?: 存档树元信息;
  travelerName: string;
  turnCount: number;
  worldPeriodName: string;
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  lastSummary: string;
  sizeBytes: number;
}>;

export type SavePayload = 存档数据;

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
  replaceAllSaves(nextSaves: readonly SavePayload[]): Promise<void>;

  exportSavePackage(save: SavePayload): Promise<void>;
  exportSaveTreePackage(saves: readonly SavePayload[]): Promise<void>;
  importSaveFileAsMany(file: File): Promise<readonly SavePayload[]>;

  repairSaveDatabase(): Promise<void>;
  rebuildSaveSummariesBatch(batchLimit?: number): Promise<number>;

  backupCurrentSavesToDesktop(reason?: DesktopSaveBackupReason): Promise<DesktopSaveBackupSummary | null>;
  backupDesktopStateBeforeOneTimeMigration(): Promise<DesktopMigrationBackupSummary | null>;
  previewDesktopStateBeforeOneTimeMigration(): Promise<DesktopMigrationBackupPreview | null>;
  restoreSavesFromDesktopMirror(): Promise<number>;
  restoreSavesFromDesktopBackup(backupPath: string): Promise<number>;
  summarizeDesktopAssets(): Promise<DesktopAssetMaintenanceSummary>;
  cleanupUnreferencedDesktopAssets(): Promise<DesktopAssetMaintenanceSummary>;
}
