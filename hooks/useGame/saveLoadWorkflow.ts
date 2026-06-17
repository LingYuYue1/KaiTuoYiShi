import type { UseGameStateReturn } from '@/hooks/useGameState';
import { migratePromptModules } from '@/hooks/useGameState';
import type { 存档数据, 存档类型, 游戏设置 } from '@/models/settings';
import {
  创建空API设置,
  创建默认游戏设置,
  创建默认记忆系统设置,
  创建默认手机系统设置,
  归一化文生图系统设置,
  归一化剧情编织系统设置,
  归一化记忆系统设置,
  归一化星际和平周报设置,
  归一化智库系统设置,
  归一化手机系统设置,
  归一化额外功能设置,
} from '@/models/settings';
import { loadLatestSave, loadSave, deleteSave as dbDeleteSave, saveGame, saveSetting } from '@/services/dbService';
import {
  buildPersistedZhikuSystem,
  loadAllBundledZhikuPresets,
  mergeBundledZhikuSystem,
  ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY,
} from '@/data/zhikuPreset';
import { loadSetting } from '@/services/dbService';
import { normalizeMemorySystem } from './memoryUtils';
import { 归一化世界状态 } from '@/models/world';
import { 归一化忆庭系统 } from '@/models/yiting';
import { 归一化手机系统 } from '@/models/phone';
import { 归一化NPC记录列表 } from '@/models/npc';
import { 归一化相册系统 } from '@/models/imageGeneration';
import { 归一化新闻列表 } from '@/models/news';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import { autoAlignCanonStoryProgress } from '@/services/storyProgressService';

// 共享的存档负载构造函数：手动 / 自动两条路径都走这一处，未来加字段只改一处。
// overrides 用于 sendWorkflow 里那一刻 React state 还没回写、但已有新值的字段
// （比如刚追加的 chatHistory、压缩过的 memorySystem）。
export function buildSavePayload(
  state: UseGameStateReturn,
  type: 存档类型,
  overrides?: Partial<Pick<存档数据, 'turnCount' | 'chatHistory' | '记忆' | '忆庭' | '智库' | '手机' | '世界' | '旅人' | 'NPC' | '相册' | '新闻' | '剧情' | '剧情编织' | 'variableBatches' | 'queueTasks'>>,
): 存档数据 {
  const persistedChatHistory = stripRuntimeOnlyFieldsFromChatHistory(overrides?.chatHistory ?? state.chatHistory);
  return {
    id: 0,
    type,
    timestamp: Date.now(),
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
    variableBatches: overrides?.variableBatches ?? state.variableBatches,
    queueTasks: overrides?.queueTasks ?? state.queueTasks,
    gameSettings: buildSaveGameSettingsSnapshot({
      ...state.gameSettings,
      新闻系统: 归一化星际和平周报设置(state.gameSettings.新闻系统),
      手机系统: 归一化手机系统设置(state.gameSettings.手机系统 ?? 创建默认手机系统设置()),
      智库系统: 归一化智库系统设置(state.gameSettings.智库系统),
      剧情编织系统: 归一化剧情编织系统设置(state.gameSettings.剧情编织系统),
      文生图系统: 归一化文生图系统设置(state.gameSettings.文生图系统),
      记忆系统: 归一化记忆系统设置(state.gameSettings.记忆系统 ?? 创建默认记忆系统设置()),
      额外功能: 归一化额外功能设置(state.gameSettings.额外功能),
    }),
    apiSettings: 创建空API设置(),
    theme: state.currentTheme,
  };
}

function stripRuntimeOnlyFieldsFromChatHistory(chatHistory: 存档数据['chatHistory']): 存档数据['chatHistory'] {
  if (!Array.isArray(chatHistory)) return [];
  return chatHistory.map((message) => {
    const clean = { ...message } as typeof message & {
      debugContext?: unknown;
    };
    delete clean.debugContext;
    return clean;
  });
}

