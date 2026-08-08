import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import type { 角色数据结构 } from '@/models/character';
import { 创建空角色 } from '@/models/character';
import type { 世界状态 } from '@/models/world';
import { 创建空世界状态, 归一化世界状态 } from '@/models/world';
import type { 聊天消息 } from '@/models/chat';
import type { 记忆系统 } from '@/models/memory';
import { 创建空记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';
import { 创建空忆庭系统 } from '@/models/yiting';
import type { 智库系统 } from '@/models/zhiku';
import { 创建空智库系统, 归一化智库系统 } from '@/models/zhiku';
import type { 手机系统 } from '@/models/phone';
import { 创建空手机系统 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import { 创建空相册系统 } from '@/models/imageGeneration';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 创建空剧情编织系统, 归一化剧情编织系统 } from '@/models/storyWeaving';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { 队列任务记录 } from '@/models/queueTask';
import type { API设置, 存档数据, 游戏设置, 主题预设 } from '@/models/settings';
import {
  创建空API设置,
  创建默认游戏设置,
  归一化记忆系统设置,
  归一化星际和平周报设置,
  归一化智库系统设置,
  归一化剧情编织系统设置,
  归一化手机系统设置,
  归一化文生图系统设置,
  归一化额外功能设置,
  归一化视觉文本设置,
  迁移存档运行态键,
  LAST_VIEW_STORAGE_KEY,
} from '@/models/settings';
import type { 提示词模块 } from '@/models/prompts';
import type { STPresetEntryV1 } from '@/models/stTypes';
import { BUILTIN_PROMPT_MODULE_IDS, LEGACY_BUILTIN_COT_ID, getDefaultModuleFields } from '@/models/prompts';
import { isSTImportedModule } from '@/utils/stPresetParser';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import {
  ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY,
  buildPersistedZhikuSystem,
  isBundledZhikuDuplicate,
  loadAllBundledZhikuPresets,
  mergeBundledZhikuSystem,
  removeLegacyZhikuCharacterEntries,
  removeRetiredZhikuEntries,
} from '@/data/zhikuPreset';
import { buildPersistedStoryWeavingSystem, hydratePersistedStoryWeavingSystem, isSelfContainedStoryWeavingSystem, loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import type { 世界书 } from '@/models/worldbook';
import {
  clearWorkflowRecoveryJournal,
  isResumableWorkspace,
  loadWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { applyTheme, normalizeThemeId } from '@/styles/themes';
import { deleteSetting, loadNewestStory, loadSetting, saveSetting, saveSetting as saveUiSetting, hasAnySave } from '@/services/dbService';
import { WORLDBOOK_STORAGE_KEY, normalizeWorldbooks } from '@/utils/worldbook';
import { createBuiltinWorldbooks } from '@/data/worldbookPresets';
import { loadAllBundledWorldbookPresets } from '@/data/openingWorldbookPreset';
import { devLogError } from '@/utils/devLog';
import { bootRestoreFromNewest } from '@/hooks/useGame/saveLoadWorkflow';
import { TURN_STATUS_IDLE } from '@/hooks/useGame/turnStatus';
import { useActiveWorkflow, type ActiveWorkflowStore } from '@/hooks/useGame/activeWorkflow';

const REMOVED_LEGACY_WORLDBOOK_IDS = new Set([
  'builtin_express_crew',
  'builtin_locations',
  'opening_core',
]);

function isCalibrationWorldbook(book: 世界书): boolean {
  return book.entries.some((entry) => entry.scope.includes('calibration'));
}

export type ViewState = 'home' | 'new_game' | 'game';

export function migratePromptModules(savedGame: 游戏设置): 提示词模块[] {
  const builtins = createBuiltinPromptModules();
  const saved = Array.isArray(savedGame.promptModules) ? savedGame.promptModules : [];

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
      //
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
    // 没存档命中但有 legacy_cot：把它的 enabled 借给两个新 CoT
    if (legacyCot && (b.id === 'builtin_opening_cot' || b.id === 'builtin_main_plot_cot')) {
      return { ...b, enabled: legacyCot.enabled };
    }
    return b;
  });

  const builtinIdSet = new Set<string>(BUILTIN_PROMPT_MODULE_IDS);
  // 过滤掉 legacy 'builtin_cot'：已被新 opening/main_plot 覆盖
  // 同 id 去重：历史 bug 曾把内置 id 漏出白名单导致多份副本叠加，这里兜底清理
  const seenIds = new Set<string>();
  const customs = saved.filter((m) => {
    if (builtinIdSet.has(m.id)) return false;
    if (m.id === LEGACY_BUILTIN_COT_ID) return false;
    if (seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    return true;
  });

  // 旧存档的自定义模块可能缺少 ST 预设兼容字段，用默认值兜底
  // 方案 A 三层 order 区间迁移：ST 导入模块旧 order 是 50+，新区间是 100-999，需要 +50 偏移
  const customsWithDefaults = customs.map((m) => {
    const withDefaults = {
      ...getDefaultModuleFields(),
      source: 'user' as const,
      replaceable: 'replaceable' as const,
      ...m,
    };
    // ST 导入模块：旧 order < 100 时 +50 偏移，落入 Tier 2 区间（100-999）
    if (isSTImportedModule(withDefaults) && withDefaults.order < 100) {
      return { ...withDefaults, order: withDefaults.order + 50 };
    }
    return withDefaults;
  });

  const hasLegacy = customsWithDefaults.some((m) => m.id === 'legacy_custom');
  const legacyCustomPrompt = (savedGame as { customPrompt?: string }).customPrompt;
  if (!hasLegacy && legacyCustomPrompt?.trim()) {
    const now = Date.now();
    customsWithDefaults.push({
      ...getDefaultModuleFields(),
      source: 'user',
      replaceable: 'replaceable',
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

/** 方案 A 三层 order 区间迁移：把预设库里的 ST 模块 order 从 50+ 迁移到 100+。
 *  - 旧版 ST 模块 order = 50 + array_index（与内置 CoT/worldbook 冲突）
 *  - 新版 ST 模块 order = 100 + array_index（Tier 2 区间 100-999）
 *  - order < 100 的 ST 模块 +50 偏移；order >= 100 的不动（已是新版或玩家手动调整过）
 *  - 没有预设库或预设库为空时返回原值（保持字段缺省）
 *
 *  放在 useGameState.ts 与 migratePromptModules 并列，供初次 mount 加载路径和
 *  saveLoadWorkflow 手动加载路径共用，避免两条加载路径迁移逻辑不一致。 */
export function migrateStPresetOrders(stPresets: STPresetEntryV1[] | undefined): STPresetEntryV1[] | undefined {
  if (!Array.isArray(stPresets) || stPresets.length === 0) return stPresets;
  return stPresets.map((preset) => {
    const needsMigration = preset.modules.some(
      (m) => isSTImportedModule(m) && m.order < 100,
    );
    if (!needsMigration) return preset;
    return {
      ...preset,
      modules: preset.modules.map((m) =>
        isSTImportedModule(m) && m.order < 100
          ? { ...m, order: m.order + 50 }
          : m,
      ),
      updatedAt: Date.now(),
    };
  });
}

export interface UseGameStateReturn {
  view: ViewState;
  setView: React.Dispatch<React.SetStateAction<ViewState>>;
  旅人: 角色数据结构;
  set旅人: React.Dispatch<React.SetStateAction<角色数据结构>>;
  世界: 世界状态;
  set世界: React.Dispatch<React.SetStateAction<世界状态>>;
  chatHistory: 聊天消息[];
  setChatHistory: React.Dispatch<React.SetStateAction<聊天消息[]>>;
  记忆: 记忆系统;
  set记忆: React.Dispatch<React.SetStateAction<记忆系统>>;
  忆庭: 忆庭系统;
  set忆庭: React.Dispatch<React.SetStateAction<忆庭系统>>;
  智库: 智库系统;
  set智库: React.Dispatch<React.SetStateAction<智库系统>>;
  手机: 手机系统;
  set手机: React.Dispatch<React.SetStateAction<手机系统>>;
  NPC: NPC记录[];
  setNPC: React.Dispatch<React.SetStateAction<NPC记录[]>>;
  相册: 相册系统;
  set相册: React.Dispatch<React.SetStateAction<相册系统>>;
  新闻: 新闻条目[];
  set新闻: React.Dispatch<React.SetStateAction<新闻条目[]>>;
  剧情: 剧情节点[];
  set剧情: React.Dispatch<React.SetStateAction<剧情节点[]>>;
  剧情编织: 剧情编织系统;
  set剧情编织: React.Dispatch<React.SetStateAction<剧情编织系统>>;
  variableBatches: 变量命令批次[];
  setVariableBatches: React.Dispatch<React.SetStateAction<变量命令批次[]>>;
  queueTasks: 队列任务记录[];
  setQueueTasks: React.Dispatch<React.SetStateAction<队列任务记录[]>>;
  apiSettings: API设置;
  setApiSettings: React.Dispatch<React.SetStateAction<API设置>>;
  gameSettings: 游戏设置;
  setGameSettings: React.Dispatch<React.SetStateAction<游戏设置>>;
  currentTheme: 主题预设;
  setCurrentTheme: React.Dispatch<React.SetStateAction<主题预设>>;
  worldbooks: 世界书[];
  setWorldbooks: React.Dispatch<React.SetStateAction<世界书[]>>;
  hasSave: boolean;
  setHasSave: React.Dispatch<React.SetStateAction<boolean>>;
  turnCount: number;
  setTurnCount: React.Dispatch<React.SetStateAction<number>>;
  pendingOpeningTrigger: string | null;
  setPendingOpeningTrigger: React.Dispatch<React.SetStateAction<string | null>>;
  /** 片 5e（路线图 #2）：C 类工作流瞬时态的唯一管理对象（loading/turnStatus/召回摘要/待结算/中断/会话身份/中止与重roll 引用）。 */
  activeWorkflow: ActiveWorkflowStore;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}

export function useGameState(): UseGameStateReturn {
  const [view, setView] = useState<ViewState>('home');
  const [旅人, set旅人] = useState<角色数据结构>(创建空角色);
  const [世界, set世界] = useState<世界状态>(() => 归一化世界状态(创建空世界状态()));
  const [chatHistory, setChatHistory] = useState<聊天消息[]>([]);
  const [记忆, set记忆] = useState<记忆系统>(创建空记忆系统);
  const [忆庭, set忆庭] = useState<忆庭系统>(创建空忆庭系统);
  const [智库, set智库] = useState<智库系统>(创建空智库系统);
  const [手机, set手机] = useState<手机系统>(创建空手机系统);
  const [NPC, setNPC] = useState<NPC记录[]>([]);
  const [相册, set相册] = useState<相册系统>(创建空相册系统);
  const [新闻, set新闻] = useState<新闻条目[]>([]);
  const [剧情, set剧情] = useState<剧情节点[]>([]);
  const [剧情编织, set剧情编织] = useState<剧情编织系统>(创建空剧情编织系统);
  const [variableBatches, setVariableBatches] = useState<变量命令批次[]>([]);
  const [queueTasks, setQueueTasks] = useState<队列任务记录[]>([]);
  const [apiSettings, setApiSettings] = useState<API设置>(创建空API设置);
  const [gameSettings, setGameSettings] = useState<游戏设置>(创建默认游戏设置);
  const [currentTheme, setCurrentTheme] = useState<主题预设>('deepspace');
  const [worldbooks, setWorldbooks] = useState<世界书[]>([]);
  const [hasSave, setHasSave] = useState(false);
  const [turnCount, setTurnCount] = useState(1);
  const [pendingOpeningTrigger, setPendingOpeningTrigger] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bootReadyRef = useRef(false);
  const stateRef = useRef<UseGameStateReturn | null>(null);

  // 片 5e（路线图 #2）：C 类工作流瞬时态收拢到 activeWorkflow 单一管理对象。
  const activeWorkflow = useActiveWorkflow();
  // 解构出稳定 setter 供 mount 一次性 boot effect 使用（set 前缀即被 react-hooks 视为稳定引用）。
  const { setInterruptedWorkflow, setTurnStatus } = activeWorkflow;

  const state: UseGameStateReturn = {
    view, setView,
    旅人, set旅人,
    世界, set世界,
    chatHistory, setChatHistory,
    记忆, set记忆,
    忆庭, set忆庭,
    智库, set智库,
    手机, set手机,
    NPC, setNPC,
    相册, set相册,
    新闻, set新闻,
    剧情, set剧情,
    剧情编织, set剧情编织,
    variableBatches, setVariableBatches,
    queueTasks, setQueueTasks,
    apiSettings, setApiSettings,
    gameSettings, setGameSettings,
    currentTheme, setCurrentTheme,
    worldbooks, setWorldbooks,
    hasSave, setHasSave,
    turnCount, setTurnCount,
    pendingOpeningTrigger, setPendingOpeningTrigger,
    activeWorkflow,
    scrollRef,
  };

  useLayoutEffect(() => {
    stateRef.current = state;
  });

  // Load persisted settings on mount
  useEffect(() => {
    void (async () => {
      const recoveryJournal = await loadWorkflowRecoveryJournal();
      if (recoveryJournal) {
        setInterruptedWorkflow(recoveryJournal);
        // 中断回合的通知只走一条通道：main_request 用状态条（输入恢复提示），
        // 结算/存档中断由 App 的中断横幅承载，避免状态条与横幅重复展示。
        if (recoveryJournal.phase === 'main_request') {
          setTurnStatus({ kind: 'stopped', text: '上次生成被浏览器中断，输入将在进入游戏后恢复；请检查存档后重新发送。' });
        }
      }
      const lastView = await loadSetting<string>(LAST_VIEW_STORAGE_KEY);

      const savedTheme = await loadSetting<主题预设>('theme');
      if (savedTheme) setCurrentTheme(normalizeThemeId(savedTheme) as 主题预设);

      const savedApi = await loadSetting<API设置>('apiSettings');
      if (savedApi) setApiSettings(savedApi);

      const savedGame = await loadSetting<游戏设置>('gameSettings');
      if (savedGame) {
        // 兼容旧存档：variableApi 是新字段，缺失时用默认覆盖
        const defaults = 创建默认游戏设置();
        // 片 5a-2 D3：剥离生效前的旧 settings 数据可能残留两运行态键，同样迁移并入内存（不回写）。
        const 迁移运行态 = 迁移存档运行态键({ gameSettings: savedGame } as 存档数据);
        const partialSavedGame = savedGame as Partial<游戏设置>;
        const merged: 游戏设置 = {
          ...defaults,
          ...savedGame,
          macroGlobalVars: 迁移运行态.macroGlobalVars,
          worldbookTriggerStates: 迁移运行态.worldbookTriggerStates,
          新闻系统: 归一化星际和平周报设置(savedGame.新闻系统),
          手机系统: 归一化手机系统设置(savedGame.手机系统),
          智库系统: 归一化智库系统设置(savedGame.智库系统),
          剧情编织系统: 归一化剧情编织系统设置(savedGame.剧情编织系统),
          文生图系统: 归一化文生图系统设置(savedGame.文生图系统),
          记忆系统: 归一化记忆系统设置(savedGame.记忆系统),
          额外功能: 归一化额外功能设置(savedGame.额外功能),
          variableApi: partialSavedGame.variableApi ?? defaults.variableApi,
          enableClaudeMode: partialSavedGame.enableClaudeMode ?? defaults.enableClaudeMode,
          deepSeekMainMode: partialSavedGame.deepSeekMainMode ?? defaults.deepSeekMainMode,
          backgroundTaskMode: partialSavedGame.backgroundTaskMode ?? defaults.backgroundTaskMode,
          enableCacheDiagnostics: partialSavedGame.enableCacheDiagnostics ?? defaults.enableCacheDiagnostics,
          enableMaleNsfwArchive: partialSavedGame.enableMaleNsfwArchive ?? defaults.enableMaleNsfwArchive,
          enablePlayerSpeechExpansion: savedGame.enableNoControl ? false : savedGame.enablePlayerSpeechExpansion,
          visualTextSettings: 归一化视觉文本设置(savedGame.visualTextSettings),
          promptModules: migratePromptModules(savedGame),
          // 方案 A 三层 order 区间迁移：预设库里的 ST 模块也要 +50 偏移
          // 与 saveLoadWorkflow.ts 手动加载路径保持一致，避免两条加载路径迁移逻辑不一致
          stPresets: migrateStPresetOrders(savedGame.stPresets),
          promptModuleOrderVersion: 1,
        };
        // 迁移后清空 legacy customPrompt，避免下次启动重复追加
        const legacyCustomPrompt = (savedGame as { customPrompt?: string }).customPrompt;
        if (legacyCustomPrompt && merged.promptModules.some((m) => m.id === 'legacy_custom')) {
          (merged as { customPrompt?: string }).customPrompt = '';
        }
        setGameSettings(merged);
      }

      try {
        const bundledStoryWeaving = await loadAllBundledStoryWeavingPresets();
        const savedStoryWeaving = await loadSetting<剧情编织系统>('storyWeavingSystem');
        const mergedStoryWeaving = hydratePersistedStoryWeavingSystem(savedStoryWeaving, bundledStoryWeaving);
        set剧情编织(mergedStoryWeaving);
        await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(mergedStoryWeaving));
      } catch (err) {
        console.warn('[story-weaving] preset 加载失败，回退到本地已存剧情编织:', err);
        const savedStoryWeaving = await loadSetting<剧情编织系统>('storyWeavingSystem');
        if (isSelfContainedStoryWeavingSystem(savedStoryWeaving)) {
          set剧情编织(归一化剧情编织系统(savedStoryWeaving));
        } else if (savedStoryWeaving) {
          console.warn('[story-weaving] 本地状态是轻量缓存，缺少原著正文；等待下次启动重新加载内置资源。');
        }
      }

      try {
        const preset = await loadAllBundledZhikuPresets();
        const savedZhiku = await loadSetting<智库系统>('zhikuSystem');
        const savedMigrationAt = await loadSetting<number>(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY);
        const migrationAt = savedMigrationAt ?? Date.now();
        if (!savedMigrationAt) {
          await saveSetting(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY, migrationAt);
        }
        const mergedZhiku = mergeBundledZhikuSystem(preset, savedZhiku, migrationAt);
        set智库(mergedZhiku);
        await saveSetting('zhikuSystem', buildPersistedZhikuSystem(mergedZhiku));
      } catch (err) {
        console.warn('[zhiku] preset 加载失败，回退到本地已存智库:', err);
        const savedZhiku = await loadSetting<智库系统>('zhikuSystem');
        if (savedZhiku) {
          const savedMigrationAt = await loadSetting<number>(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY);
          const migrationAt = savedMigrationAt ?? Date.now();
          if (!savedMigrationAt) {
            await saveSetting(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY, migrationAt);
          }
          set智库(归一化智库系统({
            条目: removeLegacyZhikuCharacterEntries(
              removeRetiredZhikuEntries(savedZhiku.条目.filter((entry) => !isBundledZhikuDuplicate(entry))),
              migrationAt,
            ),
          }));
        }
      }

      // Worldbooks 加载策略:
      // - savedWorldbooks === null   → 首次启动,把预设写入 IndexedDB(玩家之后可自由修改/删除)
      // - savedWorldbooks 是数组     → 玩家已与世界书交互过,完全尊重其状态,不再覆盖
      const builtins = createBuiltinWorldbooks();
      const rawSavedWorldbooks = await loadSetting<世界书[]>(WORLDBOOK_STORAGE_KEY);
      // 旧版本只有 'builtin_core_config' 一本内置；现在已拆为 6 本，老用户库里这本要丢弃。
      // 同样：CoT 已从世界书迁移到提示词模块系统，旧的 'builtin_cot' 本也要丢弃。
      // 它里面的 'builtin_first_turn_rule' 条目已经被新的 'builtin_opening_rule' 本继承。
      // normalize 把 turnGuard='first_only' 迁移成 scope=['opening']。
      const savedWorldbooks = rawSavedWorldbooks
        ? normalizeWorldbooks(
            rawSavedWorldbooks.filter(
              (b) =>
                b.id !== 'builtin_core_config' &&
                b.id !== 'builtin_cot' &&
                !REMOVED_LEGACY_WORLDBOOK_IDS.has(b.id),
            ),
          )
        : rawSavedWorldbooks;

      if (savedWorldbooks === null) {
        try {
          const presets = await loadAllBundledWorldbookPresets();
          const initial = [...builtins, ...presets];
          setWorldbooks(initial);
          await saveSetting(WORLDBOOK_STORAGE_KEY, initial);
        } catch (err) {
          console.warn('[opening-worldbook] preset 加载失败,使用内置空集:', err);
          setWorldbooks(builtins);
        }
      } else if (savedWorldbooks.length) {
        const builtinIds = new Set(builtins.map((b) => b.id));
        const userBooks = savedWorldbooks.filter((b) => !builtinIds.has(b.id));
        const merged = builtins.map((builtin) => {
          const saved = savedWorldbooks.find((b) => b.id === builtin.id);
          if (!saved) return builtin;
          // calibration 内置世界书只是独立模型真实 prompt 的只读资料展示。
          // 新闻/手机/变量等服务层直接 import 源码常量，旧存档里的编辑/关闭不会影响真实 API；
          // 因此这里必须回到源码最新版，避免 UI 展示与真实请求再次分叉。
          if (isCalibrationWorldbook(builtin)) return builtin;
          const savedEntries = saved.entries;
          const entries = builtin.entries.map((entry) => {
            const savedEntry = savedEntries.find((item) => item.id === entry.id);
            return savedEntry ? { ...savedEntry, title: entry.title } : entry;
          });
          return { ...builtin, enabled: saved.enabled, entries, updatedAt: saved.updatedAt };
        });
        const nextWorldbooks = [...merged, ...userBooks];
        setWorldbooks(nextWorldbooks);
        await saveSetting(WORLDBOOK_STORAGE_KEY, nextWorldbooks);
      } else {
        setWorldbooks(builtins);
        await saveSetting(WORLDBOOK_STORAGE_KEY, builtins);
      }

      const saveExists = await hasAnySave();
      setHasSave(saveExists);

      let shouldClearLastView = false;
      if (lastView === 'game') {
        let restored = false;
        try {
          const currentState = stateRef.current;
          if (currentState) {
            restored = await bootRestoreFromNewest(currentState);
          }
        } catch (error) {
          devLogError('recover', 'useGameState.boot-restore-import-failed', error);
        }
        if (!restored) {
          shouldClearLastView = true;
        }
      }

      if (recoveryJournal
        && (recoveryJournal.phase === 'variable_settlement' || recoveryJournal.phase === 'autosave')) {
        const newest = await loadNewestStory();
        if (!isResumableWorkspace(recoveryJournal, newest)) {
          await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);
          setInterruptedWorkflow(null);
          setTurnStatus(TURN_STATUS_IDLE);
        }
      }

      bootReadyRef.current = true;
      const currentView = stateRef.current?.view;
      if (shouldClearLastView) {
        try {
          await deleteSetting(LAST_VIEW_STORAGE_KEY);
        } catch (error) {
          devLogError('recover', 'useGameState.last-view-clear-failed', error);
        }
      } else if (currentView === 'game') {
        void saveUiSetting(LAST_VIEW_STORAGE_KEY, 'game').catch((error: unknown) => {
          devLogError('recover', 'useGameState.last-view-save-failed', error);
        });
      }
    })();
    // setter 恒稳定（React useState 身份保证），deps 不变即 mount 一次性执行
  }, [setInterruptedWorkflow, setTurnStatus]);

  // Persist the last active UI view after boot has finished reading it.
  useEffect(() => {
    if (!bootReadyRef.current) return;
    const persist = view === 'game'
      ? saveUiSetting(LAST_VIEW_STORAGE_KEY, 'game')
      : deleteSetting(LAST_VIEW_STORAGE_KEY);
    void persist.catch((error: unknown) => {
      devLogError('recover', 'last-view-persist-failed', error, { view });
    });
  }, [view]);

  // Apply theme on change
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  return state;
}
