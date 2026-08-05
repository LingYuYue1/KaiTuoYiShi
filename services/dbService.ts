import type { 存档数据, 存档类型 } from '@/models/settings';
import { buildSavePackage, buildSaveTreePackage, parseSavePackage, parseSaveTreePackage, sanitizeSaveForExport, sanitizeSaveForExportAsync } from './savePackage';
import {
  extractSaveAssetRecords,
  materializeSaveAssetRecords,
  restoreSaveAssetPayloadFromRecords,
  saveHasEmbeddedAssetPayload,
  stripSaveAssetPayloadForStorage,
  type SaveAssetRecord,
} from '@/utils/saveAssetStorage';
import {
  buildDeltaOnlyStoredSave,
  buildSaveNodeDeltaRecord,
  isDeltaOnlyStoredSave,
  restoreSaveFromDelta,
  type SaveNodeDeltaRecord,
} from '@/utils/saveDeltaStorage';
import {
  buildSaveCatalogSnapshot,
  createCatalogRecordFromSummary,
  createHiddenDeltaBaseCatalogRecord,
  createUnreadableSaveCatalogRecord,
  normalizeSaveCatalogRecord,
  type SaveCatalogRecord,
  type SaveCatalogSnapshot,
  type SaveListItemSummary,
} from '@/services/storage/saveCatalog';
import {
  getSaveCatalogRepairState,
  runWithSaveMutationPriority,
  startSaveCatalogRepairTask,
  subscribeSaveCatalogRepair,
  type SaveCatalogRepairResult,
  type SaveCatalogRepairScope,
  type SaveCatalogRepairState,
} from '@/services/storage/saveCatalogRepair';
import { selectSaveNodeRotationCandidates } from '@/services/storage/saveRetention';

export type { SaveCatalogSnapshot, SaveListItemSummary } from '@/services/storage/saveCatalog';
export type { SaveCatalogRepairResult, SaveCatalogRepairScope, SaveCatalogRepairState } from '@/services/storage/saveCatalogRepair';
export { getSaveCatalogRepairState, subscribeSaveCatalogRepair };

const DB_NAME = 'TimeJourneyDB';
const DB_VERSION = 5;
const SAVES_STORE = 'saves';
const SAVE_SUMMARIES_STORE = 'saveSummaries';
const SAVE_ASSETS_STORE = 'saveAssets';
const SAVE_NODE_DELTAS_STORE = 'saveNodeDeltas';
const SETTINGS_STORE = 'settings';
const MAX_DELTA_NODES_PER_CHECKPOINT = 6;
const SAVE_CATALOG_REPAIR_LEASE_KEY = 'internal.saveCatalogRepairLease.v2';
const SAVE_CATALOG_REPAIR_LEASE_MS = 60_000;
const SAVE_CATALOG_REPAIR_OWNER = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `catalog_${Date.now()}_${Math.random().toString(36).slice(2)}`;

type StoredSaveMeta = 存档数据 & {
  saveRuntime?: {
    hiddenDeltaBase?: boolean;
    cloudBackupOriginFingerprint?: string;
    [key: string]: unknown;
  };
};

type SaveWithTree = 存档数据 & {
  saveTree?: import('@/utils/saveTree').存档树元信息;
};

export type CloudMergeStagedRecord =
  | { kind: 'node'; createdAt: number; save: 存档数据 }
  | { kind: 'raw-node'; createdAt: number; save: 存档数据 }
  | { kind: 'asset'; createdAt: number; record: SaveAssetRecord };

export interface CloudMergeCommitResult {
  saveIds: number[];
  assetIds: string[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (db: IDBDatabase) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      dbPromise = null;
      reject(error);
    };
    const timeoutId = globalThis.setTimeout(() => {
      fail(new Error('存档数据库打开超时。请关闭其他开拓轶事页面或刷新后重试。'));
    }, 8000);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SAVES_STORE)) {
        db.createObjectStore(SAVES_STORE, { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(SAVE_SUMMARIES_STORE)) {
        db.createObjectStore(SAVE_SUMMARIES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SAVE_ASSETS_STORE)) {
        db.createObjectStore(SAVE_ASSETS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) {
        db.createObjectStore(SAVE_NODE_DELTAS_STORE, { keyPath: 'nodeId' });
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => finish(request.result);
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error('存档数据库升级被其他页面占用。请关闭其他开拓轶事页面或刷新后重试。'));
  });
  return dbPromise;
}

// ── Save operations ──

export async function saveGame(data: 存档数据): Promise<number> {
  return runWithSaveMutationPriority(() => saveGameInternal(data));
}

