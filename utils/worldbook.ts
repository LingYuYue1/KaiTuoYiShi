import type { 世界书, 世界书条目, 世界书导出数据, 世界书条目类型, 世界书作用域 } from '@/models/worldbook';
import { 创建空世界书, 创建空世界书条目, ENTRY_TYPE_LABELS, SCOPE_LABELS } from '@/models/worldbook';
import type { 剧情模式, 开局来源 } from '@/models/journey';

export const PROMPT_LIKE_WORLDBOOK_ENTRY_IDS = new Set([
  'builtin_worldview_overview',
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
  /** 结构化当前区域 ID；旧档缺失时由调用方迁移为 unknown。 */
  currentRegionId?: string;
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

/** 概率触发检查。probability=100 必触发，=0 必不触发，中间值按随机数。
 *  random 可注入（测试用），默认真实 Math.random。 */
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
    const lastTriggered = triggerStates[entry.id];
    if (lastTriggered !== undefined) {
      const messagesSinceLastTrigger = currentMessageCount - lastTriggered;
      if (messagesSinceLastTrigger < cooldown) return false;
    }
  }

  return true;
}

// ── 注入主流程 ──────────────────────────────────────────────────

/** 世界书单次解析选项。random 可注入（测试用）；enabled=false 时四路全空（总开关）。 */
export interface WorldbookPlanOptions {
  random?: () => number;
  enabled?: boolean;
}

/** 已解析条目（含书标题，供渲染来源行）。 */
export interface ResolvedWorldbookEntry {
  entry: 世界书条目;
  bookTitle: string;
}

/** 世界书单回合唯一解析结果（2026-08-12 工作包A）。
 *  同一回合只解析一次，builder / 触发状态提交 / 快照全部消费本结果。 */
export interface WorldbookInjectionPlan {
  /** type=system_rule → 规则区（区2），提示词化规则 */
  systemRuleEntries: ResolvedWorldbookEntry[];
  /** 非 system_rule、非 depth、injectMode=always → 常驻区（区1） */
  alwaysEntries: ResolvedWorldbookEntry[];
  /** 非 system_rule、非 depth、injectMode=keyword_match → 关键词区（区6） */
  keywordEntries: ResolvedWorldbookEntry[];
  /** 非 system_rule 且 injectAtDepth → 历史 depth 消息 */
  depthMessages: WorldbookChatModuleMessage[];
  /** 实际命中的 keyword_match 条目 id（用于触发状态提交；always 不写入） */
  triggeredEntryIds: string[];
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

/** Phase 7.3：递归触发 + 关键词匹配的共享内核（2026-08-12 重构：always 免检触发控制）。
 *  - 基础资格：book/entry enabled、scope、storyMode gate——所有条目（含 always）都必须满足。
 *  - injectMode=always：直接有资格；不检查关键词、probability、delay、cooldown。
 *  - injectMode=keyword_match：按关键词、概率、延迟冷却、递归规则判断。
 *  - 递归轮：把已触发条目中 recurse=true 的 content 拼接成 extraHaystack，
 *    重新扫描未触发的 keyword_match 条目；新触发条目继续进入下一轮递归
 *  - 全局递归深度上限 5（normalize 已对单条 recurseDepth 做了 0-5 clamp）
 *  返回所有触发条目（含 bookTitle），尚未应用分组覆盖/互斥/排序 */
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

