import type { 存档数据 } from '@/models/settings';
import { 归一化NewestStory记录, NEWEST_STORY_STORE_KEY, 创建空NewestStory记录, 指向NewestStory记录, type NewestStory记录 } from '@/models/newestStory';
import type { 存档树元信息 } from '@/utils/saveTree';
import { createUnifiedId } from '@/utils/id';
import { devLog, devLogError } from '@/utils/devLog';
import type { SaveCatalogSnapshot, SaveListItemSummary } from '@/contracts/storage';
import { buildSaveSummary, isUnsealedHeadSave, type SaveWithTree, type StoredSaveMeta } from './saveSummary';
import { loadRawSave, restoreDeltaSaveIfNeeded } from './saveRecord';
import { deleteManagedSaveItems, getSaveCatalogSnapshot, loadSave, loadSaveIdByNodeId, saveGame } from './saveCrud';
import { createCatalogRecordFromSummary } from '@/services/storage/saveCatalog';
import { runWithSaveMutationPriority } from '@/services/storage/saveCatalogRepair';
import { openDB, SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE, NEWEST_STORY_STORE } from './dbConnection';
import { buildSaveNodeDeltaRecord, isDeltaOnlyStoredSave } from '@/utils/saveDeltaStorage';
import { stripSaveAssetPayloadForStorage } from '@/utils/saveAssetStorage';
import { toError } from '@/utils/storageUtils';

export interface LeafNodeResult {
  saveId: number;
  saveTree: 存档树元信息;
}

/**
 * 创建新叶子（工作区）节点：payload 必须是携带完整领域状态与 saveTree 的存档，
 * 本函数负责打上 unsealedHead 标记并强制全量存储（叶子行是 putHeadRow 原地写入目标）。
 */
export async function createLeafNode(payload: 存档数据): Promise<LeafNodeResult> {
  const withMarker = {
    ...payload,
    saveRuntime: { unsealedHead: true },
  } as StoredSaveMeta;
  const saveId = await saveGame(withMarker, { forceFullStore: true });
  const tree = (withMarker as SaveWithTree).saveTree;
  if (!tree?.nodeId) {
    throw new Error('创建叶子节点失败：缺少 saveTree 元信息。');
  }
  return { saveId, saveTree: tree };
}

/**
 * 封版当前叶子：把叶子行就地转为不可变检查点（同 nodeId 身份转变），
 * 剥离 queueTasks、移除 unsealedHead 标记，刷新时间戳、目录摘要与 delta 记录。
 * 叶子已封版（幂等重放 / 崩溃窗口）时直接跳过并埋点。
 * sealedPayload 必须是 loadSave 恢复出的完整状态（含叶子原 saveTree / id）。
 */
export async function sealLeafRow(sealedPayload: 存档数据): Promise<void> {
  const saveId = sealedPayload.id;
  const db = await openDB();
  const raw = await loadRawSave(db, saveId);
  if (!raw) {
    throw new Error(`封版叶子失败：叶子行不存在（saveId=${saveId}）。`);
  }
  if (!isUnsealedHeadSave(raw)) {
    devLog('save', 'seal-leaf-skipped-already-sealed', { saveId });
    return;
  }
  const { queueTasks: _queueTasks, saveStorage: _storage, ...sealedFields } = sealedPayload as 存档数据 & {
    saveStorage?: unknown;
  };
  void _queueTasks;
  void _storage;
  const sealedStored = stripSaveAssetPayloadForStorage({
    ...sealedFields,
    id: saveId,
    saveRuntime: undefined,
  });
  // reviewer P0-1：封版复核移入同一 readwrite 事务内完成——IndexedDB 对同一 store
  // 的写事务串行化，事务内再次确认行仍未封版后才写入，杜绝「事务外预检通过、
  // 事务内写入」的 TOCTOU 窗口覆盖已不可变检查点。
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    let skipped = false;
    const readRequest = saveStore.get(saveId);
    readRequest.onsuccess = () => {
      const current = readRequest.result as StoredSaveMeta | undefined;
      if (!current) {
        reject(new Error(`封版叶子失败：叶子行不存在（saveId=${saveId}）。`));
        return;
      }
      if (!isUnsealedHeadSave(current)) {
        skipped = true;
        devLog('save', 'seal-leaf-skipped-already-sealed', { saveId });
        resolve();
        return;
      }
      saveStore.put(sealedStored);
      summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(sealedStored)));
      const delta = buildSaveNodeDeltaRecord(sealedStored, saveId);
      if (delta) deltaStore.put(delta);
    };
    readRequest.onerror = () => reject(toError(readRequest.error));
    tx.oncomplete = () => {
      if (!skipped) {
        devLog('save', 'seal-leaf', { saveId, nodeId: (sealedStored as SaveWithTree).saveTree?.nodeId ?? null });
      }
      resolve();
    };
    tx.onerror = () => reject(toError(tx.error));
    tx.onabort = () => reject(tx.error ?? new Error('封版叶子事务已中止。'));
  });
}

