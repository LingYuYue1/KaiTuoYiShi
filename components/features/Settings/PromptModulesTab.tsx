import { useEffect, useMemo, useState } from 'react';
import type { 游戏设置, API设置, API配置项 } from '@/models/settings';
import type { 提示词模块, 提示词模块类目, 提示词模块作用域 } from '@/models/prompts';
import {
  PROMPT_MODULE_CATEGORY_LABELS,
  PROMPT_MODULE_SCOPE_LABELS,
  isBuiltinPromptModule,
  getDefaultModuleFields,
  syncStoryModeModuleEnabled,
} from '@/models/prompts';
import type { 剧情模式 } from '@/models/journey';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import {
  parseSTPresetV2,
  parseSTPresetWithDetection,
  isSTImportedModule,
  detectSTCoTModules,
  detectSTFormatModules,
  BUILTIN_MAIN_COT_ID,
  BUILTIN_RESPONSE_FORMAT_ID,
} from '@/utils/stPresetParser';
import type { STPresetEntry, STPresetEntryV2, STSamplingParams, STWorldInfoEntry } from '@/models/stTypes';
import { getBuiltinPresets, getBuiltinPresetsV2 } from '@/data/builtinPresets';
import { BUILTIN_PRESET_ID } from '@/data/builtinPresets/builtinPreset';
import type { 世界书 } from '@/models/worldbook';
import { analyzeTavernRegexScript, dryRunTavernRegexScript, extractTavernRegexScripts } from '@/hooks/useGame/tavernRegexProcessor';
import { DndContext, closestCenter, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const isMainPlotModule = (m: 提示词模块) => !m.scope?.includes('calibration');
const isOtherSystemModule = (m: 提示词模块) => m.scope?.includes('calibration');
const isNativePromptModule = (m: 提示词模块) =>
  !isSTImportedModule(m) && !m.id.startsWith('adapted_');

/** 独立系统分组映射：calibration 模块按子系统归类 */
const CALIBRATION_SYSTEM_GROUPS: Record<string, { label: string; icon: string; emoji: string; match: (id: string) => boolean }> = {
  news: { label: '新闻系统', icon: '◈', emoji: '🗞️', match: (id) => id === 'builtin_news_cot' || id === 'builtin_news_worldbook' || id === 'builtin_news_output_format' || id.startsWith('st_import_news_') || id.startsWith('custom_news_') },
  phone: { label: '手机系统', icon: '◈', emoji: '📱', match: (id) => id === 'builtin_phone_cot' || id === 'builtin_phone_worldbook' || id === 'builtin_phone_output_format' || id.startsWith('st_import_phone_') || id.startsWith('custom_phone_') },
  zhiku: { label: '智库系统', icon: '◈', emoji: '📚', match: (id) => id === 'builtin_zhiku_cot' || id === 'builtin_zhiku_output_format' || id.startsWith('st_import_zhiku_') || id.startsWith('custom_zhiku_') },
  yiting: { label: '忆庭系统', icon: '◈', emoji: '🧠', match: (id) => id === 'builtin_yiting_recall' || id === 'builtin_yiting_archive_format' || id.startsWith('st_import_yiting_') || id.startsWith('custom_yiting_') },
  variable: { label: '变量系统', icon: '◈', emoji: '⚙️', match: (id) => id === 'builtin_variable_cot' || id === 'builtin_variable_worldbook' || id === 'builtin_variable_output_format' || id.startsWith('st_import_variable_') || id.startsWith('custom_variable_') },
  companionArchive: { label: '伙伴档案', icon: '◈', emoji: '👥', match: (id) => id === 'builtin_companion_archive_worldbook' || id.startsWith('st_import_companion_archive_') || id.startsWith('custom_companionArchive_') },
  storyWeaving: { label: '剧情编织系统', icon: '◈', emoji: '📖', match: (id) => id === 'builtin_story_weaving_cot' || id === 'builtin_story_weaving_worldbook' || id === 'builtin_story_weaving_output_format' || id.startsWith('st_import_story_weaving_') || id.startsWith('custom_storyWeaving_') },
};
const CALIBRATION_GROUP_ORDER = ['news', 'phone', 'zhiku', 'yiting', 'variable', 'companionArchive', 'storyWeaving'] as const;

/** 根据模块 id 获取所属的系统分组 key，不属于任何已知系统的归入 'other' */
const getCalibrationGroupKey = (m: 提示词模块): string => {
  for (const key of CALIBRATION_GROUP_ORDER) {
    if (CALIBRATION_SYSTEM_GROUPS[key].match(m.id)) return key;
  }
  return 'other';
};

/** 文风模块互斥组：同一时间只能启用一个。ST 预设导入的文风（id 含 'st_import_' 前缀）也加入此组。 */
const WRITING_STYLE_MODULE_IDS = new Set([
  'builtin_writing_style',
  'builtin_writing_style_hsr',
  'builtin_writing_style_baimiao',
  'builtin_writing_style_custom',
]);
const isWritingStyleModule = (m: 提示词模块) =>
  WRITING_STYLE_MODULE_IDS.has(m.id) || m.id.startsWith('st_import_writing_style_');

/** 判断模块是否为"原生预设提示词"(关闭时需弹窗确认)。
 *  - source='builtin'：原生内置模块
 *  - id 以 adapted_ 开头：二创成品融合模块
 *  - 排除 adapted_placeholder_*：占位说明模块，无需弹窗
 *  这两类模块若被关闭可能影响游戏体验，故关闭前给玩家一次确认机会。 */
const isBuiltinPresetModule = (m: 提示词模块) => {
  if (m.id.startsWith('adapted_placeholder_')) return false;
  return m.source === 'builtin' || m.id.startsWith('adapted_');
};

// isSTImportedModule 从 stPresetParser 复用（systemPromptBuilder 也用同一份判断）


/** 从 ST 导入模块的 id 解析它替换的内置模块类别（用于显示替换关系提示）。
 *  命名约定：st_import_<category>_<timestamp>，例如 st_import_writing_style_1719400000000。 */
const ST_IMPORT_CATEGORY_PREFIX = 'st_import_';
const getSTImportTargetCategory = (m: 提示词模块): 提示词模块类目 | null => {
  if (!isSTImportedModule(m)) return null;
  // st_import_writing_style_xxx → style
  // st_import_persona_xxx → persona
  const rest = m.id.slice(ST_IMPORT_CATEGORY_PREFIX.length);
  if (rest.startsWith('writing_style')) return 'style';
  if (rest.startsWith('persona')) return 'persona';
  if (rest.startsWith('cot')) return 'cot';
  if (rest.startsWith('format')) return 'format';
  if (rest.startsWith('devmode')) return 'devmode';
  if (rest.startsWith('jailbreak')) return 'jailbreak';
  return m.category;
};

/** 分类语义色：每个类目对应一个 CSS 变量（RGB 三元组），用于分组图标与类目标签着色。
 *  - cot 思维链 → sage-soft 绿（思考/推理）
 *  - format 输出格式 → accent-secondary 副色（结构化）
 *  - persona 叙述人格 → amber-soft 琥珀（人格/温暖）
 *  - devmode 开发模式 → danger 红（特殊/危险模式）
 *  - jailbreak 越狱 → ui-nsfw 粉（NSFW/越狱解锁，ST 预设常见）
 *  - style 文风 → accent-primary 主色（主轴）
 *  - custom 自定义 → text-secondary 中性（用户自建）
 */
const CATEGORY_COLOR_VAR: Record<提示词模块类目, string> = {
  cot: '--tj-sage-soft',
  format: '--tj-accent-secondary',
  persona: '--tj-amber-soft',
  devmode: '--tj-danger',
  jailbreak: '--tj-ui-nsfw',
  style: '--tj-accent-primary',
  storymode: '--tj-tech-blue',
  custom: '--tj-text-secondary',
};

interface Props {
  settings: 游戏设置;
  onChange: (s: 游戏设置) => void;
  mode?: 'modules' | 'tavern';
  /** 当前剧情模式：剧情方向模块(builtin_storymode_*)四选一，其开关显示与锁定状态由它派生。 */
  storyMode?: 剧情模式;
  /** Phase 7.2：世界书数组（ST 预设导入时注入 ST 世界书条目）。 */
  worldbooks: 世界书[];
  /** Phase 7.2：世界书变更回调（由父级负责持久化到 IndexedDB）。 */
  onWorldbooksChange: (books: 世界书[]) => void;
  /** Phase 8：API 设置（切换预设时同步采样参数到当前激活配置）。 */
  apiSettings: API设置;
  /** Phase 8：API 设置变更回调（由父级负责持久化）。 */
  onApiSettingsChange: (s: API设置) => void;
}

// ── Phase 8：采样参数同步辅助函数 ──────────────────────────────────
/** 从 API 配置项提取采样参数快照（用于切走带参数预设时备份原始值）。 */
function extractSamplingParams(config: API配置项): STSamplingParams {
  return {
    temperature: config.temperature,
    topP: config.topP,
    topK: config.topK,
    topA: config.topA,
    minP: config.minP,
    repetitionPenalty: config.repetitionPenalty,
    frequencyPenalty: config.frequencyPenalty,
    presencePenalty: config.presencePenalty,
    maxContext: config.maxContext,
    maxTokens: config.maxTokens,
  };
}

/** 把采样参数覆盖到 API 配置项（仅覆盖 params 中明确指定的字段，其余保留原值）。 */
function applySamplingParams(config: API配置项, params: STSamplingParams | null | undefined): API配置项 {
  if (!params) return config;
  return {
    ...config,
    temperature: params.temperature ?? config.temperature,
    topP: params.topP ?? config.topP,
    topK: params.topK ?? config.topK,
    topA: params.topA ?? config.topA,
    minP: params.minP ?? config.minP,
    repetitionPenalty: params.repetitionPenalty ?? config.repetitionPenalty,
    frequencyPenalty: params.frequencyPenalty ?? config.frequencyPenalty,
    presencePenalty: params.presencePenalty ?? config.presencePenalty,
    maxContext: params.maxContext ?? config.maxContext,
    maxTokens: params.maxTokens ?? config.maxTokens,
  };
}

/** 计算切换预设后 API 配置与备份的新状态。
 *  - 切到带 samplingParams 的预设：首次备份当前 API 参数到 stPresetApiBackup，应用预设参数
 *  - 切到无参数预设/null：若存在备份则恢复并清空备份
 *  返回 nextApiConfigs（新 configs 数组，仅替换激活项）和 nextBackup。 */
function computePresetSwitchApiChange(
  configs: API配置项[],
  activeConfigId: string | null,
  currentBackup: STSamplingParams | null | undefined,
  targetSampling: STSamplingParams | undefined,
): { nextConfigs: API配置项[]; nextBackup: STSamplingParams | null } {
  const activeIndex = configs.findIndex((c) => c.id === activeConfigId);
  if (activeIndex < 0) {
    // 找不到激活配置，不动 API，但按逻辑处理 backup
    if (targetSampling) {
      return { nextConfigs: configs, nextBackup: currentBackup ?? null };
    }
    return { nextConfigs: configs, nextBackup: null };
  }
  const activeConfig = configs[activeIndex];
  if (targetSampling) {
    // 切到带参数预设：首次进入才备份（已有备份则保留，避免连环覆盖丢失原始值）
    const nextBackup = currentBackup ?? extractSamplingParams(activeConfig);
    const nextConfig = applySamplingParams(activeConfig, targetSampling);
    return {
      nextConfigs: configs.map((c, i) => (i === activeIndex ? nextConfig : c)),
      nextBackup,
    };
  }
  // 切到无参数预设/null：有备份则恢复，无备份则不动
  if (currentBackup) {
    const nextConfig = applySamplingParams(activeConfig, currentBackup);
    return {
      nextConfigs: configs.map((c, i) => (i === activeIndex ? nextConfig : c)),
      nextBackup: null,
    };
  }
  return { nextConfigs: configs, nextBackup: null };
}

const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

const TAVERN_RUNTIME_SLOT_IDS = new Set([
  'worldInfoBefore',
  'worldInfoAfter',
  'chatHistory',
  'personaDescription',
  'userInput',
  'user_input',
  'latestUserInput',
  'input',
]);

const ADVANCED_MACRO_RE = /\{\{\s*(?:setvar|setglobalvar|getvar|getglobalvar|if\b|else|\/if|random|pick|pick_var|roll:|[.$][^}]+|bias::|trim::|lower::|upper::)/gi;
const BASIC_MACRO_RE = /\{\{\s*(?:char|user|time|date|datetime|model|messageCount|turnCount|lastMessage|lastUserMessage|lastCharMessage|newline|noop)\s*\}\}/gi;

type TavernMacroLevel = 'none' | 'basic' | 'advanced';

function detectTavernMacroInfo(content: string): { level: TavernMacroLevel; macros: string[] } {
  const advanced = content.match(ADVANCED_MACRO_RE) ?? [];
  if (advanced.length > 0) return { level: 'advanced', macros: Array.from(new Set(advanced)).slice(0, 8) };
  const basic = content.match(BASIC_MACRO_RE) ?? [];
  if (basic.length > 0) return { level: 'basic', macros: Array.from(new Set(basic)).slice(0, 8) };
  return { level: 'none', macros: [] };
}

function getPresetWorldInfoEntries(worldInfo: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(worldInfo)) return worldInfo.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  if (worldInfo && typeof worldInfo === 'object') {
    return Object.values(worldInfo).filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object');
  }
  return [];
}

function getPresetWorldInfoViewEntries(worldInfo: unknown): Array<{ key: string; entry: Record<string, unknown> }> {
  if (Array.isArray(worldInfo)) {
    return worldInfo
      .map((entry, index) => ({ key: String(index), entry }))
      .filter((item): item is { key: string; entry: Record<string, unknown> } => Boolean(item.entry) && typeof item.entry === 'object');
  }
  if (worldInfo && typeof worldInfo === 'object') {
    return Object.entries(worldInfo)
      .map(([key, entry]) => ({ key, entry }))
      .filter((item): item is { key: string; entry: Record<string, unknown> } => Boolean(item.entry) && typeof item.entry === 'object');
  }
  return [];
}

function readPresetWorldInfoText(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function readPresetWorldInfoKeys(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => readPresetWorldInfoText(item).trim()).filter(Boolean)
    : [];
}

function getPresetWorldInfoTitle(entry: Record<string, unknown>, index: number): string {
  return readPresetWorldInfoText(entry.comment) || readPresetWorldInfoText(entry.title) || `world_info_${readPresetWorldInfoText(entry.uid) || index + 1}`;
}

function isPresetWorldInfoEnabled(entry: Record<string, unknown>): boolean {
  return entry.enabled !== false && entry.disable !== true && entry.disabled !== true;
}

function isPresetWorldInfoConstant(entry: Record<string, unknown>): boolean {
  return entry.constant === true || entry.constant === 1 || entry.constant === 'true';
}

const DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE = `<正文>
星在匹诺康尼的走廊停下脚步，望向梦境酒店尽头的光。
</正文>
<行动选项>
1. 继续调查梦境酒店
2. 询问同伴的看法
</行动选项>`;

function readPresetRegexText(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function getPresetRegexTitle(script: Record<string, unknown>, index: number): string {
  return (
    readPresetRegexText(script.script_name).trim() ||
    readPresetRegexText(script.scriptName).trim() ||
    readPresetRegexText(script.name).trim() ||
    readPresetRegexText(script.id).trim() ||
    `regex_script_${index + 1}`
  );
}

function getPresetRegexFindText(script: Record<string, unknown>): string {
  return readPresetRegexText(script.find_regex) || readPresetRegexText(script.findRegex) || readPresetRegexText(script.find);
}

function getPresetRegexReplaceText(script: Record<string, unknown>): string {
  return readPresetRegexText(script.replace_string) || readPresetRegexText(script.replaceString) || readPresetRegexText(script.replace);
}

function getPresetRegexKindLabel(kind: ReturnType<typeof analyzeTavernRegexScript>['kind']): string {
  if (kind === 'prompt_preprocess') return '提示词预处理';
  if (kind === 'output_postprocess') return '输出后处理';
  if (kind === 'display_replace') return '显示层替换';
  return '阻断';
}

function isRegexScriptDisabled(script: Record<string, unknown>): boolean {
  return script.disabled === true || script.disabled === 1 || script.disabled === 'true';
}

function isRiskyRegexScript(script: Record<string, unknown>): boolean {
  const name = String(script.script_name ?? script.name ?? script.id ?? '');
  const find = String(script.find_regex ?? script.findRegex ?? script.find ?? '');
  const replace = String(script.replace_string ?? script.replaceString ?? script.replace ?? '');
  const placement = JSON.stringify(script.placement ?? script.placements ?? '');
  const combined = `${name}\n${find}\n${replace}\n${placement}`;
  return /<\s*(正文|短期记忆|动态世界|行动选项|变量草稿|变量更新|天气|剧情规划)\s*>|<\/\s*(正文|短期记忆|动态世界|行动选项|变量草稿|变量更新|天气|剧情规划)\s*>|css|dom|display|html|style|显示|界面|全局/i.test(combined);
}

function TogglePill({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className="inline-flex items-center gap-2 text-xs transition-all disabled:cursor-not-allowed"
      style={{ color: checked ? 'rgba(var(--tj-ui-nsfw), 0.92)' : 'rgba(var(--tj-text-secondary), 0.58)' }}
    >
      {label && <span>{label}</span>}
      <span
        className="relative inline-flex h-5 w-9 items-center"
        style={{
          background: checked ? 'rgba(var(--tj-ui-nsfw), 0.2)' : 'rgba(var(--tj-bg-primary), 0.42)',
          boxShadow: `inset 0 0 0 1px ${checked ? 'rgba(var(--tj-ui-nsfw), 0.42)' : 'rgba(var(--tj-text-secondary), 0.18)'}`,
          clipPath: smallClip,
          opacity: disabled ? 0.62 : 1,
        }}
      >
        <span
          className="absolute top-1 h-3 w-3 transition-all"
          style={{
            left: checked ? 'calc(100% - 1rem)' : '0.25rem',
            background: checked ? 'rgba(var(--tj-ui-nsfw), 0.95)' : 'rgba(var(--tj-text-secondary), 0.66)',
            clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
          }}
        />
      </span>
    </button>
  );
}

export function PromptModulesTab({ settings, onChange, mode = 'modules', storyMode, worldbooks, onWorldbooksChange, apiSettings, onApiSettingsChange }: Props) {
  const isTavernMode = mode === 'tavern';
  const modules = syncStoryModeModuleEnabled(settings.promptModules, storyMode);
  /** 全部可选预设：内置预设（原生 / 二创成品）+ 玩家导入预设。切换 UI 与 switchPreset 统一用此数组查找。
   *  去重：若玩家导入预设与内置预设同名（如早期测试导入的双人成行），只保留内置版本。 */
  const allPresets = useMemo<STPresetEntry[]>(() => {
    const builtins = getBuiltinPresets();
    const builtinNames = new Set(builtins.map((p) => p.name));
    const userPresets = (settings.stPresets ?? []).filter((p) => !builtinNames.has(p.name));
    return [...builtins, ...userPresets];
  }, [settings.stPresets]);
  /** 当前激活预设的显示名（用于 header 显示"当前使用预设：XXX"） */
  const currentPresetName = useMemo(() => {
    const id = settings.currentStPresetId ?? BUILTIN_PRESET_ID;
    return allPresets.find((p) => p.id === id)?.name ?? null;
  }, [allPresets, settings.currentStPresetId]);
  const currentV2Preset = useMemo(() => {
    const id = settings.currentStPresetIdV2 ?? null;
    return [...getBuiltinPresetsV2(), ...(settings.stPresetsV2 ?? [])].find((p) => p.id === id) ?? null;
  }, [settings.currentStPresetIdV2, settings.stPresetsV2]);
  const allPresetsV2 = useMemo<STPresetEntryV2[]>(
    () => [...getBuiltinPresetsV2(), ...(settings.stPresetsV2 ?? [])],
    [settings.stPresetsV2],
  );
  const sorted = useMemo(
    () => [...modules].sort((a, b) => a.order - b.order),
    [modules],
  );
  const [selectedId, setSelectedId] = useState<string | null>(sorted[0]?.id ?? null);
  const nativeSorted = useMemo(
    () => sorted.filter(isNativePromptModule),
    [sorted],
  );
  const selectedPool = isTavernMode ? sorted : nativeSorted;
  const selected = selectedPool.find((m) => m.id === selectedId) ?? selectedPool[0];
  // 系统切换：主剧情 / 独立模型
  const [activeSystem, setActiveSystem] = useState<'main' | 'calibration'>('main');
  const [showAddModal, setShowAddModal] = useState(false);
  const visibleModules = useMemo(
    () => nativeSorted.filter(activeSystem === 'main' ? isMainPlotModule : isOtherSystemModule),
    [nativeSorted, activeSystem],
  );

  // ── 旧 V1 导入清理 ──────────────────────────────────────────────────
  // V1 路线已废弃：不再把 st_import_* 归档成预设，也不再保留 adapted_* 二创残留。
  // 酒馆预设只走 Tavern 原结构（stPresetsV2 / prompt_order）。
  useEffect(() => {
    const hasLegacyModules = modules.some((m) => isSTImportedModule(m) || m.id.startsWith('adapted_'));
    const hasLegacyPresetState = Boolean(settings.currentStPresetId) || (settings.stPresets?.length ?? 0) > 0;
    if (hasLegacyModules || hasLegacyPresetState) {
      const cleanedModules = modules.filter((m) => !isSTImportedModule(m) && !m.id.startsWith('adapted_'));
      onChange({
        ...settings,
        promptModules: cleanedModules,
        stPresets: [],
        currentStPresetId: null,
      });
      console.info('[酒馆预设] 已清理旧 V1 / 二创提示词模块残留', {
        removedModules: modules.length - cleanedModules.length,
      });
    }
    // 仅挂载时执行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (next: 提示词模块[]) => {
    // ST 预设兼容：如果当前激活了预设，编辑 st_import_* 模块时自动写回所属预设。
    // 防止玩家切换预设后修改丢失。
    const currentPresetId = settings.currentStPresetId;
    if (currentPresetId && settings.stPresets) {
      const preset = settings.stPresets.find((p) => p.id === currentPresetId);
      if (preset) {
        // 用 next 中所有 st_import_* 模块覆盖该预设的 modules
        const stModulesInNext = next.filter(isSTImportedModule);
        // 只在 ST 模块数量或内容变化时写回，避免无谓 setState
        const oldIds = preset.modules.map((m) => `${m.id}:${m.updatedAt}`).join('|');
        const newIds = stModulesInNext.map((m) => `${m.id}:${m.updatedAt}`).join('|');
        if (oldIds !== newIds) {
          const updatedPreset: STPresetEntry = {
            ...preset,
            modules: stModulesInNext,
            updatedAt: Date.now(),
          };
          onChange({
            ...settings,
            promptModules: next,
            stPresets: settings.stPresets.map((p) =>
              p.id === currentPresetId ? updatedPreset : p,
            ),
          });
          return;
        }
      }
    }
    onChange({ ...settings, promptModules: next });
  };

  const patch = (id: string, partial: Partial<提示词模块>) => {
    // 文风互斥：启用某个文风模块时，关闭其他文风模块
    if (partial.enabled === true) {
      const target = modules.find((m) => m.id === id);
      if (target && isWritingStyleModule(target)) {
        const next = modules.map((m) =>
          m.id === id
            ? { ...m, ...partial, updatedAt: Date.now() }
            : isWritingStyleModule(m) && m.enabled
              ? { ...m, enabled: false, updatedAt: Date.now() }
              : m,
        );
        update(next);
        return;
      }
    }
    update(
      modules.map((m) =>
        m.id === id ? { ...m, ...partial, updatedAt: Date.now() } : m,
      ),
    );
  };

  // 拖拽排序回调：按新顺序回写 modules，仅替换 order 变化的条目，避免不必要重渲染
  const reorderModules = (reordered: 提示词模块[]) => {
    const next = modules.map((m) => {
      const updated = reordered.find((r) => r.id === m.id);
      return updated && updated.order !== m.order ? updated : m;
    });
    update(next);
  };

  const addCustomModule = (
    systemKey: string,
    category: 提示词模块类目,
    replaceMode: 'replace' | 'coexist',
  ) => {
    const now = Date.now();
    const newId = `custom_${systemKey}_${category}_${now}`;
    const isCal = systemKey !== 'main';
    const scope: 提示词模块作用域[] = isCal ? ['calibration'] : ['all'];
    const systemLabel = systemKey === 'main' ? '主剧情' : (CALIBRATION_SYSTEM_GROUPS[systemKey]?.label ?? systemKey);
    const catLabel = PROMPT_MODULE_CATEGORY_LABELS[category];

    const targetModules = isCal
      ? modules.filter((m) => CALIBRATION_SYSTEM_GROUPS[systemKey]?.match(m.id))
      : modules.filter(isMainPlotModule);
    const nextOrder = (targetModules.length > 0 ? Math.max(...targetModules.map((m) => m.order)) : 0) + 10;

    const created: 提示词模块 = {
      ...getDefaultModuleFields(),
      source: 'user',
      replaceable: 'replaceable',
      id: newId,
      title: `${systemLabel} · ${catLabel}`,
      description: `${replaceMode === 'replace' ? '替换' : '叠加'} · ${systemLabel} · ${catLabel}`,
      category,
      content: '',
      enabled: true,
      builtin: false,
      order: nextOrder,
      scope,
      createdAt: now,
      updatedAt: now,
    };

    let next = [...modules, created];
    if (replaceMode === 'replace') {
      next = next.map((m) => {
        if (!isBuiltinPromptModule(m.id)) return m;
        const sameSystem = isCal
          ? !!CALIBRATION_SYSTEM_GROUPS[systemKey]?.match(m.id)
          : isMainPlotModule(m);
        const sameCategory = m.category === category;
        if (sameSystem && sameCategory && m.enabled) {
          return { ...m, enabled: false, updatedAt: now };
        }
        return m;
      });
    }

    update(next);
    setSelectedId(newId);
    setShowAddModal(false);
  };

  const isCustomWritingStyleSlot = (id: string) => id === 'builtin_writing_style_custom';

  const removeModule = (id: string) => {
    if (isBuiltinPromptModule(id) || isCustomWritingStyleSlot(id)) return;
    const target = modules.find((m) => m.id === id);
    let next = modules.filter((m) => m.id !== id);
    if (target && target.description?.startsWith('替换')) {
      const isCal = target.scope?.includes('calibration');
      next = next.map((m) => {
        if (!isBuiltinPromptModule(m.id) || m.enabled) return m;
        const sameSystem = isCal
          ? !!Object.values(CALIBRATION_SYSTEM_GROUPS).find((g) => g.match(m.id) && g.match(id))
          : isMainPlotModule(m) && isMainPlotModule(target);
        const sameCategory = m.category === target.category;
        if (sameSystem && sameCategory) {
          return { ...m, enabled: true, updatedAt: Date.now() };
        }
        return m;
      });
    }
    update(next);
    if (selectedId === id) setSelectedId(next[0]?.id ?? null);
  };

  const resetBuiltins = () => {
    if (!confirm('确定将所有内置模块的内容/标题恢复为初始？\n（自定义模块不会被删除，玩家修改过的主剧情内置 enabled 状态会被保留；独立模型展示模块会保持展示状态）')) {
      return;
    }
    const fresh = createBuiltinPromptModules();
    const next = modules.map((m) => {
      if (!isBuiltinPromptModule(m.id)) return m;
      const def = fresh.find((f) => f.id === m.id);
      if (!def) return m;
      const isCalibrationBuiltin = def.scope?.includes('calibration');
      // 保留玩家当前的主剧情 enabled，覆盖其它字段；独立模型展示模块不作为真实请求开关。
      return {
        ...def,
        enabled: isCalibrationBuiltin ? true : m.enabled,
        createdAt: m.createdAt,
        updatedAt: Date.now(),
      };
    });
    // 若某条 builtin 被异常删除，补回
    for (const def of fresh) {
      if (!next.find((m) => m.id === def.id)) next.push(def);
    }
    update(next);
  };

  /** ST 预设冲突自动处理（已反转）：检测玩家导入预设中的 CoT/格式，自动关闭导入预设的冲突模块，
   *  保留内置 main_plot_cot/response_format 不动。避免玩家导入的预设破坏游戏核心协议。
   *  返回调整后的 incomingStModules 数组 + 冲突提示文案（用于 alert）。
   */
  const handleSTCoTFormatConflict = (
    incomingStModules: 提示词模块[],
    preserved: 提示词模块[],
  ): { adjusted: 提示词模块[]; conflictNote: string } => {
    const cotIds = detectSTCoTModules(incomingStModules);
    const formatIds = detectSTFormatModules(incomingStModules);
    const hasCoTConflict = cotIds.length > 0;
    const hasFormatConflict = formatIds.length > 0;
    if (!hasCoTConflict && !hasFormatConflict) {
      return { adjusted: incomingStModules, conflictNote: '' };
    }
    const now = Date.now();
    const conflictIds = new Set([...cotIds, ...formatIds]);
    // 反转逻辑：关闭玩家导入预设中的冲突模块，保留内置模块不动
    const adjusted = incomingStModules.map((m) => {
      if (conflictIds.has(m.id) && m.enabled) {
        return { ...m, enabled: false, updatedAt: now };
      }
      return m;
    });
    const tags: string[] = [];
    if (hasCoTConflict) tags.push('思维链');
    if (hasFormatConflict) tags.push('输出格式');
    const conflictNote = `\n\n检测到导入预设含${tags.join(' / ')}模块，与内置核心协议冲突，已自动关闭导入预设中的冲突项（内置模块保持启用）。如需使用预设版本，可在模块列表中手动切换。`;
    return { adjusted, conflictNote };
  };

  const importSTPreset = () => {
    // 酒馆预设导入：只保留 Tavern 原始结构（prompts + prompt_order），不再生成 V1 st_import_* 模块。
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsedV2 = parseSTPresetV2(text);
        if (!parsedV2.preset) {
          alert(`酒馆预设解析失败：${parsedV2.error ?? '未找到有效结构'}\n请确认文件包含 prompts + prompt_order。`);
          return;
        }

        const now = Date.now();
        const presetId = `stpreset_${now}_${Math.random().toString(36).slice(2, 8)}`;
        const fileBaseName = file.name.replace(/\.json$/i, '').trim();
        const rawName = typeof parsedV2.preset.name === 'string' ? parsedV2.preset.name.trim() : '';
        const presetName = (fileBaseName || rawName || `酒馆预设 · ${parsedV2.preset.prompts.length} 项`).slice(0, 60);
        const newPresetV2: STPresetEntryV2 = {
          id: presetId,
          name: presetName,
          preset: parsedV2.preset,
          characterId: parsedV2.preset.prompt_order[0]?.character_id ?? null,
          importedAt: now,
          updatedAt: now,
          isBuiltin: false,
        };
        const importedWorldInfoCount = getPresetWorldInfoEntries(parsedV2.preset.world_info).length;
        const importedRegexCount = extractTavernRegexScripts(parsedV2.preset).length;
        const cleanedModules = modules.filter((m) => !isSTImportedModule(m) && !m.id.startsWith('adapted_'));
        onWorldbooksChange(worldbooks.filter((w) => !w.id.startsWith('stwb_')));
        onChange({
          ...settings,
          enableStPreset: true,
          promptModules: cleanedModules,
          stPresetsV2: [...(settings.stPresetsV2 ?? []), newPresetV2],
          currentStPresetId: null,
          currentStPresetIdV2: presetId,
          currentStCharacterId: newPresetV2.characterId ?? null,
        });
        setSelectedId(cleanedModules[0]?.id ?? null);
        console.info('[酒馆预设导入] 已按 Tavern 原结构存入预设库', {
          presetId,
          name: presetName,
          promptCount: parsedV2.preset.prompts.length,
          orderCount: parsedV2.preset.prompt_order[0]?.order.length ?? 0,
          worldInfoCount: importedWorldInfoCount,
          regexScriptCount: importedRegexCount,
          v2RepairUsed: parsedV2.usedRepair,
        });
        alert(`已导入酒馆预设「${presetName}」。\n保留 ${parsedV2.preset.prompts.length} 个内容项 / ${parsedV2.preset.prompt_order[0]?.order.length ?? 0} 个顺序项。\n附带 world_info：${importedWorldInfoCount} 条；regex_scripts：${importedRegexCount} 条。\n不再生成提示词模块副本。`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        alert(`ST 预设解析失败：${message}\n请确认文件是 SillyTavern 导出的预设 JSON（含 prompts + prompt_order 字段）。`);
      }
    };
    input.click();
  };

  /** Phase 8：切换预设后同步采样参数到当前激活 API 配置，并更新 stPresetApiBackup。
   *  返回需写入 gameSettings 的 stPresetApiBackup 新值（null 表示无覆盖/已恢复）。 */
  const applyPresetApiSync = (targetSampling: STSamplingParams | undefined): STSamplingParams | null => {
    const currentBackup = settings.stPresetApiBackup ?? null;
    const { nextConfigs, nextBackup } = computePresetSwitchApiChange(
      apiSettings.configs,
      apiSettings.activeConfigId,
      currentBackup,
      targetSampling,
    );
    if (nextConfigs !== apiSettings.configs) {
      onApiSettingsChange({ ...apiSettings, configs: nextConfigs });
    }
    return nextBackup;
  };

  /** 切换激活预设：用目标预设的 modules 替换当前 promptModules 中的 st_import_* 段。
   *  当前预设已修改的 st_import_* 模块会随 currentPreset.modules 持久化，切换不丢。
   *  内置预设（getBuiltinPresets）与玩家导入预设（settings.stPresets）统一在 allPresets 中查找。
   *  冲突处理：
   *   - 切到非空预设（adapted/imported）：识别 ST 模块的 CoT/格式，自动禁用内置 main_plot_cot/response_format
   *   - 切到 null 或原生内置预设（presetType='native'）：恢复内置 main_plot_cot/response_format 到启用状态，
   *     因为玩家清空预设/选原生大概率是想回到原生体验（玩家手动禁用的也会被恢复，可再次手动关闭）。
   *  采样参数同步：
   *   - 切到带 samplingParams 的预设：首次备份当前 API 参数，应用预设参数
   *   - 切到无参数预设/null/原生：若有备份则恢复
   */
  const switchPreset = (presetId: string | null) => {
    const target = presetId ? allPresets.find((p) => p.id === presetId) : null;
    if (presetId && !target) return; // 异常：id 不存在
    // preserved：保留非 ST 模块，同时清除 adapted_*（adapted_* 是二创预设附带的，切换时重新加载）
    const preserved = modules.filter((m) => !isSTImportedModule(m) && !m.id.startsWith('adapted_'));
    let nextModules: 提示词模块[];
    let nextWorldbooks = worldbooks.filter((w) => !w.id.startsWith('stwb_')); // 默认移除所有 ST 世界书
    let conflictNote = '';
    // 原生体验：null 或原生内置预设（modules 为空，不附加任何 ST 段）
    const isNativeLike = !target || target.presetType === 'native';
    const targetSampling = isNativeLike ? undefined : target?.samplingParams;

    if (isNativeLike) {
      const now = Date.now();
      const freshBuiltins = createBuiltinPromptModules();
      const customModules = preserved.filter((m) => !isBuiltinPromptModule(m.id));
      nextModules = [
        ...customModules,
        ...freshBuiltins.map((def) => {
          const existing = preserved.find((m) => m.id === def.id);
          if (existing) {
            const forceEnable = def.id === BUILTIN_MAIN_COT_ID || def.id === BUILTIN_RESPONSE_FORMAT_ID;
            return { ...def, enabled: forceEnable ? true : existing.enabled, createdAt: existing.createdAt, updatedAt: existing.updatedAt };
          }
          return def;
        }),
      ];
    } else {
      // target 非空且非 native（adapted 二创成品 / imported 玩家导入）
      // 二创成品融合路径：预设自带 adapted_* 模块（完整替代对应 builtin_*）
      // adapted_* 模块的 id 模式：adapted_<builtin_id>（如 adapted_main_plot_cot → builtin_main_plot_cot）
      const adaptedModules = target!.modules.filter((m) => m.id.startsWith('adapted_'));
      let builtinAdjusted = preserved;
      if (adaptedModules.length > 0) {
        // 二创成品：从 preserved 中移除被 adapted_* 完整替代的 builtin_* 模块
        const replacedBuiltinIds = new Set(
          adaptedModules.map((m) => m.id.replace('adapted_', 'builtin_')),
        );
        builtinAdjusted = preserved.filter((m) => !replacedBuiltinIds.has(m.id));
        // ST 模块里若仍含其他 CoT/Format（未被 adapted_* 替代的），关闭 ST 侧冲突项（保留内置不动）
        const remainingStForConflict = target!.modules.filter(
          (m) => !m.id.startsWith('adapted_') && isSTImportedModule(m),
        );
        const tags: string[] = [];
        if (detectSTCoTModules(remainingStForConflict).length > 0) tags.push('思维链');
        if (detectSTFormatModules(remainingStForConflict).length > 0) tags.push('输出格式');
        if (tags.length > 0) {
          const now2 = Date.now();
          const conflictStIds = new Set([
            ...detectSTCoTModules(remainingStForConflict),
            ...detectSTFormatModules(remainingStForConflict),
          ]);
          // 关闭 ST 侧冲突模块，内置模块保持启用
          const stModulesAdjusted = target!.modules.map((m) => {
            if (conflictStIds.has(m.id) && m.enabled) {
              return { ...m, enabled: false, updatedAt: now2 };
            }
            return m;
          });
          target!.modules = stModulesAdjusted;
          conflictNote = `\n\n检测到二创预设的 ST 模块含${tags.join(' / ')}，已自动关闭 ST 侧冲突项（内置核心协议保持启用）。`;
        } else {
          conflictNote = `\n\n已启用二创融合模式：内置主剧情模块已与预设精华融合，游戏系统（变量/记忆/新闻）正常工作。`;
        }
      } else {
        // 无 adapted_*：玩家导入预设，冲突时关闭导入预设的冲突项（保留内置不动）
        const { adjusted, conflictNote: note } = handleSTCoTFormatConflict(target!.modules, preserved);
        target!.modules = adjusted;
        builtinAdjusted = preserved;
        conflictNote = note;
      }
      nextModules = [...builtinAdjusted, ...target!.modules];
      // Phase 7.2：注入目标预设的世界书条目（如有）
      if (target!.worldbookEntries && target!.worldbookEntries.length > 0) {
        const now = Date.now();
        nextWorldbooks = [
          ...nextWorldbooks,
          {
            id: `stwb_${target!.id}`,
            title: `${target!.name} · ST 导入世界书`,
            description: `从 ST 预设「${target!.name}」导入的世界书条目`,
            enabled: true,
            entries: target!.worldbookEntries,
            createdAt: now,
            updatedAt: now,
          },
        ];
      }
    }
    const nextBackup = applyPresetApiSync(targetSampling);
    onWorldbooksChange(nextWorldbooks);
    onChange({
      ...settings,
      promptModules: nextModules,
      currentStPresetId: presetId,
      stPresetApiBackup: nextBackup,
    });
    if (conflictNote) {
      console.info('[预设切换]', conflictNote.trim());
    }
    // 选中切换后第一条 ST 模块（或清空）
    const firstSt = nextModules.find(isSTImportedModule);
    setSelectedId(firstSt?.id ?? preserved[0]?.id ?? null);
  };

  /** 重命名当前预设 */
  const renamePreset = (presetId: string, newName: string) => {
    const trimmed = newName.trim().slice(0, 60);
    if (!trimmed) return;
    const presets = (settings.stPresets ?? []).map((p) =>
      p.id === presetId ? { ...p, name: trimmed, updatedAt: Date.now() } : p,
    );
    onChange({ ...settings, stPresets: presets });
  };

  const switchPresetV2 = (presetId: string | null) => {
    const target = presetId ? allPresetsV2.find((p) => p.id === presetId) : null;
    onChange({
      ...settings,
      currentStPresetIdV2: target?.id ?? null,
      currentStCharacterId: target?.characterId ?? target?.preset.prompt_order[0]?.character_id ?? null,
    });
  };

  const setV2CharacterId = (characterId: number | null) => {
    onChange({ ...settings, currentStCharacterId: characterId });
  };

  const patchV2RuntimeSettings = (partial: Pick<游戏设置, 'stPostProcessMode'>) => {
    onChange({ ...settings, ...partial });
  };

  const patchV2Preset = (presetId: string, preset: STPresetEntryV2['preset']) => {
    const now = Date.now();
    const editablePresets = settings.stPresetsV2 ?? [];
    const target = allPresetsV2.find((entry) => entry.id === presetId);
    if (!target) return;

    if (target.isBuiltin) {
      const overrideId = `builtin_override_${presetId}`;
      const existingOverride = editablePresets.find((entry) => entry.id === overrideId);
      const overrideEntry: STPresetEntryV2 = {
        ...(existingOverride ?? {
          id: overrideId,
          name: `${target.name}（自定义配置）`,
          preset: JSON.parse(JSON.stringify(target.preset)) as STPresetEntryV2['preset'],
          characterId: target.characterId ?? target.preset.prompt_order[0]?.character_id ?? null,
          importedAt: now,
          updatedAt: now,
          isBuiltin: false,
        }),
        preset,
        updatedAt: now,
      };
      const nextPresets = existingOverride
        ? editablePresets.map((entry) => entry.id === overrideId ? overrideEntry : entry)
        : [...editablePresets, overrideEntry];
      onChange({
        ...settings,
        stPresetsV2: nextPresets,
        currentStPresetIdV2: overrideId,
        currentStCharacterId: settings.currentStCharacterId ?? overrideEntry.characterId ?? null,
      });
      return;
    }

    const nextPresets = editablePresets.map((entry) =>
      entry.id === presetId
        ? { ...entry, preset, updatedAt: now }
        : entry,
    );
    onChange({ ...settings, stPresetsV2: nextPresets });
  };

  const exportV2Preset = (preset: STPresetEntryV2) => {
    const blob = new Blob([JSON.stringify(preset.preset, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${preset.name || 'st-preset-v2'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const deletePresetV2 = (presetId: string) => {
    const target = (settings.stPresetsV2 ?? []).find((entry) => entry.id === presetId);
    if (!target || target.isBuiltin) return;
    if (!confirm(`确定删除酒馆预设「${target.name}」？\n该操作只会删除玩家导入的预设，不会影响内置预设和原生提示词模块。`)) return;

    const nextPresets = (settings.stPresetsV2 ?? []).filter((entry) => entry.id !== presetId);
    const isCurrent = settings.currentStPresetIdV2 === presetId;
    onChange({
      ...settings,
      stPresetsV2: nextPresets,
      currentStPresetIdV2: isCurrent ? null : settings.currentStPresetIdV2,
      currentStCharacterId: isCurrent ? null : settings.currentStCharacterId,
    });
  };

  /** 删除预设。内置预设不可删。若删除的是当前激活预设，需先切走（恢复参数）。 */
  const deletePreset = (presetId: string) => {
    // 内置预设（原生 / 二创成品）不可删
    if (getBuiltinPresets().some((p) => p.id === presetId)) return;
    const target = (settings.stPresets ?? []).find((p) => p.id === presetId);
    if (!target) return;
    if (!confirm(`确定删除预设「${target.name}」？\n该预设的 ${target.modules.length} 条模块也会从当前列表移除。`)) return;
    const presets = (settings.stPresets ?? []).filter((p) => p.id !== presetId);
    const isCurrent = settings.currentStPresetId === presetId;
    // Phase 7.2：删除预设时同步移除对应的 ST 世界书
    const nextWorldbooks = worldbooks.filter((w) => w.id !== `stwb_${presetId}`);
    if (nextWorldbooks.length !== worldbooks.length) {
      onWorldbooksChange(nextWorldbooks);
    }
    if (isCurrent) {
      // 切到 null 语义：恢复之前因 ST 冲突被自动禁用的内置 CoT/格式 + 恢复采样参数
      const now = Date.now();
      const preserved = modules
        .filter((m) => !isSTImportedModule(m))
        .map((m) => {
          if ((m.id === BUILTIN_MAIN_COT_ID || m.id === BUILTIN_RESPONSE_FORMAT_ID) && !m.enabled) {
            return { ...m, enabled: true, updatedAt: now };
          }
          return m;
        });
      const nextBackup = applyPresetApiSync(undefined);
      onChange({
        ...settings,
        stPresets: presets,
        currentStPresetId: BUILTIN_PRESET_ID,
        promptModules: preserved,
        stPresetApiBackup: nextBackup,
      });
      setSelectedId(preserved[0]?.id ?? null);
    } else {
      onChange({ ...settings, stPresets: presets });
    }
  };

  if (isTavernMode) {
    const currentV2Order =
      currentV2Preset?.preset.prompt_order.find((item) => item.character_id === (settings.currentStCharacterId ?? currentV2Preset.characterId ?? null)) ??
      currentV2Preset?.preset.prompt_order.find((item) => item.character_id === 100001) ??
      currentV2Preset?.preset.prompt_order[0];
    const currentV2EnabledSlots = currentV2Order?.order.filter((slot) => slot.enabled !== false).length ?? 0;
    const tavernV2Ready = (settings.enableStPreset ?? true) && Boolean(currentV2Preset && currentV2Order);
    return (
      <div className="flex h-full min-w-0 flex-col gap-4 overflow-y-auto pr-1" style={{ minHeight: 0 }}>
        <div
          className="flex flex-col gap-3 p-3"
          style={{
            background: 'rgba(var(--tj-bg-secondary), 0.35)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
            clipPath: smallClip,
          }}
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div
                className="font-serif text-base font-bold tracking-[0.16em]"
                style={{ color: 'rgba(var(--tj-ui-nsfw), 0.95)' }}
              >
                酒馆预设
              </div>
              <div className="mt-1 text-sm leading-6" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
                ST / Tavern 预设导入与酒馆消息链集中在这里；提示词模块页只保留开拓轶事原生底座。
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChange({ ...settings, enableStPreset: !(settings.enableStPreset ?? true) })}
                title={settings.enableStPreset === false ? '当前酒馆预设已关闭：预设库数据保留，但不参与主剧情发送' : '当前酒馆预设已开启：当前酒馆预设可参与主剧情发送'}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-serif tracking-wider transition-all hover:opacity-90"
                style={{
                  background: (settings.enableStPreset ?? true)
                    ? 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.22), rgba(var(--tj-ui-nsfw), 0.1))'
                    : 'rgba(var(--tj-bg-secondary), 0.5)',
                  color: (settings.enableStPreset ?? true)
                    ? 'rgba(var(--tj-ui-nsfw), 0.98)'
                    : 'rgba(var(--tj-text-secondary), 0.7)',
                  boxShadow: (settings.enableStPreset ?? true)
                    ? 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.45)'
                    : 'inset 0 0 0 1px rgba(var(--tj-text-secondary), 0.2)',
                  clipPath: smallClip,
                  cursor: 'pointer',
                }}
              >
                <span
                  role="switch"
                  aria-checked={settings.enableStPreset ?? true}
                  className="relative inline-flex h-4 w-7 flex-shrink-0 items-center transition-all"
                  style={{
                    background: (settings.enableStPreset ?? true)
                      ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))'
                      : 'rgba(var(--tj-bg-secondary), 0.68)',
                    boxShadow: (settings.enableStPreset ?? true)
                      ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.4)'
                      : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                    clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
                  }}
                >
                  <span
                    className="absolute top-0.5 h-3 w-3 transition-transform"
                    style={{
                      left: (settings.enableStPreset ?? true) ? 'calc(100% - 0.875rem)' : '0.125rem',
                      background: (settings.enableStPreset ?? true) ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
                      clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)',
                    }}
                  />
                </span>
                <span>启用酒馆预设</span>
              </button>
              <button
                onClick={importSTPreset}
                className="px-3.5 py-1.5 text-sm font-serif tracking-wider transition-all hover:opacity-90"
                style={{
                  background: 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.18), rgba(var(--tj-ui-nsfw), 0.08))',
                  color: 'rgba(var(--tj-ui-nsfw), 0.95)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.35)',
                  clipPath: smallClip,
                }}
                title="导入 SillyTavern 预设文件"
              >
                导入酒馆预设
              </button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {[
              {
                label: '总开关',
                value: (settings.enableStPreset ?? true) ? '已开启' : '已关闭',
                detail: (settings.enableStPreset ?? true) ? '酒馆预设可参与主剧情' : '预设保留，但发送时不注入',
                active: settings.enableStPreset ?? true,
              },
              {
                label: '酒馆预设',
                value: currentV2Preset ? currentV2Preset.name : '未选择',
                detail: currentV2Preset ? `${currentV2Preset.preset.prompts.length} 内容项 / ${currentV2Order?.order.length ?? 0} 顺序项` : '主剧情走原生流程',
                active: Boolean(currentV2Preset),
              },
              {
                label: '发送路径',
                value: tavernV2Ready ? '酒馆消息链' : '原生主流程',
                detail: tavernV2Ready ? `${currentV2EnabledSlots} 条启用，失败自动 fallback` : '酒馆预设未满足生效条件',
                active: tavernV2Ready,
              },
            ].map((item) => (
              <div
                key={item.label}
                className="min-w-0 px-3 py-2.5"
                style={{
                  background: item.active ? 'rgba(var(--tj-ui-nsfw), 0.08)' : 'rgba(var(--tj-bg-primary), 0.32)',
                  boxShadow: `inset 0 0 0 1px ${item.active ? 'rgba(var(--tj-ui-nsfw), 0.26)' : 'rgba(var(--tj-accent-primary), 0.12)'}`,
                  clipPath: smallClip,
                }}
              >
                <div className="text-[11px] font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
                  {item.label}
                </div>
                <div className="mt-1 truncate text-base font-semibold" style={{ color: item.active ? 'rgba(var(--tj-ui-nsfw), 0.96)' : 'rgb(var(--tj-text-primary))' }}>
                  {item.value}
                </div>
                <div className="mt-0.5 truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
                  {item.detail}
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="flex min-w-0 flex-col gap-3">
              <V2PresetSwitcher
                presets={allPresetsV2}
                currentId={settings.currentStPresetIdV2 ?? null}
                currentCharacterId={settings.currentStCharacterId ?? null}
                postProcessMode={settings.stPostProcessMode ?? '未选择'}
                enabled={settings.enableStPreset ?? true}
                onSwitch={switchPresetV2}
                onCharacterChange={setV2CharacterId}
                onRuntimeChange={patchV2RuntimeSettings}
                onPresetChange={patchV2Preset}
                onExport={exportV2Preset}
                onDelete={deletePresetV2}
              />
            </div>
            <div
              className="min-w-0 p-4 text-sm leading-7"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.32)',
                color: 'rgba(var(--tj-text-secondary), 0.74)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                clipPath: smallClip,
              }}
            >
              <div className="font-serif text-base tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
                运行诊断
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-2">
                <div className="px-2 py-1.5" style={{ background: 'rgba(var(--tj-bg-secondary), 0.28)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)', clipPath: smallClip }}>
                  <div className="text-xs font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.8)' }}>原始结构</div>
                  <div className="mt-1 leading-5">酒馆预设保持 `prompts + prompt_order` 原结构，不再转译成提示词模块。</div>
                </div>
                <div className="px-2 py-1.5" style={{ background: 'rgba(var(--tj-bg-secondary), 0.28)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)', clipPath: smallClip }}>
                  <div className="text-xs font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.8)' }}>消息链</div>
                  <div className="mt-1 leading-5">只有总开关开启且选中有效预设时，主剧情才会尝试使用酒馆消息链。</div>
                </div>
              </div>
              <div className="mt-3 grid gap-1.5 text-xs">
                <div style={{ color: tavernV2Ready ? 'rgba(var(--tj-ui-nsfw), 0.88)' : 'rgba(var(--tj-text-secondary), 0.68)' }}>
                  当前路径：{tavernV2Ready ? '本回合会尝试酒馆消息链，构建失败会自动 fallback。' : '当前仍走原生主流程。'}
                </div>
                <div>
                  运行时槽位：`worldInfo*`、`chatHistory`、`userInput` 等由项目上下文注入，不一定有 prompt 正文。
                </div>
                <div>
                  原生 CoT、回复格式、变量协议、行动选项、天气和独立系统提示词不在这里编辑。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-col gap-4 md:flex-row" style={{ minHeight: 0 }}>
      <div className="flex max-h-[34dvh] min-w-0 flex-shrink-0 flex-col gap-2 md:max-h-none md:w-[360px]">
        <div className="flex gap-1 p-1" style={{
          background: 'rgba(var(--tj-bg-secondary), 0.5)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath: smallClip,
        }}>
          {([
            { key: 'main', label: '主剧情' },
            { key: 'calibration', label: '独立系统' },
          ] as const).map((sys) => {
            const active = activeSystem === sys.key;
            return (
              <button
                key={sys.key}
                type="button"
                onClick={() => setActiveSystem(sys.key)}
                className="flex-1 px-3 py-1.5 text-sm font-serif tracking-[0.12em] transition-all"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))'
                    : 'transparent',
                  color: active ? 'rgb(var(--tj-on-accent))' : 'rgba(var(--tj-text-secondary), 0.7)',
                  clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                  cursor: 'pointer',
                }}
              >
                {sys.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between px-1">
          <span
            className="text-xs font-serif tracking-[0.2em]"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
          >
            模块列表
          </span>
          <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
            {visibleModules.length} 条
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ModuleList
            modules={visibleModules}
            selected={selected}
            onSelect={setSelectedId}
            onToggle={(id) => {
              const target = modules.find((m) => m.id === id);
              if (!target || target.scope?.includes('calibration')) return;
              const nextEnabled = !target.enabled;
              if (isBuiltinPresetModule(target) && target.enabled && !nextEnabled) {
                if (!window.confirm('该模块属于原生提示词底座，关闭可能影响输出稳定性。确定要关闭吗？')) {
                  return;
                }
              }
              patch(id, { enabled: nextEnabled });
            }}
            showModifyLayer={activeSystem === 'main'}
            onReorder={reorderModules}
          />
        </div>

        <div className="flex flex-col gap-1.5 pt-2" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.18)' }}>
          <button
            onClick={resetBuiltins}
            className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-80"
            style={{
              background: 'transparent',
              color: 'rgba(var(--tj-text-secondary), 0.82)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
              clipPath: smallClip,
            }}
          >
            重置内置模块
          </button>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="mb-2 flex items-center justify-between px-1">
          <span
            className="text-xs font-serif tracking-[0.2em]"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
          >
            模块编辑
          </span>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))',
              color: 'rgb(var(--tj-on-accent))',
              clipPath: smallClip,
            }}
          >
            + 新增自定义模块
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {selected ? (
            <EditorPanel
              module={selected}
              onPatch={(p) => patch(selected.id, p)}
              onDelete={() => removeModule(selected.id)}
            />
          ) : (
            <div
              className="flex flex-1 items-center justify-center text-sm"
              style={{
                color: 'rgba(var(--tj-text-secondary), 0.5)',
                clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.06)',
                background: 'radial-gradient(circle at 50% 40%, rgba(var(--tj-accent-primary), 0.018) 0%, transparent 60%)',
                padding: '2rem 1rem',
                textAlign: 'center',
                letterSpacing: '0.2em',
              }}
            >
              暂无模块。点击“新增自定义模块”开始。
            </div>
          )}
        </div>
      </div>
      {showAddModal && (
        <AddCustomModuleModal
          onConfirm={addCustomModule}
          onCancel={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}

/** ST 预设切换器：下拉选当前预设 + 重命名按钮 + 删除按钮。 */
function PresetSwitcher({
  presets,
  currentId,
  onSwitch,
  onRename,
  onDelete,
}: {
  presets: STPresetEntry[];
  currentId: string | null;
  onSwitch: (presetId: string | null) => void;
  onRename: (presetId: string, newName: string) => void;
  onDelete: (presetId: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const current = presets.find((p) => p.id === currentId);

  const startRename = () => {
    if (!current) return;
    setRenameValue(current.name);
    setRenaming(true);
  };
  const commitRename = () => {
    if (current) onRename(current.id, renameValue);
    setRenaming(false);
  };

  return (
    <div
      className="flex flex-col gap-2 px-3 py-2.5"
      style={{
        background: 'rgba(var(--tj-ui-nsfw), 0.06)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.22)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center gap-1">
        <span
          className="text-sm font-serif tracking-[0.14em]"
          style={{ color: 'rgba(var(--tj-ui-nsfw), 0.92)' }}
        >
          提示词预设
        </span>
        <span className="ml-auto text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
          {presets.length} 套
        </span>
      </div>
      {!renaming ? (
        <div className="flex items-center gap-1">
          <select
            value={currentId ?? ''}
            onChange={(e) => onSwitch(e.target.value || null)}
            className="min-w-0 flex-1 px-2 py-1 text-xs"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.6)',
              color: 'rgb(var(--tj-text-primary))',
              border: '1px solid rgba(var(--tj-ui-nsfw), 0.3)',
              borderRadius: '2px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {presets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.isBuiltin ? '◆ ' : ''}{p.name}{p.modules.length > 0 ? ` · ${p.modules.length} 条` : ''}
              </option>
            ))}
          </select>
          {current && !current.isBuiltin && (
            <>
              <button
                type="button"
                onClick={startRename}
                title="重命名当前预设"
                className="px-2.5 py-1.5 text-xs transition-all hover:opacity-80"
                style={{
                  color: 'rgba(var(--tj-ui-nsfw), 0.92)',
                  background: 'rgba(var(--tj-ui-nsfw), 0.1)',
                  border: '1px solid rgba(var(--tj-ui-nsfw), 0.3)',
                  cursor: 'pointer',
                }}
              >
                ✎
              </button>
              <button
                type="button"
                onClick={() => onDelete(current.id)}
                title="删除当前预设"
                className="px-2.5 py-1.5 text-xs transition-all hover:opacity-80"
                style={{
                  color: 'rgba(var(--tj-danger), 0.92)',
                  background: 'rgba(var(--tj-danger), 0.08)',
                  border: '1px solid rgba(var(--tj-danger), 0.3)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') setRenaming(false);
            }}
            autoFocus
            className="min-w-0 flex-1 px-2 py-1 text-xs"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.6)',
              color: 'rgb(var(--tj-text-primary))',
              border: '1px solid rgba(var(--tj-ui-nsfw), 0.45)',
              borderRadius: '2px',
              outline: 'none',
            }}
          />
          <button
            type="button"
            onClick={commitRename}
            className="px-2.5 py-1.5 text-xs transition-all hover:opacity-80"
            style={{
              color: 'rgba(var(--tj-ui-nsfw), 0.92)',
              background: 'rgba(var(--tj-ui-nsfw), 0.1)',
              border: '1px solid rgba(var(--tj-ui-nsfw), 0.3)',
              cursor: 'pointer',
            }}
          >
            ✓
          </button>
          <button
            type="button"
            onClick={() => setRenaming(false)}
            className="px-2.5 py-1.5 text-xs transition-all hover:opacity-80"
            style={{
              color: 'rgba(var(--tj-text-secondary), 0.7)',
              background: 'transparent',
              border: '1px solid rgba(var(--tj-text-secondary), 0.3)',
              cursor: 'pointer',
            }}
          >
            取消
          </button>
        </div>
      )}
      {current && (
        <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>
          编辑模块自动保存到此预设
        </div>
      )}
    </div>
  );
}

