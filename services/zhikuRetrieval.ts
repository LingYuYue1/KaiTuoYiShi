import type { 智库系统, 智库条目 } from '@/models/zhiku';
import type { 智库系统设置 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { normalizeStructuredModelText } from '@/services/ai/structuredOutputRepair';
import { ZHIKU_CATEGORY_LABELS, 搜索智库条目 } from '@/models/zhiku';
import type { 智库软结构标签 } from '@/models/zhiku';
import { 解析智库软结构标签, 获取智库人物名列表, 获取智库核心触发词, 比较智库人物节点 } from '@/models/zhiku';
import { ZHIKU_COT_PROMPT as ZHIKU_LEGACY_COT_PROMPT, ZHIKU_OUTPUT_FORMAT_PROMPT, CHARACTER_KEYWORD_RECALL_LIMIT, AI_SUPPLEMENT_ENTRY_LIMIT, NORMAL_KEYWORD_RECALL_LIMIT } from '@/prompts/cot/zhikuCot';
import type { 提示词模块 } from '@/models/prompts';
import { buildIndependentPromptModulesSection } from '@/services/promptModuleScopes';
import { requireIndependentApiConfig } from '@/services/ai/requireIndependentApiConfig';


export interface 智库检索结果 {
  /** Explicit recall outcome; callers must not infer it from an empty string. */
  status: 'not-run' | 'no-match' | 'injection';
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
  AI补充资料: string[];
  角色相关资料: string[];
  强相关资料: string[];
  弱相关资料: string[];
  已注入资料: string[];
  角色故事层注入: string[];
  被门禁过滤: Array<{ 标题: string; 原因: string }>;
  检查项: string[];
}

interface 智库召回分组 {
  characterEntries: 智库条目[];
  strongEntries: 智库条目[];
  weakEntries: 智库条目[];
}

interface 智库场景上下文 {
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

interface 智库AI补充线索 {
  currentLocation?: string;
  presentNpcNames?: string[];
  immediateStoryReview?: string;
  recentStoryContext?: string;
  storyPlan?: string;
  openingArchiveText?: string;
}

export interface 智库模型用户提示词选项 {
  keywordRecallTitles?: string[];
  anticipatedNpcNames?: string[];
  aiSupplementHints?: 智库AI补充线索;
}

const CHARACTER_ANCHOR_ENTRIES_PER_ROLE = 2;

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

const ZHIKU_STOP_WORDS = new Set([
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '她们',
  '这个', '那个', '这些', '那些', '什么', '怎么', '如何', '可以', '能够', '会', '想', '要',
  '问题', '内容', '资料', '原著', '智库', '记忆', '剧情', '角色', '人物', '地点', '事件',
  '相关', '看看', '看看吧', '继续', '一下', '一下子', '这边', '那边', '这里', '那里',
  '当前', '现在', '本回合', '回合', '系统', '模块', '条目',
]);

function isMainStoryInjectableZhikuEntry(entry: 智库条目): boolean {
  return !getMainStoryBlockReason(entry);
}

function getMainStoryBlockReason(entry: 智库条目): string | null {
  if (!entry.可用于联动) return '该资料标记为不可联动。';
  if (entry.分类 === 'story') return '原著剧情正文由剧情编织管理，不走智库普通召回。';
  if (entry.可否主剧情注入 === false) return '该资料标记为不可主剧情注入。';

  const meta = 解析智库软结构标签(entry);
  return getMainStoryZhikuMetaBlockReason(meta);
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

function augmentZhikuQuery(query: string, sceneHints: string[]): string {
  const parts = [query.trim(), ...sceneHints.slice(0, 8)];
  return parts.filter(Boolean).join(' ').trim();
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
  return [...entries].sort((a, b) => {
    const sceneDiff = Number(sceneMatchesEntry(b, sceneHints)) - Number(sceneMatchesEntry(a, sceneHints));
    if (sceneDiff !== 0) return sceneDiff;
    return b.updatedAt - a.updatedAt;
  });
}

function buildRelevantCharacterNames(system: 智库系统, query: string, sceneContext?: 智库场景上下文): string[] {
  const characterTriggers = buildCharacterTriggerCandidates(system, sceneContext);
  if (!characterTriggers.length) return [];

  const explicitNames = new Set<string>();
  const joinedText = [
    buildCharacterDetectionText(query),
    ...(sceneContext?.npcNames ?? []),
  ].filter(Boolean).join(' ');
  for (const { name, trigger } of characterTriggers) {
    if (sceneContext?.npcNames?.some((npcName) => namesLikelySame(npcName, name) || namesLikelySame(npcName, trigger)) || nameAppearsInText(trigger, joinedText)) {
      explicitNames.add(name);
    }
  }
  if (explicitNames.size > 0) return Array.from(explicitNames);

  return [];
}

function buildCharacterTriggerCandidates(system: 智库系统, sceneContext?: 智库场景上下文): Array<{ name: string; trigger: string }> {
  const candidates: Array<{ name: string; trigger: string }> = [];
  const seen = new Set<string>();
  for (const entry of system.条目 ?? []) {
    if (entry.分类 !== 'character') continue;
    const names = 获取智库人物名列表(entry)
      .filter((name) => isAllowedOriginalProtagonistName(name, sceneContext?.originalProtagonist))
      .filter(Boolean);
    if (!names.length) continue;
    const canonical = names[0];
    const aliasTriggers = extractCharacterAliasTriggers(entry).filter((trigger) => !isBroadCharacterTrigger(trigger));
    const coreTriggers = 获取智库核心触发词(entry)
      .filter((trigger) => !isBroadCharacterTrigger(trigger))
      .filter((trigger) => [...names, ...aliasTriggers].some((name) => namesLikelySame(name, trigger)));
    const triggers = [entry.标题, ...names, ...aliasTriggers, ...coreTriggers].filter(Boolean);
    for (const trigger of triggers) {
      const key = `${canonical}::${trigger}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ name: canonical, trigger });
    }
  }
  return candidates.sort((a, b) => b.trigger.length - a.trigger.length);
}

function extractCharacterAliasTriggers(entry: 智库条目): string[] {
  const triggers: string[] = [];
  const source = String(entry.原文 ?? '');
  for (const match of source.matchAll(/^\s*-?\s*(?:名称|姓名|别名|昵称\s*\/\s*外号|全名\s*\/\s*本名)[:：]\s*([^\n]+)/gmu)) {
    for (const item of match[1].split(/[、，,；;]/u)) {
      const cleaned = item.replace(/[。.\s]+$/u, '').trim();
      if (cleaned) triggers.push(cleaned);
    }
  }
  return Array.from(new Set(triggers));
}

function isBroadCharacterTrigger(trigger: string): boolean {
  const clean = trigger.trim();
  if (!clean) return true;
  if (/^(?:主剧情|智库|变量参考|手机|新闻|语料|角色故事|历史故事|阶段边界|OOC防护|禁止照抄语料|禁止原句搬运)$/u.test(clean)) return true;
  if (/^(?:星穹列车|列车组|无名客|黑塔空间站|空间站|贝洛伯格|雅利洛-?VI|上层区|下层区|地火|银鬃铁卫|星核猎手)$/u.test(clean)) return true;
  if (/^(?:观景车厢|派对车厢|客房车厢|列车规则|列车广播|乘客安全|车厢打扫|跃迁)$/u.test(clean)) return true;
  return false;
}

function namesLikelySame(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  return !!left && !!right && (left === right || left.includes(right) || right.includes(left));
}

function nameAppearsInText(name: string, text: string): boolean {
  const cleanName = name.trim();
  if (!cleanName || !text.trim()) return false;
  const semanticText = cleanName === '黑塔'
    ? text.replace(/空间站[「“"]?黑塔[」”"]?|黑塔空间站/g, '')
    : text;
  if (cleanName.length <= 1) {
    const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[\\s，。！？、：；“”"'（）()《》【】])${escaped}($|[\\s，。！？、：；“”"'（）()《》【】])`).test(semanticText);
  }
  return semanticText.includes(cleanName);
}

function buildCharacterDetectionText(query: string): string {
  return query
    .split(/\r?\n/)
    .filter((line) => !/^(当前地点|当前相关人物|最近玩家输入|剧情规划|事件|小结)[:：]/.test(line.trim()))
    .join('\n');
}

function buildCharacterAnchorEntries(system: 智库系统, query: string, limit: number, sceneContext?: 智库场景上下文): 智库条目[] {
  const relevantNames = buildRelevantCharacterNames(system, query, sceneContext);
  if (!relevantNames.length) return [];

  const anchorLimit = getCharacterAnchorLimit(limit);
  const entriesByName = new Map<string, 智库条目[]>();
  for (const entry of system.条目 ?? []) {
    if (entry.分类 !== 'character' || !isMainStoryInjectableZhikuEntry(entry)) continue;
    const characterNames = 获取智库人物名列表(entry);
    if (!isAllowedOriginalProtagonistEntry(characterNames, sceneContext?.originalProtagonist)) continue;
    const matchedName = relevantNames.find((name) => characterNames.some((characterName) => namesLikelySame(characterName, name)));
    if (!matchedName) continue;
    const current = entriesByName.get(matchedName) ?? [];
    current.push(entry);
    entriesByName.set(matchedName, current);
  }

  const anchors: 智库条目[] = [];
  for (const name of relevantNames) {
    const pickedForRole = (entriesByName.get(name) ?? [])
      .sort(比较智库人物节点)
      .filter(isCharacterAnchorNode)
      .slice(0, CHARACTER_ANCHOR_ENTRIES_PER_ROLE);
    for (const entry of pickedForRole) {
      if (!anchors.some((item) => item.id === entry.id)) anchors.push(entry);
      if (anchors.length >= anchorLimit) return anchors;
    }
  }
  return anchors;
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
    const pickedForRole = (entriesByName.get(name) ?? [])
      .sort(比较智库人物节点)
      .filter(isCharacterAnchorNode)
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

function trimAiSupplementGroups(groups: 智库召回分组): 智库召回分组 {
  const characterEntries = groups.characterEntries.slice(0, AI_SUPPLEMENT_ENTRY_LIMIT);
  const strongLimit = Math.max(0, AI_SUPPLEMENT_ENTRY_LIMIT - characterEntries.length);
  const strongEntries = groups.strongEntries.slice(0, strongLimit);
  const weakLimit = Math.max(0, AI_SUPPLEMENT_ENTRY_LIMIT - characterEntries.length - strongEntries.length);
  const weakEntries = groups.weakEntries.slice(0, weakLimit);
  return { characterEntries, strongEntries, weakEntries };
}

function mergeSupplementedZhikuGroups(keywordGroups: 智库召回分组, supplementGroups: 智库召回分组): 智库召回分组 {
  const limitedSupplement = trimAiSupplementGroups(supplementGroups);
  const characterEntries = mergeZhikuEntries(keywordGroups.characterEntries, limitedSupplement.characterEntries);
  const strongEntries = mergeZhikuEntries(keywordGroups.strongEntries, limitedSupplement.strongEntries);
  const weakEntries = mergeZhikuEntries(keywordGroups.weakEntries, limitedSupplement.weakEntries)
    .filter((entry) => !strongEntries.some((strong) => strong.id === entry.id));
  return { characterEntries, strongEntries, weakEntries };
}

function isNormalRecallEntry(entry: 智库条目): boolean {
  return entry.分类 !== 'character' && entry.分类 !== 'story';
}

export function retrieveZhikuContext(system: 智库系统 | undefined, query: string, limit: number, sceneContext?: 智库场景上下文): 智库检索结果 {
  if (!system?.条目?.length || !query.trim()) {
    return { status: 'not-run', entries: [], injection: '', diagnostics: buildEmptyZhikuDiagnostics() };
  }
  const normalLimit = getNormalRelatedLimit(limit);
  const sceneHints = buildZhikuSceneHints(sceneContext);
  const relevantNames = buildRelevantCharacterNames(system, query, sceneContext);
  const searchQuery = augmentZhikuQuery(query, sceneHints);
  const characterAnchors = buildCharacterAnchorEntries(system, query, limit, sceneContext);
  const presentFallbackAnchors = buildPresentCharacterFallbackEntries(system, sceneContext?.presentNpcNamesForFallback, sceneContext);
  const rankedEntries = 搜索智库条目(system, searchQuery, Math.max(normalLimit * 3, normalLimit))
    .filter(isMainStoryInjectableZhikuEntry);
  const normalRankedEntries = rankedEntries.filter(isNormalRecallEntry);
  const primaryEntries = rankZhikuEntries(
    normalRankedEntries.filter((entry) => isStrongInjectionMatch(entry, query, sceneHints)),
    sceneHints,
  ).slice(0, normalLimit);
  const weakSource = rankZhikuEntries(
    normalRankedEntries.filter((entry) => !primaryEntries.some((item) => item.id === entry.id) && (sceneMatchesEntry(entry, sceneHints) || primaryEntries.length === 0)),
    sceneHints,
  );
  const groups: 智库召回分组 = {
    characterEntries: mergeZhikuEntries(characterAnchors, presentFallbackAnchors),
    strongEntries: primaryEntries,
    weakEntries: weakSource.slice(0, Math.max(0, normalLimit - primaryEntries.length)),
  };
  const selectedEntries = mergeZhikuGroups(groups);
  const diagnostics = buildZhikuDiagnostics({
    system,
    query: searchQuery,
    sceneHints,
    relevantNames,
    characterAnchors,
    presentFallbackAnchors,
    candidates: rankedEntries,
    keywordEntries: selectedEntries,
    modelCandidates: [],
    aiSupplementEntries: [],
    groups,
    limit: normalLimit,
  });
  if (!selectedEntries.length) {
    return { status: 'no-match', entries: [], injection: '', diagnostics };
  }
  return {
    status: 'injection',
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
  signal?: AbortSignal,
  retryCount = 2,
  sceneContext?: 智库场景上下文,
  promptModules?: 提示词模块[],
): Promise<智库检索结果> {
  if (!system?.条目?.length || !query.trim()) {
    return { status: 'not-run', entries: [], injection: '', usedModel: false };
  }

  const keywordRecall = retrieveZhikuContext(system, query, limit, sceneContext);
  const hasModelConfig = Boolean(
    settings.api.provider
    && settings.api.baseUrl.trim()
    && settings.api.apiKey.trim()
    && settings.api.model.trim(),
  );
  if (!hasModelConfig) return keywordRecall;
  const api = requireIndependentApiConfig('智库召回', settings.api, {
    maxTokens: 384,
    temperature: 0.1,
  });

  const keywordGroups: 智库召回分组 = {
    characterEntries: keywordRecall.characterEntries ?? [],
    strongEntries: keywordRecall.strongEntries ?? [],
    weakEntries: keywordRecall.weakEntries ?? [],
  };
  const keywordEntries = mergeZhikuGroups(keywordGroups);
  const normalLimit = getNormalRelatedLimit(limit);
  const candidates = buildRecallSupplementCandidates(system, query, Math.max(normalLimit * 3, 18), sceneContext, keywordEntries);
  if (!candidates.length) return keywordRecall;

  const sceneHints = buildZhikuSceneHints(sceneContext);
  const candidateText = candidates
    .map((entry, index) => {
      const keywords = entry.关键词.length ? `｜关键词：${entry.关键词.slice(0, 8).join('、')}` : '';
      const source = entry.来源 ? `｜来源：${entry.来源}` : '';
      const meta = formatZhikuSoftMeta(entry, '｜');
      const calibration = formatZhikuCharacterCalibrationBrief(entry, '｜');
      const summary = entry.摘要 || '无摘要';
      return [
        `${index + 1}. ${entry.标题}`,
        `类别：${ZHIKU_CATEGORY_LABELS[entry.分类]}｜重要度：${entry.重要度}${source}${keywords}${meta}`,
        `摘要：${summary}${calibration}`,
      ].join('\n');
    })
    .join('\n\n');

  const systemPrompt = buildZhikuModelSystemPrompt(sceneHints, promptModules);
  const userPrompt = buildZhikuModelUserPrompt(query, normalLimit, candidateText, {
    keywordRecallTitles: keywordEntries.map((entry) => entry.标题),
    anticipatedNpcNames: sceneContext?.anticipatedNpcNames ?? [],
    aiSupplementHints: sceneContext?.aiSupplementHints,
  });

  const rawText = await withRetries(
      () =>
        chatCompletionNonStream(api, {
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt,
          signal,
          maxTokens: api.maxTokens ?? 384,
          temperature: api.temperature ?? 0.1,
        }),
      { retries: retryCount, signal, label: '智库召回' },
  );
    const supplementGroups = parseZhikuIndexes(rawText, candidates, normalLimit);
    const supplementEntries = mergeZhikuGroups(supplementGroups);
    const finalGroups = mergeSupplementedZhikuGroups(keywordGroups, supplementGroups);
    const finalPicked = mergeZhikuGroups(finalGroups);
    const appliedSupplementEntries = finalPicked.filter((entry) => supplementEntries.some((item) => item.id === entry.id));
    const appliedSupplementIds = new Set(appliedSupplementEntries.map((entry) => entry.id));
    const aiCharacterSupplement = supplementGroups.characterEntries.filter((entry) => appliedSupplementIds.has(entry.id));
    const aiStrongSupplement = supplementGroups.strongEntries.filter((entry) => appliedSupplementIds.has(entry.id));
    const aiWeakSupplement = supplementGroups.weakEntries.filter((entry) => appliedSupplementIds.has(entry.id));
    if (!supplementEntries.length) {
      const keywordDiagnostics = keywordRecall.diagnostics ?? buildEmptyZhikuDiagnostics();
      return {
        ...keywordRecall,
        usedModel: true,
        rawText,
        diagnostics: {
          ...keywordDiagnostics,
          AI候选资料: candidates.map((entry) => entry.标题).slice(0, Math.max(AI_SUPPLEMENT_ENTRY_LIMIT, normalLimit)),
          AI补充资料: [],
          检查项: [
            ...keywordDiagnostics.检查项,
            '智库模型已完成查缺补漏，本回合没有需要追加的资料。',
          ],
        },
      };
    }
    const keywordDiagnostics = keywordRecall.diagnostics ?? buildEmptyZhikuDiagnostics();
    return {
      entries: finalPicked,
      status: finalPicked.length ? 'injection' : 'no-match',
      characterEntries: finalGroups.characterEntries,
      strongEntries: finalGroups.strongEntries,
      weakEntries: finalGroups.weakEntries,
      injection: buildZhikuInjection(finalGroups, sceneHints),
      usedModel: true,
      rawText,
      diagnostics: {
        ...keywordDiagnostics,
        AI候选资料: candidates.map((entry) => entry.标题).slice(0, Math.max(AI_SUPPLEMENT_ENTRY_LIMIT, normalLimit)),
        AI补充资料: appliedSupplementEntries.map((entry) => entry.标题),
        AI检索补充: aiCharacterSupplement.map((entry) => entry.标题),
        AI检索补充强资料: aiStrongSupplement.map((entry) => entry.标题),
        AI检索补充弱资料: aiWeakSupplement.map((entry) => entry.标题),
        角色相关资料: finalGroups.characterEntries.map((entry) => entry.标题),
        强相关资料: finalGroups.strongEntries.map((entry) => entry.标题),
        弱相关资料: finalGroups.weakEntries.map((entry) => entry.标题),
        已注入资料: finalPicked.map((entry) => entry.标题),
        角色故事层注入: finalGroups.characterEntries.map(formatCharacterStoryInjectionDiagnostic),
        检查项: [
          ...keywordDiagnostics.检查项,
          `智库模型已按最近多回合正文窗口查缺补漏，追加 ${appliedSupplementEntries.length} 条未由关键词命中的资料。`,
        ],
      },
    };
}

export function buildZhikuModelSystemPrompt(sceneHints: string[] = [], promptModules?: 提示词模块[]): string {
  const sceneHintsLine = sceneHints.length ? `关键词层场景锚点：${sceneHints.slice(0, 8).join('、')}` : '关键词层场景锚点：无';
  const modulesSection = buildZhikuPromptModulesSection(promptModules);
  if (modulesSection) {
    return [modulesSection, sceneHintsLine].join('\n');
  }
  // legacy 回退：未传 promptModules 时使用源文件 import
  return [
    ZHIKU_LEGACY_COT_PROMPT,
    '',
    ZHIKU_OUTPUT_FORMAT_PROMPT,
    sceneHintsLine,
  ].join('\n');
}

function buildZhikuPromptModulesSection(promptModules?: 提示词模块[]): string {
  if (!promptModules || promptModules.length === 0) return '';
  return buildIndependentPromptModulesSection(promptModules, 'zhiku');
}

export function buildZhikuModelUserPrompt(query: string, limit: number, candidateText: string, options: 智库模型用户提示词选项 = {}): string {
  const keywordRecallTitles = options.keywordRecallTitles ?? [];
  const anticipated = (options.anticipatedNpcNames ?? []).map((name) => name.trim()).filter(Boolean);
  return [
    `召回扫描正文窗口：${query.trim()}`,
    '说明：关键词召回只读取当前玩家输入与最近 5 条 assistant 正文内容；当前地点、当前相关人物、剧情规划、小结、动态事件、即时剧情回顾和在场角色分析等元信息不得触发关键词。',
    '',
    'AI 查缺补漏线索（只用于判断是否缺少必要资料，不属于关键词扫描正文窗口）：',
    formatAiSupplementHints(options.aiSupplementHints),
    anticipated.length ? `预期登场人物（只用于 AI 查缺补漏，不视为关键词已命中）：${anticipated.slice(0, AI_SUPPLEMENT_ENTRY_LIMIT).join('、')}` : '预期登场人物：无',
    `关键词召回上限：角色档案 ${CHARACTER_KEYWORD_RECALL_LIMIT} 条，非角色资料 ${getNormalRelatedLimit(limit)} 条；AI 补充上限：最多 ${AI_SUPPLEMENT_ENTRY_LIMIT} 条，且只追加未被关键词召回的候选。`,
    '',
    `已关键词召回资料（只作为排除表，不含档案正文）：${keywordRecallTitles.length ? keywordRecallTitles.join('、') : '无'}`,
    '',
    '未召回候选资料（只可从这里补缺）：',
    candidateText,
  ].join('\n');
}

function buildRecallSupplementCandidates(system: 智库系统, query: string, limit: number, sceneContext?: 智库场景上下文, excludedEntries: 智库条目[] = []): 智库条目[] {
  const sceneHints = buildZhikuSceneHints(sceneContext);
  const excludedIds = new Set(excludedEntries.map((entry) => entry.id));
  const isAvailableSupplement = (entry: 智库条目) => !excludedIds.has(entry.id) && isMainStoryInjectableZhikuEntry(entry) && entry.分类 !== 'story';
  const scored = 搜索智库条目(system, augmentZhikuQuery(query, sceneHints), Math.max(limit * 3, limit))
    .filter(isAvailableSupplement);
  const aiSupplementHintQuery = buildAiSupplementHintQuery(sceneContext?.aiSupplementHints);
  const hinted = aiSupplementHintQuery
    ? 搜索智库条目(system, aiSupplementHintQuery, Math.max(limit * 2, limit))
      .filter(isAvailableSupplement)
    : [];
  const characterPool = [...(system.条目 ?? [])]
    .filter(isAvailableSupplement)
    .filter((entry) => entry.分类 === 'character')
    .filter(isCharacterAnchorNode);
  const anticipatedCharacters = characterPool.filter((entry) => {
    const names = 获取智库人物名列表(entry);
    return (sceneContext?.anticipatedNpcNames ?? []).some((name) => names.some((characterName) => namesLikelySame(characterName, name)));
  });
  const recent = [...(system.条目 ?? [])]
    .filter(isAvailableSupplement)
    .filter(isNormalRecallEntry)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.min(10, limit));
  const characterCandidates = mergeZhikuEntries(
    rankZhikuEntries(anticipatedCharacters, sceneHints),
  ).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT);
  const normalCandidates = mergeZhikuEntries(
    rankZhikuEntries(scored.filter(isNormalRecallEntry), sceneHints),
    rankZhikuEntries(hinted.filter(isNormalRecallEntry), sceneHints),
    rankZhikuEntries(recent, sceneHints),
  ).slice(0, limit);
  return mergeZhikuEntries(characterCandidates, normalCandidates).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT + normalCandidates.length);
}

function buildAiSupplementHintQuery(hints?: 智库AI补充线索): string {
  if (!hints) return '';
  const parts = [
    hints.currentLocation,
    ...(hints.presentNpcNames ?? []),
    hints.openingArchiveText,
    hints.immediateStoryReview,
    hints.recentStoryContext,
    hints.storyPlan,
  ];
  return parts.map((item) => item?.trim()).filter(Boolean).join('\n').slice(0, 1600);
}

function formatAiSupplementHints(hints?: 智库AI补充线索): string {
  if (!hints) return '无';
  const lines = [
    hints.currentLocation?.trim() ? `当前地点：${compactPromptText(hints.currentLocation, 80)}` : '',
    hints.presentNpcNames?.length ? `在场角色分析：${hints.presentNpcNames.map((name) => name.trim()).filter(Boolean).slice(0, 12).join('、')}` : '',
    hints.openingArchiveText?.trim() ? `开局档案：${compactPromptText(hints.openingArchiveText, 700)}` : '',
    hints.immediateStoryReview?.trim() ? `即时剧情回顾：${compactPromptText(hints.immediateStoryReview, 700)}` : '',
    hints.recentStoryContext?.trim() ? `最近剧情承接：${compactPromptText(hints.recentStoryContext, 500)}` : '',
    hints.storyPlan?.trim() ? `剧情规划：${compactPromptText(hints.storyPlan, 300)}` : '',
  ].filter(Boolean);
  return lines.length ? lines.join('\n') : '无';
}

function compactPromptText(value: string, limit: number): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  return cleaned.length > limit ? `${cleaned.slice(0, Math.max(0, limit - 3))}...` : cleaned;
}

function buildZhikuDiagnostics(input: {
  system: 智库系统;
  query: string;
  sceneHints: string[];
  relevantNames: string[];
  characterAnchors: 智库条目[];
  presentFallbackAnchors: 智库条目[];
  candidates: 智库条目[];
  keywordEntries: 智库条目[];
  modelCandidates: 智库条目[];
  aiSupplementEntries: 智库条目[];
  groups: 智库召回分组;
  limit: number;
}): 智库召回诊断 {
  const blocked = 搜索智库条目(input.system, input.query, Math.max(input.limit * 4, 16))
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
  return {
    场景锚点: input.sceneHints.slice(0, 12),
    相关角色: input.relevantNames.slice(0, 12),
    人物锚点: input.characterAnchors.map((entry) => entry.标题).slice(0, CHARACTER_KEYWORD_RECALL_LIMIT),
    在场角色兜底召回: input.presentFallbackAnchors.map((entry) => entry.标题).slice(0, CHARACTER_KEYWORD_RECALL_LIMIT),
    关键词召回资料: input.keywordEntries.map((entry) => entry.标题).slice(0, CHARACTER_KEYWORD_RECALL_LIMIT + NORMAL_KEYWORD_RECALL_LIMIT),
    候选资料: input.candidates.map((entry) => entry.标题).slice(0, Math.max(input.limit, 8)),
    AI候选资料: input.modelCandidates.map((entry) => entry.标题).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT),
    AI补充资料: input.aiSupplementEntries.map((entry) => entry.标题).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT),
    关键词召回: input.characterAnchors.map((entry) => entry.标题).slice(0, CHARACTER_KEYWORD_RECALL_LIMIT),
    AI检索补充: input.aiSupplementEntries.filter((entry) => entry.分类 === 'character').map((entry) => entry.标题).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT),
    关键词资料召回: mergeZhikuEntries(input.groups.strongEntries, input.groups.weakEntries).map((entry) => entry.标题).slice(0, NORMAL_KEYWORD_RECALL_LIMIT),
    AI检索补充强资料: [],
    AI检索补充弱资料: [],
    角色相关资料: input.groups.characterEntries.map((entry) => entry.标题),
    强相关资料: input.groups.strongEntries.map((entry) => entry.标题).slice(0, input.limit),
    弱相关资料: input.groups.weakEntries.map((entry) => entry.标题).slice(0, input.limit),
    已注入资料: mergeZhikuGroups(input.groups).map((entry) => entry.标题),
    角色故事层注入: input.groups.characterEntries.map(formatCharacterStoryInjectionDiagnostic),
    被门禁过滤: blocked,
    检查项: checks,
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
    AI补充资料: [],
    角色相关资料: [],
    强相关资料: [],
    弱相关资料: [],
    已注入资料: [],
    角色故事层注入: [],
    被门禁过滤: [],
    检查项: ['智库未启用、无资料或本回合没有可检索输入。'],
  };
}
function parseZhikuIndexes(
  raw: string,
  candidates: 智库条目[],
  _limit: number,
): 智库召回分组 {
  const character: number[] = [];
  const strong: number[] = [];
  const weak: number[] = [];
  const accepted = new Set<number>();
  const canAccept = (index: number) => {
    if (accepted.has(index)) return false;
    return accepted.size < AI_SUPPLEMENT_ENTRY_LIMIT;
  };
  const accept = (bucket: number[], index: number) => {
    if (!canAccept(index)) return;
    bucket.push(index);
    accepted.add(index);
  };
  const text = normalizeStructuredModelText(raw);
  for (const line of text.split(/\r?\n/)) {
    const isCharacter = /角色相关资料|人物相关资料|角色资料|人物资料/i.test(line);
    const isStrong = /强相关资料|强回忆/i.test(line);
    const isWeak = /弱相关资料|弱回忆/i.test(line);
    if (!isCharacter && !isStrong && !isWeak) continue;
    const content = line.split(/[:：]/).slice(1).join(':').trim();
    if (!content || /无|none|null/i.test(content)) continue;
    const matches = content.match(/\d+/g) ?? [];
    for (const match of matches) {
      const index = Number(match) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= candidates.length) continue;
      const entry = candidates[index];
      if (isCharacter && entry.分类 === 'character' && !character.includes(index)) accept(character, index);
      if (isStrong && isNormalRecallEntry(entry) && !strong.includes(index)) accept(strong, index);
      if (isWeak && isNormalRecallEntry(entry) && !weak.includes(index) && !strong.includes(index)) accept(weak, index);
    }
    if (!matches.length) {
      const namedIndexes = findZhikuCandidateIndexesByName(content, candidates);
      for (const index of namedIndexes) {
        const entry = candidates[index];
        if (isCharacter && entry.分类 === 'character' && !character.includes(index)) accept(character, index);
        if (isStrong && isNormalRecallEntry(entry) && !strong.includes(index)) accept(strong, index);
        if (isWeak && isNormalRecallEntry(entry) && !weak.includes(index) && !strong.includes(index)) accept(weak, index);
      }
    }
  }
  const characterEntries = mergeZhikuEntries(character.map((index) => candidates[index]))
    .slice(0, AI_SUPPLEMENT_ENTRY_LIMIT);
  return {
    characterEntries,
    strongEntries: strong.map((index) => candidates[index]).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT),
    weakEntries: weak.map((index) => candidates[index]).slice(0, AI_SUPPLEMENT_ENTRY_LIMIT),
  };
}