/**
 * 崩溃窗口恢复（reviewer P0）：提交协议「建叶 → 封版 → 写指针」若在「封版」后、
 * 「写指针」前崩溃，newest 仍指向已封版节点，但其未封版子叶子已创建（携带 queueTasks）。
 * 找出该子叶子（parentNodeId 匹配且 unsealedHead）。
 * 不假设单一线性链：读检查点分叉可让同一父节点下存在多个未封版子叶子，
 * 存在多个时按恢复日志持久化的目标 childNodeId 明确身份恢复；
 * 无法确定时报告冲突并返回 null，不再按保存 ID 猜测「最新子叶」。
 */
async function findUnsealedChildLeaf(
  parentNodeId: string,
  expectedChildNodeId?: string | null,
): Promise<SaveListItemSummary | null> {
  const snapshot = await getSaveCatalogSnapshot();
  const children = snapshot.items.filter((item) =>
    item.saveTree?.parentNodeId === parentNodeId
    && item.unsealedHead === true,
  );
  if (!children.length) return null;
  if (children.length === 1) return children[0];
  if (expectedChildNodeId) {
    const match = children.find((item) => item.saveTree?.nodeId === expectedChildNodeId);
    if (match) return match;
  }
  devLogError('save', 'recover-ambiguous-children', '同一父节点下存在多个未封版子叶子，无法按明确身份恢复，报告冲突而非猜测', {
    parentNodeId,
    expectedChildNodeId: expectedChildNodeId ?? null,
    children: children.map((item) => ({ nodeId: item.saveTree?.nodeId ?? null, saveId: item.id })),
  });
  return null;
}

/**
 * 采纳已创建的未封版子叶子并把 newest 指针重定向到它（保留 queueTasks）。
 * 用于 commitTurn 提交协议崩溃窗口恢复：head 指向已封版节点但子叶子已存在时，
 * 直接采纳而非分叉（分叉会把 queueTasks 重置为空）。无子叶子时返回 null。
 * expectedChildNodeId：恢复日志中持久化的本次提交目标子叶 nodeId，多子叶歧义时按此明确身份恢复。
 */
export async function adoptUnsealedChildLeaf(
  parentNodeId: string,
  expectedChildNodeId?: string | null,
): Promise<NewestStory记录 | null> {
  const child = await findUnsealedChildLeaf(parentNodeId, expectedChildNodeId);
  const childNodeId = child?.saveTree?.nodeId;
  if (!child || !childNodeId) return null;
  const newest = await loadNewestStory();
  const next = 指向NewestStory记录(newest, childNodeId);
  await saveNewestStory(next);
  devLog('save', 'adopt-orphan-child-leaf', {
    fromNodeId: parentNodeId,
    childNodeId,
    childSaveId: child.id,
  });
  return next;
}

/** 活跃叶子加载结果（reviewer P0-2 判别联合）。
 *  - ok：head 指向未封版叶子，或崩溃窗口明确采纳到未封版子叶（leaf 可写）；
 *  - no-leaf：head 缺失 / 节点或行缺失，根本不存在工作区；
 *  - sealed-conflict：head 指向已封版内部节点且无明确未封版子叶可采纳（无子叶 / 多子叶歧义），
 *    该状态不可写，调用方不得把检查点当作工作区水合。 */
