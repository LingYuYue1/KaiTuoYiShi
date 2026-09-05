import type { 世界书, 世界书条目, 世界书导出数据, 世界书作用域 } from '@/models/worldbook';
import { 创建空世界书, ENTRY_TYPE_LABELS, SCOPE_LABELS } from '@/models/worldbook';
import { BUILTIN_BOOK_IDS } from '@/data/builtinWorldbookConfig';
import type { 剧情模式, 开局来源 } from '@/models/journey';
import { devLogError } from '@/utils/devLog';

const CURRENT_BUILTIN_ID_SET = new Set<string>(BUILTIN_BOOK_IDS);

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
  return books.map((rawBook) => {
    // 导入/旧存档边界：worldbook.ts 是 public 导入接口，书与条目均按 Partial 归一，缺省字段补默认值。
    const book = rawBook as Partial<世界书>;
    const id = book.id ?? '';
    return {
      id,
      title: book.title ?? '',
      description: book.description ?? '',
      enabled: book.enabled ?? true,
      builtin: typeof book.builtin === 'boolean' ? book.builtin : CURRENT_BUILTIN_ID_SET.has(id),
      storyModeGate: book.storyModeGate,
      createdAt: book.createdAt ?? 0,
      updatedAt: book.updatedAt ?? 0,
      entries: Array.isArray(book.entries)
        ? book.entries.map((rawEntry) => {
            // 旧字段迁移：turnGuard='first_only' → scope=['opening']；其他无 scope 的 → ['all']
            const entry = rawEntry as Partial<世界书条目>;
            let scope: 世界书作用域[] = Array.isArray(entry.scope) && entry.scope.length
              ? entry.scope
              : (entry as { turnGuard?: 'first_only' }).turnGuard === 'first_only'
                ? ['opening']
                : ['all'];
            // 去重 + 过滤非法值
            const validScopes: 世界书作用域[] = ['main', 'opening', 'battle', 'pathAwakening', 'calibration', 'all'];
            scope = Array.from(new Set(scope.filter((s) => validScopes.includes(s))));
            if (!scope.length) scope = ['all'];

            const rest = { ...entry };
            Reflect.deleteProperty(rest, 'turnGuard');
            return {
              ...rest,
              id: entry.id ?? '',
              title: entry.title ?? '',
              content: entry.content ?? '',
              type: entry.type ?? 'world_lore',
              injectMode: entry.injectMode ?? 'always',
              keywords: entry.keywords ?? [],
              priority: entry.priority ?? 100,
              enabled: entry.enabled ?? true,
              scope,
              createdAt: entry.createdAt ?? 0,
              updatedAt: entry.updatedAt ?? 0,
              // Phase 7.1 新字段默认值（ST 兼容）
              keySecondary: entry.keySecondary ?? [],
              caseSensitive: entry.caseSensitive ?? false,
              matchWholeWords: entry.matchWholeWords ?? false,
              useRegex: entry.useRegex ?? false,
              probability: entry.probability ?? 100,
              delay: entry.delay ?? 0,
              cooldown: entry.cooldown ?? 0,
              scanDepth: entry.scanDepth ?? 50,
              // Phase 7.2 新字段默认值（ST 兼容）
              injectAtDepth: entry.injectAtDepth ?? false,
              depth: entry.depth ?? 0,
              group: entry.group ?? '',
              groupOverride: entry.groupOverride ?? false,
              groupWeight: entry.groupWeight ?? 0,
              disablesEntries: entry.disablesEntries ?? [],
              // Phase 7.3 新字段默认值（ST 兼容）
              logic: entry.logic ?? 'AND_ALL',
              recurse: entry.recurse ?? false,
              recurseDepth: Math.min(Math.max(entry.recurseDepth ?? 1, 0), 5),
            };
          })
        : [],
    };
  });
}

