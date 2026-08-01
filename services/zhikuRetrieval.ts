import type { 智库系统, 智库条目 } from '@/models/zhiku';
import type { API配置项, 智库系统设置 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import {
  ZHIKU_CATEGORY_LABELS,
  匹配智库关键词,
  获取智库注入内容缺失字段,
  智库条目注入内容完整,
  选择智库关键词互斥结果,
} from '@/models/zhiku';
import type { 智库软结构标签 } from '@/models/zhiku';
import { 解析智库软结构标签, 获取智库人物名列表, 比较智库人物节点 } from '@/models/zhiku';
import { ZHIKU_CATEGORY_POLICIES } from '@/models/zhikuGovernance';
import { ZHIKU_COT_PROMPT, ZHIKU_OUTPUT_FORMAT_PROMPT, CHARACTER_KEYWORD_RECALL_LIMIT, AI_SUPPLEMENT_ENTRY_LIMIT, NORMAL_KEYWORD_RECALL_LIMIT } from '@/prompts/cot/zhikuCot';
import type { 提示词模块 } from '@/models/prompts';
import { buildIndependentPromptModulesSection } from '@/services/promptModuleScopes';
import { estimateTextTokens } from '@/utils/tokenEstimate';
import {
  buildZhikuAiCandidateIndex,
  compileZhikuAiSelection,
  parseZhikuAiOutput,
  type ZhikuAiCandidateIndex,
  type ZhikuAiCompilationResult,
  type ZhikuAiRequest,
} from '@/services/zhikuAiRetrievalIndex';


export interface 智库检索结果 {
  entries: 智库条目[];
  characterEntries?: 智库条目[];
  strongEntries?: 智库条目[];
  weakEntries?: 智库条目[];
  injection: string;
  usedModel?: boolean;
  rawText?: string;
  diagnostics?: 智库召回诊断;
}

export interface 智库召回诊断 {
  场景锚点: string[];
  相关角色: string[];
  人物锚点: string[];
  在场角色兜底召回: string[];
  关键词召回: string[];
  AI检索补充: string[];
  关键词资料召回: string[];
  AI检索补充强资料: string[];
  AI检索补充弱资料: string[];
  关键词召回资料: string[];
  候选资料: string[];
  AI候选资料: string[];
  AI候选索引: string[];
  AI补充资料: string[];
  AI形态修正: string[];
  AI拒绝选择: string[];
  AI未选择原因: string;
  角色相关资料: string[];
  强相关资料: string[];
  弱相关资料: string[];
  已注入资料: string[];
  角色故事层注入: string[];
  静态注入字符数: number;
  静态注入估算Token: number;
  单条静态注入体量: Array<{
    id: string;
    标题: string;
    分类: string;
    字符数: number;
    估算Token: number;
    保留优先级: '必须人物' | '强相关背景' | '弱相关背景';
  }>;
  动态状态来源: string[];
  去重记录: string[];
  删减记录: Array<{ 标题: string; 原因: string; 原优先级: string }>;
  体量预警: string[];
  被门禁过滤: Array<{ 标题: string; 原因: string }>;
  检查项: string[];
}

interface 智库召回分组 {
  characterEntries: 智库条目[];
  strongEntries: 智库条目[];
  weakEntries: 智库条目[];
}

export interface 智库场景上下文 {
  startScenarioId?: string;
  startSceneName?: string;
  currentLocation?: string;
  openingRegionName?: string;
  openingChapterName?: string;
  openingEntryText?: string;
  openingArchiveText?: string;
  npcNames?: string[];
  presentNpcNamesForFallback?: string[];
  anticipatedNpcNames?: string[];
  aiSupplementHints?: {
    currentLocation?: string;
    presentNpcNames?: string[];
    immediateStoryReview?: string;
    recentStoryContext?: string;
    storyPlan?: string;
    openingArchiveText?: string;
  };
  originalProtagonist?: '星' | '穹' | '星穹双主角';
}

const CHARACTER_ANCHOR_ENTRIES_PER_ROLE = 2;
const ZHIKU_ENTRY_VOLUME_WARNING_TOKENS = 2000;
const ZHIKU_TOTAL_VOLUME_WARNING_TOKENS = 16000;

const ZHIKU_SCENE_HINTS: Record<string, string[]> = {
  heita_station_incident: ['黑塔空间站', '黑塔', '空间站', '主控舱段', '基座舱段', '收容舱段', '支援舱段', '防卫科'],
  belobog_arrival: ['雅利洛', '贝洛伯格', '雪原', '行政区', '银鬃铁卫', '杰帕德', '布洛妮娅', '裂界'],
  belobog_underworld: ['雅利洛', '贝洛伯格', '下层区', '磐岩镇', '大矿区', '地火', '娜塔莎', '希儿', '史瓦罗'],
  belobog_cocolia_crisis: ['雅利洛', '贝洛伯格', '可可利亚', '大守护者', '永冬岭', '残响回廊', '星核', '布洛妮娅'],
  astral_express_temp_passenger: ['星穹列车', '列车', '无名客'],
  luofu_arrival: ['仙舟', '罗浮', '星槎海', '流云渡', '云骑军', '停云', '驭空', '卡芙卡'],
  luofu_kafka_interrogation: ['仙舟', '罗浮', '太卜司', '穷观阵', '符玄', '卡芙卡', '青雀', '建木'],
  luofu_phantylia_crisis: ['仙舟', '罗浮', '建木', '鳞渊境', '丹鼎司', '丰饶孽物', '幻胧', '景元'],
  xianzhou_luofu_entry: ['仙舟', '罗浮', '长乐天', '金人巷', '工造司', '神策府', '鳞渊境', '流云渡'],
  jarilo_frontier: ['雅利洛', '贝洛伯格', '下层区', '上层区', '磐岩镇', '行政区', '残响回廊', '铆钉镇', '永冬岭', '机械聚落', '地火', '史瓦罗'],
  penacony_entry: ['匹诺康尼', '白日梦酒店', '黄金的时刻', '梦境边界', '筑梦边缘', '家族', '猎犬家系', '谐乐大典'],
  penacony_invitation: ['匹诺康尼', '白日梦酒店', '盛会之星', '家族', '宾客', '入梦池', '星期日', '知更鸟'],
  penacony_dream_edge: ['匹诺康尼', '黄金的时刻', '梦境边界', '筑梦边缘', '钟表小子', '猎犬家系', '流萤', '砂金'],
  penacony_reverie_crisis: ['匹诺康尼', '美梦崩塌', '谐乐大典', '匹诺康尼大剧院', '家族真相', '星期日', '知更鸟', '黄泉'],
};

function isMainStoryInjectableZhikuEntry(entry: 智库条目): boolean {
  return !getMainStoryBlockReason(entry);
}

function getMainStoryBlockReason(entry: 智库条目): string | null {
  if (!entry.可用于联动) return '该资料标记为不可联动。';
  if (entry.分类 === 'story') return '原著剧情正文由剧情编织管理，不走智库普通召回。';
  if (entry.可否主剧情注入 === false) return '该资料标记为不可主剧情注入。';
  if (!智库条目注入内容完整(entry)) {
    return `结构化注入内容不完整（缺少：${获取智库注入内容缺失字段(entry).join('、')}）。`;
  }

  const meta = 解析智库软结构标签(entry);
  return getMainStoryZhikuMetaBlockReason(meta);
}

function isMainStoryAllowedZhikuMeta(meta: 智库软结构标签): boolean {
  return !getMainStoryZhikuMetaBlockReason(meta);
}

function getMainStoryZhikuMetaBlockReason(meta: 智库软结构标签): string | null {
  const ranges = meta.使用范围.map((item) => item.trim()).filter(Boolean);
  if (ranges.length > 0 && !ranges.some((item) => /主剧情|通用|全部|all/i.test(item))) {
    return `使用范围为「${ranges.join(' / ')}」，不含主剧情。`;
  }

  const unlock = meta.解锁状态 ?? '';
  if (/未解锁|锁定|只读/i.test(unlock)) return `解锁状态为「${unlock}」，暂不注入主剧情。`;

  const spoiler = meta.剧透等级 ?? '';
  if (/重大/i.test(spoiler) && !/默认可用|已解锁|当前可用|可预热/i.test(unlock)) {
    return `剧透等级为「${spoiler}」，且当前未解锁。`;
  }

  return null;
}

function buildZhikuSceneHints(sceneContext?: 智库场景上下文): string[] {
  if (!sceneContext) return [];
  const hints = new Set<string>();
  const raw = [
    sceneContext.startSceneName,
    sceneContext.currentLocation,
    sceneContext.openingRegionName,
    sceneContext.openingChapterName,
    sceneContext.openingEntryText,
    sceneContext.openingArchiveText,
  ]
    .filter((value): value is string => !!value && !!value.trim())
    .map((value) => value.trim())
    .join(' ');

  const addHints = (items: string[]) => {
    for (const item of items) {
      const trimmed = item.trim();
      if (trimmed) hints.add(trimmed);
    }
  };

  if (sceneContext.startScenarioId && ZHIKU_SCENE_HINTS[sceneContext.startScenarioId]) {
    addHints(ZHIKU_SCENE_HINTS[sceneContext.startScenarioId]);
  }
  if (/黑塔|空间站/.test(raw)) addHints(ZHIKU_SCENE_HINTS.heita_station_incident);
  if (/贝洛伯格|雅利洛/.test(raw)) addHints(ZHIKU_SCENE_HINTS.jarilo_frontier);
  if (/仙舟|罗浮/.test(raw)) addHints(ZHIKU_SCENE_HINTS.xianzhou_luofu_entry);
  if (/匹诺康尼|白日梦酒店|黄金的时刻|梦境|家族|谐乐大典/.test(raw)) addHints(ZHIKU_SCENE_HINTS.penacony_entry);
  if (/列车|星穹/.test(raw)) addHints(ZHIKU_SCENE_HINTS.astral_express_temp_passenger);

  return Array.from(hints).slice(0, 16);
}

function getNormalRelatedLimit(limit: number): number {
  return Math.min(Math.max(1, Math.trunc(Number(limit) || NORMAL_KEYWORD_RECALL_LIMIT)), NORMAL_KEYWORD_RECALL_LIMIT);
}

function sceneMatchesEntry(entry: 智库条目, sceneHints: string[]): boolean {
  if (!sceneHints.length) return false;
  const text = [entry.标题, entry.摘要, entry.来源 ?? '', entry.原文, ...entry.关键词, getZhikuCharacterCalibrationText(entry)]
    .join(' ')
    .toLowerCase();
  return sceneHints.some((hint) => text.includes(hint.toLowerCase()));
}

function rankZhikuEntries(entries: 智库条目[], sceneHints: string[]): 智库条目[] {
  if (!sceneHints.length || entries.length <= 1) return [...entries];
  const sourceOrder = new Map(entries.map((entry, index) => [entry.id, index]));
  return [...entries].sort((a, b) => {
    const sceneDiff = Number(sceneMatchesEntry(b, sceneHints)) - Number(sceneMatchesEntry(a, sceneHints));
    if (sceneDiff !== 0) return sceneDiff;
    return (sourceOrder.get(a.id) ?? 0) - (sourceOrder.get(b.id) ?? 0);
  });
}

function namesLikelySame(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  return !!left && !!right && (left === right || left.includes(right) || right.includes(left));
}

function buildPresentCharacterFallbackEntries(system: 智库系统, npcNames: string[] | undefined, sceneContext?: 智库场景上下文): 智库条目[] {
  const presentNames = normalizeNpcNameList(npcNames, 12);
  if (!presentNames.length) return [];

  const entriesByName = new Map<string, 智库条目[]>();
  for (const entry of system.条目 ?? []) {
    if (entry.分类 !== 'character' || !isMainStoryInjectableZhikuEntry(entry)) continue;
    const characterNames = 获取智库人物名列表(entry);
    if (!isAllowedOriginalProtagonistEntry(characterNames, sceneContext?.originalProtagonist)) continue;
    const matchedName = presentNames.find((name) => characterNames.some((characterName) => namesLikelySame(characterName, name)));
    if (!matchedName) continue;
    const current = entriesByName.get(matchedName) ?? [];
    current.push(entry);
    entriesByName.set(matchedName, current);
  }

  const anchors: 智库条目[] = [];
  for (const name of presentNames) {
    const seenExclusionGroups = new Set<string>();
    const pickedForRole = (entriesByName.get(name) ?? [])
      .sort(比较智库人物节点)
      .filter(isCharacterAnchorNode)
      .filter((entry) => {
        const groupId = entry.互斥组ID?.trim();
        if (!groupId) return true;
        if (seenExclusionGroups.has(groupId)) return false;
        seenExclusionGroups.add(groupId);
        return true;
      })
      .slice(0, CHARACTER_ANCHOR_ENTRIES_PER_ROLE);
    for (const entry of pickedForRole) {
      if (!anchors.some((item) => item.id === entry.id)) anchors.push(entry);
      if (anchors.length >= CHARACTER_KEYWORD_RECALL_LIMIT) return anchors;
    }
  }
  return anchors;
}

function normalizeNpcNameList(names: string[] | undefined, limit: number): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of names ?? []) {
    const name = raw.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    normalized.push(name);
    if (normalized.length >= limit) break;
  }
  return normalized;
}

