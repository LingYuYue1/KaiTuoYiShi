import type { 存档数据, 存档类型 } from '@/models/settings';
import { buildSavePackage, buildSaveTreePackage, parseSavePackage, parseSaveTreePackage, sanitizeSaveForExport } from './savePackage';
import {
  extractSaveAssetRecords,
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

const DB_NAME = 'TimeJourneyDB';
const DB_VERSION = 5;
const SAVES_STORE = 'saves';
const SAVE_SUMMARIES_STORE = 'saveSummaries';
const SAVE_ASSETS_STORE = 'saveAssets';
const SAVE_NODE_DELTAS_STORE = 'saveNodeDeltas';
const SETTINGS_STORE = 'settings';
const MAX_MANUAL_SAVE_NODES = 6;
const MAX_AUTO_SAVE_TREES = 6;
const MAX_BACKUP_SAVES = 3;
const MAX_DELTA_NODES_PER_CHECKPOINT = 6;
const SUMMARY_REBUILD_BATCH_SIZE = 8;

type StoredSaveMeta = 存档数据 & {
  saveRuntime?: {
    hiddenDeltaBase?: boolean;
  };
};

type SaveWithTree = 存档数据 & {
  saveTree?: import('@/utils/saveTree').存档树元信息;
};

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
  const db = await openDB();
  const saveType = normalizeSaveType(data.type);
  if (saveType === 'manual') {
    await pruneManagedSavesBeforeWrite(db, 'manual', MAX_MANUAL_SAVE_NODES - 1);
  } else if (saveType === 'auto') {
    await pruneAutoSaveTreesBeforeWrite(db, (data as SaveWithTree).saveTree?.rootId);
  } else if (saveType === 'backup') {
    await pruneManagedSavesBeforeWrite(db, 'backup', MAX_BACKUP_SAVES - 1);
  }
  const assetRecords = extractSaveAssetRecords(data);
  const storedData = stripSaveAssetPayloadForStorage(data);
  const deltaBase = await findAutoDeltaBase(db, storedData);
  return new Promise((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_ASSETS_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const store = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const assetStore = tx.objectStore(SAVE_ASSETS_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    // 让 autoIncrement 生效：调用方传的 id=0 视为「未指定」，删掉这个字段
    // 否则 IDB 会拿 0 当显式主键，第二次 add 必然撞 "Key already exists"
    for (const record of assetRecords) assetStore.put(record);
    const { id: _ignoredId, ...rest } = storedData;
    void _ignoredId;
    let savedId = 0;
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
      if (delta) deltaStore.put(delta);
      summaryStore.put(buildSaveSummary(savedForDelta));
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => {
      rotateManagedSaves(db).catch(() => {});
      resolve(savedId);
    };
    tx.onerror = () => reject(tx.error);
  });
}

async function pruneManagedSavesBeforeWrite(db: IDBDatabase, type: 存档类型, keepCount: number): Promise<void> {
  const summaries = await new Promise<SaveListItemSummary[]>((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readonly');
    const req = tx.objectStore(SAVE_SUMMARIES_STORE).getAll();
    req.onsuccess = () => resolve(req.result as SaveListItemSummary[]);
    req.onerror = () => reject(req.error);
  });
  const existing = summaries
    .filter((item) => item.type === type)
    .sort((a, b) => b.timestamp - a.timestamp);
  const candidates = existing.slice(Math.max(0, keepCount));
  await deleteManagedSaveItems(db, candidates);
}

async function pruneAutoSaveTreesBeforeWrite(db: IDBDatabase, incomingRootId?: string): Promise<void> {
  const summaries = await readSaveSummaries(db);
  const autoSaves = summaries.filter((item) => item.type === 'auto');
  const incomingKnown = Boolean(
    incomingRootId && autoSaves.some((item) => getSaveTreeRootKey(item) === incomingRootId),
  );
  const keepTreeCount = incomingKnown ? MAX_AUTO_SAVE_TREES : MAX_AUTO_SAVE_TREES - 1;
  const candidates = getAutoSaveTreeRotationCandidates(autoSaves, incomingRootId, keepTreeCount);
  await deleteManagedSaveItems(db, candidates);
}

function getSaveTreeRootKey(item: SaveListItemSummary): string {
  return item.saveTree?.rootId || `legacy-auto-root-${item.id}`;
}

function getAutoSaveTreeRotationCandidates(
  autoSaves: SaveListItemSummary[],
  incomingRootId?: string,
  keepTreeCount = MAX_AUTO_SAVE_TREES,
): SaveListItemSummary[] {
  const byRoot = new Map<string, SaveListItemSummary[]>();
  for (const save of autoSaves) {
    const rootId = getSaveTreeRootKey(save);
    const bucket = byRoot.get(rootId) ?? [];
    bucket.push(save);
    byRoot.set(rootId, bucket);
  }

  const roots = Array.from(byRoot.entries())
    .map(([rootId, nodes]) => ({
      rootId,
      nodes,
      latestTimestamp: Math.max(...nodes.map((node) => node.timestamp || 0)),
    }))
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp);

  const protectedRootIds = new Set(
    roots.slice(0, Math.max(0, keepTreeCount)).map((root) => root.rootId),
  );
  if (incomingRootId) protectedRootIds.add(incomingRootId);

  return roots
    .filter((root) => !protectedRootIds.has(root.rootId))
    .flatMap((root) => root.nodes);
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
      } else {
        markSaveAsHiddenDeltaBase(saveStore, item.id);
      }
      summaryStore.delete(item.id);
      deleteDeltaBySaveId(tx.objectStore(SAVE_NODE_DELTAS_STORE), item.id);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await cleanupUnreferencedHiddenSaves(db);
}

