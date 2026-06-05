export function normalizeStructuredModelText(rawText: string): string {
  return String(rawText || '')
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
    const first = candidates[0];
    if (first) return source.slice(first.start, first.end + 1);
  }
  for (const [open, close] of pairs) {
    const start = source.indexOf(open);
    const end = source.lastIndexOf(close);
    if (start >= 0 && end > start) return source.slice(start, end + 1);
  }
  return source;
}

export function repairLooseJsonText(rawText: string): string {
  return String(rawText || '')
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

export function parseNumberedRecallLines(rawText: string): Record<string, number[]> {
  const output: Record<string, number[]> = {};
  const text = normalizeStructuredModelText(rawText);
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^:：]+)[:：]([\s\S]*)$/);
    if (!match) continue;
    const label = match[1].trim();
    const numbers = Array.from(match[2].matchAll(/\d+/g))
      .map((item) => Number(item[0]))
      .filter((value) => Number.isInteger(value) && value > 0);
    if (numbers.length) output[label] = numbers;
  }
  return output;
}
