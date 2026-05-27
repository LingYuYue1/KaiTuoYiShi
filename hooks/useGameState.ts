import { useState, useRef, useEffect, useCallback } from 'react';
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
import { 创建空手机系统, 归一化手机系统 } from '@/models/phone';
import type { NPC记录 } from '@/models/npc';
import type { 相册系统 } from '@/models/imageGeneration';
import { 创建空相册系统, 归一化相册系统 } from '@/models/imageGeneration';
import type { 新闻条目 } from '@/models/news';
import type { 剧情节点 } from '@/models/plot';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 创建空剧情编织系统, 归一化剧情编织系统 } from '@/models/storyWeaving';
import type { 剧情推进建议 } from '@/models/storyProgress';
import type { 变量命令批次 } from '@/models/variableCommand';
import type { 队列任务记录 } from '@/models/queueTask';
import type { API设置, 游戏设置, 主题预设 } from '@/models/settings';
import {
  创建空API设置,
  创建默认游戏设置,
  创建默认星际和平周报设置,
  创建默认记忆系统设置,
  创建默认智库系统设置,
  创建默认剧情编织系统设置,
  创建默认手机系统设置,
  创建默认文生图系统设置,
  归一化记忆系统设置,
  归一化星际和平周报设置,
  归一化智库系统设置,
  归一化剧情编织系统设置,
  归一化手机系统设置,
  归一化文生图系统设置,
} from '@/models/settings';
import type { 提示词模块 } from '@/models/prompts';
import { BUILTIN_PROMPT_MODULE_IDS, LEGACY_BUILTIN_COT_ID } from '@/models/prompts';
import { createBuiltinPromptModules } from '@/data/builtinPromptModules';
import { isBundledZhikuDuplicate, loadAllBundledZhikuPresets } from '@/data/zhikuPreset';
import { loadAllBundledStoryWeavingPresets, mergeBundledStoryWeavingPresets } from '@/data/storyWeavingPreset';
import type { 世界书 } from '@/models/worldbook';
import { applyTheme } from '@/styles/themes';
import { loadSetting, saveSetting, hasAnySave } from '@/services/dbService';
import { WORLDBOOK_STORAGE_KEY, normalizeWorldbooks } from '@/utils/worldbook';
import { createBuiltinWorldbooks } from '@/data/worldbookPresets';
import { loadAllBundledWorldbookPresets } from '@/data/openingWorldbookPreset';

