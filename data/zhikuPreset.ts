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
    id: 'zhiku_character_rebuild_core',
    title: '人物重建·列车组核心样本',
    description: '按主体人格、形态阶段、命途能力、剧情解锁与 OOC 风险拆分的新版人物资料样本。',
    path: '/zhiku-presets/character-rebuild-core.json',
    updatedAt: '2026-05-31-character-canon-audit-1',
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

const BUNDLED_MAIN_STORY_TITLES = new Set([
  '第一章 混乱行至深处',
  '第二章 漩涡止于中心',
  '第三章 宇宙安宁片刻',
  '第四章 阴影从未离去',
  '第四章支线 模拟宇宙',
  '第五章 旅途正在继续',
  '第一章 激「冻」人心的大冒险',
  '第二章 如果在冬夜，一群旅人',
  '第三章 永冬城之夜',
  '第四章 躲得过初一，躲不过十五',
  '第五章 捉迷藏',
  '第六章 第八条、也是最后一条规则',
  '第七章 她等待刀尖已经太久',
  '第八章 他们有多少人已掉进深渊',
  '第九章 相会在日落时分',
  '第十章 已故去的必如雪崩再来',
  '第十一章 躺在铁锈中',
  '第十二章 腐烂或燃烧',
  '第十三章 我们不擅长告别',
  '第一章 在屋外的黑暗中洗涤',
  '第二章 不可制造偶像',
  '第三章 青年近卫军',
  '第四章 兵士们默默无言',
  '第五章 星星是冰冷的玩具',
  '第六章 过去早已无路可通',
  '第七章 回归',
  '第八章 从凶险和泥泞的沼泽中',
  '第九章 时不我待，我的朋友',
  '第十章 静静的星河',
  '第一章 旅进青霄，不速之邀',
  '第二章 行遏流云，身入魔阴',
  '第三章 紫府通谒，将军定策',
  '第四章 旧影婆娑，追思错落',
  '第五章 犬迹追从，谛听狐踪',
  '第六章 迴星周旋，未卜知先',
  '第六章 长乐新朋，青鸟候风',
  '第七章极数问玄，历事穷观',
  '第八章 神木重萌，掣转天衡',
  '第九章茸客鸣呦，玉角盘虬',
  '第一章：金鼎灵树，穷途梼杌',
  '第二章上：螣蛇无穴，旧梦亡阙',
  '第二章（下）：得其雨露，安其壤土',
  '第三章：有龙矫矫，其渊渺渺',
  '第四章：仙骸成空，大劫有终',
  '第一章：安灵布奠，天清路远',
]);

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

export function isBundledZhikuDuplicate(entry: Partial<智库条目>): boolean {
  if (entry.builtin) return false;
  if (entry.分类 !== 'story') return false;

  const title = typeof entry.标题 === 'string' ? entry.标题.trim() : '';
  const source = typeof entry.来源 === 'string' ? entry.来源 : '';
  const raw = typeof entry.原文 === 'string' ? entry.原文 : '';

  if (source.includes('开拓轶事·项目内置剧情')) return true;
  if (BUNDLED_MAIN_STORY_TITLES.has(title)) return true;
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
  const isLinkableMigratedLore = LINKABLE_MIGRATED_LORE_PRESET_IDS.has(preset.id);
  return 归一化智库系统({
    条目: entries
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
