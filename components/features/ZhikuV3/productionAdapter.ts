import { getDefaultBuiltinAvatar } from '@/data/builtinAvatars';
import type { 剧情编织分段, 剧情编织系列, 剧情编织系统 } from '@/models/storyWeaving';
import type { 智库条目, 智库系统 } from '@/models/zhiku';
import { 获取智库人物名列表, 获取智库显式触发词 } from '@/models/zhiku';
import { ZHIKU_CATEGORY_POLICIES, type 智库分类策略 } from '@/models/zhikuGovernance';
import { buildZhikuEntryInjectionPreview } from '@/services/zhikuRetrieval';
import type { StoryArchiveChapter, StoryArchiveChapterStatus, StoryArchiveVolume } from './StoryArchiveReader';
import type { ZhikuArchiveInjectionVariant, ZhikuArchiveItem } from './ArchiveBrowser';
import {
  ZHIKU_CATEGORIES,
  type ZhikuCategory,
  type ZhikuCategoryId,
} from './types';

export type ZhikuBrowsableCategoryId = Exclude<ZhikuCategoryId, 'story'>;

export type ZhikuArchiveItemsByCategory = Record<ZhikuBrowsableCategoryId, ZhikuArchiveItem[]>;

export interface ZhikuProductionData {
  categories: ZhikuCategory[];
  archiveItems: ZhikuArchiveItemsByCategory;
  storyVolumes: StoryArchiveVolume[];
  storyArchivePolicy: 智库分类策略;
}

const BROWSABLE_CATEGORY_IDS: ZhikuBrowsableCategoryId[] = [
  'character',
  'location',
  'faction',
  'event',
  'enemy',
  'aeon',
  'path',
  'term',
];

const INTERNAL_ID_PATTERN = /^(?:[A-Z]{2}-\d{3}|[a-z][a-z0-9_-]*)$/u;
const LOCKED_STATUS_PATTERN = /未解锁|锁定/iu;
const ARCHIVED_STORY_STATES = new Set(['已经历', '已跳过', '已偏离']);
const CHARACTER_ARCHIVE_SPECIAL_ID = 'DS-000';

function createEmptyArchiveMap(): ZhikuArchiveItemsByCategory {
  return {
    character: [],
    location: [],
    faction: [],
    event: [],
    enemy: [],
    aeon: [],
    path: [],
    term: [],
  };
}

function getEffectiveUnlockStatus(entry: 智库条目): string {
  return entry.运行时解锁状态?.trim() || entry.解锁状态?.trim() || '';
}

export function isZhikuEntryPlayerVisible(entry: 智库条目): boolean {
  return !LOCKED_STATUS_PATTERN.test(getEffectiveUnlockStatus(entry));
}

export function resolveZhikuCategory(entry: 智库条目): ZhikuBrowsableCategoryId | null {
  if (entry.id === CHARACTER_ARCHIVE_SPECIAL_ID) {
    return 'character';
  }
  if (entry.治理分类 && BROWSABLE_CATEGORY_IDS.includes(entry.治理分类 as ZhikuBrowsableCategoryId)) {
    return entry.治理分类 as ZhikuBrowsableCategoryId;
  }
  if (entry.分类 === 'character') return 'character';
  if (entry.分类 === 'location') return 'location';
  if (entry.分类 === 'faction') return 'faction';
  if (entry.分类 === 'event') return 'event';
  if (entry.分类 !== 'term') return null;
  return 'term';
}

function getCharacterDisplayName(entry: 智库条目): string {
  const displayName = 获取智库人物名列表(entry)
    .find((name) => !INTERNAL_ID_PATTERN.test(name.trim()))
    ?.trim();
  if (displayName) return displayName;
  return entry.标题.replace(/[｜|].*$/u, '').trim() || entry.标题;
}

function getAvatarOwnerName(displayName: string): string {
  return displayName === '瓦尔特·杨' ? '瓦尔特' : displayName;
}

function toInjectionVariant(entry: 智库条目): ZhikuArchiveInjectionVariant {
  return {
    id: entry.id,
    label: entry.关联形态ID?.trim() || getCharacterDisplayName(entry),
    body: entry.原文?.trim() || entry.摘要?.trim() || '',
    triggerKeywords: 获取智库显式触发词(entry),
    secondaryKeywords: entry.辅助关键词 ?? [],
    secondaryKeywordLogic: entry.辅助关键词逻辑,
    injectionPreview: buildZhikuEntryInjectionPreview(entry),
  };
}

function toArchiveItem(
  entry: 智库条目,
  categoryId: ZhikuBrowsableCategoryId,
  injectionVariants?: ZhikuArchiveInjectionVariant[],
): ZhikuArchiveItem {
  const title = categoryId === 'character' ? getCharacterDisplayName(entry) : entry.标题;
  const category = ZHIKU_CATEGORIES.find((item) => item.id === categoryId);
  return {
    id: entry.id,
    title,
    subtitle: category?.label ?? '智库资料',
    meta: entry.资料类型?.trim() || (entry.builtin ? '内置资料' : '自制资料'),
    body: entry.原文.trim() || entry.摘要.trim(),
    triggerKeywords: 获取智库显式触发词(entry),
    secondaryKeywords: entry.辅助关键词 ?? [],
    secondaryKeywordLogic: entry.辅助关键词逻辑,
    injectionPreview: buildZhikuEntryInjectionPreview(entry),
    ...(injectionVariants && injectionVariants.length > 1 ? { injectionVariants } : {}),
    ...(categoryId === 'character'
      ? {
          avatarSrc: getDefaultBuiltinAvatar(getAvatarOwnerName(title)),
          avatarAlt: `${title}头像`,
        }
      : {}),
    status: 'available',
  };
}

