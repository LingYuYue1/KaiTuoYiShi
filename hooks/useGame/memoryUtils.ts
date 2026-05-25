import type { 记忆系统 } from '@/models/memory';
import type { 回忆条目 } from '@/models/yiting';
import type { API配置项, 记忆系统设置 } from '@/models/settings';
import { summarizeMemoryBatch } from '@/services/memoryCompression';

const MEMORY_SNIPPET_LIMIT = 84;

export function buildImmediateMemory(userInput: string, aiResponse: string): string {
  const input = userInput.trim();
  const response = aiResponse.trim();
  return [`玩家输入：${input || '（空）'}`, `剧情回应：${response || '（空）'}`].join('\n');
}

function normalizeMemorySnippet(text: string): string {
  return (text || '')
    .replace(/\s+/g, ' ')
    .replace(/^【\s*[\d:.\-\s]+\s*】\s*/, '')
    .replace(/^[\-\u2022•·\d一二三四五六七八九十]+[\.、\)]\s*/, '')
    .trim();
}

function collectSummaryLines(items: string[], limit = 4): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of items) {
    const snippet = normalizeMemorySnippet(item);
    if (!snippet) continue;
    const key = snippet.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(snippet.length > MEMORY_SNIPPET_LIMIT ? `${snippet.slice(0, MEMORY_SNIPPET_LIMIT)}…` : snippet);
    if (lines.length >= limit) break;
  }
  return lines;
}