export type ActiveLeafLoadResult =
  | { status: 'ok'; newest: NewestStory记录; leaf: 存档数据 }
  | { status: 'no-leaf'; newest: NewestStory记录 }
  | { status: 'sealed-conflict'; newest: NewestStory记录 };

/** 读当前活跃叶子（工作区）全量状态；返回显式判别联合，调用方必须处理「不可写」情况。
 *  expectedChildNodeId：恢复日志中持久化的本次提交目标子叶 nodeId（崩溃窗口采纳歧义时使用）。 */
export async function loadActiveLeaf(
  expectedChildNodeId?: string | null,
): Promise<ActiveLeafLoadResult> {
  let newest = await loadNewestStory();
  if (!newest.headNodeId) return { status: 'no-leaf', newest };
  const saveId = await loadSaveIdByNodeId(newest.headNodeId);
  if (!saveId) return { status: 'no-leaf', newest };
  const rawLeaf = await loadSave(saveId);
  if (!rawLeaf) return { status: 'no-leaf', newest };
  const leaf = rawLeaf;
  // 崩溃窗口恢复：head 指向已封版节点且存在未封版子叶子（提交协议在封版后崩溃）时，
  // 采纳子叶子并重定向指针，保证 queueTasks 不被丢失（分叉只会得到空队列）。
  if (!isUnsealedHeadSave(leaf)) {
    const fromNodeId = newest.headNodeId;
    const child = await findUnsealedChildLeaf(fromNodeId, expectedChildNodeId);
    const childNodeId = child?.saveTree?.nodeId;
    if (child && childNodeId) {
      const next = 指向NewestStory记录(newest, childNodeId);
      await saveNewestStory(next);
      newest = next;
      const adoptedLeaf = await loadSave(child.id);
      if (!adoptedLeaf) return { status: 'no-leaf', newest };
      devLog('save', 'active-leaf-adopted-child', {
        fromNodeId,
        childNodeId,
        childSaveId: child.id,
      });
      return { status: 'ok', newest, leaf: adoptedLeaf };
    }
    // head 指向已封版内部节点且无明确未封版子叶可采纳（无子叶 / 多子叶歧义）：
    // 返回冲突而非该检查点，绝不把不可变节点当作工作区返回（reviewer P0-2）。
    devLog('save', 'active-leaf-sealed-conflict', {
      fromNodeId,
      headNodeId: newest.headNodeId,
    });
    return { status: 'sealed-conflict', newest };
  }
  return { status: 'ok', newest, leaf };
}

/** 判定 headNodeId 指向的节点是否是可写（未封版）叶子。 */
export async function isActiveLeafWritable(headNodeId: string): Promise<boolean> {
  const saveId = await loadSaveIdByNodeId(headNodeId);
  if (!saveId) return false;
  const db = await openDB();
  const raw = await loadRawSave(db, saveId);
  return raw !== null && isUnsealedHeadSave(raw);
}

/**
 * 对当前未封版 head 行做轻量原地写入；不会经过资产抽取、delta、rotation 或 saveGameInternal。
 * 已封版的历史行一律拒绝改写。
 * 防御：目标行若为 delta-only 存储，先经 delta 链恢复全量再合并（叶子在正常路径恒为全量行，
 * 此分支只兜底历史数据 / 删除重定向后的边界态），并同步刷新 delta 记录。
 *
 * 并发安全（reviewer P1，TOCTOU）：delta 兜底恢复是只读预读（不参与封版竞争）；
 * 「复核未封版 + 写入」放在同一个串行化的 readwrite 事务内完成——IndexedDB 对同一 store
 * 的写事务串行化，sealLeafRow 不可能在本事务提交前改写该行，因此不会覆写已封版检查点。
 */
