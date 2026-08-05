import type { 智库系统, 智库条目 } from '@/models/zhiku';
import {
  isRetiredZhikuCategory,
  获取智库条目身份ID,
  归一化智库系统,
  智库条目注入内容完整,
} from '@/models/zhiku';
import {
  ZHIKU_CUSTOM_SCHEMA_VERSION,
  获取下一个自制智库序号,
  迁移自制智库条目,
} from './zhikuCustomGovernance';
import { ZHIKU_BUNDLED_IDENTITY_REGISTRY, resolveBundledZhikuIdentity } from './zhikuIdentityRegistry';

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

export const ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY = 'zhikuCharacterRebuildMigrationAt';
export const ZHIKU_CHARACTER_REBUILD_ENTRY_ID_PREFIX = 'zhiku_character_rebuild_';
export const ZHIKU_CHARACTER_EXPANSION_ENTRY_ID_PREFIX = 'zhiku_character_expansion_';
export const RETIRED_V1_CHARACTER_ENTRY_ID_PREFIXES = [
  'zhiku_amphoreus_characters_',
  'zhiku_express_characters_',
  'zhiku_express_support_characters_',
  'zhiku_faction_characters_',
  'zhiku_genius_society_characters_',
  'zhiku_herta_station_characters_',
  'zhiku_jarilo_vi_characters_',
  'zhiku_penacony_characters_',
  'zhiku_xianzhou_alliance_characters_',
  'zhiku_xianzhou_luofu_characters_',
] as const;

