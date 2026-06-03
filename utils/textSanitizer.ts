import type { 解析后回复 } from '../models/chat';
import type { 额外功能设置 } from '../models/settings';

export function sanitizeContaminatedText(text: string, settings?: 额外功能设置): string {
  const config = settings?.污染词清理;
  if (!config?.enabled) return text;
  const words = Array.isArray(config.words) ? config.words.map((word) => word.trim()).filter(Boolean) : [];
  if (!words.length || !text) return text;
  let next = text;
  for (const word of words) {
    next = next.split(word).join('');
  }
  return next
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeParsedResponse(parsed: 解析后回复, settings?: 额外功能设置): 解析后回复 {
  const cleanArray = (items: string[]) => items.map((item) => sanitizeContaminatedText(item, settings)).filter(Boolean);
  return {
    ...parsed,
    thinking: sanitizeContaminatedText(parsed.thinking, settings),
    body: sanitizeContaminatedText(parsed.body, settings),
    memory: sanitizeContaminatedText(parsed.memory, settings),
    variableDraft: sanitizeContaminatedText(parsed.variableDraft, settings),
    storyPlan: sanitizeContaminatedText(parsed.storyPlan, settings),
    awakenInvite: sanitizeContaminatedText(parsed.awakenInvite, settings),
    awakenQuestions: sanitizeContaminatedText(parsed.awakenQuestions, settings),
    awakenJudgement: sanitizeContaminatedText(parsed.awakenJudgement, settings),
    worldEvents: cleanArray(parsed.worldEvents),
    actionOptions: cleanArray(parsed.actionOptions),
    rawText: sanitizeContaminatedText(parsed.rawText, settings),
  };
}
