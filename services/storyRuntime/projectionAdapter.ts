// G1.3.2.2/G1.3.2.3/G1.3.2.4/G1.3.2.5 projectionAdapter：生产 projection durable owner/adapter（薄存储适配器）。
// - 基于 openRuntimeDb 的 runtimeProjections object store，实现真实 readwrite 事务原语 runTransaction；
// - aggregate、article version、observer cursor、KnowledgeReceipt 的 durable put/get/list；
// - publication/reveal 恢复记录的 durable put/get；
// - P1-1（G1.3.2.3）：adapter 的 store scope 固定为 runtimeProjections——runTransaction/readAll/readOne
//   对任何非 projection store 稳定抛出 INVALID_COMMAND 拒绝；
// - P1-1（G1.3.2.5）：factory 存放在模块私有 WeakMap——adapter 实例无 factory own property，
//   Reflect.ownKeys/Object.keys/属性读取/序列化均不可取得（TypeScript private 不是运行时隔离）；
// - P0-1（G1.3.2.5）：runTransaction 使用受控 keep-alive 请求链——回调 settle 前始终保持一个 pending
//   request，底层事务不会因无活动请求而提前 complete/发布写集；回调最终 throw/reject 时 abort 仍在
//   提交前执行（跨 macrotask 晚失败也零写入）；不把事务拆成读写两阶段，不吞 abort/error；
// - P0-2（G1.3.2.5）：五类 projection（aggregate/article version/cursor/receipt/publication）全部调用冻结
//   validateStoryRuntimeType 完整校验（枚举/union/nested ref/publicScope/sourceRefs 等），wrapper 验证完整
//   字段（aggregate.versionIds/sourceLevelIdempotencyKeys、cursor.revision、receipt/publication.payloadFingerprint），
//   五类记录全部验证物理 key 的 branch/article/version/observer/receipt/publication owner 与 row 一致；
//   任一坏行产生稳定 diagnostics，不进入任何恢复数组，不未捕获 throw；
// - P0-3（G1.3.2.5）：readonlyMode 在 core 不可信、projection entries 读取失败、任一 projection 行损坏/
//   key 不一致、outbox 读取失败或任一 outbox 行非法时为 true；outbox 调用冻结 validateProjectionOutboxItem，
//   只有完整合法且 status 为 pending/leased/retry_wait 的记录进入 pendingOutboxItems；未知 status/少字段/
//   错 branch/错 key 均 diagnostics + 只读；原 bytes 不改写，不从 projection/news/旧字符串反推 core；
// - 关闭数据库并用新的 factory handle 重新打开后仍可读取；
// - 不复制领域模型、不持有完整 core、不接正式入口。
import type { StoryRuntimeTypeName } from './runtimeSchema.generated';
import type { StoryRuntimeState } from '../../models/storyRuntime';
import type { NewsArticleAggregate, NewsArticleVersion, ObserverReadCursor, KnowledgeReceipt, ProjectionOutboxItem } from '../../models/storyRuntimeProjection';
import type { NarrativePublicationRecord } from '../../models/storyRuntimeNarrative';
import type { RuntimeObjectStore, RuntimeRequest, IdbFactoryLike } from './coreRuntimeStore';
import { PROJECTION_STORE, OUTBOX_STORE, openRuntimeDb, readCoreState, outboxKey } from './coreRuntimeStore';
import {
  ARTICLE_VERSION_KEY_PREFIX,
  LEGACY_ARTICLE_VERSION_KEY_PREFIX,
  consumeNewsOutbox,
  writeObserverCursor,
  writeKnowledgeReceipt,
  projectionAggregateKey,
  projectionArticleVersionKey,
  projectionArticleVersionReadKeys,
  projectionArticleVersionKeyMatchesRow,
  isPersistableArticleDomain,
  projectionCursorKey,
  projectionReceiptKey,
  decodeIdComponent,
  hasMalformedPercent,
} from './projectionStore';
import { sha256Fingerprint } from './id';
import { validateStoryRuntimeState, validateStoryRuntimeType } from './runtimeValidator';
import { tryCanonicalJson } from './commandValidator';

export { PROJECTION_STORE };
export { projectionAggregateKey, projectionArticleVersionKey, projectionCursorKey, projectionReceiptKey };

/** 领域契约 schemaVersion（与冻结 fixture StoryRuntimeState.schemaVersion: 3 一致）。 */
export const RUNTIME_SCHEMA_VERSION = 3;

/** 非 projection store 越界访问的稳定拒绝（adapter 只允许 runtimeProjections）。 */
export const PROJECTION_SCOPE_VIOLATION = 'INVALID_COMMAND: projection adapter 只允许访问 runtimeProjections';

/** outbox 非终态（可进入 pendingOutboxItems）；终态 delivered/dead_letter/cancelled 不进入。 */
const OUTBOX_NON_TERMINAL_STATUSES = new Set(['pending', 'leased', 'retry_wait']);

/** keep-alive 请求 key（P0-1：回调期间保持事务活跃，不产生真实投影行）。 */
const TX_KEEP_ALIVE_KEY = '__projection_tx_keepalive__';

/**
 * P1-1（G1.3.2.5）：factory 存放在模块私有 WeakMap——adapter 实例没有任何 factory/DB/transaction
 * own property（Reflect.ownKeys/Object.keys/属性读取/JSON 序列化均不可取得），TypeScript private
 * 不是运行时隔离，这里用 ECMAScript 级别的模块私有容器。
 */
const FACTORY_WEAK = new WeakMap<object, IdbFactoryLike | undefined>();

/** 简化 store 表面（get/put/getAll）。 */
export interface DurableStore {
  get(key: string): Promise<unknown>;
  put(value: unknown, key: string): Promise<void>;
  getAll(): Promise<unknown[]>;
}

/**
 * 生产 projection adapter：runTransaction 打开真实 readwrite 事务，回调内 get/put 原子；
 * 读取/比较/写入在同一事务内（不可分割）。并发由真实 IndexedDB/shim 的事务队列串行化。
 * P1-1（G1.3.2.3）：store scope 固定——任何非 PROJECTION_STORE 的 storeName 稳定拒绝（throw）。
 * P1-1（G1.3.2.5）：factory 经模块私有 WeakMap 保存，实例上不可取得。
 */
export class ProjectionDurableAdapter {
  constructor(factory?: IdbFactoryLike) {
    FACTORY_WEAK.set(this, factory);
  }

  /** P1-1：scope 闸门——非 projection store 稳定抛出 INVALID_COMMAND 拒绝（不发起任何事务）。 */
  assertProjectionStore(storeName: string): void {
    if (storeName !== PROJECTION_STORE) {
      throw new Error(PROJECTION_SCOPE_VIOLATION + ': ' + storeName);
    }
  }

