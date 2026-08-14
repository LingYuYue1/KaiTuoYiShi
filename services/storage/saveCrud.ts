import type { 存档数据, DeviceSettings } from '@/models/settings';
import { 创建空API设置, 创建默认游戏设置, createSaveEnvelope, hydrateSaveEnvelope } from '@/models/settings';
import { devLog, devLogError } from '@/utils/devLog';
import type { SaveCatalogSnapshot, SaveListItemSummary } from '@/contracts/storage';
import type { CloudTransferSaveBundle } from '@/contracts/cloudSave';
import {
  buildSaveSummary,
  isUnsealedHeadSave,
  normalizeSaveType,
  stripCloudBackupRestoreRuntime,
  type StoredSaveMeta,
} from './saveSummary';
import {
  loadRawSave,
  loadDeltaRecordByNodeId,
  readIndexedSaveCatalogSnapshot,
  readSaveCatalogRecords,
  readSaveSummaries,
  restoreDeltaSaveIfNeeded,
  scanIndexedDeltaRecords,
} from './saveRecord';
import {
  buildDeltaOnlyStoredSave,
  buildSaveNodeDeltaRecord,
  isDeltaOnlyStoredSave,
  type SaveNodeDeltaRecord,
} from '@/utils/saveDeltaStorage';
import {
  extractSaveAssetRecords,
  materializeSaveAssetRecords,
  restoreSaveAssetPayloadFromRecords,
  saveHasEmbeddedAssetPayload,
  stripSaveAssetPayloadForStorage,
  type SaveAssetRecord,
} from '@/utils/saveAssetStorage';
import {
  createCatalogRecordFromSummary,
  createHiddenDeltaBaseCatalogRecord,
} from '@/services/storage/saveCatalog';
import { runWithSaveMutationPriority } from '@/services/storage/saveCatalogRepair';
import {
  openDB,
  SAVES_STORE,
  SAVE_SUMMARIES_STORE,
  SAVE_ASSETS_STORE,
  SAVE_NODE_DELTAS_STORE,
  MAX_DELTA_NODES_PER_CHECKPOINT,
} from './dbConnection';
import { loadSetting, saveSetting } from './settings';
import { startSaveCatalogRepair } from './catalogMaintenance';
import { isPlainRecord, normalizeNodeId, normalizeSaveId, toError } from '@/utils/storageUtils';

export interface SaveGameOptions {
  /**
   * 强制全量存储（不做 delta 编码）。仅限叶子（工作区）节点使用：
   * 叶子行是 putHeadRow 原地写入的目标，必须是全量行，否则 delta-only 行会被覆盖丢数据。
   */
  forceFullStore?: boolean;
}

export async function saveGame(data: 存档数据, options?: SaveGameOptions): Promise<number> {
  try {
    return await runWithSaveMutationPriority(() => saveGameInternal(data, options));
  } catch (error) {
    if (data.type === 'imported') {
      const tree = (data as 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 }).saveTree;
      devLogError('save', 'import-save-persist-failed', error, {
        rootId: tree?.rootId,
        nodeId: tree?.nodeId,
      });
    }
    throw error;
  }
}

async function saveGameInternal(data: 存档数据, options?: SaveGameOptions): Promise<number> {
  const sourceData = stripCloudBackupRestoreRuntime(data);
  const db = await openDB();
  const assetRecords = materializeSaveAssetRecords(extractSaveAssetRecords(sourceData));
  const storedData = stripSaveAssetPayloadForStorage({
    ...createSaveEnvelope(sourceData).gameData,
    id: sourceData.id,
    type: sourceData.type,
    timestamp: sourceData.timestamp,
    turnCount: sourceData.turnCount,
    ...(sourceData as 存档数据 & { saveTree?: unknown }).saveTree
      ? { saveTree: (sourceData as 存档数据 & { saveTree?: unknown }).saveTree }
      : {},
  });
  const deltaBase = options?.forceFullStore ? null : await findAutoDeltaBase(db, storedData);
  const saved = await new Promise<{ id: number; save: 存档数据 }>((resolve, reject) => {
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
        deltaStore.put(delta);
      }
      summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(savedForDelta)));
    };
    request.onerror = () => reject(toError(request.error));
    tx.oncomplete = () => resolve({ id: savedId, save: { ...sourceData, id: savedId } });
    tx.onerror = () => reject(toError(tx.error));
  });
  return saved.id;
}

