import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const FIXTURE_DIR = path.join(ROOT, 'scripts', 'fixtures', 'story-v3');
const RESPONSE_DIR = path.join(FIXTURE_DIR, 'fake-provider-responses');
const TEMP_DIR = path.join(ROOT, '.tmp-story-v3-g0-runtime');
const FIXED_NOW = 1735689600000;

const EXPECTED_SCENARIO_IDS = [
  'normal-resolution',
  'player-bypass',
  'player-early-resolution',
  'repeated-encounter',
  'world-background-resolution',
  'news-knowledge-boundary',
  'reroll-cas-failure',
  'narrative-publication-gate',
  'broadcast-audience-freeze',
  'emergent-event-registration',
];

const ALLOWED_SOURCE_TYPES = new Set([
  'historical_raw',
  'user_report_reconstruction',
  'synthetic_adversarial',
]);

const OBSERVATION_METRICS = {
  PLAYER_FOCUS_FORCED_BY_BODY: ['no_evidence_progression_count', 'player_focus_forced_count'],
  TERMINAL_EVENT_NARRATIVE_REPLAY: ['illegal_narrative_replay_count'],
  TERMINAL_EVENT_ALIAS_APPENDED: ['duplicate_event_instance_count', 'duplicate_public_fact_count'],
  WORLD_DUE_EVENT_HAS_NO_CURRENT_REDUCER: ['world_due_event_stall_count'],
  NEWS_WITHOUT_MACHINE_SOURCE_LINK: ['news_without_source_fact_count'],
  NPC_KNOWLEDGE_WITHOUT_RECEIPT: ['npc_knowledge_without_receipt_count', 'knowledge_leak_count'],
  PERSISTED_BRANCH_CAS_UNAVAILABLE: ['stale_revision_commit_count', 'projection_duplicate_count'],
  ILLEGAL_NARRATIVE_VISIBLE_BEFORE_GATE: ['narrative_pre_gate_visible_count'],
  NO_FROZEN_AUDIENCE_SNAPSHOT: ['audience_snapshot_drift_count'],
  TERMINAL_EVENT_SUPERSESSION_UNAVAILABLE: ['terminal_event_supersession_gap_count'],
  TERMINAL_EVENT_ALIAS_NOT_RECOGNIZED: ['duplicate_event_instance_count'],
  // G0.1 新增覆盖观察（B1/B2）：
  VALID_COMPLETION_PROGRESS_STALLED: ['valid_completion_stall_count'],
  MULTI_UNIT_CLAIM_PARTIAL_ADVANCE: ['multi_unit_claim_count'],
  MULTI_UNIT_UNEVIDENCED_SKIP: ['unevidenced_unit_skip_count'],
  // G0.2 新增观察：
  //   world 返回真正参与执行（world_due 声明被解析；广播信封字段有效）。
  //   NEW_EVENT_INSTANCE_REGISTERED：测试专用新实例登记证据通过机器校验。
  WORLD_DUE_CLAIM_PARSED: [],
  WORLD_DUE_CLAIM_VALID: [],
  WORLD_DUE_CLAIM_INVALID: [],
  BROADCAST_ENVELOPE_FIELDS_VALID: [],
  BROADCAST_ENVELOPE_FIELDS_INVALID: [],
  NEW_EVENT_INSTANCE_REGISTERED: ['new_event_instance_registered_count'],
  // G0.2.1 新增观察：
  //   EVIDENCE_BINDING_REJECTED：固定返回中的证据未通过「正文绑定 + 具体剧情单元绑定」而被拒绝
  //   （无关证据 / 跨单元冒领 / 未知单元）。合法夹具不得触发。
  EVIDENCE_BINDING_REJECTED: ['evidence_binding_rejected_count'],
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// G0.2.3 子任务 A：严格 ISO 8601 日期时间校验。
// 必须同时满足：完整 ISO 8601 日期时间、显式时区（Z 或 +/-HH:MM）、格式字段范围合法、
// 日历日期真实存在（拒绝 JavaScript 自动进位），并通过 Date.parse 复核。
// 拒绝：纯年份、仅日期、无时区、非法文本、不存在日历日期（如 02-30）。
function isValidIsoDateTime(value) {
  if (typeof value !== 'string') return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/u.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) return false;
  // 日历日期真实存在：用 UTC 构造后回读，任何自动进位都会导致字段不一致。
  const probe = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  if (probe.getUTCFullYear() !== year
    || probe.getUTCMonth() !== month - 1
    || probe.getUTCDate() !== day
    || probe.getUTCHours() !== hour
    || probe.getUTCMinutes() !== minute
    || probe.getUTCSeconds() !== second) {
    return false;
  }
  // Date.parse 复核（含时区）。
  return !Number.isNaN(Date.parse(value));
}

// G0.2.2：字符串数组契约——必须是数组、非空、且每个元素都是非空字符串（trim 后）。
function assertNonEmptyStringArray(value, label) {
  assert(Array.isArray(value), label + ' 必须是数组');
  assert(value.length > 0, label + ' 不能是空数组');
  for (const item of value) {
    assert(typeof item === 'string' && item.trim().length > 0, label + ' 的每个元素必须是非空字符串，发现 ' + JSON.stringify(item));
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort((left, right) => left.localeCompare(right, 'en'))
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function sha256Text(text) {
  return 'sha256:' + crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function sha256Canonical(value) {
  return sha256Text(JSON.stringify(canonicalize(value)));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\s，。！？、；：,.!?;:'"“”‘’《》〈〉【】（）()[\]{}_-]+/gu, '')
    .toLowerCase();
}

function cleanTempDir() {
  const resolvedRoot = path.resolve(ROOT);
  const resolvedTemp = path.resolve(TEMP_DIR);
  assert(path.dirname(resolvedTemp) === resolvedRoot, 'refusing to clean a temp directory outside the workspace root');
  assert(path.basename(resolvedTemp) === '.tmp-story-v3-g0-runtime', 'unexpected G0 temp directory');
  fs.rmSync(resolvedTemp, { recursive: true, force: true });
  fs.mkdirSync(resolvedTemp, { recursive: true });
}

function transpileModule(sourcePath) {
  const absoluteSource = path.join(ROOT, sourcePath);
  const source = fs.readFileSync(absoluteSource, 'utf8');
  const sourceDir = path.posix.dirname(sourcePath.replaceAll('\\', '/'));
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      esModuleInterop: true,
      skipLibCheck: true,
    },
  }).outputText
    .replace(/@\/(data|models|services|prompts|utils|hooks)\//gu, (_match, folder) => {
      let relative = path.posix.relative(sourceDir, folder);
      if (!relative.startsWith('.')) relative = './' + relative;
      return relative + '/';
    })
    .replace(/from\s+['"]((?:\.\/|\.\.\/)[^'"]+)['"]/gu, (match, specifier) => (
      specifier.endsWith('.mjs') ? match : "from '" + specifier + ".mjs'"
    ));
  const outputPath = path.join(TEMP_DIR, sourcePath.replace(/\.ts$/u, '.mjs'));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output, 'utf8');
}

async function loadCurrentRuntimeAdapters() {
  cleanTempDir();
  for (const sourcePath of [
    'models/storyWeaving.ts',
    'services/storyProgressService.ts',
    'models/chat.ts',
    'services/ai/responseParser.ts',
    'utils/worldEvents.ts',
  ]) {
    transpileModule(sourcePath);
  }
  const cacheKey = '?g0=' + process.pid + '-' + Date.now();
  const storyProgress = await import(pathToFileURL(path.join(TEMP_DIR, 'services', 'storyProgressService.mjs')).href + cacheKey);
  const responseParser = await import(pathToFileURL(path.join(TEMP_DIR, 'services', 'ai', 'responseParser.mjs')).href + cacheKey);
  const worldEvents = await import(pathToFileURL(path.join(TEMP_DIR, 'utils', 'worldEvents.mjs')).href + cacheKey);
  return {
    autoAlignCanonStoryProgress: storyProgress.autoAlignCanonStoryProgress,
    parseResponse: responseParser.parseResponse,
    appendWorldEvents: worldEvents.appendWorldEvents,
  };
}

