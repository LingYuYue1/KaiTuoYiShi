import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
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
import type { API设置, DeviceSettings, 游戏设置, 主题预设 } from '@/models/settings';
import {
  创建空API设置,
  创建默认游戏设置,
  LAST_VIEW_STORAGE_KEY,
} from '@/models/settings';
import {
  ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY,
  buildPersistedZhikuSystem,
  isBundledZhikuDuplicate,
  mergeBundledZhikuSystem,
  removeLegacyZhikuCharacterEntries,
  removeRetiredZhikuEntries,
} from '@/data/zhikuPreset';
import { loadBundledZhikuCatalogWithFallback } from '@/data/zhikuCatalogRepository';
import { buildPersistedStoryWeavingSystem, hydratePersistedStoryWeavingSystem, isSelfContainedStoryWeavingSystem, loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import type { 世界书 } from '@/models/worldbook';
import {
  clearWorkflowRecoveryJournal,
  isStaleRecoveryJournal,
  loadWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { applyTheme, normalizeThemeId } from '@/styles/themes';
import { deleteSetting, loadSetting, saveSetting, saveSetting as saveUiSetting } from '@/services/storage/settings';
import { loadActiveLeaf } from '@/services/storage/saveTree';
import { hasAnySave, validateRerollParent } from '@/services/storage/saveCrud';
import { reconcileBuiltinWorldbooks, WORLDBOOK_STORAGE_KEY } from '@/utils/worldbook';
import { createBuiltinWorldbooks } from '@/data/worldbookPresets';
import { loadAllBundledWorldbookPresets } from '@/data/openingWorldbookPreset';
import { devLogError } from '@/utils/devLog';
import { hydratePersistedGameSettings } from '@/utils/gameSettingsHydration';
import { bootRestoreFromNewest } from '@/hooks/useGame/saveLoadWorkflow';
import { TURN_STATUS_IDLE } from '@/hooks/useGame/turnStatus';
import { useActiveWorkflow, type ActiveWorkflowStore } from '@/hooks/useGame/activeWorkflow';
import type { 存档树元信息 } from '@/utils/saveTree';

export type ViewState = 'home' | 'new_game' | 'game';


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
  deviceSettings: DeviceSettings;
  macroGlobalVars: Record<string, string>;
  setMacroGlobalVars: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  worldbookTriggerStates: Record<string, number>;
  setWorldbookTriggerStates: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  setDeviceSettings: React.Dispatch<React.SetStateAction<DeviceSettings>>;
  setDeviceApiSettings: React.Dispatch<React.SetStateAction<API设置>>;
  setDeviceGameSettings: React.Dispatch<React.SetStateAction<游戏设置>>;
  setDeviceTheme: React.Dispatch<React.SetStateAction<主题预设>>;
  setDeviceWorldbooks: React.Dispatch<React.SetStateAction<世界书[]>>;
  hasSave: boolean;
  setHasSave: React.Dispatch<React.SetStateAction<boolean>>;
  turnCount: number;
  setTurnCount: React.Dispatch<React.SetStateAction<number>>;
  pendingOpeningTrigger: string | null;
  setPendingOpeningTrigger: React.Dispatch<React.SetStateAction<string | null>>;
  /** 片 5e（路线图 #2）：C 类工作流瞬时态的唯一管理对象（loading/turnStatus/召回摘要/待结算/中断/会话身份/中止与重roll 引用）。 */
  activeWorkflow: ActiveWorkflowStore;
  /** 当前活跃叶子的存档树元信息（响应式 state）：读档水合 / 封版晋升 / 新局初始化 / 整树删除时随工作区联动更新，驱动 canRerollWithTree。 */
  activeTreeMeta: 存档树元信息 | null;
  setActiveTreeMeta: React.Dispatch<React.SetStateAction<存档树元信息 | null>>;
  /** 活跃叶子父检查点的存在性验证状态（响应式 state）：pending=验证中（禁用）/ valid=父真实存在 / invalid=无父或验证失败。 */
  rerollParentStatus: 'pending' | 'valid' | 'invalid';
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
  const [deviceSettings, setDeviceSettings] = useState<DeviceSettings>(() => ({
    apiSettings: 创建空API设置(),
    gameSettings: 创建默认游戏设置(),
    theme: 'deepspace',
    worldbooks: [],
  }));
  const [macroGlobalVars, setMacroGlobalVars] = useState<Record<string, string>>({});
  const [worldbookTriggerStates, setWorldbookTriggerStates] = useState<Record<string, number>>({});
  const setDeviceApiSettings = useCallback<React.Dispatch<React.SetStateAction<API设置>>>((update) => {
    setDeviceSettings((current) => ({
      ...current,
      apiSettings: typeof update === 'function' ? update(current.apiSettings) : update,
    }));
  }, []);
  const setDeviceGameSettings = useCallback<React.Dispatch<React.SetStateAction<游戏设置>>>((update) => {
    setDeviceSettings((current) => ({
      ...current,
      gameSettings: typeof update === 'function' ? update(current.gameSettings) : update,
    }));
  }, []);
  const setDeviceTheme = useCallback<React.Dispatch<React.SetStateAction<主题预设>>>((update) => {
    setDeviceSettings((current) => ({
      ...current,
      theme: typeof update === 'function' ? update(current.theme) : update,
    }));
  }, []);
  const setDeviceWorldbooks = useCallback<React.Dispatch<React.SetStateAction<世界书[]>>>((update) => {
    setDeviceSettings((current) => ({
      ...current,
      worldbooks: typeof update === 'function' ? update(current.worldbooks) : update,
    }));
  }, []);
  const [hasSave, setHasSave] = useState(false);
  const [turnCount, setTurnCount] = useState(1);
  const [pendingOpeningTrigger, setPendingOpeningTrigger] = useState<string | null>(null);
  const [activeTreeMeta, setActiveTreeMeta] = useState<存档树元信息 | null>(null);
  const [rerollParentStatus, setRerollParentStatus] = useState<'pending' | 'valid' | 'invalid'>('pending');

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
    deviceSettings, setDeviceSettings,
    macroGlobalVars, setMacroGlobalVars,
    worldbookTriggerStates, setWorldbookTriggerStates,
    setDeviceApiSettings,
    setDeviceGameSettings,
    setDeviceTheme,
    setDeviceWorldbooks,
    hasSave, setHasSave,
    turnCount, setTurnCount,
    pendingOpeningTrigger, setPendingOpeningTrigger,
    activeWorkflow,
    activeTreeMeta, setActiveTreeMeta,
    rerollParentStatus,
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
      if (savedTheme) setDeviceTheme(normalizeThemeId(savedTheme) as 主题预设);

      const savedApi = await loadSetting<API设置>('apiSettings');
      if (savedApi) setDeviceApiSettings(savedApi);

      const savedGame = await loadSetting<游戏设置>('gameSettings');
      if (savedGame) {
        const hydrated = hydratePersistedGameSettings(savedGame);
        setDeviceGameSettings(hydrated.settings);
        setMacroGlobalVars(hydrated.macroGlobalVars);
        setWorldbookTriggerStates(hydrated.worldbookTriggerStates);
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
        const catalog = await loadBundledZhikuCatalogWithFallback();
        if (catalog.loadError) {
          console.warn('[zhiku] 新目录加载失败，已恢复最近一次完整目录:', catalog.loadError);
        }
        const preset = catalog.system;
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
      // - savedWorldbooks === null → 首次启动,把预设写入 IndexedDB
      // - savedWorldbooks 是数组   → 内置正文以源码为准,只接存档开关与时间戳;额外书原样保留
      const builtins = createBuiltinWorldbooks();
      const rawSavedWorldbooks = await loadSetting<世界书[]>(WORLDBOOK_STORAGE_KEY);
      if (rawSavedWorldbooks === null) {
        try {
          const presets = await loadAllBundledWorldbookPresets();
          const initial = [...builtins, ...presets];
          setDeviceWorldbooks(initial);
          await saveSetting(WORLDBOOK_STORAGE_KEY, initial);
        } catch (err) {
          console.warn('[opening-worldbook] preset 加载失败,使用内置空集:', err);
          setDeviceWorldbooks(builtins);
        }
      } else {
        const nextWorldbooks = reconcileBuiltinWorldbooks({
          sourceBuiltins: builtins,
          archivedWorldbooks: rawSavedWorldbooks,
        });
        setDeviceWorldbooks(nextWorldbooks);
        await saveSetting(WORLDBOOK_STORAGE_KEY, nextWorldbooks);
      }

      const saveExists = await hasAnySave();
      setHasSave(saveExists);

      let shouldClearLastView = false;
      if (lastView === 'game') {
        let restored = false;
        try {
          const currentState = stateRef.current;
          if (currentState) {
            // 崩溃窗口（commitTurn 封版后写指针前崩溃）恢复：把恢复日志持久化的
            // 本次提交目标子叶 nodeId 传入，采纳子叶子时按明确身份而非保存 ID 猜测。
            restored = await bootRestoreFromNewest(currentState, recoveryJournal?.pendingChildNodeId ?? null);
          }
        } catch (error) {
          devLogError('recover', 'useGameState.boot-restore-import-failed', error);
        }
        if (!restored) {
          shouldClearLastView = true;
        }
      }

      if (recoveryJournal) {
        const active = await loadActiveLeaf(recoveryJournal.pendingChildNodeId);
        const leafChatHistory = active.status === 'ok' ? active.leaf.chatHistory : [];
        // main_request：正文已落地说明崩溃发生在封版/清理窗口，日志已过期；未落地则保留，由输入区恢复草稿。
        if (isStaleRecoveryJournal(recoveryJournal, leafChatHistory)) {
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
  }, [setDeviceApiSettings, setDeviceGameSettings, setDeviceTheme, setDeviceWorldbooks, setInterruptedWorkflow, setTurnStatus]);

  // reroll 父检查点存在性主动验证（响应式）：activeTreeMeta 每次变化（读档水合 / 封版晋升 /
  // 崩溃重建 / 整树删除 / reroll 自愈剥离）都重新探测父检查点是否真实存在且同树，驱动 canRerollWithTree。
  // 验证中置 pending（按钮保守禁用，避免闪烁）；验证失败用四元组相等守卫剥离 parentNodeId 自愈
  // （防迟到的旧结果误清新叶子）；无父（根叶子 / 无根切片 / 已自愈）直接早退置 invalid，不再发起探测。
  // 探测异常（瞬时 IDB 错误）置 invalid 但不剥离 meta，留待下次 meta 变化重新验证。
  useEffect(() => {
    const meta = activeTreeMeta;
    if (!meta?.rootId || !meta.parentNodeId) {
      queueMicrotask(() => setRerollParentStatus('invalid'));
      return;
    }
    let cancelled = false;
    queueMicrotask(() => setRerollParentStatus('pending'));
    void validateRerollParent(meta.rootId, meta.parentNodeId)
      .then((ok) => {
        if (cancelled) return;
        if (ok) {
          setRerollParentStatus('valid');
          return;
        }
        setActiveTreeMeta((prev) => {
          if (!prev || prev.rootId !== meta.rootId || prev.nodeId !== meta.nodeId || prev.parentNodeId !== meta.parentNodeId) return prev;
          const { parentNodeId: _removedParentNodeId, ...rest } = prev;
          void _removedParentNodeId;
          return rest;
        });
        setRerollParentStatus('invalid');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        devLogError('save', 'reroll-parent-validate-failed', err, { rootId: meta.rootId, parentNodeId: meta.parentNodeId });
        setRerollParentStatus('invalid');
      });
    return () => { cancelled = true; };
  }, [activeTreeMeta]);

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
    applyTheme(deviceSettings.theme);
  }, [deviceSettings.theme]);

  return state;
}
