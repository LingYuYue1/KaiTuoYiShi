/**
 * Pure: reduce formal GameState by parsed narrative actions.
 *
 * No I/O. Returns nextState or a typed decision.
 * Variable subset: only `set 旅人.姓名` with a string value updates travelerName.
 * Illegal / unrecognized variable commands leave travelerName unchanged
 * (legacy-compatible: narrative still commits).
 */

import type { GameState, KernelTurn } from '@/src/kernel/domain/session/types';
import type { ParsedNarrativeActions, ParsedVariableCommand } from './parseNarrativeActions';

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
  const turn: KernelTurn = {
    id: `turn_${input.commandId}`,
    playerText: input.playerText,
    narrativeText: input.actions.narrativeText,
  };

  const nextName = applyTravelerName(
    state.travelerName,
    input.actions.variableCommands,
  );

  const nextState: GameState = {
    turnCount: state.turnCount + 1,
    messages: [
      ...state.messages,
      { role: 'user', content: input.playerText },
      { role: 'assistant', content: input.actions.narrativeText },
    ],
    turns: [...state.turns, turn],
    travelerName: nextName,
  };

  return { kind: 'ok', nextState, turn };
}

/**
 * Apply only a legal `set 旅人.姓名 = <string>`.
 * Ignores parse noise / other keys (legacy-compatible domain isolation).
 */
function applyTravelerName(
  currentName: string,
  commands: readonly ParsedVariableCommand[],
): string {
  for (let index = commands.length - 1; index >= 0; index -= 1) {
    const command = commands[index];
    if (isTravelerNameSet(command)) return command.value;
  }
  return currentName;
}

function isTravelerNameSet(
  command: ParsedVariableCommand,
): command is ParsedVariableCommand & Readonly<{ value: string }> {
  return command.action === 'set'
    && command.key === '旅人.姓名'
    && typeof command.value === 'string';
}