function buildStaticCapabilities() {
  const sendWorkflow = fs.readFileSync(path.join(ROOT, 'hooks', 'useGame', 'sendWorkflow.ts'), 'utf8');
  const newsWorkflow = fs.readFileSync(path.join(ROOT, 'hooks', 'useGame', 'newsWorkflow.ts'), 'utf8');
  const newsModel = fs.readFileSync(path.join(ROOT, 'models', 'news.ts'), 'utf8');
  const sourceTreeHasAudienceSnapshot = fs.existsSync(path.join(ROOT, 'models', 'storyRuntimeKnowledge.ts'))
    || fs.existsSync(path.join(ROOT, 'services', 'storyRuntime', 'audienceSnapshot.ts'));
  const previewIndex = sendWorkflow.indexOf('streamMessageSetter.set(previewText)');
  const alignmentIndex = sendWorkflow.lastIndexOf('autoAlignCanonStoryProgress({');
  return {
    narrativeVisibleBeforeAlignment: previewIndex >= 0 && alignmentIndex >= 0 && previewIndex < alignmentIndex,
    mainDirectlyAppendsWorldEventStrings: sendWorkflow.includes('全局事件: appendWorldEvents(worldAfter.全局事件, parsedForDisplay.worldEvents)'),
    newsDirectlyWritesRoot: newsWorkflow.includes('state.set新闻(nextNews)'),
    newsHasMachineSourceFactLink: /\bsourceFactId\b|\bsourceFactIds\b|\bEvidenceRef\b/u.test(newsModel),
    hasWorldDueReducer: fs.existsSync(path.join(ROOT, 'services', 'storyRuntime', 'worldEvolutionRuntime.ts')),
    hasPersistedRuntimeBranchCas: /\bruntimeBranchId\b/u.test(sendWorkflow)
      && fs.existsSync(path.join(ROOT, 'services', 'storyRuntime', 'storyRuntimeStore.ts')),
    hasFrozenAudienceSnapshot: sourceTreeHasAudienceSnapshot,
    hasTerminalEventSupersession: fs.existsSync(path.join(ROOT, 'services', 'storyRuntime', 'worldEventReducer.ts')),
  };
}

function buildLegacyStorySystem(setup) {
  if (!setup) return null;
  const statusMap = {
    current: '当前',
    pending: '未开始',
    experienced: '已经历',
    skipped: '已跳过',
    deviated: '已偏离',
    paused: '暂停',
  };
  const units = setup.units.map((unit) => ({
    id: unit.id,
    组号: unit.number,
    标题: unit.title,
    章节范围: unit.title,
    章节标题: [unit.title],
    是否开局组: unit.number === 1,
    起始章序号: unit.number,
    结束章序号: unit.number,
    启用注入: true,
    原文内容: '',
    字数: 0,
    原文摘要: unit.summary,
    本段概括: unit.summary,
    时间线起点: '',
    时间线终点: '',
    开局已成立事实: [],
    前段延续事实: unit.carryFacts || [],
    本段结束状态: unit.endStates || [],
    给后续参考: unit.followups || [],
    原著硬约束: [],
    可提前铺垫: [],
    登场角色: unit.characters || [],
    涉及地点: unit.locations || [],
    涉及派系: unit.factions || [],
    角色档案: [],
    势力档案: [],
    地图地点档案: [],
    关键事件: [{
      事件名: unit.title,
      事件说明: unit.summary,
      前置条件: [],
      触发条件: [],
      阻断条件: [],
      事件结果: unit.endStates || [],
      对后续影响: unit.followups || [],
      信息可见性: { 谁知道: [], 谁不知道: [], 是否仅读者视角可见: false },
    }],
    时间线: [],
    角色推进: [],
    处理状态: '已完成',
    运行状态: statusMap[unit.status] || '未开始',
    updatedAt: FIXED_NOW,
  }));
  const current = units.find((unit) => unit.id === setup.currentUnitId) || units[0];
  return {
    系列列表: [{
      id: setup.seriesId,
      标题: setup.title,
      作品名: setup.title,
      来源类型: setup.sourceType || 'canon',
      来源智库条目ID: [],
      章节列表: [],
      分段列表: units,
      每段章数: 1,
      激活注入: true,
      当前分段组号: current.组号,
      当前阶段概括: current.本段概括,
      核心角色摘要: [],
      核心角色: [],
      涉及地点索引: [],
      涉及派系索引: [],
      createdAt: FIXED_NOW,
      updatedAt: FIXED_NOW,
    }],
    当前系列ID: setup.seriesId,
    当前进度: {
      当前系列ID: setup.seriesId,
      当前分段ID: current.id,
      当前分段组号: current.组号,
      推进状态: '推进中',
      已完成摘要: [],
      当前待解问题: [],
      切换说明: [],
      历史归档: [],
      最近判定理由: [],
      推进证据: [],
      连续推进证据回合: 0,
      卡段回合数: 0,
      updatedAt: FIXED_NOW,
    },
  };
}

function loadScenarioFiles() {
  assert(fs.existsSync(FIXTURE_DIR), 'story-v3 fixture directory does not exist');
  // G1.1/G1.1.2：story-runtime-contract.fixture.json 是机器可读契约（唯一声明来源）、
  // story-asset-catalog.sample.json 是资产目录样例，都不是场景夹具，场景发现必须显式排除；
  // 契约由 story-runtime-contract-regression.mjs、资产由 story-asset-catalog-contract-regression.mjs 单独校验。
  return fs.readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith('.json'))
    .filter((name) => !name.startsWith('_'))
    .filter((name) => name !== 'story-runtime-contract.fixture.json')
    .filter((name) => name !== 'story-asset-catalog.sample.json')
    .sort()
    .map((name) => ({
      name,
      path: path.join(FIXTURE_DIR, name),
      fixture: readJson(path.join(FIXTURE_DIR, name)),
    }));
}

function loadResponseBundle(scenarioId) {
  const responsePath = path.join(RESPONSE_DIR, scenarioId + '.json');
  assert(fs.existsSync(responsePath), 'missing fake provider bundle for ' + scenarioId);
  return { path: responsePath, bundle: readJson(responsePath) };
}

function getRawOutput(response) {
  assert(typeof response.rawOutput === 'string', 'rawOutput must be a string for ' + response.responseId);
  return response.rawOutput;
}

