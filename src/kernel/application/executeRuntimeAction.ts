import type {
  ExecutionFrame,
  RegenerateNarrativeImageEnvelope,
  RetryQueueTaskEnvelope,
} from '@/src/kernel/contract';
import type { RuntimeActionEngine, SessionRepository } from '@/src/kernel/ports';
import { executeSessionCommand } from './executeSessionCommand';

export type RuntimeActionDependencies = Readonly<{
  sessions: SessionRepository;
  actions: RuntimeActionEngine;
  signal: AbortSignal;
}>;

export async function* regenerateNarrativeImage(
  envelope: RegenerateNarrativeImageEnvelope,
  dependencies: RuntimeActionDependencies,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, dependencies.sessions, async (base) => ({
    type: 'next',
    state: {
      ...base.state,
      runtime: await dependencies.actions.regenerateNarrativeImage(
        base.state.runtime,
        envelope.command.messageId,
        dependencies.signal,
      ),
    },
  }));
}

export async function* retryRuntimeQueueTask(
  envelope: RetryQueueTaskEnvelope,
  dependencies: RuntimeActionDependencies,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, dependencies.sessions, async (base) => ({
    type: 'next',
    state: {
      ...base.state,
      runtime: await dependencies.actions.retryQueueTask(
        base.state.runtime,
        envelope.command.taskId,
        envelope.command.mode,
        dependencies.signal,
      ),
    },
  }));
}
