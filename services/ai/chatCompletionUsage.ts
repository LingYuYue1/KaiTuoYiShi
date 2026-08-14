// 由 docs/plans/chatCompletionClient-deepclean-slim.md S7 拆分生成。
import type { API配置项 } from '@/models/settings';
import type { ChatCompletionRequest, ChatCompletionUsage, UsageLike } from './chatCompletionTypes';

type UsagePayloadMatch = {
  usage: Record<string, any>;
  path: string;
};

// —— usage 字段别名表（点路径；多供应商命名兼容）。语义组只声明一次，取数/判定共用。 ——
const INPUT_FIELDS = [
  'prompt_tokens', 'promptTokens', 'input_tokens', 'inputTokens',
  'input_token_count', 'inputTokenCount', 'promptTokenCount',
  'prompt_tokens_count', 'input_tokens_count', 'prompt_eval_count',
  'promptEvalCount', 'input_text_tokens', 'inputTextTokens',
  'totalPromptTokens', 'total_prompt_tokens',
  'tokens.input_tokens', 'tokens.inputTokens',
  'metrics.input_tokens', 'metrics.inputTokens',
  'billed_units.input_tokens', 'billedUnits.inputTokens',
] as const;

const OUTPUT_FIELDS = [
  'completion_tokens', 'completionTokens', 'output_tokens', 'outputTokens',
  'output_token_count', 'outputTokenCount', 'candidatesTokenCount',
  'completion_tokens_count', 'output_tokens_count', 'eval_count', 'evalCount',
  'output_text_tokens', 'outputTextTokens',
  'totalCompletionTokens', 'total_completion_tokens',
  'tokens.output_tokens', 'tokens.outputTokens',
  'metrics.output_tokens', 'metrics.outputTokens',
  'billed_units.output_tokens', 'billedUnits.outputTokens',
] as const;

const TOTAL_FIELDS = [
  'total_tokens', 'totalTokens', 'totalTokenCount', 'total_token_count',
  'total_tokens_count', 'token_count', 'tokenCount',
  'tokens.total_tokens', 'tokens.totalTokens',
  'metrics.total_tokens', 'metrics.totalTokens',
] as const;

const CACHE_READ_FIELDS = [
  'prompt_tokens_details.cached_tokens', 'prompt_tokens_details.cachedTokens',
  'promptTokensDetails.cached_tokens', 'promptTokensDetails.cachedTokens',
  'input_tokens_details.cached_tokens', 'input_tokens_details.cachedTokens',
  'inputTokensDetails.cached_tokens', 'inputTokensDetails.cachedTokens',
  'input_token_details.cached_tokens', 'input_token_details.cachedTokens',
  'input_token_details.cache_read', 'input_token_details.cacheRead',
  'input_token_details.cache_read_input_tokens', 'input_token_details.cacheReadInputTokens',
  'inputTokenDetails.cached_tokens', 'inputTokenDetails.cachedTokens',
  'inputTokenDetails.cache_read', 'inputTokenDetails.cacheRead',
  'inputTokenDetails.cacheReadInputTokens',
  'prompt_cache_hit_tokens', 'promptCacheHitTokens',
  'prompt_cache_read_tokens', 'promptCacheReadTokens',
  'prompt_cache_tokens', 'promptCacheTokens',
  'cache_read_input_tokens', 'cacheReadInputTokens',
  'cache_read_input_token_count', 'cacheReadInputTokenCount',
  'cache_read_tokens', 'cacheReadTokens',
  'cache_hit_tokens', 'cacheHitTokens',
  'cache_hit_input_tokens', 'cacheHitInputTokens',
  'cached_prompt_tokens', 'cachedPromptTokens',
  'cached_input_tokens', 'cachedInputTokens',
  'input_cached_tokens', 'inputCachedTokens',
  'prompt_cached_tokens', 'promptCachedTokens',
  'cache_tokens', 'cacheTokens',
  'cached_tokens', 'cachedTokens',
  'cachedContentTokenCount', 'cached_content_token_count', 'cachedContentTokens',
  'cache.read_tokens', 'cache.readTokens',
  'cache.read_input_tokens', 'cache.readInputTokens',
  'cache.hit_tokens', 'cache.hitTokens',
  'cache.hit_input_tokens', 'cache.hitInputTokens',
  'cache.cached_tokens', 'cache.cachedTokens',
] as const;