function validateScenarioRecord(record, options = {}) {
  const fixture = record.fixture;
  assert(fixture.schemaVersion === 'story-v3-g0-scenario@1', record.name + ': unsupported fixture schema');
  assert(fixture.scenarioId === path.basename(record.name, '.json'), record.name + ': scenarioId must match file name');
  assert(typeof fixture.title === 'string' && fixture.title.trim(), record.name + ': title is required');
  assert(typeof fixture.playerFacingExpectation === 'string' && fixture.playerFacingExpectation.trim(), record.name + ': player expectation is required');
  assert(fixture.initialState && typeof fixture.initialState === 'object', record.name + ': initialState is required');
  const actualStateFingerprint = sha256Canonical(fixture.initialState);
  if (!options.skipStoredHashCheck) {
    assert(fixture.initialStateFingerprint === actualStateFingerprint, record.name + ': initial state fingerprint mismatch');
  }
  assert(Array.isArray(fixture.steps) && fixture.steps.length > 0, record.name + ': at least one step is required');
  assert(Array.isArray(fixture.currentBaseline.expectedObservationCodes), record.name + ': baseline observation codes are required');
  assert(fixture.currentBaseline.expectedMetrics && typeof fixture.currentBaseline.expectedMetrics === 'object', record.name + ': expected metrics are required');
  assert(Array.isArray(fixture.v3Target.decisions) && fixture.v3Target.decisions.length > 0, record.name + ': V3 decisions are required');
  assert(Array.isArray(fixture.v3Target.allowedFinalSideEffects), record.name + ': V3 allowed side effects are required');
  assert(typeof fixture.reviewQuestion === 'string' && fixture.reviewQuestion.trim(), record.name + ': review question is required');

  const responseRecord = options.bundle ? { bundle: options.bundle } : loadResponseBundle(fixture.scenarioId);
  const bundle = responseRecord.bundle;
  assert(bundle.schemaVersion === 'story-v3-g0-fake-provider@1', record.name + ': unsupported response bundle schema');
  assert(bundle.scenarioId === fixture.scenarioId, record.name + ': response bundle scenario mismatch');
  assert(Array.isArray(bundle.responses) && bundle.responses.length > 0, record.name + ': response bundle is empty');
  const responseIds = new Set();
  const responseByRef = new Map();
  for (const response of bundle.responses) {
    assert(response.responseId && !responseIds.has(response.responseId), record.name + ': duplicate responseId');
    responseIds.add(response.responseId);
    responseByRef.set(response.responseId, response);
    assert(['main', 'variable', 'world', 'news'].includes(response.service), response.responseId + ': unsupported service');
    assert(ALLOWED_SOURCE_TYPES.has(response.sourceType), response.responseId + ': source type is not allowed');
    assert(response.productionUse === false, response.responseId + ': fixed response must be test-only');
    assert(response.requestSummary && typeof response.requestSummary === 'object', response.responseId + ': request summary is required');
    assert(typeof response.expectedAdjudication === 'string' && response.expectedAdjudication, response.responseId + ': expected adjudication is required');
    assert(Array.isArray(response.allowedFinalSideEffects), response.responseId + ': allowed side effects are required');
    const rawOutputSha256 = sha256Text(getRawOutput(response));
    if (!options.skipStoredHashCheck) {
      assert(response.rawOutputSha256 === rawOutputSha256, response.responseId + ': raw output hash mismatch');
    }
  }
  // G0.2 子任务 D：response → step 引用关系反查表（主场景 + coverage）。
  const allSteps = [
    ...fixture.steps.map((step) => ({ stepId: step.stepId, responseRefs: step.responseRefs, coverageId: null })),
    ...(fixture.coverageCases || []).flatMap((coverage) =>
      coverage.steps.map((step) => ({ stepId: step.stepId, responseRefs: step.responseRefs, coverageId: coverage.coverageId }))),
  ];
  const stepIds = new Set(allSteps.map((step) => step.stepId));
  assert(stepIds.size === allSteps.length, record.name + ': duplicate stepId across main and coverage steps');
  const refsByResponse = new Map();
  for (const step of allSteps) {
    for (const responseRef of step.responseRefs) {
      if (!refsByResponse.has(responseRef)) refsByResponse.set(responseRef, []);
      refsByResponse.get(responseRef).push(step.stepId);
    }
  }
  // 每个 response 必须至少被一个步骤引用（新增孤立返回必须失败）。
  for (const responseId of responseIds) {
    assert(refsByResponse.has(responseId), responseId + ': orphan fixed response is not referenced by any step');
  }
  // requestSummary.turnId（或等价字段）必须与引用它的步骤关联。
  for (const responseId of responseIds) {
    const response = responseByRef.get(responseId);
    const turnId = response.requestSummary?.turnId;
    assert(typeof turnId === 'string' && turnId.trim(), responseId + ': requestSummary.turnId is required');
    const refSteps = refsByResponse.get(responseId) ?? [];
    assert(refSteps.includes(turnId), responseId + ': requestSummary.turnId ' + JSON.stringify(turnId) + ' does not match any referencing stepId ' + JSON.stringify(refSteps));
  }
  // 主场景步骤引用的固定返回必须携带主场景初始状态指纹。
  for (const step of fixture.steps) {
    assert(step.stepId && step.kind, record.name + ': every step needs stepId and kind');
    assert(Array.isArray(step.responseRefs), record.name + ': responseRefs must be an array');
    for (const responseRef of step.responseRefs) {
      assert(responseIds.has(responseRef), record.name + ': unknown responseRef ' + responseRef);
      assert(
        responseByRef.get(responseRef)?.inputStateFingerprint === actualStateFingerprint,
        responseRef + ': main-step response input state fingerprint mismatch',
      );
    }
  }
  // G0.1 coverage 子场景：结构与引用校验；子场景引用的固定返回必须携带该子场景合并状态的指纹。
  const coverageIds = new Set();
  for (const coverage of fixture.coverageCases || []) {
    assert(coverage.coverageId && !coverageIds.has(coverage.coverageId), record.name + ': duplicate coverageId');
    coverageIds.add(coverage.coverageId);
    assert(typeof coverage.title === 'string' && coverage.title.trim(), record.name + ': coverage title is required');
    assert(typeof coverage.playerFacingExpectation === 'string' && coverage.playerFacingExpectation.trim(), record.name + ': coverage player expectation is required');
    assert(Array.isArray(coverage.steps) && coverage.steps.length > 0, record.name + ': coverage needs at least one step');
    assert(coverage.currentBaseline && Array.isArray(coverage.currentBaseline.expectedObservationCodes), record.name + ': coverage baseline codes are required');
    assert(coverage.currentBaseline.expectedMetrics && typeof coverage.currentBaseline.expectedMetrics === 'object', record.name + ': coverage expected metrics are required');
    // G0.2.1/G0.2.2：coverage 级 v3Target 契约——decisions 与 allowedFinalSideEffects 必须是
    // 非空字符串数组（删除字段/非数组/空数组/空字符串/纯空格均拒绝）。
    assert(coverage.v3Target && typeof coverage.v3Target === 'object', record.name + ': coverage v3Target is required');
    assertNonEmptyStringArray(coverage.v3Target.decisions, record.name + ': coverage v3Target.decisions');
    assertNonEmptyStringArray(coverage.v3Target.allowedFinalSideEffects, record.name + ': coverage v3Target.allowedFinalSideEffects');
    const caseState = mergeCoverageState(fixture.initialState, coverage.initialStateOverrides);
    const caseFingerprint = sha256Canonical(caseState);
    for (const step of coverage.steps) {
      assert(step.stepId && step.kind, record.name + ': every coverage step needs stepId and kind');
      assert(Array.isArray(step.responseRefs), record.name + ': coverage responseRefs must be an array');
      for (const responseRef of step.responseRefs) {
        assert(responseIds.has(responseRef), record.name + ': unknown coverage responseRef ' + responseRef);
        assert(
          responseByRef.get(responseRef)?.inputStateFingerprint === caseFingerprint,
          responseRef + ': coverage response input state fingerprint mismatch',
        );
      }
    }
  }
  return {
    fixture,
    responseBundle: bundle,
    refsByResponse,
    initialStateFingerprint: actualStateFingerprint,
    responseHashes: Object.fromEntries(bundle.responses.map((response) => [
      response.responseId,
      sha256Text(getRawOutput(response)),
    ])),
  };
}

function terminalMatch(text, terminalEvent) {
  const source = normalizeText(text);
  const aliasHit = (terminalEvent.aliases || []).some((alias) => source.includes(normalizeText(alias)));
  const terminalAction = /击败|击杀|消灭|再度|再次|复活|卷土重来|迎战|战斗|摧毁|打倒/u.test(String(text || ''));
  return aliasHit && terminalAction;
}

function receiptExists(receipts, claim) {
  return (receipts || []).some((receipt) => (
    receipt.observerId === claim.observerId
    && receipt.factId === claim.factId
    && (!claim.channel || receipt.channel === claim.channel)
  ));
}

// coverage 子场景的初始状态 = 主场景初始状态 + 子场景覆盖（顶层浅合并，runtime 单独合并）。
// 必须与 scripts/_patch-g0-hashes.mjs 中的实现保持一致。
function mergeCoverageState(baseInitialState, overrides = {}) {
  return {
    ...baseInitialState,
    ...overrides,
    runtime: { ...(baseInitialState.runtime || {}), ...(overrides.runtime || {}) },
  };
}

