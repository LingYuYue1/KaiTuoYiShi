// G1.3.1.3 commandValidator：对 RuntimeCommand / TurnCommand 做结构、引用、终态、受保护字段与证据绑定校验。
// - 结构闸门：任何命令入口先以 unknown 调用 G1.2.2 生产 validateRuntimeCommand（别名 validateRuntimeCommandShape，
//   不复制第二套 schema）；未知字段/错误 union/symbol/隐藏字段/getter/setter/sparse/undefined/循环引用
//   均返回稳定 INVALID_COMMAND + path，不 throw；旧 state、revision、副作用字节不变。
// - async：实例 fingerprint 必须由当前 state 内部计算（G1.2.3 canonical + Web Crypto SHA-256）；
// - ctx.catalog 必须携带 catalogFingerprint 并与 state.assetCatalogFingerprint 精确一致；
// - 共享 validateEvidenceRefsForTurn：narrative_span/system_command/gameplay_receipt 证据必须引用
//   本回合真实输入（rawBody/auxiliary/responseId），供 create/resolve/supersede/append_fact/
//   upsert_plan_item/enqueue_convergence/grant_knowledge/publish_public_schedule/issue_official_notice 复用；
// - 合法 lookup hint（eventTarget.eventInstanceId、合法 subjectRef 等）不得被 protected-field 扫描误伤；
//   真正未知受保护字段仍拒绝。
import type { RuntimeCommand } from '../../models/storyRuntimeCommands';
import type { StoryRuntimeState, WorldEventInstanceStatus } from '../../models/storyRuntime';
import type { RuntimeCtx, TurnCommand } from './runtimeCore';
import { canonicalJsonStringify } from './normalization';
import { sha256Fingerprint, sha256Hex } from './id';
import { validateRuntimeCommand as validateRuntimeCommandShape } from './runtimeValidator';
import { isStoryAssetCatalogStore } from './storyAssetCatalogStore';

export interface CommandIssue {
  code: string;
  path: string;
  message: string;
}
export type CommandValidationResult = { ok: true } | { ok: false; issue: CommandIssue };

const COMMAND_KINDS = new Set([
  'advance_time',
  'create_event_instance',
  'resolve_event_instance',
  'supersede_event_instance',
  'append_fact',
  'upsert_plan_item',
  'enqueue_convergence',
  'register_emergent_event_definition',
  'grant_knowledge',
  'publish_public_schedule',
  'issue_official_notice',
  'path_command',
]);

// coordinator 分配的受保护字段（与契约 commands.protectedFields 对应）。
const PROTECTED_FIELDS = new Set([
  'factId', 'eventInstanceId', 'sourceRevision', 'runtimeRevision', 'runtimeBranchId', 'occurredAt', 'committedAt',
  'issuedAt', 'observedAt', 'deliveredAt', 'createdAt', 'updatedAt', 'scheduleRevision', 'noticeRevision',
  'articleVersion', 'grantId', 'receiptId', 'publicationId', 'outboxId', 'recipientIds', 'audienceSnapshot',
  'idempotencyKey', 'eventResolutionKey', 'resultRevision', 'resultCode', 'resultHash', 'stateFingerprint',
]);

const TERMINAL_STATES = new Set<WorldEventInstanceStatus>(['resolved', 'cancelled', 'superseded', 'missed', 'archived']);
const EVIDENCE_KINDS = new Set([
  'narrative_span', 'system_command', 'gameplay_receipt', 'schedule_record', 'notice_record',
  'broadcast_record', 'article_version', 'migration_record', 'projection_record', 'narrative_publication',
]);
// A（G1.3.1.4）：本阶段尚无真实 owner 的记录型 evidence——不能成为任何确认性写入依据。
// 由共享 validateEvidenceRefsForTurn / extractor 统一拒绝为 MISSING_EVIDENCE。
const NO_OWNER_EVIDENCE_KINDS = new Set([
  'schedule_record', 'notice_record', 'broadcast_record', 'article_version',
  'migration_record', 'projection_record', 'narrative_publication',
]);

function issue(code: string, path: string, message: string): CommandValidationResult {
  return { ok: false, issue: { code, path, message } };
}

function isStrictPlainObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** 是否是 EvidenceRef 对象（含 kind 且 kind 属于冻结证据种类）。 */
function isEvidenceRefObject(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' && EVIDENCE_KINDS.has(kind);
}

/**
 * C（G1.3.1.4）：安全 canonical 序列化。canonicalJsonStringify（G1.2.3）对循环对象/symbol/隐藏字段/
 * getter/setter/sparse/undefined/bigint/function/非法 prototype 抛错且不调用 getter；
 * 这里把异常映射为稳定 null（调用方返回 INVALID_COMMAND/CONFLICT，禁止 throw）。
 */
export function tryCanonicalJson(value: unknown): string | null {
  try {
    return canonicalJsonStringify(value);
  } catch {
    return null;
  }
}

/**
 * A1/A2 结构闸门：以 unknown 调用 G1.2.2 生产 validateRuntimeCommand。
 * 生产 validator 纯读取、不执行 getter、对 undefined/循环/隐藏字段返回 issues 不 throw；
 * 这里统一映射为稳定 INVALID_COMMAND + path。
 */
