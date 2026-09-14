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
  bundledZhikuPresets,
  isBundledZhikuDuplicate,
  mergeBundledZhikuSystem,
  removeLegacyZhikuCharacterEntries,
  removeRetiredZhikuEntries,
} from '@/data/zhikuPreset';
import { loadBundledZhikuCatalogWithFallback, type ZhikuCatalogSource, type ZhikuCatalogStatus } from '@/data/zhikuCatalogRepository';
import { buildPersistedStoryWeavingSystem, bundledStoryWeavingPresets, hydratePersistedStoryWeavingSystem, isSelfContainedStoryWeavingSystem, loadAllBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import type { 世界书 } from '@/models/worldbook';
import { applyTheme, normalizeThemeId } from '@/styles/themes';
import { deleteSetting, loadSetting, saveSetting, saveSetting as saveUiSetting } from '@/services/storage/settings';
import { hasAnySave, validateRerollParent } from '@/services/storage/saveCrud';
import { reconcileBuiltinWorldbooks, WORLDBOOK_STORAGE_KEY } from '@/utils/worldbook';
import { createBuiltinWorldbooks } from '@/data/worldbookPresets';
import { loadAllBundledWorldbookPresets } from '@/data/openingWorldbookPreset';
import { devLog, devLogError } from '@/utils/devLog';
import { hydratePersistedGameSettings } from '@/utils/gameSettingsHydration';
import { bootRestoreFromNewest } from '@/hooks/useGame/saveLoadWorkflow';
import { useActiveWorkflow, type ActiveWorkflowStore } from '@/hooks/useGame/activeWorkflow';
import type { TurnPhase } from '@/models/turnRecovery';
import type { 存档树元信息 } from '@/utils/saveTree';

export type ViewState = 'home' | 'new_game' | 'game';

/**
 * 内置预置资源（原著剧情正文 + 智库目录）的载入进度。
 *
 * 合计 50 个文件、约 7.3 MB gzip，是整个 JS 包的七倍多，所以它必须是**可见**的：
 * 界面据此显示进度条，并在 pending 期间禁用依赖这些数据的入口。
 * status 一旦不再是 'pending'，门禁即解除——failed 也解除，玩家永远进得去游戏。
 */
export interface PresetLoadState {
  /** 已完成的文件数（两路求和）。 */
  done: number;
  /** 总文件数（两路求和，由预设数组长度推导）。 */
  total: number;
  /** 起算时刻，供界面显示用时。 */
  startedAt: number;
  status: 'pending' | 'ready' | 'failed';
  /** 是否走了降级缓存（原著正文可能不完整）。 */
  degraded: boolean;
}

/**
 * 内置预置资源的**挂死兜底**（120s），不是设计上的等待预算。
 *
 * 这两路合计 50 个文件 / 约 7.3 MB（gzip），真正的出口是进度条上的「跳过」——
 * 玩家能看到进度、能主动收口，所以不需要一个固定超时替他决定何时放弃降级。
 * 这个值只在两路彻底无响应时兜底，避免进度条永远转下去。
 */
const BOOT_BUNDLED_LOAD_TIMEOUT_MS = 120000;

function withBootLoadTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  // 同步预挂载 noop 拒绝处理器：两路并行后调用方在后文才 await，
  // 中间穿过 IDB/网络等 macrotask，Node 会把无人认领的中间态误报为未处理拒绝；
  // 挂载只做标记不吞错，拒绝仍经 race 原样抛给调用方 try/catch。
  promise.then(undefined, () => {});
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`boot 内置资源加载超时：${label}（${BOOT_BUNDLED_LOAD_TIMEOUT_MS}ms）`)),
      BOOT_BUNDLED_LOAD_TIMEOUT_MS,
    );
  });
  const raced = Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
  raced.then(undefined, () => {});
  return raced;
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
  /** 首页智库入口的目录就绪信号（boot 合并写，App 首页弹窗读）：pending=合并中，ready=可展示，failed=不可用。 */
  zhikuCatalogStatus: ZhikuCatalogStatus;
  zhikuCatalogSource: ZhikuCatalogSource;
  /**
   * boot 主体（世界书 + 存档恢复）是否已落定。内置预置资源**不在其中**——它们是
   * 独立的后台任务，见 presetLoad：7.3 MB 的等待不该拖住 IndexedDB 恢复。
   * 背景预热在此之前不得启动：boot 恢复本身是 IndexedDB 重活，并行只会互相拖慢。
   */
  bootSettled: boolean;
  /** 内置预置资源（原著正文 + 智库目录）的载入进度，供进度条与门禁使用。 */
  presetLoad: PresetLoadState;
  /** 跳过预置加载：只解除门禁，不中断下载（之后成功会自行回到 ready）。 */
  skipPresetLoad: () => void;
  /** 重试预置加载：重跑整段，不动其它 boot 状态，也不会刷新页面。 */
  retryPresetLoad: () => void;
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
  /** 活跃叶子回合相位投影（hydration / 管线相位边界写入）：未封版回合作战面的派发与恢复判定依据。 */
  turnPhase: TurnPhase | null;
  setTurnPhase: React.Dispatch<React.SetStateAction<TurnPhase | null>>;
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
  const [zhikuCatalogStatus, setZhikuCatalogStatus] = useState<ZhikuCatalogStatus>('pending');
  const [zhikuCatalogSource, setZhikuCatalogSource] = useState<ZhikuCatalogSource>(null);
  const [bootSettled, setBootSettled] = useState(false);
  /** 自增即触发一次完整的预置重载（重试）。 */
  const [presetLoadRun, setPresetLoadRun] = useState(0);
  const [presetLoad, setPresetLoad] = useState<PresetLoadState>(() => ({
    done: 0,
    total: bundledStoryWeavingPresets.length + bundledZhikuPresets.length,
    startedAt: Date.now(),
    status: 'pending',
    degraded: false,
  }));

  // 两路各自记自己的已完成数，对外求和。避免两路共用一个可变计数器——
  // 它们并行推进，共享计数在任一路卡住时会把总数算花。
  // 只存 done：总数的唯一来源是上面 useState 初值里的两个数组长度。
  const presetDoneRef = useRef({ story: 0, zhiku: 0 });
  const publishPresetProgress = useCallback((): void => {
    const { story, zhiku } = presetDoneRef.current;
    setPresetLoad((prev) => ({ ...prev, done: story + zhiku }));
  }, []);
  const reportStoryProgress = useCallback((done: number): void => {
    presetDoneRef.current.story = done;
    publishPresetProgress();
  }, [publishPresetProgress]);
  const reportZhikuProgress = useCallback((done: number): void => {
    presetDoneRef.current.zhiku = done;
    publishPresetProgress();
  }, [publishPresetProgress]);

  /**
   * 跳过：只解除门禁，**不中断下载**。
   * 两个后台任务继续跑，若之后成功，状态会自己回到 ready——玩家不必为一次误判重来。
   */
  const skipPresetLoad = useCallback((): void => {
    setPresetLoad((prev) => prev.status === 'pending'
      ? { ...prev, status: 'failed', degraded: true }
      : prev);
  }, []);

  /**
   * 重试：重跑整个预置载入。
   * 刻意不是「重载页面」——玩家可能正在填开局向导，刷新会丢掉那份草稿。
   */
  const retryPresetLoad = useCallback((): void => {
    // 重置放在这里（事件处理器）而不是载入 effect 里：effect 体同步 setState 会级联渲染。
    presetDoneRef.current = { story: 0, zhiku: 0 };
    setPresetLoad((prev) => ({ ...prev, done: 0, status: 'pending', degraded: false, startedAt: Date.now() }));
    setPresetLoadRun((run) => run + 1);
  }, []);
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
  const [turnPhase, setTurnPhase] = useState<TurnPhase | null>(null);
  const [activeTreeMeta, setActiveTreeMeta] = useState<存档树元信息 | null>(null);
  const [rerollParentStatus, setRerollParentStatus] = useState<'pending' | 'valid' | 'invalid'>('pending');

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bootReadyRef = useRef(false);
  const stateRef = useRef<UseGameStateReturn | null>(null);

  // 片 5e（路线图 #2）：C 类工作流瞬时态收拢到 activeWorkflow 单一管理对象。
  const activeWorkflow = useActiveWorkflow();

  const state: UseGameStateReturn = {
    view, setView,
    旅人, set旅人,
    世界, set世界,
    chatHistory, setChatHistory,
    记忆, set记忆,
    忆庭, set忆庭,
    智库, set智库,
    zhikuCatalogStatus, zhikuCatalogSource,
    bootSettled,
    presetLoad, skipPresetLoad, retryPresetLoad,
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
    turnPhase, setTurnPhase,
    activeWorkflow,
    activeTreeMeta, setActiveTreeMeta,
    rerollParentStatus,
    scrollRef,
  };

  useLayoutEffect(() => {
    stateRef.current = state;
  });

  // 内置预置资源（原著正文 + 智库目录）的载入：独立于 boot 主体的后台任务。
  //
  // 为什么独立：两路合计 50 个文件、约 7.3 MB gzip，是整个 JS 包的七倍多。它既不该
  // 拖住世界书与存档恢复，也不该被某个固定超时替玩家决定何时放弃降级。
  // 依赖它的入口由 presetLoad 门禁，进度由 PresetLoadBar 显示并提供跳过/重试。
  // presetLoadRun 自增即为「重试」：整段重跑，不动其它任何 boot 状态。
  // 刻意不在 effect 体里重置状态：那会触发级联渲染（react-hooks/set-state-in-effect）。
  // 首启的 pending 由 useState 初值给出，重试的重置由 retryPresetLoad 这个事件处理器负责。
  useEffect(() => {
    // 两路独立：同时启动，且**各自就地应用结果**——任一停滞/失败都不得饿死另一路。
    //
    // 必须「各自应用」，不能「先 await 一路、再 await 另一路」：后者会让先落定的一路
    // 白等到另一路超时（BOOT_BUNDLED_LOAD_TIMEOUT_MS）才写状态。原著资源停滞时，
    // 首页智库入口就会跟着一路 pending——正是下方 fallback 与 pending 态要避免的情形。
    // 两个 async 立即调用同步执行到第一个 await，所以两路仍在同一 tick 内发出。
    // 返回 true = 内置资源到位；false = 走了本地降级缓存（原著正文可能不完整）。
    const storyWeavingTask = (async (): Promise<boolean> => {
      try {
        const bundledStoryWeaving = await withBootLoadTimeout(
          loadAllBundledStoryWeavingPresets(reportStoryProgress),
          'storyWeaving',
        );
        const savedStoryWeaving = await loadSetting<剧情编织系统>('storyWeavingSystem');
        const mergedStoryWeaving = hydratePersistedStoryWeavingSystem(savedStoryWeaving, bundledStoryWeaving);
        set剧情编织(mergedStoryWeaving);
        await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(mergedStoryWeaving));
        return true;
      } catch (err) {
        console.warn('[story-weaving] preset 加载失败，回退到本地已存剧情编织:', err);
        const savedStoryWeaving = await loadSetting<剧情编织系统>('storyWeavingSystem');
        if (isSelfContainedStoryWeavingSystem(savedStoryWeaving)) {
          set剧情编织(归一化剧情编织系统(savedStoryWeaving));
        } else if (savedStoryWeaving) {
          console.warn('[story-weaving] 本地状态是轻量缓存，缺少原著正文；等待下次启动重新加载内置资源。');
        }
        return false;
      }
    })();

    const zhikuCatalogTask = (async (): Promise<boolean> => {
      try {
        const catalog = await withBootLoadTimeout(
          loadBundledZhikuCatalogWithFallback({ onProgress: reportZhikuProgress }),
          'zhikuCatalog',
        );
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
        setZhikuCatalogStatus('ready');
        setZhikuCatalogSource(catalog.source);
        await saveSetting('zhikuSystem', buildPersistedZhikuSystem(mergedZhiku));
        devLog('save', 'zhiku-boot-merged', {
          total: mergedZhiku.条目.length,
          builtin: mergedZhiku.条目.filter((entry) => entry.builtin).length,
          custom: mergedZhiku.条目.filter((entry) => !entry.builtin).length,
          source: catalog.source,
        });
        return true;
      } catch (err) {
        console.warn('[zhiku] preset 加载失败，回退到本地已存智库:', err);
        devLogError('save', 'zhiku-boot-failed', err);
        setZhikuCatalogStatus('failed');
        setZhikuCatalogSource(null);
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
        return false;
      }
    })();

    // 预置资源不挂在 boot 主链上：下方世界书加载、存档恢复与 bootSettled 都不该被它们拖住。
    // 两路各自就地应用结果（见上），这里只补一个终局上报，供进度条与门禁使用。
    // 刻意不 await——这是后台任务，boot 不等它。
    void Promise.allSettled([storyWeavingTask, zhikuCatalogTask]).then((results) => {
      const allFresh = results.every((result) => result.status === 'fulfilled' && result.value);
      setPresetLoad((prev) => ({ ...prev, status: allFresh ? 'ready' : 'failed', degraded: !allFresh }));
    });
  }, [presetLoadRun, reportStoryProgress, reportZhikuProgress]);

  // Load persisted settings on mount
  useEffect(() => {
    void (async () => {
      // 迁移（ADR 0002）：独立恢复日志已被活跃叶子恢复上下文取代，清除遗留 settings 键。
      try {
        await deleteSetting('activeWorkflowRecoveryV1');
      } catch (error) {
        devLogError('recover', 'legacy-recovery-journal-cleanup-failed', error);
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

      // 内置预置资源不在这里加载：见上方独立的预设载入 effect。
      // 它是可观测、可重试、可跳过的后台任务，刻意不属于 boot 主链。

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
            // 崩溃窗口（commitTurn 封版后写指针前崩溃）恢复：采纳身份由 newest 记录
            // 内部字段 pendingChildNodeId 承载，boot 恢复不再依赖树外日志。
            restored = await bootRestoreFromNewest(currentState);
          }
        } catch (error) {
          devLogError('recover', 'useGameState.boot-restore-import-failed', error);
        }
        if (!restored) {
          shouldClearLastView = true;
        }
      }

      bootReadyRef.current = true;
      // 与 bootReadyRef 同一时刻：世界书与存档恢复都已有结论，IndexedDB 可以让给背景预热了。
      // 预置资源此时可能仍在后台下载——那不影响预热，界面的门禁单独看 presetLoad。
      setBootSettled(true);
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
  }, [setDeviceApiSettings, setDeviceGameSettings, setDeviceTheme, setDeviceWorldbooks]);

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
