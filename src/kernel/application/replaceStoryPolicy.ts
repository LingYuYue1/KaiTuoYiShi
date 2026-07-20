import type { ExecutionFrame, SessionCommandEnvelope } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

type Envelope = SessionCommandEnvelope & {
  readonly command: Extract<SessionCommandEnvelope['command'], { type: 'story-policy.replace' }>;
};

export async function* replaceStoryPolicy(
  envelope: Envelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => ({
    type: 'next',
    state: { story: { ...base.state.story, policy: structuredClone(envelope.command.policy) } },
  }));
}
