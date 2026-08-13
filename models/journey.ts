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
export type 开局来源 = 'official_preset' | 'free' | 'workshop';
export type 自由开局地点来源 = 'existing' | 'custom';

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
  | 'harmony'
  | 'trailblaze'
  | 'propagation'
  | 'voracity'
  | 'enigmata'
  | 'equilibrium'
  | 'order'
  | 'finality'
  | 'beauty'
  | 'permanence';

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
  officialPresetId?: string;
}

export interface 开局地区 {
  id: string;
  name: string;
  description: string;
  defaultLocationHint: string;
}

export interface 开局章节锚点 {
  id: string;
  regionId: string;
  name: string;
  summary: string;
  /** 原作开拓任务章节名，用于 UI 标注和提示词锚定。 */
  officialChapterName?: string;
  /** 在该原作章节内的相对阶段，例如“前段”“中后段”“决战前”。 */
  officialChapterPhase?: string;
  /** 选择该锚点时，之前章节如何处理：只作既成背景，不进入正文推进队列。 */
  priorStoryState?: string;
  referenceDate?: string;
  referenceTime?: string;
  defaultLocationHint?: string;
  keyNpcs: string[];
  loreKeywords: string[];
  openingPressure: string[];
}

export interface 官方开局预设 {
  id: string;
  source: 'official_preset';
  regionId: string;
  regionName: string;
  chapterId: string;
  chapterName: string;
  title: string;
  summary: string;
  referenceDate?: string;
  referenceTime?: string;
  defaultLocationHint?: string;
  keyNpcs: string[];
  loreKeywords: string[];
  openingPressure: string[];
  recommendedEntryAngles: string[];
}

export interface 自由开局写作问题 {
  id: string;
  title: string;
  description: string;
  examples: string[];
}

export interface 地区自由开局引导 {
  regionId: string;
  overview: string;
  identityHints: string[];
  entryAngles: string[];
  relationshipHints: string[];
  pacingHints: string[];
  cautionNotes: string[];
  sampleTexts: string[];
}

export interface 创意工坊开局模板字段 {
  id: string;
  label: string;
  placeholder: string;
  required?: boolean;
  multiline?: boolean;
}

export interface 创意工坊开局模板 {
  id: string;
  source: 'workshop';
  title: string;
  author?: string;
  version: string;
  regionId: string;
  chapterId: string;
  summary: string;
  defaultLocationHint?: string;
  keyNpcs: string[];
  loreKeywords: string[];
  openingPressure: string[];
  tags: string[];
  playerEntryTemplate: string;
  editableFields: 创意工坊开局模板字段[];
}

export interface 创意工坊开局模板包 {
  schema: 'kaituo-opening-workshop-pack';
  version: string;
  title: string;
  author?: string;
  description?: string;
  tags: string[];
  templates: 创意工坊开局模板[];
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
