/**
 * Production IKernel contract barrel.
 * Source of truth for App / adapters / UI kernel client / tests.
 */

export type {
  AdvanceTurn,
  AdvanceTurnEnvelope,
  CommandEnvelope,
  CompressMemory,
  CompressMemoryEnvelope,
  CommandId,
  CreateSession,
  CreateSessionEnvelope,
  DeclinePathAwakening,
  DeclinePathAwakeningEnvelope,
  EditMessageBody,
  EditMessageBodyEnvelope,
  EnterPathAwakening,
  EnterPathAwakeningEnvelope,
  Revision,
  ResetSession,
  ResetSessionEnvelope,
  RegenerateNarrativeImage,
  RegenerateNarrativeImageEnvelope,
  RerollTurn,
  RerollTurnEnvelope,
  SessionCommand,
  SessionCommandEnvelope,
  SessionCommandRequestEnvelope,
  SessionId,
  SetPrimaryPath,
  SetPrimaryPathEnvelope,
  SetStoryMode,
  SetStoryModeEnvelope,
  SetCompanionTier,
  SetCompanionTierEnvelope,
  SetCompanionTraveling,
  SetCompanionTravelingEnvelope,
  SkillDraftInput,
  SaveSkill,
  SaveSkillEnvelope,
  DeleteSkill,
  DeleteSkillEnvelope,
  SetSkillEnabled,
  SetSkillEnabledEnvelope,
  UseInventoryItem,
  UseInventoryItemEnvelope,
  DropInventoryItem,
  DropInventoryItemEnvelope,
  UndoInventoryDrop,
  UndoInventoryDropEnvelope,
  CreateZhikuEntry,
  CreateZhikuEntryEnvelope,
  UpdateZhikuEntry,
  UpdateZhikuEntryEnvelope,
  DeleteZhikuEntry,
  DeleteZhikuEntryEnvelope,
  RefreshBundledZhiku,
  RefreshBundledZhikuEnvelope,
  PlotCommand,
  PlotCommandEnvelope,
  StorySegmentDraftInput,
  AlbumCommand,
  AlbumCommandEnvelope,
  PhoneCommand,
} from './commands';
export { asCommandId, asRevision, asSessionId } from './commands';

export type {
  AcceptedFrame,
  CommittedFrame,
  ExecutionFrame,
  AssistantReadyFrame,
  NarrativeProgressDelta,
  PreparedFrame,
  ProgressFrame,
  RejectedFrame,
  StageChangedFrame,
  StageRetryingFrame,
  TurnStage,
} from './frames';

export type { KernelError, KernelErrorCode } from './errors';

export type { KernelQuery, SessionExistsQuery, SessionReadQuery } from './queries';

export type {
  KernelLogEntry,
  KernelLogInput,
  KernelLogLevel,
  KernelLogProjection,
  KernelLogValue,
} from './logging';

export type {
  QueryResult,
  SessionExistenceView,
  SessionView,
  MessageProjection,
  JobKind,
  JobProjection,
  GameProjection,
  TurnView,
} from './projections';

export type { IKernel } from './rootCapabilities';
