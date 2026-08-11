// G1.2.1 领域模型回归：从冻结 contract fixture 生成生产 TypeScript 领域模型并验证。
// - 唯一字段来源：scripts/fixtures/story-v3/story-runtime-contract.fixture.json（contractRevision 2）；
// - generateDomainModels() 是纯生成器：相同 fixture 两次生成字节级相同；
// - 六个 model 文件必须与生成器输出逐字节一致（含字段、required、enum、discriminator、variant、嵌套形状）；
// - 结构红线：TypeScript AST 只允许 interface/type/import type，并禁止宽泛类型和非法 import；
// - 负例：tamper 生成内容后必须被拒绝并输出稳定路径与原因；
// - 普通运行不写 fixture/sample/manifest 与生成文件，不产生 .tmp。
// 本文件不 import story-runtime-contract-regression.mjs 的 canonical oracle——fixture 是实现唯一来源。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import ts from 'typescript';
import { fileURLToPath } from 'node:url';

const CONTRACT_FIXTURE_PATH = path.join('scripts', 'fixtures', 'story-v3', 'story-runtime-contract.fixture.json');
const ASSET_SAMPLE_PATH = path.join('scripts', 'fixtures', 'story-v3', 'story-asset-catalog.sample.json');
const CONTRACT_MANIFEST_PATH = path.join('scripts', 'fixtures', 'story-v3', '_story-runtime-contract-manifest.json');
const CONTRACT_REGRESSION_PATH = path.join('scripts', 'story-runtime-contract-regression.mjs');
const FROZEN_FINGERPRINT = 'sha256:f19a297c9176d5fe84e79c95135ecc92ea2155b696c123820bd7b8b0b8755bf6';
const FROZEN_HASHES = {
  [CONTRACT_FIXTURE_PATH]: '46917bec5fac508eab3197ee97e40e8e38b039e59bbab798f0441df3ce9f353e',
  [ASSET_SAMPLE_PATH]: '1ef5df13948270f72e32661c6e22a2c09f12c376ceb265221a554cd051c68c86',
  [CONTRACT_MANIFEST_PATH]: 'd8b7e6936faea3a28c3b7bb7c766712cc518a050da408e63fe61b9baf507771a',
  [CONTRACT_REGRESSION_PATH]: '3b31012875f8da0795b90c4bebf9af16e272d20405454e867ba3c309c63d447f',
};

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256Bytes(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function modelOutputFingerprint(models) {
  const hash = crypto.createHash('sha256');
  for (const fileBase of FILE_ORDER) {
    const fileName = 'models/' + fileBase + '.ts';
    hash.update(fileName + '\0' + models[fileName] + '\0');
  }
  return 'sha256:' + hash.digest('hex');
}

function scanTypeOnlyAstRedlines(content, fileBase) {
  const sourceFile = ts.createSourceFile('models/' + fileBase + '.ts', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (sourceFile.parseDiagnostics.length > 0) {
    return 'TypeScript AST 解析失败: ' + sourceFile.parseDiagnostics.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')).join('; ');
  }
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (!statement.importClause?.isTypeOnly) return 'AST 禁止非 type-only import';
      continue;
    }
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) {
      const modifiers = ts.getModifiers(statement) || [];
      const modifierKinds = modifiers.map((modifier) => modifier.kind);
      if (modifierKinds.length !== 1 || modifierKinds[0] !== ts.SyntaxKind.ExportKeyword) {
        return 'AST 类型声明必须只有 export 修饰符';
      }
      continue;
    }
    const statementKind = ts.isVariableStatement(statement)
      ? 'VariableStatement'
      : ts.isExportDeclaration(statement)
        ? 'ExportDeclaration'
        : ts.SyntaxKind[statement.kind];
    return 'AST 禁止运行时或重导出语句: ' + statementKind;
  }
  return null;
}

function stageTmpPaths() {
  return [
    ...Object.keys(FROZEN_HASHES),
    ...FILE_ORDER.map((fileBase) => 'models/' + fileBase + '.ts'),
    'scripts/story-runtime-domain-model-regression.mjs',
  ].map((filePath) => filePath + '.tmp');
}

