/**
 * IKernel execution frame contract (Phase 1).
 * Must not import old models, services, hooks, or UI types.
 */

import type { CommandId, Revision } from './commands';
import type { KernelError } from './errors';
import type { SessionView } from './projections';

export type NarrativeProgressDelta = Readonly<{
  kind: 'narrative';
  text: string;
}>;

/** Command-scoped display override before formal commit (e.g. pre-reroll truncated history). */
export type PreparedFrame = Readonly<{
  type: 'prepared';
  commandId: CommandId;
  view: SessionView;
}>;

export type ProgressFrame = Readonly<{
  type: 'progress';
  commandId: CommandId;
  delta: NarrativeProgressDelta;
}>;

export type CommittedFrame = Readonly<{
  type: 'committed';
  commandId: CommandId;
  revision: Revision;
  view: SessionView;
}>;

export type RejectedFrame = Readonly<{
  type: 'rejected';
  commandId: CommandId;
  error: KernelError;
}>;

export type ExecutionFrame = PreparedFrame | ProgressFrame | CommittedFrame | RejectedFrame;