export function buildZhikuArchiveItems(system: 智库系统): ZhikuArchiveItemsByCategory {
  const result = createEmptyArchiveMap();
  const characterEntriesBySubject = new Map<string, 智库条目[]>();
  for (const entry of system.条目 ?? []) {
    if (!isZhikuEntryPlayerVisible(entry)) continue;
    const categoryId = resolveZhikuCategory(entry);
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
    const primaryEntry = entries.find((entry) => entry.关联形态ID?.trim() === '常态')
      ?? entries.find((entry) => !entry.关联形态ID?.trim())
      ?? entries[0];
    const variants = entries
      .map(toInjectionVariant)
      .sort((a, b) => {
        const preferredOrder = ['常态', '饮月', '腾荒'];
        const aIndex = preferredOrder.indexOf(a.label);
        const bIndex = preferredOrder.indexOf(b.label);
        if (aIndex >= 0 || bIndex >= 0) return (aIndex < 0 ? preferredOrder.length : aIndex) - (bIndex < 0 ? preferredOrder.length : bIndex);
        return a.label.localeCompare(b.label, 'zh-Hans-CN');
      });
    result.character.push(toArchiveItem(primaryEntry, 'character', variants));
  }

  for (const categoryId of BROWSABLE_CATEGORY_IDS) {
    result[categoryId].sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
  }
  return result;
}

function findStorySegment(series: 剧情编织系列, chapterSequence: number): 剧情编织分段 | undefined {
  return series.分段列表.find((segment) => (
    chapterSequence >= segment.起始章序号 && chapterSequence <= segment.结束章序号
  ));
}

function getStoryChapterStatus(
  system: 剧情编织系统,
  series: 剧情编织系列,
  chapterSequence: number,
  body: string,
): StoryArchiveChapterStatus {
  if (!body.trim()) return 'locked';
  const segment = findStorySegment(series, chapterSequence);
  if (!segment) return 'unread';
  const isCurrentSeries = system.当前系列ID === series.id || system.当前进度?.当前系列ID === series.id;
  const isCurrentSegment = system.当前进度?.当前分段ID === segment.id
    || system.当前进度?.当前分段组号 === segment.组号
    || segment.运行状态 === '当前';
  if (isCurrentSeries && isCurrentSegment) return 'current';
  if (ARCHIVED_STORY_STATES.has(segment.运行状态)) return 'read';
  return 'unread';
}

function getStoryCategoryLabel(series: 剧情编织系列): string {
  if (series.来源类型 === 'custom') return '自制剧情';
  return /支线/u.test([series.作品名, series.标题, series.来源文件名].filter(Boolean).join(' '))
    ? '支线档案'
    : '开拓主线';
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
): StoryArchiveChapter {
  const chapter = series.章节列表[chapterIndex];
  const sequence = Number.isFinite(chapter.序号) ? chapter.序号 : chapterIndex + 1;
  const segment = findStorySegment(series, sequence);
  return {
    id: chapter.id,
    number: `第 ${sequence} 章`,
    title: chapter.标题,
    subtitle: segment && segment.标题 !== chapter.标题 ? segment.标题 : undefined,
    category: getStoryCategoryLabel(series),
    location: segment?.涉及地点.find(Boolean),
    timeLabel: getStoryTimeLabel(segment),
    summary: segment?.本段概括.trim() || segment?.原文摘要.trim() || undefined,
    body: chapter.内容,
    status: getStoryChapterStatus(system, series, sequence, chapter.内容),
  };
}

export function buildStoryArchiveVolumes(system: 剧情编织系统): StoryArchiveVolume[] {
  return (system.系列列表 ?? []).map((series, index) => {
    const chapters = series.章节列表.map((_, chapterIndex) => (
      toStoryArchiveChapter(system, series, chapterIndex)
    ));
    return {
      id: series.id,
      number: `卷宗 ${String(index + 1).padStart(2, '0')}`,
      title: series.作品名.trim() || series.标题.trim() || '未命名剧情卷宗',
      subtitle: `${getStoryCategoryLabel(series)} · ${chapters.length} 个章节`,
      chapters,
      locked: chapters.length === 0,
    };
  });
}

export function buildZhikuProductionData(
  zhikuSystem: 智库系统,
  storyWeavingSystem: 剧情编织系统,
): ZhikuProductionData {
  const archiveItems = buildZhikuArchiveItems(zhikuSystem);
  const storyVolumes = buildStoryArchiveVolumes(storyWeavingSystem);
  const categories = ZHIKU_CATEGORIES.map((category) => ({
    ...category,
    countLabel: String(category.id === 'story' ? storyVolumes.length : archiveItems[category.id].length),
  }));

  return {
    categories,
    archiveItems,
    storyVolumes,
    storyArchivePolicy: ZHIKU_CATEGORY_POLICIES.story,
  };
}
