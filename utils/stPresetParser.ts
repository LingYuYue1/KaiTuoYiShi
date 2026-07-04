/**
 * ST（SillyTavern）预设 JSON 解析器
 *
 * 把 SillyTavern 导出的预设 JSON 解析为我们的「提示词模块」数组。
 * 依赖 Phase 1-5 已完成：导入的模块会带 role / injectionPosition / injectionDepth /
 * injectionOrder / injectionTrigger / source='st_preset' 字段，由 systemPromptBuilder
 * 与宏引擎统一处理。
 *
 * SillyTavern 预设 JSON 结构（兼容 v2 / 旧版）：
 * - prompts: [{ identifier, name, content|prompt, role, injection_position, injection_depth, injection_order, forbid_overrides }]
 * - prompt_order: [{ character_id, order: [{ identifier, enabled }] }]
 *
 * 字段映射详见 Phase 6 Step 6.1 的对照表。
 */

import type { 提示词模块, 提示词模块类目 } from '@/models/prompts';
import { getDefaultModuleFields } from '@/models/prompts';
import type { STPreset, STWorldInfoEntry, STSamplingParams } from '@/models/stTypes';
import type { 世界书条目, 世界书条目类型 } from '@/models/worldbook';
import { parseJsonWithRepair } from './jsonRepair';
import { normalizeSTPreset } from './stSettingsNormalizer';

/** 判断模块是否为 ST 预设导入的模块。
 *  - source='st_preset'：新导入流程标记
 *  - id 以 st_import_ 开头：兼容旧导入，并清理 source 被改写为非 st_preset 的泄漏模块
 */
export const isSTImportedModule = (m: 提示词模块) =>
  m.source === 'st_preset' || m.id.startsWith('st_import_');

/** 内置主剧情思维链模块 id（与 ST 预设 CoT 冲突时需自动禁用） */
export const BUILTIN_MAIN_COT_ID = 'builtin_main_plot_cot';
/** 内置回复格式模块 id（与 ST 预设格式冲突时需自动禁用） */
export const BUILTIN_RESPONSE_FORMAT_ID = 'builtin_response_format';

/**
 * 检测 ST 导入模块中识别为「思维链 CoT」的模块 id 列表。
 *
 * 识别规则（双重判断，保守识别，满足任一即识别）：
 *  - name 含关键词：思维链 / COT / cot / 思考模式 / 思考过程 / reasoning
 *  - content 含标签：<thinking> / <cot> / <think>
 *
 * 准确率评估：双人成行 / Izumi / 小猫之神等主流预设的 CoT 条目 name 里
 * 直接写「思维链 / COT」，识别率 90%+。
 *
 * 漏识别时不崩：内置 main_plot_cot 保留，ST CoT 被 order 压制，仅 ST 特色丢失。
 * 误识别时不崩：内置 main_plot_cot 被禁用，但 ST 其实没 CoT，输出略差，可手动开回。
 */
export function detectSTCoTModules(modules: 提示词模块[]): string[] {
  const namePattern = /思维链|COT|cot|思考模式|思考过程|reasoning/i;
  const contentPattern = /<thinking>|<cot>|<think>/i;
  return modules
    .filter(isSTImportedModule)
    .filter((m) => namePattern.test(m.title ?? '') || contentPattern.test(m.content ?? ''))
    .map((m) => m.id);
}

/**
 * 检测 ST 导入模块中识别为「输出格式 Format」的模块 id 列表。
 *
 * 识别规则（双重判断，保守识别，满足任一即识别）：
 *  - name 含关键词：格式 / 输出格式 / 回复格式 / output format
 *  - content 含关键词：输出格式 / 回复格式 / action_options
 *
 * 注意：不单用「format」判断（太泛，容易误伤）。
 */
export function detectSTFormatModules(modules: 提示词模块[]): string[] {
  const namePattern = /格式|输出格式|回复格式|output.?format/i;
  const contentPattern = /输出格式|回复格式|action_options/i;
  return modules
    .filter(isSTImportedModule)
    .filter((m) => namePattern.test(m.title ?? '') || contentPattern.test(m.content ?? ''))
    .map((m) => m.id);
}

