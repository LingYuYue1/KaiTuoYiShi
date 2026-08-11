/**
 * commitTurn —— 唯一晋升点（ideal_design §1/§6，片 5a-2 D2-A/D5；子任务 A 改造成 commitLeaf 语义）。
 *
 * 输入：newest（全局指针，只含 headNodeId）。工作区数据物理存储在叶子节点（saveRuntime.unsealedHead），
 *   回合阶段边界经 writeLeafNode 直写叶子；不再有 base + story 覆盖集。
 * 处理（封版晋升，ideal_design「回合闭环机制」，reviewer P0 顺序约束）：
 *   1. 读活跃叶子全量状态；
 *   2. 先在该叶子下创建新叶子（继承全量状态 + queueTasks，unsealedHead，全量存储）；
 *   3. 再把旧叶子就地转为不可变检查点（同 nodeId 身份转变，剥离 queueTasks 等仅限叶子字段）；
 *   4. newest 指针指向新叶子。
 * 顺序约束原因：若「封版 → 建叶」，封版后、建叶前崩溃会让原叶子已剥离 queueTasks
 * 而新叶子未创建，恢复分叉只能得到空队列；先建叶后封版使任何崩溃点都保留
 * 至少一个携带 queueTasks 的可写叶子（loadActiveLeaf / ensureHeadLeafWritable 采纳子叶子）。
 * 输出：无返回值（新叶子 nodeId 由 newest 带回）。
 *
 * B2 候选状态契约：本文件只认 ctx / d / newest，不回读 state；例外是 headNodeId 缺失时
 * 由 ensureHeadLeafWritable 从当前状态重建工作区（整树删除等边界态）。
 *
 * L1 边界：本文件是 checkpoint 表写入的唯一合法出口（no-restricted-imports
 * 禁 stage*.ts 与 sendWorkflow.ts import saveGame；导入路径走 saveLoadWorkflow
 * 不受限）。checkpoint 表四 store = saves / saveSummaries / saveAssets /
 * saveNodeDeltas（settings / newestStory 非 checkpoint 表）。叶子创建同样收敛在本文件。
 */
import type { 存档数据 } from '@/models/settings';
import { loadSave, loadSaveIdByNodeId, saveGame, saveNewestStory, createLeafNode, sealLeafRow } from '@/services/dbService';
import { 创建空NewestStory记录, 指向NewestStory记录, type NewestStory记录, type 工作区字段集 } from '@/models/newestStory';
import { commitActiveSaveTreeMeta, ensureHeadLeafWritable, assertCheckpointPayloadNoQueueTasks } from './saveLoadWorkflow';
import { attachSaveTreeMeta, buildNextSaveTreeMeta } from '@/utils/saveTree';
import { persistWorkflowRecoveryJournal, updateWorkflowRecoveryJournal } from '@/services/workflowRecovery';
import { devLog, devLogError } from '@/utils/devLog';
import type { TurnContext, TurnDeltas } from './turnTypes';

type SaveWithTree = 存档数据 & { saveTree?: import('@/utils/saveTree').存档树元信息 };

/** 新局初始字段 = 工作区字段集（含 queueTasks 等仅限叶子字段，初始根叶子直接携带）。 */
export type 新局初始字段 = 工作区字段集;

/**
 * 新局边界：创建「根检查点（turn-0 状态，封版）+ 初始活跃叶子（同状态 + queueTasks，子节点）」，
 * newest 指向初始叶子。根检查点保持旧行为（首回合前的空态检查点存在且可读）。
 */
export async function 初始化新局checkpoint(
  fields: 新局初始字段,
): Promise<{ checkpointId: number }> {
  try {
    const timestamp = Date.now();
    // 根检查点：封版、不含 queueTasks（仅限叶子字段不得入检查点）。
    const { queueTasks: _queueTasks, ...rootFields } = fields;
    void _queueTasks;
    const rootPayload = {
      id: 0,
      type: 'auto' as const,
      timestamp,
      ...rootFields,
    } as 存档数据;
    const rootWithTree = attachSaveTreeMeta(rootPayload, buildNextSaveTreeMeta({
      previous: null,
      type: 'auto',
      timestamp,
    }));
    assertCheckpointPayloadNoQueueTasks(rootWithTree, 'new-game');
    const rootId = await saveGame(rootWithTree);

    // 初始活跃叶子：根检查点状态 + queueTasks + unsealedHead，子节点。
    const leafPayload = {
      ...rootWithTree,
      id: 0,
      timestamp: timestamp + 1,
      queueTasks: fields.queueTasks ?? [],
      saveTree: buildNextSaveTreeMeta({
        previous: rootWithTree,
        type: 'auto',
        timestamp: timestamp + 1,
      }),
    } as 存档数据;
    const { saveId, saveTree } = await createLeafNode(leafPayload);
    await saveNewestStory(指向NewestStory记录(创建空NewestStory记录(), saveTree.nodeId));
    devLog('save', 'new-game-leaf-created', {
      rootCheckpointId: rootId,
      leafId: saveId,
      headNodeId: saveTree.nodeId,
    });
    commitActiveSaveTreeMeta(leafPayload);
    return { checkpointId: rootId };
  } catch (error) {
    devLogError('save', 'new-game-checkpoint-failed', error);
    throw error;
  }
}

