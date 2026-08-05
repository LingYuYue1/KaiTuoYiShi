import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  ArchiveBrowser,
  type ZhikuArchiveItem,
} from '../components/features/ZhikuV3/ArchiveBrowser';
import {
  ZHIKU_CATEGORIES,
  type ZhikuCategoryId,
} from '../components/features/ZhikuV3/types';
import type { 智库条目 } from '../models/zhiku';
import { 获取智库核心触发词 } from '../models/zhiku';
import { buildZhikuEntryInjectionPreview } from '../services/zhikuRetrieval';
import locationCore from '../public/zhiku-presets/location-core.json';
import termCore from '../public/zhiku-presets/term-core.json';
import pathsCore from '../public/zhiku-presets/paths-core.json';
import aeonsCore from '../public/zhiku-presets/aeons-core.json';
import worldviewCore from '../public/zhiku-presets/worldview-core.json';
import xianzhouHistory from '../public/zhiku-presets/xianzhou-history.json';

type ReferenceEntry = Pick<智库条目, '标题' | '分类' | '摘要' | '原文' | '关键词'>
  & Partial<智库条目>;

const asEntries = (entries: unknown): ReferenceEntry[] => entries as ReferenceEntry[];
const plainKeyword = (keyword: string): boolean => !/^[^：:]{1,16}[：:]/u.test(keyword);

const getCategory = (id: ZhikuCategoryId, count: number) => ({
  ...ZHIKU_CATEGORIES.find((category) => category.id === id)!,
  countLabel: String(count),
});

const getBrowseKeywords = (entry: 智库条目): string[] => {
  const coreKeywords = 获取智库核心触发词(entry);
  if (coreKeywords.length) return coreKeywords;
  return entry.关键词.filter(plainKeyword).slice(0, 14);
};

const toArchiveItems = (
  entries: ReferenceEntry[],
  categoryId: ZhikuCategoryId,
): ZhikuArchiveItem[] => {
  const category = getCategory(categoryId, entries.length);
  return entries
    .map((entry, index) => {
      const normalizedEntry = {
        ...entry,
        id: entry.id ?? `zhiku-v3-${categoryId}-${index + 1}`,
        关联条目ID: entry.关联条目ID ?? [],
        重要度: entry.重要度 ?? 3,
        可用于联动: entry.可用于联动 ?? true,
        builtin: entry.builtin ?? true,
        createdAt: entry.createdAt ?? 0,
        updatedAt: entry.updatedAt ?? 0,
      } satisfies 智库条目;
      return {
        id: normalizedEntry.id,
        title: normalizedEntry.标题,
        subtitle: category.label,
        meta: normalizedEntry.资料类型 ?? `${category.label}资料`,
        body: normalizedEntry.原文,
        triggerKeywords: getBrowseKeywords(normalizedEntry),
        injectionPreview: buildZhikuEntryInjectionPreview(normalizedEntry),
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));
};

const locationItems = toArchiveItems([
  ...asEntries(locationCore.entries),
  ...asEntries(worldviewCore.entries).filter((entry) => entry.分类 === 'location'),
], 'location');

const factionItems = toArchiveItems([
  ...asEntries(termCore.entries).filter((entry) => entry.分类 === 'faction'),
  ...asEntries(worldviewCore.entries).filter((entry) => entry.分类 === 'faction'),
], 'faction');

const eventItems = toArchiveItems(asEntries(xianzhouHistory.entries), 'event');
const aeonItems = toArchiveItems(asEntries(aeonsCore.entries), 'aeon');
const pathItems = toArchiveItems(asEntries(pathsCore.entries), 'path');
const termItems = toArchiveItems(
  asEntries(termCore.entries).filter((entry) => entry.分类 === 'term'),
  'term',
);
const enemyItems: ZhikuArchiveItem[] = [];

const meta = {
  title: '开拓轶事/智库 V3/其他二级页面',
  component: ArchiveBrowser,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    category: getCategory('location', locationItems.length),
    items: locationItems,
    initialItemId: locationItems[0]?.id,
    onBack: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ArchiveBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 地点最终页: Story = {};

export const 派系最终页: Story = {
  args: {
    category: getCategory('faction', factionItems.length),
    items: factionItems,
    initialItemId: factionItems[0]?.id,
  },
};

export const 事件最终页: Story = {
  args: {
    category: getCategory('event', eventItems.length),
    items: eventItems,
    initialItemId: eventItems[0]?.id,
  },
};

export const 星神最终页: Story = {
  args: {
    category: getCategory('aeon', aeonItems.length),
    items: aeonItems,
    initialItemId: aeonItems[0]?.id,
  },
};

export const 命途最终页: Story = {
  args: {
    category: getCategory('path', pathItems.length),
    items: pathItems,
    initialItemId: pathItems[0]?.id,
  },
};

export const 专有名词最终页: Story = {
  args: {
    category: getCategory('term', termItems.length),
    items: termItems,
    initialItemId: termItems[0]?.id,
  },
};

export const 敌对生物空状态: Story = {
  args: {
    category: getCategory('enemy', 0),
    items: enemyItems,
    initialItemId: undefined,
  },
};
