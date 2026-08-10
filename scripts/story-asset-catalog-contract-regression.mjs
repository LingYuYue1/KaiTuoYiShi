// G1.1.2.1 资产目录契约回归（重构版）：story-asset-catalog.sample.json 必须满足 4.2 最小资产 schema 的全部机器校验。
// schema 唯一来源：scripts/fixtures/story-v3/story-runtime-contract.fixture.json。
// - 子任务 A：递归实例校验由 scripts/story-runtime-fixture-instance-validator.mjs 承担（fixture 驱动，不复制 oracle）；
// - 子任务 B：catalog 引用/ordinal/range 闭环；
// - 子任务 C：occurrence 通过显式 eventDefinitionIds[] 绑定事件定义；
// - 子任务 D：player_optional canonical default 与 world_background/player_early/unique+forbidden 机器规则；
// - 子任务 E：manifest 普通/更新共用同一 validateAssetCatalogSample 闸门；
// - 子任务 F：五种 occurrence subject 参数化通用性证明（无敌人名称黑名单）。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { CONTRACT_FIXTURE_PATH, canonicalJsonStringify, computeContractFingerprint, readContractFixture, validateContractFixture } from './story-runtime-contract-regression.mjs';
import { validateValueAgainstType, validateValueAgainstSpec, tryValidateValue } from './story-runtime-fixture-instance-validator.mjs';

export const ASSET_SAMPLE_PATH = path.join('scripts', 'fixtures', 'story-v3', 'story-asset-catalog.sample.json');
export const CONTRACT_MANIFEST_SCHEMA = 'story-v3-contract-manifest@2';

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

// ── fingerprint：canonical JSON（键递归排序、数组保序）排除自身指纹字段后 sha256；相同输入两次字节级一致 ──
export function assetFingerprint(obj, ...excludeKeys) {
  const clone = { ...obj };
  for (const key of excludeKeys) delete clone[key];
  return 'sha256:' + crypto.createHash('sha256').update(canonicalJsonStringify(clone), 'utf8').digest('hex');
}

export function computeCatalogFingerprint(catalog) {
  return assetFingerprint(catalog, 'catalogFingerprint');
}

// 重算全部记录级指纹 + catalog 指纹（负例在篡改后调用；指纹自洽不代表语义合法）。
export function recomputeSampleFingerprints(sample) {
  for (const record of sample.series) record.seriesFingerprint = assetFingerprint(record, 'seriesFingerprint');
  for (const record of sample.chapters) {
    record.contentFingerprint = assetFingerprint(record, 'contentFingerprint', 'chapterFingerprint');
    record.chapterFingerprint = assetFingerprint(record, 'chapterFingerprint');
  }
  for (const record of sample.segments) record.segmentFingerprint = assetFingerprint(record, 'segmentFingerprint');
  for (const record of sample.characterProfiles) record.profileFingerprint = assetFingerprint(record, 'profileFingerprint');
  for (const record of sample.factionProfiles) record.profileFingerprint = assetFingerprint(record, 'profileFingerprint');
  for (const record of sample.locationProfiles) record.profileFingerprint = assetFingerprint(record, 'profileFingerprint');
  for (const record of sample.constraints) record.constraintFingerprint = assetFingerprint(record, 'constraintFingerprint');
  for (const record of sample.visibilityHints) record.hintFingerprint = assetFingerprint(record, 'hintFingerprint');
  for (const record of sample.timelineEntries) record.timelineFingerprint = assetFingerprint(record, 'timelineFingerprint');
  for (const record of sample.routePolicies) record.routeFingerprint = assetFingerprint(record, 'routeFingerprint');
  for (const record of sample.occurrenceDefinitions) record.definitionFingerprint = assetFingerprint(record, 'definitionFingerprint');
  for (const record of sample.eventDefinitions) record.definitionFingerprint = assetFingerprint(record, 'definitionFingerprint');
  sample.catalogFingerprint = computeCatalogFingerprint(sample);
  return sample;
}

// ── 子任务 B：catalog 引用/ordinal/range 闭环 ──
function assertReferenceIntegrity(sample) {
  const uniqueId = (list, field, ns) => {
    const seen = new Set();
    for (const record of list) {
      const id = record[field];
      assert(typeof id === 'string' && id.length > 0, ns + ' 存在空 ID');
      assert(!seen.has(id), ns + ' ID 重复: ' + id);
      seen.add(id);
    }
    return seen;
  };
  const noDupInArray = (arr, what) => {
    assert(new Set(arr).size === arr.length, what + ' 内部出现重复 ID: ' + JSON.stringify(arr));
  };
  const seriesIds = uniqueId(sample.series, 'seriesId', 'series');
  const chapterIds = uniqueId(sample.chapters, 'chapterId', 'chapters');
  const segmentIds = uniqueId(sample.segments, 'segmentId', 'segments');
  const characterIds = uniqueId(sample.characterProfiles, 'characterProfileId', 'characterProfiles');
  const factionIds = uniqueId(sample.factionProfiles, 'factionProfileId', 'factionProfiles');
  const locationIds = uniqueId(sample.locationProfiles, 'locationProfileId', 'locationProfiles');
  const constraintIds = uniqueId(sample.constraints, 'constraintId', 'constraints');
  const hintIds = uniqueId(sample.visibilityHints, 'visibilityHintId', 'visibilityHints');
  const timelineIds = uniqueId(sample.timelineEntries, 'timelineEntryId', 'timelineEntries');
  const routeIds = uniqueId(sample.routePolicies, 'routePolicyId', 'routePolicies');
  const occurrenceIds = uniqueId(sample.occurrenceDefinitions, 'occurrenceDefinitionId', 'occurrenceDefinitions');
  const eventDefIds = uniqueId(sample.eventDefinitions, 'eventDefinitionId', 'eventDefinitions');
  const ref = (set, id, what) => assert(set.has(id), '悬空引用: ' + what + ' -> ' + id);
  const refAll = (list, set, what) => {
    noDupInArray(list, what);
    for (const id of list) ref(set, id, what);
  };

  for (const record of sample.series) {
    refAll(record.chapterIds, chapterIds, 'series.chapterIds');
    refAll(record.segmentIds, segmentIds, 'series.segmentIds');
    refAll(record.openingSegmentIds, segmentIds, 'series.openingSegmentIds');
    if (record.defaultRoutePolicyId) ref(routeIds, record.defaultRoutePolicyId, 'series.defaultRoutePolicyId');
  }
  for (const record of sample.chapters) ref(seriesIds, record.seriesId, 'chapter.seriesId');
  for (const record of sample.segments) {
    ref(seriesIds, record.seriesId, 'segment.seriesId');
    refAll(record.chapterRange.chapterIds, chapterIds, 'segment.chapterRange.chapterIds');
    refAll(record.hardConstraintIds, constraintIds, 'segment.hardConstraintIds');
    refAll(record.foreshadowConstraintIds, constraintIds, 'segment.foreshadowConstraintIds');
    refAll(record.characterProfileIds, characterIds, 'segment.characterProfileIds');
    refAll(record.factionProfileIds, factionIds, 'segment.factionProfileIds');
    refAll(record.locationProfileIds, locationIds, 'segment.locationProfileIds');
    refAll(record.eventDefinitionIds, eventDefIds, 'segment.eventDefinitionIds');
    refAll(record.timelineEntryIds, timelineIds, 'segment.timelineEntryIds');
    ref(routeIds, record.routePolicyId, 'segment.routePolicyId');
    refAll(record.dependencySegmentIds, segmentIds, 'segment.dependencySegmentIds');
    refAll(record.consequenceSegmentIds, segmentIds, 'segment.consequenceSegmentIds');
  }
  for (const record of sample.characterProfiles) {
    refAll(record.factionProfileIds, factionIds, 'character.factionProfileIds');
    if (record.firstAppearanceSegmentId) ref(segmentIds, record.firstAppearanceSegmentId, 'character.firstAppearanceSegmentId');
  }
  for (const record of sample.factionProfiles) {
    refAll(record.territoryLocationIds, locationIds, 'faction.territoryLocationIds');
    refAll(record.representativeCharacterIds, characterIds, 'faction.representativeCharacterIds');
    if (record.firstAppearanceSegmentId) ref(segmentIds, record.firstAppearanceSegmentId, 'faction.firstAppearanceSegmentId');
  }
  for (const record of sample.locationProfiles) {
    if (record.parentLocationId) ref(locationIds, record.parentLocationId, 'location.parentLocationId');
    refAll(record.factionProfileIds, factionIds, 'location.factionProfileIds');
    refAll(record.facilityOccurrenceDefinitionIds, occurrenceIds, 'location.facilityOccurrenceDefinitionIds');
    if (record.firstAppearanceSegmentId) ref(segmentIds, record.firstAppearanceSegmentId, 'location.firstAppearanceSegmentId');
  }
  for (const record of sample.constraints) {
    refAll(record.segmentIds, segmentIds, 'constraint.segmentIds');
    if (record.visibilityHintId) ref(hintIds, record.visibilityHintId, 'constraint.visibilityHintId');
  }
  for (const record of sample.timelineEntries) {
    ref(segmentIds, record.segmentId, 'timeline.segmentId');
    refAll(record.eventDefinitionIds, eventDefIds, 'timeline.eventDefinitionIds');
  }
  for (const record of sample.routePolicies) {
    refAll(record.alternativeSegmentIds, segmentIds, 'route.alternativeSegmentIds');
    refAll(record.consequenceSegmentIds, segmentIds, 'route.consequenceSegmentIds');
    refAll(record.expiresAfterSegmentIds, segmentIds, 'route.expiresAfterSegmentIds');
  }
  // G1.1.2.3 C：稳定 subject ID 必须处于 canonical form——非空 string、=== trim()（无首尾空白）、
  // === normalize('NFC')（禁止 Unicode 等价但字节不同的 ID）；只拒绝，不静默 trim/normalize 或写回。
  const assertCanonicalSubjectId = (value, fieldPath, where) => {
    assert(typeof value === 'string' && value.trim().length > 0, fieldPath + ' 必须非空: ' + where);
    assert(value === value.trim(), fieldPath + ' 必须等于自身 trim()（禁止首尾空白）: ' + JSON.stringify(value) + '（' + where + '）');
    assert(value === value.normalize('NFC'), fieldPath + ' 必须等于自身 normalize(NFC)（禁止 Unicode 等价写法）: ' + JSON.stringify(value) + '（' + where + '）');
  };
  for (const record of sample.occurrenceDefinitions) {
    const subject = record.subject;
    // C1：稳定 subject ID 必须非空（trim 后仍有内容），不能靠悬空引用兜底拒绝。
    if (subject.kind === 'event') {
      assertCanonicalSubjectId(subject.eventDefinitionId, 'occurrence.subject.eventDefinitionId', record.occurrenceDefinitionId);
      ref(eventDefIds, subject.eventDefinitionId, 'occurrence.subject.eventDefinitionId');
    }
    if (subject.kind === 'character') {
      assertCanonicalSubjectId(subject.characterProfileId, 'occurrence.subject.characterProfileId', record.occurrenceDefinitionId);
      ref(characterIds, subject.characterProfileId, 'occurrence.subject.characterProfileId');
    }
    if (subject.kind === 'facility') {
      assertCanonicalSubjectId(subject.facilityId, 'occurrence.subject.facilityId', record.occurrenceDefinitionId);
      assertCanonicalSubjectId(subject.locationProfileId, 'occurrence.subject.locationProfileId', record.occurrenceDefinitionId);
      ref(locationIds, subject.locationProfileId, 'occurrence.subject.locationProfileId');
    }
    if (subject.kind === 'item') {
      assertCanonicalSubjectId(subject.itemId, 'occurrence.subject.itemId', record.occurrenceDefinitionId);
    }
    if (subject.kind === 'task_result') {
      assertCanonicalSubjectId(subject.taskResultId, 'occurrence.subject.taskResultId', record.occurrenceDefinitionId);
    }
    // facilityId/itemId/taskResultId 是稳定外部 subject ID，只验证类型和非空（递归校验已做），不伪造目录记录。
    refAll(record.eventDefinitionIds, eventDefIds, 'occurrence.eventDefinitionIds');
  }
  // C2：canonical subject identity key 唯一——不能换 occurrenceDefinitionId/title/aliases/identityAnchors
  // 重复声明同一 subject；facility 的 locationProfileId 是归属属性，不得用换地点规避相同 facilityId 碰撞。
  const identityKeys = new Set();
  for (const record of sample.occurrenceDefinitions) {
    const subject = record.subject;
    let identityKey = null;
    if (subject.kind === 'event') identityKey = 'event:' + subject.eventDefinitionId;
    if (subject.kind === 'character') identityKey = 'character:' + subject.characterProfileId;
    if (subject.kind === 'facility') identityKey = 'facility:' + subject.facilityId;
    if (subject.kind === 'item') identityKey = 'item:' + subject.itemId;
    if (subject.kind === 'task_result') identityKey = 'task_result:' + subject.taskResultId;
    assert(identityKey !== null, 'occurrence subject 无法生成 canonical identity key: ' + record.occurrenceDefinitionId);
    assert(!identityKeys.has(identityKey), '同一 canonical subject 被重复定义（identity key 冲突）: ' + identityKey + '（' + record.occurrenceDefinitionId + '）');
    identityKeys.add(identityKey);
  }
  for (const record of sample.eventDefinitions) {
    refAll(record.dependencyDefinitionIds, eventDefIds, 'event.dependencyDefinitionIds');
    refAll(record.consequenceDefinitionIds, eventDefIds, 'event.consequenceDefinitionIds');
    const dependencySet = new Set(record.dependencyDefinitionIds);
    const consequenceSet = new Set(record.consequenceDefinitionIds);
    assert(!dependencySet.has(record.eventDefinitionId), 'event 直接自引用 dependency: ' + record.eventDefinitionId);
    assert(!consequenceSet.has(record.eventDefinitionId), 'event 直接自引用 consequence: ' + record.eventDefinitionId);
  }
  // 双向一致性：constraint kind 匹配 + constraint/segment 双向；timeline/segment 双向。
  const constraintByKind = { hard: new Set(), foreshadow: new Set() };
  for (const record of sample.constraints) {
    assert(constraintByKind[record.kind], '非法 constraint kind: ' + record.kind);
    constraintByKind[record.kind].add(record.constraintId);
  }
  const segmentToConstraint = new Map();
  for (const record of sample.segments) {
    segmentToConstraint.set(record.segmentId, new Set([...record.hardConstraintIds, ...record.foreshadowConstraintIds]));
  }
  for (const record of sample.segments) {
    for (const id of record.hardConstraintIds) assert(constraintByKind.hard.has(id), 'hardConstraintIds 引用了非 hard constraint: ' + id);
    for (const id of record.foreshadowConstraintIds) assert(constraintByKind.foreshadow.has(id), 'foreshadowConstraintIds 引用了非 foreshadow constraint: ' + id);
  }
  for (const record of sample.constraints) {
    for (const segmentId of record.segmentIds) {
      assert(segmentToConstraint.get(segmentId)?.has(record.constraintId), 'constraint.segmentIds 与 segment 侧引用不一致（单向关联）: ' + record.constraintId + ' -> ' + segmentId);
    }
  }
  // 反向：segment 引用的 constraint 必须反向声明该 segment（双向一致）。
  for (const record of sample.segments) {
    for (const constraintId of [...record.hardConstraintIds, ...record.foreshadowConstraintIds]) {
      const constraint = sample.constraints.find((item) => item.constraintId === constraintId);
      assert(constraint && constraint.segmentIds.includes(record.segmentId), 'segment 引用 constraint 但 constraint.segmentIds 未反向声明（单向关联）: ' + record.segmentId + ' -> ' + constraintId);
    }
  }
  const timelineBySegment = new Map();
  for (const record of sample.timelineEntries) {
    if (!timelineBySegment.has(record.segmentId)) timelineBySegment.set(record.segmentId, []);
    timelineBySegment.get(record.segmentId).push(record.timelineEntryId);
  }
  for (const record of sample.segments) {
    const expected = [...(timelineBySegment.get(record.segmentId) || [])].sort();
    assert(JSON.stringify([...record.timelineEntryIds].sort()) === JSON.stringify(expected), 'segment.timelineEntryIds 与 timeline 侧不一致（单向关联）: ' + record.segmentId);
  }
}