function V1PresetEntriesPanel({ preset }: { preset: STPresetEntry | null }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const modules = preset?.modules ?? [];
  const enabledCount = modules.filter((module) => module.enabled !== false).length;
  const groupedSummary = modules.reduce<Record<string, number>>((acc, module) => {
    acc[module.category] = (acc[module.category] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div
      className="flex flex-col gap-2 px-3 py-2.5"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.24)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-nsfw), 0.92)' }}>
          V1 条目
        </span>
        <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
          {enabledCount}/{modules.length} 启用
        </span>
      </div>

      {modules.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(groupedSummary).map(([category, count]) => (
              <span
                key={category}
                className="px-2 py-1 text-xs"
                style={{
                  color: 'rgba(var(--tj-text-secondary), 0.72)',
                  background: 'rgba(var(--tj-bg-secondary), 0.34)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                  clipPath: smallClip,
                }}
              >
                {PROMPT_MODULE_CATEGORY_LABELS[category as 提示词模块类目] ?? category} {count}
              </span>
            ))}
          </div>
          <div className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1">
            {modules.map((module, index) => {
              const expanded = expandedId === module.id;
              const contentPreview = module.content.replace(/\s+/g, ' ').trim().slice(0, 90);
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => setExpandedId((current) => (current === module.id ? null : module.id))}
                  className="min-w-0 px-3 py-2 text-left text-sm transition-all hover:opacity-90"
                  style={{
                    background: expanded ? 'rgba(var(--tj-ui-nsfw), 0.1)' : 'rgba(var(--tj-bg-primary), 0.22)',
                    color: module.enabled === false ? 'rgba(var(--tj-text-secondary), 0.42)' : 'rgba(var(--tj-text-primary), 0.82)',
                    boxShadow: `inset 0 0 0 1px ${expanded ? 'rgba(var(--tj-ui-nsfw), 0.28)' : 'rgba(var(--tj-accent-primary), 0.1)'}`,
                    clipPath: smallClip,
                  }}
                >
                  <span className="grid items-start gap-2" style={{ gridTemplateColumns: '2.25rem minmax(0,1fr) auto' }}>
                    <span style={{ color: 'rgba(var(--tj-ui-nsfw), 0.75)' }}>#{index + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium" title={module.title}>{module.title}</span>
                      <span className="mt-1 block truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }} title={module.id}>
                        {module.id}
                      </span>
                      {!expanded && contentPreview && (
                        <span className="mt-1 block truncate text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.48)' }} title={contentPreview}>
                          {contentPreview}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-col items-end gap-1 text-xs">
                      <span style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>
                        {module.role ?? 'system'}
                      </span>
                      <span style={{ color: module.enabled === false ? 'rgba(var(--tj-text-secondary), 0.42)' : 'rgba(var(--tj-ui-nsfw), 0.78)' }}>
                        {module.enabled === false ? 'off' : 'on'}
                      </span>
                    </span>
                  </span>
                  {expanded && (
                    <span className="mt-3 block space-y-2">
                      <span className="grid grid-cols-3 gap-2 text-xs">
                        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>order {module.order}</span>
                        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>{PROMPT_MODULE_CATEGORY_LABELS[module.category] ?? module.category}</span>
                        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>{module.injectionPosition === 1 ? `depth ${module.injectionDepth ?? 4}` : 'system'}</span>
                      </span>
                      <span
                        className="block max-h-56 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-xs leading-6"
                        style={{
                          background: 'rgba(var(--tj-bg-primary), 0.45)',
                          color: 'rgba(var(--tj-text-primary), 0.76)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                        }}
                      >
                        {module.content || '（空内容）'}
                      </span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <div className="px-3 py-3 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
          当前为原生内置入口，没有 V1 导入条目。
        </div>
      )}
    </div>
  );
}

function V2PresetSwitcher({
  presets,
  currentId,
  currentCharacterId,
  postProcessMode,
  enabled,
  onSwitch,
  onCharacterChange,
  onRuntimeChange,
  onPresetChange,
  onExport,
  onDelete,
}: {
  presets: STPresetEntryV2[];
  currentId: string | null;
  currentCharacterId: number | null;
  postProcessMode: NonNullable<游戏设置['stPostProcessMode']>;
  enabled: boolean;
  onSwitch: (presetId: string | null) => void;
  onCharacterChange: (characterId: number | null) => void;
  onRuntimeChange: (partial: Pick<游戏设置, 'stPostProcessMode'>) => void;
  onPresetChange: (presetId: string, preset: STPresetEntryV2['preset']) => void;
  onExport: (preset: STPresetEntryV2) => void;
  onDelete: (presetId: string) => void;
}) {
  const current = presets.find((p) => p.id === currentId) ?? null;
  const characterIds = current?.preset.prompt_order.map((item) => item.character_id) ?? [];
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [slotFilter, setSlotFilter] = useState<'all' | 'enabled' | 'disabled' | 'runtime' | 'missing' | 'macro'>('all');
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [aiReviewOpen, setAiReviewOpen] = useState(false);
  const [aiReviewText, setAiReviewText] = useState('');
  const [selectedRegexIndex, setSelectedRegexIndex] = useState(0);
  const [regexDryRunSample, setRegexDryRunSample] = useState(DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE);
  const selectedCharacterId = currentCharacterId ?? current?.characterId ?? current?.preset.prompt_order[0]?.character_id ?? null;
  const selectedOrder = current
    ? current.preset.prompt_order.find((item) => item.character_id === selectedCharacterId) ??
      current.preset.prompt_order.find((item) => item.character_id === 100001) ??
      current.preset.prompt_order[0]
    : undefined;
  const selectedSlot = selectedOrder?.order.find((slot) => slot.identifier === selectedSlotId) ?? selectedOrder?.order[0];
  const promptMap = new Map(current?.preset.prompts.map((prompt) => [prompt.identifier, prompt]) ?? []);
  const selectedPrompt = selectedSlot ? promptMap.get(selectedSlot.identifier) : undefined;
  const canEdit = Boolean(current && !current.isBuiltin);
  const canToggleOrderSlot = Boolean(current);
  const orderSlots = selectedOrder?.order ?? [];
  const slotViewModels = orderSlots.map((slot, index) => {
    const prompt = promptMap.get(slot.identifier);
    const content = prompt?.content ?? '';
    const macro = detectTavernMacroInfo(content);
    const isRuntime = TAVERN_RUNTIME_SLOT_IDS.has(slot.identifier);
    const isMissing = !isRuntime && !prompt;
    return { slot, index, prompt, content, macro, isRuntime, isMissing };
  });
  const shownOrderSlots = slotViewModels.filter((item) => {
    if (slotFilter === 'enabled') return item.slot.enabled !== false;
    if (slotFilter === 'disabled') return item.slot.enabled === false;
    if (slotFilter === 'runtime') return item.isRuntime;
    if (slotFilter === 'missing') return item.isMissing;
    if (slotFilter === 'macro') return item.macro.level !== 'none';
    return true;
  });
  const enabledSlotCount = orderSlots.filter((slot) => slot.enabled !== false).length;
  const runtimeSlotCount = slotViewModels.filter((item) => item.isRuntime).length;
  const unmatchedSlotCount = slotViewModels.filter((item) => item.isMissing).length;
  const macroSlotCount = slotViewModels.filter((item) => item.macro.level !== 'none').length;
  const advancedMacroSlotCount = slotViewModels.filter((item) => item.macro.level === 'advanced').length;
  const disabledRuntimeCount = slotViewModels.filter((item) => item.isRuntime && item.slot.enabled === false).length;
  const duplicateIds = Array.from(new Set(orderSlots.map((slot) => slot.identifier).filter((id, index, arr) => arr.indexOf(id) !== index)));
  const worldInfoEntries = getPresetWorldInfoEntries(current?.preset.world_info);
  const worldInfoViewEntries = getPresetWorldInfoViewEntries(current?.preset.world_info);
  const enabledWorldInfoCount = worldInfoEntries.filter(isPresetWorldInfoEnabled).length;
  const constantWorldInfoCount = worldInfoEntries.filter((entry) => isPresetWorldInfoEnabled(entry) && isPresetWorldInfoConstant(entry)).length;
  const regexScripts = extractTavernRegexScripts(current?.preset);
  const regexScriptSafety = regexScripts.map(analyzeTavernRegexScript);
  const enabledRegexScriptCount = regexScriptSafety.filter((item) => !item.disabled).length;
  const riskyRegexScriptCount = regexScriptSafety.filter((item) => item.risky).length;
  const enabledRiskyRegexScriptCount = regexScriptSafety.filter((item) => !item.disabled && item.risky).length;
  const blockedRegexScriptCount = regexScriptSafety.filter((item) => item.kind === 'blocked').length;
  const effectiveRegexIndex = regexScripts.length > 0 ? Math.min(selectedRegexIndex, regexScripts.length - 1) : 0;
  const selectedRegexScript = regexScripts[effectiveRegexIndex];
  const selectedRegexSafety = selectedRegexScript ? regexScriptSafety[effectiveRegexIndex] : null;
  const selectedRegexDryRun = selectedRegexScript ? dryRunTavernRegexScript(selectedRegexScript, regexDryRunSample) : null;
  const scanIssues = [
    unmatchedSlotCount > 0 ? `${unmatchedSlotCount} 个顺序项没有匹配内容` : '',
    disabledRuntimeCount > 0 ? `${disabledRuntimeCount} 个运行时槽位被关闭` : '',
    duplicateIds.length > 0 ? `${duplicateIds.length} 个重复 identifier` : '',
    advancedMacroSlotCount > 0 ? `${advancedMacroSlotCount} 个条目含高级宏` : '',
    enabledWorldInfoCount > 80 ? `${enabledWorldInfoCount} 个 world_info 已启用，可能挤占上下文` : '',
    constantWorldInfoCount > 20 ? `${constantWorldInfoCount} 个 world_info 常驻条目，建议确认是否必要` : '',
    regexScripts.length > 0 ? `${regexScripts.length} 个 regex_scripts 已保留；安全输出清理类会在主剧情后处理执行` : '',
    enabledRiskyRegexScriptCount > 0 ? `${enabledRiskyRegexScriptCount} 个高风险 regex_scripts 处于启用状态（仍不会执行）` : '',
  ].filter(Boolean);

  const patchCurrentPreset = (nextPreset: STPresetEntryV2['preset']) => {
    if (!current) return;
    onPresetChange(current.id, nextPreset);
  };

  const patchOrderSlot = (identifier: string, partial: Partial<NonNullable<typeof selectedSlot>>) => {
    if (!current || !selectedOrder) return;
    patchCurrentPreset({
      ...current.preset,
      prompt_order: current.preset.prompt_order.map((order) =>
        order.character_id === selectedOrder.character_id
          ? {
              ...order,
              order: order.order.map((slot) =>
                slot.identifier === identifier ? { ...slot, ...partial } : slot,
              ),
            }
          : order,
      ),
    });
  };

  const patchSelectedSlot = (partial: Partial<NonNullable<typeof selectedSlot>>) => {
    if (!selectedSlot) return;
    patchOrderSlot(selectedSlot.identifier, partial);
  };

  const patchSelectedPrompt = (partial: Partial<NonNullable<typeof selectedPrompt>>) => {
    if (!current || !selectedPrompt || current.isBuiltin) return;
    patchCurrentPreset({
      ...current.preset,
      prompts: current.preset.prompts.map((prompt) =>
        prompt.identifier === selectedPrompt.identifier ? { ...prompt, ...partial } : prompt,
      ),
    });
  };

  const patchWorldInfoEntry = (entryKey: string, partial: Partial<STWorldInfoEntry>) => {
    if (!current || current.isBuiltin) return;
    const raw = current.preset.world_info;
    if (Array.isArray(raw)) {
      const targetIndex = Number(entryKey);
      patchCurrentPreset({
        ...current.preset,
        world_info: raw.map((entry, index) => index === targetIndex ? { ...entry, ...partial } : entry),
      });
      return;
    }
    if (raw && typeof raw === 'object') {
      const nextWorldInfo: Record<string, STWorldInfoEntry> = {
        ...raw,
        [entryKey]: { ...raw[entryKey], ...partial },
      };
      patchCurrentPreset({
        ...current.preset,
        world_info: nextWorldInfo,
      });
    }
  };

  const buildLocalReviewText = () => {
    const selectedName = current?.name ?? '未选择';
    const lines = [
      `预设：${selectedName}`,
      `内容项：${current?.preset.prompts.length ?? 0}`,
      `顺序项：${orderSlots.length}`,
      `启用项：${enabledSlotCount}`,
      `运行时槽位：${runtimeSlotCount}`,
      `未匹配：${unmatchedSlotCount}`,
      `宏条目：${macroSlotCount}（高级宏 ${advancedMacroSlotCount}）`,
      `世界书：${worldInfoEntries.length}（启用 ${enabledWorldInfoCount}，常驻 ${constantWorldInfoCount}）`,
      `正则脚本：${regexScripts.length}（未禁用 ${enabledRegexScriptCount}，高风险 ${riskyRegexScriptCount}）`,
      `后处理：${postProcessMode}`,
      '',
      '本地扫描：',
      ...(scanIssues.length > 0 ? scanIssues.map((item) => `- ${item}`) : ['- 暂未发现结构性问题']),
      '',
      '建议：',
      disabledRuntimeCount > 0 ? '- 建议重新启用 chatHistory / userInput / worldInfo* 等运行时槽位。' : '- 运行时槽位状态正常。',
      unmatchedSlotCount > 0 ? '- 未匹配项不会注入正文，建议确认是否为预设占位符。' : '- prompt_order 引用基本完整。',
      advancedMacroSlotCount > 0 ? '- 高级宏集中条目不要轻易关闭，建议逐条查看右侧宏检测。' : '- 未发现高级宏集中风险。',
      enabledWorldInfoCount > 0 ? '- world_info 会按关键词命中后进入主剧情酒馆消息链，不影响独立系统。' : '- 未检测到附带 world_info。',
      regexScripts.length > 0 ? '- regex_scripts 仅放开安全输出清理类；HTML 注释、抗截断/抗空回占位等会在主剧情后处理清理，高风险脚本仍只展示和干跑。' : '- 未检测到附带 regex_scripts。',
      '- 我们会在消息链末尾保留格式保护和行动选项兜底，降低正文格式被预设破坏的风险。',
    ];
    return lines.join('\n');
  };

  const runLocalReview = () => {
    if (!current) return;
    const localReport = buildLocalReviewText();
    setAiReviewOpen(true);
    setAiReviewText(`${localReport}\n\n说明：当前版本已移除外部 AI 审查，只保留本地结构扫描。后续可加入由项目内置规则维护的审查模型。`);
  };
  return (
    <div
      className="flex flex-col gap-1.5 px-2 py-1.5"
      style={{
        background: 'rgba(var(--tj-accent-primary), 0.06)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="text-base font-serif tracking-[0.14em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.92)' }}
        >
          酒馆预设
        </span>
        <TogglePill checked={enabled} disabled onChange={() => undefined} label={enabled ? '总开关已启用' : '总开关关闭'} />
        <span className="ml-auto text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
          {canEdit ? '导入预设可编辑' : '内置正文只读 · 条目可配置'}
        </span>
      </div>
      <div className="grid gap-2 xl:grid-cols-[minmax(220px,1.3fr)_minmax(140px,0.7fr)_minmax(140px,0.7fr)_auto_auto]">
        <select
          value={currentId ?? ''}
          onChange={(e) => onSwitch(e.target.value || null)}
          className="min-w-0 px-3 py-2 text-sm"
          style={{
            background: 'rgba(var(--tj-bg-primary), 0.6)',
            color: 'rgb(var(--tj-text-primary))',
            border: '1px solid rgba(var(--tj-accent-primary), 0.3)',
            borderRadius: '2px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          <option value="">不使用酒馆消息链</option>
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} · {p.preset.prompts.length} 项
            </option>
          ))}
        </select>
        {current && (
          <>
            <select
              value={currentCharacterId ?? current.characterId ?? current.preset.prompt_order[0]?.character_id ?? ''}
              onChange={(e) => onCharacterChange(e.target.value ? Number(e.target.value) : null)}
              className="min-w-0 px-3 py-2 text-sm"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.55)',
                color: 'rgb(var(--tj-text-primary))',
                border: '1px solid rgba(var(--tj-accent-primary), 0.22)',
                borderRadius: '2px',
                outline: 'none',
              }}
            >
              {characterIds.map((id) => (
                <option key={id} value={id}>
                  顺序槽位 {id}
                </option>
              ))}
            </select>
            <select
              value={postProcessMode}
              onChange={(e) => onRuntimeChange({ stPostProcessMode: e.target.value as NonNullable<游戏设置['stPostProcessMode']> })}
              className="min-w-0 px-3 py-2 text-sm"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.55)',
                color: 'rgb(var(--tj-text-primary))',
                border: '1px solid rgba(var(--tj-accent-primary), 0.22)',
                borderRadius: '2px',
                outline: 'none',
              }}
            >
              {(['未选择', '单一用户', '严格', '半严格'] as const).map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => onExport(current)}
              className="px-3 py-2 text-xs transition-all hover:opacity-85"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.52)',
                color: 'rgba(var(--tj-text-primary), 0.82)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
                clipPath: smallClip,
              }}
            >
              导出
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => onDelete(current.id)}
                className="px-3 py-2 text-xs transition-all hover:opacity-85"
                style={{
                  background: 'rgba(var(--tj-danger), 0.08)',
                  color: 'rgba(var(--tj-danger), 0.9)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.24)',
                  clipPath: smallClip,
                }}
              >
                删除
              </button>
            )}
            <button
              type="button"
              onClick={runLocalReview}
              className="px-3 py-2 text-xs transition-all hover:opacity-85"
              style={{
                background: 'rgba(var(--tj-ui-nsfw), 0.12)',
                color: 'rgba(var(--tj-ui-nsfw), 0.95)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.28)',
                clipPath: smallClip,
              }}
            >
              本地审查
            </button>
          </>
        )}
      </div>
      {current && (
        <>
          <div
            className="px-3 py-2 text-xs leading-6"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.32)',
              color: 'rgba(var(--tj-text-secondary), 0.68)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
              clipPath: smallClip,
            }}
          >
            {'{{char}}'} 已由项目内置兼容层接管：会被理解为当前剧情中的主要互动对象、出场 NPC 与 AI 负责扮演的角色集合，无需玩家手动填写。
          </div>
          <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
            酒馆预设只影响主剧情消息链；独立系统和内置模块保持原路径。
          </div>
          <div
            className="grid h-[min(68vh,760px)] min-h-[520px] gap-3 overflow-hidden px-3 py-2.5 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.05fr)]"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.28)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
              clipPath: smallClip,
            }}
          >
            <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.84)' }}>
                  顺序项
                </span>
                <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                  启用 {enabledSlotCount}/{orderSlots.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
              {([
                ['all', '全部'],
                ['enabled', '启用'],
                ['disabled', '关闭'],
                ['runtime', '运行时'],
                ['missing', '未匹配'],
                ['macro', '含宏'],
              ] as const).map(([key, label]) => {
                const active = slotFilter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSlotFilter(key)}
                    className="px-2 py-1 text-xs transition-all"
                    style={{
                      color: active ? 'rgba(var(--tj-ui-nsfw), 0.95)' : 'rgba(var(--tj-text-secondary), 0.62)',
                      background: active ? 'rgba(var(--tj-ui-nsfw), 0.12)' : 'rgba(var(--tj-bg-primary), 0.35)',
                      boxShadow: `inset 0 0 0 1px ${active ? 'rgba(var(--tj-ui-nsfw), 0.3)' : 'rgba(var(--tj-accent-primary), 0.12)'}`,
                      clipPath: smallClip,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              </div>
              <div className="grid grid-cols-4 gap-2 text-xs">
              <div style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>运行时 {runtimeSlotCount}</div>
              <div style={{ color: unmatchedSlotCount > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>
                未匹配 {unmatchedSlotCount}
              </div>
              <div style={{ color: macroSlotCount > 0 ? 'rgba(var(--tj-ui-nsfw), 0.82)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>宏 {macroSlotCount}</div>
              <div style={{ color: advancedMacroSlotCount > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>高级 {advancedMacroSlotCount}</div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
              {shownOrderSlots.map(({ slot, index, prompt, macro, isRuntime, isMissing }) => {
                const active = selectedSlot?.identifier === slot.identifier;
                const contentPreview = prompt?.content?.replace(/\s+/g, ' ').trim().slice(0, 80);
                return (
                  <button
                    key={`${slot.identifier}_${index}`}
                    type="button"
                    onClick={() => setSelectedSlotId(slot.identifier)}
                    className="grid items-start gap-2 px-3 py-2 text-left text-sm transition-all"
                    style={{
                      gridTemplateColumns: '2.25rem minmax(0, 1fr) auto',
                      background: active ? 'rgba(var(--tj-accent-primary), 0.12)' : 'transparent',
                      color: slot.enabled === false ? 'rgba(var(--tj-text-secondary), 0.42)' : 'rgba(var(--tj-text-primary), 0.82)',
                      clipPath: smallClip,
                    }}
                  >
                    <span style={{ color: slot.enabled === false ? 'rgba(var(--tj-text-secondary), 0.42)' : 'rgba(var(--tj-ui-nsfw), 0.82)' }}>
                      #{index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate" title={prompt?.name || slot.identifier}>
                        {prompt?.name || slot.identifier}
                      </span>
                      <span className="mt-1 block truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }} title={slot.identifier}>
                        {slot.identifier}
                      </span>
                      {contentPreview && (
                        <span className="mt-1 block truncate text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.48)' }} title={contentPreview}>
                          {contentPreview}
                        </span>
                      )}
                      {macro.level !== 'none' && (
                        <span className="mt-1 inline-flex px-1.5 py-0.5 text-xs" style={{
                          color: macro.level === 'advanced' ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-ui-nsfw), 0.78)',
                          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
                          clipPath: smallClip,
                        }}>
                          {macro.level === 'advanced' ? '高级宏' : '基础宏'}
                        </span>
                      )}
                    </span>
                    <span className="flex flex-col items-end gap-1 text-xs">
                      <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
                        {isRuntime ? 'runtime' : (isMissing ? 'missing' : (prompt?.role ?? 'system'))}
                      </span>
                      <TogglePill checked={slot.enabled !== false} disabled={!canToggleOrderSlot} onChange={(next) => patchOrderSlot(slot.identifier, { enabled: next })} />
                    </span>
                  </button>
                );
              })}
              {shownOrderSlots.length === 0 && (
                <div className="px-3 py-3 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                  当前筛选下没有顺序项。
                </div>
              )}
              </div>
            </div>
            <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.84)' }}>
                  详细预览
                </span>
                {selectedSlot && (
                  <TogglePill
                    checked={selectedSlot.enabled !== false}
                    disabled={!canToggleOrderSlot}
                    onChange={(next) => patchSelectedSlot({ enabled: next })}
                    label={selectedSlot.enabled === false ? '已关闭' : '已启用'}
                  />
                )}
              </div>
            {selectedSlot ? (
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                {selectedPrompt ? (
                  <>
                    <input
                      value={selectedPrompt.name ?? ''}
                      readOnly={!canEdit}
                      onChange={(e) => patchSelectedPrompt({ name: e.target.value })}
                      className="min-w-0 px-3 py-2 text-sm"
                      style={{
                        background: 'rgba(var(--tj-bg-primary), 0.5)',
                        color: 'rgb(var(--tj-text-primary))',
                        border: '1px solid rgba(var(--tj-accent-primary), 0.18)',
                        borderRadius: '2px',
                        outline: 'none',
                        opacity: canEdit ? 1 : 0.72,
                      }}
                    />
                    <select
                      value={selectedPrompt.role}
                      disabled={!canEdit}
                      onChange={(e) => patchSelectedPrompt({ role: e.target.value as typeof selectedPrompt.role })}
                      className="min-w-0 px-3 py-2 text-sm"
                      style={{
                        background: 'rgba(var(--tj-bg-primary), 0.5)',
                        color: 'rgb(var(--tj-text-primary))',
                        border: '1px solid rgba(var(--tj-accent-primary), 0.18)',
                        borderRadius: '2px',
                        outline: 'none',
                      }}
                    >
                      <option value="system">system</option>
                      <option value="user">user</option>
                      <option value="assistant">assistant</option>
                    </select>
                    <textarea
                      value={selectedPrompt.content}
                      readOnly={!canEdit}
                      onChange={(e) => patchSelectedPrompt({ content: e.target.value })}
                      className="min-h-[280px] resize-y px-3 py-2 font-mono text-sm leading-6"
                      style={{
                        background: 'rgba(var(--tj-bg-primary), 0.5)',
                        color: 'rgb(var(--tj-text-primary))',
                        border: '1px solid rgba(var(--tj-accent-primary), 0.18)',
                        borderRadius: '2px',
                        outline: 'none',
                        opacity: canEdit ? 1 : 0.72,
                      }}
                    />
                    <MacroInspector content={selectedPrompt.content} />
                  </>
                ) : (
                  <div className="text-sm leading-7" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                    {TAVERN_RUNTIME_SLOT_IDS.has(selectedSlot.identifier)
                      ? '运行时槽位由项目上下文注入：聊天历史、世界书、角色描述或玩家输入会在发送时填充。'
                      : '该顺序项未匹配到 prompts 内容，可能是预设占位符。'}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-1 items-center justify-center p-6 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.08)', clipPath: smallClip }}>
                从左侧选择一个顺序项查看正文和宏检测。
              </div>
            )}
            </div>
          </div>
          {worldInfoViewEntries.length > 0 && (
            <div
              className="px-3 py-2"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.24)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
                clipPath: smallClip,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-serif text-sm tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.84)' }}>
                  预设世界书
                </span>
                <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                  启用 {enabledWorldInfoCount}/{worldInfoViewEntries.length} · 常驻 {constantWorldInfoCount}
                </span>
              </div>
              <div className="max-h-72 overflow-y-auto pr-1">
                <div className="grid gap-2 md:grid-cols-2">
                  {worldInfoViewEntries.map(({ key, entry }, index) => {
                    const title = getPresetWorldInfoTitle(entry, index);
                    const primaryKeys = readPresetWorldInfoKeys(entry.key);
                    const secondaryKeys = readPresetWorldInfoKeys(entry.keysecondary);
                    const content = readPresetWorldInfoText(entry.content).replace(/\s+/g, ' ').trim();
                    const enabled = isPresetWorldInfoEnabled(entry);
                    const constant = isPresetWorldInfoConstant(entry);
                    const order = readPresetWorldInfoText(entry.order) || '100';
                    const probability = readPresetWorldInfoText(entry.probability) || '100';
                    return (
                      <div
                        key={key}
                        className="grid gap-2 px-3 py-2 text-xs leading-5"
                        style={{
                          background: enabled ? 'rgba(var(--tj-bg-secondary), 0.26)' : 'rgba(var(--tj-bg-primary), 0.18)',
                          color: enabled ? 'rgba(var(--tj-text-primary), 0.76)' : 'rgba(var(--tj-text-secondary), 0.45)',
                          boxShadow: `inset 0 0 0 1px ${enabled ? 'rgba(var(--tj-accent-primary), 0.13)' : 'rgba(var(--tj-text-secondary), 0.08)'}`,
                          clipPath: smallClip,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="truncate font-serif text-sm tracking-[0.08em]" title={title}>
                              {title}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              <span style={{ color: constant ? 'rgba(var(--tj-ui-nsfw), 0.84)' : 'rgba(var(--tj-text-secondary), 0.58)' }}>
                                {constant ? '常驻' : '关键词'}
                              </span>
                              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>order {order}</span>
                              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>概率 {probability}%</span>
                            </div>
                          </div>
                          <TogglePill
                            checked={enabled}
                            disabled={!canEdit}
                            onChange={(next) => patchWorldInfoEntry(key, { enabled: next })}
                          />
                        </div>
                        <div className="grid gap-1" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
                          <div className="truncate" title={primaryKeys.join(' / ') || '无主关键词'}>
                            主关键词：{primaryKeys.length > 0 ? primaryKeys.join(' / ') : '无'}
                          </div>
                          {secondaryKeys.length > 0 && (
                            <div className="truncate" title={secondaryKeys.join(' / ')}>
                              次关键词：{secondaryKeys.join(' / ')}
                            </div>
                          )}
                          <div className="line-clamp-2" title={content}>
                            {content || '无正文'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="mt-2 text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.56)' }}>
                world_info 只在主剧情酒馆消息链中按关键词触发，不写入全局世界书，也不影响独立系统。
              </div>
            </div>
          )}
          <div
            data-tavern-regex-panel="true"
            className="px-3 py-2"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-bg-primary), 0.26), rgba(var(--tj-ui-nsfw), 0.045))',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.16)',
              clipPath: smallClip,
            }}
          >
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-serif text-sm tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-nsfw), 0.88)' }}>
                  预设正则脚本
                </span>
                <span className="px-2 py-0.5 text-xs" style={{
                  color: 'rgba(var(--tj-text-secondary), 0.66)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
                  clipPath: smallClip,
                }}>
                  仅审查 / 干跑
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}>
                <span>总数 {regexScripts.length}</span>
                <span>未禁用 {enabledRegexScriptCount}</span>
                <span style={{ color: riskyRegexScriptCount > 0 ? 'rgba(var(--tj-ui-nsfw), 0.86)' : 'rgba(var(--tj-text-secondary), 0.6)' }}>
                  高风险 {riskyRegexScriptCount}
                </span>
                <span style={{ color: blockedRegexScriptCount > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.6)' }}>
                  阻断 {blockedRegexScriptCount}
                </span>
              </div>
            </div>
            {regexScripts.length === 0 ? (
              <div
                className="grid gap-2 px-3 py-4 text-sm leading-6"
                style={{
                  background: 'rgba(var(--tj-bg-primary), 0.22)',
                  color: 'rgba(var(--tj-text-secondary), 0.66)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                  clipPath: smallClip,
                }}
              >
                <div className="font-serif tracking-[0.1em]" style={{ color: 'rgba(var(--tj-text-primary), 0.76)' }}>
                  当前预设没有附带 regex_scripts
                </div>
                <div>
                  如果导入的 ST 预设包含正则脚本，这里会显示脚本列表、风险类型、协议标签检查和干跑预览。主剧情只会执行安全输出清理类正则。
                </div>
              </div>
            ) : (
            <div
              className="grid min-h-[360px] gap-3 overflow-hidden lg:grid-cols-[minmax(260px,0.9fr)_minmax(0,1.1fr)]"
            >
                <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                  <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
                    regex_scripts 会被保留并分析风险；安全输出清理类会在主剧情后处理执行，高风险脚本仍不会改写正文输出。
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
                    {regexScripts.map((script, index) => {
                      const safety = regexScriptSafety[index];
                      const active = effectiveRegexIndex === index;
                      const title = getPresetRegexTitle(script, index);
                      const findPreview = getPresetRegexFindText(script).replace(/\s+/g, ' ').trim();
                      return (
                        <button
                          key={`${title}_${index}`}
                          type="button"
                          onClick={() => setSelectedRegexIndex(index)}
                          className="grid gap-2 px-3 py-2 text-left text-xs transition-all"
                          style={{
                            background: active ? 'rgba(var(--tj-ui-nsfw), 0.1)' : 'rgba(var(--tj-bg-primary), 0.18)',
                            color: safety.disabled ? 'rgba(var(--tj-text-secondary), 0.45)' : 'rgba(var(--tj-text-primary), 0.78)',
                            boxShadow: `inset 0 0 0 1px ${active ? 'rgba(var(--tj-ui-nsfw), 0.28)' : 'rgba(var(--tj-accent-primary), 0.1)'}`,
                            clipPath: smallClip,
                          }}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="min-w-0 truncate font-serif text-sm tracking-[0.06em]" title={title}>
                              {title}
                            </span>
                            <span style={{ color: safety.disabled ? 'rgba(var(--tj-text-secondary), 0.52)' : 'rgba(var(--tj-ui-nsfw), 0.82)' }}>
                              {safety.disabled ? '禁用' : '未禁用'}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <span className="px-1.5 py-0.5" style={{
                              color: safety.kind === 'blocked' ? 'rgba(var(--tj-danger), 0.92)' : safety.risky ? 'rgba(var(--tj-ui-nsfw), 0.9)' : 'rgba(var(--tj-accent-primary), 0.82)',
                              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.16)',
                              clipPath: smallClip,
                            }}>
                              {getPresetRegexKindLabel(safety.kind)}
                            </span>
                            {safety.blocksProtocolTags && (
                              <span className="px-1.5 py-0.5" style={{
                                color: 'rgba(var(--tj-danger), 0.9)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.22)',
                                clipPath: smallClip,
                              }}>
                                协议标签风险
                              </span>
                            )}
                          </div>
                          <div className="truncate font-mono" title={findPreview || 'find_regex 为空'} style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
                            {findPreview || 'find_regex 为空'}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                  {selectedRegexScript && selectedRegexSafety && selectedRegexDryRun ? (
                    <>
                      <div className="grid gap-2 md:grid-cols-4">
                        {[
                          ['类型', getPresetRegexKindLabel(selectedRegexSafety.kind)],
                          ['状态', selectedRegexSafety.disabled ? '禁用' : '未禁用'],
                          ['风险', selectedRegexSafety.risky ? '高' : '低'],
                          ['命中', `${selectedRegexDryRun.matches}`],
                        ].map(([label, value]) => (
                          <div key={label} className="px-2 py-1.5 text-xs" style={{
                            background: 'rgba(var(--tj-bg-primary), 0.26)',
                            color: 'rgba(var(--tj-text-primary), 0.74)',
                            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                            clipPath: smallClip,
                          }}>
                            <div style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>{label}</div>
                            <div className="mt-1 truncate">{value}</div>
                          </div>
                        ))}
                      </div>
                      <div className="grid min-h-0 flex-1 gap-2 overflow-hidden xl:grid-cols-2">
                        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                          <div className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>脚本内容</div>
                          <div className="grid gap-2 overflow-y-auto pr-1">
                            <div>
                              <div className="mb-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.54)' }}>find_regex</div>
                              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5" style={{
                                background: 'rgba(var(--tj-bg-primary), 0.36)',
                                color: 'rgba(var(--tj-text-primary), 0.76)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                                clipPath: smallClip,
                              }}>{getPresetRegexFindText(selectedRegexScript) || '空'}</pre>
                            </div>
                            <div>
                              <div className="mb-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.54)' }}>replace_string</div>
                              <pre className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5" style={{
                                background: 'rgba(var(--tj-bg-primary), 0.36)',
                                color: 'rgba(var(--tj-text-primary), 0.76)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.1)',
                                clipPath: smallClip,
                              }}>{getPresetRegexReplaceText(selectedRegexScript) || '空'}</pre>
                            </div>
                            <div className="text-xs leading-5" style={{ color: selectedRegexSafety.risky ? 'rgba(var(--tj-ui-nsfw), 0.82)' : 'rgba(var(--tj-text-secondary), 0.64)' }}>
                              {selectedRegexSafety.reason}
                            </div>
                            {selectedRegexDryRun.warnings.length > 0 && (
                              <div className="grid gap-1 text-xs leading-5" style={{ color: 'rgba(var(--tj-danger), 0.84)' }}>
                                {selectedRegexDryRun.warnings.map((warning) => (
                                  <div key={warning}>- {warning}</div>
                                ))}
                              </div>
                            )}
                            {selectedRegexDryRun.error && (
                              <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-danger), 0.84)' }}>
                                正则错误：{selectedRegexDryRun.error}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex min-h-0 flex-col gap-2 overflow-hidden">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>干跑预览</span>
                            <button
                              type="button"
                              onClick={() => setRegexDryRunSample(DEFAULT_TAVERN_REGEX_DRY_RUN_SAMPLE)}
                              className="px-2 py-1 text-xs"
                              style={{
                                color: 'rgba(var(--tj-text-secondary), 0.65)',
                                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
                                clipPath: smallClip,
                              }}
                            >
                              重置样例
                            </button>
                          </div>
                          <textarea
                            value={regexDryRunSample}
                            onChange={(e) => setRegexDryRunSample(e.target.value)}
                            className="min-h-[120px] resize-y px-3 py-2 font-mono text-xs leading-5"
                            style={{
                              background: 'rgba(var(--tj-bg-primary), 0.38)',
                              color: 'rgba(var(--tj-text-primary), 0.76)',
                              border: '1px solid rgba(var(--tj-accent-primary), 0.12)',
                              borderRadius: '2px',
                              outline: 'none',
                            }}
                          />
                          <pre className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 font-mono text-xs leading-5" style={{
                            background: selectedRegexDryRun.ok ? 'rgba(var(--tj-accent-primary), 0.055)' : 'rgba(var(--tj-ui-nsfw), 0.06)',
                            color: 'rgba(var(--tj-text-primary), 0.78)',
                            boxShadow: `inset 0 0 0 1px ${selectedRegexDryRun.ok ? 'rgba(var(--tj-accent-primary), 0.14)' : 'rgba(var(--tj-ui-nsfw), 0.18)'}`,
                            clipPath: smallClip,
                          }}>
                            {selectedRegexDryRun.after}
                          </pre>
                        </div>
                      </div>
                      <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.56)' }}>
                    当前仅展示替换结果和风险判断，不会写入预设；真实运行只放开安全输出清理类正则。
                      </div>
                    </>
                  ) : (
                    <div className="flex flex-1 items-center justify-center p-6 text-sm" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>
                      从左侧选择一个正则脚本查看详情。
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
          <div
            className="px-3 py-2"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.24)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
              clipPath: smallClip,
            }}
          >
            <button
              type="button"
              onClick={() => setDiagnosticsOpen((value) => !value)}
              className="flex w-full items-center justify-between gap-3 text-left text-sm"
              style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}
            >
              <span className="font-serif tracking-[0.14em]">运行诊断</span>
              <span className="text-xs" style={{ color: scanIssues.length > 0 ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-text-secondary), 0.62)' }}>
                {scanIssues.length > 0 ? `${scanIssues.length} 项提示` : '结构正常'} · {diagnosticsOpen ? '收起' : '展开'}
              </span>
            </button>
            {diagnosticsOpen && (
              <div className="mt-2 grid gap-2 text-xs leading-6" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
                {(scanIssues.length > 0 ? scanIssues : ['暂未发现结构性问题']).map((item) => (
                  <div key={item}>- {item}</div>
                ))}
                <div>- 格式保护层会在消息链末尾兜底 CoT、回复格式和行动选项。</div>
                <div>- 高级宏条目建议先查看右侧宏检测，再决定是否关闭。</div>
              </div>
            )}
          </div>
          {aiReviewOpen && (
            <div
              className="px-3 py-2"
              style={{
                background: 'rgba(var(--tj-bg-primary), 0.3)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.18)',
                clipPath: smallClip,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-serif text-sm tracking-[0.14em]" style={{ color: 'rgba(var(--tj-ui-nsfw), 0.88)' }}>本地审查报告</span>
                <button type="button" onClick={() => setAiReviewOpen(false)} className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>收起</button>
              </div>
              <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap text-xs leading-6" style={{ color: 'rgba(var(--tj-text-primary), 0.78)' }}>
                {aiReviewText || buildLocalReviewText()}
              </pre>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function V2PresetStructurePreview({ preset, characterId }: { preset: STPresetEntryV2; characterId: number | null }) {
  const selectedOrder =
    preset.preset.prompt_order.find((item) => item.character_id === characterId) ??
    preset.preset.prompt_order.find((item) => item.character_id === 100001) ??
    preset.preset.prompt_order[0];
  const promptMap = new Map(preset.preset.prompts.map((prompt) => [prompt.identifier, prompt]));
  const systemSlots = new Set(['worldInfoBefore', 'worldInfoAfter', 'chatHistory', 'personaDescription', 'userInput', 'user_input', 'latestUserInput', 'input']);
  const rows = selectedOrder?.order.slice(0, 8) ?? [];
  return (
    <div
      className="flex flex-col gap-2 px-3 py-2.5"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.28)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-serif tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.82)' }}>
          结构预览
        </span>
        <span className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)' }}>
          {preset.preset.prompts.length} 内容项 / {selectedOrder?.order.length ?? 0} 顺序项
        </span>
      </div>
      <div className="flex flex-col gap-1">
        {rows.map((slot, index) => {
          const prompt = promptMap.get(slot.identifier);
          const isSystemSlot = systemSlots.has(slot.identifier);
          return (
            <div
              key={`${slot.identifier}_${index}`}
              className="grid items-center gap-2 px-2 py-1.5 text-xs"
              style={{
                gridTemplateColumns: '1.5rem minmax(0, 1fr) auto',
                color: slot.enabled === false ? 'rgba(var(--tj-text-secondary), 0.42)' : 'rgba(var(--tj-text-primary), 0.82)',
              }}
            >
              <span style={{ color: isSystemSlot ? 'rgba(var(--tj-accent-primary), 0.9)' : 'rgba(var(--tj-text-secondary), 0.55)' }}>
                {slot.enabled === false ? '○' : isSystemSlot ? '◆' : '◇'}
              </span>
              <span className="truncate" title={prompt?.name || slot.identifier}>
                {prompt?.name || slot.identifier}
              </span>
              <span style={{ color: 'rgba(var(--tj-text-secondary), 0.52)' }}>
                {isSystemSlot ? '运行时' : (prompt?.role ?? 'system')}
              </span>
            </div>
          );
        })}
      </div>
      {(selectedOrder?.order.length ?? 0) > rows.length && (
        <div className="text-xs leading-5" style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}>
          其余 {selectedOrder!.order.length - rows.length} 项已折叠
        </div>
      )}
    </div>
  );
}

function MacroInspector({ content }: { content: string }) {
  const macro = detectTavernMacroInfo(content);
  if (macro.level === 'none') {
    return (
      <div className="px-3 py-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.08)', clipPath: smallClip }}>
        宏检测：未发现宏。
      </div>
    );
  }
  return (
    <div
      className="flex flex-col gap-2 px-3 py-2 text-xs"
      style={{
        color: 'rgba(var(--tj-text-secondary), 0.72)',
        boxShadow: `inset 0 0 0 1px ${macro.level === 'advanced' ? 'rgba(var(--tj-danger), 0.22)' : 'rgba(var(--tj-ui-nsfw), 0.18)'}`,
        clipPath: smallClip,
      }}
    >
      <div className="font-serif tracking-[0.14em]" style={{ color: macro.level === 'advanced' ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-ui-nsfw), 0.82)' }}>
        宏检测 · {macro.level === 'advanced' ? '高级宏' : '基础宏'}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {macro.macros.map((item) => (
          <span key={item} className="px-1.5 py-0.5" style={{ color: 'rgba(var(--tj-text-primary), 0.72)', background: 'rgba(var(--tj-bg-primary), 0.36)', clipPath: smallClip }}>
            {item}
          </span>
        ))}
      </div>
      {macro.level === 'advanced' && (
        <div className="leading-5">
          该条目可能承担变量赋值、条件分支或随机选择逻辑，建议审查后再关闭。
        </div>
      )}
    </div>
  );
}

/** 判断模块是否可修改：非内置 / 自定义文风槽 / ST导入 都可修改。
 *  用于 ModuleItem 显示 ✓ 可修改 / 🔒 不可修改 标识。 */
const isModifiableModule = (m: 提示词模块) =>
  !isBuiltinPromptModule(m.id) || m.id === 'builtin_writing_style_custom' || isSTImportedModule(m);

function ModuleList({
  modules,
  selected,
  onSelect,
  onToggle,
  showModifyLayer,
  onReorder,
}: {
  modules: 提示词模块[];
  selected: 提示词模块 | undefined;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  showModifyLayer: boolean;
  onReorder?: (reorderedModules: 提示词模块[]) => void;
}) {
  if (!modules.length) return null;

  if (!showModifyLayer) {
    // 独立系统页面：按子系统分组，每组一个折叠标题 + 模块列表
    const grouped: Record<string, 提示词模块[]> = {};
    for (const m of modules) {
      const key = getCalibrationGroupKey(m);
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(m);
    }

    return (
      <div className="mb-2 space-y-3">
        {CALIBRATION_GROUP_ORDER.filter((k) => grouped[k]?.length).map((key) => {
          const group = CALIBRATION_SYSTEM_GROUPS[key];
          const items = grouped[key];
          return (
            <SystemGroupSection key={key} group={group} items={items} selected={selected} onSelect={onSelect} onToggle={onToggle} />
          );
        })}
        {/* 未归类模块兜底 */}
        {grouped['other']?.length > 0 && (
          <SystemGroupSection
            group={{ label: '其他系统', icon: '◈', emoji: '⚡', match: () => false }}
            items={grouped['other']}
            selected={selected}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        )}
      </div>
    );
  }

  // 主剧情系统：统一为「提示词模块」单一列表，按 order 升序排列（不再区分内置 / 预设）。
  return (
    <div className="mb-2">
      <ModifyLayer
        title="提示词模块"
        icon="▼"
        defaultCollapsed={false}
        modules={modules}
        selected={selected}
        onSelect={onSelect}
        onToggle={onToggle}
        onReorder={onReorder}
      />
    </div>
  );
}

function SystemGroupSection({
  group,
  items,
  selected,
  onSelect,
  onToggle,
}: {
  group: { label: string; icon: string; emoji: string; match: (id: string) => boolean };
  items: 提示词模块[];
  selected: 提示词模块 | undefined;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-1 py-1.5 text-left transition-all"
      >
        <span
          className="text-xs font-mono transition-transform"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.7)',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
          }}
        >
          ▼
        </span>
        <span className="text-sm">{group.emoji}</span>
        <span
          className="text-sm font-serif tracking-[0.16em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
        >
          {group.label}
        </span>
        <span
          className="text-xs"
          style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}
        >
          {items.length} 条
        </span>
      </button>
      {!collapsed && items.map((m) => (
        <ModuleItem key={m.id} m={m} active={m.id === selected?.id} onSelect={onSelect} onToggle={onToggle} />
      ))}
    </div>
  );
}

