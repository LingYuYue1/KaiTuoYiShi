/**
 * In-memory SessionRepository with CAS + commandId idempotency.
 *
 * CAS critical section is synchronous (no await between read and write) so
 * concurrent async callers still serialize correctly on the JS event loop.
 * revision bump and commandId record are written in the same critical section.
 */

import {
  asRevision,
  type CommandId,
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

export class InMemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<SessionId, SessionSnapshot>();
  private readonly committedCommands = new Map<string, SessionSnapshot>();

  seed(snapshot: SessionSnapshot): void {
    this.sessions.set(snapshot.sessionId, cloneSessionSnapshot(snapshot));
  }

  async read(sessionId: SessionId): Promise<SessionSnapshot> {
    return this.readSync(sessionId);
  }

  async findByCommandId(
    sessionId: SessionId,
    commandId: CommandId,
  ): Promise<SessionSnapshot | null> {
    const snapshot = this.committedCommands.get(commandKey(sessionId, commandId));
    return snapshot ? cloneSessionSnapshot(snapshot) : null;
  }

  async compareAndSwap(input: CompareAndSwapInput): Promise<CommitResult> {
    return this.compareAndSwapSync(input);
  }

  private readSync(sessionId: SessionId): SessionSnapshot {
    const current = this.sessions.get(sessionId);
    if (!current) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return cloneSessionSnapshot(current);
  }

  private compareAndSwapSync(input: CompareAndSwapInput): CommitResult {
    const key = commandKey(input.sessionId, input.commandId);
    const priorCommit = this.committedCommands.get(key);
    if (priorCommit) {
      return { type: 'committed', snapshot: cloneSessionSnapshot(priorCommit) };
    }

    const current = this.sessions.get(input.sessionId);
    if (!current) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }
    if (current.revision !== input.expectedRevision) {
      return { type: 'conflict', actualRevision: current.revision };
    }

    // Atomic: revision + commandId recorded together before any await.
    const nextRevision = asRevision(current.revision + 1);
    const snapshot: SessionSnapshot = {
      sessionId: input.sessionId,
      revision: nextRevision,
      state: cloneGameState(input.nextState),
    };
    this.sessions.set(input.sessionId, snapshot);
    this.committedCommands.set(key, snapshot);
    return { type: 'committed', snapshot: cloneSessionSnapshot(snapshot) };
  }
}

function commandKey(sessionId: SessionId, commandId: CommandId): string {
  return `${sessionId}\u0000${commandId}`;
}
