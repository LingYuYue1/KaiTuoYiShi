/**
 * IKernel execution frame contract.
 * Must not import old models, services, hooks, or UI types.
 */

import type { CommandId, Revision } from './commands';
import type { KernelError } from './errors';
import type { MessageProjection, SessionView } from './projections';

export type TurnStage =
  | 'preparing-player-message'
  | 'resolving-content'
  | 'retrieving-context'
  | 'planning-request'
  | 'generating'
  | 'parsing'
  | 'assistant-ready'
  | 'reducing'
  | 'committing';

export type AcceptedFrame = Readonly<{
  type: 'accepted';
  commandId: CommandId;
}>;

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

export type StageChangedFrame = Readonly<{
  type: 'stage.changed';
  commandId: CommandId;
  stage: TurnStage;
}>;

export type StageRetryingFrame = Readonly<{
  type: 'stage.retrying';
  commandId: CommandId;
  stage: TurnStage;
  attempt: number;
  limit: number;
}>;

export type AssistantReadyFrame = Readonly<{
  type: 'assistant.ready';
  commandId: CommandId;
  message: MessageProjection;
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

export type ExecutionFrame =
  | AcceptedFrame
  | PreparedFrame
  | StageChangedFrame
  | StageRetryingFrame
  | ProgressFrame
  | AssistantReadyFrame
  | CommittedFrame
  | RejectedFrame;
