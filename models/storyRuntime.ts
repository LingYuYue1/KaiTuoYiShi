// 由 scripts/story-runtime-domain-model-regression.mjs 的 generateDomainModels 从
// scripts/fixtures/story-v3/story-runtime-contract.fixture.json 生成（contractRevision 2）
// fixture fingerprint: sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6
// 本文件只声明领域类型，不实现任何运行逻辑；禁止被现有生产运行流程 import。
// 类型唯一来源为冻结 fixture；任何字段/枚举/联合变化必须走 schema revision。

import type { TurnAdjudicationReceipt } from './storyRuntimeCommands';
import type { NarrativePublicationRecord } from './storyRuntimeNarrative';
import type { AudienceSnapshot, KnowledgeReceipt, KnowledgeSubjectRef, KnowledgeSubjectType, NewsArticleAggregate, ObserverReadCursor, ProjectionOutboxItem } from './storyRuntimeProjection';

// JsonValue 是全项目唯一的递归 JSON 值类型定义（open_map 的值形态）。
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type WorldEventInstanceStatus = 'scheduled' | 'active' | 'blocked' | 'resolution_pending' | 'resolved' | 'cancelled' | 'superseded' | 'missed' | 'archived';

export type WorldEventResolutionMode = 'player' | 'world_background' | 'shared' | 'player_early' | 'unknown';

export type EventDefinitionResolutionMode = 'player' | 'world_background' | 'shared' | 'player_early';

export type WorldEventOutcome = 'normal' | 'deviated' | 'escaped' | 'failed' | 'unknown';

export type WorldEventReplayPolicy = 'once' | 'allow_new_instance' | 'repeatable';

export type WorldEventDefinitionOrigin = 'catalog' | 'emergent';

export type WorldEntityType = 'npc' | 'faction' | 'location' | 'faction_asset' | 'system';

export type WorldEntityStatus = 'active' | 'inactive' | 'destroyed' | 'unknown';

export type StoryFocusStatus = 'active' | 'blocked' | 'awaiting_player' | 'completed' | 'diverged';

export type EvidenceLevel = 'confirmed' | 'supported';

export type FactCreatedBy = 'player_turn' | 'world_due' | 'manual_import' | 'system_migration' | 'debug' | 'path_command' | 'system';

export type PublicScheduleStatus = 'planned' | 'postponed' | 'cancelled' | 'fulfilled';

export type OfficialNoticeStatus = 'active' | 'withdrawn' | 'superseded';

export type PlayerPlanItemStatus = 'available' | 'selected' | 'blocked' | 'expired' | 'completed' | 'replaced';

export type AcceptanceMode = '正文承接' | '系统命令' | '交汇承接';

export type WorldPlanItemStatus = 'scheduled' | 'active' | 'blocked' | 'expired' | 'fulfilled' | 'cancelled';

export type ConvergenceItemStatus = 'available' | 'offered' | 'accepted' | 'declined' | 'expired' | 'resolved';

export type RuntimeMigrationStatus = 'none' | 'pending_confirmation' | 'migrated' | 'read_only_recovery' | 'failed';

export type PayloadMatcherOperator = 'equals' | 'one_of' | 'gte' | 'lte' | 'contains';

export type AdvanceTimeReason = 'turn_default' | 'narrative_duration' | 'player_wait' | 'travel' | 'world_due';

export type PathCommandAction = 'enter' | 'decline' | 'judge';

export type EvidenceRefKind = 'narrative_span' | 'system_command' | 'gameplay_receipt' | 'schedule_record' | 'notice_record' | 'broadcast_record' | 'article_version' | 'migration_record' | 'projection_record' | 'narrative_publication';

export type PublicScopeKind = 'private' | 'local' | 'faction' | 'public' | 'broadcast';

export type ArticleAudienceKind = 'player_observer' | 'player_character' | 'npc' | 'faction';

export interface StoryRuntimeState {
  schemaVersion: 3;
  runtimeBranchId: string;
  saveNodeId: string;
  assetCatalogFingerprint: string;
  runtimeRevision: number;
  turnCount: number;
  lastCommittedTurnId?: string;
  gameClock: GameClock;
  activeTrackId?: string;
  focus: StoryFocus;
  playerPlanPool: PlayerPlanItem[];
  worldPlanPool: WorldPlanItem[];
  convergenceQueue: ConvergenceItem[];
  worldEvents: WorldEventInstance[];
  entities: WorldEntityState[];
  factLedger: CommittedWorldFact[];
  publicSchedules: PublicSchedule[];
  officialNotices: OfficialNotice[];
  knowledgeGrants: KnowledgeGrant[];
  commandIdempotencyIndex: Record<string, { commandFingerprint: string; resultRevision: number; resultCode: string; receiptId: string; resultHash: string; resultRef: { saveNodeId: string; stateFingerprint: string } }>;
  turnReceipts: TurnAdjudicationReceipt[];
  narrativePublications: NarrativePublicationRecord[];
  migration: RuntimeMigrationMeta;
}

