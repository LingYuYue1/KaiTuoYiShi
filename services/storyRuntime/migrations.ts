// G1.3.2.1 migrations：旧存档 raw payload 保留、legacy ID map、迁移报告、幂等迁移和显式确认状态机。
// 迁移顺序固定（§6.4）：
//   readRawSavePayload -> preserveRawFingerprint -> resolveLegacyIdMap -> detectCursorConflicts
//   -> produceMigrationReport -> explicitConfirmation -> normalizeToV3
// - P1-3（G1.3.2.1）：runtimeSegmentId 与 seriesGroup/systemGroup 不一致、显式 ID 缺失或候选为空时
//   必须进入 pending_confirmation 只读状态；报告输出完整、去重、确定性排序的候选；
//   显式确认只接受候选列表中的精确 ID，任意字符串/空白/未知 ID/重复候选都不得推进。
// - P2-1（G1.3.2.1）：produceMigrationReport 的时间字段由 source fingerprint 确定性导出（非 Date.now 身份），
//   同一 raw fingerprint/id map/冲突列表/core 状态无 previous/journal 时也产生完全相同 canonical bytes。
// - 多游标冲突 -> pending_confirmation、只读、带候选列表，不得自动选择；
// - 缺省旧 ID 的稳定映射必须持久化，同一 source fingerprint 重跑字节级稳定，不新增事件/文章/回执；
// - 迁移失败保留原始 payload 与旧存档，输出可读 migrationReport，不覆盖原记录。
import type { RuntimeMigrationMeta, RuntimeMigrationStatus } from '../../models/storyRuntime';
import type { RawLegacyPayload } from './rawLegacyReader';
import { sha256Fingerprint } from './id';
import { canonicalJsonStringify } from './normalization';

export type MigrationCursorConflict =
  | { kind: 'id_mismatch'; explicitSegmentId: string | null; runtimeSegmentId: string | null; seriesGroup: number | null; systemGroup: number | null }
  | { kind: 'group_mismatch'; runtimeSegmentId: string | null; seriesGroup: number | null; systemGroup: number | null }
  | { kind: 'missing_explicit'; candidates: string[] };

/**
 * P1-4（G1.3.2.2）：候选展示列表（确定性去重排序），同时保留重复来源标记。
 * candidateSources：source -> 出现次数；重复来源必须在报告中明确指出（不得用去重代替人工确认）。
 */
export interface MigrationCandidates {
  /** 去重排序后的候选展示列表（用于 UI/报告展示）。 */
  unique: string[];
  /** 每个候选的来源计数（>1 表示重复来源，必须保持 pending_confirmation）。 */
  sources: Record<string, number>;
}

/** P1-4：构建候选（去重展示 + 来源计数）。 */
export function buildCandidates(raw: unknown, legacyIdMap: Record<string, string>): MigrationCandidates {
  const sources: Record<string, number> = {};
  const add = (id: string): void => {
    if (typeof id !== 'string' || id.trim().length === 0) return;
    sources[id] = (sources[id] ?? 0) + 1;
  };
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.currentSegmentId === 'string') add(obj.currentSegmentId);
    if (typeof obj.runtimeSegmentId === 'string') add(obj.runtimeSegmentId);
  }
  if (typeof legacyIdMap.currentSegmentId === 'string') add(legacyIdMap.currentSegmentId);
  return { unique: Object.keys(sources).sort(), sources };
}

export interface MigrationReport {
  sourceFingerprint: string;
  rawFieldPaths: string[];
  rawPayloadPreserved: boolean;
  status: RuntimeMigrationStatus;
  legacyIdMap: Record<string, string>;
  cursorConflicts: MigrationCursorConflict[];
  warnings: string[];
  createdAt: number;
}

export interface MigrationDecision {
  /** pending_confirmation 时由玩家/调用方显式选择的候选 segmentId（只接受候选列表中的精确 ID）。 */
  selectedSegmentId?: string;
}

/**
 * 解析旧 ID 的稳定映射（缺省旧 ID）：对同一 source fingerprint 结果字节级稳定。
 * legacyIdMap 由明确显式 ID 组成；缺省项用确定性 stable hash 生成（不含时间/随机/下标）。
 */
