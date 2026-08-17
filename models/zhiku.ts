import type { 智库治理分类, 智库资料所有者 } from './zhikuGovernance';

export type 智库分类 = 'story' | 'character' | 'location' | 'faction' | 'term' | 'event' | 'enemy';
export type 智库辅助关键词逻辑 = 'AND_ANY' | 'AND_ALL' | 'NOT_ANY' | 'NOT_ALL';

export const ZHIKU_CHARACTER_INJECTION_FIELDS = [
  '核心身份与阵营',
  '独立人格与行为',
  '外貌锚点',
  '说话方式',
  '台词语料',
  '当前形态与能力边界',
  '精简角色故事',
  '演绎红线',
] as const;

export const ZHIKU_LORE_INJECTION_FIELDS = [
  '核心定义',
  '关键事实',
  '叙事用途',
  '演绎边界',
] as const;

export interface 智库人物注入内容 {
  类型: 'character';
  核心身份与阵营: string;
  独立人格与行为: string;
  外貌锚点: string;
  说话方式: string;
  台词语料: string;
  当前形态与能力边界: string;
  精简角色故事: string;
  演绎红线: string;
}

export interface 智库设定注入内容 {
  类型: 'lore';
  核心定义: string;
  关键事实: string;
  叙事用途: string;
  演绎边界: string;
}

export type 智库注入内容 = 智库人物注入内容 | 智库设定注入内容;

export interface 智库关键词匹配结果 {
  entry: 智库条目;
  主关键词命中: string[];
  辅助关键词命中: string[];
  最长主关键词长度: number;
}

export const ZHIKU_CATEGORY_LABELS: Record<智库分类, string> = {
  story: '剧情',
  character: '人物',
  location: '地点',
  faction: '派系',
  term: '术语',
  event: '事件',
  enemy: '敌对生物',
};

