// 由 docs/plans/chatCompletionClient-deepclean-slim.md S7 拆分生成。
import type { API配置项 } from '@/models/settings';
import { buildClaudeRequestBody } from './chatCompletionClaude';
import { buildGeminiRequestBody } from './chatCompletionGemini';
import { applySamplingParams, buildOpenAICompatibleRequestBody, errorText, fetchWithApiErrorReport, isStreamUsageOptionUnsupported, throwApiError } from './chatCompletionOpenAICompat';
import { parseClaudeTextResponse, parseOpenAICompatibleTextResponse, parseOpenCodeGeminiText, parseOpenCodeResponsesText, readOpenAICompatibleStreamDelta, runSseStream } from './chatCompletionStream';
import type { ChatCompletionRequest, StreamCallbacks } from './chatCompletionTypes';
import { emitUsageFromResponse } from './chatCompletionUsage';

type OpenCodeEndpoint = 'responses' | 'messages' | 'gemini' | 'chat';


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
  // OpenCode GPT 系列支持 top_p / frequency_penalty / presence_penalty
  applySamplingParams(bodyObj, {
    topP: 'top_p',
    frequencyPenalty: 'frequency_penalty',
    presencePenalty: 'presence_penalty',
  }, request, config);
  if (system) bodyObj.instructions = system;
  return bodyObj;
}

