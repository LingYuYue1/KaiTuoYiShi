import type { 存档数据, 存档类型 } from '@/models/settings';
import { 归一化NewestStory记录, NEWEST_STORY_STORE_KEY, type NewestStory记录 } from '@/models/newestStory';
import { devLog, devLogError } from '@/utils/devLog';
import { createUnifiedId, UNIFIED_ID_DB_VERSION } from '@/utils/id';
import { buildSavePackage, buildSaveTreePackage, parseSavePackage, parseSaveTreePackage, sanitizeSaveForExportAsync } from './savePackage';
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
} from '@/services/storage/saveCatalogRepair';
import { selectSaveNodeRotationCandidates } from '@/services/storage/saveRetention';

export type { SaveCatalogSnapshot, SaveListItemSummary } from '@/services/storage/saveCatalog';
export type { SaveCatalogRepairResult, SaveCatalogRepairScope, SaveCatalogRepairState } from '@/services/storage/saveCatalogRepair';
export { getSaveCatalogRepairState, subscribeSaveCatalogRepair };

const DB_NAME = 'TimeJourneyDB';
const DB_VERSION = UNIFIED_ID_DB_VERSION;
const SAVES_STORE = 'saves';
const SAVE_SUMMARIES_STORE = 'saveSummaries';
const SAVE_ASSETS_STORE = 'saveAssets';
const SAVE_NODE_DELTAS_STORE = 'saveNodeDeltas';
const SETTINGS_STORE = 'settings';
const NEWEST_STORY_STORE = 'newestStory';
const MAX_DELTA_NODES_PER_CHECKPOINT = 6;
const SAVE_CATALOG_REPAIR_LEASE_KEY = 'internal.saveCatalogRepairLease.v2';
const SAVE_CATALOG_REPAIR_LEASE_MS = 60_000;
const SAVE_CATALOG_REPAIR_OWNER = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID()
  : `catalog_${Date.now()}_${Math.random().toString(36).slice(2)}`;

type StoredSaveMeta = 存档数据 & {
  saveRuntime?: {
    hiddenDeltaBase?: boolean;
    unsealedHead?: boolean;
    cloudBackupOriginFingerprint?: string;
    [key: string]: unknown;
  };
};

type SaveWithTree = 存档数据 & {
  saveTree?: import('@/utils/saveTree').存档树元信息;
};

interface Migration {
  version: number;
  label: string;
  migrate: (transaction: IDBTransaction) => void;
}

export type CloudMergeStagedRecord =
  | { kind: 'node'; createdAt: number; save: 存档数据 }
  | { kind: 'raw-node'; createdAt: number; save: 存档数据 }
  | { kind: 'asset'; createdAt: number; record: SaveAssetRecord };

export interface CloudMergeCommitResult {
  saveIds: number[];
  assetIds: string[];
}

let dbPromise: Promise<IDBDatabase> | null = null;

function toError(error: unknown, fallback = '存档数据库操作失败。'): Error {
  return error instanceof Error ? error : new Error(fallback);
}

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let settled = false;
    const finish = (db: IDBDatabase) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      const connection = db;
      connection.onversionchange = () => {
        connection.close();
        dbPromise = null;
      };
      resolve(db);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timeoutId);
      dbPromise = null;
      reject(toError(error));
    };
    const timeoutId = globalThis.setTimeout(() => {
      fail(new Error('存档数据库打开超时。请关闭其他开拓轶事页面或刷新后重试。'));
    }, 8000);
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
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
      if (!db.objectStoreNames.contains(NEWEST_STORY_STORE)) {
        db.createObjectStore(NEWEST_STORY_STORE, { keyPath: 'key' });
      }
      const migrationsToApply = MIGRATIONS.filter((migration) => migration.version > event.oldVersion);
      devLog('save', 'migrate-registry-start', {
        applied: migrationsToApply.map((migration) => migration.label),
        skipped: MIGRATIONS
          .filter((migration) => migration.version <= event.oldVersion)
          .map((migration) => migration.label),
      });
      if (request.transaction) {
        for (const migration of migrationsToApply) {
          migration.migrate(request.transaction);
        }
      }
    };
    request.onsuccess = () => finish(request.result);
    request.onerror = () => fail(request.error);
    request.onblocked = () => fail(new Error('存档数据库升级被其他页面占用。请关闭其他开拓轶事页面或刷新后重试。'));
  });
  return dbPromise;
}

