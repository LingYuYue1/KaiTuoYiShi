import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { 存档数据, 存档类型 } from '@/models/settings';
import type { 聊天消息 } from '@/models/chat';
import { 创建空角色, 确保命途列表 } from '@/models/character';
import type { 角色数据结构 } from '@/models/character';
import {
  迁移存档运行态键,
} from '@/models/settings';
import { loadLatestSave, loadSave, loadSaveIdByNodeId, loadNewestStory, loadActiveLeaf, isActiveLeafWritable, isUnsealedHeadSave, deleteSave as dbDeleteSave, getSaveTreeNodeSubtree, deleteSaveTreeNode, saveNewestStory, createLeafNode, saveSetting, forkSaveTreeLeaf, adoptUnsealedChildLeaf } from '@/services/dbService';
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
import { 指向NewestStory记录, type NewestStory记录 } from '@/models/newestStory';
import { devLog, devLogError } from '@/utils/devLog';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { TURN_STATUS_IDLE } from './turnStatus';

let activeSaveTreeMeta: 存档树元信息 | null = null;

export function clearActiveSaveTreeMetaIfMatches(
  target: { rootId?: string; nodeId?: string } | null,
  state: UseGameStateReturn,
): void {
  if (!target?.rootId && !target?.nodeId) {
    if (activeSaveTreeMeta !== null) {
      activeSaveTreeMeta = null;
      state.setActiveTreeMeta(null);
    }
    return;
  }
  if (
    activeSaveTreeMeta
    && (
      (target.rootId && activeSaveTreeMeta.rootId === target.rootId)
      || (target.nodeId && activeSaveTreeMeta.nodeId === target.nodeId)
    )
  ) {
    activeSaveTreeMeta = null;
    state.setActiveTreeMeta(null);
  }
}

// 统一构造存档负载：queueTasks 属主是可写叶子、检查点必须剥离，避免新增字段遗漏重建路径并防止队列泄漏到检查点。
export function buildSavePayload(
  state: UseGameStateReturn,
  type: 存档类型,
  overrides?: Partial<Pick<存档数据, 'turnCount' | 'chatHistory' | '记忆' | '忆庭' | '智库' | '手机' | '世界' | '旅人' | 'NPC' | '相册' | '新闻' | '剧情' | '剧情编织' | 'variableBatches'>>,
  nodeId?: string,
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
    // 重建根叶子时把当前队列状态一并落盘（reviewer P1-1：整树删除后重建不丢 queueTasks）。
    queueTasks: state.queueTasks,
    // 片 5a-2 D3：存档内 gameSettings 为纯 Device/Content（两运行态键迁顶层），
    // 与 saveSetting 单点剥离 + commitTurn 组装保持一致，避免读侧迁移取到陈旧副本。
    // 片 5a-2 D3：两运行态键迁至存档顶层，随叶子/检查点落盘。
    macroGlobalVars: state.macroGlobalVars,
    worldbookTriggerStates: state.worldbookTriggerStates,
    pendingOpeningTrigger: state.pendingOpeningTrigger ?? null,
  };
  const parentSave = activeSaveTreeMeta
    ? ({ id: 0, type, timestamp, 旅人: baseSave.旅人, 世界: baseSave.世界, chatHistory: [], 记忆: baseSave.记忆, saveTree: activeSaveTreeMeta } as unknown as 存档数据)
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

export function commitActiveSaveTreeMeta(save: 存档数据, state: UseGameStateReturn): void {
  activeSaveTreeMeta = getSaveTreeMeta(save);
  state.setActiveTreeMeta(activeSaveTreeMeta);
}

/**
 * 片 5e（D4）运行时断言兜底：检查点写入前核验载荷不携带 queueTasks。
 * queueTasks 仅限叶子（工作区）合法字段，不得进入检查点（saves 表）。
 * 本断言是最后防线——若未来组装路径漏剥，这里宁可让本次写入失败，也不让脏字段落盘。
 * 调用点：commitTurn / 初始化新局checkpoint 写入之前。
 */
export function assertCheckpointPayloadNoQueueTasks(payload: 存档数据, label: string): void {
  const value = (payload as { queueTasks?: unknown }).queueTasks;
  if (value === undefined) return;
  devLogError('save', 'checkpoint-queueTasks-guard', `[D4] queueTasks 泄漏进检查点载荷（${label}），封版写入中止`, {
    label,
    queueTasksCount: Array.isArray(value) ? value.length : 'non-array',
  });
  throw new Error(`[D4] queueTasks 不得进入检查点载荷：${label}`);
}

