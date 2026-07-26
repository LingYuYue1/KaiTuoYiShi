import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const checks = [];

const dbService = read('services/dbService.ts');
const saveMirror = read('services/desktop/desktopSaveMirror.ts');
const saveDeltaMirror = read('services/desktop/desktopSaveDeltaMirror.ts');
const settingsMirror = read('services/desktop/desktopSettingsMirror.ts');
const assetMirror = read('services/desktop/desktopAssetMirror.ts');
const storageAdapter = read('services/storage/appStorageAdapter.ts');
const desktopBridge = read('services/desktop/desktopBridge.ts');
const savePackage = read('services/savePackage.ts');
const migrationBackup = read('services/desktop/desktopMigrationBackup.ts');
const storageManager = read('components/features/Settings/StorageManager.tsx');
const diagnostics = read('services/desktop/desktopDiagnostics.ts');
const saveCatalogSection = dbService.slice(
  dbService.indexOf('export async function getSaveCatalogSnapshot'),
  dbService.indexOf('export async function loadSave'),
);

addCheck({
  status: 'desktop-first',
  label: 'save list reads',
  detail: 'getSaveList reads desktop save mirror summaries before IndexedDB summaries.',
  ok: ordered(saveCatalogSection, 'const desktopList = await loadDesktopSaveMirrorListFirstSafely()', 'const db = await openDB()'),
});

addCheck({
  status: 'desktop-first',
  label: 'single save reads',
  detail: 'loadSave reads an individual desktop mirrored save before opening IndexedDB.',
  ok: ordered(dbService, 'const desktopSave = await loadDesktopSaveMirrorSaveFirstSafely(id)', 'const db = await openDB();\n  const save = await loadRawSave(db, id)'),
});

addCheck({
  status: 'file-primary',
  label: 'save writes',
  detail: 'desktop saveGame writes new save records into desktop files before updating IndexedDB as a compatibility cache.',
  ok: ordered(dbService, 'await writeDesktopPrimarySaveBeforeIndexedDbSafely(desktopPrimarySave, desktopPrimaryDelta, assetRecords)', 'const saveForIndexedDb = desktopSaveId ? { ...rest, id: desktopSaveId } : rest')
    && ordered(dbService, 'await writeDesktopPrimarySaveBeforeIndexedDbSafely(desktopPrimarySave, desktopPrimaryDelta, assetRecords)', 'saved = await new Promise<{ id: number; save:')
    && dbService.includes('IndexedDB compatibility save failed after desktop primary write'),
});

addCheck({
  status: 'file-primary',
  label: 'indexeddb cache rebuild',
  detail: 'desktop mirrored save files can rebuild the IndexedDB compatibility cache after restoring local asset payloads and backing up current data.',
  ok: all(dbService, ['rebuildIndexedSaveCacheFromDesktopMirror', 'loadDesktopSaveMirrorSaves', 'restoreDesktopAssetPayloadForSavesSafely'])
    && ordered(dbService, 'await backupCurrentSavesToDesktop(\'before-restore\')', 'const restoredSaves = await restoreDesktopAssetPayloadForSavesSafely(mirroredSaves)')
    && ordered(dbService, 'const restoredSaves = await restoreDesktopAssetPayloadForSavesSafely(mirroredSaves)', 'await replaceAllSaves(restoredSaves, { skipDesktopBackup: true })')
    && dbService.includes('return rebuildIndexedSaveCacheFromDesktopMirror();'),
});

addCheck({
  status: 'file-primary',
  label: 'desktop save mirror files',
  detail: 'desktop saves have a file index and per-save JSON records under saves/.',
  ok: all(saveMirror, ["INDEX_PATH = 'saves/index.json'", 'saves/save-${id}.json', "kind: 'kaituoyishi-desktop-save'"]),
});

addCheck({
  status: 'file-primary',
  label: 'save transaction markers',
  detail: 'desktop saveGame writes pending transaction markers before multi-file save writes and clears them after save, delta, and asset files are written.',
  ok: all(saveMirror, ["TRANSACTION_DIR = 'saves/transactions'", "kind: 'kaituoyishi-desktop-save-transaction'", 'beginDesktopSaveTransaction', 'finishDesktopSaveTransaction', 'pendingTransactions', 'unreadableTransactions', 'expectedDeltaNodeId', 'expectedAssetIds'])
    && dbService.includes('transactionId = await beginDesktopSaveTransaction(Number(save.id) || 0, {')
    && dbService.includes('await mirrorAssetRecordsToDesktop(assetRecords);\n    await finishDesktopSaveTransaction(Number(save.id) || 0, transactionId);'),
});

