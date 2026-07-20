/**
 * Production-oriented SessionRepository.
 *
 * Persists minimal formal SessionSnapshot via SessionPersistenceBackend.
 * CAS critical path (find command → check revision → put session + command)
 * runs entirely inside backend.runAtomic so revision and commandId are atomic.
 *
 * Phase 4: schemaVersion on every write; migrate at read / command ingress.
 * Gap: GameState is still the Phase 2/3 minimal slice — not full 旅人/NPC graph.
 * See domain/session/types.ts.
 */

import {
  asRevision,
  asSessionId,
  type CommandId,
  type SessionId,
} from '@/src/kernel/contract';
import type {
  CommitResult,
  CompareAndSwapInput,
  CreateSessionInput,
  CreateSessionResult,
  SessionRepository,
} from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import {
  cloneGameState,
  cloneSessionSnapshot,
} from '@/src/kernel/domain/session/types';
import {
  readSessionRecord,
  SESSION_SCHEMA_VERSION,
} from '@/src/kernel/domain/session/schema';
import type {
  SessionPersistenceBackend,
  StoredCommandRecord,
  StoredSessionRecord,
} from './sessionPersistenceBackend';
import {
  commandRecordId,
  toStoredRecord,
} from './sessionPersistenceBackend';
import { IndexedDbSessionBackend } from './indexedDbSessionBackend';

export class PersistentSessionRepository implements SessionRepository {
  constructor(private readonly backend: SessionPersistenceBackend) {}

  async create(input: CreateSessionInput): Promise<CreateSessionResult> {
    return this.backend.runAtomic(async (tx) => {
      const sessionKey = String(input.sessionId);
      const commandKey = String(input.commandId);
      const prior = await tx.getCommand(sessionKey, commandKey);
      if (prior) {
        if (prior.fingerprint !== input.fingerprint) return { type: 'duplicate_mismatch' as const };
        return { type: 'committed' as const, snapshot: fromCommandRecord(prior) };
      }

      const current = await tx.getSession(sessionKey);
      if (current) {
        return {
          type: 'conflict' as const,
          actualRevision: asRevision(readSessionRecord(current).revision),
        };
      }

      const stored = toStoredRecord(
        input.sessionId,
        0,
        cloneGameState(input.initialState),
        SESSION_SCHEMA_VERSION,
      );
      tx.putSession(stored);
      tx.putCommand({
        id: commandRecordId(sessionKey, commandKey),
        sessionId: sessionKey,
        commandId: commandKey,
        fingerprint: input.fingerprint,
        committedRevision: stored.revision,
        snapshot: stored,
      });
      return { type: 'committed' as const, snapshot: fromStored(stored) };
    });
  }

  async exists(sessionId: SessionId): Promise<boolean> {
    return this.backend.runAtomic(async (tx) => Boolean(await tx.getSession(String(sessionId))));
  }

  async read(sessionId: SessionId): Promise<SessionSnapshot> {
    const record = await this.backend.runAtomic((tx) =>
      tx.getSession(String(sessionId)),
    );
    if (!record) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return fromStored(record);
  }

  async findByCommandId(
    sessionId: SessionId,
    commandId: CommandId,
  ) {
    return this.backend.runAtomic(async (tx) => {
      const row = await tx.getCommand(String(sessionId), String(commandId));
      if (!row) return null;
      return { snapshot: fromCommandRecord(row), fingerprint: row.fingerprint };
    });
  }

  async findCommandReceipt(sessionId: SessionId, commandId: CommandId) {
    return this.backend.runAtomic(async (tx) => {
      const row = await tx.getCommand(String(sessionId), String(commandId));
      if (!row?.receipt) return null;
      return {
        receipt: structuredClone(row.receipt),
        consumedBy: row.receiptConsumedBy ? (row.receiptConsumedBy as CommandId) : null,
      };
    });
  }

