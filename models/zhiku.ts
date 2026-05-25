export type 智库分类 = 'story' | 'character' | 'npc' | 'location' | 'item' | 'faction' | 'term' | 'event' | 'system';

export const ZHIKU_CATEGORY_LABELS: Record<智库分类, string> = {
  story: '剧情',
  character: '人物',
  npc: 'NPC',
  location: '地点',
  item: '道具',
  faction: '派系',
  term: '术语',
  event: '事件',
  system: '系统',
};

export interface 智库条目 {
  id: string;
  标题: string;
  分类: 智库分类;
  摘要: string;
  原文: string;
  来源?: string;
  关键词: string[];
  关联条目ID: string[];
  重要度: number;
  可用于联动: boolean;
  系列ID?: string;
  系列标题?: string;
  系列序号?: number;
  章节序号?: number;
  builtin: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface 智库系统 {
  条目: 智库条目[];
}

export function 创建空智库系统(): 智库系统 {
  return { 条目: [] };
}

export function 创建智库条目(input: {
  标题: string;
  分类?: 智库分类;
  摘要?: string;
  原文?: string;
  来源?: string;
  关键词?: string[];
  重要度?: number;
  可用于联动?: boolean;
  系列ID?: string;
  系列标题?: string;
  系列序号?: number;
  章节序号?: number;
  builtin?: boolean;
}): 智库条目 {
  const now = Date.now();
  return {
    id: `zhiku_${now}_${Math.random().toString(36).slice(2, 7)}`,
    标题: input.标题.trim() || '未命名资料',
    分类: input.分类 ?? 'story',
    摘要: input.摘要?.trim() ?? '',
    原文: input.原文?.trim() ?? '',
    来源: input.来源?.trim() || undefined,
    关键词: normalizeKeywords(input.关键词),
    关联条目ID: [],
    重要度: clampImportance(input.重要度 ?? 3),
    可用于联动: input.可用于联动 ?? true,
    系列ID: input.系列ID,
    系列标题: input.系列标题,
    系列序号: input.系列序号,
    章节序号: input.章节序号,
    builtin: input.builtin ?? false,
    createdAt: now,
    updatedAt: now,
  };
}

export function 归一化智库系统(input?: Partial<智库系统> | null): 智库系统 {
  if (!input || !Array.isArray(input.条目)) return 创建空智库系统();
  const seen = new Set<string>();
  return {
    条目: input.条目
      .filter((entry) => !!entry && typeof entry === 'object')
      .map((entry) => normalizeEntry(entry))
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      }),
  };
}

export function 搜索智库条目(system: 智库系统, query: string, limit = 8): 智库条目[] {
  const q = query.trim().toLowerCase();
  const entries = system.条目 ?? [];
  if (!q) {
    return [...entries]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }

  const terms = q
    .split(/[\s,，。；;、|/]+/)
    .map((item) => item.trim())
    .filter(Boolean);

  return entries
    .map((entry) => ({ entry, score: scoreEntry(entry, q, terms) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || b.entry.updatedAt - a.entry.updatedAt)
    .slice(0, limit)
    .map((hit) => hit.entry);
}

export function 智库分类计数(system: 智库系统): Record<智库分类, number> {
  const counts = Object.fromEntries(
    Object.keys(ZHIKU_CATEGORY_LABELS).map((key) => [key, 0]),
  ) as Record<智库分类, number>;
  for (const entry of system.条目 ?? []) {
    counts[entry.分类] = (counts[entry.分类] ?? 0) + 1;
  }
  return counts;
}

function normalizeEntry(entry: Partial<智库条目>): 智库条目 {
  const now = Date.now();
  const category = isZhikuCategory(entry.分类) ? entry.分类 : 'story';
  return {
    id: typeof entry.id === 'string' && entry.id ? entry.id : `zhiku_${now}_${Math.random().toString(36).slice(2, 7)}`,
    标题: typeof entry.标题 === 'string' && entry.标题.trim() ? entry.标题.trim() : '未命名资料',
    分类: category,
    摘要: typeof entry.摘要 === 'string' ? entry.摘要 : '',
    原文: typeof entry.原文 === 'string' ? entry.原文 : '',
    来源: typeof entry.来源 === 'string' && entry.来源.trim() ? entry.来源.trim() : undefined,
    关键词: normalizeKeywords(entry.关键词),
    关联条目ID: Array.isArray(entry.关联条目ID) ? entry.关联条目ID.filter((id): id is string => typeof id === 'string') : [],
    重要度: clampImportance(entry.重要度 ?? 3),
    可用于联动: entry.可用于联动 !== false,
    系列ID: typeof entry.系列ID === 'string' && entry.系列ID.trim() ? entry.系列ID.trim() : undefined,
    系列标题: typeof entry.系列标题 === 'string' && entry.系列标题.trim() ? entry.系列标题.trim() : undefined,
    系列序号: Number.isFinite(Number(entry.系列序号)) ? Math.max(1, Math.trunc(Number(entry.系列序号))) : undefined,
    章节序号: Number.isFinite(Number(entry.章节序号)) ? Math.max(1, Math.trunc(Number(entry.章节序号))) : undefined,
    builtin: entry.builtin === true,
    createdAt: Number(entry.createdAt) || now,
    updatedAt: Number(entry.updatedAt) || now,
  };
}

function isZhikuCategory(value: unknown): value is 智库分类 {
  return typeof value === 'string' && value in ZHIKU_CATEGORY_LABELS;
}

function normalizeKeywords(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，、\n]/)
      : [];
  return Array.from(
    new Set(
      raw
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).slice(0, 24);
}

function clampImportance(value: number): number {
  const n = Math.trunc(Number(value) || 3);
  return Math.min(5, Math.max(1, n));
}

function scoreEntry(entry: 智库条目, query: string, terms: string[]): number {
  const title = entry.标题.toLowerCase();
  const summary = entry.摘要.toLowerCase();
  const source = (entry.来源 ?? '').toLowerCase();
  const raw = entry.原文.toLowerCase();
  const keywords = entry.关键词.map((k) => k.toLowerCase());
  const seriesTitle = (entry.系列标题 ?? '').toLowerCase();
  let score = 0;

  if (title.includes(query)) score += 80;
  if (keywords.some((k) => k.includes(query) || query.includes(k))) score += 50;
  if (summary.includes(query)) score += 32;
  if (seriesTitle.includes(query)) score += 26;
  if (source.includes(query)) score += 12;
  if (raw.includes(query)) score += 8;

  for (const term of terms) {
    if (title.includes(term)) score += 22;
    if (keywords.some((k) => k.includes(term) || term.includes(k))) score += 18;
    if (summary.includes(term)) score += 10;
    if (seriesTitle.includes(term)) score += 8;
    if (raw.includes(term)) score += 3;
  }

  return score + entry.重要度;
}
