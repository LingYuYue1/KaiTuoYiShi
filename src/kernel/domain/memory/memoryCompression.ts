import type { 记忆系统 } from '@/models/memory';

const MEMORY_SNIPPET_LIMIT = 84;

export function normalizeMemorySnippet(text: string): string {
  return (text || '')
    .replace(/\s+/g, ' ')
    .replace(/^【\s*[\d:.\-\s]+\s*】\s*/, '')
    .replace(/^[\-\u2022•·\d一二三四五六七八九十]+[\.、\)]\s*/, '')
    .trim();
}

export function collectSummaryLines(items: string[], limit = 4): string[] {
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

export function buildArchiveSummary(items: string[], turn: number, kind: 'short' | 'middle' | 'long'): string {
  const lines = collectSummaryLines(items, kind === 'long' ? 5 : 4);
  const fallback = items.map(normalizeMemorySnippet).filter(Boolean).join('；');
  const body = lines.length ? lines.join('；') : fallback;
  const content = lines.length ? lines.map((line) => `- ${line}`) : [`- ${body || '空白'}`];
  const label = kind === 'long' ? '长期纪要' : kind === 'middle' ? '中期纪要' : '短期纪要';
  return [`【${label}·回合${turn}】`, ...content].join('\n');
}

export function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return value;
}

export function checkCompressionThreshold(system: 记忆系统, threshold: number): boolean {
  return system.即时记忆.length >= requirePositiveInteger(threshold, 'Immediate memory threshold');
}

export function compressToShortTerm(system: 记忆系统, turn: number, batchSize: number): 记忆系统 {
  const size = requirePositiveInteger(batchSize, 'Immediate memory batch size');
  if (system.即时记忆.length < size) throw new Error('Immediate memory batch is incomplete');
  const recentRaw = system.即时记忆.slice(0, size);
  return {
    ...system,
    即时记忆: system.即时记忆.slice(size),
    短期记忆: [...system.短期记忆, buildArchiveSummary(recentRaw, turn, 'short')],
  };
}

export function checkMiddleTermThreshold(system: 记忆系统, threshold: number): boolean {
  return system.短期记忆.length >= requirePositiveInteger(threshold, 'Short memory threshold');
}

export function compressToMiddleTerm(system: 记忆系统, turn: number, batchSize: number): 记忆系统 {
  const size = requirePositiveInteger(batchSize, 'Short memory batch size');
  if (system.短期记忆.length < size) throw new Error('Short memory batch is incomplete');
  const oldest = system.短期记忆.slice(0, size);
  return {
    ...system,
    短期记忆: system.短期记忆.slice(size),
    中期记忆: [...(system.中期记忆 ?? []), buildArchiveSummary(oldest, turn, 'middle')],
  };
}

export function checkLongTermThreshold(system: 记忆系统, threshold: number): boolean {
  return (system.中期记忆 ?? []).length >= requirePositiveInteger(threshold, 'Middle memory threshold');
}

export function compressToLongTerm(system: 记忆系统, turn: number, batchSize: number): 记忆系统 {
  const size = requirePositiveInteger(batchSize, 'Middle memory batch size');
  const middle = system.中期记忆 ?? [];
  if (middle.length < size) throw new Error('Middle memory batch is incomplete');
  const oldest = middle.slice(0, size);
  return {
    ...system,
    中期记忆: middle.slice(size),
    长期记忆: [...system.长期记忆, buildArchiveSummary(oldest, turn, 'long')],
  };
}
