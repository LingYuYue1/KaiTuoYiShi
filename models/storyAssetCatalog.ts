// 由 scripts/story-runtime-domain-model-regression.mjs 的 generateDomainModels 从
// scripts/fixtures/story-v3/story-runtime-contract.fixture.json 生成（contractRevision 2）
// fixture fingerprint: sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6
// 本文件只声明领域类型，不实现任何运行逻辑；禁止被现有生产运行流程 import。
// 类型唯一来源为冻结 fixture；任何字段/枚举/联合变化必须走 schema revision。

import type { GameTime, WorldEventDefinition } from './storyRuntime';

export type StoryAssetCatalogSourceKind = 'builtin_canon' | 'user_import' | 'legacy_migrated' | 'user_authored';

export type StoryAssetConstraintKind = 'hard' | 'foreshadow';

export type StoryAssetProfileImportance = 'ordinary' | 'important' | 'core';

export type StoryAssetLocationLevel = 'cosmos' | 'major' | 'medium' | 'minor' | 'zone' | 'sublocation' | 'unknown';

export type StoryAssetParticipationPolicy = 'player_optional' | 'player_required_for_resolution' | 'world_only';

export type StoryAssetBypassPolicy = 'remain_available' | 'world_background' | 'supersede' | 'expire';

export type StoryAssetDeviationPolicy = 'continue_compatible' | 'branch_candidate' | 'supersede' | 'hold';

export type StoryAssetEarlyCompletionPolicy = 'resolve_same_definition' | 'hold_for_evidence' | 'not_applicable';

export type StoryAssetOccurrencePolicy = 'unique' | 'allow_new_instance' | 'repeatable';

export type StoryAssetNewInstancePolicy = 'forbidden' | 'explicit_cause_required' | 'allowed';

export type StoryAssetOccurrenceSubjectKind = 'event' | 'character' | 'facility' | 'item' | 'task_result';

export interface StoryAssetCatalog {
  schemaVersion: 1;
  catalogId: string;
  catalogRevision: number;
  catalogFingerprint: string;
  normalizationVersion: number;
  sourceKind: StoryAssetCatalogSourceKind;
  title: string;
  sourceRefs: string[];
  series: StoryAssetSeries[];
  chapters: StoryAssetChapter[];
  segments: StoryAssetSegment[];
  characterProfiles: StoryAssetCharacterProfile[];
  factionProfiles: StoryAssetFactionProfile[];
  locationProfiles: StoryAssetLocationProfile[];
  constraints: StoryAssetConstraint[];
  visibilityHints: StoryAssetVisibilityHint[];
  timelineEntries: StoryAssetTimelineEntry[];
  routePolicies: StoryAssetRoutePolicy[];
  occurrenceDefinitions: StoryAssetOccurrenceDefinition[];
  eventDefinitions: WorldEventDefinition[];
}

export interface StoryAssetSeries {
  seriesId: string;
  title: string;
  workTitle: string;
  ordinal: number;
  chapterIds: string[];
  segmentIds: string[];
  openingSegmentIds: string[];
  defaultRoutePolicyId?: string;
  sourceRef?: string;
  seriesFingerprint: string;
}

export interface StoryAssetChapter {
  chapterId: string;
  seriesId: string;
  ordinal: number;
  title: string;
  summary: string;
  sourceText?: string;
  sourceLocator?: string;
  contentFingerprint: string;
  chapterFingerprint: string;
}

export interface StoryAssetChapterRange {
  startOrdinal: number;
  endOrdinal: number;
  chapterIds: string[];
}

export interface StoryAssetSegment {
  segmentId: string;
  seriesId: string;
  ordinal: number;
  title: string;
  chapterRange: StoryAssetChapterRange;
  isOpeningCandidate: boolean;
  summary: string;
  sourceExcerpt?: string;
  hardConstraintIds: string[];
  foreshadowConstraintIds: string[];
  characterProfileIds: string[];
  factionProfileIds: string[];
  locationProfileIds: string[];
  eventDefinitionIds: string[];
  timelineEntryIds: string[];
  routePolicyId: string;
  dependencySegmentIds: string[];
  consequenceSegmentIds: string[];
  segmentFingerprint: string;
}

export interface StoryAssetCharacterProfile {
  characterProfileId: string;
  name: string;
  aliases: string[];
  identitySummary: string;
  factionProfileIds: string[];
  initialStance: string;
  relationshipNotes: string[];
  stateNotes: string[];
  firstAppearanceSegmentId?: string;
  importance: StoryAssetProfileImportance;
  profileFingerprint: string;
}

export interface StoryAssetFactionProfile {
  factionProfileId: string;
  name: string;
  aliases: string[];
  typeSummary: string;
  territoryLocationIds: string[];
  representativeCharacterIds: string[];
  goalSummary: string;
  stateSummary: string;
  relationshipNotes: string[];
  firstAppearanceSegmentId?: string;
  profileFingerprint: string;
}

export interface StoryAssetLocationProfile {
  locationProfileId: string;
  name: string;
  aliases: string[];
  level: StoryAssetLocationLevel;
  parentLocationId?: string;
  factionProfileIds: string[];
  functionSummary: string;
  facilityOccurrenceDefinitionIds: string[];
  firstAppearanceSegmentId?: string;
  profileFingerprint: string;
}

export interface StoryAssetConstraint {
  constraintId: string;
  kind: StoryAssetConstraintKind;
  segmentIds: string[];
  statement: string;
  visibilityHintId?: string;
  nonProgressing: true;
  constraintFingerprint: string;
}

export interface StoryAssetVisibilityHint {
  visibilityHintId: string;
  knownByEntityIds: string[];
  unknownToEntityIds: string[];
  observerOnly: boolean;
  grantsKnowledge: false;
  hintFingerprint: string;
}

export interface StoryAssetTimelineEntry {
  timelineEntryId: string;
  segmentId: string;
  sequence: number;
  title: string;
  description: string;
  at?: GameTime;
  actorEntityIds: string[];
  eventDefinitionIds: string[];
  timelineFingerprint: string;
}

export interface StoryAssetRoutePolicy {
  routePolicyId: string;
  participationPolicy: StoryAssetParticipationPolicy;
  bypassPolicy: StoryAssetBypassPolicy;
  deviationPolicy: StoryAssetDeviationPolicy;
  earlyCompletionPolicy: StoryAssetEarlyCompletionPolicy;
  alternativeSegmentIds: string[];
  consequenceSegmentIds: string[];
  expiresAfterSegmentIds: string[];
  routeFingerprint: string;
}

export interface StoryAssetOccurrenceDefinition {
  occurrenceDefinitionId: string;
  title: string;
  subject: StoryAssetOccurrenceSubjectRef;
  occurrencePolicy: StoryAssetOccurrencePolicy;
  newInstancePolicy: StoryAssetNewInstancePolicy;
  identityAnchors: string[];
  aliases: string[];
  eventDefinitionIds: string[];
  definitionFingerprint: string;
}

export type StoryAssetOccurrenceSubjectRef =
  | { kind: 'event'; eventDefinitionId: string }
  | { kind: 'character'; characterProfileId: string }
  | { kind: 'facility'; facilityId: string; locationProfileId: string }
  | { kind: 'item'; itemId: string }
  | { kind: 'task_result'; taskResultId: string }
