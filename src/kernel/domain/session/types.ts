/**
 * Formal session types for Native Kernel (Phase 3/4/5.1).
 *
 * ## Ownership (Stage 5.1)
 * SessionRepository owns this formal slice:
 * - turnCount, messages, turns
 * - travelerName (convenience mirror of variables.旅人.姓名)
 * - variables.旅人 profile + 数值属性 (Variable Engine vertical slice)
 *
 * Not yet formal SessionRepository state (still legacy React / full 存档):
 * - full 旅人 graph (背包/战技/命途…), 世界, NPC, 记忆, 手机, News, Album, story weaving, …
 * Expand GameState only when a native use case needs a field and the
 * CAS/snapshot/restore paths can own it end-to-end.
 *
 * ## Schema (Phase 4 / 5.1)
 * Durable rows carry schemaVersion (SESSION_SCHEMA_VERSION). Migration runs
 * at repository ingress. Irreversible bumps need backup; composition-flag
 * rollback is not lossless if old clients cannot read the new schema.
 * Stage 5.1 keeps schemaVersion=1 and fills missing `variables` at ingress.
 *
 * ## Reroll (Phase 4 / 5.1)
 * Native reroll operates on formal GameState (Option B: fork + single CAS).
 * Every new formal turn records prior travelerName + variables so reroll
 * can rebuild the complete formal base. Phase 4 turns without variables use
 * their recorded name as the Stage 5.1 baseline; turns without that name are
 * deliberately not rerollable.
 */

import type { Revision, SessionId } from '@/src/kernel/contract';
import type { KernelVariables } from '@/src/kernel/domain/variables/types';
import {
  cloneKernelVariables,
  createEmptyKernelVariables,
  travelerNameFromVariables,
  withTravelerName,
} from '@/src/kernel/domain/variables/types';

export type KernelMessage = Readonly<{
  role: 'user' | 'assistant';
  content: string;
}>;

export type KernelTurn = Readonly<{
  id: string;
  playerText: string;
  narrativeText: string;
  /** Null only for legacy records that predate formal reroll base state. */
  travelerNameBefore: string | null;
  /**
   * Formal variables snapshot before this turn applied.
   * Null for pre-Stage-5.1 rows; reroll reconstructs their name-only baseline.
   */
  variablesBefore: KernelVariables | null;
}>;

/**
 * Formal domain state owned by SessionRepository under Native Kernel.
 */
export type GameState = Readonly<{
  turnCount: number;
  messages: readonly KernelMessage[];
  turns: readonly KernelTurn[];
  /**
   * Convenience mirror of variables.旅人.姓名 (characterization / prompts).
   * Always kept in sync when variables change via reduceTurn / reduceVariables.
   */
  travelerName: string;
  /** Stage 5.1 Variable Engine formal slice. */
  variables: KernelVariables;
}>;

/**
 * Immutable formal snapshot: identity + revision + state.
 */
export type SessionSnapshot = Readonly<{
  sessionId: SessionId;
  revision: Revision;
  state: GameState;
}>;

/** Loose turn input for fixtures that predate variablesBefore. */
export type KernelTurnInput = Readonly<{
  id: string;
  playerText: string;
  narrativeText: string;
  travelerNameBefore?: string | null;
  variablesBefore?: KernelVariables | null;
}>;

function normalizeTurn(turn: KernelTurnInput): KernelTurn {
  return {
    id: turn.id,
    playerText: turn.playerText,
    narrativeText: turn.narrativeText,
    travelerNameBefore:
      turn.travelerNameBefore === undefined ? null : turn.travelerNameBefore,
    variablesBefore:
      turn.variablesBefore === undefined ? null : turn.variablesBefore,
  };
}

/** Create an empty session state for tests / new native sessions. */
export function createEmptyGameState(
  overrides?: Partial<Omit<GameState, 'turns' | 'variables' | 'messages'>> & {
    variables?: KernelVariables;
    messages?: readonly KernelMessage[];
    turns?: readonly KernelTurnInput[];
  },
): GameState {
  const variables = overrides?.variables
    ?? createEmptyKernelVariables({
      旅人: {
        姓名: overrides?.travelerName ?? '开拓者',
      },
    });
  const travelerName = overrides?.travelerName ?? travelerNameFromVariables(variables);
  // Keep name mirror consistent when only one side is provided.
  const syncedVariables =
    travelerName === variables.旅人.姓名
      ? variables
      : withTravelerName(variables, travelerName);

  return {
    turnCount: overrides?.turnCount ?? 1,
    messages: overrides?.messages ?? [],
    turns: (overrides?.turns ?? []).map(normalizeTurn),
    travelerName,
    variables: syncedVariables,
  };
}

export function createSessionSnapshot(input: {
  sessionId: SessionId;
  revision: Revision;
  state?: Parameters<typeof createEmptyGameState>[0];
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
    turns: state.turns.map((t) => ({
      id: t.id,
      playerText: t.playerText,
      narrativeText: t.narrativeText,
      travelerNameBefore: t.travelerNameBefore,
      variablesBefore: t.variablesBefore
        ? cloneKernelVariables(t.variablesBefore)
        : null,
    })),
    variables: cloneKernelVariables(state.variables),
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
