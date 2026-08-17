import type { 忆庭系统, 回忆条目 } from '@/models/yiting';
import type { API配置项, 记忆系统设置 } from '@/models/settings';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { YITING_RECALL_PROMPT as YITING_LEGACY_RECALL_PROMPT } from '@/prompts/cot/yitingCot';
import type { 提示词模块 } from '@/models/prompts';
import { buildIndependentPromptModulesSection } from '@/services/promptModuleScopes';

export interface 忆庭召回结果 {
  entries: 回忆条目[];
  strongEntries?: 回忆条目[];
  weakEntries?: 回忆条目[];
  injection: string;
  usedModel?: boolean;
  rawText?: string;
  previewText?: string;
}

interface 剧情回忆候选 {
  entry: 回忆条目;
  id: string;
  index: number;
  score: number;
  /** 对标参考项目：候选是否属于最近「完整原文条数N」——只有这些候选向检索模型展示完整原文，更早的只展示概括。 */
  是否完整原文: boolean;
}

export function retrieveYitingContext(
  system: 忆庭系统 | undefined,
  query: string,
  limit: number,
  npcNameMap?: Record<string, string>,
  categoryFilter?: '正文' | '通讯' | 'all',
): 忆庭召回结果 {
  if (!system?.回忆档案?.length || !query.trim()) {
    return { entries: [], injection: '' };
  }
  const candidates = buildRecallCandidates(system, query, 24, 6, categoryFilter);
  const fallback = buildLocalRecallFallback(candidates, limit);
  const entries = [...fallback.strongEntries, ...fallback.weakEntries];
  if (!entries.length) return { entries, strongEntries: [], weakEntries: [], injection: '', previewText: fallback.previewText };

  return {
    entries,
    strongEntries: fallback.strongEntries,
    weakEntries: fallback.weakEntries,
    injection: buildYitingInjection(fallback.strongEntries, fallback.weakEntries, npcNameMap),
    previewText: fallback.previewText,
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
  promptModules?: 提示词模块[],
  npcNameMap?: Record<string, string>,
  categoryFilter?: '正文' | '通讯' | 'all',
): Promise<忆庭召回结果> {
  if (!system?.回忆档案?.length || !query.trim()) {
    return { entries: [], injection: '', usedModel: false };
  }

  const fallback = retrieveYitingContext(system, query, limit, npcNameMap, categoryFilter);
  const api = resolveYitingRecallConfig(mainConfig, settings);
  if (!api.baseUrl || !api.apiKey || !api.model) {
    return fallback;
  }

  const candidates = buildRecallCandidates(
    system,
    query,
    24,
    6,
    categoryFilter,
    settings.剧情回忆完整原文条数N ?? 20,
  );
  if (!candidates.length) return fallback;

  // 对标参考项目「构建剧情回忆检索上下文」：候选池最近 N 条展示完整原文，更早的只展示概括；
  // 所有候选带「本地预筛：可能相关」标记。
  const candidateText = candidates
    .map((candidate, index) => {
      const entry = candidate.entry;
      const keywords = entry.检索关键词?.length ? `｜关键词：${entry.检索关键词.slice(0, 8).join('、')}` : '';
      const body = candidate.是否完整原文
        ? `原文：\n${entry.原文?.trim() || entry.摘要 || '（无原文）'}`
        : `短期记忆：\n${entry.摘要 || buildBriefFromRaw(entry.原文) || '（无概括）'}`;
      const localMarker = candidate.score > 0 ? `｜本地相关度：${candidate.score.toFixed(1)}` : '';
      return [
        `${index + 1}. ${entry.名称 || `第${entry.回合}回合回忆`}｜回合：${entry.回合}｜类型：${entry.类型 ?? '回忆'}${keywords}${localMarker}｜本地预筛：可能相关`,
        body,
      ].join('\n');
    })
    .join('\n\n');

  const systemPrompt = buildYitingRecallSystemPrompt(promptModules);

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
    if (!picked.strongEntries.length && !picked.weakEntries.length) {
      return {
        ...fallback,
        usedModel: true,
        rawText,
        previewText: `${picked.previewText}\n（模型未命中，已使用本地预筛回退）`,
      };
    }
    const entries = [...picked.strongEntries, ...picked.weakEntries];
    return {
      entries,
      strongEntries: picked.strongEntries,
      weakEntries: picked.weakEntries,
      injection: buildYitingInjection(picked.strongEntries, picked.weakEntries, npcNameMap),
      usedModel: true,
      rawText,
      previewText: picked.previewText,
    };
  } catch {
    return fallback;
  }
}