async function putHeadRow(saveId: number, patch: Partial<存档数据>): Promise<void> {
  const startedAt = Date.now();
  const { id: _ignoredId, ...patchWithoutId } = patch;
  void _ignoredId;
  const patchKeys = Object.keys(patchWithoutId);
  const db = await openDB();
  const rawPreview = await loadRawSave(db, saveId);
  if (!rawPreview) {
    const error = new Error('未找到要写入的草稿存档。');
    devLogError('save', 'puthead-rejected-missing', error, { saveId });
    throw error;
  }
  const restoredPreview = isDeltaOnlyStoredSave(rawPreview)
    ? await restoreDeltaSaveIfNeeded(db, rawPreview)
    : null;
  let restoredFromDelta = false;
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([SAVES_STORE, SAVE_SUMMARIES_STORE, SAVE_NODE_DELTAS_STORE], 'readwrite');
    const saveStore = tx.objectStore(SAVES_STORE);
    const summaryStore = tx.objectStore(SAVE_SUMMARIES_STORE);
    const deltaStore = tx.objectStore(SAVE_NODE_DELTAS_STORE);
    const readRequest = saveStore.get(saveId);
    readRequest.onsuccess = () => {
      const raw = readRequest.result as StoredSaveMeta | undefined;
      if (!raw) {
        const error = new Error('未找到要写入的草稿存档。');
        devLogError('save', 'puthead-rejected-missing', error, { saveId });
        reject(error);
        return;
      }
      if (!isUnsealedHeadSave(raw)) {
        const error = new Error('已封版历史节点不可通过 putHeadRow 改写。');
        devLogError('save', 'puthead-rejected-sealed', error, { saveId });
        reject(error);
        return;
      }
      restoredFromDelta = isDeltaOnlyStoredSave(raw);
      const current = restoredFromDelta ? (restoredPreview ?? raw) : raw;
      const next = { ...current, ...patchWithoutId, id: saveId } as StoredSaveMeta;
      const nextStored = stripSaveAssetPayloadForStorage(next);
      saveStore.put(nextStored);
      summaryStore.put(createCatalogRecordFromSummary(buildSaveSummary(nextStored)));
      const delta = buildSaveNodeDeltaRecord(nextStored, saveId);
      if (delta) deltaStore.put(delta);
    };
    readRequest.onerror = () => reject(toError(readRequest.error));
    tx.oncomplete = () => {
      devLog('save', 'puthead', {
        saveId,
        fieldCount: patchKeys.length,
        restoredFromDelta,
        durationMs: Date.now() - startedAt,
      });
      resolve();
    };
    tx.onerror = () => reject(toError(tx.error));
    tx.onabort = () => reject(tx.error ?? new Error('草稿存档写入事务已中止。'));
  });
}

/** 回合阶段边界写：把补丁字段原地写入当前活跃叶子行（putHeadRow 的 nodeId 版入口）。 */
export async function writeLeafNode(nodeId: string, patch: Partial<存档数据>): Promise<void> {
  const saveId = await loadSaveIdByNodeId(nodeId);
  if (!saveId) {
    throw new Error(`写入叶子失败：活跃叶子节点不存在（nodeId=${nodeId}）。`);
  }
  await putHeadRow(saveId, patch);
}

// ── 存档树基础设施（片 5d-1）：树查询最小集 + 分叉 API + 节点级删除 ──

/** 树查询最小集：返回 nodeId 节点及其全部后代（含自身）的目录摘要，按时间升序。 */
export async function getSaveTreeNodeSubtree(rootId: string, nodeId: string): Promise<SaveListItemSummary[]> {
  const subtree = await collectSaveTreeNodeSubtreeSummaries(rootId.trim(), nodeId.trim());
  return subtree.sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
}