async function saveGameInternal(data: 存档数据): Promise<number> {
  data = stripCloudBackupRestoreRuntime(data);
  const db = await openDB();
  const assetRecords = materializeSaveAssetRecords(extractSaveAssetRecords(data));
  const storedData = stripSaveAssetPayloadForStorage(data);
  const deltaBase = await findAutoDeltaBase(db, storedData);
  const saved = await new Promise<{ id: number; save: 存档数据; delta: SaveNodeDeltaRecord | null }>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const store = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const assetStore = tx.objectStore(SAVE_ASSETS_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    for (const record of assetRecords) assetStore.put(record);
    const initialStoredData = deltaBase
      ? buildDeltaOnlyStoredSave(storedData, deltaBase.baseSaveId)
      : storedData;
    const { id: _ignoredId, ...rest } = initialStoredData;
    void _ignoredId;
    let savedId = 0;
    let savedDelta: SaveNodeDeltaRecord | null = null;
    const request = store.add(rest as 存档数据);
    request.onsuccess = () => {
      const id = request.result as number;
      savedId = id;
      const savedForDelta = { ...storedData, id } as 存档数据;
      if (deltaBase) {
        store.put(buildDeltaOnlyStoredSave(savedForDelta, deltaBase.baseSaveId));
      }
      const delta = buildSaveNodeDeltaRecord(
        savedForDelta,
        id,
        deltaBase
          ? { baseSave: deltaBase.baseSave, baseSaveId: deltaBase.baseSaveId, storageMode: 'delta' }
          : undefined,
      );
      if (delta) {
        savedDelta = delta;
        deltaStore.put(delta);
      }
      summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(savedForDelta)));
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve({ id: savedId, save: { ...data, id: savedId } as 存档数据, delta: savedDelta });
    tx.onerror = () => reject(tx.error);
  });
  await rotateManagedSavesSafely(db);
  return saved.id;
}

async function deleteManagedSaveItems(db: IDBDatabase, candidates: SaveListItemSummary[]): Promise<void> {
  if (!candidates.length) return;
  const referencedBaseIds = await getReferencedDeltaBaseIds(db);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    for (const item of candidates) {
      if (!referencedBaseIds.has(item.id)) {
        saveStore.delete(item.id);
        summaryStore.delete(item.id);
      } else {
        markSaveAsHiddenDeltaBase(saveStore, summaryStore, item.id);
      }
      deleteDeltaBySaveId(tx.objectStore(SAVE_NODE_DELTAS_STORE), item.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await cleanupUnreferencedHiddenSaves(db);
}

async function collectSaveTreeSummaries(rootId: string): Promise<SaveListItemSummary[]> {
  const snapshot = await getSaveCatalogSnapshot();
  return snapshot.items.filter((item) => item.saveTree?.rootId === rootId);
}

export async function getSaveList(): Promise<SaveListItemSummary[]> {
  return (await getSaveCatalogSnapshot()).items;
}

export async function getSaveCatalogSnapshot(): Promise<SaveCatalogSnapshot> {
  const db = await openDB();
  return readIndexedSaveCatalogSnapshot(db);
}

export async function loadSave(id: number): Promise<存档数据 | null> {
  const db = await openDB();
  const save = await loadRawSave(db, id);
  const restoredSave = save ? await restoreDeltaSaveIfNeeded(db, save) : null;
  if (!restoredSave) return null;
  const saveForAssets = restoredSave;
  if (!db.objectStoreNames.contains(SAVE_ASSETS_STORE)) return saveForAssets;
  if (saveHasEmbeddedAssetPayload(saveForAssets)) {
    await migrateLoadedSaveAssets(db, saveForAssets);
  }
  const assetIds = collectSaveAlbumAssetIds(saveForAssets);
  if (!assetIds.length) return saveForAssets;
  const records = materializeSaveAssetRecords(await loadSaveAssetRecords(db, assetIds));
  // Restore registers Blobs into the runtime cache and keeps asset: refs in album state
  // (does not re-expand multi-MB base64 dataUrls into React state).
  return restoreSaveAssetPayloadFromRecords(saveForAssets, records);
}

export interface CloudTransferSaveBundle {
  save: 存档数据;
  assetRecords: SaveAssetRecord[];
}

export async function loadSaveForCloudTransfer(id: number): Promise<CloudTransferSaveBundle | null> {
  const db = await openDB();
  const raw = await loadRawSave(db, id);
  const restored = raw ? await restoreDeltaSaveIfNeeded(db, raw) : null;
  if (!restored) return null;
  const assetIds = collectSaveAlbumAssetIds(restored);
  const indexedRecords = db.objectStoreNames.contains(SAVE_ASSETS_STORE)
    ? await loadSaveAssetRecords(db, assetIds)
    : [];
  const embeddedRecords = saveHasEmbeddedAssetPayload(restored) ? extractSaveAssetRecords(restored) : [];
  const records = new Map<string, SaveAssetRecord>();
  for (const record of [...embeddedRecords, ...indexedRecords]) {
    if (record.id) records.set(record.id, record);
  }
  return { save: restored, assetRecords: Array.from(records.values()) };
}

export async function loadLatestSave(): Promise<存档数据 | null> {
  let snapshot = await getSaveCatalogSnapshot();
  if (snapshot.items.length === 0 && snapshot.pendingIds.length > 0) {
    await startSaveCatalogRepair('missing-only');
    snapshot = await getSaveCatalogSnapshot();
  }
  const list = snapshot.items;
  if (list.length === 0) return null;
  const latestPlayable = list.find((item) => item.type === 'manual' || item.type === 'imported')
    ?? list.find((item) => item.type === 'auto')
    ?? list.find((item) => item.type !== 'backup');
  if (!latestPlayable) return null;
  return loadSave(latestPlayable.id);
}

export async function deleteSave(id: number): Promise<void> {
  return runWithSaveMutationPriority(() => deleteSaveInternal(id));
}

async function deleteSaveInternal(id: number): Promise<void> {
  const db = await openDB();
  const isReferencedBase = await isSaveReferencedAsDeltaBase(db, id);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    if (!isReferencedBase) {
      saveStore.delete(id);
      summaryStore.delete(id);
    } else {
      markSaveAsHiddenDeltaBase(saveStore, summaryStore, id);
    }
    deleteDeltaBySaveId(tx.objectStore(SAVE_NODE_DELTAS_STORE), id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await cleanupUnreferencedHiddenSaves(db);
}

export async function deleteSaveTree(rootId: string): Promise<number> {
  return runWithSaveMutationPriority(() => deleteSaveTreeInternal(rootId));
}

async function deleteSaveTreeInternal(rootId: string): Promise<number> {
  const trimmedRootId = rootId.trim();
  if (!trimmedRootId) return 0;
  const db = await openDB();
  const catalog = await getSaveCatalogSnapshot();
  if (!catalog.catalogComplete) {
    throw new Error(`仍有 ${catalog.pendingIds.length} 个节点目录待恢复，完成后才能删除整棵存档树。`);
  }
  const candidates = await collectSaveTreeSummaries(trimmedRootId);
  if (!candidates.length) return 0;
  await deleteManagedSaveItems(db, candidates);
  return candidates.length;
}

export async function deleteLegacyBackupSaves(): Promise<number> {
  return runWithSaveMutationPriority(async () => {
    const catalog = await getSaveCatalogSnapshot();
    if (!catalog.legacyBackups.length) return 0;
    const db = await openDB();
    await deleteManagedSaveItems(db, catalog.legacyBackups);
    return catalog.legacyBackups.length;
  });
}

export async function loadSaveTree(rootId: string): Promise<存档数据[]> {
  const list = await getSaveList();
  const treeItems = list
    .filter((item) => item.saveTree?.rootId === rootId)
    .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
  const saves: 存档数据[] = [];
  for (const item of treeItems) {
    const save = await loadSave(item.id);
    if (save) saves.push(save);
  }
  return saves;
}

export async function stageCloudMergeRecord(
  transferId: string,
  recordKey: string,
  value: CloudMergeStagedRecord,
): Promise<void> {
  const db = await openDB();
  const key = cloudMergeStageKey(transferId, recordKey);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    tx.objectStore(SETTINGS_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('暂存云备份合并数据失败。'));
    tx.onabort = () => reject(tx.error ?? new Error('暂存云备份合并数据已中止。'));
  });
}

export async function deleteCloudMergeStagedRecord(
  transferId: string,
  recordKey: string,
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    tx.objectStore(SETTINGS_STORE).delete(cloudMergeStageKey(transferId, recordKey));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('清理云备份暂存条目失败。'));
  });
}

