import type { API配置项 } from '@/models/settings';
import type { 聊天消息, 回合Token消耗 } from '@/models/chat';
import { appendApiErrorReport } from './apiErrorReportService';

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

/** 丢弃模型的 reasoning_content / extended thinking / Gemini thought parts。
 *  这类「reasoning summary」是厂商内置格式（英文 **Header** 段），不受 system prompt 控制，
 *  会跳过我们设计的 Step0-Step10 CoT。统一只接收正式 content 流。 */

type ChatMessagePayload = { role: string; content: string; prefix?: boolean };

export interface ChatCompletionRequest {
  messages: ChatMessagePayload[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  onUsage?: (usage: ChatCompletionUsage) => void;
  /** DeepSeek beta prefix completion. Only the DeepSeek branch reads this flag. */
  prefixMode?: boolean;
  /** Assistant prefill used when prefixMode is true. */
  prefixContent?: string;
}

export type ChatCompletionUsage = Partial<Omit<回合Token消耗, 'source'>> & {
  source: 'api';
};

function detectProvider(config: API配置项): string {
  const url = config.baseUrl.toLowerCase();
  if (config.provider === 'opencode' || /opencode\.ai\/zen\/v1/i.test(url)) return 'opencode';
  if (config.provider === 'deepseek' || url.includes('deepseek')) return 'deepseek';
  if (config.provider === 'gemini' || url.includes('gemini') || url.includes('googleapis')) return 'gemini';
  if (
    config.enableClaudeMode === true &&
    (config.provider === 'claude' || config.provider === 'claude_compatible')
  ) {
    return 'claude';
  }
  return 'openai_compatible';
}

function buildMessages(
  systemPrompt: string | undefined,
  messages: ChatMessagePayload[],
): ChatMessagePayload[] {
  const result: ChatMessagePayload[] = [];
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }
  result.push(...messages);
  return result;
}

function isDeepSeekConfig(config: API配置项): boolean {
  return detectProvider(config) === 'deepseek' || /deepseek/i.test(config.model);
}

function isGeminiConfig(config: API配置项): boolean {
  const url = config.baseUrl.toLowerCase();
  return detectProvider(config) === 'gemini' || /gemini/i.test(config.model) || url.includes('googleapis');
}

function normalizeDeepSeekPrefixBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed || !/deepseek/i.test(trimmed)) return trimmed;
  if (/\/beta$/i.test(trimmed)) return trimmed;
  if (/\/v\d+$/i.test(trimmed)) return trimmed.replace(/\/v\d+$/i, '/beta');
  return `${trimmed}/beta`;
}

function shouldUseDeepSeekPrefix(config: API配置项, request: ChatCompletionRequest): boolean {
  return request.prefixMode === true && isDeepSeekConfig(config);
}

function withDeepSeekPrefixMessages(
  config: API配置项,
  messages: ChatMessagePayload[],
  request: ChatCompletionRequest,
): { config: API配置项; messages: ChatMessagePayload[]; prefix: string } {
  if (!shouldUseDeepSeekPrefix(config, request)) return { config, messages, prefix: '' };
  const prefix = request.prefixContent ?? '<thinking>\n';
  const withoutOldPrefix = messages.filter((msg) => msg.prefix !== true);
  return {
    config: {
      ...config,
      baseUrl: normalizeDeepSeekPrefixBaseUrl(config.baseUrl),
    },
    messages: [
      ...withoutOldPrefix,
      { role: 'assistant', content: prefix, prefix: true },
    ],
    prefix,
  };
}

function stripDeepSeekPrefixMessages(messages: ChatMessagePayload[]): ChatMessagePayload[] {
  return messages
    .filter((msg) => msg.prefix !== true)
    .map((msg) => {
      const { prefix: _prefix, ...rest } = msg;
      return rest;
    });
}

function mergePrefixResult(prefix: string, text: string): string {
  if (!prefix) return text;
  return text.startsWith(prefix) ? text : `${prefix}${text}`;
}

function isDeepSeekPrefixUnsupportedError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '');
  return /prefix/i.test(text) && /(unsupported|not support|不支持|invalid|beta|400|422)/i.test(text);
}

function normalizeClaudeBaseUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

function buildOpenAICompatibleChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
}

type OpenCodeEndpoint = 'responses' | 'messages' | 'gemini' | 'chat';

type UsagePayloadMatch = {
  usage: Record<string, any>;
  path: string;
};

function normalizeGeminiBaseUrl(baseUrl: string): string {
  return baseUrl
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/openai(?:\/chat\/completions)?$/i, '')
    .replace(/\/chat\/completions$/i, '');
}