/** 最近存活祖先：沿 parentNodeId 上溯，跳过 excludedNodeIds（如被删子树），返回第一个存活节点；无则 null。 */
async function getNearestLivingAncestor(
  rootId: string,
  nodeId: string,
  excludedNodeIds: ReadonlySet<string>,
): Promise<SaveListItemSummary | null> {
  const normalizedRootId = rootId.trim();
  const normalizedNodeId = nodeId.trim();
  if (!normalizedRootId || !normalizedNodeId) return null;
  const tree = await collectSaveTreeSummaries(normalizedRootId);
  const nodeById = new Map<string, SaveListItemSummary>();
  for (const item of tree) {
    const treeNodeId = item.saveTree?.nodeId;
    if (treeNodeId) nodeById.set(treeNodeId, item);
  }
  let cursor = nodeById.get(normalizedNodeId)?.saveTree?.parentNodeId ?? null;
  while (cursor) {
    if (!excludedNodeIds.has(cursor)) {
      const summary = nodeById.get(cursor);
      if (summary) return summary;
    }
    cursor = nodeById.get(cursor)?.saveTree?.parentNodeId ?? null;
  }
  return null;
}

export interface ForkSaveTreeLeafResult {
  headNodeId: string | null;
}

/**
 * 片 5d-1 分叉 API（子任务 A 重写）：从任意检查点分叉新叶子（读检查点 = 树操作）。
 * 目标检查点全量复制为新叶子行（saveRuntime.unsealedHead、全量存储、queueTasks 重置为空），
 * newest 指针直接指向新叶子——不再有「base + head + story 覆盖集」的延迟物化。
 * 目标节点在可见记录与历史备份中反查：目录按 visibility 把 type:'backup' 分流到
 * legacyBackups 而非 items，只查 items 会漏掉备份类恢复点。
 */
export async function forkSaveTreeLeaf(params: {
  rootId: string;
  targetNodeId: string;
  branchName?: string;
}): Promise<ForkSaveTreeLeafResult> {
  return runWithSaveMutationPriority(async () => {
    const rootId = params.rootId.trim();
    const targetNodeId = params.targetNodeId.trim();
    if (!rootId || !targetNodeId) {
      throw new Error('分叉存档树需要 rootId 与目标节点 ID。');
    }
    const catalog = await getSaveCatalogSnapshot();
    if (!catalog.catalogComplete) {
      throw new Error(`仍有 ${catalog.pendingIds.length} 个节点目录待恢复，请先完成恢复后再分叉存档树。`);
    }
    const targetSummary = [...catalog.items, ...catalog.legacyBackups]
      .find((item) => item.saveTree?.nodeId === targetNodeId);
    if (!targetSummary || targetSummary.saveTree?.rootId !== rootId) {
      throw new Error(`未找到要分叉的目标检查点：${targetNodeId}`);
    }
    const targetSave = await loadSave(targetSummary.id);
    if (!targetSave) {
      throw new Error(`目标检查点数据缺失：${targetNodeId}`);
    }
    const targetTree = (targetSave as SaveWithTree).saveTree;
    if (!targetTree?.nodeId) {
      throw new Error(`目标检查点缺少存档树元信息：${targetNodeId}`);
    }
    const branchName = typeof params.branchName === 'string' && params.branchName.trim()
      ? params.branchName.trim()
      : undefined;
    const headNodeId = createUnifiedId();
    const timestamp = Date.now();
    const {
      id: _targetId,
      saveStorage: _storage,
      saveRuntime: _runtime,
      queueTasks: _queueTasks,
      ...targetFields
    } = targetSave as StoredSaveMeta & { saveStorage?: unknown };
    void _targetId;
    void _storage;
    void _runtime;
    void _queueTasks;
    const leafPayload = {
      ...targetFields,
      id: 0,
      type: 'auto' as const,
      timestamp,
      queueTasks: [],
      saveTree: {
        rootId: targetTree.rootId,
        nodeId: headNodeId,
        parentNodeId: targetTree.nodeId,
        ...(branchName ? { branchName } : {}),
        createdAt: timestamp,
      } as 存档树元信息,
    } as 存档数据;
    await createLeafNode(leafPayload);
    const newest = await loadNewestStory();
    await saveNewestStory(指向NewestStory记录(newest, headNodeId));
    devLog('save', 'tree-fork-leaf', {
      rootId,
      targetNodeId,
      targetSaveId: targetSummary.id,
      headNodeId,
      branchName,
    });
    return { headNodeId };
  });
}

