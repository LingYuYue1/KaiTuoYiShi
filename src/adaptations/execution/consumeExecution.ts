/**
 * Async KernelClient — routes ExecutionFrames to a UI sink.
 *
 * showPrepared → draft projection only (not formal commit)
 * showProgress → temporary buffer only
 * replaceProjection → formal projection / state
 * showError → error presentation
 */

import type {
  CommandEnvelope,
  CommittedFrame,
  ExecutionFrame,
  IKernel,
  KernelError,
  NarrativeProgressDelta,
  RejectedFrame,
  SessionView,
} from '@/src/kernel/contract';

export type ExecutionSink = Readonly<{
  /** Command-scoped draft projection (e.g. pre-reroll truncated history). */
  showPrepared: (view: SessionView) => void;
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
): Promise<CommittedFrame | RejectedFrame> {
  let terminal: CommittedFrame | RejectedFrame | null = null;

  for await (const frame of kernel.execute(command)) {
    if (terminal) {
      throw new Error(
        `IKernel protocol violation: ${frame.type} frame emitted after ${terminal.type}`,
      );
    }
    if (frame.commandId !== command.commandId) {
      throw new Error(
        `IKernel protocol violation: frame commandId ${frame.commandId} does not match ${command.commandId}`,
      );
    }
    dispatchFrame(frame, sink);
    if (frame.type === 'committed' || frame.type === 'rejected') {
      terminal = frame;
    }
  }

  if (!terminal) {
    throw new Error('IKernel protocol violation: execution completed without a terminal frame');
  }
  return terminal;
}

function dispatchFrame(frame: ExecutionFrame, sink: ExecutionSink): void {
  switch (frame.type) {
    case 'prepared':
      sink.showPrepared(frame.view);
      break;
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
      const _exhaustive: never = frame;
      throw new Error(`IKernel protocol violation: unknown frame ${String(_exhaustive)}`);
    }
  }
}
