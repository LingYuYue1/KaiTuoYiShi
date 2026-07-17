import type { CloudBackupPartMeta, CloudBackupPointerV2 } from '@/services/cloudBackupPackage';

const CLOUD_TRANSFER_DB = 'KaiTuoYiShiCloudTransferDB';
const CLOUD_TRANSFER_DB_VERSION = 1;
const META_STORE = 'transfers';
const PART_STORE = 'parts';
const TRANSFER_TTL_MS = 24 * 60 * 60 * 1000;

export type CloudBackupTransferDirection = 'upload' | 'download';

export interface CloudBackupTransferMeta {
  transferId: string;
  direction: CloudBackupTransferDirection;
  phase: string;
  createdAt: number;
  updatedAt: number;
  pointer?: CloudBackupPointerV2;
}

interface CloudBackupTransferPartRecord {
  key: string;
  transferId: string;
  index: number;
  createdAt: number;
  meta: CloudBackupPartMeta;
  blob: Blob;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export async function createCloudBackupTransfer(
  transferId: string,
  direction: CloudBackupTransferDirection,
  phase = 'preparing',
): Promise<CloudBackupTransferMeta> {
  const now = Date.now();
  const meta: CloudBackupTransferMeta = { transferId, direction, phase, createdAt: now, updatedAt: now };
  const db = await openTransferDB();
  await requestTransaction(db, META_STORE, 'readwrite', (store) => store.put(meta));
  return meta;
}

export async function updateCloudBackupTransfer(
  transferId: string,
  patch: Partial<Omit<CloudBackupTransferMeta, 'transferId' | 'createdAt'>>,
): Promise<CloudBackupTransferMeta> {
  const db = await openTransferDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readwrite');
    const store = tx.objectStore(META_STORE);
    const request = store.get(transferId);
    let next: CloudBackupTransferMeta | null = null;
    request.onsuccess = () => {
      const current = request.result as CloudBackupTransferMeta | undefined;
      if (!current) {
        tx.abort();
        return;
      }
      next = { ...current, ...patch, transferId, createdAt: current.createdAt, updatedAt: Date.now() };
      store.put(next);
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => next ? resolve(next) : reject(new Error('云备份临时传输不存在。'));
    tx.onerror = () => reject(tx.error ?? new Error('更新云备份临时传输失败。'));
    tx.onabort = () => reject(tx.error ?? new Error('更新云备份临时传输已中止。'));
  });
}

export async function getCloudBackupTransfer(transferId: string): Promise<CloudBackupTransferMeta | null> {
  const db = await openTransferDB();
  return requestTransaction<CloudBackupTransferMeta | null>(db, META_STORE, 'readonly', (store) => store.get(transferId), null);
}

export async function putCloudBackupTransferPart(
  transferId: string,
  meta: CloudBackupPartMeta,
  blob: Blob,
): Promise<void> {
  const db = await openTransferDB();
  const record: CloudBackupTransferPartRecord = {
    key: partKey(transferId, meta.index),
    transferId,
    index: meta.index,
    createdAt: Date.now(),
    meta,
    blob,
  };
  await requestTransaction(db, PART_STORE, 'readwrite', (store) => store.put(record));
}

export async function getCloudBackupTransferPart(
  transferId: string,
  index: number,
): Promise<{ meta: CloudBackupPartMeta; blob: Blob } | null> {
  const db = await openTransferDB();
  const record = await requestTransaction<CloudBackupTransferPartRecord | null>(
    db,
    PART_STORE,
    'readonly',
    (store) => store.get(partKey(transferId, index)),
    null,
  );
  return record ? { meta: record.meta, blob: record.blob } : null;
}

export async function listCloudBackupTransferParts(
  transferId: string,
): Promise<Array<{ meta: CloudBackupPartMeta; blob: Blob }>> {
  const db = await openTransferDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PART_STORE, 'readonly');
    const index = tx.objectStore(PART_STORE).index('transferId');
    const request = index.getAll(transferId);
    request.onsuccess = () => {
      const records = (request.result as CloudBackupTransferPartRecord[])
        .sort((left, right) => left.index - right.index)
        .map((record) => ({ meta: record.meta, blob: record.blob }));
      resolve(records);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCloudBackupTransfer(transferId: string): Promise<void> {
  const db = await openTransferDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE, PART_STORE], 'readwrite');
    tx.objectStore(META_STORE).delete(transferId);
    const index = tx.objectStore(PART_STORE).index('transferId');
    const request = index.openKeyCursor(IDBKeyRange.only(transferId));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return;
      tx.objectStore(PART_STORE).delete(cursor.primaryKey);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function cleanupExpiredCloudBackupTransfers(now = Date.now()): Promise<number> {
  const db = await openTransferDB();
  const expired = await new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(META_STORE, 'readonly');
    const request = tx.objectStore(META_STORE).getAll();
    request.onsuccess = () => resolve((request.result as CloudBackupTransferMeta[])
      .filter((item) => now - item.updatedAt > TRANSFER_TTL_MS)
      .map((item) => item.transferId));
    request.onerror = () => reject(request.error);
  });
  for (const transferId of expired) await deleteCloudBackupTransfer(transferId);
  return expired.length;
}

async function openTransferDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(CLOUD_TRANSFER_DB, CLOUD_TRANSFER_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: 'transferId' });
      if (!db.objectStoreNames.contains(PART_STORE)) {
        const parts = db.createObjectStore(PART_STORE, { keyPath: 'key' });
        parts.createIndex('transferId', 'transferId', { unique: false });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error);
    };
    request.onblocked = () => reject(new Error('云备份临时数据库被其他页面占用。'));
  });
  return dbPromise;
}

function requestTransaction<T = void>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest,
  missingValue?: T,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const request = action(tx.objectStore(storeName));
    let value = missingValue as T;
    request.onsuccess = () => {
      if (typeof request.result !== 'undefined') value = request.result as T;
    };
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => resolve(value);
    tx.onerror = () => reject(tx.error);
  });
}

function partKey(transferId: string, index: number): string {
  return `${transferId}:${String(index).padStart(6, '0')}`;
}
