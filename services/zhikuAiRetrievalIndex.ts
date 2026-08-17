import type { 智库分类, 智库系统, 智库条目 } from '@/models/zhiku';
import {
  ZHIKU_CATEGORY_LABELS,
  搜索智库条目,
  解析智库软结构标签,
  获取智库人物名列表,
} from '@/models/zhiku';
import { parseJsonWithRepair } from '@/services/ai/structuredOutputRepair';

export const ZHIKU_AI_OPERATIONS = ['ADD', 'FORM_OVERRIDE'] as const;
export const ZHIKU_AI_USAGES = ['CHARACTER_CORE', 'CHARACTER_FORM', 'SETTING_REQUIRED', 'BACKGROUND_OPTIONAL'] as const;
export const ZHIKU_AI_NECESSITIES = ['REQUIRED', 'OPTIONAL'] as const;
export const ZHIKU_AI_EVIDENCE = [
  'PRESENT',
  'MENTIONED',
  'EXPECTED',
  'NEXT_TURN_PARTICIPANT',
  'ACTIVE_FORM',
  'LOCATION',
  'EVENT',
  'RELATION',
  'STORY_STATE',
] as const;

export const ZHIKU_AI_CONTROLLED_CANDIDATE_LIMIT = 24;

export type ZhikuAiOperation = typeof ZHIKU_AI_OPERATIONS[number];
export type ZhikuAiUsage = typeof ZHIKU_AI_USAGES[number];
export type ZhikuAiNecessity = typeof ZHIKU_AI_NECESSITIES[number];
export type ZhikuAiEvidence = typeof ZHIKU_AI_EVIDENCE[number];

export type ZhikuAiCandidateReason =
  | 'KEYWORD_SELECTED'
  | 'PRESENT_CHARACTER'
  | 'EXPECTED_CHARACTER'
  | 'MENTIONED_CHARACTER'
  | 'SUBJECT_FORM'
  | 'CURRENT_LOCATION'
  | 'RELATED_ENTRY'
  | 'STORY_STATE'
  | 'TEXT_RELEVANCE';

export interface ZhikuAiTurnContext {
  keywordScanText: string;
  currentLocation?: string;
  presentCharacters: string[];
  expectedCharacters: string[];
  /** 近期上下文点名（回顾窗口内出现）但未在场的人物：MENTIONED_CHARACTER 候选通道。 */
  mentionedCharacters?: string[];
  immediateStoryReview?: string;
  recentStoryContext?: string;
  storyPlan?: string;
  openingArchiveText?: string;
}

export interface ZhikuAiCandidate {
  entryId: string;
  title: string;
  category: 智库分类;
  categoryLabel: string;
  subjectId?: string;
  formId?: string;
  exclusionGroupId?: string;
  applicability: {
    unlockState?: string;
    storyStage?: string;
    spoilerLevel?: string;
    usageScopes: string[];
  };
  summary: string;
  candidateReason: ZhikuAiCandidateReason[];
  unlocked: boolean;
  mainStoryInjectable: boolean;
}

export interface ZhikuAiRequest {
  turnContext: ZhikuAiTurnContext;
  keywordEntryIds: string[];
  candidates: ZhikuAiCandidate[];
}

export interface ZhikuAiCandidateIndex {
  request: ZhikuAiRequest;
  entriesById: Map<string, 智库条目>;
}

export interface ZhikuAiSelection {
  entryId: string;
  operation: ZhikuAiOperation;
  usage: ZhikuAiUsage;
  necessity: ZhikuAiNecessity;
  replaceEntryId: string | null;
  evidence: ZhikuAiEvidence[];
  reason: string;
}

export interface ZhikuAiOutput {
  selections: ZhikuAiSelection[];
  noSelectionReason: string;
}

export interface ZhikuAiCompilationRejection {
  entryId: string;
  code:
    | 'UNKNOWN_ENTRY'
    | 'BLOCKED_ENTRY'
    | 'INVALID_ENUM'
    | 'USAGE_CATEGORY_MISMATCH'
    | 'DUPLICATE_ENTRY'
    | 'FORM_CONFLICT_REQUIRES_OVERRIDE'
    | 'MISSING_REPLACEMENT'
    | 'REPLACEMENT_NOT_SELECTED'
    | 'SUBJECT_MISMATCH'
    | 'GROUP_MISMATCH'
    | 'LIMIT_EXCEEDED';
  detail: string;
}

