import type { 剧情模式 } from './journey';

export type 世界书条目类型 = 'world_lore' | 'character_lore' | 'atmosphere' | 'system_rule';
export type 世界书注入方式 = 'always' | 'keyword_match';
/** @deprecated 改用 scope 字段。保留类型仅用于迁移识别。 */
export type WorldbookTurnGuard = 'first_only';

/** 条目注入场景。
 * - main: 主流程正文（除开局外）
 * - opening: 开局首回合
 * - battle: 战斗 / 判定专用 CoT（预留，目前未使用）
 * - calibration: 独立模型 / 校准模型资料展示（新闻、手机、智库、变量、剧情编织等；不注入主剧情）
 * - all: 任意场景都注入
 */
export type 世界书作用域 = 'main' | 'opening' | 'battle' | 'pathAwakening' | 'calibration' | 'all';

export const SCOPE_LABELS: Record<世界书作用域, string> = {
  main: '主流程',
  opening: '开局',
  battle: '战斗',
  pathAwakening: '命途狭间',
  calibration: '独立模型',
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
  /** 内置条目内容版本号。源码版本高于用户存档版本时,加载合并会强制刷新条目内容(仅保留用户 enabled)。
   *  修复"内置世界书条目内容对老用户永不更新"的漂移缺陷(D12,2026-07-26)。自定义条目不使用。 */
  contentVersion?: number;
  /** @deprecated 已迁移到 scope，仅旧存档读入时仍可能存在；normalize 后会被移除。 */
  turnGuard?: WorldbookTurnGuard;
  createdAt: number;
  updatedAt: number;

  // ── Phase 7.1：关键词匹配增强 + 触发控制（ST 兼容） ───────────────
  /** 次要关键词数组。与主关键词组合使用（AND 逻辑）：主关键词命中后，次要关键词必须全部命中才触发。
   *  空数组 = 不启用 AND 逻辑（仅主关键词 OR 命中即触发）。默认 []。 */
  keySecondary?: string[];
  /** 关键词匹配是否大小写敏感。默认 false（全部转小写比较）。 */
  caseSensitive?: boolean;
  /** 是否全词匹配。默认 false（子串包含即命中）。
   *  true 时用 \b 边界匹配，避免 "星" 命中 "星穹铁道"。 */
  matchWholeWords?: boolean;
  /** 是否启用正则匹配。默认 false。
   *  true 时 keywords 数组中的每一项视为正则表达式。 */
  useRegex?: boolean;
  /** 触发概率 0-100。默认 100（必触发）。 */
  probability?: number;
  /** 延迟触发：N 条消息后才允许触发。默认 0（无延迟）。 */
  delay?: number;
  /** 冷却：触发后 N 条消息内不再触发。默认 0（无冷却）。 */
  cooldown?: number;
  /** 扫描深度：只扫描最近 N 条消息的关键词。默认 50。0 = 扫描全部历史。 */
  scanDepth?: number;

  // ── Phase 7.2：深度插入 + 分组召回 + 条目互斥（ST 兼容） ──────────
  /** 是否走 In-Chat 深度插入（true 时转 ChatModuleMessage 按 depth 插入聊天历史）。
   *  默认 false（拼到 systemPrompt）。仅给特殊世界书（ST 导入/二创预设带）使用，
   *  原生世界书默认 false（我们无角色卡概念）。 */
  injectAtDepth?: boolean;
  /** 深度插入的 depth 值。0=末条消息后，1=末条消息前，N=末条消息前 N 条前。默认 0。 */
  depth?: number;
  /** 桶分组 id。同组条目可触发 groupOverride 互斥逻辑。默认 ''。 */
  group?: string;
  /** 桶覆盖开关。true 时同组只取 groupWeight 最高的条目。默认 false。 */
  groupOverride?: boolean;
  /** 桶分组权重。groupOverride=true 时按此值降序取最高。默认 0。 */
  groupWeight?: number;
  /** 条目互斥列表（id 数组）。本条目触发后，列表中的条目会被禁用。默认 []。 */
  disablesEntries?: string[];

  // ── Phase 7.3：递归触发 + 逻辑门（ST 兼容） ──────────────────────
  /** 关键词组合逻辑（主关键词 + 次要关键词的组合方式）。默认 'AND_ALL'（保持向后兼容）。
   *  - AND_ANY: 主关键词 OR 命中 + 任一次要关键词命中
   *  - AND_ALL: 主关键词 OR 命中 + 所有次要关键词命中（Phase 7.1 行为）
   *  - NOT_ANY: 主关键词 OR 命中 + 任一次要关键词不命中
   *  - NOT_ALL: 主关键词 OR 命中 + 非所有次要关键词命中 */
  logic?: 'AND_ANY' | 'AND_ALL' | 'NOT_ANY' | 'NOT_ALL';
  /** 此条目触发后是否递归扫描其他条目（把已触发条目 content 加入 haystack 重新扫描）。
   *  默认 false。仅在复杂预设链式触发场景启用。 */
  recurse?: boolean;
  /** 递归深度限制。默认 1（只递归一次）。最大 5，防止无限递归导致性能问题。 */
  recurseDepth?: number;
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
