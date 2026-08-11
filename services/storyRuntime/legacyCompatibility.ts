// G1.2.3 旧数据只读兼容 + 迁移预览（生产，纯读取；当前不得被现有运行流程 import）。
// 回答三件事：
//  1) 旧剧情编织/新闻/世界.全局事件 怎样被安全读懂；
//  2) 缺少稳定 ID 的旧记录怎样得到可复现 ID，冲突显式暴露；
//  3) 生成迁移预览，不把"旧字段写着已完成"误当成世界事实。
// 本模块只产出只读视图、稳定 ID 映射与迁移预览：不写回旧存档、不生成正式 StoryRuntimeState、
// 不提交任何事实/事件实例/知识回执/新闻 outbox/当前焦点。
// 领域输出必须使用 G1.2.1 类型并通过 G1.2.2 结构校验（校验在回归侧执行，生产文件不 import 测试）。
import type {
  StoryAssetCatalog,
  StoryAssetSeries,
  StoryAssetChapter,
  StoryAssetSegment,
  StoryAssetCharacterProfile,
  StoryAssetFactionProfile,
  StoryAssetLocationProfile,
  StoryAssetConstraint,
  StoryAssetVisibilityHint,
  StoryAssetTimelineEntry,
  StoryAssetRoutePolicy,
  StoryAssetOccurrenceDefinition,
} from '../../models/storyAssetCatalog';
import type { NewsArticleAggregate, NewsArticleVersion, NewsSourceRef, MigrationTraceStatus } from '../../models/storyRuntimeProjection';
import { canonicalJsonStringify, normalizeLegacyText, assertPlainJsonValue } from './normalization';
import { sha256Fingerprint, stableId } from './id';
import { buildLegacyIdMap, type LegacyIdMap, type LegacyIdMapEntry } from './legacyIdMap';

// 语义 scope 归一化：稳定 ID 的 scope 内所有旧文本字符串先 trim+NFC（NFD 与首尾空格伪装必须映射同一 ID）。
function normScope(scope: unknown): unknown {
  if (typeof scope === 'string') return normalizeLegacyText(scope);
  if (Array.isArray(scope)) return scope.map(normScope);
  if (scope !== null && typeof scope === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(scope)) out[key] = normScope(child);
    return out;
  }
  return scope;
}
const stableIdN = (namespace: string, scope: unknown, legacyId?: string): Promise<string> =>
  stableId(namespace, normScope(scope), legacyId);

// ── 旧数据窄化读取形状（只读；字段名来自旧 models，不是第二套 schema）──
interface LegacyConstraintEntry { 内容: string; 信息可见性?: unknown }
interface LegacyKeyEvent { 事件名: string; 事件说明: string; 前置条件?: string[]; 触发条件?: string[]; 阻断条件?: string[]; 事件结果?: string[]; 对后续影响?: string[]; 信息可见性?: unknown }
interface LegacyChapter { id?: string; 序号?: number; 标题?: string; 内容?: string; 字数?: number }
interface LegacySegment {
  id?: string; 组号?: number; 标题?: string; 章节范围?: string; 章节标题?: string[]; 是否开局组?: boolean;
  起始章序号?: number; 结束章序号?: number; 启用注入?: boolean; 原文内容?: string; 原文摘要?: string; 本段概括?: string;
  时间线起点?: string; 时间线终点?: string; 开局已成立事实?: string[]; 前段延续事实?: string[]; 本段结束状态?: string[];
  给后续参考?: string[]; 原著硬约束?: LegacyConstraintEntry[]; 可提前铺垫?: LegacyConstraintEntry[];
  登场角色?: string[]; 涉及地点?: string[]; 涉及派系?: string[]; 角色档案?: LegacyCharacterProfile[];
  势力档案?: LegacyFactionProfile[]; 地图地点档案?: LegacyLocationProfile[]; 关键事件?: LegacyKeyEvent[];
  时间线?: LegacyTimelineEvent[]; 角色推进?: unknown[]; 处理状态?: string; 运行状态?: string; 最近错误?: string; updatedAt?: number;
}
interface LegacySeries { id?: string; 标题?: string; 作品名?: string; 来源类型?: string; 章节列表?: LegacyChapter[]; 分段列表?: LegacySegment[]; 每段章数?: number; 激活注入?: boolean; 当前分段组号?: number; 当前阶段概括?: string; 核心角色摘要?: string[]; 核心角色?: string[]; 涉及地点索引?: string[]; 涉及派系索引?: string[]; createdAt?: number; updatedAt?: number }
interface LegacyCharacterProfile { 名称?: string; 身份?: string; 所属势力?: string; 初始立场?: string; 关系摘要?: string[]; 状态摘要?: string[]; 首次出现?: string; 重要性?: string }
interface LegacyFactionProfile { 名称?: string; 类型?: string; 地盘?: string; 代表人物?: string[]; 立场目标?: string; 当前状态?: string; 关系摘要?: string[]; 首次出现?: string }
interface LegacyLocationProfile { 名称?: string; 层级?: string; 上级地点?: string; 所属势力?: string; 地貌功能?: string; 关键设施?: string[]; 首次出现?: string }
interface LegacyTimelineEvent { 标题?: string; 时间锚点?: string; 描述?: string; 涉及角色?: string[] }
interface LegacyProgressAnchor { 当前系列ID?: string; 当前分段ID?: string; 当前分段组号?: number }
interface LegacyStoryWeavingSystem { 系列列表?: LegacySeries[]; 当前系列ID?: string; 当前进度?: LegacyProgressAnchor; 历史归档?: unknown[] }

