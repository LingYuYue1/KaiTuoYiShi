import type { AdvanceTurnEnvelope, ExecutionFrame } from '@/src/kernel/contract';
import type { RuntimeGameState } from '@/src/kernel/domain/session/runtimeState';
import type { SessionRepository, TurnEngine } from '@/src/kernel/ports';
import { commitCommand, loadCommandBase, rejectedFrame } from './executeSessionCommand';

export type ExecuteTurnDependencies = Readonly<{
  sessions: SessionRepository;
  turns: TurnEngine;
  signal: AbortSignal;
}>;

/** Run the complete host workflow against a draft, then commit its whole graph once. */
export async function* executeTurn(
  envelope: AdvanceTurnEnvelope,
  dependencies: ExecuteTurnDependencies,
): AsyncIterable<ExecutionFrame> {
  const base = await loadCommandBase(envelope, dependencies.sessions);
  if (base.type === 'terminal') {
    yield base.frame;
    return;
  }
  const text = envelope.command.input.text.trim();
  if (!text) {
    yield rejectedFrame(envelope, { code: 'unknown', message: 'turn.advance requires text' });
    return;
  }

  let nextRuntime: RuntimeGameState | null = null;
  try {
    for await (const frame of dependencies.turns.advance({ state: base.snapshot.state.runtime, text }, dependencies.signal)) {
      if (frame.type === 'progress') {
        if (nextRuntime !== null) throw new Error('TurnEngine emitted progress after completed');
        yield { type: 'progress', commandId: envelope.commandId, delta: { kind: 'narrative', text: frame.text } };
        continue;
      }
      if (nextRuntime !== null) throw new Error('TurnEngine emitted multiple completed frames');
      nextRuntime = frame.state;
    }
  } catch (error) {
    yield rejectedFrame(envelope, {
      code: dependencies.signal.aborted ? 'cancelled' : 'model_failure',
      message: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (nextRuntime === null) {
    yield rejectedFrame(envelope, { code: 'model_failure', message: 'TurnEngine completed without state' });
    return;
  }

  const runtime = nextRuntime;
  const assistant = [...runtime.chatHistory].reverse().find((message) => message.role === 'assistant');
  if (!assistant) throw new Error('Turn workflow committed without an assistant message');
  if (!assistant.parsedResponse) throw new Error('Turn workflow committed without parsed response');
  yield await commitCommand(envelope, dependencies.sessions, { runtime });
}
