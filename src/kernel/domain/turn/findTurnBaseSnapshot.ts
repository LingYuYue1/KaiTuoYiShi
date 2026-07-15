/**
 * Pure: locate the formal base state as of before a given turn committed.
 *
 * Linear history only — no revision tree. Rerolling turn N discards
 * turns N+1…end (suffix truncate). Operates on formal GameState
 * (messages / turns / turnCount / travelerName / variables / knowledge).
 *
 * A migrated turn without a recorded base name cannot be rerolled: guessing
 * from the current suffix would retain discarded formal state.
 */

import type { GameState, KernelTurn, SessionSnapshot } from '@/src/kernel/domain/session/types';
import {
  cloneGameState,
  cloneKernelKnowledge,
  createEmptyKernelKnowledge,
} from '@/src/kernel/domain/session/types';
import {
  cloneKernelVariables,
  createEmptyKernelVariables,
} from '@/src/kernel/domain/variables';

/** Messages per formal turn: one user + one assistant. */
const MESSAGES_PER_TURN = 2;

export type TurnBaseSnapshot = Readonly<{
  /** Formal state before the target turn was applied. */
  state: GameState;
  /** Index of the target turn in current.turns. */
  turnIndex: number;
  /** Player text that originally drove the turn (re-sent on reroll). */
  originalPlayerText: string;
  /** Turn being replaced. */
  turnId: string;
  /** Original turn record (for diagnostics). */
  originalTurn: KernelTurn;
}>;

/**
 * Find base formal state for `turnId`.
 * Returns null when the turn is not in the snapshot or base is incomplete.
 */
export function findTurnBaseSnapshot(
  snapshot: SessionSnapshot,
  turnId: string,
): TurnBaseSnapshot | null {
  if (typeof turnId !== 'string' || turnId.length === 0) {
    return null;
  }

  const turnIndex = snapshot.state.turns.findIndex((turn) => turn.id === turnId);
  if (turnIndex < 0) {
    return null;
  }

  const originalTurn = snapshot.state.turns[turnIndex]!;
  if (originalTurn.travelerNameBefore === null) {
    return null;
  }

  const prefixTurns = snapshot.state.turns.slice(0, turnIndex);
  const prefixMessages = snapshot.state.messages.slice(
    0,
    turnIndex * MESSAGES_PER_TURN,
  );

  // turnCount convention: empty session starts at 1; each commit increments.
  // After k turns, turnCount === k + 1. Base before index i has i turns.
  // Phase 4 persisted only the name. That was the complete formal variable
  // slice then, so migrate it into the Stage 5.1 baseline rather than making
  // a previously valid reroll unavailable.
  const baseVariables = originalTurn.variablesBefore
    ? cloneKernelVariables(originalTurn.variablesBefore)
    : createEmptyKernelVariables({
      旅人: { 姓名: originalTurn.travelerNameBefore },
    });
  // Pre-Stage-5.2 turns lack knowledgeBefore → empty knowledge baseline.
  const baseKnowledge = originalTurn.knowledgeBefore
    ? cloneKernelKnowledge(originalTurn.knowledgeBefore)
    : createEmptyKernelKnowledge();
  // Phone/news are not turn-scoped snapshots yet; keep current session values.
  const baseState: GameState = cloneGameState({
    turnCount: prefixTurns.length + 1,
    messages: prefixMessages,
    turns: prefixTurns,
    travelerName: originalTurn.travelerNameBefore,
    variables: baseVariables,
    knowledge: baseKnowledge,
    phone: snapshot.state.phone,
    news: snapshot.state.news,
  });

  return {
    state: baseState,
    turnIndex,
    originalPlayerText: originalTurn.playerText,
    turnId,
    originalTurn,
  };
}
