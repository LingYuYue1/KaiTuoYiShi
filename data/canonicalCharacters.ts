// 原著角色库（v1 最小集合）。
// 在 NPC 首次进入档案时用 matchCanonical 自动识别为原著角色 → tier='companion'。
// v2+ 会扩充到星穹列车、仙舟、IPC、天才俱乐部等成员；当前只放第一阶段（登上列车前后）
// 玩家最有可能遭遇的几个核心角色。

import type { 阵营ID } from '@/models/journey';

export interface CanonicalCharacterDef {
  name: string;
  aliases?: string[];
  factionId?: 阵营ID;
  appearance?: string;
  personality?: string;
}

export const CANONICAL_CHARACTERS: CanonicalCharacterDef[] = [
  {
    name: '帕姆',
    aliases: ['Pom-Pom', 'Pom Pom'],
    appearance: '列车长模样的小巧兔型助手。',
    personality: '认真负责，礼貌而有原则。',
  },
  {
    name: '三月七',
    aliases: ['三月', 'March 7th'],
    appearance: '粉发蓝眼少女，背着一张冰晶弓。',
    personality: '开朗活泼，记忆缺失但毫不在意。',
  },
  {
    name: '丹恒',
    aliases: ['Dan Heng'],
    appearance: '青发长辫青年，沉默寡言。',
    personality: '冷静理性，对自身过往讳莫如深。',
  },
  {
    name: '姬子',
    aliases: ['Himeko'],
    appearance: '红发金眸的成熟女性，列车上的咖啡常客。',
    personality: '从容大气，星穹列车的领航人。',
  },
  {
    name: '瓦尔特',
    aliases: ['瓦尔特·扬', 'Welt'],
    appearance: '黑发戴墨镜的绅士，手持权杖。',
    personality: '深思熟虑，见识极广，带着旧时代的沉重。',
  },
  {
    name: '艾丝妲',
    aliases: ['Asta'],
    appearance: '浅粉发的年轻女性，衣着得体而利落。',
    personality: '热情、果断，擅长协调与调度。',
  },
  {
    name: '阿兰',
    aliases: ['Arlan'],
    appearance: '黑发少年，常穿防卫科制服，神情安静。',
    personality: '寡言克制，把责任看得很重。',
  },
  {
    name: '黑塔',
    aliases: ['Herta'],
    appearance: '傀儡式天才少女形象，常见于人偶或投影。',
    personality: '高傲、好奇、兴趣导向。',
  },
  {
    name: '景元',
    aliases: ['Jing Yuan'],
    appearance: '白发长发男子，常带慵懒神态。',
    personality: '温和沉稳，善于布局。',
  },
  {
    name: '符玄',
    aliases: ['Fu Xuan'],
    appearance: '紫发少女，气质锐利。',
    personality: '强势、精于推演，讲话直接。',
  },
  {
    name: '白露',
    aliases: ['Bailu'],
    appearance: '白发龙角少女，个子娇小。',
    personality: '活泼机敏，医者气质明显。',
  },
  {
    name: '丹恒·饮月',
    aliases: ['饮月', 'Imbibitor Lunae'],
    appearance: '与丹恒相近但更具龙裔威压。',
    personality: '克制而沉静，带着旧日沉重。',
  },
  {
    name: '三月七·巡猎',
    aliases: ['巡猎三月七'],
    appearance: '三月七的另一命途形态，气质更凌厉。',
    personality: '依旧活泼，但行动更锋利果断。',
  },
  {
    name: '星',
    aliases: ['灰发少女', 'Stelle', '开拓者·星'],
    appearance: '灰发少女，外形干净利落，带着刚苏醒不久的冷白感。',
    personality: '沉静、直接，行动里带着本能的试探与坚定。',
  },
  {
    name: '穹',
    aliases: ['灰发少年', 'Caelus', '开拓者·穹'],
    appearance: '灰发少年，轮廓清爽，神情常带着刚醒来的疏离。',
    personality: '克制、安静，习惯先观察再行动。',
  },
  {
    name: '希儿',
    aliases: ['Seele'],
    factionId: 'star_rangers',
    appearance: '紫发暗瞳，左眼戴黑色眼罩。',
    personality: '冷峻锐利，对地下街抱有归属感。',
  },
];

// 名称 + alias 模糊匹配。简单去空白比较，未来可扩展为 Levenshtein。
export function matchCanonical(name: string): CanonicalCharacterDef | null {
  const target = name.trim();
  if (!target) return null;
  for (const ch of CANONICAL_CHARACTERS) {
    if (ch.name === target) return ch;
    if (ch.aliases?.some((a) => a === target)) return ch;
  }
  return null;
}
