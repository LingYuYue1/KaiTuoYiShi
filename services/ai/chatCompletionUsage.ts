import type { API配置项 } from '@/models/settings';
import type { ChatCompletionRequest, ChatCompletionUsage } from './chatCompletionClient';

type UsagePayloadMatch = {
  usage: Record<string, any>;
  path: string;
};

export function emitUsageFromResponse(raw: unknown, config: API配置项, request: ChatCompletionRequest): void {
  if (!request.onUsage) return;
  const usage = extractUsage(raw, config);
  if (usage) request.onUsage(usage);
}

function extractUsage(raw: unknown, config: API配置项): ChatCompletionUsage | null {
  const matched = findUsagePayload(raw);
  if (!matched) return null;
  const { usage, path: usagePath } = matched;

  const inputTokens = firstNumber(
    usage.prompt_tokens,
    usage.promptTokens,
    usage.input_tokens,
    usage.inputTokens,
    usage.input_token_count,
    usage.inputTokenCount,
    usage.promptTokenCount,
    usage.prompt_tokens_count,
    usage.input_tokens_count,
    usage.prompt_eval_count,
    usage.promptEvalCount,
    usage.input_text_tokens,
    usage.inputTextTokens,
    usage.totalPromptTokens,
    usage.total_prompt_tokens,
    usage.tokens?.input_tokens,
    usage.tokens?.inputTokens,
    usage.metrics?.input_tokens,
    usage.metrics?.inputTokens,
    usage.billed_units?.input_tokens,
    usage.billedUnits?.inputTokens,
  );
  const outputTokens = firstNumber(
    usage.completion_tokens,
    usage.completionTokens,
    usage.output_tokens,
    usage.outputTokens,
    usage.output_token_count,
    usage.outputTokenCount,
    usage.candidatesTokenCount,
    usage.completion_tokens_count,
    usage.output_tokens_count,
    usage.eval_count,
    usage.evalCount,
    usage.output_text_tokens,
    usage.outputTextTokens,
    usage.totalCompletionTokens,
    usage.total_completion_tokens,
    usage.tokens?.output_tokens,
    usage.tokens?.outputTokens,
    usage.metrics?.output_tokens,
    usage.metrics?.outputTokens,
    usage.billed_units?.output_tokens,
    usage.billedUnits?.outputTokens,
  );
  const totalTokens = firstNumber(
    usage.total_tokens,
    usage.totalTokens,
    usage.totalTokenCount,
    usage.total_token_count,
    usage.total_tokens_count,
    usage.token_count,
    usage.tokenCount,
    usage.tokens?.total_tokens,
    usage.tokens?.totalTokens,
    usage.metrics?.total_tokens,
    usage.metrics?.totalTokens,
    typeof inputTokens === 'number' && typeof outputTokens === 'number' ? inputTokens + outputTokens : undefined,
  );
  const cachedTokens = firstNumber(
    usage.prompt_tokens_details?.cached_tokens,
    usage.prompt_tokens_details?.cachedTokens,
    usage.promptTokensDetails?.cached_tokens,
    usage.promptTokensDetails?.cachedTokens,
    usage.input_tokens_details?.cached_tokens,
    usage.input_tokens_details?.cachedTokens,
    usage.inputTokensDetails?.cached_tokens,
    usage.inputTokensDetails?.cachedTokens,
    usage.input_token_details?.cached_tokens,
    usage.input_token_details?.cachedTokens,
    usage.input_token_details?.cache_read,
    usage.input_token_details?.cacheRead,
    usage.input_token_details?.cache_read_input_tokens,
    usage.input_token_details?.cacheReadInputTokens,
    usage.inputTokenDetails?.cached_tokens,
    usage.inputTokenDetails?.cachedTokens,
    usage.inputTokenDetails?.cache_read,
    usage.inputTokenDetails?.cacheRead,
    usage.inputTokenDetails?.cacheReadInputTokens,
    usage.prompt_cache_hit_tokens,
    usage.promptCacheHitTokens,
    usage.prompt_cache_read_tokens,
    usage.promptCacheReadTokens,
    usage.prompt_cache_tokens,
    usage.promptCacheTokens,
    usage.cache_read_input_tokens,
    usage.cacheReadInputTokens,
    usage.cache_read_input_token_count,
    usage.cacheReadInputTokenCount,
    usage.cache_read_tokens,
    usage.cacheReadTokens,
    usage.cache_hit_tokens,
    usage.cacheHitTokens,
    usage.cache_hit_input_tokens,
    usage.cacheHitInputTokens,
    usage.cached_prompt_tokens,
    usage.cachedPromptTokens,
    usage.cached_input_tokens,
    usage.cachedInputTokens,
    usage.input_cached_tokens,
    usage.inputCachedTokens,
    usage.prompt_cached_tokens,
    usage.promptCachedTokens,
    usage.cache_tokens,
    usage.cacheTokens,
    usage.cached_tokens,
    usage.cachedTokens,
    usage.cachedContentTokenCount,
    usage.cached_content_token_count,
    usage.cachedContentTokens,
    usage.cache?.read_tokens,
    usage.cache?.readTokens,
    usage.cache?.read_input_tokens,
    usage.cache?.readInputTokens,
    usage.cache?.hit_tokens,
    usage.cache?.hitTokens,
    usage.cache?.hit_input_tokens,
    usage.cache?.hitInputTokens,
    usage.cache?.cached_tokens,
    usage.cache?.cachedTokens,
  );
  const explicitUncachedTokens = firstNumber(
    usage.prompt_cache_miss_tokens,
    usage.promptCacheMissTokens,
    usage.uncached_tokens,
    usage.uncachedTokens,
    usage.uncached_input_tokens,
    usage.uncachedInputTokens,
    usage.cache_miss_input_tokens,
    usage.cacheMissInputTokens,
    usage.cache_miss_tokens,
    usage.cacheMissTokens,
    usage.cache_creation_input_tokens,
    usage.cacheCreationInputTokens,
    usage.cache_creation_input_token_count,
    usage.cacheCreationInputTokenCount,
    usage.cache_write_input_tokens,
    usage.cacheWriteInputTokens,
    usage.cache_write_input_token_count,
    usage.cacheWriteInputTokenCount,
    usage.cache_write_tokens,
    usage.cacheWriteTokens,
    usage.prompt_cache_write_tokens,
    usage.promptCacheWriteTokens,
    usage.cache?.miss_tokens,
    usage.cache?.missTokens,
    usage.cache?.miss_input_tokens,
    usage.cache?.missInputTokens,
    usage.cache?.write_tokens,
    usage.cache?.writeTokens,
    usage.cache?.write_input_tokens,
    usage.cache?.writeInputTokens,
    usage.cache?.creation_tokens,
    usage.cache?.creationTokens,
    usage.cache?.creation_input_tokens,
    usage.cache?.creationInputTokens,
  );
  const explicitCacheHitRate = normalizeCacheHitRate(firstNumber(
    usage.cache_hit_rate,
    usage.cacheHitRate,
    usage.cache_hit_ratio,
    usage.cacheHitRatio,
    usage.cache?.hit_rate,
    usage.cache?.hitRate,
    usage.cache?.hit_ratio,
    usage.cache?.hitRatio,
  ));
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

function hasCoreUsageSignal(usage: Record<string, any>): boolean {
  return firstNumber(
    usage.prompt_tokens,
    usage.promptTokens,
    usage.input_tokens,
    usage.inputTokens,
    usage.input_token_count,
    usage.inputTokenCount,
    usage.promptTokenCount,
    usage.completion_tokens,
    usage.completionTokens,
    usage.output_tokens,
    usage.outputTokens,
    usage.output_token_count,
    usage.outputTokenCount,
    usage.candidatesTokenCount,
    usage.total_tokens,
    usage.totalTokens,
    usage.totalTokenCount,
    usage.total_token_count,
    usage.token_count,
    usage.tokenCount,
    usage.tokens?.input_tokens,
    usage.tokens?.inputTokens,
    usage.billed_units?.input_tokens,
    usage.billedUnits?.inputTokens,
  ) !== undefined;
}

function hasCacheUsageSignal(usage: Record<string, any>): boolean {
  return firstNumber(
    usage.prompt_tokens_details?.cached_tokens,
    usage.prompt_tokens_details?.cachedTokens,
    usage.promptTokensDetails?.cached_tokens,
    usage.promptTokensDetails?.cachedTokens,
    usage.input_tokens_details?.cached_tokens,
    usage.input_tokens_details?.cachedTokens,
    usage.inputTokensDetails?.cached_tokens,
    usage.inputTokensDetails?.cachedTokens,
    usage.input_token_details?.cached_tokens,
    usage.input_token_details?.cachedTokens,
    usage.inputTokenDetails?.cached_tokens,
    usage.inputTokenDetails?.cachedTokens,
    usage.prompt_cache_hit_tokens,
    usage.promptCacheHitTokens,
    usage.prompt_cache_read_tokens,
    usage.promptCacheReadTokens,
    usage.prompt_cache_tokens,
    usage.promptCacheTokens,
    usage.cache_read_input_tokens,
    usage.cacheReadInputTokens,
    usage.cache_read_tokens,
    usage.cacheReadTokens,
    usage.cache_hit_tokens,
    usage.cacheHitTokens,
    usage.cache_hit_input_tokens,
    usage.cacheHitInputTokens,
    usage.cached_prompt_tokens,
    usage.cachedPromptTokens,
    usage.cached_input_tokens,
    usage.cachedInputTokens,
    usage.input_cached_tokens,
    usage.inputCachedTokens,
    usage.prompt_cached_tokens,
    usage.promptCachedTokens,
    usage.cache_tokens,
    usage.cacheTokens,
    usage.cached_tokens,
    usage.cachedTokens,
    usage.cachedContentTokenCount,
    usage.cached_content_token_count,
    usage.cachedContentTokens,
    usage.prompt_cache_miss_tokens,
    usage.promptCacheMissTokens,
    usage.cache_miss_input_tokens,
    usage.cacheMissInputTokens,
    usage.cache_miss_tokens,
    usage.cacheMissTokens,
    usage.cache_creation_input_tokens,
    usage.cacheCreationInputTokens,
    usage.cache_write_input_tokens,
    usage.cacheWriteInputTokens,
    usage.prompt_cache_write_tokens,
    usage.promptCacheWriteTokens,
    usage.cache_hit_rate,
    usage.cacheHitRate,
    usage.cache_hit_ratio,
    usage.cacheHitRatio,
    usage.cache?.read_tokens,
    usage.cache?.readTokens,
    usage.cache?.hit_tokens,
    usage.cache?.hitTokens,
    usage.cache?.cached_tokens,
    usage.cache?.cachedTokens,
    usage.cache?.miss_tokens,
    usage.cache?.missTokens,
    usage.cache?.write_tokens,
    usage.cache?.writeTokens,
    usage.cache?.hit_rate,
    usage.cache?.hitRate,
  ) !== undefined;
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
  const usage = candidate as Record<string, any>;
  return firstNumber(
    usage.prompt_tokens,
    usage.promptTokens,
    usage.input_tokens,
    usage.inputTokens,
    usage.input_token_count,
    usage.inputTokenCount,
    usage.promptTokenCount,
    usage.completion_tokens,
    usage.completionTokens,
    usage.output_tokens,
    usage.outputTokens,
    usage.output_token_count,
    usage.outputTokenCount,
    usage.candidatesTokenCount,
    usage.total_tokens,
    usage.totalTokens,
    usage.totalTokenCount,
    usage.total_token_count,
    usage.token_count,
    usage.tokenCount,
    usage.prompt_cache_hit_tokens,
    usage.promptCacheHitTokens,
    usage.prompt_cache_miss_tokens,
    usage.promptCacheMissTokens,
    usage.prompt_cache_tokens,
    usage.promptCacheTokens,
    usage.input_cached_tokens,
    usage.inputCachedTokens,
    usage.prompt_cached_tokens,
    usage.promptCachedTokens,
    usage.cache_tokens,
    usage.cacheTokens,
    usage.cached_tokens,
    usage.cachedTokens,
    usage.cachedContentTokenCount,
    usage.cached_content_token_count,
    usage.cache_read_input_tokens,
    usage.cacheReadInputTokens,
    usage.cache_creation_input_tokens,
    usage.cacheCreationInputTokens,
    usage.cache_hit_rate,
    usage.cacheHitRate,
    usage.tokens?.input_tokens,
    usage.tokens?.inputTokens,
    usage.billed_units?.input_tokens,
    usage.billedUnits?.inputTokens,
  ) !== undefined;
}

function normalizeCacheHitRate(value: number | undefined): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0) return undefined;
  if (value > 1) return Math.min(1, value / 100);
  return value;
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return undefined;
}
