/**
 * Test ModelGateway: yields scripted delta frames then a completed frame.
 * Production AI transport lives under adapters/ai (later); this is for tests only.
 */

import type {
  ModelFrame,
  ModelGateway,
  ModelRequest,
} from '@/src/kernel/ports/ModelGateway';

export type ScriptedModelOutcome =
  | Readonly<{
      kind: 'success';
      /** Stream chunks (each becomes a delta; cumulative join is the completed text unless overridden). */
      chunks: readonly string[];
      /** Full completed text (defaults to chunks.join('')). */
      completedText?: string;
    }>
  | Readonly<{
      kind: 'failure';
      message: string;
      /** Optional deltas emitted before failure. */
      chunks?: readonly string[];
    }>
  | Readonly<{
      kind: 'throw';
      message: string;
    }>;

export type ScriptedModelHandler = (
  request: ModelRequest,
) => ScriptedModelOutcome | Promise<ScriptedModelOutcome>;

/**
 * ModelGateway driven by a fixed handler or FIFO queue of outcomes.
 */
export class ScriptedModelGateway implements ModelGateway {
  private readonly queue: ScriptedModelOutcome[] = [];
  private handler: ScriptedModelHandler | null;

  constructor(handler?: ScriptedModelHandler) {
    this.handler = handler ?? null;
  }

  /** Enqueue a fixed outcome for the next complete() call (FIFO). */
  enqueue(outcome: ScriptedModelOutcome): void {
    this.queue.push(outcome);
  }

  setHandler(handler: ScriptedModelHandler): void {
    this.handler = handler;
  }

  async *complete(request: ModelRequest): AsyncIterable<ModelFrame> {
    const outcome = await this.resolveOutcome(request);

    if (outcome.kind === 'throw') {
      throw new Error(outcome.message);
    }

    if (outcome.kind === 'failure') {
      for (const chunk of outcome.chunks ?? []) {
        yield { type: 'delta', text: chunk };
      }
      throw new ModelGatewayFailure(outcome.message);
    }

    // success
    const emittedChunks: string[] = [];
    for (const chunk of outcome.chunks) {
      emittedChunks.push(chunk);
      yield { type: 'delta', text: emittedChunks.join('') };
    }
    const completedText = outcome.completedText ?? emittedChunks.join('');
    yield { type: 'completed', text: completedText };
  }

  private async resolveOutcome(request: ModelRequest): Promise<ScriptedModelOutcome> {
    if (this.queue.length > 0) {
      return this.queue.shift()!;
    }
    if (this.handler) {
      return this.handler(request);
    }
    throw new Error('ScriptedModelGateway: no queued outcome and no handler');
  }
}

/** Typed failure from the model port (translated to model_failure by executeTurn). */
export class ModelGatewayFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ModelGatewayFailure';
  }
}
