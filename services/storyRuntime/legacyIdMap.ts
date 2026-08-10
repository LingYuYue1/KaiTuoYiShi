// G1.2.3 legacy ID map（生产，本阶段局部 DTO，不入冻结 schema、不持久化）。
// - 同一 legacy identity（legacyPath + legacyId）只能映射一个 target；
// - 同一 target 被两个不等价 identity 占用必须拒绝（unresolved + diagnostic，不静默吞并）；
// - map fingerprint 排除自身字段后按 canonical JSON 计算：重排对象键不变，改变任一映射语义必须变化；
// - 旧路径只用于审计展示，不能成为缺失 ID 时的语义主键。
import { normalizeLegacyText } from './normalization';
import { sha256Fingerprint } from './id';

export interface LegacyIdMapEntry {
  /** 旧路径（仅审计展示，不参与语义判定） */
  legacyPath: string;
  /** 旧稳定 ID；缺失时为空字符串 */
  legacyId: string;
  /** 目标 kind：series/chapter/segment/character/faction/location/constraint/timeline/route/occurrence/news_article/news_version */
  targetKind: string;
  /** 目标稳定 ID（sha256:…） */
  targetId: string;
  /** 来源 fingerprint（旧记录 canonical） */
  sourceFingerprint: string;
  /** 该条目的诊断（空 = 无） */
  diagnostics: string[];
}

export interface LegacyIdMap {
  entries: LegacyIdMapEntry[];
  diagnostics: string[];
  /** 排除自身字段后的 canonical fingerprint */
  fingerprint: string;
}

export interface LegacyIdMapBuildResult {
  map: LegacyIdMap;
  /** 被拒绝的冲突条目（同一 legacy identity 重复映射 / 同一 target 被不等价 identity 占用） */
  conflicts: Array<{ kind: string; detail: string }>;
}

/**
 * 构造 legacy ID map：先做冲突检查，再计算 fingerprint。
 * 冲突不静默吞并——进入 conflicts 与 map.diagnostics，且该条目不进入 entries。
 */
export async function buildLegacyIdMap(entries: LegacyIdMapEntry[]): Promise<LegacyIdMapBuildResult> {
  const conflicts: Array<{ kind: string; detail: string }> = [];
  const byLegacyIdentity = new Map<string, LegacyIdMapEntry>();
  const byTarget = new Map<string, LegacyIdMapEntry>();
  const accepted: LegacyIdMapEntry[] = [];
  const identityOf = (entry: LegacyIdMapEntry): string => {
    const legacyId = normalizeLegacyText(entry.legacyId);
    return legacyId.length > 0
      ? entry.targetKind + '::legacy-id::' + legacyId
      : entry.targetKind + '::source::' + entry.sourceFingerprint;
  };
  for (const entry of entries) {
    const legacyKey = identityOf(entry);
    const prevLegacy = byLegacyIdentity.get(legacyKey);
    if (prevLegacy) {
      const kind = prevLegacy.targetId === entry.targetId ? 'duplicate_source_identity' : 'legacy_identity_multi_target';
      conflicts.push({ kind, detail: legacyKey + ' -> ' + prevLegacy.targetId + ' vs ' + entry.targetId + '（路径仅审计: ' + prevLegacy.legacyPath + ' / ' + entry.legacyPath + '）' });
      continue;
    }
    byLegacyIdentity.set(legacyKey, entry);
    const targetKey = entry.targetKind + '::' + entry.targetId;
    const prevTarget = byTarget.get(targetKey);
    if (prevTarget) {
      const prevIdentity = identityOf(prevTarget);
      const curIdentity = identityOf(entry);
      if (prevIdentity !== curIdentity) {
        conflicts.push({ kind: 'target_multi_identity', detail: entry.targetId + ' 被 ' + prevIdentity + ' 与 ' + curIdentity + ' 占用（不等价）' });
        continue;
      }
    }
    byTarget.set(targetKey, entry);
    accepted.push(entry);
  }
  const diagnostics = conflicts.map((c) => c.kind + ': ' + c.detail);
  const map: LegacyIdMap = { entries: accepted, diagnostics, fingerprint: '' };
  map.fingerprint = await computeLegacyIdMapFingerprint(map);
  return { map, conflicts };
}

/**
 * 计算 map fingerprint：排除自身 fingerprint 字段后 canonical JSON 的 sha256。
 */
export async function computeLegacyIdMapFingerprint(map: LegacyIdMap): Promise<string> {
  const { fingerprint: _ignored, ...rest } = map;
  return sha256Fingerprint(rest);
}