function getCharacterAnchorLimit(_limit?: number): number {
  return CHARACTER_KEYWORD_RECALL_LIMIT;
}

function isAllowedOriginalProtagonistName(name: string, originalProtagonist?: 智库场景上下文['originalProtagonist']): boolean {
  if (originalProtagonist === '星') return !namesLikelySame(name, '穹');
  if (originalProtagonist === '穹') return !namesLikelySame(name, '星');
  return true;
}

function isAllowedOriginalProtagonistEntry(names: string[], originalProtagonist?: 智库场景上下文['originalProtagonist']): boolean {
  return names.every((name) => isAllowedOriginalProtagonistName(name, originalProtagonist));
}

function isCharacterAnchorNode(entry: 智库条目): boolean {
  const meta = 解析智库软结构标签(entry);
  const type = [meta.资料类型, meta.节点].filter(Boolean).join(' ');
  return /主体|OOC|风险|基础|能力|职责|分工|单角色档案|角色档案|人物档案/i.test(type) || !type;
}

function mergeZhikuEntries(...groups: 智库条目[][]): 智库条目[] {
  const merged: 智库条目[] = [];
  for (const group of groups) {
    for (const entry of group) {
      if (!merged.some((item) => item.id === entry.id) && isMainStoryInjectableZhikuEntry(entry)) {
        merged.push(entry);
      }
    }
  }
  return merged;
}

