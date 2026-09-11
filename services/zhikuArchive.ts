import { getDefaultBuiltinAvatar } from '@/data/builtinAvatars';
import type { 剧情编织分段, 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库条目, 智库系统 } from '@/models/zhiku';
import { 获取智库人物名列表, 获取智库显式触发词, 比较智库人物节点, isRetiredZhikuCategory } from '@/models/zhiku';
import type { 智库治理分类 } from '@/models/zhikuGovernance';
import { buildZhikuEntryInjectionPreview } from '@/services/zhikuRetrieval';

export type ZhikuArchiveCategoryId = 'character' | 'story' | 'location' | 'faction' | 'event' | 'term';

/** 可逐条翻阅的档案分类；剧情由卷宗阅读器承载，不进入条目列表。 */
export type ZhikuArchiveLoreCategoryId = Exclude<ZhikuArchiveCategoryId, 'story'>;

export type ZhikuArchiveChapterStatus = 'read' | 'current' | 'unread' | 'locked';

export interface ZhikuArchiveCategory {
  id: ZhikuArchiveCategoryId;
  label: string;
  description: string;
  count: number;
}

export interface ZhikuArchiveVariant {
  id: string;
  label: string;
  body: string;
  keywords: string[];
  injectionPreview: string;
}

export interface ZhikuArchiveItem {
  id: string;
  title: string;
  subtitle?: string;
  meta?: string;
  body: string;
  keywords: string[];
  injectionPreview: string;
  variants?: ZhikuArchiveVariant[];
  avatarSrc?: string;
  avatarAlt?: string;
}

export interface ZhikuArchiveChapter {
  id: string;
  number: string;
  title: string;
  subtitle?: string;
  category?: string;
  location?: string;
  timeLabel?: string;
  summary?: string;
  body: string;
  status: ZhikuArchiveChapterStatus;
}

export interface ZhikuArchiveVolume {
  id: string;
  number: string;
  title: string;
  subtitle?: string;
  chapters: ZhikuArchiveChapter[];
  locked?: boolean;
}

export interface ZhikuArchiveView {
  categories: ZhikuArchiveCategory[];
  itemsByCategory: Record<ZhikuArchiveLoreCategoryId, ZhikuArchiveItem[]>;
  volumes: ZhikuArchiveVolume[];
  itemCount: number;
  chapterCount: number;
}

const CATEGORY_DEFINITIONS: ReadonlyArray<Omit<ZhikuArchiveCategory, 'count'>> = [
  { id: 'character', label: '人物', description: '角色档案与形态' },
  { id: 'story', label: '剧情档案', description: '主线 / 支线 / 自制卷宗' },
  { id: 'location', label: '地点', description: '星球 / 区域 / 场所' },
  { id: 'faction', label: '派系', description: '组织 / 立场 / 动向' },
  { id: 'event', label: '事件', description: '历史 / 编年 / 关键节点' },
  { id: 'term', label: '专有名词', description: '命途 / 星神 / 术语' },
];

const LORE_CATEGORY_IDS: readonly ZhikuArchiveLoreCategoryId[] = [
  'character',
  'location',
  'faction',
  'event',
  'term',
];

const LOCKED_STATUS_PATTERN = /未解锁|锁定|只读/u;
const INTERNAL_ID_PATTERN = /^(?:[a-z][a-z0-9_-]*|[A-Z]{2}-\d{3})$/u;
const ARCHIVED_STORY_STATES = new Set(['已经历', '已跳过', '已偏离']);
const CHARACTER_VARIANT_ORDER = ['常态', '饮月', '腾荒'];

function createEmptyItems(): Record<ZhikuArchiveLoreCategoryId, ZhikuArchiveItem[]> {
  return {
    character: [],
    location: [],
    faction: [],
    event: [],
    term: [],
  };
}

export function getZhikuArchiveUnlockStatus(entry: 智库条目): string {
  return entry.运行时解锁状态?.trim() || entry.解锁状态?.trim() || '';
}

export function isZhikuArchiveEntryVisible(entry: 智库条目): boolean {
  return !LOCKED_STATUS_PATTERN.test(getZhikuArchiveUnlockStatus(entry));
}

