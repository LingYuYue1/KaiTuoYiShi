import type { RuntimeGameState } from '@/src/kernel/domain/session/runtimeState';

export interface RuntimeActionEngine {
  regenerateNarrativeImage(
    state: RuntimeGameState,
    messageId: string,
    signal: AbortSignal,
  ): Promise<RuntimeGameState>;
  retryQueueTask(
    state: RuntimeGameState,
    taskId: string,
    mode: 'retry' | 'reroll',
    signal: AbortSignal,
  ): Promise<RuntimeGameState>;
}
