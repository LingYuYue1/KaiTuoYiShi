/**
 * SessionRepository port (Phase 2).
 *
 * Sole formal-write authority for session state under Native Kernel.
 * Owns revision CAS for the Phase 2 formal state slice.
 *
 * Full game-state ownership (IndexedDB, all domain slices) is Phase 3+.
 * Phase 2 uses a minimal GameState sufficient for AdvanceTurn characterization.
 */

import type { CommandId, Revision, SessionId } from '@/src/kernel/contract';
import type { GameState, SessionSnapshot } from '@/src/kernel/domain/session/types';

export type CompareAndSwapInput = Readonly<{
  sessionId: SessionId;
  expectedRevision: Revision;
  nextState: GameState;
  commandId: CommandId;
}>;

/**
 * CAS outcome.
 * - committed: new revision applied
 * - conflict: expectedRevision mismatched actual
 */
export type CommitResult =
  | Readonly<{ type: 'committed'; snapshot: SessionSnapshot }>
  | Readonly<{ type: 'conflict'; actualRevision: Revision }>;

export interface SessionRepository {
  read(sessionId: SessionId): Promise<SessionSnapshot>;

  /**
   * Return the successful commit for this command when a client retries it.
   * A command id is scoped to its session so retrying cannot create a second turn.
   */
  findByCommandId(
    sessionId: SessionId,
    commandId: CommandId,
  ): Promise<SessionSnapshot | null>;

  compareAndSwap(input: CompareAndSwapInput): Promise<CommitResult>;
}
