import type { ExecutionFrame, SessionCommandEnvelope } from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports';
import type { DurableJob } from '@/src/kernel/domain/jobs/durableJob';
import { cancelJob } from '@/src/kernel/domain/jobs/durableJob';
import { executeSessionCommand } from './executeSessionCommand';

type JobCommandEnvelope = SessionCommandEnvelope & {
  readonly command: Extract<SessionCommandEnvelope['command'], { type: 'job.retry' | 'job.cancel' }>;
};

export async function* executeJobCommand(
  envelope: JobCommandEnvelope,
  sessions: SessionRepository,
): AsyncIterable<ExecutionFrame> {
  yield* executeSessionCommand(envelope, sessions, (base) => {
    const records = base.state.story.jobs.records;
    const index = records.findIndex((job) => job.id === envelope.command.jobId);
    if (index < 0) return rejected('Durable job not found');
    const current = records[index];
    let next: DurableJob;
    try {
      next = envelope.command.type === 'job.retry'
        ? retryTerminalJob(current, envelope.command.availableAt)
        : cancelJob(current, envelope.command.reason, envelope.command.cancelledAt);
    } catch (error) {
      return rejected(error instanceof Error ? error.message : String(error));
    }
    const updated = records.slice();
    updated[index] = next;
    return {
      type: 'next',
      state: { story: { ...base.state.story, jobs: { ...base.state.story.jobs, records: updated } } },
    };
  });
}

function retryTerminalJob(job: DurableJob, availableAt: number): DurableJob {
  if (job.state !== 'failed' && job.state !== 'cancelled') {
    throw new Error(`Only failed or cancelled jobs can be retried; received ${job.state}`);
  }
  return { ...job, state: 'queued', availableAt };
}

function rejected(message: string) {
  return { type: 'rejected' as const, error: { code: 'no_changes' as const, message } };
}
