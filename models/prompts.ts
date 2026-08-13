// 内置提示词模块系统：与世界书并列的第二套 prompt 机制。
// 世界书装 world lore（带作用域 / 关键词过滤），提示词模块装系统级硬规则
// （CoT / 输出格式 / 叙述者人格 / 开发者模式）——按 scope 注入主流程 system prompt。
// 设计参照「提示词结构」+「内置提示词条目结构」。

import type { 剧情模式 } from './journey';

export type 提示词模块类目 = 'cot' | 'format' | 'persona' | 'devmode' | 'jailbreak' | 'style' | 'storymode' | 'custom';

/** 模块注入场景。与世界书 scope 对齐，便于主剧情与独立模型提示词展示复用同一分类。
 * - main: 主流程正文（除开局外）
 * - opening: 开局首回合
 * - battle: 战斗 / 判定专用（预留）
 * - pathAwakening: 命途狭间专用回合（进入狭间问答的那一回合）
 * - calibration: 独立模型 / 校准模型提示词展示（新闻、手机、智库、变量、剧情编织等；不注入主剧情）
 * - all: 任意场景都注入（CoT 之外的格式 / 人格 / 开发者模式默认走这个）
 */
export type 提示词模块作用域 = 'main' | 'opening' | 'battle' | 'pathAwakening' | 'calibration' | 'all';

export interface 提示词模块 {
  id: string;
  title: string;
  description: string;
  category: 提示词模块类目;
  /** 提示词正文。可含占位符：{wordCountTarget} / {personLabel} / {playerName}，注入时替换。 */
  content: string;
  enabled: boolean;
  /** 是否内置。内置模块的 id 在 BUILTIN_PROMPT_MODULE_IDS 白名单里，content/title 在 UI 中只读。 */
  builtin: boolean;
  /** 注入顺序（升序）。order < 30 注入到 system prompt 顶部，>= 30 注入到尾部。 */
  order: number;
  /** 允许注入的场景。空数组等价于 ['all']（运行时兜底）。
   *  填 ['all'] 表示任何回合都注入；填 ['main'] 表示首回合不注入；填 ['opening'] 表示仅首回合注入。 */
  scope: 提示词模块作用域[];
  /** 可选：仅在开局档案来源命中时注入，用于区分官方预设 / 自由开局 / 创意工坊开局。 */
  openingSourceGate?: ('official_preset' | 'free' | 'workshop')[];
  /** 可选：剧情模式门控（四选一）。非空时仅当玩家世界状态的剧情模式命中其中之一才注入。
   *  与迁移前世界书的 storyModeGate 同语义；剧情方向模块（builtin_storymode_*）靠它互斥。 */
  storyModeGate?: 剧情模式[];
  /** ST 预设兼容：消息角色。system 走 systemPrompt 拼接，user/assistant 走 messages 插入。 */
  role?: 'system' | 'user' | 'assistant';
  /** ST 预设兼容：0=相对位置（按 order 排序），1=In-Chat（按 injectionDepth 插入聊天历史）。 */
  injectionPosition?: 0 | 1;
  /** ST 预设兼容：仅 injectionPosition=1 时有效。0=末条消息后，1=末条消息前，依此类推。 */
  injectionDepth?: number;
  /** ST 预设兼容：同 role 同 depth 内排序值，值越小越靠前。默认回退到 order。 */
  injectionOrder?: number;
  /** ST 预设兼容：触发生成类型。空=全触发。候选值：normal / continue / impersonate / swipe / regenerate / quiet。 */
  injectionTrigger?: string[];
  /** 模块来源：builtin=内置 / st_preset=ST预设导入 / user=用户自建。 */
  source?: 'builtin' | 'st_preset' | 'user';
  /** 替代行为：builtin=不可替换 / builtin_toggleable=可关不可删 / replaceable=可被ST导入替换 / extensible=可叠加。 */
  replaceable?: 'builtin' | 'builtin_toggleable' | 'replaceable' | 'extensible';
  /** 模块级锁定：true 时玩家无法关闭/删除/编辑。
   *  二创成品预设(adapted_*)用此字段保持内置模块在二创预设中始终开启且无法关闭。 */
  locked?: boolean;
  createdAt: number;
  updatedAt: number;
}

