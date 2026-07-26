/**
 * 阶段 6：记忆处理 —— 即时记忆构建、自动压缩（含异步 API 调用）。
 *
 * 读 d 字段: parsedForDisplay (S5), displayText (S5)
 * 上游写入点: stage5_replyLanding.ts 第 ~132 行 parsedForDisplay / 第 ~56 行 displayText
 *
 * 写 d 字段: mem (本次记忆系统写入后的快照), yitingWithCompression
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import { buildImmediateMemory, addImmediateMemory, autoCompressMemorySystemWithArchivesAsync } from './memoryUtils';
import { pushQueueTask } from './workflowTaskRuntime';
import { 创建默认记忆系统设置 } from '@/models/settings';

export async function stage6_memory(
  ctx: TurnContext,
  d: TurnDeltas,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, config, abortController, assertWorkflowActive } = ctx;
  const parsedForDisplay = d.parsedForDisplay!;
  const displayText = d.displayText!;

  pushQueueTask(state, 'memory', 'pending', { detail: '正在写入即时记忆并检查压缩阈值。' });

  const rawMemory = buildImmediateMemory(userInput, [
    parsedForDisplay.memory?.trim() ? `本回合小结：${parsedForDisplay.memory.trim()}` : '',
    displayText,
  ].filter(Boolean).join('\n\n'));
  let mem = addImmediateMemory(state.记忆, rawMemory, state.turnCount);
  const compression = await autoCompressMemorySystemWithArchivesAsync(
    mem,
    state.turnCount,
    state.gameSettings.记忆系统 ?? 创建默认记忆系统设置(),
    config,
    abortController.signal,
  );
  assertWorkflowActive();
  mem = compression.memory;
  state.set记忆(mem);

  pushQueueTask(state, 'memory', 'success', {
    detail: compression.usedModel
      ? '即时/短期/中期/长期记忆已调用记忆总结 API 完成整理。'
      : '即时/短期/中期/长期记忆已使用本地摘要完成整理。',
  });

  return { mem, yitingWithCompression: state.忆庭 };
}
