export function estimateTextTokens(text: string): number {
  const normalized = (text || '').trim();
  if (!normalized) return 0;

  const cjkMatches = normalized.match(/[\u3400-\u9fff\uf900-\ufaff]/g);
  const cjkCount = cjkMatches?.length ?? 0;
  const nonCjk = normalized
    .replace(/[\u3400-\u9fff\uf900-\ufaff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const asciiTokenCount = nonCjk ? Math.ceil(nonCjk.length / 4) : 0;

  return Math.max(1, Math.ceil(cjkCount * 0.65 + asciiTokenCount));
}

export function formatTokenCount(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString('en-US');
}
