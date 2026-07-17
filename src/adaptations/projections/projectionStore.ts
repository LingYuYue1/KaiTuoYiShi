/**
 * UI Projection Store (Phase 3 Stage 3.3 core types).
 *
 * Pure functions only — no React, no dbService, no formal writes.
 *
 * Rules:
 * - prepared: draft display override only (e.g. pre-reroll truncated history)
 * - progress: temporary stream buffer only
 * - committed: replaces session projection; clears draft + progress
 * - rejected: clears draft + progress; keeps last committed session
 */

import type {
  CommandId,
  ExecutionFrame,
  SessionView,
} from '@/src/kernel/contract';

export type ProjectionProgress = Readonly<{
  commandId: CommandId;
  narrativeText: string;
}>;

export type ProjectionState = Readonly<{
  /** Last formal committed view. */
  session: SessionView;
  /** Command-scoped display override (e.g. pre-reroll truncated history). */
  draft: SessionView | null;
  progress: ProjectionProgress | null;
}>;

export function createProjectionState(session: SessionView): ProjectionState {
  return { session, draft: null, progress: null };
}

/** Drop command-scoped draft + progress; keep last formal session. */
export function clearProjectionEphemerals(state: ProjectionState): ProjectionState {
  return { session: state.session, draft: null, progress: null };
}

/** Chat / React display: draft overrides session while a command is in flight. */
export function displaySessionView(state: ProjectionState): SessionView {
  return state.draft ?? state.session;
}

/**
 * Apply one ExecutionFrame. Pure: returns a new ProjectionState.
 */
export function applyExecutionFrame(
  state: ProjectionState,
  frame: ExecutionFrame,
): ProjectionState {
  switch (frame.type) {
    case 'prepared':
      return {
        ...clearProjectionEphemerals(state),
        draft: frame.view,
      };
    case 'progress':
      return appendProgress(state, frame.commandId, frame.delta.text);
    case 'committed':
      return {
        ...clearProjectionEphemerals(state),
        session: frame.view,
      };
    case 'rejected':
      return clearProjectionEphemerals(state);
    default: {
      const _exhaustive: never = frame;
      throw new Error(`Unknown execution frame: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Fold a sequence of frames (e.g. after consumeExecution drains a stream).
 */
export function reduceExecutionFrames(
  state: ProjectionState,
  frames: readonly ExecutionFrame[],
): ProjectionState {
  let next = state;
  for (const frame of frames) {
    next = applyExecutionFrame(next, frame);
  }
  return next;
}

function appendProgress(
  state: ProjectionState,
  commandId: CommandId,
  text: string,
): ProjectionState {
  // Same command: replace cumulative narrative text (gateway deltas are cumulative).
  // Different command mid-stream: start a fresh progress buffer.
  if (state.progress && state.progress.commandId === commandId) {
    return {
      ...state,
      progress: { commandId, narrativeText: text },
    };
  }
  return {
    ...state,
    progress: { commandId, narrativeText: text },
  };
}
