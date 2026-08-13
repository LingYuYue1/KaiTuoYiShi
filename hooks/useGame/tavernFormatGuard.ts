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
