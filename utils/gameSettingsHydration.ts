import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import type { 提示词模块 } from '@/models/prompts';
import { BUILTIN_PROMPT_MODULE_IDS, LEGACY_BUILTIN_COT_ID, getDefaultModuleFields } from '@/models/prompts';
import type { 游戏设置 } from '@/models/settings';
import {
  创建默认游戏设置,
  归一化额外功能设置,
  归一化剧情编织系统设置,
  归一化手机系统设置,
  归一化文生图系统设置,
  归一化星际和平周报设置,
  归一化智库系统设置,
  归一化视觉文本设置,
  归一化记忆系统设置,
} from '@/models/settings';
import { isPlainRecord } from '@/utils/storageUtils';

/**
 * 游戏设置持久化边界（纯函数，无 storage / React 依赖）：
 * - `归一化游戏设置`：写入侧形状归一化，幂等。
 * - `hydratePersistedGameSettings`：读取侧旧档水合，接受 unknown、不修改入参、返回完整设置对象。
 */

/** 字段级收窄旧模块列表：只接受纯对象且带字符串 id 的条目，畸形条目在迁移时丢弃。 */
function 取提示词模块列表(value: unknown): 提示词模块[] {
  if (!Array.isArray(value)) return [];
  const list = value as unknown[];
  return list.filter(
    (item): item is 提示词模块 => isPlainRecord(item) && typeof item.id === 'string',
  );
}