const REMOVED_LEGACY_WORLDBOOK_IDS = new Set([
  'builtin_express_crew',
  'builtin_locations',
  'opening_core',
]);

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
      // 内置模块 content / title / description / scope / category 永远以源码为准(UI 上对内置为只读),
      // 只保留用户可调的 enabled / order / 时间戳。否则 IndexedDB 里持久化的旧 content
      // 会反向覆盖源码更新,导致改了源码但跑出旧 prompt。
      return {
        ...b,
        enabled: hit.enabled,
        order: hit.order,
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

  const hasLegacy = customs.some((m) => m.id === 'legacy_custom');
  if (!hasLegacy && savedGame.customPrompt && savedGame.customPrompt.trim()) {
    const now = Date.now();
    customs.push({
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

  return [...mergedBuiltins, ...customs];
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
  剧情推进建议: 剧情推进建议 | null;
  set剧情推进建议: React.Dispatch<React.SetStateAction<剧情推进建议 | null>>;
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
  streamingMessage: string;
  setStreamingMessage: React.Dispatch<React.SetStateAction<string>>;
  workflowHint: string;
  setWorkflowHint: React.Dispatch<React.SetStateAction<string>>;
  workflowStatus: 'searching' | 'done' | '';
  setWorkflowStatus: React.Dispatch<React.SetStateAction<'searching' | 'done' | ''>>;
  /** 变量模型校准正在跑（正文已落地，变量在结算中）。期间禁止发下一轮。 */
  pendingVariable: boolean;
  setPendingVariable: React.Dispatch<React.SetStateAction<boolean>>;
  turnCount: number;
  setTurnCount: React.Dispatch<React.SetStateAction<number>>;
  pendingOpeningTrigger: string | null;
  setPendingOpeningTrigger: React.Dispatch<React.SetStateAction<string | null>>;
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
  const [剧情推进建议, set剧情推进建议] = useState<剧情推进建议 | null>(null);
  const [variableBatches, setVariableBatches] = useState<变量命令批次[]>([]);
  const [queueTasks, setQueueTasks] = useState<队列任务记录[]>([]);
  const [apiSettings, setApiSettings] = useState<API设置>(创建空API设置);
  const [gameSettings, setGameSettings] = useState<游戏设置>(创建默认游戏设置);
  const [currentTheme, setCurrentTheme] = useState<主题预设>('deepspace');
  const [worldbooks, setWorldbooks] = useState<世界书[]>([]);
  const [hasSave, setHasSave] = useState(false);
  const [loading, setLoading] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState('');
  const [workflowHint, setWorkflowHint] = useState('');
  const [workflowStatus, setWorkflowStatus] = useState<'searching' | 'done' | ''>('');
  const [pendingVariable, setPendingVariable] = useState(false);
  const [turnCount, setTurnCount] = useState(1);
  const [pendingOpeningTrigger, setPendingOpeningTrigger] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load persisted settings on mount
  useEffect(() => {
    (async () => {
      const savedTheme = await loadSetting<主题预设>('theme');
      if (savedTheme) setCurrentTheme(savedTheme);

      const savedApi = await loadSetting<API设置>('apiSettings');
      if (savedApi) setApiSettings(savedApi);

      const savedGame = await loadSetting<游戏设置>('gameSettings');
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
          variableApi: savedGame.variableApi ?? defaults.variableApi,
          enableMaleNsfwArchive: savedGame.enableMaleNsfwArchive ?? defaults.enableMaleNsfwArchive,
          promptModules: migratePromptModules(savedGame),
        };
        // 迁移后清空 legacy customPrompt，避免下次启动重复追加
        if (savedGame.customPrompt && merged.promptModules.some((m) => m.id === 'legacy_custom')) {
          merged.customPrompt = '';
        }
        setGameSettings(merged);
      }

      try {
        const bundledStoryWeaving = await loadAllBundledStoryWeavingPresets();
        const savedStoryWeaving = await loadSetting<剧情编织系统>('storyWeavingSystem');
        const mergedStoryWeaving = mergeBundledStoryWeavingPresets(
          savedStoryWeaving ? 归一化剧情编织系统(savedStoryWeaving) : null,
          bundledStoryWeaving,
        );
        set剧情编织(mergedStoryWeaving);
        await saveSetting('storyWeavingSystem', mergedStoryWeaving);
      } catch (err) {
        console.warn('[story-weaving] preset 加载失败，回退到本地已存剧情编织:', err);
        const savedStoryWeaving = await loadSetting<剧情编织系统>('storyWeavingSystem');
        if (savedStoryWeaving) set剧情编织(归一化剧情编织系统(savedStoryWeaving));
      }

      try {
        const preset = await loadAllBundledZhikuPresets();
        const savedZhiku = await loadSetting<智库系统>('zhikuSystem');
        const customEntries = savedZhiku?.条目?.filter((entry) => !entry.builtin && !isBundledZhikuDuplicate(entry)) ?? [];
        const mergedZhiku = 归一化智库系统({
          条目: [...preset.条目, ...customEntries],
        });
        set智库(mergedZhiku);
        await saveSetting('zhikuSystem', mergedZhiku);
      } catch (err) {
        console.warn('[zhiku] preset 加载失败，回退到本地已存智库:', err);
        const savedZhiku = await loadSetting<智库系统>('zhikuSystem');
        if (savedZhiku) {
          set智库(归一化智库系统({
            条目: savedZhiku.条目.filter((entry) => !isBundledZhikuDuplicate(entry)),
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
          const savedEntries = saved.entries || [];
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
    })();
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
          }
        : {
            ...prev,
            新闻系统: 创建默认游戏设置().新闻系统,
            手机系统: 创建默认手机系统设置(),
            剧情编织系统: 创建默认剧情编织系统设置(),
            文生图系统: 创建默认文生图系统设置(),
            记忆系统: 创建默认记忆系统设置(),
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
    剧情推进建议, set剧情推进建议,
    variableBatches, setVariableBatches,
    queueTasks, setQueueTasks,
    apiSettings, setApiSettings,
    gameSettings, setGameSettings,
    currentTheme, setCurrentTheme,
    worldbooks, setWorldbooks,
    hasSave, setHasSave,
    loading, setLoading,
    streamingMessage, setStreamingMessage,
    workflowHint, setWorkflowHint,
    workflowStatus, setWorkflowStatus,
    pendingVariable, setPendingVariable,
    turnCount, setTurnCount,
    pendingOpeningTrigger, setPendingOpeningTrigger,
    abortControllerRef, scrollRef,
  };
}
