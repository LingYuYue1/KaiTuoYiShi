import type { UseGameStateReturn } from '@/hooks/useGameState';
import { migratePromptModules, migrateStPresetOrders } from '@/hooks/useGameState';
import type { 存档数据, 存档类型, 游戏设置 } from '@/models/settings';
import type { 聊天消息 } from '@/models/chat';
import { 创建空角色, 确保命途列表 } from '@/models/character';
import type { 角色数据结构 } from '@/models/character';
import {
  创建空API设置,
  创建默认游戏设置,
  归一化文生图系统设置,
  归一化剧情编织系统设置,
  归一化记忆系统设置,
  归一化星际和平周报设置,
  归一化智库系统设置,
  归一化手机系统设置,
  归一化额外功能设置,
  归一化视觉文本设置,
} from '@/models/settings';
import { loadLatestSave, loadSave, deleteSave as dbDeleteSave, saveGame, saveSetting } from '@/services/dbService';
import {
  buildPersistedZhikuSystem,
  loadAllBundledZhikuPresets,
  mergeBundledZhikuSystem,
  ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY,
} from '@/data/zhikuPreset';
import { loadSetting } from '@/services/dbService';
import { clearWorkflowRecoveryJournal, isWorkflowRecoveryComplete } from '@/services/workflowRecovery';
import { normalizeMemorySystem } from './memoryUtils';
import { 归一化世界状态 } from '@/models/world';
import { 归一化忆庭系统 } from '@/models/yiting';
import { 归一化手机系统 } from '@/models/phone';
import { 归一化NPC记录列表 } from '@/models/npc';
import { 归一化相册系统 } from '@/models/imageGeneration';
import { 归一化新闻列表 } from '@/models/news';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import { autoAlignCanonStoryProgress } from '@/services/storyProgressService';
import { alignStoryWeavingToOpeningArchive, buildPersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { materializeAlbumRuntimePayload, pruneAlbumAssetCache } from '@/utils/albumObjectUrl';
import { compactDuplicatedSaveImages } from '@/utils/saveImageCompactor';
import { attachSaveTreeMeta, buildNextSaveTreeMeta, getSaveTreeMeta, type 存档树元信息 } from '@/utils/saveTree';
import { compactChatHistoryForLongSession, compactVariableBatchHistory } from '@/utils/longSessionRetention';

let activeSaveTreeMeta: 存档树元信息 | null = null;

export function clearActiveSaveTreeMetaIfMatches(target?: { rootId?: string; nodeId?: string } | null): void {
  if (!activeSaveTreeMeta) return;
  if (!target?.rootId && !target?.nodeId) {
    activeSaveTreeMeta = null;
    return;
  }
  if (
    (target.rootId && activeSaveTreeMeta.rootId === target.rootId) ||
    (target.nodeId && activeSaveTreeMeta.nodeId === target.nodeId)
  ) {
    activeSaveTreeMeta = null;
  }
}

// 共享的存档负载构造函数：手动 / 自动两条路径都走这一处，未来加字段只改一处。
// overrides 用于 sendWorkflow 里那一刻 React state 还没回写、但已有新值的字段
// （比如刚追加的 chatHistory、压缩过的 memorySystem）。
export function buildSavePayload(
  state: UseGameStateReturn,
  type: 存档类型,
  overrides?: Partial<Pick<存档数据, 'turnCount' | 'chatHistory' | '记忆' | '忆庭' | '智库' | '手机' | '世界' | '旅人' | 'NPC' | '相册' | '新闻' | '剧情' | '剧情编织' | 'variableBatches' | 'queueTasks'>>,
): 存档数据 {
  const persistedChatHistory = compactChatHistoryForLongSession(
    overrides?.chatHistory ?? state.chatHistory,
  );
  const timestamp = Date.now();
  const baseSave = {
    id: 0,
    type,
    timestamp,
    turnCount: overrides?.turnCount ?? state.turnCount,
    旅人: overrides?.旅人 ?? state.旅人,
    世界: overrides?.世界 ?? state.世界,
    chatHistory: persistedChatHistory,
    记忆: overrides?.记忆 ?? state.记忆,
    忆庭: overrides?.忆庭 ?? state.忆庭,
    智库: buildPersistedZhikuSystem(overrides?.智库 ?? state.智库),
    手机: overrides?.手机 ?? state.手机,
    NPC: overrides?.NPC ?? state.NPC,
    相册: overrides?.相册 ?? state.相册,
    新闻: overrides?.新闻 ?? state.新闻,
    剧情: overrides?.剧情 ?? state.剧情,
    剧情编织: 归一化剧情编织系统(overrides?.剧情编织 ?? state.剧情编织),
    variableBatches: compactVariableBatchHistory(overrides?.variableBatches ?? state.variableBatches),
    queueTasks: overrides?.queueTasks ?? state.queueTasks,
    gameSettings: buildSaveGameSettingsSnapshot({
      ...state.gameSettings,
      新闻系统: 归一化星际和平周报设置(state.gameSettings.新闻系统),
      手机系统: 归一化手机系统设置(state.gameSettings.手机系统),
      智库系统: 归一化智库系统设置(state.gameSettings.智库系统),
      剧情编织系统: 归一化剧情编织系统设置(state.gameSettings.剧情编织系统),
      文生图系统: 归一化文生图系统设置(state.gameSettings.文生图系统),
      记忆系统: 归一化记忆系统设置(state.gameSettings.记忆系统),
      额外功能: 归一化额外功能设置(state.gameSettings.额外功能),
      visualTextSettings: 归一化视觉文本设置(state.gameSettings.visualTextSettings),
    }),
    apiSettings: 创建空API设置(),
    theme: state.currentTheme,
  };
  const parentSave = activeSaveTreeMeta
    ? ({ id: 0, type, timestamp, 旅人: baseSave.旅人, 世界: baseSave.世界, chatHistory: [], 记忆: baseSave.记忆, gameSettings: baseSave.gameSettings, apiSettings: baseSave.apiSettings, theme: baseSave.theme, saveTree: activeSaveTreeMeta } as unknown as 存档数据)
    : null;
  const withTree = attachSaveTreeMeta(baseSave as 存档数据, buildNextSaveTreeMeta({
    previous: parentSave,
    type,
    timestamp,
  }));
  return compactDuplicatedSaveImages(withTree);
}

export function commitActiveSaveTreeMeta(save: 存档数据): void {
  activeSaveTreeMeta = getSaveTreeMeta(save);
}

function buildSaveGameSettingsSnapshot(settings: 游戏设置): 游戏设置 {
  const defaults = 创建默认游戏设置();
  return {
    ...settings,
    enableClaudeMode: defaults.enableClaudeMode,
    deepSeekMainMode: defaults.deepSeekMainMode,
    backgroundTaskMode: settings.backgroundTaskMode,
    visualTextSettings: 归一化视觉文本设置(settings.visualTextSettings),
    enableCacheDiagnostics: defaults.enableCacheDiagnostics,
    variableApi: defaults.variableApi,
    新闻系统: {
      ...settings.新闻系统,
      api: defaults.新闻系统.api,
    },
    手机系统: {
      ...settings.手机系统,
      api: defaults.手机系统.api,
    },
    智库系统: {
      ...settings.智库系统,
      api: defaults.智库系统.api,
    },
    剧情编织系统: {
      ...settings.剧情编织系统,
      api: defaults.剧情编织系统.api,
    },
    文生图系统: {
      ...settings.文生图系统,
      普通接口: defaults.文生图系统.普通接口,
      场景接口: defaults.文生图系统.场景接口,
      useSeparateSceneApi: defaults.文生图系统.useSeparateSceneApi,
      NSFW接口: defaults.文生图系统.NSFW接口,
      词组转化器API: defaults.文生图系统.词组转化器API,
      正文生图: {
        ...settings.文生图系统.正文生图,
        parserApi: defaults.文生图系统.正文生图.parserApi,
        imageApi: defaults.文生图系统.正文生图.imageApi,
      },
    },
    记忆系统: {
      ...settings.记忆系统,
      记忆总结API: defaults.记忆系统.记忆总结API,
      忆庭召回API: defaults.记忆系统.忆庭召回API,
      忆庭精炼API: defaults.记忆系统.忆庭精炼API,
    },
  };
}

function preserveLocalApiGameSettings(nextFromSave: 游戏设置, localSettings: 游戏设置): 游戏设置 {
  const local = {
    新闻系统: 归一化星际和平周报设置(localSettings.新闻系统),
    手机系统: 归一化手机系统设置(localSettings.手机系统),
    智库系统: 归一化智库系统设置(localSettings.智库系统),
    剧情编织系统: 归一化剧情编织系统设置(localSettings.剧情编织系统),
    文生图系统: 归一化文生图系统设置(localSettings.文生图系统),
    记忆系统: 归一化记忆系统设置(localSettings.记忆系统),
  };

  return {
    ...nextFromSave,
    enableClaudeMode: localSettings.enableClaudeMode,
    deepSeekMainMode: localSettings.deepSeekMainMode,
    backgroundTaskMode: localSettings.backgroundTaskMode,
    enableCacheDiagnostics: localSettings.enableCacheDiagnostics,
    visualTextSettings: 归一化视觉文本设置(nextFromSave.visualTextSettings),
    variableApi: localSettings.variableApi,
    新闻系统: {
      ...nextFromSave.新闻系统,
      api: local.新闻系统.api,
    },
    手机系统: {
      ...nextFromSave.手机系统,
      api: local.手机系统.api,
    },
    智库系统: {
      ...nextFromSave.智库系统,
      api: local.智库系统.api,
    },
    剧情编织系统: {
      ...nextFromSave.剧情编织系统,
      api: local.剧情编织系统.api,
    },
    文生图系统: {
      ...nextFromSave.文生图系统,
      普通接口: local.文生图系统.普通接口,
      场景接口: local.文生图系统.场景接口,
      useSeparateSceneApi: local.文生图系统.useSeparateSceneApi,
      NSFW接口: local.文生图系统.NSFW接口,
      词组转化器API: local.文生图系统.词组转化器API,
      正文生图: {
        ...nextFromSave.文生图系统.正文生图,
        parserApi: local.文生图系统.正文生图.parserApi,
        imageApi: local.文生图系统.正文生图.imageApi,
      },
    },
    记忆系统: {
      ...nextFromSave.记忆系统,
      记忆总结API: local.记忆系统.记忆总结API,
      忆庭召回API: local.记忆系统.忆庭召回API,
      忆庭精炼API: local.记忆系统.忆庭精炼API,
    },
  };
}

export async function handleLoadLatest(
  state: UseGameStateReturn,
): Promise<boolean> {
  const save = await loadLatestSave();
  if (!save) return false;
  const abortControllerRef = state.abortControllerRef;
  abortControllerRef.current?.abort();
  abortControllerRef.current = null;
  await applySaveToState(save, state);
  return true;
}

export async function handleLoadById(
  id: number,
  state: UseGameStateReturn,
): Promise<boolean> {
  const save = await loadSave(id);
  if (!save) return false;
  const abortControllerRef = state.abortControllerRef;
  abortControllerRef.current?.abort();
  abortControllerRef.current = null;
  await applySaveToState(save, state);
  return true;
}

export async function handleManualSave(state: UseGameStateReturn): Promise<number> {
  const payload = buildSavePayload(state, 'manual');
  const id = await saveGame(payload);
  commitActiveSaveTreeMeta(payload);
  return id;
}

export async function handleDeleteSave(id: number): Promise<void> {
  const save = await loadSave(id);
  await dbDeleteSave(id);
  clearActiveSaveTreeMetaIfMatches((save as { saveTree?: 存档树元信息 } | null)?.saveTree);
}

async function applySaveToState(
  save: 存档数据,
  state: UseGameStateReturn,
): Promise<void> {
  activeSaveTreeMeta = getSaveTreeMeta(save);
  const safeChatHistory = compactChatHistoryForLongSession(normalizeSaveChatHistory(save.chatHistory));
  const safeWorld = 归一化世界状态(save.世界);
  const safeTraveler = normalizeSavedTraveler(save.旅人, safeWorld.当前日期);
  const safeGameSettings = normalizeSavedGameSettings(save.gameSettings);

  if (state.interruptedWorkflow) {
    if (isWorkflowRecoveryComplete(state.interruptedWorkflow, safeChatHistory)) {
      await clearWorkflowRecoveryJournal(state.interruptedWorkflow.workflowId);
      state.setInterruptedWorkflow(null);
      if (state.workflowHint.startsWith('上次生成被浏览器中断')) state.setWorkflowHint('');
    } else {
      state.setWorkflowHint('上次生成被浏览器中断，输入已恢复；请检查存档后重新发送。');
    }
  }

  state.set旅人(safeTraveler);
  state.set世界(safeWorld);
  state.setChatHistory(safeChatHistory);
  state.set记忆(normalizeMemorySystem(save.记忆));   // 老存档缺 longTermMemories 时兜底
  const legacyArchives = (save.记忆 as unknown as { 回忆档案?: unknown[] }).回忆档案 ?? [];
  state.set忆庭(
    归一化忆庭系统(
      save.忆庭 ?? ({ 回忆档案: legacyArchives } as Partial<import('@/models/yiting').忆庭系统>),
    ),
  );
  const savedZhikuMigrationAt = await loadSetting<number>(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY);
  const zhikuMigrationAt = savedZhikuMigrationAt ?? Date.now();
  if (!savedZhikuMigrationAt) {
    await saveSetting(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY, zhikuMigrationAt);
  }
  const nextZhiku = mergeBundledZhikuSystem(await loadAllBundledZhikuPresets(), save.智库, zhikuMigrationAt);
  state.set智库(nextZhiku);
  await saveSetting('zhikuSystem', buildPersistedZhikuSystem(nextZhiku));
  state.set手机(归一化手机系统(save.手机));
  state.setNPC(归一化NPC记录列表(save.NPC));   // 旧存档/AI 半成品对象统一兜底
  const nextAlbum = materializeAlbumRuntimePayload(归一化相册系统(save.相册));
  state.set相册(nextAlbum);
  pruneAlbumAssetCache(nextAlbum.assets.map((asset) => asset.id));
  state.set新闻(归一化新闻列表(save.新闻));                     // 旧存档没有该字段，兜底空数组
  state.set剧情(save.剧情 ?? []);           // 旧存档没有该字段，兜底空数组
  const normalizedStoryWeaving = alignStoryWeavingToOpeningArchive(
    归一化剧情编织系统(save.剧情编织),
    safeWorld.开局档案,
  );
  const recentUser = [...safeChatHistory].reverse().find((message) => message.role === 'user');
  const recentAssistant = [...safeChatHistory].reverse().find((message) => message.role === 'assistant');
  const storyRepair = autoAlignCanonStoryProgress({
    storyWeaving: normalizedStoryWeaving,
    turnCount: save.turnCount ?? (safeChatHistory.length + 1),
    userInput: recentUser?.content ?? '',
    body: recentAssistant?.parsedResponse?.body ?? recentAssistant?.content ?? '',
    currentLocation: safeWorld.当前地点,
  });
  const nextStoryWeaving = storyRepair.system;
  state.set剧情编织(nextStoryWeaving);
  await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving));
  state.setVariableBatches(compactVariableBatchHistory(save.variableBatches ?? []));
  state.setQueueTasks(save.queueTasks ?? []); // 旧存档没有该字段，兜底空数组
  // 兼容旧存档：promptModules 是后加的（需补齐 builtin + 迁移 customPrompt）。
  // API 配置属于本机设置，不跟随存档读取；否则旧档/导入档会把当前可用 API 覆盖成空值。
  const defaults = 创建默认游戏设置();
  const nextGameSettingsFromSave: 游戏设置 = {
    ...defaults,
    ...safeGameSettings,
    新闻系统: 归一化星际和平周报设置(safeGameSettings.新闻系统),
    手机系统: 归一化手机系统设置(safeGameSettings.手机系统),
    智库系统: 归一化智库系统设置(safeGameSettings.智库系统),
    剧情编织系统: 归一化剧情编织系统设置(safeGameSettings.剧情编织系统),
    文生图系统: 归一化文生图系统设置(safeGameSettings.文生图系统),
    记忆系统: 归一化记忆系统设置(safeGameSettings.记忆系统),
    额外功能: 归一化额外功能设置(safeGameSettings.额外功能),
    backgroundTaskMode: safeGameSettings.backgroundTaskMode,
    enableMaleNsfwArchive: safeGameSettings.enableMaleNsfwArchive,
    visualTextSettings: 归一化视觉文本设置(safeGameSettings.visualTextSettings),
    promptModules: migratePromptModules(safeGameSettings),
    // 方案 A 三层 order 区间迁移：预设库里的 ST 模块也要 +50 偏移
    stPresets: migrateStPresetOrders(safeGameSettings.stPresets),
    promptModuleOrderVersion: 1,
  };
  state.setGameSettings(preserveLocalApiGameSettings(nextGameSettingsFromSave, state.gameSettings));
  state.setHasSave(true);
  state.setView('game');
  state.setTurnCount(save.turnCount ?? (safeChatHistory.length + 1));
}