export function reconcileBuiltinWorldbooks({
  sourceBuiltins,
  archivedWorldbooks,
}: {
  sourceBuiltins: 世界书[];
  archivedWorldbooks: 世界书[];
}): 世界书[] {
  const archived = normalizeWorldbooks(archivedWorldbooks);
  if (!archived.length) return sourceBuiltins;

  const archivedById = new Map(archived.map((book) => [book.id, book]));
  const userBooks = archived.filter((book) => !book.builtin);
  const mergedBuiltins = sourceBuiltins.map((builtin) => {
    const saved = archivedById.get(builtin.id);
    if (!saved || builtin.entries.some((entry) => entry.scope.includes('calibration'))) return builtin;

    const entries = builtin.entries.map((entry) => {
      const savedEntry = saved.entries.find((item) => item.id === entry.id);
      if (!savedEntry) return entry;
      return {
        ...entry,
        enabled: savedEntry.enabled,
        createdAt: savedEntry.createdAt,
        updatedAt: savedEntry.updatedAt,
      };
    });
    return { ...builtin, enabled: saved.enabled, entries, updatedAt: saved.updatedAt };
  });

  return [...mergedBuiltins, ...userBooks];
}

// ── CRUD ──

export function updateBook(book: 世界书, partial: Partial<世界书>): 世界书 {
  const rest = { ...partial };
  delete rest.builtin;
  return { ...book, ...rest, updatedAt: Date.now() };
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
  const builtinIds = new Set<string>([
    ...CURRENT_BUILTIN_ID_SET,
    ...existing.filter((book) => book.builtin).map((book) => book.id),
  ]);
  const imported = normalizeWorldbooks(parsed.books).map((book) => {
    const asUser: 世界书 = { ...book, builtin: false };
    if (builtinIds.has(asUser.id)) {
      return { ...asUser, id: 创建空世界书().id };
    }
    return asUser;
  });
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
  /** 当前开局档案地区，用于非黑塔开局优先召回对应区域资料。 */
  openingRegionName?: string;
  /** 当前开局档案章节锚点，用于章节相关资料召回。 */
  openingChapterName?: string;
  /** 玩家自由介入或预设切入摘要，用于召回点名角色、组织、地点。 */
  openingEntryText?: string;
  /** 当前开局来源，用于区分官方预设、自由开局和创意工坊模板。 */
  openingSource?: 开局来源;
  /** 结构化开局档案摘要，用于非默认开局召回地区、人物、地点与防回退规则。 */
  openingArchiveText?: string;
  /** 本回合明确在场、刚说话或被玩家点名的角色名。不得用地点名自动推导。 */
  npcNames?: string[];
  /** 原著主角选择，用于智库门禁星/穹单主角召回。 */
  originalProtagonist?: '星' | '穹' | '星穹双主角';
  /** 当前注入场景。条目 scope 包含此值或 'all' 时才会被选入。 */
  currentScope: 'main' | 'opening' | 'battle' | 'pathAwakening' | 'calibration';
  /** 当前剧情模式。书 storyModeGate 非空时仅 gate 命中此值才注入；undefined 视为不参与 gate 过滤。 */
  storyMode?: 剧情模式;
  // ── Phase 7.1 扩展（ST 兼容） ─────────────────────────
  /** 最近 N 条消息文本数组（用于 scanDepth 扫描）。
   *  由 sendWorkflow 构造时传入，包含最近的消息历史（user + assistant 交替）。
   *  不传或空数组时退化为现有行为（只扫 recentUserInput + recentAIResponse）。 */
  recentMessages?: string[];
  /** 当前累计消息数（从开局开始）。
   *  用于 delay / cooldown / 触发状态表的回合计数。 */
  messageCount?: number;
  /** 世界书条目触发状态表（随存档持久化）。
   *  key = 条目 id，value = 最近触发回合（messageCount 值）。
   *  由调用方从游戏设置传入，用于 delay/cooldown 判断。 */
  worldbookTriggerStates?: Record<string, number>;
}

// ── Phase 7.1：关键词匹配增强 + 触发控制 ──────────────────────────

