import type { Revision, SessionId } from '@/src/kernel/contract';

export type JobKind =
  | 'news.generate'
  | 'yiting.archive'
  | 'narrative-image.generate';

export type JobPayload =
  | Readonly<{ kind: 'news.generate'; messageId: string; playerText: string }>
  | Readonly<{ kind: 'yiting.archive'; messageId: string; playerText: string }>
  | Readonly<{ kind: 'narrative-image.generate'; messageId: string }>;

type JobIdentity = Readonly<{
  id: string;
  sessionId: SessionId;
  sourceRevision: Revision;
  payload: JobPayload;
  maxAttempts: number;
  createdAt: number;
}>;

export type DurableJob = JobIdentity & (
  | Readonly<{ state: 'queued'; attempt: number; availableAt: number }>
  | Readonly<{ state: 'claimed'; attempt: number; claimedBy: string; claimedAt: number; leaseExpiresAt: number }>
  | Readonly<{ state: 'running'; attempt: number; runnerId: string; startedAt: number; leaseExpiresAt: number }>
  | Readonly<{ state: 'retry'; attempt: number; availableAt: number; error: string }>
  | Readonly<{ state: 'succeeded'; attempt: number; finishedAt: number; resultCommandId: string }>
  | Readonly<{ state: 'failed'; attempt: number; finishedAt: number; error: string }>
  | Readonly<{ state: 'cancelled'; attempt: number; finishedAt: number; reason: string }>
);

export function assertDurableJob(value: unknown): asserts value is DurableJob {
  if (!isRecord(value)) throw new Error('Durable job must be an object');
  for (const field of ['id', 'sessionId'] as const) {
    if (typeof value[field] !== 'string' || value[field].length === 0) throw new Error(`Durable job requires ${field}`);
  }
  for (const field of ['sourceRevision', 'maxAttempts', 'createdAt', 'attempt'] as const) {
    if (!Number.isSafeInteger(value[field]) || Number(value[field]) < 0) throw new Error(`Durable job requires non-negative ${field}`);
  }
  if (Number(value.maxAttempts) < 1 || Number(value.attempt) > Number(value.maxAttempts)) {
    throw new Error('Durable job attempt bounds are invalid');
  }
  if (!isRecord(value.payload) || !JOB_KINDS.has(String(value.payload.kind) as JobKind)) {
    throw new Error('Durable job payload kind is invalid');
  }
  if (!JOB_STATES.has(String(value.state))) throw new Error('Durable job state is invalid');
  assertPayload(value.payload);
  assertStateFields(value);
}

const JOB_KINDS: ReadonlySet<JobKind> = new Set([
  'news.generate',
  'yiting.archive',
  'narrative-image.generate',
]);
const JOB_STATES = new Set(['queued', 'claimed', 'running', 'retry', 'succeeded', 'failed', 'cancelled']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function claimJob(job: DurableJob, runnerId: string, now: number, leaseDurationMs: number): DurableJob {
  if (job.state !== 'queued' && job.state !== 'retry') throw new Error(`Cannot claim job in state ${job.state}`);
  if (job.availableAt > now) throw new Error('Cannot claim a job before availableAt');
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) throw new Error('Job lease duration must be positive');
  return { ...job, state: 'claimed', attempt: job.attempt + 1, claimedBy: runnerId, claimedAt: now, leaseExpiresAt: now + leaseDurationMs };
}

export function startJob(job: DurableJob, runnerId: string, now: number): DurableJob {
  if (job.state !== 'claimed' || job.claimedBy !== runnerId) throw new Error('Only the claiming runner can start a job');
  return { ...job, state: 'running', runnerId, startedAt: now };
}

export function retryJob(job: DurableJob, error: string, availableAt: number): DurableJob {
  if (job.state !== 'running') throw new Error(`Cannot retry job in state ${job.state}`);
  if (job.attempt >= job.maxAttempts) return failJob(job, error, availableAt);
  return { ...job, state: 'retry', availableAt, error };
}

export function succeedJob(job: DurableJob, resultCommandId: string, now: number): DurableJob {
  if (job.state !== 'running') throw new Error(`Cannot succeed job in state ${job.state}`);
  return { ...job, state: 'succeeded', resultCommandId, finishedAt: now };
}

export function failJob(job: DurableJob, error: string, now: number): DurableJob {
  if (job.state !== 'running') throw new Error(`Cannot fail job in state ${job.state}`);
  return { ...job, state: 'failed', error, finishedAt: now };
}

export function cancelJob(job: DurableJob, reason: string, now: number): DurableJob {
  if (job.state === 'succeeded' || job.state === 'failed' || job.state === 'cancelled') {
    throw new Error(`Cannot cancel terminal job ${job.id}`);
  }
  return { ...job, state: 'cancelled', reason, finishedAt: now };
}

function assertPayload(payload: Record<string, unknown>): void {
  switch (payload.kind) {
    case 'news.generate':
    case 'yiting.archive':
      if (typeof payload.messageId !== 'string' || typeof payload.playerText !== 'string') throw new Error(`${payload.kind} job payload is invalid`);
      return;
    case 'narrative-image.generate':
      if (typeof payload.messageId !== 'string') throw new Error('Narrative image job requires messageId');
      return;
  }
}

function assertStateFields(job: Record<string, unknown>): void {
  const finite = (field: string) => typeof job[field] === 'number' && Number.isFinite(job[field]) && Number(job[field]) >= 0;
  switch (job.state) {
    case 'queued':
    case 'retry':
      if (!finite('availableAt')) throw new Error(`${job.state} job requires availableAt`);
      if (job.state === 'retry' && typeof job.error !== 'string') throw new Error('Retry job requires error');
      return;
    case 'claimed':
      if (typeof job.claimedBy !== 'string' || !finite('claimedAt') || !finite('leaseExpiresAt')) throw new Error('Claimed job lease is invalid');
      return;
    case 'running':
      if (typeof job.runnerId !== 'string' || !finite('startedAt') || !finite('leaseExpiresAt')) throw new Error('Running job lease is invalid');
      return;
    case 'succeeded':
      if (typeof job.resultCommandId !== 'string' || !finite('finishedAt')) throw new Error('Succeeded job result is invalid');
      return;
    case 'failed':
      if (typeof job.error !== 'string' || !finite('finishedAt')) throw new Error('Failed job result is invalid');
      return;
    case 'cancelled':
      if (typeof job.reason !== 'string' || !finite('finishedAt')) throw new Error('Cancelled job result is invalid');
      return;
  }
}
