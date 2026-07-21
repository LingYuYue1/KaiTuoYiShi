import type { API配置项 } from '@/models/settings';
import { appendApiErrorReport } from '@/services/ai/apiErrorReportService';
import { createRafCoalescedSetter } from '@/utils/rafCoalescedSetter';
import type { TurnExecutionState } from '../turnExecutionState';
import type { SendWorkflowDeps } from '../turnWorkflowTypes';
import { pushQueueTask } from './turnRuntime';

export function createTurnWorkflowControl(input: Readonly<{
  state: TurnExecutionState;
  deps: SendWorkflowDeps;
  config: API配置项;
}>) {
  const controller = new AbortController();
  const abortFromCommand = () => controller.abort(input.deps.signal?.reason);
  if (input.deps.signal?.aborted) abortFromCommand();
  else input.deps.signal?.addEventListener('abort', abortFromCommand, { once: true });
  const progress = createRafCoalescedSetter((text: string) => input.deps.onStreamProgress?.(text));
  let narrativeReady = false;
  input.deps.onStreamProgress?.('');
  pushQueueTask(input.state, 'main_story', 'pending', { detail: '正在调用主剧情模型。', cancellable: true });
  return {
    signal: controller.signal,
    progress,
    startedAt: Date.now(),
    isActive: () => !controller.signal.aborted,
    assertActive: () => {
      if (controller.signal.aborted) throw new DOMException('Workflow aborted', 'AbortError');
    },
    markNarrativeReady: () => { narrativeReady = true; },
    reportFailure: (error: unknown) => reportFailure(input, controller.signal, error),
    dispose: () => {
      progress.cancel();
      if (!controller.signal.aborted && !narrativeReady) markSecondaryTasksIdle(input.state);
      input.deps.signal?.removeEventListener('abort', abortFromCommand);
    },
  };
}

function reportFailure(
  input: Parameters<typeof createTurnWorkflowControl>[0],
  signal: AbortSignal,
  error: unknown,
): never {
  if ((error as Error).name === 'AbortError' || signal.aborted) throw error;
  console.error('Send workflow error:', error);
  const detail = error instanceof Error ? error.message : '主流程调用失败。';
  const alreadyReported = Boolean(
    error && typeof error === 'object' && (error as { alreadyReportedByApiLayer?: boolean }).alreadyReportedByApiLayer,
  );
  if (!alreadyReported) {
    void appendApiErrorReport({
      source: '主剧情工作流',
      config: input.config,
      requestMode: input.state.gameSettings.enableStreaming ? 'stream' : 'non-stream',
      error,
    });
  }
  const attempts = error && typeof error === 'object' && typeof (error as { attempts?: unknown }).attempts === 'number'
    ? Math.max(1, (error as { attempts: number }).attempts)
    : 1;
  pushQueueTask(input.state, 'main_story', 'failed', { detail, failCount: attempts });
  throw error;
}

function markSecondaryTasksIdle(state: TurnExecutionState): void {
  const detail = '主剧情未完成，本轮后台任务未启动。';
  pushQueueTask(state, 'memory', 'idle', { detail });
  pushQueueTask(state, 'variable', 'idle', { detail });
  pushQueueTask(state, 'news', 'idle', { detail });
  pushQueueTask(state, 'autosave', 'idle', { detail });
}