function pickSummaryClause(text: string, limit = 48): string {
  const cleaned = normalizeMemorySnippet(text)
    .replace(/[。！？!?；;]+$/g, '')
    .trim();
  if (!cleaned) return '（空）';
  const clause = cleaned
    .split(/[。！？!?；;\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join('；');
  const source = clause || cleaned;
  return source.length > limit ? `${source.slice(0, limit)}…` : source;
}

function limitSummaryLine(text: string, limit: number): string {
  const cleaned = normalizeMemorySnippet(text);
  if (!cleaned) return '无';
  return cleaned.length > limit ? `${cleaned.slice(0, limit)}…` : cleaned;
}

function buildArchiveSummary(items: string[], turn: number, kind: 'short' | 'long'): string {
  const lines = collectSummaryLines(items, kind === 'long' ? 5 : 4);
  const fallback = items.map(normalizeMemorySnippet).filter(Boolean).join('；');
  const body = lines.length ? lines.join('；') : fallback;
  const content = lines.length ? lines.map((line) => `- ${line}`) : [`- ${body || '空白'}`];
  return [`【${kind === 'long' ? '长期纪要' : '短期纪要'}·回合${turn}】`, ...content].join('\n');
}

function buildKeywords(items: string[]): string[] {
  return collectSummaryLines(items, 8)
    .flatMap((line) => line.split(/[，、；：:｜\s]+/))
    .map((word) => word.trim())
    .filter((word) => word.length >= 2)
    .slice(0, 16);
}

function dedupeLines(lines: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of lines) {
    const normalized = raw.trim();
    if (!normalized) continue;
    const line = normalized.replace(/^[*•—·]\s*/, '- ');
    const key = line.replace(/\s+/g, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(line.startsWith('- ') ? line : `- ${line}`);
  }
  return result;
}

export function addImmediateMemory(system: 记忆系统, memory: string, _turn: number): 记忆系统 {
  const newMemories = [...system.即时记忆, memory];
  const trimmed = newMemories.length > 50 ? newMemories.slice(-50) : newMemories;
  return { ...system, 即时记忆: trimmed };
}

export function checkCompressionThreshold(system: 记忆系统, threshold = 25): boolean {
  return system.即时记忆.length >= Math.max(1, Math.trunc(threshold));
}

export function compressToShortTerm(system: 记忆系统, turn: number, batchSize = 25): 记忆系统 {
  const size = Math.max(1, Math.trunc(batchSize));
  const recentRaw = system.即时记忆.slice(0, size);
  const summary = buildArchiveSummary(recentRaw, turn, 'short');

  return {
    ...system,
    即时记忆: system.即时记忆.slice(size),
    短期记忆: [...system.短期记忆, summary],
  };
}

export function createShortTermArchiveEntry(rawMemories: string[], turn: number, summaryOverride?: string): 回忆条目 {
  return {
    id: `recall_${Date.now()}`,
    名称: `【回忆${String(Math.max(1, turn)).padStart(3, '0')}】`,
    类型: '短期压缩',
    摘要: summaryOverride?.trim() || buildArchiveSummary(rawMemories, turn, 'short'),
    原文: rawMemories.join('\n'),
    检索关键词: buildKeywords(rawMemories),
    来源回合: [turn],
    回合: turn,
    时间戳: new Date().toISOString(),
  };
}

export function checkLongTermThreshold(system: 记忆系统, threshold = 40): boolean {
  return system.短期记忆.length >= Math.max(1, Math.trunc(threshold));
}

export function compressToLongTerm(system: 记忆系统, turn: number, batchSize = 40): 记忆系统 {
  const size = Math.max(1, Math.trunc(batchSize));
  const oldest = system.短期记忆.slice(0, size);
  const compressed = buildArchiveSummary(oldest, turn, 'long');
  return {
    ...system,
    短期记忆: system.短期记忆.slice(size),
    长期记忆: [...system.长期记忆, compressed],
  };
}

export function createLongTermArchiveEntry(shortMemories: string[], turn: number, summaryOverride?: string): 回忆条目 {
  return {
    id: `recall_long_${Date.now()}`,
    名称: `【精炼纪要 ${String(Math.max(1, turn)).padStart(3, '0')}】`,
    类型: '长期压缩',
    摘要: summaryOverride?.trim() || buildArchiveSummary(shortMemories, turn, 'long'),
    原文: shortMemories.join('\n'),
    检索关键词: buildKeywords(shortMemories),
    来源回合: [turn],
    回合: turn,
    时间戳: new Date().toISOString(),
  };
}

export function buildTurnRecallSummary(input: {
  userInput: string;
  body: string;
  memory: string;
  turn: number;
  worldEvents?: string[];
  actionOptions?: string[];
}): string {
  const turnLabel = String(Math.max(1, input.turn)).padStart(3, '0');
  const lines: string[] = [
    `- 玩家输入：${limitSummaryLine(input.userInput, 90)}`,
    `- 正文推进：${pickSummaryClause(input.body, 64)}`,
    `- 承接记忆：${input.memory.trim() ? pickSummaryClause(input.memory, 64) : '无'}`,
  ];

  if (input.worldEvents?.length) {
    lines.push(`- 世界变化：${input.worldEvents.map((item) => pickSummaryClause(item, 40)).join(' / ')}`);
  }
  if (input.actionOptions?.length) {
    lines.push(`- 行动选项：${input.actionOptions.map((item) => pickSummaryClause(item, 36)).join(' / ')}`);
  }

  return `【回合${turnLabel} 纪要】\n${dedupeLines(lines).slice(0, 6).join('\n')}`;
}

export function createTurnRecallEntry(input: {
  userInput: string;
  body: string;
  memory?: string;
  turn: number;
  worldEvents?: string[];
  actionOptions?: string[];
}): 回忆条目 {
  const rawPieces = [
    `玩家输入：${input.userInput.trim() || '（空）'}`,
    `正文：${input.body.trim() || '（空）'}`,
    input.memory?.trim() ? `回合小结：${input.memory.trim()}` : '',
    input.worldEvents?.length ? `动态世界：${input.worldEvents.join(' / ')}` : '',
    input.actionOptions?.length ? `行动选项：${input.actionOptions.join(' / ')}` : '',
  ].filter(Boolean);
  return {
    id: `recall_turn_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    名称: `【回合纪要 ${String(Math.max(1, input.turn)).padStart(3, '0')}】`,
    类型: '精炼纪要',
    摘要: buildTurnRecallSummary({
      userInput: input.userInput,
      body: input.body,
      memory: input.memory ?? '',
      turn: input.turn,
      worldEvents: input.worldEvents,
      actionOptions: input.actionOptions,
    }),
    原文: rawPieces.join('\n'),
    检索关键词: buildKeywords(rawPieces),
    来源回合: [input.turn],
    回合: input.turn,
    时间戳: new Date().toISOString(),
  };
}

export function upsertRecallEntry(system: { 回忆档案: 回忆条目[] }, entry: 回忆条目): { 回忆档案: 回忆条目[] } {
  const next = system.回忆档案.filter(
    (item) => !(item.回合 === entry.回合 && item.类型 === '精炼纪要' && item.名称?.startsWith('【回合纪要')),
  );
  return { 回忆档案: [...next, entry] };
}

export function autoCompressMemorySystem(
  system: 记忆系统,
  turn: number,
  settings: Pick<记忆系统设置, '即时转短期阈值' | '短期转长期阈值'>,
): 记忆系统 {
  let next = system;
  const immediateThreshold = Math.max(1, Math.trunc(settings.即时转短期阈值 || 25));
  const shortThreshold = Math.max(1, Math.trunc(settings.短期转长期阈值 || 40));

  while (next.即时记忆.length >= immediateThreshold) {
    next = compressToShortTerm(next, turn, immediateThreshold);
  }
  while (next.短期记忆.length >= shortThreshold) {
    next = compressToLongTerm(next, turn, shortThreshold);
  }
  return next;
}

export function autoCompressMemorySystemWithArchives(
  system: 记忆系统,
  turn: number,
  settings: Pick<记忆系统设置, '即时转短期阈值' | '短期转长期阈值'>,
): { memory: 记忆系统; archives: 回忆条目[] } {
  let next = system;
  const archives: 回忆条目[] = [];
  const immediateThreshold = Math.max(1, Math.trunc(settings.即时转短期阈值 || 25));
  const shortThreshold = Math.max(1, Math.trunc(settings.短期转长期阈值 || 40));

  while (next.即时记忆.length >= immediateThreshold) {
    const raw = next.即时记忆.slice(0, immediateThreshold);
    archives.push(createShortTermArchiveEntry(raw, turn));
    next = compressToShortTerm(next, turn, immediateThreshold);
  }
  while (next.短期记忆.length >= shortThreshold) {
    const raw = next.短期记忆.slice(0, shortThreshold);
    archives.push(createLongTermArchiveEntry(raw, turn));
    next = compressToLongTerm(next, turn, shortThreshold);
  }
  return { memory: next, archives };
}

export async function autoCompressMemorySystemWithArchivesAsync(
  system: 记忆系统,
  turn: number,
  settings: 记忆系统设置,
  mainConfig: API配置项,
  signal?: AbortSignal,
): Promise<{ memory: 记忆系统; archives: 回忆条目[]; usedFallback: boolean; usedModel: boolean }> {
  let next = system;
  const archives: 回忆条目[] = [];
  const immediateThreshold = Math.max(1, Math.trunc(settings.即时转短期阈值 || 25));
  const shortThreshold = Math.max(1, Math.trunc(settings.短期转长期阈值 || 40));
  const retryCount = settings.记忆总结API?.retryCount ?? 2;
  let usedFallback = false;
  let usedModel = false;

  while (next.即时记忆.length >= immediateThreshold) {
    const raw = next.即时记忆.slice(0, immediateThreshold);
    const result = await summarizeMemoryBatch(
      {
        kind: 'short',
        turn,
        items: raw,
        prompt: settings.即时转短期提示词,
      },
      settings,
      mainConfig,
      signal,
      retryCount,
    );
    usedFallback = usedFallback || result.usedFallback;
    usedModel = usedModel || !result.usedFallback;
    archives.push(createShortTermArchiveEntry(raw, turn, result.summary));
    next = {
      ...next,
      即时记忆: next.即时记忆.slice(immediateThreshold),
      短期记忆: [...next.短期记忆, result.summary],
    };
  }

  while (next.短期记忆.length >= shortThreshold) {
    const raw = next.短期记忆.slice(0, shortThreshold);
    const result = await summarizeMemoryBatch(
      {
        kind: 'long',
        turn,
        items: raw,
        prompt: settings.短期转长期提示词,
      },
      settings,
      mainConfig,
      signal,
      retryCount,
    );
    usedFallback = usedFallback || result.usedFallback;
    usedModel = usedModel || !result.usedFallback;
    archives.push(createLongTermArchiveEntry(raw, turn, result.summary));
    next = {
      ...next,
      短期记忆: next.短期记忆.slice(shortThreshold),
      长期记忆: [...next.长期记忆, result.summary],
    };
  }

  return { memory: next, archives, usedFallback, usedModel };
}

export function compressNpcMemories(memories: string[], threshold: number, prompt: string): string[] {
  const size = Math.max(1, Math.trunc(threshold || 15));
  if (!Array.isArray(memories) || memories.length < size) return memories;

  let next = memories.slice();
  const note = prompt.trim();
  while (next.length >= size) {
    const chunk = next.slice(0, size);
    const summary = note ? `${note}：${chunk.join(' / ')}` : chunk.join(' / ');
    next = [`[压缩] ${summary}`, ...next.slice(size)];
  }
  return next;
}

export function formatMemoryForPrompt(system: 记忆系统): string {
  const sections: string[] = [];
  if (system.长期记忆.length) {
    sections.push(
      '【长期记忆】\n' + system.长期记忆.map((m, i) => `${i + 1}. ${m}`).join('\n'),
    );
  }
  if (system.短期记忆.length) {
    sections.push(
      '【短期记忆】\n' + system.短期记忆.map((m, i) => `${i + 1}. ${m}`).join('\n'),
    );
  }
  return sections.join('\n\n');
}

export function normalizeMemorySystem(raw: 记忆系统): 记忆系统 {
  return {
    即时记忆: raw.即时记忆 ?? [],
    短期记忆: raw.短期记忆 ?? [],
    长期记忆: raw.长期记忆 ?? [],
  };
}