function assertOrdinalRangeConsistency(sample) {
  const seriesByOrdinal = new Map();
  for (const series of sample.series) {
    assert(Number.isInteger(series.ordinal) && series.ordinal >= 1, 'series ordinal 必须是正整数: ' + series.seriesId);
    assert(!seriesByOrdinal.has(series.ordinal), 'series ordinal 重复: ' + series.ordinal);
    seriesByOrdinal.set(series.ordinal, series);
  }
  const chaptersBySeries = new Map();
  for (const chapter of sample.chapters) {
    if (!chaptersBySeries.has(chapter.seriesId)) chaptersBySeries.set(chapter.seriesId, []);
    chaptersBySeries.get(chapter.seriesId).push(chapter);
  }
  const segmentsBySeries = new Map();
  for (const segment of sample.segments) {
    if (!segmentsBySeries.has(segment.seriesId)) segmentsBySeries.set(segment.seriesId, []);
    segmentsBySeries.get(segment.seriesId).push(segment);
  }
  for (const series of sample.series) {
    // 排序一律使用拷贝数组（[...arr].sort()），验证过程零修改：不得对 sample 内任一数组直接 sort/reverse/splice。
    const chapters = [...(chaptersBySeries.get(series.seriesId) || [])].sort((a, b) => a.ordinal - b.ordinal);
    const segments = [...(segmentsBySeries.get(series.seriesId) || [])].sort((a, b) => a.ordinal - b.ordinal);
    for (let i = 0; i < chapters.length; i += 1) {
      assert(Number.isInteger(chapters[i].ordinal) && chapters[i].ordinal === i + 1, 'chapter ordinal 必须从 1 连续: ' + series.seriesId);
    }
    for (let i = 0; i < segments.length; i += 1) {
      assert(Number.isInteger(segments[i].ordinal) && segments[i].ordinal === i + 1, 'segment ordinal 必须从 1 连续: ' + series.seriesId);
    }
    // series.chapterIds/segmentIds/openingSegmentIds 精确一致（不能缺少、增加或乱序）。
    assert(JSON.stringify(series.chapterIds) === JSON.stringify(chapters.map((c) => c.chapterId)), 'series.chapterIds 与按 ordinal 排序的 chapters 不一致: ' + series.seriesId);
    assert(JSON.stringify(series.segmentIds) === JSON.stringify(segments.map((s) => s.segmentId)), 'series.segmentIds 与按 ordinal 排序的 segments 不一致: ' + series.seriesId);
    // B2：opening 顺序必须按 segment ordinal 精确一致；比较时不得排序传入的 openingSegmentIds（输入零修改）。
    const opening = segments.filter((s) => s.isOpeningCandidate).map((s) => s.segmentId);
    assert(JSON.stringify(series.openingSegmentIds) === JSON.stringify(opening), 'series.openingSegmentIds 必须等于 isOpeningCandidate=true 的 segments 按 ordinal 排列的精确 ID 列表（不得自行排序）: ' + series.seriesId);
  }
  for (const segment of sample.segments) {
    const range = segment.chapterRange;
    assert(Number.isInteger(range.startOrdinal) && Number.isInteger(range.endOrdinal) && range.startOrdinal >= 1 && range.endOrdinal >= range.startOrdinal, 'segment chapterRange 非法: ' + segment.segmentId);
    // B1：range 两端必须真实存在于所属 series 的 chapter ordinal 集合（start=1/end=2 而只有 chapter 1 时拒绝）。
    const seriesChapters = chaptersBySeries.get(segment.seriesId) || [];
    const ordinalSet = new Set(seriesChapters.map((c) => c.ordinal));
    assert(ordinalSet.has(range.startOrdinal), 'chapterRange.startOrdinal 必须真实存在于所属 series: ' + segment.segmentId + ' start=' + range.startOrdinal);
    assert(ordinalSet.has(range.endOrdinal), 'chapterRange.endOrdinal 必须真实存在于所属 series: ' + segment.segmentId + ' end=' + range.endOrdinal);
    const chapters = seriesChapters.filter((c) => c.ordinal >= range.startOrdinal && c.ordinal <= range.endOrdinal).sort((a, b) => a.ordinal - b.ordinal);
    const expectedIds = chapters.map((c) => c.chapterId);
    assert(JSON.stringify(range.chapterIds) === JSON.stringify(expectedIds), 'chapterRange.chapterIds 必须与同 series 闭区间 chapters 按 ordinal 排序精确一致: ' + segment.segmentId);
  }
  // location.facilityOccurrenceDefinitionIds 只能引用 facility subject + locationProfileId 匹配的 occurrence。
  for (const location of sample.locationProfiles) {
    for (const occurrenceId of location.facilityOccurrenceDefinitionIds) {
      const occurrence = sample.occurrenceDefinitions.find((item) => item.occurrenceDefinitionId === occurrenceId);
      assert(occurrence, 'location.facilityOccurrenceDefinitionIds 悬空: ' + occurrenceId);
      assert(occurrence.subject.kind === 'facility', 'location.facilityOccurrenceDefinitionIds 引用了非 facility occurrence: ' + occurrenceId);
      assert(occurrence.subject.locationProfileId === location.locationProfileId, 'facility occurrence 被错误 location 收录: ' + occurrenceId);
    }
  }
  // C4 反向：每个 facility occurrence 必须被且只被其匹配 location 的 facilityOccurrenceDefinitionIds 收录一次。
  // 未被收录、被两个 location 收录、被错误 location 收录、同一 location 数组重复全部拒绝（重复已由 refAll 拒绝）。
  for (const occurrence of sample.occurrenceDefinitions) {
    if (occurrence.subject.kind !== 'facility') continue;
    const location = sample.locationProfiles.find((item) => item.locationProfileId === occurrence.subject.locationProfileId);
    assert(location, 'facility occurrence 的 locationProfileId 必须解析: ' + occurrence.occurrenceDefinitionId);
    const listed = location.facilityOccurrenceDefinitionIds.filter((id) => id === occurrence.occurrenceDefinitionId).length;
    assert(listed === 1, 'facility occurrence 必须被且只被匹配 location 收录一次: ' + occurrence.occurrenceDefinitionId + '（' + location.locationProfileId + ' 收录 ' + listed + ' 次）');
  }
}

