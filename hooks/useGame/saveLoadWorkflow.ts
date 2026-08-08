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
  迁移存档运行态键,
  取游戏设置运行态键,
} from '@/models/settings';
import { loadLatestSave, loadSave, loadNewestStory, deleteSave as dbDeleteSave, getSaveTreeNodeSubtree, deleteSaveTreeNode, saveGame, saveNewestStory, saveSetting, forkSaveTreeLeaf } from '@/services/dbService';
import {
  buildPersistedZhikuSystem,
  loadAllBundledZhikuPresets,
  mergeBundledZhikuSystem,
  ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY,
} from '@/data/zhikuPreset';
import { loadSetting } from '@/services/dbService';
import { clearWorkflowRecoveryJournal } from '@/services/workflowRecovery';
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
import { 创建空NewestStory记录, 清空NewestStory记录 } from '@/models/newestStory';
import { devLog, devLogError } from '@/utils/devLog';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { TURN_STATUS_IDLE } from './turnStatus';

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
  nodeId?: string,
): 存档数据 {
  const persistedChatHistory = compactChatHistoryForLongSession(
    overrides?.chatHistory ?? state.chatHistory,
  );
  const timestamp = Date.now();
  const 运行态键 = 取游戏设置运行态键(state.gameSettings);
  const snapshotSettings = buildSaveGameSettingsSnapshot(state.gameSettings);
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
    // 片 5a-2 D3：存档内 gameSettings 为纯 Device/Content（两运行态键迁顶层），
    // 与 saveSetting 单点剥离 + commitTurn 组装保持一致，避免读侧迁移取到陈旧副本。
    gameSettings: snapshotSettings,
    // 片 5a-2 D3：两运行态键迁至存档顶层，随手动存档落盘。
    macroGlobalVars: 运行态键.macroGlobalVars,
    worldbookTriggerStates: 运行态键.worldbookTriggerStates,
    pendingOpeningTrigger: state.pendingOpeningTrigger ?? null,
    apiSettings: 创建空API设置(),
    theme: state.currentTheme,
  };
  const parentSave = activeSaveTreeMeta
    ? ({ id: 0, type, timestamp, 旅人: baseSave.旅人, 世界: baseSave.世界, chatHistory: [], 记忆: baseSave.记忆, gameSettings: baseSave.gameSettings, apiSettings: baseSave.apiSettings, theme: baseSave.theme, saveTree: activeSaveTreeMeta } as unknown as 存档数据)
    : null;
  // 片 5d-2：nodeId 仅用于物化分叉头（commitTurn 晋升采纳 newest.headNodeId）。
  // 与父节点同 id（迁移回填/已物化残留）时不采纳，回退 createId，防止节点 ID 重复。
  const parentNodeId = activeSaveTreeMeta?.nodeId ?? null;
  const effectiveNodeId = nodeId && nodeId !== parentNodeId ? nodeId : undefined;
  const withTree = attachSaveTreeMeta(baseSave as 存档数据, buildNextSaveTreeMeta({
    previous: parentSave,
    type,
    timestamp,
    ...(effectiveNodeId ? { nodeId: effectiveNodeId } : {}),
  }));
  return compactDuplicatedSaveImages(withTree);
}

export function commitActiveSaveTreeMeta(save: 存档数据): void {
  activeSaveTreeMeta = getSaveTreeMeta(save);
}

