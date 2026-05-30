import type { 智库系统, 智库条目 } from '@/models/zhiku';
import type { API配置项, 智库系统设置 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { ZHIKU_CATEGORY_LABELS, 搜索智库条目 } from '@/models/zhiku';
import type { 智库软结构标签 } from '@/models/zhiku';
import { 解析智库软结构标签, 获取智库人物名, 获取智库人物名列表, 比较智库人物节点 } from '@/models/zhiku';
import { ZHIKU_COT_PROMPT } from '@/prompts/cot/zhikuCot';


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
  候选资料: string[];
  角色相关资料: string[];
  强相关资料: string[];
  弱相关资料: string[];
  已注入资料: string[];
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
  npcNames?: string[];
}

const ZHIKU_SCENE_HINTS: Record<string, string[]> = {
  heita_station_incident: ['黑塔空间站', '黑塔', '空间站', '主控舱段', '基座舱段', '收容舱段', '支援舱段', '防卫科'],
  astral_express_temp_passenger: ['星穹列车', '列车', '无名客'],
  xianzhou_luofu_entry: ['仙舟', '罗浮', '长乐天', '金人巷', '工造司', '神策府', '鳞渊境', '流云渡'],
  jarilo_frontier: ['雅利洛', '贝洛伯格', '下层区', '上层区', '磐岩镇', '行政区', '残响回廊', '铆钉镇', '永冬岭', '机械聚落', '地火', '史瓦罗'],
};

const ZHIKU_STOP_WORDS = new Set([
  '我', '你', '他', '她', '它', '我们', '你们', '他们', '她们',
  '这个', '那个', '这些', '那些', '什么', '怎么', '如何', '可以', '能够', '会', '想', '要',
  '问题', '内容', '资料', '原著', '智库', '记忆', '剧情', '角色', '人物', '地点', '事件',
  '相关', '看看', '看看吧', '继续', '一下', '一下子', '这边', '那边', '这里', '那里',
  '当前', '现在', '本回合', '回合', '系统', '模块', '条目',
]);

const ZHIKU_SCENE_CHARACTER_HINTS: Record<string, string[]> = {
  heita_station_incident: ['三月七', '丹恒', '艾丝妲', '阿兰', '黑塔'],
  astral_express_temp_passenger: ['三月七', '丹恒', '姬子', '瓦尔特'],
  xianzhou_luofu_entry: ['三月七', '丹恒', '瓦尔特'],
  jarilo_frontier: ['三月七', '丹恒'],
};

function isMainStoryInjectableZhikuEntry(entry: 智库条目): boolean {
  return !getMainStoryBlockReason(entry);
}

function getMainStoryBlockReason(entry: 智库条目): string | null {
  if (!entry.可用于联动) return '该资料标记为不可联动。';
  if (entry.分类 === 'story') return '原著剧情正文由剧情编织管理，不走智库普通召回。';
  if (entry.可否主剧情注入 === false) return '该资料标记为不可主剧情注入。';
  if (entry.分类 !== 'character') return null;

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
  if (/重大/i.test(spoiler) && !/默认可用|已解锁|当前可用/i.test(unlock)) {
    return `剧透等级为「${spoiler}」，且当前未解锁。`;
  }

  return null;
}

function buildZhikuSceneHints(sceneContext?: 智库场景上下文): string[] {
  if (!sceneContext) return [];
  const hints = new Set<string>();
  const raw = [sceneContext.startSceneName, sceneContext.currentLocation]
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
  if (/列车|星穹/.test(raw)) addHints(ZHIKU_SCENE_HINTS.astral_express_temp_passenger);

  return Array.from(hints).slice(0, 16);
}

function augmentZhikuQuery(query: string, sceneHints: string[]): string {
  const parts = [query.trim(), ...sceneHints.slice(0, 8)];
  return parts.filter(Boolean).join(' ').trim();
}