function ModifyLayer({
  title,
  icon,
  defaultCollapsed,
  modules,
  selected,
  onSelect,
  onToggle,
  onReorder,
}: {
  title: string;
  icon: string;
  defaultCollapsed: boolean;
  modules: 提示词模块[];
  selected: 提示词模块 | undefined;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onReorder?: (reorderedModules: 提示词模块[]) => void;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  // 拖拽结束：按新顺序重算 order（间距 10），仅修改 order 值变化的模块
  const handleDragEnd = (event: DragEndEvent) => {
    if (!onReorder) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = modules.findIndex((m) => m.id === active.id);
    const newIndex = modules.findIndex((m) => m.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const reordered = arrayMove(modules, oldIndex, newIndex);
    const STEP = 10;
    const updated = reordered.map((m, i) => ({
      ...m,
      order: STEP * (i + 1),
      updatedAt: Date.now(),
    }));
    onReorder(updated);
  };

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-1 py-1.5 text-left transition-all"
      >
        <span
          className="text-xs font-mono transition-transform"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.7)',
            transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
          }}
        >
          {icon}
        </span>
        <span
          className="text-sm font-serif tracking-[0.16em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
        >
          {title}
        </span>
        <span
          className="text-xs"
          style={{ color: 'rgba(var(--tj-text-secondary), 0.55)' }}
        >
          {modules.length} 条
        </span>
        {onReorder && (
          <span
            className="text-[10px] font-serif tracking-[0.12em]"
            style={{ color: 'rgba(var(--tj-accent-primary), 0.45)' }}
          >
            · 可拖拽
          </span>
        )}
      </button>
      {!collapsed && onReorder ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={modules.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            {modules.map((m) => (
              <SortableModuleItem key={m.id} m={m} active={m.id === selected?.id} onSelect={onSelect} onToggle={onToggle} />
            ))}
          </SortableContext>
        </DndContext>
      ) : !collapsed ? (
        modules.map((m) => (
          <ModuleItem key={m.id} m={m} active={m.id === selected?.id} onSelect={onSelect} onToggle={onToggle} />
        ))
      ) : null}
    </div>
  );
}