function normalizeOpenCodeBaseUrl(baseUrl: string): string {
  let base = baseUrl.trim().replace(/\/+$/, '');
  base = base.split('?')[0] ?? base;
  base = base
    .replace(/\/zen\/go\/v1/i, '/zen/v1')
    .replace(/\/chat\/completions$/i, '')
    .replace(/\/messages$/i, '')
    .replace(/\/responses$/i, '')
    .replace(/\/models\/[^/]+(?::(?:stream)?generateContent)?$/i, '');
  if (/\/zen$/i.test(base)) return `${base}/v1`;
  return base;
}

function normalizeOpenCodeModelId(model: string): string {
  return model.trim().replace(/^opencode\//i, '');
}

function inferOpenCodeEndpoint(model: string): OpenCodeEndpoint {
  const id = normalizeOpenCodeModelId(model).toLowerCase();
  if (/^gpt[-_]/.test(id)) return 'responses';
  if (/^(claude|qwen)/.test(id)) return 'messages';
  if (/^gemini/.test(id)) return 'gemini';
  return 'chat';
}

function withOpenCodeNormalizedConfig(config: API配置项): API配置项 {
  return {
    ...config,
    baseUrl: normalizeOpenCodeBaseUrl(config.baseUrl),
    model: normalizeOpenCodeModelId(config.model),
  };
}

function openCodeHeaders(config: API配置项, mode: 'openai' | 'anthropic' | 'gemini' = 'openai'): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (mode === 'anthropic') {
    headers['x-api-key'] = config.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
  }
  if (mode === 'gemini') {
    headers['x-goog-api-key'] = config.apiKey;
  }
  return headers;
}

function buildOpenCodeUrl(config: API配置项, endpoint: OpenCodeEndpoint): string {
  const base = normalizeOpenCodeBaseUrl(config.baseUrl);
  if (endpoint === 'responses') return `${base}/responses`;
  if (endpoint === 'messages') return `${base}/messages`;
  if (endpoint === 'gemini') return `${base}/models/${encodeURIComponent(normalizeOpenCodeModelId(config.model))}`;
  return `${base}/chat/completions`;
}

function buildOpenCodeProxyBody(
  config: API配置项,
  endpoint: OpenCodeEndpoint,
  body: Record<string, unknown>,
  stream: boolean,
): string {
  return JSON.stringify({
    kind: 'chat',
    endpoint,
    baseUrl: normalizeOpenCodeBaseUrl(config.baseUrl),
    apiKey: config.apiKey,
    model: normalizeOpenCodeModelId(config.model),
    stream,
    body,
  });
}

function formatOpenCodeError(config: API配置项, endpoint: OpenCodeEndpoint, status: number, text: string): Error {
  const model = normalizeOpenCodeModelId(config.model);
  const lowerText = text.toLowerCase();
  const path = endpoint === 'responses'
    ? '/responses'
    : endpoint === 'messages'
      ? '/messages'
      : endpoint === 'gemini'
        ? '/models/{model}:generateContent'
        : '/chat/completions';
  const hint = (() => {
    if (lowerText.includes('creditserror') || lowerText.includes('insufficient balance')) {
      return 'OpenCode Zen 工作区余额不足，请先到 OpenCode Billing 充值，或切换到有余额的工作区/API Key。';
    }
    if (status === 401 || status === 403) return '请检查 OpenCode Zen API Key、余额、工作区权限和该模型是否已启用。';
    if (status === 404) return `请检查模型 ID 是否存在于 OpenCode Zen 模型列表；当前模型 ${model || '（空）'} 按 ${path} 路由。GPT 走 /responses，Claude/Qwen 走 /messages，Gemini 走 /models/{model}:generateContent，其余模型走 /chat/completions。`;
    if (status === 400) return '请检查模型 ID、上下文长度和请求参数；如果模型来自 OpenCode 配置示例，可直接填 opencode/xxx，系统会自动去掉 opencode/ 前缀。';
    return '请检查 OpenCode Zen Base URL、模型 ID、Key、余额和模型权限。';
  })();
  return new Error(`OpenCode Zen API Error ${status}: ${hint}\n${text}`);
}

function buildQianfanProxyBody(config: API配置项, body: Record<string, unknown>): string {
  return JSON.stringify({
    kind: 'chat',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    body,
  });
}

function isBaiduQianfanConfig(config: API配置项): boolean {
  return config.provider === 'baidu' || /qianfan\.baidubce\.com/i.test(config.baseUrl);
}

