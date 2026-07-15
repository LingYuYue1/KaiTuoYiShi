/**
 * deleteAlbumEntries — Stage 5.4 album entry deletion application use case.
 *
 * Pipeline:
 * 1. findByCommandId idempotency
 * 2. revision check
 * 3. deleteEntries pure
 * 4. single CAS with next album
 * 5. after successful CAS, best-effort AssetStore.remove for orphaned asset ids
 * 6. committed | rejected
 *
 * Asset bytes are removed AFTER CAS so a failed CAS does not delete still-referenced bytes.
 * If AssetStore.remove fails after CAS, ignore (bytes leak OK for tests).
 */

import type {
  CommandId,
  ExecutionFrame,
  AlbumDeleteEnvelope,
  KernelError,
  Revision,
} from '@/src/kernel/contract';
import type { AssetStore } from '@/src/kernel/ports/AssetStore';
import { asAssetRef } from '@/src/kernel/ports/AssetStore';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import { deleteEntries } from '@/src/kernel/domain/album';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';

export type DeleteAlbumEntriesDependencies = Readonly<{
  sessions: SessionRepository;
  assets: AssetStore;
}>;

export async function* deleteAlbumEntries(
  envelope: AlbumDeleteEnvelope,
  dependencies: DeleteAlbumEntriesDependencies,
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

  const { entryIds } = envelope.command;
  if (!Array.isArray(entryIds)) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: 'album.delete requires entryIds array',
    });
    return;
  }

  let result;
  try {
    result = deleteEntries(base.state.album, entryIds);
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
      message: `deleteEntries failed: ${result.reason}`,
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

  // Remove orphaned asset bytes only after formal CAS success.
  for (const assetId of result.removedAssetIds) {
    try {
      await dependencies.assets.remove(asAssetRef(assetId));
    } catch {
      // Bytes leak after CAS is acceptable; formal state already dropped the ref.
    }
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