function findZhikuCandidateIndexesByName(content: string, candidates: 智库条目[]): number[] {
  const parts = content
    .split(/[|｜,，、]/)
    .map((item) => item.replace(/[【】\[\]\s]/g, '').trim())
    .filter(Boolean);
  const indexes: number[] = [];
  for (const part of parts) {
    const index = candidates.findIndex((entry) => {
      const title = entry.标题.replace(/\s+/g, '');
      const characterNames = 获取智库人物名列表(entry).map((name) => name.replace(/\s+/g, ''));
      return title === part || title.includes(part) || part.includes(title) || characterNames.some((name) => name === part);
    });
    if (index >= 0 && !indexes.includes(index)) indexes.push(index);
  }
  return indexes;
}

function buildZhikuInjection(groups: 智库召回分组, sceneHints: string[] = []): string {
  if (!mergeZhikuGroups(groups).length) return '';
  const formatGroup = (title: string, entries: 智库条目[]): string[] => {
    if (!entries.length) return [];
    return [
      `## ${title}`,
      ...entries.map((entry, index) => formatZhikuInjectionEntry(entry, index)),
    ];
  };
  return [
    '# 智库检索结果',
    '',
    '以下内容来自原著资料中枢的检索结果。它们用于提供设定依据、人物线索、地点、道具与概念参考，不直接注入原著剧情正文；若与当前已发生剧情冲突，以当前剧情为准。',
    '人物主体人格用于校准口吻与行为边界；外貌、性格、说话方式、行为习惯、关系边界与禁止误写字段是角色表现的优先锚点；形态/命途资料不得覆盖主体人格；未解锁资料不得当作当前事实。',
    '迁移设定资料可能包含原著公开信息、寰宇记载、学者考据与整理者分析；正文只可把它们作为概念、背景和气质参考，不得把混合推论写成已确认事实。',
    groups.characterEntries.length
      ? [
          '## 角色执行约束',
          '- 本回合若出现“角色相关资料”中的人物，正文必须至少在该角色的一处对话、动作、表情或反应里体现性格锚点与说话方式。',
          '- 不得只把人物资料当作姓名表；禁止把原著角色写成通用 NPC、无差别旁白工具人或长期沉默背景板。',
          '- “关系边界”和“禁止误写”按硬边界处理；若当前剧情需要偏离，必须先用正文事实解释偏离原因。',
        ].join('\n')
      : '',
    sceneHints.length ? `关键词层场景锚点：${sceneHints.slice(0, 8).join('、')}` : '关键词层场景锚点：无',
    '',
    ...formatGroup('角色相关资料', groups.characterEntries),
    '',
    ...formatGroup('强相关资料', groups.strongEntries),
    '',
    ...formatGroup('弱相关资料', groups.weakEntries),
  ].filter((line, index, lines) => line.trim() || lines[index - 1]?.trim()).join('\n').trim();
}

