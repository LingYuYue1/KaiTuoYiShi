/**
 * SillyTavern 预设兼容类型定义
 *
 * 字段定义参照 SillyTavern 常见导出格式。V2 预设会保留原始 prompts /
 * prompt_order / world_info / regex_scripts，并在主剧情酒馆消息链中受限使用。
 */
import type { 消息角色 } from './chat';

/**
 * ST 世界书条目（World Info Entry）。
 * 参照 SillyTavern 的 world_info 格式，字段命名保留 ST 原始 snake_case 以便直接映射。
 */
export interface STWorldInfoEntry {
  /** ST 内部唯一 id。 */
  uid: number;
  /** 主关键词数组。任一命中即触发条目。 */
  key: string[];
  /** 次关键词数组。与主关键词组合使用（AND 逻辑）。 */
  keysecondary: string[];
  /** 条目注释 / 标题。 */
  comment: string;
  /** 条目正文。 */
  content: string;
  /** 常量条目：无论关键词是否命中都注入。 */
  constant: boolean;
  /** 矢量条目：基于语义相似度召回。 */
  vectorized: boolean;
  /** 触发后选择逻辑：selective / constant / vectorized。 */
  selective: boolean;
  /** 注入顺序：升序排列。 */
  order: number;
  /** 注入位置：0=before_char / 1=after_char / 2=before_AN / 3=after_AN / 4=at_depth。 */
  position: number;
  /** 与世界书其他条目的禁用/启用关系。 */
  disable: number[];
  /** 是否启用。 */
  enabled: boolean;
  /** 添加到向量存储的开关。 */
  addMemo: boolean;
  /** 显示内容（与 content 不同时使用）。 */
  displayIndex: number;
  /** 桶编号：ST 用于分组召回。 */
  group: string;
  /** 桶分组召回上限。 */
  groupOverride: boolean;
  /** 桶分组权重。 */
  groupWeight: number;
  /** ST 1.12+ 的 depth 值。 */
  depth: number;
  /** ST 1.12+ 的逻辑门（AND/OR/NOT）。 */
  logic: number;
  /** ST 1.12+ 的逻辑门组合键。 */
  useGroup: boolean;
  /** 自动排序关键字。 */
  automationId?: string;
  /** 备注。 */
  comment_A?: string;
  // ── Phase 7.2 扩展：ST 1.12+ 触发控制字段 ───────────────────────
  /** 关键词匹配是否大小写敏感（ST 1.12+）。 */
  caseSensitive?: boolean;
  /** 是否全词匹配（ST 1.12+）。 */
  matchWholeWords?: boolean;
  /** 触发概率 0-100（ST 1.12+）。 */
  probability?: number;
  /** 延迟触发：N 条消息后才允许触发（ST 1.12+）。 */
  delay?: number;
  /** 冷却：触发后 N 条消息内不再触发（ST 1.12+）。 */
  cooldown?: number;
  /** 扫描深度：只扫描最近 N 条消息（ST 1.12+）。 */
  scanDepth?: number;
  // ── Phase 7.3 扩展：ST 1.12+ 递归触发字段 ───────────────────────
  /** 此条目触发后是否递归扫描其他条目（ST 1.12+）。 */
  recursive?: boolean;
  /** 递归深度限制（ST 1.12+）。 */
  recursionDepth?: number;
}

/**
 * ST 预设完整结构（含世界书与正则脚本）。
 * 预设解析会原样保留 world_info / regex_scripts，由主剧情酒馆消息链和本地审查
 * 负责受限兼容。
 */
export interface STPresetFull {
  prompts?: unknown[];
  prompt_order?: unknown[];
  /** ST 世界书条目数组（导入预设时可能附带）。 */
  world_info?: STWorldInfoEntry[];
  /** ST 正则脚本（导入预设时可能附带，默认不执行）。部分导出为数组，部分导出为对象映射。 */
  regex_scripts?: STRegexScript[] | Record<string, STRegexScript>;
}

/** ST 正则脚本原始结构。高风险能力，仅保留字段，运行时需走受限兼容层。 */
export interface STRegexScript {
  id?: string;
  script_name?: string;
  scriptName?: string;
  name?: string;
  find_regex?: string;
  findRegex?: string;
  replace_string?: string;
  replaceString?: string;
  disabled?: boolean;
  placement?: unknown;
  trim_strings?: string[];
  trimStrings?: string[];
  markdownOnly?: boolean;
  promptOnly?: boolean;
  runOnEdit?: boolean;
  substituteRegex?: number;
  minDepth?: number | null;
  maxDepth?: number | null;
  [key: string]: unknown;
}

/**
 * ===== 新增：保留式类型（参照 MoRanJiangHu models/system.ts L552-581) =====
 */

/** ST 预设消息角色类型（兼容别名，指向唯一真相 models/chat.ts 的消息角色）。 */
export type STMessageRole = 消息角色;

/** ST 预设提示词结构（保留 ST 原始字段） */
export interface STPresetPrompt {
  identifier: string;
  name?: string;
  role: STMessageRole;
  content: string;
  system_prompt?: boolean;
  injection_position?: number;   // 0=相对位置, 1=In-Chat
  injection_depth?: number;
  injection_order?: number;
  forbid_overrides?: boolean;
  /** 保留 ST 原始字段以便回放 */
  [key: string]: unknown;
}

/** ST 预设顺序项结构 */
export interface STPresetOrderSlot {
  identifier: string;
  enabled: boolean;
}

/** ST 预设顺序结构（对应一个 character_id） */
export interface STPresetOrder {
  character_id: number;
  order: STPresetOrderSlot[];
}

/** ST 预设结构（完整保留 ST 原始双数组） */
export interface STPreset {
  prompts: STPresetPrompt[];
  prompt_order: STPresetOrder[];
  /** ST 世界书原始字段：导入时保留，后续映射到本项目世界书作用域。 */
  world_info?: STWorldInfoEntry[] | Record<string, STWorldInfoEntry>;
  /** ST 正则脚本原始字段：导入时保留，默认不执行。部分导出为数组，部分导出为对象映射。 */
  regex_scripts?: STRegexScript[] | Record<string, STRegexScript>;
  /** 顶层采样参数（保留 ST 原始字段） */
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  repetition_penalty?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  [key: string]: unknown;
}

/** ST 预设条目结构（玩家保存的预设条目） */
export interface STPresetEntryV2 {
  id: string;
  name: string;
  preset: STPreset;              // 原始结构，不再转译成 modules
  characterId?: number | null;   // 当前选中的 character_id
  importedAt: number;
  updatedAt: number;
  isBuiltin?: boolean;
}

/** 酒馆消息后处理模式 */
export type TavernPostProcessMode = '未选择' | '单一用户' | '严格' | '半严格';

/** 消息链构建输出的内部消息（带 source 标签） */
export interface TavernInternalMessage {
  role: STMessageRole;
  content: string;
  source: 'preset' | 'worldbook' | 'history' | 'latest_input' | 'persona' | 'format_guard' | 'cot_guard' | 'compat_guard';
}

/** 消息链构建输出的最终消息 */
export interface TavernMessage {
  role: STMessageRole;
  content: string;
}