function mergeZhikuGroups(groups: 智库召回分组): 智库条目[] {
  return mergeZhikuEntries(groups.characterEntries, groups.strongEntries, groups.weakEntries);
}

function isNormalRecallEntry(entry: 智库条目): boolean {
  return entry.分类 !== 'character' && entry.分类 !== 'story';
}

function buildCompiledZhikuGroups(
  keywordGroups: 智库召回分组,
  candidateIndex: ZhikuAiCandidateIndex,
  compilation: ZhikuAiCompilationResult,
): 智库召回分组 {
  const keywordStrongIds = new Set(keywordGroups.strongEntries.map((entry) => entry.id));
  const keywordWeakIds = new Set(keywordGroups.weakEntries.map((entry) => entry.id));
  const characterEntries: 智库条目[] = [];
  const strongEntries: 智库条目[] = [];
  const weakEntries: 智库条目[] = [];

  for (const selection of compilation.finalSelections) {
    const entry = candidateIndex.entriesById.get(selection.entryId);
    if (!entry) continue;
    if (entry.分类 === 'character') {
      characterEntries.push(entry);
      continue;
    }
    const isWeak = selection.source === 'AI'
      ? selection.usage === 'BACKGROUND_OPTIONAL'
      : keywordWeakIds.has(entry.id) && !keywordStrongIds.has(entry.id);
    (isWeak ? weakEntries : strongEntries).push(entry);
  }

  return {
    characterEntries: mergeZhikuEntries(characterEntries),
    strongEntries: mergeZhikuEntries(strongEntries),
    weakEntries: mergeZhikuEntries(weakEntries).filter((entry) => !strongEntries.some((strong) => strong.id === entry.id)),
  };
}

