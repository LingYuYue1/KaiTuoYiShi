import type { API配置项 } from '@/models/settings';
import type { 回合Token消耗 } from '@/models/chat';
import { appendApiErrorReport } from './apiErrorReportService';
import { normalizePioneerBaseUrl } from './pioneerProxyCore';
import { buildArkProxyBody, normalizeArkBaseUrl } from './arkProxyCore';
import { normalizeGeminiBaseUrl } from './geminiEndpointPolicy';
import {
  executeWithDeepSeekDiagnostics,
  type DeepSeekAttemptDiagnostics,
  type DeepSeekDiagnosticsSummary,
} from './deepSeekDiagnostics';
import { emitUsageFromResponse } from './chatCompletionUsage';
import {
  buildMessages,
  buildOpenAICompatibleChatUrl,
  detectProvider,
  mergePrefixResult,
  normalizeClaudeBaseUrl,
  normalizeDeepSeekPrefixBaseUrl,
  shouldUseClaudeMessagesApi,
  withPrefixMessages,
  type ChatMessagePayload,
} from './chatCompletionProtocol';
import {
  buildClaudeRequestBody, buildMimoAuthHeaders, buildOpenAICompatibleRequestBody,
  buildPioneerProxyBody, buildQianfanProxyBody, claudeHeaders, fetchWithApiErrorReport,
  formatClaudeError, formatOpenAICompatibleError, isArkConfig, isBaiduQianfanConfig,
  isMimoConfig, isPioneerConfig, normalizeMimoBaseUrl,
  parseClaudeTextResponse,
} from './chatCompletionTransportHelpers';

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
  /** 可选：stream 解析到 finish_reason / stop_reason / finishReason 时回调。
   *  用于抗截断检测（finishReason === 'length' / 'max_tokens' 表示被 max_tokens 截断）。 */
  onFinishReason?: (reason: string) => void;
}

/** 丢弃模型的 reasoning_content / extended thinking / Gemini thought parts。
 *  这类「reasoning summary」是厂商内置格式（英文 **Header** 段），不受 system prompt 控制，
 *  会跳过我们设计的 Step0-Step10 CoT。统一只接收正式 content 流。 */

export interface ChatCompletionRequest {
  messages: ChatMessagePayload[];
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  /** 核采样概率阈值（0-1）。 */
  topP?: number;
  /** 保留概率最高的前 K 个候选词。仅 Gemini 原生消费。 */
  topK?: number;
  /** 动态阈值采样。当前预留，无 provider 实际消费。 */
  topA?: number;
  /** 丢弃概率低于「最高概率 × min_p」的词（0-1）。当前预留。 */
  minP?: number;
  /** 重复惩罚系数（1=不生效，>1 惩罚）。 */
  repetitionPenalty?: number;
  /** 按 token 出现次数线性惩罚（-2 到 2）。 */
  frequencyPenalty?: number;
  /** 只要出现过就惩罚（-2 到 2）。 */
  presencePenalty?: number;
  /** 最大上下文窗口（tokens）。 */
  maxContext?: number;
  signal?: AbortSignal;
  onUsage?: (usage: ChatCompletionUsage) => void;
  /** DeepSeek beta prefix completion. Only the DeepSeek branch reads this flag. */
  prefixMode?: boolean;
  /** Assistant prefill used when prefixMode is true. */
  prefixContent?: string;
  onDeepSeekDiagnostics?: (summary: DeepSeekDiagnosticsSummary) => void;
  /** Internal transport diagnostics consumed by the recovery coordinator. */
  onResponseDiagnostics?: (diagnostics: DeepSeekAttemptDiagnostics) => void;
}

export type ChatCompletionUsage = Partial<Omit<回合Token消耗, 'source'>> & {
  source: 'api';
};


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

type CompatibleStreamTextState = {
  currentBlockIsThinking: boolean;
  sawReasoning: boolean;
};

function hasReasoningPayload(value: unknown, depth = 0): boolean {
  if (depth > 8 || !value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasReasoningPayload(item, depth + 1));
  const record = value as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';
  if (record.thought === true || /^(thinking|reasoning|thinking_delta|reasoning_delta)$/i.test(type)) return true;
  for (const [key, child] of Object.entries(record)) {
    if (/^(reasoning(?:_content)?|thinking(?:_content)?)$/i.test(key) && child != null && child !== '') return true;
    if (hasReasoningPayload(child, depth + 1)) return true;
  }
  return false;
}

function readCompatibleTextContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => readCompatibleTextContent(part))
      .join('');
  }
  if (!content || typeof content !== 'object') return '';
  const part = content as Record<string, any>;
  const type = typeof part.type === 'string' ? part.type : '';
  if (part.thought === true || /^(thinking|reasoning|thinking_delta|reasoning_delta)$/i.test(type)) {
    return '';
  }
  if (typeof part.text === 'string') return part.text;
  if (typeof part.output_text === 'string') return part.output_text;
  if (typeof part.content === 'string') return part.content;
  if (Array.isArray(part.content)) return readCompatibleTextContent(part.content);
  return '';
}

function readOpenAICompatibleStreamDelta(parsed: any, state: CompatibleStreamTextState): string {
  if (hasReasoningPayload(parsed)) state.sawReasoning = true;
  if (parsed?.type === 'content_block_start') {
    const blockType = parsed.content_block?.type;
    state.currentBlockIsThinking = blockType === 'thinking' || blockType === 'reasoning';
    if (state.currentBlockIsThinking) return '';
    return readCompatibleTextContent(parsed.content_block?.text ?? parsed.content_block?.content ?? parsed.content_block);
  }
  if (parsed?.type === 'content_block_delta') {
    const deltaType = parsed.delta?.type;
    if (deltaType === 'thinking_delta' || deltaType === 'reasoning_delta' || state.currentBlockIsThinking) return '';
    return readCompatibleTextContent(parsed.delta?.text ?? parsed.delta?.content ?? parsed.delta);
  }
  if (parsed?.type === 'content_block_stop') {
    state.currentBlockIsThinking = false;
    return '';
  }
  if (
    parsed?.type === 'response.output_text.delta' ||
    parsed?.type === 'response.text.delta' ||
    parsed?.type === 'response.content_part.delta'
  ) {
    return readCompatibleTextContent(parsed.delta?.text ?? parsed.delta ?? parsed.text);
  }

  const choice = parsed?.choices?.[0];
  const delta = choice?.delta;
  if (delta?.type === 'thinking_delta' || delta?.type === 'reasoning_delta' || delta?.thought === true) {
    return '';
  }
  return (
    readCompatibleTextContent(delta?.content) ||
    readCompatibleTextContent(delta?.text) ||
    readCompatibleTextContent(choice?.text) ||
    readCompatibleTextContent(parsed?.delta?.text) ||
    readCompatibleTextContent(parsed?.delta?.content) ||
    readCompatibleTextContent(parsed?.delta) ||
    parseOpenCodeGeminiText(parsed) ||
    readCompatibleTextContent(parsed?.output_text) ||
    readCompatibleTextContent(parsed?.text) ||
    readCompatibleTextContent(parsed?.content)
  );
}

/** 从 SSE chunk / 非流式 JSON 中提取 finish_reason / stop_reason / finishReason。
 *  不同 provider 字段名不同：
 *  - OpenAI 兼容: choices[0].finish_reason
 *  - Claude: message_delta.delta.stop_reason (SSE) 或顶层 stop_reason (非流式)
 *  - Gemini: candidates[0].finishReason (camelCase)
 *  返回 undefined 表示该 chunk 无 finish_reason 或无法识别。 */
function readFinishReason(parsed: any): string | undefined {
  // OpenAI 兼容：choices[0].finish_reason
  const choice = parsed?.choices?.[0];
  if (choice && typeof choice.finish_reason === 'string' && choice.finish_reason) {
    return choice.finish_reason;
  }
  // Claude SSE: message_delta.delta.stop_reason
  if (parsed?.type === 'message_delta') {
    const stopReason = parsed?.delta?.stop_reason;
    if (typeof stopReason === 'string' && stopReason) return stopReason;
  }
  // Claude 非流式: stop_reason
  if (typeof parsed?.stop_reason === 'string' && parsed.stop_reason) {
    return parsed.stop_reason;
  }
  // Gemini: candidates[0].finishReason
  const candidate = parsed?.candidates?.[0];
  if (candidate && typeof candidate.finishReason === 'string' && candidate.finishReason) {
    return candidate.finishReason;
  }
  return undefined;
}