/** 转义字符串中的正则特殊字符，用于全词匹配时构造安全正则。 */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 构造扫描用 haystack：消息历史（按 scanDepth 截取）+ 现有上下文字段合并。 */
function buildKeywordHaystack(entry: 世界书条目, ctx: FilterContext): string {
  const scanDepth = entry.scanDepth ?? 50;
  const messages = (ctx.recentMessages ?? []).slice(-scanDepth);
  return [
    ...messages,
    ctx.recentUserInput,
    ctx.recentAIResponse,
    ctx.worldName,
    ctx.travelerName,
    ctx.currentLocation,
    ctx.openingRegionName,
    ctx.openingChapterName,
    ctx.openingEntryText,
    ctx.openingSource,
    ctx.openingArchiveText,
  ].join(' ');
}

/** 单个关键词匹配（支持正则/全词/大小写敏感）。 */
function matchSingleKeyword(
  kw: string,
  haystack: string,
  opts: { useRegex?: boolean; caseSensitive?: boolean; matchWholeWords?: boolean },
): boolean {
  const { useRegex, caseSensitive, matchWholeWords } = opts;
  const flags = caseSensitive ? 'g' : 'gi';

  if (useRegex) {
    try {
      return new RegExp(kw, flags).test(haystack);
    } catch {
      return false; // 非法正则忽略
    }
  }

  const k = caseSensitive ? kw : kw.toLowerCase();
  const target = caseSensitive ? haystack : haystack.toLowerCase();

  if (matchWholeWords) {
    return new RegExp(`\\b${escapeRegExp(k)}\\b`, flags).test(haystack);
  }
  return target.includes(k);
}

function entryMatchesKeywords(entry: 世界书条目, ctx: FilterContext, extraHaystack = ''): boolean {
  if (!entry.keywords.length) return true;

  const haystack = buildKeywordHaystack(entry, ctx) + (extraHaystack ? '\n' + extraHaystack : '');
  const opts = {
    useRegex: entry.useRegex,
    caseSensitive: entry.caseSensitive,
    matchWholeWords: entry.matchWholeWords,
  };

  // 主关键词 OR 匹配
  const mainHit = entry.keywords.some((kw) => matchSingleKeyword(kw, haystack, opts));
  if (!mainHit) return false;

  // 无次要关键词 → 主命中即触发
  const secondary = entry.keySecondary ?? [];
  if (secondary.length === 0) return true;

  // Phase 7.3：4 种 logic（默认 AND_ALL 保持向后兼容）
  const logic = entry.logic ?? 'AND_ALL';
  switch (logic) {
    case 'AND_ANY':
      // 主命中 + 任一次要命中
      return secondary.some((kw) => matchSingleKeyword(kw, haystack, opts));
    case 'AND_ALL':
      // 主命中 + 所有次要命中
      return secondary.every((kw) => matchSingleKeyword(kw, haystack, opts));
    case 'NOT_ANY':
      // 主命中 + 任一次要不命中（"非任一" = 至少一个次要不匹配）
      return !secondary.every((kw) => matchSingleKeyword(kw, haystack, opts));
    case 'NOT_ALL':
      // 主命中 + 非所有次要命中（"非全部" = 不是所有都匹配 = 等价于 NOT_ANY 语义，
      // 但 ST 1.12+ 语义里 NOT_ALL 表示"主命中 + 不能所有次要都命中"）。
      // 为避免与 NOT_ANY 完全等价，这里采用 ST 1.12+ 标准：
      // - NOT_ANY: 主命中且至少有一个次要未命中
      // - NOT_ALL: 主命中且所有次要都未命中（更严格的"非"）
      return !secondary.some((kw) => matchSingleKeyword(kw, haystack, opts));
    default:
      return secondary.every((kw) => matchSingleKeyword(kw, haystack, opts));
  }
}

/** 概率触发检查。probability=100 必触发，=0 必不触发，中间值按随机数。 */
function checkProbability(entry: 世界书条目, random: () => number = Math.random): boolean {
  const prob = entry.probability ?? 100;
  if (prob >= 100) return true;
  if (prob <= 0) return false;
  return random() * 100 < prob;
}

/** 延迟触发 + 冷却检查。
 *  - delay：累计消息数 < delay 时不触发
 *  - cooldown：最近触发后 cooldown 条消息内不再触发
 *  - triggerStates：调用方从游戏设置传入，记录每条条目最近触发的 messageCount */
