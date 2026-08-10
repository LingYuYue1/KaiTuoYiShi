// G1.1.1 契约回归（修正版）：story-runtime-contract.fixture.json 必须完整覆盖 canonical 计划 4.1-4.10 + 4.8.1。
// 本模块同时被 story-runtime-schema-drift-regression.mjs 导入（validateContractFixture / fingerprint）。
// 只允许读写 scripts/fixtures/story-v3/ 下的测试文件；不得触碰任何生产目录。
//
// 重要：本文件中的 CANONICAL_FIELD_SPECS / CANONICAL_UNION_VARIANTS / CANONICAL_ENUMS / CANONICAL_COMMANDS
// 是**测试专用验收基准（oracle）**，从 canonical 4.1-4.10 / 4.8.1 摘录，只被 regression 使用，
// 禁止被任何 production 代码 import；fixture 是实现和后续生成的唯一来源，oracle 只负责阻止 fixture 被静默改坏。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const CONTRACT_FIXTURE_PATH = path.join('scripts', 'fixtures', 'story-v3', 'story-runtime-contract.fixture.json');
export const CONTRACT_MANIFEST_PATH = path.join('scripts', 'fixtures', 'story-v3', '_story-runtime-contract-manifest.json');

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

// ── 确定性 canonical 序列化：对象键递归排序，数组顺序保留；相同输入两次规范化必须字节级相同 ──
export function canonicalJsonStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJsonStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map((key) => JSON.stringify(key) + ':' + canonicalJsonStringify(value[key])).join(',') + '}';
}

export function computeContractFingerprint(fixture) {
  const canonical = canonicalJsonStringify(fixture);
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return { fingerprint: 'sha256:' + hash, canonical };
}

export function readContractFixture() {
  const raw = fs.readFileSync(path.join(process.cwd(), CONTRACT_FIXTURE_PATH), 'utf8');
  return { fixture: JSON.parse(raw), raw };
}

// ══════════════════════════════════════════════════════════════════════
// 测试专用 oracle：字段规格构建器（compact DSL）
// ══════════════════════════════════════════════════════════════════════
const F = {
  str: (r = true) => ({ type: 'string', required: r }),
  num: (r = true) => ({ type: 'number', required: r }),
  bool: (r = true) => ({ type: 'boolean', required: r }),
  lit: (value, r = true) => ({ type: 'literal', value, required: r }),
  ref: (to, r = true) => ({ type: 'ref', to, required: r }),
  en: (enumName, r = true, d) => ({ type: 'enum', enum: enumName, required: r, ...(d !== undefined ? { default: d } : {}) }),
  arr: (items, r = true) => ({ type: 'array', items, required: r, default: [] }),
  map: (value, r = true) => ({ type: 'map', key: { type: 'string' }, value, required: r, default: {} }),
  open: (valueTypes, r = true) => ({ type: 'open_map', valueTypes, required: r, default: {}, canonicalOpen: true }),
  obj: (fields, r = true) => ({ type: 'object', fields, required: r }),
  su: (elementTypes, r = true) => ({ type: 'scalar_union', elementTypes, required: r }),
};

// ══════════════════════════════════════════════════════════════════════
// 语义投影：只保留影响 schema 的键；note/doc/source 等文档键不参与签名。
// ══════════════════════════════════════════════════════════════════════
const SPEC_SEMANTIC_KEYS = new Set(['type', 'required', 'default', 'to', 'enum', 'value', 'items', 'key', 'valueTypes', 'elementTypes', 'fields', 'canonicalOpen']);
const TYPE_SEMANTIC_KEYS = new Set(['kind', 'fields', 'variants', 'discriminator']);
const ENUM_SEMANTIC_KEYS = new Set(['values']);
// 允许出现在规格对象里的全部键（语义键 + 文档键）；未知键 = 自由 JSON，一律拒绝。
const SPEC_ALLOWED_KEYS = new Set([...SPEC_SEMANTIC_KEYS, 'note', 'doc', 'source']);
const TYPE_ALLOWED_KEYS = new Set([...TYPE_SEMANTIC_KEYS, 'note', 'doc', 'source']);
const ENUM_ALLOWED_KEYS = new Set([...ENUM_SEMANTIC_KEYS, 'note', 'doc', 'source']);