const CACHE_WRITE_FIELDS = [
  'prompt_cache_miss_tokens', 'promptCacheMissTokens',
  'uncached_tokens', 'uncachedTokens',
  'uncached_input_tokens', 'uncachedInputTokens',
  'cache_miss_input_tokens', 'cacheMissInputTokens',
  'cache_miss_tokens', 'cacheMissTokens',
  'cache_creation_input_tokens', 'cacheCreationInputTokens',
  'cache_creation_input_token_count', 'cacheCreationInputTokenCount',
  'cache_write_input_tokens', 'cacheWriteInputTokens',
  'cache_write_input_token_count', 'cacheWriteInputTokenCount',
  'cache_write_tokens', 'cacheWriteTokens',
  'prompt_cache_write_tokens', 'promptCacheWriteTokens',
  'cache.miss_tokens', 'cache.missTokens',
  'cache.miss_input_tokens', 'cache.missInputTokens',
  'cache.write_tokens', 'cache.writeTokens',
  'cache.write_input_tokens', 'cache.writeInputTokens',
  'cache.creation_tokens', 'cache.creationTokens',
  'cache.creation_input_tokens', 'cache.creationInputTokens',
] as const;

const CACHE_RATE_FIELDS = [
  'cache_hit_rate', 'cacheHitRate', 'cache_hit_ratio', 'cacheHitRatio',
  'cache.hit_rate', 'cache.hitRate', 'cache.hit_ratio', 'cache.hitRatio',
] as const;