/**
 * beginSession —— D5 会话拆除的唯一入口（ideal_design.md §1.5）。
 * 中止旧控制器、清空 reroll 引用、放弃中断工作流与恢复日志、
 * 清空全部工作流 UI 投影（loading / 状态条 / 召回摘要 / 待结算）。
 * 只清理 C 类瞬时态与资源，不触碰 A 类领域切片，不产生存储副作用。
 */
export async function beginSession(state: UseGameStateReturn): Promise<void> {
  const aw = state.activeWorkflow;
  aw.abortControllerRef.current?.abort();
  aw.abortControllerRef.current = null;
  aw.rerollContextRef.current = null;
  const interrupted = aw.interruptedWorkflow;
  if (interrupted) {
    await clearWorkflowRecoveryJournal(interrupted.workflowId);
    aw.setInterruptedWorkflow(null);
    devLog('recover', 'session-begin-abandon-interrupted', { workflowId: interrupted.workflowId });
  }
  aw.setLoading(false);
  aw.setTurnStatus(TURN_STATUS_IDLE);
  aw.setPendingVariable(false);
  aw.setLiveRecallSummary('');
  aw.setLiveRecallFullContent('');
  setStreamingMessage('');
  devLog('recover', 'begin-session-teardown', {
    abandonedInterrupted: Boolean(interrupted),
  });
}

export async function enterSession(
  state: UseGameStateReturn,
  save: 存档数据,
): Promise<void> {
  await beginSession(state);
  // 读取当前工作区叶子时只水合，避免叶子增殖和指针写入；读取检查点时才创建分叉叶子。
  const treeMeta = (save as { saveTree?: 存档树元信息 | null }).saveTree;
  const rootId = treeMeta?.rootId ?? null;
  const targetNodeId = treeMeta?.nodeId ?? null;
  const newest = await loadNewestStory();
  if (rootId && targetNodeId && isUnsealedHeadSave(save)) {
    if (newest.headNodeId !== targetNodeId) {
      await saveNewestStory(指向NewestStory记录(newest, targetNodeId));
    }
    await applySaveToState(save, state);
    devLog('save', 'tree-hydrate-leaf', {
      saveId: save.id,
      rootId,
      headNodeId: targetNodeId,
      isCurrentHead: newest.headNodeId === targetNodeId,
    });
  } else if (rootId && targetNodeId) {
    const fork = await forkSaveTreeLeaf({
      rootId,
      targetNodeId,
    });
    // 修复：读检查点 = 分叉新叶子后，用新叶子水合而非原检查点存档。
    // applySaveToState 会把 activeSaveTreeMeta 指向新叶子（含父检查点 parentNodeId），
    // canRerollWithTree 才判定为可回退；用原检查点水合（尤其根节点无 parentNodeId）
    // 会让 activeSaveTreeMeta 停留在检查点上，UI 误判为不可 reroll。
    // 与 handleReroll 的分叉水合路径保持一致（fork → 按 headNodeId 读新叶子 → 水合）。
    const newLeafSaveId = fork.headNodeId ? await loadSaveIdByNodeId(fork.headNodeId) : null;
    const newLeaf = newLeafSaveId ? await loadSave(newLeafSaveId) : null;
    if (!newLeaf) {
      devLogError('save', 'tree-fork-hydrate-leaf-missing', new Error(`分叉叶子数据缺失：${fork.headNodeId ?? 'unknown'}`));
      throw new Error('分叉叶子数据缺失，读档失败，请重试。');
    }
    await applySaveToState(newLeaf, state);
    devLog('save', 'tree-fork-read', {
      saveId: newLeaf.id,
      rootId,
      targetNodeId,
      headNodeId: fork.headNodeId,
    });
  } else {
    await applySaveToState(save, state);
  }
  state.setPendingOpeningTrigger(null);
  // D5：会话身份单调递增，App 据此 key 重挂载 InputArea（会话本地状态归零）
  const nextEpoch = state.activeWorkflow.sessionEpoch + 1;
  state.activeWorkflow.setSessionEpoch(nextEpoch);
  devLog('recover', 'session-epoch-increment', { epoch: nextEpoch, entry: 'enter-session' });
}

export async function handleLoadLatest(
  state: UseGameStateReturn,
): Promise<boolean> {
  const save = await loadLatestSave();
  if (!save) return false;
  await enterSession(state, save);
  return true;
}

/**
 * 读档内部共用入口：按 ID 读取存档后进入会话。
 * enterSession 已按节点类型分派：叶子 = 水合；检查点 = forkSaveTreeLeaf 分叉；
 * 无树元信息（legacy 恢复点）= 仅水合不分支。logEvent 提供时埋诊断点。
 */