export function buildYitingRecallSystemPrompt(promptModules?: 提示词模块[]): string {
  const modulesSection = buildYitingRecallPromptModulesSection(promptModules);
  if (modulesSection) return modulesSection;
  return YITING_LEGACY_RECALL_PROMPT;
}

function buildYitingRecallPromptModulesSection(promptModules?: 提示词模块[]): string {
  if (!promptModules || promptModules.length === 0) return '';
  return buildIndependentPromptModulesSection(promptModules, 'yitingRecall');
}

function buildRecallSystemPrompt(customPrompt: string): string {
  const fallback = [
    '你是“剧情回忆检索器”。',
    '任务：根据玩家输入，在给定回忆库中向前检索最相关的回忆，区分强回忆与弱回忆。',
    '- 强回忆：与当前输入高度相关，且需要保留原文细节。',
    '- 弱回忆：存在关联，但用概括即可。',
    '- 必须优先选择时间最近且语义最相关的回忆。',
    '- 优先匹配：人物、地点、目标、未结事项、冲突对象、承诺、伤势、物品、判定结果。',
    '- 强回忆数量不设固定 1-2 条上限；只要多条回忆都直接影响当前输入的理解、承接、人物判断或结果处置，就应一并列入强回忆。',
    '- 不要为了精简而漏掉当前仍在生效的关键前因、承诺、旧伤、旧账、未结事项、上一轮明确结论或直接决定当前态度的互动证据。',
  ].join('\n');
  return customPrompt?.trim() || fallback;
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

function buildRecallCandidates(
  system: 忆庭系统,
  query: string,
  topK = 24,
  recentReserve = 6,
  categoryFilter?: '正文' | '通讯' | 'all',
  fullN = 20,
): 剧情回忆候选[] {
  const allEntries = [...(system.回忆档案 ?? [])];
  // 阶段1·分类过滤：支持按 '正文' | '通讯' | 'all' 过滤忆庭条目（默认全部，向前兼容）
  const filtered = categoryFilter && categoryFilter !== 'all'
    ? allEntries.filter((entry) => (entry.分类 ?? '正文') === categoryFilter)
    : allEntries;
  const entries = filtered.sort((a, b) => a.回合 - b.回合);
  const terms = extractRecallTerms(query);
  // 对标参考项目：候选池中最近 fullN 条带完整原文，更早的只有概括。
  const fullStartIndex = Math.max(0, entries.length - Math.max(1, Math.trunc(fullN) || 20));
  const scored = entries.map((entry, index) => ({
    entry,
    id: entry.名称 || `【回忆${String(Math.max(1, entry.回合 || index + 1)).padStart(3, '0')}】`,
    index,
    score: scoreRecallCandidate(entry, query, terms, index, entries.length),
    是否完整原文: index >= fullStartIndex,
  }));
  const topScored = [...scored]
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, Math.max(4, topK));
  const recentTail = scored.slice(-Math.max(2, recentReserve));
  return [...new Map([...topScored, ...recentTail].sort((a, b) => a.index - b.index).map((item) => [item.entry.id, item])).values()];
}

