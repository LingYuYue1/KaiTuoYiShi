/**
 * Production IKernel contract barrel (Phase 1 / Stage 5.1).
 * Source of truth for App / adapters / UI kernel client / tests.
 */

export type {
  AdvanceTurn,
  AdvanceTurnEnvelope,
  CommandEnvelope,
  CheckpointSession,
  CheckpointSessionEnvelope,
  CommandId,
  CreateSession,
  CreateSessionEnvelope,
  Revision,
  ResetSession,
  ResetSessionEnvelope,
  RegenerateNarrativeImage,
  RegenerateNarrativeImageEnvelope,
  RetryQueueTask,
  RetryQueueTaskEnvelope,
  RerollTurn,
  RerollTurnEnvelope,
  SessionCommand,
  SessionCommandEnvelope,
  SessionId,
} from './commands';
export { asCommandId, asRevision, asSessionId } from './commands';

export type {
  CommittedFrame,
  ExecutionFrame,
  NarrativeProgressDelta,
  ProgressFrame,
  RejectedFrame,
} from './frames';

export type { KernelError, KernelErrorCode } from './errors';

export type { KernelQuery, SessionExistsQuery, SessionReadQuery } from './queries';

export type {
  QueryResult,
  SessionExistenceView,
  SessionView,
  TurnView,
} from './projections';

export type { IKernel } from './IKernel';
