/**
 * 独立工作流事务（重试 / 重生成 / 新闻 / 变量旁路）的唯一生命周期与叶子写入入口。
 *
 * 架构依据（kernelization.md）：
 *  - §14.3 迟到异步结果属插件内部事务：经 writeLeaf 写回当前活跃叶子或丢弃，
 *    内核不介入；封版（commitTurn）只发生在完整回合的 commitBoundary（§6.4），
 *    因此本模块只写叶子、不封版、不移动 newest 指针。
 *  - K2/K13：领域状态的唯一真相是活跃叶子；本模块把领域补丁与队列账本
 *    放在同一次 putHeadRow 中原子写入，刷新后由 newest 指针水合恢复。
 *
 * 取消契约：activeWorkflow.abortControllerRef 是唯一在途控制器槽位。
 * `beginWorkflowTransaction` 占位、`settle` 释放、`cancelActiveWorkflow` 中止；
 * 所有子请求接收 tx.signal，旧事务经 isCurrent/assertActive 守卫后不得再写
 * state、队列或叶子。
 */
import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { 工作区字段集 } from '@/models/newestStory';
import type { 队列任务ID, 队列任务记录, 队列任务状态 } from '@/models/queueTask';
import { loadActiveLeaf, writeLeafNode } from '@/services/storage/saveTree';
import { devLog } from '@/utils/devLog';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { ensureHeadLeafWritable, resetWorkflowProjection } from './saveLoadWorkflow';
import { cancelPendingQueueTasks, pushQueueTask, type 队列任务补丁 } from './workflowTaskRuntime';
import type { TurnStatus } from './turnStatus';

/** 过滤 undefined，保留叶子补丁的字段级覆盖语义。 */
export function 清理叶子补丁(patch: Partial<工作区字段集>): Partial<工作区字段集> {
  const cleaned: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (typeof value !== 'undefined') cleaned[key] = value;
  }
  return cleaned;
}

/**
 * 主回合的受保护叶子写入通道：阶段边界统一经此写入（同一 abort/epoch 守卫、
 * 同一活跃叶子身份）。工作流被顶替/中止时抛 AbortError，调用方按既有失败语义处理。
 */
export async function writeTurnLeaf(
  ctx: { assertWorkflowActive: () => void },
  headNodeId: string | null,
  patch: Partial<工作区字段集>,
): Promise<void> {
  ctx.assertWorkflowActive();
  if (!headNodeId) throw new Error('写回合叶子失败：活跃叶子指针为空。');
  await writeLeafNode(headNodeId, 清理叶子补丁(patch));
  ctx.assertWorkflowActive();
}

/** 工作流中止错误判定：DOMException('AbortError') 与原生 signal 中止统一入口。 */
export function isWorkflowAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

export interface WorkflowTransaction {
  signal: AbortSignal;
  /** 本事务是否仍持有 activeWorkflow 的控制器槽位。 */
  isCurrent: () => boolean;
  /** 事务已被中止 / 顶替时抛 AbortError，供叶子写入与投影前置守卫。 */
  assertActive: () => void;
  /** 会话身份守卫下的队列账本记录（state + 叶子镜像同步）。 */
  pushTask: (id: 队列任务ID, status: 队列任务状态, patch?: 队列任务补丁, turn?: number) => void;
  /** 原子写活跃叶子：领域补丁 + 当前队列镜像，一次 putHeadRow。不封版、不移动指针。 */
  writeLeaf: (patch: Partial<工作区字段集>) => Promise<void>;
  /** 事务收尾：仍为当前时释放控制器并复位瞬时投影，可携带终态状态条。 */
  settle: (finalStatus?: TurnStatus) => void;
}

/**
 * 开启独立工作流事务。忙碌（主回合 / 变量结算中）时返回 null，由调用方给出
 * 明确的拒绝反馈，不做排队、不并发写叶子。
 */
export async function beginWorkflowTransaction(
  state: UseGameStateReturn,
  opts: { turnStatus: TurnStatus },
): Promise<WorkflowTransaction | null> {
  const aw = state.activeWorkflow;
  if (aw.loading || aw.pendingVariable) return null;
  aw.abortControllerRef.current?.abort();
  const controller = new AbortController();
  aw.abortControllerRef.current = controller;
  aw.setLoading(true);
  aw.setTurnStatus(opts.turnStatus);
  const isCurrent = () => aw.abortControllerRef.current === controller;
  const assertActive = () => {
    if (controller.signal.aborted || !isCurrent()) {
      throw new DOMException('Workflow aborted', 'AbortError');
    }
  };

  let headNodeId: string | null = null;
  let queueTasks: 队列任务记录[] = [];
  try {
    const newest = await ensureHeadLeafWritable(state);
    assertActive();
    const active = await loadActiveLeaf();
    assertActive();
    if (!newest.headNodeId || active.status !== 'ok') {
      throw new Error('独立工作流失败：无法建立可写的活跃叶子工作区。');
    }
    headNodeId = newest.headNodeId;
    queueTasks = [...(active.leaf.queueTasks ?? [])];
  } catch (error) {
    if (isCurrent()) {
      aw.abortControllerRef.current = null;
      resetWorkflowProjection(state);
    }
    throw error;
  }

  return {
    signal: controller.signal,
    isCurrent,
    assertActive,
    pushTask: (id, status, patch, turn) => {
      if (!isCurrent()) return;
      pushQueueTask(state, id, status, patch, turn, queueTasks);
    },
    writeLeaf: async (patch) => {
      assertActive();
      const nodeId = headNodeId;
      if (!nodeId) throw new Error('独立工作流失败：活跃叶子未就绪。');
      await writeLeafNode(nodeId, 清理叶子补丁({ ...patch, queueTasks }));
      devLog('turn', 'workflow-leaf-write', { nodeId, fields: Object.keys(patch) });
    },
    settle: (finalStatus) => {
      if (!isCurrent()) return;
      aw.abortControllerRef.current = null;
      resetWorkflowProjection(state, { keepTurnStatus: Boolean(finalStatus) });
      if (finalStatus) aw.setTurnStatus(finalStatus);
    },
  };
}

/**
 * 用户取消（停止按钮 / 队列任务取消）的唯一清理路径：
 * 中止在途控制器，把所有未决队列任务标记 cancelled，清空流式投影。
 * 领域叶子不做回滚（已持久化的结果保持），回滚语义只属于主回合的 AbortError 分支。
 */
export function cancelActiveWorkflow(
  state: UseGameStateReturn,
  opts?: { taskId?: 队列任务ID },
): void {
  const aw = state.activeWorkflow;
  const controller = aw.abortControllerRef.current;
  if (controller) controller.abort();
  cancelPendingQueueTasks(state);
  setStreamingMessage('');
  if (controller) {
    devLog('turn', 'workflow-cancel', { taskId: opts?.taskId ?? null });
    return;
  }
  // 无在途控制器但瞬时态卡死（KI-1 类残影）：强制复位，避免 loading/取消按钮成孤儿。
  if (aw.loading || aw.pendingVariable) {
    resetWorkflowProjection(state);
  }
}
