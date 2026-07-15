/**
 * Production IKernel contract barrel (Phase 1 / Stage 5.1).
 * Source of truth for App / adapters / UI kernel client / tests.
 */

export type {
  AdvanceTurn,
  AdvanceTurnEnvelope,
  ApplyVariables,
  ApplyVariablesEnvelope,
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
  TravelerVariablesView,
  TurnView,
} from './projections';
export { createTravelerVariablesView } from './projections';

export type { IKernel } from './IKernel';
