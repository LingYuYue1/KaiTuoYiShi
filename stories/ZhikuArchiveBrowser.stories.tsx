import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import {
  ArchiveBrowser,
  type ZhikuArchiveItem,
} from '../components/features/ZhikuV3/ArchiveBrowser';
import { ZHIKU_CATEGORIES } from '../components/features/ZhikuV3/types';
import { getDefaultBuiltinAvatar } from '../data/builtinAvatars';
import type { 智库条目 } from '../models/zhiku';
import { 获取智库核心触发词 } from '../models/zhiku';
import { buildZhikuEntryInjectionPreview } from '../services/zhikuRetrieval';
import coreCharacters from '../public/zhiku-presets/character-rebuild-core.json';
import hertaCharacters from '../public/zhiku-presets/herta-station-character-rebuild.json';
import belobogCharacters from '../public/zhiku-presets/belobog-character-rebuild.json';
import luofuCharacters from '../public/zhiku-presets/xianzhou-luofu-character-rebuild.json';

const avatarOwnerName = (title: string): string => title === '瓦尔特·杨' ? '瓦尔特' : title;

const characterItems: ZhikuArchiveItem[] = [
  ...(coreCharacters.entries as unknown as 智库条目[]),
  ...(hertaCharacters.entries as unknown as 智库条目[]),
  ...(belobogCharacters.entries as unknown as 智库条目[]),
  ...(luofuCharacters.entries as unknown as 智库条目[]),
]
  .map((entry) => ({
    id: entry.id,
    title: entry.标题,
    subtitle: '人物档案',
    meta: entry.资料类型 ?? '人物档案包',
    body: entry.原文,
    triggerKeywords: 获取智库核心触发词(entry),
    injectionPreview: buildZhikuEntryInjectionPreview(entry),
    avatarSrc: getDefaultBuiltinAvatar(avatarOwnerName(entry.标题)),
  }))
  .sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'));

const characterCategory = {
  ...ZHIKU_CATEGORIES.find((category) => category.id === 'character')!,
  countLabel: String(characterItems.length),
};

const meta = {
  title: '开拓轶事/智库 V3/二级页面',
  component: ArchiveBrowser,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    category: characterCategory,
    items: characterItems,
    initialItemId: 'JS-002',
    onBack: fn(),
    onClose: fn(),
  },
} satisfies Meta<typeof ArchiveBrowser>;

export default meta;
type Story = StoryObj<typeof meta>;

export const 人物最终页: Story = {};

export const 减少动画: Story = {
  args: { reducedMotion: true },
};