export interface ZhikuAiCompiledSelection {
  entryId: string;
  title: string;
  source: 'KEYWORD' | 'AI';
  operation?: ZhikuAiOperation;
  usage?: ZhikuAiUsage;
  necessity?: ZhikuAiNecessity;
  evidence?: ZhikuAiEvidence[];
  reason?: string;
}

export interface ZhikuAiCompilationResult {
  keywordEvidence: string[];
  accepted: ZhikuAiSelection[];
  rejected: ZhikuAiCompilationRejection[];
  finalSelections: ZhikuAiCompiledSelection[];
}

interface BuildCandidateIndexInput {
  system: 智库系统;
  keywordScanText: string;
  keywordEntries: 智库条目[];
  context: Omit<ZhikuAiTurnContext, 'keywordScanText'>;
  getBlockReason: (entry: 智库条目) => string | null;
  maxCandidates?: number;
}

const operationSet = new Set<string>(ZHIKU_AI_OPERATIONS);
const usageSet = new Set<string>(ZHIKU_AI_USAGES);
const necessitySet = new Set<string>(ZHIKU_AI_NECESSITIES);
const evidenceSet = new Set<string>(ZHIKU_AI_EVIDENCE);

export function buildZhikuAiCandidateIndex(input: BuildCandidateIndexInput): ZhikuAiCandidateIndex {
  const keywordIds = new Set(input.keywordEntries.map((entry) => entry.id));
  const allEntries = input.system.条目 ?? [];
  const availableEntries = allEntries.filter((entry) => entry.分类 !== 'story' && !input.getBlockReason(entry));
  const availableIds = new Set(availableEntries.map((entry) => entry.id));
  const reasonsById = new Map<string, Set<ZhikuAiCandidateReason>>();

  const addEntry = (entry: 智库条目 | undefined, reason: ZhikuAiCandidateReason) => {
    if (!entry || !availableIds.has(entry.id)) return;
    const reasons = reasonsById.get(entry.id) ?? new Set<ZhikuAiCandidateReason>();
    reasons.add(reason);
    reasonsById.set(entry.id, reasons);
  };
  const addSearchResults = (text: string | undefined, reason: ZhikuAiCandidateReason, limit: number, includeCharacters = true) => {
    // 回顾/近期正文按回合窗口组织，字符截断会抹掉中段回合的角色名（首尾保留实测丢第5/9回合）——
    // 搜索用全量文本，回合数由窗口控制，不做字符省略。
    const query = String(text ?? '').replace(/\s+/g, ' ').trim();
    if (!query) return;
    const relevant = 搜索智库条目({ 条目: availableEntries }, query, availableEntries.length)
      .filter((entry) => includeCharacters || entry.分类 !== 'character')
      .filter((entry) => hasDirectCandidateRelevance(entry, query))
      .slice(0, limit);
    for (const entry of relevant) addEntry(entry, reason);
  };

  for (const entry of input.keywordEntries) addEntry(entry, 'KEYWORD_SELECTED');

  const participantSubjects = new Set<string>();
  const addCharacterParticipants = (names: string[], reason: ZhikuAiCandidateReason) => {
    for (const name of normalizeTextList(names, 16)) {
      for (const entry of availableEntries) {
        if (entry.分类 !== 'character') continue;
        if (!获取智库人物名列表(entry).some((candidateName) => namesLikelySame(candidateName, name))) continue;
        addEntry(entry, reason);
        const subjectId = getCandidateSubjectId(entry);
        if (subjectId) participantSubjects.add(subjectId);
      }
    }
  };
  addCharacterParticipants(input.context.presentCharacters, 'PRESENT_CHARACTER');
  addCharacterParticipants(input.context.expectedCharacters, 'EXPECTED_CHARACTER');
  addCharacterParticipants(input.context.mentionedCharacters ?? [], 'MENTIONED_CHARACTER');

  for (const entry of availableEntries) {
    const subjectId = getCandidateSubjectId(entry);
    if (entry.分类 === 'character' && subjectId && participantSubjects.has(subjectId)) addEntry(entry, 'SUBJECT_FORM');
  }

  // 上下文搜索（回顾/近期正文/地点/剧情规划）优先于关联条目——避免 24 条候选上限截断时
  // 「只出现在回顾里的角色」被 keyword/present/related 挤掉。
  addSearchResults(input.context.currentLocation, 'CURRENT_LOCATION', 3, false);
  addSearchResults(input.context.immediateStoryReview, 'STORY_STATE', 5);
  addSearchResults(input.context.recentStoryContext, 'STORY_STATE', 3);
  addSearchResults(input.context.storyPlan, 'STORY_STATE', 3);
  addSearchResults(input.context.openingArchiveText, 'STORY_STATE', 3);
  addSearchResults(input.keywordScanText, 'TEXT_RELEVANCE', 5);

  for (const keywordEntry of input.keywordEntries) {
    for (const relatedId of keywordEntry.关联条目ID ?? []) {
      addEntry(availableEntries.find((entry) => entry.id === relatedId), 'RELATED_ENTRY');
    }
    for (const entry of availableEntries) {
      if ((entry.关联条目ID ?? []).includes(keywordEntry.id)) {
        addEntry(entry, 'RELATED_ENTRY');
      }
    }
  }

  const requestedLimit = Math.max(1, Math.trunc(input.maxCandidates ?? ZHIKU_AI_CONTROLLED_CANDIDATE_LIMIT));
  const effectiveLimit = Math.max(requestedLimit, keywordIds.size);
  const selectedIds = Array.from(reasonsById.keys()).slice(0, effectiveLimit);
  const entriesById = new Map<string, 智库条目>();
  const candidates = selectedIds.flatMap((entryId) => {
    const entry = availableEntries.find((item) => item.id === entryId);
    if (!entry) return [];
    entriesById.set(entry.id, entry);
    return [toZhikuAiCandidate(entry, Array.from(reasonsById.get(entry.id) ?? []), input.getBlockReason)];
  });

  return {
    request: {
      turnContext: {
        // keywordScanText 是 AI 判断「关键词有没有命中」的唯一正文窗口——全量保留，
        // 字符截断会抹掉中段回合的角色名（实测首尾保留丢第 5/9 回合）。
        keywordScanText: String(input.keywordScanText ?? '').replace(/\s+/g, ' ').trim(),
        currentLocation: compactOptionalText(input.context.currentLocation, 140),
        presentCharacters: normalizeTextList(input.context.presentCharacters, 16),
        expectedCharacters: normalizeTextList(input.context.expectedCharacters, 16),
        immediateStoryReview: String(input.context.immediateStoryReview ?? '').replace(/\s+/g, ' ').trim() || undefined,
        recentStoryContext: String(input.context.recentStoryContext ?? '').replace(/\s+/g, ' ').trim() || undefined,
        storyPlan: compactOptionalBothEnds(input.context.storyPlan, 700),
        openingArchiveText: compactOptionalBothEnds(input.context.openingArchiveText, 700),
      },
      keywordEntryIds: input.keywordEntries.map((entry) => entry.id).filter((id) => entriesById.has(id)),
      candidates,
    },
    entriesById,
  };
}