// ── 子任务 C：occurrence 显式绑定 + replay/newInstance 映射 ──
function assertOccurrenceBindings(sample) {
  const OCCURRENCE_TO_REPLAY = { unique: 'once', allow_new_instance: 'allow_new_instance', repeatable: 'repeatable' };
  const ownerByEvent = new Map();
  for (const occurrence of sample.occurrenceDefinitions) {
    assert(Array.isArray(occurrence.eventDefinitionIds), 'occurrence 缺少 eventDefinitionIds: ' + occurrence.occurrenceDefinitionId);
    assert(new Set(occurrence.eventDefinitionIds).size === occurrence.eventDefinitionIds.length, 'occurrence.eventDefinitionIds 内部重复: ' + occurrence.occurrenceDefinitionId);
    // C3：event subject 指向的事件必须由本 occurrence 显式拥有（不允许 subject 指向 event B 却拥有 event A）。
    if (occurrence.subject.kind === 'event') {
      assert(occurrence.eventDefinitionIds.includes(occurrence.subject.eventDefinitionId), 'event subject 必须包含于自身 eventDefinitionIds（subject 与显式 owner 不一致）: ' + occurrence.occurrenceDefinitionId);
    }
    for (const eventDefId of occurrence.eventDefinitionIds) {
      const eventDef = sample.eventDefinitions.find((item) => item.eventDefinitionId === eventDefId);
      assert(eventDef, 'occurrence 绑定悬空 event definition: ' + eventDefId);
      assert(!ownerByEvent.has(eventDefId), '同一 event definition 被多个 occurrence 拥有: ' + eventDefId);
      ownerByEvent.set(eventDefId, occurrence);
      const expectedReplay = OCCURRENCE_TO_REPLAY[occurrence.occurrencePolicy];
      assert(expectedReplay === eventDef.replayPolicy, 'occurrence/replay 映射不一致: ' + occurrence.occurrencePolicy + ' -> ' + eventDef.replayPolicy + '（应为 ' + expectedReplay + '）');
    }
  }
  for (const eventDef of sample.eventDefinitions) {
    assert(ownerByEvent.has(eventDef.eventDefinitionId), 'catalog event definition 必须由且仅由一个 occurrence 显式拥有: ' + eventDef.eventDefinitionId);
  }
  // newInstancePolicy 语义：unique + resolve_same_definition 路线关联时必须 forbidden（五种 subject 通用，不特判 event）。
  for (const route of sample.routePolicies) {
    if (route.earlyCompletionPolicy !== 'resolve_same_definition') continue;
    const routeSegments = sample.segments.filter((segment) => segment.routePolicyId === route.routePolicyId);
    for (const segment of routeSegments) {
      for (const eventDefId of segment.eventDefinitionIds) {
        const owner = ownerByEvent.get(eventDefId);
        assert(owner, 'resolve_same_definition 路线的事件缺少显式 occurrence owner: ' + eventDefId);
        assert(owner.occurrencePolicy === 'unique', 'resolve_same_definition 只允许 unique occurrence（五种 subject 通用）: ' + owner.occurrenceDefinitionId);
        assert(owner.newInstancePolicy === 'forbidden', 'resolve_same_definition 必须 newInstancePolicy=forbidden（不能复活同一 canonical subject）: ' + owner.occurrenceDefinitionId);
      }
    }
  }
}

// ── 子任务 D：route 语义机器规则 ──
function assertRouteSemantics(sample) {
  for (const route of sample.routePolicies) {
    assert(route.participationPolicy === 'player_optional' || route.participationPolicy === 'player_required_for_resolution' || route.participationPolicy === 'world_only', '非法 participationPolicy: ' + route.participationPolicy);
    const routeSegments = sample.segments.filter((segment) => segment.routePolicyId === route.routePolicyId);
    const routeEvents = new Set(routeSegments.flatMap((segment) => segment.eventDefinitionIds));
    for (const eventDefId of routeEvents) {
      const eventDef = sample.eventDefinitions.find((item) => item.eventDefinitionId === eventDefId);
      assert(eventDef, 'route 关联的 event definition 悬空: ' + eventDefId);
      if (route.bypassPolicy === 'world_background') {
        assert(eventDef.allowedResolutionModes.includes('world_background'), route.routePolicyId + ' 声明 world_background 但事件缺少该模式: ' + eventDefId);
      }
      if (route.earlyCompletionPolicy === 'resolve_same_definition') {
        assert(eventDef.allowedResolutionModes.includes('player_early'), route.routePolicyId + ' 声明 resolve_same_definition 但事件缺少 player_early: ' + eventDefId);
      }
      if (route.participationPolicy === 'world_only') {
        // D：world_only 只允许背景结算——必须带 world_background，排除全部玩家相关模式。
        assert(eventDef.allowedResolutionModes.includes('world_background'), route.routePolicyId + ' 声明 world_only（玩家不参与）但事件缺少 world_background 模式: ' + eventDefId);
        for (const mode of ['player', 'player_early', 'shared']) {
          assert(!eventDef.allowedResolutionModes.includes(mode), route.routePolicyId + ' 声明 world_only（玩家不参与）但事件仍带 ' + mode + ' 模式: ' + eventDefId);
        }
      }
    }
  }
}

// ── G1.1.2.2 子任务 A1：内联 union 必须按自身 discriminator 工作（不得硬编码 kind）──
export function runInlineUnionProbeSuite() {
  const { fixture } = readContractFixture();
  const positives = [];
  const rejections = [];
  const unionSpec = {
    type: 'union',
    discriminator: 'tag',
    variants: [
      { tag: 'a', fields: { tag: { type: 'literal', value: 'a', required: true }, alpha: { type: 'string', required: true } } },
      { tag: 'b', fields: { tag: { type: 'literal', value: 'b', required: true }, beta: { type: 'number', required: true } } },
    ],
  };
  const probe = (value, spec, path) => tryValidateValue({ fixture, spec, value, path });
  // 正向：discriminator='tag' 时从 value.tag 读取并匹配。
  for (const [name, value] of [['A1-正例-tag=a', { tag: 'a', alpha: 'x' }], ['A1-正例-tag=b', { tag: 'b', beta: 1 }]]) {
    const result = probe(value, unionSpec, 'catalog.probe');
    assert(result.ok, name + ' 必须通过: ' + (result.error || ''));
    positives.push({ name, detail: 'passed' });
  }
  // 负例：只给 kind 不给 tag；缺 discriminator；重复 variant tag；混入另一 variant 字段。
  const negativeCases = [
    ['A1-负例-只给kind不给tag', { kind: 'a' }, unionSpec, '变体 tag 非法或缺失'],
    ['A1-负例-缺discriminator', { tag: 'a', alpha: 'x' }, { type: 'union', variants: unionSpec.variants }, '缺 discriminator'],
    ['A1-负例-重复variant tag', { tag: 'a', alpha: 'x' }, {
      type: 'union',
      discriminator: 'tag',
      variants: [unionSpec.variants[0], { ...unionSpec.variants[0] }],
    }, '变体 tag 重复'],
    ['A1-负例-混入他variant字段', { tag: 'a', alpha: 'x', beta: 1 }, unionSpec, '未知字段 -> beta'],
  ];
  for (const [name, value, spec, keyword] of negativeCases) {
    const result = probe(value, spec, 'catalog.probe');
    assert(!result.ok, name + ' 必须被拒绝');
    assert(result.error && result.error.includes(keyword), name + ' 拒绝原因必须包含 ' + keyword + '，实际: ' + (result.error || '(accepted)'));
    rejections.push({ name, errorMessage: result.error });
  }
  return { positives, rejections };
}