function checkDelayAndCooldown(
  entry: 世界书条目,
  triggerStates: Record<string, number> | undefined,
  currentMessageCount: number,
): boolean {
  const delay = entry.delay ?? 0;
  if (delay > 0 && currentMessageCount < delay) return false;

  const cooldown = entry.cooldown ?? 0;
  if (cooldown > 0 && triggerStates) {
    const lastTriggered = triggerStates[entry.id] as number | undefined;
    if (lastTriggered !== undefined) {
      const messagesSinceLastTrigger = currentMessageCount - lastTriggered;
      if (messagesSinceLastTrigger < cooldown) return false;
    }
  }

  return true;
}

// ── 注入主流程 ──────────────────────────────────────────────────

function entryMatchesScope(entry: 世界书条目, ctx: FilterContext): boolean {
  // 缺失或空 scope 视作 'all'（normalize 应该已经填充，但运行时再兜底一次）
  const scope = entry.scope.length ? entry.scope : (['all'] as 世界书作用域[]);
  return scope.includes('all') || scope.includes(ctx.currentScope);
}

function bookMatchesStoryMode(book: 世界书, ctx: FilterContext): boolean {
  // 未设 gate → 任何剧情模式都允许；设了 gate → 当前 storyMode 必须命中
  if (!book.storyModeGate || book.storyModeGate.length === 0) return true;
  if (!ctx.storyMode) return false;
  return book.storyModeGate.includes(ctx.storyMode);
}

/** 兜底退化条目触发告警去重表：同一条目只记录一次，避免每个回合刷屏。 */
const reportedFallbackEntryIds = new Set<string>();

/** 兜底退化条目检测：injectMode='keyword_match' 但 keywords 为空。
 *  这类条目经 normalize 兜底后 keywords 被填为 []，keyword 匹配退化为恒触发，
 *  会把原本应受关键词门控的残缺/旧数据条目静默注入正文。命中即在触发时记 devLogError。 */
function reportFallbackDegradedEntry(book: 世界书, entry: 世界书条目): void {
  if (entry.injectMode !== 'keyword_match' || entry.keywords.length > 0) return;
  if (reportedFallbackEntryIds.has(entry.id)) return;
  reportedFallbackEntryIds.add(entry.id);
  devLogError(
    'stage',
    `世界书条目「${entry.title}」为兜底退化条目：keyword_match 模式但无 keywords，缺失字段经 normalize 兜底后按始终注入触发`,
    new Error(`fallback-degraded worldbook entry triggered: ${entry.id}`),
    { bookId: book.id, bookTitle: book.title, entryId: entry.id },
  );
}

/** Phase 7.3：递归触发 + 关键词匹配的共享内核。
 *  - 第一轮：按 scope/enabled/概率/延迟冷却/关键词匹配选出首批触发条目
 *  - 递归轮：把已触发条目中 recurse=true 的 content 拼接成 extraHaystack，
 *    重新扫描未触发的 keyword_match 条目；新触发条目继续进入下一轮递归
 *  - 全局递归深度上限 5（normalize 已对单条 recurseDepth 做了 0-5 clamp）
 *  返回所有触发条目（含 bookTitle），尚未应用分组覆盖/互斥/排序 */
export interface WorldbookPlanOptions {
  random?: () => number;
  enabled?: boolean;
}

export interface ResolvedWorldbookEntry {
  entry: 世界书条目;
  bookTitle: string;
}

export interface WorldbookInjectionPlan {
  systemRuleEntries: ResolvedWorldbookEntry[];
  alwaysEntries: ResolvedWorldbookEntry[];
  keywordEntries: ResolvedWorldbookEntry[];
  depthMessages: WorldbookChatModuleMessage[];
  triggeredEntryIds: string[];
}