export function parseZhikuAiOutput(rawText: string): ZhikuAiOutput {
  const parsed = parseJsonWithRepair<Partial<ZhikuAiOutput>>(rawText, 'object');
  return {
    selections: Array.isArray(parsed.selections) ? parsed.selections as ZhikuAiSelection[] : [],
    noSelectionReason: typeof parsed.noSelectionReason === 'string'
      ? compactText(parsed.noSelectionReason, 160)
      : '',
  };
}

export function compileZhikuAiSelection(
  request: ZhikuAiRequest,
  output: ZhikuAiOutput,
  maxAiSelections: number,
): ZhikuAiCompilationResult {
  const candidatesById = new Map(request.candidates.map((candidate) => [candidate.entryId, candidate]));
  const keywordEvidence = Array.from(new Set(request.keywordEntryIds));
  const finalById = new Map<string, ZhikuAiCompiledSelection>();
  const accepted: ZhikuAiSelection[] = [];
  const rejected: ZhikuAiCompilationRejection[] = [];

  for (const entryId of keywordEvidence) {
    const candidate = candidatesById.get(entryId);
    if (!candidate) continue;
    finalById.set(entryId, { entryId, title: candidate.title, source: 'KEYWORD' });
  }

  for (const rawSelection of output.selections) {
    const entryId = typeof rawSelection?.entryId === 'string' ? rawSelection.entryId.trim() : '';
    if (!isValidSelectionContract(rawSelection)) {
      rejected.push({ entryId: entryId || 'INVALID', code: 'INVALID_ENUM', detail: '字段缺失，或操作、用途、必要性、证据枚举不合法。' });
      continue;
    }
    const selection = normalizeSelection(rawSelection);
    const candidate = candidatesById.get(selection.entryId);
    if (!candidate) {
      rejected.push({ entryId: selection.entryId, code: 'UNKNOWN_ENTRY', detail: '返回 ID 不在本回合受控候选中。' });
      continue;
    }
    if (!candidate.unlocked || !candidate.mainStoryInjectable) {
      rejected.push({ entryId: selection.entryId, code: 'BLOCKED_ENTRY', detail: '候选未解锁或禁止主剧情注入。' });
      continue;
    }
    if (!usageMatchesCategory(selection.usage, candidate.category)) {
      rejected.push({ entryId: selection.entryId, code: 'USAGE_CATEGORY_MISMATCH', detail: '角色用途只能用于人物资料，设定用途只能用于非人物资料。' });
      continue;
    }
    if (accepted.length >= maxAiSelections) {
      rejected.push({ entryId: selection.entryId, code: 'LIMIT_EXCEEDED', detail: `AI 补充超过 ${maxAiSelections} 条上限。` });
      continue;
    }

    if (selection.operation === 'ADD') {
      if (finalById.has(selection.entryId)) {
        rejected.push({ entryId: selection.entryId, code: 'DUPLICATE_ENTRY', detail: '该资料已经由关键词或 AI 选中。' });
        continue;
      }
      const groupConflict = findSelectedGroupConflict(candidate, finalById, candidatesById);
      if (groupConflict) {
        rejected.push({
          entryId: selection.entryId,
          code: 'FORM_CONFLICT_REQUIRES_OVERRIDE',
          detail: `已选中同组形态 ${groupConflict.entryId}，必须使用 FORM_OVERRIDE。`,
        });
        continue;
      }
      accepted.push(selection);
      finalById.set(selection.entryId, toCompiledSelection(candidate, selection));
      continue;
    }

    const replaceEntryId = selection.replaceEntryId?.trim();
    if (!replaceEntryId) {
      rejected.push({ entryId: selection.entryId, code: 'MISSING_REPLACEMENT', detail: 'FORM_OVERRIDE 必须声明 replaceEntryId。' });
      continue;
    }
    const replacedCandidate = candidatesById.get(replaceEntryId);
    if (!replacedCandidate || !finalById.has(replaceEntryId)) {
      rejected.push({ entryId: selection.entryId, code: 'REPLACEMENT_NOT_SELECTED', detail: '被替换资料不是本回合已选结果。' });
      continue;
    }
    if (!candidate.subjectId || candidate.subjectId !== replacedCandidate.subjectId) {
      rejected.push({ entryId: selection.entryId, code: 'SUBJECT_MISMATCH', detail: '形态修正不能跨资料主体。' });
      continue;
    }
    if (!candidate.exclusionGroupId || candidate.exclusionGroupId !== replacedCandidate.exclusionGroupId) {
      rejected.push({ entryId: selection.entryId, code: 'GROUP_MISMATCH', detail: '形态修正要求新旧资料属于同一互斥组。' });
      continue;
    }

    finalById.delete(replaceEntryId);
    accepted.push(selection);
    finalById.set(selection.entryId, toCompiledSelection(candidate, selection));
  }

  return {
    keywordEvidence,
    accepted,
    rejected,
    finalSelections: Array.from(finalById.values()),
  };
}