// ── G1.1.2.2/2.3 子任务 A2：open_map 的 unknown 只接受合法 JSON 值 ──
export function runJsonValueProbeSuite() {
  const { fixture } = readContractFixture();
  const positives = [];
  const rejections = [];
  const openSpec = fixture.types.CommittedWorldFact.fields.payload; // open_map<unknown>
  const probe = (value) => tryValidateValue({ fixture, spec: openSpec, value, path: 'catalog.payload' });
  const probePositive = (name, value) => {
    const result = probe(value);
    assert(result.ok, name + ' 必须通过: ' + (result.error || ''));
    positives.push({ name, detail: 'passed' });
  };
  const probeRejected = (name, value, keyword) => {
    const result = probe(value);
    assert(!result.ok, name + ' 必须被拒绝');
    assert(result.error && result.error.includes(keyword), name + ' 拒绝原因必须命中目标路径/规则关键词 ' + keyword + '，实际: ' + (result.error || '(accepted)'));
    rejections.push({ name, errorMessage: result.error });
  };
  probePositive('A2-正例-嵌套合法JSON', { nested: { deep: [1, 'x', true, null, { ok: 1 }] } });
  probePositive('A2-正例-null-prototype根对象', Object.assign(Object.create(null), { a: 1, b: 'x', c: [true] }));
  {
    const shared = { v: 1, list: [1, 2] };
    probePositive('A2-正例-共享非循环子对象', { a: shared, b: shared });
  }
  const cyclic = {};
  cyclic.self = cyclic;
  const withSymbol = (obj, key) => { obj[Symbol(key)] = 1; return obj; };
  const withHidden = (obj, key) => { Object.defineProperty(obj, key, { value: 2, enumerable: false }); return obj; };
  const withGetter = (obj, key) => { Object.defineProperty(obj, key, { get: () => 1, enumerable: true }); return obj; };
  const sparseArray = new Array(3); // length=3 但索引无 own property
  const extraKeyArray = [1];
  extraKeyArray.extra = 2;
  const negativeCases = [
    // G1.1.2.2 保留：标量/特殊对象子值
    ['A2-负例-bigint', { x: 1n }, 'bigint'],
    ['A2-负例-undefined', { x: undefined }, 'undefined'],
    ['A2-负例-function', { x: () => {} }, 'function'],
    ['A2-负例-symbol', { x: Symbol('s') }, 'symbol'],
    ['A2-负例-NaN', { x: NaN }, 'NaN/Infinity'],
    ['A2-负例-Infinity', { x: Infinity }, 'NaN/Infinity'],
    ['A2-负例-Date子值', { x: new Date() }, '普通对象'],
    ['A2-负例-Map子值', { x: new Map() }, '普通对象'],
    ['A2-负例-Set子值', { x: new Set() }, '普通对象'],
    ['A2-负例-RegExp子值', { x: /re/g }, '普通对象'],
    ['A2-负例-自定义prototype子值', { x: Object.create({ custom: 1 }) }, '普通对象'],
    ['A2-负例-循环引用', { x: cyclic }, '循环引用'],
    // G1.1.2.3 新增：root 容器必须严格普通对象（assertPlainObject 层拒绝）
    ['A2-负例-root容器Date', new Date(), '普通对象'],
    ['A2-负例-root容器Map', new Map(), '普通对象'],
    ['A2-负例-root容器Set', new Set(), '普通对象'],
    ['A2-负例-root容器RegExp', /re/g, '普通对象'],
    ['A2-负例-root容器自定义prototype', Object.create({ custom: 1 }), '普通对象'],
    // G1.1.2.3 新增：数组完整性
    ['A2-负例-稀疏数组', { x: sparseArray }, 'sparse hole'],
    ['A2-负例-数组额外键', { x: extraKeyArray }, '索引之外的自有键'],
    ['A2-负例-数组symbol键', { x: withSymbol([1], 'k') }, 'symbol 键'],
    ['A2-负例-对象symbol键', { x: withSymbol({ a: 1 }, 'k') }, 'symbol 键'],
    ['A2-负例-不可枚举隐藏字段', { x: withHidden({ a: 1 }, 'hidden') }, '不可枚举隐藏字段'],
    ['A2-负例-getter字段', { x: withGetter({}, 'g') }, 'getter/setter'],
  ];
  for (const [name, value, keyword] of negativeCases) probeRejected(name, value, keyword);
  return { positives, rejections };
}

// ── G1.1.2.3 子任务 C：五种 subject 稳定 ID 必须处于 canonical form（trim/NFC）──
export function runCanonicalSubjectIdProbeSuite() {
  const { fixture } = readContractFixture();
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const positives = [];
  const rejections = [];
  const build = (mutate) => {
    const clone = JSON.parse(JSON.stringify(sample));
    mutate(clone);
    return recomputeSampleFingerprints(clone);
  };
  const runCase = (name, clone, expectedOk, keyword) => {
    let ok = true;
    let errorMessage = '';
    try { validateAssetCatalogSample(clone, { fixture }); } catch (error) { ok = false; errorMessage = error.message; }
    if (expectedOk) {
      assert(ok, name + ' 必须通过: ' + errorMessage);
      positives.push({ name, detail: 'passed' });
    } else {
      assert(!ok, name + ' 必须被拒绝');
      assert(errorMessage.includes(keyword), name + ' 拒绝原因必须命中规则关键词 ' + keyword + '，实际: ' + errorMessage);
      rejections.push({ name, errorMessage });
    }
  };
  const resetLocation = (clone) => { clone.locationProfiles[0].facilityOccurrenceDefinitionIds = []; };
  const replaceSubject = (clone, subject) => { clone.occurrenceDefinitions[0].subject = subject; resetLocation(clone); };
  const SUBJECT_SPACE_VARIANTS = [
    ['C-首尾空格-event', () => ({ kind: 'event', eventDefinitionId: ' evt_gravity_platform_stabilize ' })],
    ['C-首尾空格-character', () => ({ kind: 'character', characterProfileId: ' char_probe ' })],
    ['C-首尾空格-facility', () => ({ kind: 'facility', facilityId: ' facility_gravity_platform_alpha ', locationProfileId: 'location_main_control_cabin' })],
    ['C-首尾空格-item', () => ({ kind: 'item', itemId: ' item_probe ' })],
    ['C-首尾空格-task_result', () => ({ kind: 'task_result', taskResultId: ' task_probe ' })],
  ];
  for (const [name, makeSubject] of SUBJECT_SPACE_VARIANTS) {
    const clone = build((c) => { replaceSubject(c, makeSubject()); });
    runCase(name, clone, false, '必须等于自身 trim()');
  }
  // 组合：第二 occurrence 使用同一 ID 的空格变体（facility/item/task_result 各一），全部引用补齐、重算 fingerprint。
  {
    const clone = build((c) => {
      c.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_space_variant', title: 'probe', subject: { kind: 'facility', facilityId: ' facility_gravity_platform_alpha ', locationProfileId: 'location_main_control_cabin' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: [], definitionFingerprint: '' });
    });
    runCase('C-组合-第二occurrence空格变体facility', clone, false, '必须等于自身 trim()');
  }
  {
    const clone = build((c) => {
      replaceSubject(c, { kind: 'item', itemId: 'item_probe' });
      c.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_space_variant', title: 'probe', subject: { kind: 'item', itemId: ' item_probe ' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: [], definitionFingerprint: '' });
    });
    runCase('C-组合-第二occurrence空格变体item', clone, false, '必须等于自身 trim()');
  }
  {
    const clone = build((c) => {
      replaceSubject(c, { kind: 'task_result', taskResultId: 'task_probe' });
      c.occurrenceDefinitions.push({ occurrenceDefinitionId: 'occ_space_variant', title: 'probe', subject: { kind: 'task_result', taskResultId: ' task_probe ' }, occurrencePolicy: 'unique', newInstancePolicy: 'forbidden', identityAnchors: [], aliases: [], eventDefinitionIds: [], definitionFingerprint: '' });
    });
    runCase('C-组合-第二occurrence空格变体task_result', clone, false, '必须等于自身 trim()');
  }
  // Unicode NFD 变体反例：'e\u0301'（NFD）≠ normalize('NFC') = 'é'。
  {
    const clone = build((c) => { replaceSubject(c, { kind: 'item', itemId: 'cafe\u0301' }); });
    runCase('C-负例-unicode NFD变体item', clone, false, 'normalize(NFC)');
  }
  // 合法 NFC ID 正例。
  {
    const clone = build((c) => { replaceSubject(c, { kind: 'item', itemId: 'café' }); });
    runCase('C-正例-合法NFC ID', clone, true);
  }
  return { positives, rejections };
}

// ── G1.1.2.3 子任务 D：失败路径 sample canonical 字节不变（成功路径由 validateAssetCatalogSample 内置断言）──
export function runFailureImmutabilityProbe() {
  const { fixture } = readContractFixture();
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const positives = [];
  const probes = [
    ['失败路径-非法route枚举', (c) => { c.routePolicies[0].participationPolicy = 'sometimes'; }],
    ['失败路径-identity空格变体', (c) => { c.occurrenceDefinitions[0].subject.facilityId = ' facility_gravity_platform_alpha '; }],
    ['失败路径-sparse数组字段', (c) => { c.sourceRefs = new Array(2); }],
  ];
  for (const [name, mutate] of probes) {
    const clone = JSON.parse(JSON.stringify(sample));
    mutate(clone);
    recomputeSampleFingerprints(clone);
    const before = canonicalJsonStringify(clone);
    let rejected = false;
    try { validateAssetCatalogSample(clone, { fixture }); } catch { rejected = true; }
    assert(rejected, name + ' 必须是失败路径');
    assert(canonicalJsonStringify(clone) === before, name + ' 失败后 sample canonical 字节必须不变');
    positives.push({ name, detail: 'rejected + input bytes unchanged' });
  }
  return positives;
}

// ── G1.1.2.2 子任务 B2：opening 顺序必须按 segment ordinal 精确一致；比较不得排序输入 ──
export function runOpeningOrderSuite() {
  const { fixture } = readContractFixture();
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const positives = [];
  const rejections = [];
  // 正例：两个 opening segments 按 ordinal 顺序列出。
  {
    const clone = JSON.parse(JSON.stringify(sample));
    clone.segments[1].isOpeningCandidate = true;
    clone.series[0].openingSegmentIds = ['segment_platform_intro', 'segment_platform_crisis'];
    recomputeSampleFingerprints(clone);
    let ok = true;
    let detail = '';
    try { validateAssetCatalogSample(clone, { fixture }); detail = 'passed'; } catch (error) { ok = false; detail = error.message; }
    assert(ok, 'B2-正例-opening按ordinal顺序必须通过: ' + detail);
    positives.push({ name: 'B2-正例-opening按ordinal顺序', detail });
  }
  // 负例：两个 opening segments 顺序颠倒必须拒绝，且不得靠排序输入掩盖。
  {
    const clone = JSON.parse(JSON.stringify(sample));
    clone.segments[1].isOpeningCandidate = true;
    clone.series[0].openingSegmentIds = ['segment_platform_crisis', 'segment_platform_intro'];
    recomputeSampleFingerprints(clone);
    const beforeInput = JSON.stringify(clone.series[0].openingSegmentIds);
    let rejected = false;
    let errorMessage = '';
    try { validateAssetCatalogSample(clone, { fixture }); } catch (error) { rejected = true; errorMessage = error.message; }
    assert(rejected, 'B2-负例-opening顺序颠倒必须被拒绝');
    assert(errorMessage.includes('openingSegmentIds') && errorMessage.includes('精确 ID 列表'), 'B2-负例 拒绝原因必须指向 opening 精确顺序规则，实际: ' + errorMessage);
    // 零修改探针：校验失败后原输入数组顺序必须保持（不得排序输入后放行）。
    assert(JSON.stringify(clone.series[0].openingSegmentIds) === beforeInput, 'B2-不可变探针-失败后输入必须保持原顺序');
    rejections.push({ name: 'B2-负例-opening顺序颠倒', errorMessage });
    positives.push({ name: 'B2-不可变探针-失败后输入保持原顺序', detail: 'input unchanged' });
  }
  return { positives, rejections };
}