export async function deleteManagedSaveItems(db: IDBDatabase, candidates: SaveListItemSummary[]): Promise<void> {
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

export async function getSaveCatalogSnapshot(): Promise<SaveCatalogSnapshot> {
  const db = await openDB();
  return readIndexedSaveCatalogSnapshot(db);
}

/**
 * 通过轻量目录反查 saveTree 节点对应的 IndexedDB 数字主键。
 * 目录摘要（saveSummaries）只收录可见节点；hidden-delta-base / unreadable / legacy-backup 等
 * 节点不在 items 里。目录未命中时回退到 saves 表直接按 saveTree.nodeId 扫描，
 * 避免父检查点真实存在却被误判为缺失（reroll-parent-missing）。
 */
export async function loadSaveIdByNodeId(nodeId: string): Promise<number | null> {
  const normalizedNodeId = normalizeNodeId(nodeId);
  if (!normalizedNodeId) return null;
  const db = await openDB();
  const summaries = await readSaveSummaries(db);
  const fromSummaries = summaries.find((item) => item.saveTree?.nodeId === normalizedNodeId);
  if (fromSummaries) return fromSummaries.id;
  return findSaveIdByNodeIdInSavesTable(db, normalizedNodeId);
}

/** reroll 父检查点存在性探针：父节点必须真实存在且与当前叶子同属一棵存档树。
 * 与 handleReroll 的祖先探测同语义（loadSaveIdByNodeId 自带 saves 表回退，
 * 目录恢复未完成不会误判缺失）。供 useGameState 的主动验证 effect 调用。 */
export async function validateRerollParent(rootId: string, parentNodeId: string): Promise<boolean> {
  const saveId = await loadSaveIdByNodeId(parentNodeId);
  if (!saveId) return false;
  const save = await loadSave(saveId);
  const tree = (save as { saveTree?: { rootId?: string | null } | null } | null)?.saveTree;
  return Boolean(tree?.rootId && tree.rootId === rootId);
}

/** 目录摘要未命中时回退：直接扫描 saves 表匹配 saveTree.nodeId（覆盖隐藏/不可读/legacy 节点）。 */
async function findSaveIdByNodeIdInSavesTable(db: IDBDatabase, nodeId: string): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const store = tx.objectStore(SAVES_STORE);
    const request = store.openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(null);
        return;
      }
      const value = cursor.value as { id?: unknown; saveTree?: { nodeId?: unknown } } | undefined;
      if (value && isPlainRecord(value.saveTree) && value.saveTree.nodeId === nodeId) {
        resolve(normalizeSaveId(value.id));
        return;
      }
      cursor.continue();
    };
    request.onerror = () => reject(toError(request.error));
  });
}

async function hydrateStoredSave(save: 存档数据): Promise<存档数据> {
  const legacy = save as unknown as {
    apiSettings?: import('@/models/settings').API设置;
    gameSettings?: import('@/models/settings').游戏设置;
    theme?: import('@/models/settings').主题预设;
  };
  const [apiSettings, gameSettings, theme] = await Promise.all([
    loadSetting<import('@/models/settings').API设置>('apiSettings'),
    loadSetting<import('@/models/settings').游戏设置>('gameSettings'),
    loadSetting<import('@/models/settings').主题预设>('theme'),
  ]);
  const migratedApi = apiSettings ?? legacy.apiSettings ?? 创建空API设置();
  const migratedGame = gameSettings ?? legacy.gameSettings ?? 创建默认游戏设置();
  const migratedTheme = theme ?? legacy.theme ?? 'deepspace';
  if (apiSettings === null && legacy.apiSettings) await saveSetting('apiSettings', legacy.apiSettings);
  if (gameSettings === null && legacy.gameSettings) await saveSetting('gameSettings', legacy.gameSettings);
  if (theme === null && legacy.theme) await saveSetting('theme', legacy.theme);
  const device: DeviceSettings = {
    apiSettings: migratedApi,
    gameSettings: migratedGame,
    theme: migratedTheme,
    worldbooks: [],
  };
  return hydrateSaveEnvelope({
    id: save.id,
    type: save.type,
    timestamp: save.timestamp,
    turnCount: save.turnCount,
    gameData: save,
    ...(('saveTree' in save && save.saveTree) ? { saveTree: save.saveTree } : {}),
  }, device);
}

export async function loadSave(id: number): Promise<存档数据 | null> {
  const db = await openDB();
  const save = await loadRawSave(db, id);
  const restoredSave = save ? await restoreDeltaSaveIfNeeded(db, save) : null;
  if (!restoredSave) return null;
  const saveForAssets = await hydrateStoredSave(restoredSave);
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

export async function loadSaveForCloudTransfer(id: number): Promise<CloudTransferSaveBundle | null> {
  const db = await openDB();
  const raw = await loadRawSave(db, id);
  const restoredRaw = raw ? await restoreDeltaSaveIfNeeded(db, raw) : null;
  if (!restoredRaw) return null;
  const restored = await hydrateStoredSave(restoredRaw);
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

/**
 * @deprecated 仅限无树 legacy 恢复点与过渡期使用：只删单条存档记录，不维护树结构。
 * 树内节点的删除必须调用 `deleteSaveTreeNode`（叶子仅删自身、内部节点级联修剪子树、newest 槽位重定向）。
 */
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
  const parentSave = await loadRawSave(db, parentSummary.id);
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
    : await loadRawSave(db, baseSaveId);
  if (!baseSave || isDeltaOnlyStoredSave(baseSave)) return null;
  return { baseSave, baseSaveId };
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