/** 点路径取值：先取语义组内首个命中值；语义与原实现一致（有限数字 / 可转数字字符串）。 */
function pickFirst(usage: UsageLike, paths: readonly string[]): number | undefined {
  for (const path of paths) {
    let value: unknown = usage;
    let resolved = true;
    for (const segment of path.split('.')) {
      if (!value || typeof value !== 'object' || !(segment in (value as Record<string, unknown>))) {
        resolved = false;
        break;
      }
      value = (value as Record<string, unknown>)[segment];
    }
    if (!resolved) continue;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}

export function emitUsageFromResponse(raw: unknown, config: API配置项, request: ChatCompletionRequest): void {
  if (!request.onUsage) return;
  const usage = extractUsage(raw, config);
  if (usage) request.onUsage(usage);
}

function extractUsage(raw: unknown, config: API配置项): ChatCompletionUsage | null {
  const matched = findUsagePayload(raw);
  if (!matched) return null;
  const { usage, path: usagePath } = matched;

  const inputTokens = pickFirst(usage, INPUT_FIELDS);
  const outputTokens = pickFirst(usage, OUTPUT_FIELDS);
  const totalTokens = pickFirst(usage, TOTAL_FIELDS)
    ?? (typeof inputTokens === 'number' && typeof outputTokens === 'number' ? inputTokens + outputTokens : undefined);
  const cachedTokens = pickFirst(usage, CACHE_READ_FIELDS);
  const explicitUncachedTokens = pickFirst(usage, CACHE_WRITE_FIELDS);
  const explicitCacheHitRate = normalizeCacheHitRate(pickFirst(usage, CACHE_RATE_FIELDS));
  const normalizedInput = inputTokens ?? (typeof totalTokens === 'number' && typeof outputTokens === 'number' ? Math.max(0, totalTokens - outputTokens) : undefined);
  const normalizedOutput = outputTokens ?? (typeof totalTokens === 'number' && typeof normalizedInput === 'number' ? Math.max(0, totalTokens - normalizedInput) : undefined);
  const normalizedTotal = totalTokens ?? (
    typeof normalizedInput === 'number' || typeof normalizedOutput === 'number'
      ? (normalizedInput ?? 0) + (normalizedOutput ?? 0)
      : undefined
  );
  const uncachedTokens = explicitUncachedTokens ?? (
    typeof normalizedInput === 'number' && typeof cachedTokens === 'number'
      ? Math.max(0, normalizedInput - cachedTokens)
      : undefined
  );

  if (
    normalizedInput === undefined &&
    normalizedOutput === undefined &&
    normalizedTotal === undefined &&
    cachedTokens === undefined &&
    explicitUncachedTokens === undefined
  ) {
    return null;
  }

  return {
    inputTokens: normalizedInput,
    outputTokens: normalizedOutput,
    totalTokens: normalizedTotal,
    cachedTokens,
    uncachedTokens,
    cacheHitRate: explicitCacheHitRate ?? (typeof cachedTokens === 'number' && typeof normalizedInput === 'number' && normalizedInput > 0
      ? cachedTokens / normalizedInput
      : undefined),
    provider: config.provider,
    model: config.model,
    usageFormat: inferUsageFormat(usage, usagePath),
    usagePath,
    rawUsageKeys: collectUsageKeys(usage),
    cacheDiagnostic: buildCacheDiagnostic({
      usage,
      usagePath,
      config,
      cachedTokens,
      explicitUncachedTokens,
      cacheHitRate: explicitCacheHitRate,
    }),
    rawUsage: usage,
    source: 'api',
  };
}

function findUsagePayload(raw: unknown): UsagePayloadMatch | null {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as Record<string, any>;
  const candidates = [
    mergeUsageCandidate(data.usage, data, 'usage'),
    mergeUsageCandidate(data.usageMetadata, data, 'usageMetadata'),
    mergeUsageCandidate(data.usage_metadata, data, 'usage_metadata'),
    mergeUsageCandidate(data.tokenUsage, data, 'tokenUsage'),
    mergeUsageCandidate(data.token_usage, data, 'token_usage'),
    mergeUsageCandidate(data.response?.usage, data.response, 'response.usage'),
    mergeUsageCandidate(data.response?.usageMetadata, data.response, 'response.usageMetadata'),
    mergeUsageCandidate(data.response?.usage_metadata, data.response, 'response.usage_metadata'),
    mergeUsageCandidate(data.responseMetadata?.usage, data.responseMetadata, 'responseMetadata.usage'),
    mergeUsageCandidate(data.response_metadata?.usage, data.response_metadata, 'response_metadata.usage'),
    mergeUsageCandidate(data.message?.usage, data.message, 'message.usage'),
    mergeUsageCandidate(data.message?.usageMetadata, data.message, 'message.usageMetadata'),
    mergeUsageCandidate(data.choices?.[0]?.usage, data.choices?.[0], 'choices[0].usage'),
    mergeUsageCandidate(data.output?.usage, data.output, 'output.usage'),
    mergeUsageCandidate(data.result?.usage, data.result, 'result.usage'),
    mergeUsageCandidate(data.data?.usage, data.data, 'data.usage'),
    mergeUsageCandidate(data.meta?.usage, data.meta, 'meta.usage'),
    mergeUsageCandidate(data.meta?.tokens, data.meta, 'meta.tokens'),
    mergeUsageCandidate(data.meta?.billed_units, data.meta, 'meta.billed_units'),
    mergeUsageCandidate(data.meta?.billedUnits, data.meta, 'meta.billedUnits'),
    mergeUsageCandidate(data.metrics?.usage, data.metrics, 'metrics.usage'),
    mergeUsageCandidate(data.metrics?.tokens, data.metrics, 'metrics.tokens'),
    mergeUsageCandidate(data, undefined, 'top_level'),
  ];

  return selectBestUsagePayload(candidates);
}

function mergeUsageCandidate(candidate: unknown, parent: unknown, path: string): UsagePayloadMatch | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const usage = { ...(candidate as Record<string, any>) };
  if (parent && typeof parent === 'object') {
    for (const [key, value] of Object.entries(parent as Record<string, any>)) {
      if (key in usage || shouldSkipUsageSiblingKey(key)) continue;
      if (isUsageSiblingField(key, value)) usage[key] = value;
    }
  }
  return { usage, path };
}

function selectBestUsagePayload(candidates: Array<UsagePayloadMatch | null>): UsagePayloadMatch | null {
  const valid = candidates.filter((candidate): candidate is UsagePayloadMatch =>
    Boolean(candidate && isUsagePayload(candidate.usage)),
  );
  if (!valid.length) return null;

  const best = valid.reduce((winner, candidate) =>
    scoreUsagePayload(candidate) > scoreUsagePayload(winner) ? candidate : winner,
  );
  const usage = { ...best.usage };
  const paths = [best.path];

  for (const candidate of valid) {
    if (candidate === best) continue;
    let merged = false;
    for (const [key, value] of Object.entries(candidate.usage)) {
      if (key in usage || shouldSkipUsageSiblingKey(key)) continue;
      if (isUsageSiblingField(key, value)) {
        usage[key] = value;
        merged = true;
      }
    }
    if (merged) paths.push(candidate.path);
  }

  return { usage, path: Array.from(new Set(paths)).join('+') };
}

function scoreUsagePayload(candidate: UsagePayloadMatch): number {
  const usage = candidate.usage;
  return (
    (hasCacheUsageSignal(usage) ? 1000 : 0) +
    (hasCoreUsageSignal(usage) ? 100 : 0) +
    (candidate.path === 'top_level' ? 0 : 10) +
    Math.min(25, collectUsageKeys(usage).filter((key) => isUsageSiblingField(key, usage[key])).length)
  );
}

