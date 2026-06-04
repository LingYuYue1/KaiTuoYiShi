import type { API配置项 } from '@/models/settings';
import type { 聊天消息 } from '@/models/chat';
import { appendApiErrorReport } from './apiErrorReportService';

export interface StreamCallbacks {
  onDelta: (delta: string) => void;
  onDone: () => void;
  onError: (err: Error) => void;
}

/** 丢弃模型的 reasoning_content / extended thinking / Gemini thought parts。
 *  这类「reasoning summary」是厂商内置格式（英文 **Header** 段），不受 system prompt 控制，
 *  会跳过我们设计的 Step0-Step10 CoT。统一只接收正式 content 流。 */

export interface ChatCompletionRequest {
  messages: Array<{ role: string; content: string }>;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

function detectProvider(config: API配置项): string {
  const url = config.baseUrl.toLowerCase();
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
  messages: Array<{ role: string; content: string }>,
): Array<{ role: string; content: string }> {
  const result: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt });
  }
  result.push(...messages);
  return result;
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
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  stream: boolean,
): Record<string, unknown> {
  return {
    model: normalizeOpenAICompatibleModel(config),
    messages,
    max_tokens: request.maxTokens ?? config.maxTokens ?? 2048,
    temperature: request.temperature ?? config.temperature ?? 0.8,
    stream,
  };
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

  if (provider === 'deepseek') {
    return streamOpenAICompatible(config, msgs, request, callbacks);
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
  const upstreamUrl = buildOpenAICompatibleChatUrl(config.baseUrl);
  const requestBody = buildOpenAICompatibleRequestBody(config, messages, request, true);
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
  return parseClaudeTextResponse(json);
}

// ── Gemini streaming ──

async function streamGemini(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  callbacks: StreamCallbacks,
): Promise<string> {
  const url = `${config.baseUrl.replace(/\/$/, '')}/models/${config.model}:streamGenerateContent?alt=sse`;
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
  const upstreamUrl = buildOpenAICompatibleChatUrl(config.baseUrl);
  const url = isBaiduQianfanConfig(config) ? '/api/qianfan' : upstreamUrl;

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

  const response = await fetchWithApiErrorReport(config, '非流式补全', url, 'non-stream', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: isBaiduQianfanConfig(config)
      ? buildQianfanProxyBody(config, buildOpenAICompatibleRequestBody(config, msgs, request, false))
      : JSON.stringify(buildOpenAICompatibleRequestBody(config, msgs, request, false)),
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
  return json.choices?.[0]?.message?.content ?? '';
}
