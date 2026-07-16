import type {
  CommittedFrame,
  ExecutionFrame,
  KernelError,
  RejectedFrame,
  SessionCommandEnvelope,
} from '@/src/kernel/contract';
import type { GameState, SessionSnapshot } from '@/src/kernel/domain/session/types';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';

export type CommandBase =
  | Readonly<{ type: 'ready'; snapshot: SessionSnapshot }>
  | Readonly<{ type: 'terminal'; frame: CommittedFrame | RejectedFrame }>;

export type StateReduction =
  | Readonly<{ type: 'next'; state: GameState }>
  | Readonly<{ type: 'rejected'; error: KernelError }>;

export async function loadCommandBase(
  envelope: SessionCommandEnvelope,
  sessions: SessionRepository,
): Promise<CommandBase> {
  const priorCommit = await sessions.findByCommandId(
    envelope.sessionId,
    envelope.commandId,
  );
  if (priorCommit) {
    if (Number(priorCommit.revision) !== Number(envelope.expectedRevision) + 1) {
      throw new Error(`Command id was reused with a different expected revision: ${envelope.commandId}`);
    }
    return { type: 'terminal', frame: committedFrame(envelope, priorCommit) };
  }

  const snapshot = await sessions.read(envelope.sessionId);
  if (snapshot.revision !== envelope.expectedRevision) {
    return {
      type: 'terminal',
      frame: rejectedFrame(envelope, {
        code: 'revision_conflict',
        message: `expectedRevision ${envelope.expectedRevision} != actual ${snapshot.revision}`,
        details: { actualRevision: snapshot.revision },
      }),
    };
  }

  return { type: 'ready', snapshot };
}

export async function commitCommand(
  envelope: SessionCommandEnvelope,
  sessions: SessionRepository,
  nextState: GameState,
): Promise<CommittedFrame | RejectedFrame> {
  const commit = await sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState,
    commandId: envelope.commandId,
  });

  if (commit.type === 'conflict') {
    return rejectedFrame(envelope, {
      code: 'revision_conflict',
      message: `expectedRevision ${envelope.expectedRevision} != actual ${commit.actualRevision}`,
      details: { actualRevision: commit.actualRevision },
    });
  }

  return committedFrame(envelope, commit.snapshot);
}

export async function* executeSessionCommand(
  envelope: SessionCommandEnvelope,
  sessions: SessionRepository,
  reduce: (snapshot: SessionSnapshot) => StateReduction | Promise<StateReduction>,
): AsyncIterable<ExecutionFrame> {
  const base = await loadCommandBase(envelope, sessions);
  if (base.type === 'terminal') {
    yield base.frame;
    return;
  }

  const reduction = await reduce(base.snapshot);
  if (reduction.type === 'rejected') {
    yield rejectedFrame(envelope, reduction.error);
    return;
  }

  yield await commitCommand(envelope, sessions, reduction.state);
}

export function rejectedFrame(
  envelope: Pick<SessionCommandEnvelope, 'commandId'>,
  error: KernelError,
): RejectedFrame {
  return { type: 'rejected', commandId: envelope.commandId, error };
}

export function committedFrame(
  envelope: Pick<SessionCommandEnvelope, 'commandId'>,
  snapshot: SessionSnapshot,
): CommittedFrame {
  return {
    type: 'committed',
    commandId: envelope.commandId,
    revision: snapshot.revision,
    view: projectSession(snapshot),
  };
}