export function validateCommandStructure(command: unknown): CommandValidationResult {
  const structural = validateRuntimeCommandShape(command);
  if (structural.ok) return { ok: true };
  const first = structural.issues[0];
  return issue('INVALID_COMMAND', first?.path ?? 'command', first?.message ?? '命令结构校验失败');
}

/** C3：resolve/supersede 目标必须出现在 factsOfInterest（内核从命令目标派生，禁止静默跳过仍结算）。 */
export function deriveFactsOfInterest(
  factsOfInterest: Array<{ eventInstanceId: string; factType: string }>,
  command: unknown,
): Array<{ eventInstanceId: string; factType: string }> {
  const cmd = command as { kind?: string; target?: { eventInstanceId?: unknown } } | null;
  if (cmd && (cmd.kind === 'resolve_event_instance' || cmd.kind === 'supersede_event_instance') && typeof cmd.target?.eventInstanceId === 'string') {
    const targetId = cmd.target.eventInstanceId;
    if (!factsOfInterest.some((f) => f.eventInstanceId === targetId)) {
      return [...factsOfInterest, { eventInstanceId: targetId, factType: 'unit_completed' }];
    }
  }
  return factsOfInterest;
}

/** 实例 canonical fingerprint：由当前 state 内部计算（排除无指纹字段后 canonical SHA-256）。
 *  C（G1.3.1.4）：先做安全 canonical（循环/symbol/隐藏/getter/sparse/非法值 -> null），禁止 throw。 */
export async function instanceFingerprintOf(state: StoryRuntimeState, eventInstanceId: string): Promise<string | null> {
  const instance = state.worldEvents.find((w) => w.eventInstanceId === eventInstanceId);
  if (!instance) return null;
  const canonical = tryCanonicalJson(instance);
  if (canonical === null) return null;
  const clone = JSON.parse(canonical) as Record<string, unknown>;
  delete clone.eventResolutionKey;
  return sha256Fingerprint(clone);
}

/** definition fingerprint：排除 definitionFingerprint 自身字段后的 canonical SHA-256。
 *  C（G1.3.1.4）：先做安全 canonical，失败返回 null（调用方映射 INVALID_COMMAND，禁止 throw）。 */
export async function definitionFingerprintOf(def: { definitionFingerprint?: string }): Promise<string | null> {
  const canonical = tryCanonicalJson(def);
  if (canonical === null) return null;
  const clone = JSON.parse(canonical) as Record<string, unknown>;
  delete clone.definitionFingerprint;
  return sha256Fingerprint(clone);
}

function hasProtectedField(proposal: unknown, path: string): string | null {
  if (proposal === null || typeof proposal !== 'object' || Array.isArray(proposal)) return null;
  for (const [key, child] of Object.entries(proposal as Record<string, unknown>)) {
    if (PROTECTED_FIELDS.has(key)) return key;
    // 递归嵌套 object（evidenceRefs/payload/EvidenceRef 对象不参与；eventTarget 是 canonical lookup hint，允许 eventInstanceId）。
    if (child !== null && typeof child === 'object' && !Array.isArray(child)
      && key !== 'evidenceRefs' && key !== 'payload' && key !== 'eventTarget' && key !== 'parentTarget' && key !== 'replacementTarget' && key !== 'subjectRef'
      && !isEvidenceRefObject(child)) {
      const nested = hasProtectedField(child, path + '.' + key);
      if (nested) return path + '.' + key + '.' + nested.split('.').pop();
    }
  }
  return null;
}

function terminalInstance(ctx: RuntimeCtx, instanceId: string): boolean {
  const instance = ctx.state.worldEvents.find((w) => w.eventInstanceId === instanceId);
  return instance ? TERMINAL_STATES.has(instance.status) : false;
}

async function checkInstanceFingerprint(ctx: RuntimeCtx, target: { eventInstanceId: string; expectedInstanceFingerprint?: unknown }, path: string): Promise<CommandValidationResult> {
  const instance = ctx.state.worldEvents.find((w) => w.eventInstanceId === target.eventInstanceId);
  if (!instance) return issue('CONFLICT', path, '目标事件实例不存在');
  if (typeof target.expectedInstanceFingerprint !== 'string' || target.expectedInstanceFingerprint.length === 0) {
    return issue('INVALID_COMMAND', path, 'target 必须携带非空 expectedInstanceFingerprint');
  }
  // 由当前 state 内部计算，缺 provider / provider 撒谎 / 空值 / 错误值 / 旧值都 fail-closed。
  const actual = await instanceFingerprintOf(ctx.state, target.eventInstanceId);
  // C（G1.3.1.4）：目标实例含非法容器（循环/symbol/getter/隐藏字段等）-> 稳定 INVALID_COMMAND，禁止 throw。
  if (actual === null) {
    return issue('INVALID_COMMAND', path, '目标实例含非法 JSON 容器，无法计算 fingerprint');
  }
  if (target.expectedInstanceFingerprint !== actual) {
    return issue('STALE_BRANCH', path, 'target fingerprint 与当前 state 实例不一致');
  }
  return { ok: true };
}

function safeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function safeGetProto(value: unknown): object | null {
  try {
    return Object.getPrototypeOf(value);
  } catch {
    return null; // Proxy getPrototypeOf trap 抛异常
  }
}

