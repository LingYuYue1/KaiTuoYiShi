import type { ExecutionFrame, ResetSessionEnvelope } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export async function* resetSession(
  envelope: ResetSessionEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, () => ({
    type: 'next',
    state: { story: structuredClone(envelope.command.story) },
  }));
}