function toZhikuAiCandidate(
  entry: 智库条目,
  candidateReason: ZhikuAiCandidateReason[],
  getBlockReason: (entry: 智库条目) => string | null,
): ZhikuAiCandidate {
  const meta = 解析智库软结构标签(entry);
  const unlockState = meta.解锁状态?.trim();
  const blockReason = getBlockReason(entry);
  return {
    entryId: entry.id,
    title: entry.标题,
    category: entry.分类,
    categoryLabel: ZHIKU_CATEGORY_LABELS[entry.分类],
    subjectId: getCandidateSubjectId(entry),
    formId: entry.关联形态ID?.trim() || meta.形态?.trim() || undefined,
    exclusionGroupId: entry.互斥组ID?.trim() || undefined,
    applicability: {
      unlockState,
      storyStage: meta.阶段?.trim() || undefined,
      spoilerLevel: meta.剧透等级?.trim() || undefined,
      usageScopes: meta.使用范围.map((item) => item.trim()).filter(Boolean).slice(0, 6),
    },
    summary: buildCandidateSummary(entry),
    candidateReason,
    unlocked: !/未解锁|锁定|只读/i.test(unlockState ?? ''),
    mainStoryInjectable: !blockReason,
  };
}

function buildCandidateSummary(entry: 智库条目): string {
  const summary = compactText(entry.摘要, 280);
  if (summary) return summary;

  const meta = 解析智库软结构标签(entry);
  const anchors = entry.分类 === 'character'
    ? [
        meta.性格锚点 ? `人物气质：${meta.性格锚点}` : '',
        meta.说话方式 ? `说话感觉：${meta.说话方式}` : '',
        meta.禁止误写 ? `需要避开的误写：${meta.禁止误写}` : '',
      ]
    : [
        meta.资料类型 ? `这份资料讲的是：${meta.资料类型}` : '',
        meta.阶段 ? `适合在：${meta.阶段}` : '',
        entry.来源 ? `资料来处：${entry.来源}` : '',
      ];
  const compiled = compactText(anchors.filter(Boolean).join('；'), 320);
  if (compiled) {
    return entry.分类 === 'character'
      ? `人物资料「${entry.标题}」：${compiled}`
      : `${ZHIKU_CATEGORY_LABELS[entry.分类]}资料「${entry.标题}」：${compiled}`;
  }
  return `资料卡「${entry.标题}」暂时没有轻量摘要；不要只凭标题把它交给阿基维利·喵。`;
}

