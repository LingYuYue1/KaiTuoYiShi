// G1.3.1 outboxReducer：领域 outbox（只表达"待投影/待通知"，不实现 worker）。
// - outbox item 绑定 runtimeBranchId、来源 revision、来源 fingerprint、幂等键、payload fingerprint；
// - 同一来源重试不得追加第二份；不同来源不能被错误合并；
// - 事实事务成功后才产生 outbox；事务失败时 outbox 必须为空；
// - outbox 不能反向创建事实。
import type { ProjectionOutboxItem, ProjectionOutboxKind, ProjectionOutboxOperation, PayloadRefKind } from '../../models/storyRuntimeProjection';
import type { StoryRuntimeState } from '../../models/storyRuntime';
import type { IdAllocator } from './runtimeCore';
import { canonicalJsonStringify } from './normalization';

export type OutboxResult = { ok: true; outbox: ProjectionOutboxItem[] } | { ok: false; code: string; message: string };
export type MergeOutboxResult = { ok: true; outbox: ProjectionOutboxItem[] } | { ok: false; code: string; message: string };

/**
 * 生成 outbox item。sourceLevelIdempotencyKey 由来源指纹 + payload 指纹确定；
 * 同一来源重试 -> 同 key，不追加第二份；不同来源不同 key，不被错误合并。
 */
export async function buildOutboxItem(
  state: StoryRuntimeState,
  input: {
    kind: ProjectionOutboxKind;
    aggregateKey: string;
    operation: ProjectionOutboxOperation;
    payload: unknown;
    sourceRefFingerprint: string;
    sourceRevision: number;
    consumerIds: string[];
    allocator: IdAllocator;
    articlePolicyFingerprint?: string;
    eventResolutionKey?: string;
    deliveryKey?: string;
    /** 可选结构化 NewsSourceRef（committed_fact/public_schedule/official_notice/…）；
     *  提供时 sourceRefFingerprint 采用 canonical 排序后的 NewsSourceRef identity（供 outboxHasFact 结构化精确匹配）。 */
    sourceRef?: unknown;
  },
): Promise<OutboxResult> {
  const payloadFingerprint = await input.allocator('outbox:payload', input.payload, '');
  const sourceLevelIdempotencyKey = await input.allocator('outbox:source', { sourceRefFingerprint: input.sourceRefFingerprint, payloadFingerprint }, '');
  const deliveryKey = input.deliveryKey ?? (await input.allocator('outbox:delivery', { kind: input.kind, aggregateKey: input.aggregateKey, payloadFingerprint }, ''));
  const outboxId = await input.allocator('outbox:id', { sourceLevelIdempotencyKey, deliveryKey }, '');
  // sourceRef 提供时，sourceRefFingerprint 必须是 canonical 排序后的 NewsSourceRef identity（结构化事实引用）。
  const sourceRefFingerprint = input.sourceRef !== undefined ? canonicalJsonStringify(input.sourceRef) : input.sourceRefFingerprint;

  const item: ProjectionOutboxItem = {
    outboxId,
    schemaVersion: 3,
    runtimeBranchId: state.runtimeBranchId,
    sourceRefFingerprint,
    sourceRevision: input.sourceRevision,
    kind: input.kind,
    aggregateKey: input.aggregateKey,
    operation: input.operation,
    articlePolicyFingerprint: input.articlePolicyFingerprint,
    sourceLevelIdempotencyKey,
    eventResolutionKey: input.eventResolutionKey,
    deliveryKey,
    payloadFingerprint,
    payloadRef: { kind: 'inline' as PayloadRefKind, key: payloadFingerprint },
    consumerIds: input.consumerIds,
    consumerAcks: {},
    createdAt: state.runtimeRevision,
    status: 'pending',
    attemptCount: 0,
  };
  return { ok: true, outbox: [item] };
}

/**
 * 合并 outbox（纯）：同一来源（sourceRefFingerprint）重试且 payload 相同 -> 幂等不追加；
 * 同一来源 payload 不同 -> 返回稳定 CONFLICT（不得 throw、不得静默追加两条"同一来源"）；
 * 不同来源各自独立。
 */
export function mergeOutbox(existing: ProjectionOutboxItem[], incoming: ProjectionOutboxItem[]): MergeOutboxResult {
  const merged = [...existing];
  for (const item of incoming) {
    const sameSource = merged.find((o) => o.sourceRefFingerprint === item.sourceRefFingerprint);
    if (sameSource) {
      if (sameSource.payloadFingerprint === item.payloadFingerprint) continue; // 同源同 payload：幂等
      // 同源不同 payload：显式稳定冲突（不得静默追加两条"同一来源"）。
      return { ok: false, code: 'CONFLICT', message: 'outbox 同来源不同 payload 冲突: ' + item.sourceRefFingerprint };
    }
    merged.push(item);
  }
  return { ok: true, outbox: merged };
}

/**
 * outbox 是否包含某事实：只允许结构化 fact 引用精确相等。
 * - sourceRefFingerprint 是 canonical 排序后的 NewsSourceRef identity；解析为对象后
 *   kind === 'committed_fact' 且 factId 与查询完全一致才算命中；
 * - 没有可解析结构（非 JSON / 非 committed_fact / 无 factId）返回 false；
 * - 删除所有 substring/includes 兜底（前缀/后缀/相邻 ID 均不匹配）。
 */
export function outboxHasFact(items: ProjectionOutboxItem[], factId: string): boolean {
  if (typeof factId !== 'string' || factId.length === 0 || !factId.startsWith('sha256:')) return false;
  for (const item of items) {
    const ref = parseStructuredSourceRef(item.sourceRefFingerprint);
    if (ref && ref.kind === 'committed_fact' && typeof ref.factId === 'string' && ref.factId === factId) return true;
  }
  return false;
}

/** 尝试把 sourceRefFingerprint 解析为结构化 NewsSourceRef；无法解析返回 null（不 throw）。 */
function parseStructuredSourceRef(raw: string): { kind?: string; factId?: unknown } | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw[0] !== '{') return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as { kind?: string; factId?: unknown };
  } catch {
    return null;
  }
}
