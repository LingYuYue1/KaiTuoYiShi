import type { ExecutionFrame } from '@/tests/kernel/harness/types';

/** Collect every frame from an IKernel.execute AsyncIterable. */
export async function collectAsync(
  iterable: AsyncIterable<ExecutionFrame>,
): Promise<ExecutionFrame[]> {
  const frames: ExecutionFrame[] = [];
  for await (const frame of iterable) {
    frames.push(frame);
  }
  return frames;
}

export function isTerminalFrame(frame: ExecutionFrame): boolean {
  return frame.type === 'committed' || frame.type === 'rejected';
}

export function terminalFrames(frames: readonly ExecutionFrame[]): ExecutionFrame[] {
  return frames.filter(isTerminalFrame);
}
