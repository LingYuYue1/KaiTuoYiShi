/**
 * Thin bridge: turns an injectable legacy advanceTurn runner into
 * ExecutionFrame stream (progress → committed | rejected).
 *
 * Used by composition root / tests. No domain rules — pure event translation.
 */

import type {
  AdvanceTurnEnvelope,
  ExecutionFrame,
  KernelError,
  SessionView,
} from '@/src/kernel/contract';
import {
  asRevision,
  createEmptyAlbumView,
  createEmptyKnowledgeView,
  createEmptyNewsView,
  createEmptyPhoneView,
} from '@/src/kernel/contract';

export type LegacyAdvanceTurnEvents = Readonly<{
  /**
   * Called with cumulative narrative preview text as the legacy stream updates.
   * Adapter turns each call into a progress frame (temporary buffer only).
   */
  onProgress: (text: string) => void;
  /**
   * Called once when the legacy workflow formally succeeds.
   * Host must supply the post-commit SessionView projection.
   */
  onCommitted: (view: SessionView) => void;
  /**
   * Called once when the legacy workflow fails or is cancelled.
   */
  onRejected: (error: KernelError) => void;
}>;

/**
 * Host-supplied runner that drives the existing send path (or a fake).
 * Must call onProgress zero-or-more times, then exactly one of
 * onCommitted / onRejected. Throwing is treated as rejected/unknown.
 */
export type LegacyAdvanceTurnRunner = (
  envelope: AdvanceTurnEnvelope,
  events: LegacyAdvanceTurnEvents,
) => Promise<void>;

/**
 * Convert a callback-style legacy runner into an AsyncIterable of frames
 * for LegacyKernelAdapter.advanceTurn.
 */
export function wrapLegacyAdvanceTurn(
  runner: LegacyAdvanceTurnRunner,
  cancel?: () => void,
): (envelope: AdvanceTurnEnvelope) => AsyncIterable<ExecutionFrame> {
  return (envelope) => iterateLegacyAdvanceTurn(runner, envelope, cancel);
}

async function* iterateLegacyAdvanceTurn(
  runner: LegacyAdvanceTurnRunner,
  envelope: AdvanceTurnEnvelope,
  cancel?: () => void,
): AsyncIterable<ExecutionFrame> {
  type Terminal =
    | { kind: 'committed'; view: SessionView }
    | { kind: 'rejected'; error: KernelError };

  const progressQueue: string[] = [];
  // Box mutable terminal so TS control-flow analysis does not treat closure writes as unreachable.
  const state: { terminal: Terminal | null } = { terminal: null };
  let notify: (() => void) | null = null;
  let runnerDone = false;
  let runnerError: unknown = null;

  const wake = () => {
    const n = notify;
    notify = null;
    n?.();
  };

  const waitForEvent = (): Promise<void> =>
    new Promise<void>((resolve) => {
      if (progressQueue.length > 0 || state.terminal || runnerDone) {
        resolve();
        return;
      }
      notify = resolve;
    });

  const runPromise = runner(envelope, {
    onProgress(text) {
      progressQueue.push(text);
      wake();
    },
    onCommitted(view) {
      if (!state.terminal) {
        state.terminal = { kind: 'committed', view };
        wake();
      }
    },
    onRejected(error) {
      if (!state.terminal) {
        state.terminal = { kind: 'rejected', error };
        wake();
      }
    },
  })
    .catch((err) => {
      runnerError = err;
      if (!state.terminal) {
        state.terminal = {
          kind: 'rejected',
          error: {
            code: 'unknown',
            message: err instanceof Error ? err.message : String(err),
          },
        };
      }
    })
    .finally(() => {
      runnerDone = true;
      wake();
    });

  let terminalDelivered = false;
  try {
    // Stream progress as it arrives; emit one terminal when runner finishes.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      while (progressQueue.length > 0) {
        const text = progressQueue.shift()!;
        yield {
          type: 'progress',
          commandId: envelope.commandId,
          delta: { kind: 'narrative', text },
        };
      }

      const term = state.terminal;
      if (term) {
        terminalDelivered = true;
        if (term.kind === 'committed') {
          yield {
            type: 'committed',
            commandId: envelope.commandId,
            revision: term.view.revision,
            view: term.view,
          };
        } else {
          yield {
            type: 'rejected',
            commandId: envelope.commandId,
            error: term.error,
          };
        }
        await runPromise;
        return;
      }

      if (runnerDone) {
        // Runner finished without calling onCommitted/onRejected — treat as reject.
        const message =
          runnerError instanceof Error
            ? runnerError.message
            : runnerError
              ? String(runnerError)
              : 'Legacy advanceTurn finished without a terminal signal';
        terminalDelivered = true;
        yield {
          type: 'rejected',
          commandId: envelope.commandId,
          error: { code: 'unknown', message },
        };
        await runPromise;
        return;
      }

      await waitForEvent();
    }
  } finally {
    if (!terminalDelivered && !runnerDone) cancel?.();
  }
}

/**
 * Build a provisional SessionView when the host tracks only turnCount + messages.
 * revision is a linear formal-commit counter owned by the host for Phase 1.
 * Stage 5.1: travelerName / travelerVariables default for legacy hosts that
 * do not yet project the formal variable slice.
 * Stage 5.2: knowledge defaults to empty counts (legacy hosts do not own formal knowledge yet).
 */
export function buildCommittedSessionView(input: {
  sessionId: SessionView['sessionId'];
  revision: number;
  turnCount: number;
  playerText: string;
  narrativeText: string;
  messages: SessionView['messages'];
  turns?: SessionView['turns'];
  lastProgressTexts?: readonly string[];
  commandId: string;
  travelerName?: string;
  travelerVariables?: SessionView['travelerVariables'];
  knowledge?: SessionView['knowledge'];
}): SessionView {
  const turns =
    input.turns ??
    [
      {
        id: `turn_${input.commandId}`,
        playerText: input.playerText,
        narrativeText: input.narrativeText,
      },
    ];
  const travelerName = input.travelerName ?? '开拓者';
  const travelerVariables = input.travelerVariables ?? {
    姓名: travelerName,
    身份: '',
    外貌: '',
    性格: '',
    背景: '',
    数值属性: {},
  };
  const knowledge = input.knowledge ?? createEmptyKnowledgeView();
  return {
    sessionId: input.sessionId,
    revision: asRevision(input.revision),
    turnCount: input.turnCount,
    turns,
    messages: input.messages,
    travelerName,
    travelerVariables,
    knowledge,
    phone: createEmptyPhoneView(),
    news: createEmptyNewsView(),
    album: createEmptyAlbumView(),
    ...(input.lastProgressTexts ? { lastProgressTexts: input.lastProgressTexts } : {}),
  };
}