  /**
   * P0-1/P0-2（G1.3.2.4/2.5）：真实 readwrite 事务原语。
   * - oncomplete/onerror/onabort 三态统一收束，Promise 恰好 settle 一次；
   * - 回调 throw/reject 时必须 abort 底层事务，并等待 abort/error 收束后再向调用方抛出回调错误（零写入）；
   * - P0-1（G1.3.2.5）：keep-alive 请求链——回调 settle 前始终保持一个 pending request，
   *   底层事务不会因无活动请求而自动 complete/发布写集；跨 macrotask 的晚失败仍在提交前 abort。
   */
  async runTransaction<T>(storeName: string, fn: (store: DurableStore) => Promise<T>): Promise<T> {
    this.assertProjectionStore(storeName);
    const db = await openRuntimeDb(FACTORY_WEAK.get(this));
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    let txError: Error | null = null;
    let callbackError: unknown = null;
    let callbackSettled = false;
    const settled = new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => { if (!txError) txError = new Error('IndexedDB transaction error'); resolve(); };
      tx.onabort = () => { if (!txError) txError = new Error('IndexedDB transaction aborted'); resolve(); };
    });
    // P0-1：keep-alive 请求链——回调未 settle 前每次请求完成后立即发出下一个（pendingOps 恒 ≥1）。
    let keepAliveRunning = true;
    const pumpKeepAlive = (): void => {
      if (!keepAliveRunning) return;
      const req = store.get(TX_KEEP_ALIVE_KEY);
      req.onsuccess = () => {
        if (callbackSettled) keepAliveRunning = false;
        else pumpKeepAlive();
      };
      // keep-alive 请求 error 会冒泡到事务（onerror/onabort 收束）。
    };
    pumpKeepAlive();
    let result: T | undefined;
    try {
      result = await fn(makeDurableStore(store));
    } catch (error) {
      // P0-2（G1.3.2.4）：回调失败必须 abort 底层事务（丢弃写集），等 abort/error 收束后再返回失败。
      callbackError = error;
      try {
        tx.abort();
      } catch {
        // 事务已结束：继续走 settled 收束。
      }
    } finally {
      callbackSettled = true;
    }
    await settled;
    if (callbackError !== null) throw callbackError;
    if (txError !== null) throw txError;
    return result as T;
  }

  /**
   * P1-3（G1.3.2.4）：窄化只读 entries（物理 key + value 配对，只限 runtimeProjections；readonly 事务）。
   * 供 typed list/recovery 验证物理 key 与 row 一致；不暴露任何其他 store 或通用 DB handle。
   */
  async entries(): Promise<Array<{ key: string; value: unknown }>> {
    return readProjectionEntries(FACTORY_WEAK.get(this));
  }

  /** 读取全部 projection 记录（readonly；重开 DB 后可读）。 */
  async readAll(storeName: string): Promise<unknown[]> {
    this.assertProjectionStore(storeName);
    const db = await openRuntimeDb(FACTORY_WEAK.get(this));
    return new Promise<unknown[]>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve((req.result as unknown[] | undefined) ?? []);
      req.onerror = () => reject(new Error('读取 projection 失败'));
    });
  }

  /** 读取单个 projection 记录（readonly）。 */
  async readOne(storeName: string, key: string): Promise<unknown | null> {
    this.assertProjectionStore(storeName);
    const db = await openRuntimeDb(FACTORY_WEAK.get(this));
    return new Promise<unknown | null>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve((req.result as unknown | undefined) ?? null);
      req.onerror = () => reject(new Error('读取 projection 失败'));
    });
  }

  /**
   * P1-1（G1.3.2.4/2.5）：显式窄能力 recovery source——只暴露 readCore/readOutbox/listProjectionEntries，
   * 不暴露任何通用 IDB factory/DB handle（调用方不能借它访问 pointer/checkpoint/migration）；
   * factory 经模块私有 WeakMap 传入窄 source，不通过闭包字段/返回值/错误对象泄露。
   */
  createRecoverySource(): ProjectionRecoverySource {
    return createIdbRecoverySource(FACTORY_WEAK.get(this));
  }
}

/**
 * P1-3（G1.3.2.5，standards 去重）：私有窄读取——getAllKeys + getAll 配对。
 * adapter.entries() 与 createIdbRecoverySource.listProjectionEntries() 共用同一实现，避免两处漂移。
 * P0-2（G1.3.2.6）：验证 keys/values 数量一致；`undefined`/`null` key 不得字符串化配对（拒绝）。
 */
function readProjectionEntries(factory?: IdbFactoryLike): Promise<Array<{ key: string; value: unknown }>> {
  return openRuntimeDb(factory).then((db) => new Promise<Array<{ key: string; value: unknown }>>((resolve, reject) => {
    const tx = db.transaction(PROJECTION_STORE, 'readonly');
    const store = tx.objectStore(PROJECTION_STORE) as RuntimeObjectStore & { getAllKeys?: () => RuntimeRequest };
    const getAllKeys = store.getAllKeys;
    if (typeof getAllKeys !== 'function') {
      reject(new Error('DB 不支持 getAllKeys（无法验证物理 key）'));
      return;
    }
    const keysReq = getAllKeys.call(store);
    const valuesReq = store.getAll();
    let keys: unknown[] | null = null;
    let values: unknown[] | null = null;
    const tryResolve = (): void => {
      if (keys === null || values === null) return;
      if (keys.length !== values.length) {
        reject(new Error('keys/values 数量不一致（' + keys.length + ' vs ' + values.length + '），拒绝配对'));
        return;
      }
      const out: Array<{ key: string; value: unknown }> = [];
      for (let i = 0; i < values.length; i += 1) {
        const k = keys[i];
        if (k === undefined || k === null) {
          reject(new Error('projection 存在 undefined/null 物理 key（拒绝配对）'));
          return;
        }
        out.push({ key: String(k), value: values[i] });
      }
      resolve(out);
    };
    keysReq.onsuccess = () => { keys = (keysReq.result as unknown[] | undefined) ?? []; tryResolve(); };
    keysReq.onerror = () => reject(new Error('读取 projection keys 失败'));
    valuesReq.onsuccess = () => { values = (valuesReq.result as unknown[] | undefined) ?? []; tryResolve(); };
    valuesReq.onerror = () => reject(new Error('读取 projection 失败'));
  }));
}

/**
 * P0-1（G1.3.2.6）：outbox 窄读取——OUTBOX_STORE 的物理 key + value 配对（同一 readonly 事务
 * getAllKeys + getAll；keys/values 数量一致；undefined/null key 拒绝）。
 * 真实物理 key 保留（不按 row 字段重建），recovery 用它验证 physical key === outboxKey(branch, outboxId)。
 */
function readOutboxEntriesImpl(factory?: IdbFactoryLike): Promise<Array<{ key: string; value: unknown }>> {
  return openRuntimeDb(factory).then((db) => new Promise<Array<{ key: string; value: unknown }>>((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const store = tx.objectStore(OUTBOX_STORE) as RuntimeObjectStore & { getAllKeys?: () => RuntimeRequest };
    const getAllKeys = store.getAllKeys;
    if (typeof getAllKeys !== 'function') {
      reject(new Error('DB 不支持 getAllKeys（无法验证 outbox 物理 key）'));
      return;
    }
    const keysReq = getAllKeys.call(store);
    const valuesReq = store.getAll();
    let keys: unknown[] | null = null;
    let values: unknown[] | null = null;
    const tryResolve = (): void => {
      if (keys === null || values === null) return;
      if (keys.length !== values.length) {
        reject(new Error('outbox keys/values 数量不一致（' + keys.length + ' vs ' + values.length + '），拒绝配对'));
        return;
      }
      const out: Array<{ key: string; value: unknown }> = [];
      for (let i = 0; i < values.length; i += 1) {
        const k = keys[i];
        if (k === undefined || k === null) {
          reject(new Error('outbox 存在 undefined/null 物理 key（拒绝配对）'));
          return;
        }
        out.push({ key: String(k), value: values[i] });
      }
      resolve(out);
    };
    keysReq.onsuccess = () => { keys = (keysReq.result as unknown[] | undefined) ?? []; tryResolve(); };
    keysReq.onerror = () => reject(new Error('读取 outbox keys 失败'));
    valuesReq.onsuccess = () => { values = (valuesReq.result as unknown[] | undefined) ?? []; tryResolve(); };
    valuesReq.onerror = () => reject(new Error('读取 outbox 失败'));
  }));
}

function makeDurableStore(store: RuntimeObjectStore): DurableStore {
  return {
    get: (key) => new Promise((res, rej) => {
      const req = store.get(key);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(new Error('get failed'));
    }),
    put: (value, key) => new Promise((res, rej) => {
      const req = store.put(value, key);
      req.onsuccess = () => res();
      req.onerror = () => rej(new Error('put failed'));
    }),
    getAll: () => new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res((req.result as unknown[] | undefined) ?? []);
      req.onerror = () => rej(new Error('getAll failed'));
    }),
  };
}

// ── durable 写入口（薄封装：复用 projectionStore 生产函数 + prefixed key）──