function safeOwnKeys(value: object): (string | symbol)[] | null {
  try {
    return Reflect.ownKeys(value);
  } catch {
    return null; // Proxy ownKeys trap 抛异常
  }
}

function safeOwnDescriptor(value: object, key: string): PropertyDescriptor | undefined | null {
  try {
    return Object.getOwnPropertyDescriptor(value, key);
  } catch {
    return null; // Proxy getOwnPropertyDescriptor trap 抛异常
  }
}

/**
 * A（G1.3.1.6）：生产 StoryAssetCatalogStore capability 检查——正式 verifier 必须是第一道闸门。
 * 身份由 store 模块内私有 WeakSet brand 决定（模块私有 WeakSet.has 是身份语义，Proxy 对象本身不在
 * brand 中，转发真实 store 也不会通过）；普通同名类/复制对象/null-prototype/绑定方法/任意 Proxy 都拒绝。
 * 防御纵深（brand 通过后仍执行）：has/get 不得有 own 覆盖（descriptor 层拒绝 getter/setter/替换方法，
 * getter 0 次调用），必须仍指向类原型方法，保证数据路径走生产方法、不经过外部替换。
 * 任何读取/调用异常（Proxy trap 抛异常等）-> 稳定 INVALID_COMMAND/CONFLICT，不 throw。
 */
export function isTrustedCatalogStore(store: unknown): { ok: true; store: object } | { ok: false; code: string; path: string; message: string } {
  if (store === null || (typeof store !== 'object' && typeof store !== 'function')) {
    return { ok: false, code: 'CONFLICT', path: 'catalog.store', message: 'store 必须是对象' };
  }
  // 正式 verifier：身份（brand）而非形状。brand 读取不调用用户代码，异常安全。
  let branded = false;
  try {
    branded = isStoryAssetCatalogStore(store);
  } catch (error) {
    return { ok: false, code: 'INVALID_COMMAND', path: 'catalog.store', message: 'brand verifier 读取抛异常: ' + safeErrorMessage(error) };
  }
  if (!branded) {
    return { ok: false, code: 'CONFLICT', path: 'catalog.store', message: 'store 必须是生产 StoryAssetCatalogStore 的直接实例（不接受同名类/复制对象/绑定方法/Proxy）' };
  }
  // 防御纵深：已 brand 的实例也不允许 has/get 被 own 覆盖或指向非原型方法。
  for (const key of ['has', 'get'] as const) {
    const desc = safeOwnDescriptor(store as object, key);
    if (desc === null) {
      return { ok: false, code: 'INVALID_COMMAND', path: 'catalog.store.' + key, message: key + ' 描述符读取失败（Proxy trap 抛异常）' };
    }
    if (desc !== undefined) {
      if (typeof desc.get === 'function' || typeof desc.set === 'function') {
        return { ok: false, code: 'INVALID_COMMAND', path: 'catalog.store.' + key, message: key + ' 不允许 getter/setter 属性（getter 0 次调用）' };
      }
      return { ok: false, code: 'INVALID_COMMAND', path: 'catalog.store.' + key, message: key + ' 必须是类原型方法，不能是 own 覆盖' };
    }
    let pointsToProtoMethod = false;
    try {
      const proto = Object.getPrototypeOf(store);
      pointsToProtoMethod = (store as Record<string, unknown>)[key] === (proto as Record<string, unknown>)[key];
    } catch (error) {
      return { ok: false, code: 'INVALID_COMMAND', path: 'catalog.store.' + key, message: key + ' 读取抛异常: ' + safeErrorMessage(error) };
    }
    if (!pointsToProtoMethod) {
      return { ok: false, code: 'INVALID_COMMAND', path: 'catalog.store.' + key, message: key + ' 必须是类原型方法（绑定/替换后的方法拒绝）' };
    }
  }
  return { ok: true, store };
}

/**
 * B（G1.3.1.4/5）：catalog 可信绑定——只比较调用方提供的 catalogFingerprint 字符串不能证明目录内容。
 * 必须由 G1.2.3 只读 catalog store（生产 StoryAssetCatalogStore 实例，经 isTrustedCatalogStore 能力检查）证明：
 *   1. ctx.catalog.catalogFingerprint === state.assetCatalogFingerprint（外部声明与 state 精确一致）；
 *   2. store.has(state.assetCatalogFingerprint) 返回 true（可信 snapshot 存在）；
 *   3. store.get(...) 返回的 eventDefinitions/occurrenceDefinitions 与调用方实际使用的 canonical 一致
 *      （防调用方在 store 之外替换/新增 definition）。
 * 所有 store 方法调用与容器读取都包 try/catch：has/get 抛异常 / Proxy trap 抛异常 -> 稳定
 * INVALID_COMMAND（依赖结构/容器非法）或 CONFLICT（可信 owner/快照不可用），不 throw、不吞错继续执行。
 */
