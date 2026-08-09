import type { 聊天消息 } from '@/models/chat';
import type { 记忆系统 } from '@/models/memory';
import type { 游戏设置 } from '@/models/settings';

export const MAIN_HISTORY_LIMIT_WITH_MEMORY = 20;
export const MAIN_HISTORY_LIMIT_WITHOUT_MEMORY = 20;
export const MAIN_IMMEDIATE_STORY_REVIEW_LIMIT = 20;
export const MAIN_LONG_TERM_MEMORY_PROMPT_LIMIT = 12;
export const MAIN_MIDDLE_TERM_MEMORY_PROMPT_LIMIT = 10;
export const MAIN_SHORT_TERM_MEMORY_PROMPT_LIMIT = 12;
export const MAIN_RECALL_ASSISTANT_BODY_WINDOW = 5;

export function hasInjectableMemory(memorySystem: 记忆系统): boolean {
  return (
    memorySystem.短期记忆.length > 0 ||
    memorySystem.中期记忆.length > 0 ||
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

function hasMeaningfulText(text?: string): boolean {
  const cleaned = (text ?? '').replace(/\s+/g, '').trim();
  if (!cleaned) return false;
  return !/^(?:无|暂无|没有|无事发生|none|null|nil|n\/a|（无）|\(无\)|空)$/i.test(cleaned);
}

export function buildLeanAssistantHistoryContent(msg: 聊天消息): string {
  const parsed = msg.parsedResponse;
  if (!parsed) return compactText(msg.content, 1200);

  const body = parsed.body.trim() || msg.content.trim();
  const normalizedBody = normalizeHistoryBodyForPrompt(body);
  const lines: string[] = [
    '# 历史 assistant 压缩摘要',
    '',
    '- 这是旧回合 assistant 历史压缩，只用于承接最近语气、动作和事实。',
    '- 旧回合思维链已省略；新回合必须重新按当前思维链输出完整 Step。',
    '- 禁止把历史回合号、历史压缩说明或历史标签照抄进新正文。',
    '',
    '<正文>',
    normalizedBody ? compactText(normalizedBody, 900) : '【旁白】（历史正文已省略）',
    '</正文>',
    '',
    '<短期记忆>',
    '（历史短期记忆已由记忆系统保存，本条 assistant 历史不重复上传。）',
    '</短期记忆>',
    '',
    '<动态世界>',
    '（历史动态世界已由世界事件系统保存，本条 assistant 历史不重复上传。）',
    '</动态世界>',
    '',
    '<变量草稿>',
    '（历史变量草稿已由变量系统处理，本条 assistant 历史不重复上传。）',
    '</变量草稿>',
  ];

  if (parsed.awakenQuestions.trim()) {
    lines.push('', '<狭间问答>', compactText(parsed.awakenQuestions, 360), '</狭间问答>');
  }
  if (parsed.awakenJudgement.trim()) {
    lines.push('', '<狭间评判>', compactText(parsed.awakenJudgement, 220), '</狭间评判>');
  }

  return lines.join('\n\n').trim() || compactText(msg.content, 1200);
}

function normalizeHistoryBodyForPrompt(body: string): string {
  return body
    .split(/\r?\n/)
    .map((raw) => {
      const line = raw.trim();
      if (!line) return '';
      if (/^【[^】]+】/.test(line)) return line;
      return `【旁白】${line}`;
    })
    .join('\n')
    .trim();
}

export function buildMainRecallQuery(input: {
  userInput: string;
  history: 聊天消息[];
  currentLocation?: string;
  npcNames?: string[];
  includeRecentUserInputs?: boolean;
}): string {
  const lines: string[] = [];
  const userInput = input.userInput.trim();
  if (userInput) lines.push(`玩家当前输入：${compactText(userInput, 160)}`);
  if (input.currentLocation?.trim()) lines.push(`当前地点：${compactText(input.currentLocation, 80)}`);
  const npcNames = (input.npcNames ?? []).map((name) => name.trim()).filter(Boolean).slice(0, 12);
  if (npcNames.length) lines.push(`当前相关人物：${npcNames.join('、')}`);

  const recent = input.history.slice(-Math.max(8, MAIN_RECALL_ASSISTANT_BODY_WINDOW * 2 + 4));
  if (input.includeRecentUserInputs !== false) {
    const recentUsers = recent
      .filter((msg) => msg.role === 'user' && !msg.content.startsWith('[系统]'))
      .slice(-3)
      .map((msg) => compactText(msg.content, 80));
    if (recentUsers.length) lines.push(`最近玩家输入：${recentUsers.join(' / ')}`);
  }

  const recentAssistants = recent
    .filter((msg) => msg.role === 'assistant')
    .slice(-MAIN_RECALL_ASSISTANT_BODY_WINDOW)
    .map((msg) => {
      const parsed = msg.parsedResponse;
      const memory = parsed?.memory ? `小结：${compactText(parsed.memory, 140)}` : '';
      const body = parsed?.body || msg.content;
      const bodyText = body ? `正文：${compactText(body, 220)}` : '';
      const events = parsed?.worldEvents.length ? `事件：${parsed.worldEvents.slice(-3).map((item) => compactText(item, 80)).join(' / ')}` : '';
      const storyPlan = parsed?.storyPlan ? `剧情规划：${compactText(parsed.storyPlan, 120)}` : '';
      return [memory, bodyText, events, storyPlan].filter(Boolean).join('；');
    })
    .filter(Boolean);
  if (recentAssistants.length) lines.push(`最近${MAIN_RECALL_ASSISTANT_BODY_WINDOW}条正文承接：${recentAssistants.join('\n')}`);

  return lines.join('\n').trim() || userInput;
}

function extractAssistantBodyText(msg: 聊天消息): string {
  if (msg.parsedResponse?.body.trim()) return msg.parsedResponse.body.trim();
  const raw = msg.content;
  const match = raw.match(/<正文>\s*([\s\S]*?)\s*<\/正文>/i);
  return (match?.[1] ?? raw).trim();
}

export function buildZhikuKeywordRecallQuery(input: {
  userInput: string;
  history: 聊天消息[];
}): string {
  const lines: string[] = [];
  const userInput = input.userInput.trim();
  if (userInput) lines.push(`玩家当前输入：${compactText(userInput, 160)}`);

  const recentBodies = input.history
    .filter((msg) => msg.role === 'assistant')
    .slice(-MAIN_RECALL_ASSISTANT_BODY_WINDOW)
    .map((msg) => compactText(extractAssistantBodyText(msg), 260))
    .filter(Boolean);
  if (recentBodies.length) lines.push(`最近${MAIN_RECALL_ASSISTANT_BODY_WINDOW}条正文承接：${recentBodies.join('\n')}`);

  return lines.join('\n').trim() || userInput;
}

export function buildImmediateStoryReview(history: 聊天消息[], maxMessages = MAIN_IMMEDIATE_STORY_REVIEW_LIMIT): string {
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
    const parsedMemory = parsed?.memory;
    const parsedStoryPlan = parsed?.storyPlan;
    const memory = hasMeaningfulText(parsedMemory) ? `小结：${compactText(parsedMemory ?? '', 240)}` : '';
    const events = parsed?.worldEvents.length ? `动态世界：${parsed.worldEvents.slice(-3).map((item) => compactText(item, 90)).join(' / ')}` : '';
    const storyPlan = hasMeaningfulText(parsedStoryPlan) ? `剧情规划：${compactText(parsedStoryPlan ?? '', 260)}` : '';
    const needsBodyFallback = !memory && !events && !storyPlan;
    const body = parsed?.body || msg.content;
    const bodyText = body ? `正文锚点：${compactText(body, needsBodyFallback ? 260 : 180)}` : '';
    return ['AI', memory, events, storyPlan, bodyText].filter(Boolean).join('｜');
  });

  return lines.join('\n');
}
