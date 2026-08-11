// 由 scripts/story-runtime-domain-model-regression.mjs 的 generateDomainModels 从
// scripts/fixtures/story-v3/story-runtime-contract.fixture.json 生成（contractRevision 2）
// fixture fingerprint: sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6
// 本文件只声明领域类型，不实现任何运行逻辑；禁止被现有生产运行流程 import。
// 类型唯一来源为冻结 fixture；任何字段/枚举/联合变化必须走 schema revision。

import type { EvidenceRef, GameTime } from './storyRuntime';

export type NarrativeConsistencyCode = 'illegal_narrative_replay' | 'terminal_event_resurrection' | 'narrative_no_progress' | 'narrative_multi_unit' | 'unsupported_future_leap' | 'player_action_not_accepted' | 'knowledge_leak' | 'unregistered_emergent_event';

export type NarrativeRewriteOperation = 'reframe_as_consequence' | 'remove_unsupported_claims' | 'continue_current_focus';

export type NarrativeDecisionOutcome = 'allow' | 'allow_reframed' | 'retry' | 'reject' | 'hold';

export type NarrativePublicationStatus = 'accepted_pending_reveal' | 'revealed' | 'held' | 'discarded';

export interface NarrativeRewriteRequest {
  requestId: string;
  sourceBodyFingerprint: string;
  violationCodes: NarrativeConsistencyCode[];
  allowedOperation: NarrativeRewriteOperation;
  maxAttempts: number;
  attempt: number;
}

export interface NarrativeConsistencyDecision {
  outcome: NarrativeDecisionOutcome;
  codes: NarrativeConsistencyCode[];
  evidenceRefs: EvidenceRef[];
  focusBefore: string;
  focusAfterCandidate?: string;
  replayedEventInstanceIds: string[];
  completedUnitIds: string[];
  retryCount: number;
  candidateBodyFingerprint: string;
  acceptedBodyFingerprint?: string;
  acceptedBodyRef?: EvidenceRef;
  rewriteRequest?: NarrativeRewriteRequest;
}

export interface NarrativePublicationRecord {
  publicationId: string;
  runtimeBranchId: string;
  turnId: string;
  sourceRuntimeRevision: number;
  commitReceiptId: string;
  body: string;
  bodyFingerprint: string;
  status: NarrativePublicationStatus;
  revealMessageId?: string;
  revealAttemptCount: number;
  createdAt: GameTime;
  revealedAt?: GameTime;
}
