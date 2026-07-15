/**
 * SessionRepository port (Phase 3).
 *
 * Sole formal-write authority for session state under Native Kernel.
 * Owns revision CAS and commandId idempotency for the formal GameState slice.
 *
 * Guarantees (all adapters must uphold):
 * 1. read returns an immutable snapshot clone (caller mutation does not affect store).
 * 2. compareAndSwap is atomic for (revision bump + commandId record) —
 *    never write next state without recording commandId in the same critical section.
 * 3. Same (sessionId, commandId) retry returns the prior committed snapshot
 *    without applying a second turn (idempotent).
 * 4. Stale expectedRevision yields conflict and leaves store unchanged.
 *
 * Stage 5.1 GameState formal slice: turnCount / messages / turns /
 * travelerName / variables.旅人 (profile + 数值属性). Full 旅人 graph
 * (背包/战技/命途), 世界, NPC, 记忆, 手机 stay in legacy React+IndexedDB
 * until later stages expand projection ownership.
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
 * - committed: new revision applied (or prior commit for the same commandId)
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

  /**
   * Atomically commit nextState when expectedRevision matches.
   * Same commandId must return the prior successful snapshot (idempotent).
   */
  compareAndSwap(input: CompareAndSwapInput): Promise<CommitResult>;
}
