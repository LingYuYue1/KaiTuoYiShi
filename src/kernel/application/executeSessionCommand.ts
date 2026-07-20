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
import type { CommandReceipt } from '@/src/kernel/domain/session/commandReceipt';
import { fingerprintCommand } from '@/src/kernel/domain/session/commandFingerprint';

export type CommandBase =
  | Readonly<{ type: 'ready'; snapshot: SessionSnapshot }>
  | Readonly<{ type: 'terminal'; frame: CommittedFrame | RejectedFrame }>;

export type StateReduction =
  | Readonly<{
      type: 'next';
      state: GameState;
      receipt?: CommandReceipt;
      consumeReceiptFromCommandId?: import('@/src/kernel/contract').CommandId;
    }>
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
    const fingerprint = fingerprintCommand(envelope.command);
    if (priorCommit.fingerprint !== fingerprint) {
      return {
        type: 'terminal',
        frame: rejectedFrame(envelope, {
          code: 'duplicate_command',
          message: `Command id was reused with a different payload: ${envelope.commandId}`,
          details: { kind: 'duplicate_command', commandId: String(envelope.commandId) },
        }),
      };
    }
    if (Number(priorCommit.snapshot.revision) !== Number(envelope.expectedRevision) + 1) {
      throw new Error(`Command id was reused with a different expected revision: ${envelope.commandId}`);
    }
    return { type: 'terminal', frame: committedFrame(envelope, priorCommit.snapshot) };
  }

  const snapshot = await sessions.read(envelope.sessionId);
  if (snapshot.revision !== envelope.expectedRevision) {
    return {
      type: 'terminal',
      frame: rejectedFrame(envelope, {
        code: 'revision_conflict',
        message: `expectedRevision ${envelope.expectedRevision} != actual ${snapshot.revision}`,
        details: { kind: 'revision_conflict', actualRevision: Number(snapshot.revision) },
      }),
    };
  }

  return { type: 'ready', snapshot };
}

export async function commitCommand(
  envelope: SessionCommandEnvelope,
  sessions: SessionRepository,
  nextState: GameState,
  options: Readonly<{
    receipt?: CommandReceipt;
    consumeReceiptFromCommandId?: import('@/src/kernel/contract').CommandId;
  }> = {},
): Promise<CommittedFrame | RejectedFrame> {
  const commit = await sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState,
    commandId: envelope.commandId,
    fingerprint: fingerprintCommand(envelope.command),
    receipt: options.receipt,
    consumeReceiptFromCommandId: options.consumeReceiptFromCommandId,
  });

  if (commit.type === 'conflict') {
    return rejectedFrame(envelope, {
      code: 'revision_conflict',
      message: `expectedRevision ${envelope.expectedRevision} != actual ${commit.actualRevision}`,
      details: { kind: 'revision_conflict', actualRevision: Number(commit.actualRevision) },
    });
  }
  if (commit.type === 'receipt_unavailable') {
    return rejectedFrame(envelope, { code: 'no_changes', message: commit.message });
  }
  if (commit.type === 'duplicate_mismatch') {
    return rejectedFrame(envelope, {
      code: 'duplicate_command',
      message: `Command id was reused with a different payload: ${envelope.commandId}`,
      details: { kind: 'duplicate_command', commandId: String(envelope.commandId) },
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

  yield await commitCommand(envelope, sessions, reduction.state, {
    receipt: reduction.receipt,
    consumeReceiptFromCommandId: reduction.consumeReceiptFromCommandId,
  });
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
