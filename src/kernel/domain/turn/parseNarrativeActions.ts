/**
 * Pure: parse completed model text into narrative + optional variable actions.
 *
 * Phase 2 choice (documented):
 * - Extract narrative body by stripping a trailing/embedded <变量更新> block.
 * - Variable subset is minimal: only legal `set 旅人.姓名 = "..."` is applied.
 * - All other structured variable commands are intentionally ignored: the
 *   complete variable protocol belongs to a later phase.
 */

export type ParsedNarrativeActions = Readonly<{
  narrativeText: string;
  /** Parsed Phase-2 commands (only legal traveler-name updates). */
  variableCommands: readonly ParsedVariableCommand[];
}>;

export type ParsedVariableCommand = Readonly<{
  action: string;
  key: string;
  value: unknown;
}>;

const VARIABLE_BLOCK_RE = /<变量更新>[\s\S]*?<\/变量更新>/i;
const TRAVELER_NAME_SET_RE = /^\s*set\s+旅人\.姓名\s*[=＝]\s*("(?:\\.|[^"\\])*")\s*$/gim;

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

  const variableBlock = extractVariableBlock(completedText);
  const narrativeText = stripVariableBlock(completedText).trim();

  if (narrativeText.length === 0) {
    throw new ParseNarrativeError(
      'empty_narrative',
      'Model completed with empty narrative text',
    );
  }

  return {
    narrativeText,
    variableCommands: variableBlock ? parseTravelerNameSets(variableBlock) : [],
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

function extractVariableBlock(text: string): string | null {
  const match = text.match(VARIABLE_BLOCK_RE);
  return match ? match[0] : null;
}

function stripVariableBlock(text: string): string {
  return text.replace(VARIABLE_BLOCK_RE, '');
}

function parseTravelerNameSets(variableBlock: string): ParsedVariableCommand[] {
  const commands: ParsedVariableCommand[] = [];
  for (const match of variableBlock.matchAll(TRAVELER_NAME_SET_RE)) {
    try {
      commands.push({
        action: 'set',
        key: '旅人.姓名',
        value: JSON.parse(match[1]),
      });
    } catch {
      // Invalid JSON is not a Phase 2 command and must not block narrative commit.
    }
  }
  return commands;
}
