import type { TurnAfterReply, TurnContext, TurnDeltas } from './turnTypes';
import { buildImmediateMemory, addImmediateMemory, autoCompressMemorySystemWithArchivesAsync } from './memoryUtils';
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

  pushQueueTask(state, 'memory', 'success', {
    detail: compression.usedModel
      ? '即时/短期/中期/长期记忆已调用记忆总结 API 完成整理。'
      : '即时/短期/中期/长期记忆已使用本地摘要完成整理。',
  }, turnCountAtStart, queueTasksMirror);

  return { mem, yitingWithCompression: state.忆庭 };
}
