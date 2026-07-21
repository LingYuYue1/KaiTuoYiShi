/**
 * Low-level atomic session persistence backend.
 *
 * Adapters implement runAtomic so revision + commandId are never split across
 * separate durable writes. Memory backend is for Node/tests; IndexedDB for web.
 *
 * StoredSessionRecord carries schemaVersion. Migration runs once at
 * repository ingress (read / import). Writes always use SESSION_SCHEMA_VERSION.
 */

import type { Revision, SessionId } from '@/src/kernel/contract';
import type { GameState } from '@/src/kernel/domain/session/types';
import type { CommandReceipt } from '@/src/kernel/domain/session/commandReceipt';
import type { CommandFingerprint } from '@/src/kernel/domain/session/commandFingerprint';

/** Wire format stored under a session id. */
export type StoredSessionRecord = Readonly<{
  schemaVersion: number;
  sessionId: string;
  revision: number;
  state: GameState;
}>;

export type StoredCommandRecord = Readonly<{
  /** `${sessionId}\0${commandId}` */
  id: string;
  sessionId: string;
  commandId: string;
  fingerprint: CommandFingerprint;
  committedRevision: number;
  snapshot: StoredSessionRecord;
  receipt?: CommandReceipt;
  receiptConsumedBy?: string;
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
  schemaVersion: number,
): StoredSessionRecord {
  return {
    schemaVersion,
    sessionId: String(sessionId),
    revision: Number(revision),
    state,
  };
}