function migrateNewestStoryHeadNodeId(transaction: IDBTransaction): void {
  const newestStore = transaction.objectStore(NEWEST_STORY_STORE);
  const savesStore = transaction.objectStore(SAVES_STORE);
  const newestRequest = newestStore.get(NEWEST_STORY_STORE_KEY);
  newestRequest.onsuccess = () => {
    const newest: unknown = newestRequest.result;
    if (!isPlainRecord(newest)) {
      devLog('save', 'newest-head-migration', { outcome: 'no-record' });
      return;
    }
    if ('headNodeId' in newest) {
      devLog('save', 'newest-head-migration', {
        outcome: 'already-present',
        headNodeId: (newest as { headNodeId?: unknown }).headNodeId,
      });
      return;
    }

    const baseCheckpointId = normalizeSaveId(newest.baseCheckpointId);
    if (!baseCheckpointId) {
      newestStore.put({ ...newest, headNodeId: null });
      devLog('save', 'newest-head-migration', { outcome: 'no-base-checkpoint' });
      return;
    }

    const saveRequest = savesStore.get(baseCheckpointId);
    saveRequest.onsuccess = () => {
      const save = saveRequest.result as SaveWithTree | undefined;
      const headNodeId = normalizeNodeId(save?.saveTree?.nodeId);
      newestStore.put({ ...newest, headNodeId });
      if (headNodeId) {
        devLog('save', 'newest-head-migration', { outcome: 'backfilled', baseCheckpointId, headNodeId });
      } else {
        devLog('save', 'newest-head-migration', { outcome: 'base-node-missing', baseCheckpointId });
      }
    };
    saveRequest.onerror = () => {
      newestStore.put({ ...newest, headNodeId: null });
      devLogError('save', 'newest-head-migration-read-failed', saveRequest.error, { baseCheckpointId });
    };
  };
  newestRequest.onerror = () => {
    devLogError('save', 'newest-head-migration-read-failed', newestRequest.error);
  };
}

const UNIFIED_ID_PATTERN = /^[0-9a-f]{4}-[0-9a-f]{6}-[0-9a-f]{4}$/;