function formatZhikuInjectionEntry(entry: 智库条目, index: number): string {
    if (entry.分类 === 'character') return formatCharacterZhikuInjectionEntry(entry, index);
    const title = entry.标题 || `第 ${index + 1} 条资料`;
    const summary = entry.摘要 || entry.原文.slice(0, 220) || '无摘要';
    const keywords = entry.关键词.length ? `；关键词：${entry.关键词.slice(0, 8).join('、')}` : '';
    const source = entry.来源 ? `；来源：${entry.来源}` : '';
    const meta = formatZhikuSoftMeta(entry);
    return `${index + 1}. 【${ZHIKU_CATEGORY_LABELS[entry.分类]}】${title}：${summary}${meta}${keywords}${source}`;
}

function formatCharacterZhikuInjectionEntry(entry: 智库条目, index: number): string {
  const title = entry.标题 || `第 ${index + 1} 条人物资料`;
  const keywords = entry.关键词.length ? `关键词：${entry.关键词.slice(0, 10).join('、')}` : '';
  const source = entry.来源 ? `来源：${entry.来源}` : '';
  const storySummarySection = formatCharacterStorySummarySection(entry);
  const sections = [
    formatCharacterSourceSection(entry.原文, '基础识别', 1400),
    formatCharacterSourceSection(entry.原文, '常驻事实层', 1800),
    storySummarySection,
    formatCharacterSourceSection(entry.原文, '表现锚点层', 1800),
    formatCharacterSourceSection(entry.原文, '语料层', 3600),
    formatCharacterSourceSection(entry.原文, '能力与职责模块', 1800),
    formatCharacterSourceSection(entry.原文, '本回合注入建议', 1200),
  ].filter(Boolean);
  const fallback = entry.摘要 || entry.原文.slice(0, 600) || '无摘要';
  return [
    `${index + 1}. 【人物】${title}`,
    [source, keywords].filter(Boolean).join('；'),
    '说明：这是被关键词召回或 AI 补充召回的人物档案。主剧情必须读取语料层作为口吻参考，但不得整句复读；角色故事层优先读取预整理摘要，避免长篇经历复述；阶段、门禁和未解锁内容只按当前剧情可用性使用。',
    sections.length ? sections.join('\n\n') : `摘要：${fallback}${formatZhikuSoftMeta(entry)}`,
  ].filter(Boolean).join('\n');
}