export function buildZhikuRecallCandidateSystem(system: 智库系统 | undefined): 智库系统 {
  return {
    条目: (system?.条目 ?? []).filter((entry) => {
      if (entry.治理分类) return ZHIKU_CATEGORY_POLICIES[entry.治理分类].participatesInRecall;
      return entry.分类 !== 'story' || ZHIKU_CATEGORY_POLICIES.story.participatesInRecall;
    }),
  };
}

export function retrieveZhikuContext(system: 智库系统 | undefined, query: string, limit: number, sceneContext?: 智库场景上下文): 智库检索结果 {
  const candidateSystem = buildZhikuRecallCandidateSystem(system);
  if (!candidateSystem.条目.length || !query.trim()) {
    return { entries: [], injection: '', diagnostics: buildEmptyZhikuDiagnostics() };
  }
  const normalLimit = getNormalRelatedLimit(limit);
  const sceneHints = buildZhikuSceneHints(sceneContext);
  const allKeywordMatches = candidateSystem.条目
    .map((entry) => 匹配智库关键词(entry, query))
    .filter((match): match is NonNullable<typeof match> => Boolean(match));
  const blockedKeywordMatches = allKeywordMatches
    .filter((match) => !isMainStoryInjectableZhikuEntry(match.entry));
  const keywordMatches = 选择智库关键词互斥结果(
    allKeywordMatches.filter((match) => isMainStoryInjectableZhikuEntry(match.entry)),
  );
  const keywordMatchedEntries = keywordMatches.map((match) => match.entry);
  const characterAnchors = keywordMatchedEntries
    .filter((entry) => entry.分类 === 'character')
    .filter((entry) => isAllowedOriginalProtagonistEntry(获取智库人物名列表(entry), sceneContext?.originalProtagonist))
    .slice(0, getCharacterAnchorLimit(limit));
  const relevantNames = Array.from(new Set(characterAnchors.flatMap((entry) => 获取智库人物名列表(entry))));
  const presentFallbackAnchors = buildPresentCharacterFallbackEntries(candidateSystem, sceneContext?.presentNpcNamesForFallback, sceneContext);
  const rankedEntries = keywordMatchedEntries;
  const normalRankedEntries = rankedEntries.filter(isNormalRecallEntry);
  const primaryEntries = rankZhikuEntries(normalRankedEntries, sceneHints).slice(0, normalLimit);
  const groups: 智库召回分组 = {
    characterEntries: mergeZhikuEntries(characterAnchors, presentFallbackAnchors),
    strongEntries: primaryEntries,
    weakEntries: [],
  };
  const selectedEntries = mergeZhikuGroups(groups);
  const selectedKeywordEntries = mergeZhikuEntries(characterAnchors, primaryEntries);
  const diagnostics = buildZhikuDiagnostics({
    sceneHints,
    relevantNames,
    characterAnchors,
    presentFallbackAnchors,
    candidates: rankedEntries,
    keywordEntries: selectedKeywordEntries,
    blockedKeywordEntries: blockedKeywordMatches.map((match) => match.entry),
    modelCandidates: [],
    aiSupplementEntries: [],
    groups,
    limit: normalLimit,
  });
  if (!selectedEntries.length) {
    return { entries: [], injection: '', diagnostics };
  }
  return {
    entries: selectedEntries,
    characterEntries: groups.characterEntries,
    strongEntries: groups.strongEntries,
    weakEntries: groups.weakEntries,
    injection: buildZhikuInjection(groups, sceneHints),
    diagnostics,
  };
}