async function loadSaveIntoSession(
  id: number,
  state: UseGameStateReturn,
  logEvent?: string,
): Promise<boolean> {
  const save = await loadSave(id);
  if (!save) return false;
  if (logEvent) devLog('save', logEvent, { id });
  await enterSession(state, save);
  return true;
}

export async function handleLoadById(
  id: number,
  state: UseGameStateReturn,
): Promise<boolean> {
  return loadSaveIntoSession(id, state);
}

/**
 * 回档（分支）入口：独立动词名，供 UI 层区分「读取」（叶子）与「分支」（检查点）。
 * 核心行为就是 enterSession——它已按节点类型正确分派：叶子（saveRuntime.unsealedHead）=
 * 直接水合；内部节点（已封版检查点）= forkSaveTreeLeaf 分叉新叶子再水合。
 * 本函数不改变该分派，只提供独立的动作入口与诊断埋点，避免面板复制分支逻辑。
 */
export async function handleBranchFromSave(
  id: number,
  state: UseGameStateReturn,
): Promise<boolean> {
  // 分支 = 获取树元信息，走 forkSaveTreeLeaf + hydrate 路径；复用 enterSession 中检查点分叉的逻辑。
  return loadSaveIntoSession(id, state, 'branch-from-save');
}

/**
 * boot 专用恢复：从 newest.headNodeId 指向的活跃叶子直接水合（读叶子 = 水合）。
 * headNodeId 为 null / 节点缺失 → 返回 false，由调用方走现有初始化逻辑。
 * expectedChildNodeId：崩溃窗口（commitTurn 封版后写指针前崩溃）恢复时，
 * 由恢复日志携带的本次提交目标子叶 nodeId 传入，多子叶歧义时按明确身份采纳。
 */
export async function bootRestoreFromNewest(
  state: UseGameStateReturn,
  expectedChildNodeId?: string | null,
): Promise<boolean> {
  try {
    const active = await loadActiveLeaf(expectedChildNodeId);
    if (active.status !== 'ok') {
      // reviewer P0-2：head 指向已封版内部节点且无明确未封版子叶可采纳（sealed-conflict）
      // 时不得把检查点当工作区水合，与无工作区一样回退到初始化/首页。
      devLog('recover', 'boot-restore-fallback', {
        reason: active.status === 'sealed-conflict'
          ? 'head-sealed-conflict'
          : (active.newest.headNodeId ? 'head-missing' : 'no-head'),
        headNodeId: active.newest.headNodeId,
      });
      return false;
    }
    const { newest, leaf } = active;

    devLog('recover', 'boot-restore-start', { headNodeId: newest.headNodeId, saveId: leaf.id });
    await applySaveToState(leaf, state, { restorePendingOpeningTrigger: true });
    devLog('recover', 'boot-restore-complete', { headNodeId: newest.headNodeId, saveId: leaf.id });
    return true;
  } catch (error) {
    state.setView('home');
    devLogError('recover', 'boot-restore-failed', error);
    return false;
  }
}

/**
 * 确保 newest 指向可写叶子（工作区）。三种情况：
 *  - head 存在且未封版 → 原样返回；
 *  - head 存在但已封版 / 节点缺失（删除重定向 / 崩溃窗口）→ 若存在已创建的未封版子叶子
 *    （commitTurn「建叶 → 封版 → 写指针」在封版后崩溃的现场）则采纳之并重定向指针；
 *    否则从该节点分叉新叶子；
 *  - head 为 null（整树删除等边界态）→ 从当前 React 状态重建根叶子。
 * 回合入口（sendWorkflow / resumeWorkflow / commitTurn）在写叶子前调用。
 */