export const bundledZhikuPresets: BundledZhikuPreset[] = [
  {
    id: 'zhiku_character_rebuild_core',
    title: '人物重建·星穹列车角色档案',
    description: '星穹列车角色重构预设：当前包含星、穹、三月七、丹恒、瓦尔特·杨、姬子与帕姆。星与穹的命途阶段属于同一主体能力路线，不拆分形态；三月七常态 / 巡猎 / 长夜月、丹恒常态 / 饮月 / 腾荒与姬子常态 / 启行均按同一人物主体下的完整独立注入资料维护，其中长夜月（兼容别名“长月夜”）可按本作设定作为三月七体内的另一人格提前显现，完整外显与后期能力继续服从剧情边界。语料只作口吻参考，禁止照抄或原句搬运。',
    path: '/zhiku-presets/character-rebuild-core.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_stellaron_hunters_character_rebuild',
    title: '人物重建·星核猎手角色档案',
    description: '星核猎手角色重构预设：维护卡芙卡、刃、银狼、流萤与艾利欧；刃 / 千冶•刃与银狼 / 银狼LV.999按同一人物主体下的完整独立形态资料维护，流萤与萨姆继续作为驾驶者与机甲保留在同一资料中。',
    path: '/zhiku-presets/stellaron-hunters-character-rebuild.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_herta_station_character_rebuild',
    title: '人物重建·黑塔空间站角色档案',
    description: '黑塔空间站角色重构预设：以一个角色一个档案包的方式维护黑塔、艾丝妲与阿兰。档案内部承载常驻事实、角色故事、表现锚点、语料、职责模块和阶段边界；语料只作口吻参考，禁止照抄或原句搬运。',
    path: '/zhiku-presets/herta-station-character-rebuild.json',
    updatedAt: '2026-07-30-arlan-injection-natural-profile-1',
  },
  {
    id: 'zhiku_genius_society_character_rebuild',
    title: '人物重建·天才俱乐部角色档案',
    description: '天才俱乐部角色重构预设：以一个角色一个档案包的方式维护阮·梅与螺丝咕姆，并补充斯蒂芬轻量 NPC 锚点。黑塔已归入黑塔空间站角色档案，本分组不重复塞入；档案内部承载常驻事实、角色故事、表现锚点、语料、职责模块和阶段 / 写法边界；语料只作口吻参考，禁止照抄或原句搬运。',
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
    description: '罗浮仙舟角色重构预设：维护景元、彦卿、符玄、白露、停云、灵砂、驭空、青雀、罗刹、镜流、桂乃芬、素裳、藿藿、寒鸦与雪衣；停云常态与忘归人按同一人物主体下的完整独立形态资料维护。',
    path: '/zhiku-presets/xianzhou-luofu-character-rebuild.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_penacony_character_rebuild',
    title: '人物重建·匹诺康尼角色档案',
    description: '匹诺康尼角色重构预设：以一个角色一个档案包的方式维护星期日、加拉赫、知更鸟、米沙、花火与大丽花；大丽花已按官方角色信息、四篇角色故事和 15 条非战斗语音完成一手资料核验。',
    path: '/zhiku-presets/penacony-character-rebuild.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_amphoreus_character_rebuild',
    title: '人物重建·翁法罗斯角色档案',
    description: '翁法罗斯角色重构预设：维护阿格莱雅、白厄、风堇、海瑟音、来古士、那刻夏、赛飞儿、缇宝、刻律德菈、万敌、昔涟与遐蝶；白厄常态与卡厄斯兰那按同一人物主体下的完整独立形态资料维护。',
    path: '/zhiku-presets/amphoreus-character-rebuild.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_interastral_peace_corporation_character_rebuild',
    title: '人物重建·星际和平公司角色档案',
    description: '星际和平公司角色重构预设：以一个角色一个档案包的方式维护托帕、砂金、翡翠、真珠与林登·斯科特；翡翠已完成首轮正式重建，托帕和砂金已写入首批角色详情、四段故事与语料，真珠按未实装边界写入首批整理稿，林登·斯科特按常驻身份、孤狼内核与阶段结局整理写入。语料只作口吻参考，禁止照抄或原句搬运。',
    path: '/zhiku-presets/interastral-peace-corporation-character-rebuild.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_galaxy_rangers_character_rebuild',
    title: '人物重建·巡海游侠角色档案',
    description: '巡海游侠角色重构预设：以一个角色一个档案包的方式维护波提欧与乱破；波提欧按阿尔冈-阿帕歇与主动机械改造边界整理，乱破按忍号、模因知情、主动忍道选择、官方四篇角色故事与正式语音完成首批修正。',
    path: '/zhiku-presets/galaxy-rangers-character-rebuild.json',
    updatedAt: '2026-07-21-galaxy-rangers-rappa-profile-2',
  },
  {
    id: 'zhiku_garden_of_recollection_character_rebuild',
    title: '人物重建·流光忆庭角色档案',
    description: '流光忆庭角色重构预设：当前以一个角色一个档案包的方式维护黑天鹅；按模因形态、四篇角色故事、记忆能力边界与 RP 后续自由完成修正。语料层保留米游社官方中文互动语音原句，并按剧情阶段使用。',
    path: '/zhiku-presets/garden-of-recollection-character-rebuild.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_galactic_travelers_character_rebuild',
    title: '人物重建·银河旅人角色档案',
    description: '银河旅人角色重构预设：当前以一个角色一个档案包的方式维护银枝与黄泉；分别按真实阵营、官方角色故事、能力边界、剧情门禁与 RP 后续自由完成修正。语料层保留米游社官方中文互动语音原句，并按剧情阶段使用。',
    path: '/zhiku-presets/galactic-travelers-character-rebuild.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_xianzhou_alliance_character_expansion',
    title: '人物扩展·仙舟联盟官方档案',
    description: '经官方一手资料审计后的仙舟联盟人物扩展档案，包含飞霄、椒丘、云璃、貊泽与爻光。',
    path: '/zhiku-presets/xianzhou-alliance-character-expansion.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_planarcadia_character_expansion',
    title: '人物扩展·二相乐园官方档案',
    description: '经官方一手资料审计后的二相乐园人物扩展档案，包含火花、绯英、不死途与虚照。',
    path: '/zhiku-presets/planarcadia-character-expansion.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_fate_collaboration_character_expansion',
    title: '人物扩展·Fate 联动官方档案',
    description: '经官方联动角色页与中文语音审计后的 Fate 联动人物档案，包含 Archer、Saber、远坂凛与吉尔伽美什。',
    path: '/zhiku-presets/fate-collaboration-character-expansion.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_planarcadia_enemy_expansion',
    title: '敌对生物·二相乐园首领档案',
    description: '经官方一手资料审计后的敌对首领档案，首批收录绝灭大君归寂。',
    path: '/zhiku-presets/planarcadia-enemy-expansion.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_location_core',
    title: '常用地点·细化资料',
    description: '主控舱段、观景车厢、贝洛伯格等高频场景节点的内置资料。',
    path: '/zhiku-presets/location-core.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_term_core',
    title: '关键术语·总览资料',
    description: '琥珀纪、星神、命途、组织、星核等高频术语的内置资料。',
    path: '/zhiku-presets/term-core.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_worldview_core',
    title: '星海纪闻·世界骨架',
    description: '星神、命途、组织与核心世界舞台的基础资料。',
    path: '/zhiku-presets/worldview-core.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_paths_core',
    title: '命途·哲学定义',
    description: '18条命途的哲学定义、现实对应与核心理念分析。来源：知识库迁移。',
    path: '/zhiku-presets/paths-core.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_aeons_core',
    title: '星神·完整档案',
    description: '18位星神的详细档案，含外表、经历、智库记载与本质设定。来源：知识库迁移。',
    path: '/zhiku-presets/aeons-core.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
  {
    id: 'zhiku_xianzhou_history',
    title: '仙舟联盟·编年史',
    description: '仙舟联盟从古国启航到星历8100年的完整编年史，分四段。来源：知识库迁移。',
    path: '/zhiku-presets/xianzhou-history.json',
    updatedAt: '2026-08-04-keyword-health-contraction-1',
  },
];

export const ZHIKU_BUNDLED_CATALOG_CACHE_KEY = 'zhikuBundledCatalogCacheV3';
export const ZHIKU_BUNDLED_CATALOG_VERSION = `v3:${bundledZhikuPresets
  .map((preset) => `${preset.id}@${preset.updatedAt ?? preset.id}`)
  .join('|')}`;

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

export function shouldRemoveRetiredZhikuEntry(entry: Partial<智库条目>): boolean {
  return Boolean(entry.分类 && isRetiredZhikuCategory(entry.分类));
}

export function removeRetiredZhikuEntries(entries: 智库条目[] | undefined): 智库条目[] {
  return (entries ?? []).filter((entry) => !shouldRemoveRetiredZhikuEntry(entry));
}

export function shouldRemoveLegacyZhikuCharacterEntry(entry: Partial<智库条目>, migrationAt: number): boolean {
  if (entry.分类 !== 'character') return false;
  if (isRebuiltZhikuCharacterEntry(entry)) return false;
  if (entry.builtin) return true;
  void migrationAt;
  return 获取智库条目身份ID(entry as Pick<智库条目, 'id' | '兼容ID'>)
    .some((id) => RETIRED_V1_CHARACTER_ENTRY_ID_PREFIXES.some((prefix) => id.startsWith(prefix)));
}

export function removeLegacyZhikuCharacterEntries(
  entries: 智库条目[] | undefined,
  migrationAt: number,
): 智库条目[] {
  return (entries ?? []).filter((entry) => !shouldRemoveLegacyZhikuCharacterEntry(entry, migrationAt));
}

export function isRebuiltZhikuCharacterEntry(entry: Partial<智库条目>): boolean {
  return 获取智库条目身份ID(entry as Pick<智库条目, 'id' | '兼容ID'>)
    .some((id) => (
      id.startsWith(ZHIKU_CHARACTER_REBUILD_ENTRY_ID_PREFIX)
      || id.startsWith(ZHIKU_CHARACTER_EXPANSION_ENTRY_ID_PREFIX)
    ));
}

function normalizeZhikuEntriesIndividually(entries: readonly Partial<智库条目>[]): 智库条目[] {
  return entries.flatMap((entry) => 归一化智库系统({ 条目: [entry as 智库条目] }).条目);
}

export function 升级自制智库系统(system: 智库系统 | null | undefined): 智库系统 {
  const entries = normalizeZhikuEntriesIndividually(system?.条目 ?? []);
  const reservedEntries = entries.filter((entry) => entry.builtin);
  const migrated = 迁移自制智库条目(
    entries.filter((entry) => !entry.builtin),
    reservedEntries,
  ).entries;
  let customIndex = 0;
  const nextSequence = 获取下一个自制智库序号(
    migrated,
    system?.自制资料下一个序号 ?? 0,
  );
  return 归一化智库系统({
    自制资料契约版本: ZHIKU_CUSTOM_SCHEMA_VERSION,
    自制资料下一个序号: nextSequence,
    目录版本: system?.目录版本,
    目录修订: system?.目录修订,
    条目: entries.map((entry) => (entry.builtin ? entry : migrated[customIndex++])),
  });
}

export function mergeZhikuRuntimeUnlockOverrides(
  bundledEntries: 智库条目[],
  savedEntries: 智库条目[] | undefined,
): 智库条目[] {
  const savedById = new Map<string, 智库条目>();
  for (const entry of savedEntries ?? []) {
    if (!entry.id || (!entry.运行时解锁状态 && !entry.运行时解锁备注)) continue;
    for (const id of 获取智库条目身份ID(entry)) savedById.set(id, entry);
  }
  return bundledEntries.map((entry) => {
    const saved = 获取智库条目身份ID(entry)
      .map((id) => savedById.get(id))
      .find((candidate): candidate is 智库条目 => Boolean(candidate));
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
  migrationAt: number,
): 智库系统 {
  const currentEntries = normalizeZhikuEntriesIndividually(currentSystem?.条目 ?? []);
  const customEntriesBeforeIdentityMigration = removeLegacyZhikuCharacterEntries(
    removeRetiredZhikuEntries(
      currentEntries.filter((entry) => !entry.builtin && !isBundledZhikuDuplicate(entry)),
    ),
    migrationAt,
  );
  const customEntries = 迁移自制智库条目(customEntriesBeforeIdentityMigration, bundledSystem.条目).entries;
  return 升级自制智库系统({
    自制资料契约版本: currentSystem?.自制资料契约版本,
    自制资料下一个序号: currentSystem?.自制资料下一个序号,
    目录版本: bundledSystem.目录版本 ?? ZHIKU_BUNDLED_CATALOG_VERSION,
    目录修订: Math.max(bundledSystem.目录修订 ?? 0, currentSystem?.目录修订 ?? 0),
    条目: [...mergeZhikuRuntimeUnlockOverrides(bundledSystem.条目, currentEntries), ...customEntries],
  });
}

export function hydratePersistedZhikuSystem(
  persistedSystem: 智库系统 | null | undefined,
  currentRuntimeSystem: 智库系统,
  migrationAt: number,
): 智库系统 {
  const currentBundledSystem = 归一化智库系统({
    目录版本: currentRuntimeSystem.目录版本,
    目录修订: currentRuntimeSystem.目录修订,
    条目: currentRuntimeSystem.条目.filter((entry) => entry.builtin),
  });
  return mergeBundledZhikuSystem(currentBundledSystem, persistedSystem, migrationAt);
}

export function buildPersistedZhikuSystem(system: 智库系统 | undefined): 智库系统 {
  const source = 升级自制智库系统(system);
  return 归一化智库系统({
    自制资料契约版本: source.自制资料契约版本,
    自制资料下一个序号: source.自制资料下一个序号,
    目录版本: source.目录版本,
    目录修订: source.目录修订,
    条目: source.条目
      .filter((entry) => !shouldRemoveRetiredZhikuEntry(entry))
      .filter((entry) => !entry.builtin || Boolean(entry.运行时解锁状态 || entry.运行时解锁备注))
      .map((entry) => {
        if (!entry.builtin) return entry;
        return {
          id: entry.id,
          兼容ID: entry.兼容ID,
          治理分类: entry.治理分类,
          资料所有者: entry.资料所有者,
          来源预设ID: entry.来源预设ID,
          来源文件: entry.来源文件,
          来源序号: entry.来源序号,
          资料版本: entry.资料版本,
          辅助字段版本: entry.辅助字段版本,
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

export function buildCustomOnlyZhikuFallback(
  system: 智库系统 | null | undefined,
  migrationAt: number,
): 智库系统 {
  return 升级自制智库系统({
    条目: removeLegacyZhikuCharacterEntries(
      removeRetiredZhikuEntries(
        (system?.条目 ?? [])
          .filter((entry) => !entry.builtin)
          .filter((entry) => !isBundledZhikuDuplicate(entry)),
      ),
      migrationAt,
    ),
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
      .map((entry, index) => {
        const legacyId = entry.id || `${preset.id}_${index + 1}`;
        const identity = resolveBundledZhikuIdentity(preset.id, index, entry.id, entry.标题);
        return {
          ...entry,
          ...(isLinkableMigratedLore
            ? normalizeMigratedLoreEntry(entry, preset, index)
            : {}),
          id: identity?.id ?? legacyId,
          兼容ID: identity
            ? [...new Set([...(entry.兼容ID ?? []), identity.legacyId, ...identity.compatibilityIds])]
            : entry.兼容ID,
          治理分类: identity?.category ?? entry.治理分类,
          资料所有者: 'builtin-json' as const,
          来源预设ID: preset.id,
          来源文件: identity?.sourceFile ?? preset.path.replace(/^\/zhiku-presets\//u, ''),
          来源序号: index,
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
        };
      }),
  });
}

export async function loadAllBundledZhikuPresets(options: LoadBundledZhikuOptions = {}): Promise<智库系统> {
  const settled = await Promise.allSettled(
    bundledZhikuPresets.map((preset) => loadBundledZhikuPreset(preset, options)),
  );
  const failures = settled.flatMap((result, index) => (
    result.status === 'rejected'
      ? [`${bundledZhikuPresets[index].title}：${result.reason instanceof Error ? result.reason.message : String(result.reason)}`]
      : []
  ));
  if (failures.length) {
    throw new Error(`智库内置目录加载不完整（${failures.length}/${bundledZhikuPresets.length}）：${failures.join('；')}`);
  }
  const systems = settled.flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
  const system = 归一化智库系统({
    目录版本: ZHIKU_BUNDLED_CATALOG_VERSION,
    目录修订: Date.now(),
    条目: systems.flatMap((system) => system.条目),
  });
  validateBundledZhikuCatalog(system);
  return system;
}

export function validateBundledZhikuCatalog(system: 智库系统): void {
  const sourcePresets = new Set(system.条目.map((entry) => entry.来源预设ID).filter(Boolean));
  const missingPresets = bundledZhikuPresets.filter((preset) => !sourcePresets.has(preset.id));
  const duplicateIds = system.条目
    .map((entry) => entry.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  const entriesById = new Map(system.条目.map((entry) => [entry.id, entry]));
  const bindingErrors = ZHIKU_BUNDLED_IDENTITY_REGISTRY.flatMap((identity) => {
    const entry = entriesById.get(identity.id);
    if (!entry) return [`${identity.id} 缺失`];
    const errors: string[] = [];
    if (entry.标题 !== identity.sourceTitle) errors.push(`${identity.id} 标题应为「${identity.sourceTitle}」`);
    if (entry.治理分类 !== identity.category) errors.push(`${identity.id} 治理分类应为 ${identity.category}`);
    if (entry.来源预设ID !== identity.presetId) errors.push(`${identity.id} 来源预设错配`);
    if (entry.来源文件 !== identity.sourceFile) errors.push(`${identity.id} 来源文件错配`);
    if (entry.来源序号 !== identity.sourceIndex) errors.push(`${identity.id} 来源序号错配`);
    if (!entry.builtin || entry.资料所有者 !== 'builtin-json') errors.push(`${identity.id} 内置所有权错配`);
    if (entry.分类 === 'story') errors.push(`${identity.id} 剧情档案不得进入内置运行目录`);
    if (!智库条目注入内容完整(entry)) errors.push(`${identity.id} 结构化注入内容不完整`);
    return errors;
  });
  const catalogVersionInvalid = system.目录版本 !== ZHIKU_BUNDLED_CATALOG_VERSION;
  if (
    catalogVersionInvalid
    || missingPresets.length
    || duplicateIds.length
    || bindingErrors.length
    || system.条目.length !== ZHIKU_BUNDLED_IDENTITY_REGISTRY.length
  ) {
    throw new Error([
      `智库内置目录完整性校验失败：预期 ${ZHIKU_BUNDLED_IDENTITY_REGISTRY.length} 条，实际 ${system.条目.length} 条。`,
      catalogVersionInvalid ? `目录版本应为 ${ZHIKU_BUNDLED_CATALOG_VERSION}，实际为 ${system.目录版本 ?? '空'}。` : '',
      missingPresets.length ? `缺少预设：${missingPresets.map((preset) => preset.id).join('、')}` : '',
      duplicateIds.length ? `重复 ID：${Array.from(new Set(duplicateIds)).join('、')}` : '',
      bindingErrors.length ? `身份或注入契约错误：${bindingErrors.slice(0, 8).join('；')}` : '',
    ].filter(Boolean).join(' '));
  }
}