export async function retrieveZhikuContextWithModel(
  system: 智库系统 | undefined,
  query: string,
  limit: number,
  settings: 智库系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
  retryCount = 2,
  sceneContext?: 智库场景上下文,
  promptModules?: 提示词模块[],
): Promise<智库检索结果> {
  const candidateSystem = buildZhikuRecallCandidateSystem(system);
  if (!candidateSystem.条目.length || !query.trim()) {
    return { entries: [], injection: '', usedModel: false };
  }

  const keywordRecall = retrieveZhikuContext(candidateSystem, query, limit, sceneContext);
  if (settings.enableAiSupplement !== true) {
    return keywordRecall;
  }
  const api = resolveZhikuRecallConfig(mainConfig, settings);
  if (!api.baseUrl || !api.apiKey || !api.model) {
    return keywordRecall;
  }

  const keywordGroups: 智库召回分组 = {
    characterEntries: keywordRecall.characterEntries ?? [],
    strongEntries: keywordRecall.strongEntries ?? [],
    weakEntries: keywordRecall.weakEntries ?? [],
  };
  const keywordEntries = mergeZhikuGroups(keywordGroups);
  const sceneHints = buildZhikuSceneHints(sceneContext);
  const injectableCandidateSystem: 智库系统 = {
    条目: candidateSystem.条目.filter(isMainStoryInjectableZhikuEntry),
  };
  const candidateIndex = buildZhikuAiRequestForTurn(injectableCandidateSystem, query, keywordEntries, sceneContext);
  const systemPrompt = buildZhikuModelSystemPrompt(sceneHints, promptModules);
  const userPrompt = buildZhikuModelUserPrompt(candidateIndex.request);

  try {
    const rawText = await withRetries(
      () =>
        chatCompletionNonStream(api, {
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt,
          signal,
          maxTokens: Math.min(1600, Math.max(640, api.maxTokens ?? 960)),
          temperature: api.temperature ?? 0.1,
        }),
      { retries: retryCount, signal, label: '智库召回' },
    );
    const aiOutput = parseZhikuAiOutput(rawText);
    const compilation = compileZhikuAiSelection(candidateIndex.request, aiOutput, AI_SUPPLEMENT_ENTRY_LIMIT);
    const finalGroups = buildCompiledZhikuGroups(keywordGroups, candidateIndex, compilation);
    const finalPicked = mergeZhikuGroups(finalGroups);
    const acceptedIds = new Set(compilation.accepted.map((selection) => selection.entryId));
    const appliedSupplementEntries = finalPicked.filter((entry) => acceptedIds.has(entry.id));
    const aiCharacterSupplement = appliedSupplementEntries.filter((entry) => entry.分类 === 'character');
    const aiStrongSupplement = finalGroups.strongEntries.filter((entry) => acceptedIds.has(entry.id));
    const aiWeakSupplement = finalGroups.weakEntries.filter((entry) => acceptedIds.has(entry.id));
    const formOverrides = compilation.accepted
      .filter((selection) => selection.operation === 'FORM_OVERRIDE')
      .map((selection) => {
        const before = selection.replaceEntryId ? candidateIndex.entriesById.get(selection.replaceEntryId)?.标题 : undefined;
        const after = candidateIndex.entriesById.get(selection.entryId)?.标题 ?? selection.entryId;
        return `${before ?? selection.replaceEntryId ?? '未知形态'} → ${after}`;
      });
    const keywordDiagnostics = keywordRecall.diagnostics ?? buildEmptyZhikuDiagnostics();
    const finalInjection = buildZhikuInjection(finalGroups, sceneHints);
    const finalVolume = buildZhikuInjectionVolume(finalGroups, finalInjection);
    return {
      entries: finalPicked,
      characterEntries: finalGroups.characterEntries,
      strongEntries: finalGroups.strongEntries,
      weakEntries: finalGroups.weakEntries,
      injection: finalInjection,
      usedModel: true,
      rawText,
      diagnostics: {
        ...keywordDiagnostics,
        AI候选资料: candidateIndex.request.candidates.map((candidate) => `${candidate.entryId}｜${candidate.title}`),
        AI候选索引: candidateIndex.request.candidates.map((candidate) => `${candidate.entryId}｜${candidate.title}｜${candidate.candidateReason.join('+') || 'UNKNOWN'}`),
        AI补充资料: appliedSupplementEntries.map((entry) => entry.标题),
        AI形态修正: formOverrides,
        AI拒绝选择: compilation.rejected.map((item) => `${item.entryId}｜${item.code}｜${item.detail}`),
        AI未选择原因: aiOutput.noSelectionReason,
        AI检索补充: aiCharacterSupplement.map((entry) => entry.标题),
        AI检索补充强资料: aiStrongSupplement.map((entry) => entry.标题),
        AI检索补充弱资料: aiWeakSupplement.map((entry) => entry.标题),
        角色相关资料: finalGroups.characterEntries.map((entry) => entry.标题),
        强相关资料: finalGroups.strongEntries.map((entry) => entry.标题),
        弱相关资料: finalGroups.weakEntries.map((entry) => entry.标题),
        已注入资料: finalPicked.map((entry) => entry.标题),
        角色故事层注入: finalGroups.characterEntries.map(formatCharacterStoryInjectionDiagnostic),
        ...finalVolume,
        检查项: [
          ...keywordDiagnostics.检查项,
          `AI 主动补充已执行：受控候选 ${candidateIndex.request.candidates.length} 条，接受 ${compilation.accepted.length} 条，拒绝 ${compilation.rejected.length} 条；关键词证据保留，只有合法同主体形态修正会改变最终条目。`,
        ],
      },
    };
  } catch (error) {
    const keywordDiagnostics = keywordRecall.diagnostics ?? buildEmptyZhikuDiagnostics();
    return {
      ...keywordRecall,
      usedModel: true,
      diagnostics: {
        ...keywordDiagnostics,
        AI候选资料: candidateIndex.request.candidates.map((candidate) => `${candidate.entryId}｜${candidate.title}`),
        AI候选索引: candidateIndex.request.candidates.map((candidate) => `${candidate.entryId}｜${candidate.title}｜${candidate.candidateReason.join('+') || 'UNKNOWN'}`),
        检查项: [
          ...keywordDiagnostics.检查项,
          `AI 主动补充失败，已回退到关键词结果：${error instanceof Error ? error.message : '未知错误'}`,
        ],
      },
    };
  }
}

export function buildZhikuModelSystemPrompt(sceneHints: string[] = [], promptModules?: 提示词模块[]): string {
  const sceneHintsLine = sceneHints.length ? `关键词层场景锚点：${sceneHints.slice(0, 8).join('、')}` : '关键词层场景锚点：无';
  const modulesSection = buildZhikuPromptModulesSection(promptModules);
  return [
    modulesSection ? `# 玩家启用的智库附加规则\n${modulesSection}` : '',
    '# 固定运行时身份与安全契约（优先级最高）',
    ZHIKU_COT_PROMPT,
    '',
    ZHIKU_OUTPUT_FORMAT_PROMPT,
    sceneHintsLine,
  ].filter(Boolean).join('\n\n');
}

