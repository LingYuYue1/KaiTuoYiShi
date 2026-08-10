// G1.3.2.1 projectionStore：新闻文章聚合根、不可变文章版本、observer 阅读游标、非玩法 KnowledgeReceipt 的 aggregate CAS。
// - 不同存储 owner：ProjectionStore 在 commit 后消费 outbox，但不能把整个 core blob 读出、改写后再写回；
// - P0-3（G1.3.2.1）：每个聚合的读取、payload/fingerprint 比较、版本/revision 检查和写入必须在同一个
//   真实 readwrite 事务中完成（adapter.runTransaction 是不可分割的事务原语，回调内所有 get/put 原子）；
//   禁止"先事务读、后事务写"。
// - P1-6（G1.3.2.1）：为已写记录保存确定性 payload fingerprint；同 ID 同 payload -> ALREADY_APPLIED 且不增 revision；
//   同 ID 不同 payload -> IDEMPOTENCY_KEY_REUSED/CONFLICT，零写入。
// - 文章版本不可变（write-once）；不同 branch 的 article/outbox 互不覆盖（key 带 branch 归属）。
import type { NewsArticleAggregate, NewsArticleVersion, ObserverReadCursor, KnowledgeReceipt, ProjectionOutboxItem } from '../../models/storyRuntimeProjection';
import { sha256Fingerprint } from './id';
import { tryCanonicalJson } from './commandValidator';
import { PROJECTION_STORE } from './coreRuntimeStore';
import { validateStoryRuntimeType } from './runtimeValidator';

export type ProjectionWriteResult = { ok: true; key: string } | { ok: false; code: 'CONFLICT' | 'ALREADY_APPLIED' | 'IDEMPOTENCY_KEY_REUSED' | 'INVALID_COMMAND'; message: string };

export const PROJECTION_KEY_PREFIX = 'projection:';
export const ARTICLE_VERSION_KEY_PREFIX = PROJECTION_KEY_PREFIX + 'article-v2:';
export const LEGACY_ARTICLE_VERSION_KEY_PREFIX = PROJECTION_KEY_PREFIX + 'article:';

/**
 * Article component codec: escape `%` and `:` while leaving other characters
 * unchanged. G1.3.2.10 writes these components under article-v2 so encoded
 * keys cannot collide with any raw `projection:article:` legacy key.
 */
export function encodeIdComponent(s: string): string {
  return s.replace(/%/g, '%25').replace(/:/g, '%3A');
}

/** P0-1（G1.3.2.9）：单遍解码（先 %25 后 %3A 会级联错误，必须一次扫描）。 */
export function decodeIdComponent(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '%' && s[i + 1] === '2' && s[i + 2] === '5') {
      out += '%';
      i += 2;
    } else if (s[i] === '%' && s[i + 1] === '3' && s[i + 2] === 'A') {
      out += ':';
      i += 2;
    } else {
      out += s[i];
    }
  }
  return out;
}

/** P0-1（G1.3.2.9）：组件是否含非法转义（`%` 后不是 25/3A）——无法可靠解码。 */
export function hasMalformedPercent(s: string): boolean {
  for (let i = 0; i < s.length; i += 1) {
    if (s[i] === '%') {
      if (!(s[i + 1] === '2' && s[i + 2] === '5') && !(s[i + 1] === '3' && s[i + 2] === 'A')) return true;
    }
  }
  return false;
}

export function projectionAggregateKey(runtimeBranchId: string, aggregateKey: string): string {
  return PROJECTION_KEY_PREFIX + 'aggregate:' + runtimeBranchId + ':' + aggregateKey;
}

export function projectionArticleVersionKey(runtimeBranchId: string, articleId: string, articleVersion: number): string {
  return ARTICLE_VERSION_KEY_PREFIX + encodeIdComponent(runtimeBranchId) + ':' + encodeIdComponent(articleId) + ':' + articleVersion;
}

