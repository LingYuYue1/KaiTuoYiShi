// 由 scripts/story-runtime-domain-model-regression.mjs 的 generateDomainModels 从
// scripts/fixtures/story-v3/story-runtime-contract.fixture.json 生成（contractRevision 2）
// fixture fingerprint: sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6
// 本文件只声明领域类型，不实现任何运行逻辑；禁止被现有生产运行流程 import。
// 类型唯一来源为冻结 fixture；任何字段/枚举/联合变化必须走 schema revision。

import type { EvidenceLevel, EvidenceRef, GameTime, PublicScope } from './storyRuntime';

export type NewsArticleVersionLifecycle = 'draft' | 'queued' | 'published' | 'corrected' | 'archived';

export type NewsStoryPhase = 'upcoming' | 'ongoing' | 'completed' | 'postponed' | 'cancelled';

export type NewsReliability = 'official' | 'confirmed' | 'supported' | 'rumor' | 'manual';

export type MigrationTraceStatus = 'known' | 'unknown' | 'ambiguous';

export type BroadcastChannel = 'station_broadcast' | 'phone_network' | 'faction_network' | 'direct_radio';

export type KnowledgeSubjectType = 'npc' | 'faction' | 'player_character';

export type KnowledgeKind = 'fact' | 'claim';

export type KnowledgeChannel = 'direct_observation' | 'broadcast' | 'communication' | 'dialogue' | 'reading' | 'narrative_delivery';

export type ObserverReadChannel = 'player_ui' | 'player_character' | 'npc' | 'faction';

export type ProjectionOutboxKind = 'news' | 'knowledge' | 'phone' | 'memory' | 'yiting' | 'zhiku' | 'map' | 'compat_world_events';

export type ProjectionOutboxOperation = 'create' | 'deliver' | 'rewrite' | 'correct' | 'archive';

export type OutboxConsumerStatus = 'pending' | 'delivered' | 'retry_wait' | 'dead_letter' | 'cancelled';

export type OutboxItemStatus = 'pending' | 'leased' | 'retry_wait' | 'delivered' | 'dead_letter' | 'cancelled';

export type PayloadRefKind = 'inline' | 'payload_store';

export type NewsSourceRefKind = 'committed_fact' | 'public_schedule' | 'official_notice' | 'article_version' | 'manual';

export type KnowledgeSubjectRefKind = 'committed_fact' | 'public_schedule' | 'official_notice' | 'article_version';

export interface NewsArticleAggregate {
  runtimeBranchId: string;
  articleId: string;
  currentVersion: number;
  versionIds: string[];
  aggregateRevision: number;
}

export interface NewsArticleVersion {
  runtimeBranchId: string;
  articleVersionId: string;
  articleId: string;
  articleVersion: number;
  sourceRefs: NewsSourceRef[];
  sourceFingerprint: string;
  lifecycle: NewsArticleVersionLifecycle;
  storyPhase: NewsStoryPhase;
  category: string;
  title: string;
  body: string;
  publishedAt?: GameTime;
  publicScope: PublicScope;
  reliability: NewsReliability;
  isCorrection: boolean;
  correctsArticleId?: string;
  sourceTrace: EvidenceRef[];
  migrationTrace?: { status: MigrationTraceStatus; rawFieldPaths: string[]; rawPayloadFingerprint: string };
}

export interface AudienceSelector {
  locationIds?: string[];
  anchorIds?: string[];
  factionIds?: string[];
  networkIds?: string[];
  explicitRecipientIds?: string[];
}

export interface AudienceSnapshot {
  selector: AudienceSelector;
  recipientIds: string[];
  locationEvidence: EvidenceRef[];
  frozenAtRevision: number;
}

export interface BroadcastEnvelope {
  broadcastId: string;
  runtimeBranchId: string;
  sourceRef: KnowledgeSubjectRef;
  channel: BroadcastChannel;
  issuedAt: GameTime;
  audienceSnapshot: AudienceSnapshot;
  deliveryIdempotencyKey: string;
}

export interface DeliveryRecord {
  deliveryId: string;
  broadcastId: string;
  runtimeBranchId: string;
  recipientId: string;
  deliveredAt: GameTime;
  deliveryIdempotencyKey: string;
  evidenceRef: EvidenceRef;
}

export interface KnowledgeReceipt {
  runtimeBranchId: string;
  receiptId: string;
  subjectType: KnowledgeSubjectType;
  subjectId: string;
  subjectRef: KnowledgeSubjectRef;
  knowledgeKind: KnowledgeKind;
  claimReliability: NewsReliability;
  truthBinding?: { factId: string; sourceRevision: number };
  channel: KnowledgeChannel;
  broadcastEnvelopeId?: string;
  audienceSnapshot?: AudienceSnapshot;
  observedAt: GameTime;
  deliveryEvidenceRef: EvidenceRef;
  confidence: EvidenceLevel;
  idempotencyKey: string;
}

export interface ObserverReadCursor {
  runtimeBranchId: string;
  observerId: string;
  channel: ObserverReadChannel;
  lastReadArticleVersionId?: string;
  lastReadAt?: GameTime;
}

export interface ProjectionOutboxItem {
  outboxId: string;
  schemaVersion: number;
  runtimeBranchId: string;
  sourceRefFingerprint: string;
  sourceRevision: number;
  kind: ProjectionOutboxKind;
  aggregateKey: string;
  operation: ProjectionOutboxOperation;
  articlePolicyFingerprint?: string;
  sourceLevelIdempotencyKey: string;
  eventResolutionKey?: string;
  deliveryKey: string;
  payloadFingerprint: string;
  expectedAggregateRevision?: number;
  articleVersionHint?: number;
  payloadRef: { kind: PayloadRefKind; key: string };
  consumerIds: string[];
  consumerAcks: Record<string, { status: OutboxConsumerStatus; attemptCount: number; deliveredAt?: number; projectionRevision?: number; lastErrorCode?: string }>;
  createdAt: number;
  retainUntil?: number;
  status: OutboxItemStatus;
  attemptCount: number;
  leaseOwner?: string;
  leaseExpiresAt?: number;
  nextRetryAt?: number;
  deliveredAt?: number;
  lastErrorCode?: string;
}

export type NewsSourceRef =
  | { kind: 'committed_fact'; factId: string; sourceRevision: number }
  | { kind: 'public_schedule'; scheduleId: string; scheduleRevision: number }
  | { kind: 'official_notice'; noticeId: string; noticeRevision: number }
  | { kind: 'article_version'; articleId: string; articleVersion: number; claimFingerprint: string }
  | { kind: 'manual'; draftId: string; nonProgressing: true }

export type KnowledgeSubjectRef =
  | { kind: 'committed_fact'; factId: string; sourceRevision: number }
  | { kind: 'public_schedule'; scheduleId: string; scheduleRevision: number }
  | { kind: 'official_notice'; noticeId: string; noticeRevision: number }
  | { kind: 'article_version'; articleId: string; articleVersion: number; claimFingerprint: string }