  async compareAndSwap(input: CompareAndSwapInput): Promise<CommitResult> {
    return this.backend.runAtomic(async (tx) => {
      const sessionKey = String(input.sessionId);
      const commandKey = String(input.commandId);

      const prior = await tx.getCommand(sessionKey, commandKey);
      if (prior) {
        if (prior.fingerprint !== input.fingerprint) return { type: 'duplicate_mismatch' as const };
        return {
          type: 'committed' as const,
          snapshot: fromCommandRecord(prior),
        };
      }

      const current = await tx.getSession(sessionKey);
      if (!current) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      const exactCurrent = readSessionRecord(current);
      if (exactCurrent.revision !== Number(input.expectedRevision)) {
        return {
          type: 'conflict' as const,
          actualRevision: asRevision(exactCurrent.revision),
        };
      }

      let consumedReceiptRecord: StoredCommandRecord | null = null;
      if (input.consumeReceiptFromCommandId) {
        consumedReceiptRecord = await tx.getCommand(sessionKey, String(input.consumeReceiptFromCommandId));
        if (!consumedReceiptRecord?.receipt) {
          return { type: 'receipt_unavailable' as const, message: 'Drop receipt does not exist' };
        }
        if (consumedReceiptRecord.receiptConsumedBy) {
          return { type: 'receipt_unavailable' as const, message: 'Drop receipt was already consumed' };
        }
      }

      const nextRevision = exactCurrent.revision + 1;
      // Single schema write — always current SESSION_SCHEMA_VERSION.
      // V3 stored records never contain device-plane fields.
      const stored = toStoredRecord(
        input.sessionId,
        nextRevision,
        cloneGameState(input.nextState),
        SESSION_SCHEMA_VERSION,
      );

      // Atomic multi-record write: both puts flush with the same backend unit.
      // Crash between putSession and putCommand is backend-dependent; Memory
      // throws before putSession when armed (crash-before-CAS tests).
      tx.putSession(stored);
      if (consumedReceiptRecord) {
        tx.putCommand({ ...consumedReceiptRecord, receiptConsumedBy: commandKey });
      }
      tx.putCommand({
        id: commandRecordId(sessionKey, commandKey),
        sessionId: sessionKey,
        commandId: commandKey,
        fingerprint: input.fingerprint,
        committedRevision: stored.revision,
        snapshot: stored,
        receipt: input.receipt ? structuredClone(input.receipt) : undefined,
      });

      return {
        type: 'committed' as const,
        snapshot: fromStored(stored),
      };
    });
  }

  /**
   * Seed a session without CAS (bootstrap / tests / import).
   * Not part of SessionRepository port — host composition only.
   * Writes current schemaVersion only.
   */
  async seed(snapshot: SessionSnapshot): Promise<void> {
    await this.backend.runAtomic((tx) => {
      tx.putSession(
        toStoredRecord(
          snapshot.sessionId,
          snapshot.revision,
          cloneGameState(snapshot.state),
          SESSION_SCHEMA_VERSION,
        ),
      );
    });
  }
}

/**
 * Migrate at repository ingress then project to SessionSnapshot.
 * Identity for already-current schema; v0 rows gain schemaVersion on next write.
 */
function fromStored(record: StoredSessionRecord): SessionSnapshot {
  const exact = readSessionRecord(record);
  return cloneSessionSnapshot({
    sessionId: asSessionId(exact.sessionId),
    revision: asRevision(exact.revision),
    state: exact.state,
  });
}

function fromCommandRecord(record: StoredCommandRecord): SessionSnapshot {
  if (!record.snapshot) {
    throw new Error(`Kernel command record has no committed snapshot: ${record.commandId}`);
  }
  if (record.snapshot.revision !== record.committedRevision) {
    throw new Error(`Kernel command revision does not match its committed snapshot: ${record.commandId}`);
  }
  return fromStored(record.snapshot);
}

/** Browser / production: IndexedDB-backed formal sessions. */
export function createIndexedDbSessionRepository(
  dbName?: string,
): PersistentSessionRepository {
  return new PersistentSessionRepository(new IndexedDbSessionBackend(dbName));
}