// ── G1.1.2.2 子任务 D：world_only 必须排除全部玩家相关模式 ──
export function runWorldOnlySuite() {
  const { fixture } = readContractFixture();
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const positives = [];
  const rejections = [];
  const build = (modes) => {
    const clone = JSON.parse(JSON.stringify(sample));
    clone.routePolicies[0].participationPolicy = 'world_only';
    clone.routePolicies[0].earlyCompletionPolicy = 'not_applicable';
    clone.eventDefinitions[0].allowedResolutionModes = modes;
    return recomputeSampleFingerprints(clone);
  };
  {
    const clone = build(['world_background']);
    let ok = true;
    let detail = '';
    try { validateAssetCatalogSample(clone, { fixture }); detail = 'passed'; } catch (error) { ok = false; detail = error.message; }
    assert(ok, 'D-正例-world_only仅world_background必须通过: ' + detail);
    positives.push({ name: 'D-正例-world_only仅world_background', detail });
  }
  for (const mode of ['player', 'player_early', 'shared']) {
    const clone = build(['world_background', mode]);
    let rejected = false;
    let errorMessage = '';
    try { validateAssetCatalogSample(clone, { fixture }); } catch (error) { rejected = true; errorMessage = error.message; }
    assert(rejected, 'D-负例-world_only带' + mode + '必须被拒绝');
    assert(errorMessage.includes('world_only') && errorMessage.includes(mode), 'D-负例-world_only带' + mode + ' 拒绝原因必须指向 world_only/' + mode + ' 规则，实际: ' + errorMessage);
    rejections.push({ name: 'D-负例-world_only仍带' + mode, errorMessage });
  }
  return { positives, rejections };
}

// ── G1.1.2.2 子任务 E：运行字段隔离靠结构键；自然语言允许讨论，不设文本黑名单 ──
export function runNaturalLanguageSuite() {
  const { fixture } = readContractFixture();
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const positives = [];
  const rejections = [];
  {
    const clone = JSON.parse(JSON.stringify(sample));
    clone.chapters[0].sourceText = '章节原文提到 eventInstanceId 与 factId 是运行时字段，runtimeBranchId/runtimeRevision 属于运行状态。';
    recomputeSampleFingerprints(clone);
    let ok = true;
    let detail = '';
    try { validateAssetCatalogSample(clone, { fixture }); detail = 'passed'; } catch (error) { ok = false; detail = error.message; }
    assert(ok, 'E-正例-原文讨论运行字段字样必须通过: ' + detail);
    positives.push({ name: 'E-正例-自然语言含运行字段字样', detail });
  }
  {
    const clone = JSON.parse(JSON.stringify(sample));
    clone.segments[0].runtimeRevision = 3;
    recomputeSampleFingerprints(clone);
    let rejected = false;
    let errorMessage = '';
    try { validateAssetCatalogSample(clone, { fixture }); } catch (error) { rejected = true; errorMessage = error.message; }
    assert(rejected, 'E-负例-结构注入运行字段必须被拒绝');
    assert(errorMessage.includes('未知字段') && errorMessage.includes('runtimeRevision'), 'E-负例 拒绝原因必须指向未知结构字段 runtimeRevision，实际: ' + errorMessage);
    rejections.push({ name: 'E-负例-结构字段注入runtimeRevision', errorMessage });
  }
  return { positives, rejections };
}

// ── G1.1.2.2 子任务 A3：deep-freeze 的合法正式样例仍能通过（任何写入尝试都会在严格模式抛错）──
export function runDeepFreezeProbe() {
  const { fixture } = readContractFixture();
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const deepFreeze = (value) => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const frozen = deepFreeze(JSON.parse(JSON.stringify(sample)));
  let ok = true;
  let detail = '';
  try { validateAssetCatalogSample(frozen, { fixture }); detail = 'passed'; } catch (error) { ok = false; detail = error.message; }
  assert(ok, 'A3-正例-deep-freeze 样例必须通过: ' + detail);
  return { name: 'A3-正例-deep-freeze样例通过', detail };
}

