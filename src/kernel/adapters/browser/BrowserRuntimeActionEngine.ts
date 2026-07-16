import {
  regenerateNarrativeImagesForMessage,
  retryQueueTask,
} from '@/src/kernel/workflows/sendWorkflow';
import type { RuntimeGameState } from '@/src/kernel/domain/session/runtimeState';
import type { RuntimeActionEngine } from '@/src/kernel/ports';
import { createDraftState, snapshotDraftState } from './BrowserTurnEngine';

export class BrowserRuntimeActionEngine implements RuntimeActionEngine {
  async regenerateNarrativeImage(
    runtime: RuntimeGameState,
    messageId: string,
    signal: AbortSignal,
  ): Promise<RuntimeGameState> {
    const state = createDraftState(runtime);
    const detach = bindAbortSignal(state.abortControllerRef, signal);
    try {
      await regenerateNarrativeImagesForMessage(state, messageId);
      if (signal.aborted) throw new DOMException('Runtime action aborted', 'AbortError');
      return snapshotDraftState(state);
    } finally {
      detach();
    }
  }

  async retryQueueTask(
    runtime: RuntimeGameState,
    taskId: string,
    mode: 'retry' | 'reroll',
    signal: AbortSignal,
  ): Promise<RuntimeGameState> {
    const task = runtime.queueTasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new Error(`Queue task not found: ${taskId}`);
    const state = createDraftState(runtime);
    const detach = bindAbortSignal(state.abortControllerRef, signal);
    try {
      await retryQueueTask(state, task, mode);
      if (signal.aborted) throw new DOMException('Runtime action aborted', 'AbortError');
      return snapshotDraftState(state);
    } finally {
      detach();
    }
  }
}

function bindAbortSignal(
  ref: { current: AbortController | null },
  signal: AbortSignal,
): () => void {
  const abort = () => ref.current?.abort();
  signal.addEventListener('abort', abort, { once: true });
  return () => signal.removeEventListener('abort', abort);
}