function buildZhikuPromptModulesSection(promptModules?: 提示词模块[]): string {
  if (!promptModules || promptModules.length === 0) return '';
  return buildIndependentPromptModulesSection(promptModules, 'zhiku');
}

export function buildZhikuModelUserPrompt(request: ZhikuAiRequest): string {
  return [
    '以下 JSON 是本回合唯一可使用的剧情状态、关键词证据与受控候选索引。',
    '关键词窗口仍只来自当前玩家输入与最近 3 条 assistant 正文；当前地点、人物状态、剧情计划等元信息不得触发关键词，只能帮助 AI 判断是否补漏。',
    `AI 最多接受 ${AI_SUPPLEMENT_ENTRY_LIMIT} 条选择。候选原文未发送，不得使用模型自身知识补全候选。`,
    '',
    JSON.stringify(request, null, 2),
  ].join('\n');
}

export function buildZhikuAiRequestForTurn(
  system: 智库系统,
  keywordScanText: string,
  keywordEntries: 智库条目[],
  sceneContext?: 智库场景上下文,
): ZhikuAiCandidateIndex {
  const hints = sceneContext?.aiSupplementHints;
  return buildZhikuAiCandidateIndex({
    system,
    keywordScanText,
    keywordEntries,
    context: {
      currentLocation: hints?.currentLocation,
      presentCharacters: hints?.presentNpcNames ?? sceneContext?.presentNpcNamesForFallback ?? [],
      expectedCharacters: sceneContext?.anticipatedNpcNames ?? [],
      immediateStoryReview: hints?.immediateStoryReview,
      recentStoryContext: hints?.recentStoryContext,
      storyPlan: hints?.storyPlan,
      openingArchiveText: hints?.openingArchiveText ?? sceneContext?.openingArchiveText,
    },
    getBlockReason: getMainStoryBlockReason,
  });
}

function resolveZhikuRecallConfig(mainConfig: API配置项, settings: 智库系统设置): API配置项 {
  const override = settings.api;
  return {
    ...mainConfig,
    provider: override.provider || mainConfig.provider,
    baseUrl: override.baseUrl.trim() || mainConfig.baseUrl,
    apiKey: override.apiKey.trim() || mainConfig.apiKey,
    model: override.model.trim() || mainConfig.model,
    maxTokens: override.maxTokens ?? mainConfig.maxTokens,
    temperature: override.temperature ?? mainConfig.temperature,
    retryCount: override.retryCount ?? mainConfig.retryCount ?? 2,
  };
}

