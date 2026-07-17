import { useState, useRef, useEffect } from 'react';
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
import { 创建空智库系统 } from '@/models/zhiku';
import type { 手机系统 } from '@/models/phone';
import { 创建空手机系统 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import { 创建空相册系统 } from '@/models/imageGeneration';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 创建空剧情编织系统 } from '@/models/storyWeaving';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { 队列任务记录 } from '@/models/queueTask';
import type { API设置, 游戏设置, 主题预设 } from '@/models/settings';
import {
  创建空API设置,
  创建默认游戏设置,
  创建默认记忆系统设置,
  创建默认剧情编织系统设置,
  创建默认手机系统设置,
  创建默认文生图系统设置,
  归一化记忆系统设置,
  归一化星际和平周报设置,
  归一化智库系统设置,
  归一化剧情编织系统设置,
  归一化手机系统设置,
  归一化文生图系统设置,
  归一化额外功能设置,
  归一化星轨航图系统设置,
  归一化视觉文本设置,
} from '@/models/settings';
import type { 提示词模块 } from '@/models/prompts';
import { BUILTIN_PROMPT_MODULE_IDS, LEGACY_BUILTIN_COT_ID, getDefaultModuleFields } from '@/models/prompts';
import { isSTImportedModule } from '@/utils/stPresetParser';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import {
  ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY,
  buildPersistedZhikuSystem,
  hydrateRuntimeZhiku,
} from '@/data/zhikuPreset';
import { buildPersistedStoryWeavingSystem, hydratePersistedStoryWeavingSystem, loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import type { 世界书 } from '@/models/worldbook';
import type { WorkflowRecoveryJournal } from '@/services/workflowRecovery';
import { applyTheme, normalizeThemeId } from '@/styles/themes';
import { getPreference, setPreference } from '@/src/adaptations/preferences';
import { getAdaptationServices } from '@/src/adaptations';
import { APP_SESSION_ID, getAppKernel } from '@/src/kernel/appKernel';
import { WORLDBOOK_STORAGE_KEY, normalizeWorldbooks } from '@/utils/worldbook';
import { createBuiltinWorldbooks } from '@/data/worldbookPresets';
import { loadAllBundledWorldbookPresets } from '@/data/openingWorldbookPreset';

const REMOVED_LEGACY_WORLDBOOK_IDS = new Set([
  'builtin_express_crew',
  'builtin_locations',
  'opening_core',
]);

function isCalibrationWorldbook(book: 世界书): boolean {
  return book.entries.some((entry) => entry.scope?.includes('calibration'));
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
      const isCalibrationBuiltin = b.scope?.includes('calibration');
      return {
        ...b,
        enabled: isCalibrationBuiltin ? true : hit.enabled,
        createdAt: hit.createdAt ?? b.createdAt,
        updatedAt: hit.updatedAt ?? b.updatedAt,
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
  if (!hasLegacy && savedGame.customPrompt && savedGame.customPrompt.trim()) {
    const now = Date.now();
    customsWithDefaults.push({
      ...getDefaultModuleFields(),
      source: 'user',
      replaceable: 'replaceable',
      id: 'legacy_custom',
      title: '旧版自定义提示词',
      description: '自旧版「额外指示」迁移而来。可自由编辑或删除。',
      category: 'custom',
      content: savedGame.customPrompt,
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
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  workflowHint: string;
  setWorkflowHint: React.Dispatch<React.SetStateAction<string>>;
  workflowStatus: 'searching' | 'done' | '';
  setWorkflowStatus: React.Dispatch<React.SetStateAction<'searching' | 'done' | ''>>;
  liveRecallSummary: string;
  setLiveRecallSummary: React.Dispatch<React.SetStateAction<string>>;
  liveRecallFullContent: string;
  setLiveRecallFullContent: React.Dispatch<React.SetStateAction<string>>;
  /** 变量模型校准正在跑（正文已落地，变量在结算中）。期间禁止发下一轮。 */
  pendingVariable: boolean;
  setPendingVariable: React.Dispatch<React.SetStateAction<boolean>>;
  turnCount: number;
  setTurnCount: React.Dispatch<React.SetStateAction<number>>;
  pendingOpeningTrigger: string | null;
  setPendingOpeningTrigger: React.Dispatch<React.SetStateAction<string | null>>;
  interruptedWorkflow: WorkflowRecoveryJournal | null;
  setInterruptedWorkflow: React.Dispatch<React.SetStateAction<WorkflowRecoveryJournal | null>>;
  abortControllerRef: React.RefObject<AbortController | null>;
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
  const [loading, setLoading] = useState(false);
  const [workflowHint, setWorkflowHint] = useState('');
  const [workflowStatus, setWorkflowStatus] = useState<'searching' | 'done' | ''>('');
  const [liveRecallSummary, setLiveRecallSummary] = useState('');
  const [liveRecallFullContent, setLiveRecallFullContent] = useState('');
  const [pendingVariable, setPendingVariable] = useState(false);
  const [turnCount, setTurnCount] = useState(1);
  const [pendingOpeningTrigger, setPendingOpeningTrigger] = useState<string | null>(null);
  const [interruptedWorkflow, setInterruptedWorkflow] = useState<WorkflowRecoveryJournal | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
    const recoveryJournal = await (await getAdaptationServices()).workflowRecovery.loadWorkflowRecoveryJournal();
      if (recoveryJournal) {
        setInterruptedWorkflow(recoveryJournal);
        setWorkflowHint('上次生成被浏览器中断，输入将在进入游戏后恢复；请检查存档后重新发送。');
      }

      const savedTheme = await getPreference<主题预设>('theme');
      if (savedTheme) setCurrentTheme(normalizeThemeId(savedTheme) as 主题预设);

      const savedApi = await getPreference<API设置>('apiSettings');
      if (savedApi) setApiSettings(savedApi);

      const savedGame = await getPreference<游戏设置>('gameSettings');
      if (savedGame) {
        // 兼容旧存档：variableApi 是新字段，缺失时用默认覆盖
        const defaults = 创建默认游戏设置();
        const merged: 游戏设置 = {
          ...defaults,
          ...savedGame,
          新闻系统: 归一化星际和平周报设置(savedGame.新闻系统),
          手机系统: 归一化手机系统设置(savedGame.手机系统),
          智库系统: 归一化智库系统设置(savedGame.智库系统),
          剧情编织系统: 归一化剧情编织系统设置(savedGame.剧情编织系统),
          文生图系统: 归一化文生图系统设置(savedGame.文生图系统),
          记忆系统: 归一化记忆系统设置(savedGame.记忆系统),
          额外功能: 归一化额外功能设置(savedGame.额外功能),
          星轨航图系统: 归一化星轨航图系统设置(savedGame.星轨航图系统),
          variableApi: savedGame.variableApi ?? defaults.variableApi,
          enableClaudeMode: savedGame.enableClaudeMode ?? defaults.enableClaudeMode,
          deepSeekMainMode: savedGame.deepSeekMainMode ?? defaults.deepSeekMainMode,
          backgroundTaskMode: savedGame.backgroundTaskMode ?? defaults.backgroundTaskMode,
          enableCacheDiagnostics: savedGame.enableCacheDiagnostics ?? defaults.enableCacheDiagnostics,
          enableMaleNsfwArchive: savedGame.enableMaleNsfwArchive ?? defaults.enableMaleNsfwArchive,
          enablePlayerSpeechExpansion: savedGame.enableNoControl === true ? false : savedGame.enablePlayerSpeechExpansion === true,
          visualTextSettings: 归一化视觉文本设置(savedGame.visualTextSettings),
          promptModules: migratePromptModules(savedGame),
          promptModuleOrderVersion: 1,
        };
        // 迁移后清空 legacy customPrompt，避免下次启动重复追加
        if (savedGame.customPrompt && merged.promptModules.some((m) => m.id === 'legacy_custom')) {
          merged.customPrompt = '';
        }
        setGameSettings(merged);
      }

      const bundledStoryWeaving = await loadAllBundledStoryWeavingPresets();
      const savedStoryWeaving = await getPreference<剧情编织系统>('storyWeavingSystem');
      const mergedStoryWeaving = hydratePersistedStoryWeavingSystem(savedStoryWeaving, bundledStoryWeaving);
      set剧情编织(mergedStoryWeaving);
      await setPreference('storyWeavingSystem', buildPersistedStoryWeavingSystem(mergedStoryWeaving));

      const savedZhiku = await getPreference<智库系统>('zhikuSystem');
      const savedMigrationAt = await getPreference<number>(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY);
      const migrationAt = savedMigrationAt ?? Date.now();
      if (!savedMigrationAt) {
        await setPreference(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY, migrationAt);
      }
      // Preference mount uses the same session-boundary hydrate as load/new-game.
      const mergedZhiku = await hydrateRuntimeZhiku(savedZhiku, { migrationAt });
      set智库(mergedZhiku);
      await setPreference('zhikuSystem', buildPersistedZhikuSystem(mergedZhiku));

      // Worldbooks 加载策略:
      // - savedWorldbooks === null   → 首次启动,把预设写入 IndexedDB(玩家之后可自由修改/删除)
      // - savedWorldbooks 是数组     → 玩家已与世界书交互过,完全尊重其状态,不再覆盖
      const builtins = createBuiltinWorldbooks();
      const rawSavedWorldbooks = await getPreference<世界书[]>(WORLDBOOK_STORAGE_KEY);
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
        const presets = await loadAllBundledWorldbookPresets();
        const initial = [...builtins, ...presets];
        setWorldbooks(initial);
        await setPreference(WORLDBOOK_STORAGE_KEY, initial);
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
          const savedEntries = saved.entries || [];
          const entries = builtin.entries.map((entry) => {
            const savedEntry = savedEntries.find((item) => item.id === entry.id);
            return savedEntry ? { ...savedEntry, title: entry.title } : entry;
          });
          return { ...builtin, enabled: saved.enabled, entries, updatedAt: saved.updatedAt };
        });
        const nextWorldbooks = [...merged, ...userBooks];
        setWorldbooks(nextWorldbooks);
        await setPreference(WORLDBOOK_STORAGE_KEY, nextWorldbooks);
      } else {
        setWorldbooks(builtins);
        await setPreference(WORLDBOOK_STORAGE_KEY, builtins);
      }

      const session = await (await getAppKernel()).read({
        type: 'session.exists',
        sessionId: APP_SESSION_ID,
      });
      setHasSave(session.exists);
    })().catch(async (error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      setWorkflowHint(`启动初始化失败：${detail}`);
      try {
        const session = await (await getAppKernel()).read({
          type: 'session.exists',
          sessionId: APP_SESSION_ID,
        });
        setHasSave(session.exists);
      } catch (sessionError: unknown) {
        const sessionDetail = sessionError instanceof Error ? sessionError.message : String(sessionError);
        setWorkflowHint(`启动初始化失败：${detail}；会话检查失败：${sessionDetail}`);
      }
    });
  }, []);

  // Apply theme on change
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    setGameSettings((prev) =>
      prev.记忆系统
        ? {
            ...prev,
            新闻系统: 归一化星际和平周报设置(prev.新闻系统),
            手机系统: 归一化手机系统设置(prev.手机系统),
            智库系统: 归一化智库系统设置(prev.智库系统),
            剧情编织系统: 归一化剧情编织系统设置(prev.剧情编织系统),
            文生图系统: 归一化文生图系统设置(prev.文生图系统),
            记忆系统: 归一化记忆系统设置(prev.记忆系统),
            星轨航图系统: 归一化星轨航图系统设置(prev.星轨航图系统),
            enableClaudeMode: prev.enableClaudeMode ?? 创建默认游戏设置().enableClaudeMode,
            deepSeekMainMode: prev.deepSeekMainMode ?? 创建默认游戏设置().deepSeekMainMode,
            backgroundTaskMode: prev.backgroundTaskMode ?? 创建默认游戏设置().backgroundTaskMode,
            visualTextSettings: 归一化视觉文本设置(prev.visualTextSettings),
          }
        : {
            ...prev,
            新闻系统: 创建默认游戏设置().新闻系统,
            手机系统: 创建默认手机系统设置(),
            剧情编织系统: 创建默认剧情编织系统设置(),
            文生图系统: 创建默认文生图系统设置(),
            记忆系统: 创建默认记忆系统设置(),
            星轨航图系统: 创建默认游戏设置().星轨航图系统,
            enableClaudeMode: 创建默认游戏设置().enableClaudeMode,
            deepSeekMainMode: 创建默认游戏设置().deepSeekMainMode,
            backgroundTaskMode: 创建默认游戏设置().backgroundTaskMode,
            visualTextSettings: 归一化视觉文本设置(prev.visualTextSettings),
          },
    );
  }, []);

  return {
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
    loading, setLoading,
    workflowHint, setWorkflowHint,
    workflowStatus, setWorkflowStatus,
    liveRecallSummary, setLiveRecallSummary,
    liveRecallFullContent, setLiveRecallFullContent,
    pendingVariable, setPendingVariable,
    turnCount, setTurnCount,
    pendingOpeningTrigger, setPendingOpeningTrigger,
    interruptedWorkflow, setInterruptedWorkflow,
    abortControllerRef, scrollRef,
  };
}
