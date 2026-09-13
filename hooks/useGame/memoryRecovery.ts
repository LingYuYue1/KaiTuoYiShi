import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { API配置项, 记忆系统设置 } from '@/models/settings';
import {
  作废记忆草稿,
  应用记忆草稿摘要,
  更新记忆草稿,
  记忆压缩层级表,
  记忆草稿作废文案,
  记忆草稿已过期,
  type 记忆失败草稿,
  type 记忆草稿应用结果,
  type 记忆系统,
} from '@/models/memory';
import { summarizeMemoryBatch } from '@/services/memoryCompression';
import { devLogError } from '@/utils/devLog';
import { beginWorkflowTransaction, isWorkflowAbortError, type WorkflowTransaction } from './workflowTransaction';
import { pushQueueTask } from './workflowTaskRuntime';
import type { TurnStatus } from './turnStatus';

const BUSY_MESSAGE = '当前有任务进行中，请等待完成后再处理记忆草稿。';
const MISSING_MESSAGE = '未找到可处理的记忆失败草稿，可能已被处理。';

export type MemoryDraftRetryOutcome = 记忆草稿应用结果 | 'retry_failed';

/**
 * 单草稿重试内核：API 失败时草稿回到 pending 并累计次数；成功时按快照转移记忆层。
 * 不接触事务、投影与 UI，便于独立测试。
 */
export async function runMemoryDraftRetry(
  memory: 记忆系统,
  draft: 记忆失败草稿,
  settings: 记忆系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
): Promise<{ memory: 记忆系统; outcome: MemoryDraftRetryOutcome }> {
  // 源层已无任何快照条目说明批次被其他路径处理过：先判过期，避免浪费一次 API 调用。
  if (记忆草稿已过期(memory, draft)) {
    return { memory: 作废记忆草稿(memory, draft.id, Date.now()), outcome: 'source_changed' };
  }
  const result = await summarizeMemoryBatch(
    {
      kind: draft.kind,
      turn: draft.turn,
      items: draft.items,
      prompt: draft.prompt.trim() || settings[记忆压缩层级表[draft.kind].提示词键],
    },
    settings,
    mainConfig,
    signal,
    settings.记忆总结API.retryCount,
  );
  if (result.failure) {
    return {
      memory: {
        ...memory,
        失败草稿: 更新记忆草稿(memory.失败草稿, draft.id, {
          status: 'pending',
          attemptCount: draft.attemptCount + 1,
          failureCode: result.failure.code,
          failureMessage: result.failure.message,
        }, Date.now()),
      },
      outcome: 'retry_failed',
    };
  }
  return 应用记忆草稿摘要(memory, draft, result.summary, Date.now());
}

interface 记忆草稿事务配置 {
  turnStatus: TurnStatus;
  /** 事务体：返回终态状态条，undefined 表示不额外改写状态条。 */
  run: (tx: WorkflowTransaction, draft: 记忆失败草稿) => Promise<TurnStatus | undefined>;
  /** 中止或异常时还原瞬态投影；error 为 undefined 表示中止。仅重试需要。 */
  restore?: (draft: 记忆失败草稿, error?: unknown) => void;
  /** 未预期异常时的队列文案前缀与终态文案，如「记忆总结重试失败」。 */
  failureLabel: string;
  /** 中止时的终态文案。 */
  stoppedStatus: TurnStatus;
  logLabel: string;
  /** 进入事务前的额外校验：返回文案即提前退出并上报。 */
  precheck?: (draft: 记忆失败草稿) => string | null;
}

/**
 * 记忆草稿类独立事务的唯一骨架：找草稿 → 前置校验 → 占位 → 执行 → settle。
 * 重试与忽略共用同一套中止 / 失败语义，避免协议在两处各自漂移。
 */
async function 运行记忆草稿事务(
  state: UseGameStateReturn,
  draftId: string,
  config: 记忆草稿事务配置,
): Promise<void> {
  const draft = findPendingDraft(state, draftId);
  if (!draft) {
    pushQueueTask(state, 'memory', 'failed', { detail: MISSING_MESSAGE, failCount: 1 });
    return;
  }
  const precheckMessage = config.precheck?.(draft);
  if (precheckMessage) {
    pushQueueTask(state, 'memory', 'failed', { detail: precheckMessage, failCount: 1 });
    return;
  }
  const tx = await beginWorkflowTransaction(state, { turnStatus: config.turnStatus });
  if (!tx) {
    pushQueueTask(state, 'memory', 'failed', { detail: BUSY_MESSAGE, failCount: 1 });
    return;
  }

  let terminalStatus: TurnStatus | undefined;
  try {
    terminalStatus = await config.run(tx, draft);
  } catch (error) {
    if (isWorkflowAbortError(error) || tx.signal.aborted) {
      if (tx.isCurrent()) {
        config.restore?.(draft);
        terminalStatus = config.stoppedStatus;
      }
      return;
    }
    devLogError('retry', config.logLabel, error, { draftId: draft.id });
    if (tx.isCurrent()) config.restore?.(draft, error);
    tx.pushTask('memory', 'failed', {
      detail: `${config.failureLabel}：${error instanceof Error ? error.message : '未知错误'}`,
      failCount: 1,
    }, draft.turn);
    terminalStatus = { kind: 'failed', text: `${config.failureLabel}。`, failCount: 1 };
  } finally {
    tx.settle(terminalStatus);
  }
}