export function buildSaveGameSettingsSnapshot(settings: 游戏设置): 游戏设置 {
  const defaults = 创建默认游戏设置();
  const normalizedSettings: 游戏设置 = {
    ...settings,
    新闻系统: 归一化星际和平周报设置(settings.新闻系统),
    手机系统: 归一化手机系统设置(settings.手机系统),
    智库系统: 归一化智库系统设置(settings.智库系统),
    剧情编织系统: 归一化剧情编织系统设置(settings.剧情编织系统),
    文生图系统: 归一化文生图系统设置(settings.文生图系统),
    记忆系统: 归一化记忆系统设置(settings.记忆系统),
    额外功能: 归一化额外功能设置(settings.额外功能),
    visualTextSettings: 归一化视觉文本设置(settings.visualTextSettings),
  };
  return {
    ...normalizedSettings,
    enableClaudeMode: defaults.enableClaudeMode,
    deepSeekMainMode: defaults.deepSeekMainMode,
    backgroundTaskMode: normalizedSettings.backgroundTaskMode,
    visualTextSettings: normalizedSettings.visualTextSettings,
    enableCacheDiagnostics: defaults.enableCacheDiagnostics,
    variableApi: defaults.variableApi,
    macroGlobalVars: undefined,
    worldbookTriggerStates: undefined,
    新闻系统: {
      ...normalizedSettings.新闻系统,
      api: defaults.新闻系统.api,
    },
    手机系统: {
      ...normalizedSettings.手机系统,
      api: defaults.手机系统.api,
    },
    智库系统: {
      ...normalizedSettings.智库系统,
      api: defaults.智库系统.api,
    },
    剧情编织系统: {
      ...normalizedSettings.剧情编织系统,
      api: defaults.剧情编织系统.api,
    },
    文生图系统: {
      ...normalizedSettings.文生图系统,
      普通接口: defaults.文生图系统.普通接口,
      场景接口: defaults.文生图系统.场景接口,
      useSeparateSceneApi: defaults.文生图系统.useSeparateSceneApi,
      NSFW接口: defaults.文生图系统.NSFW接口,
      词组转化器API: defaults.文生图系统.词组转化器API,
      正文生图: {
        ...normalizedSettings.文生图系统.正文生图,
        parserApi: defaults.文生图系统.正文生图.parserApi,
        imageApi: defaults.文生图系统.正文生图.imageApi,
      },
    },
    记忆系统: {
      ...normalizedSettings.记忆系统,
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

export async function beginSession(state: UseGameStateReturn): Promise<void> {
  const abortControllerRef = state.abortControllerRef;
  abortControllerRef.current?.abort();
  abortControllerRef.current = null;
  const rerollContextRef = state.rerollContextRef;
  rerollContextRef.current = null;
  const interrupted = state.interruptedWorkflow;
  if (interrupted) {
    await clearWorkflowRecoveryJournal(interrupted.workflowId);
    state.setInterruptedWorkflow(null);
    devLog('recover', 'session-begin-abandon-interrupted', { workflowId: interrupted.workflowId });
  }
  state.setLoading(false);
  state.setTurnStatus(TURN_STATUS_IDLE);
  state.setPendingVariable(false);
  state.setLiveRecallSummary('');
  state.setLiveRecallFullContent('');
  setStreamingMessage('');
}

export async function enterSession(
  state: UseGameStateReturn,
  save: 存档数据,
): Promise<void> {
  await beginSession(state);
  // 片 5d-2 D6：读档 = 从目标检查点分叉新叶子。目标带 saveTree 时，
  // 先用 forkSaveTreeLeaf 把 newest 重定向到新叶子（base=目标、head=新 id、覆盖集清空），
  // 再用 clearNewest:false 应用存档以保留该分叉；无树 legacy 档维持原有清空路径。
  const treeMeta = (save as { saveTree?: 存档树元信息 | null }).saveTree;
  const rootId = treeMeta?.rootId ?? null;
  const targetNodeId = treeMeta?.nodeId ?? null;
  if (rootId && targetNodeId) {
    const fork = await forkSaveTreeLeaf({
      rootId,
      targetNodeId,
    });
    await applySaveToState(save, state, { clearNewest: false });
    devLog('save', 'tree-fork-read', {
      saveId: save.id,
      rootId,
      targetNodeId,
      headNodeId: fork.headNodeId,
    });
  } else {
    await applySaveToState(save, state);
  }
  state.setPendingOpeningTrigger(null);
  state.setSessionEpoch((e) => e + 1);
}

export async function handleLoadLatest(
  state: UseGameStateReturn,
): Promise<boolean> {
  const save = await loadLatestSave();
  if (!save) return false;
  await enterSession(state, save);
  return true;
}

export async function handleLoadById(
  id: number,
  state: UseGameStateReturn,
): Promise<boolean> {
  const save = await loadSave(id);
  if (!save) return false;
  await enterSession(state, save);
  return true;
}

/**
 * boot 专用恢复：先读取 newest 的原始覆盖集，再应用其 base checkpoint，最后逐字段回放。
 * applySaveToState 会清空 newest，因此回放后必须把原记录原样写回，继续保留工作区。
 */
export async function bootRestoreFromNewest(
  state: UseGameStateReturn,
): Promise<boolean> {
  let baseCheckpointId: number | null = null;
  try {
    const newest = await loadNewestStory();
    baseCheckpointId = newest.baseCheckpointId;
    if (!baseCheckpointId) {
      devLog('recover', 'boot-restore-fallback', { reason: 'no-newest' });
      return false;
    }

    devLog('recover', 'boot-restore-start', { baseCheckpointId });
    const base = await loadSave(baseCheckpointId);
    if (!base) {
      devLog('recover', 'boot-restore-fallback', { reason: 'base-missing', baseCheckpointId });
      return false;
    }

    const newestStory = newest.story;
    await applySaveToState(base, state, { clearNewest: true, restorePendingOpeningTrigger: true });
    const replayedFields = replayNewestStory(newestStory, state);
    await saveNewestStory(newest);
    devLog('recover', 'boot-restore-complete', {
      baseCheckpointId,
      fields: replayedFields,
    });
    return true;
  } catch (error) {
    state.setView('home');
    devLogError('recover', 'boot-restore-failed', error, { baseCheckpointId });
    return false;
  }
}

export async function handleManualSave(state: UseGameStateReturn): Promise<number> {
  const payload = buildSavePayload(state, 'manual');
  const id = await saveGame(payload);
  commitActiveSaveTreeMeta(payload);
  return id;
}

export async function handleDeleteSave(id: number): Promise<void> {
  const save = await loadSave(id);
  // 过渡期遗留的按 id 单条删除入口，目前无调用方（5d-1b 编辑目标 #5 标记保留）。
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- 无树/过渡期路径，树内删除走 deleteSaveTreeNode
  await dbDeleteSave(id);
  clearActiveSaveTreeMetaIfMatches((save as { saveTree?: 存档树元信息 } | null)?.saveTree);
}

/** 树感知删除目标：树内节点返回其子树存档数，legacy 无树恢复点返回 null。 */
export interface 存档删除目标 {
  tree: { rootId: string; nodeId: string } | null;
  cascadeCount: number | null;
}

export async function resolve存档删除目标(
  target?: { saveTree?: 存档树元信息 | null } | null,
): Promise<存档删除目标> {
  const treeNode = target?.saveTree;
  if (!treeNode || !treeNode.rootId || !treeNode.nodeId) {
    return { tree: null, cascadeCount: null };
  }
  const subtree = await getSaveTreeNodeSubtree(treeNode.rootId, treeNode.nodeId);
  return { tree: { rootId: treeNode.rootId, nodeId: treeNode.nodeId }, cascadeCount: subtree.length };
}

/** 执行删除：树的节点走 deleteSaveTreeNode（级联），无树 legacy 走单条删除。 */
export async function delete存档目标(id: number, target: 存档删除目标): Promise<void> {
  if (target.tree) {
    await deleteSaveTreeNode(target.tree);
    clearActiveSaveTreeMetaIfMatches(target.tree);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- 无树 legacy 恢复点，见 5d-1b 编辑目标 #2
    await dbDeleteSave(id);
    clearActiveSaveTreeMetaIfMatches(null);
  }
}

export async function applySaveToState(
  save: 存档数据,
  state: UseGameStateReturn,
  opts: { clearNewest?: boolean; restorePendingOpeningTrigger?: boolean } = {},
): Promise<void> {
  const { clearNewest = true, restorePendingOpeningTrigger = false } = opts;
  state.setLoading(false);
  setStreamingMessage('');
  state.setPendingVariable(false);
  state.setTurnStatus(TURN_STATUS_IDLE);
  state.setLiveRecallSummary('');
  state.setLiveRecallFullContent('');
  // 片 5a-2 D3 读取侧迁移：旧档 gameSettings 仍含两运行态键时迁至存档顶层并置空原键；
  // 迁出值并入内存 state.gameSettings 两键（读者保持现状）。纯函数，不回写旧档。
  const { save: 迁移后存档, macroGlobalVars, worldbookTriggerStates } = 迁移存档运行态键(save);
  activeSaveTreeMeta = getSaveTreeMeta(迁移后存档);
  const safeChatHistory = compactChatHistoryForLongSession(normalizeSaveChatHistory(迁移后存档.chatHistory));
  const safeWorld = 归一化世界状态(迁移后存档.世界);
  const safeTraveler = normalizeSavedTraveler(迁移后存档.旅人, safeWorld.当前日期);
  const safeGameSettings = normalizeSavedGameSettings(迁移后存档.gameSettings);

  state.set旅人(safeTraveler);
  state.set世界(safeWorld);
  state.setChatHistory(safeChatHistory);
  state.set记忆(normalizeMemorySystem(迁移后存档.记忆));   // 老存档缺 longTermMemories 时兜底
  const legacyArchives = (迁移后存档.记忆 as unknown as { 回忆档案?: unknown[] }).回忆档案 ?? [];
  state.set忆庭(
    归一化忆庭系统(
      迁移后存档.忆庭 ?? ({ 回忆档案: legacyArchives } as Partial<import('@/models/yiting').忆庭系统>),
    ),
  );
  const savedZhikuMigrationAt = await loadSetting<number>(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY);
  const zhikuMigrationAt = savedZhikuMigrationAt ?? Date.now();
  if (!savedZhikuMigrationAt) {
    await saveSetting(ZHIKU_CHARACTER_REBUILD_MIGRATION_KEY, zhikuMigrationAt);
  }
  const nextZhiku = mergeBundledZhikuSystem(await loadAllBundledZhikuPresets(), 迁移后存档.智库, zhikuMigrationAt);
  state.set智库(nextZhiku);
  await saveSetting('zhikuSystem', buildPersistedZhikuSystem(nextZhiku));
  state.set手机(归一化手机系统(迁移后存档.手机));
  state.setNPC(归一化NPC记录列表(迁移后存档.NPC));   // 旧存档/AI 半成品对象统一兜底
  const nextAlbum = materializeAlbumRuntimePayload(归一化相册系统(迁移后存档.相册));
  state.set相册(nextAlbum);
  pruneAlbumAssetCache(nextAlbum.assets.map((asset) => asset.id));
  state.set新闻(归一化新闻列表(迁移后存档.新闻));                     // 旧存档没有该字段，兜底空数组
  state.set剧情(迁移后存档.剧情 ?? []);           // 旧存档没有该字段，兜底空数组
  const normalizedStoryWeaving = alignStoryWeavingToOpeningArchive(
    归一化剧情编织系统(迁移后存档.剧情编织),
    safeWorld.开局档案,
  );
  const recentUser = [...safeChatHistory].reverse().find((message) => message.role === 'user');
  const recentAssistant = [...safeChatHistory].reverse().find((message) => message.role === 'assistant');
  const storyRepair = autoAlignCanonStoryProgress({
    storyWeaving: normalizedStoryWeaving,
    turnCount: 迁移后存档.turnCount ?? (safeChatHistory.length + 1),
    userInput: recentUser?.content ?? '',
    body: recentAssistant?.parsedResponse?.body ?? recentAssistant?.content ?? '',
    currentLocation: safeWorld.当前地点,
  });
  const nextStoryWeaving = storyRepair.system;
  state.set剧情编织(nextStoryWeaving);
  await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(nextStoryWeaving));
  state.setVariableBatches(compactVariableBatchHistory(迁移后存档.variableBatches ?? []));
  state.setQueueTasks(迁移后存档.queueTasks ?? []); // 旧存档没有该字段，兜底空数组
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
  state.setGameSettings({
    ...preserveLocalApiGameSettings(nextGameSettingsFromSave, state.gameSettings),
    // 片 5a-2 D3：迁出值并入内存两键（normalize 后的 safeGameSettings 已把原键置空）
    macroGlobalVars,
    worldbookTriggerStates,
  });
  // 片 5a-2：pendingOpeningTrigger 顶层字段恢复到 state（E-1 起随 checkpoint 落盘）
  if (restorePendingOpeningTrigger) {
    state.setPendingOpeningTrigger(迁移后存档.pendingOpeningTrigger ?? null);
  }
  state.setHasSave(true);
  state.setView('game');
  state.setTurnCount(迁移后存档.turnCount ?? (safeChatHistory.length + 1));
  // 片 5a-2b：读档后 newest 指向新 checkpoint——abort/崩溃残留的跨局覆盖集
  // 不得进入下一回合的 commitTurn（否则新局数据会被提交进旧局 auto 存档）。
  if (clearNewest) {
    await saveNewestStory(清空NewestStory记录(创建空NewestStory记录(), save.id));
  }
}

function replayNewestStory(
  story: Partial<import('@/models/newestStory').NewestStory字段集>,
  state: UseGameStateReturn,
): string[] {
  const replayedFields: string[] = [];
  if (story.chatHistory !== undefined) {
    state.setChatHistory(story.chatHistory);
    replayedFields.push('chatHistory');
  }
  if (story.记忆 !== undefined) {
    state.set记忆(story.记忆);
    replayedFields.push('记忆');
  }
  if (story.忆庭 !== undefined) {
    state.set忆庭(story.忆庭);
    replayedFields.push('忆庭');
  }
  if (story.智库 !== undefined) {
    state.set智库(story.智库);
    replayedFields.push('智库');
  }
  if (story.手机 !== undefined) {
    state.set手机(story.手机);
    replayedFields.push('手机');
  }
  if (story.NPC !== undefined) {
    state.setNPC(story.NPC);
    replayedFields.push('NPC');
  }
  if (story.相册 !== undefined) {
    state.set相册(story.相册);
    replayedFields.push('相册');
  }
  if (story.新闻 !== undefined) {
    state.set新闻(story.新闻);
    replayedFields.push('新闻');
  }
  if (story.剧情 !== undefined) {
    state.set剧情(story.剧情);
    replayedFields.push('剧情');
  }
  if (story.剧情编织 !== undefined) {
    state.set剧情编织(story.剧情编织);
    replayedFields.push('剧情编织');
  }
  if (story.variableBatches !== undefined) {
    state.setVariableBatches(story.variableBatches);
    replayedFields.push('variableBatches');
  }
  if (story.queueTasks !== undefined) {
    state.setQueueTasks(story.queueTasks);
    replayedFields.push('queueTasks');
  }
  if (story.turnCount !== undefined) {
    state.setTurnCount(story.turnCount);
    replayedFields.push('turnCount');
  }
  if (story.世界 !== undefined) {
    state.set世界(story.世界);
    replayedFields.push('世界');
  }
  if (story.旅人 !== undefined) {
    state.set旅人(story.旅人);
    replayedFields.push('旅人');
  }
  if (story.macroGlobalVars !== undefined || story.worldbookTriggerStates !== undefined) {
    state.setGameSettings((previous) => ({
      ...previous,
      ...(story.macroGlobalVars !== undefined ? { macroGlobalVars: story.macroGlobalVars } : {}),
      ...(story.worldbookTriggerStates !== undefined
        ? { worldbookTriggerStates: story.worldbookTriggerStates }
        : {}),
    }));
    if (story.macroGlobalVars !== undefined) replayedFields.push('macroGlobalVars');
    if (story.worldbookTriggerStates !== undefined) replayedFields.push('worldbookTriggerStates');
  }
  if (story.pendingOpeningTrigger !== undefined) {
    state.setPendingOpeningTrigger(story.pendingOpeningTrigger);
    replayedFields.push('pendingOpeningTrigger');
  }
  return replayedFields;
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
