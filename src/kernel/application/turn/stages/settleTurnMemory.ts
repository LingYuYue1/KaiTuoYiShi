import type { 解析后回复 } from '@/models/chat';
import type { 游戏设置 } from '@/models/settings';
import type { TurnExecutionState } from '../turnExecutionState';
import {
  addImmediateMemory,
  autoCompressMemorySystemWithArchivesAsync,
  buildImmediateMemory,
} from '@/src/kernel/workflows/memoryUtils';
import { 创建默认记忆系统设置 } from '@/models/settings';
import { pushQueueTask } from './turnRuntime';

export async function settleTurnMemory(input: Readonly<{
  state: TurnExecutionState;
  settings: 游戏设置;
  turn: number;
  userInput: string;
  parsed: 解析后回复;
  narrative: string;
  signal: AbortSignal;
}>): Promise<TurnExecutionState['记忆']> {
  pushQueueTask(input.state, 'memory', 'pending', { detail: '正在写入即时记忆并检查压缩阈值。' });
  const summary = input.parsed.memory?.trim();
  const rawMemory = buildImmediateMemory(
    input.userInput,
    [summary ? `本回合小结：${summary}` : '', input.narrative].filter(Boolean).join('\n\n'),
  );
  const immediate = addImmediateMemory(input.state.记忆, rawMemory, input.turn);
  const compression = await autoCompressMemorySystemWithArchivesAsync(
    immediate,
    input.turn,
    input.settings.记忆系统 ?? 创建默认记忆系统设置(),
    input.signal,
  );
  input.state.记忆 = compression.memory;
  pushQueueTask(input.state, 'memory', 'success', {
    detail: compression.usedModel
      ? '即时/短期/中期/长期记忆已调用记忆总结 API 完成整理。'
      : '本回合未达到记忆压缩阈值。',
  });
  return compression.memory;
}
