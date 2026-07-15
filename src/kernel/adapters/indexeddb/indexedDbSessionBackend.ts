/**
 * IndexedDB SessionPersistenceBackend.
 *
 * Uses a dedicated kernel DB so formal session CAS does not depend on
 * dbService / TimeJourneyDB version bumps. One readwrite transaction holds
 * both session row and commandCommit row — atomic revision + commandId.
 *
 * DB: KaiTuoYiShiKernelSessions
 * Stores: sessions (keyPath sessionId), commandCommits (keyPath id)
 */

import type {
  SessionAtomicTx,
  SessionPersistenceBackend,
  StoredCommandRecord,
  StoredSessionRecord,
} from './sessionPersistenceBackend';
import { commandRecordId } from './sessionPersistenceBackend';

export const KERNEL_SESSION_DB_NAME = 'KaiTuoYiShiKernelSessions';
export const KERNEL_SESSION_DB_VERSION = 1;
export const SESSIONS_STORE = 'sessions';
export const COMMAND_COMMITS_STORE = 'commandCommits';

export class IndexedDbSessionBackend implements SessionPersistenceBackend {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly dbName: string = KERNEL_SESSION_DB_NAME,
    private readonly version: number = KERNEL_SESSION_DB_VERSION,
  ) {}

  async runAtomic<T>(work: (tx: SessionAtomicTx) => Promise<T> | T): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const idbTx = db.transaction(
        [SESSIONS_STORE, COMMAND_COMMITS_STORE],
        'readwrite',
      );
      const sessions = idbTx.objectStore(SESSIONS_STORE);
      const commands = idbTx.objectStore(COMMAND_COMMITS_STORE);

      let settled = false;
      let result: T;

      const fail = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      idbTx.onabort = () => fail(idbTx.error ?? new Error('IndexedDB transaction aborted'));
      idbTx.onerror = () => fail(idbTx.error ?? new Error('IndexedDB transaction error'));
      idbTx.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      const tx = createIdbTx(sessions, commands);
      Promise.resolve()
        .then(() => work(tx))
        .then((value) => {
          result = value;
          // Transaction auto-commits when microtasks drain and no requests pending.
        })
        .catch((error) => {
          // A failed unit of work must never leave an already-queued session
          // write eligible to commit without its command record.
          try {
            idbTx.abort();
          } catch {
            // The transaction may already have aborted because of the same error.
          }
          fail(error);
        });
    });
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    if (typeof indexedDB === 'undefined') {
      return Promise.reject(
        new Error(
          'IndexedDB is not available in this environment. Use MemorySessionBackend or InMemorySessionRepository.',
        ),
      );
    }
    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
          db.createObjectStore(SESSIONS_STORE, { keyPath: 'sessionId' });
        }
        if (!db.objectStoreNames.contains(COMMAND_COMMITS_STORE)) {
          db.createObjectStore(COMMAND_COMMITS_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
          this.dbPromise = null;
        };
        resolve(db);
      };
      request.onerror = () => {
        this.dbPromise = null;
        reject(request.error ?? new Error('Failed to open kernel session DB'));
      };
      request.onblocked = () => {
        this.dbPromise = null;
        reject(new Error('Kernel session DB upgrade blocked by another tab'));
      };
    });
    return this.dbPromise;
  }
}

function createIdbTx(
  sessions: IDBObjectStore,
  commands: IDBObjectStore,
): SessionAtomicTx {
  return {
    getSession(sessionId) {
      return idbRequest<StoredSessionRecord | undefined>(sessions.get(sessionId)).then(
        (row) => row ?? null,
      );
    },
    getCommand(sessionId, commandId) {
      return idbRequest<StoredCommandRecord | undefined>(
        commands.get(commandRecordId(sessionId, commandId)),
      ).then((row) => row ?? null);
    },
    putSession(record) {
      sessions.put(record);
    },
    putCommand(record) {
      commands.put(record);
    },
  };
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