function gatherTriggeredEntries(
  books: 世界书[],
  ctx: FilterContext,
  options: WorldbookPlanOptions = {},
): Array<{ entry: 世界书条目; bookTitle: string }> {
  const msgCount = ctx.messageCount ?? 0;
  const triggerStates = ctx.worldbookTriggerStates;
  const RECURSION_HARD_LIMIT = 5;
  const random = options.random ?? Math.random;

  const triggered: Array<{ entry: 世界书条目; bookTitle: string }> = [];
  const triggeredIds = new Set<string>();

  for (const book of books) {
    if (!book.enabled) continue;
    if (!bookMatchesStoryMode(book, ctx)) continue;
    for (const entry of book.entries) {
      if (!entry.enabled) continue;
      if (!entryMatchesScope(entry, ctx)) continue;
      if (entry.injectMode === 'keyword_match') {
        if (!entryMatchesKeywords(entry, ctx)) continue;
        if (!checkProbability(entry, random)) continue;
        if (!checkDelayAndCooldown(entry, triggerStates, msgCount)) continue;
      }
      reportFallbackDegradedEntry(book, entry);
      triggered.push({ entry, bookTitle: book.title });
      triggeredIds.add(entry.id);
    }
  }

  // 递归轮：找出 recurse=true 的条目，把它们的 content 作为额外 haystack
  // 重复直到没有新触发条目，或达到全局递归深度上限
  let depth = 0;
  while (depth < RECURSION_HARD_LIMIT) {
    const recursingContents = triggered
      .filter((it) => it.entry.recurse && (it.entry.recurseDepth ?? 1) > depth)
      .map((it) => it.entry.content)
      .join('\n');
    if (!recursingContents) break;

    const newHits: Array<{ entry: 世界书条目; bookTitle: string }> = [];
    for (const book of books) {
      if (!book.enabled) continue;
      if (!bookMatchesStoryMode(book, ctx)) continue;
      for (const entry of book.entries) {
        if (!entry.enabled) continue;
        if (triggeredIds.has(entry.id)) continue;
        if (!entryMatchesScope(entry, ctx)) continue;
        if (entry.injectMode !== 'keyword_match') continue;
        // 该条目的 recurseDepth 限制（normalize 已 clamp 到 0-5）
        const entryMaxDepth = entry.recurseDepth ?? 1;
        if (depth >= entryMaxDepth) continue;
        if (!entryMatchesKeywords(entry, ctx, recursingContents)) continue;
        if (!checkProbability(entry, random)) continue;
        if (!checkDelayAndCooldown(entry, triggerStates, msgCount)) continue;
        reportFallbackDegradedEntry(book, entry);
        newHits.push({ entry, bookTitle: book.title });
        triggeredIds.add(entry.id);
      }
    }
    if (newHits.length === 0) break;
    triggered.push(...newHits);
    depth++;
  }

  return triggered;
}

/** 收集本回合需要触发的条目 id（用于冷却状态更新）。
 *  与 selectEntries 共用 gatherTriggeredEntries，递归触发也参与。 */
function collectTriggeredEntryIds(books: 世界书[], ctx: FilterContext): Set<string> {
  return new Set(gatherTriggeredEntries(books, ctx).map((it) => it.entry.id));
}

// ── Phase 7.2：分组召回 + 条目互斥 ──────────────────────────────

/** 桶分组覆盖：同组内若有 groupOverride=true 的条目，只取 groupWeight 最高的那条；
 *  其他无 group 或 groupOverride=false 的组照常全部保留。
 *  输入需已按 priority 降序排好（selectEntries 已排序）。 */
function applyGroupOverride<T extends { entry: 世界书条目 }>(items: T[]): T[] {
  const groupMap = new Map<string, T[]>();
  const noGroup: T[] = [];

  for (const item of items) {
    const g = item.entry.group ?? '';
    if (!g) {
      noGroup.push(item);
    } else {
      const arr = groupMap.get(g) ?? [];
      arr.push(item);
      groupMap.set(g, arr);
    }
  }

  const result: T[] = [...noGroup];
  for (const [, groupItems] of groupMap) {
    const hasOverride = groupItems.some((it) => it.entry.groupOverride);
    if (hasOverride && groupItems.length > 1) {
      // 取 groupWeight 最高的（并列时按已排序顺序取第一个）
      const sorted = [...groupItems].sort(
        (a, b) => (b.entry.groupWeight ?? 0) - (a.entry.groupWeight ?? 0),
      );
      result.push(sorted[0]);
    } else {
      result.push(...groupItems);
    }
  }
  return result;
}

