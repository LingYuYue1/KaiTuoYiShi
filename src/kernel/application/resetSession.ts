import type { ExecutionFrame, ResetSessionEnvelope } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports';
import { cloneRuntimeGameState } from '@/src/kernel/domain/session/runtimeState';
import { executeSessionCommand } from './executeSessionCommand';

export async function* resetSession(
  envelope: ResetSessionEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, () => ({
    type: 'next',
    state: { runtime: cloneRuntimeGameState(envelope.command.runtime) },
  }));
}
