import type { SaveCatalogPort } from '@/src/kernel/ports/SaveCatalog';

/** Bind the existing storage driver once at the browser composition edge. */
export async function createDbServiceSaveCatalog(): Promise<SaveCatalogPort> {
  const db = await import('@/services/dbService');
  return {
    getSaveList: db.getSaveList,
    loadSave: db.loadSave,
    loadLatestSave: db.loadLatestSave,
    saveGame: db.saveGame,
    deleteSave: db.deleteSave,
    hasAnySave: db.hasAnySave,
    deleteSaveTree: db.deleteSaveTree,
    loadSaveTree: db.loadSaveTree,
    replaceAllSaves: (saves) => db.replaceAllSaves([...saves]),
    exportSavePackage: db.exportSavePackage,
    exportSaveTreePackage: (saves) => db.exportSaveTreePackage([...saves]),
    importSaveFileAsMany: db.importSaveFileAsMany,
    repairSaveDatabase: db.repairSaveDatabase,
    rebuildSaveSummariesBatch: db.rebuildSaveSummariesBatch,
    backupCurrentSavesToDesktop: db.backupCurrentSavesToDesktop,
    backupDesktopStateBeforeOneTimeMigration: db.backupDesktopStateBeforeOneTimeMigration,
    previewDesktopStateBeforeOneTimeMigration: db.previewDesktopStateBeforeOneTimeMigration,
    restoreSavesFromDesktopMirror: db.restoreSavesFromDesktopMirror,
    restoreSavesFromDesktopBackup: db.restoreSavesFromDesktopBackup,
    summarizeDesktopAssets: db.summarizeDesktopAssets,
    cleanupUnreferencedDesktopAssets: db.cleanupUnreferencedDesktopAssets,
  };
}