/** ST 预设中的单条 prompt 原始结构（宽松字段，允许缺省）。 */
interface STPromptRaw {
  identifier?: string;
  name?: string;
  /** 新版 ST 用 prompt 字段，旧版用 content。优先 prompt。 */
  prompt?: string;
  content?: string;
  role?: string;
  injection_position?: number;
  injection_depth?: number;
  injection_order?: number;
  forbid_overrides?: boolean;
  /** 部分预设可能带 trigger 字段。 */
  injection_trigger?: string[];
  /** ST 原生功能占位符标记：true 表示该条目是 ST 内置占位（如 charDescription / chatHistory），
   *  ST 会在这些位置插入原生数据（角色描述/聊天历史等）。我们不复刻 ST 原生功能布局，
   *  所以 marker=true 的条目一律跳过，不论 identifier 是什么。 */
  marker?: boolean;
}

/** ST prompt_order 中的单条目。 */
interface STOrderEntry {
  identifier: string;
  enabled: boolean;
}

/** ST prompt_order 中的分组。 */
interface STOrderGroup {
  character_id: number;
  order: STOrderEntry[];
}

/** ST 预设完整结构（宽松）。 */
export interface STPresetRaw {
  prompts?: STPromptRaw[];
  prompt_order?: STOrderGroup[];
  /** ST 世界书条目。V1 解析会转成项目世界书条目，V2 解析会原样保留。 */
  world_info?: STWorldInfoEntry[];
  // ── Phase 5：顶层采样参数（ST 预设 JSON 顶层字段） ───────────
  temperature?: number;
  top_p?: number;
  top_k?: number;
  top_a?: number;
  min_p?: number;
  repetition_penalty?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  openai_max_context?: number;
  openai_max_tokens?: number;
  /** ST 的 assistant prefill 字段：让 AI 接着这段文字继续生成。 */
  assistant_prefill?: string;
  /** ST 的流式开关。 */
  stream_openai?: boolean;
}

/** ST 预设导入检测结果：除了 prompt 模块外，还可能附带世界书。 */
export interface STPresetParseResult {
  /** 解析出的提示词模块。 */
  modules: 提示词模块[];
  /** 检测到的世界书条目数量（仅计数）。 */
  worldInfoCount: number;
  /** Phase 7.2：解析出的世界书条目（已转成我们的格式，含 stwi_ 前缀 id）。
   *  调用方可据此设置 STPresetEntry.worldbookEntries。空数组表示预设无世界书。 */
  worldbookEntries: 世界书条目[];
  /** Phase 5：解析出的顶层采样参数。调用方可据此设置 STPresetEntry.samplingParams。 */
  samplingParams?: STSamplingParams;
  /** Phase 5：解析出的 assistant prefill 文本。调用方可据此设置 STPresetEntry.assistantPrefill。 */
  assistantPrefill?: string;
}

export interface STPresetV2ParseResult {
  preset: STPreset | null;
  usedRepair: boolean;
  error?: string;
}

/**
 * V2 保留式解析入口。
 *
 * 只把 ST JSON 解析并规范化为原始 prompts + prompt_order 结构，
 * 不转译为 promptModules，不修改内置模块，不产生 st_import_*。
 */
export function parseSTPresetV2(jsonText: string): STPresetV2ParseResult {
  const parsed = parseJsonWithRepair<unknown>(jsonText);
  if (parsed.value === null) {
    return {
      preset: null,
      usedRepair: parsed.usedRepair,
      error: parsed.error ?? 'ST 预设 JSON 解析失败',
    };
  }

  const preset = normalizeSTPreset(parsed.value);
  if (!preset) {
    return {
      preset: null,
      usedRepair: parsed.usedRepair,
      error: '未找到有效的 prompts / prompt_order 结构',
    };
  }

  return {
    preset,
    usedRepair: parsed.usedRepair,
  };
}