/** 条目互斥：本回合触发的条目中，若某条目的 disablesEntries 列表包含其他条目 id，
 *  则那些条目被禁用。返回过滤后的列表。 */
function applyDisablesEntries<T extends { entry: 世界书条目 }>(items: T[]): T[] {
  const disabledIds = new Set<string>();
  for (const item of items) {
    const list = item.entry.disablesEntries;
    if (list && list.length > 0) {
      for (const id of list) disabledIds.add(id);
    }
  }
  if (disabledIds.size === 0) return items;
  return items.filter((item) => !disabledIds.has(item.entry.id));
}

/** 深度插入分流：把 injectAtDepth=true 的条目分出来（供 systemPromptBuilder 转 ChatModuleMessage）。 */
export interface WorldbookInjectionSplit {
  /** 拼 systemPrompt 的条目（injectAtDepth=false 或未设） */
  systemPromptEntries: Array<{ entry: 世界书条目; bookTitle: string }>;
  /** 转 ChatModuleMessage 做 In-Chat 深度插入的条目（injectAtDepth=true） */
  messageEntries: Array<{ entry: 世界书条目; bookTitle: string }>;
}

function buildWorldbookDepthMessage(
  entry: 世界书条目,
  bookTitle: string,
  ctx: FilterContext,
): WorldbookChatModuleMessage {
  const typeLabel = ENTRY_TYPE_LABELS[entry.type];
  const content = [
    `# 世界书｜${entry.title}`,
    `来源：${bookTitle} / ${typeLabel} / 优先级 ${entry.priority}`,
    '',
    replaceWorldbookPlaceholders(entry.content, ctx),
  ].join('\n');
  return {
    role: 'system',
    content,
    _injectionPosition: 1,
    _injectionDepth: entry.depth ?? 0,
    _injectionOrder: entry.priority,
  };
}

export function renderWorldbookSystemEntry(
  item: ResolvedWorldbookEntry,
  ctx: FilterContext,
  category: '世界书' | '提示词',
): string {
  const typeLabel = ENTRY_TYPE_LABELS[item.entry.type];
  return [
    `# ${category}｜${item.entry.title}`,
    `来源：${item.bookTitle} / ${typeLabel} / 优先级 ${item.entry.priority}`,
    '',
    replaceWorldbookPlaceholders(item.entry.content, ctx),
  ].join('\n');
}

export function resolvePromptWorldbookPlan(
  books: 世界书[] | undefined,
  context: FilterContext | undefined,
  enabled: boolean,
): WorldbookInjectionPlan | null {
  if (!enabled || !books || !context) return null;
  return resolveWorldbookInjectionPlan(books, context, {
    random: createSeededRandom(buildWorldbookSeed(context)),
  });
}

function buildWorldbookSeed(context: FilterContext): string {
  const triggerState = Object.entries(context.worldbookTriggerStates ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, turn]) => `${id}:${turn}`)
    .join('|');
  return [
    context.currentScope,
    context.turnCount,
    context.messageCount ?? 0,
    context.recentUserInput,
    ...(context.recentMessages ?? []),
    triggerState,
  ].join('\u241f');
}

function createSeededRandom(seedText: string): () => number {
  let state = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) {
    state ^= seedText.charCodeAt(index);
    state = Math.imul(state, 16777619);
  }
  state >>>= 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function resolveWorldbookInjectionPlan(
  books: 世界书[],
  ctx: FilterContext,
  options: WorldbookPlanOptions = {},
): WorldbookInjectionPlan {
  const empty: WorldbookInjectionPlan = {
    systemRuleEntries: [],
    alwaysEntries: [],
    keywordEntries: [],
    depthMessages: [],
    triggeredEntryIds: [],
  };
  if (options.enabled === false) return empty;

  const all = gatherTriggeredEntries(books, ctx, options);
  all.sort((a, b) => b.entry.priority - a.entry.priority);
  const afterDisables = applyDisablesEntries(applyGroupOverride(all));

  const plan: WorldbookInjectionPlan = {
    systemRuleEntries: [],
    alwaysEntries: [],
    keywordEntries: [],
    depthMessages: [],
    triggeredEntryIds: [],
  };
  for (const item of afterDisables) {
    const { entry, bookTitle } = item;
    if (entry.injectMode === 'keyword_match') plan.triggeredEntryIds.push(entry.id);
    if (entry.type === 'system_rule') {
      plan.systemRuleEntries.push(item);
    } else if (entry.injectAtDepth) {
      plan.depthMessages.push(buildWorldbookDepthMessage(entry, bookTitle, ctx));
    } else if (entry.injectMode === 'always') {
      plan.alwaysEntries.push(item);
    } else {
      plan.keywordEntries.push(item);
    }
  }
  return plan;
}