/** durable 写文章聚合（含版本不可变检查；同源同 payload 幂等；branch 归属闸门在生产函数内）。 */
export function durablePutArticle(
  adapter: ProjectionDurableAdapter,
  item: ProjectionOutboxItem,
  aggregate: NewsArticleAggregate,
  version: NewsArticleVersion,
): ReturnType<typeof consumeNewsOutbox> {
  return consumeNewsOutbox(adapter, item, aggregate, version);
}

/** durable 写阅读游标（CAS）。 */
export function durablePutCursor(
  adapter: ProjectionDurableAdapter,
  cursor: ObserverReadCursor,
  expectedRevision: number,
): ReturnType<typeof writeObserverCursor> {
  return writeObserverCursor(adapter, cursor, expectedRevision);
}

/** durable 写 KnowledgeReceipt（payload fingerprint 幂等）。 */
export function durablePutReceipt(
  adapter: ProjectionDurableAdapter,
  receipt: KnowledgeReceipt,
): ReturnType<typeof writeKnowledgeReceipt> {
  return writeKnowledgeReceipt(adapter, receipt);
}

export type DurablePublicationResult =
  | { ok: true; key: string }
  | { ok: false; code: 'ALREADY_APPLIED' | 'IDEMPOTENCY_KEY_REUSED' | 'CONFLICT' | 'INVALID_COMMAND'; message: string };

/** durable 写 publication/reveal 恢复记录（同 publicationId 同 payload 幂等，不同 payload 冲突）。 */
export async function durablePutPublication(
  adapter: ProjectionDurableAdapter,
  publication: NarrativePublicationRecord,
): Promise<DurablePublicationResult> {
  const key = PROJECTION_STORE_PUBLICATION_KEY(publication.runtimeBranchId, publication.publicationId);
  const payloadFingerprint = await sha256Fingerprint(publication);
  return adapter.runTransaction<DurablePublicationResult>(PROJECTION_STORE, async (store) => {
    const existing = (await store.get(key)) as { publication: NarrativePublicationRecord; payloadFingerprint: string } | null;
    if (existing) {
      if (existing.payloadFingerprint === payloadFingerprint) {
        return { ok: false, code: 'ALREADY_APPLIED', message: 'publication 已存在（同 payload）' };
      }
      return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED', message: 'publication 同 ID 不同 payload' };
    }
    await store.put({ publication, payloadFingerprint }, key);
    return { ok: true, key };
  });
}

function PROJECTION_STORE_PUBLICATION_KEY(runtimeBranchId: string, publicationId: string): string {
  return 'projection:publication:' + runtimeBranchId + ':' + publicationId;
}

/**
 * P0-3（G1.3.2.6）：读取 publication/reveal 记录——验证完整 wrapper（{publication, payloadFingerprint}）、
 * payloadFingerprint 非空且与 inner payload 的 sha256Fingerprint 一致、请求的 branch/publicationId 与 row
 * 完全一致（物理 key 由派生 key 读取，双向 owner 校验）；缺包装/错 owner/fingerprint 不匹配均返回稳定
 * typed 失败（不返回错误 owner 的 publication，不 throw）。
 */
export async function durableGetPublication(
  adapter: ProjectionDurableAdapter,
  runtimeBranchId: string,
  publicationId: string,
): Promise<DurableRowResult<NarrativePublicationRecord>> {
  const key = PROJECTION_STORE_PUBLICATION_KEY(runtimeBranchId, publicationId);
  let row: unknown;
  try {
    row = await adapter.readOne(PROJECTION_STORE, key);
  } catch (error) {
    return { ok: false, code: 'DB_UNAVAILABLE', message: '读取 projection 失败: ' + (error instanceof Error ? error.message : String(error)) };
  }
  if (row === null) return { ok: false, code: 'MISSING', message: 'publication 不存在: ' + key };
  const wrapper = row as { publication?: unknown; payloadFingerprint?: unknown } | null;
  if (wrapper === null || typeof wrapper !== 'object' || wrapper.publication === null || typeof wrapper.publication !== 'object') {
    return { ok: false, code: 'INVALID_ROW', message: 'publication 缺完整包装行（{publication, payloadFingerprint}）: ' + key };
  }
  const validated = validateRow<NarrativePublicationRecord>('NarrativePublicationRecord', wrapper.publication);
  if (!validated.ok) {
    return { ok: false, code: 'INVALID_ROW', message: validated.message + '（' + key + '）' };
  }
  const fpCheck = await validatePayloadFingerprintWrapper(wrapper.payloadFingerprint, wrapper.publication, 'publication');
  if (!fpCheck.ok) {
    return { ok: false, code: 'INVALID_ROW', message: fpCheck.message + '（' + key + '）' };
  }
  if (validated.value.runtimeBranchId !== runtimeBranchId || validated.value.publicationId !== publicationId) {
    return { ok: false, code: 'KEY_MISMATCH', message: 'publication row 与请求 key 不一致（错 owner/错 publicationId）: ' + key };
  }
  return { ok: true, value: validated.value };
}

// ── P0-2（G1.3.2.5）：冻结 validator 行校验与物理 key 验证 ──

/** typed row 读取结果：损坏/错位/缺失/冲突行返回稳定只读结果，不产生未捕获 throw。 */
export type DurableRowResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: 'MISSING' | 'INVALID_ROW' | 'KEY_MISMATCH' | 'CONFLICT' | 'DB_UNAVAILABLE'; message: string };

/** 冻结 validateStoryRuntimeType 包装（P0-2：五类 projection 全部复用冻结 validator，禁止手写 duck typing 作为信任结论）。 */
export function validateRow<T>(typeName: StoryRuntimeTypeName, value: unknown): { ok: true; value: T } | { ok: false; code: string; message: string } {
  const v = validateStoryRuntimeType(typeName, value);
  if (v.ok) return { ok: true, value: v.value as T };
  const codes = v.issues.slice(0, 3).map((issue) => issue.code).join(', ');
  return { ok: false, code: 'INVALID_ROW', message: typeName + ' 冻结 schema 校验失败: ' + codes };
}

/** typed list 读取结果：坏行跳过并给出诊断（不 throw）。 */
export type DurableListResult<T> =
  | { ok: true; values: T[]; skipped: string[] }
  | { ok: false; code: 'DB_UNAVAILABLE'; message: string };

/**
 * P0-2（G1.3.2.11）：统一 article candidate classifier——list/get/recovery/readonly scan 复用同一规则。
 * - 只有完整 row 冻结校验 + 可持久化输入域通过后，才用 exact current/encoded/raw key 确认 owner；
 * - legacy schema-invalid 行无法完整验证 owner -> unknown（owner=null），不能用单个 string 字段定向报警；
 * - current namespace 坏行 owner 由 key 精确解析；
 * - other branch 的合法行（key/row 都一致）-> other_branch（不污染 target）；
 * - not_article：非 article namespace（其他四类行，不误报）。
 */
type ArticleCandidate =
  | { kind: 'ok'; key: string; row: NewsArticleVersion }
  | { kind: 'other_branch' }
  | { kind: 'bad'; key: string; owner: string | null; code: 'INVALID_ROW' | 'KEY_MISMATCH'; message: string }
  | { kind: 'not_article' };

type ArticleOwnerEnvelope = {
  runtimeBranchId: string;
  articleId: string;
  articleVersion: number;
};

/**
 * A schema-invalid legacy row may still carry enough primitive owner fields to
 * disambiguate a raw key from an encoded key with the same physical string.
 * Read only that minimal envelope; any getter/proxy failure leaves ownership
 * unknown instead of trusting an ambiguous legacy key parse.
 */
function readArticleOwnerEnvelope(value: unknown): ArticleOwnerEnvelope | null {
  if (value === null || typeof value !== 'object') return null;
  try {
    const row = value as Partial<ArticleOwnerEnvelope>;
    if (!isPersistableArticleDomain(row.runtimeBranchId, row.articleId, row.articleVersion)) return null;
    return {
      runtimeBranchId: row.runtimeBranchId as string,
      articleId: row.articleId as string,
      articleVersion: row.articleVersion as number,
    };
  } catch {
    return null;
  }
}

