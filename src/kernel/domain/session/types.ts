/**
 * Formal session types for Native Kernel (Phase 3).
 *
 * ## Ownership gap (documented)
 * SessionRepository owns only this minimal formal slice:
 * - turnCount, messages, turns, travelerName (旅人.姓名 characterization)
 *
 * Not yet formal SessionRepository state (still legacy React / full 存档):
 * - full 旅人 graph, 世界, NPC, 记忆, 手机, News, Album, story weaving, …
 * Expand GameState only when a native use case needs a field and the
 * CAS/snapshot/restore paths can own it end-to-end.
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
 * Intentionally narrow until later phases expand projection ownership.
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

/** Deep-clone GameState so repository callers cannot mutate storage. */
export function cloneGameState(state: GameState): GameState {
  return {
    turnCount: state.turnCount,
    travelerName: state.travelerName,
    messages: state.messages.map((m) => ({ ...m })),
    turns: state.turns.map((t) => ({ ...t })),
  };
}

/** Deep-clone SessionSnapshot. */
export function cloneSessionSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    state: cloneGameState(snapshot.state),
  };
}