export interface SaveListItemSummary {
  id: number;
  type: 存档类型;
  timestamp: number;
  saveTree?: import('@/utils/saveTree').存档树元信息;
  travelerName: string;
  turnCount: number;       // 当前运行回合计数；旧存档缺失时按 chatHistory 兜底推算
  worldPeriodName: string; // 当前世界期名，空字符串表示未设置
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  lastSummary: string;
  sizeBytes: number;
}

export async function getSaveList(): Promise<SaveListItemSummary[]> {
  const db = await openDB();
  let list = sortSaveSummaries(await readSaveSummaries(db));
  if (list.length > 0) {
    void ensureSaveSummaries(db, SUMMARY_REBUILD_BATCH_SIZE).catch((error) => {
      console.warn('[save-list] background summary rebuild failed', error);
    });
    return list;
  }
  await ensureSaveSummaries(db, SUMMARY_REBUILD_BATCH_SIZE);
  list = sortSaveSummaries(await readSaveSummaries(db));
  void ensureSaveSummaries(db, SUMMARY_REBUILD_BATCH_SIZE).catch((error) => {
    console.warn('[save-list] background summary rebuild failed', error);
  });
  return list;
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
  const records = await loadSaveAssetRecords(db, assetIds);
  return restoreSaveAssetPayloadFromRecords(saveForAssets, records);
}

export async function loadLatestSave(): Promise<存档数据 | null> {
  const list = await getSaveList();
  if (list.length === 0) return null;
  const latestPlayable = list.find((item) => item.type !== 'backup') ?? list[0];
  return loadSave(latestPlayable.id);
}