function invalidArticleOwner(key: string, parsed: Exclude<ArticleKeyParse, { kind: 'not_article' }>, value: unknown): string | null {
  const envelope = readArticleOwnerEnvelope(value);
  if (envelope && projectionArticleVersionReadKeys(
    envelope.runtimeBranchId,
    envelope.articleId,
    envelope.articleVersion,
  ).includes(key)) {
    return envelope.runtimeBranchId;
  }
  // The current namespace is disjoint and encoded, so its parsed branch is
  // authoritative. Legacy raw/encoded keys can collide and remain unknown
  // without a complete exact-matching envelope.
  return parsed.namespace === 'current' ? parsed.branch ?? null : null;
}

async function classifyArticleEntry(key: string, value: unknown, targetBranch: string): Promise<ArticleCandidate> {
  const parsed = parseArticleKey(key);
  if (parsed.kind === 'not_article') return { kind: 'not_article' };
  // 1) 完整 row 冻结校验——只有通过后才可能确认 owner。
  const validated = validateRow<NewsArticleVersion>('NewsArticleVersion', value);
  if (!validated.ok) {
    const owner = invalidArticleOwner(key, parsed, value);
    return { kind: 'bad', key, owner, code: 'INVALID_ROW', message: validated.message };
  }
  const row = validated.value;
  // 2) P0-1：可持久化共同输入域（非空 owner + 非负安全整数 version）。
  if (!isPersistableArticleDomain(row.runtimeBranchId, row.articleId, row.articleVersion)) {
    const owner = parsed.branch ?? null;
    return { kind: 'bad', key, owner, code: 'INVALID_ROW', message: 'article row 不满足可持久化输入域（非空 owner/非负安全整数 version）' };
  }
  // 3) P0-2：exact current/encoded/raw key 确认 owner（双向）；失败 -> KEY_MISMATCH（owner 按 key 解析）。
  if (!projectionArticleVersionKeyMatchesRow(key, row)) {
    const owner = parsed.branch ?? null;
    return { kind: 'bad', key, owner, code: 'KEY_MISMATCH', message: '物理 key owner 不一致（与 row 双向校验）' };
  }
  // 4) 与 target branch 关系：key 与 row 都一致的其他 branch -> 无关跳过。
  if (row.runtimeBranchId !== targetBranch) return { kind: 'other_branch' };
  return { kind: 'ok', key, row };
}

/**
 * P0-3（G1.3.2.11）：按 (runtimeBranchId, articleId, articleVersion) 聚合三种物理表示——
 * 多份合法 row canonical payload 完全相同可确定性去重；payload 不同返回冲突诊断。
 */
function dedupeLogicalArticleVersions(
  collected: Array<{ key: string; row: NewsArticleVersion }>,
): { values: NewsArticleVersion[]; conflicts: string[] } {
  const byLogical = new Map<string, Array<{ key: string; row: NewsArticleVersion }>>();
  for (const entry of collected) {
    const logical = entry.row.runtimeBranchId + '\0' + entry.row.articleId + '\0' + entry.row.articleVersion;
    const list = byLogical.get(logical) ?? [];
    list.push(entry);
    byLogical.set(logical, list);
  }
  const values: NewsArticleVersion[] = [];
  const conflicts: string[] = [];
  for (const [logical, list] of byLogical) {
    if (list.length === 1) {
      values.push(list[0].row);
      continue;
    }
    const firstCanonical = tryCanonicalJson(list[0].row);
    let allSame = true;
    for (const e of list) {
      if (tryCanonicalJson(e.row) !== firstCanonical) { allSame = false; break; }
    }
    if (allSame) {
      values.push(list[0].row); // 同 payload：确定性去重（保留首份）。
    } else {
      conflicts.push('同一逻辑版本（' + logical + '）存在 ' + list.length + ' 份不同 payload 的物理表示（' + list.map((e) => e.key).join(', ') + '）');
    }
  }
  return { values, conflicts };
}

/**
 * P0-2/P0-3（G1.3.2.11）：读取单个文章版本（跨 current/encoded/raw 三物理表示）。
 * - 只有完整 row 冻结校验 + 可持久化输入域通过 + exact key owner 确认后才可满足请求；
 * - current target key 一旦存在 invalid row / owner mismatch / payload 冲突，稳定 typed failure，
 *   不得回退 legacy 后回答成功；
 * - 同一逻辑版本多份不同 payload -> CONFLICT（不静默选择）；同 payload 去重。
 */
export async function durableGetArticleVersion(
  adapter: ProjectionDurableAdapter,
  runtimeBranchId: string,
  articleId: string,
  articleVersion: number,
): Promise<DurableRowResult<NewsArticleVersion>> {
  const keys = projectionArticleVersionReadKeys(runtimeBranchId, articleId, articleVersion);
  const matches: Array<{ key: string; row: NewsArticleVersion }> = [];
  const currentBad: Array<{ key: string; code: 'INVALID_ROW' | 'KEY_MISMATCH'; message: string }> = [];
  const legacyBad: Array<{ key: string; message: string }> = [];
  for (const key of keys) {
    let row: unknown;
    try {
      row = await adapter.readOne(PROJECTION_STORE, key);
    } catch (error) {
      return { ok: false, code: 'DB_UNAVAILABLE', message: '读取 projection 失败: ' + (error instanceof Error ? error.message : String(error)) };
    }
    if (row === null) continue;
    const candidate = await classifyArticleEntry(key, row, runtimeBranchId);
    if (candidate.kind === 'ok') {
      if (candidate.row.articleId === articleId && candidate.row.articleVersion === articleVersion) {
        matches.push({ key, row: candidate.row });
      }
      continue;
    }
    if (candidate.kind === 'bad') {
      if (candidate.owner !== null && candidate.owner !== runtimeBranchId) continue;
      if (key.startsWith(ARTICLE_VERSION_KEY_PREFIX)) {
        currentBad.push({ key, code: candidate.code, message: candidate.message });
      } else {
        legacyBad.push({ key, message: candidate.message });
      }
      continue;
    }
    // other_branch / not_article：跳过（不阻止）。
  }
  // P0-2：current target key 的坏行（invalid/owner mismatch）-> 稳定 typed failure，不 fallback legacy。
  if (currentBad.length > 0) {
    const first = currentBad[0];
    return { ok: false, code: first.code, message: first.message + '（current key: ' + first.key + '）' };
  }
  // P0-3：逻辑版本唯一——多份不同 payload -> CONFLICT；同 payload 去重。
  if (matches.length > 0) {
    const deduped = dedupeLogicalArticleVersions(matches);
    if (deduped.conflicts.length > 0) {
      return { ok: false, code: 'CONFLICT', message: deduped.conflicts[0] };
    }
    return { ok: true, value: deduped.values[0] };
  }
  // 无合法匹配：坏行可见（target/unknown），否则 MISSING。
  if (legacyBad.length > 0) {
    return { ok: false, code: 'INVALID_ROW', message: legacyBad[0].message + '（legacy key: ' + legacyBad[0].key + '，owner unknown 可见）' };
  }
  return { ok: false, code: 'MISSING', message: 'article version 不存在: ' + keys[0] };
}

/**
 * Parse current and legacy article namespaces for diagnostic ownership. A
 * legacy key that is ambiguous by delimiters can still become trusted after
 * its row passes the frozen validator and matches an exact legacy candidate.
 */
type ArticleKeyParse =
  | { kind: 'not_article' }
  | { kind: 'malformed'; namespace: 'current' | 'legacy'; branch: string | null }
  | { kind: 'valid'; namespace: 'current' | 'legacy'; branch: string; articleId: string; version: number };

