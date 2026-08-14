import type { 智库条目, 智库软结构标签 } from './zhiku';
import {
  获取智库人物名,
  获取智库人物名列表,
  获取智库核心触发词,
  比较智库人物节点,
  解析智库软结构标签,
} from './zhiku';

// ============ 类型 ============
export type CharacterGroupKind = '组织' | '地区' | '阵营' | '资料大区' | '待整理';

export interface CharacterProfile {
  id: string;
  name: string;
  groupId: string;
  groupLabel: string;
  groupKind: CharacterGroupKind;
  groupOrder?: number;
  entries: 智库条目[];
}

export interface CharacterGroup {
  id: string;
  label: string;
  kind: CharacterGroupKind;
  order?: number;
  profiles: CharacterProfile[];
}

export interface StorySeries {
  id: string;
  title: string;
  order: number;
  builtin: boolean;
  entries: 智库条目[];
}

export type CharacterProfileSectionKey =
  | 'identity' | 'health' | 'facts' | 'story' | 'anchors'
  | 'corpus' | 'ability' | 'gates' | 'injection';

export interface ZhikuSection { title: string; body: string }

export interface CharacterIdentityRow {
  label: string;
  value?: string;
  missing: boolean;
  wide?: boolean;
}

export interface CharacterGateCardData {
  title: string; status: string; type: string; spoiler: string; injection: string;
  condition: string; defaultAvailable: string; defaultHandling: string; usage: string;
  activation: string; manifestation: string; expansion: string; triggeredInjection: string;
  knowledgeBoundary: string; rollbackRule: string; appearanceRule: string; personalityRule: string;
  inheritance: string; memoryRule: string; earlyBoundary: string; preview: string; gate: string;
  forbidden: string; locked: boolean;
}

export interface AnchorRow { label: string; value: string }
export interface KeywordBuckets { triggerTerms: string[]; softTags: string[]; supplementalTerms: string[]; total: number }
export interface HealthItem { label: string; value: string }
export interface SectionTab { key: CharacterProfileSectionKey; label: string; available: boolean }

export interface CharacterProfileViewModel {
  meta: 智库软结构标签;
  identityRows: CharacterIdentityRow[];
  identityMissing: string[];
  anchorRows: AnchorRow[];
  keywordBuckets: KeywordBuckets;
  gateCards: CharacterGateCardData[];
  healthItems: HealthItem[];
  keyTags: string[];
  profileSummary: string;
  sectionTabs: SectionTab[];
  factsBody?: string;
  storyBody?: string;
  storyGroups: ZhikuSection[];
  corpusBody?: string;
  corpusGroups: ZhikuSection[];
  abilityBody?: string;
  injectionBody?: string;
  forbiddenIdentityText: string;
  injectedPreview: string;
  lockedGateTitles: string[];
}

// ============ 分组数据（module-private）============
const characterGroupFallbacks: Array<{ label: string; kind: CharacterGroupKind; aliases: string[] }> = [
  { label: '星穹列车', kind: '组织', aliases: ['星穹列车', '列车组', '无名客', '列车', '帕姆'] },
  { label: '黑塔空间站', kind: '地区', aliases: ['黑塔空间站', '空间站', '防卫科', '主控舱段', '基座舱段', '收容舱段', '支援舱段'] },
  { label: '雅利洛-VI', kind: '地区', aliases: ['雅利洛', '贝洛伯格', '下层区', '上层区', '磐岩镇', '地火', '史瓦罗'] },
  { label: '仙舟罗浮', kind: '地区', aliases: ['仙舟', '罗浮', '云骑', '神策府', '长乐天', '金人巷', '鳞渊境'] },
  { label: '匹诺康尼', kind: '资料大区', aliases: ['匹诺康尼', '家族', '梦境', '白日梦酒店', '黄金的时刻', '知更鸟', '星期日'] },
  { label: '翁法罗斯', kind: '资料大区', aliases: ['翁法罗斯'] },
  { label: '联动角色', kind: '资料大区', aliases: ['联动角色', 'Fate', 'UBW', 'Saber', 'Archer'] },
  { label: '永火官邸', kind: '资料大区', aliases: ['永火官邸', '康士坦丝', '大丽花', '冥火大公', '泯灭帮'] },
  { label: '星核猎手', kind: '阵营', aliases: ['星核猎手', '卡芙卡', '银狼', '刃', '萨姆'] },
  { label: '天才俱乐部', kind: '阵营', aliases: ['天才俱乐部', '黑塔', '螺丝咕姆', '阮梅'] },
];
const characterGroupPriority: Record<CharacterGroupKind, number> = {
  组织: 1, 地区: 2, 阵营: 3, 资料大区: 4, 待整理: 9,
};
const nativePenaconyOrganizations = new Set([
  '家族', '猎犬家系', '白日梦酒店', '橡木家系', '鸢尾花家系', '苜蓿草家系', '隐夜鸫家系',
]);
const nativeAmphoreusOrganizations = new Set(['黄金裔', 'Chrysos Heirs', '奥赫玛']);
const crossoverOrganizations = new Set(['Fate/stay night [Unlimited Blade Works]', 'Fate', 'UBW']);
const everFlameOrganizations = new Set(['永火官邸', '泯灭帮', 'Ever-Flame Mansion', 'Annihilation Gang']);