/**
 * commitTurn：把活跃叶子封版晋升为检查点，并创建新叶子等待下一回合（每回合必写，
 * D2-A：与 enableAutoSaveEveryTurn 开关无关，开关只控「是否保留可见 auto 存档」）。
 */
export async function commitTurn(
  ctx: TurnContext,
  d: TurnDeltas,
  newest: NewestStory记录,
): Promise<void> {
  const { state, assertWorkflowActive } = ctx;
  assertWorkflowActive();
  let headNodeId = newest.headNodeId;
  if (!headNodeId) {
    // 无工作区（整树删除等边界态）：从当前状态重建叶子，再继续晋升。
    const ensured = await ensureHeadLeafWritable(state);
    headNodeId = ensured.headNodeId;
    if (!headNodeId) {
      throw new Error('commitTurn 失败：无法建立活跃叶子工作区。');
    }
  }

  const leafSaveId = await loadSaveIdByNodeId(headNodeId);
  if (!leafSaveId) {
    throw new Error(`commitTurn 失败：活跃叶子节点不存在（nodeId=${headNodeId}）。`);
  }
  const leaf = await loadSave(leafSaveId);
  if (!leaf) {
    throw new Error(`commitTurn 失败：活跃叶子数据缺失（saveId=${leafSaveId}）。`);
  }
  assertWorkflowActive();

  const queueTasks = leaf.queueTasks;
  const timestamp = Date.now();
  // 步骤 2：封版载荷——叶子身份就地转为检查点（剥离 queueTasks，保留原 saveTree / id）。
  const sealedPayload = {
    ...leaf,
    id: leafSaveId,
    type: 'auto' as const,
    timestamp,
    queueTasks: undefined,
  } as 存档数据;
  assertCheckpointPayloadNoQueueTasks(sealedPayload, 'commit-turn');

  // 步骤 3：先建新叶子，再封版旧叶子（reviewer P0 顺序约束）。
  // 若保持「封版 → 建叶」旧顺序，封版后、建叶前崩溃会让原叶子已剥离 queueTasks
  // 而新叶子未创建，恢复分叉只能得到空队列（工作区队列永久丢失）。先建叶后封版则：
  //  - 建叶后、封版前崩溃：旧叶子仍未封版（含 queueTasks），newest 指向它，可直接续写；
  //  - 封版后、写指针前崩溃：子叶子已存在（含 queueTasks），loadActiveLeaf /
  //    ensureHeadLeafWritable 采纳该子叶子并重定向指针。
  const nextLeafPayload = {
    ...sealedPayload,
    id: 0,
    timestamp: timestamp + 1,
    queueTasks,
    saveTree: buildNextSaveTreeMeta({
      previous: sealedPayload,
      type: 'auto',
      timestamp: timestamp + 1,
    }),
  } as 存档数据;
  const nextHeadNodeId = (nextLeafPayload as SaveWithTree).saveTree?.nodeId ?? null;
  if (!nextHeadNodeId) {
    throw new Error('commitTurn 失败：新叶子缺少 saveTree 元信息。');
  }

  // 子任务 A（片 5f）崩溃恢复身份登记：建叶前把本次提交的目标 childNodeId
  // 持久化进恢复日志。若「封版 → 写指针」之间崩溃，恢复侧按明确身份采纳该子叶，
  // 不再在多个未封版子叶之间按保存 ID 猜测（读检查点分叉可产生多子叶，隐含线性链假设）。
  const rj = updateWorkflowRecoveryJournal(ctx.recoveryJournal, {
    pendingChildNodeId: nextHeadNodeId,
  });
  await persistWorkflowRecoveryJournal(rj);
  devLog('save', 'checkpoint-pending-child-registered', {
    parentNodeId: headNodeId,
    pendingChildNodeId: nextHeadNodeId,
  });

  // 步骤 3：先建新叶子，再封版旧叶子（顺序约束见上）。
  const { saveId } = await createLeafNode(nextLeafPayload);

  // 步骤 2'：封版——旧叶子就地转为不可变检查点。
  await sealLeafRow(sealedPayload);

  // 步骤 4：newest 指向新叶子。
  await saveNewestStory(指向NewestStory记录(newest, nextHeadNodeId));
  assertWorkflowActive();
  devLog('save', 'checkpoint-committed', {
    checkpointId: saveId,
    leafNodeId: nextHeadNodeId,
    queueTasksStrippedFromPayload: true,
    queueTasksKeptInWorkspace: queueTasks !== undefined,
  });

  // saveTree 元信息联动：后续分叉/重建路径以此检查点为树上前驱。
  commitActiveSaveTreeMeta(sealedPayload);
}
