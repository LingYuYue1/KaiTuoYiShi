// 「踏上旅途」向导相关的类型与默认值。
// 命途/能力的具体内容见 [data/journeyPresets.ts]。

// ── 难度 ──
export type 难度ID = 'easy' | 'normal' | 'hard' | 'extreme';

export interface 难度定义 {
  id: 难度ID;
  name: string;
  attributePoints: number;
  description: string;
}

// ── 剧情模式偏向 ──
export type 剧情模式 = 'normal' | 'harem' | 'romance_alt' | 'deep_single';

export interface 剧情模式定义 {
  id: 剧情模式;
  name: string;
  description: string;
}

// ── 命途 ──
export type 命途ID =
  | 'none'
  | 'hunt'
  | 'destruction'
  | 'preservation'
  | 'abundance'
  | 'remembrance'
  | 'erudition'
  | 'elation'
  | 'nihility'
  | 'harmony';

export interface 命途定义 {
  id: 命途ID;
  name: string;
  aeon: string;
  emblem: string;
  intro?: string;
  lines?: [string, string];
  blurb: string;
  description: string;
}

// ── 世界观组织 / 玩家开局背景 ──
// 这里只记录叙事身份,不维护阵营声望或加入状态变量。
export type 组织标签ID =
  | 'none'
  | 'genius_society'
  | 'company'
  | 'star_rangers';
export type 阵营ID = 组织标签ID;

export interface 阵营定义 {
  id: 阵营ID;
  name: string;
  shortName: string;
  description: string;
  openingHint: string;
}

// ── 能力预设 ──
export interface 能力预设 {
  id: string;
  name: string;
  description: string;
}

// ── 起始地点/场景 ──
export interface 起始场景 {
  id: string;
  name: string;
  description: string;
  openingHighlights?: string[];
}

// ── 角色属性 ──
export interface 六维属性 {
  力量: number;
  智慧: number;
  敏捷: number;
  体质: number;
  运气: number;
}

export function 创建空属性(): 六维属性 {
  return {
    力量: 0,
    智慧: 0,
    敏捷: 0,
    体质: 0,
    运气: 0,
  };
}

export const ATTRIBUTE_KEYS: (keyof 六维属性)[] = [
  '力量',
  '智慧',
  '敏捷',
  '体质',
  '运气',
];

export const ATTRIBUTE_LABELS: Record<keyof 六维属性, string> = {
  力量: '力量',
  智慧: '智慧',
  敏捷: '敏捷',
  体质: '体质',
  运气: '运气',
};