/** G1.3.2.9 encoded key retained only for backwards-compatible reads. */
export function projectionLegacyEncodedArticleVersionKey(runtimeBranchId: string, articleId: string, articleVersion: number): string {
  return LEGACY_ARTICLE_VERSION_KEY_PREFIX + encodeIdComponent(runtimeBranchId) + ':' + encodeIdComponent(articleId) + ':' + articleVersion;
}

/** Pre-codec raw key retained only for backwards-compatible reads. */
export function projectionLegacyRawArticleVersionKey(runtimeBranchId: string, articleId: string, articleVersion: number): string {
  return LEGACY_ARTICLE_VERSION_KEY_PREFIX + runtimeBranchId + ':' + articleId + ':' + articleVersion;
}

/** Current key first, followed by the two legacy representations without duplicates. */
export function projectionArticleVersionReadKeys(runtimeBranchId: string, articleId: string, articleVersion: number): string[] {
  return [...new Set([
    projectionArticleVersionKey(runtimeBranchId, articleId, articleVersion),
    projectionLegacyEncodedArticleVersionKey(runtimeBranchId, articleId, articleVersion),
    projectionLegacyRawArticleVersionKey(runtimeBranchId, articleId, articleVersion),
  ])];
}

export function projectionArticleVersionKeyMatchesRow(key: string, row: NewsArticleVersion): boolean {
  return projectionArticleVersionReadKeys(row.runtimeBranchId, row.articleId, row.articleVersion).includes(key);
}

/**
 * P0-1（G1.3.2.11）：article 可持久化共同输入域——非空 runtimeBranchId/articleId + 非负安全整数
 * articleVersion。写入（consumeNewsOutbox）与读取（list/get/recovery）复用同一最小 helper，
 * 避免"以后不再写坏值"却把历史坏值重新当正常正文。
 */
export function isPersistableArticleDomain(branch: unknown, articleId: unknown, articleVersion: unknown): boolean {
  return typeof branch === 'string' && branch.length > 0
    && typeof articleId === 'string' && articleId.length > 0
    && typeof articleVersion === 'number' && Number.isSafeInteger(articleVersion) && articleVersion >= 0;
}

export function projectionCursorKey(runtimeBranchId: string, observerId: string): string {
  return PROJECTION_KEY_PREFIX + 'cursor:' + runtimeBranchId + ':' + observerId;
}

export function projectionReceiptKey(runtimeBranchId: string, receiptId: string): string {
  return PROJECTION_KEY_PREFIX + 'receipt:' + runtimeBranchId + ':' + receiptId;
}

/**
 * P0-3（G1.3.2.1）：不可分割的事务原语。整个回调（读取 + 比较 + 写入）在同一个真实 readwrite 事务内执行；
 * 并发调用由 IDB/shim 的事务队列串行化，回调内不会出现"读到旧值再写"的窗口。
 */
export interface ProjectionStoreAdapter {
  runTransaction<T>(
    storeName: string,
    fn: (store: {
      get(key: string): Promise<unknown>;
      put(value: unknown, key: string): Promise<void>;
    }) => Promise<T>,
  ): Promise<T>;
}

interface AggregateRow {
  aggregate: NewsArticleAggregate;
  /** P0-3（G1.3.2.6）：持久化可验证的 aggregateKey（物理 key 后缀），recovery/list 用它验证 key 与 row 完全一致。 */
  aggregateKey: string;
  versionIds: string[];
  sourceLevelIdempotencyKeys: Array<{ key: string; payloadFingerprint: string }>;
}

/**
 * P0-3（G1.3.2.7）/P0-2/P0-3（G1.3.2.8）：existing aggregate wrapper 的完整校验。
 * - inner aggregate 必须先通过冻结 validateStoryRuntimeType('NewsArticleAggregate') 完整校验
 *   （currentVersion/aggregateRevision/versionIds 及全部必填字段/数值范围——坏 revision 不会被
 *   当作 0 修补、不参与 JS 算术、不抛 Cannot mix BigInt）；
 * - wrapper aggregateKey/versionIds 与 inner aggregate 一致、物理 key owner 一致；
 * - P0-3（G1.3.2.8）：existing inner articleId 必须与 incoming articleId 精确相等
 *   （同一 aggregateKey 不能被另一篇文章接管）；
 * - 全函数（BigInt/Symbol/对象/null 等任意持久化坏值稳定返回 { ok:false }，不 throw/hang；
 *   不用 JSON.stringify 比较数组）。
 */
