import type { 世界书, 世界书条目, 世界书导出数据, 世界书条目类型, 世界书作用域 } from '@/models/worldbook';
import { 创建空世界书, 创建空世界书条目, ENTRY_TYPE_LABELS, SCOPE_LABELS } from '@/models/worldbook';
import type { 剧情模式 } from '@/models/journey';

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
      const validScopes: 世界书作用域[] = ['main', 'opening', 'battle', 'calibration', 'all'];
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

function selectEntries(books: 世界书[], ctx: FilterContext): 世界书条目[] {
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
  return all.map((a) => a.entry);
}

export function buildWorldbookInjection(
  books: 世界书[],
  ctx: FilterContext,
): string {
  const selected = selectEntries(books, ctx);
  if (!selected.length) return '';

  const grouped: Record<世界书条目类型, 世界书条目[]> = {
    world_lore: [],
    character_lore: [],
    atmosphere: [],
    system_rule: [],
  };

  for (const e of selected) {
    grouped[e.type]?.push(e);
  }

  const parts: string[] = [];
  const groupHeaders: Record<世界书条目类型, string> = {
    world_lore: '## 附加世界观',
    character_lore: '## 附加角色设定',
    atmosphere: '## 氛围参考',
    system_rule: '## 附加系统规则',
  };

  for (const type of ['world_lore', 'character_lore', 'atmosphere', 'system_rule'] as 世界书条目类型[]) {
    const entries = grouped[type];
    if (!entries.length) continue;
    parts.push(groupHeaders[type]);
    for (const e of entries) {
      parts.push(`### ${e.title}\n${e.content}`);
    }
  }

  return parts.join('\n\n');
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