function parseEncodedArticleKey(
  key: string,
  prefix: string,
  namespace: 'current' | 'legacy',
): Exclude<ArticleKeyParse, { kind: 'not_article' }> {
  const rest = key.slice(prefix.length);
  const parts = rest.split(':');
  if (parts.length === 3) {
    const [encBranch, encArticle, versionText] = parts;
    const version = Number(versionText);
    if (Number.isSafeInteger(version) && version >= 0
      && encBranch.length > 0 && encArticle.length > 0
      && !hasMalformedPercent(encBranch) && !hasMalformedPercent(encArticle)) {
      return {
        kind: 'valid',
        namespace,
        branch: decodeIdComponent(encBranch),
        articleId: decodeIdComponent(encArticle),
        version,
      };
    }
    // 3 段但非法（version 非法/缺段/坏转义）：branch 段可解码时尽力提取（缺 branch -> null）。
    const branch = (encBranch.length > 0 && !hasMalformedPercent(encBranch)) ? decodeIdComponent(encBranch) : null;
    return { kind: 'malformed', namespace, branch };
  }
  if (parts.length >= 1 && parts.length <= 2) {
    // 1 段（仅剩 branch）或 2 段（缺 version）：branch 段可解码时提取（"仅剩其他 branch"不污染当前 branch）。
    const first = parts[0];
    const branch = (first !== undefined && first.length > 0 && !hasMalformedPercent(first)) ? decodeIdComponent(first) : null;
    return { kind: 'malformed', namespace, branch };
  }
  return { kind: 'malformed', namespace, branch: null };
}

function parseArticleKey(key: string): ArticleKeyParse {
  if (key.startsWith(ARTICLE_VERSION_KEY_PREFIX)) {
    return parseEncodedArticleKey(key, ARTICLE_VERSION_KEY_PREFIX, 'current');
  }
  if (key.startsWith(LEGACY_ARTICLE_VERSION_KEY_PREFIX)) {
    return parseEncodedArticleKey(key, LEGACY_ARTICLE_VERSION_KEY_PREFIX, 'legacy');
  }
  return { kind: 'not_article' };
}

function invalidRowDiagnosticOwner(parsed: Exclude<ArticleKeyParse, { kind: 'not_article' }>, rowTrustedBranch: string | null): string | null {
  if (parsed.namespace === 'current') return parsed.branch ?? rowTrustedBranch;
  return rowTrustedBranch ?? parsed.branch;
}

function mismatchedRowDiagnosticOwner(parsed: Exclude<ArticleKeyParse, { kind: 'not_article' }>, rowBranch: string): string {
  return parsed.branch ?? rowBranch;
}

/**
 * P1-3（G1.3.2.4）/P0-2/P0-3（G1.3.2.11）：列出指定 branch 的全部文章版本（重开 DB 后仍可读）。
 * 统一 candidate classifier（完整 row 校验 + 可持久化输入域 + exact key owner 双向确认）；
 * target/unknown 坏行进 skipped（不静默空列表）；其他 branch 的 invalid current/legacy row 不污染；
 * 同一逻辑版本多份不同 payload -> skipped 冲突诊断（不返回两份）；同 payload 去重。
 */
export async function durableListArticleVersions(
  adapter: ProjectionDurableAdapter,
  runtimeBranchId: string,
): Promise<DurableListResult<NewsArticleVersion>> {
  let entriesList: Array<{ key: string; value: unknown }>;
  try {
    entriesList = await adapter.entries();
  } catch (error) {
    return { ok: false, code: 'DB_UNAVAILABLE', message: '读取 projection entries 失败: ' + (error instanceof Error ? error.message : String(error)) };
  }
  const skipped: string[] = [];
  const collected: Array<{ key: string; row: NewsArticleVersion }> = [];
  for (const { key, value } of entriesList) {
    const candidate = await classifyArticleEntry(key, value, runtimeBranchId);
    if (candidate.kind === 'not_article') {
      // 非 article namespace：其他四类合法行不误报；article 形状行位于非 article 物理 key（错柜）-> skipped。
      if (isArticleVersionRowShape(value)) {
        skipped.push(key + ': article 形状行位于非 article 物理 key（错柜）');
      }
      continue;
    }
    if (candidate.kind === 'other_branch') continue; // key 与 row 都一致的其他 branch -> 无关跳过
    if (candidate.kind === 'bad') {
      // P0-2：target/unknown 坏行可见；其他 branch 的 invalid current row（owner 精确）不污染。
      if (candidate.owner === null || candidate.owner === runtimeBranchId) {
        skipped.push(key + ': ' + candidate.message + '（owner=' + (candidate.owner ?? 'unknown') + '）');
      }
      continue;
    }
    collected.push({ key, row: candidate.row });
  }
  // P0-3：逻辑版本唯一（同 payload 去重；不同 payload 冲突进 skipped）。
  const deduped = dedupeLogicalArticleVersions(collected);
  for (const conflict of deduped.conflicts) skipped.push(conflict);
  return { ok: true, values: deduped.values, skipped };
}

// ── 行形状守卫（P0-1/P1-3/P0-2：单层 durable row 形状；先查包装行，再查裸版本行）──
// 守卫只负责"是哪一类行"（wrapper 字段齐全性由冻结 validator 完整校验），
// 双层错误包装/缺字段行不匹配任何守卫，落入 recovery 的"未知/损坏"只读诊断（不静默跳过）。

function isAggregateRowShape(value: unknown): boolean {
  const r = value as { aggregate?: unknown; versionIds?: unknown; sourceLevelIdempotencyKeys?: unknown } | null;
  if (r === null || typeof r !== 'object') return false;
  return r.aggregate !== null && typeof r.aggregate === 'object'
    && Array.isArray(r.versionIds)
    && Array.isArray(r.sourceLevelIdempotencyKeys);
}
function isCursorRowShape(value: unknown): boolean {
  const r = value as { cursor?: unknown; revision?: unknown } | null;
  if (r === null || typeof r !== 'object') return false;
  // revision 校验在分支内（isNonNegativeSafeInteger）——缺失/NaN/负数/非整数都产生"revision"诊断。
  return r.cursor !== null && typeof r.cursor === 'object';
}
function isReceiptRowShape(value: unknown): boolean {
  const r = value as { receipt?: unknown; payloadFingerprint?: unknown } | null;
  if (r === null || typeof r !== 'object') return false;
  // payloadFingerprint 校验在分支内（validatePayloadFingerprintWrapper）——缺失/空/不一致都产生精确诊断。
  return r.receipt !== null && typeof r.receipt === 'object';
}
function isPublicationRowShape(value: unknown): boolean {
  const r = value as { publication?: unknown; payloadFingerprint?: unknown } | null;
  if (r === null || typeof r !== 'object') return false;
  // payloadFingerprint 校验在分支内（validatePayloadFingerprintWrapper）——缺失/空/不一致都产生精确诊断。
  return r.publication !== null && typeof r.publication === 'object';
}
function isArticleVersionRowShape(value: unknown): boolean {
  const r = value as { articleId?: unknown; articleVersion?: unknown; aggregate?: unknown; cursor?: unknown; receipt?: unknown; publication?: unknown } | null;
  if (r === null || typeof r !== 'object') return false;
  if (r.aggregate !== undefined || r.cursor !== undefined || r.receipt !== undefined || r.publication !== undefined) return false;
  return typeof r.articleId === 'string' && typeof r.articleVersion === 'number';
}

/** P0-2/P0-3（G1.3.2.5/2.6）：五类物理 key owner 验证（branch/article/version/observer/receipt/publication 与 row 完全一致）。 */
function aggregateKeyMatches(key: string, row: NewsArticleAggregate, aggregateKey: string): boolean {
  return key === 'projection:aggregate:' + row.runtimeBranchId + ':' + aggregateKey;
}
function articleVersionKeyMatches(key: string, row: NewsArticleVersion): boolean {
  return projectionArticleVersionKeyMatchesRow(key, row);
}
function cursorKeyMatches(key: string, row: ObserverReadCursor): boolean {
  return key === projectionCursorKey(row.runtimeBranchId, row.observerId);
}
function receiptKeyMatches(key: string, row: KnowledgeReceipt): boolean {
  return key === projectionReceiptKey(row.runtimeBranchId, row.receiptId);
}
function publicationKeyMatches(key: string, row: NarrativePublicationRecord): boolean {
  return key === PROJECTION_STORE_PUBLICATION_KEY(row.runtimeBranchId, row.publicationId);
}