export function buildWorldbookInjection(
  books: 世界书[],
  ctx: FilterContext,
): string {
  const plan = resolveWorldbookInjectionPlan(books, ctx);
  const items = [
    ...plan.alwaysEntries.filter(({ entry }) => !isPromptLikeWorldbookEntry(entry)),
    ...plan.keywordEntries,
  ];
  if (!items.length) return '';
  return items
    .map((item) => renderWorldbookSystemEntry(item, ctx, item.entry.type === 'system_rule' ? '提示词' : '世界书'))
    .join('\n\n---\n\n');
}

export function buildPromptLikeWorldbookInjection(
  books: 世界书[],
  ctx: FilterContext,
): string {
  const plan = resolveWorldbookInjectionPlan(books, ctx);
  const items = [
    ...plan.systemRuleEntries,
    ...plan.alwaysEntries.filter(({ entry }) => isPromptLikeWorldbookEntry(entry)),
  ];
  if (!items.length) return '';
  return items.map((item) => renderWorldbookSystemEntry(item, ctx, '世界书')).join('\n\n---\n\n');
}

/** Phase 7.2：构造世界书深度插入的 ChatModuleMessage 列表。
 *  由 systemPromptBuilder 调用并合并到 BuiltSystemPrompt.chatModuleMessages，
 *  sendWorkflow 现有 depth 插入逻辑会自动处理。
 *  注意：提示词化条目（system_rule / PROMPT_LIKE_WORLDBOOK_ENTRY_IDS）不参与深度插入。 */
export interface WorldbookChatModuleMessage {
  role: string;
  content: string;
  _injectionPosition: number;
  _injectionDepth: number;
  _injectionOrder: number;
}

export function buildWorldbookChatModuleMessages(
  books: 世界书[],
  ctx: FilterContext,
): WorldbookChatModuleMessage[] {
  return resolveWorldbookInjectionPlan(books, ctx).depthMessages;
}

export function replaceWorldbookPlaceholders(content: string, ctx: FilterContext): string {
  const playerName = ctx.travelerName.trim() || '无名开拓者';
  const originalProtagonistName = formatOriginalProtagonistName(ctx.originalProtagonist);
  const originalProtagonistSubject = formatOriginalProtagonistSubject(ctx.originalProtagonist);
  return content
    .replace(/\{playerName\}/g, playerName)
    .replace(/\{originalProtagonistName\}/g, originalProtagonistName)
    .replace(/\{originalProtagonistSubject\}/g, originalProtagonistSubject)
    .replace(/\{openingRegionName\}/g, ctx.openingRegionName?.trim() || '当前开局地区')
    .replace(/\{openingChapterName\}/g, ctx.openingChapterName?.trim() || '当前章节锚点')
    .replace(/\{openingEntryText\}/g, ctx.openingEntryText?.trim() || '无额外开局介入文本')
    .replace(/\{openingArchiveText\}/g, ctx.openingArchiveText?.trim() || '无结构化开局档案');
}

function formatOriginalProtagonistName(originalProtagonist: FilterContext['originalProtagonist']): string {
  if (originalProtagonist === '星') return '星';
  if (originalProtagonist === '穹') return '穹';
  if (originalProtagonist === '星穹双主角') return '星与穹';
  return '所选原著主角';
}

function formatOriginalProtagonistSubject(originalProtagonist: FilterContext['originalProtagonist']): string {
  if (originalProtagonist === '星') return '原作主角星';
  if (originalProtagonist === '穹') return '原作主角穹';
  if (originalProtagonist === '星穹双主角') return '原作主角星与穹';
  return '所选原著主角';
}

