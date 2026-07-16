import type { ExecutionFrame, RerollTurnEnvelope } from '@/src/kernel/contract';
import type { RuntimeGameState } from '@/src/kernel/domain/session/runtimeState';
import { findTurnBaseSnapshot } from '@/src/kernel/domain/turn/findTurnBaseSnapshot';
import type { SessionRepository, TurnEngine } from '@/src/kernel/ports';
import {
  commitCommand,
  loadCommandBase,
  rejectedFrame,
} from './executeSessionCommand';

export type RerollDependencies = Readonly<{
  sessions: SessionRepository;
  turns: TurnEngine;
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

  let base;
  try {
    base = findTurnBaseSnapshot(commandBase.snapshot, envelope.command.turnId);
  } catch (error) {
    yield rejectedFrame(envelope, {
      code: 'unknown',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (!base) {
    yield rejectedFrame(envelope, { code: 'unknown', message: `Unknown turnId: ${envelope.command.turnId}` });
    return;
  }

  let runtime: RuntimeGameState | null = null;
  try {
    for await (const frame of dependencies.turns.advance(
      { state: base.runtime, text: base.originalPlayerText },
      dependencies.signal,
    )) {
      if (frame.type === 'progress') {
        if (runtime) throw new Error('TurnEngine emitted progress after completed');
        yield {
          type: 'progress',
          commandId: envelope.commandId,
          delta: { kind: 'narrative', text: frame.text },
        };
        continue;
      }
      if (runtime) throw new Error('TurnEngine emitted multiple completed frames');
      runtime = frame.state;
    }
  } catch (error) {
    yield rejectedFrame(envelope, {
      code: dependencies.signal.aborted ? 'cancelled' : 'model_failure',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }

  if (!runtime) {
    yield rejectedFrame(envelope, { code: 'model_failure', message: 'TurnEngine completed without state' });
    return;
  }
  const assistant = runtime.chatHistory.at(-1);
  if (assistant?.role !== 'assistant' || !assistant.parsedResponse) {
    yield rejectedFrame(envelope, { code: 'model_failure', message: 'Reroll completed without parsed assistant output' });
    return;
  }
  yield await commitCommand(envelope, dependencies.sessions, { runtime });
}
