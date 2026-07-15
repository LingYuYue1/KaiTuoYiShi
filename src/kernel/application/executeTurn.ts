/**
 * executeTurn — Native AdvanceTurn application use case (Phase 2).
 *
 * Pipeline:
 * 1. read base snapshot
 * 2. revision check → rejected on conflict
 * 3. plan request
 * 4. stream model frames → yield progress (no repo write)
 * 5. parse actions
 * 6. reduceTurn
 * 7. compareAndSwap once
 * 8. yield committed OR rejected
 *
 * Error policy:
 * - model failure → rejected model_failure, state unchanged
 * - empty / illegal narrative parse → rejected (fail closed for empty narrative)
 * - illegal variable blocks alone do not reject (legacy-compatible; see parse/reduce)
 * - CAS conflict → rejected revision_conflict
 * - unexpected programming errors may throw (fail fast)
 */

import type {
  AdvanceTurnEnvelope,
  ExecutionFrame,
  KernelError,
  Revision,
} from '@/src/kernel/contract';
import type { ModelGateway } from '@/src/kernel/ports/ModelGateway';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import { planTurnRequest } from '@/src/kernel/domain/turn/planTurnRequest';
import {
  parseNarrativeActions,
  ParseNarrativeError,
} from '@/src/kernel/domain/turn/parseNarrativeActions';
import { reduceTurn } from '@/src/kernel/domain/turn/reduceTurn';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';

export type ExecuteTurnDependencies = Readonly<{
  sessions: SessionRepository;
  model: ModelGateway;
}>;

export async function* executeTurn(
  envelope: AdvanceTurnEnvelope,
  dependencies: ExecuteTurnDependencies,
): AsyncIterable<ExecutionFrame> {
  const priorCommit = await dependencies.sessions.findByCommandId(
    envelope.sessionId,
    envelope.commandId,
  );
  if (priorCommit) {
    yield committedFrame(envelope, priorCommit);
    return;
  }

  const base = await dependencies.sessions.read(envelope.sessionId);

  if (base.revision !== envelope.expectedRevision) {
    yield rejectedRevisionConflict(envelope, base.revision);
    return;
  }

  let request;
  try {
    request = planTurnRequest(base.state, envelope.command.input);
  } catch (err) {
    yield rejected(envelope, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const streamResult = yield* streamModel(envelope, dependencies.model, request);
  if (streamResult.kind === 'failure') {
    yield rejected(envelope, {
      code: 'model_failure',
      message: streamResult.message,
    });
    return;
  }

  let actions;
  try {
    actions = parseNarrativeActions(streamResult.completedText);
  } catch (err) {
    if (err instanceof ParseNarrativeError) {
      // Empty narrative / illegal structured body → fail closed (no formal write).
      yield rejected(envelope, {
        code: 'unknown',
        message: err.message,
        details: { parseCode: err.code },
      });
      return;
    }
    throw err;
  }

  const decision = reduceTurn(base.state, {
    playerText: request.playerText,
    commandId: envelope.commandId,
    actions,
  });

  const commit = await dependencies.sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState: decision.nextState,
    commandId: envelope.commandId,
  });

  if (commit.type === 'conflict') {
    yield rejectedRevisionConflict(envelope, commit.actualRevision);
    return;
  }

  yield committedFrame(envelope, commit.snapshot);
}

// ── helpers ──────────────────────────────────────────────────────────

type StreamSuccess = Readonly<{
  kind: 'success';
  completedText: string;
}>;

type StreamFailure = Readonly<{
  kind: 'failure';
  message: string;
}>;

async function* streamModel(
  envelope: AdvanceTurnEnvelope,
  model: ModelGateway,
  request: ReturnType<typeof planTurnRequest>,
): AsyncGenerator<ExecutionFrame, StreamSuccess | StreamFailure, unknown> {
  let lastProgressText = '';
  let completedText = '';

  try {
    for await (const frame of model.complete(request)) {
      if (frame.type === 'delta') {
        lastProgressText = frame.text;
        yield {
          type: 'progress',
          commandId: envelope.commandId,
          delta: { kind: 'narrative', text: frame.text },
        };
        continue;
      }
      completedText = frame.text;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { kind: 'failure', message };
  }

  if (completedText.length === 0 && lastProgressText.length > 0) {
    // Some gateways only emit deltas; treat last cumulative delta as completed.
    completedText = lastProgressText;
  }

  if (completedText.length === 0) {
    return { kind: 'failure', message: 'Model completed without text' };
  }

  return { kind: 'success', completedText };
}

function rejectedRevisionConflict(
  envelope: AdvanceTurnEnvelope,
  actualRevision: Revision,
): ExecutionFrame {
  return rejected(envelope, {
    code: 'revision_conflict',
    message: `expectedRevision ${envelope.expectedRevision} != actual ${actualRevision}`,
    details: { actualRevision },
  });
}

function rejected(
  envelope: AdvanceTurnEnvelope,
  error: KernelError,
): ExecutionFrame {
  return {
    type: 'rejected',
    commandId: envelope.commandId,
    error,
  };
}

function committedFrame(
  envelope: AdvanceTurnEnvelope,
  snapshot: SessionSnapshot,
): ExecutionFrame {
  return {
    type: 'committed',
    commandId: envelope.commandId,
    revision: snapshot.revision,
    view: projectSession(snapshot),
  };
}
