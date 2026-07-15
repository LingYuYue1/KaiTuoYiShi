import {
  asRevision,
  type CommandId,
  type Revision,
  type SessionId,
  type SessionSnapshot,
} from './types';

export type CommitInput = Readonly<{
  sessionId: SessionId;
  expectedRevision: Revision;
  commandId: CommandId;
  next: Omit<SessionSnapshot, 'sessionId' | 'revision'> & {
    revision?: Revision;
  };
}>;

export type CommitResult =
  | Readonly<{ type: 'committed'; snapshot: SessionSnapshot }>
  | Readonly<{ type: 'conflict'; actualRevision: Revision }>
  | Readonly<{ type: 'duplicate'; snapshot: SessionSnapshot }>;

/**
 * In-memory CAS repository for Phase-0 contract tests.
 *
 * Provisional mapping for legacy:
 * - `revision` is a linear formal-commit counter (not present in production yet).
 * - `commandId` idempotency is recorded only on successful commit (Phase-0 target semantics).
 *
 * CAS critical section is synchronous (no await between read and write) so concurrent
 * async callers still serialize correctly on the JS event loop.
 */
export class InMemorySessionRepository {
  private readonly sessions = new Map<SessionId, SessionSnapshot>();
  private readonly committedCommands = new Map<string, SessionSnapshot>();

  seed(snapshot: SessionSnapshot): void {
    this.sessions.set(snapshot.sessionId, structuredClone(snapshot));
  }

  async read(sessionId: SessionId): Promise<SessionSnapshot> {
    return this.readSync(sessionId);
  }

  /** Lookup prior commit for commandId (idempotent retry). */
  async findByCommandId(
    sessionId: SessionId,
    commandId: CommandId,
  ): Promise<SessionSnapshot | null> {
    const key = `${sessionId}::${commandId}`;
    const previous = this.committedCommands.get(key);
    return previous ? structuredClone(previous) : null;
  }

  async compareAndSwap(input: CommitInput): Promise<CommitResult> {
    // Entire decision path is sync so two concurrent awaits cannot both pass CAS.
    return this.compareAndSwapSync(input);
  }

  private readSync(sessionId: SessionId): SessionSnapshot {
    const current = this.sessions.get(sessionId);
    if (!current) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    return structuredClone(current);
  }

  private compareAndSwapSync(input: CommitInput): CommitResult {
    const key = `${input.sessionId}::${input.commandId}`;
    const previous = this.committedCommands.get(key);
    if (previous) {
      return { type: 'duplicate', snapshot: structuredClone(previous) };
    }

    const current = this.sessions.get(input.sessionId);
    if (!current) {
      throw new Error(`Session not found: ${input.sessionId}`);
    }
    if (current.revision !== input.expectedRevision) {
      return { type: 'conflict', actualRevision: current.revision };
    }

    const nextRevision = asRevision(current.revision + 1);
    const snapshot: SessionSnapshot = {
      sessionId: input.sessionId,
      revision: nextRevision,
      turnCount: input.next.turnCount,
      messages: input.next.messages.map((m) => ({ ...m })),
      turns: input.next.turns.map((t) => ({ ...t })),
      travelerName: input.next.travelerName,
    };
    this.sessions.set(input.sessionId, snapshot);
    this.committedCommands.set(key, structuredClone(snapshot));
    return { type: 'committed', snapshot: structuredClone(snapshot) };
  }
}
