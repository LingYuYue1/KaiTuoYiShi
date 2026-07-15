/**
 * bindAlbumSlot — Stage 5.4 slot bind application use case.
 *
 * Pipeline:
 * 1. findByCommandId idempotency
 * 2. revision check
 * 3. bindSlot pure
 * 4. single CAS
 * 5. committed | rejected (entry_not_found etc → rejected with message)
 */

import type {
  CommandId,
  ExecutionFrame,
  AlbumBindSlotEnvelope,
  KernelError,
  Revision,
} from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import { bindSlot } from '@/src/kernel/domain/album';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';

export type BindAlbumSlotDependencies = Readonly<{
  sessions: SessionRepository;
}>;

export async function* bindAlbumSlot(
  envelope: AlbumBindSlotEnvelope,
  dependencies: BindAlbumSlotDependencies,
): AsyncIterable<ExecutionFrame> {
  const priorCommit = await dependencies.sessions.findByCommandId(
    envelope.sessionId,
    envelope.commandId,
  );
  if (priorCommit) {
    yield committedFrame(envelope.commandId, priorCommit);
    return;
  }

  const base = await dependencies.sessions.read(envelope.sessionId);
  if (base.revision !== envelope.expectedRevision) {
    yield rejectedRevisionConflict(
      envelope.commandId,
      envelope.expectedRevision,
      base.revision,
    );
    return;
  }

  const { entryId, targetType, targetId, slot } = envelope.command;
  if (typeof entryId !== 'string' || entryId.trim().length === 0) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: 'album.bindSlot requires non-empty entryId',
    });
    return;
  }
  if (typeof targetId !== 'string' || targetId.trim().length === 0) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: 'album.bindSlot requires non-empty targetId',
    });
    return;
  }

  let result;
  try {
    result = bindSlot(base.state.album, {
      entryId,
      targetType,
      targetId,
      slot,
    });
  } catch (err) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  if (!result.ok) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: `bindSlot failed: ${result.reason}`,
      details: { reason: result.reason },
    });
    return;
  }

  const cas = await dependencies.sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState: {
      ...base.state,
      album: result.album,
    },
    commandId: envelope.commandId,
  });

  if (cas.type === 'conflict') {
    yield rejectedRevisionConflict(
      envelope.commandId,
      envelope.expectedRevision,
      cas.actualRevision,
    );
    return;
  }

  yield committedFrame(envelope.commandId, cas.snapshot);
}

function rejectedRevisionConflict(
  commandId: CommandId,
  expectedRevision: Revision,
  actualRevision: Revision,
): ExecutionFrame {
  return rejected(commandId, {
    code: 'revision_conflict',
    message: `expectedRevision ${expectedRevision} != actual ${actualRevision}`,
    details: { actualRevision },
  });
}

function rejected(commandId: CommandId, error: KernelError): ExecutionFrame {
  return {
    type: 'rejected',
    commandId,
    error,
  };
}

function committedFrame(
  commandId: CommandId,
  snapshot: SessionSnapshot,
): ExecutionFrame {
  return {
    type: 'committed',
    commandId,
    revision: snapshot.revision,
    view: projectSession(snapshot),
  };
}