export interface 智库条目 {
  id: string;
  治理分类?: 智库治理分类;
  资料所有者?: 智库资料所有者;
  来源预设ID?: string;
  来源文件?: string;
  来源序号?: number;
  资料版本?: number;
  辅助字段版本?: number;
  标题: string;
  分类: 智库分类;
  摘要: string;
  原文: string;
  注入内容?: 智库注入内容;
  角色故事摘要?: string;
  来源?: string;
  关键词: string[];
  触发关键词?: string[];
  辅助关键词?: string[];
  辅助关键词逻辑?: 智库辅助关键词逻辑;
  互斥组ID?: string;
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
  自制资料契约版本?: number;
  自制资料下一个序号?: number;
  目录版本?: string;
  目录修订?: number;
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
  注入内容?: 智库注入内容;
  角色故事摘要?: string;
  来源?: string;
  关键词?: string[];
  触发关键词?: string[];
  辅助关键词?: string[];
  辅助关键词逻辑?: 智库辅助关键词逻辑;
  互斥组ID?: string;
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
    注入内容: 归一化智库注入内容(input.注入内容, input.分类 ?? 'story'),
    角色故事摘要: normalizeOptionalText(input.角色故事摘要),
    来源: input.来源?.trim() || undefined,
    关键词: normalizeKeywords(input.关键词),
    触发关键词: normalizeOptionalTextList(input.触发关键词),
    辅助关键词: normalizeOptionalTextList(input.辅助关键词),
    辅助关键词逻辑: normalizeSecondaryKeywordLogic(input.辅助关键词逻辑),
    互斥组ID: normalizeOptionalText(input.互斥组ID),
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
    自制资料契约版本: normalizeNonNegativeInteger(input.自制资料契约版本),
    自制资料下一个序号: normalizeNonNegativeInteger(input.自制资料下一个序号),
    目录版本: normalizeOptionalText(input.目录版本),
    目录修订: normalizeNonNegativeInteger(input.目录修订),
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

export function 按ID查找智库条目(system: 智库系统 | undefined, id: string): 智库条目 | undefined {
  const target = id.trim();
  return target ? (system?.条目 ?? []).find((entry) => entry.id === target) : undefined;
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

export function 获取智库显式触发词(entry: 智库条目): string[] {
  const explicit = normalizeTextList(entry.触发关键词);
  if (explicit.length) return explicit;

  const coreTriggers = 获取智库核心触发词(entry);
  if (coreTriggers.length) return coreTriggers;

  const tagged: string[] = [];
  const plain: string[] = [];
  for (const keyword of entry.关键词 ?? []) {
    const parsed = parseKeywordTag(keyword);
    if (!parsed) {
      plain.push(keyword);
      continue;
    }
    if (isRecallTriggerTag(parsed.key, entry.分类)) tagged.push(parsed.value);
  }

  if (entry.分类 === 'character' && tagged.length) return dedupeTextList(tagged);
  return dedupeTextList([...tagged, ...plain]);
}

export function 匹配智库关键词(entry: 智库条目, scanText: string): 智库关键词匹配结果 | null {
  const haystack = normalizeRecallText(scanText);
  if (!haystack) return null;

  const primaryMatches = 获取智库显式触发词(entry)
    .filter((keyword) => recallTextIncludes(haystack, keyword, entry));
  if (!primaryMatches.length) return null;

  const secondaryKeywords = normalizeTextList(entry.辅助关键词);
  const secondaryMatches = secondaryKeywords
    .filter((keyword) => recallTextIncludes(haystack, keyword, entry));
  if (secondaryKeywords.length) {
    const logic = normalizeSecondaryKeywordLogic(entry.辅助关键词逻辑) ?? 'AND_ANY';
    const secondaryAccepted =
      logic === 'AND_ANY' ? secondaryMatches.length > 0
        : logic === 'AND_ALL' ? secondaryMatches.length === secondaryKeywords.length
          : logic === 'NOT_ANY' ? secondaryMatches.length === 0
            : secondaryMatches.length < secondaryKeywords.length;
    if (!secondaryAccepted) return null;
  }

  return {
    entry,
    主关键词命中: primaryMatches,
    辅助关键词命中: secondaryMatches,
    最长主关键词长度: Math.max(...primaryMatches.map((keyword) => normalizeRecallKeyword(keyword).length)),
  };
}

export function 召回智库关键词匹配(system: 智库系统, scanText: string): 智库关键词匹配结果[] {
  const matches = (system.条目 ?? [])
    .map((entry) => 匹配智库关键词(entry, scanText))
    .filter((match): match is 智库关键词匹配结果 => Boolean(match));
  return 选择智库关键词互斥结果(matches);
}

export function 选择智库关键词互斥结果(matches: 智库关键词匹配结果[]): 智库关键词匹配结果[] {
  const selected: 智库关键词匹配结果[] = [];
  const groups = new Map<string, 智库关键词匹配结果[]>();

  for (const match of matches) {
    const groupId = match.entry.互斥组ID?.trim();
    if (!groupId) {
      selected.push(match);
      continue;
    }
    const current = groups.get(groupId) ?? [];
    current.push(match);
    groups.set(groupId, current);
  }

  for (const groupMatches of groups.values()) {
    selected.push([...groupMatches].sort(compareKeywordMatchSpecificity)[0]);
  }

  return selected.sort(compareKeywordMatchSpecificity);
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
  const names: string[] = [];
  const explicitRole = normalizeOptionalText(entry.关联角色ID);
  const taggedNames = (entry.关键词 ?? [])
    .map((keyword) => parseKeywordTag(keyword))
    .filter((tag): tag is { key: string; value: string } => !!tag && ['角色', '人物', '归属角色'].includes(tag.key))
    .map((tag) => tag.value.trim())
    .filter(Boolean);

  const explicitRoleIsInternalId = !!explicitRole && /^[a-z][a-z0-9_-]*$/u.test(explicitRole);
  if (explicitRole && !explicitRoleIsInternalId) names.push(explicitRole);
  names.push(...taggedNames);
  if (explicitRole && !names.includes(explicitRole)) names.push(explicitRole);
  if (names.length) return Array.from(new Set(names));

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

export function 获取智库核心触发词(entry: Pick<智库条目, '原文'>): string[] {
  const source = String(entry.原文 ?? '');
  const match = source.match(/核心触发词[:：]\s*([^\n]+)/u);
  if (!match) return [];
  return Array.from(new Set(
    match[1]
      .replace(/[。；;]+$/u, '')
      .split(/[,，、;；\n]/u)
      .map((item) => item.trim())
      .filter(Boolean),
  ));
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

export function 智库条目需要注入内容(entry: Pick<智库条目, '分类'>): boolean {
  return entry.分类 !== 'story';
}

export function 创建空智库注入内容(category: 智库分类): 智库注入内容 | undefined {
  if (category === 'story') return undefined;
  if (category === 'character') {
    return {
      类型: 'character',
      核心身份与阵营: '',
      独立人格与行为: '',
      说话方式: '',
      台词语料: '',
      外貌锚点: '',
      当前形态与能力边界: '',
      精简角色故事: '',
      演绎红线: '',
    };
  }
  return {
    类型: 'lore',
    核心定义: '',
    关键事实: '',
    叙事用途: '',
    演绎边界: '',
  };
}

export function 归一化智库注入内容(value: unknown, category: 智库分类): 智库注入内容 | undefined {
  if (!智库条目需要注入内容({ 分类: category })) return undefined;
  if (!value || typeof value !== 'object') return undefined;
  const source = value as Record<string, unknown>;
  if (category === 'character') {
    if (source.类型 !== 'character') return undefined;
    return {
      类型: 'character',
      核心身份与阵营: normalizeInjectionText(source.核心身份与阵营),
      独立人格与行为: normalizeInjectionText(source.独立人格与行为),
      说话方式: normalizeInjectionText(source.说话方式),
      台词语料: normalizeInjectionText(source.台词语料),
      外貌锚点: normalizeInjectionText(source.外貌锚点),
      当前形态与能力边界: normalizeInjectionText(source.当前形态与能力边界),
      精简角色故事: normalizeInjectionText(source.精简角色故事),
      演绎红线: normalizeInjectionText(source.演绎红线),
    };
  }
  if (source.类型 !== 'lore') return undefined;
  return {
    类型: 'lore',
    核心定义: normalizeInjectionText(source.核心定义),
    关键事实: normalizeInjectionText(source.关键事实),
    叙事用途: normalizeInjectionText(source.叙事用途),
    演绎边界: normalizeInjectionText(source.演绎边界),
  };
}

export function 获取智库注入内容缺失字段(
  entry: Pick<智库条目, '分类' | '注入内容'>,
): string[] {
  if (!智库条目需要注入内容(entry)) return [];
  const normalized = 归一化智库注入内容(entry.注入内容, entry.分类);
  if (!normalized) {
    return entry.分类 === 'character'
      ? [...ZHIKU_CHARACTER_INJECTION_FIELDS]
      : [...ZHIKU_LORE_INJECTION_FIELDS];
  }
  if (normalized.类型 === 'character') {
    return ZHIKU_CHARACTER_INJECTION_FIELDS.filter((field) => !normalized[field].trim());
  }
  return ZHIKU_LORE_INJECTION_FIELDS.filter((field) => !normalized[field].trim());
}

export function 智库条目注入内容完整(entry: Pick<智库条目, '分类' | '注入内容'>): boolean {
  return 获取智库注入内容缺失字段(entry).length === 0;
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
    治理分类: isZhikuGovernanceCategory(entry.治理分类) ? entry.治理分类 : undefined,
    资料所有者: isZhikuDataOwner(entry.资料所有者) ? entry.资料所有者 : undefined,
    来源预设ID: normalizeOptionalText(entry.来源预设ID),
    来源文件: normalizeOptionalText(entry.来源文件),
    来源序号: Number.isInteger(entry.来源序号) && Number(entry.来源序号) >= 0
      ? Number(entry.来源序号)
      : undefined,
    资料版本: normalizeNonNegativeInteger(entry.资料版本),
    辅助字段版本: normalizeNonNegativeInteger(entry.辅助字段版本),
    标题: typeof entry.标题 === 'string' && entry.标题.trim() ? entry.标题.trim() : '未命名资料',
    分类: category,
    摘要: typeof entry.摘要 === 'string' ? entry.摘要 : '',
    原文: typeof entry.原文 === 'string' ? entry.原文 : '',
    注入内容: 归一化智库注入内容(entry.注入内容, category),
    角色故事摘要: normalizeOptionalText(entry.角色故事摘要),
    来源: typeof entry.来源 === 'string' && entry.来源.trim() ? entry.来源.trim() : undefined,
    关键词: normalizeKeywords(entry.关键词),
    触发关键词: normalizeOptionalTextList(entry.触发关键词),
    辅助关键词: normalizeOptionalTextList(entry.辅助关键词),
    辅助关键词逻辑: normalizeSecondaryKeywordLogic(entry.辅助关键词逻辑),
    互斥组ID: normalizeOptionalText(entry.互斥组ID),
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

function isZhikuGovernanceCategory(value: unknown): value is 智库治理分类 {
  return typeof value === 'string'
    && ['character', 'story', 'location', 'faction', 'event', 'enemy', 'aeon', 'path', 'term'].includes(value);
}

function isZhikuDataOwner(value: unknown): value is 智库资料所有者 {
  return value === 'builtin-json'
    || value === 'story-weaving'
    || value === 'custom-user-data'
    || value === 'pending-user-data';
}

function normalizeNonNegativeInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
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

function normalizeInjectionText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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

function normalizeOptionalTextList(value: unknown): string[] | undefined {
  const normalized = normalizeTextList(value);
  return normalized.length ? normalized : undefined;
}

function normalizeSecondaryKeywordLogic(value: unknown): 智库辅助关键词逻辑 | undefined {
  return value === 'AND_ANY' || value === 'AND_ALL' || value === 'NOT_ANY' || value === 'NOT_ALL'
    ? value
    : undefined;
}

function normalizeRecallText(value: string): string {
  return value
    .replace(/^玩家当前输入[:：]\s*/gmu, '')
    .replace(/^最近\d+条正文承接[:：]\s*/gmu, '')
    .normalize('NFKC')
    .toLocaleLowerCase();
}

function normalizeRecallKeyword(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase();
}

function recallTextIncludes(normalizedHaystack: string, keyword: string, entry: 智库条目): boolean {
  const needle = normalizeRecallKeyword(keyword);
  if (!needle) return false;
  const haystack = entry.分类 === 'character' && needle === '黑塔'
    ? normalizedHaystack.replace(/空间站[「“"]?黑塔[」”"]?|黑塔空间站/gu, '')
    : normalizedHaystack;
  if (entry.分类 === 'character' && Array.from(needle).length === 1) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[\\s,，.。!！?？、:：;；“”"'（）()《》【】])${escaped}($|[\\s,，.。!！?？、:：;；“”"'（）()《》【】])`, 'u').test(haystack);
  }
  return haystack.includes(needle);
}

function dedupeTextList(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function isRecallTriggerTag(key: string, category: 智库分类): boolean {
  if (/^(?:触发|触发词|别名|称呼)$/u.test(key)) return true;
  if (category === 'character') return /^(?:角色|人物|归属角色)$/u.test(key);
  return /^(?:角色|人物|星神|命途|地点|地区|派系|阵营|组织|术语|专有名词|事件|敌对生物)$/u.test(key);
}

function compareKeywordMatchSpecificity(a: 智库关键词匹配结果, b: 智库关键词匹配结果): number {
  const positiveSecondaryA = isPositiveSecondaryLogic(a.entry.辅助关键词逻辑) ? a.辅助关键词命中.length : 0;
  const positiveSecondaryB = isPositiveSecondaryLogic(b.entry.辅助关键词逻辑) ? b.辅助关键词命中.length : 0;
  return b.主关键词命中.length - a.主关键词命中.length
    || positiveSecondaryB - positiveSecondaryA
    || b.最长主关键词长度 - a.最长主关键词长度
    || b.entry.重要度 - a.entry.重要度
    || b.entry.updatedAt - a.entry.updatedAt;
}

function isPositiveSecondaryLogic(logic: 智库辅助关键词逻辑 | undefined): boolean {
  return logic === 'AND_ANY' || logic === 'AND_ALL' || logic === undefined;
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
  // 关键词取「标签值」：正文写「符玄」，匹配的是「角色:符玄」的值而不是带前缀原文
  // （正文里永远不会出现「角色:」这种标签格式，用原文匹配会让关键词命中路径全部失效）。
  const keywordValues = (entry.关键词 ?? [])
    .map((keyword) => {
      const parsed = parseKeywordTag(keyword);
      return parsed ? parsed.value : keyword;
    })
    .map((keyword) => keyword.toLowerCase());
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
  if (keywordValues.some((k) => k.includes(query) || query.includes(k))) score += 50;
  if (summary.includes(query)) score += 32;
  if (seriesTitle.includes(query)) score += 26;
  if (structured.includes(query)) score += 24;
  if (source.includes(query)) score += 12;
  if (raw.includes(query)) score += 8;
  // 关联角色ID 命中：本体档案优先于「关键词里提到该角色」的关联条目
  // （如仙舟「罗浮」关键词含「符玄」会与符玄本体同分竞争，本体必须排前面）。
  const roleId = String(entry.关联角色ID ?? '').toLowerCase();
  if (roleId && query.includes(roleId) && !/^[a-z][a-z0-9_-]*$/u.test(roleId)) score += 40;

  for (const term of terms) {
    if (title.includes(term)) score += 22;
    if (keywordValues.some((k) => k.includes(term) || term.includes(k))) score += 18;
    if (summary.includes(term)) score += 10;
    if (seriesTitle.includes(term)) score += 8;
    if (structured.includes(term)) score += 8;
    if (raw.includes(term)) score += 3;
  }

  // 重要度只作同分排序参考：无任何命中（score=0）时不得返回正分，
  // 否则「搜索智库条目」的 score>0 过滤形同虚设，全表按重要度返回（AI 候选被无关条目挤占）。
  if (score === 0) return 0;
  return score + entry.重要度;
}