export async function loadCloudMergeStagedRecord(
  transferId: string,
  recordKey: string,
): Promise<CloudMergeStagedRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const request = tx.objectStore(SETTINGS_STORE).get(cloudMergeStageKey(transferId, recordKey));
    request.onsuccess = () => resolve((request.result as { value?: CloudMergeStagedRecord } | undefined)?.value ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function clearCloudMergeStaging(transferId: string): Promise<void> {
  const db = await openDB();
  const prefix = cloudMergeStagePrefix(transferId);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const request = tx.objectStore(SETTINGS_STORE).openCursor(cloudMergeStageRange(prefix));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('清理云备份合并暂存区失败。'));
  });
}

export async function commitCloudMergeStaging(transferId: string): Promise<CloudMergeCommitResult> {
  return runWithSaveMutationPriority(async () => {
    const db = await openDB();
    return commitCloudMergeStagingTransaction(db, transferId);
  });
}

async function commitCloudMergeStagingTransaction(
  db: IDBDatabase,
  transferId: string,
): Promise<CloudMergeCommitResult> {
  const prefix = cloudMergeStagePrefix(transferId);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [SETTINGS_STORE, SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE],
      'readwrite',
    );
    const settingsStore = tx.objectStore(SETTINGS_STORE);
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const assetStore = tx.objectStore(SAVE_ASSETS_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    const saveIds: number[] = [];
    const assetIds: string[] = [];
    const request = settingsStore.openCursor(cloudMergeStageRange(prefix));
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      try { tx.abort(); } catch { /* transaction already inactive */ }
      reject(error instanceof Error ? error : new Error('提交云备份合并事务失败。'));
    };
    request.onsuccess = () => {
      if (settled) return;
      const cursor = request.result;
      if (!cursor) return;
      const staged = (cursor.value as { value?: CloudMergeStagedRecord } | undefined)?.value;
      if (!staged || (staged.kind !== 'node' && staged.kind !== 'asset')) {
        fail(new Error(`云备份合并暂存条目无效：${String(cursor.key)}`));
        return;
      }
      if (staged.kind === 'asset') {
        if (!staged.record?.id) {
          fail(new Error('云备份资源暂存条目缺少 ID。'));
          return;
        }
        assetStore.put(staged.record);
        assetIds.push(staged.record.id);
        cursor.delete();
        cursor.continue();
        return;
      }

      try {
        const normalized = stripSaveAssetPayloadForStorage({
          ...staged.save,
          type: normalizeSaveType(staged.save.type),
        } as 存档数据);
        const { id: _discardedId, ...withoutId } = normalized;
        void _discardedId;
        const addRequest = saveStore.add(withoutId as 存档数据);
        addRequest.onsuccess = () => {
          try {
            const id = Number(addRequest.result);
            if (!Number.isSafeInteger(id) || id <= 0) throw new Error('云备份节点没有获得有效的本地 ID。');
            const saved = { ...normalized, id } as 存档数据;
            summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(saved)));
            const delta = buildSaveNodeDeltaRecord(saved, id);
            if (delta) deltaStore.put(delta);
            saveIds.push(id);
            cursor.delete();
            cursor.continue();
          } catch (error) {
            fail(error);
          }
        };
        addRequest.onerror = () => fail(addRequest.error ?? new Error('写入云备份节点失败。'));
      } catch (error) {
        fail(error);
      }
    };
    request.onerror = () => fail(request.error ?? new Error('读取云备份合并暂存区失败。'));
    tx.oncomplete = () => {
      if (settled) return;
      settled = true;
      resolve({ saveIds, assetIds });
    };
    tx.onerror = () => fail(tx.error ?? new Error('提交云备份合并事务失败。'));
    tx.onabort = () => fail(tx.error ?? new Error('云备份合并事务已中止，本地存档没有改变。'));
  });
}