export async function deleteSave(id: number): Promise<void> {
  const db = await openDB();
  const isReferencedBase = await isSaveReferencedAsDeltaBase(db, id);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    if (!isReferencedBase) {
      tx.objectStore(SAVES_STORE).delete(id);
    } else {
      markSaveAsHiddenDeltaBase(tx.objectStore(SAVES_STORE), id);
    }
    tx.objectStore(SAVE_SUMMARIES_STORE).delete(id);
    deleteDeltaBySaveId(tx.objectStore(SAVE_NODE_DELTAS_STORE), id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  await cleanupUnreferencedHiddenSaves(db);
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

export async function replaceAllSaves(nextSaves: 存档数据[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
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
      for (const record of extractSaveAssetRecords(normalizedSave)) assetStore.put(record);
      const storedSave = stripSaveAssetPayloadForStorage(normalizedSave);
      store.put(storedSave);
      summaryStore.put(buildSaveSummary(storedSave));
      const delta = buildSaveNodeDeltaRecord(storedSave, normalizedId);
      if (delta) deltaStore.put(delta);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function hasAnySave(): Promise<boolean> {
  const list = await getSaveList();
  return list.length > 0;
}

function deleteDeltaBySaveId(deltaStore: IDBObjectStore, saveId: number): void {
  const req = deltaStore.getAll();
  req.onsuccess = () => {
    for (const delta of req.result as SaveNodeDeltaRecord[]) {
      if (delta.saveId === saveId) deltaStore.delete(delta.nodeId);
    }
  };
}

async function findAutoDeltaBase(db: IDBDatabase, save: 存档数据): Promise<{ baseSave: 存档数据; baseSaveId: number } | null> {
  if (save.type !== 'auto') return null;
  const tree = (save as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree;
  if (!tree?.parentNodeId) return null;
  const summaries = await new Promise<SaveListItemSummary[]>((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readonly');
    const req = tx.objectStore(SAVE_SUMMARIES_STORE).getAll();
    req.onsuccess = () => resolve(req.result as SaveListItemSummary[]);
    req.onerror = () => reject(req.error);
  });
  const parentSummary = summaries.find((item) => item.saveTree?.nodeId === tree.parentNodeId);
  if (!parentSummary?.id) return null;
  const parentSave = await loadRawSave(db, parentSummary.id);
  if (!parentSave) return null;
  const baseSaveId = isDeltaOnlyStoredSave(parentSave)
    ? await resolveDeltaBaseSaveId(db, parentSave)
    : parentSummary.id;
  if (!baseSaveId) return null;
  const deltaCount = await countDeltasUsingBase(db, baseSaveId);
  if (deltaCount >= MAX_DELTA_NODES_PER_CHECKPOINT) return null;
  const baseSave = await loadRawSave(db, baseSaveId);
  if (!baseSave || isDeltaOnlyStoredSave(baseSave)) return null;
  return { baseSave, baseSaveId };
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
  if (!tree?.nodeId || !db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) return save;
  const delta = await loadDeltaRecordByNodeId(db, tree.nodeId);
  const baseSaveId = delta?.deltaPayload?.baseSaveId
    ?? (save as 存档数据 & { saveStorage?: { baseSaveId?: number } }).saveStorage?.baseSaveId;
  if (!delta || !baseSaveId) return save;
  const rawBase = await loadRawSave(db, baseSaveId);
  if (!rawBase) return save;
  const base = await restoreDeltaSaveIfNeeded(db, rawBase, visited);
  return restoreSaveFromDelta(base, save, delta);
}

async function getReferencedDeltaBaseIds(db: IDBDatabase): Promise<Set<number>> {
  const referencedBaseIds = new Set<number>();
  if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) return referencedBaseIds;
  const deltas = await new Promise<SaveNodeDeltaRecord[]>((resolve, reject) => {
    const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly');
    const req = tx.objectStore(SAVE_NODE_DELTAS_STORE).getAll();
    req.onsuccess = () => resolve(req.result as SaveNodeDeltaRecord[]);
    req.onerror = () => reject(req.error);
  });
  for (const delta of deltas) {
    if (delta.deltaPayload?.baseSaveId) referencedBaseIds.add(delta.deltaPayload.baseSaveId);
  }
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
  if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) return 0;
  const deltas = await new Promise<SaveNodeDeltaRecord[]>((resolve, reject) => {
    const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly');
    const req = tx.objectStore(SAVE_NODE_DELTAS_STORE).getAll();
    req.onsuccess = () => resolve(req.result as SaveNodeDeltaRecord[]);
    req.onerror = () => reject(req.error);
  });
  return deltas.filter((delta) => delta.deltaPayload?.baseSaveId === baseSaveId).length;
}

async function isSaveReferencedAsDeltaBase(db: IDBDatabase, saveId: number): Promise<boolean> {
  if (!db.objectStoreNames.contains(SAVE_NODE_DELTAS_STORE)) return false;
  const referencedBaseIds = await getReferencedDeltaBaseIds(db);
  return referencedBaseIds.has(saveId);
}

async function cleanupUnreferencedHiddenSaves(db: IDBDatabase): Promise<void> {
  const [summaries, deltas, saves] = await Promise.all([
    new Promise<SaveListItemSummary[]>((resolve, reject) => {
      const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readonly');
      const req = tx.objectStore(SAVE_SUMMARIES_STORE).getAll();
      req.onsuccess = () => resolve(req.result as SaveListItemSummary[]);
      req.onerror = () => reject(req.error);
    }),
    new Promise<SaveNodeDeltaRecord[]>((resolve, reject) => {
      const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly');
      const req = tx.objectStore(SAVE_NODE_DELTAS_STORE).getAll();
      req.onsuccess = () => resolve(req.result as SaveNodeDeltaRecord[]);
      req.onerror = () => reject(req.error);
    }),
    new Promise<存档数据[]>((resolve, reject) => {
      const tx = db.transaction(SAVES_STORE, 'readonly');
      const req = tx.objectStore(SAVES_STORE).getAll();
      req.onsuccess = () => resolve(req.result as 存档数据[]);
      req.onerror = () => reject(req.error);
    }),
  ]);
  const visibleSaveIds = new Set(summaries.map((summary) => summary.id));
  const referencedBaseIds = new Set<number>();
  for (const delta of deltas) {
    if (delta.deltaPayload?.baseSaveId) referencedBaseIds.add(delta.deltaPayload.baseSaveId);
  }
  const orphanIds = saves
    .filter((save) => Boolean((save as StoredSaveMeta).saveRuntime?.hiddenDeltaBase))
    .map((save) => Number(save.id) || 0)
    .filter((id) => id > 0 && !visibleSaveIds.has(id) && !referencedBaseIds.has(id));
  if (!orphanIds.length) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readwrite');
    const store = tx.objectStore(SAVES_STORE);
    for (const id of orphanIds) store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadDeltaRecordByNodeId(db: IDBDatabase, nodeId: string): Promise<SaveNodeDeltaRecord | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_NODE_DELTAS_STORE, 'readonly');
    const req = tx.objectStore(SAVE_NODE_DELTAS_STORE).get(nodeId);
    req.onsuccess = () => resolve((req.result as SaveNodeDeltaRecord) ?? null);
    req.onerror = () => reject(req.error);
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
  const records = extractSaveAssetRecords(save);
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
    if (delta) deltaStore.put(delta);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Settings operations ──

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSetting<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
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

export async function deleteSetting(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite');
    const store = tx.objectStore(SETTINGS_STORE);
    store.delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ── Auto-save rotation ──

async function rotateManagedSaves(db: IDBDatabase): Promise<void> {
  const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readonly');
  const store = tx.objectStore(SAVE_SUMMARIES_STORE);
  const all: SaveListItemSummary[] = await new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as SaveListItemSummary[]);
    req.onerror = () => reject(req.error);
  });
  const autoSaves = all
    .filter((s) => s.type === 'auto')
    .sort((a, b) => b.timestamp - a.timestamp);
  const manualSaves = all
    .filter((s) => s.type === 'manual')
    .sort((a, b) => b.timestamp - a.timestamp);
  const backupSaves = all
    .filter((s) => s.type === 'backup')
    .sort((a, b) => b.timestamp - a.timestamp);
  const candidates = [
    ...manualSaves.slice(MAX_MANUAL_SAVE_NODES),
    ...getAutoSaveTreeRotationCandidates(autoSaves, undefined, MAX_AUTO_SAVE_TREES),
    ...backupSaves.slice(MAX_BACKUP_SAVES),
  ];
  await deleteManagedSaveItems(db, candidates);
}

function markSaveAsHiddenDeltaBase(saveStore: IDBObjectStore, saveId: number): void {
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
  };
}

