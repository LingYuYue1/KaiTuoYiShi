import type { ExecutionFrame, SetStoryModeEnvelope } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export async function* setSessionStoryMode(
  envelope: SetStoryModeEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => ({
    type: 'next',
    state: {
      story: {
        ...base.state.story,
        world: { ...base.state.story.world, 剧情模式: envelope.command.mode },
      },
    },
  }));
}