export async function resolveLegacyIdMap(raw: unknown): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (raw === null || typeof raw !== 'object') return map;
  const obj = raw as Record<string, unknown>;
  // 旧存档显式 ID 字段（若存在）直接保留为稳定 key。
  const explicitIds = ['currentSegmentId', 'currentSeriesId', 'currentTrackId', 'rootId', 'nodeId'];
  for (const key of explicitIds) {
    const value = obj[key];
    if (typeof value === 'string' && value.length > 0) map[key] = value;
  }
  // 缺省旧 ID：确定性 stable hash（namespace + canonical 内容），不含时间/随机。
  const { legacyIdMap: _ignored, ...payload } = obj;
  const fingerprint = await sha256Fingerprint(payload);
  for (const key of explicitIds) {
    if (map[key] === undefined) map[key] = 'sha256:' + fingerprint.slice(7).slice(0, 12) + ':' + key;
  }
  return map;
}

/**
 * P1-3（G1.3.2.1）：检测多游标冲突。完整、去重、确定性排序的候选由 legacyIdMap + 显式字段推出：
 * - 显式当前分段 ID 存在但与 runtime 同 ID / 组号不一致 -> id_mismatch；
 * - 显式 ID 缺失但 runtimeSegmentId 存在且 seriesGroup != systemGroup -> group_mismatch（补全旧实现漏掉的组合）；
 * - 显式 ID 缺失、无 runtime 且组号矛盾 -> missing_explicit（候选为空）。
 */
export function detectCursorConflicts(raw: unknown, legacyIdMap: Record<string, string>): MigrationCursorConflict[] {
  const conflicts: MigrationCursorConflict[] = [];
  if (raw === null || typeof raw !== 'object') return conflicts;
  const obj = raw as Record<string, unknown>;
  const explicitSegmentId = typeof obj.currentSegmentId === 'string' && obj.currentSegmentId.length > 0 ? obj.currentSegmentId : null;
  const runtimeSegmentId = typeof obj.runtimeSegmentId === 'string' && obj.runtimeSegmentId.length > 0 ? obj.runtimeSegmentId : null;
  const seriesGroup = typeof obj.seriesGroup === 'number' ? obj.seriesGroup : null;
  const systemGroup = typeof obj.systemGroup === 'number' ? obj.systemGroup : null;
  const candidates = buildCandidates(raw, legacyIdMap);
  if (explicitSegmentId !== null) {
    const runtimeMatches = runtimeSegmentId === null || runtimeSegmentId === explicitSegmentId;
    const groupMatches = seriesGroup === null || systemGroup === null || seriesGroup === systemGroup;
    if (!runtimeMatches || !groupMatches) {
      conflicts.push({ kind: 'id_mismatch', explicitSegmentId, runtimeSegmentId, seriesGroup, systemGroup });
    }
  } else if (runtimeSegmentId !== null && seriesGroup !== null && systemGroup !== null && seriesGroup !== systemGroup) {
    // P1-3：旧实现漏掉的组合——显式 ID 缺失但 runtime 段存在且组号矛盾。
    conflicts.push({ kind: 'group_mismatch', runtimeSegmentId, seriesGroup, systemGroup });
  } else if (explicitSegmentId === null && runtimeSegmentId === null && seriesGroup !== null && systemGroup !== null && seriesGroup !== systemGroup) {
    conflicts.push({ kind: 'missing_explicit', candidates: candidates.unique });
  }
  return conflicts;
}

/**
 * 幂等迁移：同一 sourceFingerprint 已迁移 -> 返回既有报告（字节稳定，不新增实体）。
 * P2-1：新建报告时 createdAt 由 sourceFingerprint 确定性导出（前 16 hex 转非负整数），不用 Date.now()；
 * 同一输入（无 previous/journal）两次产生完全相同 canonical bytes。
 * status 决策：cursorConflicts 非空 -> pending_confirmation；损坏/缺核心 -> read_only_recovery；否则 migrated。
 */
