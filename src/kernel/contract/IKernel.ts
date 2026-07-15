/**
 * IKernel public surface (Phase 1).
 * All public calls are async.
 * Must not import old models, services, hooks, or UI types.
 */

import type { CommandEnvelope } from './commands';
import type { ExecutionFrame } from './frames';
import type { QueryResult } from './projections';
import type { KernelQuery } from './queries';

/**
 * Implied contract:
 * 1. Each execute yields zero-or-more progress frames, then exactly one terminal frame.
 * 2. Terminal frame is committed | rejected.
 * 3. No frames after committed.
 * 4. Expected domain/infrastructure failures become rejected.
 * 5. Unexpected programming errors may throw from the iterator (fail fast).
 * 6. Closing the iterator early signals cancel; does not guarantee undo of a committed txn.
 * 7. Same commandId retries must have explicit idempotency semantics (owned by kernel impl).
 */
export interface IKernel {
  execute(command: CommandEnvelope): AsyncIterable<ExecutionFrame>;
  read(query: KernelQuery): Promise<QueryResult>;
}