export interface StoryRuntimeView {
  core: StoryRuntimeState;
  projections: StoryProjectionState;
  outbox: ProjectionOutboxItem[];
}

export interface StoryProjectionState {
  runtimeBranchId: string;
  newsArticles: NewsArticleAggregate[];
  knowledgeReceipts: KnowledgeReceipt[];
  observerReadCursors: ObserverReadCursor[];
  projectionRevisions: Record<string, number>;
}

export interface GameTime {
  dayOrdinal: number;
  minuteOfDay: number;
}

export interface GameClock {
  now: GameTime;
  defaultAdvanceMinutes: number;
  policyVersion: number;
  lastAdvanceRevision: number;
  lastAdvanceCommandId?: string;
}

export interface StoryFocus {
  focusId: string;
  trackId?: string;
  unitId?: string;
  status: StoryFocusStatus;
  reasonCodes: string[];
  enteredAtRevision: number;
}

export interface WorldEntityState {
  entityId: string;
  entityType: WorldEntityType;
  status: WorldEntityStatus;
  locationId?: string;
  anchorId?: string;
  attributes: Record<string, string | number | boolean | null>;
  stateRevision: number;
}

export interface WorldEventDefinition {
  eventDefinitionId: string;
  origin: WorldEventDefinitionOrigin;
  title: string;
  trackId?: string;
  actorEntityIds: string[];
  targetEntityIds: string[];
  dependencyDefinitionIds: string[];
  completionPredicate: CompletionPredicate;
  scheduling: WorldEventDefinitionScheduling;
  allowedResolutionModes: EventDefinitionResolutionMode[];
  replayPolicy: WorldEventReplayPolicy;
  publicScope: PublicScope;
  consequenceDefinitionIds: string[];
  definitionFingerprint: string;
}

export interface WorldEventDefinitionScheduling {
  earliestAt?: GameTime;
  dueAt?: GameTime;
  missAfter?: GameTime;
}

export interface WorldEventInstance {
  eventInstanceId: string;
  eventDefinitionId: string;
  parentInstanceId?: string;
  status: WorldEventInstanceStatus;
  startAt?: GameTime;
  dueAt?: GameTime;
  resolvedAt?: GameTime;
  resolutionMode?: WorldEventResolutionMode;
  outcome?: WorldEventOutcome;
  replayPolicy: WorldEventReplayPolicy;
  participantIds: string[];
  dependencyIds: string[];
  publicFactIds: string[];
  terminalFactId?: string;
  idempotencyKey: string;
  eventResolutionKey?: string;
  source: EvidenceRef;
}

export interface EmergentEventDefinition {
  eventDefinitionId: string;
  origin: 'emergent';
  runtimeBranchId: string;
  causeEvidenceRefs: EvidenceRef[];
  identityAnchors: string[];
  completionPredicate: CompletionPredicate;
  replayPolicy: WorldEventReplayPolicy;
  publicScope: PublicScope;
  definitionFingerprint: string;
}

export interface CompletionPredicate {
  predicateId: string;
  targetEntityIds: string[];
  targetEventInstanceId?: string;
  requiredFactTypes: string[];
  requiredEvidenceKinds: EvidenceRefKind[];
  payloadMatchers: PayloadMatcher[];
  minimumEvidenceCount: number;
  deterministicKey: string;
  allowedOutcomes: string[];
  failureOutcomes: string[];
}

export interface PayloadMatcher {
  path: string;
  operator: PayloadMatcherOperator;
  value: string | number | boolean | string[];
}

export interface CommittedWorldFact {
  factId: string;
  eventInstanceId: string;
  sourceRevision: number;
  factType: string;
  payload: Record<string, JsonValue>;
  occurredAt: GameTime;
  committedAt: GameTime;
  publicScope: PublicScope;
  evidenceRefs: EvidenceRef[];
  evidenceLevel: EvidenceLevel;
  supersedesFactId?: string;
  invalidatesEventInstanceIds: string[];
  playerParticipated: boolean;
  playerObserverVisible: boolean;
  createdBy: FactCreatedBy;
}