/**
 * 把任意字符串 sanitize 成可作 id 的安全形式：
 * 保留字母数字 / 下划线 / 连字符，其余字符替换为 _。
 */
function sanitizeIdentifier(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'unknown';
  return trimmed.replace(/[^a-zA-Z0-9_\-]/g, '_').slice(0, 64);
}

/**
 * 从 name / identifier 推断类目。用于 UI 分组展示。
 * ST 预设没有强类型分类，按命名启发式推断，fallback 为 'custom'。
 *
 * 注意：jailbreak / nsfw 归入 'jailbreak'（越狱），与 'devmode'（开发模式）区分。
 * ST 预设中常见的 jailbreak / NSFW 解锁条目和真正的 dev mode（开发者调试）是两回事。
 */
function inferCategory(name: string, identifier: string): 提示词模块类目 {
  const text = `${name} ${identifier}`.toLowerCase();
  if (/cot|chain.?of.?thought|think|reasoning/.test(text)) return 'cot';
  if (/format|response.?format|output.?format|xml|json/.test(text)) return 'format';
  if (/persona|narrator|character.?card/.test(text)) return 'persona';
  // 越狱 / NSFW 解锁：jailbreak、nsfw、越狱、解锁 等关键词
  if (/jailbreak|nsfw|jail.?break|unlock|越狱|解锁/.test(text)) return 'jailbreak';
  // 开发模式：dev mode / developer（不含 jailbreak/nsfw）
  if (/dev.?mode|developer/.test(text)) return 'devmode';
  if (/style|writing.?style|tone|prose/.test(text)) return 'style';
  return 'custom';
}

/**
 * 把 role 字符串规范化为 'system' | 'user' | 'assistant'。
 * ST 还有 'system_prompt' 这种枚举值，统一归到 'system'。
 */
function normalizeRole(raw: string | undefined): 'system' | 'user' | 'assistant' {
  const r = (raw ?? 'system').trim().toLowerCase();
  if (r === 'user' || r === 'assistant') return r;
  return 'system';
}

/**
 * 把 ST 注入触发数组规范化。ST 原始值通常是字符串数组（如 ['normal','swipe']）。
 * 非数组或全空时返回空数组（=全触发，旧行为）。
 */
function normalizeTrigger(raw: string[] | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  const filtered = raw.map((s) => String(s).trim()).filter(Boolean);
  return filtered;
}

// ── 跳过规则判断函数（方案 0：导入解析器清理） ─────────────────────────
// 旧版用 identifier 硬编码 skipList 跳过 ST 原生功能占位符，但漏掉了 dialogueExamples
// 等条目；且 main identifier 被无条件跳过，导致双人成行把 main 塞了越狱指令也丢失。
// 新版改用 marker 字段检测 + 纯 XML 标签 / 纯装饰符号跳过，更准确且不丢实际内容。

/** ST 原生功能占位符：marker=true 标记的条目（charDescription / chatHistory /
 *  worldInfoBefore / scenario / dialogueExamples / enhanceDefinitions 等）。
 *  这些是 ST 内置占位，ST 会在这些位置插入原生数据（角色描述/聊天历史/世界书前后等）。
 *  我们不复刻 ST 原生功能布局，所以 marker=true 一律跳过。 */
function isMarkerPlaceholder(raw: STPromptRaw): boolean {
  return raw.marker === true;
}

/** 纯 XML 标签：如 "<context>" "</context>" "<!-- block -->" 等。
 *  这些是预设作者用的包裹标记，本来用于包裹 ST 原生功能（如 ┏<context>...┗</context>）。
 *  ST 原生功能被跳过后，这些标签失去包裹对象变孤立，导入无意义。
 *  注意：只匹配「整个 content 只有 XML 标签」的情况，标签外有文字的不跳过。
 *  实现思路：去掉所有 XML 标签和注释后，如果只剩空白，说明是纯 XML 标签。 */