async function checkCatalogBinding(ctx: RuntimeCtx): Promise<CommandValidationResult> {
  if (!ctx.catalog) return { ok: true }; // 无 catalog 时 create 会因缺 definition 拒绝
  if (typeof ctx.catalog.catalogFingerprint !== 'string' || ctx.catalog.catalogFingerprint.length === 0) {
    return issue('CONFLICT', 'catalog.catalogFingerprint', 'catalog 必须携带 catalogFingerprint');
  }
  if (ctx.catalog.catalogFingerprint !== ctx.state.assetCatalogFingerprint) {
    return issue('STALE_BRANCH', 'catalog.catalogFingerprint', 'catalog fingerprint 与 state.assetCatalogFingerprint 不一致');
  }
  if (!ctx.catalog.store) {
    return issue('CONFLICT', 'catalog.store', '本阶段不接受临时 catalog：必须由可信只读 catalog store 提供已绑定 snapshot');
  }
  const trust = isTrustedCatalogStore(ctx.catalog.store);
  if (!trust.ok) {
    return issue(trust.code, trust.path, trust.message);
  }
  // store.has 调用（异常 -> CONFLICT，可信 owner/快照不可用）。
  let hasSnapshot = false;
  try {
    hasSnapshot = ctx.catalog.store.has(ctx.state.assetCatalogFingerprint);
  } catch (error) {
    return issue('CONFLICT', 'catalog.store.has', 'store.has 抛异常: ' + safeErrorMessage(error));
  }
  if (!hasSnapshot) {
    return issue('CONFLICT', 'catalog.store', '可信 catalog store 中不存在该 fingerprint 的 snapshot');
  }
  // store.get 调用（异常 -> CONFLICT）。
  let trusted: unknown;
  try {
    trusted = ctx.catalog.store.get(ctx.state.assetCatalogFingerprint);
  } catch (error) {
    return issue('CONFLICT', 'catalog.store.get', 'store.get 抛异常: ' + safeErrorMessage(error));
  }
  if (trusted === null || trusted === undefined || typeof trusted !== 'object') {
    return issue('CONFLICT', 'catalog.store', 'store.get 未返回可读 snapshot');
  }
  const trustedObj = trusted as Record<string, unknown>;
  // 调用方实际使用的 definition 子集必须与可信快照一致（防替换/新增 definition）。
  if (!Array.isArray(ctx.catalog.eventDefinitions) || !Array.isArray(trustedObj.eventDefinitions)) {
    return issue('CONFLICT', 'catalog.eventDefinitions', 'catalog 必须携带 eventDefinitions 且 store 快照包含 eventDefinitions');
  }
  const givenEvents = tryCanonicalJson(ctx.catalog.eventDefinitions);
  const trustedEvents = tryCanonicalJson(trustedObj.eventDefinitions);
  // C（G1.3.1.4）：catalog 内容含非法容器 -> 稳定失败，禁止 throw。
  if (givenEvents === null || trustedEvents === null) {
    return issue('INVALID_COMMAND', 'catalog.eventDefinitions', 'catalog 含非法 JSON 容器，无法验证绑定');
  }
  if (givenEvents !== trustedEvents) {
    return issue('STALE_BRANCH', 'catalog.eventDefinitions', '调用方 eventDefinitions 与可信 store snapshot 不一致');
  }
  // occurrenceDefinitions 若调用方提供，也必须与快照一致。
  if (ctx.catalog.occurrenceDefinitions !== undefined) {
    const givenOcc = tryCanonicalJson(ctx.catalog.occurrenceDefinitions);
    const trustedOcc = trustedObj.occurrenceDefinitions === undefined ? null : tryCanonicalJson(trustedObj.occurrenceDefinitions);
    if (givenOcc === null || trustedOcc === null || givenOcc !== trustedOcc) {
      return issue('STALE_BRANCH', 'catalog.occurrenceDefinitions', '调用方 occurrenceDefinitions 与可信 store snapshot 不一致');
    }
  }
  return { ok: true };
}

/**
 * 证据结构校验：evidenceRefs 必须是非空数组（会改变事实/终态/规划/知识/排期/公告的命令必须有证据）、
 * 每项是对象、kind 属于冻结集合、可定位字段非空（不 throw）。
 */
export function evaluateEvidenceLevel(evidenceRefs: unknown, path: string, { requireNonEmpty = true } = {}): CommandValidationResult {
  if (!Array.isArray(evidenceRefs)) return issue('INVALID_COMMAND', path, 'evidenceRefs 必须是数组');
  if (requireNonEmpty && evidenceRefs.length === 0) return issue('MISSING_EVIDENCE', path, '会改变状态的命令必须有非空 evidence refs');
  for (const ref of evidenceRefs) {
    if (ref === null || !isStrictPlainObject(ref)) return issue('INVALID_COMMAND', path, 'evidence ref 必须是普通对象（拒绝 null）');
    const r = ref as { kind?: unknown; responseId?: unknown; bodyFingerprint?: unknown; commandId?: unknown; receiptId?: unknown };
    if (typeof r.kind !== 'string' || !EVIDENCE_KINDS.has(r.kind)) return issue('INVALID_COMMAND', path, '非法 evidence kind: ' + String(r.kind));
    if (r.kind === 'narrative_span' && (typeof r.responseId !== 'string' || r.responseId.length === 0 || typeof r.bodyFingerprint !== 'string' || r.bodyFingerprint.length === 0)) {
      return issue('MISSING_EVIDENCE', path, 'narrative_span 证据必须可定位（responseId/bodyFingerprint 非空）');
    }
    if (r.kind === 'system_command' && (typeof r.commandId !== 'string' || r.commandId.length === 0)) {
      return issue('MISSING_EVIDENCE', path, 'system_command 证据必须携带非空 commandId');
    }
    if (r.kind === 'gameplay_receipt' && (typeof r.receiptId !== 'string' || r.receiptId.length === 0)) {
      return issue('MISSING_EVIDENCE', path, 'gameplay_receipt 证据必须携带非空 receiptId');
    }
  }
  return { ok: true };
}

