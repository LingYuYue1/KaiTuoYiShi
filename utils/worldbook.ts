import type { 世界书, 世界书条目, 世界书导出数据, 世界书条目类型, 世界书作用域 } from '@/models/worldbook';
import { 创建空世界书, 创建空世界书条目, ENTRY_TYPE_LABELS, SCOPE_LABELS } from '@/models/worldbook';
import type { 剧情模式 } from '@/models/journey';

export const PROMPT_LIKE_WORLDBOOK_ENTRY_IDS = new Set([
  'builtin_compass_overview',
  'builtin_worldview_spine',
]);

function isPromptLikeWorldbookEntry(entry: 世界书条目): boolean {
  return entry.type === 'system_rule' || PROMPT_LIKE_WORLDBOOK_ENTRY_IDS.has(entry.id);
}

// ── Storage key ──
export const WORLDBOOK_STORAGE_KEY = 'worldbooks';

// ── Normalization ──

export function normalizeWorldbooks(books: 世界书[]): 世界书[] {
  return books.map((book) => ({
    ...book,
    entries: book.entries.map((entry) => {
      // 旧字段迁移：turnGuard='first_only' → scope=['opening']；其他无 scope 的 → ['all']
      let scope: 世界书作用域[] = Array.isArray(entry.scope) && entry.scope.length
        ? entry.scope
        : entry.turnGuard === 'first_only'
          ? ['opening']
          : ['all'];
      // 去重 + 过滤非法值
      const validScopes: 世界书作用域[] = ['main', 'opening', 'battle', 'pathAwakening', 'calibration', 'all'];
      scope = Array.from(new Set(scope.filter((s) => validScopes.includes(s))));
      if (!scope.length) scope = ['all'];

      const { turnGuard: _drop, ...rest } = entry;
      void _drop;
      return {
        ...rest,
        type: entry.type || 'world_lore',
        injectMode: entry.injectMode || 'always',
        keywords: entry.keywords ?? [],
        priority: entry.priority ?? 100,
        enabled: entry.enabled ?? true,
        scope,
      };
    }),
  }));
}

// ── CRUD ──

export function addEntryToBook(book: 世界书, entry: 世界书条目): 世界书 {
  return { ...book, entries: [...book.entries, entry], updatedAt: Date.now() };
}

export function removeEntryFromBook(book: 世界书, entryId: string): 世界书 {
  return { ...book, entries: book.entries.filter((e) => e.id !== entryId), updatedAt: Date.now() };
}

export function updateEntryInBook(book: 世界书, entry: 世界书条目): 世界书 {
  return {
    ...book,
    entries: book.entries.map((e) => (e.id === entry.id ? { ...entry, updatedAt: Date.now() } : e)),
    updatedAt: Date.now(),
  };
}

export function updateBook(book: 世界书, partial: Partial<世界书>): 世界书 {
  return { ...book, ...partial, updatedAt: Date.now() };
}

export function addBook(books: 世界书[], book: 世界书): 世界书[] {
  return [...books, book];
}

export function removeBook(books: 世界书[], bookId: string): 世界书[] {
  return books.filter((b) => b.id !== bookId);
}

// ── Import / Export ──

export function exportWorldbooks(books: 世界书[]): 世界书导出数据 {
  return { version: 1, exportedAt: Date.now(), books: normalizeWorldbooks(books) };
}

export function importWorldbooks(data: unknown, existing: 世界书[]): 世界书[] {
  const parsed = data as 世界书导出数据;
  if (!parsed.version || !Array.isArray(parsed.books)) {
    throw new Error('无效的世界书文件');
  }
  const imported = normalizeWorldbooks(parsed.books);
  const existingIds = new Set(existing.map((b) => b.id));
  const merged = [...existing];
  for (const book of imported) {
    const idx = merged.findIndex((b) => b.id === book.id);
    if (idx >= 0) {
      merged[idx] = book;
    } else {
      merged.push(book);
    }
  }
  return merged;
}

// ── Entry filter & injection builder ──

export interface FilterContext {
  recentUserInput: string;
  recentAIResponse: string;
  worldName: string;
  travelerName: string;
  turnCount: number;
  /** 开局场景 ID，用于世界书/智库按起始地点做场景锚定。 */
  startScenarioId?: string;
  /** 开局场景名称或自定义起始场景名。 */
  startSceneName?: string;
  /** 当前地点文本，优先用来做地理锚点。 */
  currentLocation?: string;
  /** 当前注入场景。条目 scope 包含此值或 'all' 时才会被选入。 */
  currentScope: 'main' | 'opening' | 'battle' | 'pathAwakening' | 'calibration';
  /** 当前剧情模式。书 storyModeGate 非空时仅 gate 命中此值才注入；undefined 视为不参与 gate 过滤。 */
  storyMode?: 剧情模式;
}

