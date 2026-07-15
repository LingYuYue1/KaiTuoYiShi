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
  NewsApply,
  NewsApplyEnvelope,
  NewsGenerate,
  NewsGenerateEnvelope,
  PhoneReply,
  PhoneReplyEnvelope,
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
  KnowledgeView,
  NewsView,
  PhoneView,
  QueryResult,
  SessionMessageView,
  SessionView,
  SettingsView,
  TravelerVariablesView,
  TurnView,
} from './projections';
export {
  createEmptyKnowledgeView,
  createEmptyNewsView,
  createEmptyPhoneView,
  createTravelerVariablesView,
} from './projections';

export type { IKernel } from './IKernel';