function isLegacyRecord(value: unknown): value is object {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ── 公共结果形状（本阶段局部 DTO，不入冻结 schema）──
export type PreviewStatus = 'ready' | 'needs_confirmation' | 'invalid';

export interface ForbiddenSideEffects {
  eventInstances: [];
  factLedger: [];
  knowledgeReceipts: [];
  outbox: [];
}

export interface CursorCandidate {
  kind: 'cursor_candidate';
  path: string;
  legacyId: string | null;
  label: string;
  /** 只读游标候选：显示给用户确认从哪里继续，不激活运行状态 */
  scope: unknown;
}

// ══════════════════════════════════════════════════════════════════════
// 旧剧情编织 preview
// ══════════════════════════════════════════════════════════════════════
export interface LegacyStoryWeavingPreview {
  sourceFingerprint: string;
  status: PreviewStatus;
  warnings: string[];
  unresolved: string[];
  confirmations: string[];
  idMap: LegacyIdMap;
  /** 只读资产候选（V3 StoryAssetCatalog 形状）；不激活运行状态 */
  catalogCandidate: StoryAssetCatalog | null;
  /** 只读游标候选（建议从哪里继续）；不写 StoryFocus */
  cursorCandidates: CursorCandidate[];
  sideEffects: ForbiddenSideEffects;
}

async function fingerprintExcluding(value: unknown, ...excludeKeys: string[]): Promise<string> {
  if (value === null || typeof value !== 'object') return sha256Fingerprint(value);
  const clone = { ...(value as Record<string, unknown>) };
  for (const key of excludeKeys) delete clone[key];
  return sha256Fingerprint(clone);
}

/**
 * 旧剧情编织 -> 只读资产候选 + 游标候选 + 确认项。
 * 旧分段"已完成/已经历/已跳过"不生成终态事件/事实/知识；无法安全转换的关键事件只诊断。
 */
export async function previewLegacyStoryWeaving(input: unknown): Promise<LegacyStoryWeavingPreview> {
  assertPlainJsonValue(input, 'input');
  const sourceFingerprint = await sha256Fingerprint(input);
  const warnings: string[] = [];
  const unresolved: string[] = [];
  const confirmations: string[] = [];
  const idMapEntries: LegacyIdMapEntry[] = [];
  const generatedIdentities = new Map<string, string>();
  const legacyIdentities = new Map<string, string>();
  const acceptLegacyIdentity = (kind: string, legacyId: string | undefined, path: string): boolean => {
    const normalizedLegacyId = legacyId === undefined ? '' : normalizeLegacyText(legacyId);
    if (normalizedLegacyId.length === 0) return true;
    const key = kind + '::' + normalizedLegacyId;
    const previousPath = legacyIdentities.get(key);
    if (previousPath !== undefined) {
      unresolved.push('duplicate_source_identity: ' + kind + ' 的 legacyId「' + normalizedLegacyId + '」重复（' + previousPath + ' / ' + path + '），不能生成两个 target，要求确认。');
      return false;
    }
    legacyIdentities.set(key, path);
    return true;
  };
  const acceptGeneratedIdentity = (kind: string, id: string, path: string): boolean => {
    const key = kind + '::' + id;
    const previousPath = generatedIdentities.get(key);
    if (previousPath !== undefined) {
      unresolved.push('duplicate_source_identity: ' + kind + ' 的无旧 ID 语义身份重复（' + previousPath + ' / ' + path + '），不能用数组位置拆成两个对象，要求确认。');
      return false;
    }
    generatedIdentities.set(key, path);
    return true;
  };
  const sys = (isLegacyRecord(input) ? input : {}) as LegacyStoryWeavingSystem;
  const seriesList = Array.isArray(sys.系列列表) ? sys.系列列表 : [];

  if (!Array.isArray(sys.系列列表)) {
    return {
      sourceFingerprint,
      status: 'invalid',
      warnings: ['输入不是合法的旧剧情编织系统（缺少 系列列表 数组）'],
      unresolved: ['input.系列列表 缺失或不是数组'],
      confirmations: [],
      idMap: (await buildLegacyIdMap([])).map,
      catalogCandidate: null,
      cursorCandidates: [],
      sideEffects: { eventInstances: [], factLedger: [], knowledgeReceipts: [], outbox: [] },
    };
  }

  // 只读游标候选：当前进度/当前系列 只作为建议游标。
  const cursorCandidates: CursorCandidate[] = [];
  if (sys.当前系列ID) {
    cursorCandidates.push({ kind: 'cursor_candidate', path: '当前系列ID', legacyId: String(sys.当前系列ID), label: '旧当前系列', scope: { 当前系列ID: sys.当前系列ID } });
  }
  if (isLegacyRecord(sys.当前进度)) {
    const anchor = sys.当前进度 as LegacyProgressAnchor;
    cursorCandidates.push({
      kind: 'cursor_candidate',
      path: '当前进度',
      legacyId: anchor.当前分段ID ?? null,
      label: '旧当前进度（分段 ' + (anchor.当前分段ID ?? '?') + '，组 ' + (anchor.当前分段组号 ?? '?') + '）',
      scope: { 当前系列ID: anchor.当前系列ID ?? null, 当前分段ID: anchor.当前分段ID ?? null, 当前分段组号: anchor.当前分段组号 ?? null },
    });
  }
  if (cursorCandidates.length > 0) {
    confirmations.push('旧当前系列/当前进度只生成只读游标候选；未写 StoryFocus，未激活运行状态。');
  }

  const seriesCandidates: StoryAssetSeries[] = [];
  const chapterCandidates: StoryAssetChapter[] = [];
  const segmentCandidates: StoryAssetSegment[] = [];
  const characterCandidates: StoryAssetCharacterProfile[] = [];
  const factionCandidates: StoryAssetFactionProfile[] = [];
  const locationCandidates: StoryAssetLocationProfile[] = [];
  const constraintCandidates: StoryAssetConstraint[] = [];
  const visibilityHintCandidates: StoryAssetVisibilityHint[] = [];
  const timelineCandidates: StoryAssetTimelineEntry[] = [];
  const routeCandidates: StoryAssetRoutePolicy[] = [];
  const occurrenceCandidates: StoryAssetOccurrenceDefinition[] = [];
  let eventDefinitionCount = 0;
  let keyEventUnresolved = 0;

  for (const [seriesIndex, series] of seriesList.entries()) {
    if (!isLegacyRecord(series)) {
      unresolved.push('系列列表[' + seriesIndex + '] 不是对象，无法生成资产候选，要求确认。');
      continue;
    }
    const seriesPath = '系列列表[' + seriesIndex + ']';
    if (!acceptLegacyIdentity('series', series.id, seriesPath)) continue;
    const seriesId = await stableIdN('asset:series', { title: series.标题 ?? '', workTitle: series.作品名 ?? '' }, series.id);
    if (!acceptGeneratedIdentity('series', seriesId, seriesPath)) continue;
    const seriesSourceFingerprint = await sha256Fingerprint(series);
    idMapEntries.push({ legacyPath: seriesPath, legacyId: series.id ?? '', targetKind: 'series', targetId: seriesId, sourceFingerprint: seriesSourceFingerprint, diagnostics: [] });
    const chapters = Array.isArray(series.章节列表) ? series.章节列表 : [];
    const segments = Array.isArray(series.分段列表) ? series.分段列表 : [];
    const chapterIds: string[] = [];
    const chapterRecords: Array<{ id: string; ordinal: number; title: string }> = [];
    for (const [chapterIndex, chapter] of chapters.entries()) {
      if (!isLegacyRecord(chapter)) {
        unresolved.push(seriesPath + '.章节列表[' + chapterIndex + '] 不是对象，无法生成章节候选，要求确认。');
        continue;
      }
      if (!acceptLegacyIdentity('chapter', chapter.id, seriesPath + '.章节列表[' + chapterIndex + ']')) continue;
      const chapterOrdinal = Number.isInteger(chapter.序号) ? (chapter.序号 as number) : chapterIndex + 1;
      const chapterId = await stableIdN('asset:chapter', { seriesId, ordinal: chapterOrdinal, title: chapter.标题 ?? '' }, chapter.id);
      if (!acceptGeneratedIdentity('chapter', chapterId, seriesPath + '.章节列表[' + chapterIndex + ']')) continue;
      chapterIds.push(chapterId);
      chapterRecords.push({ id: chapterId, ordinal: chapterOrdinal, title: normalizeLegacyText(chapter.标题 ?? '') });
      idMapEntries.push({
        legacyPath: seriesPath + '.章节列表[' + chapterIndex + ']',
        legacyId: chapter.id ?? '',
        targetKind: 'chapter',
        targetId: chapterId,
        sourceFingerprint: await sha256Fingerprint(chapter),
        diagnostics: [],
      });
      chapterCandidates.push({
        chapterId,
        seriesId,
        ordinal: chapterOrdinal,
        title: normalizeLegacyText(chapter.标题 ?? ''),
        summary: normalizeLegacyText(chapter.内容 ?? '').slice(0, 200),
        ...(chapter.内容 !== undefined ? { sourceText: chapter.内容 } : {}),
        contentFingerprint: await fingerprintExcluding(chapter, 'contentFingerprint'),
        chapterFingerprint: '',
      });
    }
    const segmentIds: string[] = [];
    for (const [segmentIndex, segment] of segments.entries()) {
      if (!isLegacyRecord(segment)) {
        unresolved.push(seriesPath + '.分段列表[' + segmentIndex + '] 不是对象，无法生成分段候选，要求确认。');
        continue;
      }
      const segmentPath = seriesPath + '.分段列表[' + segmentIndex + ']';
      if (!acceptLegacyIdentity('segment', segment.id, segmentPath)) continue;
      const segmentOrdinal = Number.isInteger(segment.组号)
        ? (segment.组号 as number)
        : (Number.isInteger(segment.起始章序号) ? (segment.起始章序号 as number) : segmentIndex + 1);
      const segmentId = await stableIdN('asset:segment', { seriesId, ordinal: segmentOrdinal, title: segment.标题 ?? '' }, segment.id);
      if (!acceptGeneratedIdentity('segment', segmentId, segmentPath)) continue;
      segmentIds.push(segmentId);
      // 旧分段运行状态：已完成/已经历/已跳过 -> 只诊断 + 确认，不生成任何事实/事件。
      const runState = segment.运行状态 ?? '';
      const procState = segment.处理状态 ?? '';
      if (runState === '已经历' || runState === '已跳过' || procState === '已完成') {
        warnings.push('旧分段「' + (segment.标题 ?? segment.id ?? '?') + '」标记为 ' + runState + '/' + procState + '：只读迁移，不生成终态事件或事实。');
      }
      // 硬约束 / 可提前铺垫 -> 资产约束候选（nonProgressing: true）。
      const hardConstraintIds: string[] = [];
      for (const [index, constraint] of (Array.isArray(segment.原著硬约束) ? segment.原著硬约束 : []).entries()) {
        if (!isLegacyRecord(constraint)) {
          unresolved.push(segmentPath + '.原著硬约束[' + index + '] 不是对象，跳过并要求确认。');
          continue;
        }
        const constraintId = await stableIdN('asset:constraint', { segmentId, kind: 'hard', content: constraint.内容 ?? '' }, '');
        if (!acceptGeneratedIdentity('constraint', constraintId, segmentPath + '.原著硬约束[' + index + ']')) continue;
        hardConstraintIds.push(constraintId);
        idMapEntries.push({ legacyPath: segmentPath + '.原著硬约束[' + index + ']', legacyId: '', targetKind: 'constraint', targetId: constraintId, sourceFingerprint: await sha256Fingerprint({ segmentId, kind: 'hard', record: constraint }), diagnostics: [] });
        constraintCandidates.push({
          constraintId,
          kind: 'hard',
          segmentIds: [segmentId],
          statement: normalizeLegacyText(constraint.内容 ?? ''),
          nonProgressing: true,
          constraintFingerprint: '',
        });
      }
      const foreshadowConstraintIds: string[] = [];
      for (const [index, constraint] of (Array.isArray(segment.可提前铺垫) ? segment.可提前铺垫 : []).entries()) {
        if (!isLegacyRecord(constraint)) {
          unresolved.push(segmentPath + '.可提前铺垫[' + index + '] 不是对象，跳过并要求确认。');
          continue;
        }
        const constraintId = await stableIdN('asset:constraint', { segmentId, kind: 'foreshadow', content: constraint.内容 ?? '' }, '');
        if (!acceptGeneratedIdentity('constraint', constraintId, segmentPath + '.可提前铺垫[' + index + ']')) continue;
        foreshadowConstraintIds.push(constraintId);
        idMapEntries.push({ legacyPath: segmentPath + '.可提前铺垫[' + index + ']', legacyId: '', targetKind: 'constraint', targetId: constraintId, sourceFingerprint: await sha256Fingerprint({ segmentId, kind: 'foreshadow', record: constraint }), diagnostics: [] });
        constraintCandidates.push({
          constraintId,
          kind: 'foreshadow',
          segmentIds: [segmentId],
          statement: normalizeLegacyText(constraint.内容 ?? ''),
          nonProgressing: true,
          constraintFingerprint: '',
        });
      }
      // 关键事件：缺少稳定 definition ID / 结构化 completion predicate / replay/new-instance policy -> 只诊断。
      for (const [eventIndex, event] of (Array.isArray(segment.关键事件) ? segment.关键事件 : []).entries()) {
        if (!isLegacyRecord(event)) {
          unresolved.push(segmentPath + '.关键事件[' + eventIndex + '] 不是对象，无法安全转换，要求确认。');
          continue;
        }
        const hasStructuredFields = typeof event.事件名 === 'string' && event.事件名.length > 0
          && Array.isArray(event.触发条件) && event.触发条件.length > 0
          && Array.isArray(event.事件结果) && event.事件结果.length > 0;
        if (!hasStructuredFields) {
          keyEventUnresolved += 1;
          unresolved.push('旧关键事件「' + (event.事件名 ?? '?') + '」缺少结构化 completion predicate/replay policy，无法安全转换为 WorldEventDefinition，仅输出诊断。');
        } else {
          eventDefinitionCount += 1;
          unresolved.push('旧关键事件「' + event.事件名 + '」虽有触发条件/结果，但仍缺少 V3 definition ID、结构化 completion predicate 与 replay/new-instance policy；不生成 WorldEventDefinition，要求确认。');
          warnings.push('旧关键事件「' + event.事件名 + '」仅作为待确认迁移线索计数；正式 WorldEventDefinition 生成需在 G1.3 迁移器按 contract 校验后完成。');
        }
      }
      // 时间线 -> 资产时间线候选（不填 GameTime at；旧时间锚点是文本）。
      const timelineEntryIds: string[] = [];
      const segmentCharacterProfileIds: string[] = [];
      const segmentFactionProfileIds: string[] = [];
      const segmentLocationProfileIds: string[] = [];
      let timelineSequence = 0;
      for (const [index, tl] of (Array.isArray(segment.时间线) ? segment.时间线 : []).entries()) {
        if (!isLegacyRecord(tl)) {
          unresolved.push(segmentPath + '.时间线[' + index + '] 不是对象，跳过并要求确认。');
          continue;
        }
        const actors = Array.isArray(tl.涉及角色) ? tl.涉及角色.map((r) => normalizeLegacyText(r)).sort() : [];
        const timelineId = await stableIdN('asset:timeline', {
          segmentId,
          title: tl.标题 ?? '',
          description: tl.描述 ?? '',
          timeAnchor: tl.时间锚点 ?? '',
          actors,
        }, '');
        if (!acceptGeneratedIdentity('timeline', timelineId, segmentPath + '.时间线[' + index + ']')) continue;
        timelineSequence += 1;
        timelineEntryIds.push(timelineId);
        idMapEntries.push({ legacyPath: segmentPath + '.时间线[' + index + ']', legacyId: '', targetKind: 'timeline', targetId: timelineId, sourceFingerprint: await sha256Fingerprint({ segmentId, record: tl }), diagnostics: [] });
        timelineCandidates.push({
          timelineEntryId: timelineId,
          segmentId,
          sequence: timelineSequence,
          title: normalizeLegacyText(tl.标题 ?? ''),
          description: normalizeLegacyText(tl.描述 ?? ''),
          // 旧时间锚点是文本，不是 GameTime；at 保持省略（optional 不填）。
          actorEntityIds: actors,
          eventDefinitionIds: [],
          timelineFingerprint: '',
        });
      }
      // 角色/势力/地点档案 -> 资产档案候选。
      for (const [profileIndex, profile] of (Array.isArray(segment.角色档案) ? segment.角色档案 : []).entries()) {
        if (!isLegacyRecord(profile)) {
          unresolved.push(segmentPath + '.角色档案[' + profileIndex + '] 不是对象，跳过并要求确认。');
          continue;
        }
        if (!profile.名称) continue;
        const profileId = await stableIdN('asset:character', { segmentId, name: profile.名称 }, '');
        if (!acceptGeneratedIdentity('character', profileId, segmentPath + '.角色档案[' + profileIndex + ']')) continue;
        segmentCharacterProfileIds.push(profileId);
        idMapEntries.push({ legacyPath: segmentPath + '.角色档案[' + profileIndex + ']', legacyId: '', targetKind: 'character', targetId: profileId, sourceFingerprint: await sha256Fingerprint({ segmentId, record: profile }), diagnostics: [] });
        characterCandidates.push({
          characterProfileId: profileId,
          name: normalizeLegacyText(profile.名称),
          aliases: [],
          identitySummary: normalizeLegacyText(profile.身份 ?? ''),
          factionProfileIds: [],
          initialStance: normalizeLegacyText(profile.初始立场 ?? ''),
          relationshipNotes: Array.isArray(profile.关系摘要) ? profile.关系摘要.map((r) => normalizeLegacyText(r)) : [],
          stateNotes: Array.isArray(profile.状态摘要) ? profile.状态摘要.map((r) => normalizeLegacyText(r)) : [],
          firstAppearanceSegmentId: segmentId,
          importance: profile.重要性 === '重要' ? 'important' : profile.重要性 === '核心' ? 'core' : 'ordinary',
          profileFingerprint: '',
        });
      }
      for (const [profileIndex, profile] of (Array.isArray(segment.势力档案) ? segment.势力档案 : []).entries()) {
        if (!isLegacyRecord(profile)) {
          unresolved.push(segmentPath + '.势力档案[' + profileIndex + '] 不是对象，跳过并要求确认。');
          continue;
        }
        if (!profile.名称) continue;
        const profileId = await stableIdN('asset:faction', { segmentId, name: profile.名称 }, '');
        if (!acceptGeneratedIdentity('faction', profileId, segmentPath + '.势力档案[' + profileIndex + ']')) continue;
        segmentFactionProfileIds.push(profileId);
        idMapEntries.push({ legacyPath: segmentPath + '.势力档案[' + profileIndex + ']', legacyId: '', targetKind: 'faction', targetId: profileId, sourceFingerprint: await sha256Fingerprint({ segmentId, record: profile }), diagnostics: [] });
        factionCandidates.push({
          factionProfileId: profileId,
          name: normalizeLegacyText(profile.名称),
          aliases: [],
          typeSummary: normalizeLegacyText(profile.类型 ?? ''),
          territoryLocationIds: [],
          representativeCharacterIds: [],
          goalSummary: normalizeLegacyText(profile.立场目标 ?? ''),
          stateSummary: normalizeLegacyText(profile.当前状态 ?? ''),
          relationshipNotes: Array.isArray(profile.关系摘要) ? profile.关系摘要.map((r) => normalizeLegacyText(r)) : [],
          firstAppearanceSegmentId: segmentId,
          profileFingerprint: '',
        });
      }
      for (const [profileIndex, profile] of (Array.isArray(segment.地图地点档案) ? segment.地图地点档案 : []).entries()) {
        if (!isLegacyRecord(profile)) {
          unresolved.push(segmentPath + '.地图地点档案[' + profileIndex + '] 不是对象，跳过并要求确认。');
          continue;
        }
        if (!profile.名称) continue;
        const profileId = await stableIdN('asset:location', { segmentId, name: profile.名称 }, '');
        if (!acceptGeneratedIdentity('location', profileId, segmentPath + '.地图地点档案[' + profileIndex + ']')) continue;
        segmentLocationProfileIds.push(profileId);
        idMapEntries.push({ legacyPath: segmentPath + '.地图地点档案[' + profileIndex + ']', legacyId: '', targetKind: 'location', targetId: profileId, sourceFingerprint: await sha256Fingerprint({ segmentId, record: profile }), diagnostics: [] });
        const level = (profile.层级 ?? '未知') === '寰宇' ? 'cosmos'
          : (profile.层级 ?? '') === '大地点' ? 'major'
          : (profile.层级 ?? '') === '中地点' ? 'medium'
          : (profile.层级 ?? '') === '小地点' ? 'minor'
          : (profile.层级 ?? '') === '区地点' ? 'zone'
          : (profile.层级 ?? '') === '子地点' ? 'sublocation'
          : 'unknown';
        locationCandidates.push({
          locationProfileId: profileId,
          name: normalizeLegacyText(profile.名称),
          aliases: [],
          level,
          // 旧"上级地点"是文本；V3 parentLocationId 是 locationProfileId 引用，无法安全推断 -> 省略。
          factionProfileIds: [],
          functionSummary: normalizeLegacyText(profile.地貌功能 ?? ''),
          facilityOccurrenceDefinitionIds: [],
          firstAppearanceSegmentId: segmentId,
          profileFingerprint: '',
        });
      }
      // 约束 -> 可见性提示候选（grantsKnowledge: false literal）。
      if (hardConstraintIds.length > 0 || foreshadowConstraintIds.length > 0) {
        const hintId = await stableIdN('asset:visibility', { segmentId }, '');
        visibilityHintCandidates.push({
          visibilityHintId: hintId,
          knownByEntityIds: [],
          unknownToEntityIds: [],
          observerOnly: true,
          grantsKnowledge: false,
          hintFingerprint: '',
        });
      }
      const normalizedChapterTitles = new Set((Array.isArray(segment.章节标题) ? segment.章节标题 : []).map((title) => normalizeLegacyText(title)));
      const rangeMatch = typeof segment.章节范围 === 'string'
        ? segment.章节范围.match(/(\d+)\s*(?:-|~|至|到)\s*(\d+)/)
        : null;
      const startHint = Number.isInteger(segment.起始章序号) ? (segment.起始章序号 as number) : (rangeMatch ? Number(rangeMatch[1]) : null);
      const endHint = Number.isInteger(segment.结束章序号) ? (segment.结束章序号 as number) : (rangeMatch ? Number(rangeMatch[2]) : null);
      const rangedChapters = chapterRecords.filter((chapter) => {
        const inOrdinalRange = startHint !== null && endHint !== null
          ? chapter.ordinal >= startHint && chapter.ordinal <= endHint
          : true;
        const titleMatches = normalizedChapterTitles.size === 0 || normalizedChapterTitles.has(chapter.title);
        return inOrdinalRange && titleMatches;
      });
      const segmentChapters = rangedChapters.length > 0 ? rangedChapters : chapterRecords.slice(0, 1);
      if (rangedChapters.length === 0) {
        unresolved.push(segmentPath + '.章节范围/章节标题 无法精确绑定到系列章节，暂以首章作为只读候选并要求确认。');
      }
      const sortedSegmentChapters = [...segmentChapters].sort((a, b) => a.ordinal - b.ordinal);
      const segmentCandidate: StoryAssetSegment = {
        segmentId,
        seriesId,
        ordinal: segmentOrdinal,
        title: normalizeLegacyText(segment.标题 ?? ''),
        chapterRange: {
          startOrdinal: sortedSegmentChapters[0]?.ordinal ?? 1,
          endOrdinal: sortedSegmentChapters[sortedSegmentChapters.length - 1]?.ordinal ?? 1,
          chapterIds: sortedSegmentChapters.map((chapter) => chapter.id),
        },
        isOpeningCandidate: segment.是否开局组 === true,
        summary: normalizeLegacyText(segment.原文摘要 ?? segment.本段概括 ?? ''),
        ...(segment.原文内容 ? { sourceExcerpt: segment.原文内容.slice(0, 500) } : {}),
        hardConstraintIds,
        foreshadowConstraintIds,
        characterProfileIds: segmentCharacterProfileIds,
        factionProfileIds: segmentFactionProfileIds,
        locationProfileIds: segmentLocationProfileIds,
        eventDefinitionIds: [],
        timelineEntryIds,
        routePolicyId: 'route_legacy_' + seriesId.slice(7, 19),
        dependencySegmentIds: [],
        consequenceSegmentIds: [],
        segmentFingerprint: '',
      };
      segmentCandidates.push(segmentCandidate);
      idMapEntries.push({ legacyPath: segmentPath, legacyId: segment.id ?? '', targetKind: 'segment', targetId: segmentId, sourceFingerprint: await sha256Fingerprint(segment), diagnostics: [] });
    }
    const orderedChapters = [...chapterRecords].sort((a, b) => a.ordinal - b.ordinal);
    const orderedSegments = segmentCandidates.filter((candidate) => candidate.seriesId === seriesId).sort((a, b) => a.ordinal - b.ordinal);
    const seriesCandidate: StoryAssetSeries = {
      seriesId,
      title: normalizeLegacyText(series.标题 ?? ''),
      workTitle: normalizeLegacyText(series.作品名 ?? ''),
      ordinal: seriesIndex + 1,
      chapterIds: orderedChapters.map((chapter) => chapter.id),
      segmentIds: orderedSegments.map((segment) => segment.segmentId),
      openingSegmentIds: orderedSegments.filter((segment) => segment.isOpeningCandidate).map((segment) => segment.segmentId),
      defaultRoutePolicyId: 'route_legacy_' + seriesId.slice(7, 19),
      sourceRef: 'legacy:' + (series.来源类型 ?? 'canon'),
      seriesFingerprint: '',
    };
    seriesCandidates.push(seriesCandidate);
    // 为没有旧 route 的分段生成确定性的 player_optional 迁移候选策略（资产候选，不激活运行状态）。
    routeCandidates.push({
      routePolicyId: 'route_legacy_' + seriesId.slice(7, 19),
      participationPolicy: 'player_optional',
      bypassPolicy: 'world_background',
      deviationPolicy: 'continue_compatible',
      earlyCompletionPolicy: 'not_applicable',
      alternativeSegmentIds: [],
      consequenceSegmentIds: [],
      expiresAfterSegmentIds: [],
      routeFingerprint: '',
    });
    confirmations.push('系列「' + (series.标题 ?? '?') + '」生成 player_optional 迁移候选 route（只读资产候选，不激活运行状态）。');
  }

  // 计算所有记录 fingerprint（排除自身字段）。
  for (const record of seriesCandidates) record.seriesFingerprint = await fingerprintExcluding(record, 'seriesFingerprint');
  for (const record of chapterCandidates) {
    record.contentFingerprint = await fingerprintExcluding(record, 'contentFingerprint', 'chapterFingerprint');
    record.chapterFingerprint = await fingerprintExcluding(record, 'chapterFingerprint');
  }
  for (const record of segmentCandidates) record.segmentFingerprint = await fingerprintExcluding(record, 'segmentFingerprint');
  for (const record of characterCandidates) record.profileFingerprint = await fingerprintExcluding(record, 'profileFingerprint');
  for (const record of factionCandidates) record.profileFingerprint = await fingerprintExcluding(record, 'profileFingerprint');
  for (const record of locationCandidates) record.profileFingerprint = await fingerprintExcluding(record, 'profileFingerprint');
  for (const record of constraintCandidates) record.constraintFingerprint = await fingerprintExcluding(record, 'constraintFingerprint');
  for (const record of visibilityHintCandidates) record.hintFingerprint = await fingerprintExcluding(record, 'hintFingerprint');
  for (const record of timelineCandidates) record.timelineFingerprint = await fingerprintExcluding(record, 'timelineFingerprint');
  for (const record of routeCandidates) record.routeFingerprint = await fingerprintExcluding(record, 'routeFingerprint');
  for (const record of occurrenceCandidates) record.definitionFingerprint = await fingerprintExcluding(record, 'definitionFingerprint');

  const catalogCandidate: StoryAssetCatalog = {
    schemaVersion: 1,
    catalogId: await stableIdN('asset:catalog', { source: 'legacy:story-weaving', seriesIds: seriesCandidates.map((s) => s.seriesId).sort() }, ''),
    catalogRevision: 1,
    catalogFingerprint: '',
    normalizationVersion: 1,
    sourceKind: 'legacy_migrated',
    title: '旧剧情编织迁移预览（只读资产候选）',
    sourceRefs: ['legacy:story-weaving'],
    series: seriesCandidates,
    chapters: chapterCandidates,
    segments: segmentCandidates,
    characterProfiles: characterCandidates,
    factionProfiles: factionCandidates,
    locationProfiles: locationCandidates,
    constraints: constraintCandidates,
    visibilityHints: visibilityHintCandidates,
    timelineEntries: timelineCandidates,
    routePolicies: routeCandidates,
    occurrenceDefinitions: occurrenceCandidates,
    eventDefinitions: [],
  };
  catalogCandidate.catalogFingerprint = await fingerprintExcluding(catalogCandidate, 'catalogFingerprint');

  const idMapResult = await buildLegacyIdMap(idMapEntries);
  if (idMapResult.conflicts.length > 0) {
    unresolved.push(...idMapResult.conflicts.map((conflict) => 'legacyIdMap ' + conflict.kind + ': ' + conflict.detail));
  }
  const idMap = idMapResult.map;
  const status: PreviewStatus = unresolved.length > 0 ? 'needs_confirmation' : 'ready';

  return {
    sourceFingerprint,
    status,
    warnings,
    unresolved,
    confirmations,
    idMap,
    catalogCandidate,
    cursorCandidates,
    sideEffects: { eventInstances: [], factLedger: [], knowledgeReceipts: [], outbox: [] },
  };
}

// ══════════════════════════════════════════════════════════════════════
// 旧新闻 preview
// ══════════════════════════════════════════════════════════════════════
export interface LegacyNewsPreview {
  sourceFingerprint: string;
  status: PreviewStatus;
  warnings: string[];
  unresolved: string[];
  confirmations: string[];
  idMap: LegacyIdMap;
  articleCandidates: Array<{
    aggregate: NewsArticleAggregate;
    version: NewsArticleVersion;
    draftId: string;
    audit: { legacyId: string; legacyTimestamp: number | null; legacyCategory: string; legacyStatus: string };
  }>;
  sideEffects: { factLedger: []; knowledgeReceipts: []; outbox: []; committedFactRefs: []; scheduleRefs: []; noticeRefs: [] };
}

interface LegacyNewsEntry { id?: string; 标题?: string; 内容?: string; 状态?: string; 时间戳?: number; 类目?: string; 阵营标签?: unknown[]; 组织标签?: unknown[] }

const LEGACY_NEWS_LIFECYCLE: Record<string, 'archived' | 'published'> = {
  archived: 'archived',
  upcoming: 'published',
  ongoing: 'published',
  completed: 'published',
};

const LEGACY_NEWS_STORY_PHASE: Record<string, 'upcoming' | 'ongoing' | 'completed'> = {
  upcoming: 'upcoming',
  ongoing: 'ongoing',
  completed: 'completed',
  archived: 'completed',
};

/**
 * 旧新闻 -> NewsArticleAggregate + 不可变 NewsArticleVersion 候选。
 * 一律 manual + nonProgressing + migrationTrace.unknown + reliability.manual + sourceTrace=[]；
 * 旧时间戳/回合数不是 GameTime，不填 publishedAt；不生成 fact/schedule/notice ref、知识回执、observer cursor 或 outbox。
 */
export async function previewLegacyNews(input: unknown): Promise<LegacyNewsPreview> {
  assertPlainJsonValue(input, 'input');
  const sourceFingerprint = await sha256Fingerprint(input);
  const warnings: string[] = [];
  const unresolved: string[] = [];
  const confirmations: string[] = [];
  const articleCandidates: LegacyNewsPreview['articleCandidates'] = [];
  const generatedArticleIds = new Map<string, string>();
  const seenLegacyIds = new Map<string, string>();
  const idMapEntries: LegacyIdMapEntry[] = [];
  const entries = Array.isArray(input) ? input : (isLegacyRecord(input) ? (input as { 条目?: unknown[] }).条目 : undefined);
  if (!Array.isArray(entries)) {
    return {
      sourceFingerprint,
      status: 'invalid',
      warnings: ['输入不是合法的旧新闻列表（缺少数组或 条目 数组）'],
      unresolved: ['input 不是数组且无 条目 数组'],
      confirmations: [],
      idMap: (await buildLegacyIdMap([])).map,
      articleCandidates: [],
      sideEffects: { factLedger: [], knowledgeReceipts: [], outbox: [], committedFactRefs: [], scheduleRefs: [], noticeRefs: [] },
    };
  }
  for (const [index, rawEntry] of entries.entries()) {
    if (!isLegacyRecord(rawEntry)) {
      unresolved.push('条目[' + index + '] 不是对象，无法生成新闻候选，要求确认。');
      continue;
    }
    const entry = rawEntry as LegacyNewsEntry;
    const legacyStatus = String(entry.状态 ?? '');
    const legacyCategory = normalizeLegacyText(entry.类目 ?? '');
    if (legacyCategory !== '' && !['plan', 'chronicle', 'starlog', 'frontline'].includes(legacyCategory)) {
      // 未知类目不得静默改成默认类目 -> 诊断并要求确认。
      unresolved.push('旧新闻 #' + index + '（' + (entry.标题 ?? '?') + '）类目「' + legacyCategory + '」未知，不静默改默认类目，要求确认。');
      continue;
    }
    const lifecycle = LEGACY_NEWS_LIFECYCLE[legacyStatus];
    if (lifecycle === undefined) {
      // 未知状态不得静默改成 completed -> 诊断并要求确认。
      unresolved.push('旧新闻 #' + index + '（' + (entry.标题 ?? '?') + '）状态「' + legacyStatus + '」未知，不生成文章候选，要求确认。');
      continue;
    }
    if (legacyStatus === 'archived') warnings.push('旧新闻「' + (entry.标题 ?? '?') + '」为 archived，映射生命周期 archived（历史只读）。');
    const semanticScope = {
      title: entry.标题 ?? '',
      body: entry.内容 ?? '',
      category: legacyCategory || 'chronicle',
      status: legacyStatus,
    };
    const normalizedLegacyId = entry.id === undefined ? '' : normalizeLegacyText(entry.id);
    if (normalizedLegacyId.length > 0) {
      const previousLegacyPath = seenLegacyIds.get(normalizedLegacyId);
      if (previousLegacyPath !== undefined) {
        unresolved.push('duplicate_source_identity: 旧新闻 legacyId「' + normalizedLegacyId + '」重复（' + previousLegacyPath + ' / 条目[' + index + ']），不能生成两个 article target，要求确认。');
        continue;
      }
      seenLegacyIds.set(normalizedLegacyId, '条目[' + index + ']');
    }
    const articleId = await stableIdN('news:article', semanticScope, entry.id);
    const entryPath = '条目[' + index + ']';
    const entryFingerprint = await sha256Fingerprint(entry);
    idMapEntries.push({ legacyPath: entryPath, legacyId: normalizedLegacyId, targetKind: 'news_article', targetId: articleId, sourceFingerprint: entryFingerprint, diagnostics: [] });
    const previousPath = generatedArticleIds.get(articleId);
    if (previousPath !== undefined) {
      unresolved.push('duplicate_source_identity: 旧新闻语义身份重复（' + previousPath + ' / ' + entryPath + '），不能用数组位置拆成两篇文章，要求确认。');
      continue;
    }
    generatedArticleIds.set(articleId, entryPath);
    const draftId = await stableIdN('news:draft', semanticScope, entry.id);
    const articleVersionId = await stableIdN('news:version', { articleId, version: 1 }, '');
    const version: NewsArticleVersion = {
      runtimeBranchId: '',
      articleVersionId,
      articleId,
      articleVersion: 1,
      sourceRefs: [{ kind: 'manual', draftId, nonProgressing: true }] as NewsSourceRef[],
      sourceFingerprint: entryFingerprint,
      lifecycle,
      storyPhase: LEGACY_NEWS_STORY_PHASE[legacyStatus],
      category: normalizeLegacyText(entry.类目 ?? 'chronicle'),
      title: normalizeLegacyText(entry.标题 ?? ''),
      body: normalizeLegacyText(entry.内容 ?? ''),
      // 旧时间戳/回合数不是 GameTime：publishedAt 省略（不填）。
      publicScope: { kind: 'private' },
      reliability: 'manual',
      isCorrection: false,
      sourceTrace: [],
      migrationTrace: { status: 'unknown' as MigrationTraceStatus, rawFieldPaths: [entryPath], rawPayloadFingerprint: entryFingerprint },
    };
    const aggregate: NewsArticleAggregate = {
      runtimeBranchId: '',
      articleId,
      currentVersion: 1,
      versionIds: [articleVersionId],
      aggregateRevision: 1,
    };
    articleCandidates.push({
      aggregate,
      version,
      draftId,
      audit: {
        legacyId: entry.id ?? '',
        legacyTimestamp: typeof entry.时间戳 === 'number' ? entry.时间戳 : null,
        legacyCategory: normalizeLegacyText(entry.类目 ?? ''),
        legacyStatus,
      },
    });
    if (Array.isArray(entry.阵营标签) && entry.阵营标签.length > 0) {
      confirmations.push('旧新闻「' + (entry.标题 ?? '?') + '」携带旧阵营标签（只读审计元数据，不映射知识/受众）。');
    }
  }
  const idMapResult = await buildLegacyIdMap(idMapEntries);
  if (idMapResult.conflicts.length > 0) {
    unresolved.push(...idMapResult.conflicts.map((conflict) => 'legacyIdMap ' + conflict.kind + ': ' + conflict.detail));
  }
  const status: PreviewStatus = unresolved.length > 0 ? 'needs_confirmation' : 'ready';
  return {
    sourceFingerprint,
    status,
    warnings,
    unresolved,
    confirmations,
    idMap: idMapResult.map,
    articleCandidates,
    sideEffects: { factLedger: [], knowledgeReceipts: [], outbox: [], committedFactRefs: [], scheduleRefs: [], noticeRefs: [] },
  };
}

// ══════════════════════════════════════════════════════════════════════
// 旧世界事件字符串（只读 label）
// ══════════════════════════════════════════════════════════════════════
export interface LegacyWorldEventLabelsPreview {
  sourceFingerprint: string;
  status: PreviewStatus;
  labels: Array<{ label: string; originalPath: string; fingerprint: string }>;
  skipped: Array<{ reason: string; path: string }>;
}

/**
 * 旧 世界.全局事件(string[]) -> 只读 label + 原始路径 + fingerprint。
 * 不按标题匹配 canonical event，不生成 definition/instance/fact，不改变新闻或当前焦点。
 */
export async function readLegacyWorldEventLabels(input: unknown): Promise<LegacyWorldEventLabelsPreview> {
  assertPlainJsonValue(input, 'input');
  const sourceFingerprint = await sha256Fingerprint(input);
  const labels: LegacyWorldEventLabelsPreview['labels'] = [];
  const skipped: LegacyWorldEventLabelsPreview['skipped'] = [];
  const events = Array.isArray(input) ? input : (isLegacyRecord(input) ? (input as { 全局事件?: unknown[] }).全局事件 : undefined);
  if (!Array.isArray(events)) {
    return { sourceFingerprint, status: 'invalid', labels: [], skipped: [{ reason: '非数组或缺少 全局事件', path: 'input' }] };
  }
  const seen = new Set<string>();
  for (const [index, raw] of events.entries()) {
    const path = '全局事件[' + index + ']';
    if (typeof raw !== 'string') {
      skipped.push({ reason: '非字符串条目（只读跳过，不猜测语义）', path });
      continue;
    }
    const normalized = normalizeLegacyText(raw);
    if (normalized.length === 0) {
      skipped.push({ reason: '空白条目（归一化后为空）', path });
      continue;
    }
    if (seen.has(normalized)) {
      // 重复字符串：只保留第一条只读 label，重复项进 skipped（不合并为同一事实）。
      skipped.push({ reason: '重复字符串（只读保留第一条，不合并为同一事实）', path });
      continue;
    }
    seen.add(normalized);
    const fingerprint = await sha256Fingerprint(normalized);
    labels.push({ label: normalized, originalPath: path, fingerprint });
  }
  const status: PreviewStatus = skipped.length > 0 ? 'needs_confirmation' : 'ready';
  return { sourceFingerprint, status, labels, skipped };
}

export { canonicalJsonStringify, normalizeLegacyText, assertPlainJsonValue };