export async function produceMigrationReport(
  raw: RawLegacyPayload,
  legacyIdMap: Record<string, string>,
  cursorConflicts: MigrationCursorConflict[],
  coreAvailable: boolean,
  previous?: MigrationReport | null,
): Promise<MigrationReport> {
  if (previous && previous.sourceFingerprint === raw.canonicalFingerprint) {
    return previous; // 幂等：同源重跑字节级稳定
  }
  const warnings: string[] = [];
  let status: RuntimeMigrationStatus = 'migrated';
  if (cursorConflicts.length > 0) {
    status = 'pending_confirmation';
    warnings.push('多游标冲突：显式分段/同 ID runtime/系列组号/系统组号不一致，保持只读并等待确认，不自动选择');
  } else if (!coreAvailable) {
    status = 'read_only_recovery';
    warnings.push('缺少可迁移的核心 runtime：进入只读恢复，不从新闻/投影/旧字符串反推核心事实');
  }
  const source = raw.canonicalFingerprint ?? 'sha256:unknown';
  return {
    sourceFingerprint: source,
    rawFieldPaths: raw.fieldPaths,
    rawPayloadPreserved: true,
    status,
    legacyIdMap,
    cursorConflicts,
    warnings,
    createdAt: deterministicCreatedAt(source),
  };
}

/** P2-1：由 source fingerprint 确定性导出时间（非身份字段，仅展示/排序；同一源永远同值）。 */
function deterministicCreatedAt(sourceFingerprint: string): number {
  const hex = sourceFingerprint.startsWith('sha256:') ? sourceFingerprint.slice(7) : sourceFingerprint;
  return parseInt(hex.slice(0, 16), 16) || 0;
}

/**
 * P1-3（G1.3.2.1）：显式确认——只接受候选列表中的精确 ID。
 * 任意字符串、空白、未知 ID 和重复候选都不得推进；未通过确认不得 normalize 或写新 core。
 */
export function explicitConfirmation(report: MigrationReport, decision: MigrationDecision): MigrationReport {
  if (report.status !== 'pending_confirmation') return report;
  const selected = decision.selectedSegmentId;
  if (typeof selected !== 'string' || selected.trim().length === 0) return report; // 空白/缺省 -> 保持 pending
  const candidates = buildCandidateListFromReport(report);
  if (!candidates.unique.includes(selected)) return report; // 未知 ID -> 保持 pending_confirmation 只读
  // P1-4：重复来源候选不得直接迁移（去重不能代替人工确认歧义）。
  if ((candidates.sources[selected] ?? 0) > 1) return report;
  return {
    ...report,
    status: 'migrated',
    legacyIdMap: { ...report.legacyIdMap, currentSegmentId: selected },
    warnings: [...report.warnings, '玩家已显式确认分段选择: ' + selected],
  };
}

/**
 * P1-3/P1-4：从 report 的冲突候选 + legacyIdMap 重建候选（去重展示 + 来源计数）。
 * 来源计数规则：
 * - missing_explicit.candidates 数组内的重复项是真正的歧义（同一列表出现两次同一 ID）-> 计数 +1/项；
 * - id_mismatch.explicitSegmentId / group_mismatch.runtimeSegmentId 是独立来源 -> 各计 +1；
 * - legacyIdMap.currentSegmentId 若与 explicitSegmentId 相同（由同一显式 ID 派生）不算重复来源。
 */
function buildCandidateListFromReport(report: MigrationReport): MigrationCandidates {
  const sources: Record<string, number> = {};
  for (const conflict of report.cursorConflicts) {
    if (conflict.kind === 'missing_explicit') {
      for (const c of conflict.candidates) {
        if (typeof c !== 'string' || c.trim().length === 0) continue;
        sources[c] = (sources[c] ?? 0) + 1; // 列表内重复 -> 歧义
      }
    }
  }
  const single = new Set<string>();
  for (const conflict of report.cursorConflicts) {
    if (conflict.kind === 'id_mismatch' && conflict.explicitSegmentId) single.add(conflict.explicitSegmentId);
    if (conflict.kind === 'group_mismatch' && conflict.runtimeSegmentId) single.add(conflict.runtimeSegmentId);
  }
  // legacyIdMap.currentSegmentId 始终是同一原始字段的派生回声，不构成独立来源，不计入来源计数。
  for (const id of single) sources[id] = (sources[id] ?? 0) + 1;
  return { unique: Object.keys(sources).sort(), sources };
}

export { canonicalJsonStringify, sha256Fingerprint };
export type { RuntimeMigrationMeta, RuntimeMigrationStatus };
