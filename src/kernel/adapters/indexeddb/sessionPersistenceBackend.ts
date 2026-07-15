/**
 * Low-level atomic session persistence backend.
 *
 * Adapters implement runAtomic so revision + commandId are never split across
 * separate durable writes. Memory backend is for Node/tests; IndexedDB for web.
 */

import type { Revision, SessionId } from '@/src/kernel/contract';
import type { GameState } from '@/src/kernel/domain/session/types';

/** Wire format stored under a session id. */
export type StoredSessionRecord = Readonly<{
  sessionId: string;
  revision: number;
  state: GameState;
}>;

export type StoredCommandRecord = Readonly<{
  /** `${sessionId}\0${commandId}` */
  id: string;
  sessionId: string;
  commandId: string;
  snapshot: StoredSessionRecord;
}>;

/**
 * Single-unit read/write surface. Implementations must not flush partial CAS.
 */
export interface SessionAtomicTx {
  getSession(sessionId: string): Promise<StoredSessionRecord | null>;
  getCommand(
    sessionId: string,
    commandId: string,
  ): Promise<StoredCommandRecord | null>;
  putSession(record: StoredSessionRecord): void;
  putCommand(record: StoredCommandRecord): void;
}

export interface SessionPersistenceBackend {
  /**
   * Run work inside one atomic unit. For IndexedDB this is one transaction;
   * for memory it is a synchronous critical section on the event loop.
   */
  runAtomic<T>(work: (tx: SessionAtomicTx) => Promise<T> | T): Promise<T>;
}

export function commandRecordId(sessionId: string, commandId: string): string {
  return `${sessionId}\u0000${commandId}`;
}

export function toStoredRecord(
  sessionId: SessionId,
  revision: Revision | number,
  state: GameState,
): StoredSessionRecord {
  return {
    sessionId: String(sessionId),
    revision: Number(revision),
    state,
  };
}
