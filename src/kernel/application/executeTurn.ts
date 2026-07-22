import { asRevision, type AdvanceTurnEnvelope, type EnterPathAwakeningEnvelope, type ExecutionFrame } from '@/src/kernel/contract';
import type { StoryState } from '@/src/kernel/domain/session/storyState';
import type { SessionRepository } from '@/src/kernel/ports';
import type { ExecutionContextProvider } from '@/src/kernel/ports/ExecutionContextProvider';
import { commitCommand, loadCommandBase, rejectedFrame } from './executeSessionCommand';
import { appendTurnJournalEntry, captureTurnSnapshot, countAssistantTurns } from '@/src/kernel/domain/turn/turnJournal';
import { prepareTurnStory } from './turn/prepareTurn';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';
import { forwardTurnPipeline } from './turn/forwardTurnPipeline';
import { createTurnExecutionState, resolveCommandSettings } from './turn/turnExecutionState';
import { planOptionalTurnJobs } from './turn/planOptionalTurnJobs';

export type ExecuteTurnDependencies = Readonly<{
  sessions: SessionRepository;
  context: ExecutionContextProvider;
  signal: AbortSignal;
}>;

/** Run the complete host workflow against a draft, then commit its whole graph once. */
export async function* executeTurn(
  envelope: AdvanceTurnEnvelope,
  dependencies: ExecuteTurnDependencies,
): AsyncIterable<ExecutionFrame> {
  yield* executeTurnText(envelope, envelope.command.input.text, dependencies);
}

export async function* executeTurnText(
  envelope: AdvanceTurnEnvelope | EnterPathAwakeningEnvelope,
  sourceText: string,
  dependencies: ExecuteTurnDependencies,
): AsyncIterable<ExecutionFrame> {
  const base = await loadCommandBase(envelope, dependencies.sessions);
  if (base.type === 'terminal') {
    yield base.frame;
    return;
  }
  const text = sourceText.trim();
  if (!text) {
    yield rejectedFrame(envelope, { code: 'unknown', message: 'turn.advance requires text' });
    return;
  }
  if (dependencies.signal.aborted) {
    yield rejectedFrame(envelope, { code: 'cancelled', message: 'Command cancelled before execution' });
    return;
  }
  const preTurnSnapshot = captureTurnSnapshot(base.snapshot.state.story);
  const openingTrigger = envelope.command.type === 'turn.advance'
    ? envelope.command.input.openingTrigger
    : undefined;
  if (openingTrigger !== undefined && base.snapshot.state.story.turn.pendingOpeningTrigger !== openingTrigger) {
    yield rejectedFrame(envelope, { code: 'no_changes', message: 'Opening trigger is no longer pending' });
    return;
  }
  const createdAt = envelope.command.type === 'turn.advance'
    ? envelope.command.input.createdAt
    : envelope.command.createdAt;
  const preparedStoryBase = prepareTurnStory({
    story: base.snapshot.state.story,
    commandId: envelope.commandId,
    text,
    createdAt,
  });
  const preparedStory = openingTrigger === undefined
    ? preparedStoryBase
    : { ...preparedStoryBase, turn: { pendingOpeningTrigger: null } };
  yield {
    type: 'prepared',
    commandId: envelope.commandId,
    view: projectSession({ ...base.snapshot, state: { story: preparedStory } }),
  };
  const overlay = await dependencies.context.captureDeviceOverlay();
  const settings = resolveCommandSettings(base.snapshot.state.story, overlay);
  if (dependencies.signal.aborted) {
    yield rejectedFrame(envelope, { code: 'cancelled', message: 'Command cancelled before model execution' });
    return;
  }
  const executionState = createTurnExecutionState(preparedStory, overlay);
  let nextStory: StoryState;
  try {
    nextStory = yield* forwardTurnPipeline({
      state: executionState, baseStory: preparedStory, text, signal: dependencies.signal, commandId: envelope.commandId,
    });
  } catch (error) {
    yield rejectedFrame(envelope, {
      code: dependencies.signal.aborted ? 'cancelled' : 'model_failure',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  let story = appendTurnJournalEntry(nextStory, {
    turnIndex: countAssistantTurns(nextStory),
    committedRevision: Number(base.snapshot.revision) + 1,
    committedAt: envelope.command.type === 'turn.advance'
      ? envelope.command.input.createdAt
      : envelope.command.createdAt,
    preTurnSnapshot,
  });
  story = planOptionalTurnJobs({
    story,
    settings,
    sessionId: envelope.sessionId,
    sourceRevision: asRevision(Number(base.snapshot.revision) + 1),
    commandId: envelope.commandId,
    playerText: text,
    createdAt,
    openingNewsAlreadyGenerated: base.snapshot.state.story.conversation.turnCount === 1 && text.startsWith('[系统]'),
  });
  const assistant = [...story.conversation.history].reverse().find((message) => message.role === 'assistant');
  if (!assistant) throw new Error('Turn workflow committed without an assistant message');
  if (!assistant.parsedResponse) throw new Error('Turn workflow committed without parsed response');
  if (dependencies.signal.aborted) {
    yield rejectedFrame(envelope, { code: 'cancelled', message: 'Command cancelled before commit' });
    return;
  }
  yield { type: 'stage.changed', commandId: envelope.commandId, stage: 'committing' };
  yield await commitCommand(envelope, dependencies.sessions, { story });
}