function entryMatchesKeywords(entry: 世界书条目, ctx: FilterContext): boolean {
  if (!entry.keywords.length) return true;
  const haystack = [
    ctx.recentUserInput,
    ctx.recentAIResponse,
    ctx.worldName,
    ctx.travelerName,
  ].join(' ').toLowerCase();
  return entry.keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

function entryMatchesScope(entry: 世界书条目, ctx: FilterContext): boolean {
  // 缺失或空 scope 视作 'all'（normalize 应该已经填充，但运行时再兜底一次）
  const scope = entry.scope?.length ? entry.scope : (['all'] as 世界书作用域[]);
  return scope.includes('all') || scope.includes(ctx.currentScope);
}

function bookMatchesStoryMode(book: 世界书, ctx: FilterContext): boolean {
  // 未设 gate → 任何剧情模式都允许；设了 gate → 当前 storyMode 必须命中
  if (!book.storyModeGate || book.storyModeGate.length === 0) return true;
  if (!ctx.storyMode) return false;
  return book.storyModeGate.includes(ctx.storyMode);
}

function selectEntries(books: 世界书[], ctx: FilterContext): Array<{ entry: 世界书条目; bookTitle: string }> {
  const all: Array<{ entry: 世界书条目; bookTitle: string }> = [];
  for (const book of books) {
    if (!book.enabled) continue;
    if (!bookMatchesStoryMode(book, ctx)) continue;
    for (const entry of book.entries) {
      if (!entry.enabled) continue;
      if (!entryMatchesScope(entry, ctx)) continue;
      if (entry.injectMode === 'keyword_match' && !entryMatchesKeywords(entry, ctx)) continue;
      all.push({ entry, bookTitle: book.title });
    }
  }
  all.sort((a, b) => (b.entry.priority ?? 100) - (a.entry.priority ?? 100));
  return all;
}

export function buildWorldbookInjection(
  books: 世界书[],
  ctx: FilterContext,
): string {
  const selected = selectEntries(books, ctx).filter(({ entry }) => !isPromptLikeWorldbookEntry(entry));
  if (!selected.length) return '';

  return selected
    .map(({ entry, bookTitle }) => {
      const category = entry.type === 'system_rule' ? '提示词' : '世界书';
      const typeLabel = ENTRY_TYPE_LABELS[entry.type] ?? '世界书';
      return [
        `# ${category}｜${entry.title}`,
        `来源：${bookTitle} / ${typeLabel} / 优先级 ${entry.priority}`,
        '',
        replaceWorldbookPlaceholders(entry.content, ctx),
      ].join('\n');
    })
    .join('\n\n---\n\n');
}

export function buildPromptLikeWorldbookInjection(
  books: 世界书[],
  ctx: FilterContext,
): string {
  const selected = selectEntries(books, ctx).filter(({ entry }) => isPromptLikeWorldbookEntry(entry));
  if (!selected.length) return '';

  return selected
    .map(({ entry, bookTitle }) => [
      `# 提示词｜${entry.title}`,
      `来源：${bookTitle} / 世界书内置提示词 / 优先级 ${entry.priority}`,
      '',
      replaceWorldbookPlaceholders(entry.content, ctx),
    ].join('\n'))
    .join('\n\n---\n\n');
}

function replaceWorldbookPlaceholders(content: string, ctx: FilterContext): string {
  const playerName = ctx.travelerName?.trim() || '无名开拓者';
  return content
    .replace(/\{playerName\}/g, playerName)
    .replace(/玩家姓名/g, playerName)
    .replace(/主角姓名/g, playerName);
}

// ── Entry explanation (for UI preview) ──

export function explainEntry(entry: 世界书条目): string {
  const parts: string[] = [];
  parts.push(`类型：${ENTRY_TYPE_LABELS[entry.type]}`);
  parts.push(`注入：${entry.injectMode === 'always' ? '始终注入' : entry.keywords.length ? `匹配关键词[${entry.keywords.join(', ')}]` : '关键词匹配（无关键词）'}`);
  parts.push(`优先级：${entry.priority}`);
  const scope = entry.scope?.length ? entry.scope : (['all'] as 世界书作用域[]);
  parts.push(`场景：${scope.map((s) => SCOPE_LABELS[s]).join(' / ')}`);
  return parts.join(' | ');
}