export async function ensureHeadLeafWritable(state: UseGameStateReturn): Promise<NewestStory记录> {
  const newest = await loadNewestStory();
  if (newest.headNodeId && await isActiveLeafWritable(newest.headNodeId)) {
    return newest;
  }
  if (newest.headNodeId) {
    const saveId = await loadSaveIdByNodeId(newest.headNodeId);
    const target = saveId ? await loadSave(saveId) : null;
    const tree = (target as { saveTree?: 存档树元信息 | null } | null)?.saveTree;
    if (target && tree?.rootId && tree.nodeId) {
      // 崩溃窗口恢复（reviewer P0）：commitTurn「建叶 → 封版 → 写指针」在封版后、
      // 写指针前崩溃时，新叶子已创建但指针未更新——先尝试采纳该子叶子（保留 queueTasks），
      // 无子叶子才分叉（分叉会把 queueTasks 重置为空）。
      // 采纳身份来自恢复日志持久化的 pendingChildNodeId：多子叶歧义时按明确身份恢复，
      // 不按保存 ID 猜测（子任务 A / 片 5f）。
      const expectedChildNodeId = state.activeWorkflow.interruptedWorkflow?.pendingChildNodeId ?? null;
      const adopted = await adoptUnsealedChildLeaf(tree.nodeId, expectedChildNodeId);
      if (adopted) {
        devLog('recover', 'head-leaf-adopted-child', {
          fromNodeId: newest.headNodeId,
          childNodeId: adopted.headNodeId,
        });
        return adopted;
      }
      await forkSaveTreeLeaf({ rootId: tree.rootId, targetNodeId: tree.nodeId });
      devLog('recover', 'head-leaf-forked', { fromNodeId: newest.headNodeId });
      return loadNewestStory();
    }
  }
  // 无工作区：从当前状态重建根叶子（整树删除后继续游玩）。
  const payload = buildSavePayload(state, 'auto');
  const tree = getSaveTreeMeta(payload);
  await createLeafNode(payload);
  // 响应式联动：重建出的根叶子（无父节点）即新的活跃工作区，元信息同步进 state。
  activeSaveTreeMeta = tree;
  state.setActiveTreeMeta(tree);
  const next = 指向NewestStory记录(newest, tree.nodeId);
  await saveNewestStory(next);
  devLog('recover', 'head-leaf-rebuilt', { headNodeId: tree.nodeId });
  return next;
}

export async function handleDeleteSave(id: number, state: UseGameStateReturn): Promise<void> {
  const save = await loadSave(id);
  // 过渡期遗留的按 id 单条删除入口，目前无调用方（5d-1b 编辑目标 #5 标记保留）。
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- 无树/过渡期路径，树内删除走 deleteSaveTreeNode
  await dbDeleteSave(id);
  clearActiveSaveTreeMetaIfMatches((save as { saveTree?: 存档树元信息 } | null)?.saveTree ?? null, state);
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
export async function delete存档目标(id: number, target: 存档删除目标, state: UseGameStateReturn): Promise<void> {
  if (target.tree) {
    await deleteSaveTreeNode(target.tree);
    clearActiveSaveTreeMetaIfMatches(target.tree, state);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- 无树 legacy 恢复点，见 5d-1b 编辑目标 #2
    await dbDeleteSave(id);
    clearActiveSaveTreeMetaIfMatches(null, state);
  }
}

export async function applySaveToState(
  save: 存档数据,
  state: UseGameStateReturn,
  opts: { restorePendingOpeningTrigger?: boolean } = {},
): Promise<void> {
  const { restorePendingOpeningTrigger = false } = opts;
  state.activeWorkflow.setLoading(false);
  setStreamingMessage('');
  state.activeWorkflow.setPendingVariable(false);
  state.activeWorkflow.setTurnStatus(TURN_STATUS_IDLE);
  state.activeWorkflow.setLiveRecallSummary('');
  state.activeWorkflow.setLiveRecallFullContent('');
  // 片 5a-2 D3 读取侧迁移：旧档 gameSettings 仍含两运行态键时迁至存档顶层并置空原键；
  // 迁出值只进入当前设备状态的兼容投影，不让存档设置覆盖 DeviceSettings。
  const { save: 迁移后存档, macroGlobalVars, worldbookTriggerStates } = 迁移存档运行态键(save);
  // 响应式联动：读档 = 树操作「读叶子 = 水合 / 读检查点 = 分叉新叶子」，活跃叶子元信息同步进
  // useGameState.activeTreeMeta，canRerollWithTree 依赖它而非模块级缓存。
  activeSaveTreeMeta = getSaveTreeMeta(迁移后存档);
  state.setActiveTreeMeta(activeSaveTreeMeta);
  const safeChatHistory = compactChatHistoryForLongSession(normalizeSaveChatHistory(迁移后存档.chatHistory));
  const safeWorld = 归一化世界状态(迁移后存档.世界);
  const safeTraveler = normalizeSavedTraveler(迁移后存档.旅人, safeWorld.当前日期);

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
  // DeviceSettings is owned by the current device. A save may carry legacy
  // settings for migration, but loading a session must never replace them.
  state.setMacroGlobalVars(macroGlobalVars);
  state.setWorldbookTriggerStates(worldbookTriggerStates);
  // 片 5a-2：pendingOpeningTrigger 顶层字段恢复到 state（E-1 起随 checkpoint 落盘）
  if (restorePendingOpeningTrigger) {
    state.setPendingOpeningTrigger(迁移后存档.pendingOpeningTrigger ?? null);
  }
  state.setHasSave(true);
  state.setView('game');
  state.setTurnCount(迁移后存档.turnCount ?? (safeChatHistory.length + 1));
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
