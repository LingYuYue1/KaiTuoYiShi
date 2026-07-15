/**
 * Production-oriented SessionRepository.
 *
 * Persists minimal formal SessionSnapshot via SessionPersistenceBackend.
 * CAS critical path (find command → check revision → put session + command)
 * runs entirely inside backend.runAtomic so revision and commandId are atomic.
 *
 * Gap: GameState is still the Phase 2/3 minimal slice — not full 旅人/NPC graph.
 * See domain/session/types.ts.
 */

import {
  asRevision,
  asSessionId,
  type CommandId,
  type Revision,
  type SessionId,
} from '@/src/kernel/contract';
import type {
  CommitResult,
  CompareAndSwapInput,
  SessionRepository,
} from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import {
  cloneGameState,
  cloneSessionSnapshot,
} from '@/src/kernel/domain/session/types';
import type {
  SessionPersistenceBackend,
  StoredSessionRecord,
} from './sessionPersistenceBackend';
import {
  commandRecordId,
  toStoredRecord,
} from './sessionPersistenceBackend';
import { MemorySessionBackend } from './memorySessionBackend';
import { IndexedDbSessionBackend } from './indexedDbSessionBackend';

export class PersistentSessionRepository implements SessionRepository {
  constructor(private readonly backend: SessionPersistenceBackend) {}

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
  ): Promise<SessionSnapshot | null> {
    const row = await this.backend.runAtomic((tx) =>
      tx.getCommand(String(sessionId), String(commandId)),
    );
    return row ? fromStored(row.snapshot) : null;
  }

  async compareAndSwap(input: CompareAndSwapInput): Promise<CommitResult> {
    return this.backend.runAtomic(async (tx) => {
      const sessionKey = String(input.sessionId);
      const commandKey = String(input.commandId);

      const prior = await tx.getCommand(sessionKey, commandKey);
      if (prior) {
        return {
          type: 'committed' as const,
          snapshot: fromStored(prior.snapshot),
        };
      }

      const current = await tx.getSession(sessionKey);
      if (!current) {
        throw new Error(`Session not found: ${input.sessionId}`);
      }
      if (current.revision !== Number(input.expectedRevision)) {
        return {
          type: 'conflict' as const,
          actualRevision: asRevision(current.revision),
        };
      }

      const nextRevision = current.revision + 1;
      const stored = toStoredRecord(
        input.sessionId,
        nextRevision,
        cloneGameState(input.nextState),
      );

      // Atomic multi-record write: both puts flush with the same backend unit.
      tx.putSession(stored);
      tx.putCommand({
        id: commandRecordId(sessionKey, commandKey),
        sessionId: sessionKey,
        commandId: commandKey,
        snapshot: stored,
      });

      return {
        type: 'committed' as const,
        snapshot: fromStored(stored),
      };
    });
  }

  /**
   * Seed a session without CAS (bootstrap / tests).
   * Not part of SessionRepository port — host composition only.
   */
  async seed(snapshot: SessionSnapshot): Promise<void> {
    await this.backend.runAtomic((tx) => {
      tx.putSession(
        toStoredRecord(
          snapshot.sessionId,
          snapshot.revision,
          cloneGameState(snapshot.state),
        ),
      );
    });
  }
}

function fromStored(record: StoredSessionRecord): SessionSnapshot {
  return cloneSessionSnapshot({
    sessionId: asSessionId(record.sessionId),
    revision: asRevision(record.revision) as Revision,
    state: record.state,
  });
}

/** Browser / production: IndexedDB-backed formal sessions. */
export function createIndexedDbSessionRepository(
  dbName?: string,
): PersistentSessionRepository {
  return new PersistentSessionRepository(new IndexedDbSessionBackend(dbName));
}

/**
 * Production-logic repository with memory durability (Node tests, non-IDB hosts).
 * Same CAS + idempotency code path as IndexedDB adapter.
 */
export function createMemoryPersistentSessionRepository(): PersistentSessionRepository {
  return new PersistentSessionRepository(new MemorySessionBackend());
}

/** Expose memory backend for tests that need direct seed control. */
export function createMemoryPersistentSessionRepositoryWithBackend(): {
  repository: PersistentSessionRepository;
  backend: MemorySessionBackend;
} {
  const backend = new MemorySessionBackend();
  return {
    repository: new PersistentSessionRepository(backend),
    backend,
  };
}
