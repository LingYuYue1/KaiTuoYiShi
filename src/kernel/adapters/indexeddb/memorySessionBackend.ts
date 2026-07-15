/**
 * In-process SessionPersistenceBackend with the same atomic multi-record
 * contract as IndexedDB (session + commandCommit written together).
 *
 * Used by PersistentSessionRepository tests and any non-browser host.
 */

import type {
  SessionAtomicTx,
  SessionPersistenceBackend,
  StoredCommandRecord,
  StoredSessionRecord,
} from './sessionPersistenceBackend';
import { commandRecordId } from './sessionPersistenceBackend';
import { cloneGameState } from '@/src/kernel/domain/session/types';

export class MemorySessionBackend implements SessionPersistenceBackend {
  private readonly sessions = new Map<string, StoredSessionRecord>();
  private readonly commands = new Map<string, StoredCommandRecord>();
  /** Serializes concurrent runAtomic calls (mirrors IDB tx queueing). */
  private chain: Promise<void> = Promise.resolve();

  async runAtomic<T>(work: (tx: SessionAtomicTx) => Promise<T> | T): Promise<T> {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = this.chain;
    this.chain = previous.then(() => gate);
    await previous;

    try {
      const tx = this.createTx();
      return await work(tx);
    } finally {
      release();
    }
  }

  /** Test helper: direct seed without CAS. */
  seedSession(record: StoredSessionRecord): void {
    this.sessions.set(record.sessionId, cloneStoredSession(record));
  }

  private createTx(): SessionAtomicTx {
    const sessions = this.sessions;
    const commands = this.commands;
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
        sessions.set(record.sessionId, cloneStoredSession(record));
      },
      putCommand(record) {
        commands.set(record.id, cloneStoredCommand(record));
      },
    };
  }
}

function cloneStoredSession(record: StoredSessionRecord): StoredSessionRecord {
  return {
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