function buildZhikuDiagnostics(input: {
  sceneHints: string[];
  relevantNames: string[];
  characterAnchors: 智库条目[];
  presentFallbackAnchors: 智库条目[];
  candidates: 智库条目[];
  keywordEntries: 智库条目[];
  blockedKeywordEntries: 智库条目[];
  modelCandidates: 智库条目[];
  aiSupplementEntries: 智库条目[];
  groups: 智库召回分组;
  limit: number;
}): 智库召回诊断 {
  const blocked = input.blockedKeywordEntries
    .map((entry) => ({ entry, reason: getMainStoryBlockReason(entry) }))
    .filter((item): item is { entry: 智库条目; reason: string } => Boolean(item.reason))
    .slice(0, 8)
    .map((item) => ({ 标题: item.entry.标题, 原因: item.reason }));
  const checks = [
    input.relevantNames.length
      ? `已识别相关角色：${input.relevantNames.join('、')}`
      : '未识别到明确相关角色；仅按输入与场景资料检索。',
    input.characterAnchors.length
      ? `已加入人物锚点：${input.characterAnchors.map((entry) => entry.标题).join('、')}`
      : '未加入人物锚点；可能是角色未在场、资料缺少角色标签或门禁未通过。',
    input.presentFallbackAnchors.length
      ? `已加入在场角色兜底召回：${input.presentFallbackAnchors.map((entry) => entry.标题).join('、')}；该通道不参与关键词触发，最终会与关键词命中角色按资料 ID 去重。`
      : '未加入在场角色兜底召回；没有在场角色命中可用人物档案。',
    input.groups.characterEntries.length
      ? `最终注入角色资料已按资料 ID 去重：${input.groups.characterEntries.map((entry) => entry.标题).join('、')}。`
      : '最终没有注入角色资料。',
    input.groups.characterEntries.length
      ? `角色故事层来源：${input.groups.characterEntries.map(formatCharacterStoryInjectionDiagnostic).join('；')}。`
      : '角色故事层来源：无。',
    blocked.length
      ? `门禁过滤 ${blocked.length} 条候选资料。`
      : '本次候选没有被主剧情门禁过滤的高风险资料。',
  ];
  const injectedEntries = mergeZhikuGroups(input.groups);
  const injection = buildZhikuInjection(input.groups, input.sceneHints);
  const injectedIds = new Set(injectedEntries.map((entry) => entry.id));
  const blockedIds = new Set(input.blockedKeywordEntries.map((entry) => entry.id));
  const trimmed = input.candidates
    .filter((entry) => !injectedIds.has(entry.id) && !blockedIds.has(entry.id))
    .map((entry) => ({
      标题: entry.标题,
      原因: entry.分类 === 'character'
        ? `未进入最终人物分组；人物召回上限为 ${getCharacterAnchorLimit(input.limit)} 条。`
        : `超出普通资料最大相关条目数 ${input.limit} 条。`,
      原优先级: entry.分类 === 'character' ? '人物候选' : '普通相关资料',
    }));
  const rawSelectedEntries = [
    ...input.characterAnchors,
    ...input.presentFallbackAnchors,
    ...input.groups.strongEntries,
    ...input.groups.weakEntries,
  ];
  const rawSelectedCounts = new Map<string, { entry: 智库条目; count: number }>();
  for (const entry of rawSelectedEntries) {
    const current = rawSelectedCounts.get(entry.id);
    rawSelectedCounts.set(entry.id, { entry, count: (current?.count ?? 0) + 1 });
  }
  const deduped = Array.from(rawSelectedCounts.values())
    .filter(({ count }) => count > 1)
    .map(({ entry, count }) => `${entry.标题}（${entry.id}）由 ${count} 个召回通道命中，按资料 ID 保留 1 份。`);
  return {
    场景锚点: input.sceneHints.slice(0, 12),
    相关角色: input.relevantNames.slice(0, 12),
    人物锚点: input.characterAnchors.map((entry) => entry.标题).slice(0, CHARACTER_KEYWORD_RECALL_LIMIT),
    在场角色兜底召回: input.presentFallbackAnchors.map((entry) => entry.标题).slice(0, CHARACTER_KEYWORD_RECALL_LIMIT),
    关键词召回资料: input.keywordEntries.map((entry) => entry.标题).slice(0, CHARACTER_KEYWORD_RECALL_LIMIT + NORMAL_KEYWORD_RECALL_LIMIT),
    候选资料: input.candidates.map((entry) => entry.标题).slice(0, Math.max(input.limit, 8)),
    AI候选资料: input.modelCandidates.map((entry) => entry.标题).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT),
    AI候选索引: [],
    AI补充资料: input.aiSupplementEntries.map((entry) => entry.标题).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT),
    AI形态修正: [],
    AI拒绝选择: [],
    AI未选择原因: '',
    关键词召回: input.characterAnchors.map((entry) => entry.标题).slice(0, CHARACTER_KEYWORD_RECALL_LIMIT),
    AI检索补充: input.aiSupplementEntries.filter((entry) => entry.分类 === 'character').map((entry) => entry.标题).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT),
    关键词资料召回: mergeZhikuEntries(input.groups.strongEntries, input.groups.weakEntries).map((entry) => entry.标题).slice(0, NORMAL_KEYWORD_RECALL_LIMIT),
    AI检索补充强资料: [],
    AI检索补充弱资料: [],
    角色相关资料: input.groups.characterEntries.map((entry) => entry.标题),
    强相关资料: input.groups.strongEntries.map((entry) => entry.标题).slice(0, input.limit),
    弱相关资料: input.groups.weakEntries.map((entry) => entry.标题).slice(0, input.limit),
    已注入资料: injectedEntries.map((entry) => entry.标题),
    角色故事层注入: input.groups.characterEntries.map(formatCharacterStoryInjectionDiagnostic),
    ...buildZhikuInjectionVolume(input.groups, injection),
    去重记录: deduped,
    删减记录: trimmed,
    被门禁过滤: blocked,
    检查项: [
      ...checks,
      trimmed.length ? `相关性上限未保留 ${trimmed.length} 条候选；详情见删减记录。` : '没有因相关性条目上限删减候选。',
      deduped.length ? `已合并 ${deduped.length} 组重复召回。` : '没有检测到跨召回通道重复资料。',
    ],
  };
}

function buildEmptyZhikuDiagnostics(): 智库召回诊断 {
  return {
    场景锚点: [],
    相关角色: [],
    人物锚点: [],
    在场角色兜底召回: [],
    关键词召回: [],
    AI检索补充: [],
    关键词资料召回: [],
    AI检索补充强资料: [],
    AI检索补充弱资料: [],
    关键词召回资料: [],
    候选资料: [],
    AI候选资料: [],
    AI候选索引: [],
    AI补充资料: [],
    AI形态修正: [],
    AI拒绝选择: [],
    AI未选择原因: '',
    角色相关资料: [],
    强相关资料: [],
    弱相关资料: [],
    已注入资料: [],
    角色故事层注入: [],
    静态注入字符数: 0,
    静态注入估算Token: 0,
    单条静态注入体量: [],
    动态状态来源: [
      '世界状态 / 当前位置',
      'NPC 账本 / 关系与承诺',
      '即时剧情回顾 / 伤势与情绪',
    ],
    去重记录: [],
    删减记录: [],
    体量预警: [],
    被门禁过滤: [],
    检查项: ['智库未启用、无资料或本回合没有可检索输入。'],
  };
}
function buildZhikuInjection(groups: 智库召回分组, sceneHints: string[] = []): string {
  if (!mergeZhikuGroups(groups).length) return '';
  const formatGroup = (title: string, entries: 智库条目[]): string[] => {
    if (!entries.length) return [];
    return [
      `## ${title}`,
      ...entries.map(renderZhikuEntryStaticInjection).filter(Boolean),
    ];
  };
  return [
    '# 本回合角色档案约束（生成时必须遵守）',
    '',
    '以下是按本回合场景检索出的原著资料与角色档案。使用规则：',
    '- 人物主体人格用于校准口吻与行为边界；外貌、性格、说话方式、行为习惯、关系边界与禁止误写字段是角色表现的优先锚点，必须遵守；形态/命途资料不得覆盖主体人格；未解锁资料不得当作当前事实。',
    '- 事实优先级：资料与当前已发生剧情冲突时，以已发生剧情为准；剧情方向不能只靠资料硬推。',
    '- 迁移设定资料可能混有原著公开信息、寰宇记载、学者考据与整理者分析；正文只可把它们作为概念、背景和气质参考，不得把混合推论写成已确认事实。',
    groups.characterEntries.length
      ? [
          '## 角色执行约束',
          '- 本回合若出现“在场角色档案”中的人物，正文必须至少在该角色的一处对话、动作、表情或反应里体现性格锚点与说话方式。',
          '- 不得只把人物资料当作姓名表；禁止把原著角色写成通用 NPC、无差别旁白工具人或长期沉默背景板。',
          '- “关系边界”和“禁止误写”按硬边界处理；若当前剧情需要偏离，必须先用正文事实解释偏离原因。',
        ].join('\n')
      : '',
    sceneHints.length ? `关键词层场景锚点：${sceneHints.slice(0, 8).join('、')}` : '关键词层场景锚点：无',
    '',
    ...formatGroup('在场角色档案（必须遵守）', groups.characterEntries),
    '',
    ...formatGroup('强相关背景', groups.strongEntries),
    '',
    ...formatGroup('弱相关背景', groups.weakEntries),
  ].filter((line, index, lines) => line.trim() || lines[index - 1]?.trim()).join('\n').trim();
}