  // 第一轮：常规匹配（always 免检触发控制）
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
      // injectMode=always：直接有资格（不检查关键词/概率/延迟/冷却）
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

export function splitEntriesByInjectMode<T extends { entry: 世界书条目; bookTitle: string }>(
  items: T[],
): WorldbookInjectionSplit {
  const systemPromptEntries: WorldbookInjectionSplit['systemPromptEntries'] = [];
  const messageEntries: WorldbookInjectionSplit['messageEntries'] = [];
  for (const item of items) {
    if (item.entry.injectAtDepth) {
      messageEntries.push({ entry: item.entry, bookTitle: item.bookTitle });
    } else {
      systemPromptEntries.push({ entry: item.entry, bookTitle: item.bookTitle });
    }
  }
  return { systemPromptEntries, messageEntries };
}

function selectEntries(books: 世界书[], ctx: FilterContext): Array<{ entry: 世界书条目; bookTitle: string }> {
  // Phase 7.3：用 gatherTriggeredEntries 统一处理基础过滤 + 递归触发
  const all = gatherTriggeredEntries(books, ctx);
  all.sort((a, b) => (b.entry.priority ?? 100) - (a.entry.priority ?? 100));
  // Phase 7.2：分组覆盖 → 条目互斥（顺序：先互斥判断再分组覆盖可能丢掉被覆盖条目导致互斥失效，
  // 所以先 applyGroupOverride 再 applyDisablesEntries 更稳：被覆盖丢掉的条目不参与互斥判断）
  const afterGroup = applyGroupOverride(all);
  const afterDisables = applyDisablesEntries(afterGroup);
  return afterDisables;
}

/** 构建单条 depth 消息（injectAtDepth 条目 → ChatModuleMessage）。 */
function buildWorldbookDepthMessage(
  entry: 世界书条目,
  bookTitle: string,
  ctx: FilterContext,
): WorldbookChatModuleMessage {
  const typeLabel = ENTRY_TYPE_LABELS[entry.type] ?? '世界书';
  const content = [
    `# 世界书｜${entry.title}`,
    `来源：${bookTitle} / ${typeLabel} / 优先级 ${entry.priority}`,
    '',
    replaceWorldbookPlaceholders(entry.content, ctx),
  ].join('\n');
  return {
    role: 'system',
    content,
    _injectionPosition: 1, // In-Chat
    _injectionDepth: entry.depth ?? 0,
    _injectionOrder: entry.priority ?? 100, // 同 depth 内用 priority 排序
  };
}

/** 渲染一条 system 世界书条目（区1 常驻 / 区6 关键词 / 区2 规则统一格式）。 */
export function renderWorldbookSystemEntry(item: ResolvedWorldbookEntry, ctx: FilterContext, category: '世界书' | '提示词'): string {
  const typeLabel = ENTRY_TYPE_LABELS[item.entry.type] ?? '世界书';
  return [
    `# ${category}｜${item.entry.title}`,
    `来源：${item.bookTitle} / ${typeLabel} / 优先级 ${item.entry.priority}`,
    '',
    replaceWorldbookPlaceholders(item.entry.content, ctx),
  ].join('\n');
}

/** 世界书单回合唯一解析（2026-08-12 工作包A）。
 *  - 资格与落点分离：先判断资格（always 免检触发控制，keyword_match 走完整规则），再按优先级落点：
 *    system_rule → 规则区；非 system_rule 且 injectAtDepth → depth；非 depth 且 always → 常驻区；否则关键词区。
 *  - system_rule + injectAtDepth 仍进规则区（不能伪装成聊天历史）。
 *  - triggeredEntryIds 只记录实际命中的 keyword_match 条目；always 不写触发状态。
 *  - 分组覆盖 / 互斥 / 递归 / 关键词 logic 全部在一次 plan 内完成，四路消费者不再各自重算。 */
export function resolveWorldbookInjectionPlan(
  books: 世界书[],
  ctx: FilterContext,
  options: WorldbookPlanOptions = {},
): WorldbookInjectionPlan {
  const emptyPlan: WorldbookInjectionPlan = {
    systemRuleEntries: [],
    alwaysEntries: [],
    keywordEntries: [],
    depthMessages: [],
    triggeredEntryIds: [],
  };
  // 世界书总开关关闭：四路全空
  if (options.enabled === false) return emptyPlan;

  const all = gatherTriggeredEntries(books, ctx, options);
  all.sort((a, b) => (b.entry.priority ?? 100) - (a.entry.priority ?? 100));
  const afterGroup = applyGroupOverride(all);
  const afterDisables = applyDisablesEntries(afterGroup);

  const plan: WorldbookInjectionPlan = {
    systemRuleEntries: [],
    alwaysEntries: [],
    keywordEntries: [],
    depthMessages: [],
    triggeredEntryIds: [],
  };
  for (const item of afterDisables) {
    const { entry, bookTitle } = item;
    // 触发状态只记录 keyword_match 实际命中（always 不消费/不写触发控制）
    if (entry.injectMode === 'keyword_match') plan.triggeredEntryIds.push(entry.id);
    // 落点优先级：system_rule → 规则区；非 system_rule 且 injectAtDepth → depth；非 depth 且 always → 常驻；否则关键词
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

/** 世界书关键词区注入（区6 按需 system 内容）：非 promptLike、非 depth 的 keyword_match 条目。
 *  2026-08-12 起为 resolveWorldbookInjectionPlan 的兼容包装（同一回合只解析一次）。 */
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

/** 世界书规则/常驻区注入（区2 规则 + 区1 白名单常驻）：system_rule 条目 + 白名单常驻条目。
 *  2026-08-12 起为 resolveWorldbookInjectionPlan 的兼容包装。 */
export function buildPromptLikeWorldbookInjection(
  books: 世界书[],
  ctx: FilterContext,
): string {
  const plan = resolveWorldbookInjectionPlan(books, ctx);
  const items = [
    ...plan.systemRuleEntries,
    ...plan.alwaysEntries.filter(({ entry }) => PROMPT_LIKE_WORLDBOOK_ENTRY_IDS.has(entry.id)),
  ];
  if (!items.length) return '';

  return items
    .map((item) => renderWorldbookSystemEntry(item, ctx, '世界书'))
    .join('\n\n---\n\n');
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
  // 2026-08-12 起为 resolveWorldbookInjectionPlan 的兼容包装（depth 消息已按 depth 降序构建）
  return resolveWorldbookInjectionPlan(books, ctx).depthMessages;
}

// 批次5(2026-07-26)导出:迁移到提示词模块体系的原世界书规则条目仍含 {originalProtagonistSubject}
// 等世界书占位符,模块注入管线(injectPromptModules)在有 worldbookCtx 时复用本函数替换。
export function replaceWorldbookPlaceholders(content: string, ctx: FilterContext): string {
  const playerName = ctx.travelerName?.trim() || '无名开拓者';
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
  const scope = entry.scope?.length ? entry.scope : (['all'] as 世界书作用域[]);
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

/** Phase 7.1：本回合注入完成后，更新触发状态表（2026-08-12 起消费本回合 plan，不再重新筛选/重抽 probability）。
 *  - 传入 plan 时：只提交 plan.triggeredEntryIds（keyword_match 实际命中；always 不写触发状态）。
 *  - 未传 plan 时：兼容旧调用（内部解析一次）。
 *  - 返回值：更新后的 triggerStates（原表浅拷贝 + 本回合触发条目的 lastTriggered 设为 currentMessageCount）。
 *  - 如果本回合没有触发任何条目，返回原表引用不变（调用方据此判断是否需要 setState）。
 *  - 注意：必须在 buildSystemPrompt 之后调用，否则本回合的 cooldown 检查会用到刚更新的状态，
 *    导致刚触发的条目本回合就被 cooldown 屏蔽（错误行为）。 */
export function updateTriggerStatesAfterTurn(
  books: 世界书[],
  ctx: FilterContext,
  plan?: WorldbookInjectionPlan,
): Record<string, number> | undefined {
  const hitIds = plan
    ? new Set(plan.triggeredEntryIds)
    : collectTriggeredEntryIds(books, ctx);
  if (hitIds.size === 0) return ctx.worldbookTriggerStates;
  const msgCount = ctx.messageCount ?? 0;
  const prev = ctx.worldbookTriggerStates ?? {};
  const next: Record<string, number> = { ...prev };
  for (const id of hitIds) {
    next[id] = msgCount;
  }
  return next;
}
