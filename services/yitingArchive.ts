import type { 记忆系统设置 } from '@/models/settings';
import type { 回忆条目 } from '@/models/yiting';
import { chatCompletionNonStream } from '@/services/ai/chatCompletionClient';
import { withRetries } from '@/services/ai/retry';
import { YITING_ARCHIVE_FORMAT_PROMPT as YITING_LEGACY_ARCHIVE_FORMAT_PROMPT } from '@/prompts/cot/yitingCot';
import type { 提示词模块 } from '@/models/prompts';
import { buildIndependentPromptModulesSection } from '@/services/promptModuleScopes';
import { requireIndependentApiConfig } from '@/services/ai/requireIndependentApiConfig';

export interface YitingArchiveSource {
  turn: number;
  userInput: string;
  body: string;
  memory?: string;
  worldEvents?: string[];
  actionOptions?: string[];
  gameTime?: string;
  gameClock?: string;
  location?: string;
}

export interface YitingArchiveResult {
  entry: 回忆条目;
}

export async function buildYitingArchiveEntry(
  source: YitingArchiveSource,
  settings: 记忆系统设置,
  signal?: AbortSignal,
  retryCount = 2,
  promptModules?: 提示词模块[],
): Promise<YitingArchiveResult> {
  const inputText = [
    `回合：${source.turn}`,
    `时间：${formatSourceTime(source)}`,
    `地点：${source.location || '未知'}`,
    `玩家输入：${source.userInput.trim() || '（空）'}`,
    `正文：${source.body.trim() || '（空）'}`,
    source.memory?.trim() ? `正文小结：${source.memory.trim()}` : '',
  ].filter(Boolean).join('\n');

  if (!settings.忆庭独立精炼) {
    throw new Error('忆庭纪要入库要求开启独立精炼');
  }

  const api = requireIndependentApiConfig('忆庭精炼', settings.忆庭精炼API, {
    maxTokens: 1024,
    temperature: 0.2,
  });

  const archiveFormatSection = buildYitingArchiveFormatSection(promptModules);
  const systemPrompt = [
    settings.忆庭精炼提示词,
    '',
    archiveFormatSection || YITING_LEGACY_ARCHIVE_FORMAT_PROMPT,
  ].join('\n');

  const userPrompt = [
    '请将以下回合材料精炼为回忆档案：',
    inputText,
  ].join('\n\n');

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
  const summaryLines = [...normalizeArchiveSummary(parsed.summary), ...normalizeArchiveSummary(parsed.body)];
  if (summaryLines.length < 2) {
    throw new Error('忆庭精炼模型返回的纪要内容不足');
  }
  const summary = formatArchiveSummary(
    formatSourceTime(source),
    source.location,
    dedupeLines(summaryLines).slice(0, 6),
  );
  const original = [
    `玩家输入：${source.userInput.trim() || '（空）'}`,
    `正文：${source.body.trim() || '（空）'}`,
    source.memory?.trim() ? `回合小结：${source.memory.trim()}` : '',
  ].filter(Boolean).join('\n');
  return {
    entry: {
      id: `recall_turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      名称: `【回合纪要 ${String(Math.max(1, source.turn)).padStart(3, '0')}】`,
      类型: '精炼纪要',
      摘要: summary,
      原文: original,
      检索关键词: buildKeywordsFromText(source.userInput, summary, original),
      来源回合: [source.turn],
      回合: source.turn,
      时间戳: new Date().toISOString(),
    },
  };
}

function formatArchiveSummary(time: string | undefined, location: string | undefined, lines: string[]): string {
  const cleanLines = lines
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isArchiveNoiseLine(line))
    .map((line) => line.startsWith('- ') ? line : `- ${line}`)
    .map((line) => prefixLineWithTime(line, time));
  return [
    `时间：${time || '未知'}`,
    `地点：${location || '未知'}`,
    '',
    '概要：',
    ...(cleanLines.length ? cleanLines : ['- 本回合暂无可提炼概要。']),
  ].join('\n');
}

function isArchiveNoiseLine(line: string): boolean {
  return /动态世界|行动选项|后续选项|系统提示|变量草稿|剧情编织进度|最近判定理由/.test(line);
}

function formatSourceTime(source: YitingArchiveSource): string {
  return [source.gameTime, source.gameClock].filter(Boolean).join(' ') || '未知';
}

function prefixLineWithTime(line: string, time?: string): string {
  const clean = line.trim();
  if (!time || time === '未知') return clean;
  const body = clean.replace(/^-\s*/, '').trim();
  if (!body) return clean;
  if (body.includes(time) || /琥珀纪\s*\d|星历\s*\d|\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}/.test(body)) return `- ${body}`;
  return `- ${time}，${body}`;
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
    .filter((line) => !isArchiveNoiseLine(line))
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
    .filter((line) => !isArchiveNoiseLine(line))
    .slice(0, 6)
    .map((line) => `- ${line}`);
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

function buildYitingArchiveFormatSection(promptModules?: 提示词模块[]): string {
  if (!promptModules || promptModules.length === 0) return '';
  return buildIndependentPromptModulesSection(promptModules, 'yitingArchive', { category: 'format' });
}
