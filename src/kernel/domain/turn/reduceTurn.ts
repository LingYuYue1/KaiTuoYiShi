/**
 * Pure: reduce formal GameState by parsed narrative actions.
 *
 * No I/O. Returns nextState or a typed decision.
 *
 * Stage 5.1 Variable Engine:
 * - Variable commands reduce via pure reduceVariables onto state.variables.
 * - travelerName stays mirrored to variables.旅人.姓名.
 * - Illegal / unrecognized variable commands fail closed per command
 *   (legacy-compatible: narrative still commits).
 *
 * Stage 5.2 Knowledge:
 * - knowledgeBefore recorded on KernelTurn for reroll.
 * - After narrative/variables reduce, applyZhikuRuntimeUnlock runs against
 *   story archives; changed zhiku is written into the same nextState.
 * - All formal mutation is applied here so executeTurn can CAS once
 *   (narrative + variables + knowledge unlock atomic).
 */

import type { GameState, KernelTurn } from '@/src/kernel/domain/session/types';
import {
  cloneKernelKnowledge,
} from '@/src/kernel/domain/session/types';
import { applyZhikuRuntimeUnlock } from '@/src/kernel/domain/knowledge';
import {
  cloneKernelVariables,
  reduceVariables,
  travelerNameFromVariables,
} from '@/src/kernel/domain/variables';
import type { ParsedNarrativeActions } from './parseNarrativeActions';

export type ReduceTurnDecision = Readonly<{
  kind: 'ok';
  nextState: GameState;
  turn: KernelTurn;
}>;

export type ReduceTurnInput = Readonly<{
  playerText: string;
  commandId: string;
  actions: ParsedNarrativeActions;
}>;

/**
 * Apply one successful turn's actions onto base formal state.
 * Sync pure function — no I/O, no post-return mutation.
 */
export function reduceTurn(
  state: GameState,
  input: ReduceTurnInput,
): ReduceTurnDecision {
  const variablesBefore = cloneKernelVariables(state.variables);
  const knowledgeBefore = cloneKernelKnowledge(state.knowledge);

  const turn: KernelTurn = {
    id: `turn_${input.commandId}`,
    playerText: input.playerText,
    narrativeText: input.actions.narrativeText,
    travelerNameBefore: state.travelerName,
    variablesBefore,
    knowledgeBefore,
  };

  const reduced = reduceVariables(input.actions.variableCommands, state.variables);
  const nextVariables = reduced.nextVariables;
  const nextName = travelerNameFromVariables(nextVariables);

  // Post-narrative pure knowledge step: unlock zhiku from existing story archives.
  // Story archives themselves are not mutated on this path yet (progress is later).
  const unlock = applyZhikuRuntimeUnlock(
    state.knowledge.zhiku,
    state.knowledge.story.archives,
  );
  const nextKnowledge = unlock.changed
    ? {
        ...state.knowledge,
        zhiku: unlock.zhiku,
      }
    : state.knowledge;

  const nextState: GameState = {
    turnCount: state.turnCount + 1,
    messages: [
      ...state.messages,
      { role: 'user', content: input.playerText },
      { role: 'assistant', content: input.actions.narrativeText },
    ],
    turns: [...state.turns, turn],
    travelerName: nextName,
    variables: nextVariables,
    knowledge: nextKnowledge,
    // Stage 5.3: phone/news are independent formal fields; preserve across turns.
    phone: state.phone,
    news: state.news,
  };

  return { kind: 'ok', nextState, turn };
}