export interface DeleteSaveTreeNodeResult {
  deletedCount: number;
  deletedLeaf: boolean;
  newestRedirected: boolean;
}

/**
 * 片 5d-1 节点级删除：删叶子仅删自身；删内部节点级联修剪整个子树。
 * 若当前叶子（newest base/head）落在被删集合内，newest 重定向到最近存活祖先；
 * 无存活祖先（整棵树被删）时 newest 归零。
 */
export async function deleteSaveTreeNode(params: {
  rootId: string;
  nodeId: string;
}): Promise<DeleteSaveTreeNodeResult> {
  return runWithSaveMutationPriority(() => deleteSaveTreeNodeInternal(params.rootId.trim(), params.nodeId.trim()));
}

async function deleteSaveTreeNodeInternal(rootId: string, nodeId: string): Promise<DeleteSaveTreeNodeResult> {
  if (!rootId || !nodeId) {
    throw new Error('删除存档树节点需要 rootId 与 nodeId。');
  }
  const catalog = await getSaveCatalogSnapshot();
  if (!catalog.catalogComplete) {
    throw new Error(`仍有 ${catalog.pendingIds.length} 个节点目录待恢复，完成后才能删除存档树节点。`);
  }
  const subtree = await collectSaveTreeNodeSubtreeSummaries(rootId, nodeId);
  if (!subtree.length) {
    throw new Error(`未找到要删除的存档树节点：${nodeId}`);
  }
  return performTreeNodeDeletion(rootId, catalog, subtree);
}

export async function deleteSaveTree(rootId: string): Promise<number> {
  return runWithSaveMutationPriority(() => deleteSaveTreeInternal(rootId));
}

async function deleteSaveTreeInternal(rootId: string): Promise<number> {
  const trimmedRootId = rootId.trim();
  if (!trimmedRootId) return 0;
  const catalog = await getSaveCatalogSnapshot();
  if (!catalog.catalogComplete) {
    throw new Error(`仍有 ${catalog.pendingIds.length} 个节点目录待恢复，完成后才能删除整棵存档树。`);
  }
  const tree = await collectSaveTreeSummaries(trimmedRootId);
  if (!tree.length) return 0;
  const result = await performTreeNodeDeletion(trimmedRootId, catalog, tree);
  return result.deletedCount;
}

/** 执行删除主体：目录行/存档/delta 清理（复用 deleteManagedSaveItems）+ newest 指针重定向。 */
async function performTreeNodeDeletion(
  rootId: string,
  catalog: SaveCatalogSnapshot,
  subtree: SaveListItemSummary[],
): Promise<DeleteSaveTreeNodeResult> {
  const deletedNodeIds = new Set<string>();
  for (const item of subtree) {
    const nodeId = item.saveTree?.nodeId;
    if (nodeId) deletedNodeIds.add(nodeId);
  }

  const db = await openDB();
  await deleteManagedSaveItems(db, subtree);

  const newest = await loadNewestStory();
  const currentHeadNodeId = newest.headNodeId;
  const headDeleted = currentHeadNodeId !== null && deletedNodeIds.has(currentHeadNodeId);

  let newestRedirected = false;
  if (headDeleted) {
    const ancestor = currentHeadNodeId
      ? await getNearestLivingAncestor(rootId, currentHeadNodeId, deletedNodeIds)
      : null;
    if (ancestor && ancestor.saveTree?.nodeId) {
      await saveNewestStory(指向NewestStory记录(newest, ancestor.saveTree.nodeId));
      newestRedirected = true;
    } else {
      await saveNewestStory(创建空NewestStory记录());
      newestRedirected = true;
    }
    devLog('save', 'tree-delete-newest-redirect', {
      rootId,
      deletedCount: subtree.length,
      oldHeadNodeId: newest.headNodeId,
      redirectedTo: ancestor?.saveTree?.nodeId ?? null,
      reason: ancestor ? 'living-ancestor' : 'no-living-ancestor',
    });
  }

  devLog('save', 'tree-delete-node', {
    rootId,
    deletedCount: subtree.length,
    deletedLeaf: subtree.length === 1,
    newestRedirected,
  });
  return { deletedCount: subtree.length, deletedLeaf: subtree.length === 1, newestRedirected };
}

