import type { 剧情模式 } from './journey';

export type 世界书条目类型 = 'world_lore' | 'character_lore' | 'atmosphere' | 'system_rule';
export type 世界书注入方式 = 'always' | 'keyword_match';
/** @deprecated 改用 scope 字段。保留类型仅用于迁移识别。 */
export type WorldbookTurnGuard = 'first_only';

/** 条目注入场景。
 * - main: 主流程正文（除开局外）
 * - opening: 开局首回合
 * - battle: 战斗 / 判定专用 CoT（预留，目前未使用）
 * - calibration: 变量模型校准（预留，目前未使用）
 * - all: 任意场景都注入
 */
export type 世界书作用域 = 'main' | 'opening' | 'battle' | 'pathAwakening' | 'calibration' | 'all';

export const SCOPE_LABELS: Record<世界书作用域, string> = {
  main: '主流程',
  opening: '开局',
  battle: '战斗',
  pathAwakening: '命途狭间',
  calibration: '变量校准',
  all: '任意',
};

export interface 世界书条目 {
  id: string;
  title: string;
  content: string;
  type: 世界书条目类型;
  injectMode: 世界书注入方式;
  keywords: string[];
  priority: number;
  enabled: boolean;
  /** 该条目允许注入的场景；空数组等价于 ['all']（迁移期兼容）。 */
  scope: 世界书作用域[];
  /** @deprecated 已迁移到 scope，仅旧存档读入时仍可能存在；normalize 后会被移除。 */
  turnGuard?: WorldbookTurnGuard;
  createdAt: number;
  updatedAt: number;
}

export interface 世界书 {
  id: string;
  title: string;
  description: string;
  enabled: boolean;
  entries: 世界书条目[];
  /** 剧情模式门控：若非空，则仅在玩家选择的 storyMode 命中其中之一时，本书的条目才参与注入。
   *  留空 / undefined 表示对所有剧情模式都生效。用于「四种剧情模式各自一本主线书」的模式选择机制。 */
  storyModeGate?: 剧情模式[];
  createdAt: number;
  updatedAt: number;
}

export interface 世界书导出数据 {
  version: number;
  exportedAt: number;
  books: 世界书[];
}

export function 创建空世界书(partial?: Partial<世界书>): 世界书 {
  const now = Date.now();
  return {
    id: `wb_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: '新世界书',
    description: '',
    enabled: true,
    entries: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function 创建空世界书条目(partial?: Partial<世界书条目>): 世界书条目 {
  const now = Date.now();
  return {
    id: `wbe_${now}_${Math.random().toString(36).slice(2, 8)}`,
    title: '新条目',
    content: '',
    type: 'world_lore',
    injectMode: 'always',
    keywords: [],
    priority: 100,
    enabled: true,
    scope: ['main'],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export const ENTRY_TYPE_LABELS: Record<世界书条目类型, string> = {
  world_lore: '世界观',
  character_lore: '角色设定',
  atmosphere: '氛围描写',
  system_rule: '系统规则',
};
