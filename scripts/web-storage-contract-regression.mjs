import fs from 'node:fs';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectAll(source, needles, label) {
  for (const needle of needles) {
    assert(source.includes(needle), label + ': missing ' + needle);
  }
}

const dbService = fs.readFileSync('services/dbService.ts', 'utf8');
const cloudMerge = fs.readFileSync('services/cloudBackupMerge.ts', 'utf8');

expectAll(dbService, [
  "const DB_NAME = 'TimeJourneyDB';",
  'const DB_VERSION = 5;',
  "const SAVES_STORE = 'saves';",
  "const SAVE_SUMMARIES_STORE = 'saveSummaries';",
  "const SAVE_ASSETS_STORE = 'saveAssets';",
  "const SAVE_NODE_DELTAS_STORE = 'saveNodeDeltas';",
  "const SETTINGS_STORE = 'settings';",
  'indexedDB.open(DB_NAME, DB_VERSION)',
  "db.createObjectStore(SAVES_STORE, { keyPath: 'id', autoIncrement: true })",
  "db.createObjectStore(SAVE_SUMMARIES_STORE, { keyPath: 'id' })",
  "db.createObjectStore(SAVE_ASSETS_STORE, { keyPath: 'id' })",
  "db.createObjectStore(SAVE_NODE_DELTAS_STORE, { keyPath: 'nodeId' })",
  "db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' })",
], 'IndexedDB schema contract');

expectAll(dbService, [
  'export async function saveGame(data: 存档数据): Promise<number>',
  'runWithSaveMutationPriority(() => saveGameInternal(data))',
  'const { id: _ignoredId, ...rest } = initialStoredData;',
  'const request = store.add(',
  'const id = request.result as number;',
  'summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(savedForDelta)))',
  'await rotateManagedSavesSafely(db);',
], 'save write contract');

expectAll(dbService, [
  'export async function getSaveCatalogSnapshot(): Promise<SaveCatalogSnapshot>',
  'readIndexedSaveCatalogSnapshot(db)',
  'export async function loadSave(id: number): Promise<存档数据 | null>',
  'loadRawSave(db, id)',
  'restoreDeltaSaveIfNeeded(db,',
  'loadSaveAssetRecords(db, assetIds)',
  'restoreSaveAssetPayloadFromRecords(',
], 'save read contract');

expectAll(dbService, [
  'export async function loadSaveForCloudTransfer(id: number): Promise<CloudTransferSaveBundle | null>',
  'saveHasEmbeddedAssetPayload(restored) ? extractSaveAssetRecords(restored) : []',
  'const records = new Map<string, SaveAssetRecord>();',
  'return { save: restored, assetRecords: Array.from(records.values()) };',
  'export async function stageCloudMergeRecord(',
  'export async function commitCloudMergeStaging(transferId: string): Promise<CloudMergeCommitResult>',
  '[SETTINGS_STORE, SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE]',
  'resolve({ saveIds, assetIds });',
], 'cloud save transaction contract');

expectAll(dbService, [
  'export async function replaceAllSaves(',
  'store.clear();',
  'summaryStore.clear();',
  'assetStore.clear();',
  'deltaStore.clear();',
  'store.put(storedSave);',
  'summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(storedSave)))',
  'assetStore.put(record)',
  'deltaStore.put(delta)',
], 'bulk replacement contract');

expectAll(dbService, [
  'export async function saveSetting(key: string, value: unknown): Promise<void>',
  'export async function loadSetting<T>(key: string): Promise<T | null>',
  'export async function deleteSetting(key: string): Promise<void>',
  "db.transaction(SETTINGS_STORE, 'readwrite')",
  "db.transaction(SETTINGS_STORE, 'readonly')",
  'store.put({ key, value });',
  'store.delete(key);',
], 'settings contract');

expectAll(cloudMerge, [
  'loadSaveForCloudTransfer',
  'stageCloudMergeRecord',
  'commitCloudMergeStaging',
  'clearCloudMergeStaging',
], 'cloud merge integration contract');

console.log('web storage contract regression ok');