function findExistingStageTmpFiles() {
  const explicitPaths = stageTmpPaths().filter((filePath) => fs.existsSync(path.join(process.cwd(), filePath)));
  const stageDirectories = ['models', 'scripts', path.join('scripts', 'fixtures', 'story-v3')];
  const discovered = [];
  for (const directory of stageDirectories) {
    for (const entry of fs.readdirSync(path.join(process.cwd(), directory), { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.tmp')) discovered.push(path.join(directory, entry.name));
    }
  }
  return [...new Set([...explicitPaths, ...discovered])].sort();
}

function verifyNoStageTmpFiles(existingPaths) {
  return existingPaths.length === 0
    ? { ok: true, error: '' }
    : { ok: false, error: '发现阶段临时文件: ' + existingPaths.join(', ') };
}

function verifyFrozenBytes(filePath, bytes, expectedHash) {
  const actualHash = sha256Bytes(bytes);
  return actualHash === expectedHash
    ? { ok: true, error: '' }
    : { ok: false, error: 'SHA-256 mismatch: ' + filePath + ' ' + actualHash };
}

// ══════════════════════════════════════════════════════════════════════
// 归属表：每个 fixture 类型/枚举只在一个生产文件中声明（G1.2.1 交接包第 4 节）。
// storyRuntimeJobs.ts 为边界占位：fixture 无独立 job ledger 类型，
// job/outbox 数据形状由 ProjectionOutboxItem 表达（归属 storyRuntimeProjection.ts）。
// ══════════════════════════════════════════════════════════════════════
const TYPE_FILE = {
  // models/storyRuntime.ts：运行时核心状态/世界事件/事实/证据/受众
  StoryRuntimeState: 'storyRuntime',
  StoryRuntimeView: 'storyRuntime',
  StoryProjectionState: 'storyRuntime',
  GameTime: 'storyRuntime',
  GameClock: 'storyRuntime',
  StoryFocus: 'storyRuntime',
  WorldEntityState: 'storyRuntime',
  WorldEventDefinition: 'storyRuntime',
  WorldEventDefinitionScheduling: 'storyRuntime',
  WorldEventInstance: 'storyRuntime',
  EmergentEventDefinition: 'storyRuntime',
  CompletionPredicate: 'storyRuntime',
  PayloadMatcher: 'storyRuntime',
  CommittedWorldFact: 'storyRuntime',
  ArticlePolicy: 'storyRuntime',
  OpeningPrelude: 'storyRuntime',
  PlayerPlanItem: 'storyRuntime',
  WorldPlanItem: 'storyRuntime',
  ConvergenceItem: 'storyRuntime',
  RuntimeMigrationMeta: 'storyRuntime',
  OfficialNotice: 'storyRuntime',
  KnowledgeGrant: 'storyRuntime',
  PublicSchedule: 'storyRuntime',
  EvidenceRef: 'storyRuntime',
  PublicScope: 'storyRuntime',
  OpeningPreludeSourceRef: 'storyRuntime',
  // models/storyRuntimeCommands.ts：回合回执、命令来源、proposal、RuntimeCommand
  TurnAdjudicationReceipt: 'storyRuntimeCommands',
  TurnAttemptReceipt: 'storyRuntimeCommands',
  EventTargetRef: 'storyRuntimeCommands',
  CreateEventProposal: 'storyRuntimeCommands',
  FactProposal: 'storyRuntimeCommands',
  KnowledgeGrantProposal: 'storyRuntimeCommands',
  PublicScheduleProposal: 'storyRuntimeCommands',
  OfficialNoticeProposal: 'storyRuntimeCommands',
  EmergentEventDefinitionProposal: 'storyRuntimeCommands',
  PlanItemProposal: 'storyRuntimeCommands',
  ConvergenceProposal: 'storyRuntimeCommands',
  RuntimeCommand: 'storyRuntimeCommands',
  // models/storyRuntimeProjection.ts：新闻/知识/受众/广播/回执/outbox
  NewsArticleAggregate: 'storyRuntimeProjection',
  NewsArticleVersion: 'storyRuntimeProjection',
  AudienceSelector: 'storyRuntimeProjection',
  AudienceSnapshot: 'storyRuntimeProjection',
  BroadcastEnvelope: 'storyRuntimeProjection',
  DeliveryRecord: 'storyRuntimeProjection',
  KnowledgeReceipt: 'storyRuntimeProjection',
  ObserverReadCursor: 'storyRuntimeProjection',
  ProjectionOutboxItem: 'storyRuntimeProjection',
  NewsSourceRef: 'storyRuntimeProjection',
  KnowledgeSubjectRef: 'storyRuntimeProjection',
  // models/storyAssetCatalog.ts：资产目录全部
  StoryAssetCatalog: 'storyAssetCatalog',
  StoryAssetSeries: 'storyAssetCatalog',
  StoryAssetChapter: 'storyAssetCatalog',
  StoryAssetChapterRange: 'storyAssetCatalog',
  StoryAssetSegment: 'storyAssetCatalog',
  StoryAssetCharacterProfile: 'storyAssetCatalog',
  StoryAssetFactionProfile: 'storyAssetCatalog',
  StoryAssetLocationProfile: 'storyAssetCatalog',
  StoryAssetConstraint: 'storyAssetCatalog',
  StoryAssetVisibilityHint: 'storyAssetCatalog',
  StoryAssetTimelineEntry: 'storyAssetCatalog',
  StoryAssetRoutePolicy: 'storyAssetCatalog',
  StoryAssetOccurrenceDefinition: 'storyAssetCatalog',
  StoryAssetOccurrenceSubjectRef: 'storyAssetCatalog',
  // models/storyRuntimeNarrative.ts：正文一致性/发布
  NarrativeRewriteRequest: 'storyRuntimeNarrative',
  NarrativeConsistencyDecision: 'storyRuntimeNarrative',
  NarrativePublicationRecord: 'storyRuntimeNarrative',
};

const ENUM_FILE = {
  // storyRuntime.ts
  WorldEventInstanceStatus: 'storyRuntime',
  WorldEventResolutionMode: 'storyRuntime',
  EventDefinitionResolutionMode: 'storyRuntime',
  WorldEventOutcome: 'storyRuntime',
  WorldEventReplayPolicy: 'storyRuntime',
  WorldEventDefinitionOrigin: 'storyRuntime',
  WorldEntityType: 'storyRuntime',
  WorldEntityStatus: 'storyRuntime',
  StoryFocusStatus: 'storyRuntime',
  EvidenceLevel: 'storyRuntime',
  FactCreatedBy: 'storyRuntime',
  PublicScheduleStatus: 'storyRuntime',
  OfficialNoticeStatus: 'storyRuntime',
  PlayerPlanItemStatus: 'storyRuntime',
  AcceptanceMode: 'storyRuntime',
  WorldPlanItemStatus: 'storyRuntime',
  ConvergenceItemStatus: 'storyRuntime',
  RuntimeMigrationStatus: 'storyRuntime',
  PayloadMatcherOperator: 'storyRuntime',
  AdvanceTimeReason: 'storyRuntime',
  PathCommandAction: 'storyRuntime',
  EvidenceRefKind: 'storyRuntime',
  PublicScopeKind: 'storyRuntime',
  ArticleAudienceKind: 'storyRuntime',
  // storyRuntimeCommands.ts
  TurnCommandSource: 'storyRuntimeCommands',
  TurnAttemptPhase: 'storyRuntimeCommands',
  TurnRecoveryAction: 'storyRuntimeCommands',
  // storyRuntimeProjection.ts
  NewsArticleVersionLifecycle: 'storyRuntimeProjection',
  NewsStoryPhase: 'storyRuntimeProjection',
  NewsReliability: 'storyRuntimeProjection',
  MigrationTraceStatus: 'storyRuntimeProjection',
  BroadcastChannel: 'storyRuntimeProjection',
  KnowledgeSubjectType: 'storyRuntimeProjection',
  KnowledgeKind: 'storyRuntimeProjection',
  KnowledgeChannel: 'storyRuntimeProjection',
  ObserverReadChannel: 'storyRuntimeProjection',
  ProjectionOutboxKind: 'storyRuntimeProjection',
  ProjectionOutboxOperation: 'storyRuntimeProjection',
  OutboxConsumerStatus: 'storyRuntimeProjection',
  OutboxItemStatus: 'storyRuntimeProjection',
  PayloadRefKind: 'storyRuntimeProjection',
  NewsSourceRefKind: 'storyRuntimeProjection',
  KnowledgeSubjectRefKind: 'storyRuntimeProjection',
  // storyAssetCatalog.ts
  StoryAssetCatalogSourceKind: 'storyAssetCatalog',
  StoryAssetConstraintKind: 'storyAssetCatalog',
  StoryAssetProfileImportance: 'storyAssetCatalog',
  StoryAssetLocationLevel: 'storyAssetCatalog',
  StoryAssetParticipationPolicy: 'storyAssetCatalog',
  StoryAssetBypassPolicy: 'storyAssetCatalog',
  StoryAssetDeviationPolicy: 'storyAssetCatalog',
  StoryAssetEarlyCompletionPolicy: 'storyAssetCatalog',
  StoryAssetOccurrencePolicy: 'storyAssetCatalog',
  StoryAssetNewInstancePolicy: 'storyAssetCatalog',
  StoryAssetOccurrenceSubjectKind: 'storyAssetCatalog',
  // storyRuntimeNarrative.ts
  NarrativeConsistencyCode: 'storyRuntimeNarrative',
  NarrativeRewriteOperation: 'storyRuntimeNarrative',
  NarrativeDecisionOutcome: 'storyRuntimeNarrative',
  NarrativePublicationStatus: 'storyRuntimeNarrative',
};

const FILE_ORDER = ['storyRuntime', 'storyRuntimeCommands', 'storyRuntimeProjection', 'storyAssetCatalog', 'storyRuntimeJobs', 'storyRuntimeNarrative'];

const FILE_HEADER = (fileBase) => [
  '// 由 scripts/story-runtime-domain-model-regression.mjs 的 generateDomainModels 从',
  '// scripts/fixtures/story-v3/story-runtime-contract.fixture.json 生成（contractRevision 2）',
  '// fixture fingerprint: ' + FROZEN_FINGERPRINT,
  '// 本文件只声明领域类型，不实现任何运行逻辑；禁止被现有生产运行流程 import。',
  '// 类型唯一来源为冻结 fixture；任何字段/枚举/联合变化必须走 schema revision。',
].join('\n');

// ══════════════════════════════════════════════════════════════════════
// TS 类型生成：spec -> TypeScript 类型字符串；collectedRefs 收集跨文件引用。
// ══════════════════════════════════════════════════════════════════════
function tsForSpec(spec, collectedRefs) {
  switch (spec.type) {
    case 'string': return 'string';
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'literal': return typeof spec.value === 'string' ? "'" + spec.value + "'" : JSON.stringify(spec.value);
    case 'enum': collectedRefs.add(spec.enum); return spec.enum;
    case 'ref': collectedRefs.add(spec.to); return spec.to;
    case 'array': return tsForSpec(spec.items, collectedRefs) + '[]';
    case 'object': {
      const parts = Object.entries(spec.fields || {}).map(([name, child]) => {
        const t = tsForSpec(child, collectedRefs);
        return name + (child.required === true ? '' : '?') + ': ' + t;
      });
      return '{ ' + parts.join('; ') + ' }';
    }
    case 'map': {
      const keyT = tsForSpec(spec.key, collectedRefs);
      const valT = tsForSpec(spec.value, collectedRefs);
      return 'Record<' + keyT + ', ' + valT + '>';
    }
    case 'open_map': {
      const valueTypes = spec.valueTypes || ['unknown'];
      if (valueTypes.includes('unknown')) {
        collectedRefs.add('JsonValue');
        return 'Record<string, JsonValue>';
      }
      return 'Record<string, ' + valueTypes.join(' | ') + '>';
    }
    case 'scalar_union': {
      const parts = (spec.elementTypes || []).map((v) => (v === 'string_array' ? 'string[]' : v));
      return parts.join(' | ');
    }
    case 'union': {
      // 内联判别联合（当前 fixture 无此形态，防御性支持，不硬编码 discriminator）。
      const variants = (spec.variants || []).map((variant) => {
        const parts = Object.entries(variant.fields || {}).map(([name, child]) => {
          const t = tsForSpec(child, collectedRefs);
          return name + (child.required === true ? '' : '?') + ': ' + t;
        });
        return '{ ' + parts.join('; ') + ' }';
      });
      return variants.join(' | ');
    }
    default:
      fail('未知字段规格类型（不允许 fallback）: ' + JSON.stringify(spec.type));
  }
}

function typeFieldsLines(fields, fixture, collectedRefs) {
  return Object.entries(fields).map(([name, spec]) => {
    const t = tsForSpec(spec, collectedRefs);
    return '  ' + name + (spec.required === true ? '' : '?') + ': ' + t + ';';
  });
}

function buildTypeDefinitions(fileBase, fixture) {
  const lines = [];
  const typeNames = Object.keys(TYPE_FILE).filter((n) => TYPE_FILE[n] === fileBase);
  const enumNames = Object.keys(ENUM_FILE).filter((n) => ENUM_FILE[n] === fileBase);
  for (const enumName of enumNames) {
    const values = fixture.enums[enumName].values.map((v) => (typeof v === 'string' ? "'" + v + "'" : JSON.stringify(v)));
    lines.push('export type ' + enumName + ' = ' + values.join(' | ') + ';');
    lines.push('');
  }
  for (const typeName of typeNames) {
    const typeDef = fixture.types[typeName];
    if (typeDef.kind === 'union') {
      const variantLines = typeDef.variants.map((variant) => {
        const parts = Object.entries(variant.fields || {}).map(([name, spec]) => {
          const t = tsForSpec(spec, collectedRefsFor(typeName, fileBase, fixture));
          return name + (spec.required === true ? '' : '?') + ': ' + t;
        });
        return '  | { ' + parts.join('; ') + ' }';
      });
      lines.push('export type ' + typeName + ' =');
      lines.push(...variantLines);
      lines.push('');
    } else {
      const fieldLines = Object.entries(typeDef.fields || {}).map(([name, spec]) => {
        const t = tsForSpec(spec, collectedRefsFor(typeName, fileBase, fixture));
        return '  ' + name + (spec.required === true ? '' : '?') + ': ' + t + ';';
      });
      lines.push('export interface ' + typeName + ' {');
      lines.push(...fieldLines);
      lines.push('}');
      lines.push('');
    }
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '\n');
}

// 为单个类型收集跨文件引用（避免为整个文件共享 Set 导致误 import）。
function collectedRefsFor(typeName, fileBase, fixture) {
  const refs = new Set();
  const typeDef = fixture.types[typeName];
  if (typeDef.kind === 'union') {
    for (const variant of typeDef.variants || []) {
      for (const spec of Object.values(variant.fields || {})) tsForSpec(spec, refs);
    }
  } else {
    for (const spec of Object.values(typeDef.fields || {})) tsForSpec(spec, refs);
  }
  return refs;
}

// 生成单个文件的完整源码。
export function buildDomainModelFile(fileBase, fixture) {
  const header = FILE_HEADER(fileBase);
  const typeNames = Object.keys(TYPE_FILE).filter((n) => TYPE_FILE[n] === fileBase);
  const enumNames = Object.keys(ENUM_FILE).filter((n) => ENUM_FILE[n] === fileBase);
  const definedNames = new Set([...typeNames, ...enumNames, ...(fileBase === 'storyRuntime' ? ['JsonPrimitive', 'JsonValue'] : [])]);
  // 跨文件引用：收集全部类型用到的 refs，去掉本文件定义的。
  const allRefs = new Set();
  for (const typeName of typeNames) {
    for (const ref of collectedRefsFor(typeName, fileBase, fixture)) allRefs.add(ref);
  }
  const importGroups = new Map();
  for (const ref of allRefs) {
    if (definedNames.has(ref)) continue;
    const targetFile = TYPE_FILE[ref] || ENUM_FILE[ref] || (ref === 'JsonValue' ? 'storyRuntime' : null);
    assert(targetFile, '引用无法归属: ' + ref + '（来自 ' + fileBase + '）');
    if (!importGroups.has(targetFile)) importGroups.set(targetFile, []);
    importGroups.get(targetFile).push(ref);
  }
  const importLines = [];
  for (const targetFile of [...importGroups.keys()].sort()) {
    const names = importGroups.get(targetFile).sort();
    importLines.push("import type { " + names.join(', ') + " } from './" + targetFile + "';");
  }
  if (fileBase === 'storyRuntimeJobs') {
    // G1.2.1 边界占位：冻结 fixture 无独立 job ledger 类型，job/outbox 数据形状由
    // ProjectionOutboxItem 表达（归属 storyRuntimeProjection.ts，见交接包第 4 节归属表）。
    return header + '\n\n' +
      '// 本文件为 G1.2.1 边界占位：fixture 中 job/outbox 相关数据形状由 ProjectionOutboxItem 承担，\n' +
      '// 归属 storyRuntimeProjection.ts。fixture 无独立 job ledger 类型；后续若出现独立 job ledger\n' +
      '// 或 outbox 类型，在此声明数据形状并同步 schema revision（仍不实现 lease/retry/worker 逻辑）。\n';
  }
  const sections = [];
  if (fileBase === 'storyRuntime') {
    sections.push('// JsonValue 是全项目唯一的递归 JSON 值类型定义（open_map 的值形态）。\n' +
      'export type JsonPrimitive = string | number | boolean | null;\n' +
      'export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };');
  }
  sections.push(buildTypeDefinitions(fileBase, fixture));
  return header + '\n' + (importLines.length > 0 ? '\n' + importLines.join('\n') + '\n' : '\n') + '\n' + sections.join('\n').replace(/\n{3,}/g, '\n\n');
}

// 纯生成器：相同 fixture 两次生成字节级相同。
export function generateDomainModels(fixture) {
  const models = {};
  for (const fileBase of FILE_ORDER) {
    models['models/' + fileBase + '.ts'] = buildDomainModelFile(fileBase, fixture);
  }
  return models;
}

// ══════════════════════════════════════════════════════════════════════
// 覆盖统计与验证
// ══════════════════════════════════════════════════════════════════════
export function collectCoverage(fixture) {
  const types = Object.keys(fixture.types);
  const enums = Object.keys(fixture.enums);
  const unions = types.filter((n) => fixture.types[n].kind === 'union');
  const variants = unions.reduce((sum, n) => sum + (fixture.types[n].variants || []).length, 0);
  let signatures = 0;
  for (const n of types) {
    if (fixture.types[n].kind === 'union') {
      for (const v of fixture.types[n].variants || []) signatures += Object.keys(v.fields || {}).length;
    } else {
      signatures += Object.keys(fixture.types[n].fields || {}).length;
    }
  }
  return { types: types.length, enums: enums.length, unions: unions.length, variants, signatures };
}

function firstDiffLine(expected, actual) {
  const e = expected.split('\n');
  const a = actual.split('\n');
  const max = Math.max(e.length, a.length);
  for (let i = 0; i < max; i += 1) {
    if (e[i] !== a[i]) return { line: i + 1, expected: e[i] === undefined ? '(end)' : e[i], actual: a[i] === undefined ? '(end)' : a[i] };
  }
  return null;
}

// 静态红线：禁止 any、Record<string, unknown>、JSON 引用、生产运行入口 import。
// 只扫描非注释代码行（文件头注释里的 fixture 文件名不算引用）；
// 生产运行入口隔离由 import 白名单保证（子串扫描会误伤 restore_pre_turn 等合法枚举值）。
export function scanStaticRedlines(content, fileBase) {
  const codeLines = content.split('\n').filter((line) => !line.trim().startsWith('//'));
  const code = codeLines.join('\n');
  if (/\bany\b/.test(code)) return '出现 any（禁止宽泛类型）';
  if (code.includes('Record<string, unknown>')) return '出现 Record<string, unknown>（open_map 必须 Record<string, JsonValue> 或精确 primitive 范围）';
  if (code.includes('.json')) return '引用 JSON 文件（禁止 import fixture 数据）';
  for (const line of codeLines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('import ')) continue;
    const match = trimmed.match(/^import type \{ .+ \} from '(.+)';$/);
    if (!match) return '非法 import 语句: ' + trimmed;
    if (!/^\.\/(storyRuntime|storyRuntimeCommands|storyRuntimeProjection|storyAssetCatalog|storyRuntimeJobs|storyRuntimeNarrative)$/.test(match[1])) {
      return '非法 import 目标（生产运行入口/外部依赖）: ' + match[1];
    }
  }
  return null;
}

// 统一验证：字节对比 + 静态红线；返回 { ok, error }。
export function verifyModelFiles(expectedMap, actualMap) {
  for (const file of FILE_ORDER) {
    const fileName = 'models/' + file + '.ts';
    const expected = expectedMap[fileName];
    const actual = actualMap[fileName];
    if (actual === undefined) return { ok: false, error: fileName + ': 文件缺失' };
    if (actual !== expected) {
      const diff = firstDiffLine(expected, actual);
      return { ok: false, error: fileName + ' 与生成器输出不一致（第 ' + diff.line + ' 行）: 期望 "' + diff.expected + '" 实际 "' + diff.actual + '"' };
    }
    const redline = scanStaticRedlines(actual, file);
    if (redline) return { ok: false, error: fileName + ': ' + redline };
    const astRedline = scanTypeOnlyAstRedlines(actual, file);
    if (astRedline) return { ok: false, error: fileName + ': ' + astRedline };
  }
  return { ok: true, error: '' };
}

function collectExportedDeclarationNames(content) {
  return [...content.matchAll(/^export\s+(?:interface|type)\s+([A-Za-z_$][\w$]*)\b/gm)].map((match) => match[1]);
}

function assertExactNameSet(actualNames, expectedNames, label) {
  const actualCounts = new Map();
  for (const name of actualNames) actualCounts.set(name, (actualCounts.get(name) || 0) + 1);
  const duplicateNames = [...actualCounts.entries()].filter(([, count]) => count !== 1).map(([name]) => name).sort();
  assert(duplicateNames.length === 0, label + ' 出现重复导出声明: ' + JSON.stringify(duplicateNames));

  const actual = [...actualCounts.keys()].sort();
  const expected = [...expectedNames].sort();
  const missing = expected.filter((name) => !actualCounts.has(name));
  const extra = actual.filter((name) => !expected.includes(name));
  assert(missing.length === 0 && extra.length === 0, label + ' 导出声明集合不一致: 缺失=' + JSON.stringify(missing) + ' 多余=' + JSON.stringify(extra));
}

// ══════════════════════════════════════════════════════════════════════
// main：正向验证 + 确定性 + 负例 + 冻结 hash
// ══════════════════════════════════════════════════════════════════════
async function main() {
  const fixture = JSON.parse(fs.readFileSync(path.join(process.cwd(), CONTRACT_FIXTURE_PATH), 'utf8'));
  const positives = [];
  const rejections = [];

  // 覆盖统计（从 fixture 计算，不依赖 contract regression oracle）。
  const coverage = collectCoverage(fixture);
  assert(coverage.types === 66, '类型数必须是 66，实际 ' + coverage.types);
  assert(coverage.enums === 58, '枚举数必须是 58，实际 ' + coverage.enums);
  assert(coverage.unions === 7, 'union 数必须是 7，实际 ' + coverage.unions);
  assert(coverage.variants === 44, 'variant 数必须是 44，实际 ' + coverage.variants);
  assert(coverage.signatures === 647, '字段签名数必须是 647，实际 ' + coverage.signatures);

  // 生成 + 确定性。
  const generated = generateDomainModels(fixture);
  const generatedAgain = generateDomainModels(fixture);
  const generatedFingerprint = modelOutputFingerprint(generated);
  const generatedAgainFingerprint = modelOutputFingerprint(generatedAgain);
  assert(JSON.stringify(generated) === JSON.stringify(generatedAgain), '两次生成输出必须字节级一致');
  assert(generatedFingerprint === generatedAgainFingerprint, '两次生成 fingerprint 必须一致');
  positives.push({ name: '两次生成确定性', detail: 'bytes and fingerprint identical: ' + generatedFingerprint });

  // 磁盘六个文件必须与生成器输出逐字节一致 + 静态红线。
  const diskModels = {};
  for (const file of FILE_ORDER) {
    const fileName = 'models/' + file + '.ts';
    diskModels[fileName] = fs.readFileSync(path.join(process.cwd(), fileName), 'utf8');
  }
  const verify = verifyModelFiles(generated, diskModels);
  assert(verify.ok, '磁盘模型必须与生成器输出一致: ' + verify.error);
  positives.push({ name: '六个模型文件与生成器输出一致', detail: 'bytes identical' });

  // 归属完整性：fixture 名称、归属表和真实 export 声明三者精确对称。
  assertExactNameSet(Object.keys(TYPE_FILE), Object.keys(fixture.types), 'TYPE_FILE 与 fixture.types');
  assertExactNameSet(Object.keys(ENUM_FILE), Object.keys(fixture.enums), 'ENUM_FILE 与 fixture.enums');
  for (const fileBase of FILE_ORDER) {
    const expectedNames = [
      ...Object.keys(TYPE_FILE).filter((name) => TYPE_FILE[name] === fileBase),
      ...Object.keys(ENUM_FILE).filter((name) => ENUM_FILE[name] === fileBase),
      ...(fileBase === 'storyRuntime' ? ['JsonPrimitive', 'JsonValue'] : []),
    ];
    const actualNames = collectExportedDeclarationNames(diskModels['models/' + fileBase + '.ts']);
    assertExactNameSet(actualNames, expectedNames, 'models/' + fileBase + '.ts');
  }
  positives.push({ name: '归属完整性（66 类型 + 58 枚举）', detail: 'fixture / ownership / export declarations exactly symmetric' });

  // JsonValue 唯一：只在 storyRuntime.ts 定义一次。
  const jsonValueOccurrences = diskModels['models/storyRuntime.ts'].split('export type JsonValue =').length - 1;
  assert(jsonValueOccurrences === 1, 'JsonValue 必须在 storyRuntime.ts 恰好定义一次，实际 ' + jsonValueOccurrences);
  for (const file of FILE_ORDER) {
    if (file === 'storyRuntime') continue;
    assert(!diskModels['models/' + file + '.ts'].includes('export type JsonValue'), 'JsonValue 不得在其他文件重复定义: ' + file);
  }
  positives.push({ name: 'JsonValue 唯一来源（storyRuntime.ts）', detail: 'defined once, imported elsewhere' });

  // ── 负例：tamper 生成内容后必须被拒绝并输出稳定路径/原因 ──
  const tamperCases = [
    ['删除生成类型', (m) => {
      const lines = m['models/storyRuntime.ts'].split('\n');
      const start = lines.findIndex((l) => l.startsWith('export interface StoryRuntimeState {'));
      assert(start >= 0, 'tamper 前置：找不到 StoryRuntimeState');
      let end = start;
      while (end < lines.length && lines[end] !== '}') end += 1;
      lines.splice(start, end - start + 1);
      m['models/storyRuntime.ts'] = lines.join('\n');
    }, 'StoryRuntimeState'],
    ['增加空类型', (m) => { m['models/storyRuntime.ts'] += '\nexport type EmptyProbe = Record<string, never>;\n'; }, 'EmptyProbe'],
    ['改字段类型', (m) => { m['models/storyRuntime.ts'] = m['models/storyRuntime.ts'].replace('  focusId: string;', '  focusId: number;'); }, 'focusId'],
    ['改required', (m) => { m['models/storyRuntime.ts'] = m['models/storyRuntime.ts'].replace('  focusId: string;', '  focusId?: string;'); }, 'focusId'],
    ['改enum值', (m) => { m['models/storyRuntime.ts'] = m['models/storyRuntime.ts'].replace("= 'once' | 'allow_new_instance' | 'repeatable';", "= 'single' | 'allow_new_instance' | 'repeatable';"); }, 'single'],
    ['改discriminator', (m) => { m['models/storyRuntime.ts'] = m['models/storyRuntime.ts'].replace("| { kind: 'private' }", "| { tag: 'private' }"); }, 'tag'],
    ['删除union variant', (m) => { m['models/storyRuntime.ts'] = m['models/storyRuntime.ts'].replace("  | { kind: 'private' }\n", ''); }, 'private'],
    ['open_map改any', (m) => { m['models/storyRuntime.ts'] = m['models/storyRuntime.ts'].replace('  payload: Record<string, JsonValue>;', '  payload: any;'); }, 'any'],
    ['open_map改unknown', (m) => { m['models/storyRuntime.ts'] = m['models/storyRuntime.ts'].replace('  payload: Record<string, JsonValue>;', '  payload: Record<string, unknown>;'); }, 'unknown'],
    ['import生产入口', (m) => { m['models/storyRuntimeNarrative.ts'] = "import { useGame } from '../hooks/useGame';\n" + m['models/storyRuntimeNarrative.ts']; }, 'import'],
    ['import fixture JSON', (m) => { m['models/storyAssetCatalog.ts'] = "import fx from '../scripts/fixtures/story-v3/story-runtime-contract.fixture.json';\n" + m['models/storyAssetCatalog.ts']; }, 'import'],
    ['注入 setter/store 运行逻辑', (m) => {
      m['models/storyRuntimeJobs.ts'] += '\nexport const setStoryRuntimeStore = () => undefined;\n';
    }, 'setStoryRuntimeStore'],
    ['非确定生成输出漂移', (m) => {
      m['models/storyRuntimeJobs.ts'] += '\n// generatedAt: 2026-08-08T00:00:00.001Z\n';
    }, 'generatedAt'],
  ];
  for (const [name, mutate, keyword] of tamperCases) {
    const tampered = JSON.parse(JSON.stringify(generated));
    mutate(tampered);
    const result = verifyModelFiles(generated, tampered);
    assert(!result.ok, name + ' 必须被拒绝');
    assert(result.error.includes(keyword), name + ' 拒绝原因必须包含 ' + keyword + '，实际: ' + result.error);
    rejections.push({ name, errorMessage: result.error });
  }

  // AST 闸门必须独立于 expected===actual 生效，不能让生成器和磁盘一起漂移。
  const synchronizedAstTamperCases = [
    ['同步注入运行时 store', (m) => {
      m['models/storyRuntimeJobs.ts'] += '\nexport const runtimeStore = { setState(value: number) { return value; } };\n';
    }, '运行时或重导出语句'],
    ['同步注入生产重导出', (m) => {
      m['models/storyRuntimeJobs.ts'] += "\nexport { useGame } from '../hooks/useGame';\n";
    }, '运行时或重导出语句'],
  ];
  for (const [name, mutate, keyword] of synchronizedAstTamperCases) {
    const pollutedExpected = JSON.parse(JSON.stringify(generated));
    const pollutedActual = JSON.parse(JSON.stringify(generated));
    mutate(pollutedExpected);
    mutate(pollutedActual);
    const result = verifyModelFiles(pollutedExpected, pollutedActual);
    assert(!result.ok, name + ' 必须被 AST 闸门拒绝');
    assert(result.error.includes(keyword), name + ' 拒绝原因必须包含 ' + keyword + '，实际: ' + result.error);
    rejections.push({ name, errorMessage: result.error });
  }

  // 冻结文件 hash 与无 .tmp（安全断言）。
  for (const [filePath, expectedHash] of Object.entries(FROZEN_HASHES)) {
    const absolutePath = path.join(process.cwd(), filePath);
    const originalBytes = fs.readFileSync(absolutePath);
    const actualCheck = verifyFrozenBytes(filePath, originalBytes, expectedHash);
    assert(actualCheck.ok, '冻结文件 hash 变化: ' + actualCheck.error);

    const tamperedBytes = Buffer.concat([originalBytes, Buffer.from('\nG1.2.1-frozen-input-tamper')]);
    const tamperedCheck = verifyFrozenBytes(filePath, tamperedBytes, expectedHash);
    assert(!tamperedCheck.ok, '冻结输入字节漂移必须被 hash 闸门拒绝: ' + filePath);
    rejections.push({ name: '冻结输入字节漂移-' + path.basename(filePath), errorMessage: 'rejected (' + tamperedCheck.error + ')' });
  }
  const existingTmpFiles = findExistingStageTmpFiles();
  const tmpCheck = verifyNoStageTmpFiles(existingTmpFiles);
  assert(tmpCheck.ok, tmpCheck.error);
  const tmpTamperCheck = verifyNoStageTmpFiles(['models/storyRuntimeJobs.ts.tmp']);
  assert(!tmpTamperCheck.ok, '新增 .tmp 必须被拒绝');
  rejections.push({ name: '新增模型临时文件', errorMessage: 'rejected (' + tmpTamperCheck.error + ')' });

  console.log('story-runtime-domain-model regression passed.');
  console.log('fixture fingerprint: ' + FROZEN_FINGERPRINT);
  console.log('generated model fingerprint: ' + generatedFingerprint);
  console.log('coverage: ' + coverage.types + ' types / ' + coverage.enums + ' enums / ' + coverage.unions + ' unions / ' + coverage.variants + ' variants / ' + coverage.signatures + ' field signatures');
  console.log('positive checks: ' + positives.length);
  for (const result of positives) console.log('  + ' + result.name + ': ' + result.detail);
  console.log('tamper rejections: ' + rejections.length);
  for (const result of rejections) console.log('  - ' + result.name + ': rejected (' + result.errorMessage + ')');
  console.log('frozen hashes: unchanged (4 files); no .tmp');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-runtime-domain-model regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