function isPureXmlTag(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  // 去掉所有 XML 标签（开标签/闭标签）和 HTML 注释，如果去掉后只剩空白，说明是纯标签
  const withoutTags = trimmed
    .replace(/<\/?[a-zA-Z][\s\S]*?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  return withoutTags.trim().length === 0;
}

/** 纯装饰符号：如 "┏" "┗" "━━━" "═══" 等。
 *  这些是预设作者的视觉分隔符或包裹标记，本身没有指令含义。
 *  失去包裹对象后变孤立，导入无意义。 */
function isPureDecoration(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  // 装饰符号集：box-drawing 字符 + 全角分隔线 + 纯符号组合
  // 注意：必须至少有一个字符，且全部字符都是装饰符号
  return /^[┏┓┗┛━═─\-|=•●○■□◆◇★☆※]+$/u.test(trimmed);
}

/** 解析单条 ST prompt 为我们的模块对象（不含 order，order 由 prompt_order 决定）。
 *
 *  跳过规则（方案 0：导入解析器清理）：
 *    1. marker === true           → 跳过（ST 原生功能占位符，标准字段）
 *    2. content 为空              → 跳过
 *    3. content 是纯 XML 标签     → 跳过（如 "</context>"，孤立标记无意义）
 *    4. content 是纯装饰符号      → 跳过（如 "┏" "┗" "━━━"，孤立标记无意义）
 *    5. 其他全部保留              → 包括 main identifier 带内容的条目
 *
 *  旧版用 identifier 硬编码 skipList，漏掉 dialogueExamples，且 main 被无条件跳过
 *  导致双人成行开头越狱指令丢失。新版改用 marker 字段统一检测，main 带内容则保留。 */
function parseSTPrompt(raw: STPromptRaw, now: number): 提示词模块 | null {
  const identifier = raw.identifier?.trim();
  if (!identifier) return null;

  // 规则 1：marker=true 一律跳过（ST 原生功能占位符）
  if (isMarkerPlaceholder(raw)) return null;

  const content = (raw.prompt ?? raw.content ?? '').trim();
  // 规则 2：空内容跳过
  if (!content) return null;
  // 规则 3：纯 XML 标签跳过（失去包裹对象的孤立标记）
  if (isPureXmlTag(content)) return null;
  // 规则 4：纯装饰符号跳过（失去包裹对象的孤立标记）
  if (isPureDecoration(content)) return null;

  const sanitizedId = sanitizeIdentifier(identifier);
  const name = raw.name?.trim() || identifier;
  const role = normalizeRole(raw.role);

  return {
    ...getDefaultModuleFields(),
    id: `st_import_${sanitizedId}`,
    title: name,
    description: `ST 预设导入 · ${identifier}`,
    content,
    enabled: true,
    builtin: false,
    order: 100, // 临时占位，由 prompt_order 覆盖
    scope: ['all'], // ST 无 scope 概念
    role,
    injectionPosition: (raw.injection_position === 1 ? 1 : 0) as 0 | 1,
    injectionDepth: typeof raw.injection_depth === 'number' ? raw.injection_depth : 4,
    injectionOrder: typeof raw.injection_order === 'number' ? raw.injection_order : 100,
    injectionTrigger: normalizeTrigger(raw.injection_trigger),
    source: 'st_preset',
    // forbid_overrides=true → ST 不允许覆盖 → 对应我们的 builtin（不可替换）
    // forbid_overrides=false → ST 允许覆盖 → 对应 replaceable
    replaceable: raw.forbid_overrides ? 'builtin' : 'replaceable',
    category: inferCategory(name, identifier),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 解析 ST 预设 JSON 字符串为提示词模块数组。
 *
 * 行为：
 * 1. 解析 prompts 数组，跳过空内容 / 占位条目
 * 2. 按 prompt_order[0].order 的顺序设置模块 order 值（基础 50 + 数组索引）
 * 3. prompt_order 中 enabled=false 的条目，对应模块 enabled=false
 * 4. 不在 prompt_order 中的模块追加到末尾（order=50+orderList.length+索引）
 *
 * @param jsonText ST 预设 JSON 字符串
 * @returns 解析出的提示词模块数组（可能为空）
 * @throws 当 JSON 格式错误时抛出 Error
 */
export function parseSTPreset(jsonText: string): 提示词模块[] {
  const data: STPresetRaw = JSON.parse(jsonText);
  if (!data || !Array.isArray(data.prompts) || data.prompts.length === 0) {
    return [];
  }
  const now = Date.now();

  // 1. 解析所有 prompts
  const moduleMap = new Map<string, 提示词模块>();
  for (const raw of data.prompts) {
    const mod = parseSTPrompt(raw, now);
    if (mod) moduleMap.set(mod.id, mod);
  }
  if (moduleMap.size === 0) return [];

  // 2. 应用 prompt_order 排序
  const orderList = data.prompt_order?.[0]?.order ?? [];
  const orderedIds: string[] = [];
  for (const entry of orderList) {
    const sanitizedId = `st_import_${sanitizeIdentifier(entry.identifier)}`;
    const mod = moduleMap.get(sanitizedId);
    if (mod) {
      mod.enabled = entry.enabled !== false;
      orderedIds.push(sanitizedId);
    }
  }

  // 3. 按 orderedIds 顺序赋 order（基础 100，落在 Tier 2 区间 100-999）
  // 方案 A 三层 order 区间：
  //   Tier 1 (1-99)    内置可覆盖模块（devmode/persona/worldbook/style 等）
  //   Tier 2 (100-999) ST 导入模块（本函数生成）
  //   Tier 3 (1000+)   内置压轴模块（CoT/format/行动选项/NSFW 等，覆盖 ST 格式要求）
  // 预留 900 个位置，足够容纳 Izumi 200+ 条
  orderedIds.forEach((id, index) => {
    const mod = moduleMap.get(id);
    if (mod) mod.order = 100 + index;
  });

  // 4. 不在 prompt_order 中的模块追加到末尾
  let extraIndex = orderedIds.length;
  for (const [id, mod] of moduleMap) {
    if (!orderedIds.includes(id)) {
      mod.order = 100 + extraIndex;
      extraIndex += 1;
    }
  }

  // 5. 按 order 升序返回
  return Array.from(moduleMap.values()).sort((a, b) => a.order - b.order);
}

/**
 * 解析 ST 预设并返回检测结果（含世界书计数）。
 *
 * Phase 8 行为：
 * - 提示词模块照常解析返回
 * - world_info：解析为我们的世界书条目格式（含 stwi_ 前缀 id），返回 worldbookEntries
 * - 调用方据此设置 STPresetEntry.worldbookEntries
 */
export function parseSTPresetWithDetection(jsonText: string): STPresetParseResult {
  const data: STPresetRaw = JSON.parse(jsonText);
  const modules = parseSTPreset(jsonText);
  const worldbookEntries = parseSTWorldInfoEntries(data);
  const worldInfoCount = Array.isArray(data?.world_info) ? data.world_info.length : 0;

  // Phase 5：解析顶层采样参数
  const samplingParams = parseSTSamplingParams(data);
  // Phase 5：解析 assistant prefill
  const assistantPrefill = typeof data.assistant_prefill === 'string' ? data.assistant_prefill : undefined;

  return { modules, worldInfoCount, worldbookEntries, samplingParams, assistantPrefill };
}

/**
 * Phase 5：从 ST 预设 JSON 顶层解析采样参数。
 *
 * ST 字段 → 我们的字段映射：
 *   temperature          → temperature
 *   top_p                → topP
 *   top_k                → topK
 *   top_a                → topA
 *   min_p                → minP
 *   repetition_penalty   → repetitionPenalty
 *   frequency_penalty    → frequencyPenalty
 *   presence_penalty     → presencePenalty
 *   openai_max_context   → maxContext
 *   openai_max_tokens    → maxTokens
 *
 * 所有字段都是可选的，ST 预设不包含的字段返回 undefined。
 */
function parseSTSamplingParams(data: STPresetRaw): STSamplingParams | undefined {
  const params: STSamplingParams = {};
  if (typeof data.temperature === 'number') params.temperature = data.temperature;
  if (typeof data.top_p === 'number') params.topP = data.top_p;
  if (typeof data.top_k === 'number') params.topK = data.top_k;
  if (typeof data.top_a === 'number') params.topA = data.top_a;
  if (typeof data.min_p === 'number') params.minP = data.min_p;
  if (typeof data.repetition_penalty === 'number') params.repetitionPenalty = data.repetition_penalty;
  if (typeof data.frequency_penalty === 'number') params.frequencyPenalty = data.frequency_penalty;
  if (typeof data.presence_penalty === 'number') params.presencePenalty = data.presence_penalty;
  if (typeof data.openai_max_context === 'number') params.maxContext = data.openai_max_context;
  if (typeof data.openai_max_tokens === 'number') params.maxTokens = data.openai_max_tokens;

  // 全空则返回 undefined（预设无采样参数）
  return Object.keys(params).length > 0 ? params : undefined;
}

/**
 * 检测 ST 预设导入时与现有模块的 id 冲突。
 *
 * @param newModules 待导入的模块数组
 * @param existingModules 现有模块数组
 * @returns 冲突的 id 列表（即新模块 id 已存在于现有模块中）
 */
export function detectSTImportConflicts(
  newModules: 提示词模块[],
  existingModules: 提示词模块[],
): string[] {
  const existingIds = new Set(existingModules.map((m) => m.id));
  return newModules.filter((m) => existingIds.has(m.id)).map((m) => m.id);
}

/**
 * 合并 ST 导入模块到现有模块列表。
 *
 * 策略：
 * - mode='replace'：同 id 的旧模块被新模块覆盖（旧 st_import_* 被替换）
 * - mode='coexist'：跳过冲突模块（只追加新 id）
 * - mode='rename'：冲突模块自动重命名（追加 _2 _3 后缀）
 *
 * @param newModules 新导入模块
 * @param existingModules 现有模块
 * @param mode 冲突处理策略
 * @returns 合并后的完整模块数组
 */
export function mergeSTImportedModules(
  newModules: 提示词模块[],
  existingModules: 提示词模块[],
  mode: 'replace' | 'coexist' | 'rename' = 'replace',
): 提示词模块[] {
  if (mode === 'replace') {
    const newIds = new Set(newModules.map((m) => m.id));
    const filtered = existingModules.filter((m) => !newIds.has(m.id) || !m.id.startsWith('st_import_'));
    return [...filtered, ...newModules];
  }
  if (mode === 'coexist') {
    const existingIds = new Set(existingModules.map((m) => m.id));
    const filtered = newModules.filter((m) => !existingIds.has(m.id));
    return [...existingModules, ...filtered];
  }
  // rename
  const existingIds = new Set(existingModules.map((m) => m.id));
  const renamed = newModules.map((m) => {
    let candidate = m.id;
    let suffix = 2;
    while (existingIds.has(candidate)) {
      candidate = `${m.id}_${suffix}`;
      suffix += 1;
    }
    existingIds.add(candidate);
    return { ...m, id: candidate };
  });
  return [...existingModules, ...renamed];
}

// ── Phase 7.2：ST 世界书条目解析 ─────────────────────────────────

/** 根据 ST 条目 comment 推断我们的世界书条目类型。 */
function inferWorldbookType(comment: string): 世界书条目类型 {
  const text = (comment ?? '').toLowerCase();
  if (/设定|世界观|lore|world/.test(text)) return 'world_lore';
  if (/角色|character|人物/.test(text)) return 'character_lore';
  if (/氛围|atmosphere|描写/.test(text)) return 'atmosphere';
  if (/规则|系统|rule|system/.test(text)) return 'system_rule';
  return 'world_lore';
}

/** Phase 7.3：ST selectiveLogic 编号 → 我们的 logic 枚举。
 *  ST 1.12+ 约定：0=AND_ANY, 1=NOT_ANY, 2=AND_ALL, 3=NOT_ALL。
 *  缺失/非法值 → 'AND_ALL'（保持 Phase 7.1 之前的默认行为）。 */
function mapSTLogic(stLogic: number | undefined): 'AND_ANY' | 'AND_ALL' | 'NOT_ANY' | 'NOT_ALL' {
  switch (stLogic) {
    case 0: return 'AND_ANY';
    case 1: return 'NOT_ANY';
    case 2: return 'AND_ALL';
    case 3: return 'NOT_ALL';
    default: return 'AND_ALL';
  }
}

/** 解析 ST 预设的 world_info 数组为我们的世界书条目数组。
 *  - ST uid → 我们的 id（加 stwi_ 前缀，避免与 builtin_ / 自建条目冲突）
 *  - ST position 0/1/2/3 → injectAtDepth=false（拼 systemPrompt，我们无角色卡概念）
 *  - ST position 4 (at_depth) → injectAtDepth=true + depth 字段保留
 *  - ST disable (uid 数组) → 转成我们的 disablesEntries (stwi_ 前缀 id 数组)
 *  - 跳过 content 为空 / enabled=false 的条目
 *  字段映射详见 docs/2026-06-29-[重要]-世界书系统升级指南与实现方案.md 第 10.4 节。 */
export function parseSTWorldInfoEntries(data: STPresetRaw): 世界书条目[] {
  if (!Array.isArray(data?.world_info)) return [];
  const now = Date.now();

  return data.world_info
    .filter((raw) => raw && typeof raw === 'object'
      && (raw.content ?? '').trim().length > 0
      && raw.enabled !== false)
    .map((raw): 世界书条目 => {
      const uid = raw.uid ?? 0;
      const id = `stwi_${uid}`;
      const title = (raw.comment ?? '').trim() || `ST 条目 ${uid}`;
      const type = inferWorldbookType(raw.comment ?? '');
      const isAtDepth = raw.position === 4;
      // ST constant=true 表示无关键词也注入，等价我们的 injectMode='always'
      // ST selective=true 表示关键词匹配触发，等价 injectMode='keyword_match'
      // 两者都不设时默认 keyword_match（与 ST 行为一致）
      const injectMode = raw.constant === true ? 'always' : 'keyword_match';

      return {
        id,
        title,
        content: raw.content ?? '',
        type,
        injectMode,
        keywords: Array.isArray(raw.key) ? raw.key : [],
        keySecondary: Array.isArray(raw.keysecondary) ? raw.keysecondary : [],
        caseSensitive: raw.caseSensitive ?? false,
        matchWholeWords: raw.matchWholeWords ?? false,
        useRegex: false, // ST 标准 world_info 不暴露 useRegex，保守 false
        probability: raw.probability ?? 100,
        delay: raw.delay ?? 0,
        cooldown: raw.cooldown ?? 0,
        scanDepth: raw.scanDepth ?? 50,
        // Phase 7.2 深度插入 + 分组 + 互斥
        injectAtDepth: isAtDepth,
        depth: raw.depth ?? 0,
        group: raw.group ?? '',
        groupOverride: raw.groupOverride ?? false,
        groupWeight: raw.groupWeight ?? 0,
        disablesEntries: (Array.isArray(raw.disable) ? raw.disable : [])
          .map((d) => `stwi_${d}`),
        // Phase 7.3 递归触发 + 逻辑门
        // ST selectiveLogic 编号：0=AND_ANY, 1=NOT_ANY, 2=AND_ALL, 3=NOT_ALL
        logic: mapSTLogic(raw.logic),
        recurse: raw.recursive === true,
        recurseDepth: raw.recursionDepth ?? 1,
        // 通用字段
        priority: raw.order ?? 100,
        enabled: raw.enabled !== false,
        scope: ['all'], // ST 无 scope 概念，对所有场景生效
        createdAt: now,
        updatedAt: now,
      };
    });
}
