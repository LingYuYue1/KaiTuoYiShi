import type {
  DeclinePathAwakeningEnvelope,
  ExecutionFrame,
  SetPrimaryPathEnvelope,
} from '@/src/kernel/contract';
import { 拒绝命途狭间, setPrimaryPath } from '@/src/kernel/domain/path/pathOperations';
import type { SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export async function* setSessionPrimaryPath(
  envelope: SetPrimaryPathEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const traveler = base.state.story.traveler;
    if (!(traveler.命途列表 ?? []).some((path) => path.id === envelope.command.pathId)) {
      return {
        type: 'rejected',
        error: { code: 'no_changes', message: `Traveler has not awakened path: ${envelope.command.pathId}` },
      };
    }
    return {
      type: 'next',
      state: {
        story: { ...base.state.story, traveler: setPrimaryPath(traveler, envelope.command.pathId) },
      },
    };
  });
}

export async function* declineSessionPathAwakening(
  envelope: DeclinePathAwakeningEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    if (!base.state.story.world.待触发狭间) {
      return { type: 'rejected', error: { code: 'no_changes', message: 'No path awakening invitation is pending' } };
    }
    return {
      type: 'next',
      state: {
        story: { ...base.state.story, world: 拒绝命途狭间(base.state.story.world) },
      },
    };
  });
}