// ── G1.1.2.3 子任务 D：组合正例——event subject 指向自身 eventDefinitionIds 的第二个 event，
// 且两个 event owner 均唯一：交接包既定允许形态，必须通过 ──
export function runCombinationPositiveSuite() {
  const { fixture } = readContractFixture();
  const sample = JSON.parse(fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8'));
  const positives = [];
  {
    const clone = JSON.parse(JSON.stringify(sample));
    clone.eventDefinitions.push({
      eventDefinitionId: 'evt_second', origin: 'catalog', title: 'second', actorEntityIds: [], targetEntityIds: [], dependencyDefinitionIds: [],
      completionPredicate: { predicateId: 'pred_second', targetEntityIds: [], requiredFactTypes: ['probe_fact'], requiredEvidenceKinds: ['narrative_span'], payloadMatchers: [], minimumEvidenceCount: 1, deterministicKey: 'second', allowedOutcomes: ['normal'], failureOutcomes: ['failed'] },
      scheduling: {}, allowedResolutionModes: ['player'], replayPolicy: 'once',
      publicScope: { kind: 'private' }, consequenceDefinitionIds: [], definitionFingerprint: '',
    });
    clone.occurrenceDefinitions[0].subject = { kind: 'event', eventDefinitionId: 'evt_second' };
    clone.occurrenceDefinitions[0].eventDefinitionIds = ['evt_gravity_platform_stabilize', 'evt_second'];
    clone.locationProfiles[0].facilityOccurrenceDefinitionIds = [];
    recomputeSampleFingerprints(clone);
    let ok = true;
    let errorMessage = '';
    try { validateAssetCatalogSample(clone, { fixture }); } catch (error) { ok = false; errorMessage = error.message; }
    assert(ok, 'D-组合正例-event subject指向自身第二个event 必须通过: ' + errorMessage);
    positives.push({ name: 'D-组合正例-event subject指向自身第二个event', detail: 'passed' });
  }
  return positives;
}

// ── G1.1.2.4 子任务 C/D：统一 JSON 容器横向矩阵 + 纯读安全探针 ──
// C1：六类对象入口（named interface / named union / inline object / inline union / map / open_map）
// 逐入口验证 symbol 键、non-enumerable、getter（零调用）、setter、自定义 prototype 拒绝与正例通过；
// C2：schema array 与 scalar_union.string_array（直接取冻结 fixture 的 PayloadMatcher.value 规格）逐入口矩阵；
// C3：fingerprint 碰撞证据——canonical 投影相同，非法一侧被正式 validator 拒绝；
// D：getter 零调用、Reflect.ownKeys+descriptors 快照不变、deep-freeze 容器/fixture 通过。
export function runContainerMatrixSuite() {
  const { fixture } = readContractFixture();
  const positives = [];
  const rejections = [];
  const deepFreeze = (value) => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) deepFreeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const safeValidate = (fn) => {
    try { fn(); return { ok: true, error: '' }; } catch (error) { return { ok: false, error: error instanceof Error ? error.message : String(error) }; }
  };
  // 只读形状快照：保留原始 key（包括 symbol）和完整 descriptor，不调用 accessor。
  // canonical stringify 看不见 symbol/hidden，不能把 key 先转字符串后再取 descriptor。
  const symbolIds = new Map();
  const shapeSnapshot = (value) => Reflect.ownKeys(value).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    let keyId;
    if (typeof key === 'symbol') {
      if (!symbolIds.has(key)) symbolIds.set(key, 'symbol#' + (symbolIds.size + 1));
      keyId = symbolIds.get(key);
    } else {
      keyId = 'string:' + key;
    }
    return {
      keyId,
      key,
      enumerable: descriptor?.enumerable,
      configurable: descriptor?.configurable,
      writable: descriptor?.writable,
      value: descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value') ? descriptor.value : undefined,
      get: descriptor?.get,
      set: descriptor?.set,
    };
  });
  const sameShapeSnapshot = (left, right) => left.length === right.length && left.every((entry, index) => {
    const other = right[index];
    return other
      && Object.is(entry.key, other.key)
      && entry.keyId === other.keyId
      && entry.enumerable === other.enumerable
      && entry.configurable === other.configurable
      && entry.writable === other.writable
      && Object.is(entry.value, other.value)
      && Object.is(entry.get, other.get)
      && Object.is(entry.set, other.set);
  });
  const inlineUnionSpec = {
    type: 'union',
    discriminator: 'tag',
    variants: [
      { tag: 'a', fields: { tag: { type: 'literal', value: 'a', required: true }, alpha: { type: 'string', required: true } } },
      { tag: 'b', fields: { tag: { type: 'literal', value: 'b', required: true }, beta: { type: 'number', required: true } } },
    ],
  };
  // C1：六类对象入口（valid 为各入口合法基础值；validate 直接调用，失败抛错）。
  const objectEntries = [
    { name: 'named interface (PayloadMatcher)', validate: (v) => validateValueAgainstType({ fixture, typeName: 'PayloadMatcher', value: v, path: 'probe' }), valid: { path: 'p', operator: 'equals', value: 'x' } },
    { name: 'named union (PublicScope)', validate: (v) => validateValueAgainstType({ fixture, typeName: 'PublicScope', value: v, path: 'probe' }), valid: { kind: 'private' } },
    { name: 'inline object (CreateEventProposal.definitionRef)', validate: (v) => validateValueAgainstSpec({ fixture, spec: fixture.types.CreateEventProposal.fields.definitionRef, value: v, path: 'probe' }), valid: { eventDefinitionId: 'evt_x', definitionFingerprint: 'fp_x' } },
    { name: 'inline union (tag discriminator)', validate: (v) => validateValueAgainstSpec({ fixture, spec: inlineUnionSpec, value: v, path: 'probe' }), valid: { tag: 'a', alpha: 'x' } },
    { name: 'map (commandIdempotencyIndex)', validate: (v) => validateValueAgainstSpec({ fixture, spec: fixture.types.StoryRuntimeState.fields.commandIdempotencyIndex, value: v, path: 'probe' }), valid: {} },
    { name: 'open_map (CommittedWorldFact.payload)', validate: (v) => validateValueAgainstSpec({ fixture, spec: fixture.types.CommittedWorldFact.fields.payload, value: v, path: 'probe' }), valid: { a: 1 } },
  ];
  for (const entry of objectEntries) {
    const clone = () => JSON.parse(JSON.stringify(entry.valid));
    // 正例：普通对象 + null-prototype 对象。
    for (const [pname, value] of [['普通对象', clone()], ['null-prototype对象', Object.assign(Object.create(null), entry.valid)]]) {
      const result = safeValidate(() => entry.validate(value));
      assert(result.ok, 'C1-正例-' + entry.name + '-' + pname + ' 必须通过: ' + result.error);
      positives.push({ name: 'C1-正例-' + entry.name + '-' + pname, detail: 'passed' });
    }
    // symbol 键。
    {
      const value = clone();
      value[Symbol('k')] = 1;
      const result = safeValidate(() => entry.validate(value));
      assert(!result.ok && result.error.includes('symbol 键'), 'C1-负例-' + entry.name + '-symbol键 必须因容器形态拒绝，实际: ' + result.error);
      rejections.push({ name: 'C1-负例-' + entry.name + '-symbol键', errorMessage: result.error });
    }
    // 不可枚举隐藏字段。
    {
      const value = clone();
      Object.defineProperty(value, 'hidden', { value: 2, enumerable: false });
      const result = safeValidate(() => entry.validate(value));
      assert(!result.ok && result.error.includes('不可枚举隐藏字段'), 'C1-负例-' + entry.name + '-隐藏字段 必须因容器形态拒绝，实际: ' + result.error);
      rejections.push({ name: 'C1-负例-' + entry.name + '-隐藏字段', errorMessage: result.error });
    }
    // getter（调用次数必须为 0）。
    {
      let getterCalls = 0;
      const value = clone();
      Object.defineProperty(value, 'g', { get: () => { getterCalls += 1; return 1; }, enumerable: true });
      const result = safeValidate(() => entry.validate(value));
      assert(!result.ok && result.error.includes('getter/setter'), 'C1-负例-' + entry.name + '-getter 必须因容器形态拒绝，实际: ' + result.error);
      assert(getterCalls === 0, 'C1-负例-' + entry.name + '-getter 调用次数必须为 0（descriptor 检查不得读取 accessor）');
      rejections.push({ name: 'C1-负例-' + entry.name + '-getter零调用', errorMessage: result.error });
    }
    // setter。
    {
      const value = clone();
      Object.defineProperty(value, 's', { set: () => {}, enumerable: true });
      const result = safeValidate(() => entry.validate(value));
      assert(!result.ok && result.error.includes('getter/setter'), 'C1-负例-' + entry.name + '-setter 必须因容器形态拒绝，实际: ' + result.error);
      rejections.push({ name: 'C1-负例-' + entry.name + '-setter', errorMessage: result.error });
    }
    // 自定义 prototype。
    {
      const value = clone();
      Object.setPrototypeOf(value, { custom: 1 });
      const result = safeValidate(() => entry.validate(value));
      assert(!result.ok && result.error.includes('普通对象'), 'C1-负例-' + entry.name + '-自定义prototype 必须因容器形态拒绝，实际: ' + result.error);
      rejections.push({ name: 'C1-负例-' + entry.name + '-自定义prototype', errorMessage: result.error });
    }
  }
  // C2：两个数组入口（schema array 用 StoryAssetSeries.chapterIds；string_array 直接取冻结 fixture 的 PayloadMatcher.value 规格）。
  const arrayEntries = [
    { name: 'schema array (StoryAssetSeries.chapterIds)', spec: fixture.types.StoryAssetSeries.fields.chapterIds, valid: ['c1', 'c2'] },
    { name: 'scalar_union string_array (PayloadMatcher.value)', spec: fixture.types.PayloadMatcher.fields.value, valid: ['a', 'b'] },
  ];
  for (const entry of arrayEntries) {
    const validate = (v) => validateValueAgainstSpec({ fixture, spec: entry.spec, value: v, path: 'probe' });
    const clone = () => [...entry.valid];
    // 正例：密集普通数组。
    {
      const result = safeValidate(() => validate(clone()));
      assert(result.ok, 'C2-正例-' + entry.name + '-密集数组必须通过: ' + result.error);
      positives.push({ name: 'C2-正例-' + entry.name + '-密集数组', detail: 'passed' });
    }
    // sparse hole。
    {
      const value = clone();
      value.length = 4;
      const result = safeValidate(() => validate(value));
      assert(!result.ok && result.error.includes('sparse hole'), 'C2-负例-' + entry.name + '-sparse 必须因容器形态拒绝，实际: ' + result.error);
      rejections.push({ name: 'C2-负例-' + entry.name + '-sparse', errorMessage: result.error });
    }
    // 索引外字符串键。
    {
      const value = clone();
      value.extra = 'x';
      const result = safeValidate(() => validate(value));
      assert(!result.ok && result.error.includes('索引之外的自有键'), 'C2-负例-' + entry.name + '-索引外键 必须因容器形态拒绝，实际: ' + result.error);
      rejections.push({ name: 'C2-负例-' + entry.name + '-索引外键', errorMessage: result.error });
    }
    // symbol 键。
    {
      const value = clone();
      value[Symbol('k')] = 1;
      const result = safeValidate(() => validate(value));
      assert(!result.ok && result.error.includes('symbol 键'), 'C2-负例-' + entry.name + '-symbol键 必须因容器形态拒绝，实际: ' + result.error);
      rejections.push({ name: 'C2-负例-' + entry.name + '-symbol键', errorMessage: result.error });
    }
    // 不可枚举隐藏字段。
    {
      const value = clone();
      Object.defineProperty(value, 'hidden', { value: 2, enumerable: false });
      const result = safeValidate(() => validate(value));
      assert(!result.ok && result.error.includes('索引之外的自有键'), 'C2-负例-' + entry.name + '-隐藏字段 必须因容器形态拒绝，实际: ' + result.error);
      rejections.push({ name: 'C2-负例-' + entry.name + '-隐藏字段', errorMessage: result.error });
    }
    // 索引 getter（调用次数必须为 0）。
    {
      let getterCalls = 0;
      const value = clone();
      Object.defineProperty(value, '1', { get: () => { getterCalls += 1; return 'x'; }, enumerable: true });
      const result = safeValidate(() => validate(value));
      assert(!result.ok && result.error.includes('getter/setter'), 'C2-负例-' + entry.name + '-getter 必须因容器形态拒绝，实际: ' + result.error);
      assert(getterCalls === 0, 'C2-负例-' + entry.name + '-getter 调用次数必须为 0');
      rejections.push({ name: 'C2-负例-' + entry.name + '-getter零调用', errorMessage: result.error });
    }
    // 自定义数组 prototype。
    {
      const value = clone();
      Object.setPrototypeOf(value, Object.create(Array.prototype));
      const result = safeValidate(() => validate(value));
      assert(!result.ok && result.error.includes('数组 prototype'), 'C2-负例-' + entry.name + '-自定义prototype 必须因容器形态拒绝，实际: ' + result.error);
      rejections.push({ name: 'C2-负例-' + entry.name + '-自定义prototype', errorMessage: result.error });
    }
  }
  // C3：fingerprint 碰撞证据——canonical 投影相同，非法一侧被正式 validator 拒绝。
  {
    const openMapValidate = (v) => validateValueAgainstSpec({ fixture, spec: fixture.types.CommittedWorldFact.fields.payload, value: v, path: 'catalog.payload' });
    const schemaArrayValidate = (v) => validateValueAgainstSpec({ fixture, spec: fixture.types.StoryAssetSeries.fields.chapterIds, value: v, path: 'catalog.series[0].chapterIds' });
    const base = { a: 1 };
    const withSymbol = { a: 1 };
    withSymbol[Symbol('k')] = 2;
    const withHidden = { a: 1 };
    Object.defineProperty(withHidden, 'hidden', { value: 2, enumerable: false });
    assert(canonicalJsonStringify(base) === canonicalJsonStringify(withSymbol), 'C3 前提：symbol 键不得参与 canonical 投影');
    assert(canonicalJsonStringify(base) === canonicalJsonStringify(withHidden), 'C3 前提：non-enumerable 键不得参与 canonical 投影');
    const collisionCases = [
      ['对象-symbol', withSymbol, 'symbol 键'],
      ['对象-隐藏字段', withHidden, '不可枚举隐藏字段'],
    ];
    for (const [name, polluted, keyword] of collisionCases) {
      const result = safeValidate(() => openMapValidate(polluted));
      assert(!result.ok && result.error.includes(keyword), 'C3-碰撞-' + name + ' 必须被正式 validator 拒绝，实际: ' + result.error);
      rejections.push({ name: 'C3-fingerprint碰撞-' + name, errorMessage: result.error });
    }
    const arrBase = ['a'];
    const arrSymbol = ['a'];
    arrSymbol[Symbol('k')] = 1;
    assert(canonicalJsonStringify(arrBase) === canonicalJsonStringify(arrSymbol), 'C3 前提：数组 symbol 键不得参与 canonical 投影');
    const arrResult = safeValidate(() => schemaArrayValidate(arrSymbol));
    assert(!arrResult.ok && arrResult.error.includes('symbol 键'), 'C3-碰撞-数组-symbol 必须被正式 validator 拒绝，实际: ' + arrResult.error);
    rejections.push({ name: 'C3-fingerprint碰撞-数组-symbol', errorMessage: arrResult.error });
    positives.push({ name: 'C3-fingerprint碰撞前提-投影相同非法侧被拒', detail: 'canonical projections identical; polluted side rejected' });
  }
  // D：deep-freeze 容器通过实例 validator；deep-freeze fixture 通过 validateContractFixture。
  {
    const frozen = deepFreeze(JSON.parse(JSON.stringify({ a: 1, arr: ['x', 2], nested: { ok: true } })));
    const result = safeValidate(() => validateValueAgainstSpec({ fixture, spec: fixture.types.CommittedWorldFact.fields.payload, value: frozen, path: 'catalog.payload' }));
    assert(result.ok, 'D-正例-deep-freeze 容器必须通过实例 validator: ' + result.error);
    positives.push({ name: 'D-正例-deep-freeze 容器', detail: 'passed' });
  }
  {
    const { fixture: originalFixture } = readContractFixture();
    const frozenFixture = deepFreeze(JSON.parse(JSON.stringify(originalFixture)));
    let ok = true;
    let errorMessage = '';
    try { validateContractFixture(frozenFixture); } catch (error) { ok = false; errorMessage = error.message; }
    assert(ok, 'D-正例-deep-freeze fixture 必须通过 validateContractFixture: ' + errorMessage);
    positives.push({ name: 'D-正例-deep-freeze fixture', detail: 'passed' });
  }
  // D：非法容器被拒绝前后，Reflect.ownKeys 与 descriptors 的只读快照必须不变。
  {
    const value = { a: 1 };
    value[Symbol('k')] = 2;
    Object.defineProperty(value, 'hidden', { value: 3, enumerable: false });
    Object.defineProperty(value, 'g', { get: () => 1, enumerable: true });
    const before = shapeSnapshot(value);
    const result = safeValidate(() => validateValueAgainstSpec({ fixture, spec: fixture.types.CommittedWorldFact.fields.payload, value, path: 'catalog.payload' }));
    assert(!result.ok, 'D-探针-非法容器必须被拒绝');
    assert(sameShapeSnapshot(shapeSnapshot(value), before), 'D-探针-拒绝后自有键与 property descriptors 必须不变');
    positives.push({ name: 'D-探针-拒绝后shape快照不变', detail: 'ownKeys + descriptors unchanged' });
  }
  return { positives, rejections };
}