function sceneMatchesEntry(entry: 智库条目, sceneHints: string[]): boolean {
  if (!sceneHints.length) return false;
  const text = [entry.标题, entry.摘要, entry.来源 ?? '', entry.原文, ...entry.关键词, getZhikuPerformanceText(entry)]
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
  const allCharacterNames = Array.from(
    new Set(
      (system.条目 ?? [])
        .filter((entry) => entry.分类 === 'character')
        .flatMap((entry) => 获取智库人物名列表(entry))
        .filter(Boolean),
    ),
  ).sort((a, b) => b.length - a.length);
  if (!allCharacterNames.length) return [];

  const explicitNames = new Set<string>();
  const joinedText = [
    query,
    sceneContext?.currentLocation ?? '',
    sceneContext?.startSceneName ?? '',
    ...(sceneContext?.npcNames ?? []),
  ].filter(Boolean).join(' ');
  for (const name of allCharacterNames) {
    if (sceneContext?.npcNames?.some((npcName) => namesLikelySame(npcName, name)) || nameAppearsInText(name, joinedText)) {
      explicitNames.add(name);
    }
  }
  if (explicitNames.size > 0) return Array.from(explicitNames);

  const sceneDefaults = sceneContext?.startScenarioId ? ZHIKU_SCENE_CHARACTER_HINTS[sceneContext.startScenarioId] : undefined;
  if (!sceneDefaults?.length) return [];
  return sceneDefaults.filter((name) => allCharacterNames.some((candidate) => namesLikelySame(candidate, name)));
}

function namesLikelySame(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();
  return !!left && !!right && (left === right || left.includes(right) || right.includes(left));
}