/** 正文 span 校验：offset 整数、0<=start<end<=len、body/text fingerprint 真实（本回合 raw body）。 */
export async function validateNarrativeSpanEvidence(ref: { startOffset?: unknown; endOffset?: unknown; textFingerprint?: unknown; bodyFingerprint?: unknown; responseId?: unknown }, rawBody: string, responseId: string, path: string): Promise<CommandValidationResult> {
  if (typeof ref.startOffset !== 'number' || !Number.isInteger(ref.startOffset) || ref.startOffset < 0) {
    return issue('MISSING_EVIDENCE', path, 'narrative_span startOffset 必须是非负整数');
  }
  if (typeof ref.endOffset !== 'number' || !Number.isInteger(ref.endOffset) || ref.endOffset <= ref.startOffset) {
    return issue('MISSING_EVIDENCE', path, 'narrative_span endOffset 必须是大于 start 的整数');
  }
  if (ref.endOffset > rawBody.length) {
    return issue('MISSING_EVIDENCE', path, 'narrative_span endOffset 越界');
  }
  if (typeof ref.bodyFingerprint !== 'string' || ref.bodyFingerprint !== (await sha256Fingerprint(rawBody))) {
    return issue('MISSING_EVIDENCE', path, 'narrative_span bodyFingerprint 必须等于本回合 raw body 的真实 SHA-256');
  }
  const text = rawBody.slice(ref.startOffset, ref.endOffset);
  if (typeof ref.textFingerprint !== 'string' || ref.textFingerprint !== (await sha256Fingerprint(text))) {
    return issue('MISSING_EVIDENCE', path, 'narrative_span textFingerprint 必须等于 rawBody.slice(start,end) 的真实 SHA-256');
  }
  if (typeof ref.responseId !== 'string' || ref.responseId.length === 0 || ref.responseId !== responseId) {
    return issue('MISSING_EVIDENCE', path, 'narrative_span responseId 必须绑定本回合当前响应身份');
  }
  return { ok: true };
}

/** system_command 证据：commandId/commandFingerprint 必须精确匹配本回合 auxiliary 中一条；提供 unitId 时 scope.unit 必须等于目标单元。 */
export function validateSystemCommandEvidence(ref: { commandId?: unknown; commandFingerprint?: unknown }, auxiliary: TurnCommand['auxiliary'], unitId: string, path: string): CommandValidationResult {
  const match = auxiliary?.validatedSystemCommands?.find((s) => s.commandId === ref.commandId && s.commandFingerprint === ref.commandFingerprint);
  if (!match) return issue('MISSING_EVIDENCE', path, 'system_command 必须匹配本回合已验证系统命令');
  if (unitId && unitId.length > 0 && match.scope?.unit !== unitId) return issue('MISSING_EVIDENCE', path, 'system_command scope.unit 必须等于目标单元');
  return { ok: true };
}

/** gameplay_receipt 证据：receiptId/receiptType 必须精确匹配本回合 auxiliary 一条；提供 unitId 时 eventInstanceId 必须绑定目标单元；同一 receiptId 只绑定一个单元。 */
export function validateGameplayReceiptEvidence(ref: { receiptId?: unknown; receiptType?: unknown }, auxiliary: TurnCommand['auxiliary'], unitId: string, path: string): CommandValidationResult {
  const match = auxiliary?.gameplayReceipts?.find((g) => g.receiptId === ref.receiptId);
  if (!match) return issue('MISSING_EVIDENCE', path, 'gameplay_receipt 必须匹配本回合 auxiliary');
  if (typeof ref.receiptType !== 'string' || ref.receiptType !== match.receiptType) return issue('MISSING_EVIDENCE', path, 'gameplay_receipt receiptType 必须与 auxiliary 精确一致');
  if (unitId && unitId.length > 0 && match.eventInstanceId !== unitId) return issue('MISSING_EVIDENCE', path, 'gameplay_receipt 绑定单元与目标单元不一致');
  const dup = (auxiliary?.gameplayReceipts ?? []).filter((g) => g.receiptId === ref.receiptId);
  if (dup.length !== 1) return issue('INVALID_COMMAND', path, '同一 receiptId 在本回合只能出现一次且只绑定一个单元');
  return { ok: true };
}

export interface EvidenceBindingOptions {
  /** 目标单元（system_command scope.unit / gameplay_receipt eventInstanceId 绑定）；无单元的命令省略 */
  unitId?: string;
  path: string;
  requireNonEmpty?: boolean;
}

/**
 * B：共享命令型证据绑定——每条证据必须引用本回合真实输入。
 * - narrative_span：raw body SHA-256、offset、slice hash、responseId 绑定本回合；
 * - system_command：commandId/commandFingerprint 精确匹配 auxiliary（提供 unitId 时 scope.unit 绑定）；
 * - gameplay_receipt：receiptId/receiptType 精确匹配 auxiliary、eventInstanceId 绑定（提供 unitId 时）、同一 receiptId 只绑定一个单元；
 * - A（G1.3.1.4）：schedule_record/notice_record/broadcast_record/article_version/migration_record/
 *   projection_record/narrative_publication 本阶段无真实 owner——统一拒绝为 MISSING_EVIDENCE（零写入），
 *   不因"形状合法"或"protected 扫描没拦住"而放行。
 */
