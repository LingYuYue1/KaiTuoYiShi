/**
 * Minimal formal session types for the Phase 2 AdvanceTurn vertical slice.
 *
 * Full game state ownership (旅人/世界/NPC/记忆/手机/…) is Phase 3+.
 * This slice mirrors the Phase 0 characterization harness surface so
 * legacy-vs-native projection comparison is meaningful without dumping
 * the entire React/IndexedDB model graph.
 */

import type { Revision, SessionId } from '@/src/kernel/contract';

export type KernelMessage = Readonly<{
  role: 'user' | 'assistant';
  content: string;
}>;

export type KernelTurn = Readonly<{
  id: string;
  playerText: string;
  narrativeText: string;
}>;

/**
 * Formal domain state owned by SessionRepository under Native Kernel.
 * Intentionally narrow for Phase 2.
 */
export type GameState = Readonly<{
  turnCount: number;
  messages: readonly KernelMessage[];
  turns: readonly KernelTurn[];
  /** Domain slice used for illegal-variable characterization (旅人.姓名). */
  travelerName: string;
}>;

/**
 * Immutable formal snapshot: identity + revision + state.
 */
export type SessionSnapshot = Readonly<{
  sessionId: SessionId;
  revision: Revision;
  state: GameState;
}>;

/** Create an empty session state for tests / new native sessions. */
export function createEmptyGameState(
  overrides?: Partial<GameState>,
): GameState {
  return {
    turnCount: overrides?.turnCount ?? 1,
    messages: overrides?.messages ?? [],
    turns: overrides?.turns ?? [],
    travelerName: overrides?.travelerName ?? '开拓者',
  };
}

export function createSessionSnapshot(input: {
  sessionId: SessionId;
  revision: Revision;
  state?: Partial<GameState>;
}): SessionSnapshot {
  return {
    sessionId: input.sessionId,
    revision: input.revision,
    state: createEmptyGameState(input.state),
  };
}