export const BUILTIN_PROMPT_MODULE_IDS = [
  'builtin_dev_mode',
  'builtin_narrator_persona',
  'builtin_opening_cot',
  'builtin_preset_opening_cot',
  'builtin_free_opening_cot',
  'builtin_main_plot_cot',
  'builtin_path_awakening_cot',
  'builtin_news_cot',
  'builtin_news_worldbook',
  'builtin_news_output_format',
  'builtin_zhiku_cot',
  'builtin_zhiku_output_format',
  'builtin_yiting_recall',
  'builtin_yiting_archive_format',
  'builtin_phone_worldbook',
  'builtin_phone_style',
  'builtin_phone_cot',
  'builtin_phone_output_format',
  'builtin_story_weaving_worldbook',
  'builtin_story_weaving_cot',
  'builtin_story_weaving_output_format',
  'builtin_variable_worldbook',
  'builtin_variable_cot',
  'builtin_variable_output_format',
  'builtin_companion_archive_worldbook',
  'builtin_response_format',
  'builtin_action_options',
  'builtin_no_control',
  'builtin_player_speech_expansion',
  'builtin_npc_autonomy',
  'builtin_npc_ledger_continuity',
  'builtin_writing_style',
  'builtin_writing_style_hsr',
  'builtin_writing_style_baimiao',
  'builtin_writing_style_custom',
  'builtin_perspective_first',
  'builtin_perspective_second',
  'builtin_perspective_third',
  'builtin_nsfw',
  'builtin_emotion_protocol',
  'builtin_cognitive_isolation',
  // 批次5(D10, 2026-07-26): 由内置世界书迁移而来的规则模块(order 40-47,底部区最前,紧随世界书稳定规则)
  'builtin_rule_first_turn',
  'builtin_rule_narrative_general',
  'builtin_rule_forbidden_phrases',
  'builtin_rule_emotion_realism',
  'builtin_rule_battle_narration',
  'builtin_rule_time_progression',
  'builtin_rule_power_system',
  'builtin_rule_awakening_interrogation',
  // 剧情方向模块：由剧情模式世界书(builtin_story_*)迁移而来,storyModeGate 四选一互斥,locked 不可关
  'builtin_storymode_normal',
  'builtin_storymode_harem',
  'builtin_storymode_romance_alt',
  'builtin_storymode_deep_single',
] as const;

export type 内置提示词模块ID = (typeof BUILTIN_PROMPT_MODULE_IDS)[number];

/** 判断某条模块是否属于内置白名单。 */
export function isBuiltinPromptModule(id: string): id is 内置提示词模块ID {
  return (BUILTIN_PROMPT_MODULE_IDS as readonly string[]).includes(id);
}

/** 顶部注入与尾部注入的分界 order 值。 */
export const PROMPT_MODULE_TOP_THRESHOLD = 30;

/**
 * order 区间三层方案（ST 预设兼容）：
 *   Tier 1 (1-99)    内置可覆盖模块（worldbook/输出格式/CoT 等）
 *   Tier 2 (100-999) ST 导入模块（st_import_* 前缀）
 *   Tier 3 (1000+)   内置压轴模块（CoT/格式/行动选项/NSFW/复合情感/认知隔离）
 *
 * LLM 优先级规律：靠后的指令优先级更高（更接近用户消息），所以 CoT/格式
 * 必须排在 ST 之后（Tier 3），避免被 ST 预设覆盖导致输出格式错乱。
 *
 * calibration scope 允许 order 重复约定：
 *   独立系统（news/phone/zhiku/yiting/storyWeaving/variable）各自的 worldbook(50) /
 *   output_format(66) / cot(1020) 模块都使用相同 order 值。这不冲突，因为每个
 *   独立系统的 buildXxxPromptModulesSection 函数只过滤自己系统的模块（scope +
 *   id 前缀双重过滤），同 order 的模块不会在同一个 systemPrompt 里相遇。
 *   若未来要做全局 order 校验或统一注入所有 calibration 模块，需先给每个独立
 *   系统分配独立子区间（如 news=50/66/1020, phone=51/67/1021, ...）。
 */

export const PROMPT_MODULE_CATEGORY_LABELS: Record<提示词模块类目, string> = {
  cot: '思维链',
  format: '输出格式',
  persona: '叙述人格',
  devmode: '开发模式',
  jailbreak: '越狱',
  style: '文风',
  storymode: '剧情开展方向',
  custom: '自定义',
};

export const PROMPT_MODULE_SCOPE_LABELS: Record<提示词模块作用域, string> = {
  main: '主流程',
  opening: '开局',
  battle: '战斗',
  pathAwakening: '命途狭间',
  calibration: '独立模型',
  all: '任意',
};

/** 旧版 builtin_cot id（已拆分为 builtin_opening_cot + builtin_main_plot_cot）。 */
export const LEGACY_BUILTIN_COT_ID = 'builtin_cot';

/** ST 预设兼容字段的默认值。用于旧存档迁移兜底、新建模块填充、运行时读取兜底。 */
export function getDefaultModuleFields(): Pick<提示词模块, 'role' | 'injectionPosition' | 'injectionDepth' | 'injectionOrder' | 'injectionTrigger' | 'source' | 'replaceable'> {
  return {
    role: 'system',
    injectionPosition: 0,
    injectionDepth: 4,
    injectionOrder: 100,
    injectionTrigger: [],
    source: 'builtin',
    replaceable: 'builtin',
  };
}

/** 剧情方向模块四选一（纯派生，不改持久化数据）：
 *  storyModeGate 非空的模块，enabled 仅当命中当前剧情模式才为 true。
 *  注入侧与 UI 侧共用同一派生，保证「当前剧情模式对应的那一本」才处于启用态。
 *  剧情模式未显式选择（空世界状态 / 未开局）时默认按「正常向」处理，
 *  避免四个剧情方向模块同时处于启用态。 */
export function syncStoryModeModuleEnabled(
  modules: 提示词模块[],
  storyMode: 剧情模式 | undefined,
): 提示词模块[] {
  const effective = storyMode ?? 'normal';
  return modules.map((m) =>
    m.storyModeGate?.length ? { ...m, enabled: m.storyModeGate.includes(effective) } : m,
  );
}
