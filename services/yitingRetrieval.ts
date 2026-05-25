import type { 忆庭系统, 回忆条目 } from '@/models/yiting';
import type { API配置项, 记忆系统设置 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';

export interface 忆庭召回结果 {
  entries: 回忆条目[];
  injection: string;
  usedModel?: boolean;
  rawText?: string;
}

export function retrieveYitingContext(
  system: 忆庭系统 | undefined,
  query: string,
  limit: number,
): 忆庭召回结果 {
  if (!system?.回忆档案?.length || !query.trim()) {
    return { entries: [], injection: '' };
  }
  const entries = 搜索回忆档案(system, query, limit);
  if (!entries.length) {
    return { entries, injection: '' };
  }

  return {
    entries,
    injection: buildYitingInjection(entries),
  };
}

export async function retrieveYitingContextWithModel(
  system: 忆庭系统 | undefined,
  query: string,
  limit: number,
  settings: 记忆系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
  retryCount = 2,
): Promise<忆庭召回结果> {
  if (!system?.回忆档案?.length || !query.trim()) {
    return { entries: [], injection: '', usedModel: false };
  }

  const fallback = retrieveYitingContext(system, query, limit);
  const api = resolveYitingRecallConfig(mainConfig, settings);
  if (!api.baseUrl || !api.apiKey || !api.model) {
    return fallback;
  }

  const candidates = buildRecallCandidates(system, query, Math.max(limit * 3, 18));
  if (!candidates.length) return fallback;

  const candidateText = candidates
    .map((entry, index) => {
      const keywords = entry.检索关键词?.length ? `｜关键词：${entry.检索关键词.slice(0, 8).join('、')}` : '';
      return [
        `${index + 1}. ${entry.名称 || `第${entry.回合}回合回忆`}｜回合：${entry.回合}｜类型：${entry.类型 ?? '回忆'}${keywords}`,
        `摘要：${entry.摘要 || '无概要'}`,
      ].join('\n');
    })
    .join('\n\n');

  const systemPrompt = [
    settings.忆庭召回提示词,
    '',
    '额外约束：',
    '- 候选回忆已经用数字编号。你只能返回这些数字编号，不要返回标题、摘要或解释。',
    '- 强回忆和弱回忆合计不要超过召回条数上限；宁缺毋滥。',
    '- 若候选中没有真正相关内容，强回忆和弱回忆都写“无”。',
  ].join('\n');

  const userPrompt = [
    `玩家当前输入：${query.trim()}`,
    `召回条数上限：${limit}`,
    '',
    '候选回忆：',
    candidateText,
  ].join('\n');

  try {
    const rawText = await withRetries(
      () =>
        chatCompletionNonStream(api, {
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt,
          signal,
          maxTokens: api.maxTokens ?? 512,
          temperature: api.temperature ?? 0.15,
        }),
      { retries: retryCount, signal, label: '忆庭召回' },
    );
    const picked = parseRecallIndexes(rawText, candidates, limit);
    if (!picked.length) {
      return { entries: [], injection: '', usedModel: true, rawText };
    }
    return {
      entries: picked,
      injection: buildYitingInjection(picked),
      usedModel: true,
      rawText,
    };
  } catch {
    return fallback;
  }
}

function resolveYitingRecallConfig(mainConfig: API配置项, settings: 记忆系统设置): API配置项 {
  const override = settings.忆庭召回API;
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

function buildRecallCandidates(system: 忆庭系统, query: string, limit: number): 回忆条目[] {
  const scored = 搜索回忆档案(system, query, limit);
  const recent = [...(system.回忆档案 ?? [])]
    .sort((a, b) => b.回合 - a.回合)
    .slice(0, Math.min(8, limit));
  const merged: 回忆条目[] = [];
  for (const entry of [...scored, ...recent]) {
    if (!merged.some((item) => item.id === entry.id)) merged.push(entry);
  }
  return merged.slice(0, limit);
}

function parseRecallIndexes(raw: string, candidates: 回忆条目[], limit: number): 回忆条目[] {
  const indexes: number[] = [];
  const text = (raw || '').trim();
  for (const line of text.split(/\r?\n/)) {
    if (!/强回忆|弱回忆/i.test(line)) continue;
    const content = line.split(/[:：]/).slice(1).join(':').trim();
    if (!content || /无|none|null/i.test(content)) continue;
    const matches = content.match(/\d+/g) ?? [];
    for (const match of matches) {
      const index = Number(match) - 1;
      if (Number.isInteger(index) && index >= 0 && index < candidates.length && !indexes.includes(index)) {
        indexes.push(index);
      }
    }
  }
  return indexes.slice(0, limit).map((index) => candidates[index]);
}

function buildYitingInjection(entries: 回忆条目[]): string {
  if (!entries.length) return '';
  const lines = entries.map((entry, index) => {
    const title = entry.名称 || `第 ${entry.回合} 回合回忆`;
    const summary = entry.摘要 || '无概要';
    return `${index + 1}. ${title}｜${summary}`;
  });
  return [
    '# 忆庭召回',
    '',
    '以下内容来自忆庭回忆档案，是根据玩家当前输入召回的历史摘要。它们用于承接旧事、承诺、伤势、物品、人物态度与未结事项；若与当前已发生剧情冲突，以当前剧情为准。',
    '',
    ...lines,
  ].join('\n');
}

export function 搜索回忆档案(system: 忆庭系统, query: string, limit = 8): 回忆条目[] {
  const q = query.trim().toLowerCase();
  const entries = system.回忆档案 ?? [];
  if (!q) {
    return [...entries]
      .sort((a, b) => b.回合 - a.回合)
      .slice(0, limit);
  }

  const terms = q
    .split(/[\s,，。；;、]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return entries
    .map((entry) => ({ entry, score: scoreMemory(entry, q, terms) }))
    .filter((hit) => hit.score >= 18)
    .sort((a, b) => b.score - a.score || b.entry.回合 - a.entry.回合)
    .slice(0, limit)
    .map((hit) => hit.entry);
}

function scoreMemory(entry: 回忆条目, query: string, terms: string[]): number {
  const title = (entry.名称 ?? '').toLowerCase();
  const type = (entry.类型 ?? '').toLowerCase();
  const summary = (entry.摘要 ?? '').toLowerCase();
  const raw = (entry.原文 ?? '').toLowerCase();
  const keywords = (entry.检索关键词 ?? []).map((k) => k.toLowerCase());
  let score = 0;

  if (title.includes(query)) score += 80;
  if (keywords.some((k) => k.includes(query) || query.includes(k))) score += 55;
  if (summary.includes(query)) score += 36;
  if (raw.includes(query)) score += 2;
  if (type.includes(query)) score += 8;

  for (const term of terms) {
    if (title.includes(term)) score += 24;
    if (keywords.some((k) => k.includes(term) || term.includes(k))) score += 20;
    if (summary.includes(term)) score += 12;
    if (raw.includes(term)) score += 1;
  }

  return score + Math.max(0, entry.回合) * 0.001;
}
