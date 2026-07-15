/**
 * Pure: plan a ModelRequest from formal base state + player input.
 *
 * Phase 2 vertical slice uses a minimal prompt (not the full tavern chain).
 * Full systemPromptBuilder / tavernMessageChainBuilder migration is later.
 */

import type { ModelRequest } from '@/src/kernel/ports/ModelGateway';
import type { GameState } from '@/src/kernel/domain/session/types';

export type AdvanceTurnInput = Readonly<{
  text: string;
}>;

/**
 * Build the model request for one AdvanceTurn.
 * Sync pure function — no I/O.
 */
export function planTurnRequest(
  state: GameState,
  input: AdvanceTurnInput,
): ModelRequest {
  const playerText = requireNonEmptyText(input.text);
  const prompt = buildMinimalPrompt(state, playerText);
  return {
    playerText,
    turnCount: state.turnCount,
    messages: state.messages,
    prompt,
  };
}

function requireNonEmptyText(text: string): string {
  if (typeof text !== 'string') {
    throw new Error('planTurnRequest: input.text must be a string');
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    throw new Error('planTurnRequest: input.text must be non-empty');
  }
  return trimmed;
}

function buildMinimalPrompt(state: GameState, playerText: string): string {
  const historyLines = state.messages
    .map((m) => `${m.role === 'user' ? '玩家' : '叙事'}: ${m.content}`)
    .join('\n');
  const historyBlock = historyLines.length > 0 ? `${historyLines}\n` : '';
  return [
    '你是叙事引擎。根据玩家输入推进一回合叙事。',
    `当前回合序号: ${state.turnCount}`,
    `旅人姓名: ${state.travelerName}`,
    historyBlock ? `近期对话:\n${historyBlock}` : '',
    `玩家: ${playerText}`,
    '输出纯叙事正文。如需变量，可附带 <变量更新>...</变量更新> 块。',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}
