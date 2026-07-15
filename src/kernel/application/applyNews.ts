/**
 * applyNews — Stage 5.3 news application use cases.
 *
 * news.apply: pure applyNewsPatch + single CAS (host / tests).
 * news.generate: model.complete → parseNewsModelText → applyNewsPatch → single CAS.
 *
 * Expanding ModelGateway is forbidden — only model.complete(request).
 */

import type {
  CommandId,
  ExecutionFrame,
  KernelError,
  NewsApplyEnvelope,
  NewsGenerateEnvelope,
  Revision,
} from '@/src/kernel/contract';
import type { ModelGateway, ModelRequest } from '@/src/kernel/ports/ModelGateway';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import {
  applyNewsPatch,
  parseNewsModelText,
  type KernelNewsGenerationPatch,
} from '@/src/kernel/domain/news';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';
import { streamModelText } from './streamModelText';

export type ApplyNewsDependencies = Readonly<{
  sessions: SessionRepository;
}>;

export type GenerateNewsDependencies = Readonly<{
  sessions: SessionRepository;
  model: ModelGateway;
}>;

export async function* applyNews(
  envelope: NewsApplyEnvelope,
  dependencies: ApplyNewsDependencies,
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

  const patch = envelope.command.patch;
  if (!isPatchPresent(patch)) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: 'news.apply requires a patch object with add/update/removeIds arrays',
    });
    return;
  }

  let nextNews;
  try {
    nextNews = applyNewsPatch(base.state.news, patch);
  } catch (err) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const commit = await dependencies.sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState: {
      ...base.state,
      news: nextNews,
    },
    commandId: envelope.commandId,
  });

  if (commit.type === 'conflict') {
    yield rejectedRevisionConflict(
      envelope.commandId,
      envelope.expectedRevision,
      commit.actualRevision,
    );
    return;
  }

  yield committedFrame(envelope.commandId, commit.snapshot);
}

export async function* generateNews(
  envelope: NewsGenerateEnvelope,
  dependencies: GenerateNewsDependencies,
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

  const request: ModelRequest = {
    playerText: 'news.generate',
    turnCount: base.state.turnCount,
    messages: base.state.messages,
    prompt: buildNewsGeneratePrompt(base.state.news.entries.length, base.state.turnCount),
  };

  const streamResult = yield* streamModelText(
    envelope.commandId,
    dependencies.model,
    request,
  );
  if (streamResult.kind === 'failure') {
    yield rejected(envelope.commandId, {
      code: 'model_failure',
      message: streamResult.message,
    });
    return;
  }

  let patch: KernelNewsGenerationPatch;
  try {
    patch = stampNewsTurn(
      parseNewsModelText(streamResult.completedText),
      base.state.turnCount,
    );
  } catch (err) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  let nextNews;
  try {
    nextNews = applyNewsPatch(base.state.news, patch);
  } catch (err) {
    yield rejected(envelope.commandId, {
      code: 'unknown',
      message: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  const commit = await dependencies.sessions.compareAndSwap({
    sessionId: envelope.sessionId,
    expectedRevision: envelope.expectedRevision,
    nextState: {
      ...base.state,
      news: nextNews,
    },
    commandId: envelope.commandId,
  });

  if (commit.type === 'conflict') {
    yield rejectedRevisionConflict(
      envelope.commandId,
      envelope.expectedRevision,
      commit.actualRevision,
    );
    return;
  }

  yield committedFrame(envelope.commandId, commit.snapshot);
}

function isPatchPresent(patch: KernelNewsGenerationPatch): boolean {
  return (
    patch !== null
    && typeof patch === 'object'
    && Array.isArray(patch.add)
    && Array.isArray(patch.update)
    && Array.isArray(patch.removeIds)
  );
}

function buildNewsGeneratePrompt(entryCount: number, turnCount: number): string {
  return [
    'You generate structured news patches for the game world.',
    `Current turnCount: ${turnCount}`,
    `Current news entry count: ${entryCount}`,
    'Respond with JSON only:',
    '{"add":[{"id":"...","title":"...","body":"...","issueNumber":1,"createdAtTurn":0}],"update":[],"removeIds":[]}',
  ].join('\n');
}

function stampNewsTurn(
  patch: KernelNewsGenerationPatch,
  createdAtTurn: number,
): KernelNewsGenerationPatch {
  return {
    ...patch,
    add: patch.add.map((entry) => ({ ...entry, createdAtTurn })),
  };
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