function migrateNodeIdsToUnifiedFormat(transaction: IDBTransaction): void {
  devLog('save', 'migrate-nodeid-start');

  const savesStore = transaction.objectStore(SAVES_STORE);
  const summaryStore = transaction.objectStore(SAVE_SUMMARIES_STORE);
  const deltaStore = transaction.objectStore(SAVE_NODE_DELTAS_STORE);
  const newestStore = transaction.objectStore(NEWEST_STORY_STORE);
  const metrics = {
    savesScanned: 0,
    savesRewritten: 0,
    summariesScanned: 0,
    summariesRewritten: 0,
    deltasScanned: 0,
    deltasRewritten: 0,
    mappedNodeIds: 0,
    mappedRootIds: 0,
    newestRewritten: false,
  };
  let failureLogged = false;
  const logFailure = (error: unknown, phase: string) => {
    if (failureLogged) return;
    failureLogged = true;
    devLogError('save', 'migrate-nodeid-failed', error, { phase });
  };
  transaction.addEventListener('abort', () => {
    logFailure(transaction.error ?? new Error('统一 nodeId 迁移事务已中止。'), 'transaction');
  }, { once: true });
  const watchRequest = (request: IDBRequest, phase: string) => {
    request.addEventListener('error', () => {
      logFailure(request.error ?? new Error('统一 nodeId 迁移请求失败。'), phase);
    }, { once: true });
  };

  const savesRequest = savesStore.getAll();
  watchRequest(savesRequest, 'saves-read');
  savesRequest.onsuccess = () => {
    const saves = savesRequest.result as unknown[];
    const summariesRequest = summaryStore.getAll();
    watchRequest(summariesRequest, 'summaries-read');
    summariesRequest.onsuccess = () => {
      const summaries = summariesRequest.result as unknown[];
      const deltasRequest = deltaStore.getAll();
      watchRequest(deltasRequest, 'deltas-read');
      deltasRequest.onsuccess = () => {
        const deltas = deltasRequest.result as unknown[];
        const newestRequest = newestStore.get(NEWEST_STORY_STORE_KEY);
        watchRequest(newestRequest, 'newest-read');
        newestRequest.onsuccess = () => {
          const newest = newestRequest.result as unknown;
          const nodeIdMap = new Map<string, string>();
          const rootIdMap = new Map<string, string>();

          for (const save of saves) ensureSaveTreeMappings(save, nodeIdMap, rootIdMap);
          for (const summary of summaries) ensureSaveTreeMappings(summary, nodeIdMap, rootIdMap);
          for (const delta of deltas) ensureDeltaMappings(delta, nodeIdMap, rootIdMap);
          ensureNewestMapping(newest, nodeIdMap);

          metrics.savesScanned = saves.length;
          metrics.summariesScanned = summaries.length;
          metrics.deltasScanned = deltas.length;
          metrics.mappedNodeIds = nodeIdMap.size;
          metrics.mappedRootIds = rootIdMap.size;
          devLog('save', 'migrate-nodeid-row', {
            saves: metrics.savesScanned,
            summaries: metrics.summariesScanned,
            deltas: metrics.deltasScanned,
            mappedNodeIds: metrics.mappedNodeIds,
            mappedRootIds: metrics.mappedRootIds,
          });

          for (const save of saves) {
            const rewritten = rewriteSaveTreeRecord(save, nodeIdMap, rootIdMap);
            if (!rewritten) continue;
            savesStore.put(rewritten);
            metrics.savesRewritten += 1;
          }
          for (const summary of summaries) {
            const rewritten = rewriteSaveTreeRecord(summary, nodeIdMap, rootIdMap);
            if (!rewritten) continue;
            summaryStore.put(rewritten);
            metrics.summariesRewritten += 1;
          }
          for (const delta of deltas) {
            const rewritten = rewriteDeltaRecord(delta, nodeIdMap, rootIdMap);
            if (!rewritten) continue;
            const oldNodeId = isPlainRecord(delta) && typeof delta.nodeId === 'string'
              ? delta.nodeId
              : null;
            if (!oldNodeId) continue;
            deltaStore.delete(oldNodeId);
            deltaStore.put(rewritten);
            metrics.deltasRewritten += 1;
          }
          devLog('save', 'migrate-nodeid-delta-rewrite', {
            scanned: metrics.deltasScanned,
            rewritten: metrics.deltasRewritten,
          });

          if (isPlainRecord(newest) && 'headNodeId' in newest) {
            const nextHeadNodeId = mapNodeId(newest.headNodeId, nodeIdMap);
            if (nextHeadNodeId !== newest.headNodeId) {
              newestStore.put({ ...newest, headNodeId: nextHeadNodeId });
              metrics.newestRewritten = true;
            }
            devLog('save', 'migrate-nodeid-newest', {
              rewritten: metrics.newestRewritten,
              oldHeadNodeId: newest.headNodeId,
              newHeadNodeId: nextHeadNodeId,
            });
          } else {
            devLog('save', 'migrate-nodeid-newest', { rewritten: false });
          }
        };
      };
    };
  };

  transaction.addEventListener('complete', () => {
    const totalRewritten = metrics.savesRewritten + metrics.summariesRewritten + metrics.deltasRewritten;
    const totalScanned = metrics.savesScanned + metrics.summariesScanned + metrics.deltasScanned;
    const outcome = totalScanned === 0
      ? 'empty'
      : totalRewritten === 0
        ? 'noop'
        : 'converted';
    devLog('save', 'migrate-nodeid-complete', { ...metrics, outcome });
  }, { once: true });
}

const MIGRATIONS: Migration[] = [
  {
    version: 7,
    label: 'newest-headNodeId',
    migrate: migrateNewestStoryHeadNodeId,
  },
  {
    version: 8,
    label: 'unified-nodeId',
    migrate: migrateNodeIdsToUnifiedFormat,
  },
];

function ensureSaveTreeMappings(
  value: unknown,
  nodeIdMap: Map<string, string>,
  rootIdMap: Map<string, string>,
): void {
  if (!isPlainRecord(value) || !isPlainRecord(value.saveTree)) return;
  ensureMappedId(value.saveTree.nodeId, nodeIdMap);
  ensureMappedId(value.saveTree.parentNodeId, nodeIdMap);
  ensureMappedId(value.saveTree.rootId, rootIdMap);
}

function ensureDeltaMappings(
  value: unknown,
  nodeIdMap: Map<string, string>,
  rootIdMap: Map<string, string>,
): void {
  if (!isPlainRecord(value)) return;
  ensureMappedId(value.nodeId, nodeIdMap);
  ensureMappedId(value.parentNodeId, nodeIdMap);
  ensureMappedId(value.rootId, rootIdMap);
}

