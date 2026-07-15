/**
 * Pure: parse completed model text into narrative + variable domain actions.
 *
 * Stage 5.1:
 * - Extract narrative body by stripping a trailing/embedded <变量更新> block.
 * - Variable commands are full candidate domain actions from parseVariableBlock
 *   (not formal commits). Illegal paths are filtered at reduce time (fail closed
 *   per command); parse errors alone do not reject the turn.
 * - Empty narrative still rejects (fail closed).
 */

import {
  parseVariableBlock,
  stripVariableBlock,
  type VariableDomainCommand,
} from '@/src/kernel/domain/variables';

export type ParsedNarrativeActions = Readonly<{
  narrativeText: string;
  /** Candidate variable domain actions (not yet committed). */
  variableCommands: readonly VariableDomainCommand[];
  /** Non-fatal parse diagnostics for the variable block. */
  variableParseErrors: readonly string[];
}>;

/** @deprecated Use VariableDomainCommand — kept for Phase 2 test import stability. */
export type ParsedVariableCommand = VariableDomainCommand;

/**
 * Parse completed model text into narrative + optional variable actions.
 * Sync pure function — no I/O.
 *
 * Throws when completed text is empty after trim (illegal empty model result).
 */
export function parseNarrativeActions(completedText: string): ParsedNarrativeActions {
  if (typeof completedText !== 'string') {
    throw new Error('parseNarrativeActions: completedText must be a string');
  }

  const variableParse = parseVariableBlock(completedText);
  const narrativeText = stripVariableBlock(completedText).trim();

  if (narrativeText.length === 0) {
    throw new ParseNarrativeError(
      'empty_narrative',
      'Model completed with empty narrative text',
    );
  }

  return {
    narrativeText,
    variableCommands: variableParse.commands,
    variableParseErrors: variableParse.parseErrors,
  };
}

export class ParseNarrativeError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ParseNarrativeError';
    this.code = code;
  }
}
