/**
 * Production IKernel contract barrel (Phase 1).
 * Source of truth for App / adapters / UI kernel client / tests.
 */

export type {
  AdvanceTurn,
  AdvanceTurnEnvelope,
  CommandEnvelope,
  CommandId,
  CreateSession,
  CreateSessionEnvelope,
  Revision,
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

export type { KernelQuery } from './queries';

export type {
  QueryResult,
  SessionMessageView,
  SessionView,
  SettingsView,
  TurnView,
} from './projections';

export type { IKernel } from './IKernel';