function ensureNewestMapping(value: unknown, nodeIdMap: Map<string, string>): void {
  if (isPlainRecord(value)) ensureMappedId(value.headNodeId, nodeIdMap);
}

function ensureMappedId(value: unknown, map: Map<string, string>): void {
  if (typeof value !== 'string') return;
  const normalized = value.trim();
  if (!normalized || isUnifiedNodeId(normalized) || map.has(normalized)) return;
  map.set(normalized, createUnifiedId());
}

function isUnifiedNodeId(value: string): boolean {
  return UNIFIED_ID_PATTERN.test(value);
}

function mapNodeId(value: unknown, map: Map<string, string>): unknown {
  if (typeof value !== 'string') return value;
  return map.get(value.trim()) ?? value;
}

function mapRootId(value: unknown, map: Map<string, string>): unknown {
  if (typeof value !== 'string') return value;
  return map.get(value.trim()) ?? value;
}

function rewriteSaveTreeRecord(
  value: unknown,
  nodeIdMap: Map<string, string>,
  rootIdMap: Map<string, string>,
): Record<string, unknown> | null {
  if (!isPlainRecord(value) || !isPlainRecord(value.saveTree)) return null;
  const tree = value.saveTree;
  const nextNodeId = mapNodeId(tree.nodeId, nodeIdMap);
  const nextRootId = mapRootId(tree.rootId, rootIdMap);
  const nextParentNodeId = mapNodeId(tree.parentNodeId, nodeIdMap);
  if (
    nextNodeId === tree.nodeId
    && nextRootId === tree.rootId
    && nextParentNodeId === tree.parentNodeId
  ) return null;
  return {
    ...value,
    saveTree: {
      ...tree,
      nodeId: nextNodeId,
      rootId: nextRootId,
      parentNodeId: nextParentNodeId,
    },
  };
}

function rewriteDeltaRecord(
  value: unknown,
  nodeIdMap: Map<string, string>,
  rootIdMap: Map<string, string>,
): Record<string, unknown> | null {
  if (!isPlainRecord(value)) return null;
  const nextNodeId = mapNodeId(value.nodeId, nodeIdMap);
  const nextRootId = mapRootId(value.rootId, rootIdMap);
  const nextParentNodeId = mapNodeId(value.parentNodeId, nodeIdMap);
  if (
    nextNodeId === value.nodeId
    && nextRootId === value.rootId
    && nextParentNodeId === value.parentNodeId
  ) return null;
  return {
    ...value,
    nodeId: nextNodeId,
    rootId: nextRootId,
    parentNodeId: nextParentNodeId,
  };
}

// ── Save operations ──

export async function saveGame(data: 存档数据): Promise<number> {
  try {
    return await runWithSaveMutationPriority(() => saveGameInternal(data));
  } catch (error) {
    if (data.type === 'imported') {
      const tree = (data as SaveWithTree).saveTree;
      devLogError('save', 'import-save-persist-failed', error, {
        rootId: tree?.rootId,
        nodeId: tree?.nodeId,
      });
    }
    throw error;
  }
}

