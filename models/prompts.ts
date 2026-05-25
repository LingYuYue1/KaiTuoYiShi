// 内置提示词模块系统：与世界书并列的第二套 prompt 机制。
// 世界书装 world lore（带作用域 / 关键词过滤），提示词模块装系统级硬规则
// （CoT / 输出格式 / 叙述者人格 / 开发者模式）——按 scope 注入主流程 system prompt。
// 设计参照墨色项目 models/system.ts 的「提示词结构」+「内置提示词条目结构」。

export type 提示词模块类目 = 'cot' | 'format' | 'persona' | 'devmode' | 'style' | 'custom';

/** 模块注入场景。与世界书 scope 对齐，便于未来变量模型 / 战斗模型复用同一过滤器。
 * - main: 主流程正文（除开局外）
 * - opening: 开局首回合
 * - battle: 战斗 / 判定专用（预留）
 * - pathAwakening: 命途狭间专用回合（进入狭间问答的那一回合）
 * - calibration: 变量模型校准（预留）
 * - all: 任意场景都注入（CoT 之外的格式 / 人格 / 开发者模式默认走这个）
 */
export type 提示词模块作用域 = 'main' | 'opening' | 'battle' | 'pathAwakening' | 'calibration' | 'all';

export interface 提示词模块 {
  id: string;
  title: string;
  description: string;
  category: 提示词模块类目;
  /** 提示词正文。可含占位符：{wordCountTarget} / {personLabel}，注入时替换。 */
  content: string;
  enabled: boolean;
  /** 是否内置。内置模块的 id 在 BUILTIN_PROMPT_MODULE_IDS 白名单里，content/title 在 UI 中只读。 */
  builtin: boolean;
  /** 注入顺序（升序）。order < 30 注入到 system prompt 顶部，>= 30 注入到尾部。 */
  order: number;
  /** 允许注入的场景。空数组等价于 ['all']（运行时兜底）。
   *  填 ['all'] 表示任何回合都注入；填 ['main'] 表示首回合不注入；填 ['opening'] 表示仅首回合注入。 */
  scope: 提示词模块作用域[];
  createdAt: number;
  updatedAt: number;
}

export const BUILTIN_PROMPT_MODULE_IDS = [
  'builtin_dev_mode',
  'builtin_narrator_persona',
  'builtin_opening_cot',
  'builtin_main_plot_cot',
  'builtin_path_awakening_cot',
  'builtin_news_cot',
  'builtin_zhiku_cot',
  'builtin_phone_cot',
  'builtin_story_weaving_cot',
  'builtin_variable_cot',
  'builtin_response_format',
  'builtin_action_options',
  'builtin_no_control',
  'builtin_writing_style',
  'builtin_writing_style_hsr',
  'builtin_writing_style_baimiao',
  'builtin_writing_style_custom',
  'builtin_perspective_first',
  'builtin_perspective_second',
  'builtin_perspective_third',
  'builtin_nsfw',
] as const;

export type 内置提示词模块ID = (typeof BUILTIN_PROMPT_MODULE_IDS)[number];

/** 判断某条模块是否属于内置白名单。 */
export function isBuiltinPromptModule(id: string): id is 内置提示词模块ID {
  return (BUILTIN_PROMPT_MODULE_IDS as readonly string[]).includes(id);
}

/** 顶部注入与尾部注入的分界 order 值。 */
export const PROMPT_MODULE_TOP_THRESHOLD = 30;

export const PROMPT_MODULE_CATEGORY_LABELS: Record<提示词模块类目, string> = {
  cot: '思维链',
  format: '输出格式',
  persona: '叙述人格',
  devmode: '开发模式',
  style: '文风',
  custom: '自定义',
};

export const PROMPT_MODULE_SCOPE_LABELS: Record<提示词模块作用域, string> = {
  main: '主流程',
  opening: '开局',
  battle: '战斗',
  pathAwakening: '命途狭间',
  calibration: '变量校准',
  all: '任意',
};

/** 旧版 builtin_cot id（已拆分为 builtin_opening_cot + builtin_main_plot_cot）。 */
export const LEGACY_BUILTIN_COT_ID = 'builtin_cot';
