/**
 * Phase 6：冲突融合引擎
 *
 * 服务「玩家导入预设」的自动兼容流程。内置二创成品（如双人成行）已手工融合，
 * 不需要运行时融合。
 *
 * 融合原则：
 * 1. 内置 39 个模块全部保留作底座
 * 2. ST 模块作为附加层
 * 3. 4 类核心冲突（CoT/输出格式/人称视角/行动选项）融合成一条新模块
 * 4. 非冲突模块直接直入（活人感/文风/NSFW 等）
 *
 * 4 类核心冲突的融合规则：
 * - CoT 思维链：内置骨架不可改 + ST 指令作为附加段
 * - 输出格式：内置 4 标签协议不可改 + ST 的字数/语言/风格要求作为附加段
 * - 人称视角：保留内置人称模块原样 + ST 的视角要求作为低优先级附加段
 * - 行动选项：内置规范优先 + ST 的样式要求作为附加段
 */

import type { 提示词模块 } from '@/models/prompts';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import { isSTImportedModule, detectSTCoTModules, detectSTFormatModules } from '@/utils/stPresetParser';

/** 内置 CoT 模块 id 列表（不可改骨架） */
const BUILTIN_COT_IDS = [
  'builtin_main_plot_cot',
  'builtin_opening_cot',
  'builtin_preset_opening_cot',
  'builtin_free_opening_cot',
  'builtin_path_awakening_cot',
];

/** 内置输出格式模块 id（不可改骨架） */
const BUILTIN_RESPONSE_FORMAT_ID = 'builtin_response_format';

/** 内置人称视角模块 id 列表（互斥，实际启用项由运行时设置决定） */
const BUILTIN_PERSPECTIVE_IDS = [
  'builtin_perspective_first',
  'builtin_perspective_second',
  'builtin_perspective_third',
];

/** 内置行动选项模块 id（不可改骨架） */
const BUILTIN_ACTION_OPTIONS_ID = 'builtin_action_options';

/** 人称视角识别正则 */
const PERSPECTIVE_PATTERN = /第一人称|第二人称|第三人称|人称|视角/i;

/** 行动选项识别正则 */
const ACTION_OPTIONS_PATTERN = /行动选项|选项|action.?options/i;

/**
 * 把玩家导入的 ST 模块与内置模块融合。
 *
 * @param stModules 玩家导入的 ST 模块数组（已解析，全部 st_import_* 前缀）
 * @returns 融合后的完整模块数组（内置 + ST 附加）
 */
export function mergeWithBuiltin(stModules: 提示词模块[]): 提示词模块[] {
  // 1. 取内置 39 个模块作底座
  const builtinModules = createBuiltinPromptModules();

  // 2. 识别 ST 模块中的冲突类型
  const stCoTIds = new Set(detectSTCoTModules(stModules));
  const stFormatIds = new Set(detectSTFormatModules(stModules));
  const stPerspectiveModules = stModules.filter(
    (m) => isSTImportedModule(m) && PERSPECTIVE_PATTERN.test(m.content ?? '') && PERSPECTIVE_PATTERN.test(m.title ?? ''),
  );
  const stActionOptionsModules = stModules.filter(
    (m) => isSTImportedModule(m) && ACTION_OPTIONS_PATTERN.test(m.content ?? ''),
  );

  // 3. 分流 ST 模块
  const conflictCoTModules = stModules.filter((m) => stCoTIds.has(m.id));
  const conflictFormatModules = stModules.filter((m) => stFormatIds.has(m.id));
  const conflictPerspectiveModules = stPerspectiveModules;
  const conflictActionOptionsModules = stActionOptionsModules;

  // 已分类的 ST 模块 id（不重复直入）
  const classifiedIds = new Set<string>([
    ...conflictCoTModules.map((m) => m.id),
    ...conflictFormatModules.map((m) => m.id),
    ...conflictPerspectiveModules.map((m) => m.id),
    ...conflictActionOptionsModules.map((m) => m.id),
  ]);

  // 未分类的 ST 模块（非冲突，直接直入）
  const directInjectModules = stModules.filter((m) => !classifiedIds.has(m.id));

  // 4. 融合 4 类冲突
  const mergedCoTModules = mergeCoTModules(builtinModules, conflictCoTModules);
  const mergedFormatModules = mergeFormatModules(builtinModules, conflictFormatModules);
  const mergedPerspectiveModules = mergePerspectiveModules(builtinModules, conflictPerspectiveModules);
  const mergedActionOptionsModules = mergeActionOptionsModules(builtinModules, conflictActionOptionsModules);

  // 5. 组装最终模块列表
  // 策略：内置模块（含融合后的）+ ST 非冲突直入模块
  // 融合后的内置模块替换原内置模块，ST 直入模块追加到末尾
  const finalModules: 提示词模块[] = [];
  const usedBuiltinIds = new Set<string>([
    ...mergedCoTModules.map((m) => m.id),
    ...mergedFormatModules.map((m) => m.id),
    ...mergedPerspectiveModules.map((m) => m.id),
    ...mergedActionOptionsModules.map((m) => m.id),
  ]);

  // 先放未参与融合的内置模块
  for (const m of builtinModules) {
    if (!usedBuiltinIds.has(m.id)) {
      finalModules.push(m);
    }
  }
  // 再放融合后的内置模块（替换原内置）
  finalModules.push(...mergedCoTModules);
  finalModules.push(...mergedFormatModules);
  finalModules.push(...mergedPerspectiveModules);
  finalModules.push(...mergedActionOptionsModules);
  // 最后放 ST 非冲突直入模块
  finalModules.push(...directInjectModules);

  // 6. 按 order 升序排序
  return finalModules.sort((a, b) => a.order - b.order);
}