export async function retryMemoryDraft(
  state: UseGameStateReturn,
  getActiveConfig: () => API配置项 | null,
  draftId: string,
): Promise<void> {
  const settings = state.deviceSettings.gameSettings.记忆系统;
  // getActiveConfig 带副作用（缺省时补写 activeConfigId），只解析一次。
  const mainConfig = getActiveConfig();
  await 运行记忆草稿事务(state, draftId, {
    turnStatus: { kind: 'settling', text: '正在重试记忆总结。' },
    failureLabel: '记忆总结重试失败',
    stoppedStatus: { kind: 'stopped', text: '已取消记忆总结重试。' },
    logLabel: 'retryMemoryDraft.catch',
    precheck: () => (mainConfig ? null : '未配置主 API，无法重试记忆总结。'),
    // 中止时瞬态 retrying 只存在于投影：还原为 pending，与叶子保持一致。
    restore: (draft, error) => {
      state.set记忆({
        ...state.记忆,
        失败草稿: 更新记忆草稿(state.记忆.失败草稿, draft.id, {
          status: 'pending',
          ...(error ? { failureMessage: error instanceof Error ? error.message : '重试失败。' } : {}),
        }, Date.now()),
      });
    },
    run: async (tx, draft) => {
      // precheck 已拦截无配置的情况，此处仅用于收窄类型。
      if (!mainConfig) return undefined;
      tx.pushTask('memory', 'pending', {
        detail: '正在重试记忆总结。',
        retrying: true,
        cancellable: true,
      }, draft.turn);
      const projected: 记忆系统 = {
        ...state.记忆,
        失败草稿: 更新记忆草稿(state.记忆.失败草稿, draft.id, { status: 'retrying' }, Date.now()),
      };
      state.set记忆(projected);
      const result = await runMemoryDraftRetry(projected, draft, settings, mainConfig, tx.signal);
      tx.assertActive();
      await tx.writeLeaf({ 记忆: result.memory });
      state.set记忆(result.memory);
      if (result.outcome === 'applied') {
        tx.pushTask('memory', 'success', { detail: '记忆总结重试成功，原始批次已归档。' }, draft.turn);
        return undefined;
      }
      if (result.outcome === 'retry_failed') {
        const message = result.memory.失败草稿.find((item) => item.id === draft.id)?.failureMessage ?? '';
        tx.pushTask('memory', 'failed', { detail: `记忆总结重试失败：${message}`, failCount: 1 }, draft.turn);
        return { kind: 'failed', text: '记忆总结重试失败。', failCount: 1 };
      }
      tx.pushTask('memory', 'failed', { detail: 记忆草稿作废文案, failCount: 1 }, draft.turn);
      return undefined;
    },
  });
}

export async function ignoreMemoryDraft(state: UseGameStateReturn, draftId: string): Promise<void> {
  await 运行记忆草稿事务(state, draftId, {
    turnStatus: { kind: 'settling', text: '正在忽略记忆失败草稿。' },
    failureLabel: '忽略失败草稿失败',
    stoppedStatus: { kind: 'stopped', text: '已取消忽略操作。' },
    logLabel: 'ignoreMemoryDraft.catch',
    run: async (tx, draft) => {
      const next: 记忆系统 = {
        ...state.记忆,
        失败草稿: 更新记忆草稿(state.记忆.失败草稿, draftId, { status: 'ignored' }, Date.now()),
      };
      await tx.writeLeaf({ 记忆: next });
      state.set记忆(next);
      tx.pushTask('memory', 'success', { detail: '已忽略该条记忆失败草稿。' }, draft.turn);
      return undefined;
    },
  });
}

function findPendingDraft(state: UseGameStateReturn, draftId: string): 记忆失败草稿 | undefined {
  return state.记忆.失败草稿.find((draft) => draft.id === draftId && draft.status === 'pending');
}