function normalizeSaveChatHistory(value: unknown): 聊天消息[] {
  return Array.isArray(value) ? (value as 聊天消息[]) : [];
}

function normalizeSavedTraveler(value: unknown, awakenedAt = ''): 角色数据结构 {
  const base = 创建空角色();
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<角色数据结构>
    : {};
  return 确保命途列表({
    ...base,
    ...raw,
    姓名: typeof raw.姓名 === 'string' ? raw.姓名 : base.姓名,
    别名: typeof raw.别名 === 'string' ? raw.别名 : base.别名,
    性别: typeof raw.性别 === 'string' ? raw.性别 : base.性别,
    年龄: Number.isFinite(Number(raw.年龄)) ? Number(raw.年龄) : base.年龄,
    专长知识: Array.isArray(raw.专长知识) ? raw.专长知识.filter((item): item is string => typeof item === 'string') : base.专长知识,
    图像档案: raw.图像档案 && typeof raw.图像档案 === 'object' ? raw.图像档案 : base.图像档案,
    属性: raw.属性 ?? base.属性,
    命途列表: Array.isArray(raw.命途列表) ? raw.命途列表 : base.命途列表,
    能力: Array.isArray(raw.能力) ? raw.能力.filter((item): item is string => typeof item === 'string') : base.能力,
    背包: Array.isArray(raw.背包) ? raw.背包 : base.背包,
    战技列表: Array.isArray(raw.战技列表) ? raw.战技列表 : base.战技列表,
  }, awakenedAt);
}

function normalizeSavedGameSettings(value: unknown): 游戏设置 {
  const defaults = 创建默认游戏设置();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  return {
    ...defaults,
    ...(value as Partial<游戏设置>),
  };
}
