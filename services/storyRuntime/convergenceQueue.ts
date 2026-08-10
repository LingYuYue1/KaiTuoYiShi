// G1.3.1 convergenceQueue：交汇队列（只管理候选，不拥有事实写权）。
// - 玩家不接受交汇项 -> 保持 available/offered/declined，不能反向推进玩家焦点；
// - 状态改变必须有证据或明确命令来源；
// - 不直接写事实账本、不发布新闻、不授予知识。
import type { ConvergenceItem, ConvergenceItemStatus, GameTime, EvidenceRef, StoryRuntimeState } from '../../models/storyRuntime';
import type { IdAllocator } from './runtimeCore';

export type ConvergenceResult = { ok: true; state: StoryRuntimeState } | { ok: false; code: string; message: string };

const STATUS: ConvergenceItemStatus[] = ['available', 'offered', 'accepted', 'declined', 'expired', 'resolved'];

// D2：交汇状态正反矩阵（普通更新只能走表内正向推进；accepted/resolved/expired 终态不复活）。
const CONVERGENCE_TRANSITIONS: Record<ConvergenceItemStatus, ConvergenceItemStatus[]> = {
  available: ['offered', 'declined', 'expired', 'accepted', 'resolved'],
  offered: ['declined', 'expired', 'accepted', 'resolved'],
  declined: ['expired'],
  accepted: [],
  resolved: [],
  expired: [],
};

/** 交汇项状态推进：declined 后保持，不反向推进玩家焦点；accepted/resolved 必须有证据且引用存在；终态不复活。 */
export function updateConvergenceItem(
  state: StoryRuntimeState,
  input: {
    convergenceId: string;
    status: ConvergenceItemStatus;
    sourceFactIds?: string[];
    eligiblePlanItemIds?: string[];
    expiresAt?: GameTime;
    evidenceRefs?: EvidenceRef[];
  },
): ConvergenceResult {
  if (!STATUS.includes(input.status)) return { ok: false, code: 'INVALID_COMMAND', message: '非法交汇状态: ' + input.status };
  const existing = state.convergenceQueue.find((c) => c.convergenceId === input.convergenceId);
  if (!existing) return { ok: false, code: 'CONFLICT', message: '交汇项不存在: ' + input.convergenceId };
  // 正反矩阵：普通更新只能走表内正向推进；accepted/resolved/expired 终态不能由普通更新回到 available/offered/declined。
  if (input.status !== existing.status && !(CONVERGENCE_TRANSITIONS[existing.status] ?? []).includes(input.status)) {
    return { ok: false, code: 'CONFLICT', message: '非法交汇迁移: ' + existing.status + ' -> ' + input.status + '（' + input.convergenceId + '）' };
  }
  if ((input.status === 'accepted' || input.status === 'resolved') && (!input.evidenceRefs || input.evidenceRefs.length === 0)) {
    return { ok: false, code: 'MISSING_EVIDENCE', message: '接受/结算交汇项必须有证据: ' + input.convergenceId };
  }
  // 引用存在性：sourceFactIds / eligiblePlanItemIds 必须存在。
  for (const factId of input.sourceFactIds ?? []) {
    if (!state.factLedger.some((f) => f.factId === factId)) return { ok: false, code: 'CONFLICT', message: '交汇来源事实不存在: ' + factId };
  }
  for (const planId of input.eligiblePlanItemIds ?? []) {
    if (!state.playerPlanPool.some((x) => x.planItemId === planId) && !state.worldPlanPool.some((x) => x.planItemId === planId)) {
      return { ok: false, code: 'CONFLICT', message: 'eligible plan 不存在: ' + planId };
    }
  }
  if (input.status === 'declined') {
    // 玩家不接受 -> 保持 declined，不反向推进玩家焦点（世界后台仍可运行）。
    const next: ConvergenceItem = { ...existing, status: 'declined' };
    if (input.expiresAt !== undefined) next.expiresAt = input.expiresAt;
    else if (existing.expiresAt !== undefined) next.expiresAt = existing.expiresAt;
    return { ok: true, state: { ...state, convergenceQueue: state.convergenceQueue.map((c) => (c.convergenceId === input.convergenceId ? next : c)) } };
  }
  const next: ConvergenceItem = {
    ...existing,
    status: input.status,
    sourceFactIds: input.sourceFactIds ?? existing.sourceFactIds,
    eligiblePlanItemIds: input.eligiblePlanItemIds ?? existing.eligiblePlanItemIds,
    evidenceRefs: input.evidenceRefs ?? existing.evidenceRefs,
  };
  if (input.expiresAt !== undefined) next.expiresAt = input.expiresAt;
  else if (existing.expiresAt !== undefined) next.expiresAt = existing.expiresAt;
  return { ok: true, state: { ...state, convergenceQueue: state.convergenceQueue.map((c) => (c.convergenceId === input.convergenceId ? next : c)) } };
}

/** 入队交汇项（不立即推进玩家焦点）。 */
export async function enqueueConvergence(
  state: StoryRuntimeState,
  input: {
    convergenceId: string;
    sourceFactIds: string[];
    eligiblePlanItemIds: string[];
    playerDecisionRequired: boolean;
    expiresAt?: GameTime;
    evidenceRefs?: EvidenceRef[];
    allocator: IdAllocator;
  },
): Promise<ConvergenceResult> {
  if (state.convergenceQueue.some((c) => c.convergenceId === input.convergenceId)) {
    return { ok: false, code: 'ALREADY_APPLIED', message: '交汇项已存在: ' + input.convergenceId };
  }
  const item: ConvergenceItem = {
    convergenceId: input.convergenceId,
    sourceFactIds: input.sourceFactIds,
    status: 'available',
    eligiblePlanItemIds: input.eligiblePlanItemIds,
    playerDecisionRequired: input.playerDecisionRequired,
    evidenceRefs: input.evidenceRefs ?? [],
  };
  if (input.expiresAt !== undefined) item.expiresAt = input.expiresAt;
  return { ok: true, state: { ...state, convergenceQueue: [...state.convergenceQueue, item] } };
}
