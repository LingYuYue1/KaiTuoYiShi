import { asRevision, type ExecutionFrame, type RerollTurnEnvelope } from '@/src/kernel/contract';
import type { StoryState } from '@/src/kernel/domain/session/storyState';
import type { SessionSnapshot } from '@/src/kernel/domain/session/types';
import { findTurnBaseSnapshot } from '@/src/kernel/domain/turn/findTurnBaseSnapshot';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';
import type { SessionRepository } from '@/src/kernel/ports';
import type { ExecutionContextProvider } from '@/src/kernel/ports/ExecutionContextProvider';
import {
  commitCommand,
  loadCommandBase,
  rejectedFrame,
} from './executeSessionCommand';
import { appendTurnJournalEntry } from '@/src/kernel/domain/turn/turnJournal';
import { prepareTurnStory } from './turn/prepareTurn';
import { forwardTurnPipeline } from './turn/forwardTurnPipeline';
import { createTurnExecutionState, resolveCommandSettings } from './turn/turnExecutionState';
import { planOptionalTurnJobs } from './turn/planOptionalTurnJobs';

export type RerollDependencies = Readonly<{
  sessions: SessionRepository;
  context: ExecutionContextProvider;
  signal: AbortSignal;
}>;

/** Re-run the latest turn from its embedded pre-turn snapshot, then perform one CAS. */
export async function* rerollTurn(
  envelope: RerollTurnEnvelope,
  dependencies: RerollDependencies,
): AsyncIterable<ExecutionFrame> {
  const commandBase = await loadCommandBase(envelope, dependencies.sessions);
  if (commandBase.type === 'terminal') {
    yield commandBase.frame;
    return;
  }

  const resolvedBase = resolveRerollBase(commandBase.snapshot, envelope.command.turnId);
  if (!resolvedBase.ok) {
    yield rejectedFrame(envelope, { code: 'unknown', message: resolvedBase.error });
    return;
  }
  const { base } = resolvedBase;
  if (dependencies.signal.aborted) {
    yield rejectedFrame(envelope, { code: 'cancelled', message: 'Reroll cancelled before execution' });
    return;
  }

  // Draft projection: truncated pre-reroll history before any stream text arrives.
  // UI must not invent truncation — kernel emits prepared so chatHistory drops immediately.
  const preparedStory = prepareTurnStory({
    story: base.story,
    commandId: envelope.commandId,
    text: base.originalPlayerText,
    createdAt: envelope.command.createdAt,
  });
  yield {
    type: 'prepared',
    commandId: envelope.commandId,
    view: projectSession({
      sessionId: commandBase.snapshot.sessionId,
      revision: commandBase.snapshot.revision,
      state: { story: preparedStory },
    }),
  };

  // Capture the immutable device context once, before the first model call.
  const overlay = await dependencies.context.captureDeviceOverlay();
  const settings = resolveCommandSettings(commandBase.snapshot.state.story, overlay);
  if (dependencies.signal.aborted) {
    yield rejectedFrame(envelope, { code: 'cancelled', message: 'Reroll cancelled before model execution' });
    return;
  }
  const executionState = createTurnExecutionState(preparedStory, overlay);

  let story: StoryState;
  try {
    story = yield* forwardTurnPipeline({
      state: executionState,
      baseStory: preparedStory,
      text: base.originalPlayerText,
      signal: dependencies.signal,
      commandId: envelope.commandId,
    });
  } catch (error) {
    yield rejectedFrame(envelope, {
      code: dependencies.signal.aborted ? 'cancelled' : 'model_failure',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  const assistant = story.conversation.history.at(-1);
  if (assistant?.role !== 'assistant' || !assistant.parsedResponse) {
    yield rejectedFrame(envelope, { code: 'model_failure', message: 'Reroll completed without parsed assistant output' });
    return;
  }
  let committedStory = appendTurnJournalEntry(story, {
    turnIndex: base.turnIndex,
    committedRevision: Number(commandBase.snapshot.revision) + 1,
    committedAt: envelope.command.createdAt,
    preTurnSnapshot: base.preTurnSnapshot,
  });
  committedStory = planOptionalTurnJobs({
    story: committedStory,
    settings,
    sessionId: envelope.sessionId,
    sourceRevision: asRevision(Number(commandBase.snapshot.revision) + 1),
    commandId: envelope.commandId,
    playerText: base.originalPlayerText,
    createdAt: envelope.command.createdAt,
    openingNewsAlreadyGenerated: base.preTurnSnapshot.turnCount === 1 && base.originalPlayerText.startsWith('[系统]'),
  });
  if (dependencies.signal.aborted) {
    yield rejectedFrame(envelope, { code: 'cancelled', message: 'Reroll cancelled before commit' });
    return;
  }
  yield { type: 'stage.changed', commandId: envelope.commandId, stage: 'committing' };
  yield await commitCommand(envelope, dependencies.sessions, { story: committedStory });
}

function resolveRerollBase(snapshot: SessionSnapshot, turnId: string):
  | { ok: true; base: NonNullable<ReturnType<typeof findTurnBaseSnapshot>> }
  | { ok: false; error: string } {
  try {
    const base = findTurnBaseSnapshot(snapshot, turnId);
    return base ? { ok: true, base } : { ok: false, error: `Unknown turnId: ${turnId}` };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
