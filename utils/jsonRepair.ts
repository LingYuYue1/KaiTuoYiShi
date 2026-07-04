type ParseAttempt<T> = {
  ok: boolean;
  value: T | null;
  error?: string;
};

export interface JsonRepairResult<T = unknown> {
  value: T | null;
  repairedText: string;
  usedRepair: boolean;
  error?: string;
}

const tryParse = <T = unknown>(input: string): ParseAttempt<T> => {
  try {
    return { ok: true, value: JSON.parse(input) as T };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'JSON 解析失败';
    return { ok: false, value: null, error: message };
  }
};

const stripFence = (input: string): string => {
  const trimmed = input.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed;
};

const extractJsonBlock = (input: string): string => {
  const start = input.indexOf('{');
  const end = input.lastIndexOf('}');
  if (start >= 0 && end > start) return input.slice(start, end + 1);
  return input;
};

const replaceOutsideStrings = (input: string, mapper: (ch: string) => string): string => {
  let result = '';
  let inString = false;
  let escaped = false;

  for (const ch of input) {
    if (inString) {
      result += ch;
      if (escaped) {
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      continue;
    }
    result += mapper(ch);
  }

  return result;
};

const normalizeFullWidthPunctuation = (input: string): string => {
  const map: Record<string, string> = {
    '“': '"',
    '”': '"',
    '‘': "'",
    '’': "'",
    '，': ',',
    '：': ':',
    '；': ',',
  };
  return replaceOutsideStrings(input, (ch) => map[ch] ?? ch);
};

const normalizeSlashN = (input: string): string => {
  return input
    .replace(/\\\/n/g, '\\n')
    .replace(/\/n/g, '\\n');
};

const normalizeBase = (input: string): string => {
  return input.replace(/^\uFEFF/, '').trim();
};

const repairJsonText = (input: string): string => {
  let text = normalizeBase(input);
  text = stripFence(text);
  text = extractJsonBlock(text);
  text = normalizeSlashN(text);
  text = normalizeFullWidthPunctuation(text);
  return text.trim();
};

const dedupeCandidates = (candidates: string[]): string[] => {
  const seen = new Set<string>();
  const list: string[] = [];
  for (const item of candidates) {
    const value = item.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    list.push(value);
  }
  return list;
};

export const parseJsonWithRepair = <T = unknown>(input: string): JsonRepairResult<T> => {
  const source = normalizeBase(input || '');
  const candidates = dedupeCandidates([
    source,
    stripFence(source),
    extractJsonBlock(source),
    extractJsonBlock(stripFence(source)),
  ]);

  for (const candidate of candidates) {
    const parsed = tryParse<T>(candidate);
    if (parsed.ok) {
      return {
        value: parsed.value,
        repairedText: candidate,
        usedRepair: candidate !== source,
      };
    }
  }

  let lastError = 'JSON 解析失败';
  for (const candidate of candidates) {
    const repaired = repairJsonText(candidate);
    const parsed = tryParse<T>(repaired);
    if (parsed.ok) {
      return {
        value: parsed.value,
        repairedText: repaired,
        usedRepair: true,
      };
    }
    if (parsed.error) lastError = parsed.error;
  }

  const fallback = repairJsonText(source);
  return {
    value: null,
    repairedText: fallback,
    usedRepair: true,
    error: lastError,
  };
};

export const formatJsonWithRepair = (input: string, fallback: string): string => {
  const parsed = parseJsonWithRepair<any>(input);
  if (parsed.value === null) return fallback;
  try {
    return JSON.stringify(parsed.value, null, 2);
  } catch {
    return parsed.repairedText || fallback;
  }
};