function parseRecallIndexes(raw: string, candidates: 剧情回忆候选[], limit: number): { strongEntries: 回忆条目[]; weakEntries: 回忆条目[]; previewText: string } {
  const strongIndexes: number[] = [];
  const weakIndexes: number[] = [];
  const text = (raw || '').trim();
  const pushIndex = (target: number[], index: number) => {
    if (Number.isInteger(index) && index >= 0 && index < candidates.length && !target.includes(index)) target.push(index);
  };
  const findCandidateIndexByRecallName = (name: string): number => {
    const normalizedName = normalizeRecallName(name);
    return candidates.findIndex((candidate) => {
      const candidateName = normalizeRecallName(candidate.entry.名称 || candidate.id);
      const roundName = normalizeRecallName(`【回忆${String(Math.max(1, candidate.entry.回合)).padStart(3, '0')}】`);
      return candidateName === normalizedName || roundName === normalizedName;
    });
  };
  for (const line of text.split(/\r?\n/)) {
    if (!/强回忆|弱回忆/i.test(line)) continue;
    const content = line.split(/[:：]/).slice(1).join(':').trim();
    if (!content || /无|none|null/i.test(content)) continue;
    const target = /强回忆/i.test(line) ? strongIndexes : weakIndexes;
    const recallNames = content.match(/【\s*回忆\s*\d+\s*】/g) ?? [];
    for (const recallName of recallNames) {
      const numberMatch = recallName.match(/\d+/);
      const asCandidateIndex = numberMatch ? Number(numberMatch[0]) - 1 : -1;
      const index = asCandidateIndex >= 0 && asCandidateIndex < candidates.length
        ? asCandidateIndex
        : findCandidateIndexByRecallName(recallName);
      pushIndex(target, index);
    }
    const contentWithoutRecallNames = content.replace(/【\s*回忆\s*\d+\s*】/g, ' ');
    const matches = contentWithoutRecallNames.match(/\d+/g) ?? [];
    for (const match of matches) {
      const index = Number(match) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= candidates.length) continue;
      pushIndex(target, index);
    }
  }
  const max = Math.max(1, limit || 8);
  const strongEntries = strongIndexes.slice(0, max).map((index) => candidates[index].entry);
  const weakEntries = weakIndexes.filter((index) => !strongIndexes.includes(index)).slice(0, max).map((index) => candidates[index].entry);
  return {
    strongEntries,
    weakEntries,
    previewText: buildRecallPreview(strongEntries, weakEntries),
  };
}

function normalizeRecallName(raw: string): string {
  const match = String(raw || '').match(/回忆\s*(\d+)/);
  if (!match) return String(raw || '').replace(/\s+/g, '').trim();
  return `回忆${String(Number(match[1])).padStart(3, '0')}`;
}

function buildYitingInjection(
  strongEntries: 回忆条目[],
  weakEntries: 回忆条目[],
  npcNameMap?: Record<string, string>,
): string {
  if (!strongEntries.length && !weakEntries.length) return '';

  // 对标既定方案：强回忆给原文、弱回忆给摘要，不做条数限制。
  // 阶段1方案E·第二层防护：来源标记
  // 分类='通讯'的条目，注入时标记【通讯回忆】(对方:NPC名字)
  // NPC名字优先从 npcNameMap 查找，找不到则用 id 兜底
  const resolveContactName = (entry: 回忆条目): string | null => {
    if (entry.分类 !== '通讯') return null;
    const contactId = entry.通讯元数据?.联系人;
    if (!contactId) return null;
    return npcNameMap?.[contactId] ?? contactId;
  };

  const buildBlock = (entry: 回忆条目, useOriginal: boolean): string => {
    const title = entry.名称 || `第 ${entry.回合} 回合回忆`;
    const contactName = resolveContactName(entry);
    const sourceTag = contactName ? `【通讯回忆】(对方:${contactName})` : '【正文回忆】';
    if (useOriginal) {
      // 注入原文层（完整原文，不截断）
      const original = entry.原文?.trim() || entry.摘要 || '（无原文）';
      return `${sourceTag} ${title}：\n${original}`;
    }
    // 注入摘要层
    return `${sourceTag} ${title}：\n${entry.摘要 || buildBriefFromRaw(entry.原文) || '（无概括）'}`;
  };

  const strongBlocks = strongEntries.map((entry) => buildBlock(entry, true));
  const weakBlocks = weakEntries.map((entry) => buildBlock(entry, false));

  return [
    '【剧情回忆】',
    '以下内容来自回忆档案，是根据玩家当前输入和近期剧情承接检索到的历史材料（强回忆原文注入 + 弱回忆摘要注入）。若与当前已发生剧情冲突，以当前剧情为准。',
    '',
    '强回忆：',
    strongBlocks.length ? strongBlocks.join('\n\n') : '无',
    '',
    '弱回忆：',
    weakBlocks.length ? weakBlocks.join('\n\n') : '无',
  ].join('\n');
}

