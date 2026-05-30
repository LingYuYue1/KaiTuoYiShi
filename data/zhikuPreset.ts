import type { 智库系统, 智库条目 } from '@/models/zhiku';
import { 归一化智库系统 } from '@/models/zhiku';

export interface BundledZhikuPreset {
  id: string;
  title: string;
  description: string;
  path: string;
  updatedAt?: string;
}

export const ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY = 'zhikuCharacterRebuildMigrationAt';
export const ZHIKU_CHARACTER_REBUILD_ENTRY_ID_PREFIX = 'zhiku_character_rebuild_';

export const bundledZhikuPresets: BundledZhikuPreset[] = [
  {
    id: 'zhiku_herta_station_chapter1',
    title: '今天是昨天的明天',
    description: '黑塔空间站剧情的小说化版本，从混乱开场到登上星穹列车。',
    path: '/zhiku-presets/herta-station-chapters.json',
  },
  {
    id: 'zhiku_character_rebuild_core',
    title: '人物重建·列车组核心样本',
    description: '按主体人格、形态阶段、命途能力、剧情解锁与 OOC 风险拆分的新版人物资料样本。',
    path: '/zhiku-presets/character-rebuild-core.json',
    updatedAt: '2026-05-29-trailblazer-path-split',
  },
  {
    id: 'zhiku_jarilo_vi_chapters',
    title: '于枯索的冬夜里',
    description: '雅利洛-Ⅵ与贝洛伯格主线剧情的小说化版本。',
    path: '/zhiku-presets/jarilo-vi-chapters.json',
  },
  {
    id: 'zhiku_jarilo_vi_sunrise_chapters',
    title: '于曈昽的骄阳下',
    description: '雅利洛-Ⅵ与贝洛伯格后半段主线剧情的小说化版本。',
    path: '/zhiku-presets/jarilo-vi-sunrise-chapters.json',
  },
  {
    id: 'zhiku_xianzhou_luofu_travel_chapters',
    title: '乘槎驭风仙窟游',
    description: '仙舟罗浮前段主线剧情的小说化版本，从列车改道到罗浮危局展开。',
    path: '/zhiku-presets/xianzhou-luofu-travel-chapters.json',
  },
  {
    id: 'zhiku_xianzhou_luofu_cloud_tree_chapters',
    title: '云树百丈蔽重楼',
    description: '仙舟罗浮中段主线剧情的小说化版本，从丹鼎司战场到建木与幻胧危机。',
    path: '/zhiku-presets/xianzhou-luofu-cloud-tree-chapters.json',
  },
  {
    id: 'zhiku_xianzhou_luofu_aftermath_chapters',
    title: '劫波渡尽战云收',
    description: '仙舟罗浮后段收束剧情的小说化版本，梳理战后余波、盟友身份与告别。',
    path: '/zhiku-presets/xianzhou-luofu-aftermath-chapters.json',
  },
  {
    id: 'zhiku_item_core',
    title: '物品与规则·总览资料',
    description: '光锥、遗器、奇物、星核等高频物品与规则概念的内置资料。',
    path: '/zhiku-presets/item-core.json',
  },
  {
    id: 'zhiku_item_expanded',
    title: '基础资源·扩展资料',
    description: '信用点、星琼与常用养成资源的补充资料。',
    path: '/zhiku-presets/item-expanded.json',
  },
  {
    id: 'zhiku_enemy_core',
    title: '敌对单位·总览资料',
    description: '反物质军团、末日兽、虚卒与常见敌对概念的内置资料。',
    path: '/zhiku-presets/enemy-core.json',
  },
  {
    id: 'zhiku_enemy_expanded',
    title: '敌对单位·扩展资料',
    description: '敌方指挥官、机械守卫与精英敌人的细化资料。',
    path: '/zhiku-presets/enemy-expanded.json',
  },
  {
    id: 'zhiku_npc_core',
    title: '常驻NPC·总览资料',
    description: '会在正文、手机、新闻和任务中反复出现的常驻NPC类型资料。',
    path: '/zhiku-presets/npc-core.json',
  },
  {
    id: 'zhiku_npc_expanded',
    title: '常驻NPC·扩展资料',
    description: '空间站、罗浮、贝洛伯格与匹诺康尼的常驻NPC细化类型。',
    path: '/zhiku-presets/npc-expanded.json',
  },
  {
    id: 'zhiku_location_core',
    title: '常用地点·细化资料',
    description: '主控舱段、观景车厢、贝洛伯格等高频场景节点的内置资料。',
    path: '/zhiku-presets/location-core.json',
  },
  {
    id: 'zhiku_battle_expanded',
    title: '战斗机制·扩展资料',
    description: '弱点击破、追加攻击、反击与状态异常等战斗机制资料。',
    path: '/zhiku-presets/battle-expanded.json',
  },
  {
    id: 'zhiku_term_core',
    title: '关键术语·总览资料',
    description: '琥珀纪、星神、命途、组织、星核等高频术语的内置资料。',
    path: '/zhiku-presets/term-core.json',
  },
  {
    id: 'zhiku_worldview_core',
    title: '星海纪闻·世界骨架',
    description: '星神、命途、组织与核心世界舞台的基础资料。',
    path: '/zhiku-presets/worldview-core.json',
  },
];