// ── Export / Import ──

export function exportSaveJson(save: 存档数据): void {
  const json = JSON.stringify(sanitizeSaveForExport(save), null, 2);
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

function normalizeSaveType(type: unknown): 存档类型 {
  return type === 'auto' || type === 'backup' || type === 'imported' ? type : 'manual';
}

async function readSaveSummaries(db: IDBDatabase): Promise<SaveListItemSummary[]> {
  if (!db.objectStoreNames.contains(SAVE_SUMMARIES_STORE)) return [];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readonly');
    const store = tx.objectStore(SAVE_SUMMARIES_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const list = (request.result as Array<SaveListItemSummary | 存档数据>)
        .map((s) => isSaveListItemSummary(s) ? s : buildSaveSummary(s as 存档数据));
      resolve(list);
    };
    request.onerror = () => reject(request.error);
  });
}

function sortSaveSummaries(list: SaveListItemSummary[]): SaveListItemSummary[] {
  return [...list].sort((a, b) => b.timestamp - a.timestamp);
}

async function ensureSaveSummaries(db: IDBDatabase, batchLimit = Infinity): Promise<void> {
  if (!db.objectStoreNames.contains(SAVE_SUMMARIES_STORE)) return;
  const summaries = await readSaveSummaries(db);
  const summarizedIds = new Set(summaries.map((summary) => summary.id));
  const missingVisibleSaves = await collectMissingVisibleSavesForSummary(db, summarizedIds, batchLimit);
  if (!missingVisibleSaves.length) return;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readwrite');
    const store = tx.objectStore(SAVE_SUMMARIES_STORE);
    for (const save of missingVisibleSaves) store.put(buildSaveSummary(save));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function collectMissingVisibleSavesForSummary(
  db: IDBDatabase,
  summarizedIds: Set<number>,
  batchLimit: number,
): Promise<存档数据[]> {
  if (batchLimit <= 0) return [];
  const missing: 存档数据[] = [];
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const store = tx.objectStore(SAVES_STORE);
    const request = store.openCursor(null, 'prev');
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || missing.length >= batchLimit) {
        resolve();
        return;
      }
      const save = cursor.value as 存档数据;
      const id = Number(save.id) || 0;
      if (id > 0 && !summarizedIds.has(id) && !isHiddenDeltaBaseSave(save)) {
        missing.push(save);
      }
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  return missing;
}

export async function rebuildSaveSummariesBatch(batchLimit = SUMMARY_REBUILD_BATCH_SIZE): Promise<number> {
  const db = await openDB();
  const before = await readSaveSummaries(db);
  await ensureSaveSummaries(db, batchLimit);
  const after = await readSaveSummaries(db);
  return Math.max(0, after.length - before.length);
}

export async function repairSaveDatabase(): Promise<void> {
  dbPromise?.then((db) => db.close()).catch(() => {});
  dbPromise = null;
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(SAVE_SUMMARIES_STORE, 'readwrite');
    tx.objectStore(SAVE_SUMMARIES_STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  for (let guard = 0; guard < 1000; guard += 1) {
    const rebuilt = await rebuildSaveSummariesBatch(64);
    if (rebuilt <= 0) break;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 0));
  }
}

function isHiddenDeltaBaseSave(save: 存档数据): boolean {
  return Boolean((save as StoredSaveMeta).saveRuntime?.hiddenDeltaBase);
}

function isSaveListItemSummary(value: unknown): value is SaveListItemSummary {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as SaveListItemSummary).id === 'number' &&
    typeof (value as SaveListItemSummary).timestamp === 'number' &&
    !('chatHistory' in (value as Record<string, unknown>)),
  );
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