function validateExistingAggregateRow(
  existing: AggregateRow,
  physicalKey: string,
  incoming: { runtimeBranchId: string; articleId: string },
): { ok: true } | { ok: false; message: string } {
  if (existing === null || typeof existing !== 'object') {
    return { ok: false, message: 'existing aggregate wrapper 不是对象（零写入）' };
  }
  // P0-2（G1.3.2.8）：inner aggregate 完整冻结校验（在读取任何字段/算术/写入之前）。
  const aggValidated = validateStoryRuntimeType('NewsArticleAggregate', existing.aggregate);
  if (!aggValidated.ok) {
    const codes = aggValidated.issues.slice(0, 3).map((issue) => issue.code).join(', ');
    return { ok: false, message: 'existing inner aggregate 冻结校验失败（零写入）: ' + codes };
  }
  const agg = aggValidated.value as NewsArticleAggregate;
  // P0-2（G1.3.2.8）：冻结 validator 通过后补数值范围约束——aggregateRevision/currentVersion
  // 必须是非负安全整数（负数/NaN/非整数不能参与后续 +1 算术，也不能当作 0 修补）。
  if (!Number.isSafeInteger(agg.aggregateRevision) || agg.aggregateRevision < 0) {
    return { ok: false, message: 'existing inner aggregate aggregateRevision 必须是非负安全整数（零写入）' };
  }
  if (!Number.isSafeInteger(agg.currentVersion) || agg.currentVersion < 0) {
    return { ok: false, message: 'existing inner aggregate currentVersion 必须是非负安全整数（零写入）' };
  }
  // P0-3（G1.3.2.9）：+1 后必须仍为非负安全整数——MAX_SAFE_INTEGER 在写入前稳定拒绝（不能先算出
  // 非安全值再落盘后等 recovery 拒绝）。
  if (agg.aggregateRevision >= Number.MAX_SAFE_INTEGER) {
    return { ok: false, message: 'existing inner aggregate aggregateRevision 已达安全整数上界（+1 会溢出，零写入）' };
  }
  if (typeof existing.aggregateKey !== 'string' || existing.aggregateKey.length === 0) {
    return { ok: false, message: 'existing aggregate wrapper 缺少非空 aggregateKey（零写入）' };
  }
  if (physicalKey !== 'projection:aggregate:' + agg.runtimeBranchId + ':' + existing.aggregateKey) {
    return { ok: false, message: 'existing aggregate wrapper 物理 key owner 不一致（零写入）' };
  }
  if (agg.runtimeBranchId !== incoming.runtimeBranchId) {
    return { ok: false, message: 'existing aggregate wrapper 与本次写入 branch 不一致（零写入）' };
  }
  // P0-3（G1.3.2.8）：同一 aggregateKey 的 articleId owner 必须一致——A 文章的抽屉不能被 B 文章接管。
  if (agg.articleId !== incoming.articleId) {
    return { ok: false, message: 'existing aggregate articleId（' + agg.articleId + '）与 incoming articleId（' + incoming.articleId + '）不一致，同一 aggregateKey 不可被另一篇文章接管（零写入）' };
  }
  if (!Array.isArray(existing.versionIds) || existing.versionIds.length !== agg.versionIds.length) {
    return { ok: false, message: 'existing aggregate wrapper versionIds 与 inner aggregate 不一致（零写入）' };
  }
  for (let i = 0; i < existing.versionIds.length; i += 1) {
    const a = existing.versionIds[i];
    if (typeof a !== 'string' || a.length === 0 || a !== agg.versionIds[i]) {
      return { ok: false, message: 'existing aggregate wrapper versionIds[' + i + '] 非法或与 inner aggregate 不一致（零写入）' };
    }
  }
  if (!Array.isArray(existing.sourceLevelIdempotencyKeys)) {
    return { ok: false, message: 'existing aggregate wrapper sourceLevelIdempotencyKeys 缺失（零写入）' };
  }
  for (let i = 0; i < existing.sourceLevelIdempotencyKeys.length; i += 1) {
    const e = existing.sourceLevelIdempotencyKeys[i] as { key?: unknown; payloadFingerprint?: unknown } | null;
    if (e === null || typeof e !== 'object'
      || typeof e.key !== 'string' || e.key.length === 0
      || typeof e.payloadFingerprint !== 'string' || e.payloadFingerprint.length === 0) {
      return { ok: false, message: 'existing aggregate wrapper sourceLevelIdempotencyKeys[' + i + '] 非法（零写入）' };
    }
  }
  return { ok: true };
}

