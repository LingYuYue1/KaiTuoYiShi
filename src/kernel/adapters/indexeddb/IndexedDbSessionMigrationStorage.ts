import type { RawSessionMigrationRecord, SessionMigrationStorage } from '@/src/kernel/ports/SessionMigrationStorage';
import type { StoredSessionRecord } from './sessionPersistenceBackend';
import {
  COMMAND_COMMITS_STORE,
  KERNEL_SESSION_DB_NAME,
  KERNEL_SESSION_DB_VERSION,
  SESSIONS_STORE,
  SESSION_MIGRATION_BACKUPS_STORE,
} from './indexedDbSessionBackend';

export class IndexedDbSessionMigrationStorage implements SessionMigrationStorage {
  constructor(private readonly dbName = KERNEL_SESSION_DB_NAME) {}

  async readRaw(sessionId: string): Promise<RawSessionMigrationRecord | null> {
    const db = await openDb(this.dbName);
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const done = complete(tx);
    const row = await request<StoredSessionRecord | undefined>(tx.objectStore(SESSIONS_STORE).get(sessionId));
    await done;
    db.close();
    return row ?? null;
  }

  async replaceV2(sessionId: string, next: RawSessionMigrationRecord): Promise<void> {
    const db = await openDb(this.dbName);
    const tx = db.transaction([SESSIONS_STORE, COMMAND_COMMITS_STORE, SESSION_MIGRATION_BACKUPS_STORE], 'readwrite');
    const done = complete(tx);
    const sessions = tx.objectStore(SESSIONS_STORE);
    const current = await request<StoredSessionRecord | undefined>(sessions.get(sessionId));
    if (!current || current.schemaVersion !== 2) {
      tx.abort();
      throw new Error('V2 session changed before migration; reload and inspect again');
    }
    tx.objectStore(SESSION_MIGRATION_BACKUPS_STORE).put(current);
    sessions.put(next as StoredSessionRecord);
    tx.objectStore(COMMAND_COMMITS_STORE).clear();
    await done;
    db.close();
  }
}

function openDb(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, KERNEL_SESSION_DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) db.createObjectStore(SESSIONS_STORE, { keyPath: 'sessionId' });
      if (!db.objectStoreNames.contains(COMMAND_COMMITS_STORE)) db.createObjectStore(COMMAND_COMMITS_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SESSION_MIGRATION_BACKUPS_STORE)) db.createObjectStore(SESSION_MIGRATION_BACKUPS_STORE, { keyPath: 'sessionId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open session database'));
  });
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error('Migration transaction aborted'));
    tx.onerror = () => reject(tx.error ?? new Error('Migration transaction failed'));
  });
}