// ── Entry explanation (for UI preview) ──

export function explainEntry(entry: 世界书条目): string {
  const parts: string[] = [];
  parts.push(`类型：${ENTRY_TYPE_LABELS[entry.type]}`);
  const kwInfo = entry.keywords.length ? `匹配关键词[${entry.keywords.join(', ')}]` : '关键词匹配（无关键词）';
  parts.push(`注入：${entry.injectMode === 'always' ? '始终注入' : kwInfo}`);
  parts.push(`优先级：${entry.priority}`);
  const scope = entry.scope.length ? entry.scope : (['all'] as 世界书作用域[]);
  parts.push(`场景：${scope.map((s) => SCOPE_LABELS[s]).join(' / ')}`);

  // Phase 7.1 高级字段说明
  const advanced: string[] = [];
  if (entry.keySecondary && entry.keySecondary.length > 0) {
    advanced.push(`次要关键词[${entry.keySecondary.join(', ')}]`);
  }
  if (entry.caseSensitive) advanced.push('大小写敏感');
  if (entry.matchWholeWords) advanced.push('全词匹配');
  if (entry.useRegex) advanced.push('正则匹配');
  if ((entry.probability ?? 100) < 100) advanced.push(`概率${entry.probability}%`);
  if ((entry.delay ?? 0) > 0) advanced.push(`延迟${entry.delay}条`);
  if ((entry.cooldown ?? 0) > 0) advanced.push(`冷却${entry.cooldown}条`);
  if ((entry.scanDepth ?? 50) !== 50) advanced.push(`扫描${entry.scanDepth}条`);

  // Phase 7.2 高级字段说明
  if (entry.injectAtDepth) advanced.push(`深度${entry.depth ?? 0}`);
  if (entry.group) advanced.push(`分组[${entry.group}]${entry.groupOverride ? '·覆盖' : ''}`);
  if (entry.groupOverride && (entry.groupWeight ?? 0) !== 0) advanced.push(`组权重${entry.groupWeight}`);
  if (entry.disablesEntries && entry.disablesEntries.length > 0) {
    advanced.push(`互斥[${entry.disablesEntries.length}条]`);
  }

  // Phase 7.3 高级字段说明
  if (entry.logic && entry.logic !== 'AND_ALL') advanced.push(`逻辑${entry.logic}`);
  if (entry.recurse) advanced.push(`递归${entry.recurseDepth ?? 1}层`);

  if (advanced.length) parts.push(`高级：${advanced.join(' / ')}`);

  return parts.join(' | ');
}

/** 导出 collectTriggeredEntryIds 供调用方（sendWorkflow）更新触发状态表。
 *  调用方在注入完成后，把本回合触发的条目 id 写入 settings.worldbookTriggerStates。 */
export { collectTriggeredEntryIds };

/** Phase 7.1：本回合注入完成后，计算触发的条目 id 并更新触发状态表。
 *  - 调用时机：在 buildSystemPrompt / buildWorldbookInjection 之后调用（用同一份 books + ctx）。
 *  - 返回值：更新后的 triggerStates（原表浅拷贝 + 本回合触发条目的 lastTriggered 设为 currentMessageCount）。
 *  - 如果本回合没有触发任何条目，返回原表引用不变（调用方据此判断是否需要 setState）。
 *  - 注意：必须在 buildSystemPrompt 之后调用，否则本回合的 cooldown 检查会用到刚更新的状态，
 *    导致刚触发的条目本回合就被 cooldown 屏蔽（错误行为）。 */
export function updateTriggerStatesAfterTurn(
  books: 世界书[],
  ctx: FilterContext,
  plan?: WorldbookInjectionPlan,
): Record<string, number> {
  const hitIds = plan
    ? new Set(plan.triggeredEntryIds)
    : collectTriggeredEntryIds(books, ctx);
  if (hitIds.size === 0) return ctx.worldbookTriggerStates ?? {};
  const msgCount = ctx.messageCount ?? 0;
  const prev = ctx.worldbookTriggerStates ?? {};
  const next: Record<string, number> = { ...prev };
  for (const id of hitIds) {
    next[id] = msgCount;
  }
  return next;
}
