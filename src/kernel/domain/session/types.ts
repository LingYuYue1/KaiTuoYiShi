/**
 * Formal session types for Native Kernel (Phase 3/4/5.1/5.2/5.3).
 *
 * ## Ownership (Stage 5.3)
 * SessionRepository owns this formal slice:
 * - turnCount, messages, turns
 * - travelerName (convenience mirror of variables.旅人.姓名)
 * - variables.旅人 profile + 数值属性 (Stage 5.1 Variable Engine)
 * - knowledge: zhiku / yiting / story / memory (Stage 5.2 Knowledge vertical slice)
 * - phone: contact threads + messages (Stage 5.3 Phone)
 * - news: news entries (Stage 5.3 News)
 *
 * Not yet formal SessionRepository state (still legacy React / full 存档):
 * - full 旅人 graph (背包/战技/命途…), 世界, NPC, full memory compression,
 *   Album, full story weaving gate matrix, worldbook chain, …
 * Expand GameState only when a native use case needs a field and the
 * CAS/snapshot/restore paths can own it end-to-end.
 *
 * ## Schema (Phase 4 / 5.1 / 5.2 / 5.3)
 * Durable rows carry schemaVersion (SESSION_SCHEMA_VERSION). Migration runs
 * at repository ingress. Irreversible bumps need backup; composition-flag
 * rollback is not lossless if old clients cannot read the new schema.
 * Stage 5.3 keeps schemaVersion=1 and fills missing `phone` / `news`
 * (and earlier `knowledge` / `variables`) at ingress with empty constructors.
 *
 * ## Knowledge shape (Stage 5.2)
 * Nested under `state.knowledge` (not flatter top-level fields) so future
 * knowledge subsystems stay grouped and schema defaults stay one object.
 *
 * ## Phone / News (Stage 5.3)
 * Required top-level fields. Empty collections are valid formal state.
 * Schema ingress is the only place that synthesizes empty systems for old rows.
 *
 * ## Reroll (Phase 4 / 5.1 / 5.2 / 5.3)
 * Native reroll operates on formal GameState (Option B: fork + single CAS).
 * Every new formal turn records prior travelerName + variables + knowledge
 * so reroll can rebuild the complete formal base. Phase 4 turns without
 * variables use their recorded name as the Stage 5.1 baseline; turns without
 * knowledgeBefore restore empty knowledge. Phone/news are not turn-scoped
 * yet — reroll base keeps the current session phone/news (independent CAS
 * paths). Turns without that name are deliberately not rerollable.
 */

import type { Revision, SessionId } from '@/src/kernel/contract';
import type {
  KernelMemoryTier,
  KernelStoryProgress,
  KernelYitingSystem,
  KernelZhikuSystem,
} from '@/src/kernel/domain/knowledge/types';
import type { KernelNewsSystem } from '@/src/kernel/domain/news/types';
import {
  cloneKernelNews,
  createEmptyKernelNews,
} from '@/src/kernel/domain/news/types';
import type { KernelPhoneSystem } from '@/src/kernel/domain/phone/types';
import {
  cloneKernelPhone,
  createEmptyKernelPhone,
} from '@/src/kernel/domain/phone/types';
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

/**
 * Formal knowledge / narrative context slice owned by SessionRepository.
 * Nested (not flatter top-level fields) so schema defaults and clones stay
 * one object as more knowledge subsystems arrive.
 */
export type KernelKnowledge = Readonly<{
  zhiku: KernelZhikuSystem;
  yiting: KernelYitingSystem;
  story: KernelStoryProgress;
  /** Stage 5.2: empty recentSummaries shell; full memory tiers later. */
  memory: KernelMemoryTier;
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
  /**
   * Formal knowledge snapshot before this turn applied.
   * Null for pre-Stage-5.2 rows; reroll restores empty knowledge.
   */
  knowledgeBefore: KernelKnowledge | null;
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
  /** Stage 5.2 Knowledge / Memory / Story formal slice. */
  knowledge: KernelKnowledge;
  /** Stage 5.3 Phone formal slice. Empty threads is valid. */
  phone: KernelPhoneSystem;
  /** Stage 5.3 News formal slice. Empty entries is valid. */
  news: KernelNewsSystem;
}>;

/**
 * Immutable formal snapshot: identity + revision + state.
 */
export type SessionSnapshot = Readonly<{
  sessionId: SessionId;
  revision: Revision;
  state: GameState;
}>;

/** Loose turn input for fixtures that predate knowledgeBefore / variablesBefore. */
export type KernelTurnInput = Readonly<{
  id: string;
  playerText: string;
  narrativeText: string;
  travelerNameBefore?: string | null;
  variablesBefore?: KernelVariables | null;
  knowledgeBefore?: KernelKnowledge | null;
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
    knowledgeBefore:
      turn.knowledgeBefore === undefined ? null : turn.knowledgeBefore,
  };
}

export function createEmptyKernelKnowledge(
  overrides?: Partial<KernelKnowledge>,
): KernelKnowledge {
  return {
    zhiku: overrides?.zhiku ?? { entries: [] },
    yiting: overrides?.yiting ?? { entries: [] },
    story: overrides?.story ?? { archives: [] },
    memory: overrides?.memory ?? { recentSummaries: [] },
  };
}

export function cloneKernelKnowledge(knowledge: KernelKnowledge): KernelKnowledge {
  return {
    zhiku: {
      entries: knowledge.zhiku.entries.map((entry) => ({
        ...entry,
        keywords: entry.keywords ? [...entry.keywords] : undefined,
      })),
    },
    yiting: {
      entries: knowledge.yiting.entries.map((entry) => ({
        ...entry,
        keywords: entry.keywords ? [...entry.keywords] : undefined,
      })),
    },
    story: {
      archives: knowledge.story.archives.map((archive) => ({ ...archive })),
      injectionHint: knowledge.story.injectionHint,
    },
    memory: {
      recentSummaries: [...knowledge.memory.recentSummaries],
    },
  };
}

/** Create an empty session state for tests / new native sessions. */
export function createEmptyGameState(
  overrides?: Partial<
    Omit<GameState, 'turns' | 'variables' | 'messages' | 'knowledge' | 'phone' | 'news'>
  > & {
    variables?: KernelVariables;
    knowledge?: KernelKnowledge;
    phone?: KernelPhoneSystem;
    news?: KernelNewsSystem;
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
    knowledge: overrides?.knowledge
      ? cloneKernelKnowledge(overrides.knowledge)
      : createEmptyKernelKnowledge(),
    phone: overrides?.phone
      ? cloneKernelPhone(overrides.phone)
      : createEmptyKernelPhone(),
    news: overrides?.news
      ? cloneKernelNews(overrides.news)
      : createEmptyKernelNews(),
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
      knowledgeBefore: t.knowledgeBefore
        ? cloneKernelKnowledge(t.knowledgeBefore)
        : null,
    })),
    variables: cloneKernelVariables(state.variables),
    knowledge: cloneKernelKnowledge(state.knowledge),
    phone: cloneKernelPhone(state.phone),
    news: cloneKernelNews(state.news),
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
