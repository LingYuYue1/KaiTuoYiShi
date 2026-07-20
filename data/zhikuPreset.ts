import type { 智库系统, 智库条目 } from '@/models/zhiku';
import { isRetiredZhikuCategory, 归一化智库系统 } from '@/models/zhiku';

export interface BundledZhikuPreset {
  id: string;
  title: string;
  description: string;
  path: string;
  updatedAt?: string;
}

export interface LoadBundledZhikuOptions {
  cacheBust?: string | number;
}

export const ZHIKU_CHARACTER_REBUILD_ENTRY_ID_PREFIX = 'zhiku_character_rebuild_';

export const bundledZhikuPresets: BundledZhikuPreset[] = [
  {
    id: 'zhiku_character_rebuild_core',
    title: '人物重建·星穹列车角色档案',
    description: '星穹列车角色重构预设：以一个角色一个档案包的方式维护正式角色资料，当前包含星、穹、三月七、丹恒、瓦尔特·杨、姬子与帕姆，并在档案内部承载语料、能力、命途阶段、形态 / 人格边界与过往边界。语料只作口吻参考，禁止照抄或原句搬运。',
    path: '/zhiku-presets/character-rebuild-core.json',
    updatedAt: '2026-06-10-astral-express-character-profiles-37',
  },
  {
    id: 'zhiku_stellaron_hunters_character_rebuild',
    title: '人物重建·星核猎手角色档案',
    description: '星核猎手角色重构预设：以一个角色一个档案包的方式维护卡芙卡、刃、银狼、流萤与艾利欧。档案内部承载常驻事实、角色故事、表现锚点、语料 / 暂无语料边界、能力职责和阶段 / 过往边界；有语料者只作口吻参考，禁止照抄或原句搬运，艾利欧暂不提供语料。',
    path: '/zhiku-presets/stellaron-hunters-character-rebuild.json',
    updatedAt: '2026-06-09-stellaron-hunters-character-profiles-11',
  },
  {
    id: 'zhiku_herta_station_character_rebuild',
    title: '人物重建·黑塔空间站角色档案',
    description: '黑塔空间站角色重构预设：以一个角色一个档案包的方式维护黑塔、艾丝妲与阿兰。档案内部承载常驻事实、角色故事、表现锚点、语料、职责模块和阶段边界；语料只作口吻参考，禁止照抄或原句搬运。',
    path: '/zhiku-presets/herta-station-character-rebuild.json',
    updatedAt: '2026-06-08-herta-station-character-profiles-12',
  },
  {
    id: 'zhiku_genius_society_character_rebuild',
    title: '人物重建·天才俱乐部角色档案',
    description: '天才俱乐部角色重构预设：以一个角色一个档案包的方式维护阮·梅与螺丝咕姆，并补充史蒂芬、赞达尔轻量 NPC 锚点。黑塔已归入黑塔空间站角色档案，本分组不重复塞入；档案内部承载常驻事实、角色故事、表现锚点、语料、职责模块和阶段 / 写法边界；语料只作口吻参考，禁止照抄或原句搬运。',
    path: '/zhiku-presets/genius-society-character-rebuild.json',
    updatedAt: '2026-06-10-genius-society-character-profiles-8',
  },
  {
    id: 'zhiku_intelligentsia_guild_character_rebuild',
    title: '人物重建·博识学会角色档案',
    description: '博识学会角色重构预设：以一个角色一个档案包的方式维护真理医生。档案内部承载常驻事实、角色故事、表现锚点、语料、职责模块和阶段 / 写法边界；语料只作口吻参考，禁止照抄或原句搬运。',
    path: '/zhiku-presets/intelligentsia-guild-character-rebuild.json',
    updatedAt: '2026-06-10-intelligentsia-guild-character-profiles-3',
  },
  {
    id: 'zhiku_belobog_character_rebuild',
    title: '人物重建·贝洛伯格角色档案',
    description: '贝洛伯格角色重构预设：以一个角色一个档案包的方式维护布洛妮娅、希儿、杰帕德、希露瓦、佩拉、娜塔莎、克拉拉、史瓦罗、桑博、虎克、卢卡、玲可与可可利亚。档案内部承载常驻事实、角色故事、表现锚点、语料、职责模块和阶段 / 写法边界；语料只作口吻参考，禁止照抄或原句搬运。',
    path: '/zhiku-presets/belobog-character-rebuild.json',
    updatedAt: '2026-06-10-belobog-character-profiles-15',
  },
  {
    id: 'zhiku_xianzhou_luofu_character_rebuild',
    title: '人物重建·罗浮仙舟角色档案',
    description: '罗浮仙舟角色重构预设：以一个角色一个档案包的方式维护景元、彦卿、符玄、白露、停云、灵砂、驭空、青雀、罗刹、镜流、桂乃芬、素裳、藿藿、寒鸦与雪衣；全员已完成语料层与故事层重写，保留官方叙事与对话，其他仙舟归属角色不放入本分组。',
    path: '/zhiku-presets/xianzhou-luofu-character-rebuild.json',
    updatedAt: '2026-06-18-xianzhou-luofu-story-layer-full-rewrite',
  },
  {
    id: 'zhiku_interastral_peace_corporation_character_rebuild',
    title: '人物重建·星际和平公司角色档案',
    description: '星际和平公司角色重构预设：以一个角色一个档案包的方式维护托帕、砂金与翡翠；档案内部承载常驻事实、角色故事、表现锚点、语料、职责模块和阶段/写法边界；砂金同时关联匹诺康尼资料大区，翡翠暂以剧情门禁形态存在；语料只作口吻参考，禁止照抄或原句搬运。',
    path: '/zhiku-presets/interastral-peace-corporation-character-rebuild.json',
    updatedAt: '2026-06-18-ipc-character-profiles-1',
  },
  {
    id: 'zhiku_location_core',
    title: '常用地点·细化资料',
    description: '主控舱段、观景车厢、贝洛伯格等高频场景节点的内置资料。',
    path: '/zhiku-presets/location-core.json',
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
  {
    id: 'zhiku_paths_core',
    title: '命途·哲学定义',
    description: '18条命途的哲学定义、现实对应与核心理念分析。来源：知识库迁移。',
    path: '/zhiku-presets/paths-core.json',
  },
  {
    id: 'zhiku_aeons_core',
    title: '星神·完整档案',
    description: '18位星神的详细档案，含外表、经历、智库记载与本质设定。来源：知识库迁移。',
    path: '/zhiku-presets/aeons-core.json',
  },
  {
    id: 'zhiku_xianzhou_history',
    title: '仙舟联盟·编年史',
    description: '仙舟联盟从古国启航到星历8100年的完整编年史，分四段。来源：知识库迁移。',
    path: '/zhiku-presets/xianzhou-history.json',
  },
];

const LINKABLE_MIGRATED_LORE_PRESET_IDS = new Set([
  'zhiku_paths_core',
  'zhiku_aeons_core',
  'zhiku_xianzhou_history',
]);

function normalizeMigratedLoreEntry(entry: 智库条目, preset: BundledZhikuPreset, index: number): Partial<智库条目> {
  const isXianzhouHistory = preset.id === 'zhiku_xianzhou_history';
  const isLockedXianzhouHistory = isXianzhouHistory && index >= 2;
  return {
    资料类型: entry.资料类型 || '迁移设定资料',
    解锁状态: entry.解锁状态 || (isLockedXianzhouHistory ? '未解锁' : '默认可用'),
    解锁条件: entry.解锁条件 || (isLockedXianzhouHistory ? '推进到仙舟罗浮相关剧情后由剧情编织归档解锁' : undefined),
    剧透等级: entry.剧透等级 || (preset.id === 'zhiku_paths_core' ? '中度' : '重大'),
    使用范围: entry.使用范围?.length ? entry.使用范围 : ['智库', '设定浏览', '主剧情'],
    可否主剧情注入: entry.可否主剧情注入 ?? true,
    重要度: Math.min(Number(entry.重要度) || 3, 3),
  };
}

export function shouldRemoveRetiredZhikuEntry(entry: Partial<智库条目>): boolean {
  return Boolean(entry.分类 && isRetiredZhikuCategory(entry.分类));
}

export function removeRetiredZhikuEntries(entries: 智库条目[] | undefined): 智库条目[] {
  return (entries ?? []).filter((entry) => !shouldRemoveRetiredZhikuEntry(entry));
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

export function mergeBundledZhikuSystem(
  bundledSystem: 智库系统,
  currentSystem: 智库系统 | null | undefined,
): 智库系统 {
  const current = 归一化智库系统(currentSystem);
  const customEntries = removeRetiredZhikuEntries(
    current.条目.filter((entry) => !entry.builtin),
  );
  return 归一化智库系统({
    条目: [...mergeZhikuRuntimeUnlockOverrides(bundledSystem.条目, current.条目), ...customEntries],
  });
}

export function buildPersistedZhikuSystem(system: 智库系统 | undefined): 智库系统 {
  const source = 归一化智库系统(system);
  return 归一化智库系统({
    条目: source.条目
      .filter((entry) => !shouldRemoveRetiredZhikuEntry(entry))
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

export async function loadBundledZhikuPreset(preset: BundledZhikuPreset, options: LoadBundledZhikuOptions = {}): Promise<智库系统> {
  const separator = preset.path.includes('?') ? '&' : '?';
  const cacheBust = options.cacheBust !== undefined ? `&r=${encodeURIComponent(String(options.cacheBust))}` : '';
  const res = await fetch(`${preset.path}${separator}v=${encodeURIComponent(preset.updatedAt ?? preset.id)}${cacheBust}`);
  if (!res.ok) {
    throw new Error(`加载智库预设失败：${preset.title}（${res.status}）`);
  }
  const data = await res.json() as { entries?: unknown[] };
  const entries = Array.isArray(data.entries) ? (data.entries as unknown as 智库条目[]) : [];
  const seriesOrder = bundledZhikuPresets.findIndex((item) => item.id === preset.id) + 1;
  const isLinkableMigratedLore = LINKABLE_MIGRATED_LORE_PRESET_IDS.has(preset.id);
  return 归一化智库系统({
    条目: entries
      .filter((entry) => !shouldRemoveRetiredZhikuEntry(entry))
      .filter((entry) => entry.分类 !== 'character' || isRebuiltZhikuCharacterEntry(entry))
      .map((entry, index) => ({
        ...entry,
        ...(isLinkableMigratedLore
          ? normalizeMigratedLoreEntry(entry, preset, index)
          : {}),
        id: entry.id || `${preset.id}_${index + 1}`,
        ...(entry.分类 === 'story'
          ? {
              系列ID: entry.系列ID || preset.id,
              系列标题: entry.系列标题 || preset.title,
              系列序号: entry.系列序号 || seriesOrder,
              章节序号: entry.章节序号 || index + 1,
            }
          : entry.分类 === 'character'
            ? {
                系列ID: entry.系列ID || preset.id,
                系列标题: entry.系列标题 || preset.title,
                系列序号: entry.系列序号 || seriesOrder,
              }
            : {}),
        builtin: true,
      })),
  });
}

export async function loadAllBundledZhikuPresets(options: LoadBundledZhikuOptions = {}): Promise<智库系统> {
  const systems = await Promise.all(bundledZhikuPresets.map((preset) => loadBundledZhikuPreset(preset, options)));
  return 归一化智库系统({
    条目: systems.flatMap((system) => system.条目),
  });
}

/**
 * Session-boundary hydration: re-merge bundled catalog with saved/current shells.
 * Saves only store custom entries + builtin unlock deltas; full bodies come from the catalog.
 */
export async function hydrateRuntimeZhiku(
  savedOrCurrent: 智库系统 | null | undefined,
  options: LoadBundledZhikuOptions = {},
): Promise<智库系统> {
  const bundled = await loadAllBundledZhikuPresets(options);
  return mergeBundledZhikuSystem(bundled, savedOrCurrent);
}
