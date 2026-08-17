import type { 聊天消息 } from '@/models/chat';
import type { 记忆系统 } from '@/models/memory';
import type { 游戏设置 } from '@/models/settings';

/** F3·对标既定方案：保守式 = 最近 2 个完整回合（2 user + 2 assistant），保护上一句对白口吻。 */
export const MAIN_HISTORY_LIMIT_CONSERVATIVE = 4;
/** F3·对标既定方案：精简式 = 0 条原始历史（只留即时剧情回顾 + 当前输入任务序列）。 */
export const MAIN_HISTORY_LIMIT_MINIMAL = 0;
/**
 * F4·对标既定方案：即时剧情回顾窗口 = 最近 9 个已完成 AI 回合（+其间玩家输入与当前输入）。
 * 不再按消息条数切窗，避免玩家消息稀释 AI 回合数。
 */
export const MAIN_IMMEDIATE_STORY_REVIEW_TURNS = 9;
/**
 * 对标参考项目：长期/中期记忆全量注入（无条数上限）——
 * 记忆体积由压缩链（短期>30 压中期、中期>50 压长期）与回忆命中禁用控制。
 */
export const MAIN_LONG_TERM_MEMORY_PROMPT_LIMIT = 9999;
export const MAIN_MIDDLE_TERM_MEMORY_PROMPT_LIMIT = 9999;
/** 对标参考项目：短期注入窗口 = 短期记忆阈值（最近 30 条，每条带时间戳展示）。 */
export const MAIN_SHORT_TERM_MEMORY_PROMPT_LIMIT = 30;
export const MAIN_RECALL_ASSISTANT_BODY_WINDOW = 5;
/** 智库关键词只扫描最近 5 个叙事回合的玩家输入与 assistant 正文。 */
export const ZHIKU_KEYWORD_RECALL_ASSISTANT_BODY_WINDOW = 5;
export const ZHIKU_KEYWORD_RECALL_USER_INPUT_WINDOW = 5;

export function hasInjectableMemory(memorySystem: 记忆系统): boolean {
  return (
    memorySystem.短期记忆.length > 0 ||
    (memorySystem.中期记忆 ?? []).length > 0 ||
    memorySystem.长期记忆.length > 0
  );
}

export function getMainHistoryWindowLimit(
  settings: 游戏设置,
  memorySystem: 记忆系统,
): number {
  // 对标参考项目：主剧情历史模式两档——minimal 0 条（默认）/ conservative 最近 2 回合；legacy 已移除。
  const mode = settings.记忆系统?.主剧情历史模式 ?? 'minimal';
  if (mode === 'minimal') return MAIN_HISTORY_LIMIT_MINIMAL;
  return MAIN_HISTORY_LIMIT_CONSERVATIVE;
}

export function getMainHistoryWindow(
  history: 聊天消息[],
  settings: 游戏设置,
  memorySystem: 记忆系统,
): 聊天消息[] {
  const limit = getMainHistoryWindowLimit(settings, memorySystem);
  // slice(-0) 等价 slice(0) 会返回整个数组——minimal 模式（0 条）必须显式返回空。
  if (limit <= 0) return [];
  return history.slice(-limit);
}

export type PathAwakeningHistoryPhase = 'question' | 'judgement';

/**
 * 命途狭间只消费仪式所需的最小承接，不复用普通主剧情 20 条窗口。
 * 调用时 history 应包含本轮 user 输入；这里会排除最后一条 user 任务消息。
 */
export function getPathAwakeningHistoryWindow(
  history: 聊天消息[],
  phase: PathAwakeningHistoryPhase,
): 聊天消息[] {
  const withoutCurrentInput = excludeLatestUserMessage(history)
    .filter((msg) => msg.role !== 'system' && !(msg.role === 'user' && msg.content.startsWith('[系统]')));

  if (phase === 'judgement') {
    const questionIndex = findLastIndex(withoutCurrentInput, (msg) => (
      msg.role === 'assistant'
      && Boolean(msg.parsedResponse?.awakenQuestions?.trim() || /<狭间问答>[\s\S]*?<\/狭间问答>/i.test(msg.content))
    ));
    if (questionIndex >= 0) return [withoutCurrentInput[questionIndex]];

    const lastAssistant = [...withoutCurrentInput].reverse().find((msg) => msg.role === 'assistant');
    return lastAssistant ? [lastAssistant] : [];
  }

  // 出题只需要踏入前最后一次交互（通常为一条玩家行动 + 一条 assistant 正文）。
  return withoutCurrentInput.slice(-2);
}

