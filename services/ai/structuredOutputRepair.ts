export function normalizeStructuredModelText(rawText: string): string {
  return (rawText || '')
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking>[\s\S]*?<\/thinking>/gi, '')
    .replace(/```(?:json|JSON)?/g, '')
    .replace(/```/g, '')
    .trim();
}

export function extractJsonLikeText(rawText: string, expected: 'object' | 'array' | 'any' = 'any'): string {
  const source = normalizeStructuredModelText(rawText);
  const pairs = expected === 'array'
    ? [['[', ']'] as const]
    : expected === 'object'
      ? [['{', '}'] as const]
      : [['{', '}'] as const, ['[', ']'] as const];

  if (expected === 'any') {
    const candidates = pairs
      .map(([open, close]) => ({ open, close, start: source.indexOf(open), end: source.lastIndexOf(close) }))
      .filter((item) => item.start >= 0 && item.end > item.start)
      .sort((a, b) => a.start - b.start);
    for (const candidate of candidates) {
      return source.slice(candidate.start, candidate.end + 1);
    }
  }
  for (const [open, close] of pairs) {
    const start = source.indexOf(open);
    const end = source.lastIndexOf(close);
    if (start >= 0 && end > start) return source.slice(start, end + 1);
  }
  return source;
}

export function repairLooseJsonText(rawText: string): string {
  return (rawText || '')
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/^\uFEFF/, '')
    .trim();
}

export function parseJsonWithRepair<T = unknown>(
  rawText: string,
  expected: 'object' | 'array' | 'any' = 'any',
): T {
  const candidate = extractJsonLikeText(rawText, expected);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    return JSON.parse(repairLooseJsonText(candidate)) as T;
  }
}
