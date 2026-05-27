import type { 聊天消息 } from '@/models/chat';
import type { 记忆系统 } from '@/models/memory';
import type { 游戏设置 } from '@/models/settings';

export const MAIN_HISTORY_LIMIT_WITH_MEMORY = 20;
export const MAIN_HISTORY_LIMIT_WITHOUT_MEMORY = 40;
export const MAIN_LONG_TERM_MEMORY_PROMPT_LIMIT = 12;
export const MAIN_SHORT_TERM_MEMORY_PROMPT_LIMIT = 12;
export const MAIN_IMMEDIATE_MEMORY_PROMPT_LIMIT = 6;

export function hasInjectableMemory(memorySystem: 记忆系统): boolean {
  return (
    memorySystem.即时记忆.length > 0 ||
    memorySystem.短期记忆.length > 0 ||
    memorySystem.长期记忆.length > 0
  );
}

export function getMainHistoryWindowLimit(
  settings: 游戏设置,
  memorySystem: 记忆系统,
): number {
  return settings.enableMemoryInjection && hasInjectableMemory(memorySystem)
    ? MAIN_HISTORY_LIMIT_WITH_MEMORY
    : MAIN_HISTORY_LIMIT_WITHOUT_MEMORY;
}

export function getMainHistoryWindow(
  history: 聊天消息[],
  settings: 游戏设置,
  memorySystem: 记忆系统,
): 聊天消息[] {
  return history.slice(-getMainHistoryWindowLimit(settings, memorySystem));
}

function compactText(text: string, limit: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}...` : cleaned;
}

export function buildMainRecallQuery(input: {
  userInput: string;
  history: 聊天消息[];
  currentLocation?: string;
  npcNames?: string[];
}): string {
  const lines: string[] = [];
  const userInput = input.userInput.trim();
  if (userInput) lines.push(`玩家当前输入：${compactText(userInput, 160)}`);
  if (input.currentLocation?.trim()) lines.push(`当前地点：${compactText(input.currentLocation, 80)}`);
  const npcNames = (input.npcNames ?? []).map((name) => name.trim()).filter(Boolean).slice(0, 12);
  if (npcNames.length) lines.push(`当前相关人物：${npcNames.join('、')}`);

  const recent = input.history.slice(-8);
  const recentUsers = recent
    .filter((msg) => msg.role === 'user' && !msg.content.startsWith('[系统]'))
    .slice(-3)
    .map((msg) => compactText(msg.content, 80));
  if (recentUsers.length) lines.push(`最近玩家输入：${recentUsers.join(' / ')}`);

  const recentAssistants = recent
    .filter((msg) => msg.role === 'assistant')
    .slice(-2)
    .map((msg) => {
      const parsed = msg.parsedResponse;
      const memory = parsed?.memory ? `小结：${compactText(parsed.memory, 140)}` : '';
      const body = parsed?.body || msg.content;
      const bodyText = body ? `正文：${compactText(body, 220)}` : '';
      const events = parsed?.worldEvents?.length ? `事件：${parsed.worldEvents.slice(-3).map((item) => compactText(item, 80)).join(' / ')}` : '';
      const storyPlan = parsed?.storyPlan ? `剧情规划：${compactText(parsed.storyPlan, 120)}` : '';
      return [memory, bodyText, events, storyPlan].filter(Boolean).join('；');
    })
    .filter(Boolean);
  if (recentAssistants.length) lines.push(`最近剧情承接：${recentAssistants.join('\n')}`);

  return lines.join('\n').trim() || userInput;
}

export function buildImmediateStoryReview(history: 聊天消息[], maxMessages = 12): string {
  const items = history
    .filter((msg) => {
      if (msg.role === 'system') return false;
      if (msg.role === 'user' && msg.content.startsWith('[系统]')) return false;
      return Boolean(msg.content.trim());
    })
    .slice(-Math.max(2, maxMessages));

  const lines = items.map((msg) => {
    if (msg.role === 'user') return `玩家：${compactText(msg.content, 180)}`;
    const parsed = msg.parsedResponse;
    const memory = parsed?.memory ? `小结：${compactText(parsed.memory, 220)}` : '';
    const body = parsed?.body || msg.content;
    const bodyText = body ? `正文：${compactText(body, 320)}` : '';
    const events = parsed?.worldEvents?.length ? `动态世界：${parsed.worldEvents.slice(-3).map((item) => compactText(item, 90)).join(' / ')}` : '';
    const storyPlan = parsed?.storyPlan ? `剧情规划：${compactText(parsed.storyPlan, 260)}` : '';
    return ['AI', memory, bodyText, events, storyPlan].filter(Boolean).join('｜');
  });

  return lines.join('\n');
}
