import type { 智库系统, 智库条目 } from '@/models/zhiku';
import type { API配置项, 智库系统设置 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { ZHIKU_CATEGORY_LABELS, 搜索智库条目 } from '@/models/zhiku';

export interface 智库检索结果 {
  entries: 智库条目[];
  injection: string;
  usedModel?: boolean;
  rawText?: string;
}

interface 智库场景上下文 {
  startScenarioId?: string;
  startSceneName?: string;
  currentLocation?: string;
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

function isMainStoryInjectableZhikuEntry(entry: 智库条目): boolean {
  if (!entry.可用于联动) return false;
  return entry.分类 !== 'story';
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
  const text = [entry.标题, entry.摘要, entry.来源 ?? '', entry.原文, ...entry.关键词]
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

export function retrieveZhikuContext(system: 智库系统 | undefined, query: string, limit: number, sceneContext?: 智库场景上下文): 智库检索结果 {
  if (!system?.条目?.length || !query.trim()) {
    return { entries: [], injection: '' };
  }
  const sceneHints = buildZhikuSceneHints(sceneContext);
  const searchQuery = augmentZhikuQuery(query, sceneHints);
  const rankedEntries = 搜索智库条目(system, searchQuery, Math.max(limit * 3, limit))
    .filter(isMainStoryInjectableZhikuEntry);
  const primaryEntries = rankZhikuEntries(
    rankedEntries.filter((entry) => isStrongInjectionMatch(entry, query, sceneHints)),
    sceneHints,
  );
  const selectedEntries = primaryEntries.length
    ? primaryEntries
    : rankZhikuEntries(
        rankedEntries.filter((entry) => sceneMatchesEntry(entry, sceneHints)),
        sceneHints,
      );
  if (!selectedEntries.length) {
    return { entries: [], injection: '' };
  }
  const lines = selectedEntries.slice(0, limit).map((entry, index) => {
    const body = entry.摘要 || entry.原文.slice(0, 220) || '无摘要';
    const keywords = entry.关键词.length ? `；关键词：${entry.关键词.slice(0, 8).join('、')}` : '';
    const source = entry.来源 ? `；来源：${entry.来源}` : '';
    return `${index + 1}. 【${ZHIKU_CATEGORY_LABELS[entry.分类]}】${entry.标题}：${body}${keywords}${source}`;
  });
  return {
    entries: selectedEntries.slice(0, limit),
    injection: [
      '# 智库检索结果',
      '',
    '以下是按玩家当前输入从原著资料库中检索到的相关摘要。它们用于提供设定依据、人物、地点、道具与概念参考，不直接注入原著剧情正文；若资料与当前 IF 线冲突，以玩家已发生剧情为准。',
      sceneHints.length ? `当前开局锚点：${sceneHints.slice(0, 8).join('、')}` : '当前开局锚点：无',
      '',
      ...lines,
    ].join('\n'),
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
      const summary = entry.摘要 || entry.原文.slice(0, 220) || '无摘要';
      return [
        `${index + 1}. ${entry.标题}`,
        `类别：${ZHIKU_CATEGORY_LABELS[entry.分类]}｜重要度：${entry.重要度}${source}${keywords}`,
        `摘要：${summary}`,
      ].join('\n');
    })
    .join('\n\n');

  const systemPrompt = [
    '你是原著资料中枢「智库」的召回模型。你的任务不是写正文，而是从候选资料中挑出最相关条目，供后续注入主剧情。',
    '',
    sceneHints.length ? `当前开局锚点：${sceneHints.slice(0, 8).join('、')}` : '当前开局锚点：无',
    '若开局地点、当前地点或场景明显指向某一条故事线，请优先选择同区域资料，不要让空间站等通用背景抢走召回权。',
    '',
    '规则：',
    '- 只返回候选列表中的编号，不要编造新条目。',
    '- 优先选择与当前输入直接相关、能影响剧情理解或设定判断的条目。',
    '- 原著剧情正文不参与智库普通召回；剧情推进由剧情编织系统管理，避免已完成剧情重复注入。',
    '- 如果有连续事件链、人物关系链、地点链、物品链，优先保留承接最强的条目。',
    '- 强相关资料可多于 1 条，但不要为了凑数选择弱相关。若完全无关，强相关资料与弱相关资料都写无。',
    '- 返回时按相关性从高到低排序。',
    '',
    '输出格式必须严格为两行：',
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
    const picked = parseZhikuIndexes(rawText, candidates, limit);
    if (!picked.length) {
      return { entries: [], injection: '', usedModel: true, rawText };
    }
    return {
      entries: picked,
      injection: buildZhikuInjection(picked),
      usedModel: true,
      rawText,
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
  const scored = 搜索智库条目(system, augmentZhikuQuery(query, sceneHints), limit)
    .filter(isMainStoryInjectableZhikuEntry);
  const recent = [...(system.条目 ?? [])]
    .filter(isMainStoryInjectableZhikuEntry)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, Math.min(10, limit));
  const merged: 智库条目[] = [];
  for (const entry of [...rankZhikuEntries(scored, sceneHints), ...rankZhikuEntries(recent, sceneHints)]) {
    if (!merged.some((item) => item.id === entry.id) && isMainStoryInjectableZhikuEntry(entry)) {
      merged.push(entry);
    }
  }
  return merged.slice(0, limit);
}
function parseZhikuIndexes(raw: string, candidates: 智库条目[], limit: number): 智库条目[] {
  const strong: number[] = [];
  const weak: number[] = [];
  const text = (raw || '').trim();
  for (const line of text.split(/\r?\n/)) {
    const isStrong = /强相关资料|强回忆/i.test(line);
    const isWeak = /弱相关资料|弱回忆/i.test(line);
    if (!isStrong && !isWeak) continue;
    const content = line.split(/[:：]/).slice(1).join(':').trim();
    if (!content || /无|none|null/i.test(content)) continue;
    const matches = content.match(/\d+/g) ?? [];
    for (const match of matches) {
      const index = Number(match) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= candidates.length) continue;
      if (isStrong && !strong.includes(index)) strong.push(index);
      if (isWeak && !weak.includes(index)) weak.push(index);
    }
  }
  const ordered = [...strong, ...weak].slice(0, limit);
  return ordered.map((index) => candidates[index]);
}

function buildZhikuInjection(entries: 智库条目[]): string {
  if (!entries.length) return '';
  const lines = entries.map((entry, index) => {
    const title = entry.标题 || `第 ${index + 1} 条资料`;
    const summary = entry.摘要 || entry.原文.slice(0, 220) || '无摘要';
    const keywords = entry.关键词.length ? `；关键词：${entry.关键词.slice(0, 8).join('、')}` : '';
    const source = entry.来源 ? `；来源：${entry.来源}` : '';
    return `${index + 1}. 【${ZHIKU_CATEGORY_LABELS[entry.分类]}】${title}：${summary}${keywords}${source}`;
  });
  return [
    '# 智库检索结果',
    '',
    '以下内容来自原著资料中枢的检索结果。它们用于提供设定依据、人物线索、地点、道具与概念参考，不直接注入原著剧情正文；若与当前已发生剧情冲突，以当前剧情为准。',
    '',
    ...lines,
  ].join('\n');
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
  const exactHit =
    title.includes(q) ||
    summary.includes(q) ||
    keywords.some((k) => k.includes(q) || q.includes(k));
  if (exactHit) return true;

  let matched = 0;
  for (const term of terms) {
    if (
      title.includes(term) ||
      summary.includes(term) ||
      keywords.some((k) => k.includes(term) || term.includes(k))
    ) {
      matched += 1;
    }
  }
  if (matched >= 2) return true;
  return sceneHints.length > 0 && sceneMatchesEntry(entry, sceneHints);
}



