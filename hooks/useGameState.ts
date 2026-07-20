import { useState, useRef, useEffect, useSyncExternalStore } from 'react';
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
import type { DurableJob } from '@/src/kernel/domain/jobs/durableJob';
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
import { BUILTIN_PROMPT_MODULE_IDS, getDefaultModuleFields } from '@/models/prompts';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import type { 世界书 } from '@/models/worldbook';
import type { WorkflowRecoveryJournal } from '@/services/workflowRecovery';
import { applyTheme, normalizeThemeId } from '@/styles/themes';
import { getPreference } from '@/src/adaptations/preferences';
import { APP_SESSION_ID, getAppRoot } from '@/src/adaptations/kernel';
import { normalizeWorldbooks } from '@/utils/worldbook';
import { createBuiltinWorldbooks } from '@/data/worldbookPresets';
import { loadAllBundledWorldbookPresets } from '@/data/openingWorldbookPreset';
import { displaySessionView, SessionProjectionStore } from '@/src/adaptations/projections';
import type { SessionView } from '@/src/kernel/contract';
import { composeSettings, createDefaultSettingsPlanes, type AppearancePreferences, type ContentLibrary, type ExecutionPolicy, type SavePolicy } from '@/models/settingsPlanes';
import { APPEARANCE_PREFERENCES_KEY, CONTENT_LIBRARY_KEY, EXECUTION_POLICY_KEY, SAVE_POLICY_KEY } from '@/src/kernel/adapters/browser/PreferenceExecutionContextProvider';

type StoryProjection = {
  旅人: 角色数据结构;
  世界: 世界状态;
  chatHistory: 聊天消息[];
  记忆: 记忆系统;
  忆庭: 忆庭系统;
  智库: 智库系统;
  手机: 手机系统;
  NPC: NPC记录[];
  相册: 相册系统;
  新闻: 新闻条目[];
  剧情: 剧情节点[];
  剧情编织: 剧情编织系统;
  variableBatches: 变量命令批次[];
  jobs: DurableJob[];
  turnJournal: SessionView['story']['conversation']['turnJournal'];
  worldbookTriggerStates: SessionView['story']['content']['worldbookTriggerStates'];
  pendingOpeningTrigger: string | null;
  turnCount: number;
};

function projectStoryForUi(story: SessionView['story']): StoryProjection {
  return {
    旅人: story.traveler,
    世界: story.world,
    chatHistory: story.conversation.history.slice(),
    记忆: story.memory.system,
    忆庭: story.memory.yiting,
    智库: story.content.zhikuRuntime,
    手机: story.phone,
    NPC: story.characters.npcs.slice(),
    相册: story.album,
    新闻: story.news.slice(),
    剧情: story.plot.nodes.slice(),
    剧情编织: story.plot.weaving,
    variableBatches: story.systems.variableBatches.slice(),
    jobs: story.jobs.records.slice(),
    turnJournal: story.conversation.turnJournal,
    worldbookTriggerStates: story.content.worldbookTriggerStates,
    pendingOpeningTrigger: story.turn.pendingOpeningTrigger,
    turnCount: story.conversation.turnCount,
  };
}

function isCalibrationWorldbook(book: 世界书): boolean {
  return book.entries.some((entry) => entry.scope?.includes('calibration'));
}

export type ViewState = 'home' | 'new_game' | 'game';

export function resolvePromptModules(savedModules: readonly 提示词模块[]): 提示词模块[] {
  const builtins = createBuiltinPromptModules();
  const saved = [...savedModules];

  const mergedBuiltins = builtins.map((b) => {
    const hit = saved.find((m) => m.id === b.id);
    if (hit) {
      const isCalibrationBuiltin = b.scope?.includes('calibration');
      return {
        ...b,
        enabled: isCalibrationBuiltin ? true : hit.enabled,
        createdAt: hit.createdAt ?? b.createdAt,
        updatedAt: hit.updatedAt ?? b.updatedAt,
      };
    }
    return b;
  });

  const builtinIdSet = new Set<string>(BUILTIN_PROMPT_MODULE_IDS);
  const seenIds = new Set<string>();
  const customs = saved.filter((m) => {
    if (builtinIdSet.has(m.id)) return false;
    if (seenIds.has(m.id)) return false;
    seenIds.add(m.id);
    return true;
  });

  const customsWithDefaults = customs.map((m) => {
    return {
      ...getDefaultModuleFields(),
      source: 'user' as const,
      replaceable: 'replaceable' as const,
      ...m,
    };
  });

  return [...mergedBuiltins, ...customsWithDefaults];
}