/** 提示词模块迁移：内置模块以源码为准，只保留用户可调开关与时间戳；旧 customPrompt 转 legacy_custom 模块。 */
export function migratePromptModules(savedGame: {
  promptModules?: unknown;
  customPrompt?: unknown;
}): 提示词模块[] {
  const builtins = createBuiltinPromptModules();
  const saved = 取提示词模块列表(savedGame.promptModules);

  // 旧版 'builtin_cot' 已拆分为 opening_cot + main_plot_cot。
  // 如果老存档里有 builtin_cot，把它的 enabled 同步到两个新模块（content 用新版骨架，不保留老 12 步整段）。
  const legacyCot = saved.find((m) => m.id === LEGACY_BUILTIN_COT_ID);

  const mergedBuiltins = builtins.map((b) => {
    const hit = saved.find((m) => m.id === b.id);
    if (hit) {
      // 内置模块 content / title / description / scope / category / order 永远以源码为准(UI 上对内置为只读),
      // 只保留用户可调的主剧情 enabled / 时间戳。否则 IndexedDB 里持久化的旧 content / 旧 order
      // 会反向覆盖源码更新,导致改了源码但跑出旧 prompt / 旧 order 区间。
      // calibration/独立模型模块只是服务层真实 prompt 的只读展示，不是 API 开关；旧存档里曾关闭也必须拉回展示状态。
      // 方案 A 三层 order 区间迁移：旧存档 order 是 5-90 区间，新源码 order 是 5-1043（Tier 1: 1-99 / Tier 2: 100-999 ST / Tier 3: 1000+ 压轴）。
      // 强制用 b.order（源码定义），旧存档自动迁移到新 order 区间。
      const isCalibrationBuiltin = b.scope.includes('calibration');
      return {
        ...b,
        enabled: isCalibrationBuiltin ? true : hit.enabled,
        createdAt: hit.createdAt,
        updatedAt: hit.updatedAt,
      };
    }
    if (legacyCot && (b.id === 'builtin_opening_cot' || b.id === 'builtin_main_plot_cot')) {
      return { ...b, enabled: legacyCot.enabled };
    }
    return b;
  });

  const builtinIdSet = new Set<string>(BUILTIN_PROMPT_MODULE_IDS);
  const seenIds = new Set<string>();
  const customs = saved.filter((m) => {
    if (builtinIdSet.has(m.id)) return false;
    if (m.id === LEGACY_BUILTIN_COT_ID) return false;
    // V1 转译/二创残留：st_import_* / adapted_*，迁移时直接丢弃
    if (m.id.startsWith('st_import_') || m.id.startsWith('adapted_')) return false;
    if (seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    return true;
  });

  // 旧存档的自定义模块可能缺少默认字段，用默认值兜底
  const customsWithDefaults = customs.map((m) => {
    // 归一化入口：IndexedDB 旧存档可能缺 description 或非 string，集中兜底为 string，
    // 避免下游 replaceMode 推断裸调用 .startsWith 导致启动崩溃。
    const rawDescription = typeof m.description === 'string' ? m.description : '';
    const replaceMode = m.replaceMode ?? (rawDescription.startsWith('替换') ? 'replace' : 'coexist');
    const description = rawDescription.replace(/^(替换|叠加)\s*·\s*/, '');
    return {
      ...getDefaultModuleFields(),
      source: 'user' as const,
      replaceable: 'replaceable' as const,
      ...m,
      description,
      replaceMode,
    };
  });

  const hasLegacy = customsWithDefaults.some((m) => m.id === 'legacy_custom');
  const legacyCustomPrompt = typeof savedGame.customPrompt === 'string' ? savedGame.customPrompt : '';
  if (!hasLegacy && legacyCustomPrompt.trim()) {
    const now = Date.now();
    customsWithDefaults.push({
      ...getDefaultModuleFields(),
      source: 'user',
      replaceable: 'replaceable',
      replaceMode: 'coexist',
      id: 'legacy_custom',
      title: '旧版自定义提示词',
      description: '自旧版「额外指示」迁移而来。可自由编辑或删除。',
      category: 'custom',
      content: legacyCustomPrompt,
      enabled: true,
      builtin: false,
      order: 900,
      scope: ['all'],
      createdAt: now,
      updatedAt: now,
    });
  }

  return [...mergedBuiltins, ...customsWithDefaults];
}

/** gameSettings 整体归一化：组合各子系统归一化器（对来自 state 的合法对象幂等保持结构不变）。 */
export function 归一化游戏设置(settings: 游戏设置): 游戏设置 {
  return {
    ...settings,
    新闻系统: 归一化星际和平周报设置(settings.新闻系统),
    手机系统: 归一化手机系统设置(settings.手机系统),
    智库系统: 归一化智库系统设置(settings.智库系统),
    剧情编织系统: 归一化剧情编织系统设置(settings.剧情编织系统),
    记忆系统: 归一化记忆系统设置(settings.记忆系统),
    文生图系统: 归一化文生图系统设置(settings.文生图系统),
    visualTextSettings: 归一化视觉文本设置(settings.visualTextSettings),
    额外功能: 归一化额外功能设置(settings.额外功能),
  };
}

export interface HydratedGameSettings {
  settings: 游戏设置;
  macroGlobalVars: Record<string, string>;
  worldbookTriggerStates: Record<string, number>;
}

function 取运行态表<T>(value: unknown): Record<string, T> {
  return value !== null && typeof value === 'object' ? (value as Record<string, T>) : {};
}

/** 旧档水合：未知输入先收窄为纯对象，再套用当前默认与子系统归一化，入参永不被修改。 */
export function hydratePersistedGameSettings(input: unknown): HydratedGameSettings {
  const defaults = 创建默认游戏设置();
  const source = isPlainRecord(input) ? input : {};
  // V1 预设字段只在旧存档中存在，读取时丢弃，避免通过对象展开再次持久化。
  // 运行态键（片 5a-2 D3）从旧 gameSettings 残留中剥离并单独返回，不进入内存设置。
  const {
    stPresets: _stPresets,
    currentStPresetId: _currentStPresetId,
    stWorldInfos: _stWorldInfos,
    macroGlobalVars: _residualMacroGlobalVars,
    worldbookTriggerStates: _residualWorldbookTriggerStates,
    ...savedGameWithoutV1Preset
  } = source;
  void _stPresets;
  void _currentStPresetId;
  void _stWorldInfos;

  const partialSavedGame = savedGameWithoutV1Preset as Partial<游戏设置>;
  const merged: 游戏设置 = {
    ...defaults,
    ...savedGameWithoutV1Preset,
    新闻系统: 归一化星际和平周报设置(partialSavedGame.新闻系统),
    手机系统: 归一化手机系统设置(partialSavedGame.手机系统),
    智库系统: 归一化智库系统设置(partialSavedGame.智库系统),
    剧情编织系统: 归一化剧情编织系统设置(partialSavedGame.剧情编织系统),
    文生图系统: 归一化文生图系统设置(partialSavedGame.文生图系统),
    记忆系统: 归一化记忆系统设置(partialSavedGame.记忆系统),
    额外功能: 归一化额外功能设置(partialSavedGame.额外功能),
    variableApi: partialSavedGame.variableApi ?? defaults.variableApi,
    enableClaudeMode: partialSavedGame.enableClaudeMode ?? defaults.enableClaudeMode,
    deepSeekMainMode: partialSavedGame.deepSeekMainMode ?? defaults.deepSeekMainMode,
    backgroundTaskMode: partialSavedGame.backgroundTaskMode ?? defaults.backgroundTaskMode,
    enableCacheDiagnostics: partialSavedGame.enableCacheDiagnostics ?? defaults.enableCacheDiagnostics,
    enableMaleNsfwArchive: partialSavedGame.enableMaleNsfwArchive ?? defaults.enableMaleNsfwArchive,
    enablePlayerSpeechExpansion: partialSavedGame.enableNoControl
      ? false
      : partialSavedGame.enablePlayerSpeechExpansion ?? false,
    visualTextSettings: 归一化视觉文本设置(partialSavedGame.visualTextSettings),
    promptModules: migratePromptModules(savedGameWithoutV1Preset),
  };
  // 迁移后清空 legacy customPrompt，避免下次启动重复追加（兼容读取经独立结构类型，避免触发废弃成员检查）。
  if (merged.promptModules.some((m) => m.id === 'legacy_custom')) {
    (merged as { customPrompt?: string }).customPrompt = '';
  }

  return {
    settings: merged,
    macroGlobalVars: 取运行态表<string>(_residualMacroGlobalVars),
    worldbookTriggerStates: 取运行态表<number>(_residualWorldbookTriggerStates),
  };
}
