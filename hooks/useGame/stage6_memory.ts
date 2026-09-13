import type { TurnAfterReply, TurnContext, TurnDeltas } from './turnTypes';
import { buildImmediateMemory, addImmediateMemory, autoCompressMemorySystemWithArchivesAsync, type MemoryCompressionOutcome } from './memoryUtils';
import { pushQueueTask } from './workflowTaskRuntime';

export async function stage6_memory(
  ctx: TurnContext,
  d: TurnAfterReply,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, config, abortController, assertWorkflowActive, turnCountAtStart, queueTasksMirror } = ctx;
  const parsedForDisplay = d.parsedForDisplay;
  const displayText = d.displayText;

  pushQueueTask(state, 'memory', 'pending', { detail: '正在写入即时记忆并检查压缩阈值。' }, turnCountAtStart, queueTasksMirror);

  const rawMemory = buildImmediateMemory(userInput, [
    parsedForDisplay.memory.trim() ? `本回合小结：${parsedForDisplay.memory.trim()}` : '',
    displayText,
  ].filter(Boolean).join('\n\n'));
  let mem = addImmediateMemory(state.记忆, rawMemory, turnCountAtStart);
  const compression = await autoCompressMemorySystemWithArchivesAsync(
    mem,
    turnCountAtStart,
    state.deviceSettings.gameSettings.记忆系统,
    config,
    abortController.signal,
  );
  assertWorkflowActive();
  mem = compression.memory;

  if (compression.failedDraft) {
    pushQueueTask(state, 'memory', 'failed', {
      detail: `记忆总结失败：${compression.failedDraft.failureMessage} 原始批次已保存为失败草稿，可在记忆面板重试或忽略。`,
      failCount: 1,
    }, turnCountAtStart, queueTasksMirror);
  } else {
    pushQueueTask(state, 'memory', 'success', {
      detail: 整理成功说明(compression),
    }, turnCountAtStart, queueTasksMirror);
  }

  return { mem, yitingWithCompression: state.忆庭 };
}

/** 成功路径的队列文案：超界降级优先于「是否调用过模型」。 */
function 整理成功说明(compression: MemoryCompressionOutcome): string {
  if (compression.draftSkipped) return '本批记忆材料超出草稿快照边界，已使用本地摘要完成整理。';
  if (compression.usedModel) return '即时/短期/中期/长期记忆已调用记忆总结 API 完成整理。';
  return '即时/短期/中期/长期记忆已使用本地摘要完成整理。';
}
