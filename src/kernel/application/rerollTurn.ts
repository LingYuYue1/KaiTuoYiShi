/**
 * rerollTurn — re-execute a prior turn from its base snapshot (Phase 4).
 *
 * Option B (no formal write until success):
 * 1. Read current formal snapshot (authority).
 * 2. Find base state before turnId (truncate suffix).
 * 3. Run executeTurn on an in-memory *fork* seeded with base @ current.revision.
 * 4. On model/parse failure → yield rejected; formal repository unchanged.
 * 5. On fork success → single CAS into formal from expectedRevision (current)
 *    to nextState = base + new turn (suffix replaced). If CAS fails → conflict.
 *
 * Does NOT use the legacy UI rewrite chain (no global snapshot restore / chat soup).
 * Operates only on minimal formal GameState.
 */

import {
  asRevision,
  type CommandId,
  type ExecutionFrame,
  type KernelError,
  type RerollTurnEnvelope,
  type Revision,
  type SessionId,
} from '@/src/kernel/contract';
import type {
  CommitResult,
  CompareAndSwapInput,
  ModelGateway,
  SessionRepository,
} from '@/src/kernel/ports';
import type { GameState, SessionSnapshot } from '@/src/kernel/domain/session/types';
import {
  cloneGameState,
  cloneSessionSnapshot,
} from '@/src/kernel/domain/session/types';
import { findTurnBaseSnapshot } from '@/src/kernel/domain/turn/findTurnBaseSnapshot';
import { createRerollAdvanceCommand } from '@/src/kernel/domain/turn/createRerollAdvanceCommand';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';
import { executeTurn } from './executeTurn';

export type RerollDependencies = Readonly<{
  sessions: SessionRepository;
  model: ModelGateway;
}>;

/**
 * Linear revision reroll. AI tokens may be spent; results enter formal state
 * only on successful CAS of the replacement state.
 */
export async function* rerollTurn(
  envelope: RerollTurnEnvelope,
  dependencies: RerollDependencies,
): AsyncIterable<ExecutionFrame> {
  const priorCommit = await dependencies.sessions.findByCommandId(
    envelope.sessionId,
    envelope.commandId,
  );
  if (priorCommit) {
    yield committedFrame(envelope, priorCommit);
    return;
  }

  const current = await dependencies.sessions.read(envelope.sessionId);

  if (current.revision !== envelope.expectedRevision) {
    yield rejected(envelope, {
      code: 'revision_conflict',
      message: `expectedRevision ${envelope.expectedRevision} != actual ${current.revision}`,
      details: { actualRevision: current.revision },
    });
    return;
  }

  const base = findTurnBaseSnapshot(current, envelope.command.turnId);
  if (!base) {
    const knownTurn = current.state.turns.some(
      (turn) => turn.id === envelope.command.turnId,
    );
    yield rejected(envelope, {
      code: 'unknown',
      message: knownTurn
        ? `Cannot reroll turnId ${envelope.command.turnId}: formal base state is unavailable`
        : `Unknown turnId: ${envelope.command.turnId}`,
      details: { turnId: envelope.command.turnId },
    });
    return;
  }

  // Fork: executeTurn mutates only this in-memory repo until we CAS formally.
  const fork = createForkAtBase(current, base.state);
  const advance = createRerollAdvanceCommand(envelope, base);

  let forkTerminal: ExecutionFrame | null = null;
  for await (const frame of executeTurn(advance, {
    sessions: fork,
    model: dependencies.model,
  })) {
    if (frame.type === 'progress') {
      // Progress is non-authoritative; formal repo still holds `current`.
      yield {
        type: 'progress',
        commandId: envelope.commandId,
        delta: frame.delta,
      };
      continue;
    }
    forkTerminal = frame;
  }

  if (!forkTerminal) {
    yield rejected(envelope, {
      code: 'unknown',
      message: 'rerollTurn: executeTurn produced no terminal frame',
    });
    return;
  }

  if (forkTerminal.type === 'rejected') {
    // Model/parse/revision failure on fork — formal state remains pre-reroll.
    yield {
      type: 'rejected',
      commandId: envelope.commandId,
      error: forkTerminal.error,
    };
    return;
  }

  if (forkTerminal.type !== 'committed') {
    yield rejected(envelope, {
      code: 'unknown',
      message: `rerollTurn: unexpected terminal frame type`,
    });
    return;
  }

  const forkSnapshot = await fork.read(envelope.sessionId);

  // Single formal write: replace suffix with base+newTurn at current revision.
  const commit = await dependencies.sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState: forkSnapshot.state,
    commandId: envelope.commandId,
  });

  if (commit.type === 'conflict') {
    yield rejected(envelope, {
      code: 'revision_conflict',
      message: `reroll CAS conflict: expected ${envelope.expectedRevision}, actual ${commit.actualRevision}`,
      details: { actualRevision: commit.actualRevision },
    });
    return;
  }

  yield committedFrame(envelope, commit.snapshot);
}

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Ephemeral in-memory SessionRepository for Option B re-execution.
 * Never durable; discarded after formal CAS (or failure).
 * Lives in application (not adapters/test) so production reroll has no test dep.
 */