/** 拖拽手柄图标（六点双竖线） */
const DRAG_HANDLE_ICON = '⠿';

/** SortableModuleItem：在 ModuleItem 外层包裹 dnd-kit 的 sortable 能力。
 *  - attributes 绑到外层 div（提供 a11y/role 等语义）
 *  - listeners 只绑到内部的拖拽手柄 span，避免吃掉 ModuleItem 内部的 onSelect 点击 / onToggle 滑块开关事件
 *  - 拖拽中：透明度 0.5 + 提升 z-index，避免被遮挡
 */
function SortableModuleItem({ m, active, onSelect, onToggle }: {
  m: 提示词模块;
  active: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      className="flex items-stretch"
    >
      <span
        {...listeners}
        title="拖拽以调整顺序"
        aria-label="拖拽手柄"
        className="flex w-4 flex-shrink-0 cursor-grab select-none items-center justify-center text-xs transition-colors active:cursor-grabbing"
        style={{
          color: 'rgba(var(--tj-accent-primary), 0.45)',
        }}
      >
        {DRAG_HANDLE_ICON}
      </span>
      <div className="min-w-0 flex-1">
        <ModuleItem m={m} active={active} onSelect={onSelect} onToggle={onToggle} />
      </div>
    </div>
  );
}

function ModuleItem({
  m,
  active,
  onSelect,
  onToggle,
}: {
  m: 提示词模块;
  active: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const isCal = m.scope?.includes('calibration');
  const isSTImport = isSTImportedModule(m);
  const isStyle = isWritingStyleModule(m);
  // 开关禁用：独立模型展示模块（非真实开关）
  const toggleDisabled = isCal || m.locked === true;
  // 身份标签：预设 > 内置 > 自定义
  const badgeLabel = isSTImport ? '预设' : m.builtin ? '内置' : '自定义';
  const badgeStyle = isSTImport
    ? {
        color: 'rgb(var(--tj-bg-primary))',
        background: 'linear-gradient(135deg, rgba(var(--tj-ui-nsfw), 0.88), rgba(var(--tj-ui-nsfw), 0.68))',
      }
    : m.builtin
      ? {
          color: 'rgb(var(--tj-bg-primary))',
          background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))',
        }
      : {
          color: 'rgba(var(--tj-accent-primary), 0.94)',
          background: 'rgba(var(--tj-accent-primary), 0.12)',
        };
  return (
    <button
      onClick={() => onSelect(m.id)}
      className="mb-1 w-full px-3 py-2 text-left transition-all"
      style={{
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.16), rgba(var(--tj-btn-primary-end), 0.04))'
          : 'rgba(var(--tj-bg-secondary), 0.45)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55), 0 0 0 1px rgba(var(--tj-accent-primary), 0.06), 0 0 12px rgba(var(--tj-accent-glow), 0.04)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
        clipPath: smallClip,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="text-[10px] px-1.5 py-0.5"
          style={{
            ...badgeStyle,
            clipPath:
              'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
          }}
        >
          {badgeLabel}
        </span>
        {/* 可修改性标识：✓ 可修改 / 🔒 不可修改 */}
        <span
          title={isModifiableModule(m) ? '可修改' : '只读不可改'}
          className="text-[10px] px-1 py-0.5"
          style={{
            color: isModifiableModule(m)
              ? 'rgba(var(--tj-sage-soft), 0.95)'
              : 'rgba(var(--tj-text-secondary), 0.55)',
            background: isModifiableModule(m)
              ? 'rgba(var(--tj-sage-soft), 0.12)'
              : 'rgba(var(--tj-bg-secondary), 0.5)',
            boxShadow: `inset 0 0 0 1px ${
              isModifiableModule(m)
                ? 'rgba(var(--tj-sage-soft), 0.35)'
                : 'rgba(var(--tj-text-secondary), 0.18)'
            }`,
            clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)',
          }}
        >
          {isModifiableModule(m) ? '✓' : '🔒'}
        </span>
        <span
          className="flex-1 truncate font-serif text-sm tracking-wider"
          style={{ color: 'rgb(var(--tj-text-primary))' }}
        >
          {m.title}
        </span>
        {/* 右上角小徽章：文风互斥 */}
        {isStyle && (
          <span
            className="text-[8px] font-serif tracking-[0.12em] px-1.5 py-0.5"
            style={{
              color: 'rgba(var(--tj-accent-secondary), 0.85)',
              background: 'rgba(var(--tj-accent-secondary), 0.1)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-secondary), 0.25)',
              clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
            }}
            title="文风模块为单选互斥：启用一个会自动关闭其他文风"
          >
            互斥
          </span>
        )}
        {/* 滑块开关：独立模型展示模块 / 锁定模块禁用（不可切换）。
            显示用真实 enabled —— 剧情方向模块四选一，只有命中当前剧情模式的那本为开。 */}
        <span
          role="switch"
          aria-checked={m.enabled}
          title={
            isCal
              ? '独立模型展示模块不是真实请求开关'
              : m.locked
                ? '剧情方向由开局选择的剧情模式决定，不可手动切换'
                : m.enabled
                  ? '已启用'
                  : '已关闭'
          }
          onClick={(e) => {
            e.stopPropagation();
            if (!toggleDisabled) onToggle(m.id);
          }}
          className="relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer items-center transition-all"
          style={{
            background: m.enabled
              ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))'
              : 'rgba(var(--tj-bg-secondary), 0.68)',
            boxShadow: m.enabled
              ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.4)'
              : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
            clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
            cursor: toggleDisabled ? 'not-allowed' : 'pointer',
            opacity: toggleDisabled ? 0.6 : 1,
          }}
        >
          <span
            className="absolute top-0.5 h-3 w-3 transition-transform"
            style={{
              left: m.enabled ? 'calc(100% - 0.875rem)' : '0.125rem',
              background: m.enabled ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
              clipPath: 'polygon(2px 0, 100% 0, 100% calc(100% - 2px), calc(100% - 2px) 100%, 0 100%, 0 2px)',
            }}
          />
        </span>
      </div>
      <div
        className="mt-1 truncate text-xs"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.6)' }}
      >
        [<span style={{ color: `rgba(var(${CATEGORY_COLOR_VAR[m.category]}), 0.9)` }}>{PROMPT_MODULE_CATEGORY_LABELS[m.category]}</span> · order {m.order}] {m.description || '—'}
      </div>
    </button>
  );
}