const BUNDLED_HERTA_STORY_TITLES = new Set([
  '第一章 混乱行至深处',
  '第二章 漩涡止于中心',
  '第三章 宇宙安宁片刻',
  '第四章 阴影从未离去',
  '第四章支线 模拟宇宙',
  '第五章 旅途正在继续',
]);

export function isBundledZhikuDuplicate(entry: Partial<智库条目>): boolean {
  if (entry.builtin) return false;
  if (entry.分类 !== 'story') return false;

  const title = typeof entry.标题 === 'string' ? entry.标题.trim() : '';
  const source = typeof entry.来源 === 'string' ? entry.来源 : '';
  const raw = typeof entry.原文 === 'string' ? entry.原文 : '';

  if (BUNDLED_HERTA_STORY_TITLES.has(title)) return true;
  if (source.includes('剧情-黑塔空间站')) return true;
  return title.includes('黑塔空间站') && raw.includes('今天是昨天的明天');
}

export function shouldRemoveLegacyZhikuCharacterEntry(entry: Partial<智库条目>, migrationAt: number): boolean {
  if (entry.分类 !== 'character') return false;
  if (isRebuiltZhikuCharacterEntry(entry)) return false;
  if (entry.builtin) return true;
  const changedAt = Math.max(Number(entry.createdAt) || 0, Number(entry.updatedAt) || 0);
  return migrationAt <= 0 || changedAt <= migrationAt;
}

export function removeLegacyZhikuCharacterEntries(
  entries: 智库条目[] | undefined,
  migrationAt: number,
): 智库条目[] {
  return (entries ?? []).filter((entry) => !shouldRemoveLegacyZhikuCharacterEntry(entry, migrationAt));
}

export function isRebuiltZhikuCharacterEntry(entry: Partial<智库条目>): boolean {
  return typeof entry.id === 'string' && entry.id.startsWith(ZHIKU_CHARACTER_REBUILD_ENTRY_ID_PREFIX);
}

export function mergeZhikuRuntimeUnlockOverrides(
  bundledEntries: 智库条目[],
  savedEntries: 智库条目[] | undefined,
): 智库条目[] {
  const savedById = new Map(
    (savedEntries ?? [])
      .filter((entry) => entry.id && (entry.运行时解锁状态 || entry.运行时解锁备注))
      .map((entry) => [entry.id, entry]),
  );
  return bundledEntries.map((entry) => {
    const saved = savedById.get(entry.id);
    if (!saved) return entry;
    return {
      ...entry,
      运行时解锁状态: saved.运行时解锁状态,
      运行时解锁备注: saved.运行时解锁备注,
    };
  });
}

export function buildPersistedZhikuSystem(system: 智库系统 | undefined): 智库系统 {
  const source = 归一化智库系统(system);
  return 归一化智库系统({
    条目: source.条目
      .filter((entry) => !entry.builtin || Boolean(entry.运行时解锁状态 || entry.运行时解锁备注))
      .map((entry) => {
        if (!entry.builtin) return entry;
        return {
          id: entry.id,
          标题: entry.标题,
          分类: entry.分类,
          摘要: '',
          原文: '',
          来源: entry.来源,
          关键词: [],
          运行时解锁状态: entry.运行时解锁状态,
          运行时解锁备注: entry.运行时解锁备注,
          关联条目ID: [],
          重要度: entry.重要度,
          可用于联动: entry.可用于联动,
          builtin: true,
          createdAt: entry.createdAt,
          updatedAt: entry.updatedAt,
        };
      }),
  });
}

export async function loadBundledZhikuPreset(preset: BundledZhikuPreset): Promise<智库系统> {
  const separator = preset.path.includes('?') ? '&' : '?';
  const res = await fetch(`${preset.path}${separator}v=${encodeURIComponent(preset.updatedAt ?? preset.id)}`);
  if (!res.ok) {
    throw new Error(`加载智库预设失败：${preset.title}（${res.status}）`);
  }
  const data = await res.json() as { entries?: unknown[] };
  const entries = Array.isArray(data.entries) ? (data.entries as unknown as 智库条目[]) : [];
  const seriesOrder = bundledZhikuPresets.findIndex((item) => item.id === preset.id) + 1;
  return 归一化智库系统({
    条目: entries
      .filter((entry) => entry.分类 !== 'character' || isRebuiltZhikuCharacterEntry(entry))
      .map((entry, index) => ({
        ...entry,
        id: entry.id || `${preset.id}_${index + 1}`,
        ...(entry.分类 === 'story'
          ? {
              系列ID: entry.系列ID || preset.id,
              系列标题: entry.系列标题 || preset.title,
              系列序号: entry.系列序号 || seriesOrder,
              章节序号: entry.章节序号 || index + 1,
            }
          : {}),
        builtin: true,
      })),
  });
}

export async function loadAllBundledZhikuPresets(): Promise<智库系统> {
  const systems = await Promise.all(bundledZhikuPresets.map((preset) => loadBundledZhikuPreset(preset)));
  return 归一化智库系统({
    条目: systems.flatMap((system) => system.条目),
  });
}
