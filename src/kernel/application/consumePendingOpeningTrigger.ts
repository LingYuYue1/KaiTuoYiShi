import type { ConsumeOpeningTriggerEnvelope, ExecutionFrame } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export async function* consumePendingOpeningTrigger(
  envelope: ConsumeOpeningTriggerEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const pending = base.state.story.turn.pendingOpeningTrigger;
    if (!pending || pending !== envelope.command.trigger) {
      return {
        type: 'rejected' as const,
        error: { code: 'no_changes' as const, message: 'Opening trigger is no longer pending' },
      };
    }
    return {
      type: 'next' as const,
      state: {
        story: { ...base.state.story, turn: { pendingOpeningTrigger: null } },
      },
    };
  });
}
