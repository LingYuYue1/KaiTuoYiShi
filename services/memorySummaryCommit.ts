// 记忆压缩确认编排：先持久化、后发布（允许保存成功/失败注入，供集中回归真实驱动）。
//
// 对齐全项目集中返修交接包 3.4：
// - 校验来源 fingerprint（缺失或来源已变化都拒绝提交，不发布新状态）；
// - 先保存包含 nextMemory+nextYiting 的同一负载；
// - 保存成功后才发布 React 状态并关闭审核；
// - 保存失败不发布新状态、不关闭审核结果（onPersistFailure 保持 review 允许重试）；
// - 不创建两个自动存档节点，不分别保存记忆和忆庭。

import type { 记忆系统 } from '@/models/memory';
import type { 忆庭系统 } from '@/models/yiting';

export interface MemorySummaryCommitInput {
  sourceFingerprint?: string;
  currentMemory: 记忆系统;
  nextMemory: 记忆系统;
  nextYiting: 忆庭系统;
}

export interface MemorySummaryCommitDeps {
  computeFingerprint: (memory: 记忆系统) => string;
  /** 构造同一负载（记忆与忆庭在同一存档节点中）。 */
  buildSavePayload: (overrides: { 记忆: 记忆系统; 忆庭: 忆庭系统 }) => unknown;
  saveGame: (payload: unknown) => Promise<unknown>;
  /** 保存成功后才发布；保存失败 / 校验失败时不调用。 */
  publish: (next: { memory: 记忆系统; yiting: 忆庭系统 }) => void;
  /** 保存成功后的元信息收尾（可选，如 commitActiveSaveTreeMeta / setHasSave）。 */
  afterSave?: (payload: unknown) => void;
  /** 校验失败（缺 fingerprint / 来源已变化）。 */
  onRejected: (reason: string) => void;
  /** 保存失败：不发布新状态、不关闭审核结果。 */
  onPersistFailure: (error: string) => void;
}

export type MemorySummaryCommitOutcome =
  | { committed: true }
  | { committed: false; reason: 'missing_fingerprint' | 'source_changed' | 'persist_failed'; error?: string };

/** 记忆压缩确认单一编排：校验来源 → 先持久化 → 成功才发布。 */
export async function commitMemorySummary(
  input: MemorySummaryCommitInput,
  deps: MemorySummaryCommitDeps,
): Promise<MemorySummaryCommitOutcome> {
  if (!input.sourceFingerprint) {
    deps.onRejected('该压缩结果缺少来源快照，已拒绝提交。请基于最新记忆重新总结。');
    return { committed: false, reason: 'missing_fingerprint' };
  }
  if (deps.computeFingerprint(input.currentMemory) !== input.sourceFingerprint) {
    deps.onRejected('确认时记忆已发生变化，旧压缩结果未覆盖新记忆。请基于最新记忆重新总结。');
    return { committed: false, reason: 'source_changed' };
  }
  const payload = deps.buildSavePayload({ 记忆: input.nextMemory, 忆庭: input.nextYiting });
  try {
    await deps.saveGame(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    deps.onPersistFailure(message);
    return { committed: false, reason: 'persist_failed', error: message };
  }
  deps.afterSave?.(payload);
  deps.publish({ memory: input.nextMemory, yiting: input.nextYiting });
  return { committed: true };
}