export async function validateEvidenceRefsForTurn(
  refs: unknown,
  turn: TurnCommand,
  opts: EvidenceBindingOptions,
): Promise<CommandValidationResult> {
  if (!Array.isArray(refs)) return issue('INVALID_COMMAND', opts.path, 'evidenceRefs 必须是数组');
  if (opts.requireNonEmpty && refs.length === 0) return issue('MISSING_EVIDENCE', opts.path, '会改变状态的命令必须有非空证据');
  const rawBody = turn.rawBody ?? '';
  const responseId = turn.responseId ?? '';
  for (const ref of refs) {
    if (ref === null || !isStrictPlainObject(ref)) return issue('INVALID_COMMAND', opts.path, 'evidence ref 必须是普通对象');
    const r = ref as { kind?: unknown };
    if (typeof r.kind !== 'string' || !EVIDENCE_KINDS.has(r.kind)) return issue('INVALID_COMMAND', opts.path, '非法 evidence kind: ' + String(r.kind));
    if (NO_OWNER_EVIDENCE_KINDS.has(r.kind)) {
      return issue('MISSING_EVIDENCE', opts.path, '本阶段尚无 ' + String(r.kind) + ' owner：记录型证据不能作为确认性写入依据');
    }
    if (r.kind === 'narrative_span') {
      const v = await validateNarrativeSpanEvidence(ref as never, rawBody, responseId, opts.path);
      if (!v.ok) return v;
    } else if (r.kind === 'system_command') {
      const v = validateSystemCommandEvidence(ref as never, turn.auxiliary, opts.unitId ?? '', opts.path);
      if (!v.ok) return v;
    } else if (r.kind === 'gameplay_receipt') {
      const v = validateGameplayReceiptEvidence(ref as never, turn.auxiliary, opts.unitId ?? '', opts.path);
      if (!v.ok) return v;
    }
  }
  return { ok: true };
}

/**
 * 语义校验一条 RuntimeCommand（结构闸门由调用方/validateTurnCommand 先执行；async：实例/定义 fingerprint 由当前 state/catalog 内部计算）。
 */