/**
 * 治理分类到六类档案的映射：星神 / 命途并入专有名词，敌对生物并入人物，
 * 保持用户可见导航不随机器分类扩张。
 */
const GOVERNANCE_ARCHIVE_CATEGORY: Partial<Record<智库治理分类, ZhikuArchiveLoreCategoryId>> = {
  character: 'character',
  location: 'location',
  faction: 'faction',
  event: 'event',
  term: 'term',
  aeon: 'term',
  path: 'term',
  enemy: 'character',
};

export function resolveZhikuArchiveCategory(entry: 智库条目): ZhikuArchiveLoreCategoryId | null {
  if (entry.治理分类) {
    return GOVERNANCE_ARCHIVE_CATEGORY[entry.治理分类] ?? null;
  }
  if (isRetiredZhikuCategory(entry.分类)) return null;
  if (entry.分类 === 'character') return 'character';
  if (entry.分类 === 'location') return 'location';
  if (entry.分类 === 'faction') return 'faction';
  if (entry.分类 === 'event') return 'event';
  if (entry.分类 === 'term') return 'term';
  return null;
}

export function getZhikuArchiveEntryKeywords(entry: 智库条目): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of [...获取智库显式触发词(entry), ...(entry.辅助关键词 ?? []), ...entry.关键词]) {
    const keyword = raw.trim();
    if (!keyword || seen.has(keyword)) continue;
    seen.add(keyword);
    keywords.push(keyword);
  }
  return keywords;
}

function getCharacterDisplayName(entry: 智库条目): string {
  const displayName = 获取智库人物名列表(entry)
    .map((name) => name.trim())
    .find((name) => name && !INTERNAL_ID_PATTERN.test(name));
  if (displayName) return displayName;
  return entry.标题.replace(/[｜|].*$/u, '').trim() || entry.标题;
}

function getAvatarOwnerName(displayName: string): string {
  return displayName === '瓦尔特·杨' ? '瓦尔特' : displayName;
}

function toArchiveVariant(entry: 智库条目): ZhikuArchiveVariant {
  return {
    id: entry.id,
    label: entry.关联形态ID?.trim() || getCharacterDisplayName(entry),
    body: entry.原文.trim() || entry.摘要.trim(),
    keywords: getZhikuArchiveEntryKeywords(entry),
    injectionPreview: buildZhikuEntryInjectionPreview(entry),
  };
}

function compareVariants(a: ZhikuArchiveVariant, b: ZhikuArchiveVariant): number {
  const aIndex = CHARACTER_VARIANT_ORDER.indexOf(a.label);
  const bIndex = CHARACTER_VARIANT_ORDER.indexOf(b.label);
  if (aIndex >= 0 || bIndex >= 0) {
    return (aIndex < 0 ? CHARACTER_VARIANT_ORDER.length : aIndex)
      - (bIndex < 0 ? CHARACTER_VARIANT_ORDER.length : bIndex);
  }
  return a.label.localeCompare(b.label, 'zh-Hans-CN');
}

function pickPrimaryCharacterEntry(entries: 智库条目[]): 智库条目 {
  const sorted = [...entries].sort(比较智库人物节点);
  return sorted.find((entry) => entry.关联形态ID?.trim() === '常态')
    ?? sorted.find((entry) => !entry.关联形态ID?.trim())
    ?? sorted[0];
}

function toArchiveItem(
  entry: 智库条目,
  categoryId: ZhikuArchiveLoreCategoryId,
  variants?: ZhikuArchiveVariant[],
): ZhikuArchiveItem {
  const definition = CATEGORY_DEFINITIONS.find((category) => category.id === categoryId);
  const title = categoryId === 'character' ? getCharacterDisplayName(entry) : entry.标题;
  return {
    id: entry.id,
    title,
    subtitle: definition?.label ?? '智库资料',
    meta: entry.资料类型?.trim() || (entry.builtin ? '内置资料' : '自制资料'),
    body: entry.原文.trim() || entry.摘要.trim(),
    keywords: getZhikuArchiveEntryKeywords(entry),
    injectionPreview: buildZhikuEntryInjectionPreview(entry),
    ...(variants && variants.length > 1 ? { variants } : {}),
    ...(categoryId === 'character'
      ? {
          avatarSrc: getDefaultBuiltinAvatar(getAvatarOwnerName(title)),
          avatarAlt: `${title}头像`,
        }
      : {}),
  };
}