function getCandidateSubjectId(entry: 智库条目): string | undefined {
  if (entry.分类 !== 'character') return entry.系列ID?.trim() || undefined;
  const meta = 解析智库软结构标签(entry);
  return entry.关联角色ID?.trim()
    || meta.角色名?.trim()
    || 获取智库人物名列表(entry)[0]?.trim()
    || undefined;
}

function isValidSelectionContract(selection: unknown): selection is ZhikuAiSelection {
  if (!selection || typeof selection !== 'object') return false;
  const value = selection as Partial<ZhikuAiSelection>;
  if (typeof value.entryId !== 'string' || !value.entryId.trim()) return false;
  if (!operationSet.has(String(value.operation))) return false;
  if (!usageSet.has(String(value.usage))) return false;
  if (!necessitySet.has(String(value.necessity))) return false;
  if (!Array.isArray(value.evidence) || value.evidence.length === 0 || !value.evidence.every((item) => evidenceSet.has(String(item)))) return false;
  if (typeof value.reason !== 'string' || !value.reason.trim()) return false;
  if (value.operation === 'ADD' && value.replaceEntryId !== null) return false;
  return value.operation !== 'FORM_OVERRIDE' || (typeof value.replaceEntryId === 'string' && Boolean(value.replaceEntryId.trim()));
}