export interface ArticlePolicy {
  regionIds: string[];
  audienceKinds: ArticleAudienceKind[];
  category: string;
  aggregationKey: string;
  maxSourceRefs: number;
}

export interface OpeningPrelude {
  preludeId: string;
  runtimeBranchId: string;
  bodyFingerprint: string;
  sourceRefs: OpeningPreludeSourceRef[];
  nonProgressing: boolean;
  idempotencyKey: string;
}

export interface PlayerPlanItem {
  planItemId: string;
  unitId?: string;
  status: PlayerPlanItemStatus;
  dependencyFactIds: string[];
  acceptanceModes: AcceptanceMode[];
  expiresAt?: GameTime;
  evidenceRefs: EvidenceRef[];
}

export interface WorldPlanItem {
  planItemId: string;
  eventDefinitionId: string;
  status: WorldPlanItemStatus;
  dueAt?: GameTime;
  dependencyIds: string[];
  publicScheduleId?: string;
  consequenceDefinitionIds: string[];
  evidenceRefs: EvidenceRef[];
}

export interface ConvergenceItem {
  convergenceId: string;
  sourceFactIds: string[];
  status: ConvergenceItemStatus;
  eligiblePlanItemIds: string[];
  playerDecisionRequired: boolean;
  expiresAt?: GameTime;
  evidenceRefs: EvidenceRef[];
}

export interface RuntimeMigrationMeta {
  status: RuntimeMigrationStatus;
  sourceSaveFingerprint?: string;
  migrationId?: string;
  legacyIdMapFingerprint?: string;
  unresolvedCursorIds: string[];
  warnings: string[];
  confirmedAtRevision?: number;
}

export interface OfficialNotice {
  noticeId: string;
  noticeRevision: number;
  issuerId: string;
  claimFingerprint: string;
  status: OfficialNoticeStatus;
  publicScope: PublicScope;
  source: EvidenceRef;
  issuedAt: GameTime;
  supersedesNoticeId?: string;
}

export interface KnowledgeGrant {
  runtimeBranchId: string;
  grantId: string;
  subjectType: KnowledgeSubjectType;
  subjectId: string;
  subjectRef: KnowledgeSubjectRef;
  effectiveFromRuntimeRevision: number;
  audienceSnapshot?: AudienceSnapshot;
  evidenceRefs: EvidenceRef[];
  idempotencyKey: string;
}

export interface PublicSchedule {
  scheduleId: string;
  sourceDefinitionId: string;
  status: PublicScheduleStatus;
  plannedAt: GameTime;
  publicScope: PublicScope;
  source: EvidenceRef;
  scheduleRevision: number;
  idempotencyKey: string;
}

export type EvidenceRef =
  | { kind: 'narrative_span'; responseId: string; messageId?: string; bodyFingerprint: string; normalizationVersion: number; startOffset: number; endOffset: number; textFingerprint: string }
  | { kind: 'system_command'; commandId: string; commandFingerprint: string }
  | { kind: 'gameplay_receipt'; receiptId: string; receiptType: string }
  | { kind: 'schedule_record'; scheduleId: string; scheduleRevision: number }
  | { kind: 'notice_record'; noticeId: string; noticeRevision: number }
  | { kind: 'broadcast_record'; broadcastId: string; deliveryId?: string; sourceRevision: number; recipientSnapshotFingerprint: string }
  | { kind: 'article_version'; articleId: string; articleVersion: number; claimFingerprint: string }
  | { kind: 'migration_record'; migrationId: string; sourcePath: string; sourceFingerprint: string }
  | { kind: 'projection_record'; projectionKind: string; projectionId: string; projectionRevision: number }
  | { kind: 'narrative_publication'; publicationId: string; bodyFingerprint: string; commitReceiptId: string }

export type PublicScope =
  | { kind: 'private' }
  | { kind: 'local'; locationIds: string[]; anchorIds?: string[] }
  | { kind: 'faction'; factionIds: string[] }
  | { kind: 'public'; regionIds?: string[] }
  | { kind: 'broadcast'; networkIds: string[]; recipientIds?: string[] }

export type OpeningPreludeSourceRef =
  | { kind: 'official_notice'; noticeId: string; noticeRevision: number }
  | { kind: 'public_schedule'; scheduleId: string; scheduleRevision: number }
  | { kind: 'manual'; draftId: string; nonProgressing: true }