export interface UseGameStateReturn {
  view: ViewState;
  setView: React.Dispatch<React.SetStateAction<ViewState>>;
  旅人: 角色数据结构;
  世界: 世界状态;
  chatHistory: 聊天消息[];
  记忆: 记忆系统;
  忆庭: 忆庭系统;
  智库: 智库系统;
  手机: 手机系统;
  NPC: NPC记录[];
  相册: 相册系统;
  新闻: 新闻条目[];
  剧情: 剧情节点[];
  剧情编织: 剧情编织系统;
  variableBatches: 变量命令批次[];
  jobs: DurableJob[];
  projectionStore: SessionProjectionStore;
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
  workflowHint: string;
  workflowStatus: 'searching' | 'done' | '';
  liveRecallSummary: string;
  liveRecallFullContent: string;
  pendingVariable: boolean;
  turnCount: number;
  pendingOpeningTrigger: string | null;
  interruptedWorkflow: WorkflowRecoveryJournal | null;
  setInterruptedWorkflow: React.Dispatch<React.SetStateAction<WorkflowRecoveryJournal | null>>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}


export function useGameState(): UseGameStateReturn {
  const [view, setView] = useState<ViewState>('home');
  const emptyProjectionRef = useRef<StoryProjection>({
    旅人: 创建空角色(),
    世界: 归一化世界状态(创建空世界状态()),
    chatHistory: [],
    记忆: 创建空记忆系统(),
    忆庭: 创建空忆庭系统(),
    智库: 创建空智库系统(),
    手机: 创建空手机系统(),
    NPC: [],
    相册: 创建空相册系统(),
    新闻: [],
    剧情: [],
    剧情编织: 创建空剧情编织系统(),
    variableBatches: [],
    jobs: [],
    turnJournal: [],
    worldbookTriggerStates: {},
    pendingOpeningTrigger: null,
    turnCount: 1,
  });
  const projectionStoreRef = useRef<SessionProjectionStore | null>(null);
  if (!projectionStoreRef.current) projectionStoreRef.current = new SessionProjectionStore();
  const projectionStore = projectionStoreRef.current;
  const projectionState = useSyncExternalStore(
    (listener) => projectionStore.subscribe(listener),
    () => projectionStore.current(),
    () => projectionStore.current(),
  );
  const sessionProjection = projectionState
    ? projectStoryForUi(displaySessionView(projectionState).story)
    : emptyProjectionRef.current;
  const [apiSettings, setApiSettings] = useState<API设置>(创建空API设置);
  const [gameSettings, setGameSettings] = useState<游戏设置>(创建默认游戏设置);
  const [currentTheme, setCurrentTheme] = useState<主题预设>('deepspace');
  const [worldbooks, setWorldbooks] = useState<世界书[]>([]);
  const [hasSave, setHasSave] = useState(false);
  const [startupError, setStartupError] = useState('');
  const [interruptedWorkflow, setInterruptedWorkflow] = useState<WorkflowRecoveryJournal | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const loading = projectionState?.phase !== undefined && projectionState.phase !== 'stable';
  const activeStage = projectionState && projectionState.phase !== 'stable' && projectionState.phase !== 'resyncing' && projectionState.phase !== 'command-running'
    ? projectionState.stage
    : null;
  const workflowStatus: 'searching' | 'done' | '' = activeStage === 'retrieving-context'
    ? 'searching'
    : loading ? 'done' : '';
  const retry = projectionState && projectionState.phase !== 'stable' && projectionState.phase !== 'resyncing' && projectionState.phase !== 'command-running'
    ? projectionState.retry
    : null;
  const workflowHint = retry
    ? `正在重试主剧情生成（${retry.attempt}/${retry.limit}）`
    : activeStage ? formatTurnStage(activeStage) : startupError;
  const liveRecallSummary = '';
  const liveRecallFullContent = '';
  const pendingVariable = false;

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
    const recoveryJournal = await (await getAppRoot()).host.loadWorkflowRecoveryJournal();
      if (recoveryJournal) {
        setInterruptedWorkflow(recoveryJournal);
        setStartupError('上次生成被浏览器中断，请检查存档后重新发送。');
      }

      const savedApi = await getPreference<API设置>('apiSettings');
      if (savedApi) setApiSettings(savedApi);
      const defaults = createDefaultSettingsPlanes();
      const [execution, appearance, savedContent, savePolicy, sessionExists] = await Promise.all([
        getPreference<ExecutionPolicy>(EXECUTION_POLICY_KEY),
        getPreference<AppearancePreferences>(APPEARANCE_PREFERENCES_KEY),
        getPreference<ContentLibrary>(CONTENT_LIBRARY_KEY),
        getPreference<SavePolicy>(SAVE_POLICY_KEY),
        (await getAppRoot()).sessions.exists(APP_SESSION_ID),
      ]);
      const content = savedContent ?? defaults.content;
      const resolvedContent = { ...content, promptModules: resolvePromptModules(content.promptModules) };
      const storyPolicy = sessionExists
        ? (await (await (await getAppRoot()).sessions.open(APP_SESSION_ID)).projection.current()).story.policy
        : defaults.story;
      const resolvedAppearance = appearance ?? defaults.appearance;
      setCurrentTheme(normalizeThemeId(resolvedAppearance.theme) as 主题预设);
      setGameSettings(composeSettings({
        apiProfiles: savedApi ?? 创建空API设置(),
        execution: execution ?? defaults.execution,
        appearance: resolvedAppearance,
        content: resolvedContent,
        save: savePolicy ?? defaults.save,
        story: storyPolicy,
      }));

      // Worldbooks 加载策略:
      // - savedWorldbooks === null   → 首次启动,把预设写入 IndexedDB(玩家之后可自由修改/删除)
      // - savedWorldbooks 是数组     → 玩家已与世界书交互过,完全尊重其状态,不再覆盖
      const builtins = createBuiltinWorldbooks();
      const rawSavedWorldbooks = savedContent?.worldbooks ?? null;
      const savedWorldbooks = rawSavedWorldbooks ? normalizeWorldbooks([...rawSavedWorldbooks]) : rawSavedWorldbooks;

      if (savedWorldbooks === null) {
        const presets = await loadAllBundledWorldbookPresets();
        const initial = [...builtins, ...presets];
        setWorldbooks(initial);
        await (await getAppRoot()).content.replaceWorldbooks(initial);
      } else if (savedWorldbooks.length) {
        const builtinIds = new Set(builtins.map((b) => b.id));
        const userBooks = savedWorldbooks.filter((b) => !builtinIds.has(b.id));
        const merged = builtins.map((builtin) => {
          const saved = savedWorldbooks.find((b) => b.id === builtin.id);
          if (!saved) return builtin;
          // calibration 内置世界书只是独立模型真实 prompt 的只读资料展示。
          // Calibration books are read-only views over source-owned prompts.
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
        await (await getAppRoot()).content.replaceWorldbooks(nextWorldbooks);
      } else {
        setWorldbooks(builtins);
        await (await getAppRoot()).content.replaceWorldbooks(builtins);
      }

      setHasSave(await (await getAppRoot()).sessions.exists(APP_SESSION_ID));
    })().catch(async (error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      setStartupError(`启动初始化失败：${detail}`);
      try {
        setHasSave(await (await getAppRoot()).sessions.exists(APP_SESSION_ID));
      } catch (sessionError: unknown) {
        const sessionDetail = sessionError instanceof Error ? sessionError.message : String(sessionError);
        setStartupError(`启动初始化失败：${detail}；会话检查失败：${sessionDetail}`);
      }
    });
  }, []);

  // Apply theme on change
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  return {
    view, setView,
    ...sessionProjection,
    projectionStore,
    apiSettings, setApiSettings,
    gameSettings, setGameSettings,
    currentTheme, setCurrentTheme,
    worldbooks, setWorldbooks,
    hasSave, setHasSave,
    loading,
    workflowHint,
    workflowStatus,
    liveRecallSummary,
    liveRecallFullContent,
    pendingVariable,
    interruptedWorkflow, setInterruptedWorkflow,
    scrollRef,
  };
}

function formatTurnStage(stage: import('@/src/kernel/contract').TurnStage): string {
  const labels: Record<import('@/src/kernel/contract').TurnStage, string> = {
    'preparing-player-message': '正在准备玩家消息',
    'resolving-content': '正在解析本回合内容',
    'retrieving-context': '忆庭召回 / 智库检索中',
    'planning-request': '正在组装主剧情请求',
    generating: '正在生成主剧情',
    parsing: '正在校验回复协议',
    'assistant-ready': '正文已就绪',
    reducing: '正在结算本回合',
    committing: '正在提交本回合',
  };
  return labels[stage];
}