function formatCharacterStoryInjectionDiagnostic(entry: 智库条目): string {
  const title = entry.标题 || '未命名人物';
  if (entry.角色故事摘要?.trim()) return `${title}：角色故事摘要`;
  if (entry.摘要?.trim()) return `${title}：通用摘要兜底`;
  if (extractMarkdownSection(entry.原文, '角色故事层') || extractMarkdownSection(entry.原文, /^历史故事与.+层$/u)) {
    return `${title}：故事原文兜底`;
  }
  return `${title}：未注入故事层`;
}

function formatCharacterStorySummarySection(entry: 智库条目): string {
  const curated = compactSectionText(entry.角色故事摘要 ?? '', 900);
  if (curated) {
    return `### 角色故事摘要\n${curated}\n（故事摘要由内置资料预整理，用于替代长篇角色故事层注入；不得把未解锁经历写成当前已发生事实。）`;
  }
  const summary = compactSectionText(entry.摘要 ?? '', 700);
  if (summary) {
    return `### 角色故事摘要（通用摘要兜底）\n${summary}\n（该角色尚未补齐专用角色故事摘要；只作为故事背景理解，不得扩写未解锁经历。）`;
  }
  const storySection = formatCharacterSourceSection(entry.原文, '角色故事层', 700)
    || formatCharacterSourceSection(entry.原文, /^历史故事与.+层$/u, 700);
  if (!storySection) return '';
  return `${storySection}\n（该角色尚未补齐专用角色故事摘要；故事原文已按极小上限兜底截取。）`;
}
function formatCharacterSourceSection(source: string, heading: string | RegExp, limit: number): string {
  const section = extractMarkdownSection(source, heading);
  if (!section) return '';
  return `### ${section.title}\n${compactSectionText(section.body, limit)}`;
}