function EditorPanel({
  module: m,
  onPatch,
  onDelete,
}: {
  module: 提示词模块;
  onPatch: (p: Partial<提示词模块>) => void;
  onDelete: () => void;
}) {
  const readonly = m.builtin && m.id !== 'builtin_writing_style_custom';
  const isCalibrationModule = m.scope?.includes('calibration');
  // 开关禁用：独立模型展示模块（非真实开关）
  const toggleDisabled = isCalibrationModule || m.locked === true;

  // 分层信息：根据 order 区间映射 Layer
  const layerLabel = m.order < 10 ? 'Layer 1 · 顶层' : m.order < 30 ? 'Layer 2 · 主体' : 'Layer 3 · 尾部';

  // ST 导入替换关系提示
  const isSTImport = isSTImportedModule(m);
  const stTargetCategory = isSTImport ? getSTImportTargetCategory(m) : null;

  return (
    <div className="min-w-0 space-y-3">
      {/* 分层标记 */}
      <div
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-serif tracking-[0.16em]"
        style={{
          background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.06) 0%, transparent 100%)',
          color: 'rgba(var(--tj-accent-primary), 0.7)',
          clipPath:
            'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
        }}
      >
        <span>{layerLabel}</span>
        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.4)' }}>·</span>
        <span style={{ color: `rgba(var(${CATEGORY_COLOR_VAR[m.category]}), 0.85)` }}>
          {PROMPT_MODULE_CATEGORY_LABELS[m.category]}
        </span>
        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.4)' }}>·</span>
        <span style={{ color: 'rgba(var(--tj-text-secondary), 0.4)' }}>
          order {m.order}
        </span>
        {m.builtin && (
          <>
            <span style={{ color: 'rgba(var(--tj-text-secondary), 0.4)' }}>·</span>
            <span style={{ color: 'rgba(var(--tj-accent-primary), 0.45)' }}>内置</span>
          </>
        )}
      </div>
      {/* ST 导入替换关系提示条 */}
      {isSTImport && stTargetCategory && (
        <div
          className="flex items-start gap-2 px-3 py-2 text-xs"
          style={{
            background: 'linear-gradient(90deg, rgba(var(--tj-ui-nsfw), 0.08) 0%, transparent 100%)',
            boxShadow: 'inset 2px 0 0 rgba(var(--tj-ui-nsfw), 0.6), inset 0 0 0 1px rgba(var(--tj-ui-nsfw), 0.15)',
            clipPath:
              'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
          }}
        >
          <span
            className="font-serif tracking-[0.12em] flex-shrink-0"
            style={{ color: 'rgba(var(--tj-ui-nsfw), 0.85)' }}
          >
            ◈ ST导入
          </span>
          <span style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
            此模块从 SillyTavern 预设导入，归类于
            <span style={{ color: `rgba(var(${CATEGORY_COLOR_VAR[stTargetCategory]}), 0.9)`, margin: '0 0.25em' }}>
              {PROMPT_MODULE_CATEGORY_LABELS[stTargetCategory]}
            </span>
            分类。启用后将替换同分类的内置模块内容；删除后会回退到内置版本。
          </span>
        </div>
      )}
      {/* 启用开关 */}
      <div
        className="flex flex-col items-stretch gap-3 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        style={{
          background: 'rgba(var(--tj-bg-secondary), 0.45)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)',
          clipPath:
            'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
        }}
      >
        <div className="min-w-0 sm:mr-3">
          <div
            className="font-serif font-bold text-sm tracking-wider"
            style={{ color: 'rgb(var(--tj-text-primary))' }}
          >
            {toggleDisabled ? '独立模型展示' : '启用此模块'}
          </div>
          <div className="text-xs mt-0.5" style={{ color: 'rgba(var(--tj-text-secondary), 0.65)' }}>
            {isCalibrationModule
              ? '独立模型提示词展示：新闻、手机、智库、变量、剧情编织等真实请求由对应服务层共享 prompt 构建；可在“上下文”页核对实际发送内容。'
              : isWritingStyleModule(m)
                ? '文风模块为单选互斥：启用本模块会自动关闭其他文风模块。同一时间只能生效一个文风。'
                : '关闭后，本模块的内容不会注入到当前作用域的 system prompt。'}
          </div>
        </div>
        <button
          type="button"
          disabled={toggleDisabled}
          aria-disabled={toggleDisabled}
          title={toggleDisabled ? '独立模型展示模块不是真实请求开关' : undefined}
          onClick={() => {
            if (toggleDisabled) return;
            onPatch({ enabled: !m.enabled });
          }}
          className="relative h-6 w-11 flex-shrink-0 transition-all"
          style={{
            background: toggleDisabled || m.enabled
                  ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))'
                  : 'rgba(var(--tj-bg-secondary), 0.68)',
            boxShadow: toggleDisabled || m.enabled
              ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5), 0 0 10px rgba(var(--tj-accent-primary), 0.25)'
              : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
            clipPath: smallClip,
            cursor: toggleDisabled ? 'not-allowed' : 'pointer',
            opacity: toggleDisabled ? 0.82 : 1,
          }}
        >
          <div
            className="absolute top-0.5 h-5 w-5 transition-transform"
            style={{
              left: toggleDisabled || m.enabled ? 'calc(100% - 1.375rem)' : '0.125rem',
              background: toggleDisabled || m.enabled ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.78)',
              clipPath:
                'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
            }}
          />
        </button>
      </div>

      {/* 标题 */}
      <Field label={`◆ 标题${readonly ? '（内置，只读）' : ''}`}>
        <input
          type="text"
          value={m.title}
          readOnly={readonly}
          onChange={(e) => onPatch({ title: e.target.value })}
          className="kaituo-input w-full min-w-0 px-3 py-2 text-sm"
          style={{ clipPath: smallClip, opacity: readonly ? 0.7 : 1 }}
        />
      </Field>

      {/* 描述 */}
      <Field label={`◆ 描述${readonly ? '（内置，只读）' : ''}`}>
        <input
          type="text"
          value={m.description}
          readOnly={readonly}
          onChange={(e) => onPatch({ description: e.target.value })}
          className="kaituo-input w-full min-w-0 px-3 py-2 text-sm"
          style={{ clipPath: smallClip, opacity: readonly ? 0.7 : 1 }}
        />
      </Field>

      {/* 分类 + order */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Field label="◆ 分类">
          <select
            value={m.category}
            disabled={readonly}
            onChange={(e) =>
              onPatch({ category: e.target.value as 提示词模块类目 })
            }
            className="kaituo-input w-full min-w-0 px-3 py-2 text-sm"
            style={{ clipPath: smallClip, opacity: readonly ? 0.7 : 1 }}
          >
            {(Object.keys(PROMPT_MODULE_CATEGORY_LABELS) as 提示词模块类目[]).map((c) => (
              <option key={c} value={c}>
                {PROMPT_MODULE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="◆ 注入顺序（升序）">
          <input
            type="number"
            value={m.order}
            disabled={readonly}
            onChange={(e) => onPatch({ order: Number(e.target.value) })}
            className="kaituo-input w-full min-w-0 px-3 py-2 text-sm sm:w-24"
            style={{ clipPath: smallClip, opacity: readonly ? 0.7 : 1 }}
          />
        </Field>
      </div>
      <div className="text-xs -mt-1" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
        order &lt; 30 注入到 system prompt 顶部；&ge; 30 注入到尾部。
      </div>

      {/* 注入场景（scope） */}
      <Field label={`◆ 注入场景${readonly ? '（内置，只读）' : ''}`}>
        <ScopeChips
          value={m.scope?.length ? m.scope : ['all']}
          readonly={readonly}
          onChange={(next) => onPatch({ scope: next })}
        />
      </Field>
      <div className="text-xs -mt-1" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
        {isCalibrationModule
          ? '「独立模型」作用域用于展示独立 API / 校准模型提示词，不会进入主剧情 system prompt；真实调用以对应上下文页为准。'
          : '勾选「任意」表示在所有场景注入；其他场景互斥于「任意」，选中具体场景将取消「任意」。'}
      </div>

      {/* 内容 */}
      <Field label={`◆ 提示词正文${readonly ? '（内置，只读）' : ''}`}>
        <textarea
          value={m.content}
          readOnly={readonly}
          onChange={(e) => onPatch({ content: e.target.value })}
          rows={16}
          className="kaituo-input w-full min-w-0 resize-none px-3 py-2 font-mono text-xs"
          style={{ clipPath: smallClip, opacity: readonly ? 0.8 : 1 }}
        />
      </Field>
      <div className="text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>
        可用占位符：<code>{'{wordCountTarget}'}</code>（最少字数）/ <code>{'{personLabel}'}</code>（叙述人称描述）。注入时按当前设置替换。
      </div>

      {/* 删除按钮（自定义模块） */}
      {!readonly && !isBuiltinPromptModule(m.id) && m.id !== 'builtin_writing_style_custom' && (
        <div className="pt-2" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.15)' }}>
          <button
            onClick={() => {
              if (confirm(`确定删除模块「${m.title}」？此操作不可撤销。`)) onDelete();
            }}
            className="px-3 py-1.5 text-xs font-serif tracking-wider transition-all hover:opacity-80"
            style={{
              background: 'transparent',
              color: 'rgba(220, 100, 100, 0.85)',
              boxShadow: 'inset 0 0 0 1px rgba(220, 100, 100, 0.4)',
              clipPath: smallClip,
            }}
          >
            ✕ 删除此模块
          </button>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label
        className="mb-1.5 block text-xs font-serif tracking-[0.2em]"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.85)' }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const ADD_MODAL_SYSTEM_OPTIONS = [
  { key: 'main', label: '◆ 主剧情', emoji: '🌟' },
  ...CALIBRATION_GROUP_ORDER.map((key) => {
    const g = CALIBRATION_SYSTEM_GROUPS[key];
    return { key, label: `${g.emoji} ${g.label}`, emoji: g.emoji };
  }),
] as const;

const MAIN_PLOT_CATEGORIES: 提示词模块类目[] = ['cot', 'format', 'persona', 'devmode', 'jailbreak', 'style', 'custom'];
const CALIBRATION_CATEGORIES: 提示词模块类目[] = ['cot', 'format', 'custom'];

function AddCustomModuleModal({
  onConfirm,
  onCancel,
}: {
  onConfirm: (systemKey: string, category: 提示词模块类目, replaceMode: 'replace' | 'coexist') => void;
  onCancel: () => void;
}) {
  const [systemKey, setSystemKey] = useState<string>('main');
  const [category, setCategory] = useState<提示词模块类目>('cot');
  const [replaceMode, setReplaceMode] = useState<'replace' | 'coexist'>('replace');

  const categories = systemKey === 'main' ? MAIN_PLOT_CATEGORIES : CALIBRATION_CATEGORIES;

  const handleConfirm = () => {
    onConfirm(systemKey, category, replaceMode);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        className="flex w-[360px] max-w-[90vw] flex-col gap-4 p-5"
        style={{
          background: 'rgb(var(--tj-bg-primary))',
          boxShadow: '0 0 40px rgba(var(--tj-accent-primary), 0.12), inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)',
          clipPath: 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="text-sm font-serif tracking-[0.2em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}
        >
          + 新增自定义模块
        </div>

        <div className="space-y-4">
          <div>
            <div
              className="mb-2 text-xs font-serif tracking-[0.16em]"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}
            >
              1 · 目标系统
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ADD_MODAL_SYSTEM_OPTIONS.map((opt) => {
                const active = systemKey === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setSystemKey(opt.key);
                      setCategory('cot');
                    }}
                    className="px-2.5 py-1.5 text-xs font-serif tracking-wider transition-all"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.88), rgba(var(--tj-btn-primary-end), 0.78))'
                        : 'rgba(var(--tj-bg-secondary), 0.5)',
                      color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.82)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.45)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                      clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                      cursor: 'pointer',
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div
              className="mb-2 text-xs font-serif tracking-[0.16em]"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}
            >
              2 · 模块分类
            </div>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((cat) => {
                const active = category === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className="px-2.5 py-1.5 text-xs font-serif tracking-wider transition-all"
                    style={{
                      background: active
                        ? `rgba(var(${CATEGORY_COLOR_VAR[cat]}), 0.8)`
                        : 'rgba(var(--tj-bg-secondary), 0.5)',
                      color: active ? 'rgb(var(--tj-bg-primary))' : `rgba(var(${CATEGORY_COLOR_VAR[cat]}), 0.85)`,
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.35)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                      clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                      cursor: 'pointer',
                    }}
                  >
                    {PROMPT_MODULE_CATEGORY_LABELS[cat]}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div
              className="mb-2 text-xs font-serif tracking-[0.16em]"
              style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}
            >
              3 · 替换模式
            </div>
            <div className="flex gap-1.5">
              {([
                { key: 'replace' as const, label: '替换同分类内置', desc: '启用新模块，禁用同系统同分类内置' },
                { key: 'coexist' as const, label: '叠加并存', desc: '新模块和内置模块独立并存' },
              ]).map((opt) => {
                const active = replaceMode === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setReplaceMode(opt.key)}
                    className="flex-1 px-2.5 py-2 text-xs transition-all"
                    style={{
                      background: active
                        ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.88), rgba(var(--tj-btn-primary-end), 0.78))'
                        : 'rgba(var(--tj-bg-secondary), 0.5)',
                      color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.82)',
                      boxShadow: active
                        ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.45)'
                        : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                      clipPath: 'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                      cursor: 'pointer',
                    }}
                  >
                    <div className="font-serif tracking-wider">{opt.label}</div>
                    <div
                      className="mt-0.5 text-[10px]"
                      style={{ color: active ? 'rgba(var(--tj-bg-primary), 0.7)' : 'rgba(var(--tj-text-secondary), 0.55)' }}
                    >
                      {opt.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-1" style={{ borderTop: '1px solid rgba(var(--tj-accent-primary), 0.15)' }}>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-xs font-serif tracking-wider transition-all hover:opacity-80"
            style={{
              background: 'transparent',
              color: 'rgba(var(--tj-text-secondary), 0.82)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.25)',
              clipPath: smallClip,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="flex-1 px-3 py-2 text-xs font-serif tracking-wider transition-all hover:opacity-90"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.82))',
              color: 'rgb(var(--tj-on-accent))',
              clipPath: smallClip,
              cursor: 'pointer',
            }}
          >
            确认创建
          </button>
        </div>
      </div>
    </div>
  );
}