// 嵌套位置（items/map value/object 子字段）的 required 不参与签名：
// canonical“未标 ? 的字段必填”只作用于顶层接口字段与 union 变体字段，嵌套对象总是整体序列化。
function projectSpec(spec, stripRequired = false) {
  const out = {};
  for (const key of Object.keys(spec).sort()) {
    if (!SPEC_SEMANTIC_KEYS.has(key)) continue;
    if (stripRequired && key === 'required') continue;
    const value = spec[key];
    // literal 数据值（value: 3 / true）原样保留；map 的 value 键是嵌套规格，必须走对象递归分支。
    if (key === 'default' || (key === 'value' && !(value && typeof value === 'object'))) {
      out[key] = value; // 数据值，原样保留
    } else if (Array.isArray(value)) {
      out[key] = value.map((item) => (item && typeof item === 'object' ? projectSpec(item, true) : item));
    } else if (value && typeof value === 'object') {
      if (key === 'fields') {
        out[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, projectSpec(child, true)]));
      } else {
        out[key] = projectSpec(value, true);
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

function specSignature(spec) {
  return canonicalJsonStringify(projectSpec(spec));
}

// ══════════════════════════════════════════════════════════════════════
// 未知键检查：任何类型对象 / 规格对象 / 枚举对象都不允许出现计划外键。
// ══════════════════════════════════════════════════════════════════════
function assertNoUnknownKeys(fixture) {
  for (const [typeName, typeDef] of Object.entries(fixture.types)) {
    for (const key of Object.keys(typeDef)) {
      assert(TYPE_ALLOWED_KEYS.has(key), '类型对象出现未知键（自由 JSON）: ' + typeName + '.' + key);
    }
    const visitSpec = (spec, where) => {
      assert(spec && typeof spec === 'object', '字段规格必须是对象: ' + where);
      for (const key of Object.keys(spec)) {
        assert(SPEC_ALLOWED_KEYS.has(key), '字段规格出现未知键（自由 JSON）: ' + where + '.' + key);
      }
      if (spec.type === 'object') {
        for (const [name, child] of Object.entries(spec.fields || {})) visitSpec(child, where + '.' + name);
      }
      if (spec.type === 'array' && spec.items) visitSpec(spec.items, where + '[]');
      if (spec.type === 'map' && spec.value) visitSpec(spec.value, where + '.<map-value>');
      if (spec.type === 'union') {
        for (const variant of spec.variants || []) {
          for (const [name, child] of Object.entries(variant.fields || {})) visitSpec(child, where + '.<' + variant.tag + '>.' + name);
        }
      }
    };
    if (typeDef.kind === 'union') {
      for (const variant of typeDef.variants || []) {
        for (const [name, spec] of Object.entries(variant.fields || {})) visitSpec(spec, typeName + '.<' + variant.tag + '>.' + name);
      }
    } else {
      for (const [name, spec] of Object.entries(typeDef.fields || {})) visitSpec(spec, typeName + '.' + name);
    }
  }
  for (const [enumName, enumDef] of Object.entries(fixture.enums)) {
    for (const key of Object.keys(enumDef)) {
      assert(ENUM_ALLOWED_KEYS.has(key), '枚举对象出现未知键（自由 JSON）: ' + enumName + '.' + key);
    }
  }
  for (const section of ['commands', 'lifecycle', 'defaults', 'compatibility']) {
    assert(fixture[section] && typeof fixture[section] === 'object', '分区必须是对象: ' + section);
  }
}

// ══════════════════════════════════════════════════════════════════════
// 悬空引用检查：ref.to / enum.enum 必须指向 fixture 中真实存在的目标。
// ══════════════════════════════════════════════════════════════════════
function collectAllSpecs(typeDef) {
  const specs = [];
  const visit = (spec) => {
    specs.push(spec);
    if (spec.type === 'object') for (const child of Object.values(spec.fields || {})) visit(child);
    if (spec.type === 'array' && spec.items) visit(spec.items);
    if (spec.type === 'map' && spec.value) visit(spec.value);
    if (spec.type === 'union') for (const variant of spec.variants || []) for (const child of Object.values(variant.fields || {})) visit(child);
  };
  if (typeDef.kind === 'union') {
    for (const variant of typeDef.variants || []) for (const child of Object.values(variant.fields || {})) visit(child);
  } else {
    for (const child of Object.values(typeDef.fields || {})) visit(child);
  }
  return specs;
}

function assertNoDanglingRefs(fixture) {
  const typeNames = new Set(Object.keys(fixture.types));
  const enumNames = new Set(Object.keys(fixture.enums));
  for (const [typeName, typeDef] of Object.entries(fixture.types)) {
    for (const spec of collectAllSpecs(typeDef)) {
      if (spec.type === 'ref') {
        assert(typeNames.has(spec.to), 'ref 目标不存在（悬空引用）: ' + typeName + ' -> ' + spec.to);
      }
      if (spec.type === 'enum') {
        assert(enumNames.has(spec.enum), 'enum 目标不存在（悬空引用）: ' + typeName + ' -> ' + spec.enum);
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════════════
// canonical 期望：全部 52 个类型（含 6 个判别联合共 39 个变体）
// ══════════════════════════════════════════════════════════════════════
export const CANONICAL_FIELD_SPECS = {
  StoryRuntimeState: {
    schemaVersion: F.lit(3),
    runtimeBranchId: F.str(),
    saveNodeId: F.str(),
    assetCatalogFingerprint: F.str(),
    runtimeRevision: F.num(),
    turnCount: F.num(),
    lastCommittedTurnId: F.str(false),
    gameClock: F.ref('GameClock'),
    activeTrackId: F.str(false),
    focus: F.ref('StoryFocus'),
    playerPlanPool: F.arr(F.ref('PlayerPlanItem')),
    worldPlanPool: F.arr(F.ref('WorldPlanItem')),
    convergenceQueue: F.arr(F.ref('ConvergenceItem')),
    worldEvents: F.arr(F.ref('WorldEventInstance')),
    entities: F.arr(F.ref('WorldEntityState')),
    factLedger: F.arr(F.ref('CommittedWorldFact')),
    publicSchedules: F.arr(F.ref('PublicSchedule')),
    officialNotices: F.arr(F.ref('OfficialNotice')),
    knowledgeGrants: F.arr(F.ref('KnowledgeGrant')),
    commandIdempotencyIndex: F.map(F.obj({
      commandFingerprint: F.str(),
      resultRevision: F.num(),
      resultCode: F.str(),
      receiptId: F.str(),
      resultHash: F.str(),
      resultRef: F.obj({ saveNodeId: F.str(), stateFingerprint: F.str() }),
    })),
    turnReceipts: F.arr(F.ref('TurnAdjudicationReceipt')),
    narrativePublications: F.arr(F.ref('NarrativePublicationRecord')),
    migration: F.ref('RuntimeMigrationMeta'),
  },
  StoryRuntimeView: {
    core: F.ref('StoryRuntimeState'),
    projections: F.ref('StoryProjectionState'),
    outbox: F.arr(F.ref('ProjectionOutboxItem')),
  },
  StoryProjectionState: {
    runtimeBranchId: F.str(),
    newsArticles: F.arr(F.ref('NewsArticleAggregate')),
    knowledgeReceipts: F.arr(F.ref('KnowledgeReceipt')),
    observerReadCursors: F.arr(F.ref('ObserverReadCursor')),
    projectionRevisions: F.map(F.num()),
  },
  GameTime: { dayOrdinal: F.num(), minuteOfDay: F.num() },
  GameClock: {
    now: F.ref('GameTime'),
    defaultAdvanceMinutes: F.num(),
    policyVersion: F.num(),
    lastAdvanceRevision: F.num(),
    lastAdvanceCommandId: F.str(false),
  },
  StoryFocus: {
    focusId: F.str(),
    trackId: F.str(false),
    unitId: F.str(false),
    status: F.en('StoryFocusStatus'),
    reasonCodes: F.arr(F.str()),
    enteredAtRevision: F.num(),
  },
  WorldEntityState: {
    entityId: F.str(),
    entityType: F.en('WorldEntityType'),
    status: F.en('WorldEntityStatus'),
    locationId: F.str(false),
    anchorId: F.str(false),
    attributes: F.open(['string', 'number', 'boolean', 'null']),
    stateRevision: F.num(),
  },
  WorldEventDefinition: {
    eventDefinitionId: F.str(),
    origin: F.en('WorldEventDefinitionOrigin'),
    title: F.str(),
    trackId: F.str(false),
    actorEntityIds: F.arr(F.str()),
    targetEntityIds: F.arr(F.str()),
    dependencyDefinitionIds: F.arr(F.str()),
    completionPredicate: F.ref('CompletionPredicate'),
    scheduling: F.ref('WorldEventDefinitionScheduling'),
    allowedResolutionModes: F.arr(F.en('EventDefinitionResolutionMode')),
    replayPolicy: F.en('WorldEventReplayPolicy'),
    publicScope: F.ref('PublicScope'),
    consequenceDefinitionIds: F.arr(F.str()),
    definitionFingerprint: F.str(),
  },
  WorldEventDefinitionScheduling: {
    earliestAt: F.ref('GameTime', false),
    dueAt: F.ref('GameTime', false),
    missAfter: F.ref('GameTime', false),
  },
  WorldEventInstance: {
    eventInstanceId: F.str(),
    eventDefinitionId: F.str(),
    parentInstanceId: F.str(false),
    status: F.en('WorldEventInstanceStatus'),
    startAt: F.ref('GameTime', false),
    dueAt: F.ref('GameTime', false),
    resolvedAt: F.ref('GameTime', false),
    resolutionMode: F.en('WorldEventResolutionMode', false),
    outcome: F.en('WorldEventOutcome', false),
    replayPolicy: F.en('WorldEventReplayPolicy'),
    participantIds: F.arr(F.str()),
    dependencyIds: F.arr(F.str()),
    publicFactIds: F.arr(F.str()),
    terminalFactId: F.str(false),
    idempotencyKey: F.str(),
    eventResolutionKey: F.str(false),
    source: F.ref('EvidenceRef'),
  },
  EmergentEventDefinition: {
    eventDefinitionId: F.str(),
    origin: F.lit('emergent'),
    runtimeBranchId: F.str(),
    causeEvidenceRefs: F.arr(F.ref('EvidenceRef')),
    identityAnchors: F.arr(F.str()),
    completionPredicate: F.ref('CompletionPredicate'),
    replayPolicy: F.en('WorldEventReplayPolicy'),
    publicScope: F.ref('PublicScope'),
    definitionFingerprint: F.str(),
  },
  CompletionPredicate: {
    predicateId: F.str(),
    targetEntityIds: F.arr(F.str()),
    targetEventInstanceId: F.str(false),
    requiredFactTypes: F.arr(F.str()),
    requiredEvidenceKinds: F.arr(F.en('EvidenceRefKind')),
    payloadMatchers: F.arr(F.ref('PayloadMatcher')),
    minimumEvidenceCount: F.num(),
    deterministicKey: F.str(),
    allowedOutcomes: F.arr(F.str()),
    failureOutcomes: F.arr(F.str()),
  },
  PayloadMatcher: {
    path: F.str(),
    operator: F.en('PayloadMatcherOperator'),
    value: F.su(['string', 'number', 'boolean', 'string_array']),
  },
  CommittedWorldFact: {
    factId: F.str(),
    eventInstanceId: F.str(),
    sourceRevision: F.num(),
    factType: F.str(),
    payload: F.open(['unknown']),
    occurredAt: F.ref('GameTime'),
    committedAt: F.ref('GameTime'),
    publicScope: F.ref('PublicScope'),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
    evidenceLevel: F.en('EvidenceLevel'),
    supersedesFactId: F.str(false),
    invalidatesEventInstanceIds: F.arr(F.str()),
    playerParticipated: F.bool(),
    playerObserverVisible: F.bool(),
    createdBy: F.en('FactCreatedBy'),
  },
  ArticlePolicy: {
    regionIds: F.arr(F.str()),
    audienceKinds: F.arr(F.en('ArticleAudienceKind')),
    category: F.str(),
    aggregationKey: F.str(),
    maxSourceRefs: F.num(),
  },
  OpeningPrelude: {
    preludeId: F.str(),
    runtimeBranchId: F.str(),
    bodyFingerprint: F.str(),
    sourceRefs: F.arr(F.ref('OpeningPreludeSourceRef')),
    nonProgressing: F.bool(),
    idempotencyKey: F.str(),
  },
  PlayerPlanItem: {
    planItemId: F.str(),
    unitId: F.str(false),
    status: F.en('PlayerPlanItemStatus'),
    dependencyFactIds: F.arr(F.str()),
    acceptanceModes: F.arr(F.en('AcceptanceMode')),
    expiresAt: F.ref('GameTime', false),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
  },
  WorldPlanItem: {
    planItemId: F.str(),
    eventDefinitionId: F.str(),
    status: F.en('WorldPlanItemStatus'),
    dueAt: F.ref('GameTime', false),
    dependencyIds: F.arr(F.str()),
    publicScheduleId: F.str(false),
    consequenceDefinitionIds: F.arr(F.str()),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
  },
  ConvergenceItem: {
    convergenceId: F.str(),
    sourceFactIds: F.arr(F.str()),
    status: F.en('ConvergenceItemStatus'),
    eligiblePlanItemIds: F.arr(F.str()),
    playerDecisionRequired: F.bool(),
    expiresAt: F.ref('GameTime', false),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
  },
  RuntimeMigrationMeta: {
    status: F.en('RuntimeMigrationStatus'),
    sourceSaveFingerprint: F.str(false),
    migrationId: F.str(false),
    legacyIdMapFingerprint: F.str(false),
    unresolvedCursorIds: F.arr(F.str()),
    warnings: F.arr(F.str()),
    confirmedAtRevision: F.num(false),
  },
  OfficialNotice: {
    noticeId: F.str(),
    noticeRevision: F.num(),
    issuerId: F.str(),
    claimFingerprint: F.str(),
    status: F.en('OfficialNoticeStatus'),
    publicScope: F.ref('PublicScope'),
    source: F.ref('EvidenceRef'),
    issuedAt: F.ref('GameTime'),
    supersedesNoticeId: F.str(false),
  },
  KnowledgeGrant: {
    runtimeBranchId: F.str(),
    grantId: F.str(),
    subjectType: F.en('KnowledgeSubjectType'),
    subjectId: F.str(),
    subjectRef: F.ref('KnowledgeSubjectRef'),
    effectiveFromRuntimeRevision: F.num(),
    audienceSnapshot: F.ref('AudienceSnapshot', false),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
    idempotencyKey: F.str(),
  },
  TurnAdjudicationReceipt: {
    receiptId: F.str(),
    runtimeBranchId: F.str(),
    inputRuntimeRevision: F.num(),
    outputRuntimeRevision: F.num(false),
    narrativeDecision: F.ref('NarrativeConsistencyDecision', false),
    acceptedCandidateIds: F.arr(F.str()),
    rejectedCandidateIds: F.arr(F.str()),
    completedUnitIds: F.arr(F.str()),
    blockedReasons: F.arr(F.str()),
    sourceFactIds: F.arr(F.str()),
    outboxIds: F.arr(F.str()),
    errorCodes: F.arr(F.str()),
    durationMs: F.num(),
  },
  TurnAttemptReceipt: {
    attemptId: F.str(),
    turnId: F.str(),
    runtimeBranchId: F.str(),
    expectedRuntimeRevision: F.num(),
    committedRuntimeRevision: F.num(false),
    preTurnCheckpointId: F.str(),
    commitReceiptId: F.str(false),
    phase: F.en('TurnAttemptPhase'),
    failureCode: F.str(false),
    recoveryAction: F.en('TurnRecoveryAction', false),
    createdAt: F.num(),
    updatedAt: F.num(),
  },
  EventTargetRef: {
    eventInstanceId: F.str(),
    expectedInstanceFingerprint: F.str(),
  },
  CreateEventProposal: {
    definitionRef: F.obj({ eventDefinitionId: F.str(), definitionFingerprint: F.str() }),
    parentTarget: F.ref('EventTargetRef', false),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
  },
  FactProposal: {
    eventTarget: F.ref('EventTargetRef'),
    factType: F.str(),
    payload: F.open(['unknown']),
    publicScope: F.ref('PublicScope'),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
    evidenceLevel: F.en('EvidenceLevel'),
    playerParticipated: F.bool(),
  },
  KnowledgeGrantProposal: {
    subjectType: F.en('KnowledgeSubjectType'),
    subjectId: F.str(),
    subjectRef: F.ref('KnowledgeSubjectRef'),
    audienceSelector: F.ref('AudienceSelector', false),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
  },
  PublicScheduleProposal: {
    sourceDefinitionId: F.str(),
    plannedAt: F.ref('GameTime'),
    publicScope: F.ref('PublicScope'),
    source: F.ref('EvidenceRef'),
  },
  OfficialNoticeProposal: {
    issuerId: F.str(),
    claimFingerprint: F.str(),
    publicScope: F.ref('PublicScope'),
    source: F.ref('EvidenceRef'),
  },
  EmergentEventDefinitionProposal: {
    title: F.str(),
    actorEntityIds: F.arr(F.str()),
    targetEntityIds: F.arr(F.str()),
    dependencyDefinitionIds: F.arr(F.str()),
    completionPredicate: F.ref('CompletionPredicate'),
    replayPolicy: F.en('WorldEventReplayPolicy'),
    publicScope: F.ref('PublicScope'),
    causeEvidenceRefs: F.arr(F.ref('EvidenceRef')),
    identityAnchors: F.arr(F.str()),
  },
  PlanItemProposal: {
    unitId: F.str(false),
    eventDefinitionId: F.str(false),
    dependencyFactIds: F.arr(F.str()),
    acceptanceModes: F.arr(F.en('AcceptanceMode'), false),
    bridgeOptions: F.arr(F.str(), false),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
  },
  ConvergenceProposal: {
    sourceFactIds: F.arr(F.str()),
    eligiblePlanItemIds: F.arr(F.str()),
    bridgeOptions: F.arr(F.str(), false),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
  },
  PublicSchedule: {
    scheduleId: F.str(),
    sourceDefinitionId: F.str(),
    status: F.en('PublicScheduleStatus'),
    plannedAt: F.ref('GameTime'),
    publicScope: F.ref('PublicScope'),
    source: F.ref('EvidenceRef'),
    scheduleRevision: F.num(),
    idempotencyKey: F.str(),
  },
  NewsArticleAggregate: {
    runtimeBranchId: F.str(),
    articleId: F.str(),
    currentVersion: F.num(),
    versionIds: F.arr(F.str()),
    aggregateRevision: F.num(),
  },
  NewsArticleVersion: {
    runtimeBranchId: F.str(),
    articleVersionId: F.str(),
    articleId: F.str(),
    articleVersion: F.num(),
    sourceRefs: F.arr(F.ref('NewsSourceRef')),
    sourceFingerprint: F.str(),
    lifecycle: F.en('NewsArticleVersionLifecycle'),
    storyPhase: F.en('NewsStoryPhase'),
    category: F.str(),
    title: F.str(),
    body: F.str(),
    publishedAt: F.ref('GameTime', false),
    publicScope: F.ref('PublicScope'),
    reliability: F.en('NewsReliability'),
    isCorrection: F.bool(),
    correctsArticleId: F.str(false),
    sourceTrace: F.arr(F.ref('EvidenceRef')),
    migrationTrace: F.obj({
      status: F.en('MigrationTraceStatus'),
      rawFieldPaths: F.arr(F.str()),
      rawPayloadFingerprint: F.str(),
    }, false),
  },
  AudienceSelector: {
    locationIds: F.arr(F.str(), false),
    anchorIds: F.arr(F.str(), false),
    factionIds: F.arr(F.str(), false),
    networkIds: F.arr(F.str(), false),
    explicitRecipientIds: F.arr(F.str(), false),
  },
  AudienceSnapshot: {
    selector: F.ref('AudienceSelector'),
    recipientIds: F.arr(F.str()),
    locationEvidence: F.arr(F.ref('EvidenceRef')),
    frozenAtRevision: F.num(),
  },
  BroadcastEnvelope: {
    broadcastId: F.str(),
    runtimeBranchId: F.str(),
    sourceRef: F.ref('KnowledgeSubjectRef'),
    channel: F.en('BroadcastChannel'),
    issuedAt: F.ref('GameTime'),
    audienceSnapshot: F.ref('AudienceSnapshot'),
    deliveryIdempotencyKey: F.str(),
  },
  DeliveryRecord: {
    deliveryId: F.str(),
    broadcastId: F.str(),
    runtimeBranchId: F.str(),
    recipientId: F.str(),
    deliveredAt: F.ref('GameTime'),
    deliveryIdempotencyKey: F.str(),
    evidenceRef: F.ref('EvidenceRef'),
  },
  KnowledgeReceipt: {
    runtimeBranchId: F.str(),
    receiptId: F.str(),
    subjectType: F.en('KnowledgeSubjectType'),
    subjectId: F.str(),
    subjectRef: F.ref('KnowledgeSubjectRef'),
    knowledgeKind: F.en('KnowledgeKind'),
    claimReliability: F.en('NewsReliability'),
    truthBinding: F.obj({ factId: F.str(), sourceRevision: F.num() }, false),
    channel: F.en('KnowledgeChannel'),
    broadcastEnvelopeId: F.str(false),
    audienceSnapshot: F.ref('AudienceSnapshot', false),
    observedAt: F.ref('GameTime'),
    deliveryEvidenceRef: F.ref('EvidenceRef'),
    confidence: F.en('EvidenceLevel'),
    idempotencyKey: F.str(),
  },
  ObserverReadCursor: {
    runtimeBranchId: F.str(),
    observerId: F.str(),
    channel: F.en('ObserverReadChannel'),
    lastReadArticleVersionId: F.str(false),
    lastReadAt: F.ref('GameTime', false),
  },
  ProjectionOutboxItem: {
    outboxId: F.str(),
    schemaVersion: F.num(),
    runtimeBranchId: F.str(),
    sourceRefFingerprint: F.str(),
    sourceRevision: F.num(),
    kind: F.en('ProjectionOutboxKind'),
    aggregateKey: F.str(),
    operation: F.en('ProjectionOutboxOperation'),
    articlePolicyFingerprint: F.str(false),
    sourceLevelIdempotencyKey: F.str(),
    eventResolutionKey: F.str(false),
    deliveryKey: F.str(),
    payloadFingerprint: F.str(),
    expectedAggregateRevision: F.num(false),
    articleVersionHint: F.num(false),
    payloadRef: F.obj({ kind: F.en('PayloadRefKind'), key: F.str() }),
    consumerIds: F.arr(F.str()),
    consumerAcks: F.map(F.obj({
      status: F.en('OutboxConsumerStatus'),
      attemptCount: F.num(),
      deliveredAt: F.num(false),
      projectionRevision: F.num(false),
      lastErrorCode: F.str(false),
    })),
    createdAt: F.num(),
    retainUntil: F.num(false),
    status: F.en('OutboxItemStatus'),
    attemptCount: F.num(),
    leaseOwner: F.str(false),
    leaseExpiresAt: F.num(false),
    nextRetryAt: F.num(false),
    deliveredAt: F.num(false),
    lastErrorCode: F.str(false),
  },
  NarrativeRewriteRequest: {
    requestId: F.str(),
    sourceBodyFingerprint: F.str(),
    violationCodes: F.arr(F.en('NarrativeConsistencyCode')),
    allowedOperation: F.en('NarrativeRewriteOperation'),
    maxAttempts: F.num(),
    attempt: F.num(),
  },
  NarrativeConsistencyDecision: {
    outcome: F.en('NarrativeDecisionOutcome'),
    codes: F.arr(F.en('NarrativeConsistencyCode')),
    evidenceRefs: F.arr(F.ref('EvidenceRef')),
    focusBefore: F.str(),
    focusAfterCandidate: F.str(false),
    replayedEventInstanceIds: F.arr(F.str()),
    completedUnitIds: F.arr(F.str()),
    retryCount: F.num(),
    candidateBodyFingerprint: F.str(),
    acceptedBodyFingerprint: F.str(false),
    acceptedBodyRef: F.ref('EvidenceRef', false),
    rewriteRequest: F.ref('NarrativeRewriteRequest', false),
  },
  NarrativePublicationRecord: {
    publicationId: F.str(),
    runtimeBranchId: F.str(),
    turnId: F.str(),
    sourceRuntimeRevision: F.num(),
    commitReceiptId: F.str(),
    body: F.str(),
    bodyFingerprint: F.str(),
    status: F.en('NarrativePublicationStatus'),
    revealMessageId: F.str(false),
    revealAttemptCount: F.num(),
    createdAt: F.ref('GameTime'),
    revealedAt: F.ref('GameTime', false),
  },
  // ── G1.1.2 资产目录类型（plan-4.2）──
  StoryAssetCatalog: {
    schemaVersion: F.lit(1),
    catalogId: F.str(),
    catalogRevision: F.num(),
    catalogFingerprint: F.str(),
    normalizationVersion: F.num(),
    sourceKind: F.en('StoryAssetCatalogSourceKind'),
    title: F.str(),
    sourceRefs: F.arr(F.str()),
    series: F.arr(F.ref('StoryAssetSeries')),
    chapters: F.arr(F.ref('StoryAssetChapter')),
    segments: F.arr(F.ref('StoryAssetSegment')),
    characterProfiles: F.arr(F.ref('StoryAssetCharacterProfile')),
    factionProfiles: F.arr(F.ref('StoryAssetFactionProfile')),
    locationProfiles: F.arr(F.ref('StoryAssetLocationProfile')),
    constraints: F.arr(F.ref('StoryAssetConstraint')),
    visibilityHints: F.arr(F.ref('StoryAssetVisibilityHint')),
    timelineEntries: F.arr(F.ref('StoryAssetTimelineEntry')),
    routePolicies: F.arr(F.ref('StoryAssetRoutePolicy')),
    occurrenceDefinitions: F.arr(F.ref('StoryAssetOccurrenceDefinition')),
    eventDefinitions: F.arr(F.ref('WorldEventDefinition')),
  },
  StoryAssetSeries: {
    seriesId: F.str(),
    title: F.str(),
    workTitle: F.str(),
    ordinal: F.num(),
    chapterIds: F.arr(F.str()),
    segmentIds: F.arr(F.str()),
    openingSegmentIds: F.arr(F.str()),
    defaultRoutePolicyId: F.str(false),
    sourceRef: F.str(false),
    seriesFingerprint: F.str(),
  },
  StoryAssetChapter: {
    chapterId: F.str(),
    seriesId: F.str(),
    ordinal: F.num(),
    title: F.str(),
    summary: F.str(),
    sourceText: F.str(false),
    sourceLocator: F.str(false),
    contentFingerprint: F.str(),
    chapterFingerprint: F.str(),
  },
  StoryAssetChapterRange: {
    startOrdinal: F.num(),
    endOrdinal: F.num(),
    chapterIds: F.arr(F.str()),
  },
  StoryAssetSegment: {
    segmentId: F.str(),
    seriesId: F.str(),
    ordinal: F.num(),
    title: F.str(),
    chapterRange: F.ref('StoryAssetChapterRange'),
    isOpeningCandidate: F.bool(),
    summary: F.str(),
    sourceExcerpt: F.str(false),
    hardConstraintIds: F.arr(F.str()),
    foreshadowConstraintIds: F.arr(F.str()),
    characterProfileIds: F.arr(F.str()),
    factionProfileIds: F.arr(F.str()),
    locationProfileIds: F.arr(F.str()),
    eventDefinitionIds: F.arr(F.str()),
    timelineEntryIds: F.arr(F.str()),
    routePolicyId: F.str(),
    dependencySegmentIds: F.arr(F.str()),
    consequenceSegmentIds: F.arr(F.str()),
    segmentFingerprint: F.str(),
  },
  StoryAssetCharacterProfile: {
    characterProfileId: F.str(),
    name: F.str(),
    aliases: F.arr(F.str()),
    identitySummary: F.str(),
    factionProfileIds: F.arr(F.str()),
    initialStance: F.str(),
    relationshipNotes: F.arr(F.str()),
    stateNotes: F.arr(F.str()),
    firstAppearanceSegmentId: F.str(false),
    importance: F.en('StoryAssetProfileImportance'),
    profileFingerprint: F.str(),
  },
  StoryAssetFactionProfile: {
    factionProfileId: F.str(),
    name: F.str(),
    aliases: F.arr(F.str()),
    typeSummary: F.str(),
    territoryLocationIds: F.arr(F.str()),
    representativeCharacterIds: F.arr(F.str()),
    goalSummary: F.str(),
    stateSummary: F.str(),
    relationshipNotes: F.arr(F.str()),
    firstAppearanceSegmentId: F.str(false),
    profileFingerprint: F.str(),
  },
  StoryAssetLocationProfile: {
    locationProfileId: F.str(),
    name: F.str(),
    aliases: F.arr(F.str()),
    level: F.en('StoryAssetLocationLevel'),
    parentLocationId: F.str(false),
    factionProfileIds: F.arr(F.str()),
    functionSummary: F.str(),
    facilityOccurrenceDefinitionIds: F.arr(F.str()),
    firstAppearanceSegmentId: F.str(false),
    profileFingerprint: F.str(),
  },
  StoryAssetConstraint: {
    constraintId: F.str(),
    kind: F.en('StoryAssetConstraintKind'),
    segmentIds: F.arr(F.str()),
    statement: F.str(),
    visibilityHintId: F.str(false),
    nonProgressing: F.lit(true),
    constraintFingerprint: F.str(),
  },
  StoryAssetVisibilityHint: {
    visibilityHintId: F.str(),
    knownByEntityIds: F.arr(F.str()),
    unknownToEntityIds: F.arr(F.str()),
    observerOnly: F.bool(),
    grantsKnowledge: F.lit(false),
    hintFingerprint: F.str(),
  },
  StoryAssetTimelineEntry: {
    timelineEntryId: F.str(),
    segmentId: F.str(),
    sequence: F.num(),
    title: F.str(),
    description: F.str(),
    at: F.ref('GameTime', false),
    actorEntityIds: F.arr(F.str()),
    eventDefinitionIds: F.arr(F.str()),
    timelineFingerprint: F.str(),
  },
  StoryAssetRoutePolicy: {
    routePolicyId: F.str(),
    participationPolicy: F.en('StoryAssetParticipationPolicy', true, 'player_optional'),
    bypassPolicy: F.en('StoryAssetBypassPolicy'),
    deviationPolicy: F.en('StoryAssetDeviationPolicy'),
    earlyCompletionPolicy: F.en('StoryAssetEarlyCompletionPolicy'),
    alternativeSegmentIds: F.arr(F.str()),
    consequenceSegmentIds: F.arr(F.str()),
    expiresAfterSegmentIds: F.arr(F.str()),
    routeFingerprint: F.str(),
  },
  StoryAssetOccurrenceDefinition: {
    occurrenceDefinitionId: F.str(),
    title: F.str(),
    subject: F.ref('StoryAssetOccurrenceSubjectRef'),
    occurrencePolicy: F.en('StoryAssetOccurrencePolicy'),
    newInstancePolicy: F.en('StoryAssetNewInstancePolicy'),
    identityAnchors: F.arr(F.str()),
    aliases: F.arr(F.str()),
    eventDefinitionIds: F.arr(F.str()),
    definitionFingerprint: F.str(),
  },
};

export const CANONICAL_UNION_VARIANTS = {
  EvidenceRef: {
    narrative_span: { kind: F.lit('narrative_span'), responseId: F.str(), messageId: F.str(false), bodyFingerprint: F.str(), normalizationVersion: F.num(), startOffset: F.num(), endOffset: F.num(), textFingerprint: F.str() },
    system_command: { kind: F.lit('system_command'), commandId: F.str(), commandFingerprint: F.str() },
    gameplay_receipt: { kind: F.lit('gameplay_receipt'), receiptId: F.str(), receiptType: F.str() },
    schedule_record: { kind: F.lit('schedule_record'), scheduleId: F.str(), scheduleRevision: F.num() },
    notice_record: { kind: F.lit('notice_record'), noticeId: F.str(), noticeRevision: F.num() },
    broadcast_record: { kind: F.lit('broadcast_record'), broadcastId: F.str(), deliveryId: F.str(false), sourceRevision: F.num(), recipientSnapshotFingerprint: F.str() },
    article_version: { kind: F.lit('article_version'), articleId: F.str(), articleVersion: F.num(), claimFingerprint: F.str() },
    migration_record: { kind: F.lit('migration_record'), migrationId: F.str(), sourcePath: F.str(), sourceFingerprint: F.str() },
    projection_record: { kind: F.lit('projection_record'), projectionKind: F.str(), projectionId: F.str(), projectionRevision: F.num() },
    narrative_publication: { kind: F.lit('narrative_publication'), publicationId: F.str(), bodyFingerprint: F.str(), commitReceiptId: F.str() },
  },
  PublicScope: {
    private: { kind: F.lit('private') },
    local: { kind: F.lit('local'), locationIds: F.arr(F.str()), anchorIds: F.arr(F.str(), false) },
    faction: { kind: F.lit('faction'), factionIds: F.arr(F.str()) },
    public: { kind: F.lit('public'), regionIds: F.arr(F.str(), false) },
    broadcast: { kind: F.lit('broadcast'), networkIds: F.arr(F.str()), recipientIds: F.arr(F.str(), false) },
  },
  OpeningPreludeSourceRef: {
    official_notice: { kind: F.lit('official_notice'), noticeId: F.str(), noticeRevision: F.num() },
    public_schedule: { kind: F.lit('public_schedule'), scheduleId: F.str(), scheduleRevision: F.num() },
    manual: { kind: F.lit('manual'), draftId: F.str(), nonProgressing: F.lit(true) },
  },
  RuntimeCommand: {
    advance_time: { kind: F.lit('advance_time'), deltaMinutes: F.num(), reason: F.en('AdvanceTimeReason') },
    create_event_instance: { kind: F.lit('create_event_instance'), proposal: F.ref('CreateEventProposal') },
    resolve_event_instance: { kind: F.lit('resolve_event_instance'), target: F.ref('EventTargetRef'), resolutionMode: F.en('WorldEventResolutionMode'), outcome: F.en('WorldEventOutcome'), evidenceRefs: F.arr(F.ref('EvidenceRef')) },
    supersede_event_instance: { kind: F.lit('supersede_event_instance'), target: F.ref('EventTargetRef'), replacementTarget: F.ref('EventTargetRef', false), reason: F.str(), evidenceRefs: F.arr(F.ref('EvidenceRef')) },
    append_fact: { kind: F.lit('append_fact'), proposal: F.ref('FactProposal') },
    upsert_plan_item: { kind: F.lit('upsert_plan_item'), proposal: F.ref('PlanItemProposal') },
    enqueue_convergence: { kind: F.lit('enqueue_convergence'), proposal: F.ref('ConvergenceProposal') },
    register_emergent_event_definition: { kind: F.lit('register_emergent_event_definition'), proposal: F.ref('EmergentEventDefinitionProposal') },
    grant_knowledge: { kind: F.lit('grant_knowledge'), proposal: F.ref('KnowledgeGrantProposal') },
    publish_public_schedule: { kind: F.lit('publish_public_schedule'), proposal: F.ref('PublicScheduleProposal') },
    issue_official_notice: { kind: F.lit('issue_official_notice'), proposal: F.ref('OfficialNoticeProposal') },
    path_command: { kind: F.lit('path_command'), action: F.en('PathCommandAction'), targetId: F.str(), payload: F.open(['unknown'], false) },
  },
  NewsSourceRef: {
    committed_fact: { kind: F.lit('committed_fact'), factId: F.str(), sourceRevision: F.num() },
    public_schedule: { kind: F.lit('public_schedule'), scheduleId: F.str(), scheduleRevision: F.num() },
    official_notice: { kind: F.lit('official_notice'), noticeId: F.str(), noticeRevision: F.num() },
    article_version: { kind: F.lit('article_version'), articleId: F.str(), articleVersion: F.num(), claimFingerprint: F.str() },
    manual: { kind: F.lit('manual'), draftId: F.str(), nonProgressing: F.lit(true) },
  },
  KnowledgeSubjectRef: {
    committed_fact: { kind: F.lit('committed_fact'), factId: F.str(), sourceRevision: F.num() },
    public_schedule: { kind: F.lit('public_schedule'), scheduleId: F.str(), scheduleRevision: F.num() },
    official_notice: { kind: F.lit('official_notice'), noticeId: F.str(), noticeRevision: F.num() },
    article_version: { kind: F.lit('article_version'), articleId: F.str(), articleVersion: F.num(), claimFingerprint: F.str() },
  },
  StoryAssetOccurrenceSubjectRef: {
    event: { kind: F.lit('event'), eventDefinitionId: F.str() },
    character: { kind: F.lit('character'), characterProfileId: F.str() },
    facility: { kind: F.lit('facility'), facilityId: F.str(), locationProfileId: F.str() },
    item: { kind: F.lit('item'), itemId: F.str() },
    task_result: { kind: F.lit('task_result'), taskResultId: F.str() },
  },
};

export const CANONICAL_ENUMS = {
  WorldEventInstanceStatus: ['scheduled', 'active', 'blocked', 'resolution_pending', 'resolved', 'cancelled', 'superseded', 'missed', 'archived'],
  WorldEventResolutionMode: ['player', 'world_background', 'shared', 'player_early', 'unknown'],
  EventDefinitionResolutionMode: ['player', 'world_background', 'shared', 'player_early'],
  WorldEventOutcome: ['normal', 'deviated', 'escaped', 'failed', 'unknown'],
  WorldEventReplayPolicy: ['once', 'allow_new_instance', 'repeatable'],
  WorldEventDefinitionOrigin: ['catalog', 'emergent'],
  WorldEntityType: ['npc', 'faction', 'location', 'faction_asset', 'system'],
  WorldEntityStatus: ['active', 'inactive', 'destroyed', 'unknown'],
  StoryFocusStatus: ['active', 'blocked', 'awaiting_player', 'completed', 'diverged'],
  EvidenceLevel: ['confirmed', 'supported'],
  FactCreatedBy: ['player_turn', 'world_due', 'manual_import', 'system_migration', 'debug', 'path_command', 'system'],
  PublicScheduleStatus: ['planned', 'postponed', 'cancelled', 'fulfilled'],
  NewsArticleVersionLifecycle: ['draft', 'queued', 'published', 'corrected', 'archived'],
  NewsStoryPhase: ['upcoming', 'ongoing', 'completed', 'postponed', 'cancelled'],
  NewsReliability: ['official', 'confirmed', 'supported', 'rumor', 'manual'],
  MigrationTraceStatus: ['known', 'unknown', 'ambiguous'],
  BroadcastChannel: ['station_broadcast', 'phone_network', 'faction_network', 'direct_radio'],
  KnowledgeSubjectType: ['npc', 'faction', 'player_character'],
  KnowledgeKind: ['fact', 'claim'],
  KnowledgeChannel: ['direct_observation', 'broadcast', 'communication', 'dialogue', 'reading', 'narrative_delivery'],
  ObserverReadChannel: ['player_ui', 'player_character', 'npc', 'faction'],
  ProjectionOutboxKind: ['news', 'knowledge', 'phone', 'memory', 'yiting', 'zhiku', 'map', 'compat_world_events'],
  ProjectionOutboxOperation: ['create', 'deliver', 'rewrite', 'correct', 'archive'],
  OutboxConsumerStatus: ['pending', 'delivered', 'retry_wait', 'dead_letter', 'cancelled'],
  OutboxItemStatus: ['pending', 'leased', 'retry_wait', 'delivered', 'dead_letter', 'cancelled'],
  PayloadRefKind: ['inline', 'payload_store'],
  PlayerPlanItemStatus: ['available', 'selected', 'blocked', 'expired', 'completed', 'replaced'],
  AcceptanceMode: ['正文承接', '系统命令', '交汇承接'],
  WorldPlanItemStatus: ['scheduled', 'active', 'blocked', 'expired', 'fulfilled', 'cancelled'],
  ConvergenceItemStatus: ['available', 'offered', 'accepted', 'declined', 'expired', 'resolved'],
  RuntimeMigrationStatus: ['none', 'pending_confirmation', 'migrated', 'read_only_recovery', 'failed'],
  OfficialNoticeStatus: ['active', 'withdrawn', 'superseded'],
  TurnCommandSource: ['player_turn', 'world_due', 'manual', 'debug', 'migration', 'path_command', 'system'],
  TurnAttemptPhase: ['draft', 'validating', 'committing', 'committed', 'revealing', 'revealed', 'aborted', 'recovery_required'],
  TurnRecoveryAction: ['resume_reveal', 'replay_projection', 'restore_pre_turn', 'await_user_confirmation'],
  NarrativeConsistencyCode: ['illegal_narrative_replay', 'terminal_event_resurrection', 'narrative_no_progress', 'narrative_multi_unit', 'unsupported_future_leap', 'player_action_not_accepted', 'knowledge_leak', 'unregistered_emergent_event'],
  NarrativeRewriteOperation: ['reframe_as_consequence', 'remove_unsupported_claims', 'continue_current_focus'],
  NarrativeDecisionOutcome: ['allow', 'allow_reframed', 'retry', 'reject', 'hold'],
  NarrativePublicationStatus: ['accepted_pending_reveal', 'revealed', 'held', 'discarded'],
  ArticleAudienceKind: ['player_observer', 'player_character', 'npc', 'faction'],
  PayloadMatcherOperator: ['equals', 'one_of', 'gte', 'lte', 'contains'],
  AdvanceTimeReason: ['turn_default', 'narrative_duration', 'player_wait', 'travel', 'world_due'],
  PathCommandAction: ['enter', 'decline', 'judge'],
  EvidenceRefKind: ['narrative_span', 'system_command', 'gameplay_receipt', 'schedule_record', 'notice_record', 'broadcast_record', 'article_version', 'migration_record', 'projection_record', 'narrative_publication'],
  PublicScopeKind: ['private', 'local', 'faction', 'public', 'broadcast'],
  NewsSourceRefKind: ['committed_fact', 'public_schedule', 'official_notice', 'article_version', 'manual'],
  KnowledgeSubjectRefKind: ['committed_fact', 'public_schedule', 'official_notice', 'article_version'],
  StoryAssetCatalogSourceKind: ['builtin_canon', 'user_import', 'legacy_migrated', 'user_authored'],
  StoryAssetConstraintKind: ['hard', 'foreshadow'],
  StoryAssetProfileImportance: ['ordinary', 'important', 'core'],
  StoryAssetLocationLevel: ['cosmos', 'major', 'medium', 'minor', 'zone', 'sublocation', 'unknown'],
  StoryAssetParticipationPolicy: ['player_optional', 'player_required_for_resolution', 'world_only'],
  StoryAssetBypassPolicy: ['remain_available', 'world_background', 'supersede', 'expire'],
  StoryAssetDeviationPolicy: ['continue_compatible', 'branch_candidate', 'supersede', 'hold'],
  StoryAssetEarlyCompletionPolicy: ['resolve_same_definition', 'hold_for_evidence', 'not_applicable'],
  StoryAssetOccurrencePolicy: ['unique', 'allow_new_instance', 'repeatable'],
  StoryAssetNewInstancePolicy: ['forbidden', 'explicit_cause_required', 'allowed'],
  StoryAssetOccurrenceSubjectKind: ['event', 'character', 'facility', 'item', 'task_result'],
};

// ══════════════════════════════════════════════════════════════════════
// canonical 命令防线：commands 分区必须精确等于以下期望。
// ══════════════════════════════════════════════════════════════════════
export const CANONICAL_COMMANDS = {
  union: 'RuntimeCommand',
  kinds: ['advance_time', 'create_event_instance', 'resolve_event_instance', 'supersede_event_instance', 'append_fact', 'upsert_plan_item', 'enqueue_convergence', 'register_emergent_event_definition', 'grant_knowledge', 'publish_public_schedule', 'issue_official_notice', 'path_command'],
  coordinatorAllocates: ['factId', 'eventInstanceId（create 时）', 'sourceRevision', 'occurredAt/committedAt 等提交/发生时间', 'runtimeBranchId', 'scheduleRevision', 'noticeRevision', 'grantId', 'recipientSnapshot', 'idempotencyKey', 'receiptId', 'publicationId', 'outboxId'],
  protectedFields: ['factId', 'eventInstanceId', 'sourceRevision', 'runtimeRevision', 'runtimeBranchId', 'occurredAt', 'committedAt', 'issuedAt', 'observedAt', 'deliveredAt', 'createdAt', 'updatedAt', 'scheduleRevision', 'noticeRevision', 'articleVersion', 'grantId', 'receiptId', 'publicationId', 'outboxId', 'recipientIds', 'audienceSnapshot', 'idempotencyKey', 'eventResolutionKey', 'resultRevision', 'resultCode', 'resultHash', 'stateFingerprint'],
  // 注：fixture 的 protectedFields 实际为 27 项；G1.1 报告误写 28 已在本包报告更正。
  // plannedAt 是 PublicScheduleProposal 的合法语义字段（模型提出的计划时间），不在受保护列表内。
  lookupHints: {
    'EventTargetRef.eventInstanceId': '查找 hint：目标实例必须携带 expectedInstanceFingerprint，由 coordinator 校验',
    'CreateEventProposal.definitionRef.eventDefinitionId': '查找 hint：定义 ID + definitionFingerprint，由 coordinator 校验',
    'PublicScheduleProposal.sourceDefinitionId': '查找 hint：来源定义 ID',
    'FactProposal.eventTarget.eventInstanceId': '查找 hint：通过 EventTargetRef 指向既有实例',
  },
  sourceToCreatedBy: {
    player_turn: 'player_turn',
    world_due: 'world_due',
    manual: 'manual_import',
    debug: 'debug',
    migration: 'system_migration',
    path_command: 'path_command',
    system: 'system',
  },
};

const HANDOFF_SYMBOLS = [
  'StoryRuntimeState', 'StoryRuntimeView', 'StoryProjectionState', 'GameTime', 'GameClock', 'StoryFocus', 'WorldEntityState',
  'WorldEventDefinition', 'WorldEventInstance', 'EmergentEventDefinition', 'CompletionPredicate', 'CommittedWorldFact', 'EvidenceRef', 'PublicScope',
  'NewsSourceRef', 'PublicSchedule', 'OfficialNotice', 'ArticlePolicy', 'NewsArticleAggregate', 'NewsArticleVersion',
  'KnowledgeSubjectRef', 'AudienceSelector', 'AudienceSnapshot', 'BroadcastEnvelope', 'DeliveryRecord', 'KnowledgeReceipt', 'KnowledgeGrant', 'ObserverReadCursor',
  'PlayerPlanItem', 'WorldPlanItem', 'ConvergenceItem', 'OpeningPrelude', 'RuntimeMigrationMeta',
  'TurnAdjudicationReceipt', 'TurnAttemptReceipt', 'TurnCommandSource', 'EventTargetRef', 'CreateEventProposal', 'FactProposal', 'KnowledgeGrantProposal', 'PublicScheduleProposal', 'OfficialNoticeProposal', 'EmergentEventDefinitionProposal', 'PlanItemProposal', 'ConvergenceProposal', 'RuntimeCommand', 'ProjectionOutboxItem',
  'NarrativeConsistencyCode', 'NarrativeRewriteRequest', 'NarrativeConsistencyDecision', 'NarrativePublicationRecord',
];

// ══════════════════════════════════════════════════════════════════════
// G1.1.1.1：类型名集合与 union 元数据 oracle（52 个类型名精确，kind/discriminator 精确）
// ══════════════════════════════════════════════════════════════════════
export const CANONICAL_TYPE_NAMES = [...Object.keys(CANONICAL_FIELD_SPECS), ...Object.keys(CANONICAL_UNION_VARIANTS)];
export const CANONICAL_UNION_META = {
  EvidenceRef: 'kind',
  PublicScope: 'kind',
  OpeningPreludeSourceRef: 'kind',
  RuntimeCommand: 'kind',
  NewsSourceRef: 'kind',
  KnowledgeSubjectRef: 'kind',
  StoryAssetOccurrenceSubjectRef: 'kind',
};

// ══════════════════════════════════════════════════════════════════════
// G1.1.1.1：errorCodes 完整契约（13 个 code ID 精确；每项对象且 code/meaning/source 非空）
// ══════════════════════════════════════════════════════════════════════
export const CANONICAL_ERROR_CODES = [
  'ALREADY_APPLIED',
  'ALREADY_TERMINAL',
  'CONFLICT',
  'DEPENDENCY_CYCLE',
  'EMERGENT_EVENT_COLLISION',
  'IDEMPOTENCY_KEY_REUSED',
  'INVALID_AUDIENCE_SCOPE',
  'INVALID_COMMAND',
  'INVALID_PROTECTED_FIELD',
  'INVALID_SOURCE',
  'MISSING_EVIDENCE',
  'STALE_BRANCH',
  'STALE_PROJECTION',
];

// ══════════════════════════════════════════════════════════════════════
// G1.1.1.2：normalization 规则独立 oracle（canonical 常量，不从 fixture 动态读取）。
// 该常量必须先于 CANONICAL_DEFAULTS 声明（模块初始化顺序）。
// ══════════════════════════════════════════════════════════════════════
export const CANONICAL_NORMALIZATION_RULE = '相同输入经过两次规范化必须得到字节级相同输出和相同 fingerprint';

// ══════════════════════════════════════════════════════════════════════
// G1.1.1.1：顶层运行规则语义 oracle（lifecycle / defaults / compatibility）。
// 纯 note/doc/notes 说明不参与签名（source 不是通用文档键）；影响运行行为的语义键全部锁定。
// 只供 regression 使用，禁止 production import；fixture 是实现唯一来源。
// ══════════════════════════════════════════════════════════════════════
export const CANONICAL_LIFECYCLE = {
  eventInstanceStatusTransitions: [
    { from: 'scheduled', to: ['active', 'blocked', 'cancelled', 'superseded', 'missed'], terminal: false, note: '排期到达不代表一定结算' },
    { from: 'blocked', to: ['scheduled', 'active', 'cancelled', 'superseded', 'missed'], terminal: false, note: '解除阻断必须有新证据/依赖变化' },
    { from: 'active', to: ['resolution_pending', 'resolved', 'cancelled', 'superseded'], terminal: false, note: '模型候选不能直接跨过结果确认' },
    { from: 'resolution_pending', to: ['resolved', 'active', 'cancelled', 'superseded'], terminal: false, note: '证据不足时可退回 active，不创建终态事实' },
    { from: 'resolved', to: ['archived'], terminal: true, note: '普通命令不得复活' },
    { from: 'cancelled', to: ['archived'], terminal: true, note: '普通命令不得复活' },
    { from: 'superseded', to: ['archived'], terminal: true, note: '普通命令不得复活' },
    { from: 'missed', to: ['archived'], terminal: true, note: '普通命令不得复活；除非创建新的合法实例' },
    { from: 'archived', to: [], terminal: true, note: '仅历史读取' },
  ],
  terminalStates: ['resolved', 'cancelled', 'superseded', 'missed', 'archived'],
  nonTerminalStates: ['scheduled', 'active', 'blocked', 'resolution_pending'],
  publicationGateFlow: [
    'allow → 正文可进入 reveal 流程',
    'allow_reframed → 只允许将已发生事件改写为后果/回忆/新实例候选，不能把原始复演当作新事实',
    'retry → 只能使用 NarrativeRewriteRequest.maxAttempts 固定上限，不改变核心状态；耗尽后进入 hold',
    'reject → 保留原始草稿和机器可读违规码，不展示',
    'hold → 保留草稿，不自动展示坏正文，等待确认',
  ],
  publicationGatePlacement: '必须在正文进入 streamingMessage、chatHistory、历史压缩、变量/新闻/手机/记忆等任何下游之前返回决策。',
  commitPointRule: 'commitReceiptId/committedRuntimeRevision 一旦写入，所有 catch/abort/recovery 路径都必须视为 commit 已发生；只能重放正文、投影或存档，不能恢复 pre-turn 核心状态。',
  turnAttemptPhases: ['draft', 'validating', 'committing', 'committed', 'revealing', 'revealed'],
  turnAttemptFailurePhases: ['aborted', 'recovery_required'],
  recoveryActions: ['resume_reveal', 'replay_projection', 'restore_pre_turn', 'await_user_confirmation'],
  revealIdempotency: 'commit 后、reveal 前崩溃按 publicationId + bodyFingerprint + commitReceiptId 幂等重放正文；reveal 后、状态标记前崩溃按 revealMessageId 做一次性确认。',
};

export const CANONICAL_DEFAULTS = {
  arrayDefault: [],
  mapDefault: {},
  optionalFieldSerialization: 'absent',
  unknownEnumValue: 'migration_error',
  emptyPublicScope: { kind: 'private' },
  publicScopeResolution: '空 scope 一律按 private 处理；未知 location/faction/network ID 一律返回 INVALID_AUDIENCE_SCOPE，不能扩大为全局公开。',
  articlePolicy: { regionIds: [], audienceKinds: ['player_observer'], category: '', aggregationKey: '', maxSourceRefs: 8 },
  migration: { status: 'none', evidenceLevel: 'legacy_unverified' },
  evidenceAuthorizationCeiling: {
    acceptedNarrativeSpan: 'confirmed',
    validatedSystemCommand: 'confirmed',
    gameplayReceipt: 'confirmed',
    modelSelfReportedConfidence: 'mentioned',
    titleKeywordHit: 'mentioned',
    futurePlanning: 'inferred',
  },
  idPolicy: {
    forbiddenSemanticKeys: ['Date.now()', 'Math.random()', '数组位置'],
    requiredKeySources: ['runtimeBranchId + eventDefinitionId + activationOrdinal（事件实例）', 'runtimeBranchId + idempotencyKey（命令幂等）', 'branch/父节点/目标 revision/turnId（checkpoint/saveNodeId）'],
  },
  // G1.1.1.2：normalization.note 承载实际运行规则（字节级确定性），不能按字段名当说明剥离；
  // 该规则由 CANONICAL_NORMALIZATION_RULE 常量在路径级精确锁定（不从 fixture 动态读取期望值）。
  normalization: { note: CANONICAL_NORMALIZATION_RULE },
};

export const CANONICAL_COMPATIBILITY = {
  forbiddenLegacyAliases: [
    { name: 'TERMINAL_EVENT', reason: '旧枚举同义词，不得进入新契约；终态重复唯一错误码为 ALREADY_TERMINAL' },
  ],
  forbiddenSubstitutes: [
    { name: 'turnCount as GameTime', reason: '不得用 turnCount 代替 GameTime（dayOrdinal/minuteOfDay）；时间使用 GameTime，显示字符串不是核心时间字段' },
    { name: 'boolean known/visible/confirmed as layered objects', reason: '世界发生/上帝视角/玩家角色知情/NPC 知情/正文承接五件事不能合并为一个 visible 或 known 布尔值' },
  ],
  stateBoundaryLayers: [
    { layer: 'world_committed', carrier: 'CommittedWorldFact.factId' },
    { layer: 'player_observer_visibility', carrier: 'CommittedWorldFact.playerObserverVisible' },
    { layer: 'player_character_knowledge', carrier: 'KnowledgeReceipt.subjectType=player_character / KnowledgeGrant' },
    { layer: 'npc_faction_knowledge', carrier: 'KnowledgeReceipt.subjectType=npc|faction' },
    { layer: 'narrative_acceptance', carrier: 'NarrativeConsistencyDecision.outcome / NarrativePublicationRecord.status' },
  ],
  newsSourceRules: [
    '已发生新闻只能引用 committed_fact',
    '预告只能引用 public_schedule 或 official_notice',
    '人工稿必须 nonProgressing=true，不能改变剧情或事实',
    '文章是聚合根加不可变版本，不能用一个可覆盖的 body 对象表示全部历史',
    '新闻状态和世界事件状态不能合并成一个枚举',
  ],
  knowledgeRules: [
    'AudienceSnapshot 在提交时冻结，worker 重试不得按角色最新位置重新计算受众',
    '玩家阅读新闻只改变 ObserverReadCursor，不能自动产生 NPC 或玩家角色知识回执',
    'claim 只能作为当时听闻/报道声称，不能直接升级为 confirmed world fact',
    'narrative_delivery 必须有正文中明确接收消息的证据',
  ],
  legacyReadOnlyFields: ['世界.全局事件(string[])', '剧情编织.当前进度', '新闻条目[]'],
  legacyReadOnlyRule: '迁移期继续存在，只能作为兼容读取或导出字段，不能在 V3 模式直接写入',
  revisionSeparation: 'runtimeRevision、sourceRevision、文章版本、投影版本和存档分支必须分开表达。',
  legacyCatalogMapping: [
    { legacyField: '系列.id/标题/作品名', target: 'StoryAssetSeries', handling: '映射为资产系列记录' },
    { legacyField: '章节列表', target: 'StoryAssetChapter[]', handling: '映射为资产章节记录' },
    { legacyField: '分段列表（标题、章节范围、摘要、档案、约束、时间线）', target: 'StoryAssetSegment 及关联记录', handling: '映射为资产分段与关联档案/约束/时间线' },
    { legacyField: '关键事件（触发条件/事件结果）', target: 'WorldEventDefinition', handling: '仅在 ID、结构化完成谓词和重复策略可验证时转换；否则输出迁移诊断，不伪造定义' },
    { legacyField: '信息可见性', target: 'StoryAssetVisibilityHint', handling: '映射为资产可见性提示；不得生成知识回执' },
    { legacyField: '激活注入/当前分段组号/当前阶段概括', target: '（丢弃）', handling: '运行字段，不进入 catalog' },
    { legacyField: '处理状态/运行状态/最近错误/updatedAt', target: '（丢弃）', handling: '旧任务或运行字段，不进入 catalog' },
    { legacyField: '当前系列ID/当前进度/历史归档/推进证据', target: '（G1.2/G2 runtime 迁移）', handling: '留给 runtime 迁移，不进入 catalog' },
  ],
  legacyCatalogMappingRule: '旧分段可映射成资产 ID 和引用，但映射结果 eventInstances=[]、factLedger=[]；不得因为旧字段写着“已完成/已经历”就伪造终态事件或事实。',
};

// 顶层运行规则语义投影：剥离纯说明键（note/doc/notes），但：
// - `source` 不再是通用文档键——lifecycle/defaults/compatibility 没有需要保留的顶层 source，
//   任意新增结构化 source（如 lifecycle.source = { policy: ... }）都会进入投影并被拒绝；
// - `note` 剥离保留，但路径级例外：defaults.normalization 的 note 承载字节级确定性规则，
//   由 keepNotePaths 保留并与 CANONICAL_NORMALIZATION_RULE 单独精确断言（见检查 9）。
const TOP_LEVEL_DOC_KEYS = new Set(['note', 'doc', 'notes']);
function stripDocKeys(value, options = {}) {
  if (Array.isArray(value)) return value.map((item) => stripDocKeys(item, options));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, child] of Object.entries(value)) {
      if (options.keepNotePaths && options.keepNotePaths.has(key)) {
        out[key] = child; // 路径级例外：该键整体保留（含 note），由独立 oracle 精确断言
        continue;
      }
      if (TOP_LEVEL_DOC_KEYS.has(key)) continue;
      out[key] = stripDocKeys(child, options);
    }
    return out;
  }
  return value;
}

const CANONICAL_TOP_LEVEL_RULES = {
  lifecycle: CANONICAL_LIFECYCLE,
  defaults: CANONICAL_DEFAULTS,
  compatibility: CANONICAL_COMPATIBILITY,
};
const TOP_LEVEL_KEEP_NOTE_PATHS = {
  defaults: new Set(['normalization']),
};

// canonical 事件状态迁移表（4.3）；终态集合与去向必须完整。
const EXPECTED_TRANSITIONS = [
  { from: 'scheduled', to: ['active', 'blocked', 'cancelled', 'superseded', 'missed'], terminal: false },
  { from: 'blocked', to: ['scheduled', 'active', 'cancelled', 'superseded', 'missed'], terminal: false },
  { from: 'active', to: ['resolution_pending', 'resolved', 'cancelled', 'superseded'], terminal: false },
  { from: 'resolution_pending', to: ['resolved', 'active', 'cancelled', 'superseded'], terminal: false },
  { from: 'resolved', to: ['archived'], terminal: true },
  { from: 'cancelled', to: ['archived'], terminal: true },
  { from: 'superseded', to: ['archived'], terminal: true },
  { from: 'missed', to: ['archived'], terminal: true },
  { from: 'archived', to: [], terminal: true },
];
const TERMINAL_STATES = ['resolved', 'cancelled', 'superseded', 'missed', 'archived'];
const PROPOSAL_TYPES = ['CreateEventProposal', 'FactProposal', 'KnowledgeGrantProposal', 'PublicScheduleProposal', 'OfficialNoticeProposal', 'EmergentEventDefinitionProposal', 'PlanItemProposal', 'ConvergenceProposal'];
const UNION_TYPE_NAMES = Object.keys(CANONICAL_UNION_VARIANTS); // 6 个判别联合
const TOTAL_UNION_VARIANTS = Object.values(CANONICAL_UNION_VARIANTS).reduce((sum, variants) => sum + Object.keys(variants).length, 0); // 39

// ── 收集 fixture 的路径签名表：interface 顶层字段 + union 变体字段（嵌套结构已递归进签名）──
function collectFixtureSignatures(fixture) {
  const paths = {};
  for (const [typeName, typeDef] of Object.entries(fixture.types)) {
    if (typeDef.kind === 'union') {
      for (const variant of typeDef.variants || []) {
        for (const [name, spec] of Object.entries(variant.fields || {})) {
          paths[typeName + '.<' + variant.tag + '>.' + name] = specSignature(spec);
        }
      }
    } else {
      for (const [name, spec] of Object.entries(typeDef.fields || {})) {
        paths[typeName + '.' + name] = specSignature(spec);
      }
    }
  }
  return paths;
}

function collectExpectedSignatures() {
  const paths = {};
  for (const [typeName, fields] of Object.entries(CANONICAL_FIELD_SPECS)) {
    for (const [name, spec] of Object.entries(fields)) {
      paths[typeName + '.' + name] = specSignature(spec);
    }
  }
  for (const [typeName, variants] of Object.entries(CANONICAL_UNION_VARIANTS)) {
    for (const [tag, fields] of Object.entries(variants)) {
      for (const [name, spec] of Object.entries(fields)) {
        paths[typeName + '.<' + tag + '>.' + name] = specSignature(spec);
      }
    }
  }
  return paths;
}

// ── 命令防线：精确锁定 ──
function assertCommandDefense(fixture) {
  const commands = fixture.commands;
  assert(commands.union === CANONICAL_COMMANDS.union, 'commands.union 必须是 RuntimeCommand');
  assert(JSON.stringify(commands.kinds) === JSON.stringify(CANONICAL_COMMANDS.kinds), 'commands.kinds 与 canonical 不一致');
  assert(JSON.stringify(commands.coordinatorAllocates) === JSON.stringify(CANONICAL_COMMANDS.coordinatorAllocates), 'commands.coordinatorAllocates 与 canonical 不一致');
  assert(JSON.stringify(commands.protectedFields) === JSON.stringify(CANONICAL_COMMANDS.protectedFields), 'commands.protectedFields 与 canonical 不一致（当前 ' + commands.protectedFields.length + ' 项）');
  assert(!commands.protectedFields.includes('plannedAt'), 'plannedAt 是合法 proposal 字段，不得进入 protectedFields');
  // lookupHints：key 集合精确 + 说明语义非空 + 路径在 fixture 中真实存在（允许 ref 链）。
  const hintKeys = Object.keys(commands.lookupHints || {});
  const expectedHintKeys = Object.keys(CANONICAL_COMMANDS.lookupHints);
  assert(JSON.stringify(hintKeys.sort()) === JSON.stringify([...expectedHintKeys].sort()), 'commands.lookupHints key 集合与 canonical 不一致');
  for (const [key, description] of Object.entries(commands.lookupHints)) {
    assert(typeof description === 'string' && description.includes('hint'), 'lookupHints 说明必须携带查找 hint 语义: ' + key);
    assert(resolveFieldPath(fixture, key) !== null, 'lookupHints 路径必须真实存在于 fixture: ' + key);
  }
  // sourceToCreatedBy：7 条映射精确 + 两侧分别属于 TurnCommandSource / FactCreatedBy。
  const mapping = commands.sourceToCreatedBy || {};
  assert(JSON.stringify(Object.keys(mapping).sort()) === JSON.stringify(Object.keys(CANONICAL_COMMANDS.sourceToCreatedBy).sort()), 'sourceToCreatedBy 键集合不完整');
  assert(JSON.stringify(mapping) === JSON.stringify(CANONICAL_COMMANDS.sourceToCreatedBy), 'sourceToCreatedBy 映射值与 canonical 不一致');
  const turnSources = new Set(CANONICAL_ENUMS.TurnCommandSource);
  const createdBys = new Set(CANONICAL_ENUMS.FactCreatedBy);
  for (const [source, createdBy] of Object.entries(mapping)) {
    assert(turnSources.has(source), 'sourceToCreatedBy 键必须属于 TurnCommandSource: ' + source);
    assert(createdBys.has(createdBy), 'sourceToCreatedBy 值必须属于 FactCreatedBy: ' + createdBy);
  }
}

// ── lookupHints 路径解析：TypeName.field[.field...]，ref 链允许 ──
function resolveFieldPath(fixture, pathText) {
  const parts = pathText.split('.');
  if (parts.length < 2) return null;
  let current = fixture.types[parts[0]];
  if (!current) return null;
  for (let i = 1; i < parts.length; i++) {
    const field = (current.fields || {})[parts[i]];
    if (!field) return null;
    if (i === parts.length - 1) return field;
    if (field.type === 'ref') {
      current = fixture.types[field.to];
      if (!current) return null;
    } else if (field.type === 'object') {
      current = { fields: field.fields };
    } else {
      return null;
    }
  }
  return null;
}

// ── proposal 递归保护：直接/嵌套字段名不得命中受保护字段；只有 canonical 查找 hint 例外 ──
function assertProposalProtection(fixture) {
  const protectedSet = new Set(fixture.commands.protectedFields);
  for (const proposalName of PROPOSAL_TYPES) {
    const typeDef = fixture.types[proposalName];
    assert(typeDef, '缺少提案类型: ' + proposalName);
    const visit = (spec, pathText) => {
      if (spec.type === 'object') {
        for (const [name, child] of Object.entries(spec.fields || {})) {
          if (protectedSet.has(name)) {
            assert(resolveFieldPath(fixture, proposalName + '.' + pathText + name) !== null, 'proposal 嵌套声明受保护字段且无查找 hint 路径: ' + proposalName + '.' + pathText + name);
          }
          visit(child, pathText + name + '.');
        }
      }
      if (spec.type === 'array' && spec.items) visit(spec.items, pathText);
      if (spec.type === 'map' && spec.value) visit(spec.value, pathText);
      if (spec.type === 'union') for (const variant of spec.variants || []) for (const child of Object.values(variant.fields || {})) visit(child, pathText);
    };
    for (const [name, spec] of Object.entries(typeDef.fields || {})) {
      assert(!protectedSet.has(name), 'proposal 直接声明受保护字段: ' + proposalName + '.' + name);
      visit(spec, name + '.');
    }
  }
}

// ── 空状态构造（检查 3 用）──
function emptyValueFor(spec, fixture, stack) {
  if (spec.type === 'array') return [];
  if (spec.type === 'map' || spec.type === 'open_map') return {};
  if (spec.type === 'object') return emptyObjectFor(spec.fields || {}, fixture, stack);
  if (spec.type === 'string') return '';
  if (spec.type === 'number') return 0;
  if (spec.type === 'boolean') return false;
  if (spec.type === 'literal') return spec.value;
  if (spec.type === 'enum') return (fixture.enums[spec.enum]?.values || [])[0] ?? '';
  if (spec.type === 'scalar_union') return '';
  if (spec.type === 'ref') return emptyTypeValue(spec.to, fixture, stack);
  if (spec.type === 'union') {
    const first = (spec.variants || [])[0];
    return first ? emptyObjectFor(first.fields || {}, fixture, stack) : {};
  }
  return null;
}

function emptyObjectFor(fields, fixture, stack) {
  const out = {};
  for (const [name, spec] of Object.entries(fields)) {
    if (spec.required || spec.type === 'array' || spec.type === 'map' || spec.type === 'open_map') {
      out[name] = emptyValueFor(spec, fixture, stack);
    }
  }
  return out;
}

function emptyTypeValue(typeName, fixture, stack) {
  const typeDef = fixture.types[typeName];
  if (!typeDef) return null;
  if (stack.includes(typeName)) return null;
  const next = [...stack, typeName];
  if (typeDef.kind === 'union') return emptyObjectFor(typeDef.variants?.[0]?.fields || {}, fixture, next);
  return emptyObjectFor(typeDef.fields || {}, fixture, next);
}

// ══════════════════════════════════════════════════════════════════════
// 主校验：全部检查通过才返回摘要，任一失败直接抛错。
// ══════════════════════════════════════════════════════════════════════
export function validateContractFixture(fixture) {
  const checks = [];

  // 检查 1：fixture 可解析且 schemaVersion/contractId/contractRevision 正确，顶层分区完整。
  assert(fixture && typeof fixture === 'object', 'fixture 不可解析');
  assert(fixture.schemaVersion === 3, 'schemaVersion 必须是 3');
  assert(fixture.contractId === 'story-runtime-v3', 'contractId 必须是 story-runtime-v3');
  assert(fixture.contractRevision === 2, 'contractRevision 必须是 2（G1.1.2 资产边界 schema revision）');
  for (const section of ['types', 'enums', 'commands', 'errorCodes', 'lifecycle', 'defaults', 'compatibility']) {
    assert(fixture[section] !== undefined, '缺少顶层分区: ' + section);
  }
  checks.push('检查1 fixture 元信息与顶层分区');

  // 检查 2a：领域符号逐项覆盖（51 项，types 或 enums 任一出现即算覆盖）。
  const typeNames = new Set(Object.keys(fixture.types));
  const enumNames = new Set(Object.keys(fixture.enums));
  const symbolCoverage = {};
  for (const symbol of HANDOFF_SYMBOLS) {
    const covered = typeNames.has(symbol) || enumNames.has(symbol);
    symbolCoverage[symbol] = covered;
    assert(covered, '领域符号未被 fixture 覆盖: ' + symbol);
  }
  checks.push('检查2a 领域符号覆盖（' + HANDOFF_SYMBOLS.length + ' 项）');

  // 检查 2b：全字段规格镜像——52 个类型的每个字段（含嵌套 object/array/map/union 的形状、
  // required、默认值、ref.to、enum.enum、literal.value）必须与 canonical 期望签名逐一相等。
  const expectedSignatures = collectExpectedSignatures();
  const fixtureSignatures = collectFixtureSignatures(fixture);
  const expectedPaths = Object.keys(expectedSignatures).sort();
  const fixturePaths = Object.keys(fixtureSignatures).sort();
  assert(JSON.stringify(fixturePaths) === JSON.stringify(expectedPaths), '字段路径集合与 canonical 不一致：缺失=' + JSON.stringify(expectedPaths.filter((p) => !fixtureSignatures[p])) + ' 多余=' + JSON.stringify(fixturePaths.filter((p) => !expectedSignatures[p])));
  for (const p of expectedPaths) {
    assert(fixtureSignatures[p] === expectedSignatures[p], '字段规格与 canonical 不一致: ' + p);
  }
  checks.push('检查2b 全字段规格镜像（' + fixturePaths.length + ' 条字段签名，' + Object.keys(fixture.types).length + ' 个类型）');

  // 检查 2c：数组/map 默认值契约（嵌套与变体字段一并覆盖）。
  for (const [typeName, typeDef] of Object.entries(fixture.types)) {
    const visit = (spec, where) => {
      if (spec.type === 'array') assert(Array.isArray(spec.default), '数组字段缺少默认 []: ' + where);
      if ((spec.type === 'map' || spec.type === 'open_map') && !Object.prototype.hasOwnProperty.call(spec, 'default')) {
        fail('map 字段缺少默认 {}: ' + where);
      }
      if (spec.type === 'object') for (const [name, child] of Object.entries(spec.fields || {})) visit(child, where + '.' + name);
      if (spec.type === 'array' && spec.items) visit(spec.items, where + '[]');
      if (spec.type === 'map' && spec.value) visit(spec.value, where + '.<map-value>');
      if (spec.type === 'union') for (const variant of spec.variants || []) for (const [name, child] of Object.entries(variant.fields || {})) visit(child, where + '.<' + variant.tag + '>.' + name);
    };
    if (typeDef.kind === 'union') {
      for (const variant of typeDef.variants || []) for (const [name, spec] of Object.entries(variant.fields || {})) visit(spec, typeName + '.<' + variant.tag + '>.' + name);
    } else {
      for (const [name, spec] of Object.entries(typeDef.fields || {})) visit(spec, typeName + '.' + name);
    }
  }
  checks.push('检查2c 数组默认 [] / map 默认 {} 契约');

  // 检查 2d：枚举值完整（47 个枚举逐一相等）。
  assert(Object.keys(fixture.enums).length === Object.keys(CANONICAL_ENUMS).length, 'fixture 枚举数量与 canonical 期望不一致');
  for (const [enumName, expectedValues] of Object.entries(CANONICAL_ENUMS)) {
    assert(fixture.enums[enumName], '缺少枚举: ' + enumName);
    assert(JSON.stringify(fixture.enums[enumName].values) === JSON.stringify(expectedValues), '枚举值与 canonical 不一致: ' + enumName);
  }
  checks.push('检查2d 枚举值完整（' + Object.keys(CANONICAL_ENUMS).length + ' 个枚举）');

  // 检查 2e：未知键拒绝——任何类型/规格/枚举对象不允许计划外键（自由 JSON 防线）。
  assertNoUnknownKeys(fixture);
  assertNoDanglingRefs(fixture);
  checks.push('检查2e 规格键白名单与悬空引用');

  // 检查 2f：类型名集合精确相等（新增空类型/删除/改名/多余类型均拒绝）+ union 元数据（kind/discriminator）。
  const fixtureTypeNames = Object.keys(fixture.types);
  assert(JSON.stringify(fixtureTypeNames.sort()) === JSON.stringify([...CANONICAL_TYPE_NAMES].sort()), '类型名集合与 canonical 不一致：缺失=' + JSON.stringify(CANONICAL_TYPE_NAMES.filter((n) => !fixture.types[n])) + ' 多余=' + JSON.stringify(fixtureTypeNames.filter((n) => !CANONICAL_TYPE_NAMES.includes(n))));
  const unionNames = new Set(Object.keys(CANONICAL_UNION_META));
  for (const [typeName, typeDef] of Object.entries(fixture.types)) {
    if (unionNames.has(typeName)) {
      assert(typeDef.kind === 'union', typeName + ' 必须是 union 类型（类型元数据漂移）');
      assert(typeDef.discriminator === CANONICAL_UNION_META[typeName], typeName + ' 的 discriminator 必须是 ' + CANONICAL_UNION_META[typeName] + '（类型元数据漂移）');
    } else {
      assert(typeDef.kind === 'interface', typeName + ' 必须是 interface 类型（类型元数据漂移）');
      assert(typeDef.discriminator === undefined, typeName + ' 是 interface，不允许出现 discriminator（类型元数据漂移）');
    }
  }
  for (const unionName of unionNames) {
    assert(fixture.types[unionName]?.kind === 'union', 'oracle 中的 union 必须存在于 fixture: ' + unionName);
  }
  checks.push('检查2f 类型名集合与 union 元数据（' + fixtureTypeNames.length + ' 个类型）');

  // 检查 3：六个判别联合 39 个变体逐项执行。
  let variantChecked = 0;
  for (const unionName of UNION_TYPE_NAMES) {
    const typeDef = fixture.types[unionName];
    assert(typeDef && typeDef.kind === 'union', unionName + ' 必须是 union 类型');
    const expectedVariants = CANONICAL_UNION_VARIANTS[unionName];
    const tags = (typeDef.variants || []).map((v) => v.tag);
    // 3.1.1：tag 集合与顺序必须与 canonical 期望一致。
    assert(JSON.stringify(tags) === JSON.stringify(Object.keys(expectedVariants)), unionName + ' 变体 tag 集合/顺序与 canonical 不一致');
    for (const variant of typeDef.variants) {
      const expectedFields = expectedVariants[variant.tag];
      // 3.1.2：required/optional 字段集合精确一致。
      const actualRequired = Object.entries(variant.fields || {}).filter(([, s]) => s.required).map(([n]) => n).sort();
      const expectedRequired = Object.entries(expectedFields).filter(([, s]) => s.required).map(([n]) => n).sort();
      assert(JSON.stringify(actualRequired) === JSON.stringify(expectedRequired), unionName + '.<' + variant.tag + '> required 集合不一致');
      const actualOptional = Object.entries(variant.fields || {}).filter(([, s]) => !s.required).map(([n]) => n).sort();
      const expectedOptional = Object.entries(expectedFields).filter(([, s]) => !s.required).map(([n]) => n).sort();
      assert(JSON.stringify(actualOptional) === JSON.stringify(expectedOptional), unionName + '.<' + variant.tag + '> optional 集合不一致');
      // 3.1.3：kind 必须是 required literal，且 literal 值必须等于该变体 tag。
      const kindSpec = variant.fields?.kind;
      assert(kindSpec && kindSpec.type === 'literal' && kindSpec.required === true, unionName + '.<' + variant.tag + '> 必须声明 required literal kind');
      assert(kindSpec.value === variant.tag, unionName + '.<' + variant.tag + '> kind literal 必须等于变体 tag');
      // 3.1.4：数组/map 默认值及其嵌套项由检查 2c 覆盖（此处显式复跑该变体字段）。
      for (const [name, spec] of Object.entries(variant.fields || {})) {
        assert(specSignature(spec) === specSignature(expectedFields[name]), unionName + '.<' + variant.tag + '>.' + name + ' 规格与 canonical 不一致');
      }
      variantChecked += 1;
    }
  }
  assert(variantChecked === TOTAL_UNION_VARIANTS, 'union 变体总数必须是 ' + TOTAL_UNION_VARIANTS + '，实际 ' + variantChecked);
  checks.push('检查3 全部判别联合逐变体执行（' + variantChecked + ' 个变体）');

  // 检查 4：StoryRuntimeState 空状态形状；outbox 不属于核心 blob。
  const stateFields = fixture.types.StoryRuntimeState.fields;
  assert(stateFields && !Object.prototype.hasOwnProperty.call(stateFields, 'outbox'), 'outbox 不得属于 StoryRuntimeState 核心 blob');
  const viewOutbox = fixture.types.StoryRuntimeView.fields.outbox;
  assert(viewOutbox && viewOutbox.type === 'array' && viewOutbox.items?.to === 'ProjectionOutboxItem', 'outbox 只允许出现在 StoryRuntimeView 且元素为 ProjectionOutboxItem');
  const emptyState = emptyTypeValue('StoryRuntimeState', fixture, []);
  assert(typeof emptyState.runtimeRevision === 'number', '空状态必须拥有 runtimeRevision');
  assert(emptyState.gameClock && typeof emptyState.gameClock.now?.dayOrdinal === 'number', '空状态必须拥有 gameClock');
  assert(emptyState.focus && typeof emptyState.focus.focusId === 'string', '空状态必须拥有 focus');
  for (const listField of ['factLedger', 'playerPlanPool', 'worldPlanPool', 'convergenceQueue', 'worldEvents', 'entities', 'publicSchedules', 'officialNotices', 'knowledgeGrants', 'turnReceipts', 'narrativePublications']) {
    assert(Array.isArray(emptyState[listField]) && emptyState[listField].length === 0, '空状态账本/规划池/交汇队列必须为空: ' + listField);
  }
  assert(!Object.prototype.hasOwnProperty.call(emptyState, 'outbox'), '组合视图 outbox 不能混入核心空状态');
  checks.push('检查4 StoryRuntimeState 空状态与 outbox 归属');

  // 检查 5：事件状态迁移表与终态集合完整；终态事件不能回到 active/resolved。
  const transitions = fixture.lifecycle.eventInstanceStatusTransitions;
  assert(Array.isArray(transitions) && transitions.length === EXPECTED_TRANSITIONS.length, '迁移表行数不完整');
  for (const expected of EXPECTED_TRANSITIONS) {
    const row = transitions.find((item) => item.from === expected.from);
    assert(row, '迁移表缺少状态: ' + expected.from);
    assert(JSON.stringify([...row.to].sort()) === JSON.stringify([...expected.to].sort()), '迁移去向不一致: ' + expected.from);
    assert(row.terminal === expected.terminal, '终态标记不一致: ' + expected.from);
  }
  assert(JSON.stringify(fixture.lifecycle.terminalStates) === JSON.stringify(TERMINAL_STATES), '终态集合不完整');
  assert(JSON.stringify(fixture.lifecycle.nonTerminalStates) === JSON.stringify(['scheduled', 'active', 'blocked', 'resolution_pending']), '非终态集合不完整');
  for (const terminal of TERMINAL_STATES) {
    const row = transitions.find((item) => item.from === terminal);
    assert(row && row.terminal, '终态状态必须标记 terminal: ' + terminal);
    assert(!row.to.includes('active') && !row.to.includes('resolved'), '终态事件不能回到 active/resolved: ' + terminal);
  }
  checks.push('检查5 事件状态迁移表与终态保护');

  // 检查 6：命令防线精确锁定（union/命令集合/coordinatorAllocates/protectedFields/lookupHints/sourceToCreatedBy）。
  assertCommandDefense(fixture);
  // proposal 递归保护：受保护字段只能通过 lookupHints 登记的路径出现。
  assertProposalProtection(fixture);
  checks.push('检查6 命令防线与 proposal 受保护字段隔离');

  // 检查 7：errorCodes 完整契约（13 个 code ID 精确；每项对象且 code/meaning/source 非空）+ NarrativeConsistencyCode 命名。
  assert(JSON.stringify(fixture.enums.NarrativeConsistencyCode.values) === JSON.stringify(CANONICAL_ENUMS.NarrativeConsistencyCode), 'NarrativeConsistencyCode 必须是 canonical 八码');
  assert(Array.isArray(fixture.errorCodes), 'errorCodes 必须是数组');
  for (const item of fixture.errorCodes) {
    assert(item && typeof item === 'object' && !Array.isArray(item), 'errorCodes 每项必须是对象');
    assert(typeof item.code === 'string' && item.code.trim().length > 0, 'errorCodes 每项必须携带非空 code');
    assert(typeof item.meaning === 'string' && item.meaning.trim().length > 0, 'errorCodes 每项必须携带非空 meaning');
    assert(typeof item.source === 'string' && item.source.trim().length > 0, 'errorCodes 每项必须携带非空 source');
  }
  const errorCodeList = fixture.errorCodes.map((item) => item.code);
  assert(JSON.stringify([...errorCodeList].sort()) === JSON.stringify([...CANONICAL_ERROR_CODES].sort()), 'errorCodes 集合与 canonical 不一致（缺失/增加/替换）：期望 ' + CANONICAL_ERROR_CODES.length + ' 个，实际 ' + errorCodeList.length + ' 个');
  assert(new Set(errorCodeList).size === errorCodeList.length, 'errorCodes 不允许重复');
  assert(errorCodeList.includes('ALREADY_TERMINAL'), 'errorCodes 必须包含 ALREADY_TERMINAL');
  const codeText = canonicalJsonStringify({ types: fixture.types, enums: fixture.enums, commands: fixture.commands, errorCodes: fixture.errorCodes });
  assert(!codeText.includes('TERMINAL_EVENT'), 'TERMINAL_EVENT 不得作为类型/枚举/命令/错误码进入新契约');
  assert(JSON.stringify(fixture.compatibility?.forbiddenLegacyAliases || []).includes('TERMINAL_EVENT'), 'compatibility 必须显式声明 TERMINAL_EVENT 为禁止旧同义码');
  checks.push('检查7 errorCodes 完整契约（' + errorCodeList.length + ' 个）与拒绝码命名');

  // 检查 8：同一 fixture 深拷贝后 canonical 序列化两次，字节和 fingerprint 完全一致。
  const clone = JSON.parse(canonicalJsonStringify(fixture));
  const first = computeContractFingerprint(fixture);
  const second = computeContractFingerprint(clone);
  assert(first.canonical === second.canonical, 'canonical 序列化两次字节不一致');
  assert(first.fingerprint === second.fingerprint, 'canonical 序列化两次 fingerprint 不一致');
  checks.push('检查8 确定性 canonical 序列化');

  // 检查 9：顶层运行规则语义投影镜像——lifecycle/defaults/compatibility 的影响运行行为键全部锁定。
  // G1.1.1.2：source 不再是通用文档键（任意新增结构化 source 都参与投影并被拒绝）；
  // defaults.normalization 的 note 承载字节级确定性规则，由 keepNotePaths 保留并通过
  // CANONICAL_NORMALIZATION_RULE 独立精确断言（路径级 semantic oracle，不从 fixture 动态读取期望值）。
  const normalization = fixture.defaults?.normalization;
  assert(normalization && typeof normalization === 'object' && !Array.isArray(normalization), 'defaults.normalization 必须是对象');
  assert(JSON.stringify(Object.keys(normalization)) === JSON.stringify(['note']), 'defaults.normalization 只允许 note 一个键（不允许新增结构化内容）');
  assert(typeof normalization.note === 'string' && normalization.note === CANONICAL_NORMALIZATION_RULE, 'defaults.normalization.note 与 canonical 规则不一致（删除/修改/反转均拒绝）：期望 "' + CANONICAL_NORMALIZATION_RULE + '"');
  const topLevelCounts = {};
  for (const section of ['lifecycle', 'defaults', 'compatibility']) {
    const keepNotePaths = TOP_LEVEL_KEEP_NOTE_PATHS[section] || new Set();
    const fixtureProjection = stripDocKeys(fixture[section], { keepNotePaths });
    const oracleProjection = stripDocKeys(CANONICAL_TOP_LEVEL_RULES[section], { keepNotePaths });
    assert(canonicalJsonStringify(fixtureProjection) === canonicalJsonStringify(oracleProjection), '顶层运行规则与 canonical 不一致: ' + section);
    topLevelCounts[section] = Object.keys(oracleProjection).length;
  }
  checks.push('检查9 顶层运行规则语义投影（lifecycle ' + topLevelCounts.lifecycle + ' 键 / defaults ' + topLevelCounts.defaults + ' 键 / compatibility ' + topLevelCounts.compatibility + ' 键，normalization 路径级锁定）');

  return {
    passedChecks: checks,
    symbolCoverage,
    typeCount: Object.keys(fixture.types).length,
    enumCount: Object.keys(fixture.enums).length,
    commandKindCount: fixture.commands.kinds.length,
    errorCodeCount: errorCodeList.length,
    transitionCount: transitions.length,
    unionVariantChecks: variantChecked,
    fieldSpecChecks: Object.keys(fixtureSignatures).length,
    typeNameChecks: fixtureTypeNames.length,
    topLevelRuleChecks: topLevelCounts,
    fingerprint: computeContractFingerprint(fixture).fingerprint,
  };
}

async function main() {
  const { fixture } = readContractFixture();
  const summary = validateContractFixture(fixture);

  console.log('story-runtime-contract regression passed.');
  console.log('contractId: ' + fixture.contractId + ' (revision ' + fixture.contractRevision + ', schemaVersion ' + fixture.schemaVersion + ')');
  console.log('covered symbols: ' + Object.keys(summary.symbolCoverage).length);
  console.log('types: ' + summary.typeCount);
  console.log('enums: ' + summary.enumCount);
  console.log('command kinds: ' + summary.commandKindCount);
  console.log('error codes: ' + summary.errorCodeCount);
  console.log('event status transitions: ' + summary.transitionCount);
  console.log('field spec checks: ' + summary.fieldSpecChecks);
  console.log('type name checks: ' + summary.typeNameChecks);
  console.log('union variant checks: ' + summary.unionVariantChecks);
  console.log('error code checks: ' + summary.errorCodeCount);
  console.log('top-level rule checks: ' + Object.values(summary.topLevelRuleChecks).join(' + ') + ' (lifecycle + defaults + compatibility)');
  console.log('fixture fingerprint: ' + summary.fingerprint);
  console.log('checks passed:');
  for (const check of summary.passedChecks) console.log('  - ' + check);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-contract regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