function parseOpenAICompatibleTextResponse(json: unknown): string {
  const data = json as Record<string, any>;
  const choice = data?.choices?.[0];
  return (
    readCompatibleTextContent(choice?.message?.content) ||
    readCompatibleTextContent(choice?.text) ||
    readCompatibleTextContent(data?.message?.content) ||
    parseClaudeTextResponse(json) ||
    parseOpenCodeResponsesText(json) ||
    parseOpenCodeGeminiText(json) ||
    readCompatibleTextContent(data?.output_text) ||
    readCompatibleTextContent(data?.text) ||
    readCompatibleTextContent(data?.content)
  );
}

function reportOpenAICompatibleDiagnostics(
  json: unknown,
  text: string,
  config: API配置项,
  request: ChatCompletionRequest,
): void {
  request.onResponseDiagnostics?.({
    sawReasoning: hasReasoningPayload(json),
    sawVisibleContent: text.trim().length > 0,
    finishReason: readFinishReason(json),
    selectedModel: config.model,
  });
}

export async function chatCompletion(
  config: API配置项,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const recovered = await executeWithDeepSeekDiagnostics(config, {
    maxTokens: request.maxTokens ?? config.maxTokens,
    onSummary: request.onDeepSeekDiagnostics,
    execute: async (attemptConfig, attemptOptions) => {
      let reported = false;
      let finishReason: string | undefined;
      let diagnostics: DeepSeekAttemptDiagnostics = {
        sawReasoning: false,
        sawVisibleContent: false,
        selectedModel: attemptConfig.model,
      };
      const attemptRequest: ChatCompletionRequest = {
        ...request,
        messages: request.messages,
        maxTokens: attemptOptions.maxTokens,
        onResponseDiagnostics: (next) => {
          reported = true;
          diagnostics = next;
        },
      };
      const text = await chatCompletionOnce(attemptConfig, attemptRequest, {
        onDelta: callbacks.onDelta,
        onDone: () => {},
        onError: callbacks.onError,
        onFinishReason: (reason) => { finishReason = reason; },
      });
      if (!reported) {
        diagnostics = {
          sawReasoning: false,
          sawVisibleContent: text.trim().length > 0,
          finishReason,
          selectedModel: attemptConfig.model,
        };
      } else if (!diagnostics.finishReason && finishReason) {
        diagnostics = { ...diagnostics, finishReason };
      }
      return { text, diagnostics };
    },
  });

  if (recovered.diagnostics.finishReason) {
    callbacks.onFinishReason?.(recovered.diagnostics.finishReason);
  }
  request.onResponseDiagnostics?.(recovered.diagnostics);
  callbacks.onDone();
  return recovered.text;
}