class ForkSessionRepository implements SessionRepository {
  private snapshot: SessionSnapshot | null = null;
  private readonly committedCommands = new Map<string, SessionSnapshot>();

  seed(snapshot: SessionSnapshot): void {
    this.snapshot = cloneSessionSnapshot(snapshot);
  }

  async read(sessionId: SessionId): Promise<SessionSnapshot> {
    if (!this.snapshot || this.snapshot.sessionId !== sessionId) {
      throw new Error(`Fork session not found: ${sessionId}`);
    }
    return cloneSessionSnapshot(this.snapshot);
  }

  async findByCommandId(
    sessionId: SessionId,
    commandId: CommandId,
  ): Promise<SessionSnapshot | null> {
    const hit = this.committedCommands.get(forkCommandKey(sessionId, commandId));
    return hit ? cloneSessionSnapshot(hit) : null;
  }

  async compareAndSwap(input: CompareAndSwapInput): Promise<CommitResult> {
    const key = forkCommandKey(input.sessionId, input.commandId);
    const prior = this.committedCommands.get(key);
    if (prior) {
      return { type: 'committed', snapshot: cloneSessionSnapshot(prior) };
    }
    if (!this.snapshot || this.snapshot.sessionId !== input.sessionId) {
      throw new Error(`Fork session not found: ${input.sessionId}`);
    }
    if (this.snapshot.revision !== input.expectedRevision) {
      return { type: 'conflict', actualRevision: this.snapshot.revision };
    }
    const next: SessionSnapshot = {
      sessionId: input.sessionId,
      revision: asRevision(Number(this.snapshot.revision) + 1),
      state: cloneGameState(input.nextState),
    };
    this.snapshot = next;
    this.committedCommands.set(key, next);
    return { type: 'committed', snapshot: cloneSessionSnapshot(next) };
  }
}

function createForkAtBase(
  current: SessionSnapshot,
  baseState: GameState,
): ForkSessionRepository {
  const fork = new ForkSessionRepository();
  fork.seed({
    sessionId: current.sessionId,
    // Seed at current revision so executeTurn's CAS expectedRevision matches.
    revision: current.revision as Revision,
    state: baseState,
  });
  return fork;
}

function forkCommandKey(sessionId: SessionId, commandId: CommandId): string {
  return `${sessionId}\u0000${commandId}`;
}

function rejected(
  envelope: RerollTurnEnvelope,
  error: KernelError,
): ExecutionFrame {
  return {
    type: 'rejected',
    commandId: envelope.commandId,
    error,
  };
}

function committedFrame(
  envelope: RerollTurnEnvelope,
  snapshot: SessionSnapshot,
): ExecutionFrame {
  return {
    type: 'committed',
    commandId: envelope.commandId,
    revision: snapshot.revision,
    view: projectSession(snapshot),
  };
}