function excludeLatestUserMessage(history: 聊天消息[]): 聊天消息[] {
  const lastUserIndex = findLastIndex(history, (msg) => msg.role === 'user');
  return lastUserIndex >= 0
    ? history.filter((_, index) => index !== lastUserIndex)
    : [...history];
}

function findLastIndex<T>(items: T[], predicate: (item: T) => boolean): number {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return index;
  }
  return -1;
}

function compactText(text: string, limit: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}...` : cleaned;
}

/**
 * 召回用截断：保留开头与结尾，只省略中间。
 * 正文/回顾里「最新回合」永远在文本末尾，slice(0, limit) 保头丢尾会把
 * 最近出现的角色名全部截掉——这正是「上文明明有角色，关键词/AI 都召不回」的机制根因。
 */
function compactRecallBothEnds(text: string, limit: number): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= limit) return cleaned;
  const head = Math.floor(limit * 0.4);
  const tail = limit - head - 6;
  return `${cleaned.slice(0, head)}…[中段省略]…${cleaned.slice(-tail)}`;
}

function hasMeaningfulText(text?: string): boolean {
  const cleaned = (text ?? '').replace(/\s+/g, '').trim();
  if (!cleaned) return false;
  return !/^(?:无|暂无|没有|无事发生|none|null|nil|n\/a|（无）|\(无\)|空)$/i.test(cleaned);
}

export function buildLeanAssistantHistoryContent(msg: 聊天消息): string {
  const parsed = msg.parsedResponse;
  if (!parsed) return compactText(msg.content, 1200);

  const body = parsed.body?.trim() || msg.content.trim();
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

  if (parsed.awakenQuestions?.trim()) {
    lines.push('', '<狭间问答>', compactText(parsed.awakenQuestions, 360), '</狭间问答>');
  }
  if (parsed.awakenJudgement?.trim()) {
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
  if (userInput) lines.push(`玩家当前输入：${compactRecallBothEnds(userInput, 200)}`);
  if (input.currentLocation?.trim()) lines.push(`当前地点：${compactRecallBothEnds(input.currentLocation, 100)}`);
  const npcNames = (input.npcNames ?? []).map((name) => name.trim()).filter(Boolean).slice(0, 12);
  if (npcNames.length) lines.push(`当前相关人物：${npcNames.join('、')}`);

  const recent = input.history.slice(-Math.max(8, MAIN_RECALL_ASSISTANT_BODY_WINDOW * 2 + 4));
  if (input.includeRecentUserInputs !== false) {
    const recentUsers = recent
      .filter((msg) => msg.role === 'user' && !msg.content.startsWith('[系统]'))
      .slice(-3)
      .map((msg) => compactRecallBothEnds(msg.content, 120));
    if (recentUsers.length) lines.push(`最近玩家输入：${recentUsers.join(' / ')}`);
  }

  const recentAssistants = recent
    .filter((msg) => msg.role === 'assistant')
    .slice(-MAIN_RECALL_ASSISTANT_BODY_WINDOW)
    .map((msg) => {
      const parsed = msg.parsedResponse;
      const memory = parsed?.memory ? `小结：${compactRecallBothEnds(parsed.memory, 180)}` : '';
      const body = parsed?.body || msg.content;
      const bodyText = body ? `正文：${compactRecallBothEnds(body, 300)}` : '';
      const events = parsed?.worldEvents?.length ? `事件：${parsed.worldEvents.slice(-3).map((item) => compactRecallBothEnds(item, 100)).join(' / ')}` : '';
      const storyPlan = parsed?.storyPlan ? `剧情规划：${compactRecallBothEnds(parsed.storyPlan, 160)}` : '';
      return [memory, bodyText, events, storyPlan].filter(Boolean).join('；');
    })
    .filter(Boolean);
  if (recentAssistants.length) lines.push(`最近${MAIN_RECALL_ASSISTANT_BODY_WINDOW}条正文承接：${recentAssistants.join('\n')}`);

  return lines.join('\n').trim() || userInput;
}

function extractAssistantBodyText(msg: 聊天消息): string {
  if (msg.parsedResponse?.body?.trim()) return msg.parsedResponse.body.trim();
  const raw = msg.content ?? '';
  const match = raw.match(/<正文>\s*([\s\S]*?)\s*<\/正文>/i);
  return (match?.[1] ?? raw).trim();
}

export function buildZhikuKeywordRecallQuery(input: {
  userInput: string;
  history: 聊天消息[];
}): string {
  const lines: string[] = [];
  const userInput = input.userInput.trim();
  if (userInput) lines.push(`玩家当前输入：${compactRecallBothEnds(userInput, 200)}`);

  const narrativeHistory = input.history.filter((msg) => (
    msg.role !== 'system' && !(msg.role === 'user' && msg.content.startsWith('[系统]'))
  ));
  const recentUserInputs = narrativeHistory
    .filter((msg) => msg.role === 'user')
    .slice(-ZHIKU_KEYWORD_RECALL_USER_INPUT_WINDOW)
    .map((msg) => compactRecallBothEnds(msg.content, 200))
    .filter(Boolean);
  if (recentUserInputs.length) {
    lines.push(`最近${ZHIKU_KEYWORD_RECALL_USER_INPUT_WINDOW}条玩家输入：${recentUserInputs.join('\n')}`);
  }

  // 正文逐条首尾保留：角色名常出现在正文中后段，旧实现只留前 260 字会把它截掉。
  // 这里只读最近 5 条 assistant 正文；即时剧情回顾、记忆和剧情规划不属于本地关键词证据。
  const recentBodies = narrativeHistory
    .filter((msg) => msg.role === 'assistant')
    .slice(-ZHIKU_KEYWORD_RECALL_ASSISTANT_BODY_WINDOW)
    .map((msg) => compactRecallBothEnds(extractAssistantBodyText(msg), 320))
    .filter(Boolean);
  if (recentBodies.length) lines.push(`最近${ZHIKU_KEYWORD_RECALL_ASSISTANT_BODY_WINDOW}条正文承接：${recentBodies.join('\n')}`);

  return lines.join('\n').trim() || userInput;
}

export function buildImmediateStoryReview(history: 聊天消息[], maxTurns = MAIN_IMMEDIATE_STORY_REVIEW_TURNS): string {
  const meaningful = history.filter((msg) => {
    if (msg.role === 'system') return false;
    if (msg.role === 'user' && msg.content.startsWith('[系统]')) return false;
    // assistant 以正文（body）为准判定有效，避免 content 为空/占位（流式中断等）时整个回合被滤掉
    if (msg.role === 'assistant') {
      return Boolean(msg.parsedResponse?.body?.trim() || msg.content.trim());
    }
    return Boolean(msg.content.trim());
  });

  // 以最近 N 个已完成 AI 回合为锚（从后往前数 N 条 assistant），
  // 保留这些回合及其间的玩家输入；若末尾还有玩家输入（当前输入）一并保留。
  // 对标参考项目「按回合窗口裁剪历史」：AI 回合数 ≤ 窗口时返回全部历史（不丢回合）。
  let anchorIndex = -1;
  let assistantCount = 0;
  for (let i = meaningful.length - 1; i >= 0; i -= 1) {
    if (meaningful[i].role === 'assistant') {
      assistantCount += 1;
      if (assistantCount === Math.max(1, maxTurns)) {
        anchorIndex = i;
        break;
      }
    }
  }
  const items = anchorIndex < 0 ? meaningful : meaningful.slice(anchorIndex);

  // 对标参考项目 formatHistoryToScript：剧本化回顾——
  // 每回合【游戏时间】戳 + 玩家输入原文 + AI 正文逐行全文 + 最后一条 AI 的剧情规划。
  const lastPlannableIndex = items.reduce((last, item, index) => (
    item.role === 'assistant' && item.parsedResponse ? index : last
  ), -1);

  const lines = items.map((msg, index) => {
    const timeStr = msg.gameTime ? `【${msg.gameTime}】\n` : '';
    if (msg.role === 'user') {
      return `${timeStr}玩家：${msg.content}`;
    }
    const parsed = msg.parsedResponse;
    const body = (parsed?.body || msg.content || '').trim();
    const bodyText = body ? normalizeHistoryBodyForPrompt(body) : '（正文为空）';
    const planText = index === lastPlannableIndex && parsed?.storyPlan?.trim()
      ? `【上回合AI剧情规划】\n<剧情规划>\n${parsed.storyPlan.trim()}\n</剧情规划>`
      : '';
    return [timeStr, bodyText, planText].filter(Boolean).join('\n');
  });

  return lines.join('\n\n');
}

/** 工作包B：从回合前历史提取最近 1-2 条非空 assistant.storyPlan（区5 剧情安排用）。
 *  由共享预处理层（sendWorkflow / contextSnapshot）调用后传给 builder。 */
export function extractRecentStoryPlanSnippets(history: 聊天消息[], max = 2): string[] {
  const snippets: string[] = [];
  for (let i = history.length - 1; i >= 0 && snippets.length < max; i -= 1) {
    const msg = history[i];
    if (msg.role !== 'assistant') continue;
    const plan = msg.parsedResponse?.storyPlan;
    if (!hasMeaningfulText(plan)) continue;
    snippets.push(plan!.trim());
  }
  return snippets;
}