async function chatCompletionOnce(
  config: API配置项,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const provider = detectProvider(config);
  const msgs = buildMessages(request.systemPrompt, request.messages);

  if (provider === 'mimo') {
    return streamOpenAICompatible(config, msgs, request, callbacks);
  }
  if (provider === 'opencode') {
    return streamOpenCode(config, msgs, request, callbacks);
  }
  if (provider === 'deepseek') {
    const payload = withPrefixMessages(config, msgs, request);
    const text = await streamOpenAICompatible(payload.config, payload.messages, request, callbacks);
    return mergePrefixResult(payload.prefix, text);
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
): Promise<string> {
  const upstreamBaseUrl = isArkConfig(config)
    ? normalizeArkBaseUrl(config.baseUrl)
    : isPioneerConfig(config)
      ? normalizePioneerBaseUrl(config.baseUrl)
      : config.baseUrl;
  const upstreamUrl = buildOpenAICompatibleChatUrl(upstreamBaseUrl);
  const requestBody = buildOpenAICompatibleRequestBody(config, messages, request, true);
  const url = isArkConfig(config)
    ? '/api/ark'
    : isBaiduQianfanConfig(config)
    ? '/api/qianfan'
    : isPioneerConfig(config)
      ? '/api/pioneer'
      : upstreamUrl;
  const body = isArkConfig(config)
    ? buildArkProxyBody(config, requestBody)
    : isBaiduQianfanConfig(config)
    ? buildQianfanProxyBody(config, requestBody)
    : isPioneerConfig(config)
      ? buildPioneerProxyBody(config, requestBody)
      : JSON.stringify(requestBody);

  const response = await fetchWithApiErrorReport(config, '聊天补全', url, 'stream', {
    method: 'POST',
    headers: isMimoConfig(config)
      ? buildMimoAuthHeaders(config.apiKey)
      : {
          'Content-Type': 'application/json',
          ...(url.startsWith('/api/') ? {} : { Authorization: `Bearer ${config.apiKey}` }),
        },
    body,
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
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
  let finishReason: string | undefined;
  const compatibleStreamState: CompatibleStreamTextState = { currentBlockIsThinking: false, sawReasoning: false };

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
          const text = readOpenAICompatibleStreamDelta(parsed, compatibleStreamState);

          // Accept visible text from compatible chunks; drop thinking/reasoning deltas.
          if (text) {
            fullText += text;
            callbacks.onDelta(text);
          }
          // 采集 finish_reason（用于抗截断检测）
          const fr = readFinishReason(parsed);
          if (fr) {
            finishReason = fr;
            callbacks.onFinishReason?.(fr);
          }
        } catch {
          // skip malformed SSE lines
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  request.onResponseDiagnostics?.({
    sawReasoning: compatibleStreamState.sawReasoning,
    sawVisibleContent: fullText.trim().length > 0,
    finishReason,
    selectedModel: config.model,
  });
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
          // 采集 stop_reason（Claude 的 message_delta 事件含 delta.stop_reason）
          const fr = readFinishReason(parsed);
          if (fr && callbacks.onFinishReason) callbacks.onFinishReason(fr);
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
  // Phase 3：OpenCode GPT 系列支持 top_p / frequency_penalty / presence_penalty
  const topP = request.topP ?? config.topP;
  if (typeof topP === 'number') bodyObj.top_p = topP;
  const freqPenalty = request.frequencyPenalty ?? config.frequencyPenalty;
  if (typeof freqPenalty === 'number') bodyObj.frequency_penalty = freqPenalty;
  const presPenalty = request.presencePenalty ?? config.presencePenalty;
  if (typeof presPenalty === 'number') bodyObj.presence_penalty = presPenalty;
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

  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: request.maxTokens ?? config.maxTokens ?? 2048,
    temperature: request.temperature ?? config.temperature ?? 0.8,
  };
  // Phase 3：Gemini 支持 top_p / top_k / repetition_penalty / frequency_penalty / presence_penalty
  const topP = request.topP ?? config.topP;
  if (typeof topP === 'number') generationConfig.topP = topP;
  const topK = request.topK ?? config.topK;
  if (typeof topK === 'number') generationConfig.topK = topK;
  const repPenalty = request.repetitionPenalty ?? config.repetitionPenalty;
  if (typeof repPenalty === 'number') generationConfig.repetitionPenalty = repPenalty;
  const freqPenalty = request.frequencyPenalty ?? config.frequencyPenalty;
  if (typeof freqPenalty === 'number') generationConfig.frequencyPenalty = freqPenalty;
  const presPenalty = request.presencePenalty ?? config.presencePenalty;
  if (typeof presPenalty === 'number') generationConfig.presencePenalty = presPenalty;

  const bodyObj: Record<string, unknown> = {
    contents,
    generationConfig,
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
  return readCompatibleTextContent(data.choices?.[0]?.message?.content);
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
    return readCompatibleTextContent(parsed.delta?.text ?? parsed.delta ?? parsed.text);
  }
  return readCompatibleTextContent(parsed?.choices?.[0]?.delta?.content) || readCompatibleTextContent(parsed?.delta?.text);
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
): Promise<string> {
  const endpoint: OpenCodeEndpoint = 'chat';
  const upstreamUrl = buildOpenCodeUrl(config, endpoint);
  const requestBody = buildOpenAICompatibleRequestBody(config, messages, request, true);
  const response = await fetchWithApiErrorReport(config, 'OpenCode Zen Chat 补全', '/api/opencode', 'stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: buildOpenCodeProxyBody(config, endpoint, requestBody, true),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
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
  let finishReason: string | undefined;
  const compatibleStreamState: CompatibleStreamTextState = { currentBlockIsThinking: false, sawReasoning: false };

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
          const text = readOpenAICompatibleStreamDelta(parsed, compatibleStreamState);
          if (text) {
            fullText += text;
            callbacks.onDelta(text);
          }
          // 采集 finish_reason（OpenCode Chat 兼容 OpenAI 格式）
          const fr = readFinishReason(parsed);
          if (fr) {
            finishReason = fr;
            callbacks.onFinishReason?.(fr);
          }
        } catch {
          // skip
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  request.onResponseDiagnostics?.({
    sawReasoning: compatibleStreamState.sawReasoning,
    sawVisibleContent: fullText.trim().length > 0,
    finishReason,
    selectedModel: config.model,
  });
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
          // 采集 stop_reason（Claude 的 message_delta 事件含 delta.stop_reason）
          const fr = readFinishReason(parsed);
          if (fr && callbacks.onFinishReason) callbacks.onFinishReason(fr);
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
          // 采集 finish_reason（Responses API 的 finish_reason 在顶层或 choices[0]）
          const fr = readFinishReason(parsed);
          if (fr && callbacks.onFinishReason) callbacks.onFinishReason(fr);
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
          // 采集 finishReason（OpenCode Gemini 的 candidates[0].finishReason）
          const fr = readFinishReason(parsed);
          if (fr && callbacks.onFinishReason) callbacks.onFinishReason(fr);
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
    return parseOpenAICompatibleTextResponse(json);
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

  const geminiGenConfig: Record<string, unknown> = {
    maxOutputTokens: request.maxTokens ?? config.maxTokens ?? 2048,
    temperature: request.temperature ?? config.temperature ?? 0.8,
  };
  // Phase 3：Gemini 原生支持 top_p / top_k / repetition_penalty / frequency_penalty / presence_penalty
  const topP = request.topP ?? config.topP;
  if (typeof topP === 'number') geminiGenConfig.topP = topP;
  const topK = request.topK ?? config.topK;
  if (typeof topK === 'number') geminiGenConfig.topK = topK;
  const repPenalty = request.repetitionPenalty ?? config.repetitionPenalty;
  if (typeof repPenalty === 'number') geminiGenConfig.repetitionPenalty = repPenalty;
  const freqPenalty = request.frequencyPenalty ?? config.frequencyPenalty;
  if (typeof freqPenalty === 'number') geminiGenConfig.frequencyPenalty = freqPenalty;
  const presPenalty = request.presencePenalty ?? config.presencePenalty;
  if (typeof presPenalty === 'number') geminiGenConfig.presencePenalty = presPenalty;

  const bodyObj: Record<string, unknown> = {
    contents,
    generationConfig: geminiGenConfig,
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
          // 采集 finishReason（Gemini 的 candidates[0].finishReason）
          const fr = readFinishReason(parsed);
          if (fr && callbacks.onFinishReason) callbacks.onFinishReason(fr);
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
  const recovered = await executeWithDeepSeekDiagnostics(config, {
    maxTokens: request.maxTokens ?? config.maxTokens,
    onSummary: request.onDeepSeekDiagnostics,
    execute: async (attemptConfig, attemptOptions) => {
      let reported = false;
      let diagnostics: DeepSeekAttemptDiagnostics = {
        sawReasoning: false,
        sawVisibleContent: false,
        selectedModel: attemptConfig.model,
      };
      const text = await chatCompletionNonStreamOnce(attemptConfig, {
        ...request,
        messages: request.messages,
        maxTokens: attemptOptions.maxTokens,
        onResponseDiagnostics: (next) => {
          reported = true;
          diagnostics = next;
        },
      });
      if (!reported) {
        diagnostics = {
          sawReasoning: false,
          sawVisibleContent: text.trim().length > 0,
          selectedModel: attemptConfig.model,
        };
      }
      return { text, diagnostics };
    },
  });
  request.onResponseDiagnostics?.(recovered.diagnostics);
  return recovered.text;
}

async function chatCompletionNonStreamOnce(
  config: API配置项,
  request: ChatCompletionRequest,
): Promise<string> {
  const provider = detectProvider(config);
  const msgs = buildMessages(request.systemPrompt, request.messages);

  if (provider === 'mimo') {
    const upstreamBaseUrl = normalizeMimoBaseUrl(config.baseUrl);
    const upstreamUrl = buildOpenAICompatibleChatUrl(upstreamBaseUrl);
    const requestBody = buildOpenAICompatibleRequestBody(config, msgs, request, false);
    const response = await fetchWithApiErrorReport(config, '非流式补全', upstreamUrl, 'non-stream', {
      method: 'POST',
      headers: buildMimoAuthHeaders(config.apiKey),
      body: JSON.stringify(requestBody),
      signal: request.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      void appendApiErrorReport({
        source: '非流式补全',
        config,
        status: response.status,
        requestUrl: upstreamUrl,
        requestMode: 'non-stream',
        responseText: text,
      });
      throw formatOpenAICompatibleError(config, response.status, text);
    }

    const json = await response.json();
    emitUsageFromResponse(json, config, request);
    const text = parseOpenAICompatibleTextResponse(json);
    reportOpenAICompatibleDiagnostics(json, text, config, request);
    return text;
  }
  if (provider === 'opencode') {
    return completionOpenCodeNonStream(config, msgs, request);
  }

  if (provider === 'claude') {
    return completionClaudeNonStream(config, msgs, request);
  }

  if (provider === 'gemini') {
    return chatCompletionOnce(config, request, {
      onDelta: () => {},
      onDone: () => {},
      onError: () => {},
    });
  }

  const deepSeekPayload = provider === 'deepseek'
    ? withPrefixMessages(config, msgs, request)
    : { config, messages: msgs, prefix: '' };

  const upstreamBaseUrl = isArkConfig(deepSeekPayload.config)
    ? normalizeArkBaseUrl(deepSeekPayload.config.baseUrl)
    : isPioneerConfig(deepSeekPayload.config)
      ? normalizePioneerBaseUrl(deepSeekPayload.config.baseUrl)
      : deepSeekPayload.config.baseUrl;
  const upstreamUrl = buildOpenAICompatibleChatUrl(upstreamBaseUrl);
  const effectiveUrl = isArkConfig(deepSeekPayload.config)
    ? '/api/ark'
    : isBaiduQianfanConfig(deepSeekPayload.config)
    ? '/api/qianfan'
    : isPioneerConfig(deepSeekPayload.config)
      ? '/api/pioneer'
      : upstreamUrl;
  const diagnosticUrl = effectiveUrl.startsWith('/api/') ? upstreamUrl : effectiveUrl;
  const requestBody = buildOpenAICompatibleRequestBody(deepSeekPayload.config, deepSeekPayload.messages, request, false);
  const response = await fetchWithApiErrorReport(deepSeekPayload.config, '非流式补全', effectiveUrl, 'non-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(effectiveUrl.startsWith('/api/') ? {} : { Authorization: `Bearer ${deepSeekPayload.config.apiKey}` }),
    },
    body: isArkConfig(deepSeekPayload.config)
      ? buildArkProxyBody(deepSeekPayload.config, requestBody)
      : isBaiduQianfanConfig(deepSeekPayload.config)
      ? buildQianfanProxyBody(deepSeekPayload.config, requestBody)
      : isPioneerConfig(deepSeekPayload.config)
        ? buildPioneerProxyBody(deepSeekPayload.config, requestBody)
        : JSON.stringify(requestBody),
    signal: request.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    const error = formatOpenAICompatibleError(deepSeekPayload.config, response.status, text);
    void appendApiErrorReport({
      source: '非流式补全',
      config: deepSeekPayload.config,
      status: response.status,
      requestUrl: diagnosticUrl,
      requestMode: 'non-stream',
      responseText: text,
    });
    throw error;
  }

  const json = await response.json();
  emitUsageFromResponse(json, deepSeekPayload.config, request);
  const text = parseOpenAICompatibleTextResponse(json);
  reportOpenAICompatibleDiagnostics(json, text, deepSeekPayload.config, request);
  return mergePrefixResult(deepSeekPayload.prefix, text);
}
