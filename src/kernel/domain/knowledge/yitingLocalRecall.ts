/** Pure local Yiting recall for prompt assembly. */

import type {
  KernelYitingEntry,
  KernelYitingRecallResult,
  KernelYitingSystem,
} from './types';

export function retrieveYitingLocal(
  system: KernelYitingSystem,
  query: string,
  limit: number,
): KernelYitingRecallResult {
  const terms = recallTerms(query);
  if (!terms.length || !system.entries.length) return { entries: [], injection: '' };

  const entries = system.entries
    .map((entry, index) => ({ entry, index, score: score(entry, terms) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.index - a.index)
    .slice(0, limit)
    .map(({ entry }) => entry);

  return { entries, injection: entries.length ? formatInjection(entries) : '' };
}

function recallTerms(query: string): string[] {
  const matches = query.toLowerCase().match(/[a-z0-9_]+|[\u4e00-\u9fff]{2,}/g) ?? [];
  return [...new Set(matches.flatMap((term) => [
    term,
    ...Array.from({ length: term.length - 1 }, (_, index) => term.slice(index, index + 2)),
  ]))];
}

function score(entry: KernelYitingEntry, terms: readonly string[]): number {
  const text = [entry.name, entry.summary, entry.raw, entry.type, ...(entry.keywords ?? [])]
    .filter(Boolean)
    .join('\n')
    .toLowerCase();
  return terms.reduce((total, term) => total + (text.includes(term) ? term.length : 0), 0);
}

function formatInjection(entries: readonly KernelYitingEntry[]): string {
  return [
    '# 即时剧情回顾｜剧情回忆',
    '',
    '以下是与当前输入相关的已归档剧情摘要；若与当前事实冲突，以当前剧情为准。',
    '',
    ...entries.map((entry) => `${entry.name}：\n${entry.summary}`),
  ].join('\n');
}
