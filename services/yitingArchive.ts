import type { API配置项, 忆庭API覆盖, 记忆系统设置 } from '@/models/settings';
import type { 回忆条目 } from '@/models/yiting';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';

export interface YitingArchiveSource {
  turn: number;
  userInput: string;
  body: string;
  memory?: string;
  worldEvents?: string[];
  actionOptions?: string[];
  gameTime?: string;
  location?: string;
}

export interface YitingArchiveResult {
  entry: 回忆条目;
  usedFallback: boolean;
}

export function resolveYitingArchiveConfig(
  mainConfig: API配置项,
  override: 忆庭API覆盖,
): API配置项 {
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

export async function buildYitingArchiveEntry(
  source: YitingArchiveSource,
  settings: 记忆系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
  retryCount = 2,
): Promise<YitingArchiveResult> {
  const inputText = [
    `回合：${source.turn}`,
    `时间：${source.gameTime || '未知'}`,
    `地点：${source.location || '未知'}`,
    `玩家输入：${source.userInput.trim() || '（空）'}`,
    `正文：${source.body.trim() || '（空）'}`,
    source.memory?.trim() ? `正文小结：${source.memory.trim()}` : '',
    source.worldEvents?.length ? `动态世界：${source.worldEvents.join(' / ')}` : '',
    source.actionOptions?.length ? `行动选项：${source.actionOptions.join(' / ')}` : '',
  ].filter(Boolean).join('\n');

  const fallback = createFallbackArchiveEntry(source);
  if (!settings.忆庭独立精炼) {
    return { entry: fallback, usedFallback: true };
  }

  const api = resolveYitingArchiveConfig(mainConfig, settings.忆庭精炼API);
  if (!api.baseUrl || !api.apiKey || !api.model) {
    return { entry: fallback, usedFallback: true };
  }

  const systemPrompt = [
    settings.忆庭精炼提示词,
    '',
    '额外要求：',
    '- 你只是在压缩当前回合，不要抄写正文，不要把原文大段复制回来。',
    '- SUMMARY 必须使用规整格式：第一行“时间：...”，第二行“地点：...”，空一行后写“概要：”，下面 3-6 条客观索引句，每条以“- ”开头。',
    '- 每条概要 60-120 字，且每条都要包含人物/地点/行动/结果/未结事项中的至少三项。',
    '- SUMMARY 不是正文截断，也不是氛围复述；它要像检索条目一样清楚可查，优先保留关键事实、关系变化、承诺、冲突与后果。',
    '- BODY 是备用详细纪要，不是原文层；系统会自行保存真实原文。BODY 只允许补充已发生事实，不得新增事件。',
  ].join('\n');

  const userPrompt = [
    '请将以下回合材料精炼为回忆档案：',
    inputText,
  ].join('\n\n');

  try {
    const raw = await withRetries(
      () =>
        chatCompletionNonStream(api, {
          messages: [{ role: 'user', content: userPrompt }],
          systemPrompt,
          signal,
          maxTokens: api.maxTokens ?? 1024,
          temperature: api.temperature ?? 0.2,
        }),
      { retries: retryCount, signal, label: '忆庭纪要精炼' },
    );
    const parsed = parseArchiveSections(raw);
    const summary = buildFinalSummary(parsed.summary, parsed.body, fallback.摘要, source.gameTime, source.location);
    return {
      entry: {
        ...fallback,
        摘要: summary,
        // 原文层必须保留真实回合材料。AI 返回的 BODY 是详细纪要，不是原文，不能覆盖这里。
        原文: fallback.原文,
        检索关键词: mergeKeywords(fallback.检索关键词 ?? [], buildKeywordsFromText(summary, fallback.原文)),
      },
      usedFallback: false,
    };
  } catch {
    return { entry: fallback, usedFallback: true };
  }
}

function createFallbackArchiveEntry(source: YitingArchiveSource): 回忆条目 {
  const summary = buildFallbackSummary(source);
  return {
    id: `recall_turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    名称: `【回合纪要 ${String(Math.max(1, source.turn)).padStart(3, '0')}】`,
    类型: '精炼纪要',
    摘要: summary,
    原文: [
      `玩家输入：${source.userInput.trim() || '（空）'}`,
      `正文：${source.body.trim() || '（空）'}`,
      source.memory?.trim() ? `回合小结：${source.memory.trim()}` : '',
      source.worldEvents?.length ? `动态世界：${source.worldEvents.join(' / ')}` : '',
      source.actionOptions?.length ? `行动选项：${source.actionOptions.join(' / ')}` : '',
    ].filter(Boolean).join('\n'),
    检索关键词: buildKeywordsFromText(source.userInput, summary, source.body),
    来源回合: [source.turn],
    回合: source.turn,
    时间戳: new Date().toISOString(),
  };
}

function normalizeMainStorySummary(memory?: string): string {
  const cleaned = (memory || '').trim();
  if (!cleaned) return '';
  const lines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*•·]\s*/, '- '))
    .map((line) => line.startsWith('- ') ? line : `- ${line}`)
    .slice(0, 6);
  return lines.join('\n');
}

function buildFallbackSummary(source: YitingArchiveSource): string {
  const lines: string[] = [];
  const memorySummary = normalizeMainStorySummary(source.memory);
  if (memorySummary) {
    lines.push(...memorySummary.split(/\r?\n/).filter(Boolean));
  }
  if (lines.length < 3) {
    lines.push(`- 玩家输入：${shortenLine(source.userInput, 90)}`);
    lines.push(`- 正文推进：${summarizeBodyForFallback(source.body, 180)}`);
  }
  if (source.worldEvents?.length) {
    lines.push(`- 动态世界：${source.worldEvents.map((item) => shortenLine(item, 64)).join('；')}`);
  }
  if (source.actionOptions?.length) {
    lines.push(`- 后续选项：${source.actionOptions.map((item) => shortenLine(item, 42)).join(' / ')}`);
  }
  return formatArchiveSummary(source.gameTime, source.location, dedupeLines(lines).slice(0, 6));
}

function buildFinalSummary(summary: string, body: string, fallback: string, time?: string, location?: string): string {
  const primaryLines = normalizeArchiveSummary(summary);
  const detailLines = normalizeArchiveSummary(body);
  const fallbackLines = normalizeArchiveSummary(fallback);
  const primaryScore = primaryLines.reduce((score, line) => score + (line.includes('：') ? 2 : 1), 0);

  if (primaryLines.length >= 3 || (primaryLines.length >= 2 && primaryScore >= 4)) {
    return formatArchiveSummary(time, location, dedupeLines(primaryLines).slice(0, 6));
  }

  const merged = dedupeLines([
    ...primaryLines,
    ...detailLines.slice(0, 2),
    ...fallbackLines,
  ]);
  return formatArchiveSummary(time, location, merged.slice(0, 6)) || fallback;
}

function formatArchiveSummary(time: string | undefined, location: string | undefined, lines: string[]): string {
  const cleanLines = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.startsWith('- ') ? line : `- ${line}`);
  return [
    `时间：${time || '未知'}`,
    `地点：${location || '未知'}`,
    '',
    '概要：',
    ...(cleanLines.length ? cleanLines : ['- 本回合暂无可提炼概要。']),
  ].join('\n');
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of lines) {
    const normalized = raw.trim();
    if (!normalized) continue;
    const line = normalized.replace(/^[-*•·]\s*/, '- ');
    const key = line.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line.startsWith('- ') ? line : `- ${line}`);
  }
  return result;
}

function parseArchiveSections(raw: string): { time: string; summary: string; body: string } {
  const text = (raw || '').trim();
  const matchTime = text.match(/<<<TIME>>>\s*([\s\S]*?)\s*(?=<<<SUMMARY>>>|<<<BODY>>>|$)/i);
  const matchSummary = text.match(/<<<SUMMARY>>>\s*([\s\S]*?)\s*(?=<<<BODY>>>|$)/i);
  const matchBody = text.match(/<<<BODY>>>\s*([\s\S]*)$/i);
  return {
    time: (matchTime?.[1] || '').trim(),
    summary: (matchSummary?.[1] || '').trim(),
    body: (matchBody?.[1] || '').trim(),
  };
}

function normalizeArchiveSummary(summary: string): string[] {
  const lines = (summary || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[\d一二三四五六七八九十]+[.、)\]]\s*/, '- '))
    .map((line) => line.replace(/^[*•—·]\s*/, '- '))
    .map((line) => line.startsWith('- ') ? line : `- ${line}`);
  const bodyLines = lines.filter((line) => !/^-\s*【.*】$/.test(line));
  if (bodyLines.length) return bodyLines;
  if (lines.length) return lines;

  const cleaned = (summary || '').trim();
  if (!cleaned) return [];
  return cleaned
    .split(/[。！？!?；;\n]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 6)
    .map((line) => `- ${line}`);
}

function shortenLine(text: string, limit: number): string {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '（空）';
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
}

function summarizeBodyForFallback(text: string, limit: number): string {
  const cleaned = (text || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '（空）';
  const clauses = cleaned
    .split(/[。！？!?；;]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 3);
  const textOut = clauses.length ? `${clauses.join('。')}。` : cleaned;
  return shortenLine(textOut, limit);
}

function buildKeywordsFromText(...parts: string[]): string[] {
  const words = new Set<string>();
  for (const part of parts) {
    const text = (part || '').toLowerCase();
    const matches = text.match(/[\u4e00-\u9fff]{2,}|[a-z0-9_]{2,}/g) || [];
    for (const item of matches) {
      if (item.length >= 2) words.add(item);
    }
  }
  return Array.from(words).slice(0, 20);
}

function mergeKeywords(base: string[], extra: string[]): string[] {
  return Array.from(new Set([...base, ...extra])).slice(0, 24);
}