async function collectSaveTreeSummaries(rootId: string): Promise<SaveListItemSummary[]> {
  const snapshot = await getSaveCatalogSnapshot();
  return snapshot.items.filter((item) => item.saveTree?.rootId === rootId);
}

/** 收集子树目录摘要：从 nodeId 出发 BFS 全部后代（含自身）；节点不存在返回空数组。 */
async function collectSaveTreeNodeSubtreeSummaries(rootId: string, nodeId: string): Promise<SaveListItemSummary[]> {
  const tree = await collectSaveTreeSummaries(rootId);
  const nodeById = new Map<string, SaveListItemSummary>();
  for (const item of tree) {
    const treeNodeId = item.saveTree?.nodeId;
    if (treeNodeId) nodeById.set(treeNodeId, item);
  }
  if (!nodeById.has(nodeId)) return [];
  const childrenIndex = buildTreeChildrenIndex(tree);
  const result: SaveListItemSummary[] = [];
  const stack: string[] = [nodeId];
  let current = stack.pop();
  while (current) {
    const summary = nodeById.get(current);
    if (summary) result.push(summary);
    const children = childrenIndex.get(current) ?? [];
    for (const child of children) {
      const childNodeId = child.saveTree?.nodeId;
      if (childNodeId) stack.push(childNodeId);
    }
    current = stack.pop();
  }
  return result;
}

function buildTreeChildrenIndex(summaries: SaveListItemSummary[]): Map<string, SaveListItemSummary[]> {
  const children = new Map<string, SaveListItemSummary[]>();
  for (const item of summaries) {
    const parentNodeId = item.saveTree?.parentNodeId;
    if (!parentNodeId) continue;
    const list = children.get(parentNodeId) ?? [];
    list.push(item);
    children.set(parentNodeId, list);
  }
  return children;
}

export async function deleteLegacyBackupSaves(): Promise<number> {
  return runWithSaveMutationPriority(async () => {
    const catalog = await getSaveCatalogSnapshot();
    if (!catalog.legacyBackups.length) return 0;
    const db = await openDB();
    await deleteManagedSaveItems(db, catalog.legacyBackups);
    return catalog.legacyBackups.length;
  });
}

export async function loadSaveTree(rootId: string): Promise<存档数据[]> {
  const list = (await getSaveCatalogSnapshot()).items;
  const treeItems = list
    .filter((item) => item.saveTree?.rootId === rootId)
    .sort((a, b) => a.timestamp - b.timestamp || a.id - b.id);
  const saves: 存档数据[] = [];
  for (const item of treeItems) {
    const save = await loadSave(item.id);
    if (save) saves.push(save);
  }
  return saves;
}

// ── NewestStory（全局头指针槽，片 5a-2 D1-A：单记录仅存 headNodeId，不携带任何数据，
//    指向存档树中的活跃叶子或已封版节点；读叶子 = 水合，读检查点 = 分叉）──

export async function loadNewestStory(): Promise<NewestStory记录> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(NEWEST_STORY_STORE, 'readonly');
    const request = tx.objectStore(NEWEST_STORY_STORE).get(NEWEST_STORY_STORE_KEY);
    request.onsuccess = () => resolve(归一化NewestStory记录(request.result));
    request.onerror = () => {
      const error = request.error;
      reject(error instanceof Error ? error : new Error('读取 newestStory 记录失败。'));
    };
  });
}

export async function saveNewestStory(record: NewestStory记录): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(NEWEST_STORY_STORE, 'readwrite');
    tx.objectStore(NEWEST_STORY_STORE).put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () => {
      const error = tx.error;
      reject(error instanceof Error ? error : new Error('写入 newestStory 记录失败。'));
    };
  });
}
