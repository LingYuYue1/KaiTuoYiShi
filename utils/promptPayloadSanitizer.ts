const DATA_IMAGE_RE = /^data:image\/[a-z0-9.+-]+;base64,/i;
const DATA_URL_RE = /^data:[^,]+;base64,/i;
const BASE64_LIKE_RE = /^[A-Za-z0-9+/]+={0,2}$/;

const BINARY_IMAGE_FIELD_NAMES = new Set([
  '头像',
  '正文头像',
  '手机头像',
  '立绘',
  'src',
  'url',
  'dataUrl',
  'image',
  'avatar',
  'avatarUrl',
  'portrait',
]);

export interface PromptPayloadSanitizerOptions {
  maxStringLength?: number;
  maxDepth?: number;
  maxArrayLength?: number;
}

const DEFAULT_MAX_STRING_LENGTH = 4000;
const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_ARRAY_LENGTH = 120;

export function sanitizePromptPayload<T>(value: T, options: PromptPayloadSanitizerOptions = {}): T {
  const seen = new WeakSet<object>();
  return sanitizeValue(value, {
    maxStringLength: Math.max(200, options.maxStringLength ?? DEFAULT_MAX_STRING_LENGTH),
    maxDepth: Math.max(1, options.maxDepth ?? DEFAULT_MAX_DEPTH),
    maxArrayLength: Math.max(1, options.maxArrayLength ?? DEFAULT_MAX_ARRAY_LENGTH),
    seen,
  }, undefined, 0) as T;
}

export function stringifyPromptPayload(value: unknown, options?: PromptPayloadSanitizerOptions): string {
  return JSON.stringify(sanitizePromptPayload(value, options), null, 2);
}

interface SanitizerRuntimeOptions {
  maxStringLength: number;
  maxDepth: number;
  maxArrayLength: number;
  seen: WeakSet<object>;
}

function sanitizeValue(
  value: unknown,
  options: SanitizerRuntimeOptions,
  key: string | undefined,
  depth: number,
): unknown {
  if (typeof value === 'string') return sanitizeString(value, key, options.maxStringLength);
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (depth >= options.maxDepth) return '[对象已省略: 超出 Prompt 清洗深度]';
  if (options.seen.has(value)) return '[循环引用已省略]';
  options.seen.add(value);

  if (Array.isArray(value)) {
    const sliced = value.slice(0, options.maxArrayLength).map((item) => sanitizeValue(item, options, key, depth + 1));
    if (value.length > sliced.length) sliced.push(`[数组已截断: 省略 ${value.length - sliced.length} 项]`);
    return sliced;
  }

  const output: Record<string, unknown> = {};
  for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
    output[childKey] = sanitizeValue(childValue, options, childKey, depth + 1);
  }
  return output;
}

function sanitizeString(value: string, key: string | undefined, maxStringLength: number): string {
  const trimmedStart = value.trimStart();
  if (DATA_IMAGE_RE.test(trimmedStart)) {
    return `[图片数据已省略: ${readDataMime(trimmedStart) || 'data:image'}，长度 ${value.length}]`;
  }
  if (DATA_URL_RE.test(trimmedStart)) {
    return `[二进制 data URL 已省略: ${readDataMime(trimmedStart) || 'data'}，长度 ${value.length}]`;
  }
  if (isLikelyRawImageBase64(value, key)) {
    return `[疑似图片 Base64 已省略: 长度 ${value.length}]`;
  }
  if (value.length > maxStringLength) {
    return `${value.slice(0, maxStringLength)}\n[长文本已截断: 省略 ${value.length - maxStringLength} 字符]`;
  }
  return value;
}

function readDataMime(value: string): string | undefined {
  return value.match(/^data:([^;,]+)/i)?.[1];
}

function isLikelyRawImageBase64(value: string, key: string | undefined): boolean {
  if (!key || !BINARY_IMAGE_FIELD_NAMES.has(key)) return false;
  const compact = value.replace(/\s/g, '');
  if (compact.length < 800) return false;
  return BASE64_LIKE_RE.test(compact);
}