function buildSaveGameSettingsSnapshot(settings: 游戏设置): 游戏设置 {
  const defaults = 创建默认游戏设置();
  return {
    ...settings,
    enableClaudeMode: defaults.enableClaudeMode,
    deepSeekMainMode: defaults.deepSeekMainMode,
    backgroundTaskMode: settings.backgroundTaskMode ?? defaults.backgroundTaskMode,
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
    手机系统: 归一化手机系统设置(localSettings.手机系统 ?? 创建默认手机系统设置()),
    智库系统: 归一化智库系统设置(localSettings.智库系统),
    剧情编织系统: 归一化剧情编织系统设置(localSettings.剧情编织系统),
    文生图系统: 归一化文生图系统设置(localSettings.文生图系统),
    记忆系统: 归一化记忆系统设置(localSettings.记忆系统 ?? 创建默认记忆系统设置()),
  };

  return {
    ...nextFromSave,
    enableClaudeMode: localSettings.enableClaudeMode === true,
    deepSeekMainMode: localSettings.deepSeekMainMode ?? 创建默认游戏设置().deepSeekMainMode,
    backgroundTaskMode: localSettings.backgroundTaskMode ?? 创建默认游戏设置().backgroundTaskMode,
    enableCacheDiagnostics: localSettings.enableCacheDiagnostics ?? 创建默认游戏设置().enableCacheDiagnostics,
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
  await saveLoadBackupIfNeeded(state);
  await applySaveToState(save, state);
  return true;
}

export async function handleLoadById(
  id: number,
  state: UseGameStateReturn,
): Promise<boolean> {
  const save = await loadSave(id);
  if (!save) return false;
  await saveLoadBackupIfNeeded(state);
  await applySaveToState(save, state);
  return true;
}

export function handleManualSave(state: UseGameStateReturn): Promise<number> {
  return saveGame(buildSavePayload(state, 'manual'));
}

export async function handleDeleteSave(id: number): Promise<void> {
  await dbDeleteSave(id);
}

async function saveLoadBackupIfNeeded(state: UseGameStateReturn): Promise<void> {
  const hasProgress =
    state.chatHistory.length > 0 ||
    state.turnCount > 1 ||
    Boolean(state.旅人.姓名?.trim()) ||
    Boolean(state.世界.当前地点?.trim());
  if (!hasProgress) return;
  await saveGame(buildSavePayload(state, 'backup'));
  state.setHasSave(true);
}

async function applySaveToState(
  save: 存档数据,
  state: UseGameStateReturn,
): Promise<void> {
  state.set旅人(save.旅人);
  state.set世界(归一化世界状态(save.世界));
  state.setChatHistory(save.chatHistory);
  state.set记忆(normalizeMemorySystem(save.记忆));   // 老存档缺 longTermMemories 时兜底
  const legacyArchives = (save.记忆 as unknown as { 回忆档案?: unknown[] })?.回忆档案 ?? [];
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
  state.set相册(归一化相册系统(save.相册));
  state.set新闻(归一化新闻列表(save.新闻));                     // 旧存档没有该字段，兜底空数组
  state.set剧情(save.剧情 ?? []);           // 旧存档没有该字段，兜底空数组
  const normalizedStoryWeaving = 归一化剧情编织系统(save.剧情编织);
  const recentUser = [...(save.chatHistory ?? [])].reverse().find((message) => message.role === 'user');
  const recentAssistant = [...(save.chatHistory ?? [])].reverse().find((message) => message.role === 'assistant');
  const storyRepair = autoAlignCanonStoryProgress({
    storyWeaving: normalizedStoryWeaving,
    turnCount: save.turnCount ?? (save.chatHistory.length + 1),
    userInput: recentUser?.content ?? '',
    body: recentAssistant?.parsedResponse?.body ?? recentAssistant?.content ?? '',
    currentLocation: save.世界?.当前地点,
  });
  const nextStoryWeaving = storyRepair.system;
  state.set剧情编织(nextStoryWeaving);
  await saveSetting('storyWeavingSystem', nextStoryWeaving);
  state.setVariableBatches(save.variableBatches ?? []); // 旧存档没有该字段，兜底空数组
  state.setQueueTasks(save.queueTasks ?? []); // 旧存档没有该字段，兜底空数组
  // 兼容旧存档：promptModules 是后加的（需补齐 builtin + 迁移 customPrompt）。
  // API 配置属于本机设置，不跟随存档读取；否则旧档/导入档会把当前可用 API 覆盖成空值。
  const defaults = 创建默认游戏设置();
  const nextGameSettingsFromSave: 游戏设置 = {
    ...defaults,
    ...save.gameSettings,
    新闻系统: 归一化星际和平周报设置(save.gameSettings.新闻系统),
    手机系统: 归一化手机系统设置(save.gameSettings.手机系统),
    智库系统: 归一化智库系统设置(save.gameSettings.智库系统),
    剧情编织系统: 归一化剧情编织系统设置(save.gameSettings.剧情编织系统),
    文生图系统: 归一化文生图系统设置(save.gameSettings.文生图系统),
    记忆系统: 归一化记忆系统设置(save.gameSettings.记忆系统),
    额外功能: 归一化额外功能设置(save.gameSettings.额外功能),
    backgroundTaskMode: save.gameSettings.backgroundTaskMode ?? defaults.backgroundTaskMode,
    enableMaleNsfwArchive: save.gameSettings.enableMaleNsfwArchive ?? defaults.enableMaleNsfwArchive,
    promptModules: migratePromptModules(save.gameSettings),
  };
  state.setGameSettings(preserveLocalApiGameSettings(nextGameSettingsFromSave, state.gameSettings));
  state.setHasSave(true);
  state.setView('game');
  state.setTurnCount(save.turnCount ?? (save.chatHistory.length + 1));
}