// ============ 人物分组 ============
export function buildCharacterWorkspace(entries: 智库条目[]): { profiles: CharacterProfile[]; groups: CharacterGroup[] } {
  const profiles = new Map<string, CharacterProfile>();
  for (const entry of entries) {
    const names = getCharacterProfileNames(entry);
    for (const name of names) {
      const current = profiles.get(name);
      if (current) {
        if (!current.entries.some((item) => item.id === entry.id)) current.entries.push(entry);
        continue;
      }
      const group = resolveCharacterGroup(entry, name);
      profiles.set(name, {
        id: name,
        name,
        groupId: group.id,
        groupLabel: group.label,
        groupKind: group.kind,
        groupOrder: entry.系列序号,
        entries: [entry],
      });
    }
  }
  const sortedProfiles = Array.from(profiles.values())
    .map((profile) => ({ ...profile, entries: [...profile.entries].sort(比较智库人物节点) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
  const groups = new Map<string, CharacterGroup>();
  for (const profile of sortedProfiles) {
    const current = groups.get(profile.groupId);
    if (current) { current.profiles.push(profile); continue; }
    groups.set(profile.groupId, {
      id: profile.groupId,
      label: profile.groupLabel,
      kind: profile.groupKind,
      order: profile.groupOrder,
      profiles: [profile],
    });
  }
  return {
    profiles: sortedProfiles,
    groups: Array.from(groups.values())
      .map((group) => ({ ...group, profiles: [...group.profiles].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')) }))
      .sort(compareCharacterGroups),
  };
}

export function compareCharacterGroups(a: CharacterGroup, b: CharacterGroup): number {
  const orderA = Number.isFinite(a.order) ? a.order ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  const orderB = Number.isFinite(b.order) ? b.order ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
  if (orderA !== orderB) return orderA - orderB;
  return characterGroupPriority[a.kind] - characterGroupPriority[b.kind] || a.label.localeCompare(b.label, 'zh-Hans-CN');
}

export function resolveCharacterGroup(entry: 智库条目, characterName = 获取智库人物名(entry)): { id: string; label: string; kind: CharacterGroupKind } {
  const explicit = getCharacterGroupFromTags(entry);
  if (explicit) return explicit;
  if (characterName === '星' || characterName === '穹') {
    return { id: 'fallback:星穹列车', label: '星穹列车', kind: '组织' };
  }
  const text = [entry.标题, entry.摘要, entry.来源 ?? '', entry.原文, ...entry.关键词].join(' ');
  for (const group of characterGroupFallbacks) {
    if (group.aliases.some((alias) => text.includes(alias))) {
      return { id: `fallback:${group.label}`, label: group.label, kind: group.kind };
    }
  }
  return { id: 'ungrouped', label: '未分组 / 待整理', kind: '待整理' };
}

export function getCharacterGroupFromTags(entry: 智库条目): { id: string; label: string; kind: CharacterGroupKind } | null {
  const parsedTags = entry.关键词.map(parseCharacterTag).filter((tag): tag is { key: string; value: string } => Boolean(tag));
  const dataArea = parsedTags.find((tag) => ['资料大区', '大区'].includes(tag.key))?.value;
  const organization = parsedTags.find((tag) => ['所属', '归属', '所属组织', '组织'].includes(tag.key))?.value;

  if (dataArea === '匹诺康尼' && organization && nativePenaconyOrganizations.has(organization)) {
    return { id: '资料大区:匹诺康尼', label: '匹诺康尼', kind: '资料大区' };
  }
  if (dataArea === '翁法罗斯' && organization && nativeAmphoreusOrganizations.has(organization)) {
    return { id: '资料大区:翁法罗斯', label: '翁法罗斯', kind: '资料大区' };
  }
  if (dataArea === '联动角色' && organization && crossoverOrganizations.has(organization)) {
    return { id: '资料大区:联动角色', label: '联动角色', kind: '资料大区' };
  }
  if (dataArea === '永火官邸' && organization && everFlameOrganizations.has(organization)) {
    return { id: '资料大区:永火官邸', label: '永火官邸', kind: '资料大区' };
  }

  const tagPriority: Array<{ keys: string[]; kind: CharacterGroupKind }> = [
    { keys: ['所属', '归属', '所属组织'], kind: '组织' },
    { keys: ['地区', '区域', '地点'], kind: '地区' },
    { keys: ['阵营', '派系'], kind: '阵营' },
    { keys: ['组织'], kind: '组织' },
    { keys: ['资料大区', '大区'], kind: '资料大区' },
  ];
  for (const option of tagPriority) {
    for (const parsed of parsedTags) {
      if (!option.keys.includes(parsed.key)) continue;
      return { id: `${option.kind}:${parsed.value}`, label: parsed.value, kind: option.kind };
    }
  }
  return null;
}

export function parseCharacterTag(keyword: string): { key: string; value: string } | null {
  const match = keyword.match(/^([^:：]+)[:：](.+)$/u);
  if (!match) return null;
  const key = match[1].trim();
  const value = match[2].trim();
  return key && value ? { key, value } : null;
}

function getCharacterProfileNames(entry: 智库条目): string[] {
  const primary = 获取智库人物名(entry).trim();
  if (primary) return [primary];
  const names = 获取智库人物名列表(entry).map((name) => name.trim()).filter(Boolean);
  return names.length ? [names[0]] : [entry.标题];
}

function getTagValue(entry: 智库条目, keys: string[]): string | undefined {
  return entry.关键词
    .map(parseCharacterTag)
    .find((tag) => tag && keys.includes(tag.key))?.value;
}

// ============ 故事系列 ============
export function buildStorySeries(entries: 智库条目[]): { groups: StorySeries[]; looseEntries: 智库条目[] } {
  const map = new Map<string, StorySeries>();
  const looseEntries: 智库条目[] = [];
  for (const entry of entries) {
    const seriesId = getStorySeriesId(entry);
    const seriesTitle = getStorySeriesTitle(entry);
    if (!seriesId || !seriesTitle) { looseEntries.push(entry); continue; }
    const current = map.get(seriesId);
    if (current) { current.entries.push(entry); continue; }
    map.set(seriesId, {
      id: seriesId,
      title: seriesTitle,
      order: entry.系列序号 ?? Number.MAX_SAFE_INTEGER,
      builtin: entry.builtin,
      entries: [entry],
    });
  }
  const groups = Array.from(map.values())
    .map((group) => ({ ...group, entries: [...group.entries].sort(compareStoryEntries) }))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, 'zh-Hans-CN'));
  looseEntries.sort(compareStoryEntries);
  return { groups, looseEntries };
}

export function getStorySeriesId(entry: 智库条目): string | null {
  return entry.系列ID?.trim() || entry.系列标题?.trim() || null;
}

export function getStorySeriesTitle(entry: 智库条目): string | null {
  return entry.系列标题?.trim() || entry.标题.trim() || null;
}

export function compareStoryEntries(a: 智库条目, b: 智库条目): number {
  const chapterA = a.章节序号 ?? Number.MAX_SAFE_INTEGER;
  const chapterB = b.章节序号 ?? Number.MAX_SAFE_INTEGER;
  if (chapterA !== chapterB) return chapterA - chapterB;
  return a.updatedAt - b.updatedAt || a.标题.localeCompare(b.标题, 'zh-Hans-CN');
}

// ============ 结构解析 ============
export function parseZhikuMarkdownSections(raw: string): ZhikuSection[] {
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^##\s+(.+?)\s*$/);
    if (match) { current = { title: match[1].trim(), body: [] }; sections.push(current); continue; }
    if (current) current.body.push(line);
  }
  return sections.map((section) => ({ title: section.title, body: section.body.join('\n').trim() }));
}

export function parseMarkdownSubsections(raw: string): ZhikuSection[] {
  const sections: Array<{ title: string; body: string[] }> = [];
  let current: { title: string; body: string[] } | null = null;
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^###\s+(.+?)\s*$/);
    if (match) { current = { title: match[1].trim(), body: [] }; sections.push(current); continue; }
    if (current) current.body.push(line);
  }
  return sections.map((section) => ({ title: section.title, body: section.body.join('\n').trim() })).filter((section) => section.body);
}

export function parseCharacterIdentityFields(raw: string): Map<string, string> {
  const map = new Map<string, string>();
  const lines = raw.split(/\r?\n/);
  const identityLines: string[] = [];
  let inIdentitySection = false;
  for (const line of lines) {
    const title = line.match(/^##\s+(.+?)\s*$/);
    if (title) { inIdentitySection = /基础识别|基础身份|身份层/.test(title[1]); continue; }
    if (inIdentitySection) identityLines.push(line);
  }
  const sourceLines = identityLines.length ? identityLines : lines;
  for (const line of sourceLines) {
    const trimmed = line.trim().replace(/^[-*]\s*/, '');
    const match = trimmed.match(/^([^:：]+)[:：]\s*(.+)$/u);
    if (!match) continue;
    const key = normalizeCharacterIdentityKey(match[1]);
    const value = match[2].trim();
    if (key && value) map.set(key, value);
  }
  return map;
}

export function findCharacterGateSection(sections: ZhikuSection[]): ZhikuSection | undefined {
  return (
    sections.find((section) => /形态|人格|阶段|门禁|真相/.test(section.title)) ??
    sections.find((section) =>
      /边界|写法/.test(section.title) &&
      /门禁|阶段边界|展开条件|默认处理|知情边界|回落规则|解锁|阶段锁定/.test(section.body),
    )
  );
}

export function normalizeCharacterIdentityKey(raw: string): string {
  const key = raw.trim();
  if (/角色ID|ID/i.test(key)) return '角色ID';
  if (/名称|标准名称|显示名称/.test(key)) return '名称';
  if (/别名|称呼/.test(key)) return '别名';
  if (/性别/.test(key)) return '性别';
  if (/年龄/.test(key)) return '年龄状态';
  if (/出身|出生|故乡|来源地|原籍/.test(key)) return '出身';
  if (/^(外貌|外观|外貌描述|外观描述)$/.test(key)) return '外貌';
  if (/^(形态|形态列表|可用形态)$/.test(key)) return '形态';
  if (/种族|身体|存在形态|存在/.test(key)) return '存在形态';
  if (/所属|组织|阵营/.test(key)) return '所属';
  if (/职务|身份/.test(key)) return '身份';
  if (/信息域|已知|未知|知道|不知道/.test(key)) return '当前信息域';
  if (/使用范围|可用范围|范围/.test(key)) return '使用范围';
  if (/不可臆造|不得编造|禁止臆造/.test(key)) return '不可臆造';
  if (/触发词|关键词/.test(key)) return '触发词';
  return key;
}

export function buildCharacterIdentityRows(
  entry: 智库条目,
  meta: 智库软结构标签,
  identityMap: Map<string, string>,
): CharacterIdentityRow[] {
  const get = (key: string) => identityMap.get(key) || undefined;
  const roleName = meta.角色名 || entry.关联角色ID || 获取智库人物名(entry);
  const roleId = get('角色ID') ?? getTagValue(entry, ['角色ID']);
  const organization = get('所属') ?? getTagValue(entry, ['所属', '组织', '阵营', '归属']);
  const appearance = (get('外貌') ?? get('存在形态') ?? entry.外貌锚点) || undefined;
  return [
    { label: '角色ID', value: roleId, missing: !roleId },
    { label: '名称', value: get('名称') ?? roleName ?? entry.标题, missing: !get('名称') && !roleName },
    { label: '别名 / 称呼', value: get('别名'), missing: !get('别名') },
    { label: '性别 / 性别表达', value: get('性别'), missing: !get('性别') },
    { label: '年龄状态', value: get('年龄状态'), missing: !get('年龄状态') },
    { label: '外貌', value: appearance, missing: !appearance, wide: true },
    { label: '形态', value: get('形态') ?? meta.形态, missing: !get('形态') && !meta.形态 },
    { label: '所属 / 组织', value: organization, missing: !organization },
    { label: '出身', value: get('出身'), missing: !get('出身') },
    { label: '身份 / 职务', value: get('身份'), missing: !get('身份') },
    { label: '当前信息域', value: get('当前信息域') ?? '按当前剧情阶段与玩家已知事实执行', missing: false },
  ];
}

export function buildCharacterAnchorRows(entry: 智库条目): AnchorRow[] {
  return [
    { label: '外貌', value: entry.外貌锚点 ?? '' },
    { label: '性格', value: entry.性格锚点 ?? '' },
    { label: '说话方式', value: entry.说话方式 ?? '' },
    { label: '行为习惯', value: entry.行为习惯 ?? '' },
    { label: '关系边界', value: entry.关系边界 ?? '' },
    { label: '禁止误写', value: entry.禁止误写 ?? '' },
  ].filter((row) => row.value.trim());
}

export function buildCharacterKeywordBuckets(entry: 智库条目, identityMap: Map<string, string>): KeywordBuckets {
  const keywords = dedupeTextList(entry.关键词);
  const identityTriggers = dedupeTextList([
    ...获取智库核心触发词(entry),
    ...splitKeywordText(identityMap.get('触发词') ?? ''),
  ]);
  const softTags = keywords.filter((keyword) => Boolean(parseCharacterTag(keyword)));
  const supplementalTerms = keywords.filter((keyword) => !parseCharacterTag(keyword) && !identityTriggers.includes(keyword));
  return {
    triggerTerms: identityTriggers,
    softTags,
    supplementalTerms,
    total: keywords.length,
  };
}

export function parseCharacterGateCards(raw: string): CharacterGateCardData[] {
  const cards = parseMarkdownSubsections(raw);
  return cards.map((section) => {
    const fields = parseCharacterIdentityFields(section.body);
    const statusFromTitle = section.title.match(/^(未解锁|已解锁|默认可用|可预热|只读|手动启用|剧情显式触发|边界提醒)[:：]\s*(.+)$/u);
    const status = fields.get('解锁状态') || statusFromTitle?.[1] || '未标注';
    const title = statusFromTitle?.[2]?.trim() || section.title;
    const type = fields.get('关系类型') || fields.get('类型') || '门禁资料';
    const spoiler = fields.get('剧透等级') || '';
    const condition = fields.get('标准解锁') || fields.get('标准解锁条件') || fields.get('解锁条件') || fields.get('首次可用剧情段') || '';
    const defaultAvailable = fields.get('默认可用') || '';
    const defaultHandling = fields.get('默认处理') || '';
    const usage = fields.get('使用方式') || '';
    const activation = fields.get('启用方式') || fields.get('触发方式') || '';
    const manifestation = fields.get('显现机制') || fields.get('显现方式') || '';
    const expansion = fields.get('展开条件') || fields.get('展开后使用') || '';
    const triggeredInjection = fields.get('触发后注入') || fields.get('启用后注入') || '';
    const knowledgeBoundary = fields.get('知情边界') || '';
    const rollbackRule = fields.get('回落规则') || '';
    const appearanceRule = fields.get('外貌规则') || '';
    const personalityRule = fields.get('人格规则') || '';
    const inheritance = fields.get('继承规则') || '';
    const memoryRule = fields.get('记忆规则') || fields.get('记忆连续性') || '';
    const earlyBoundary = fields.get('提前启用边界') || fields.get('提前触发边界') || '';
    const gate = fields.get('门禁') || extractLineValue(section.body, '门禁') || '';
    const preview = extractLineValue(section.body, '允许预热') || '';
    const forbidden = fields.get('禁止') || extractLineValue(section.body, '禁止') || '';
    const locked = /未解锁|只读|边界提醒|门禁|重大/.test([status, spoiler, section.body].join(' '));
    const injection = fields.get('当前注入') || fields.get('注入方式') || (locked ? '仅注入边界提醒，不注入完整内容' : '允许按当前剧情完整注入');
    return {
      title, status, type, spoiler, condition, defaultAvailable, defaultHandling, usage,
      activation, manifestation, expansion, triggeredInjection, knowledgeBoundary, rollbackRule,
      appearanceRule, personalityRule, inheritance, memoryRule, earlyBoundary, preview, gate,
      forbidden, locked, injection,
    };
  });
}

export function buildInjectedPreview(anchorRows: AnchorRow[], scope: string[]): string {
  const anchors = anchorRows.map((row) => row.label).join('、') || '暂无表现锚点';
  const scopeText = scope.length ? `范围：${scope.slice(0, 4).join(' / ')}` : '范围未标注';
  return `${anchors}。${scopeText}`;
}

export function buildForbiddenIdentityText(entry: 智库条目, missing: string[]): string {
  const base = entry.禁止误写?.trim() || '不得编造未公开身份、真实年龄、过去真相或未解锁形态。';
  return missing.length ? `${base} 当前身份缺口：${missing.join('、')}。` : base;
}

function splitKeywordText(text: string): string[] {
  return text.split(/[,，、;；\n]/u).map((item) => item.trim()).filter(Boolean);
}

function dedupeTextList(items: string[]): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean)));
}

