import type { TavernInternalMessage } from '@/models/stTypes';

export interface TavernFormatGuardInput {
  messages: TavernInternalMessage[];
  cotPrompt: string;
  formatPrompt: string;
  actionOptionsPrompt: string;
  cotInjectedViaPlaceholder: boolean;
  formatInjectedViaPlaceholder: boolean;
  useCotVariableInjection: boolean;
  useFormatVariableInjection: boolean;
}

export function matchesTavernCotPlaceholder(content: string): boolean {
  return /\{\{\s*cot\s*\}\}/i.test(content);
}

export function matchesTavernFormatPlaceholder(content: string): boolean {
  return /\{\{\s*格式\s*\}\}/i.test(content) || /\{\{\s*format\s*\}\}/i.test(content);
}

export function applyTavernFormatGuard(input: TavernFormatGuardInput): void {
  if (!input.cotInjectedViaPlaceholder && !input.useCotVariableInjection && input.cotPrompt.trim()) {
    input.messages.push({
      role: 'system',
      content: input.cotPrompt,
      source: 'cot_guard',
    });
  }

  if (!input.formatInjectedViaPlaceholder && !input.useFormatVariableInjection && input.formatPrompt.trim()) {
    input.messages.push({
      role: 'system',
      content: input.formatPrompt,
      source: 'format_guard',
    });
  }

  if (input.actionOptionsPrompt.trim()) {
    input.messages.push({
      role: 'system',
      content: input.actionOptionsPrompt,
      source: 'format_guard',
    });
  }
}