// ── 子任务 F：五种 subject 参数化通用性证明（无敌人名称黑名单）──
export function runSubjectUniversalitySuite() {
  const { fixture } = readContractFixture();
  const positives = [];
  const rejections = [];
  const recordPositive = (name, detail) => positives.push({ name, detail });
  const recordRejected = (name, errorMessage, keywords) => {
    assert(keywords.some((k) => errorMessage.includes(k)), name + ' 拒绝原因必须包含目标层关键词 ' + JSON.stringify(keywords) + '，实际: ' + errorMessage);
    rejections.push({ name, errorMessage });
  };

  const buildProbe = ({ subjectKind, subjectRef, occurrencePolicy = 'unique', newInstancePolicy = 'forbidden', replayPolicy = 'once', earlyCompletionPolicy = 'resolve_same_definition' }) => {
    const isFacility = subjectKind === 'facility';
    const isCharacter = subjectKind === 'character';
    const probe = {
      schemaVersion: 1,
      catalogId: 'catalog_subject_probe',
      catalogRevision: 1,
      catalogFingerprint: '',
      normalizationVersion: 1,
      sourceKind: 'user_authored',
      title: 'subject probe',
      sourceRefs: [],
      series: [{ seriesId: 'series_probe', title: 'probe', workTitle: 'probe', ordinal: 1, chapterIds: ['chapter_probe'], segmentIds: ['segment_probe'], openingSegmentIds: ['segment_probe'], seriesFingerprint: '' }],
      chapters: [{ chapterId: 'chapter_probe', seriesId: 'series_probe', ordinal: 1, title: 'probe', summary: 'probe', contentFingerprint: '', chapterFingerprint: '' }],
      segments: [{
        segmentId: 'segment_probe', seriesId: 'series_probe', ordinal: 1, title: 'probe',
        chapterRange: { startOrdinal: 1, endOrdinal: 1, chapterIds: ['chapter_probe'] },
        isOpeningCandidate: true, summary: 'probe',
        hardConstraintIds: [], foreshadowConstraintIds: [], characterProfileIds: [], factionProfileIds: [],
        locationProfileIds: isFacility ? ['loc_probe'] : [],
        eventDefinitionIds: ['evt_probe'], timelineEntryIds: [],
        routePolicyId: 'route_probe', dependencySegmentIds: [], consequenceSegmentIds: [],
        segmentFingerprint: '',
      }],
      characterProfiles: isCharacter ? [{ characterProfileId: 'char_probe', name: 'probe', aliases: [], identitySummary: 'probe', factionProfileIds: [], initialStance: 'probe', relationshipNotes: [], stateNotes: [], importance: 'ordinary', profileFingerprint: '' }] : [],
      factionProfiles: [],
      locationProfiles: isFacility ? [{ locationProfileId: 'loc_probe', name: 'probe', aliases: [], level: 'zone', factionProfileIds: [], functionSummary: 'probe', facilityOccurrenceDefinitionIds: ['occ_probe'], profileFingerprint: '' }] : [],
      constraints: [],
      visibilityHints: [],
      timelineEntries: [],
      routePolicies: [{ routePolicyId: 'route_probe', participationPolicy: 'player_optional', bypassPolicy: 'world_background', deviationPolicy: 'continue_compatible', earlyCompletionPolicy, alternativeSegmentIds: [], consequenceSegmentIds: [], expiresAfterSegmentIds: [], routeFingerprint: '' }],
      occurrenceDefinitions: [{ occurrenceDefinitionId: 'occ_probe', title: 'probe', subject: subjectRef, occurrencePolicy, newInstancePolicy, identityAnchors: ['probe'], aliases: [], eventDefinitionIds: ['evt_probe'], definitionFingerprint: '' }],
      eventDefinitions: [{
        eventDefinitionId: 'evt_probe', origin: 'catalog', title: 'probe', actorEntityIds: [], targetEntityIds: [],
        dependencyDefinitionIds: [],
        completionPredicate: { predicateId: 'pred_probe', targetEntityIds: [], requiredFactTypes: ['probe_fact'], requiredEvidenceKinds: ['narrative_span'], payloadMatchers: [], minimumEvidenceCount: 1, deterministicKey: 'probe', allowedOutcomes: ['normal'], failureOutcomes: ['failed'] },
        scheduling: {}, allowedResolutionModes: ['player', 'world_background', 'player_early'], replayPolicy,
        publicScope: { kind: 'private' }, consequenceDefinitionIds: [], definitionFingerprint: '',
      }],
    };
    return recomputeSampleFingerprints(probe);
  };
  const refFor = (kind) => {
    if (kind === 'event') return { kind: 'event', eventDefinitionId: 'evt_probe' };
    if (kind === 'character') return { kind: 'character', characterProfileId: 'char_probe' };
    if (kind === 'facility') return { kind: 'facility', facilityId: 'facility_probe', locationProfileId: 'loc_probe' };
    if (kind === 'item') return { kind: 'item', itemId: 'item_probe' };
    return { kind: 'task_result', taskResultId: 'task_probe' };
  };
  const SUBJECTS = ['event', 'character', 'facility', 'item', 'task_result'];

  // 正例：正确 discriminator + 本 variant 必填引用（unique + forbidden + once + resolve_same_definition）通过。
  for (const kind of SUBJECTS) {
    const probe = buildProbe({ subjectKind: kind, subjectRef: refFor(kind) });
    let ok = true;
    let detail = '';
    try {
      validateAssetCatalogSample(probe, { fixture });
      detail = 'passed';
    } catch (error) {
      ok = false;
      detail = error.message;
    }
    assert(ok, 'F正例-' + kind + '-合法结构必须通过: ' + detail);
    recordPositive('F正例-' + kind + '-合法结构通过', detail);
  }
  // 结构负例：删除必填引用 / 混入另一 variant 字段 / 未知 tag，五种 subject 各一组。
  const otherField = { event: 'characterProfileId', character: 'facilityId', facility: 'itemId', item: 'taskResultId', task_result: 'eventDefinitionId' };
  for (const kind of SUBJECTS) {
    // 删除必填引用
    {
      const probe = buildProbe({ subjectKind: kind, subjectRef: refFor(kind) });
      delete probe.occurrenceDefinitions[0].subject[kind === 'facility' ? 'facilityId' : kind === 'event' ? 'eventDefinitionId' : kind === 'character' ? 'characterProfileId' : kind === 'item' ? 'itemId' : 'taskResultId'];
      recomputeSampleFingerprints(probe);
      let rejected = false;
      let errorMessage = '';
      try { validateAssetCatalogSample(probe, { fixture }); } catch (error) { rejected = true; errorMessage = error.message; }
      assert(rejected, 'F结构负例-' + kind + '-删除必填引用必须被拒绝');
      recordRejected('F结构负例-' + kind + '-删除必填引用', errorMessage, ['缺少必填字段']);
    }
    // 混入另一 variant 字段
    {
      const probe = buildProbe({ subjectKind: kind, subjectRef: refFor(kind) });
      probe.occurrenceDefinitions[0].subject[otherField[kind]] = 'foreign_probe';
      recomputeSampleFingerprints(probe);
      let rejected = false;
      let errorMessage = '';
      try { validateAssetCatalogSample(probe, { fixture }); } catch (error) { rejected = true; errorMessage = error.message; }
      assert(rejected, 'F结构负例-' + kind + '-混入他 variant 字段必须被拒绝');
      recordRejected('F结构负例-' + kind + '-混入他variant字段', errorMessage, ['未知字段']);
    }
    // 未知 tag
    {
      const probe = buildProbe({ subjectKind: kind, subjectRef: refFor(kind) });
      probe.occurrenceDefinitions[0].subject.kind = 'dragon_unknown';
      recomputeSampleFingerprints(probe);
      let rejected = false;
      let errorMessage = '';
      try { validateAssetCatalogSample(probe, { fixture }); } catch (error) { rejected = true; errorMessage = error.message; }
      assert(rejected, 'F结构负例-' + kind + '-未知 tag 必须被拒绝');
      recordRejected('F结构负例-' + kind + '-未知tag', errorMessage, ['非法 tag']);
    }
    // 语义负例：newInstancePolicy=allowed 走 resolve_same_definition（五种 subject 均拒绝）
    {
      const probe = buildProbe({ subjectKind: kind, subjectRef: refFor(kind), newInstancePolicy: 'allowed' });
      let rejected = false;
      let errorMessage = '';
      try { validateAssetCatalogSample(probe, { fixture }); } catch (error) { rejected = true; errorMessage = error.message; }
      assert(rejected, 'F语义负例-' + kind + '-allowed 走 resolve_same_definition 必须被拒绝');
      recordRejected('F语义负例-' + kind + '-allowed走resolve_same_definition', errorMessage, ['newInstancePolicy=forbidden']);
    }
  }
  return { positives, rejections };
}