function normalizeOpenAICompatibleModel(config: API配置项): string {
  const model = config.model.trim();
  if (isBaiduQianfanConfig(config) && /^glm[-_\s]?5\.1$/i.test(model)) {
    return 'glm-5.1';
  }
  return model;
}

function buildOpenAICompatibleRequestBody(
  config: API配置项,
  messages: ChatMessagePayload[],
  request: ChatCompletionRequest,
  stream: boolean,
  includeUsage: boolean = true,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: normalizeOpenAICompatibleModel(config),
    messages,
    max_tokens: request.maxTokens ?? config.maxTokens ?? 2048,
    temperature: request.temperature ?? config.temperature ?? 0.8,
    stream,
  };
  if (stream && includeUsage && request.onUsage) {
    body.stream_options = { include_usage: true };
  }
  return body;
}

function isStreamUsageOptionUnsupported(status: number, text: string): boolean {
  if (![400, 404, 422].includes(status)) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('stream_options') ||
    lower.includes('stream options') ||
    lower.includes('include_usage') ||
    lower.includes('include usage') ||
    lower.includes('unsupported parameter') ||
    lower.includes('unknown parameter') ||
    lower.includes('unrecognized parameter') ||
    lower.includes('invalid parameter') ||
    lower.includes('extra_forbidden') ||
    lower.includes('not support')
  );
}

function emitUsageFromResponse(raw: unknown, config: API配置项, request: ChatCompletionRequest): void {
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

function formatOpenAICompatibleError(config: API配置项, status: number, text: string): Error {
  if (isBaiduQianfanConfig(config)) {
    const model = config.model.trim();
    const normalized = normalizeOpenAICompatibleModel(config);
    const aliasHint = model && model !== normalized
      ? `已将模型名 ${model} 按百度千帆兼容规则归一为 ${normalized}；`
      : '';
    const lower = text.toLowerCase();
    const hint = (() => {
      if (status === 401 || status === 403) return '请检查百度千帆 API Key、账号权限和 Coding Plan 模型权限；如果错误码是 coding_plan_api_key_not_allowed，说明某个独立 API 仍在用 /v2，代理会自动补试 /v2/coding。';
      if (status === 404) return `${aliasHint}官方 GLM-5.1 的 model 参数接入点 ID 是 glm-5.1；Coding Plan Key 必须继续使用 /v2/coding，系统只会在该路径下尝试大小写别名。若仍 404，请检查该 API Key 的千帆模型列表是否实际包含 glm-5.1，或账号是否开通该模型。`;
      if (status === 400 && (lower.includes('model') || lower.includes('parameter') || lower.includes('1210'))) {
        return `${aliasHint}请优先确认模型 ID 填 glm-5.1；如果仍失败，说明当前千帆账号或 Coding Plan 对该模型/参数未开放。`;
      }
      return `${aliasHint}请检查百度千帆 Base URL、模型 ID、Key 与账号权限。`;
    })();
    return new Error(`百度千帆 API Error ${status}: ${hint}\n${text}`);
  }
  return new Error(`API Error ${status}: ${text}`);
}

async function fetchWithApiErrorReport(
  config: API配置项,
  source: string,
  url: string,
  requestMode: 'stream' | 'non-stream' | 'models' | 'test' | 'unknown',
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    void appendApiErrorReport({
      source,
      config,
      requestUrl: url,
      requestMode,
      error,
    });
    throw error;
  }
}

function normalizeClaudeMessages(
  messages: Array<{ role: string; content: string }>,
): { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> } {
  const system = messages
    .filter((m) => m.role === 'system' && m.content.trim())
    .map((m) => m.content.trim())
    .join('\n\n');
  const normalized: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === 'system') continue;
    const content = msg.content.trim();
    if (!content) continue;
    const role: 'user' | 'assistant' = msg.role === 'assistant' ? 'assistant' : 'user';
    const last = normalized[normalized.length - 1];
    if (last?.role === role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      normalized.push({ role, content });
    }
  }

  if (normalized.length === 0 || normalized[0].role !== 'user') {
    normalized.unshift({ role: 'user', content: '请开始本轮回应。' });
  }
  if (normalized[normalized.length - 1]?.role !== 'user') {
    normalized.push({ role: 'user', content: '请继续并完成当前请求。' });
  }

  return { system, messages: normalized };
}

function buildClaudeRequestBody(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  stream: boolean,
): Record<string, unknown> {
  const claudePayload = normalizeClaudeMessages(messages);
  const bodyObj: Record<string, unknown> = {
    model: config.model,
    max_tokens: request.maxTokens ?? config.maxTokens ?? 2048,
    messages: claudePayload.messages,
    stream,
  };
  if (claudePayload.system) {
    bodyObj.system = claudePayload.system;
  }
  return bodyObj;
}