function extractLineValue(raw: string, label: string): string {
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim().replace(/^[-*]\s*/, '');
    const match = trimmed.match(/^([^:：]+)[:：]\s*(.+)$/u);
    if (match && match[1].includes(label)) return match[2].trim();
  }
  return '';
}

// ============ ViewModel ============
export function buildCharacterProfileViewModel(entry: 智库条目): CharacterProfileViewModel {
  const meta = 解析智库软结构标签(entry);
  const sections = parseZhikuMarkdownSections(entry.原文);
  const identity = sections.find((s) => /基础|身份|识别/.test(s.title));
  const facts = sections.find((s) => /常驻|事实/.test(s.title));
  const story = sections.find((s) => /角色故事|故事层|经历脉络/.test(s.title));
  const corpus = sections.find((s) => s.title.includes('语料'));
  const ability = sections.find((s) => /能力|职责/.test(s.title));
  const gates = findCharacterGateSection(sections);
  const injection = sections.find((s) => /注入/.test(s.title));

  const scope = meta.使用范围.length ? meta.使用范围 : entry.使用范围 ?? [];
  const identityMap = parseCharacterIdentityFields(identity?.body ?? '');
  const gateCards = parseCharacterGateCards(gates?.body ?? '');
  const corpusGroups = parseMarkdownSubsections(corpus?.body ?? '');
  const storyGroups = parseMarkdownSubsections(story?.body ?? '');
  const identityRows = buildCharacterIdentityRows(entry, meta, identityMap);
  const identityMissing = identityRows.filter((r) => r.missing).map((r) => r.label);
  const anchorRows = buildCharacterAnchorRows(entry);
  const keywordBuckets = buildCharacterKeywordBuckets(entry, identityMap);

  const healthItems: HealthItem[] = [
    { label: '身份完整', value: `${identityRows.length - identityMissing.length}/${identityRows.length}` },
    { label: '表现锚点', value: `${anchorRows.length}/6` },
    { label: '故事段', value: String(storyGroups.length || (story ? 1 : 0)) },
    { label: '语料组', value: String(corpusGroups.length || (corpus ? 1 : 0)) },
    { label: '门禁卡', value: String(gateCards.length) },
    { label: '关键词触发', value: `${keywordBuckets.triggerTerms.length}/${keywordBuckets.total}` },
  ];
  const keyTags = [
    meta.资料类型 || entry.资料类型 || '角色档案',
    meta.解锁状态 || entry.解锁状态 || '未标注解锁',
    meta.剧透等级 ? `剧透:${meta.剧透等级}` : '',
    ...scope.slice(0, 3),
  ].filter(Boolean);
  const profileSummary = entry.摘要.trim() || facts?.body.split('\n').find((l) => l.trim()) || '角色档案';
  const sectionTabs: SectionTab[] = [
    { key: 'identity', label: '身份', available: true },
    { key: 'health', label: '健康度', available: true },
    { key: 'facts', label: '事实', available: Boolean(facts) },
    { key: 'story', label: '故事', available: Boolean(story) },
    { key: 'anchors', label: '锚点', available: anchorRows.length > 0 },
    { key: 'corpus', label: '语料', available: Boolean(corpus) },
    { key: 'ability', label: '能力', available: Boolean(ability) },
    { key: 'gates', label: '门禁', available: Boolean(gates) },
    { key: 'injection', label: '注入', available: true },
  ];

  return {
    meta, identityRows, identityMissing, anchorRows, keywordBuckets, gateCards,
    healthItems, keyTags, profileSummary, sectionTabs,
    factsBody: facts?.body, storyBody: story?.body, storyGroups,
    corpusBody: corpus?.body, corpusGroups, abilityBody: ability?.body,
    injectionBody: injection?.body,
    forbiddenIdentityText: buildForbiddenIdentityText(entry, identityMissing),
    injectedPreview: buildInjectedPreview(anchorRows, scope),
    lockedGateTitles: gateCards.filter((c) => c.locked).map((c) => c.title),
  };
}
