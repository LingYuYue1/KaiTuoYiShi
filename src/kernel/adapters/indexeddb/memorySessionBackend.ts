/**
 * In-process SessionPersistenceBackend with the same atomic multi-record
 * contract as IndexedDB (session + commandCommit written together).
 *
 * Used by PersistentSessionRepository tests and any non-browser host.
 *
 * Phase 4 crash hooks: optional failNextPut / throwOnPut for mid-commit tests.
 */

import type {
  SessionAtomicTx,
  SessionPersistenceBackend,
  StoredCommandRecord,
  StoredSessionRecord,
} from './sessionPersistenceBackend';
import { commandRecordId } from './sessionPersistenceBackend';
import { cloneGameState } from '@/src/kernel/domain/session/types';

type MemoryBackendCrashHook = Readonly<{
  /**
   * When true, the next putSession throws before writing (simulates crash
   * before durable CAS completes). putCommand is never reached if putSession
   * throws first in the repository CAS order.
   */
  failNextPutSession?: boolean;
  /** When true, the next putCommand throws after putSession was staged. */
  failNextPutCommand?: boolean;
  /** Throw message for failNextPutSession. */
  failMessage?: string;
}>;

type MemoryStorage = {
  sessions: Map<string, StoredSessionRecord>;
  commands: Map<string, StoredCommandRecord>;
};

export class MemorySessionBackend implements SessionPersistenceBackend {
  private storage: MemoryStorage = {
    sessions: new Map(),
    commands: new Map(),
  };
  /** Serializes concurrent runAtomic calls (mirrors IDB tx queueing). */
  private chain: Promise<void> = Promise.resolve();
  private crashHook: MemoryBackendCrashHook = {};

  /**
   * Test-only: arm a one-shot crash before the next putSession.
   * Cleared after it fires (or after clearCrashHook).
   */
  armCrashBeforeCommit(message = 'simulated crash before CAS durable write'): void {
    this.crashHook = { failNextPutSession: true, failMessage: message };
  }

  /** Test-only: crash after the session row was staged but before command write. */
  armCrashBeforeCommandWrite(message = 'simulated crash before command write'): void {
    this.crashHook = { failNextPutCommand: true, failMessage: message };
  }

  async runAtomic<T>(work: (tx: SessionAtomicTx) => Promise<T> | T): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.chain;
    this.chain = previous.then(() => gate);
    await previous;

    try {
      const staged = cloneStorage(this.storage);
      const result = await work(this.createTx(staged));
      this.storage = staged;
      return result;
    } finally {
      release();
    }
  }

  /** Test helper: direct seed without CAS. */
  seedSession(record: StoredSessionRecord): void {
    this.storage.sessions.set(record.sessionId, cloneStoredSession(record));
  }

  private createTx(storage: MemoryStorage): SessionAtomicTx {
    const { sessions, commands } = storage;
    const self = this;
    return {
      async getSession(sessionId) {
        const row = sessions.get(sessionId);
        return row ? cloneStoredSession(row) : null;
      },
      async getCommand(sessionId, commandId) {
        const row = commands.get(commandRecordId(sessionId, commandId));
        return row ? cloneStoredCommand(row) : null;
      },
      putSession(record) {
        if (self.crashHook.failNextPutSession) {
          const message = self.crashHook.failMessage ?? 'simulated crash before CAS';
          self.crashHook = {};
          throw new Error(message);
        }
        sessions.set(record.sessionId, cloneStoredSession(record));
      },
      putCommand(record) {
        if (self.crashHook.failNextPutCommand) {
          const message = self.crashHook.failMessage ?? 'simulated crash before command write';
          self.crashHook = {};
          throw new Error(message);
        }
        commands.set(record.id, cloneStoredCommand(record));
      },
    };
  }
}

function cloneStorage(storage: MemoryStorage): MemoryStorage {
  return {
    sessions: new Map(
      [...storage.sessions].map(([id, record]) => [id, cloneStoredSession(record)]),
    ),
    commands: new Map(
      [...storage.commands].map(([id, record]) => [id, cloneStoredCommand(record)]),
    ),
  };
}

function cloneStoredSession(record: StoredSessionRecord): StoredSessionRecord {
  return {
    schemaVersion: record.schemaVersion,
    sessionId: record.sessionId,
    revision: record.revision,
    state: cloneGameState(record.state),
  };
}

function cloneStoredCommand(record: StoredCommandRecord): StoredCommandRecord {
  return {
    id: record.id,
    sessionId: record.sessionId,
    commandId: record.commandId,
    snapshot: cloneStoredSession(record.snapshot),
  };
}