// ── 检查 11：catalog 不得出现运行字段（G1.1.2.2 子任务 E）。
// 运行字段隔离由递归 schema 的未知字段拒绝保证（eventInstanceId/factId/runtimeBranchId/runtimeRevision
// 等未声明键在任何类型层都会失败）；值文本（sourceText/summary/statement 等）允许讨论这些词，不设文本黑名单。
// 禁止新增敌人、角色或字段名称黑名单。

// ── 主校验器：递归 schema + 引用/range + 绑定 + route 语义 + fingerprint + 运行字段，任一失败抛错 ──
export function validateAssetCatalogSample(sample, options = {}) {
  const fixture = options.fixture ?? readContractFixture().fixture;
  const checks = [];
  // A3：验证过程零修改——全程只读，前后 canonical 字节必须一致（若校验器排序/改写输入会在此失败）。
  const beforeCanonical = canonicalJsonStringify(sample);

  // 子任务 A：fixture 驱动的递归实例校验（11 种规格 + interface/union；每层未知字段拒绝；路径级错误）。
  validateValueAgainstType({ fixture, typeName: 'StoryAssetCatalog', value: sample, path: 'catalog' });
  checks.push('A 递归实例校验（StoryAssetCatalog 全值，路径级）');

  // 子任务 B：引用/ordinal/range 闭环。
  assertReferenceIntegrity(sample);
  assertOrdinalRangeConsistency(sample);
  checks.push('B catalog 引用/ordinal/range 闭环');

  // 语义：eventDefinitions origin 必须为 catalog。
  for (const eventDef of sample.eventDefinitions) {
    assert(eventDef.origin === 'catalog', 'catalog event origin 必须是 catalog: ' + eventDef.eventDefinitionId);
  }
  checks.push('eventDefinitions origin 全部为 catalog');

  // 语义：catalog completion predicate 不允许 targetEventInstanceId，且至少一种可核验条件。
  for (const eventDef of sample.eventDefinitions) {
    const predicate = eventDef.completionPredicate;
    assert(predicate.targetEventInstanceId === undefined, 'catalog completion predicate 不允许 targetEventInstanceId: ' + predicate.predicateId);
    assert(predicate.minimumEvidenceCount >= 1, 'completion predicate minimumEvidenceCount 必须 >= 1: ' + predicate.predicateId);
    const hasFactCondition = Array.isArray(predicate.requiredFactTypes) && predicate.requiredFactTypes.some((item) => typeof item === 'string' && item.trim().length > 0);
    const hasEvidenceCondition = Array.isArray(predicate.requiredEvidenceKinds) && predicate.requiredEvidenceKinds.length > 0;
    const hasPayloadCondition = Array.isArray(predicate.payloadMatchers) && predicate.payloadMatchers.some((matcher) => matcher && typeof matcher.path === 'string' && matcher.path.length > 0);
    assert(hasFactCondition || hasEvidenceCondition || hasPayloadCondition, 'completion predicate 不能只有标题/关键词: ' + predicate.predicateId);
  }
  checks.push('completion predicate 结构化证据条件');

  // 子任务 C：occurrence 显式绑定 + replay/newInstance 映射。
  assertOccurrenceBindings(sample);
  checks.push('C occurrence 显式绑定与 unique/forbidden 语义');

  // 子任务 D：route 语义（world_background / player_early / unique+forbidden）。
  assertRouteSemantics(sample);
  checks.push('D route 语义机器规则');

  // fingerprint：canonical JSON 排除自身指纹字段；两次字节级一致。
  assert(sample.normalizationVersion === 1, '样例 normalizationVersion 必须是 1');
  assert(sample.catalogFingerprint === computeCatalogFingerprint(sample), 'catalogFingerprint 与 canonical 计算不一致');
  const recordFingerprintRules = [
    ['series', 'seriesFingerprint'],
    ['chapters', 'chapterFingerprint'],
    ['segments', 'segmentFingerprint'],
    ['characterProfiles', 'profileFingerprint'],
    ['factionProfiles', 'profileFingerprint'],
    ['locationProfiles', 'profileFingerprint'],
    ['constraints', 'constraintFingerprint'],
    ['visibilityHints', 'hintFingerprint'],
    ['timelineEntries', 'timelineFingerprint'],
    ['routePolicies', 'routeFingerprint'],
    ['occurrenceDefinitions', 'definitionFingerprint'],
    ['eventDefinitions', 'definitionFingerprint'],
  ];
  for (const [section, fingerprintField] of recordFingerprintRules) {
    for (const record of sample[section]) {
      const expected = assetFingerprint(record, fingerprintField);
      assert(record[fingerprintField] === expected, section + ' 记录指纹与 canonical 计算不一致: ' + (record[fingerprintField] || '(missing)') + ' != ' + expected);
    }
  }
  for (const chapter of sample.chapters) {
    const expectedContent = assetFingerprint(chapter, 'contentFingerprint', 'chapterFingerprint');
    assert(chapter.contentFingerprint === expectedContent, 'chapter.contentFingerprint 与 canonical 计算不一致');
  }
  assert(computeCatalogFingerprint(sample) === computeCatalogFingerprint(JSON.parse(JSON.stringify(sample))), 'catalog fingerprint 两次计算不一致');
  checks.push('fingerprint canonical 计算与确定性');

  // 检查 11：运行字段隔离由递归 schema 未知字段拒绝保证（值文本允许讨论，不设黑名单）。
  checks.push('catalog 运行字段隔离（结构键未知字段拒绝，不扫描自然语言）');

  // A3：验证过程零修改——before/after canonical 字节一致。
  assert(canonicalJsonStringify(sample) === beforeCanonical, 'validateAssetCatalogSample 不得修改输入样例（before/after canonical 字节不一致）');
  checks.push('A3 验证过程零修改（前后 canonical 字节一致）');

  return { passedChecks: checks, catalogFingerprint: sample.catalogFingerprint };
}

// ── 子任务 E：manifest 普通/更新共用同一闸门 ──
export function assertAssetCatalogManifestMatches({ fixture, sample, manifest }) {
  const summary = validateAssetCatalogSample(sample, { fixture });
  const expected = computeCatalogFingerprint(sample);
  assert(manifest.assetCatalogSampleFingerprint === expected, 'manifest assetCatalogSampleFingerprint 与正式样例不一致: manifest=' + manifest.assetCatalogSampleFingerprint + ' sample=' + expected);
  return summary;
}

export function buildValidatedContractManifest({ fixture, sample, previousManifest }) {
  // 契约 fixture 与资产样例必须全部通过校验，失败时不得写文件。
  const contractSummary = validateContractFixture(fixture);
  const sampleSummary = validateAssetCatalogSample(sample, { fixture });
  const coverage = {
    types: Object.keys(fixture.types).sort(),
    enums: Object.keys(fixture.enums).sort(),
    commands: [...(fixture.commands.kinds || [])].sort(),
    errorCodes: fixture.errorCodes.map((item) => (typeof item === 'string' ? item : item.code)).sort(),
  };
  return {
    schemaVersion: CONTRACT_MANIFEST_SCHEMA,
    contractId: 'story-runtime-v3',
    contractRevision: fixture.contractRevision,
    fixtureFingerprint: computeContractFingerprint(fixture).fingerprint,
    assetCatalogSampleFingerprint: computeCatalogFingerprint(sample),
    coverage,
    generatedAt: '2026-08-07T00:00:00+08:00',
  };
}

async function main() {
  const { fixture } = readContractFixture();
  const raw = fs.readFileSync(path.join(process.cwd(), ASSET_SAMPLE_PATH), 'utf8');
  const sample = JSON.parse(raw);
  const summary = validateAssetCatalogSample(sample, { fixture });
  const universality = runSubjectUniversalitySuite();
  const unionProbes = runInlineUnionProbeSuite();
  const jsonProbes = runJsonValueProbeSuite();
  const openingProbes = runOpeningOrderSuite();
  const worldOnlyProbes = runWorldOnlySuite();
  const naturalLanguageProbes = runNaturalLanguageSuite();
  const canonicalIdProbes = runCanonicalSubjectIdProbeSuite();
  const failureImmutability = runFailureImmutabilityProbe();
  const combinationPositive = runCombinationPositiveSuite();
  const containerMatrix = runContainerMatrixSuite();
  const deepFreezeProbe = runDeepFreezeProbe();
  const positiveChecks = [
    { name: '正式样例通过 validateAssetCatalogSample', detail: summary.catalogFingerprint },
    ...universality.positives,
    ...unionProbes.positives,
    ...jsonProbes.positives,
    ...openingProbes.positives,
    ...worldOnlyProbes.positives,
    ...naturalLanguageProbes.positives,
    ...canonicalIdProbes.positives,
    ...failureImmutability,
    ...combinationPositive,
    ...containerMatrix.positives,
    deepFreezeProbe,
  ];
  const tamperRejections = [
    ...universality.rejections,
    ...unionProbes.rejections,
    ...jsonProbes.rejections,
    ...openingProbes.rejections,
    ...worldOnlyProbes.rejections,
    ...naturalLanguageProbes.rejections,
    ...canonicalIdProbes.rejections,
    ...containerMatrix.rejections,
  ];
  console.log('story-asset-catalog-contract regression passed.');
  console.log('sample: ' + ASSET_SAMPLE_PATH);
  console.log('catalogId: ' + sample.catalogId + ' (revision ' + sample.catalogRevision + ')');
  console.log('catalogFingerprint: ' + summary.catalogFingerprint);
  console.log('series: ' + sample.series.length + ', chapters: ' + sample.chapters.length + ', segments: ' + sample.segments.length);
  console.log('occurrenceDefinitions: ' + sample.occurrenceDefinitions.length + ', eventDefinitions: ' + sample.eventDefinitions.length);
  console.log('checks passed:');
  for (const check of summary.passedChecks) console.log('  - ' + check);
  console.log('positive checks: ' + positiveChecks.length);
  for (const result of positiveChecks) console.log('  + ' + result.name + ': ' + result.detail);
  console.log('tamper rejections: ' + tamperRejections.length);
  for (const result of tamperRejections) console.log('  - ' + result.name + ': rejected (' + result.errorMessage + ')');
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error('story-asset-catalog-contract regression failed: ' + (error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
}