export function buildZhikuEntryInjectionPreview(entry: 智库条目): string {
  return renderZhikuEntryStaticInjection(entry);
}

export function renderZhikuEntryStaticInjection(entry: 智库条目): string {
  if (!智库条目注入内容完整(entry) || !entry.注入内容) return '';
  const content = entry.注入内容;
  if (content.类型 === 'character') {
    return [
      `【人物：${entry.标题}】`,
      `核心身份与阵营：${content.核心身份与阵营}`,
      `独立人格与行为：${content.独立人格与行为}`,
      `外貌锚点：${content.外貌锚点}`,
      `说话方式：${content.说话方式}`,
      `台词语料：\n${content.台词语料}`,
      `当前形态与能力边界：${content.当前形态与能力边界}`,
      `精简角色故事：${content.精简角色故事}`,
      `演绎红线：${content.演绎红线}`,
    ].join('\n');
  }
  return [
    `【${ZHIKU_CATEGORY_LABELS[entry.分类]}：${entry.标题}】`,
    `核心定义：${content.核心定义}`,
    `关键事实：${content.关键事实}`,
    `叙事用途：${content.叙事用途}`,
    `演绎边界：${content.演绎边界}`,
  ].join('\n');
}

function buildZhikuInjectionVolume(groups: 智库召回分组, injection: string) {
  const entries = mergeZhikuGroups(groups);
  const characterIds = new Set(groups.characterEntries.map((entry) => entry.id));
  const strongIds = new Set(groups.strongEntries.map((entry) => entry.id));
  const detail = entries.map((entry) => {
    const text = renderZhikuEntryStaticInjection(entry);
    return {
      id: entry.id,
      标题: entry.标题,
      分类: entry.分类,
      字符数: text.length,
      估算Token: estimateTextTokens(text),
      保留优先级: characterIds.has(entry.id)
        ? '必须人物' as const
        : strongIds.has(entry.id)
          ? '强相关背景' as const
          : '弱相关背景' as const,
    };
  });
  const totalTokens = estimateTextTokens(injection);
  const warnings = detail
    .filter((item) => item.估算Token > ZHIKU_ENTRY_VOLUME_WARNING_TOKENS)
    .map((item) => `${item.标题} 单条静态注入约 ${item.估算Token} tokens，超过 ${ZHIKU_ENTRY_VOLUME_WARNING_TOKENS} tokens 诊断线；系统未自动截断。`);
  if (totalTokens > ZHIKU_TOTAL_VOLUME_WARNING_TOKENS) {
    warnings.push(`智库静态注入合计约 ${totalTokens} tokens，超过 ${ZHIKU_TOTAL_VOLUME_WARNING_TOKENS} tokens 诊断线；请结合当前供应商上下文上限检查，系统未删除重要人物。`);
  }
  return {
    静态注入字符数: injection.length,
    静态注入估算Token: totalTokens,
    单条静态注入体量: detail,
    动态状态来源: [
      '世界状态 / 当前位置',
      'NPC 账本 / 关系与承诺',
      '即时剧情回顾 / 伤势与情绪',
    ],
    体量预警: warnings,
  };
}

function formatCharacterStoryInjectionDiagnostic(entry: 智库条目): string {
  const title = entry.标题 || '未命名人物';
  return entry.注入内容?.类型 === 'character' && entry.注入内容.精简角色故事.trim()
    ? `${title}：显式精简角色故事`
    : `${title}：注入内容不完整`;
}

function getZhikuCharacterCalibrationText(entry: 智库条目): string {
  if (entry.分类 !== 'character') return '';
  const meta = 解析智库软结构标签(entry);
  return [
    meta.外貌锚点,
    meta.性格锚点,
    meta.说话方式,
    meta.行为习惯,
    meta.关系边界,
    meta.禁止误写,
  ].filter(Boolean).join(' ');
}

function compact(value?: string): string {
  if (!value) return '';
  return value.length > 120 ? `${value.slice(0, 118)}...` : value;
}