function buildOpenCodeGeminiUrl(config: API配置项, stream: boolean): string {
  const base = normalizeOpenCodeBaseUrl(config.baseUrl);
  const model = encodeURIComponent(normalizeOpenCodeModelId(config.model));
  return `${base}/models/${model}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
}

export async function streamOpenCode(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const normalized = withOpenCodeNormalizedConfig(config);
  return streamOpenCodeEndpoint(normalized, messages, request, callbacks, inferOpenCodeEndpoint(normalized.model));
}

type StreamEndpointHandler = {
  来源标签: string;
  provider: string;
  构建URL: (config: API配置项, stream: boolean) => string;
  构建请求体: (config: API配置项, messages: Array<{ role: string; content: string }>, request: ChatCompletionRequest, stream: boolean, includeUsage: boolean) => string;
  usageRetry?: boolean; // D5：仅 chat 端点支持 include_usage 降级重试
};

/** 流式 4 端点差异表：仅 URL/标签/请求体 不同，其余收敛到 streamOpenCodeEndpoint 单执行路径。 */
const streamEndpointHandlers: Record<OpenCodeEndpoint, StreamEndpointHandler> = {
  chat: {
    来源标签: 'OpenCode Zen Chat 补全',
    provider: 'opencode-chat',
    构建URL: (config) => buildOpenCodeUrl(config, 'chat'),
    构建请求体: (config, messages, request, stream, includeUsage) => buildOpenCodeProxyBody(config, 'chat', buildOpenAICompatibleRequestBody(config, messages, request, stream, includeUsage), stream),
    usageRetry: true,
  },
  messages: {
    来源标签: 'OpenCode Zen Messages 补全',
    provider: 'opencode-messages',
    构建URL: (config) => buildOpenCodeUrl(config, 'messages'),
    构建请求体: (config, messages, request, stream) => buildOpenCodeProxyBody(config, 'messages', buildClaudeRequestBody(config, messages, request, stream), stream),
  },
  responses: {
    来源标签: 'OpenCode Zen Responses 补全',
    provider: 'opencode-responses',
    构建URL: (config) => buildOpenCodeUrl(config, 'responses'),
    构建请求体: (config, messages, request, stream) => buildOpenCodeProxyBody(config, 'responses', buildOpenCodeResponsesBody(config, messages, request, stream), stream),
  },
  gemini: {
    来源标签: 'OpenCode Zen Gemini 补全',
    provider: 'opencode-gemini',
    构建URL: (config, stream) => buildOpenCodeGeminiUrl(config, stream),
    构建请求体: (config, messages, request, stream) => buildOpenCodeProxyBody(config, 'gemini', buildGeminiRequestBody(config, messages, request), stream),
  },
};

async function streamOpenCodeEndpoint(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
  endpoint: OpenCodeEndpoint,
  includeUsage: boolean = true,
): Promise<string> {
  const handler = streamEndpointHandlers[endpoint];
  const upstreamUrl = handler.构建URL(config, true);
  const response = await fetchWithApiErrorReport(config, handler.来源标签, '/api/opencode', 'stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: handler.构建请求体(config, messages, request, true, includeUsage),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await errorText(response);
    if (handler.usageRetry && includeUsage && isStreamUsageOptionUnsupported(response.status, text)) {
      console.warn('[token-usage] OpenCode Chat 流式接口不支持 stream_options.include_usage，已自动降级为不请求 usage 的流式请求。');
      return streamOpenCodeEndpoint(config, messages, request, callbacks, endpoint, false);
    }
    await throwApiError(config, handler.来源标签, upstreamUrl, 'stream', response.status, text,
      (status, responseText) => formatOpenCodeError(config, endpoint, status, responseText));
  }

  return runSseStream(response, {
    provider: handler.provider,
    config,
    request,
    callbacks,
    extractText: readOpenAICompatibleStreamDelta,
  });
}

type NonStreamEndpointHandler = {
  来源标签: string;
  构建URL: (config: API配置项) => string;
  构建请求体: (config: API配置项, messages: Array<{ role: string; content: string }>, request: ChatCompletionRequest) => string;
  解析: (json: unknown) => string;
};

/** 非流式补全 4 端点差异表：仅 URL/标签/请求体/解析 不同，其余骨架收敛到 completionOpenCodeNonStream 单执行路径。 */
const nonStreamEndpointHandlers: Record<OpenCodeEndpoint, NonStreamEndpointHandler> = {
  chat: {
    来源标签: 'OpenCode Zen Chat 非流式补全',
    构建URL: (config) => buildOpenCodeUrl(config, 'chat'),
    构建请求体: (config, messages, request) => buildOpenCodeProxyBody(config, 'chat', buildOpenAICompatibleRequestBody(config, messages, request, false), false),
    解析: parseOpenAICompatibleTextResponse,
  },
  messages: {
    来源标签: 'OpenCode Zen Messages 非流式补全',
    构建URL: (config) => buildOpenCodeUrl(config, 'messages'),
    构建请求体: (config, messages, request) => buildOpenCodeProxyBody(config, 'messages', buildClaudeRequestBody(config, messages, request, false), false),
    解析: parseClaudeTextResponse,
  },
  gemini: {
    来源标签: 'OpenCode Zen Gemini 非流式补全',
    构建URL: (config) => buildOpenCodeGeminiUrl(config, false),
    构建请求体: (config, messages, request) => buildOpenCodeProxyBody(config, 'gemini', buildGeminiRequestBody(config, messages, request), false),
    解析: parseOpenCodeGeminiText,
  },
  responses: {
    来源标签: 'OpenCode Zen Responses 非流式补全',
    构建URL: (config) => buildOpenCodeUrl(config, 'responses'),
    构建请求体: (config, messages, request) => buildOpenCodeProxyBody(config, 'responses', buildOpenCodeResponsesBody(config, messages, request, false), false),
    解析: parseOpenCodeResponsesText,
  },
};

export async function completionOpenCodeNonStream(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
): Promise<string> {
  const normalized = withOpenCodeNormalizedConfig(config);
  const endpoint = inferOpenCodeEndpoint(normalized.model);
  const handler = nonStreamEndpointHandlers[endpoint];

  const upstreamUrl = handler.构建URL(normalized);
  const response = await fetchWithApiErrorReport(normalized, handler.来源标签, '/api/opencode', 'non-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: handler.构建请求体(normalized, messages, request),
    signal: request.signal,
  });
  if (!response.ok) {
    await throwApiError(normalized, handler.来源标签, upstreamUrl, 'non-stream', response.status, await errorText(response),
      (status, responseText) => formatOpenCodeError(normalized, endpoint, status, responseText));
  }
  const json = await response.json();
  emitUsageFromResponse(json, normalized, request);
  return handler.解析(json);
}