/**
 * 融合 CoT 思维链模块。
 * 内置骨架（Step0-14）不可改，ST 指令作为附加段。
 */
function mergeCoTModules(
  builtinModules: 提示词模块[],
  stCoTModules: 提示词模块[],
): 提示词模块[] {
  if (stCoTModules.length === 0) return [];
  // 只融合主剧情 CoT（builtin_main_plot_cot），其他 CoT（开局/狭间等）保持原样
  const builtinMainCot = builtinModules.find((m) => m.id === 'builtin_main_plot_cot');
  if (!builtinMainCot) return [];

  // 拼接 ST CoT 模块的内容作为附加段
  const stContent = stCoTModules
    .map((m) => m.content?.trim())
    .filter(Boolean)
    .join('\n\n');

  if (!stContent) return [];

  const mergedContent = `${builtinMainCot.content}\n\n---\n以下是预设的额外思考要求：\n${stContent}`;
  return [{
    ...builtinMainCot,
    content: mergedContent,
    title: `${builtinMainCot.title}（含预设融合）`,
    updatedAt: Date.now(),
  }];
}

/**
 * 融合输出格式模块。
 * 内置 4 标签协议不可改，ST 的字数/语言/风格要求作为附加段。
 */
function mergeFormatModules(
  builtinModules: 提示词模块[],
  stFormatModules: 提示词模块[],
): 提示词模块[] {
  if (stFormatModules.length === 0) return [];
  const builtinFormat = builtinModules.find((m) => m.id === BUILTIN_RESPONSE_FORMAT_ID);
  if (!builtinFormat) return [];

  const stContent = stFormatModules
    .map((m) => m.content?.trim())
    .filter(Boolean)
    .join('\n\n');

  if (!stContent) return [];

  const mergedContent = `${builtinFormat.content}\n\n---\n以下是预设的额外格式要求：\n${stContent}`;
  return [{
    ...builtinFormat,
    content: mergedContent,
    title: `${builtinFormat.title}（含预设融合）`,
    updatedAt: Date.now(),
  }];
}

/**
 * 融合人称视角模块。
 * 解析 ST 的人称要求，切换到内置对应人称模块 + ST 的视角要求作为附加段。
 */
function mergePerspectiveModules(
  builtinModules: 提示词模块[],
  stPerspectiveModules: 提示词模块[],
): 提示词模块[] {
  const builtinPerspectiveModules = builtinModules.filter((m) => BUILTIN_PERSPECTIVE_IDS.includes(m.id));
  if (stPerspectiveModules.length === 0) return builtinPerspectiveModules;

  // 解析 ST 的人称要求
  const stContent = stPerspectiveModules
    .map((m) => m.content?.trim())
    .filter(Boolean)
    .join('\n\n');

  // ST 的人称要求不能成为运行时事实源：游戏设置中的 narrativePerson
  // 以及 applyRuntimeNarrativePolicy 才决定三个人称模块的实际启用状态。
  // 这里仅保留为低优先级附加约束，方便用户继续使用预设中的语气/视角提示，
  // 同时避免导入预设时静默改写玩家已选择的人称。
  const perspectiveAddendum: 提示词模块 = {
    id: 'st_import_perspective_addendum',
    title: '预设附加视角要求（不覆盖游戏人称）',
    description: '保留 ST 预设中的视角提示，但不覆盖游戏设置中的叙述人称。',
    category: 'custom',
    content: [
      '以下是导入预设提供的附加视角要求，仅作为低优先级风格参考。',
      '不得据此修改或覆盖游戏设置中的当前叙述人称；如与当前人称执法块冲突，以当前人称执法块为准。',
      stContent,
    ].join('\n'),
    enabled: true,
    builtin: false,
    order: 1025,
    scope: ['main', 'opening'],
    role: 'system',
    injectionPosition: 0,
    injectionOrder: 1025,
    source: 'st_preset',
    replaceable: 'extensible',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return [...builtinPerspectiveModules, perspectiveAddendum];
}

/**
 * 融合行动选项模块。
 * 内置规范优先，ST 的样式要求作为附加段。
 */
function mergeActionOptionsModules(
  builtinModules: 提示词模块[],
  stActionOptionsModules: 提示词模块[],
): 提示词模块[] {
  if (stActionOptionsModules.length === 0) return [];
  const builtinAction = builtinModules.find((m) => m.id === BUILTIN_ACTION_OPTIONS_ID);
  if (!builtinAction) return [];

  const stContent = stActionOptionsModules
    .map((m) => m.content?.trim())
    .filter(Boolean)
    .join('\n\n');

  if (!stContent) return [];

  const mergedContent = `${builtinAction.content}\n\n---\n以下是预设的额外选项样式：\n${stContent}`;
  return [{
    ...builtinAction,
    content: mergedContent,
    title: `${builtinAction.title}（含预设融合）`,
    updatedAt: Date.now(),
  }];
}
