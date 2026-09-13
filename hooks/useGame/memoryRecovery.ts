import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { API配置项, 记忆系统设置 } from '@/models/settings';
import {
  应用记忆草稿摘要,
  更新记忆草稿,
  记忆压缩层级表,
  type 记忆失败草稿,
  type 记忆压缩层级,
  type 记忆系统,
} from '@/models/memory';
import { summarizeMemoryBatch } from '@/services/memoryCompression';
import { devLogError } from '@/utils/devLog';
import { beginWorkflowTransaction, isWorkflowAbortError } from './workflowTransaction';
import { pushQueueTask } from './workflowTaskRuntime';
import type { TurnStatus } from './turnStatus';

const BUSY_MESSAGE = '当前有任务进行中，请等待完成后再处理记忆草稿。';
const MISSING_MESSAGE = '未找到可处理的记忆失败草稿，可能已被处理。';

const 层级提示词: Record<记忆压缩层级, (settings: 记忆系统设置) => string> = {
  short: (settings) => settings.即时转短期提示词,
  middle: (settings) => settings.短期转中期提示词,
  long: (settings) => settings.中期转长期提示词,
};

export type MemoryDraftRetryOutcome = 'applied' | 'source_changed' | 'retry_failed';

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
  const source = memory[记忆压缩层级表[draft.kind].来源];
  if (!draft.items.some((item) => source.includes(item))) {
    return {
      memory: {
        ...memory,
        失败草稿: 更新记忆草稿(memory.失败草稿, draft.id, {
          status: 'ignored',
          failureCode: 'source_changed',
          failureMessage: '原始批次已被修改，草稿作废。',
        }, Date.now()),
      },
      outcome: 'source_changed',
    };
  }
  const result = await summarizeMemoryBatch(
    {
      kind: draft.kind,
      turn: draft.turn,
      items: draft.items,
      prompt: draft.prompt.trim() || 层级提示词[draft.kind](settings),
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

export async function retryMemoryDraft(
  state: UseGameStateReturn,
  getActiveConfig: () => API配置项 | null,
  draftId: string,
): Promise<void> {
  const draft = findPendingDraft(state, draftId);
  if (!draft) {
    pushQueueTask(state, 'memory', 'failed', { detail: MISSING_MESSAGE, failCount: 1 });
    return;
  }
  const mainConfig = getActiveConfig();
  if (!mainConfig) {
    pushQueueTask(state, 'memory', 'failed', { detail: '未配置主 API，无法重试记忆总结。', failCount: 1 });
    return;
  }
  const settings = state.deviceSettings.gameSettings.记忆系统;
  const tx = await beginWorkflowTransaction(state, {
    turnStatus: { kind: 'settling', text: '正在重试记忆总结。' },
  });
  if (!tx) {
    pushQueueTask(state, 'memory', 'failed', { detail: BUSY_MESSAGE, failCount: 1 });
    return;
  }

  let terminalStatus: TurnStatus | undefined;
  try {
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
    } else if (result.outcome === 'retry_failed') {
      const message = result.memory.失败草稿.find((item) => item.id === draft.id)?.failureMessage ?? '';
      tx.pushTask('memory', 'failed', { detail: `记忆总结重试失败：${message}`, failCount: 1 }, draft.turn);
      terminalStatus = { kind: 'failed', text: '记忆总结重试失败。', failCount: 1 };
    } else {
      tx.pushTask('memory', 'failed', { detail: '原始批次已被修改，草稿作废。', failCount: 1 }, draft.turn);
    }
  } catch (error) {
    if (isWorkflowAbortError(error) || tx.signal.aborted) {
      if (tx.isCurrent()) {
        // 瞬态 retrying 只存在于投影：中止时回到 pending，与叶子保持一致。
        state.set记忆({
          ...state.记忆,
          失败草稿: 更新记忆草稿(state.记忆.失败草稿, draft.id, { status: 'pending' }, Date.now()),
        });
        terminalStatus = { kind: 'stopped', text: '已取消记忆总结重试。' };
      }
      return;
    }
    devLogError('retry', 'retryMemoryDraft.catch', error, { draftId: draft.id });
    if (tx.isCurrent()) {
      state.set记忆({
        ...state.记忆,
        失败草稿: 更新记忆草稿(state.记忆.失败草稿, draft.id, {
          status: 'pending',
          failureMessage: error instanceof Error ? error.message : '重试失败。',
        }, Date.now()),
      });
    }
    tx.pushTask('memory', 'failed', {
      detail: `记忆总结重试失败：${error instanceof Error ? error.message : '未知错误'}`,
      failCount: 1,
    }, draft.turn);
    terminalStatus = { kind: 'failed', text: '记忆总结重试失败。', failCount: 1 };
  } finally {
    tx.settle(terminalStatus);
  }
}

export async function ignoreMemoryDraft(state: UseGameStateReturn, draftId: string): Promise<void> {
  const draft = findPendingDraft(state, draftId);
  if (!draft) {
    pushQueueTask(state, 'memory', 'failed', { detail: MISSING_MESSAGE, failCount: 1 });
    return;
  }
  const tx = await beginWorkflowTransaction(state, {
    turnStatus: { kind: 'settling', text: '正在忽略记忆失败草稿。' },
  });
  if (!tx) {
    pushQueueTask(state, 'memory', 'failed', { detail: BUSY_MESSAGE, failCount: 1 });
    return;
  }

  let terminalStatus: TurnStatus | undefined;
  try {
    const next: 记忆系统 = {
      ...state.记忆,
      失败草稿: 更新记忆草稿(state.记忆.失败草稿, draftId, { status: 'ignored' }, Date.now()),
    };
    await tx.writeLeaf({ 记忆: next });
    state.set记忆(next);
    tx.pushTask('memory', 'success', { detail: '已忽略该条记忆失败草稿。' }, draft.turn);
  } catch (error) {
    if (isWorkflowAbortError(error) || tx.signal.aborted) {
      if (tx.isCurrent()) terminalStatus = { kind: 'stopped', text: '已取消忽略操作。' };
      return;
    }
    devLogError('retry', 'ignoreMemoryDraft.catch', error, { draftId });
    tx.pushTask('memory', 'failed', {
      detail: `忽略失败草稿失败：${error instanceof Error ? error.message : '未知错误'}`,
      failCount: 1,
    }, draft.turn);
    terminalStatus = { kind: 'failed', text: '忽略失败草稿失败。', failCount: 1 };
  } finally {
    tx.settle(terminalStatus);
  }
}

function findPendingDraft(state: UseGameStateReturn, draftId: string): 记忆失败草稿 | undefined {
  return state.记忆.失败草稿.find((draft) => draft.id === draftId && draft.status === 'pending');
}
