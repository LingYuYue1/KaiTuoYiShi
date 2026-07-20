import type { ExecutionFrame, RegenerateNarrativeImageEnvelope } from '@/src/kernel/contract';
import { asRevision } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports';
import type { Clock } from '@/src/kernel/ports/Clock';
import { commitCommand, loadCommandBase } from './executeSessionCommand';
import type { JobPayload } from '@/src/kernel/domain/jobs/durableJob';

export type RuntimeActionDependencies = Readonly<{
  sessions: SessionRepository;
  clock: Clock;
}>;

export async function* regenerateNarrativeImage(
  envelope: RegenerateNarrativeImageEnvelope,
  dependencies: RuntimeActionDependencies,
): AsyncIterable<ExecutionFrame> {
  yield await enqueueJob(envelope, dependencies, {
    kind: 'narrative-image.generate',
    messageId: envelope.command.messageId,
  });
}

async function enqueueJob(
  envelope: RegenerateNarrativeImageEnvelope,
  dependencies: RuntimeActionDependencies,
  payload: JobPayload,
): Promise<ExecutionFrame> {
  const base = await loadCommandBase(envelope, dependencies.sessions);
  if (base.type === 'terminal') return base.frame;
  const story = base.snapshot.state.story;
  const createdAt = dependencies.clock.now();
  const job = {
    id: `job_${envelope.commandId}`,
    sessionId: envelope.sessionId,
    sourceRevision: asRevision(Number(envelope.expectedRevision) + 1),
    payload,
    maxAttempts: 3,
    createdAt,
    state: 'queued' as const,
    attempt: 0,
    availableAt: createdAt,
  };
  return commitCommand(envelope, dependencies.sessions, {
    story: { ...story, jobs: { ...story.jobs, records: [...story.jobs.records, job] } },
  });
}