export async function validateRuntimeCommand(
  command: RuntimeCommand,
  ctx: RuntimeCtx,
  opts: { turn?: TurnCommand; idempotency?: { hasRecord: boolean; existingFingerprint?: string; commandFingerprint?: string } } = {},
): Promise<CommandValidationResult> {
  const idempotency = opts.idempotency;
  if (command === null || typeof command !== 'object' || Array.isArray(command)) return issue('INVALID_COMMAND', 'command', '命令必须是普通对象');
  if (typeof command.kind !== 'string' || !COMMAND_KINDS.has(command.kind)) return issue('INVALID_COMMAND', 'command.kind', '未知命令 kind: ' + String(command.kind));

  // 幂等：同 key 不同 payload -> IDEMPOTENCY_KEY_REUSED；同 payload 由事务层返回既有结果。
  if (idempotency && idempotency.hasRecord) {
    if (idempotency.existingFingerprint !== idempotency.commandFingerprint) {
      return issue('IDEMPOTENCY_KEY_REUSED', 'idempotencyKey', '不同 payload 冒用同一 idempotencyKey');
    }
    return { ok: true };
  }

  const requireEvidence = (refs: unknown, path: string): CommandValidationResult =>
    evaluateEvidenceLevel(refs, path, { requireNonEmpty: true });

  const turn = opts.turn;
  const rawBody = turn?.rawBody ?? '';
  const responseId = turn?.responseId ?? '';

  switch (command.kind) {
    case 'advance_time':
      if (!(typeof command.deltaMinutes === 'number' && Number.isFinite(command.deltaMinutes) && command.deltaMinutes >= 0)) {
        return issue('INVALID_COMMAND', 'command.deltaMinutes', 'deltaMinutes 必须是非负有限 number');
      }
      if (command.deltaMinutes === 0) {
        return issue('INVALID_COMMAND', 'command.deltaMinutes', '0 分钟推进不产生成功 revision（明确拒绝）');
      }
      return { ok: true };
    case 'create_event_instance': {
      const p = command.proposal;
      if (!p || typeof p !== 'object' || !isStrictPlainObject(p.definitionRef)) return issue('INVALID_COMMAND', 'command.proposal.definitionRef', 'definitionRef 必须是对象');
      const defId = p.definitionRef.eventDefinitionId;
      if (typeof defId !== 'string' || defId.length === 0) return issue('INVALID_COMMAND', 'command.proposal.definitionRef.eventDefinitionId', '缺少 definition ID');
      const binding = await checkCatalogBinding(ctx);
      if (!binding.ok) return binding;
      const def = ctx.catalog?.eventDefinitions?.find((d) => d.eventDefinitionId === defId);
      if (!def) return issue('CONFLICT', 'command.proposal.definitionRef.eventDefinitionId', 'catalog 中不存在该 event definition: ' + defId);
      const expectedDefFp = await definitionFingerprintOf(def);
      // C（G1.3.1.4）：definition 含非法容器 -> 稳定 INVALID_COMMAND，禁止 throw。
      if (expectedDefFp === null) {
        return issue('INVALID_COMMAND', 'command.proposal.definitionRef.definitionFingerprint', 'definition 含非法 JSON 容器，无法计算 fingerprint');
      }
      if (typeof p.definitionRef.definitionFingerprint !== 'string' || p.definitionRef.definitionFingerprint !== expectedDefFp) {
        return issue('CONFLICT', 'command.proposal.definitionRef.definitionFingerprint', 'definition fingerprint 与 catalog 不一致');
      }
      const parentTarget = p.parentTarget;
      if (parentTarget) {
        if (!isStrictPlainObject(parentTarget)) return issue('INVALID_COMMAND', 'command.proposal.parentTarget', 'parentTarget 必须是对象');
        const fpCheck = await checkInstanceFingerprint(ctx, parentTarget, 'command.proposal.parentTarget');
        if (!fpCheck.ok) return fpCheck;
      }
      const protectedKey = hasProtectedField(p, 'command.proposal');
      if (protectedKey) return issue('INVALID_PROTECTED_FIELD', protectedKey, 'proposal 不得伪造 coordinator 分配字段（含嵌套）');
      return requireEvidence(p.evidenceRefs, 'command.proposal.evidenceRefs');
    }
    case 'resolve_event_instance': {
      const target = command.target;
      if (!isStrictPlainObject(target)) return issue('INVALID_COMMAND', 'command.target', 'target 必须是对象');
      const instance = ctx.state.worldEvents.find((w) => w.eventInstanceId === target.eventInstanceId);
      if (!instance) return issue('CONFLICT', 'command.target.eventInstanceId', '目标事件实例不存在');
      if (TERMINAL_STATES.has(instance.status)) {
        return issue('ALREADY_TERMINAL', 'command.target.eventInstanceId', '终态事件不允许再次结算（场景4）');
      }
      const fpCheck = await checkInstanceFingerprint(ctx, target, 'command.target');
      if (!fpCheck.ok) return fpCheck;
      return requireEvidence(command.evidenceRefs, 'command.evidenceRefs');
    }
    case 'supersede_event_instance': {
      const target = command.target;
      if (!isStrictPlainObject(target)) return issue('INVALID_COMMAND', 'command.target', 'target 必须是对象');
      const instance = ctx.state.worldEvents.find((w) => w.eventInstanceId === target.eventInstanceId);
      if (!instance) return issue('CONFLICT', 'command.target.eventInstanceId', '目标事件实例不存在');
      if (TERMINAL_STATES.has(instance.status)) {
        return issue('ALREADY_TERMINAL', 'command.target.eventInstanceId', '终态事件不允许被普通命令替换');
      }
      const fpCheck = await checkInstanceFingerprint(ctx, target, 'command.target');
      if (!fpCheck.ok) return fpCheck;
      const replacement = command.replacementTarget;
      if (replacement) {
        const repCheck = await checkInstanceFingerprint(ctx, replacement, 'command.replacementTarget');
        if (!repCheck.ok) return repCheck;
      }
      return requireEvidence(command.evidenceRefs, 'command.evidenceRefs');
    }
    case 'append_fact': {
      const p = command.proposal;
      if (!p || typeof p !== 'object' || !isStrictPlainObject(p.eventTarget)) return issue('INVALID_COMMAND', 'command.proposal.eventTarget', 'eventTarget 必须是对象');
      const target = p.eventTarget;
      const instance = ctx.state.worldEvents.find((w) => w.eventInstanceId === target.eventInstanceId);
      if (!instance) return issue('CONFLICT', 'command.proposal.eventTarget.eventInstanceId', '目标事件实例不存在');
      const fpCheck = await checkInstanceFingerprint(ctx, target, 'command.proposal.eventTarget');
      if (!fpCheck.ok) return fpCheck;
      if (p.evidenceLevel === 'confirmed') {
        const r = requireEvidence(p.evidenceRefs, 'command.proposal.evidenceRefs');
        if (!r.ok) return r;
        const kinds = (p.evidenceRefs as Array<{ kind: string }>).map((e) => e.kind);
        if (!kinds.some((k) => k === 'narrative_span' || k === 'system_command' || k === 'gameplay_receipt')) {
          return issue('MISSING_EVIDENCE', 'command.proposal.evidenceLevel', 'confirmed 只能来自 narrative_span/system_command/gameplay_receipt');
        }
      } else if (p.evidenceLevel !== 'supported') {
        return issue('INVALID_COMMAND', 'command.proposal.evidenceLevel', '事实证据等级必须是 confirmed/supported');
      }
      const protectedKey = hasProtectedField(p, 'command.proposal');
      if (protectedKey) return issue('INVALID_PROTECTED_FIELD', protectedKey, 'proposal 不得伪造 coordinator 分配字段（含嵌套）');
      return { ok: true };
    }
    case 'upsert_plan_item': {
      const p = command.proposal;
      if (!p || typeof p !== 'object') return issue('INVALID_COMMAND', 'command.proposal', 'proposal 必须是对象');
      if (!p.unitId && !p.eventDefinitionId) return issue('INVALID_COMMAND', 'command.proposal', 'upsert_plan_item 必须携带 unitId（player）或 eventDefinitionId（world），无法区分时拒绝');
      const protectedKey = hasProtectedField(p, 'command.proposal');
      if (protectedKey) return issue('INVALID_PROTECTED_FIELD', protectedKey, 'proposal 不得伪造 coordinator 分配字段');
      // 引用存在性：plan dependencyFactIds 必须存在。
      for (const depId of p.dependencyFactIds ?? []) {
        if (!ctx.state.factLedger.some((f) => f.factId === depId)) return issue('CONFLICT', 'command.proposal.dependencyFactIds', 'plan 依赖事实不存在: ' + depId);
      }
      return requireEvidence(p.evidenceRefs ?? [], 'command.proposal.evidenceRefs');
    }
    case 'enqueue_convergence': {
      const p = command.proposal;
      if (!p || typeof p !== 'object' || !Array.isArray(p.sourceFactIds)) return issue('INVALID_COMMAND', 'command.proposal', 'proposal 必须是对象且 sourceFactIds 是数组');
      for (const factId of p.sourceFactIds ?? []) {
        if (!ctx.state.factLedger.some((f) => f.factId === factId)) return issue('CONFLICT', 'command.proposal.sourceFactIds', '交汇来源事实不存在: ' + factId);
      }
      for (const planId of p.eligiblePlanItemIds ?? []) {
        if (!ctx.state.playerPlanPool.some((x) => x.planItemId === planId) && !ctx.state.worldPlanPool.some((x) => x.planItemId === planId)) {
          return issue('CONFLICT', 'command.proposal.eligiblePlanItemIds', 'eligible plan 不存在: ' + planId);
        }
      }
      const protectedKey = hasProtectedField(p, 'command.proposal');
      if (protectedKey) return issue('INVALID_PROTECTED_FIELD', protectedKey, 'proposal 不得伪造 coordinator 分配字段');
      return requireEvidence(p.evidenceRefs ?? [], 'command.proposal.evidenceRefs');
    }
    case 'grant_knowledge': {
      const p = command.proposal;
      if (!p || typeof p !== 'object') return issue('INVALID_COMMAND', 'command.proposal', 'proposal 必须是对象');
      if (p.subjectType !== 'npc' && p.subjectType !== 'faction' && p.subjectType !== 'player_character') {
        return issue('INVALID_COMMAND', 'command.proposal.subjectType', 'subjectType 非法');
      }
      const protectedKey = hasProtectedField(p, 'command.proposal');
      if (protectedKey) return issue('INVALID_PROTECTED_FIELD', protectedKey, 'proposal 不得伪造 coordinator 分配字段');
      return requireEvidence(p.evidenceRefs, 'command.proposal.evidenceRefs');
    }
    case 'publish_public_schedule': {
      const p = command.proposal;
      if (!p || typeof p !== 'object') return issue('INVALID_COMMAND', 'command.proposal', 'proposal 必须是对象');
      const protectedKey = hasProtectedField(p, 'command.proposal');
      if (protectedKey) return issue('INVALID_PROTECTED_FIELD', protectedKey, 'proposal 不得伪造 coordinator 分配字段');
      return requireEvidence(p.source ? [p.source] : [], 'command.proposal.source');
    }
    case 'issue_official_notice': {
      const p = command.proposal;
      if (!p || typeof p !== 'object') return issue('INVALID_COMMAND', 'command.proposal', 'proposal 必须是对象');
      const protectedKey = hasProtectedField(p, 'command.proposal');
      if (protectedKey) return issue('INVALID_PROTECTED_FIELD', protectedKey, 'proposal 不得伪造 coordinator 分配字段');
      return requireEvidence(p.source ? [p.source] : [], 'command.proposal.source');
    }
    case 'register_emergent_event_definition':
      // 本阶段无 EmergentEventDefinition 容器 -> 明确拒绝（deferred owner）。
      return issue('INVALID_COMMAND', 'command.kind', 'register_emergent_event_definition 本阶段无 canonical owner（deferred），明确拒绝');
    case 'path_command': {
      if (command.action !== 'enter' && command.action !== 'decline' && command.action !== 'judge') {
        return issue('INVALID_COMMAND', 'command.action', 'path_command action 非法');
      }
      if (command.action === 'decline' || command.action === 'judge') {
        return issue('INVALID_COMMAND', 'command.kind', 'path_command decline/judge 本阶段无 canonical owner（deferred），明确拒绝');
      }
      return { ok: true };
    }
    default:
      return issue('INVALID_COMMAND', 'command.kind', '未知命令 kind');
  }
}

/**
 * 汇总 TurnCommand 校验：先走同一结构闸门（生产 validateRuntimeCommandShape），再执行语义校验。
 * 所有命令入口（runRuntimeTurn / executeTurn / 直接调用方）都必须经过结构闸门。
 */
export async function validateTurnCommand(
  command: RuntimeCommand,
  ctx: RuntimeCtx,
  opts: { turn?: TurnCommand; idempotency?: { hasRecord: boolean; existingFingerprint?: string; commandFingerprint?: string } } = {},
): Promise<CommandValidationResult> {
  const structure = validateCommandStructure(command);
  if (!structure.ok) return structure;
  return validateRuntimeCommand(command, ctx, opts);
}
