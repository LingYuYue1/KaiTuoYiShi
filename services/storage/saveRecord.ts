import type { 存档数据 } from '@/models/settings';
import {
  buildSaveCatalogSnapshot,
  createCatalogRecordFromSummary,
  normalizeSaveCatalogRecord,
  type SaveCatalogRecord,
} from '@/services/storage/saveCatalog';
import {
  isDeltaOnlyStoredSave,
  restoreSaveFromDelta,
  type SaveNodeDeltaRecord,
} from '@/utils/saveDeltaStorage';
import type { SaveCatalogSnapshot, SaveListItemSummary } from '@/contracts/storage';
import { buildSaveSummary } from './saveSummary';
import { SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE } from './dbConnection';
import { toError } from '@/utils/storageUtils';

export async function loadRawSave(db: IDBDatabase, id: number): Promise<存档数据 | null> {
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

export async function restoreDeltaSaveIfNeeded(db: IDBDatabase, save: 存档数据, visited = new Set<number>()): Promise<存档数据> {
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
  const rawBase = await loadRawSave(db, baseSaveId);
  if (!rawBase) return save;
  const base = await restoreDeltaSaveIfNeeded(db, rawBase, visited);
  return restoreSaveFromDelta(base, save, delta);
}

export async function loadDeltaRecordByNodeId(db: IDBDatabase, nodeId: string): Promise<SaveNodeDeltaRecord | null> {
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

export async function scanIndexedDeltaRecords(
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

export async function readSaveSummaries(db: IDBDatabase): Promise<SaveListItemSummary[]> {
  return (await readIndexedSaveCatalogSnapshot(db)).items;
}

export async function readSaveCatalogRecords(db: IDBDatabase): Promise<SaveCatalogRecord[]> {
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

export async function readIndexedSaveKeys(db: IDBDatabase): Promise<IDBValidKey[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SAVES_STORE, 'readonly');
    const request = tx.objectStore(SAVES_STORE).getAllKeys();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(toError(request.error));
  });
}

export async function readIndexedSaveCatalogSnapshot(db: IDBDatabase): Promise<SaveCatalogSnapshot> {
  const [records, keys] = await Promise.all([
    readSaveCatalogRecords(db),
    readIndexedSaveKeys(db),
  ]);
  return buildSaveCatalogSnapshot(records, keys);
}
