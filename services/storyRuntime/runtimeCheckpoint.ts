// G1.3.2.1 runtimeCheckpoint：StoryRuntimeCheckpoint / StoryRuntimeBundle、active-runtime pointer、save-tree 节点映射、
// pre-turn / commit / reveal 恢复锚点。
// - P1-1（G1.3.2.1）：checkpoint 创建时深拷贝（结构化克隆）core/projection/outbox，创建后篡改原对象
//   或恢复结果都不能反向污染快照；保存的三类 fingerprint 必须对应快照；
//   restoreFromCheckpoint 返回保留或重新计算的真实 fingerprint（不允许空字符串）。
// - pre-turn checkpoint 在 user 发送前创建（不可变）；
// - abort/终止提交前恢复同 branch 完整 checkpoint，只删除未提交 draft/临时投影；
// - commit 后 reroll 从 pre-turn save node 创建新 branch，恢复完整 checkpoint 与对应 projection/outbox 快照；旧 branch 不可变；
// - commit 后、正文 reveal 前崩溃：NarrativePublicationRecord 按 publicationId + bodyFingerprint + commitReceiptId 幂等恢复同一正文一次；
//   reveal 后、标记前崩溃按 revealMessageId 去重；
// - pre-turn snapshot 只保存运行引用与必要状态，不复制完整 catalog 或二进制资产。
import type { StoryRuntimeState, StoryProjectionState } from '../../models/storyRuntime';
import type { ProjectionOutboxItem } from '../../models/storyRuntimeProjection';
import type { NarrativePublicationRecord } from '../../models/storyRuntimeNarrative';
import type { RuntimePointer } from './coreRuntimeStore';
import { sha256Fingerprint } from './id';

export interface StoryRuntimeCheckpoint {
  checkpointId: string;
  kind: 'pre_turn' | 'commit' | 'reveal';
  runtimeBranchId: string;
  saveNodeId: string;
  runtimeRevision: number;
  core: StoryRuntimeState;
  projections: StoryProjectionState;
  outbox: ProjectionOutboxItem[];
  /** 聊天水位：checkpoint 创建时的消息条数（非身份元数据，仅恢复定位）。 */
  chatWatermark: number;
  /** 未提交 draft 标识：true 表示该 checkpoint 之后存在未提交正文/临时投影。 */
  hasUncommittedDraft: boolean;
  createdAt: number;
  /** 可选：commit 后正文 reveal 前崩溃恢复锚点。 */
  narrativePublication?: NarrativePublicationRecord;
  /** 可选：reveal 后标记前崩溃去重锚点。 */
  revealMessageId?: string;
  /** 可选：reroll 时从该 pre-turn node 派生新分支的旧 branch。 */
  sourceBranchId?: string;
  /** P1-1：快照对应的三类 fingerprint（与快照 canonical bytes 相等）。 */
  coreFingerprint: string;
  projectionFingerprint: string;
  outboxFingerprint: string;
}

export interface StoryRuntimeBundle {
  schemaVersion: 3;
  runtimeBranchId: string;
  saveNodeId: string;
  runtimeRevision: number;
  assetCatalogFingerprint: string;
  core: StoryRuntimeState;
  projections: StoryProjectionState;
  outbox: ProjectionOutboxItem[];
  coreFingerprint: string;
  projectionFingerprint: string;
  outboxFingerprint: string;
}

/** P1-1：深拷贝（结构化克隆等价）。数据都是纯 JSON，JSON round-trip 是安全等价。 */
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 从 core/projection/outbox 组装 Bundle 并计算三类 fingerprint（确定性 canonical）。 */
export async function buildRuntimeBundle(
  core: StoryRuntimeState,
  projections: StoryProjectionState,
  outbox: ProjectionOutboxItem[],
): Promise<StoryRuntimeBundle> {
  return {
    schemaVersion: 3,
    runtimeBranchId: core.runtimeBranchId,
    saveNodeId: core.saveNodeId,
    runtimeRevision: core.runtimeRevision,
    assetCatalogFingerprint: core.assetCatalogFingerprint,
    core,
    projections,
    outbox,
    coreFingerprint: await sha256Fingerprint(core),
    projectionFingerprint: await sha256Fingerprint(projections),
    outboxFingerprint: await sha256Fingerprint(outbox),
  };
}

