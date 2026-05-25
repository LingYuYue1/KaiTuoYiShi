import type { UseGameStateReturn } from '@/hooks/useGameState';
import { migratePromptModules } from '@/hooks/useGameState';
import type { 存档数据 } from '@/models/settings';
import {
  创建默认游戏设置,
  创建默认记忆系统设置,
  创建默认智库系统设置,
  创建默认手机系统设置,
  归一化文生图系统设置,
  归一化剧情编织系统设置,
  归一化记忆系统设置,
  归一化星际和平周报设置,
  归一化智库系统设置,
  归一化手机系统设置,
} from '@/models/settings';
import { loadLatestSave, loadSave, deleteSave as dbDeleteSave, saveGame } from '@/services/dbService';
import { normalizeMemorySystem } from './memoryUtils';
import { 归一化世界状态 } from '@/models/world';
import { 归一化忆庭系统 } from '@/models/yiting';
import { 归一化智库系统 } from '@/models/zhiku';
import { 归一化手机系统 } from '@/models/phone';
import { 归一化NPC记录列表 } from '@/models/npc';
import { 归一化相册系统 } from '@/models/imageGeneration';
import { 归一化新闻列表 } from '@/models/news';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';

// 共享的存档负载构造函数：手动 / 自动两条路径都走这一处，未来加字段只改一处。
// overrides 用于 sendWorkflow 里那一刻 React state 还没回写、但已有新值的字段
// （比如刚追加的 chatHistory、压缩过的 memorySystem）。
export function buildSavePayload(
  state: UseGameStateReturn,
  type: 'manual' | 'auto',
  overrides?: Partial<Pick<存档数据, 'chatHistory' | '记忆' | '忆庭' | '智库' | '手机' | '世界' | '旅人' | 'NPC' | '相册' | '新闻' | '剧情' | '剧情编织' | 'variableBatches' | 'queueTasks'>>,
): 存档数据 {
  return {
    id: 0,
    type,
    timestamp: Date.now(),
    旅人: overrides?.旅人 ?? state.旅人,
    世界: overrides?.世界 ?? state.世界,
    chatHistory: overrides?.chatHistory ?? state.chatHistory,
    记忆: overrides?.记忆 ?? state.记忆,
    忆庭: overrides?.忆庭 ?? state.忆庭,
    智库: overrides?.智库 ?? state.智库,
    手机: overrides?.手机 ?? state.手机,
    NPC: overrides?.NPC ?? state.NPC,
    相册: overrides?.相册 ?? state.相册,
    新闻: overrides?.新闻 ?? state.新闻,
    剧情: overrides?.剧情 ?? state.剧情,
    剧情编织: overrides?.剧情编织 ?? state.剧情编织,
    variableBatches: overrides?.variableBatches ?? state.variableBatches,
    queueTasks: overrides?.queueTasks ?? state.queueTasks,
    gameSettings: {
      ...state.gameSettings,
      新闻系统: 归一化星际和平周报设置(state.gameSettings.新闻系统),
      手机系统: 归一化手机系统设置(state.gameSettings.手机系统 ?? 创建默认手机系统设置()),
      智库系统: 归一化智库系统设置(state.gameSettings.智库系统),
      剧情编织系统: 归一化剧情编织系统设置(state.gameSettings.剧情编织系统),
      文生图系统: 归一化文生图系统设置(state.gameSettings.文生图系统),
      记忆系统: 归一化记忆系统设置(state.gameSettings.记忆系统 ?? 创建默认记忆系统设置()),
    },
    apiSettings: state.apiSettings,
    theme: state.currentTheme,
  };
}

export async function handleLoadLatest(
  state: UseGameStateReturn,
): Promise<boolean> {
  const save = await loadLatestSave();
  if (!save) return false;
  applySaveToState(save, state);
  return true;
}

export async function handleLoadById(
  id: number,
  state: UseGameStateReturn,
): Promise<boolean> {
  const save = await loadSave(id);
  if (!save) return false;
  applySaveToState(save, state);
  return true;
}

export function handleManualSave(state: UseGameStateReturn): Promise<number> {
  return saveGame(buildSavePayload(state, 'manual'));
}

export async function handleDeleteSave(id: number): Promise<void> {
  await dbDeleteSave(id);
}

function applySaveToState(
  save: 存档数据,
  state: UseGameStateReturn,
): void {
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
  state.set智库(归一化智库系统(save.智库 ?? state.智库));
  state.set手机(归一化手机系统(save.手机));
  state.setNPC(归一化NPC记录列表(save.NPC));   // 旧存档/AI 半成品对象统一兜底
  state.set相册(归一化相册系统(save.相册));
  state.set新闻(归一化新闻列表(save.新闻));                     // 旧存档没有该字段，兜底空数组
  state.set剧情(save.剧情 ?? []);           // 旧存档没有该字段，兜底空数组
  state.set剧情编织(归一化剧情编织系统(save.剧情编织));
  state.setVariableBatches(save.variableBatches ?? []); // 旧存档没有该字段，兜底空数组
  state.setQueueTasks(save.queueTasks ?? []); // 旧存档没有该字段，兜底空数组
  // 兼容旧存档：variableApi 字段是后加的；promptModules 是后加的（需补齐 4 条 builtin + 迁移 customPrompt）
  const defaults = 创建默认游戏设置();
  state.setGameSettings({
    ...defaults,
    ...save.gameSettings,
    新闻系统: 归一化星际和平周报设置(save.gameSettings.新闻系统),
    手机系统: 归一化手机系统设置(save.gameSettings.手机系统),
    智库系统: 归一化智库系统设置(save.gameSettings.智库系统),
    剧情编织系统: 归一化剧情编织系统设置(save.gameSettings.剧情编织系统),
    文生图系统: 归一化文生图系统设置(save.gameSettings.文生图系统),
    记忆系统: 归一化记忆系统设置(save.gameSettings.记忆系统),
    variableApi: save.gameSettings.variableApi ?? defaults.variableApi,
    enableMaleNsfwArchive: save.gameSettings.enableMaleNsfwArchive ?? defaults.enableMaleNsfwArchive,
    promptModules: migratePromptModules(save.gameSettings),
  });
  state.setApiSettings(save.apiSettings);
  state.setCurrentTheme(save.theme);
  state.setHasSave(true);
  state.setView('game');
  state.setTurnCount(save.chatHistory.length + 1);
}