async function saveGameInternal(data: 存档数据): Promise<number> {
  const sourceData = stripCloudBackupRestoreRuntime(data);
  const db = await openDB();
  const assetRecords = materializeSaveAssetRecords(extractSaveAssetRecords(sourceData));
  const storedData = stripSaveAssetPayloadForStorage(sourceData);
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
    const request = store.add(rest);
    request.onsuccess = () => {
      const id = request.result as number;
      savedId = id;
      const savedForDelta = { ...storedData, id };
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
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve({ id: savedId, save: { ...sourceData, id: savedId }, delta: savedDelta });
    tx.onerror = () => reject(toError(tx.error));
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
    tx.onerror = () => reject(toError(tx.error));
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

/** 通过轻量目录反查 saveTree 节点对应的 IndexedDB 数字主键。 */
export async function loadSaveIdByNodeId(nodeId: string): Promise<number | null> {
  const normalizedNodeId = normalizeNodeId(nodeId);
  if (!normalizedNodeId) return null;
  const db = await openDB();
  const summaries = await readSaveSummaries(db);
  return summaries.find((item) => item.saveTree?.nodeId === normalizedNodeId)?.id ?? null;
}

/**
 * 对当前未封版 head 行做轻量原地写入；不会经过资产抽取、delta、rotation 或 saveGameInternal。
 * 已封版的历史行一律拒绝改写。
 */
export async function putHeadRow(saveId: number, patch: Partial<存档数据>): Promise<void> {
  const startedAt = Date.now();
  const { id: _ignoredId, ...patchWithoutId } = patch;
  void _ignoredId;
  const patchKeys = Object.keys(patchWithoutId);
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const getRequest = saveStore.get(saveId);
    let wrote = false;
    getRequest.onsuccess = () => {
      const current = getRequest.result as StoredSaveMeta | undefined;
      if (!current) {
        const error = new Error('未找到要写入的草稿存档。');
        devLogError('save', 'puthead-rejected-missing', error, { saveId });
        reject(error);
        return;
      }
      if (!isUnsealedHeadSave(current)) {
        const error = new Error('已封版历史节点不可通过 putHeadRow 改写。');
        devLogError('save', 'puthead-rejected-sealed', error, { saveId });
        reject(error);
        return;
      }
      const next: StoredSaveMeta = { ...current, ...patchWithoutId, id: saveId };
      saveStore.put(next);
      summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(next)));
      wrote = true;
    };
    getRequest.onerror = () => reject(toError(getRequest.error));
    tx.oncomplete = () => {
      if (wrote) {
        devLog('save', 'puthead', {
          saveId,
          fieldCount: patchKeys.length,
          durationMs: Date.now() - startedAt,
        });
      }
      resolve();
    };
    tx.onerror = () => reject(toError(tx.error));
    tx.onabort = () => reject(tx.error ?? new Error('草稿存档写入事务已中止。'));
  });
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
    tx.onerror = () => reject(toError(tx.error));
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
    request.onerror = () => reject(toError(request.error));
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
    request.onerror = () => reject(toError(request.error));
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
        fail(new Error(`云备份合并暂存条目无效：${JSON.stringify(cursor.key)}`));
        return;
      }
      if (staged.kind === 'asset') {
        if (!staged.record.id) {
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
        });
        const { id: _discardedId, ...withoutId } = normalized;
        void _discardedId;
        const addRequest = saveStore.add(withoutId);
        addRequest.onsuccess = () => {
          try {
            const id = Number(addRequest.result);
            if (!Number.isSafeInteger(id) || id <= 0) throw new Error('云备份节点没有获得有效的本地 ID。');
            const saved = { ...normalized, id };
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

async function replaceAllSavesInternal(nextSaves: 存档数据[]): Promise<void> {
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
    tx.onerror = () => reject(toError(tx.error));
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
  if (parentSummary.unsealedHead === true || isUnsealedHeadSave(parentSave)) {
    devLog('save', 'delta-base-skipped-unsealed-head', { saveId: parentSummary.id, nodeId: tree.parentNodeId });
    return null;
  }
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
    request.onsuccess = () => {
      const result = request.result as 存档数据 | undefined;
      resolve(result ?? null);
    };
    request.onerror = () => reject(toError(request.error));
  });
}

async function restoreDeltaSaveIfNeeded(db: IDBDatabase, save: 存档数据, visited = new Set<number>()): Promise<存档数据> {
  if (!isDeltaOnlyStoredSave(save)) return save;
  const saveId = save.id || 0;
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
  const orphanIds = Array.from(new Set([
    ...records
      .filter((record) => record.visibility === 'hidden-delta-base')
      .map((record) => record.id),
  ]))
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
    tx.onerror = () => reject(toError(tx.error));
  });
}

async function loadDeltaRecordByNodeId(db: IDBDatabase, nodeId: string): Promise<SaveNodeDeltaRecord | null> {
  if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly');
    const req = tx.objectStore(SAVE_NODE_DELTAS_STORE).get(nodeId);
    req.onsuccess = () => {
      const result = req.result as SaveNodeDeltaRecord | undefined;
      resolve(result ?? null);
    };
    req.onerror = () => reject(toError(req.error));
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
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
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
      req.onerror = () => reject(toError(req.error));
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
    const delta = buildSaveNodeDeltaRecord(storedSave, storedSave.id || 0);
    if (delta) {
      deltaStore.put(delta);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

// ── NewestStory（两层存储工作区槽，片 5a-2 D1-A）──

export async function loadNewestStory(): Promise<NewestStory记录> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEWEST_STORY_STORE, 'readonly');
    const request = tx.objectStore(NEWEST_STORY_STORE).get(NEWEST_STORY_STORE_KEY);
    request.onsuccess = () => resolve(归一化NewestStory记录(request.result));
    request.onerror = () => {
      const error = request.error;
      reject(error instanceof Error ? error : new Error('读取 newestStory 记录失败。'));
    };
  });
}