addCheck({
  status: 'file-primary',
  label: 'save transaction completeness',
  detail: 'leftover desktop save transactions are cleared only after the save body, expected delta record, and expected asset files are all readable.',
  ok: all(saveMirror, ['isDesktopSaveTransactionComplete', 'isExpectedDeltaMirrorComplete', 'areExpectedAssetMirrorsComplete', "adapter.readJson<DesktopAssetMirrorIndexForTransaction>('assets/index.json')", 'adapter.readBase64File(summary.path)'])
    && dbService.includes('deltaNodeId: delta?.nodeId')
    && dbService.includes('assetIds: assetRecords.map((record) => record.id).filter(Boolean)'),
});

addCheck({
  status: 'file-primary',
  label: 'save transaction cleanup',
  detail: 'desktop index repair can remove completed leftover transaction markers while retaining unresolved markers for diagnostics.',
  ok: all(saveMirror, ['cleanupCompletedDesktopSaveTransactions', 'DesktopSaveTransactionRepairSummary', 'removedTransactions', 'retainedTransactions', 'unreadableTransactions'])
    && read('components/features/Settings/StorageManager.tsx').includes('repairUnresolvedDesktopSaveTransactions')
    && read('components/features/Settings/StorageManager.tsx').includes('repairedTransactions.removedTransactions'),
});

addCheck({
  status: 'file-primary',
  label: 'save transaction automatic repair',
  detail: 'desktop index repair has a conservative unresolved transaction repair entrypoint that rebuilds save indexes before clearing only completed markers.',
  ok: all(saveMirror, ['repairUnresolvedDesktopSaveTransactions', 'rebuildMirrorIndexFromSaveFiles(adapter)', 'writeSaveSequence(getMaxSaveId(index.saves), adapter)', 'cleanupCompletedDesktopSaveTransactions(adapter)'])
    && read('components/features/Settings/StorageManager.tsx').includes('repairUnresolvedDesktopSaveTransactions'),
});

addCheck({
  status: 'file-primary',
  label: 'repair backup guard',
  detail: 'desktop restore, replacement, and index repair paths create a local save backup before replacing data or repairing desktop mirrors.',
  ok: dbService.includes("backupCurrentSavesToDesktop('before-restore')")
    && dbService.includes("desktopBackupReason ?? 'before-replace'")
    && read('components/features/Settings/StorageManager.tsx').includes("await backupCurrentSavesToDesktop('before-repair')")
    && read('services/desktop/desktopSaveBackup.ts').includes("'before-repair'"),
});

addCheck({
  status: 'file-primary',
  label: 'desktop save id sequence',
  detail: 'desktop save ids are reserved through saves/sequence.json before the IndexedDB compatibility write.',
  ok: all(saveMirror, ["SEQUENCE_PATH = 'saves/sequence.json'", "kind: 'kaituoyishi-desktop-save-sequence'", 'reserveDesktopSaveId'])
    && ordered(dbService, 'const desktopSaveId = await reserveDesktopSaveIdSafely(db)', 'saved = await new Promise<{ id: number; save:')
    && ordered(dbService, 'const saveForIndexedDb = desktopSaveId ? { ...rest, id: desktopSaveId } : rest', 'const request = store.add(saveForIndexedDb as'),
});

addCheck({
  status: 'desktop-first',
  label: 'settings reads',
  detail: 'loadSetting reads desktop config mirrors before IndexedDB.',
  ok: ordered(dbService, 'const desktopValue = await loadDesktopSettingFirstSafely<T>(key)', 'const db = await openDB();\n  const indexedValue = await new Promise<T | null>'),
});

addCheck({
  status: 'file-primary',
  label: 'settings writes',
  detail: 'desktop saveSetting writes desktop config files first, then updates IndexedDB as a compatibility cache.',
  ok: ordered(dbService, 'await mirrorSettingToDesktop(key, value)', 'await cacheIndexedSettingSafely(key, value)')
    && ordered(dbService, 'await removeSettingFromDesktopMirror(key)', 'await deleteIndexedSettingSafely(key)'),
});

addCheck({
  status: 'file-primary',
  label: 'large setting files',
  detail: 'large desktop settings are split into dedicated zhiku/worldbooks files.',
  ok: all(settingsMirror, ["SETTINGS_PATH = 'config/settings.json'", "zhikuSystem: 'zhiku/system.json'", "worldbooks: 'worldbooks/worldbooks.json'", 'omitSpecialSettingKeys(settings)']),
});