function buildBriefFromRaw(raw: string, limit = 260): string {
  const cleaned = String(raw || '')
    .replace(/玩家输入：[\s\S]*?(?=\n正文：|\n回合小结：|\n动态世界：|\n后续选项：|$)/g, '')
    .replace(/正文：/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
}

function buildLocalRecallFallback(candidates: 剧情回忆候选[], limit: number): { strongEntries: 回忆条目[]; weakEntries: 回忆条目[]; previewText: string } {
  const sorted = [...candidates].sort((a, b) => b.score - a.score || b.index - a.index);
  const topScore = sorted[0]?.score || 0;
  const strong = sorted
    .filter((item, index) => {
      if (index === 0) return true;
      if (item.score <= 0) return false;
      if (index < 3 && item.score >= topScore * 0.6) return true;
      if (index < 6 && item.score >= topScore * 0.72) return true;
      return item.score >= Math.max(8, topScore * 0.82);
    })
    .slice(0, Math.max(1, limit || 8));
  const weak = sorted
    .filter((item) => !strong.some((s) => s.entry.id === item.entry.id))
    .slice(0, Math.max(1, limit || 8));
  const strongEntries = strong.map((item) => item.entry);
  const weakEntries = weak.map((item) => item.entry);
  return { strongEntries, weakEntries, previewText: buildRecallPreview(strongEntries, weakEntries) };
}

function buildRecallPreview(strongEntries: 回忆条目[], weakEntries: 回忆条目[]): string {
  const names = (entries: 回忆条目[]) => entries.map((entry) => entry.名称 || `【回忆${String(Math.max(1, entry.回合)).padStart(3, '0')}】`).join('|') || '无';
  return [`强回忆:${names(strongEntries)}`, `弱回忆:${names(weakEntries)}`].join('\n');
}

function extractRecallTerms(raw: string): string[] {
  const text = (raw || '').trim().toLowerCase();
  if (!text) return [];
  const terms = new Set<string>();
  (text.match(/[a-z0-9_]+/g) || []).forEach((item) => {
    if (item.length >= 2) terms.add(item);
  });
  (text.match(/[\u4e00-\u9fff]{2,}/g) || []).forEach((block) => {
    terms.add(block);
    if (block.length >= 3) {
      for (let i = 0; i < block.length - 1; i += 1) terms.add(block.slice(i, i + 2));
    }
    if (block.length >= 4) {
      for (let i = 0; i < block.length - 2; i += 1) terms.add(block.slice(i, i + 3));
    }
  });
  return [...terms].filter((item) => item.length >= 2);
}

function scoreRecallCandidate(entry: 回忆条目, query: string, terms: string[], index: number, total: number): number {
  const text = [
    entry.名称,
    entry.类型,
    entry.摘要,
    entry.原文,
    ...(entry.检索关键词 ?? []),
  ].filter(Boolean).join('\n').toLowerCase();
  let score = 0;
  const q = query.trim().toLowerCase();
  if (q && text.includes(q)) score += 12;
  for (const term of terms) {
    if (!term || !text.includes(term)) continue;
    score += term.length >= 4 ? 5 : term.length === 3 ? 3 : 1.5;
  }
  const recencyBoost = total > 0 ? ((index + 1) / total) * 3 : 0;
  return score + recencyBoost;
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
