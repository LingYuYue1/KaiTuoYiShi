/**
 * UI Projection Store (Phase 3 Stage 3.3 core types).
 *
 * Pure functions only — no React, no dbService, no formal writes.
 *
 * Rules:
 * - progress: temporary stream buffer only
 * - committed: replaces session projection; clears progress
 * - rejected: clears progress; keeps last committed session
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
  session: SessionView;
  progress: ProjectionProgress | null;
}>;

export function createProjectionState(session: SessionView): ProjectionState {
  return { session, progress: null };
}

/**
 * Apply one ExecutionFrame. Pure: returns a new ProjectionState.
 */
export function applyExecutionFrame(
  state: ProjectionState,
  frame: ExecutionFrame,
): ProjectionState {
  switch (frame.type) {
    case 'progress':
      return appendProgress(state, frame.commandId, frame.delta.text);
    case 'committed':
      return {
        session: frame.view,
        progress: null,
      };
    case 'rejected':
      return {
        ...state,
        progress: null,
      };
    default: {
      const _exhaustive: never = frame;
      void _exhaustive;
      return state;
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
