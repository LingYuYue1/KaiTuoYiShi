/**
 * CommandRunner — the single private command lifecycle used by every
 * state-changing capability method (IKernelIdealRefactorPlan §3).
 *
 * Capability groups (turns/media/…) never implement their own lifecycle,
 * CAS, retry, or cancellation machinery: they build a typed envelope and
 * delegate here. The runner adapts the kernel execution stream into the
 * public GameEvent protocol:
 *
 *   - eager start (execution begins before any subscriber attaches);
 *   - monotonic per-command sequence starting at 0 with command.accepted;
 *   - exactly one terminal event; result settles exactly once;
 *   - hot multicast stream (no history replay — late consumers resync
 *     through session.projection);
 *   - cancellation only through cancelAndWait().
 */

import type {
  CommandEnvelope,
  ExecutionFrame,
  SessionView,
} from '@/src/kernel/contract';
import type { CommandExecutor } from './CommandExecutor';
import type {
  CommandHandle,
  CommandTerminal,
  GameEvent,
  MulticastEventStream,
  Unsubscribe,
} from '@/src/kernel/contract/session';

class HotEventStream<Event> implements MulticastEventStream<Event> {
  private readonly listeners = new Set<(event: Event) => void>();
  private ended = false;

  emit(event: Event): void {
    if (this.ended) return;
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (error) {
        console.error('Command event subscriber failed', error);
      }
    }
  }

  end(): void {
    this.ended = true;
    this.listeners.clear();
  }

  subscribe(listener: (event: Event) => void): Unsubscribe {
    if (this.ended) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  [Symbol.asyncIterator](): AsyncIterator<Event> {
    const queue: Event[] = [];
    let wake: (() => void) | null = null;
    let done = this.ended;
    const unsubscribe = this.subscribe((event) => {
      queue.push(event);
      wake?.();
    });
    const finish = () => {
      done = true;
      unsubscribe();
      wake?.();
    };
    this.onEnd.push(finish);
    return {
      next: async (): Promise<IteratorResult<Event>> => {
        for (;;) {
          const item = queue.shift();
          if (item !== undefined) return { value: item, done: false };
          if (done || this.ended) return { value: undefined, done: true };
          await new Promise<void>((resolve) => { wake = resolve; });
          wake = null;
        }
      },
      return: async (): Promise<IteratorResult<Event>> => {
        // Detaching never cancels the command.
        finish();
        return { value: undefined, done: true };
      },
    };
  }

  readonly onEnd: Array<() => void> = [];

  endAll(): void {
    for (const finish of [...this.onEnd]) finish();
    this.onEnd.length = 0;
    this.end();
  }
}

export class CommandRunner {
  constructor(private readonly kernel: CommandExecutor) {}

  /**
   * Start a command eagerly and return its handle.
   * `mapResult` converts the committed frame's view into the typed result.
   */
  run<Result>(
    envelope: CommandEnvelope,
    mapResult: (view: SessionView, revision: number) => Result,
  ): CommandHandle<GameEvent, Result> {
    const stream = new HotEventStream<GameEvent>();
    let sequence = 0;
    const emit = (event: Omit<GameEvent, 'sequence' | 'commandId'> & { type: GameEvent['type'] }): void => {
      stream.emit({ ...(event as object), commandId: envelope.commandId, sequence: sequence++ } as GameEvent);
    };

    let settle!: (terminal: CommandTerminal<Result>) => void;
    const result = new Promise<CommandTerminal<Result>>((resolve) => { settle = resolve; });
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => { markStarted = resolve; });
    let cancelRequested = false;

    // Eager consumption: runs regardless of event subscribers.
    void (async () => {
      let terminal: CommandTerminal<Result> | null = null;
      try {
        const iterator = this.kernel.execute(envelope)[Symbol.asyncIterator]();
        let nextFrame = iterator.next();
        markStarted();
        if (cancelRequested) void this.kernel.cancelAndWait(envelope.commandId);

        for (let item = await nextFrame; !item.done; item = await iterator.next()) {
          const frame = item.value;
          if (frame.type === 'accepted') {
            emit({ type: 'command.accepted' } as GameEvent);
            continue;
          }
          if (frame.type === 'prepared') {
            emit({ type: 'turn.prepared', view: frame.view } as GameEvent);
            continue;
          }
          if (frame.type === 'stage.changed') {
            emit({ type: 'stage.changed', stage: frame.stage } as GameEvent);
            continue;
          }
          if (frame.type === 'stage.retrying') {
            emit({ type: 'stage.retrying', stage: frame.stage, attempt: frame.attempt, limit: frame.limit } as GameEvent);
            continue;
          }
          if (frame.type === 'progress') {
            emit({ type: 'narrative.delta', text: frame.delta.text } as GameEvent);
            continue;
          }
          if (frame.type === 'assistant.ready') {
            emit({ type: 'assistant.ready', message: frame.message } as GameEvent);
            continue;
          }
          if (frame.type === 'committed') {
            terminal = { outcome: 'committed', result: mapResult(frame.view, Number(frame.revision)) };
            emit({ type: 'command.committed', revision: frame.revision, view: frame.view } as GameEvent);
            // Exactly one terminal: stop consuming — a malformed second
            // terminal from the kernel must not reach subscribers.
            break;
          }
          if (frame.type === 'rejected') {
            terminal = { outcome: 'rejected', error: frame.error };
            emit({ type: 'command.rejected', error: frame.error } as GameEvent);
            break;
          }
          const exhaustive: never = frame;
          throw new Error(`Unknown execution frame: ${String((exhaustive as { type: string }).type)}`);
        }
        if (!terminal) {
          terminal = {
            outcome: 'rejected',
            error: { code: 'unknown', message: 'Command stream ended without a terminal frame' },
          };
          emit({ type: 'command.rejected', error: terminal.error } as GameEvent);
        }
      } catch (error) {
        // A throw after the terminal was emitted must not produce a second one.
        if (!terminal) {
          terminal = {
            outcome: 'rejected',
            error: {
              code: 'unknown',
              message: error instanceof Error ? error.message : String(error),
            },
          };
          emit({ type: 'command.rejected', error: terminal.error } as GameEvent);
        }
      } finally {
        stream.endAll();
        settle(terminal ?? {
          outcome: 'rejected',
          error: { code: 'unknown', message: 'Command settled without terminal' },
        });
      }
    })();

    const kernel = this.kernel;
    return {
      commandId: envelope.commandId,
      events: stream,
      result,
      cancelAndWait: async (): Promise<CommandTerminal<Result>> => {
        cancelRequested = true;
        await started;
        // Idempotent: settled commands return their stored terminal. Waiting
        // for `started` also makes same-tick cancellation linearizable: the
        // executor has registered the command before cancellation is routed.
        await kernel.cancelAndWait(envelope.commandId);
        return result;
      },
    };
  }
}
