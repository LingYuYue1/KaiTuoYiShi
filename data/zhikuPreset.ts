import type { 智库系统, 智库条目 } from '@/models/zhiku';
import { 归一化智库系统 } from '@/models/zhiku';

export interface BundledZhikuPreset {
  id: string;
  title: string;
  description: string;
  path: string;
}

export const bundledZhikuPresets: BundledZhikuPreset[] = [
  {
    id: 'zhiku_herta_station_chapter1',
    title: '今天是昨天的明天',
    description: '黑塔空间站剧情的小说化版本，从混乱开场到登上星穹列车。',
    path: '/zhiku-presets/herta-station-chapters.json',
  },
  {
    id: 'zhiku_express_characters',
    title: '星穹列车·角色资料',
    description: '星穹列车主要成员的内置人物资料。',
    path: '/zhiku-presets/express-characters.json',
  },
  {
    id: 'zhiku_express_support_characters',
    title: '星穹列车补充·角色资料',
    description: '星穹列车相关人物中常被引用但需要单独强调的补充资料。',
    path: '/zhiku-presets/express-support-characters.json',
  },
  {
    id: 'zhiku_herta_station_characters',
    title: '黑塔空间站·角色资料',
    description: '黑塔空间站相关人物的内置资料。',
    path: '/zhiku-presets/herta-station-characters.json',
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
    id: 'zhiku_xianzhou_luofu_characters',
    title: '仙舟罗浮·角色资料',
    description: '仙舟罗浮相关核心人物的内置资料。',
    path: '/zhiku-presets/xianzhou-luofu-characters.json',
  },
  {
    id: 'zhiku_xianzhou_alliance_characters',
    title: '仙舟联盟·角色资料',
    description: '仙舟联盟后续高频人物与相关特殊形态的内置资料。',
    path: '/zhiku-presets/xianzhou-alliance-characters.json',
  },
  {
    id: 'zhiku_jarilo_vi_characters',
    title: '雅利洛-Ⅵ·角色资料',
    description: '雅利洛-Ⅵ与贝洛伯格相关核心人物的内置资料。',
    path: '/zhiku-presets/jarilo-vi-characters.json',
  },
  {
    id: 'zhiku_penacony_characters',
    title: '匹诺康尼·角色资料',
    description: '匹诺康尼相关核心人物的内置资料。',
    path: '/zhiku-presets/penacony-characters.json',
  },
  {
    id: 'zhiku_amphoreus_characters',
    title: '翁法罗斯·角色资料',
    description: '翁法罗斯相关核心人物与特殊形态的内置资料。',
    path: '/zhiku-presets/amphoreus-characters.json',
  },
  {
    id: 'zhiku_faction_characters',
    title: '势力相关·角色资料',
    description: '星核猎手、公司与其他高频势力相关人物的内置资料。',
    path: '/zhiku-presets/faction-characters.json',
  },
  {
    id: 'zhiku_genius_society_characters',
    title: '天才俱乐部与博识学会·角色资料',
    description: '天才俱乐部、博识学会及相关高频科研人物的内置资料。',
    path: '/zhiku-presets/genius-society-characters.json',
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

export async function loadBundledZhikuPreset(preset: BundledZhikuPreset): Promise<智库系统> {
  const res = await fetch(preset.path);
  if (!res.ok) {
    throw new Error(`加载智库预设失败：${preset.title}（${res.status}）`);
  }
  const data = await res.json() as { entries?: unknown[] };
  const entries = Array.isArray(data.entries) ? (data.entries as unknown as 智库条目[]) : [];
  const seriesOrder = bundledZhikuPresets.findIndex((item) => item.id === preset.id) + 1;
  return 归一化智库系统({
    条目: entries.map((entry, index) => ({
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
