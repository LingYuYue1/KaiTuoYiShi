/**
 * Async KernelClient — routes ExecutionFrames to a UI sink.
 *
 * showProgress → temporary buffer only
 * replaceProjection → formal projection / state
 * showError → error presentation
 */

import type {
  CommandEnvelope,
  ExecutionFrame,
  IKernel,
  KernelError,
  NarrativeProgressDelta,
  SessionView,
} from '@/src/kernel/contract';

export type ExecutionSink = Readonly<{
  /** Temporary stream buffer only — must not formal-commit game state. */
  showProgress: (delta: NarrativeProgressDelta) => void;
  /** Formal projection replacement after committed. */
  replaceProjection: (view: SessionView) => void;
  /** Error presentation after rejected. */
  showError: (error: KernelError) => void;
}>;

/**
 * Consume a single command's frame stream and dispatch to the sink.
 * Does not interpret domain rules; pure frame routing.
 */
export async function consumeExecution(
  kernel: IKernel,
  command: CommandEnvelope,
  sink: ExecutionSink,
): Promise<void> {
  for await (const frame of kernel.execute(command)) {
    dispatchFrame(frame, sink);
  }
}

function dispatchFrame(frame: ExecutionFrame, sink: ExecutionSink): void {
  switch (frame.type) {
    case 'progress':
      sink.showProgress(frame.delta);
      break;
    case 'committed':
      sink.replaceProjection(frame.view);
      break;
    case 'rejected':
      sink.showError(frame.error);
      break;
    default: {
      // Exhaustiveness: unexpected frame shapes fail fast.
      const _exhaustive: never = frame;
      void _exhaustive;
      break;
    }
  }
}