const SCOPE_OPTIONS: 提示词模块作用域[] = ['all', 'main', 'opening', 'battle', 'pathAwakening', 'calibration'];

function ScopeChips({
  value,
  readonly,
  onChange,
}: {
  value: 提示词模块作用域[];
  readonly: boolean;
  onChange: (next: 提示词模块作用域[]) => void;
}) {
  const toggle = (s: 提示词模块作用域) => {
    if (readonly) return;
    let next: 提示词模块作用域[];
    if (s === 'all') {
      next = value.includes('all') ? [] : ['all'];
    } else if (value.includes(s)) {
      next = value.filter((v) => v !== s);
    } else {
      next = [...value.filter((v) => v !== 'all'), s];
    }
    if (next.length === 0) next = ['all'];
    onChange(next);
  };
  return (
    <div className="flex flex-wrap gap-1.5">
      {SCOPE_OPTIONS.map((s) => {
        const active = value.includes(s);
        return (
          <button
            key={s}
            type="button"
            onClick={() => toggle(s)}
            disabled={readonly}
            className="px-2.5 py-1 text-xs font-serif tracking-wider transition-all"
            style={{
              background: active
                ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.85), rgba(var(--tj-btn-primary-end), 0.78))'
                : 'rgba(var(--tj-bg-secondary), 0.5)',
              color: active ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.82)',
              boxShadow: active
                ? 'inset 0 0 0 1px rgba(var(--tj-text-primary), 0.5)'
                : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
              clipPath:
                'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
              opacity: readonly ? 0.7 : 1,
              cursor: readonly ? 'not-allowed' : 'pointer',
            }}
          >
            {PROMPT_MODULE_SCOPE_LABELS[s]}
          </button>
        );
      })}
    </div>
  );
}
