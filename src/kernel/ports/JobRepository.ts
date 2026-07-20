import type { SessionId } from '@/src/kernel/contract';
import type { DurableJob } from '@/src/kernel/domain/jobs/durableJob';

export interface JobRepository {
  claimNext(sessionId: SessionId, runnerId: string, now: number): Promise<DurableJob | null>;
  replace(job: DurableJob): Promise<void>;
  listPending(sessionId: SessionId): Promise<readonly DurableJob[]>;
}
