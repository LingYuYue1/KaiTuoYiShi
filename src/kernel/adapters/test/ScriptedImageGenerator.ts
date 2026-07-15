/**
 * Test ImageGenerator: yields scripted frames (progress / success / failure).
 * Production image transport lives under adapters later; this is for tests only.
 */

import type {
  ImageGenerateFailure,
  ImageGenerateFrame,
  ImageGenerateProgress,
  ImageGenerateRequest,
  ImageGenerateSuccess,
  ImageGenerator,
} from '@/src/kernel/ports/ImageGenerator';

export type ScriptedImageOutcome =
  | Readonly<{
      kind: 'success';
      bytes: Uint8Array;
      mimeType: string;
      model?: string;
      backend?: string;
      originalUrl?: string;
      /** Optional progress frames before success. */
      progress?: readonly Omit<ImageGenerateProgress, 'type'>[];
    }>
  | Readonly<{
      kind: 'failure';
      message: string;
      /** Optional progress frames before failure frame. */
      progress?: readonly Omit<ImageGenerateProgress, 'type'>[];
    }>
  | Readonly<{
      kind: 'throw';
      message: string;
    }>;

export type ScriptedImageHandler = (
  request: ImageGenerateRequest,
) => ScriptedImageOutcome | Promise<ScriptedImageOutcome>;

/**
 * ImageGenerator driven by a fixed handler or FIFO queue of outcomes.
 */
export class ScriptedImageGenerator implements ImageGenerator {
  private readonly queue: ScriptedImageOutcome[] = [];
  private handler: ScriptedImageHandler | null;

  constructor(handler?: ScriptedImageHandler) {
    this.handler = handler === undefined ? null : handler;
  }

  /** Enqueue a fixed outcome for the next generate() call (FIFO). */
  enqueue(outcome: ScriptedImageOutcome): void {
    this.queue.push(outcome);
  }

  setHandler(handler: ScriptedImageHandler): void {
    this.handler = handler;
  }

  async *generate(
    request: ImageGenerateRequest,
  ): AsyncIterable<ImageGenerateFrame> {
    const outcome = await this.resolveOutcome(request);

    if (outcome.kind === 'throw') {
      throw new Error(outcome.message);
    }

    if (outcome.progress) {
      for (const frame of outcome.progress) {
        const progress: ImageGenerateProgress = {
          type: 'progress',
          attempt: frame.attempt,
          totalAttempts: frame.totalAttempts,
          ...(frame.message !== undefined ? { message: frame.message } : {}),
        };
        yield progress;
      }
    }

    if (outcome.kind === 'failure') {
      const failure: ImageGenerateFailure = {
        type: 'failure',
        message: outcome.message,
      };
      yield failure;
      return;
    }

    // success
    const success: ImageGenerateSuccess = {
      type: 'success',
      bytes: new Uint8Array(outcome.bytes),
      mimeType: outcome.mimeType,
      ...(outcome.model !== undefined ? { model: outcome.model } : {}),
      ...(outcome.backend !== undefined ? { backend: outcome.backend } : {}),
      ...(outcome.originalUrl !== undefined
        ? { originalUrl: outcome.originalUrl }
        : {}),
    };
    yield success;
  }

  private async resolveOutcome(
    request: ImageGenerateRequest,
  ): Promise<ScriptedImageOutcome> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    if (this.handler) {
      return this.handler(request);
    }
    throw new Error('ScriptedImageGenerator: no queued outcome and no handler');
  }
}
