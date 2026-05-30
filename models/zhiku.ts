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
  资料类型?: string;
  关联角色ID?: string;
  关联形态ID?: string;
  解锁状态?: string;
  运行时解锁状态?: string;
  运行时解锁备注?: string;
  解锁条件?: string;
  剧透等级?: string;
  使用范围?: string[];
  首次可用剧情段?: string;
  关联剧情分段ID?: string;
  可否主剧情注入?: boolean;
  可否手机使用?: boolean;
  可否新闻使用?: boolean;
  可否变量参考?: boolean;
  外貌锚点?: string;
  性格锚点?: string;
  说话方式?: string;
  行为习惯?: string;
  关系边界?: string;
  禁止误写?: string;
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

export interface 智库软结构标签 {
  角色名?: string;
  资料类型?: string;
  节点?: string;
  形态?: string;
  命途?: string;
  阶段?: string;
  解锁状态?: string;
  剧透等级?: string;
  使用范围: string[];
  外貌锚点?: string;
  性格锚点?: string;
  说话方式?: string;
  行为习惯?: string;
  关系边界?: string;
  禁止误写?: string;
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
  资料类型?: string;
  关联角色ID?: string;
  关联形态ID?: string;
  解锁状态?: string;
  运行时解锁状态?: string;
  运行时解锁备注?: string;
  解锁条件?: string;
  剧透等级?: string;
  使用范围?: string[];
  首次可用剧情段?: string;
  关联剧情分段ID?: string;
  可否主剧情注入?: boolean;
  可否手机使用?: boolean;
  可否新闻使用?: boolean;
  可否变量参考?: boolean;
  外貌锚点?: string;
  性格锚点?: string;
  说话方式?: string;
  行为习惯?: string;
  关系边界?: string;
  禁止误写?: string;
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
    资料类型: normalizeOptionalText(input.资料类型),
    关联角色ID: normalizeOptionalText(input.关联角色ID),
    关联形态ID: normalizeOptionalText(input.关联形态ID),
    解锁状态: normalizeOptionalText(input.解锁状态),
    运行时解锁状态: normalizeOptionalText(input.运行时解锁状态),
    运行时解锁备注: normalizeOptionalText(input.运行时解锁备注),
    解锁条件: normalizeOptionalText(input.解锁条件),
    剧透等级: normalizeOptionalText(input.剧透等级),
    使用范围: normalizeTextList(input.使用范围),
    首次可用剧情段: normalizeOptionalText(input.首次可用剧情段),
    关联剧情分段ID: normalizeOptionalText(input.关联剧情分段ID),
    可否主剧情注入: input.可否主剧情注入,
    可否手机使用: input.可否手机使用,
    可否新闻使用: input.可否新闻使用,
    可否变量参考: input.可否变量参考,
    外貌锚点: normalizeOptionalText(input.外貌锚点),
    性格锚点: normalizeOptionalText(input.性格锚点),
    说话方式: normalizeOptionalText(input.说话方式),
    行为习惯: normalizeOptionalText(input.行为习惯),
    关系边界: normalizeOptionalText(input.关系边界),
    禁止误写: normalizeOptionalText(input.禁止误写),
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

export function 解析智库软结构标签(
  entry: Pick<智库条目, '标题' | '关键词'> & Partial<Pick<
    智库条目,
    '资料类型' | '关联角色ID' | '关联形态ID' | '解锁状态' | '运行时解锁状态' | '剧透等级' | '使用范围' | '首次可用剧情段' | '关联剧情分段ID' | '外貌锚点' | '性格锚点' | '说话方式' | '行为习惯' | '关系边界' | '禁止误写'
  >>,
): 智库软结构标签 {
  const tagMap = new Map<string, string[]>();
  for (const keyword of entry.关键词 ?? []) {
    const parsed = parseKeywordTag(keyword);
    if (!parsed) continue;
    const current = tagMap.get(parsed.key) ?? [];
    current.push(parsed.value);
    tagMap.set(parsed.key, current);
  }

  const getFirst = (...keys: string[]) => {
    for (const key of keys) {
      const value = tagMap.get(key)?.find(Boolean);
      if (value) return value;
    }
    return undefined;
  };

  return {
    角色名: normalizeOptionalText(entry.关联角色ID) ?? getFirst('角色', '人物', '角色ID', '归属角色'),
    资料类型: normalizeOptionalText(entry.资料类型) ?? getFirst('资料类型', '类型'),
    节点: getFirst('节点'),
    形态: normalizeOptionalText(entry.关联形态ID) ?? getFirst('形态', '形态名'),
    命途: getFirst('命途'),
    阶段: normalizeOptionalText(entry.首次可用剧情段) ?? normalizeOptionalText(entry.关联剧情分段ID) ?? getFirst('阶段'),
    解锁状态: normalizeOptionalText(entry.运行时解锁状态) ?? normalizeOptionalText(entry.解锁状态) ?? getFirst('解锁', '解锁状态'),
    剧透等级: normalizeOptionalText(entry.剧透等级) ?? getFirst('剧透', '剧透等级'),
    使用范围: [
      ...normalizeTextList(entry.使用范围),
      ...(tagMap.get('范围') ?? []),
      ...(tagMap.get('使用范围') ?? []),
    ].filter(Boolean),
    外貌锚点: normalizeOptionalText(entry.外貌锚点) ?? getFirst('外貌', '外貌锚点'),
    性格锚点: normalizeOptionalText(entry.性格锚点) ?? getFirst('性格', '性格锚点'),
    说话方式: normalizeOptionalText(entry.说话方式) ?? getFirst('说话方式', '口吻', '语气'),
    行为习惯: normalizeOptionalText(entry.行为习惯) ?? getFirst('行为习惯', '行为', '习惯'),
    关系边界: normalizeOptionalText(entry.关系边界) ?? getFirst('关系边界', '互动边界'),
    禁止误写: normalizeOptionalText(entry.禁止误写) ?? getFirst('禁止误写', '误写', 'OOC'),
  };
}

export function 获取智库人物名(entry: 智库条目): string {
  return 获取智库人物名列表(entry)[0] ?? entry.标题;
}

export function 获取智库人物名列表(entry: Pick<智库条目, '标题' | '关键词'> & Partial<Pick<智库条目, '关联角色ID'>>): string[] {
  const explicitRole = normalizeOptionalText(entry.关联角色ID);
  if (explicitRole) return [explicitRole];

  const tagNames = (entry.关键词 ?? [])
    .map((keyword) => parseKeywordTag(keyword))
    .filter((tag): tag is { key: string; value: string } => !!tag && ['角色', '人物', '角色ID', '归属角色'].includes(tag.key))
    .map((tag) => tag.value.trim())
    .filter(Boolean);
  if (tagNames.length) return Array.from(new Set(tagNames));

  return entry.标题
    .replace(/[｜|].*$/u, '')
    .replace(/（.*?）/gu, '')
    .replace(/\(.*?\)/gu, '')
    .trim()
    ? [entry.标题
        .replace(/[｜|].*$/u, '')
        .replace(/（.*?）/gu, '')
        .replace(/\(.*?\)/gu, '')
        .trim()]
    : [entry.标题];
}

export function 获取智库人物节点标题(entry: 智库条目): string {
  const meta = 解析智库软结构标签(entry);
  if (meta.节点) return meta.节点;
  if (meta.资料类型) {
    if (meta.资料类型.includes('主体')) return '主体人格';
    if (meta.资料类型.includes('形态') && meta.形态) return meta.形态;
    if (meta.资料类型.includes('命途') && (meta.命途 || meta.形态)) return meta.命途 ?? meta.形态 ?? meta.资料类型;
    if (meta.资料类型.includes('剧情') && meta.阶段) return meta.阶段;
    if (/OOC|误写|风险/i.test(meta.资料类型)) return 'OOC 风险';
    return meta.资料类型;
  }
  if (meta.形态) return meta.形态;
  if (meta.命途) return meta.命途;
  if (meta.阶段) return meta.阶段;
  return entry.标题;
}

export function 比较智库人物节点(a: 智库条目, b: 智库条目): number {
  const rankA = getCharacterNodeRank(解析智库软结构标签(a));
  const rankB = getCharacterNodeRank(解析智库软结构标签(b));
  if (rankA !== rankB) return rankA - rankB;
  return b.updatedAt - a.updatedAt || a.标题.localeCompare(b.标题, 'zh-Hans-CN');
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
    资料类型: normalizeOptionalText(entry.资料类型),
    关联角色ID: normalizeOptionalText(entry.关联角色ID),
    关联形态ID: normalizeOptionalText(entry.关联形态ID),
    解锁状态: normalizeOptionalText(entry.解锁状态),
    运行时解锁状态: normalizeOptionalText(entry.运行时解锁状态),
    运行时解锁备注: normalizeOptionalText(entry.运行时解锁备注),
    解锁条件: normalizeOptionalText(entry.解锁条件),
    剧透等级: normalizeOptionalText(entry.剧透等级),
    使用范围: normalizeTextList(entry.使用范围),
    首次可用剧情段: normalizeOptionalText(entry.首次可用剧情段),
    关联剧情分段ID: normalizeOptionalText(entry.关联剧情分段ID),
    可否主剧情注入: typeof entry.可否主剧情注入 === 'boolean' ? entry.可否主剧情注入 : undefined,
    可否手机使用: typeof entry.可否手机使用 === 'boolean' ? entry.可否手机使用 : undefined,
    可否新闻使用: typeof entry.可否新闻使用 === 'boolean' ? entry.可否新闻使用 : undefined,
    可否变量参考: typeof entry.可否变量参考 === 'boolean' ? entry.可否变量参考 : undefined,
    外貌锚点: normalizeOptionalText(entry.外貌锚点),
    性格锚点: normalizeOptionalText(entry.性格锚点),
    说话方式: normalizeOptionalText(entry.说话方式),
    行为习惯: normalizeOptionalText(entry.行为习惯),
    关系边界: normalizeOptionalText(entry.关系边界),
    禁止误写: normalizeOptionalText(entry.禁止误写),
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

function parseKeywordTag(keyword: string): { key: string; value: string } | null {
  const match = keyword.match(/^([^:：]+)[:：](.+)$/u);
  if (!match) return null;
  const key = match[1].trim();
  const value = match[2].trim();
  if (!key || !value) return null;
  return { key, value };
}

function getCharacterNodeRank(meta: 智库软结构标签): number {
  const type = meta.资料类型 ?? meta.节点 ?? '';
  if (type.includes('主体')) return 10;
  if (type.includes('基础')) return 20;
  if (type.includes('形态')) return 30;
  if (type.includes('命途') || type.includes('能力')) return 40;
  if (type.includes('剧情') || type.includes('解锁')) return 50;
  if (/OOC|误写|风险/i.test(type)) return 60;
  if (type.includes('手机')) return 70;
  if (type.includes('新闻')) return 80;
  return 100;
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

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(
    value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean),
  )).slice(0, 12);
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
  const structured = [
    entry.资料类型,
    entry.关联角色ID,
    entry.关联形态ID,
    entry.解锁状态,
    entry.运行时解锁状态,
    entry.运行时解锁备注,
    entry.解锁条件,
    entry.剧透等级,
    entry.首次可用剧情段,
    entry.关联剧情分段ID,
    entry.外貌锚点,
    entry.性格锚点,
    entry.说话方式,
    entry.行为习惯,
    entry.关系边界,
    entry.禁止误写,
    ...(entry.使用范围 ?? []),
  ].filter(Boolean).join(' ').toLowerCase();
  let score = 0;

  if (title.includes(query)) score += 80;
  if (keywords.some((k) => k.includes(query) || query.includes(k))) score += 50;
  if (summary.includes(query)) score += 32;
  if (seriesTitle.includes(query)) score += 26;
  if (structured.includes(query)) score += 24;
  if (source.includes(query)) score += 12;
  if (raw.includes(query)) score += 8;

  for (const term of terms) {
    if (title.includes(term)) score += 22;
    if (keywords.some((k) => k.includes(term) || term.includes(k))) score += 18;
    if (summary.includes(term)) score += 10;
    if (seriesTitle.includes(term)) score += 8;
    if (structured.includes(term)) score += 8;
    if (raw.includes(term)) score += 3;
  }

  return score + entry.重要度;
}