function extractMarkdownSection(source: string, heading: string | RegExp): { title: string; body: string } | null {
  const text = String(source || '');
  if (!text.trim()) return null;
  const headings = Array.from(text.matchAll(/^##\s+(.+?)\s*$/gmu));
  for (let index = 0; index < headings.length; index += 1) {
    const match = headings[index];
    const title = match[1]?.trim() ?? '';
    const matchesHeading = typeof heading === 'string' ? title === heading : heading.test(title);
    if (!matchesHeading || match.index === undefined) continue;
    const start = match.index + match[0].length;
    const end = headings[index + 1]?.index ?? text.length;
    const body = text.slice(start, end).trim();
    if (!body) return null;
    return { title, body };
  }
  return null;
}

function compactSectionText(value: string, limit: number): string {
  const cleaned = value.trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit).trim()}\n...（本层内容较长，已按注入上限截断；使用时只取当前剧情需要的锚点，不得补完未解锁事实。）`;
}

function formatZhikuSoftMeta(entry: 智库条目, separator = '；'): string {
  if (entry.分类 !== 'character') return '';
  const meta = 解析智库软结构标签(entry);
  const parts = [
    meta.资料类型 ? `资料类型：${meta.资料类型}` : '',
    meta.节点 ? `节点：${meta.节点}` : '',
    meta.解锁状态 ? `解锁：${meta.解锁状态}` : '',
    meta.剧透等级 ? `剧透：${meta.剧透等级}` : '',
    meta.使用范围.length ? `范围：${meta.使用范围.join('/')}` : '',
    compact(meta.外貌锚点) ? `外貌：${compact(meta.外貌锚点)}` : '',
    compact(meta.性格锚点) ? `性格：${compact(meta.性格锚点)}` : '',
    compact(meta.说话方式) ? `口吻：${compact(meta.说话方式)}` : '',
    compact(meta.行为习惯) ? `行为：${compact(meta.行为习惯)}` : '',
    compact(meta.关系边界) ? `关系边界：${compact(meta.关系边界)}` : '',
    compact(meta.禁止误写) ? `禁止误写：${compact(meta.禁止误写)}` : '',
  ].filter(Boolean);
  return parts.length ? `${separator}${parts.join(separator)}` : '';
}

function formatZhikuCharacterCalibrationBrief(entry: 智库条目, separator = '；'): string {
  if (entry.分类 !== 'character') return '';
  const meta = 解析智库软结构标签(entry);
  const parts = [
    compact(meta.性格锚点) ? `性格锚点：${compact(meta.性格锚点)}` : '',
    compact(meta.说话方式) ? `说话方式：${compact(meta.说话方式)}` : '',
    compact(meta.关系边界) ? `关系边界：${compact(meta.关系边界)}` : '',
    compact(meta.禁止误写) ? `禁止误写：${compact(meta.禁止误写)}` : '',
  ].filter(Boolean);
  return parts.length ? `${separator}${parts.join(separator)}` : '';
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

function isStrongInjectionMatch(entry: 智库条目, query: string, sceneHints: string[] = []): boolean {
  const q = query.trim().toLowerCase();
  const terms = q
    .split(/[\s,.;/]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && !ZHIKU_STOP_WORDS.has(item));
  const title = entry.标题.toLowerCase();
  const summary = entry.摘要.toLowerCase();
  const keywords = entry.关键词.map((k) => k.toLowerCase());
  const calibrationText = getZhikuCharacterCalibrationText(entry).toLowerCase();
  const exactHit =
    title.includes(q) ||
    summary.includes(q) ||
    keywords.some((k) => k.includes(q) || q.includes(k)) ||
    calibrationText.includes(q);
  if (exactHit) return true;

  let matched = 0;
  for (const term of terms) {
    if (
      title.includes(term) ||
      summary.includes(term) ||
      keywords.some((k) => k.includes(term) || term.includes(k)) ||
      calibrationText.includes(term)
    ) {
      matched += 1;
    }
  }
  if (matched >= 2) return true;
  return sceneHints.length > 0 && sceneMatchesEntry(entry, sceneHints);
}