function computeMetrics(occurrences) {
  const metrics = {};
  for (const [code, count] of occurrences) {
    for (const metric of OBSERVATION_METRICS[code] || []) {
      metrics[metric] = (metrics[metric] || 0) + count;
    }
  }
  return Object.fromEntries(Object.entries(metrics).sort(([left], [right]) => left.localeCompare(right, 'en')));
}

function addMetric(metrics, name) {
  metrics[name] = (metrics[name] || 0) + 1;
}

function sortedUnique(items) {
  return [...new Set(items)].sort((left, right) => left.localeCompare(right, 'en'));
}

function parseLooseJson(rawText) {
  const trimmed = rawText.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1));
  } catch {
    return null;
  }
}

// G0.2 子任务 A：测试专用 world 返回解析器。
// world 返回必须提供结构化声明（JSON 对象），runner 重新解析并记录旧系统行为。
function parseWorldResponse(rawOutput) {
  const parsed = parseLooseJson(rawOutput);
  if (!parsed || typeof parsed !== 'object') {
    return { kind: 'unparseable', summary: 'world 返回不是可解析的 JSON 结构化声明' };
  }
  if (parsed.kind === 'world_due') {
    // G0.2.1/G0.2.2/G0.2.3：五字段完整校验。
    // eventId/claim/reason/factId 必须 trim 后非空；factId 还要求 fact_ 前缀；
    // time 必须为严格 ISO 8601（显式时区 + 日历日期真实存在 + Date.parse 复核）。
    const eventId = typeof parsed.eventId === 'string' ? parsed.eventId.trim() : '';
    const claim = typeof parsed.claim === 'string' ? parsed.claim.trim() : '';
    const time = typeof parsed.time === 'string' ? parsed.time.trim() : '';
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
    const factId = typeof parsed.factId === 'string' ? parsed.factId.trim() : '';
    const invalidReasons = [];
    if (!eventId) invalidReasons.push('eventId 缺失或纯空格');
    if (!claim) invalidReasons.push('claim 缺失或纯空格');
    if (!reason) invalidReasons.push('reason 缺失或纯空格');
    if (!/^fact_[A-Za-z0-9_]+$/u.test(factId)) invalidReasons.push('factId 缺失或不符合 fact_ 前缀');
    if (!isValidIsoDateTime(time)) invalidReasons.push('time 不是完整 ISO 8601 日期时间（需显式时区且日历日期真实存在）');
    return {
      kind: 'world_due',
      eventId,
      claim,
      time,
      reason,
      factId,
      valid: invalidReasons.length === 0,
      invalidReasons,
      summary: `world_due 声明：事件 ${eventId || '(缺 eventId)'} 应按 ${time || '未知时间'} 结算（原因：${reason || '未给出'}）`,
    };
  }
  if (parsed.kind === 'broadcast') {
    return {
      kind: 'broadcast',
      broadcastId: typeof parsed.broadcastId === 'string' ? parsed.broadcastId : '',
      envelope: parsed.envelope === true,
      audience: Array.isArray(parsed.audience) ? parsed.audience.filter((item) => typeof item === 'string') : [],
      factId: typeof parsed.factId === 'string' ? parsed.factId : '',
      time: typeof parsed.time === 'string' ? parsed.time : '',
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
      summary: `广播信封声明：${parsed.broadcastId || '(缺 broadcastId)'}，受众 ${(Array.isArray(parsed.audience) ? parsed.audience : []).join('、') || '(缺受众)'}，事实 ${parsed.factId || '(缺 factId)'}`,
    };
  }
  return { kind: 'other', summary: 'world 返回提供了未知声明类型' };
}

// G0.2：从固定返回 rawOutput 中提取测试专用结构化证据块。
// 证据块属于固定返回的一部分，被 raw output hash 保护；runner 重新解析并与正文/步骤关联。
// 格式：<测试证据>{"units":[{unitId, evidence:[]}], "completionEvidence":[], "disguise":{...}, "newEventInstance":{...}}</测试证据>
const EVIDENCE_BLOCK_PATTERN = /<测试证据>([\s\S]*?)<\/测试证据>/u;

function extractStructuredEvidence(rawOutput) {
  const match = EVIDENCE_BLOCK_PATTERN.exec(rawOutput);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeEvidenceUnits(evidence) {
  if (!Array.isArray(evidence?.units)) return [];
  return evidence.units.map((unit) => ({
    unitId: typeof unit?.unitId === 'string' ? unit.unitId : '',
    evidence: Array.isArray(unit?.evidence) ? unit.evidence.filter((item) => typeof item === 'string' && item.trim()) : [],
  })).filter((unit) => unit.unitId);
}

// G0.2.1：证据词的本地拆分器（先按分隔符拆分，再归一化小写；与 meaningful terms 意图一致）。
const EVIDENCE_STOP_WORDS = new Set(['当前', '本段', '剧情', '玩家', '角色', '已经', '一个', '以及', '进行', '开始', '继续']);

function splitEvidenceTerms(text) {
  return Array.from(new Set(
    String(text || '')
      .normalize('NFKC')
      .split(/[\s，。；、：:,.!?！？「」『』（）()[\]【】\-—]+/gu)
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length >= 2 && !EVIDENCE_STOP_WORDS.has(item)),
  )).slice(0, 10);
}

// G0.2.1：证据与正文及具体剧情单元做确定性绑定。
// 每条证据必须同时满足：
//   1. 正文绑定：证据文本（归一化后）出现在固定返回的正文中；
//   2. 单元绑定：证据文本包含该单元至少一个标识词（标题/本段结束状态/本段概括 的 meaningful terms）；
//   3. 单元身份：unitId 必须存在于 storySetup 的分段列表中。
// 未通过的证据被拒绝（EVIDENCE_BINDING_REJECTED），不参与观察码推导。
function bindEvidenceToUnits({ evidenceUnits, body, storySystem }) {
  const segments = (storySystem?.系列列表 ?? []).flatMap((series) => series.分段列表 ?? []);
  const segmentsById = new Map(segments.map((segment) => [segment.id, segment]));
  const unitTermsOf = (segment) => {
    if (!segment) return [];
    return splitEvidenceTerms([segment.标题, ...(segment.本段结束状态 ?? []), segment.本段概括].join(' '));
  };
  const normalizedBody = normalizeText(body);
  const bound = [];
  const rejected = [];
  for (const unit of evidenceUnits) {
    const segment = segmentsById.get(unit.unitId);
    const unitTerms = unitTermsOf(segment);
    const validEvidence = [];
    const rejectedEvidence = [];
    for (const item of unit.evidence) {
      const normalizedEvidence = normalizeText(item);
      const inBody = Boolean(normalizedEvidence) && normalizedBody.includes(normalizedEvidence);
      const hitsUnit = unitTerms.some((term) => normalizedEvidence.includes(term));
      if (segment && inBody && hitsUnit) validEvidence.push(item);
      else rejectedEvidence.push(item);
    }
    if (rejectedEvidence.length) rejected.push({ unitId: unit.unitId, rejectedEvidence });
    bound.push({ unitId: unit.unitId, evidence: unit.evidence, validEvidence, rejectedEvidence });
  }
  return {
    bound,
    rejected,
    validEvidenceByUnit: Object.fromEntries(bound.map((unit) => [unit.unitId, unit.validEvidence])),
  };
}

// G0.2.1：B1 完成证据绑定到「当前剧情单元」——每条证据必须出现在正文中，
// 且至少命中当前分段的一个标识词（标题/本段结束状态/本段概括）。
function bindCompletionEvidence({ completionEvidence, body, currentSegment }) {
  const unitTerms = currentSegment
    ? splitEvidenceTerms([currentSegment.标题, ...(currentSegment.本段结束状态 ?? []), currentSegment.本段概括].join(' '))
    : [];
  const normalizedBody = normalizeText(body);
  const valid = (completionEvidence ?? []).filter((item) => {
    const normalizedEvidence = normalizeText(item);
    return Boolean(normalizedEvidence)
      && normalizedBody.includes(normalizedEvidence)
      && unitTerms.some((term) => normalizedEvidence.includes(term));
  });
  const rejected = (completionEvidence ?? []).filter((item) => !valid.includes(item));
  return { valid, rejected };
}