export async function saveNewestStory(record: NewestStory记录): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NEWEST_STORY_STORE, 'readwrite');
    tx.objectStore(NEWEST_STORY_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      const error = tx.error;
      reject(error instanceof Error ? error : new Error('写入 newestStory 记录失败。'));
    };
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
    const request = tx.objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => {
      const result = request.result as { value?: T } | undefined;
      resolve(result?.value ?? null);
    };
    request.onerror = () => reject(toError(request.error));
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await deleteIndexedSetting(key);
}

async function writeIndexedSetting(key: string, value: unknown): Promise<void> {
  const storedValue = 剥离游戏设置运行态键(key, value);
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put({ key, value: storedValue });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

/** 单点剥离（片 5a-2 D3）：gameSettings 落盘时剔除两运行态键，内存 state.gameSettings 不动。 */
function 剥离游戏设置运行态键(key: string, value: unknown): unknown {
  if (key !== 'gameSettings') return value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const source = value as Record<string, unknown>;
  if (!('macroGlobalVars' in source) && !('worldbookTriggerStates' in source)) return value;
  const { macroGlobalVars: _macro, worldbookTriggerStates: _trigger, ...rest } = source;
  void _macro;
  void _trigger;
  return rest;
}

async function deleteIndexedSetting(key: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
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
      timestamp: save.timestamp || 0,
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
  const travelerName = sanitizeFilename(save.旅人.姓名 || 'traveler');
  const turnCount = save.turnCount;
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
  const travelerName = sanitizeFilename(save.旅人.姓名 || 'traveler');
  const turnCount = save.turnCount;
  const stamp = new Date(save.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.download = `KaiTuoYiShi-${travelerName}-turn-${turnCount}-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportSaveTreePackage(saves: 存档数据[]): Promise<void> {
  if (!saves.length) return;
  const blob = await buildSaveTreePackage(saves);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const latest = [...saves].sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0))[0];
  const travelerName = sanitizeFilename(latest.旅人.姓名 || 'traveler');
  const turnCount = latest.turnCount;
  const stamp = new Date(latest.timestamp || Date.now())
    .toISOString()
    .replace(/[:.]/g, '-');
  a.href = url;
  a.download = `KaiTuoYiShi-${travelerName}-tree-${saves.length}-nodes-turn-${turnCount}-${stamp}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importSaveJson(json: string): 存档数据 {
  const data: unknown = JSON.parse(json);
  if (!isImportableSave(data)) throw new Error('无效的存档文件');
  return data;
}

export async function importSaveFile(file: File): Promise<存档数据> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json') || file.type === 'application/json') {
    return importSaveJson(await file.text());
  }
  if (name.endsWith('.ktysave') || name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    const data: unknown = await parseSavePackage(await file.arrayBuffer());
    if (!isImportableSave(data)) throw new Error('无效的存档包');
    return data;
  }
  throw new Error('不支持的存档格式，请选择 .zip、.ktysave 或旧版 .json');
}

export async function importSaveFileAsMany(file: File): Promise<存档数据[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.json') || file.type === 'application/json') {
    const saves = [importSaveJson(await file.text())];
    devLog('save', 'import-save-parsed', { nodeCount: saves.length });
    return saves;
  }
  if (name.endsWith('.ktysave') || name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
    const saves = await parseSaveTreePackage(await file.arrayBuffer());
    const remapped = remapImportedSaveTree(saves);
    if (!remapped.every(isImportableSave)) throw new Error('无效的存档包');
    devLog('save', 'import-save-parsed', { nodeCount: saves.length });
    const rootId = (remapped[0] as SaveWithTree | undefined)?.saveTree?.rootId;
    devLog('save', 'import-save-tree-remapped', { nodeCount: remapped.length, rootId });
    return remapped;
  }
  throw new Error('不支持的存档格式，请选择 .zip、.ktysave 或旧版 .json');
}

function isImportableSave(value: unknown): value is 存档数据 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  return Boolean(
    raw.旅人
    && raw.世界
    && Array.isArray(raw.chatHistory)
    && raw.gameSettings
    && raw.apiSettings
    && raw.theme,
  );
}