/**
 * P0-3/P1-6（G1.3.2.1）：消费一条 news outbox——聚合读取、同源同 payload 幂等判定、版本不可变检查、
 * 版本写入与聚合更新全部在同一个 readwrite 事务内完成。
 * payloadFingerprint 在事务外预先计算（避免事务回调内 await 非 IDB Promise 导致事务提前自动提交）。
 * - 同 sourceLevelIdempotencyKey 同 payloadFingerprint -> ALREADY_APPLIED（不产生第二篇文章，revision 不增）；
 * - 同 sourceLevelIdempotencyKey 不同 payloadFingerprint -> IDEMPOTENCY_KEY_REUSED（零写入）；
 * - 同 article+version 已存在（不可变）-> CONFLICT。
 */
export async function consumeNewsOutbox(
  adapter: ProjectionStoreAdapter,
  item: ProjectionOutboxItem,
  aggregate: NewsArticleAggregate,
  version: NewsArticleVersion,
): Promise<ProjectionWriteResult> {
  // P0-2（G1.3.2.9）：进入 fingerprint/事务/任何写入前，先验证 item/aggregate/version 的冻结结构与
  // owner 完整对齐——坏 incoming 值不参与 sha256Fingerprint、不进事务。
  const itemValidated = validateStoryRuntimeType('ProjectionOutboxItem', item);
  if (!itemValidated.ok) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'incoming outbox item 冻结校验失败（零写入）' };
  }
  const aggValidated = validateStoryRuntimeType('NewsArticleAggregate', aggregate);
  if (!aggValidated.ok) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'incoming aggregate 冻结校验失败（零写入）' };
  }
  const verValidated = validateStoryRuntimeType('NewsArticleVersion', version);
  if (!verValidated.ok) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'incoming version 冻结校验失败（零写入）' };
  }
  // P0-2（G1.3.2.9）：branch 精确一致；aggregate.articleId === version.articleId；
  // aggregate.currentVersion === version.articleVersion——一次写入必须是同一篇文章的同一版。
  if (item.runtimeBranchId !== aggregate.runtimeBranchId || aggregate.runtimeBranchId !== version.runtimeBranchId) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'outbox/aggregate/version 的 runtimeBranchId 不一致（跨 branch 输入拒绝）' };
  }
  if (aggregate.articleId !== version.articleId) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'incoming aggregate.articleId（' + aggregate.articleId + '）与 version.articleId（' + version.articleId + '）不一致（零写入）' };
  }
  if (aggregate.currentVersion !== version.articleVersion) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'incoming aggregate.currentVersion（' + aggregate.currentVersion + '）与 version.articleVersion（' + version.articleVersion + '）不一致（零写入）' };
  }
  // G1.3.2.10: a successful first write must satisfy the same domain later
  // readers and existing-row validators require.
  // P0-1（G1.3.2.11）：aggregate/version 与读取侧复用同一 isPersistableArticleDomain helper；
  // item 无 articleId/version 语义，单独校验非空 branch。
  if (typeof item.runtimeBranchId !== 'string' || item.runtimeBranchId.length === 0
    || !isPersistableArticleDomain(aggregate.runtimeBranchId, aggregate.articleId, aggregate.currentVersion)
    || !isPersistableArticleDomain(version.runtimeBranchId, version.articleId, version.articleVersion)) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'incoming article 输入域非法（非空 owner/非负安全整数 version，零写入）' };
  }
  if (item.aggregateKey.length === 0) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'incoming aggregateKey 必须是非空 string（零写入）' };
  }
  if (item.sourceLevelIdempotencyKey.length === 0) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'incoming sourceLevelIdempotencyKey 必须是非空 string（零写入）' };
  }
  const key = projectionAggregateKey(aggregate.runtimeBranchId, item.aggregateKey);
  // 事务外预计算 payload fingerprint（Web Crypto 异步；不能放在事务回调内 await）。
  const payloadFingerprint = await sha256Fingerprint(version);
  return adapter.runTransaction<ProjectionWriteResult>(PROJECTION_STORE, async (store) => {
    const existing = (await store.get(key)) as AggregateRow | null;
    if (existing !== undefined && existing !== null) {
      // P0-3（G1.3.2.7）：读取 existing wrapper 后、访问任何字段前先完整校验——
      // 缺字段/非法元素/owner 不一致返回稳定 typed failure，零写入、不 throw、不覆盖坏档。
      const wrapperCheck = validateExistingAggregateRow(existing, key, aggregate);
      if (!wrapperCheck.ok) {
        return { ok: false, code: 'INVALID_COMMAND', message: wrapperCheck.message };
      }
      const sameSource = existing.sourceLevelIdempotencyKeys.find((k) => k.key === item.sourceLevelIdempotencyKey);
      if (sameSource) {
        if (sameSource.payloadFingerprint === payloadFingerprint) {
          return { ok: false, code: 'ALREADY_APPLIED', message: '同源同 payload 已消费，不产生第二篇文章' };
        }
        return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED', message: '同源不同 payload 冒用：' + item.sourceLevelIdempotencyKey };
      }
    }
    // 版本不可变：current namespace 有任何 row，或任一 legacy candidate
    // 含同 owner 的合法 row，均视为同一版本已存在。legacy key 上其他 owner
    // 的 raw/encoded 碰撞不能阻塞 current namespace 写入。
    const versionKey = projectionArticleVersionKey(aggregate.runtimeBranchId, aggregate.articleId, version.articleVersion);
    const existingVersion = await store.get(versionKey);
    if (existingVersion !== undefined && existingVersion !== null) {
      return { ok: false, code: 'CONFLICT', message: '文章版本已存在（不可变）：' + versionKey };
    }
    const legacyKeys = projectionArticleVersionReadKeys(aggregate.runtimeBranchId, aggregate.articleId, version.articleVersion).slice(1);
    for (const legacyKey of legacyKeys) {
      const legacyRow = await store.get(legacyKey);
      if (legacyRow === undefined || legacyRow === null) continue;
      const validatedLegacy = validateStoryRuntimeType('NewsArticleVersion', legacyRow);
      if (!validatedLegacy.ok) continue;
      const legacyVersion = validatedLegacy.value as NewsArticleVersion;
      if (legacyVersion.runtimeBranchId === aggregate.runtimeBranchId
        && legacyVersion.articleId === aggregate.articleId
        && legacyVersion.articleVersion === version.articleVersion
        && projectionArticleVersionKeyMatchesRow(legacyKey, legacyVersion)) {
        return { ok: false, code: 'CONFLICT', message: '文章版本已存在（legacy，不可变）：' + legacyKey };
      }
    }
    await store.put(version, versionKey);
    const nextAggregate: NewsArticleAggregate = {
      runtimeBranchId: aggregate.runtimeBranchId,
      articleId: aggregate.articleId,
      currentVersion: aggregate.currentVersion,
      versionIds: [...(existing?.versionIds ?? []), versionKey],
      aggregateRevision: (existing?.aggregate?.aggregateRevision ?? 0) + 1,
    };
    const nextRow: AggregateRow = {
      aggregate: nextAggregate,
      aggregateKey: item.aggregateKey,
      versionIds: nextAggregate.versionIds,
      sourceLevelIdempotencyKeys: [...(existing?.sourceLevelIdempotencyKeys ?? []), { key: item.sourceLevelIdempotencyKey, payloadFingerprint }],
    };
    await store.put(nextRow, key);
    return { ok: true, key: versionKey };
  });
}

