import type { CheckpointSessionEnvelope, ExecutionFrame } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export async function* checkpointSession(
  envelope: CheckpointSessionEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => ({
    type: 'next',
    state: { ...base.state, runtime: envelope.command.runtime },
  }));
}