// 执行一组步骤，返回观察/发生次数/transition/最终系统与世界字符串。
// 主场景步骤与 coverage 子场景步骤共用同一执行器，保证观察口径一致。
function executeSteps({
  fixture,
  steps,
  responses,
  adapters,
  capabilities,
  initialStorySystem,
  initialWorldEventStrings,
  terminalEvents,
  knowledgeReceipts,
}) {
  const observations = new Set();
  const occurrences = new Map();
  const transitions = [];
  let storySystem = initialStorySystem;
  let worldEventStrings = [...initialWorldEventStrings];

  const observe = (code) => {
    observations.add(code);
    occurrences.set(code, (occurrences.get(code) || 0) + 1);
  };

  const originalNow = Date.now;
  Date.now = () => fixture.fixedNow || FIXED_NOW;
  try {
    for (const step of steps) {
      const stepResponses = step.responseRefs.map((ref) => responses.get(ref));
      const mainResponses = stepResponses.filter((response) => response.service === 'main');
      const variableResponses = stepResponses.filter((response) => response.service === 'variable');
      const newsResponses = stepResponses.filter((response) => response.service === 'news');

      if (step.kind === 'main_turn' || step.kind === 'emergent_retry' || step.kind === 'knowledge_claim') {
        for (const response of mainResponses) {
          const parsed = adapters.parseResponse(getRawOutput(response), { repair: true });
          const evidence = extractStructuredEvidence(getRawOutput(response));
          const evidenceUnits = normalizeEvidenceUnits(evidence);
          // G0.2.1：证据确定性绑定（正文绑定 + 具体剧情单元绑定 + 单元身份）。
          const evidenceBinding = storySystem
            ? bindEvidenceToUnits({ evidenceUnits, body: parsed.body, storySystem })
            : {
              bound: evidenceUnits.map((unit) => ({ ...unit, validEvidence: [], rejectedEvidence: unit.evidence })),
              rejected: evidenceUnits.filter((unit) => unit.evidence.length > 0),
              validEvidenceByUnit: {},
            };
          const evidenceByUnit = Object.fromEntries(evidenceUnits.map((unit) => [unit.unitId, unit.evidence]));
          const validEvidenceByUnit = evidenceBinding.validEvidenceByUnit;
          if (evidenceBinding.rejected.length) observe('EVIDENCE_BINDING_REJECTED');
          if (parsed.body.trim() && capabilities.narrativeVisibleBeforeAlignment) {
            observe('NARRATIVE_VISIBLE_BEFORE_STORY_ALIGNMENT');
            if (step.illegalCandidate === true) observe('ILLEGAL_NARRATIVE_VISIBLE_BEFORE_GATE');
          }
          const beforeWorldEventCount = worldEventStrings.length;
          if (parsed.worldEvents.length && capabilities.mainDirectlyAppendsWorldEventStrings) {
            worldEventStrings = adapters.appendWorldEvents(worldEventStrings, parsed.worldEvents);
            observe('WORLD_EVENT_STRING_DIRECT_APPEND');
          }
          const terminalHit = (terminalEvents || []).some((event) => terminalMatch(parsed.body, event));
          if (terminalHit) {
            observe('TERMINAL_EVENT_NARRATIVE_REPLAY');
            if (worldEventStrings.length > beforeWorldEventCount) {
              observe('TERMINAL_EVENT_ALIAS_APPENDED');
            }
          }
          // G0.2 子任务 C：伪装别名由结构化证据 + 正文 + 正式别名集合共同推导，禁止 aliasDisguise 直接选码。
          const disguise = evidence?.disguise;
          if (disguise && Array.isArray(disguise.candidateAliases)) {
            const officialAliases = (terminalEvents || []).flatMap((event) => event.aliases || []);
            const aliasMiss = !disguise.candidateAliases.some((candidate) => officialAliases.includes(candidate));
            const aliasHitOnCandidate = disguise.candidateAliases.some((candidate) =>
              normalizeText(parsed.body).includes(normalizeText(candidate)));
            const terminalAction = /击败|击杀|消灭|再度|再次|复活|卷土重来|迎战|战斗|摧毁|打倒/u.test(parsed.body);
            if (aliasMiss && aliasHitOnCandidate && terminalAction && worldEventStrings.length > beforeWorldEventCount) {
              observe('TERMINAL_EVENT_ALIAS_NOT_RECOGNIZED');
            }
          }
          // G0.2 子任务 C：合法新实例的测试专用机器证据（身份/时间/原因）。
          const newInstance = evidence?.newEventInstance;
          if (newInstance) {
            const terminalEventIds = (terminalEvents || []).map((event) => event.eventInstanceId).filter(Boolean);
            const oldEventTimes = (terminalEvents || [])
              .map((event) => event.occurredAt)
              .filter((value) => typeof value === 'string' && !Number.isNaN(Date.parse(value)));
            const instanceIdOk = typeof newInstance.eventInstanceId === 'string'
              && newInstance.eventInstanceId.trim()
              && !terminalEventIds.includes(newInstance.eventInstanceId);
            const timeOk = typeof newInstance.time === 'string'
              && !Number.isNaN(Date.parse(newInstance.time))
              && oldEventTimes.every((oldTime) => Date.parse(newInstance.time) > Date.parse(oldTime));
            const reasonOk = typeof newInstance.reason === 'string' && newInstance.reason.trim().length > 0;
            if (instanceIdOk && timeOk && reasonOk) observe('NEW_EVENT_INSTANCE_REGISTERED');
          }
          if (step.playerIntention === 'bypass' && /被卷入|不得不|已经抵达|赶到|迎战|强行/u.test(parsed.body)) {
            observe('PLAYER_FOCUS_FORCED_BY_BODY');
          }
          if (storySystem) {
            const beforeGroup = storySystem.当前进度?.当前分段组号;
            const prevArchiveIds = new Set((storySystem.当前进度?.历史归档 ?? []).map((archive) => archive.id));
            const alignment = adapters.autoAlignCanonStoryProgress({
              storyWeaving: storySystem,
              turnCount: step.turnCount,
              userInput: step.playerInput || '',
              body: parsed.body,
              currentLocation: step.currentLocation || fixture.initialState.playerLocation,
              gateSnapshot: step.legacyGate || null,
            });
            storySystem = alignment.system;
            const afterGroup = storySystem.当前进度?.当前分段组号;
            const code = alignment.progressed ? 'LEGACY_STORY_PROGRESS_ADVANCED' : 'LEGACY_STORY_PROGRESS_STAYED';
            observe(code);
            const createdArchives = (storySystem.当前进度?.历史归档 ?? [])
              .filter((archive) => !prevArchiveIds.has(archive.id));
            const advancedUnitIds = createdArchives
              .filter((archive) => archive.归档状态 === '已经历' || archive.归档状态 === '已完成')
              .map((archive) => archive.分段ID);
            const skippedUnitIds = createdArchives
              .filter((archive) => archive.归档状态 === '已跳过' || archive.归档状态 === '已偏离')
              .map((archive) => archive.分段ID);
            const unevidencedUnitIds = skippedUnitIds.filter((unitId) => (validEvidenceByUnit[unitId] ?? []).length === 0);
            // G0.2.1 子任务：B1 完成证据必须绑定到当前剧情单元并通过正文绑定；不再依赖 completionValid 字段。
            let completionBinding = { valid: [], rejected: [] };
            if (!alignment.progressed) {
              const currentSegment = (storySystem.系列列表 ?? [])
                .flatMap((series) => series.分段列表 ?? [])
                .find((segment) => segment.id === storySystem.当前进度?.当前分段ID);
              completionBinding = bindCompletionEvidence({
                completionEvidence: evidence?.completionEvidence ?? [],
                body: parsed.body,
                currentSegment,
              });
              if (completionBinding.rejected.length) observe('EVIDENCE_BINDING_REJECTED');
              const bodyHasCompletionSignal = /结束|完成|告一段落|解除|清理|击退|平息|收尾/u.test(parsed.body);
              if (completionBinding.valid.length > 0 && bodyHasCompletionSignal) {
                observe('VALID_COMPLETION_PROGRESS_STALLED');
              }
            }
            // G0.2 子任务 B2：多单元声明由证据映射推导（evidenceUnits 数量），不能只读 fixture 布尔字段。
            const claimedUnitCount = evidenceUnits.length;
            if (claimedUnitCount > 1) {
              if (advancedUnitIds.length < claimedUnitCount) observe('MULTI_UNIT_CLAIM_PARTIAL_ADVANCE');
              if (unevidencedUnitIds.length > 0) observe('MULTI_UNIT_UNEVIDENCED_SKIP');
            }
            transitions.push({
              stepId: step.stepId,
              responseId: response.responseId,
              service: 'main',
              beforeGroup,
              afterGroup,
              changed: alignment.changed,
              progressed: alignment.progressed,
              claimedUnitCount: claimedUnitCount || undefined,
              evidenceByUnit,
              validEvidenceByUnit,
              rejectedEvidence: evidenceBinding.rejected,
              completionEvidenceValid: completionBinding.valid,
              completionEvidenceRejected: completionBinding.rejected,
              advancedUnitIds,
              skippedUnitIds,
              unevidencedUnitIds,
              archiveStatuses: createdArchives.map((archive) => `${archive.分段ID}:${archive.归档状态}`),
            });
          }
        }
      }

      for (const response of variableResponses) {
        const parsed = parseLooseJson(getRawOutput(response));
        const commands = Array.isArray(parsed?.commands) ? parsed.commands : [];
        const incoming = commands
          .filter((command) => command.action === 'push' && command.key === '世界.全局事件')
          .map((command) => command.value)
          .filter((value) => typeof value === 'string');
        if (incoming.length) {
          const before = worldEventStrings.length;
          worldEventStrings = adapters.appendWorldEvents(worldEventStrings, incoming);
          observe('VARIABLE_MODEL_CAN_WRITE_WORLD_EVENT_STRING');
          if (worldEventStrings.length === before) observe('WORLD_EVENT_STRING_TEXT_DEDUPED');
        }
      }

      // G0.2 子任务 A：world 返回真正参与执行。每份 world 返回都要解析、记录行为，
      // 观察码由「返回声明 + 旧系统能力」共同决定，不能只依据静态 capability。
      const worldResponses = stepResponses.filter((response) => response.service === 'world');
      for (const response of worldResponses) {
        const worldParsed = parseWorldResponse(getRawOutput(response));
        if (worldParsed.kind === 'world_due') {
          // G0.2.3：PARSED 只能在完整声明有效后产生。对任一 invalid 输入，
          // 观察码只允许 WORLD_DUE_CLAIM_INVALID，不得包含 PARSED/VALID/REDUCER。
          if (worldParsed.valid) {
            observe('WORLD_DUE_CLAIM_PARSED');
            observe('WORLD_DUE_CLAIM_VALID');
            if (!capabilities.hasWorldDueReducer) {
              observe('WORLD_DUE_EVENT_HAS_NO_CURRENT_REDUCER');
              transitions.push({
                stepId: step.stepId,
                responseId: response.responseId,
                service: 'world',
                kind: 'world_due',
                parsedSummary: worldParsed.summary,
                valid: worldParsed.valid,
                invalidReasons: worldParsed.invalidReasons || [],
                behavior: 'no_reducer_ignored',
                detail: '旧系统没有 world due reducer，有效声明未被消费',
              });
            } else {
              transitions.push({
                stepId: step.stepId,
                responseId: response.responseId,
                service: 'world',
                kind: 'world_due',
                parsedSummary: worldParsed.summary,
                valid: worldParsed.valid,
                invalidReasons: worldParsed.invalidReasons || [],
                behavior: 'consumed_by_reducer',
                detail: '旧系统存在 reducer，声明进入结算路径',
              });
            }
          } else {
            observe('WORLD_DUE_CLAIM_INVALID');
            transitions.push({
              stepId: step.stepId,
              responseId: response.responseId,
              service: 'world',
              kind: 'world_due',
              parsedSummary: worldParsed.summary,
              valid: worldParsed.valid,
              invalidReasons: worldParsed.invalidReasons || [],
              behavior: 'invalid_claim_not_consumed',
              detail: 'world_due 声明字段校验失败（' + (worldParsed.invalidReasons || []).join('、') + '），不产生任何正向观察码',
            });
          }
        } else if (worldParsed.kind === 'broadcast') {
          const fieldsOk = Boolean(worldParsed.broadcastId && worldParsed.envelope && worldParsed.audience.length && worldParsed.factId);
          if (fieldsOk) observe('BROADCAST_ENVELOPE_FIELDS_VALID');
          else observe('BROADCAST_ENVELOPE_FIELDS_INVALID');
          if (!capabilities.hasFrozenAudienceSnapshot) {
            observe('NO_FROZEN_AUDIENCE_SNAPSHOT');
            transitions.push({
              stepId: step.stepId,
              responseId: response.responseId,
              service: 'world',
              kind: 'broadcast',
              parsedSummary: worldParsed.summary,
              behavior: 'no_audience_snapshot_ignored',
              detail: '旧系统没有受众快照/送达回执，信封声明未被消费',
            });
          } else {
            transitions.push({
              stepId: step.stepId,
              responseId: response.responseId,
              service: 'world',
              kind: 'broadcast',
              parsedSummary: worldParsed.summary,
              behavior: 'consumed_by_audience_snapshot',
              detail: '旧系统存在受众快照，信封进入送达路径',
            });
          }
        } else {
          transitions.push({
            stepId: step.stepId,
            responseId: response.responseId,
            service: 'world',
            kind: worldParsed.kind,
            parsedSummary: worldParsed.summary,
            behavior: 'unparseable_or_other',
            detail: 'world 返回未被识别为 due 或 broadcast 声明',
          });
        }
      }

      if (step.requiresTerminalSupersession === true && !capabilities.hasTerminalEventSupersession) {
        observe('TERMINAL_EVENT_SUPERSESSION_UNAVAILABLE');
      }

      for (const response of newsResponses) {
        const parsed = parseLooseJson(getRawOutput(response));
        const hasChanges = Boolean(parsed && (
          (Array.isArray(parsed.新增) && parsed.新增.length)
          || (Array.isArray(parsed.更新) && parsed.更新.length)
          || (Array.isArray(parsed.归档) && parsed.归档.length)
          || (Array.isArray(parsed.删除) && parsed.删除.length)
        ));
        if (hasChanges && capabilities.newsDirectlyWritesRoot) observe('NEWS_DIRECT_ROOT_WRITE');
        if (hasChanges && !capabilities.newsHasMachineSourceFactLink) observe('NEWS_WITHOUT_MACHINE_SOURCE_LINK');
      }

      for (const claim of step.npcClaims || []) {
        if (!receiptExists(knowledgeReceipts, claim)) observe('NPC_KNOWLEDGE_WITHOUT_RECEIPT');
      }
      if (step.kind === 'reroll_conflict' && !capabilities.hasPersistedRuntimeBranchCas) {
        observe('PERSISTED_BRANCH_CAS_UNAVAILABLE');
      }
      // world_due / broadcast_delivery 步骤在没有 world 返回时保留静态能力观察（兜底）。
      const hasWorldResponse = stepResponses.some((response) => response.service === 'world');
      if (step.kind === 'world_due' && !hasWorldResponse && !capabilities.hasWorldDueReducer) {
        observe('WORLD_DUE_EVENT_HAS_NO_CURRENT_REDUCER');
      }
      if (step.kind === 'broadcast_delivery' && !hasWorldResponse && !capabilities.hasFrozenAudienceSnapshot) {
        observe('NO_FROZEN_AUDIENCE_SNAPSHOT');
      }
    }
  } finally {
    Date.now = originalNow;
  }

  return { observations, occurrences, transitions, storySystem, worldEventStrings };
}