export function buildZhikuArchiveItems(system: 智库系统): Record<ZhikuArchiveLoreCategoryId, ZhikuArchiveItem[]> {
  const result = createEmptyItems();
  const characterEntriesBySubject = new Map<string, 智库条目[]>();

  for (const entry of system.条目) {
    if (!isZhikuArchiveEntryVisible(entry)) continue;
    const categoryId = resolveZhikuArchiveCategory(entry);
    if (!categoryId) continue;
    if (categoryId === 'character') {
      const subjectId = entry.关联角色ID?.trim() || getCharacterDisplayName(entry);
      const subjectEntries = characterEntriesBySubject.get(subjectId) ?? [];
      subjectEntries.push(entry);
      characterEntriesBySubject.set(subjectId, subjectEntries);
      continue;
    }
    result[categoryId].push(toArchiveItem(entry, categoryId));
  }

  for (const entries of characterEntriesBySubject.values()) {
    const variants = entries.map(toArchiveVariant).sort(compareVariants);
    result.character.push(toArchiveItem(pickPrimaryCharacterEntry(entries), 'character', variants));
  }

  for (const categoryId of LORE_CATEGORY_IDS) {
    result[categoryId].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
  }
  return result;
}

function findStorySegment(series: 剧情编织系列, chapterSequence: number): 剧情编织分段 | undefined {
  return series.分段列表.find((segment) => (
    chapterSequence >= segment.起始章序号 && chapterSequence <= segment.结束章序号
  ));
}

function isCurrentStorySegment(system: 剧情编织系统, series: 剧情编织系列, segment: 剧情编织分段): boolean {
  const isCurrentSeries = system.当前系列ID === series.id || system.当前进度?.当前系列ID === series.id;
  if (!isCurrentSeries) return false;
  return system.当前进度?.当前分段ID === segment.id
    || system.当前进度?.当前分段组号 === segment.组号
    || segment.运行状态 === '当前';
}

function getStoryChapterStatus(
  system: 剧情编织系统,
  series: 剧情编织系列,
  chapterSequence: number,
  body: string,
): ZhikuArchiveChapterStatus {
  if (!body.trim()) return 'locked';
  const segment = findStorySegment(series, chapterSequence);
  if (!segment) return 'unread';
  if (isCurrentStorySegment(system, series, segment)) return 'current';
  if (ARCHIVED_STORY_STATES.has(segment.运行状态)) return 'read';
  return 'unread';
}

function getStorySeriesCategoryLabel(series: 剧情编织系列): string {
  if (series.来源类型 === 'custom') return '自制剧情';
  const scope = [series.作品名, series.标题, series.来源文件名].filter(Boolean).join(' ');
  return /支线/u.test(scope) ? '支线档案' : '开拓主线';
}

function getStoryTimeLabel(segment: 剧情编织分段 | undefined): string | undefined {
  if (!segment) return undefined;
  const bounds = [segment.时间线起点, segment.时间线终点].map((item) => item.trim()).filter(Boolean);
  return bounds.length ? bounds.join(' - ') : undefined;
}

function toStoryArchiveChapter(
  system: 剧情编织系统,
  series: 剧情编织系列,
  chapterIndex: number,
): ZhikuArchiveChapter {
  const chapter = series.章节列表[chapterIndex];
  const sequence = Number.isFinite(chapter.序号) ? chapter.序号 : chapterIndex + 1;
  const segment = findStorySegment(series, sequence);
  return {
    id: chapter.id,
    number: `第 ${sequence} 章`,
    title: chapter.标题,
    subtitle: segment && segment.标题 !== chapter.标题 ? segment.标题 : undefined,
    category: getStorySeriesCategoryLabel(series),
    location: segment?.涉及地点.find(Boolean),
    timeLabel: getStoryTimeLabel(segment),
    summary: segment?.本段概括.trim() || segment?.原文摘要.trim() || undefined,
    body: chapter.内容,
    status: getStoryChapterStatus(system, series, sequence, chapter.内容),
  };
}