function nameAppearsInText(name: string, text: string): boolean {
  const cleanName = name.trim();
  if (!cleanName || !text.trim()) return false;
  if (cleanName.length <= 1) {
    const escaped = cleanName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[\\s，。！？、：；“”"'（）()《》【】])${escaped}($|[\\s，。！？、：；“”"'（）()《》【】])`).test(text);
  }
  return text.includes(cleanName);
}

function buildCharacterAnchorEntries(system: 智库系统, query: string, limit: number, sceneContext?: 智库场景上下文): 智库条目[] {
  const relevantNames = buildRelevantCharacterNames(system, query, sceneContext);
  if (!relevantNames.length) return [];

  const anchorLimit = Math.min(Math.max(2, Math.ceil(limit / 2)), 4);
  const entriesByName = new Map<string, 智库条目[]>();
  for (const entry of system.条目 ?? []) {
    if (entry.分类 !== 'character' || !isMainStoryInjectableZhikuEntry(entry)) continue;
    const characterNames = 获取智库人物名列表(entry);
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
      .slice(0, 2);
    for (const entry of pickedForRole) {
      if (!anchors.some((item) => item.id === entry.id)) anchors.push(entry);
      if (anchors.length >= anchorLimit) return anchors;
    }
  }
  return anchors;
}

function isCharacterAnchorNode(entry: 智库条目): boolean {
  const meta = 解析智库软结构标签(entry);
  const type = [meta.资料类型, meta.节点].filter(Boolean).join(' ');
  return /主体|OOC|风险|基础|能力|职责|分工/i.test(type) || !type;
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

export function retrieveZhikuContext(system: 智库系统 | undefined, query: string, limit: number, sceneContext?: 智库场景上下文): 智库检索结果 {
  if (!system?.条目?.length || !query.trim()) {
    return { entries: [], injection: '', diagnostics: buildEmptyZhikuDiagnostics() };
  }
  const sceneHints = buildZhikuSceneHints(sceneContext);
  const relevantNames = buildRelevantCharacterNames(system, query, sceneContext);
  const searchQuery = augmentZhikuQuery(query, sceneHints);
  const characterAnchors = buildCharacterAnchorEntries(system, query, limit, sceneContext);
  const rankedEntries = 搜索智库条目(system, searchQuery, Math.max(limit * 3, limit))
    .filter(isMainStoryInjectableZhikuEntry);
  const normalRankedEntries = rankedEntries.filter(isNormalRecallEntry);
  const primaryEntries = rankZhikuEntries(
    normalRankedEntries.filter((entry) => isStrongInjectionMatch(entry, query, sceneHints)),
    sceneHints,
  ).slice(0, limit);
  const weakSource = rankZhikuEntries(
    normalRankedEntries.filter((entry) => !primaryEntries.some((item) => item.id === entry.id) && (sceneMatchesEntry(entry, sceneHints) || primaryEntries.length === 0)),
    sceneHints,
  );
  const groups: 智库召回分组 = {
    characterEntries: characterAnchors,
    strongEntries: primaryEntries,
    weakEntries: weakSource.slice(0, Math.max(0, limit - primaryEntries.length)),
  };
  const selectedEntries = mergeZhikuGroups(groups);
  const diagnostics = buildZhikuDiagnostics({
    system,
    query: searchQuery,
    sceneHints,
    relevantNames,
    characterAnchors,
    candidates: rankedEntries,
    groups,
    limit,
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
): Promise<智库检索结果> {
  if (!system?.条目?.length || !query.trim()) {
    return { entries: [], injection: '', usedModel: false };
  }

  const fallback = retrieveZhikuContext(system, query, limit, sceneContext);
  const api = resolveZhikuRecallConfig(mainConfig, settings);
  if (!api.baseUrl || !api.apiKey || !api.model) {
    return fallback;
  }

  const candidates = buildRecallCandidates(system, query, Math.max(limit * 3, 18), sceneContext);
  if (!candidates.length) return fallback;

  const sceneHints = buildZhikuSceneHints(sceneContext);
  const candidateText = candidates
    .map((entry, index) => {
      const keywords = entry.关键词.length ? `｜关键词：${entry.关键词.slice(0, 8).join('、')}` : '';
      const source = entry.来源 ? `｜来源：${entry.来源}` : '';
      const meta = formatZhikuSoftMeta(entry, '｜');
      const performance = formatZhikuPerformanceBrief(entry, '｜');
      const summary = entry.摘要 || entry.原文.slice(0, 220) || '无摘要';
      return [
        `${index + 1}. ${entry.标题}`,
        `类别：${ZHIKU_CATEGORY_LABELS[entry.分类]}｜重要度：${entry.重要度}${source}${keywords}${meta}`,
        `摘要：${summary}${performance}`,
      ].join('\n');
    })
    .join('\n\n');

  const systemPrompt = [
    '你是原著资料中枢「智库」的召回模型。你的任务不是写正文，而是从候选资料中挑出最相关条目，供后续注入主剧情。',
    '',
    '## 智库思维链（内部执行，不要输出）',
    ZHIKU_COT_PROMPT,
    '',
    sceneHints.length ? `当前开局锚点：${sceneHints.slice(0, 8).join('、')}` : '当前开局锚点：无',
    '若开局地点、当前地点或场景明显指向某一条故事线，请优先选择同区域资料，不要让空间站等通用背景抢走召回权。',
    '',
    '规则：',
    '- 只返回候选列表中的编号，不要编造新条目。',
    '- 优先选择与当前输入直接相关、能影响剧情理解或设定判断的条目。',
    '- 角色相关资料只挑 character / 人物表现 / 主体人格 / OOC风险 / 角色边界类条目，用于校准口吻、行为和人设稳定性。',
    '- 强相关资料、弱相关资料只挑非角色类设定资料，例如地点、组织、物品、概念、敌人、机制等；不要把 character 条目放进强/弱相关。',
    '- 如果候选中有在场角色的“角色主体 / 主体人格 / OOC风险”，它们优先放入角色相关资料，且不占用强/弱相关资料名额。',
    '- 形态、命途、阶段资料不得覆盖主体人格；未解锁、只读或非主剧情范围的人物资料不得当作当前事实。',
    '- 原著剧情正文不参与智库普通召回；剧情推进由剧情编织系统管理，避免已完成剧情重复注入。',
    '- 如果有连续事件链、人物关系链、地点链、物品链，优先保留承接最强的条目。',
    '- 强相关资料可多于 1 条，但不要为了凑数选择弱相关。若完全无关，对应分类写无。',
    '- 返回时按相关性从高到低排序。',
    '',
    '输出格式必须严格为三行：',
    '角色相关资料：【编号】|【编号】',
    '强相关资料：【编号】|【编号】',
    '弱相关资料：【编号】|【编号】',
    '若某类为空，写“无”。',
    '',
    '额外说明：',
    '- 你看到的候选已经是本回合初筛结果，请专注于最终筛选，而不是二次扩写摘要。',
  ].join('\n');

  const userPrompt = [
    `玩家当前输入：${query.trim()}`,
    `召回条数上限：${limit}`,
    '',
    '候选资料：',
    candidateText,
  ].join('\n');

  try {
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
    const pickedGroups = parseZhikuIndexes(rawText, candidates, limit, fallback.characterEntries ?? []);
    const picked = mergeZhikuGroups(pickedGroups);
    if (!picked.length) {
      return { entries: [], injection: '', usedModel: true, rawText, diagnostics: fallback.diagnostics };
    }
    return {
      entries: picked,
      characterEntries: pickedGroups.characterEntries,
      strongEntries: pickedGroups.strongEntries,
      weakEntries: pickedGroups.weakEntries,
      injection: buildZhikuInjection(pickedGroups, sceneHints),
      usedModel: true,
      rawText,
      diagnostics: {
        ...(fallback.diagnostics ?? buildEmptyZhikuDiagnostics()),
        角色相关资料: pickedGroups.characterEntries.map((entry) => entry.标题),
        强相关资料: pickedGroups.strongEntries.map((entry) => entry.标题).slice(0, limit),
        弱相关资料: pickedGroups.weakEntries.map((entry) => entry.标题).slice(0, limit),
        已注入资料: picked.map((entry) => entry.标题),
      },
    };
  } catch {
    return fallback;
  }
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

function buildRecallCandidates(system: 智库系统, query: string, limit: number, sceneContext?: 智库场景上下文): 智库条目[] {
  const sceneHints = buildZhikuSceneHints(sceneContext);
  const characterAnchors = buildCharacterAnchorEntries(system, query, limit, sceneContext);
  const scored = 搜索智库条目(system, augmentZhikuQuery(query, sceneHints), limit)
    .filter(isMainStoryInjectableZhikuEntry)
    .filter((entry) => entry.分类 !== 'story');
  const recent = [...(system.条目 ?? [])]
    .filter(isMainStoryInjectableZhikuEntry)
    .filter((entry) => entry.分类 !== 'story')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.min(10, limit));
  const normalCandidates = mergeZhikuEntries(
    rankZhikuEntries(scored.filter((entry) => entry.分类 !== 'character'), sceneHints),
    rankZhikuEntries(recent.filter((entry) => entry.分类 !== 'character'), sceneHints),
  ).slice(0, limit);
  return mergeZhikuEntries(characterAnchors, normalCandidates).slice(0, limit + characterAnchors.length);
}

function buildZhikuDiagnostics(input: {
  system: 智库系统;
  query: string;
  sceneHints: string[];
  relevantNames: string[];
  characterAnchors: 智库条目[];
  candidates: 智库条目[];
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
    blocked.length
      ? `门禁过滤 ${blocked.length} 条候选资料。`
      : '本次候选没有被主剧情门禁过滤的高风险资料。',
  ];
  return {
    场景锚点: input.sceneHints.slice(0, 12),
    相关角色: input.relevantNames.slice(0, 12),
    人物锚点: input.characterAnchors.map((entry) => entry.标题).slice(0, 8),
    候选资料: input.candidates.map((entry) => entry.标题).slice(0, Math.max(input.limit, 8)),
    角色相关资料: input.groups.characterEntries.map((entry) => entry.标题),
    强相关资料: input.groups.strongEntries.map((entry) => entry.标题).slice(0, input.limit),
    弱相关资料: input.groups.weakEntries.map((entry) => entry.标题).slice(0, input.limit),
    已注入资料: mergeZhikuGroups(input.groups).map((entry) => entry.标题),
    被门禁过滤: blocked,
    检查项: checks,
  };
}

function buildEmptyZhikuDiagnostics(): 智库召回诊断 {
  return {
    场景锚点: [],
    相关角色: [],
    人物锚点: [],
    候选资料: [],
    角色相关资料: [],
    强相关资料: [],
    弱相关资料: [],
    已注入资料: [],
    被门禁过滤: [],
    检查项: ['智库未启用、无资料或本回合没有可检索输入。'],
  };
}
function parseZhikuIndexes(
  raw: string,
  candidates: 智库条目[],
  limit: number,
  fallbackCharacterEntries: 智库条目[] = [],
): 智库召回分组 {
  const character: number[] = [];
  const strong: number[] = [];
  const weak: number[] = [];
  const text = (raw || '').trim();
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
      if (isCharacter && entry.分类 === 'character' && !character.includes(index)) character.push(index);
      if (isStrong && isNormalRecallEntry(entry) && !strong.includes(index)) strong.push(index);
      if (isWeak && isNormalRecallEntry(entry) && !weak.includes(index) && !strong.includes(index)) weak.push(index);
    }
  }
  const characterEntries = mergeZhikuEntries(character.map((index) => candidates[index]), fallbackCharacterEntries);
  return {
    characterEntries,
    strongEntries: strong.map((index) => candidates[index]).slice(0, limit),
    weakEntries: weak.map((index) => candidates[index]).slice(0, limit),
  };
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
    sceneHints.length ? `当前开局锚点：${sceneHints.slice(0, 8).join('、')}` : '当前开局锚点：无',
    '',
    ...formatGroup('角色相关资料', groups.characterEntries),
    '',
    ...formatGroup('强相关资料', groups.strongEntries),
    '',
    ...formatGroup('弱相关资料', groups.weakEntries),
  ].filter((line, index, lines) => line.trim() || lines[index - 1]?.trim()).join('\n').trim();
}

function formatZhikuInjectionEntry(entry: 智库条目, index: number): string {
    const title = entry.标题 || `第 ${index + 1} 条资料`;
    const summary = entry.摘要 || entry.原文.slice(0, 220) || '无摘要';
    const keywords = entry.关键词.length ? `；关键词：${entry.关键词.slice(0, 8).join('、')}` : '';
    const source = entry.来源 ? `；来源：${entry.来源}` : '';
    const meta = formatZhikuSoftMeta(entry);
    return `${index + 1}. 【${ZHIKU_CATEGORY_LABELS[entry.分类]}】${title}：${summary}${meta}${keywords}${source}`;
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

function formatZhikuPerformanceBrief(entry: 智库条目, separator = '；'): string {
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

function getZhikuPerformanceText(entry: 智库条目): string {
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
  const performance = getZhikuPerformanceText(entry).toLowerCase();
  const exactHit =
    title.includes(q) ||
    summary.includes(q) ||
    keywords.some((k) => k.includes(q) || q.includes(k)) ||
    performance.includes(q);
  if (exactHit) return true;

  let matched = 0;
  for (const term of terms) {
    if (
      title.includes(term) ||
      summary.includes(term) ||
      keywords.some((k) => k.includes(term) || term.includes(k)) ||
      performance.includes(term)
    ) {
      matched += 1;
    }
  }
  if (matched >= 2) return true;
  return sceneHints.length > 0 && sceneMatchesEntry(entry, sceneHints);
}