async function runScenario(validated, adapters, capabilities) {
  const fixture = validated.fixture;
  const responses = new Map(validated.responseBundle.responses.map((response) => [response.responseId, response]));
  const mainResult = executeSteps({
    fixture,
    steps: fixture.steps,
    responses,
    adapters,
    capabilities,
    initialStorySystem: buildLegacyStorySystem(fixture.storySetup),
    initialWorldEventStrings: fixture.initialState.legacyWorldEventStrings || [],
    terminalEvents: fixture.initialState.terminalEvents || [],
    knowledgeReceipts: fixture.initialState.knowledgeReceipts || [],
  });

  const observedCodes = sortedUnique([...mainResult.observations]);
  const actualMetrics = computeMetrics(mainResult.occurrences);
  const expectedCodes = sortedUnique(fixture.currentBaseline.expectedObservationCodes);
  const expectedMetrics = Object.fromEntries(
    Object.entries(fixture.currentBaseline.expectedMetrics).sort(([left], [right]) => left.localeCompare(right, 'en')),
  );
  const observationMatch = JSON.stringify(observedCodes) === JSON.stringify(expectedCodes);
  const metricsMatch = JSON.stringify(actualMetrics) === JSON.stringify(expectedMetrics);

  // G0.1：coverage 子场景（B1/B2/C），各自从共享 storySetup 构建全新旧系统运行。
  const coverageReports = [];
  for (const coverage of fixture.coverageCases || []) {
    const state = mergeCoverageState(fixture.initialState, coverage.initialStateOverrides);
    const caseFingerprint = sha256Canonical(state);
    const coverageResult = executeSteps({
      fixture,
      steps: coverage.steps,
      responses,
      adapters,
      capabilities,
      initialStorySystem: buildLegacyStorySystem(fixture.storySetup),
      initialWorldEventStrings: state.legacyWorldEventStrings || [],
      terminalEvents: state.terminalEvents || [],
      knowledgeReceipts: state.knowledgeReceipts || [],
    });
    const coverageCodes = sortedUnique([...coverageResult.observations]);
    const coverageMetrics = computeMetrics(coverageResult.occurrences);
    const coverageExpectedCodes = sortedUnique(coverage.currentBaseline.expectedObservationCodes);
    const coverageExpectedMetrics = Object.fromEntries(
      Object.entries(coverage.currentBaseline.expectedMetrics).sort(([left], [right]) => left.localeCompare(right, 'en')),
    );
    const coverageObservationMatch = JSON.stringify(coverageCodes) === JSON.stringify(coverageExpectedCodes);
    const coverageMetricsMatch = JSON.stringify(coverageMetrics) === JSON.stringify(coverageExpectedMetrics);
    coverageReports.push({
      coverageId: coverage.coverageId,
      title: coverage.title,
      playerFacingExpectation: coverage.playerFacingExpectation || '',
      classification: coverage.currentBaseline.classification,
      pass: coverageObservationMatch && coverageMetricsMatch,
      initialStateFingerprint: caseFingerprint,
      observedCodes: coverageCodes,
      expectedCodes: coverageExpectedCodes,
      metrics: coverageMetrics,
      expectedMetrics: coverageExpectedMetrics,
      transitions: coverageResult.transitions,
      v3Target: coverage.v3Target || null,
      reviewQuestion: coverage.reviewQuestion || '',
      errors: [
        coverageObservationMatch ? '' : 'coverage observation codes differ',
        coverageMetricsMatch ? '' : 'coverage metrics differ',
      ].filter(Boolean),
    });
  }

  return {
    scenarioId: fixture.scenarioId,
    title: fixture.title,
    classification: fixture.currentBaseline.classification,
    pass: observationMatch && metricsMatch && coverageReports.every((report) => report.pass),
    initialStateFingerprint: validated.initialStateFingerprint,
    responseHashes: validated.responseHashes,
    adjudications: Object.fromEntries(validated.responseBundle.responses.map((response) => [
      response.responseId,
      response.expectedAdjudication,
    ])),
    allowedFinalSideEffectsByResponse: Object.fromEntries(validated.responseBundle.responses.map((response) => [
      response.responseId,
      response.allowedFinalSideEffects,
    ])),
    refsByResponse: Object.fromEntries(validated.refsByResponse),
    observedCodes,
    expectedCodes,
    metrics: actualMetrics,
    expectedMetrics,
    transitions: mainResult.transitions,
    worldTransitions: mainResult.transitions.filter((transition) => transition.service === 'world'),
    finalLegacyWorldEventStrings: mainResult.worldEventStrings,
    coverageReports,
    v3Target: fixture.v3Target,
    reviewQuestion: fixture.reviewQuestion,
    errors: [
      observationMatch ? '' : 'baseline observation codes differ',
      metricsMatch ? '' : 'baseline metrics differ',
    ].filter(Boolean),
  };
}

