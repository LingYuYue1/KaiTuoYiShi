/**
 * IKernel public surface (Phase 1).
 * All public calls are async.
 * Must not import old models, services, hooks, or UI types.
 */

import type { CommandEnvelope, CommandId } from './commands';
import type { ExecutionFrame } from './frames';
import type { QueryResult, SessionExistenceView, SessionView } from './projections';
import type { KernelQuery, SessionExistsQuery, SessionReadQuery } from './queries';
import type { SaveCatalogPort } from '@/src/kernel/ports/SaveCatalog';
import type { KernelServices } from '@/src/kernel/ports/KernelServices';

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
  readonly saves: SaveCatalogPort;
  readonly services: KernelServices;
  execute(command: CommandEnvelope): AsyncIterable<ExecutionFrame>;
  read(query: SessionExistsQuery): Promise<SessionExistenceView>;
  read(query: SessionReadQuery): Promise<SessionView>;
  read(query: KernelQuery): Promise<QueryResult>;
  cancel(commandId: CommandId): Promise<void>;
  /** Abort a command and wait until its execution stream has reached its terminal boundary. */
  cancelAndWait(commandId: CommandId): Promise<void>;
  getPreference<T>(key: string): Promise<T | null>;
  setPreference(key: string, value: unknown): Promise<void>;
  deletePreference(key: string): Promise<void>;
}
