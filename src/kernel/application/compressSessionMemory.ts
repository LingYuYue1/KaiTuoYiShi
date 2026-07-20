import type { CompressMemoryEnvelope, ExecutionFrame } from '@/src/kernel/contract';
import {
  compressToLongTerm,
  compressToMiddleTerm,
  compressToShortTerm,
} from '@/src/kernel/domain/memory/memoryCompression';
import type { ExecutionContextProvider, SessionRepository } from '@/src/kernel/ports';
import { commitCommand, loadCommandBase, rejectedFrame } from './executeSessionCommand';
import { resolveCommandSettings } from './turn/turnExecutionState';

export async function* compressSessionMemory(
  envelope: CompressMemoryEnvelope,
  sessions: SessionRepository,
  context: ExecutionContextProvider,
): AsyncIterable<ExecutionFrame> {
  const base = await loadCommandBase(envelope, sessions);
  if (base.type === 'terminal') {
    yield base.frame;
    return;
  }

  const story = base.snapshot.state.story;
  const settings = resolveCommandSettings(story, await context.captureDeviceOverlay()).记忆系统;
  const reduction = reduceMemory(story.memory.system, story.conversation.turnCount, envelope.command, settings);
  if (reduction.type === 'rejected') {
    yield rejectedFrame(envelope, { code: 'no_changes', message: reduction.message });
    return;
  }

  yield await commitCommand(envelope, sessions, {
    story: { ...story, memory: { ...story.memory, system: reduction.memory } },
  });
}

function reduceMemory(
  memory: import('@/models/memory').记忆系统,
  turn: number,
  command: CompressMemoryEnvelope['command'],
  settings: import('@/models/settings').记忆系统设置,
): { type: 'next'; memory: import('@/models/memory').记忆系统 } | { type: 'rejected'; message: string } {
  const sourceCount = command.layer === 'immediate'
    ? memory.即时记忆.length
    : command.layer === 'short'
      ? memory.短期记忆.length
      : (memory.中期记忆 ?? []).length;
  if (sourceCount === 0) return { type: 'rejected', message: 'Selected memory layer is empty' };

  const threshold = command.layer === 'immediate'
    ? settings.即时转短期阈值
    : command.layer === 'short'
      ? settings.短期转中期阈值
      : settings.中期转长期阈值;
  if (sourceCount < threshold && !command.force) {
    return { type: 'rejected', message: `Memory layer has ${sourceCount}/${threshold} required entries` };
  }
  const batchSize = Math.min(sourceCount, threshold);
  const next = command.layer === 'immediate'
    ? compressToShortTerm(memory, turn, batchSize)
    : command.layer === 'short'
      ? compressToMiddleTerm(memory, turn, batchSize)
      : compressToLongTerm(memory, turn, batchSize);
  return { type: 'next', memory: next };
}