/** P1-1：创建不可变 pre-turn checkpoint（user 发送前）——深拷贝快照，保存与快照一致的真实 fingerprint。 */
export async function createPreTurnCheckpoint(
  checkpointId: string,
  bundle: StoryRuntimeBundle,
  chatWatermark: number,
  pointer: RuntimePointer,
): Promise<StoryRuntimeCheckpoint> {
  const core = deepClone(bundle.core);
  const projections = deepClone(bundle.projections);
  const outbox = deepClone(bundle.outbox);
  return {
    checkpointId,
    kind: 'pre_turn',
    runtimeBranchId: bundle.runtimeBranchId,
    saveNodeId: pointer.saveNodeId,
    runtimeRevision: pointer.runtimeRevision,
    core,
    projections,
    outbox,
    chatWatermark,
    hasUncommittedDraft: false,
    createdAt: Date.now(),
    coreFingerprint: await sha256Fingerprint(core),
    projectionFingerprint: await sha256Fingerprint(projections),
    outboxFingerprint: await sha256Fingerprint(outbox),
  };
}

export type RestoreCheckpointResult =
  | { ok: true; bundle: StoryRuntimeBundle }
  | { ok: false; code: 'CHECKPOINT_CORRUPT'; message: string };

/**
 * P1-1/P1-3（G1.3.2.1/2.2）：从 pre-turn checkpoint 恢复（abort / 终止提交前 / reroll 前）：
 * - 恢复前重新计算并比较三类 fingerprint、branch、revision、save node 与 schema；
 *   任一快照字段被篡改 -> 返回稳定 CHECKPOINT_CORRUPT（只读恢复），不得返回成功 bundle；
 * - 未篡改时返回保留/重算的真实 fingerprint（非空）；
 * - 恢复结果再被篡改也不得反向污染 checkpoint（返回深拷贝）。
 */
export async function restoreFromCheckpoint(checkpoint: StoryRuntimeCheckpoint): Promise<RestoreCheckpointResult> {
  const core = deepClone(checkpoint.core);
  const projections = deepClone(checkpoint.projections);
  const outbox = deepClone(checkpoint.outbox);
  // P1-3：完整性验证——三类 fingerprint 必须与快照 canonical bytes 一致。
  const coreFp = await sha256Fingerprint(core);
  const projectionFp = await sha256Fingerprint(projections);
  const outboxFp = await sha256Fingerprint(outbox);
  if (coreFp !== checkpoint.coreFingerprint) {
    return { ok: false, code: 'CHECKPOINT_CORRUPT', message: 'checkpoint core fingerprint 不匹配（快照被篡改）' };
  }
  if (projectionFp !== checkpoint.projectionFingerprint) {
    return { ok: false, code: 'CHECKPOINT_CORRUPT', message: 'checkpoint projection fingerprint 不匹配（快照被篡改）' };
  }
  if (outboxFp !== checkpoint.outboxFingerprint) {
    return { ok: false, code: 'CHECKPOINT_CORRUPT', message: 'checkpoint outbox fingerprint 不匹配（快照被篡改）' };
  }
  // branch/revision/save node/schema 一致性。
  if (core.runtimeBranchId !== checkpoint.runtimeBranchId || core.runtimeRevision !== checkpoint.runtimeRevision || core.saveNodeId !== checkpoint.saveNodeId || core.schemaVersion !== 3) {
    return { ok: false, code: 'CHECKPOINT_CORRUPT', message: 'checkpoint branch/revision/save node/schema 不一致（快照被篡改）' };
  }
  return {
    ok: true,
    bundle: {
      schemaVersion: 3,
      runtimeBranchId: checkpoint.runtimeBranchId,
      saveNodeId: checkpoint.saveNodeId,
      runtimeRevision: checkpoint.runtimeRevision,
      assetCatalogFingerprint: core.assetCatalogFingerprint,
      core,
      projections,
      outbox,
      coreFingerprint: coreFp,
      projectionFingerprint: projectionFp,
      outboxFingerprint: outboxFp,
    },
  };
}

/**
 * commit 后、正文 reveal 前崩溃恢复：NarrativePublicationRecord 幂等恢复同一正文一次。
 * 判定规则：publicationId + bodyFingerprint + commitReceiptId 三元组相同视为同一 publication，
 * 返回该 record（调用方据此不重复 reveal）；如果已有 revealMessageId 则已 reveal，不重复。
 */
export function recoverPublicationOnce(
  publications: NarrativePublicationRecord[],
  publicationId: string,
  bodyFingerprint: string,
  commitReceiptId: string,
): { recovered: NarrativePublicationRecord | null; alreadyRevealed: boolean } {
  const match = publications.find(
    (p) => p.publicationId === publicationId && p.bodyFingerprint === bodyFingerprint && p.commitReceiptId === commitReceiptId,
  );
  if (!match) return { recovered: null, alreadyRevealed: false };
  if (match.revealMessageId) return { recovered: match, alreadyRevealed: true };
  return { recovered: match, alreadyRevealed: false };
}

/** reveal 后、标记前崩溃：按 revealMessageId 去重（已有同 revealMessageId 的记录视为已 reveal）。 */
export function isRevealDeduplicated(publications: NarrativePublicationRecord[], revealMessageId: string): boolean {
  return publications.some((p) => p.revealMessageId === revealMessageId);
}