addCheck({
  status: 'file-primary',
  label: 'image asset files',
  detail: 'generated image assets are mirrored as real files plus metadata under assets/generated-images/.',
  ok: all(assetMirror, ["INDEX_PATH = 'assets/index.json'", 'assets/generated-images/${sanitizeAssetId(id)}.${extensionForMimeType(mimeType)}', 'assets/generated-images/${sanitizeAssetId(id)}.meta.json']),
});

addCheck({
  status: 'desktop-first',
  label: 'asset payload restore',
  detail: 'save loading restores missing image payloads from desktop asset files when needed.',
  ok: all(dbService, ['restoreDesktopAssetPayloadSafely', 'loadDesktopAssetRecordsSafely', 'restoreSaveAssetPayloadFromRecords']),
});

addCheck({
  status: 'file-primary',
  label: 'desktop delta mirror files',
  detail: 'save node deltas now have a desktop file mirror under saves/deltas/.',
  ok: all(saveDeltaMirror, ["INDEX_PATH = 'saves/deltas/index.json'", 'saves/deltas/delta-${encodeURIComponent(nodeId)}.json', "kind: 'kaituoyishi-desktop-save-delta'"]),
});

addCheck({
  status: 'desktop-first',
  label: 'delta node reads',
  detail: 'delta restore reads the desktop delta mirror before falling back to IndexedDB.',
  ok: ordered(dbService, 'const desktopDelta = await loadDesktopSaveNodeDeltaSafely(nodeId)', "const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly')"),
});

addCheck({
  status: 'desktop-first',
  label: 'delta base candidates',
  detail: 'auto-save delta base selection merges desktop mirror summaries and falls back to mirrored saves when IndexedDB records are missing.',
  ok: all(dbService, ['loadDeltaBaseCandidateSummaries', 'loadDeltaBaseCandidateSave'])
    && ordered(dbService, 'const desktopSummaries = await loadDesktopSaveMirrorListFirstSafely()', 'return sortSaveSummaries(Array.from(byId.values()))')
    && ordered(dbService, 'const indexedSave = await loadRawSave(db, id)', 'return loadDesktopSaveMirrorSaveFallbackSafely(id)'),
});

addCheck({
  status: 'desktop-first',
  label: 'delta base restore',
  detail: 'delta-only save restore loads base saves through the desktop fallback helper before merging delta payloads.',
  ok: ordered(dbService, 'const rawBase = await loadDeltaBaseCandidateSave(db, baseSaveId)', 'return restoreSaveFromDelta(base, save, delta)'),
});

addCheck({
  status: 'file-primary',
  label: 'delta node writes',
  detail: 'new desktop save node deltas are written to desktop files before the IndexedDB compatibility cache.',
  ok: dbService.includes('await mirrorSaveNodeDeltaToDesktop(delta)')
    && ordered(dbService, 'const desktopPrimaryDelta = desktopPrimaryStoredSave', 'await writeDesktopPrimarySaveBeforeIndexedDbSafely(desktopPrimarySave, desktopPrimaryDelta, assetRecords)'),
});

addCheck({
  status: 'indexeddb-primary',
  label: 'delta node source of truth',
  detail: 'legacy replacement and repair paths still keep IndexedDB saveNodeDeltas as a compatibility source, scanned by cursor to avoid loading every delta payload at once.',
  ok: all(dbService, ["const SAVE_NODE_DELTAS_STORE = 'saveNodeDeltas'", 'db.createObjectStore(SAVE_NODE_DELTAS_STORE', 'tx.objectStore(SAVE_NODE_DELTAS_STORE)', 'scanIndexedDeltaRecords', 'openCursor()']),
});

addCheck({
  status: 'file-primary',
  label: 'desktop file bridge',
  detail: 'desktop storage uses the Tauri bridge with sanitized app data paths and atomic text writes.',
  ok: all(storageAdapter, ['class DesktopAppStorageAdapter', "'desktop_read_text'", "'desktop_write_text_atomic'", "'desktop_write_base64_file'", "'desktop_read_base64_file'"])
    && all(desktopBridge, ['openDesktopDataDir', "'saves'", "'backups'", "'assets'", "'config'", "'zhiku'", "'worldbooks'"]),
});

addCheck({
  status: 'file-primary',
  label: 'atomic json writes',
  detail: 'desktop text and JSON writes go through a temp-file-plus-rename command to reduce partial JSON writes.',
  ok: all(read('src-tauri/src/lib.rs'), ['desktop_write_text_atomic', 'write_text_atomically', '.sync_all()', 'fs::rename(&temp_path, file_path)', 'let _ = fs::remove_file(&temp_path)'])
    && storageAdapter.includes("invoke('desktop_write_text_atomic'"),
});