// G0.2：内存变体入口——用内存 fixture/bundle 运行单个场景（负例篡改回归用，不落盘）。
export async function runScenarioWithBundle(fixture, bundle, options = {}) {
  const adapters = await loadCurrentRuntimeAdapters();
  const capabilities = buildStaticCapabilities();
  const validated = validateScenarioRecord({
    name: fixture.scenarioId + '.json',
    path: 'in-memory',
    fixture,
  }, { ...options, bundle });
  return runScenario(validated, adapters, capabilities);
}

export async function buildHashManifest() {
  const records = loadScenarioFiles();
  return records.map((record) => {
    const validated = validateScenarioRecord(record, { skipStoredHashCheck: true });
    return {
      scenarioId: validated.fixture.scenarioId,
      initialStateFingerprint: validated.initialStateFingerprint,
      responseHashes: validated.responseHashes,
    };
  });
}

export async function runAllScenarios(options = {}) {
  const records = loadScenarioFiles();
  const ids = records.map((record) => record.fixture.scenarioId);
  assert(JSON.stringify(ids.sort()) === JSON.stringify([...EXPECTED_SCENARIO_IDS].sort()), 'fixture set must contain exactly the ten G0 scenarios');
  const selected = options.scenarioId
    ? records.filter((record) => record.fixture.scenarioId === options.scenarioId)
    : records;
  assert(selected.length > 0, 'unknown scenario: ' + options.scenarioId);
  const adapters = await loadCurrentRuntimeAdapters();
  const capabilities = buildStaticCapabilities();
  const reports = [];
  for (const record of selected) {
    const validated = validateScenarioRecord(record);
    reports.push(await runScenario(validated, adapters, capabilities));
  }
  return {
    schemaVersion: 'story-v3-g0-baseline-report@1',
    contractMode: 'legacy_baseline',
    pass: reports.every((report) => report.pass),
    scenarioCount: reports.length,
    capabilities,
    reports,
  };
}

export const MANIFEST_SCHEMA_VERSION = 'story-v3-g0-baseline-manifest@2';

// G0.1 子任务 D / G0.2 子任务 D：独立、受版本控制的 baseline manifest。
// 正常回归只读取并校验 manifest，不自动改写；更新必须显式执行 --update-manifest，
// 且仅在 baseline 全部通过时写入，写入前打印变更前后差异。
// manifest 的 generatedAt 使用固定时间常量，避免随机时间戳破坏确定性。
export const MANIFEST_GENERATED_AT = '2026-08-07T00:00:00+08:00';

export const MANIFEST_PATH = 'scripts/fixtures/story-v3/_baseline-manifest.json';

function readSourceHead() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: ROOT,
      encoding: 'utf8',
      windowsHide: true,
    }).trim();
  } catch {
    return 'unknown';
  }
}