function claudeHeaders(config: API配置项): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function formatClaudeError(status: number, text: string): Error {
  const lower = text.toLowerCase();
  const hint = (() => {
    if (status === 401) return 'API Key 无效或未授权。';
    if (status === 403) return '账号权限、模型权限、地区限制或浏览器直连权限被拒绝。';
    if (status === 404) return 'Base URL、/v1 路径或模型名可能不正确。';
    if (status === 400 && (lower.includes('final') || lower.includes('role'))) {
      return '消息角色格式不符合 Claude 要求；客户端已自动尝试保证最后一条为用户内容。';
    }
    if (
      status === 400 &&
      (lower.includes('unsupported parameter') ||
        lower.includes('temperature') ||
        lower.includes('top_p') ||
        lower.includes('top_k') ||
        lower.includes('thinking'))
    ) {
      return 'Claude 模型拒绝了可选参数；当前客户端默认不会上传 temperature / top_p / top_k / thinking。';
    }
    if (lower.includes('failed to fetch') || lower.includes('cors')) {
      return '浏览器直连或 CORS 被拦截，请检查代理是否允许浏览器访问。';
    }
    return '请检查 Claude 专用模式、供应商类型、Base URL、模型名和 Key。';
  })();
  return new Error(`Claude API Error ${status}: ${hint}\n${text}`);
}

function parseClaudeTextResponse(json: unknown): string {
  const data = json as { content?: Array<{ type?: string; text?: string }> };
  return (data.content ?? [])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('');
}

export async function chatCompletion(
  config: API配置项,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const provider = detectProvider(config);
  const msgs = buildMessages(request.systemPrompt, request.messages);

  if (provider === 'opencode') {
    return streamOpenCode(config, msgs, request, callbacks);
  }
  if (provider === 'deepseek') {
    const payload = withDeepSeekPrefixMessages(config, msgs, request);
    try {
      const text = await streamOpenAICompatible(payload.config, payload.messages, request, callbacks);
      return mergePrefixResult(payload.prefix, text);
    } catch (error) {
      if (payload.prefix && isDeepSeekPrefixUnsupportedError(error)) {
        console.warn('[DeepSeek Prefix] 当前接口不支持 prefix，已自动降级为标准模式。', error);
        return streamOpenAICompatible(config, stripDeepSeekPrefixMessages(msgs), { ...request, prefixMode: false }, callbacks);
      }
      throw error;
    }
  }
  if (provider === 'claude') {
    return streamClaude(config, msgs, request, callbacks);
  }
  if (provider === 'gemini') {
    return streamGemini(config, msgs, request, callbacks);
  }
  return streamOpenAICompatible(config, msgs, request, callbacks);
}

// ── OpenAI-compatible streaming (SSE) ──

