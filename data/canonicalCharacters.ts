// 原著角色库。NPC 首次进入档案时会用 matchCanonical 自动识别为原著角色 → tier='companion'。
// 这里只保留高频基础识别信息；精修人设与地区扩展由智库档案负责召回。

import { ZHIKU_CANONICAL_CHARACTER_ALIASES } from './zhikuCanonicalCharacters';

export interface CanonicalCharacterDef {
  name: string;
  aliases?: string[];
  gender?: '男' | '女' | '其他';
  appearance?: string;
  personality?: string;
}

export const CANONICAL_CHARACTERS: CanonicalCharacterDef[] = [
  {
    name: '帕姆',
    aliases: ['Pom-Pom', 'Pom Pom'],
    gender: '其他',
    appearance: '列车长模样的小巧兔型助手。',
    personality: '认真负责，礼貌而有原则。',
  },
  {
    name: '三月七',
    aliases: ['三月', 'March 7th'],
    gender: '女',
    appearance: '粉发蓝眼少女，背着一张冰晶弓。',
    personality: '开朗活泼，记忆缺失但毫不在意。',
  },
  {
    name: '丹恒',
    aliases: ['Dan Heng'],
    gender: '男',
    appearance: '青发长辫青年，沉默寡言。',
    personality: '冷静理性，对自身过往讳莫如深。',
  },
  {
    name: '姬子',
    aliases: ['Himeko'],
    gender: '女',
    appearance: '红发金眸的成熟女性，列车上的咖啡常客。',
    personality: '从容大气，星穹列车的领航人。',
  },
  {
    name: '瓦尔特',
    aliases: ['瓦尔特·扬', 'Welt'],
    gender: '男',
    appearance: '黑发戴墨镜的绅士，手持权杖。',
    personality: '深思熟虑，见识极广，带着旧时代的沉重。',
  },
  {
    name: '艾丝妲',
    aliases: ['Asta'],
    gender: '女',
    appearance: '浅粉发的年轻女性，衣着得体而利落。',
    personality: '热情、果断，擅长协调与调度。',
  },
  {
    name: '阿兰',
    aliases: ['Arlan'],
    gender: '男',
    appearance: '黑发少年，常穿防卫科制服，神情安静。',
    personality: '寡言克制，把责任看得很重。',
  },
  {
    name: '黑塔',
    aliases: ['Herta', '大黑塔', 'The Herta'],
    gender: '女',
    appearance: '傀儡式天才少女形象，常见于人偶或投影。',
    personality: '高傲、好奇、兴趣导向。',
  },
  {
    name: '景元',
    aliases: ['Jing Yuan'],
    gender: '男',
    appearance: '白发长发男子，常带慵懒神态。',
    personality: '温和沉稳，善于布局。',
  },
  {
    name: '符玄',
    aliases: ['Fu Xuan'],
    gender: '女',
    appearance: '紫发少女，气质锐利。',
    personality: '强势、精于推演，讲话直接。',
  },
  {
    name: '白露',
    aliases: ['Bailu'],
    gender: '女',
    appearance: '白发龙角少女，个子娇小。',
    personality: '活泼机敏，医者气质明显。',
  },
  {
    name: '丹恒·饮月',
    aliases: ['饮月', 'Imbibitor Lunae'],
    gender: '男',
    appearance: '与丹恒相近但更具龙裔威压。',
    personality: '克制而沉静，带着旧日沉重。',
  },
  {
    name: '三月七·巡猎',
    aliases: ['巡猎三月七'],
    gender: '女',
    appearance: '三月七的另一命途形态，气质更凌厉。',
    personality: '依旧活泼，但行动更锋利果断。',
  },
  {
    name: '星',
    aliases: ['灰发少女', 'Stelle', '开拓者·星'],
    gender: '女',
    appearance: '灰发少女，外形干净利落，带着刚苏醒不久的冷白感。',
    personality: '刚苏醒时会先观察，但长期表现应直接、好奇、行动感强，熟悉同伴后会自然吐槽和接梗。',
  },
  {
    name: '穹',
    aliases: ['灰发少年', 'Caelus', '开拓者·穹'],
    gender: '男',
    appearance: '灰发少年，轮廓清爽，神情常带着刚醒来的疏离。',
    personality: '刚苏醒时偏克制观察，长期应保留直接、好奇和行动感，不应被写成空白沉默工具人。',
  },
  {
    name: '希儿',
    aliases: ['Seele'],
    gender: '女',
    appearance: '紫发暗瞳，左眼戴黑色眼罩。',
    personality: '冷峻锐利，对地下街抱有归属感。',
  },
  {
    name: '托帕',
    aliases: ['Topaz', '叶珉'],
    gender: '女',
    appearance: '棕色短发微翘，公司制服外套敞开，腰间挂次元扑满胶囊。',
    personality: '秩序中的正义感，合同信仰，对弱者有善意但总经公司逻辑翻译。',
  },
  {
    name: '砂金',
    aliases: ['Aventurine', '卡卡瓦卡'],
    gender: '男',
    appearance: '金色短发配花色西装与夸张饰物，左腕绑筹码手环，瞳色异彩。',
    personality: '赌徒哲学中的求生本能，高风险高精度，自信来自活下来的代价。',
  },
  {
    name: '翡翠',
    aliases: ['Jade'],
    gender: '女',
    appearance: '成熟女性，优雅冷峻，公司高层制服风格，佩饰低调。',
    personality: '筹码哲学中的克制，一切有价格但不必立刻交换，冷峻是信息过剩后的耐心。',
  },
];

const normalizeCanonicalName = (name: string): string => name.replace(/\s+/g, '').trim();

const ZHIKU_CANONICAL_NAMES = new Map(
  Object.entries(ZHIKU_CANONICAL_CHARACTER_ALIASES)
    .map(([canonicalName, aliases]) => [normalizeCanonicalName(canonicalName), { name: canonicalName, aliases }]),
);

const ZHIKU_CANONICAL_ALIASES = new Map(
  Object.entries(ZHIKU_CANONICAL_CHARACTER_ALIASES).flatMap(([canonicalName, aliases]) =>
    aliases.map((alias) => [normalizeCanonicalName(alias), { name: canonicalName, aliases }] as const),
  ),
);

// 名称 + alias 模糊匹配。高频角色保留完整 metadata，其余角色复用智库人物档案名称作为身份兜底。
export function matchCanonical(name: string): CanonicalCharacterDef | null {
  const target = normalizeCanonicalName(name);
  if (!target) return null;
  for (const ch of CANONICAL_CHARACTERS) {
    if (normalizeCanonicalName(ch.name) === target) return ch;
    if (ch.aliases?.some((a) => normalizeCanonicalName(a) === target)) return ch;
  }

  const zhikuCharacter = ZHIKU_CANONICAL_NAMES.get(target) ?? ZHIKU_CANONICAL_ALIASES.get(target);
  if (zhikuCharacter) return { name: zhikuCharacter.name, aliases: [...zhikuCharacter.aliases] };
  return null;
}