/** P0-3（G1.3.2.6）：非负安全整数（cursor revision 等）。 */
function isNonNegativeSafeInteger(v: unknown): boolean {
  return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
}

/**
 * P0-3（G1.3.2.6）/P0-2（G1.3.2.7）：aggregate wrapper 完整性——aggregateKey 非空、
 * versionIds 与 inner aggregate 逐项相等（**不用 JSON.stringify 比较**，BigInt/Symbol/对象等
 * 不可序列化成员不得让校验器自身抛错）、sourceLevelIdempotencyKeys 每项 key/payloadFingerprint 非空。
 * 对任意持久化坏值保持全函数（稳定返回 { ok:false }，不 throw/hang）。
 */
function validateAggregateWrapper(
  wrapper: { aggregateKey?: unknown; versionIds?: unknown; sourceLevelIdempotencyKeys?: unknown },
  inner: NewsArticleAggregate,
): { ok: true } | { ok: false; message: string } {
  if (typeof wrapper.aggregateKey !== 'string' || wrapper.aggregateKey.length === 0) {
    return { ok: false, message: 'aggregate wrapper 缺少非空 aggregateKey' };
  }
  if (!Array.isArray(wrapper.versionIds) || !Array.isArray(inner.versionIds)) {
    return { ok: false, message: 'aggregate wrapper versionIds 必须是数组' };
  }
  if (wrapper.versionIds.length !== inner.versionIds.length) {
    return { ok: false, message: 'aggregate wrapper versionIds 与 inner aggregate 不一致（长度不同）' };
  }
  for (let i = 0; i < wrapper.versionIds.length; i += 1) {
    const a = wrapper.versionIds[i];
    const b = inner.versionIds[i];
    if (typeof a !== 'string' || a.length === 0 || a !== b) {
      return { ok: false, message: 'aggregate wrapper versionIds[' + i + '] 非法或与 inner aggregate 不一致' };
    }
  }
  if (!Array.isArray(wrapper.sourceLevelIdempotencyKeys)) {
    return { ok: false, message: 'aggregate wrapper sourceLevelIdempotencyKeys 缺失' };
  }
  for (let i = 0; i < wrapper.sourceLevelIdempotencyKeys.length; i += 1) {
    const e = wrapper.sourceLevelIdempotencyKeys[i] as { key?: unknown; payloadFingerprint?: unknown } | null;
    if (e === null || typeof e !== 'object'
      || typeof e.key !== 'string' || e.key.length === 0
      || typeof e.payloadFingerprint !== 'string' || e.payloadFingerprint.length === 0) {
      return { ok: false, message: 'aggregate wrapper sourceLevelIdempotencyKeys[' + i + '] 非法（key/payloadFingerprint 必须非空字符串）' };
    }
  }
  return { ok: true };
}

/**
 * P0-3（G1.3.2.6）：receipt/publication wrapper 的 payloadFingerprint 非空且与 inner payload 的
 * sha256Fingerprint 完全一致（异步计算，逐行 await）。
 */
async function validatePayloadFingerprintWrapper(
  fingerprint: unknown,
  innerPayload: unknown,
  label: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof fingerprint !== 'string' || fingerprint.length === 0) {
    return { ok: false, message: label + ' wrapper 缺少非空 payloadFingerprint' };
  }
  let actual: string;
  try {
    actual = await sha256Fingerprint(innerPayload);
  } catch {
    return { ok: false, message: label + ' wrapper fingerprint 计算失败（强制只读）' };
  }
  if (actual !== fingerprint) {
    return { ok: false, message: label + ' wrapper payloadFingerprint 与 inner payload 不一致' };
  }
  return { ok: true };
}

/**
 * 列出指定 branch 的全部 projection 记录（重开 DB 后仍可读）。
 * P1-1（G1.3.2.3）：覆盖五类行，全部按 runtimeBranchId 过滤。
 * P0-2/P0-3（G1.3.2.5/2.6）：五类行冻结 validator + wrapper 完整性 + 物理 key owner 双向校验；
 * 目标相关坏行记录 skipped（不得静默变成空列表），不 throw。
 */
export async function durableListProjections(
  adapter: ProjectionDurableAdapter,
  runtimeBranchId: string,
): Promise<DurableListResult<unknown>> {
  let entriesList: Array<{ key: string; value: unknown }>;
  try {
    entriesList = await adapter.entries();
  } catch (error) {
    return { ok: false, code: 'DB_UNAVAILABLE', message: '读取 projection entries 失败: ' + (error instanceof Error ? error.message : String(error)) };
  }
  const values: unknown[] = [];
  const skipped: string[] = [];
  for (const { key, value } of entriesList) {
    if (isAggregateRowShape(value)) {
      const wrapper = value as { aggregate: unknown; aggregateKey?: unknown; versionIds?: unknown; sourceLevelIdempotencyKeys?: unknown };
      const v = validateRow<NewsArticleAggregate>('NewsArticleAggregate', wrapper.aggregate);
      if (!v.ok) { skipped.push(key + ': ' + v.message); continue; }
      const wrapperCheck = validateAggregateWrapper(wrapper, v.value);
      if (!wrapperCheck.ok) { skipped.push(key + ': ' + wrapperCheck.message); continue; }
      if (!aggregateKeyMatches(key, v.value, wrapper.aggregateKey as string)) {
        skipped.push(key + ': aggregate 物理 key owner 不一致');
        continue;
      }
      if (v.value.runtimeBranchId !== runtimeBranchId) continue;
      values.push(value);
      continue;
    }
    if (isCursorRowShape(value)) {
      const wrapper = value as { cursor: unknown; revision?: unknown };
      const v = validateRow<ObserverReadCursor>('ObserverReadCursor', wrapper.cursor);
      if (!v.ok) { skipped.push(key + ': ' + v.message); continue; }
      if (!isNonNegativeSafeInteger(wrapper.revision)) { skipped.push(key + ': cursor revision 必须是非负安全整数'); continue; }
      if (!cursorKeyMatches(key, v.value)) { skipped.push(key + ': cursor 物理 key owner 不一致'); continue; }
      if (v.value.runtimeBranchId !== runtimeBranchId) continue;
      values.push(value);
      continue;
    }
    if (isReceiptRowShape(value)) {
      const wrapper = value as { receipt: unknown; payloadFingerprint?: unknown };
      const v = validateRow<KnowledgeReceipt>('KnowledgeReceipt', wrapper.receipt);
      if (!v.ok) { skipped.push(key + ': ' + v.message); continue; }
      const wrapperCheck = await validatePayloadFingerprintWrapper(wrapper.payloadFingerprint, wrapper.receipt, 'receipt');
      if (!wrapperCheck.ok) { skipped.push(key + ': ' + wrapperCheck.message); continue; }
      if (!receiptKeyMatches(key, v.value)) { skipped.push(key + ': receipt 物理 key owner 不一致'); continue; }
      if (v.value.runtimeBranchId !== runtimeBranchId) continue;
      values.push(value);
      continue;
    }
    if (isPublicationRowShape(value)) {
      const wrapper = value as { publication: unknown; payloadFingerprint?: unknown };
      const v = validateRow<NarrativePublicationRecord>('NarrativePublicationRecord', wrapper.publication);
      if (!v.ok) { skipped.push(key + ': ' + v.message); continue; }
      const wrapperCheck = await validatePayloadFingerprintWrapper(wrapper.payloadFingerprint, wrapper.publication, 'publication');
      if (!wrapperCheck.ok) { skipped.push(key + ': ' + wrapperCheck.message); continue; }
      if (!publicationKeyMatches(key, v.value)) { skipped.push(key + ': publication 物理 key owner 不一致'); continue; }
      if (v.value.runtimeBranchId !== runtimeBranchId) continue;
      values.push(value);
      continue;
    }
    if (isArticleVersionRowShape(value)) {
      const v = validateRow<NewsArticleVersion>('NewsArticleVersion', value);
      if (!v.ok) { skipped.push(key + ': ' + v.message); continue; }
      if (!articleVersionKeyMatches(key, v.value)) { skipped.push(key + ': article version 物理 key owner 不一致'); continue; }
      if (v.value.runtimeBranchId !== runtimeBranchId) continue;
      values.push(value);
      continue;
    }
    skipped.push(key + ': 未知/损坏 projection row 形状');
  }
  return { ok: true, values, skipped };
}