/**
 * P0-3（G1.3.2.1）：写阅读游标——读取、revision 比较、写入在同一个 readwrite 事务内；
 * 游标竞争（同 expectedRevision 并发）只有一个成功，另一个 CONFLICT。
 */
export async function writeObserverCursor(
  adapter: ProjectionStoreAdapter,
  cursor: ObserverReadCursor,
  expectedRevision: number,
): Promise<ProjectionWriteResult> {
  // P0-2（G1.3.2.2）：cursor 必须携带非空 runtimeBranchId 且与 key owner 一致（key 由函数按 cursor.branch 派生，天然一致）。
  if (typeof cursor.runtimeBranchId !== 'string' || cursor.runtimeBranchId.length === 0) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'cursor 必须携带非空 runtimeBranchId' };
  }
  const key = projectionCursorKey(cursor.runtimeBranchId, cursor.observerId);
  return adapter.runTransaction<ProjectionWriteResult>(PROJECTION_STORE, async (store) => {
    const existing = (await store.get(key)) as { cursor: ObserverReadCursor; revision: number } | null;
    const currentRevision = existing?.revision ?? 0;
    if (expectedRevision !== currentRevision) {
      return { ok: false, code: 'CONFLICT', message: '阅读游标 revision 冲突：expected ' + expectedRevision + ' != current ' + currentRevision };
    }
    await store.put({ cursor, revision: currentRevision + 1 }, key);
    return { ok: true, key };
  });
}