function normalizeSelection(selection: ZhikuAiSelection): ZhikuAiSelection {
  return {
    entryId: selection.entryId.trim(),
    operation: selection.operation,
    usage: selection.usage,
    necessity: selection.necessity,
    replaceEntryId: selection.replaceEntryId?.trim() || null,
    evidence: Array.from(new Set(selection.evidence)),
    reason: compactText(selection.reason, 120),
  };
}

function usageMatchesCategory(usage: ZhikuAiUsage, category: 智库分类): boolean {
  const characterUsage = usage === 'CHARACTER_CORE' || usage === 'CHARACTER_FORM';
  return characterUsage ? category === 'character' : category !== 'character' && category !== 'story';
}

function findSelectedGroupConflict(
  candidate: ZhikuAiCandidate,
  finalById: Map<string, ZhikuAiCompiledSelection>,
  candidatesById: Map<string, ZhikuAiCandidate>,
): ZhikuAiCandidate | undefined {
  if (!candidate.exclusionGroupId) return undefined;
  for (const entryId of finalById.keys()) {
    const selected = candidatesById.get(entryId);
    if (selected?.exclusionGroupId === candidate.exclusionGroupId) return selected;
  }
  return undefined;
}

function toCompiledSelection(candidate: ZhikuAiCandidate, selection: ZhikuAiSelection): ZhikuAiCompiledSelection {
  return {
    entryId: candidate.entryId,
    title: candidate.title,
    source: 'AI',
    operation: selection.operation,
    usage: selection.usage,
    necessity: selection.necessity,
    evidence: selection.evidence,
    reason: selection.reason,
  };
}

function namesLikelySame(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function hasDirectCandidateRelevance(entry: 智库条目, query: string): boolean {
  const characterNames = entry.分类 === 'character' ? 获取智库人物名列表(entry) : [];
  const relevanceQuery = characterNames.some((name) => name.trim() === '黑塔')
    ? query.replace(/空间站[「“"]?黑塔[」”"]?|黑塔空间站/gu, '')
    : query;
  const haystack = relevanceQuery.toLowerCase().replace(/\s+/g, '');
  if (!haystack) return false;
  const meta = 解析智库软结构标签(entry);
  const identifiers = [
    entry.标题,
    entry.关联角色ID,
    entry.关联形态ID,
    meta.角色名,
    meta.形态,
    meta.命途,
    ...entry.关键词.map((keyword) => keyword.includes(':') || keyword.includes('：')
      ? keyword.split(/[:：]/).slice(1).join(':')
      : keyword),
  ]
    .map((value) => String(value ?? '').toLowerCase().replace(/\s+/g, ''))
    .filter((value) => value.length >= 2);
  if (identifiers.some((identifier) => haystack.includes(identifier))) return true;

  const searchable = [entry.标题, entry.摘要, entry.来源, entry.资料类型, entry.性格锚点, entry.说话方式, entry.禁止误写]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const terms = relevanceQuery
    .toLowerCase()
    .split(/[\s,，。；;、:：!?！？（）()【】]+/u)
    .map((term) => term.trim())
    .filter((term) => Array.from(term).length >= 2);
  return terms.some((term) => searchable.includes(term));
}

function normalizeTextList(values: string[] | undefined, limit: number): string[] {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

function compactOptionalText(value: string | undefined, limit: number): string | undefined {
  return compactText(value ?? '', limit) || undefined;
}

/** 首尾保留压缩：最新内容在文本末尾，不能只留开头。 */
function compactBothEndsText(value: string, limit: number): string {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  if (cleaned.length <= limit) return cleaned;
  const head = Math.floor(limit * 0.4);
  const tail = limit - head - 6;
  return `${cleaned.slice(0, head)}…[中段省略]…${cleaned.slice(-tail)}`;
}

function compactOptionalBothEnds(value: string | undefined, limit: number): string | undefined {
  return compactBothEndsText(value ?? '', limit) || undefined;
}

function compactText(value: string, limit: number): string {
  const cleaned = String(value || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > limit ? `${cleaned.slice(0, Math.max(0, limit - 3))}...` : cleaned;
}