// ── P1-1（G1.3.2.4/2.5）：显式窄能力 recovery source（默认全局 IndexedDB 与注入 factory 等价）──

/**
 * recovery 使用的窄能力数据源：只暴露 readCore（按 branch）、readOutboxEntries（物理 key+value 配对）、
 * listProjectionEntries（runtimeProjections 的 key+value 配对）。
 * 不暴露 pointer/checkpoint/migration 读取，也不暴露任何通用 IDB factory/DB handle。
 * P0-1（G1.3.2.6）：readOutboxEntries 必须携带真实物理 key（同一 readonly 事务 getAllKeys+getAll 配对），
 * 不得按 row 字段重建 key 后过滤（那会丢失物理 key 证据）。
 */
export interface ProjectionRecoverySource {
  readCore(branchId: string): Promise<StoryRuntimeState | null>;
  readOutboxEntries(branchId: string): Promise<Array<{ key: string; value: unknown }>>;
  listProjectionEntries(): Promise<Array<{ key: string; value: unknown }>>;
}

/** 用注入 IDB factory 构造窄 recovery source（测试/注入路径；factory 不通过返回值/字段泄露）。 */
export function createIdbRecoverySource(factory?: IdbFactoryLike): ProjectionRecoverySource {
  return {
    readCore: (branchId) => readCoreState(branchId, factory),
    readOutboxEntries: () => readOutboxEntriesImpl(factory),
    listProjectionEntries: () => readProjectionEntries(factory),
  };
}

/** 默认 recovery source：浏览器全局 indexedDB（与注入 factory 路径行为等价，同一数据库）。 */
export function createDefaultRecoverySource(): ProjectionRecoverySource {
  return createIdbRecoverySource(undefined);
}

// ── P0-1/P0-2/P0-3（G1.3.2.4/2.5）：生产 recovery/rebuild 函数（从真实持久化 core/outbox/projection 读取，不手工构造）──

export interface ProjectionRecoveryResult {
  runtimeBranchId: string;
  newsArticles: NewsArticleAggregate[];
  articleVersions: NewsArticleVersion[];
  knowledgeReceipts: KnowledgeReceipt[];
  observerReadCursors: ObserverReadCursor[];
  publications: NarrativePublicationRecord[];
  /** 缺失 projection 时标记 projection_rebuilt（只按 core facts/outbox 重建可重建部分，不伪造文章/知识/事实）。 */
  rebuilt: boolean;
  /**
   * P0-3（G1.3.2.5）：只读状态——core 不可信、projection entries 读取失败、任一 projection 行损坏/
   * key 不一致、outbox 读取失败或任一 outbox 行非法时均为 true（任何持久化损坏都强制只读）。
   */
  readonlyMode: boolean;
  /** 完整合法且 status 为 pending/leased/retry_wait 的 outbox 任务（终态/非法不进入）。 */
  pendingOutboxItems: ProjectionOutboxItem[];
  /** 稳定只读诊断（损坏行/错包装/读取失败等），不 throw。 */
  diagnostics: string[];
}

/**
 * P0-1/P0-2/P0-3（G1.3.2.4/2.5）：从真实持久化 core/outbox/projection 恢复投影状态。
 * - 关闭数据库并用新 factory handle 重新打开后调用（source 决定读哪个数据库；默认全局 indexedDB）；
 * - 五类行冻结 validator 完整校验 + 物理 key owner 验证，坏行进入 diagnostics 且强制 readonlyMode=true；
 * - core 信任调用冻结 validateStoryRuntimeState，结构损坏 -> readonlyMode=true + 稳定诊断，不 throw、
 *   不改写原 bytes，不从 projection/news/旧字符串反推 core；
 * - outbox 调用冻结 validateProjectionOutboxItem，只有完整合法且 status 为 pending/leased/retry_wait
 *   的记录进入 pendingOutboxItems；未知 status/少字段/错 branch/错 key 均 diagnostics + 只读；
 * - 缺失 projection 时只从 core.narrativePublications（已提交真实记录）重建可证明的 publication，不伪造；
 * - 不手工构造结果；所有数据来自数据库持久化记录。
 */