export async function replaceAllSaves(
  nextSaves: 存档数据[],
): Promise<void> {
  return runWithSaveMutationPriority(() => replaceAllSavesInternal(nextSaves));
}

async function replaceAllSavesInternal(
  nextSaves: 存档数据[],
): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const store = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const assetStore = tx.objectStore(SAVE_ASSETS_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    store.clear();
    summaryStore.clear();
    assetStore.clear();
    deltaStore.clear();
    for (let index = 0; index < nextSaves.length; index += 1) {
      const save = nextSaves[index];
      const normalizedId = Number.isFinite(save.id) && save.id > 0 ? save.id : index + 1;
      const normalizedSave = { ...save, id: normalizedId };
      const assetRecords = materializeSaveAssetRecords(extractSaveAssetRecords(normalizedSave));
      for (const record of assetRecords) assetStore.put(record);
      const storedSave = stripSaveAssetPayloadForStorage(normalizedSave);
      store.put(storedSave);
      summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(storedSave)));
      const delta = buildSaveNodeDeltaRecord(storedSave, normalizedId);
      if (delta) {
        deltaStore.put(delta);
      }
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function hasAnySave(): Promise<boolean> {
  const snapshot = await getSaveCatalogSnapshot();
  return snapshot.items.length > 0 || snapshot.pendingIds.length > 0;
}

function deleteDeltaBySaveId(deltaStore: IDBObjectStore, saveId: number): void {
  const request = deltaStore.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    const delta = cursor.value as SaveNodeDeltaRecord;
    if (delta.saveId === saveId) cursor.delete();
    cursor.continue();
  };
}

async function findAutoDeltaBase(db: IDBDatabase, save: 存档数据): Promise<{ baseSave: 存档数据; baseSaveId: number } | null> {
  if (save.type !== 'auto') return null;
  const tree = (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree;
  if (!tree?.parentNodeId) return null;
  const summaries = await readSaveSummaries(db);
  const parentSummary = summaries.find((item) => item.saveTree?.nodeId === tree.parentNodeId);
  if (!parentSummary?.id) return null;
  const parentSave = await loadDeltaBaseCandidateSave(db, parentSummary.id);
  if (!parentSave) return null;
  const parentIsDelta = isDeltaOnlyStoredSave(parentSave);
  const baseSaveId = parentIsDelta
    ? await resolveDeltaBaseSaveId(db, parentSave)
    : parentSummary.id;
  if (!baseSaveId) return null;
  const deltaCount = await countDeltasUsingBase(db, baseSaveId);
  if (deltaCount >= MAX_DELTA_NODES_PER_CHECKPOINT) return null;
  const baseSave = !parentIsDelta && baseSaveId === parentSummary.id
    ? parentSave
    : await loadDeltaBaseCandidateSave(db, baseSaveId);
  if (!baseSave || isDeltaOnlyStoredSave(baseSave)) return null;
  return { baseSave, baseSaveId };
}

async function loadDeltaBaseCandidateSave(db: IDBDatabase, id: number): Promise<存档数据 | null> {
  return loadRawSave(db, id);
}

async function loadRawSave(db: IDBDatabase, id: number): Promise<存档数据 | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const store = tx.objectStore(SAVES_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve((request.result as 存档数据) ?? null);
    request.onerror = () => reject(request.error);
  });
}

