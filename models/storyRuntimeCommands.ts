// 由 scripts/story-runtime-domain-model-regression.mjs 的 generateDomainModels 从
// scripts/fixtures/story-v3/story-runtime-contract.fixture.json 生成（contractRevision 2）
// fixture fingerprint: sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6
// 本文件只声明领域类型，不实现任何运行逻辑；禁止被现有生产运行流程 import。
// 类型唯一来源为冻结 fixture；任何字段/枚举/联合变化必须走 schema revision。

import type { AcceptanceMode, AdvanceTimeReason, CompletionPredicate, EvidenceLevel, EvidenceRef, GameTime, JsonValue, PathCommandAction, PublicScope, WorldEventOutcome, WorldEventReplayPolicy, WorldEventResolutionMode } from './storyRuntime';
import type { NarrativeConsistencyDecision } from './storyRuntimeNarrative';
import type { AudienceSelector, KnowledgeSubjectRef, KnowledgeSubjectType } from './storyRuntimeProjection';

export type TurnCommandSource = 'player_turn' | 'world_due' | 'manual' | 'debug' | 'migration' | 'path_command' | 'system';

export type TurnAttemptPhase = 'draft' | 'validating' | 'committing' | 'committed' | 'revealing' | 'revealed' | 'aborted' | 'recovery_required';

export type TurnRecoveryAction = 'resume_reveal' | 'replay_projection' | 'restore_pre_turn' | 'await_user_confirmation';

export interface TurnAdjudicationReceipt {
  receiptId: string;
  runtimeBranchId: string;
  inputRuntimeRevision: number;
  outputRuntimeRevision?: number;
  narrativeDecision?: NarrativeConsistencyDecision;
  acceptedCandidateIds: string[];
  rejectedCandidateIds: string[];
  completedUnitIds: string[];
  blockedReasons: string[];
  sourceFactIds: string[];
  outboxIds: string[];
  errorCodes: string[];
  durationMs: number;
}

export interface TurnAttemptReceipt {
  attemptId: string;
  turnId: string;
  runtimeBranchId: string;
  expectedRuntimeRevision: number;
  committedRuntimeRevision?: number;
  preTurnCheckpointId: string;
  commitReceiptId?: string;
  phase: TurnAttemptPhase;
  failureCode?: string;
  recoveryAction?: TurnRecoveryAction;
  createdAt: number;
  updatedAt: number;
}

export interface EventTargetRef {
  eventInstanceId: string;
  expectedInstanceFingerprint: string;
}

export interface CreateEventProposal {
  definitionRef: { eventDefinitionId: string; definitionFingerprint: string };
  parentTarget?: EventTargetRef;
  evidenceRefs: EvidenceRef[];
}

export interface FactProposal {
  eventTarget: EventTargetRef;
  factType: string;
  payload: Record<string, JsonValue>;
  publicScope: PublicScope;
  evidenceRefs: EvidenceRef[];
  evidenceLevel: EvidenceLevel;
  playerParticipated: boolean;
}

export interface KnowledgeGrantProposal {
  subjectType: KnowledgeSubjectType;
  subjectId: string;
  subjectRef: KnowledgeSubjectRef;
  audienceSelector?: AudienceSelector;
  evidenceRefs: EvidenceRef[];
}

export interface PublicScheduleProposal {
  sourceDefinitionId: string;
  plannedAt: GameTime;
  publicScope: PublicScope;
  source: EvidenceRef;
}

export interface OfficialNoticeProposal {
  issuerId: string;
  claimFingerprint: string;
  publicScope: PublicScope;
  source: EvidenceRef;
}

export interface EmergentEventDefinitionProposal {
  title: string;
  actorEntityIds: string[];
  targetEntityIds: string[];
  dependencyDefinitionIds: string[];
  completionPredicate: CompletionPredicate;
  replayPolicy: WorldEventReplayPolicy;
  publicScope: PublicScope;
  causeEvidenceRefs: EvidenceRef[];
  identityAnchors: string[];
}

export interface PlanItemProposal {
  unitId?: string;
  eventDefinitionId?: string;
  dependencyFactIds: string[];
  acceptanceModes?: AcceptanceMode[];
  bridgeOptions?: string[];
  evidenceRefs: EvidenceRef[];
}

export interface ConvergenceProposal {
  sourceFactIds: string[];
  eligiblePlanItemIds: string[];
  bridgeOptions?: string[];
  evidenceRefs: EvidenceRef[];
}

export type RuntimeCommand =
  | { kind: 'advance_time'; deltaMinutes: number; reason: AdvanceTimeReason }
  | { kind: 'create_event_instance'; proposal: CreateEventProposal }
  | { kind: 'resolve_event_instance'; target: EventTargetRef; resolutionMode: WorldEventResolutionMode; outcome: WorldEventOutcome; evidenceRefs: EvidenceRef[] }
  | { kind: 'supersede_event_instance'; target: EventTargetRef; replacementTarget?: EventTargetRef; reason: string; evidenceRefs: EvidenceRef[] }
  | { kind: 'append_fact'; proposal: FactProposal }
  | { kind: 'upsert_plan_item'; proposal: PlanItemProposal }
  | { kind: 'enqueue_convergence'; proposal: ConvergenceProposal }
  | { kind: 'register_emergent_event_definition'; proposal: EmergentEventDefinitionProposal }
  | { kind: 'grant_knowledge'; proposal: KnowledgeGrantProposal }
  | { kind: 'publish_public_schedule'; proposal: PublicScheduleProposal }
  | { kind: 'issue_official_notice'; proposal: OfficialNoticeProposal }
  | { kind: 'path_command'; action: PathCommandAction; targetId: string; payload?: Record<string, JsonValue> }