export async function recoverProjectionsFromStore(
  adapter: ProjectionDurableAdapter,
  runtimeBranchId: string,
  source?: ProjectionRecoverySource,
): Promise<ProjectionRecoveryResult> {
  const recoverySource = source ?? adapter.createRecoverySource();
  const diagnostics: string[] = [];
  let readonlyMode = false;
  const newsArticles: NewsArticleAggregate[] = [];
  const articleVersions: NewsArticleVersion[] = [];
  const articleCollected: Array<{ key: string; row: NewsArticleVersion }> = [];
  const knowledgeReceipts: KnowledgeReceipt[] = [];
  const observerReadCursors: ObserverReadCursor[] = [];
  const publications: NarrativePublicationRecord[] = [];

  let entriesList: Array<{ key: string; value: unknown }> = [];
  try {
    entriesList = await recoverySource.listProjectionEntries();
  } catch (error) {
    diagnostics.push('读取 projection entries 失败（强制只读）: ' + (error instanceof Error ? error.message : String(error)));
    readonlyMode = true;
  }

  for (const { key, value } of entriesList) {
    if (isAggregateRowShape(value)) {
      const wrapper = value as { aggregate: unknown; aggregateKey?: unknown; versionIds?: unknown; sourceLevelIdempotencyKeys?: unknown };
      const v = validateRow<NewsArticleAggregate>('NewsArticleAggregate', wrapper.aggregate);
      if (!v.ok) { diagnostics.push(key + ': ' + v.message + '（强制只读）'); readonlyMode = true; continue; }
      // P0-3：wrapper 完整性（aggregateKey 非空、versionIds 与 inner 一致、idempotency keys 每项非空）。
      const wrapperCheck = validateAggregateWrapper(wrapper, v.value);
      if (!wrapperCheck.ok) { diagnostics.push(key + ': ' + wrapperCheck.message + '（强制只读）'); readonlyMode = true; continue; }
      // P0-2：物理 key 双向校验（key 必须 === 派生 key；key=target,row=other 与 key=other,row=target 都拒绝）。
      if (!aggregateKeyMatches(key, v.value, wrapper.aggregateKey as string)) {
        diagnostics.push(key + ': aggregate 物理 key owner 不一致（强制只读）');
        readonlyMode = true;
        continue;
      }
      // key 与 row 都一致且属于其他 branch -> 无关分支跳过（不诊断）。
      if (v.value.runtimeBranchId !== runtimeBranchId) continue;
      newsArticles.push(v.value);
      continue;
    }
    if (isCursorRowShape(value)) {
      const wrapper = value as { cursor: unknown; revision?: unknown };
      const v = validateRow<ObserverReadCursor>('ObserverReadCursor', wrapper.cursor);
      if (!v.ok) { diagnostics.push(key + ': ' + v.message + '（强制只读）'); readonlyMode = true; continue; }
      // P0-3：cursor revision 必须是非负安全整数。
      if (!isNonNegativeSafeInteger(wrapper.revision)) {
        diagnostics.push(key + ': cursor revision 必须是非负安全整数（强制只读）');
        readonlyMode = true;
        continue;
      }
      if (!cursorKeyMatches(key, v.value)) {
        diagnostics.push(key + ': cursor 物理 key owner 不一致（强制只读）');
        readonlyMode = true;
        continue;
      }
      if (v.value.runtimeBranchId !== runtimeBranchId) continue;
      observerReadCursors.push(v.value);
      continue;
    }
    if (isReceiptRowShape(value)) {
      const wrapper = value as { receipt: unknown; payloadFingerprint?: unknown };
      const v = validateRow<KnowledgeReceipt>('KnowledgeReceipt', wrapper.receipt);
      if (!v.ok) { diagnostics.push(key + ': ' + v.message + '（强制只读）'); readonlyMode = true; continue; }
      // P0-3：receipt wrapper payloadFingerprint 非空且与 inner payload 的 sha256Fingerprint 一致。
      const wrapperCheck = await validatePayloadFingerprintWrapper(wrapper.payloadFingerprint, wrapper.receipt, 'receipt');
      if (!wrapperCheck.ok) { diagnostics.push(key + ': ' + wrapperCheck.message + '（强制只读）'); readonlyMode = true; continue; }
      if (!receiptKeyMatches(key, v.value)) {
        diagnostics.push(key + ': receipt 物理 key owner 不一致（强制只读）');
        readonlyMode = true;
        continue;
      }
      if (v.value.runtimeBranchId !== runtimeBranchId) continue;
      knowledgeReceipts.push(v.value);
      continue;
    }
    if (isPublicationRowShape(value)) {
      const wrapper = value as { publication: unknown; payloadFingerprint?: unknown };
      const v = validateRow<NarrativePublicationRecord>('NarrativePublicationRecord', wrapper.publication);
      if (!v.ok) { diagnostics.push(key + ': ' + v.message + '（强制只读）'); readonlyMode = true; continue; }
      // P0-3：publication wrapper payloadFingerprint 非空且与 inner payload 的 sha256Fingerprint 一致。
      const wrapperCheck = await validatePayloadFingerprintWrapper(wrapper.payloadFingerprint, wrapper.publication, 'publication');
      if (!wrapperCheck.ok) { diagnostics.push(key + ': ' + wrapperCheck.message + '（强制只读）'); readonlyMode = true; continue; }
      if (!publicationKeyMatches(key, v.value)) {
        diagnostics.push(key + ': publication 物理 key owner 不一致（强制只读）');
        readonlyMode = true;
        continue;
      }
      if (v.value.runtimeBranchId !== runtimeBranchId) continue;
      publications.push(v.value);
      continue;
    }
    if (parseArticleKey(key).kind !== 'not_article' || isArticleVersionRowShape(value)) {
      // P0-2/P0-3（G1.3.2.11）：统一 candidate classifier——完整 row 校验 + 可持久化输入域 +
      // exact key owner；other branch 的 invalid current/legacy row 不把 target 强制只读；
      // target/unknown 坏行可见；逻辑版本冲突 -> 只读。
      const candidate = await classifyArticleEntry(key, value, runtimeBranchId);
      if (candidate.kind === 'ok') {
        articleCollected.push({ key, row: candidate.row });
        continue;
      }
      if (candidate.kind === 'bad') {
        if (candidate.owner === null || candidate.owner === runtimeBranchId) {
          diagnostics.push(key + ': ' + candidate.message + '（owner=' + (candidate.owner ?? 'unknown') + '，强制只读）');
          readonlyMode = true;
        }
        continue;
      }
      if (candidate.kind === 'not_article' && isArticleVersionRowShape(value)) {
        diagnostics.push(key + ': article 形状行位于非 article 物理 key（错柜，强制只读）');
        readonlyMode = true;
      }
      // other_branch / ordinary not_article：跳过（不污染 target recovery）。
      continue;
    }
    diagnostics.push(key + ': 未知/损坏 projection row 形状（强制只读，不静默跳过）');
    readonlyMode = true;
  }

  // P1-2（G1.3.2.4）：core 完整校验（冻结 validateStoryRuntimeState，不只验 schemaVersion）。
  let core: StoryRuntimeState | null = null;
  let coreTrusted = false;
  try {
    core = await recoverySource.readCore(runtimeBranchId);
  } catch (error) {
    diagnostics.push('读取 core 失败（强制只读）: ' + (error instanceof Error ? error.message : String(error)));
  }
  if (core === null) {
    diagnostics.push('core 缺失（v3_recovery 只读，不反推）');
  } else {
    const validated = validateStoryRuntimeState(core);
    if (validated.ok) {
      coreTrusted = true;
    } else {
      const codes = validated.issues.slice(0, 3).map((issue) => issue.code).join(', ');
      diagnostics.push('core 结构校验失败（v3_recovery 只读，不反推、不改写原 bytes）: ' + codes);
    }
  }
  if (!coreTrusted) readonlyMode = true;

  // P0-1（G1.3.2.6）：outbox 携带真实物理 key 的配对 entries + 冻结 validator + 双向 key 校验。
  const pendingOutboxItems: ProjectionOutboxItem[] = [];
  let outboxEntries: Array<{ key: string; value: unknown }> = [];
  try {
    outboxEntries = await recoverySource.readOutboxEntries(runtimeBranchId);
  } catch (error) {
    diagnostics.push('读取 outbox 失败（强制只读）: ' + (error instanceof Error ? error.message : String(error)));
    readonlyMode = true;
  }
  for (const { key, value } of outboxEntries) {
    // 先对 value 调用冻结 validator——null/string/number/array/少字段/非法枚举均稳定拒绝，
    // 不 throw、不 hang、不在 validator 前访问任何字段。
    const validated = validateRow<ProjectionOutboxItem>('ProjectionOutboxItem', value);
    if (!validated.ok) {
      diagnostics.push('outbox 行非法（强制只读）: ' + key + ' ' + validated.message);
      readonlyMode = true;
      continue;
    }
    const row = validated.value;
    // 物理 key 双向校验：physical key === outboxKey(row.runtimeBranchId, row.outboxId)。
    // key=target,row=other 与 key=other,row=target 两个方向都诊断 + 只读。
    const expectedKey = outboxKey(row.runtimeBranchId, row.outboxId);
    if (key !== expectedKey) {
      diagnostics.push('outbox 物理 key 与 row 不一致（强制只读）: key=' + key + ' expected=' + expectedKey);
      readonlyMode = true;
      continue;
    }
    // key 与 row 都一致且属于其他 branch -> 无关分支跳过（不诊断）。
    if (row.runtimeBranchId !== runtimeBranchId) continue;
    // 终态（delivered/dead_letter/cancelled）不进入 pending。
    if (!OUTBOX_NON_TERMINAL_STATUSES.has(row.status)) continue;
    pendingOutboxItems.push(row);
  }

  // P0-3（G1.3.2.11）：article 逻辑版本唯一——同 payload 去重；不同 payload 冲突 + 强制只读。
  const articleDeduped = dedupeLogicalArticleVersions(articleCollected);
  for (const v of articleDeduped.values) articleVersions.push(v);
  if (articleDeduped.conflicts.length > 0) {
    for (const c of articleDeduped.conflicts) diagnostics.push(c + '（强制只读）');
    readonlyMode = true;
  }

  const hasProjectionRows = newsArticles.length > 0 || articleVersions.length > 0 || knowledgeReceipts.length > 0 || observerReadCursors.length > 0 || publications.length > 0;

  // 缺失 projection：只从 core 已提交真实记录重建可证明的 publication（不伪造文章/知识/事实）。
  if (!hasProjectionRows && coreTrusted) {
    for (const pub of core?.narrativePublications ?? []) {
      if (pub.runtimeBranchId === runtimeBranchId) publications.push(pub);
    }
  }

  return {
    runtimeBranchId,
    newsArticles,
    articleVersions,
    knowledgeReceipts,
    observerReadCursors,
    publications,
    rebuilt: !hasProjectionRows,
    readonlyMode,
    pendingOutboxItems,
    diagnostics,
  };
}