/**
 * P0-3/P1-6（G1.3.2.1）：写 KnowledgeReceipt——读取、payload fingerprint 比较、写入在同一个 readwrite 事务内；
 * payloadFingerprint 在事务外预先计算（避免事务回调内 await 非 IDB Promise）。
 * 同 receiptId 同 payload -> ALREADY_APPLIED（不增 revision）；同 receiptId 不同 payload -> IDEMPOTENCY_KEY_REUSED（零写入）。
 */
export async function writeKnowledgeReceipt(
  adapter: ProjectionStoreAdapter,
  receipt: KnowledgeReceipt,
): Promise<ProjectionWriteResult> {
  // P0-2（G1.3.2.2）：receipt 必须携带非空 runtimeBranchId 且与 key owner 一致。
  if (typeof receipt.runtimeBranchId !== 'string' || receipt.runtimeBranchId.length === 0) {
    return { ok: false, code: 'INVALID_COMMAND', message: 'receipt 必须携带非空 runtimeBranchId' };
  }
  const key = projectionReceiptKey(receipt.runtimeBranchId, receipt.receiptId);
  // 事务外预计算 payload fingerprint。
  const payloadFingerprint = await sha256Fingerprint(receipt);
  return adapter.runTransaction<ProjectionWriteResult>(PROJECTION_STORE, async (store) => {
    const existing = (await store.get(key)) as { receipt: KnowledgeReceipt; payloadFingerprint: string } | null;
    if (existing) {
      if (existing.payloadFingerprint === payloadFingerprint) {
        return { ok: false, code: 'ALREADY_APPLIED', message: '知识回执已存在（同 payload）：' + receipt.receiptId };
      }
      return { ok: false, code: 'IDEMPOTENCY_KEY_REUSED', message: '知识回执同 ID 不同 payload：' + receipt.receiptId };
    }
    await store.put({ receipt, payloadFingerprint }, key);
    return { ok: true, key };
  });
}

export { tryCanonicalJson, sha256Fingerprint };
