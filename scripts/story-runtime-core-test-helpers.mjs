// G1.3.1 测试共享 helper：esbuild bundle 生产 TS 模块 + 最小 StoryRuntimeState 构造 + 确定性 allocator。
// 只被 scripts/story-runtime-*-regression.mjs 使用；不进入生产。
import path from 'node:path';
import { build as esbuildBuild } from 'esbuild';

export async function bundleTs(entry) {
  const result = await esbuildBuild({
    entryPoints: [path.join(process.cwd(), entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  return import('data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64'));
}

// 生产 normalization/id 经 esbuild 加载（Node ESM 不直接执行 .ts）。
let _norm = null;
let _id = null;
let _sharedEntry = null;
export async function loadBaseModules() {
  if (!_norm) _norm = await bundleTs('services/storyRuntime/normalization.ts');
  if (!_id) _id = await bundleTs('services/storyRuntime/id.ts');
  return { normalization: _norm, id: _id };
}

/**
 * G1.3.1.6 测试共享入口：让 store 构造 / verifier / commandValidator / runRuntimeTurn 来自同一生产模块图
 * （同一个 esbuild bundle），模块私有 WeakSet brand 才是同一份。只 bundle 一次并缓存。
 * 返回 { StoryAssetCatalogStore, isStoryAssetCatalogStore, isTrustedCatalogStore, runRuntimeTurn, stateFingerprintOf, validateCommandStructure, deriveFactsOfInterest }。
 */
export async function loadSharedRuntimeEntry() {
  if (!_sharedEntry) _sharedEntry = await bundleTs('scripts/story-runtime-shared-test-entry.ts');
  return _sharedEntry;
}

/** 确定性 allocator（复用 G1.2.3 stableId 规则：namespace + canonical scope；不用时间/随机/下标）。 */
export async function makeAllocator() {
  const base = await loadBaseModules();
  const { canonicalJsonStringify, normalizeLegacyText } = base.normalization;
  const { sha256Hex } = base.id;
  const cache = new Map();
  return async (namespace, scope, legacyId) => {
    const scopeText = canonicalJsonStringify(scope);
    const legacyPart = legacyId !== undefined && legacyId.trim().length > 0 ? ':' + normalizeLegacyText(legacyId) : '';
    const key = namespace + ':' + scopeText + legacyPart;
    if (cache.has(key)) return cache.get(key);
    const hex = await sha256Hex(key);
    const id = 'sha256:' + hex;
    cache.set(key, id);
    return id;
  };
}

/** 最小合法 StoryRuntimeState（供回归构造）。 */
export function makeEmptyState(overrides = {}) {
  const now = { dayOrdinal: 1, minuteOfDay: 0 };
  return {
    schemaVersion: 3,
    runtimeBranchId: 'branch_test',
    saveNodeId: 'save_test',
    assetCatalogFingerprint: 'sha256:asset_test',
    runtimeRevision: 0,
    turnCount: 0,
    gameClock: { now, defaultAdvanceMinutes: 10, policyVersion: 1, lastAdvanceRevision: 0 },
    focus: { focusId: 'focus_test', status: 'active', reasonCodes: [], enteredAtRevision: 0 },
    playerPlanPool: [],
    worldPlanPool: [],
    convergenceQueue: [],
    worldEvents: [],
    entities: [],
    factLedger: [],
    publicSchedules: [],
    officialNotices: [],
    knowledgeGrants: [],
    commandIdempotencyIndex: {},
    turnReceipts: [],
    narrativePublications: [],
    migration: { status: 'none', unresolvedCursorIds: [], warnings: [] },
    ...overrides,
  };
}

/** 构造一个事件实例（once/unique 默认；玩家可参与的事件默认 active）。 */
export function makeEventInstance(overrides = {}) {
  return {
    eventInstanceId: 'evt_inst_1',
    eventDefinitionId: 'evt_def_a',
    status: 'active',
    replayPolicy: 'once',
    participantIds: [],
    dependencyIds: [],
    publicFactIds: [],
    idempotencyKey: 'seed:evt_def_a:1',
    source: { kind: 'narrative_span', responseId: 'r1', bodyFingerprint: 'fp1', normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'fp1' },
    ...overrides,
  };
}

/** 构造 narrative_span 证据（可定位）。 */
export function narrativeEvidence(seed = 'r') {
  return { kind: 'narrative_span', responseId: seed, bodyFingerprint: 'fp:' + seed, normalizationVersion: 1, startOffset: 0, endOffset: 1, textFingerprint: 'fp:' + seed };
}

/**
 * 构造真实 narrative_span 证据：bodyFingerprint = rawBody 真实 SHA-256，
 * textFingerprint = rawBody.slice(start,end) 真实 SHA-256，responseId 绑定本回合。
 */
export async function narrativeSpanEvidence(rawBody, responseId, start = 0, end = rawBody.length) {
  const base = await loadBaseModules();
  const { sha256Hex } = base.id;
  const bodyFp = 'sha256:' + (await sha256Hex(rawBody));
  const text = rawBody.slice(start, end);
  const textFp = 'sha256:' + (await sha256Hex(text));
  return { kind: 'narrative_span', responseId, bodyFingerprint: bodyFp, normalizationVersion: 1, startOffset: start, endOffset: end, textFingerprint: textFp };
}

/** 最小合法 WorldEventDefinition（G1.3.1.4 可信 catalog 构造用；definitionFingerprint 由调用方用真实值填充）。 */
export function makeWorldEventDefinition(overrides = {}) {
  return {
    eventDefinitionId: 'evt_def_a',
    origin: 'catalog',
    title: 'event definition',
    actorEntityIds: [],
    targetEntityIds: [],
    dependencyDefinitionIds: [],
    completionPredicate: { predicateId: 'p', targetEntityIds: [], requiredFactTypes: [], requiredEvidenceKinds: [], payloadMatchers: [], minimumEvidenceCount: 1, deterministicKey: 'k', allowedOutcomes: [], failureOutcomes: [] },
    scheduling: {},
    allowedResolutionModes: [],
    replayPolicy: 'once',
    publicScope: { kind: 'private' },
    consequenceDefinitionIds: [],
    definitionFingerprint: 'sha256:def_fp',
    ...overrides,
  };
}

/**
 * G1.3.1.4 可信 catalog 构造：生成一个 StoryAssetCatalog（含 eventDefinitions），
 * 为每个 definition 计算真实 definitionFingerprint（排除 definitionFingerprint 自身字段的 canonical），
 * 计算真实 catalogFingerprint（排除 catalogFingerprint 自身字段的 canonical），
 * 通过 G1.2.3 只读 StoryAssetCatalogStore.put 验证并存入，返回 { store, catalogFingerprint, eventDefinitions, catalog }。
 * G1.3.1.6：store 实例必须来自共享测试入口（与 reducer/verifier 同一生产模块图），保证 WeakSet brand 同一份。
 * 调用方把返回的 catalogFingerprint 写入 state.assetCatalogFingerprint 即构成"可信绑定"。
 */
export async function makeTrustedCatalog(eventDefinitions = [], extra = {}) {
  const base = await loadBaseModules();
  const shared = await loadSharedRuntimeEntry();
  const store = new shared.StoryAssetCatalogStore();
  const trustedDefinitions = [];
  for (const def of eventDefinitions) {
    const { definitionFingerprint: _ignored, ...defPayload } = def;
    const defFp = await base.id.sha256Fingerprint(defPayload);
    trustedDefinitions.push({ ...def, definitionFingerprint: defFp });
  }
  const catalog = {
    schemaVersion: 1,
    catalogId: 'cat_test',
    catalogRevision: 1,
    catalogFingerprint: '',
    normalizationVersion: 1,
    sourceKind: 'builtin_canon',
    title: 'test catalog',
    sourceRefs: [],
    series: [],
    chapters: [],
    segments: [],
    characterProfiles: [],
    factionProfiles: [],
    locationProfiles: [],
    constraints: [],
    visibilityHints: [],
    timelineEntries: [],
    routePolicies: [],
    occurrenceDefinitions: [],
    eventDefinitions: trustedDefinitions,
    ...extra,
  };
  const { catalogFingerprint: _ignored2, ...payload } = catalog;
  const fingerprint = await base.id.sha256Fingerprint(payload);
  catalog.catalogFingerprint = fingerprint;
  const put = await store.put(catalog);
  if (!put.ok) throw new Error('makeTrustedCatalog put failed: ' + put.reason);
  return { store, catalogFingerprint: fingerprint, eventDefinitions: trustedDefinitions, catalog };
}