async function restoreDeltaSaveIfNeeded(db: IDBDatabase, save: 存档数据, visited = new Set<number>()): Promise<存档数据> {
  if (!isDeltaOnlyStoredSave(save)) return save;
  const saveId = Number(save.id) || 0;
  if (visited.has(saveId)) return save;
  visited.add(saveId);
  const tree = (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree;
  if (!tree?.nodeId) return save;
  const delta = await loadDeltaRecordByNodeId(db, tree.nodeId);
  const baseSaveId = delta?.deltaPayload?.baseSaveId
    ?? (save as 存档数据 & { saveStorage?: { baseSaveId?: number } }).saveStorage?.baseSaveId;
  if (!delta || !baseSaveId) return save;
  const rawBase = await loadDeltaBaseCandidateSave(db, baseSaveId);
  if (!rawBase) return save;
  const base = await restoreDeltaSaveIfNeeded(db, rawBase, visited);
  return restoreSaveFromDelta(base, save, delta);
}

async function getReferencedDeltaBaseIds(db: IDBDatabase): Promise<Set<number>> {
  const referencedBaseIds = new Set<number>();
  await scanIndexedDeltaRecords(db, (delta) => {
    if (delta.deltaPayload?.baseSaveId) referencedBaseIds.add(delta.deltaPayload.baseSaveId);
  });
  return referencedBaseIds;
}

async function resolveDeltaBaseSaveId(db: IDBDatabase, save: 存档数据): Promise<number | null> {
  const directBaseId = (save as 存档数据 & { saveStorage?: { baseSaveId?: number } }).saveStorage?.baseSaveId;
  if (directBaseId) return directBaseId;
  const tree = (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree;
  if (!tree?.nodeId) return null;
  const delta = await loadDeltaRecordByNodeId(db, tree.nodeId);
  return delta?.deltaPayload?.baseSaveId ?? null;
}

async function countDeltasUsingBase(db: IDBDatabase, baseSaveId: number): Promise<number> {
  const matchingNodeIds = new Set<string>();
  await scanIndexedDeltaRecords(db, (delta) => {
    if (delta.deltaPayload?.baseSaveId === baseSaveId) {
      matchingNodeIds.add(delta.nodeId || `save:${delta.saveId}`);
    }
  });
  return matchingNodeIds.size;
}

async function isSaveReferencedAsDeltaBase(db: IDBDatabase, saveId: number): Promise<boolean> {
  const referencedBaseIds = await getReferencedDeltaBaseIds(db);
  return referencedBaseIds.has(saveId);
}

async function cleanupUnreferencedHiddenSaves(db: IDBDatabase): Promise<void> {
  const [records, referencedBaseIds] = await Promise.all([
    readSaveCatalogRecords(db),
    getReferencedDeltaBaseIds(db),
  ]);
  const orphanIds = records
    .filter((record) => record.visibility === 'hidden-delta-base')
    .map((record) => record.id)
    .filter((id) => !referencedBaseIds.has(id));
  if (!orphanIds.length) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    for (const id of orphanIds) {
      saveStore.delete(id);
      summaryStore.delete(id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadDeltaRecordByNodeId(db: IDBDatabase, nodeId: string): Promise<SaveNodeDeltaRecord | null> {
  if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly');
    const req = tx.objectStore(SAVE_NODE_DELTAS_STORE).get(nodeId);
    req.onsuccess = () => resolve((req.result as SaveNodeDeltaRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function scanIndexedDeltaRecords(
  db: IDBDatabase,
  visitor: (delta: SaveNodeDeltaRecord) => void,
): Promise<void> {
  if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly');
    const request = tx.objectStore(SAVE_NODE_DELTAS_STORE).openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      visitor(cursor.value as SaveNodeDeltaRecord);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function collectSaveAlbumAssetIds(save: 存档数据): string[] {
  const ids = new Set<string>();
  for (const asset of save.相册?.assets ?? []) {
    if (asset.id) ids.add(asset.id);
  }
  return Array.from(ids);
}

async function loadSaveAssetRecords(db: IDBDatabase, assetIds: string[]): Promise<SaveAssetRecord[]> {
  if (!assetIds.length) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_ASSETS_STORE, 'readonly');
    const store = tx.objectStore(SAVE_ASSETS_STORE);
    const records: SaveAssetRecord[] = [];
    let pending = assetIds.length;
    const finish = () => {
      pending -= 1;
      if (pending === 0) resolve(records);
    };
    for (const id of assetIds) {
      const req = store.get(id);
      req.onsuccess = () => {
        if (req.result) records.push(req.result as SaveAssetRecord);
        finish();
      };
      req.onerror = () => reject(req.error);
    }
  });
}

async function migrateLoadedSaveAssets(db: IDBDatabase, save: 存档数据): Promise<void> {
  const records = materializeSaveAssetRecords(extractSaveAssetRecords(save));
  if (!records.length) return;
  const storedSave = stripSaveAssetPayloadForStorage(save);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const assetStore = tx.objectStore(SAVE_ASSETS_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    for (const record of records) assetStore.put(record);
    saveStore.put(storedSave);
    summaryStore.put(buildSaveSummary(storedSave));
    const delta = buildSaveNodeDeltaRecord(storedSave, Number(storedSave.id) || 0);
    if (delta) {
      deltaStore.put(delta);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Settings operations ──

export async function saveSetting(key: string, value: unknown): Promise<void> {
  await writeIndexedSetting(key, value);
}

export async function loadSetting<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise<T | null>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readonly');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? (result.value as T) : null);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function updateSetting<T>(
  key: string,
  updater: (current: T | null) => T,
): Promise<T> {
  const db = await openDB();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get(key);
    let nextValue: T;
    request.onsuccess = () => {
      const result = request.result as { value?: T } | undefined;
      nextValue = updater(result?.value ?? null);
      store.put({ key, value: nextValue });
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(nextValue!);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error(`更新设置失败：${key}`));
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await deleteIndexedSetting(key);
}

async function writeIndexedSetting(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteIndexedSetting(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Per-tree save-node rotation ──

async function rotateManagedSaves(db: IDBDatabase): Promise<void> {
  const all = await readSaveSummaries(db);
  const candidates = selectSaveNodeRotationCandidates(all);
  await deleteManagedSaveItems(db, candidates);
}

async function rotateManagedSavesSafely(db: IDBDatabase): Promise<void> {
  try {
    await rotateManagedSaves(db);
  } catch (error) {
    console.warn('[save-retention] post-save rotation failed', error);
  }
}

function markSaveAsHiddenDeltaBase(
  saveStore: IDBObjectStore,
  summaryStore: IDBObjectStore,
  saveId: number,
): void {
  const req = saveStore.get(saveId);
  req.onsuccess = () => {
    const save = req.result as StoredSaveMeta | undefined;
    if (!save) return;
    saveStore.put({
      ...save,
      saveRuntime: {
        ...(save.saveRuntime ?? {}),
        hiddenDeltaBase: true,
      },
    });
    summaryStore.put(createHiddenDeltaBaseCatalogRecord({
      id: saveId,
      type: normalizeSaveType(save.type),
      timestamp: Number(save.timestamp) || 0,
    }));
  };
}

// ── Export / Import ──

export async function exportSaveJson(save: 存档数据): Promise<void> {
  const json = JSON.stringify(await sanitizeSaveForExportAsync(save), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const travelerName = sanitizeFilename(save.旅人?.姓名 || 'traveler');
  const turnCount = save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1);
  const stamp = new Date(save.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.download = `KaiTuoYiShi-${travelerName}-turn-${turnCount}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportSavePackage(save: 存档数据): Promise<void> {
  const blob = await buildSavePackage(save);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const travelerName = sanitizeFilename(save.旅人?.姓名 || 'traveler');
  const turnCount = save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1);
  const stamp = new Date(save.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.download = `KaiTuoYiShi-${travelerName}-turn-${turnCount}-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportSaveTreePackage(saves: 存档数据[]): Promise<void> {
  const blob = await buildSaveTreePackage(saves);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const latest = [...saves].sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0))[0];
  const travelerName = sanitizeFilename(latest?.旅人?.姓名 || 'traveler');
  const turnCount = latest?.turnCount ?? ((latest?.chatHistory?.length ?? 0) + 1);
  const stamp = new Date(latest?.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.href = url;
  a.download = `KaiTuoYiShi-${travelerName}-tree-${saves.length}-nodes-turn-${turnCount}-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSaveJson(json: string): 存档数据 {
  const data = JSON.parse(json) as 存档数据;
  if (!data || typeof data !== 'object' || !data.旅人 || !data.世界 || !Array.isArray(data.chatHistory)) {
    throw new Error('无效的存档文件');
  }
  if (!data.gameSettings || !data.apiSettings || !data.theme) {
    throw new Error('无效的存档文件');
  }
  return data;
}

export async function importSaveFile(file: File): Promise<存档数据> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json') || file.type === 'application/json') {
    return importSaveJson(await file.text());
  }
  if (name.endsWith('.ktysave') || name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    const data = await parseSavePackage(await file.arrayBuffer());
    if (!data || typeof data !== 'object' || !data.旅人 || !data.世界 || !Array.isArray(data.chatHistory)) {
      throw new Error('无效的存档包');
    }
    if (!data.gameSettings || !data.apiSettings || !data.theme) {
      throw new Error('无效的存档包');
    }
    return data;
  }
  throw new Error('不支持的存档格式，请选择 .zip、.ktysave 或旧版 .json');
}

export async function importSaveFileAsMany(file: File): Promise<存档数据[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json') || file.type === 'application/json') {
    return [importSaveJson(await file.text())];
  }
  if (name.endsWith('.ktysave') || name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    const saves = await parseSaveTreePackage(await file.arrayBuffer());
    const remapped = remapImportedSaveTree(saves);
    for (const data of remapped) {
      if (!data || typeof data !== 'object' || !data.旅人 || !data.世界 || !Array.isArray(data.chatHistory)) {
        throw new Error('无效的存档包');
      }
      if (!data.gameSettings || !data.apiSettings || !data.theme) {
        throw new Error('无效的存档包');
      }
    }
    return remapped;
  }
  throw new Error('不支持的存档格式，请选择 .zip、.ktysave 或旧版 .json');
}

function remapImportedSaveTree(saves: 存档数据[]): 存档数据[] {
  if (saves.length <= 1) return saves;
  const rootId = createImportId('save_root_import');
  const nodeIdMap = new Map<string, string>();
  for (const save of saves) {
    const tree = (save as SaveWithTree).saveTree;
    if (tree?.nodeId) {
      nodeIdMap.set(tree.nodeId, createImportId('save_node_import'));
    }
  }
  return saves.map((save, index) => {
    const tree = (save as SaveWithTree).saveTree;
    if (!tree?.nodeId) {
      return {
        ...save,
        saveTree: {
          rootId,
          nodeId: createImportId('save_node_import'),
          branchName: '导入节点',
          createdAt: save.timestamp || Date.now() + index,
        },
      } as 存档数据;
    }
    return {
      ...save,
      saveTree: {
        ...tree,
        rootId,
        nodeId: nodeIdMap.get(tree.nodeId) ?? createImportId('save_node_import'),
        parentNodeId: tree.parentNodeId ? nodeIdMap.get(tree.parentNodeId) : undefined,
        branchName: tree.branchName ?? '导入节点',
        createdAt: tree.createdAt || save.timestamp || Date.now() + index,
      },
    } as 存档数据;
  });
}

function createImportId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function stripCloudBackupRestoreRuntime<T extends 存档数据>(save: T): T {
  const source = save as T & { saveRuntime?: Record<string, unknown> };
  if (!source.saveRuntime || !('cloudBackupOriginFingerprint' in source.saveRuntime)) return save;
  const { cloudBackupOriginFingerprint: _origin, ...remainingRuntime } = source.saveRuntime;
  void _origin;
  return {
    ...save,
    ...(Object.keys(remainingRuntime).length ? { saveRuntime: remainingRuntime } : { saveRuntime: undefined }),
  } as T;
}

function cloudMergeStagePrefix(transferId: string): string {
  const safeTransferId = String(transferId || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
  if (!safeTransferId) throw new Error('云备份合并任务 ID 无效。');
  return `internal.cloudMerge.${safeTransferId}.`;
}

function cloudMergeStageKey(transferId: string, recordKey: string): string {
  const safeRecordKey = String(recordKey || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 220);
  if (!safeRecordKey) throw new Error('云备份合并暂存键无效。');
  return `${cloudMergeStagePrefix(transferId)}${safeRecordKey}`;
}

function cloudMergeStageRange(prefix: string): IDBKeyRange {
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`, false, false);
}

function normalizeSaveType(type: unknown): 存档类型 {
  return type === 'auto' || type === 'backup' || type === 'imported' ? type : 'manual';
}

async function readSaveSummaries(db: IDBDatabase): Promise<SaveListItemSummary[]> {
  return (await readIndexedSaveCatalogSnapshot(db)).items;
}

async function readSaveCatalogRecords(db: IDBDatabase): Promise<SaveCatalogRecord[]> {
  if (!db.objectStoreNames.contains(SAVE_SUMMARIES_STORE)) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readonly');
    const store = tx.objectStore(SAVE_SUMMARIES_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const list = (request.result as unknown[])
        .map((value): SaveCatalogRecord | null => {
          const normalized = normalizeSaveCatalogRecord(value);
          if (normalized) return normalized;
          if (value && typeof value === 'object' && 'chatHistory' in value) {
            return createCatalogRecordFromSummary(buildSaveSummary(value as 存档数据));
          }
          return null;
        })
        .filter((record): record is SaveCatalogRecord => Boolean(record));
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedSaveKeys(db: IDBDatabase): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const request = tx.objectStore(SAVES_STORE).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readIndexedSaveCatalogSnapshot(db: IDBDatabase): Promise<SaveCatalogSnapshot> {
  const [records, keys] = await Promise.all([
    readSaveCatalogRecords(db),
    readIndexedSaveKeys(db),
  ]);
  return buildSaveCatalogSnapshot(records, keys);
}

export async function startSaveCatalogRepair(
  scope: SaveCatalogRepairScope = 'missing-only',
): Promise<SaveCatalogRepairResult> {
  const db = await openDB();
  return startSaveCatalogRepairTask(scope, {
    collectIds: async (requestedScope) => {
      if (requestedScope === 'full-validation') {
        return (await readIndexedSaveKeys(db))
          .map((key) => Math.floor(Number(key)))
          .filter((id) => Number.isFinite(id) && id > 0)
          .sort((a, b) => b - a);
      }
      return (await readIndexedSaveCatalogSnapshot(db)).pendingIds;
    },
    repairOne: (id) => repairOneSaveCatalogRecord(db, id),
    cleanupStaleRecords: () => cleanupStaleSaveCatalogRecords(db),
    acquireLease: () => acquireSaveCatalogRepairLease(db),
    renewLease: () => renewSaveCatalogRepairLease(db),
    releaseLease: () => releaseSaveCatalogRepairLease(db),
  });
}

export async function repairSaveDatabase(): Promise<void> {
  const activeState = getSaveCatalogRepairState();
  const fullValidationQueuedBehindBackground = (
    activeState.scope === 'missing-only'
    && activeState.phase !== 'idle'
    && activeState.phase !== 'completed'
    && activeState.phase !== 'partial-failure'
  );
  await startSaveCatalogRepair('full-validation');
  if (fullValidationQueuedBehindBackground) {
    await startSaveCatalogRepair('full-validation');
  }
}

async function repairOneSaveCatalogRecord(db: IDBDatabase, id: number): Promise<void> {
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE], 'readwrite');
      const saveStore = tx.objectStore(SAVES_STORE);
      const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
      const request = saveStore.get(id);
      request.onsuccess = () => {
        const save = request.result as 存档数据 | undefined;
        if (!save) {
          summaryStore.delete(id);
          return;
        }
        if (isHiddenDeltaBaseSave(save)) {
          summaryStore.put(createHiddenDeltaBaseCatalogRecord({
            id,
            type: normalizeSaveType(save.type),
            timestamp: Number(save.timestamp) || 0,
          }));
          return;
        }
        summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(save)));
      };
      request.onerror = () => reject(request.error);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('存档目录恢复事务已中止'));
    });
  } catch (error) {
    await writeUnreadableSaveCatalogRecord(db, id, error).catch(() => {});
    throw error;
  }
}

function isHiddenDeltaBaseSave(save: 存档数据): boolean {
  return Boolean((save as StoredSaveMeta).saveRuntime?.hiddenDeltaBase);
}

async function writeUnreadableSaveCatalogRecord(
  db: IDBDatabase,
  id: number,
  error: unknown,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readwrite');
    const store = tx.objectStore(SAVE_SUMMARIES_STORE);
    const getRequest = store.get(id);
    getRequest.onsuccess = () => {
      const current = normalizeSaveCatalogRecord(getRequest.result);
      const retryCount = current?.visibility === 'unreadable' ? current.retryCount + 1 : 1;
      store.put(createUnreadableSaveCatalogRecord({ id, error, retryCount }));
    };
    getRequest.onerror = () => reject(getRequest.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function cleanupStaleSaveCatalogRecords(db: IDBDatabase): Promise<void> {
  const snapshot = await readIndexedSaveCatalogSnapshot(db);
  if (!snapshot.staleCatalogIds.length) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readwrite');
    const store = tx.objectStore(SAVE_SUMMARIES_STORE);
    for (const id of snapshot.staleCatalogIds) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function acquireSaveCatalogRepairLease(db: IDBDatabase): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get(SAVE_CATALOG_REPAIR_LEASE_KEY);
    let acquired = false;
    request.onsuccess = () => {
      const current = request.result as { key?: string; value?: { ownerId?: string; expiresAt?: number } } | undefined;
      const ownerId = current?.value?.ownerId;
      const expiresAt = Number(current?.value?.expiresAt) || 0;
      if (!ownerId || ownerId === SAVE_CATALOG_REPAIR_OWNER || expiresAt <= Date.now()) {
        acquired = true;
        store.put({
          key: SAVE_CATALOG_REPAIR_LEASE_KEY,
          value: {
            ownerId: SAVE_CATALOG_REPAIR_OWNER,
            expiresAt: Date.now() + SAVE_CATALOG_REPAIR_LEASE_MS,
          },
        });
      }
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(acquired);
    tx.onerror = () => reject(tx.error);
  });
}

async function renewSaveCatalogRepairLease(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get(SAVE_CATALOG_REPAIR_LEASE_KEY);
    request.onsuccess = () => {
      const current = request.result as { value?: { ownerId?: string } } | undefined;
      if (current?.value?.ownerId !== SAVE_CATALOG_REPAIR_OWNER) {
        tx.abort();
        return;
      }
      store.put({
        key: SAVE_CATALOG_REPAIR_LEASE_KEY,
        value: {
          ownerId: SAVE_CATALOG_REPAIR_OWNER,
          expiresAt: Date.now() + SAVE_CATALOG_REPAIR_LEASE_MS,
        },
      });
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('存档目录恢复租约续期失败'));
    tx.onabort = () => reject(new Error('存档目录恢复租约已由其他页面接管'));
  });
}

async function releaseSaveCatalogRepairLease(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    const request = store.get(SAVE_CATALOG_REPAIR_LEASE_KEY);
    request.onsuccess = () => {
      const current = request.result as { value?: { ownerId?: string } } | undefined;
      if (current?.value?.ownerId === SAVE_CATALOG_REPAIR_OWNER) {
        store.delete(SAVE_CATALOG_REPAIR_LEASE_KEY);
      }
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function buildSaveSummary(save: 存档数据): SaveListItemSummary {
  return {
    id: Number(save.id) || 0,
    type: normalizeSaveType(save.type),
    timestamp: Number(save.timestamp) || Date.now(),
    saveTree: (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree,
    travelerName: save.旅人?.姓名 ?? '',
    turnCount: save.turnCount ?? ((save.chatHistory?.length ?? 0) + 1),
    worldPeriodName: save.世界?.当前时段?.名称 ?? '',
    currentDate: save.世界?.当前日期 ?? '',
    currentTime: save.世界?.当前时间 ?? '',
    currentLocation: save.世界?.当前地点 ?? '',
    lastSummary: summarizeSave(save),
    sizeBytes: estimateSaveSize(save),
  };
}

function summarizeSave(save: 存档数据): string {
  const latestAssistant = [...(save.chatHistory ?? [])]
    .reverse()
    .find((msg) => msg.role === 'assistant');
  const text = latestAssistant?.parsedResponse?.body || latestAssistant?.content || '';
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? Array.from(cleaned).slice(0, 120).join('') : '';
}

function estimateSaveSize(save: 存档数据): number {
  const chatBytes = (save.chatHistory ?? []).reduce((sum, message) => {
    return sum + String(message.content ?? '').length + String(message.parsedResponse?.body ?? '').length;
  }, 0);
  const albumAssets = save.相册?.assets ?? [];
  const albumBytes = albumAssets.reduce((sum, asset) => {
    const declaredSize = Number(asset.size) || 0;
    if (declaredSize > 0) return sum + declaredSize;
    return sum + String(asset.dataUrl ?? '').length + String(asset.originalUrl ?? '').length;
  }, 0);
  const queueBytes = (save.queueTasks ?? []).reduce((sum, task) => {
    return sum +
      String(task.title ?? '').length +
      String(task.subtitle ?? '').length +
      String(task.detail ?? '').length +
      String(task.retryHint ?? '').length;
  }, 0);
  return Math.max(1024, chatBytes * 2 + albumBytes + queueBytes * 2 + 48_000);
}

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 48) || 'traveler';
}