function remapImportedSaveTree(saves: 存档数据[]): 存档数据[] {
  const rootId = createImportId();
  const nodeIdMap = new Map<string, string>();
  for (const save of saves) {
    const tree = (save as SaveWithTree).saveTree;
    if (tree?.nodeId) {
      nodeIdMap.set(tree.nodeId, createImportId());
    }
  }
  return saves.map((save, index) => {
    const tree = (save as SaveWithTree).saveTree;
    if (!tree?.nodeId) {
      return {
        ...save,
        saveTree: {
          rootId,
          nodeId: createImportId(),
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
        nodeId: nodeIdMap.get(tree.nodeId) ?? createImportId(),
        parentNodeId: tree.parentNodeId ? nodeIdMap.get(tree.parentNodeId) : undefined,
        branchName: tree.branchName ?? '导入节点',
        createdAt: tree.createdAt || save.timestamp || Date.now() + index,
      },
    } as 存档数据;
  });
}

function createImportId(): string {
  return createUnifiedId();
}

function stripCloudBackupRestoreRuntime<T extends 存档数据>(save: T): T {
  const source = save as T & { saveRuntime?: Record<string, unknown> };
  if (!source.saveRuntime || !('cloudBackupOriginFingerprint' in source.saveRuntime)) return save;
  const { cloudBackupOriginFingerprint: _origin, ...remainingRuntime } = source.saveRuntime;
  void _origin;
  return {
    ...save,
    ...(Object.keys(remainingRuntime).length ? { saveRuntime: remainingRuntime } : { saveRuntime: undefined }),
  };
}

function cloudMergeStagePrefix(transferId: string): string {
  const safeTransferId = transferId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160);
  if (!safeTransferId) throw new Error('云备份合并任务 ID 无效。');
  return `internal.cloudMerge.${safeTransferId}.`;
}

function cloudMergeStageKey(transferId: string, recordKey: string): string {
  const safeRecordKey = recordKey.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 220);
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
    request.onerror = () => reject(toError(request.error));
  });
}

async function readIndexedSaveKeys(db: IDBDatabase): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const request = tx.objectStore(SAVES_STORE).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toError(request.error));
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
      timestamp: save.timestamp || 0,
          }));
          return;
        }
        summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(save)));
      };
      request.onerror = () => reject(toError(request.error));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(toError(tx.error));
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

function isUnsealedHeadSave(save: 存档数据): boolean {
  return (save as StoredSaveMeta).saveRuntime?.unsealedHead === true;
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
    getRequest.onerror = () => reject(toError(getRequest.error));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
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
    tx.onerror = () => reject(toError(tx.error));
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
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve(acquired);
    tx.onerror = () => reject(toError(tx.error));
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
    request.onerror = () => reject(toError(request.error));
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
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(toError(tx.error));
  });
}

function buildSaveSummary(save: 存档数据): SaveListItemSummary {
  return {
    id: save.id,
    type: normalizeSaveType(save.type),
    timestamp: save.timestamp,
    saveTree: (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree,
    ...(isUnsealedHeadSave(save) ? { unsealedHead: true } : {}),
    travelerName: save.旅人.姓名,
    turnCount: save.turnCount ?? (save.chatHistory.length + 1),
    worldPeriodName: save.世界.当前时段.名称,
    currentDate: save.世界.当前日期,
    currentTime: save.世界.当前时间,
    currentLocation: save.世界.当前地点,
    lastSummary: summarizeSave(save),
    sizeBytes: estimateSaveSize(save),
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSaveId(value: unknown): number | null {
  const id = Math.floor(Number(value));
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function normalizeNodeId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function summarizeSave(save: 存档数据): string {
  const latestAssistant = [...save.chatHistory]
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
  const chatBytes = save.chatHistory.reduce((sum, message) => {
    return sum + message.content.length + (message.parsedResponse?.body.length ?? 0);
  }, 0);
  const albumAssets = save.相册?.assets ?? [];
  const albumBytes = albumAssets.reduce((sum, asset) => {
    const declaredSize = asset.size || 0;
    if (declaredSize > 0) return sum + declaredSize;
    return sum + (asset.dataUrl?.length ?? 0) + (asset.originalUrl?.length ?? 0);
  }, 0);
  const queueBytes = (save.queueTasks ?? []).reduce((sum, task) => {
    return sum +
      task.title.length +
      (task.subtitle?.length ?? 0) +
      (task.detail?.length ?? 0) +
      (task.retryHint?.length ?? 0);
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