// 轻量递归差异：返回变更路径列表（added/removed/changed）。
export function diffManifest(oldManifest, newManifest) {
  const flatten = (value, prefix = '', out = new Map()) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => flatten(item, `${prefix}[${index}]`, out));
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value).sort()) {
        flatten(value[key], prefix ? `${prefix}.${key}` : key, out);
      }
    } else {
      out.set(prefix, value);
    }
    return out;
  };
  const oldFlat = flatten(oldManifest);
  const newFlat = flatten(newManifest);
  const paths = new Set([...oldFlat.keys(), ...newFlat.keys()]);
  const lines = [];
  for (const key of [...paths].sort()) {
    const oldValue = oldFlat.has(key) ? oldFlat.get(key) : undefined;
    const newValue = newFlat.has(key) ? newFlat.get(key) : undefined;
    if (!oldFlat.has(key)) lines.push(`+ ${key} = ${JSON.stringify(newValue)}`);
    else if (!newFlat.has(key)) lines.push(`- ${key} = ${JSON.stringify(oldValue)}`);
    else if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      lines.push(`~ ${key}: ${JSON.stringify(oldValue)} -> ${JSON.stringify(newValue)}`);
    }
  }
  return lines.length ? lines.join('\n') : '（无差异）';
}

// 从一次 runAllScenarios 的结果组装 manifest 内容（不重新运行运行时）。
export function composeBaselineManifest(baseline) {
  const scenarios = baseline.reports.map((report) => ({
    scenarioId: report.scenarioId,
    initialStateFingerprint: report.initialStateFingerprint,
    responses: Object.keys(report.responseHashes).sort().map((responseId) => ({
      responseId,
      rawOutputSha256: report.responseHashes[responseId],
      adjudication: report.adjudications[responseId],
      allowedFinalSideEffects: report.allowedFinalSideEffectsByResponse[responseId],
      refs: report.refsByResponse[responseId],
    })),
    worldBehavior: report.worldTransitions.map((transition) => ({
      stepId: transition.stepId,
      responseId: transition.responseId,
      kind: transition.kind,
      behavior: transition.behavior,
      parsedSummary: transition.parsedSummary,
    })),
    observationCodes: report.observedCodes,
    metrics: report.metrics,
    coverage: report.coverageReports.map((coverage) => ({
      coverageId: coverage.coverageId,
      initialStateFingerprint: coverage.initialStateFingerprint,
      observationCodes: coverage.observedCodes,
      metrics: coverage.metrics,
      classification: coverage.classification,
      v3Target: coverage.v3Target,
    })),
  }));
  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generatedAt: MANIFEST_GENERATED_AT,
    sourceHead: readSourceHead(),
    scenarioCount: scenarios.length,
    scenarios,
  };
}

export function writeBaselineManifest(manifest, targetPath = MANIFEST_PATH) {
  const target = path.join(ROOT, targetPath);
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return target;
}

export function readBaselineManifest() {
  const target = path.join(ROOT, MANIFEST_PATH);
  assert(fs.existsSync(target), 'missing baseline manifest; run: node scripts/story-composition-v3-scenario-runner.mjs --update-manifest');
  return readJson(target);
}

// 校验 manifest 与当前基线一致（深度比较除 generatedAt/sourceHead 外的全部内容）。
export function assertManifestMatches(manifest, baseline) {
  // G0.2.3 子任务 B：深度比较前先验证 manifest coverage 的字符串数组契约
  // （与 fixture runner 校验共用同一个 assertNonEmptyStringArray，禁止各自弱化）。
  for (const scenario of manifest.scenarios || []) {
    for (const coverage of scenario.coverage || []) {
      assertNonEmptyStringArray(coverage.v3Target?.decisions, 'manifest coverage v3Target.decisions');
      assertNonEmptyStringArray(coverage.v3Target?.allowedFinalSideEffects, 'manifest coverage v3Target.allowedFinalSideEffects');
    }
  }
  const composed = composeBaselineManifest(baseline);
  const strip = (value) => JSON.parse(JSON.stringify(value, (key, item) => (
    key === 'generatedAt' || key === 'sourceHead' ? undefined : item
  )));
  const manifestData = strip(manifest);
  const composedData = strip(composed);
  const manifestText = JSON.stringify(manifestData);
  const composedText = JSON.stringify(composedData);
  assert(manifestText === composedText, 'baseline manifest drifted from current fixtures; update with: node scripts/story-composition-v3-scenario-runner.mjs --update-manifest');
}

// G0.2 子任务 D 更新保护：只有 baseline 全部通过才写入；写入前打印旧/新差异。
export function updateManifestWithGuard({ baseline, targetPath = MANIFEST_PATH } = {}) {
  if (!baseline || baseline.pass !== true) {
    throw new Error('baseline 未全部通过，拒绝写入 manifest（不污染正式基线）');
  }
  const manifest = composeBaselineManifest(baseline);
  const target = path.join(ROOT, targetPath);
  const oldManifest = fs.existsSync(target) ? readJson(target) : null;
  const diffText = oldManifest ? diffManifest(oldManifest, manifest) : '（无旧 manifest，首次生成）';
  const written = writeBaselineManifest(manifest, targetPath);
  return { manifest, diffText, written, changed: oldManifest ? diffText !== '（无差异）' : true };
}

function printHumanReport(report) {
  console.log('剧情编制 V3 / G0 固定场景基线');
  console.log('模式: ' + report.contractMode);
  console.log('场景: ' + report.scenarioCount);
  for (const scenario of report.reports) {
    const marker = scenario.pass ? 'OK' : 'MISMATCH';
    console.log(marker + ' | ' + scenario.scenarioId + ' | ' + scenario.title);
    console.log('  当前观察: ' + (scenario.observedCodes.join(', ') || 'none'));
    console.log('  当前指标: ' + JSON.stringify(scenario.metrics));
    if (scenario.errors.length) console.log('  错误: ' + scenario.errors.join('; '));
    for (const coverage of scenario.coverageReports) {
      const coverageMarker = coverage.pass ? 'OK' : 'MISMATCH';
      console.log('  ' + coverageMarker + ' | coverage: ' + coverage.coverageId + ' | ' + coverage.title);
      console.log('    当前观察: ' + (coverage.observedCodes.join(', ') || 'none'));
      console.log('    当前指标: ' + JSON.stringify(coverage.metrics));
      if (coverage.errors.length) console.log('    错误: ' + coverage.errors.join('; '));
    }
  }
  console.log(report.pass ? 'G0 scenario baseline passed.' : 'G0 scenario baseline mismatched.');
}

function isDirectExecution() {
  return Boolean(process.argv[1]) && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
}

if (isDirectExecution()) {
  try {
    if (process.argv.includes('--hash-manifest')) {
      console.log(JSON.stringify(await buildHashManifest(), null, 2));
    } else if (process.argv.includes('--update-manifest')) {
      const baseline = await runAllScenarios();
      if (!baseline.pass) {
        console.error('baseline 未全部通过，manifest 未更新（拒绝写入正式基线）');
        process.exitCode = 1;
      } else {
        const { manifest, diffText, written } = updateManifestWithGuard({ baseline });
        console.log('manifest diff:');
        console.log(diffText);
        console.log('baseline manifest updated: ' + written);
        console.log('schemaVersion: ' + manifest.schemaVersion);
        console.log('scenarios: ' + manifest.scenarioCount);
        console.log('coverage cases: ' + manifest.scenarios.reduce((sum, scenario) => sum + scenario.coverage.length, 0));
      }
    } else {
      const scenarioArgIndex = process.argv.indexOf('--scenario');
      const scenarioId = scenarioArgIndex >= 0 ? process.argv[scenarioArgIndex + 1] : undefined;
      const report = await runAllScenarios({ scenarioId });
      if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
      else printHumanReport(report);
      if (!report.pass) process.exitCode = 1;
    }
  } catch (error) {
    console.error('story-v3 scenario runner failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

export {
  EXPECTED_SCENARIO_IDS,
  OBSERVATION_METRICS,
  loadCurrentRuntimeAdapters,
  buildStaticCapabilities,
  buildLegacyStorySystem,
  executeSteps,
  validateScenarioRecord,
  parseWorldResponse,
  extractStructuredEvidence,
  normalizeEvidenceUnits,
  bindEvidenceToUnits,
  bindCompletionEvidence,
  mergeCoverageState,
  computeMetrics,
  assertNonEmptyStringArray,
  isValidIsoDateTime,
};