addCheck({
  status: 'desktop-first',
  label: 'cross-edition save packages',
  detail: 'Desktop Edition keeps Web-compatible save package import/export as the cross-edition exchange format while local files become the desktop storage backend.',
  ok: all(savePackage, ["format: 'ktysave'", "kind: 'save-package' | 'save-tree-package'", 'buildSavePackage', 'buildSaveTreePackage', 'parseSavePackage', 'parseSaveTreePackage', 'sanitizeSaveForExport'])
    && all(dbService, ['exportSavePackage', 'exportSaveTreePackage', 'importSaveFileAsMany', "name.endsWith('.ktysave')", "name.endsWith('.zip')", "name.endsWith('.json')"]),
});

addCheck({
  status: 'file-primary',
  label: 'one-time migration backup',
  detail: 'one-time desktop storage migrations have a local backup entrypoint and storage manager action that capture current readable saves plus desktop mirror/config/resource files before migration.',
  ok: all(migrationBackup, ["kind: 'kaituoyishi-desktop-migration-backup'", "reason: DesktopMigrationBackupReason", "TEXT_DIRS = ['saves', 'saves/transactions', 'saves/deltas', 'config', 'zhiku', 'worldbooks', 'assets']", "GENERATED_ASSET_DIR = 'assets/generated-images'", 'writeDesktopMigrationBackup', 'stripSaveAssetPayloadForStorage', 'adapter.readBase64File', "algorithm: 'SHA-256'"])
    && all(dbService, ['backupDesktopStateBeforeOneTimeMigration', 'previewDesktopStateBeforeOneTimeMigration', "writeDesktopMigrationBackup(currentSaves, 'before-migration')", "previewDesktopMigrationBackup(currentSaves, 'before-migration')"])
    && all(storageManager, ['backupDesktopStateBeforeOneTimeMigration', 'previewDesktopStateBeforeOneTimeMigration', 'listDesktopMigrationBackups', 'handleBackupDesktopMigration', 'latestDesktopMigrationBackup', 'desktopMigrationBackupPreview', 'desktopMigrationBackupCount', 'unreadableDesktopMigrationBackupCount', 'latestMigrationBackup: latestDesktopMigrationBackup', '迁移前完整备份', '迁移预估'])
    && all(diagnostics, ['desktopMigrationBackupCount', 'unreadableDesktopMigrationBackupCount', 'latestMigrationBackup', 'desktopMigrationBackupPreview']),
});

addCheck({
  status: 'future',
  label: 'sqlite primary store',
  detail: 'No SQLite/file-primary save database is claimed yet; this remains a later Desktop Edition milestone.',
  ok: !/sqlite|rusqlite|sqlx/i.test(readMaybe('src-tauri/Cargo.toml') + dbService),
});

printReport();

const failingCore = checks.filter((check) => !check.ok && check.status !== 'future');
if (failingCore.length > 0) {
  process.exitCode = 1;
}

function addCheck(check) {
  checks.push(check);
}

function printReport() {
  const counts = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    if (!check.ok) acc.failed += 1;
    return acc;
  }, { failed: 0 });

  console.log('Desktop storage migration audit');
  console.log(`Summary: file-primary=${counts['file-primary'] || 0}, desktop-first=${counts['desktop-first'] || 0}, mirror-only=${counts['mirror-only'] || 0}, indexeddb-primary=${counts['indexeddb-primary'] || 0}, future=${counts.future || 0}, failed=${counts.failed}`);
  console.log('');

  for (const status of ['file-primary', 'desktop-first', 'mirror-only', 'indexeddb-primary', 'future']) {
    const items = checks.filter((check) => check.status === status);
    if (!items.length) continue;
    console.log(`[${status}]`);
    for (const item of items) {
      console.log(`- ${item.ok ? 'ok' : 'missing'} ${item.label}: ${item.detail}`);
    }
    console.log('');
  }

  if (counts.failed === 0) {
    console.log('Desktop storage audit passed. Current state is desktop-first with file-primary settings and new save writes, not full desktop-primary migration.');
  } else {
    console.log('Desktop storage audit found missing core storage evidence.');
  }
}

function read(relativePath) {
  const filePath = path.isAbsolute(relativePath) ? relativePath : path.join(root, relativePath);
  return fs.readFileSync(filePath, 'utf8');
}

function readMaybe(relativePath) {
  try {
    return read(relativePath);
  } catch {
    return '';
  }
}

function all(text, needles) {
  return needles.every((needle) => text.includes(needle));
}

function ordered(text, first, second) {
  const firstIndex = text.indexOf(first);
  const secondIndex = text.indexOf(second);
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex;
}