function toStoryArchiveVolume(
  system: 剧情编织系统,
  series: 剧情编织系列,
): ZhikuArchiveVolume {
  const chapters = series.章节列表.map((_, chapterIndex) => (
    toStoryArchiveChapter(system, series, chapterIndex)
  ));
  return {
    id: series.id,
    number: '',
    title: series.作品名.trim() || series.标题.trim() || '未命名剧情卷宗',
    subtitle: `${getStorySeriesCategoryLabel(series)} · ${chapters.length} 个章节`,
    chapters,
    locked: chapters.length === 0,
  };
}

function buildZhikuStoryVolumes(system: 智库系统 | undefined): ZhikuArchiveVolume[] {
  if (!system) return [];
  const groups = new Map<string, { title: string; entries: 智库条目[] }>();
  for (const entry of system.条目) {
    if (entry.分类 !== 'story' || !isZhikuArchiveEntryVisible(entry)) continue;
    const seriesId = entry.系列ID?.trim() || entry.系列标题?.trim() || '自制剧情归档';
    const group = groups.get(seriesId) ?? {
      title: entry.系列标题?.trim() || entry.标题,
      entries: [],
    };
    group.entries.push(entry);
    groups.set(seriesId, group);
  }

  return Array.from(groups.entries()).map(([seriesId, group]) => {
    const entries = [...group.entries].sort((a, b) => (
      (a.章节序号 ?? Number.MAX_SAFE_INTEGER) - (b.章节序号 ?? Number.MAX_SAFE_INTEGER)
      || a.updatedAt - b.updatedAt
    ));
    const chapters = entries.map((entry, index): ZhikuArchiveChapter => {
      const body = entry.原文.trim() || entry.摘要.trim();
      const sequence = entry.章节序号 ?? index + 1;
      return {
        id: entry.id,
        number: `第 ${sequence} 章`,
        title: entry.标题,
        subtitle: entry.资料类型?.trim() || undefined,
        category: '自制剧情',
        summary: entry.摘要.trim() || undefined,
        body,
        status: body ? 'unread' : 'locked',
      };
    });
    return {
      id: `zhiku-story:${seriesId}`,
      number: '',
      title: group.title,
      subtitle: `自制剧情 · ${chapters.length} 个章节`,
      chapters,
      locked: chapters.length === 0,
    };
  });
}

export function buildStoryArchiveVolumes(
  storySystem: 剧情编织系统,
  zhikuSystem?: 智库系统,
): ZhikuArchiveVolume[] {
  const volumes = storySystem.系列列表.map((series) => toStoryArchiveVolume(storySystem, series));
  const customVolumes = buildZhikuStoryVolumes(zhikuSystem);
  return [...volumes, ...customVolumes].map((volume, index) => ({
    ...volume,
    number: `卷宗 ${String(index + 1).padStart(2, '0')}`,
  }));
}

export function buildZhikuArchiveView(
  zhikuSystem: 智库系统,
  storySystem: 剧情编织系统,
): ZhikuArchiveView {
  const itemsByCategory = buildZhikuArchiveItems(zhikuSystem);
  const volumes = buildStoryArchiveVolumes(storySystem, zhikuSystem);
  const chapterCount = volumes.reduce((total, volume) => total + volume.chapters.length, 0);
  const itemCount = LORE_CATEGORY_IDS.reduce((total, id) => total + itemsByCategory[id].length, 0);
  const categories = CATEGORY_DEFINITIONS.map((category) => ({
    ...category,
    count: category.id === 'story' ? volumes.length : itemsByCategory[category.id].length,
  }));
  return {
    categories,
    itemsByCategory,
    volumes,
    itemCount,
    chapterCount,
  };
}

export function isEmptyZhikuArchiveView(view: ZhikuArchiveView): boolean {
  return view.itemCount === 0 && view.chapterCount === 0;
}