async function streamOpenAICompatible(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
  includeUsage: boolean = true,
): Promise<string> {
  const upstreamUrl = buildOpenAICompatibleChatUrl(config.baseUrl);
  const requestBody = buildOpenAICompatibleRequestBody(config, messages, request, true, includeUsage);
  const url = isBaiduQianfanConfig(config) ? '/api/qianfan' : upstreamUrl;
  const body = isBaiduQianfanConfig(config) ? buildQianfanProxyBody(config, requestBody) : JSON.stringify(requestBody);

  const response = await fetchWithApiErrorReport(config, '聊天补全', url, 'stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body,
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (includeUsage && isStreamUsageOptionUnsupported(response.status, text)) {
      console.warn('[token-usage] 当前流式接口不支持 stream_options.include_usage，已自动降级为不请求 usage 的流式请求。');
      return streamOpenAICompatible(config, messages, request, callbacks, false);
    }
    void appendApiErrorReport({
      source: '聊天补全',
      config,
      status: response.status,
      requestUrl: upstreamUrl,
      requestMode: 'stream',
      responseText: text,
    });
    throw formatOpenAICompatibleError(config, response.status, text);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          emitUsageFromResponse(parsed, config, request);
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          // 只接收正式 content；reasoning_content（厂商内置思考摘要）整路丢弃
          if (delta.content) {
            fullText += delta.content;
            callbacks.onDelta(delta.content);
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone();
  return fullText;
}

// ── Claude streaming (Anthropic Messages API) ──

async function streamClaude(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const url = `${normalizeClaudeBaseUrl(config.baseUrl)}/messages`;
  const body = JSON.stringify(buildClaudeRequestBody(config, messages, request, true));

  const response = await fetchWithApiErrorReport(config, 'Claude 聊天补全', url, 'stream', {
    method: 'POST',
    headers: claudeHeaders(config),
    body,
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    void appendApiErrorReport({
      source: 'Claude 聊天补全',
      config,
      status: response.status,
      requestUrl: url,
      requestMode: 'stream',
      responseText: text,
    });
    throw formatClaudeError(response.status, text);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  // Claude extended thinking 用独立 content_block，type='thinking' 的 block 内的 delta 是 thinking_delta
  let currentBlockIsThinking = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();

        try {
          const parsed = JSON.parse(data);
          emitUsageFromResponse(parsed, config, request);
          if (parsed.type === 'content_block_start') {
            currentBlockIsThinking = parsed.content_block?.type === 'thinking';
            if (currentBlockIsThinking) continue;
            const text = parsed.content_block?.text ?? '';
            if (text) {
              fullText += text;
              callbacks.onDelta(text);
            }
          } else if (parsed.type === 'content_block_delta') {
            const deltaType = parsed.delta?.type;
            // 丢弃 extended thinking delta（厂商内置思考摘要）
            if (deltaType === 'thinking_delta' || currentBlockIsThinking) continue;
            const t = parsed.delta?.text ?? '';
            if (t) {
              fullText += t;
              callbacks.onDelta(t);
            }
          } else if (parsed.type === 'content_block_stop') {
            currentBlockIsThinking = false;
          }
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone();
  return fullText;
}

async function completionClaudeNonStream(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
): Promise<string> {
  const url = `${normalizeClaudeBaseUrl(config.baseUrl)}/messages`;
  const response = await fetchWithApiErrorReport(config, 'Claude 非流式补全', url, 'non-stream', {
    method: 'POST',
    headers: claudeHeaders(config),
    body: JSON.stringify(buildClaudeRequestBody(config, messages, request, false)),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    void appendApiErrorReport({
      source: 'Claude 非流式补全',
      config,
      status: response.status,
      requestUrl: url,
      requestMode: 'non-stream',
      responseText: text,
    });
    throw formatClaudeError(response.status, text);
  }

  const json = await response.json();
  emitUsageFromResponse(json, config, request);
  return parseClaudeTextResponse(json);
}

// ── OpenCode Zen (model-family routed) ──

function buildOpenCodeResponsesBody(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  stream: boolean,
): Record<string, unknown> {
  const system = messages
    .filter((m) => m.role === 'system' && m.content.trim())
    .map((m) => m.content.trim())
    .join('\n\n');
  const input = messages
    .filter((m) => m.role !== 'system' && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }));
  if (input.length === 0) {
    input.push({ role: 'user', content: '请开始本轮回应。' });
  }

  const bodyObj: Record<string, unknown> = {
    model: normalizeOpenCodeModelId(config.model),
    input,
    max_output_tokens: request.maxTokens ?? config.maxTokens ?? 2048,
    temperature: request.temperature ?? config.temperature ?? 0.8,
    stream,
  };
  if (system) bodyObj.instructions = system;
  return bodyObj;
}

function buildOpenCodeGeminiBody(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
): Record<string, unknown> {
  const systemMsg = messages.find((m) => m.role === 'system');
  const contents = messages
    .filter((m) => m.role !== 'system' && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  if (contents.length === 0) {
    contents.push({ role: 'user', parts: [{ text: '请开始本轮回应。' }] });
  }

  const bodyObj: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: request.maxTokens ?? config.maxTokens ?? 2048,
      temperature: request.temperature ?? config.temperature ?? 0.8,
    },
  };
  if (systemMsg?.content.trim()) {
    bodyObj.systemInstruction = {
      parts: [{ text: systemMsg.content }],
    };
  }
  return bodyObj;
}

function buildOpenCodeGeminiUrl(config: API配置项, stream: boolean): string {
  const base = normalizeOpenCodeBaseUrl(config.baseUrl);
  const model = encodeURIComponent(normalizeOpenCodeModelId(config.model));
  return `${base}/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
}

function parseOpenCodeResponsesText(json: unknown): string {
  const data = json as {
    output_text?: string;
    text?: string;
    choices?: Array<{ message?: { content?: string } }>;
    output?: Array<{
      content?: Array<{ type?: string; text?: string; content?: string }>;
    }>;
  };
  if (typeof data.output_text === 'string') return data.output_text;
  if (typeof data.text === 'string') return data.text;
  const fromOutput = (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((part) => part?.type === 'output_text' || part?.type === 'text' || typeof part?.text === 'string')
    .map((part) => part.text ?? part.content ?? '')
    .join('');
  if (fromOutput) return fromOutput;
  return data.choices?.[0]?.message?.content ?? '';
}

function parseOpenCodeGeminiText(json: unknown): string {
  const data = json as { candidates?: Array<{ content?: { parts?: Array<{ text?: string; thought?: boolean }> } }> };
  return (data.candidates?.[0]?.content?.parts ?? [])
    .filter((part) => !part.thought && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('');
}

function readOpenCodeResponsesStreamDelta(parsed: any): string {
  if (
    parsed?.type === 'response.output_text.delta' ||
    parsed?.type === 'response.text.delta' ||
    parsed?.type === 'response.content_part.delta'
  ) {
    return parsed.delta?.text ?? parsed.delta ?? '';
  }
  return parsed?.choices?.[0]?.delta?.content ?? parsed?.delta?.text ?? '';
}

async function streamOpenCode(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const normalized = withOpenCodeNormalizedConfig(config);
  const endpoint = inferOpenCodeEndpoint(normalized.model);
  if (endpoint === 'chat') {
    return streamOpenCodeChat(normalized, messages, request, callbacks);
  }
  if (endpoint === 'messages') {
    return streamOpenCodeMessages(normalized, messages, request, callbacks);
  }
  if (endpoint === 'gemini') {
    return streamOpenCodeGemini(normalized, messages, request, callbacks);
  }
  return streamOpenCodeResponses(normalized, messages, request, callbacks);
}

async function streamOpenCodeChat(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
  includeUsage: boolean = true,
): Promise<string> {
  const endpoint: OpenCodeEndpoint = 'chat';
  const upstreamUrl = buildOpenCodeUrl(config, endpoint);
  const requestBody = buildOpenAICompatibleRequestBody(config, messages, request, true, includeUsage);
  const response = await fetchWithApiErrorReport(config, 'OpenCode Zen Chat 补全', '/api/opencode', 'stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildOpenCodeProxyBody(config, endpoint, requestBody, true),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    if (includeUsage && isStreamUsageOptionUnsupported(response.status, text)) {
      console.warn('[token-usage] OpenCode Chat 流式接口不支持 stream_options.include_usage，已自动降级为不请求 usage 的流式请求。');
      return streamOpenCodeChat(config, messages, request, callbacks, false);
    }
    void appendApiErrorReport({
      source: 'OpenCode Zen Chat 补全',
      config,
      status: response.status,
      requestUrl: upstreamUrl,
      requestMode: 'stream',
      responseText: text,
    });
    throw formatOpenCodeError(config, endpoint, response.status, text);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          emitUsageFromResponse(parsed, config, request);
          const delta = parsed.choices?.[0]?.delta;
          const text = delta?.content ?? '';
          if (text) {
            fullText += text;
            callbacks.onDelta(text);
          }
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone();
  return fullText;
}

async function streamOpenCodeMessages(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const endpoint: OpenCodeEndpoint = 'messages';
  const upstreamUrl = buildOpenCodeUrl(config, endpoint);
  const response = await fetchWithApiErrorReport(config, 'OpenCode Zen Messages 补全', '/api/opencode', 'stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildOpenCodeProxyBody(config, endpoint, buildClaudeRequestBody(config, messages, request, true), true),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    void appendApiErrorReport({
      source: 'OpenCode Zen Messages 补全',
      config,
      status: response.status,
      requestUrl: upstreamUrl,
      requestMode: 'stream',
      responseText: text,
    });
    throw formatOpenCodeError(config, endpoint, response.status, text);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';
  let currentBlockIsThinking = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          emitUsageFromResponse(parsed, config, request);
          if (parsed.type === 'content_block_start') {
            currentBlockIsThinking = parsed.content_block?.type === 'thinking';
            if (currentBlockIsThinking) continue;
            const text = parsed.content_block?.text ?? '';
            if (text) {
              fullText += text;
              callbacks.onDelta(text);
            }
          } else if (parsed.type === 'content_block_delta') {
            if (parsed.delta?.type === 'thinking_delta' || currentBlockIsThinking) continue;
            const text = parsed.delta?.text ?? '';
            if (text) {
              fullText += text;
              callbacks.onDelta(text);
            }
          } else if (parsed.type === 'content_block_stop') {
            currentBlockIsThinking = false;
          }
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone();
  return fullText;
}

async function streamOpenCodeResponses(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const endpoint: OpenCodeEndpoint = 'responses';
  const upstreamUrl = buildOpenCodeUrl(config, endpoint);
  const response = await fetchWithApiErrorReport(config, 'OpenCode Zen Responses 补全', '/api/opencode', 'stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildOpenCodeProxyBody(config, endpoint, buildOpenCodeResponsesBody(config, messages, request, true), true),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    void appendApiErrorReport({
      source: 'OpenCode Zen Responses 补全',
      config,
      status: response.status,
      requestUrl: upstreamUrl,
      requestMode: 'stream',
      responseText: text,
    });
    throw formatOpenCodeError(config, endpoint, response.status, text);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          emitUsageFromResponse(parsed, config, request);
          const text = readOpenCodeResponsesStreamDelta(parsed);
          if (text) {
            fullText += text;
            callbacks.onDelta(text);
          }
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone();
  return fullText;
}

async function streamOpenCodeGemini(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const endpoint: OpenCodeEndpoint = 'gemini';
  const upstreamUrl = buildOpenCodeGeminiUrl(config, true);
  const response = await fetchWithApiErrorReport(config, 'OpenCode Zen Gemini 补全', '/api/opencode', 'stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildOpenCodeProxyBody(config, endpoint, buildOpenCodeGeminiBody(config, messages, request), true),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    void appendApiErrorReport({
      source: 'OpenCode Zen Gemini 补全',
      config,
      status: response.status,
      requestUrl: upstreamUrl,
      requestMode: 'stream',
      responseText: text,
    });
    throw formatOpenCodeError(config, endpoint, response.status, text);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          emitUsageFromResponse(parsed, config, request);
          const text = parseOpenCodeGeminiText(parsed);
          if (text) {
            fullText += text;
            callbacks.onDelta(text);
          }
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone();
  return fullText;
}

async function completionOpenCodeNonStream(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
): Promise<string> {
  const normalized = withOpenCodeNormalizedConfig(config);
  const endpoint = inferOpenCodeEndpoint(normalized.model);

  if (endpoint === 'chat') {
    const upstreamUrl = buildOpenCodeUrl(normalized, endpoint);
    const response = await fetchWithApiErrorReport(normalized, 'OpenCode Zen Chat 非流式补全', '/api/opencode', 'non-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildOpenCodeProxyBody(normalized, endpoint, buildOpenAICompatibleRequestBody(normalized, messages, request, false), false),
      signal: request.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      void appendApiErrorReport({
        source: 'OpenCode Zen Chat 非流式补全',
        config: normalized,
        status: response.status,
        requestUrl: upstreamUrl,
        requestMode: 'non-stream',
        responseText: text,
      });
      throw formatOpenCodeError(normalized, endpoint, response.status, text);
    }
    const json = await response.json();
    emitUsageFromResponse(json, normalized, request);
    return json.choices?.[0]?.message?.content ?? '';
  }

  if (endpoint === 'messages') {
    const upstreamUrl = buildOpenCodeUrl(normalized, endpoint);
    const response = await fetchWithApiErrorReport(normalized, 'OpenCode Zen Messages 非流式补全', '/api/opencode', 'non-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildOpenCodeProxyBody(normalized, endpoint, buildClaudeRequestBody(normalized, messages, request, false), false),
      signal: request.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      void appendApiErrorReport({
        source: 'OpenCode Zen Messages 非流式补全',
        config: normalized,
        status: response.status,
        requestUrl: upstreamUrl,
        requestMode: 'non-stream',
        responseText: text,
      });
      throw formatOpenCodeError(normalized, endpoint, response.status, text);
    }
    const json = await response.json();
    emitUsageFromResponse(json, normalized, request);
    return parseClaudeTextResponse(json);
  }

  if (endpoint === 'gemini') {
    const upstreamUrl = buildOpenCodeGeminiUrl(normalized, false);
    const response = await fetchWithApiErrorReport(normalized, 'OpenCode Zen Gemini 非流式补全', '/api/opencode', 'non-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: buildOpenCodeProxyBody(normalized, endpoint, buildOpenCodeGeminiBody(normalized, messages, request), false),
      signal: request.signal,
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      void appendApiErrorReport({
        source: 'OpenCode Zen Gemini 非流式补全',
        config: normalized,
        status: response.status,
        requestUrl: upstreamUrl,
        requestMode: 'non-stream',
        responseText: text,
      });
      throw formatOpenCodeError(normalized, endpoint, response.status, text);
    }
    const json = await response.json();
    emitUsageFromResponse(json, normalized, request);
    return parseOpenCodeGeminiText(json);
  }

  const upstreamUrl = buildOpenCodeUrl(normalized, endpoint);
  const response = await fetchWithApiErrorReport(normalized, 'OpenCode Zen Responses 非流式补全', '/api/opencode', 'non-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildOpenCodeProxyBody(normalized, endpoint, buildOpenCodeResponsesBody(normalized, messages, request, false), false),
    signal: request.signal,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    void appendApiErrorReport({
      source: 'OpenCode Zen Responses 非流式补全',
      config: normalized,
      status: response.status,
      requestUrl: upstreamUrl,
      requestMode: 'non-stream',
      responseText: text,
    });
    throw formatOpenCodeError(normalized, endpoint, response.status, text);
  }
  const json = await response.json();
  emitUsageFromResponse(json, normalized, request);
  return parseOpenCodeResponsesText(json);
}

// ── Gemini streaming ──

async function streamGemini(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const url = `${normalizeGeminiBaseUrl(config.baseUrl)}/models/${config.model}:streamGenerateContent?alt=sse`;
  const systemMsg = messages.find((m) => m.role === 'system');

  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const bodyObj: Record<string, unknown> = {
    contents,
    generationConfig: {
      maxOutputTokens: request.maxTokens ?? config.maxTokens ?? 2048,
      temperature: request.temperature ?? config.temperature ?? 0.8,
    },
  };
  if (systemMsg) {
    bodyObj.systemInstruction = {
      parts: [{ text: systemMsg.content }],
    };
  }

  const response = await fetchWithApiErrorReport(config, 'Gemini 聊天补全', url, 'stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': config.apiKey,
    },
    body: JSON.stringify(bodyObj),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    void appendApiErrorReport({
      source: 'Gemini 聊天补全',
      config,
      status: response.status,
      requestUrl: url,
      requestMode: 'stream',
      responseText: text,
    });
    throw new Error(`Gemini API Error ${response.status}: ${text}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const data = trimmed.slice(5).trim();

        try {
          const parsed = JSON.parse(data);
          emitUsageFromResponse(parsed, config, request);
          const parts = parsed.candidates?.[0]?.content?.parts;
          if (parts) {
            for (const part of parts) {
              // Gemini Thinking parts 带 thought:true → 丢弃（厂商内置思考摘要）
              if (part.thought) continue;
              const text = part.text ?? '';
              if (text) {
                fullText += text;
                callbacks.onDelta(text);
              }
            }
          }
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  callbacks.onDone();
  return fullText;
}

// ── Non-streaming fallback ──

export async function chatCompletionNonStream(
  config: API配置项,
  request: ChatCompletionRequest,
): Promise<string> {
  const provider = detectProvider(config);
  const msgs = buildMessages(request.systemPrompt, request.messages);
  if (provider === 'opencode') {
    return completionOpenCodeNonStream(config, msgs, request);
  }

  if (provider === 'claude') {
    return completionClaudeNonStream(config, msgs, request);
  }

  if (provider === 'gemini') {
    return chatCompletion(config, request, {
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
    });
  }

  const deepSeekPayload = provider === 'deepseek'
    ? withDeepSeekPrefixMessages(config, msgs, request)
    : { config, messages: msgs, prefix: '' };

  const effectiveUrl = isBaiduQianfanConfig(deepSeekPayload.config)
    ? '/api/qianfan'
    : buildOpenAICompatibleChatUrl(deepSeekPayload.config.baseUrl);
  const response = await fetchWithApiErrorReport(deepSeekPayload.config, '非流式补全', effectiveUrl, 'non-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${deepSeekPayload.config.apiKey}`,
    },
    body: isBaiduQianfanConfig(deepSeekPayload.config)
      ? buildQianfanProxyBody(deepSeekPayload.config, buildOpenAICompatibleRequestBody(deepSeekPayload.config, deepSeekPayload.messages, request, false))
      : JSON.stringify(buildOpenAICompatibleRequestBody(deepSeekPayload.config, deepSeekPayload.messages, request, false)),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = formatOpenAICompatibleError(deepSeekPayload.config, response.status, text);
    if (deepSeekPayload.prefix && isDeepSeekPrefixUnsupportedError(error)) {
      console.warn('[DeepSeek Prefix] 当前接口不支持 prefix，已自动降级为标准模式。', error);
      return chatCompletionNonStream(config, {
        ...request,
        messages: request.messages,
        prefixMode: false,
        prefixContent: undefined,
      });
    }
    void appendApiErrorReport({
      source: '非流式补全',
      config: deepSeekPayload.config,
      status: response.status,
      requestUrl: effectiveUrl,
      requestMode: 'non-stream',
      responseText: text,
    });
    throw error;
  }

  const json = await response.json();
  emitUsageFromResponse(json, deepSeekPayload.config, request);
  return mergePrefixResult(deepSeekPayload.prefix, json.choices?.[0]?.message?.content ?? '');
}