function shouldSkipUsageSiblingKey(key: string): boolean {
  return [
    'choices',
    'content',
    'created',
    'delta',
    'error',
    'id',
    'message',
    'model',
    'object',
    'response',
    'responseMetadata',
    'response_metadata',
    'result',
    'usage',
    'usageMetadata',
    'usage_metadata',
  ].includes(key);
}

function isUsageSiblingField(key: string, value: unknown): boolean {
  if (/token|usage|cache|cached|billed|prompt|completion|input|output/i.test(key)) return true;
  return isUsagePayload(value);
}

function hasCoreUsageSignal(usage: UsageLike): boolean {
  return pickFirst(usage, INPUT_FIELDS) !== undefined
    || pickFirst(usage, OUTPUT_FIELDS) !== undefined
    || pickFirst(usage, TOTAL_FIELDS) !== undefined;
}

function hasCacheUsageSignal(usage: UsageLike): boolean {
  return pickFirst(usage, CACHE_READ_FIELDS) !== undefined
    || pickFirst(usage, CACHE_WRITE_FIELDS) !== undefined
    || pickFirst(usage, CACHE_RATE_FIELDS) !== undefined;
}

function inferUsageFormat(usage: Record<string, any>, usagePath: string): string {
  if (
    usagePath.includes('usageMetadata') ||
    usagePath.includes('usage_metadata') ||
    'promptTokenCount' in usage ||
    'candidatesTokenCount' in usage ||
    'cachedContentTokenCount' in usage ||
    'cached_content_token_count' in usage
  ) {
    return 'gemini_native';
  }
  if ('input_tokens' in usage || 'output_tokens' in usage || 'cache_read_input_tokens' in usage) {
    return 'anthropic_or_compatible';
  }
  if ('prompt_tokens' in usage || 'completion_tokens' in usage || 'total_tokens' in usage || 'prompt_tokens_details' in usage) {
    return 'openai_compatible';
  }
  return 'unknown';
}

function collectUsageKeys(usage: Record<string, any>): string[] {
  return Object.keys(usage).sort();
}

function hasOnlyOpenAICoreUsage(usage: Record<string, any>): boolean {
  const keys = collectUsageKeys(usage);
  return keys.length > 0 && keys.every((key) => ['completion_tokens', 'prompt_tokens', 'total_tokens'].includes(key));
}

function buildCacheDiagnostic(input: {
  usage: Record<string, any>;
  usagePath: string;
  config: API配置项;
  cachedTokens?: number;
  explicitUncachedTokens?: number;
  cacheHitRate?: number;
}): string {
  const { usage, usagePath, config, cachedTokens, explicitUncachedTokens, cacheHitRate } = input;
  const cacheReturned =
    typeof cachedTokens === 'number' ||
    typeof explicitUncachedTokens === 'number' ||
    typeof cacheHitRate === 'number';
  if (cacheReturned) {
    return `缓存统计已由 API 返回（usage 路径：${usagePath}）。`;
  }
  if (hasOnlyOpenAICoreUsage(usage)) {
    const modelHint = /gemini/i.test(config.model)
      ? '当前模型名包含 Gemini，但响应是 OpenAI 兼容三项基础 usage；这通常说明当前接口或中转没有透传 Gemini 原生缓存字段。若要看 Gemini 缓存命中，请优先使用供应商 Gemini 与原生 Base URL。'
      : '当前响应只有 OpenAI 兼容三项基础 usage，接口没有提供 prompt_tokens_details.cached_tokens 或任何 cache hit/miss 字段。';
    return modelHint;
  }
  if (/gemini/i.test(config.model) || config.provider === 'gemini') {
    return '未在 usage 中发现 Gemini 缓存字段 cachedContentTokenCount / cached_content_token_count；这表示本次响应未返回缓存统计，不能在前端推断命中。';
  }
  return 'API usage 中未发现缓存命中字段；这不是命中 0，而是接口未返回可判定字段。';
}

function isUsagePayload(candidate: unknown): candidate is Record<string, any> {
  if (!candidate || typeof candidate !== 'object') return false;
  return hasCoreUsageSignal(candidate as UsageLike) || hasCacheUsageSignal(candidate as UsageLike);
}

function normalizeCacheHitRate(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0) return undefined;
  if (value > 1) return Math.min(1, value / 100);
  return value;
}
