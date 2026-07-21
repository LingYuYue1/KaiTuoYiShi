export function buildQianfanProxyBody(config: API配置项, body: Record<string, unknown>): string {
  return JSON.stringify({
    kind: 'chat',
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    body,
  });
}

export function buildPioneerProxyBody(config: API配置项, body: Record<string, unknown>): string {
  return JSON.stringify({
    kind: 'chat',
    baseUrl: normalizePioneerBaseUrl(config.baseUrl),
    apiKey: config.apiKey,
    body,
  });
}

export function isArkConfig(config: API配置项): boolean {
  return config.provider === 'ark' || isArkBaseUrl(config.baseUrl);
}

export function isBaiduQianfanConfig(config: API配置项): boolean {
  return config.provider === 'baidu' || /qianfan\.baidubce\.com/i.test(config.baseUrl);
}

export function isPioneerConfig(config: API配置项): boolean {
  return isPioneerBaseUrl(config.baseUrl);
}

export function isMimoConfig(config: API配置项): boolean {
  return detectProvider(config) === 'mimo';
}

export function normalizeOpenAICompatibleModel(config: API配置项): string {
  const model = config.model.trim();
  if (isBaiduQianfanConfig(config) && /^glm[-_\s]?5\.1$/i.test(model)) {
    return 'glm-5.1';
  }
  return model;
}

export function normalizeMimoBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return trimmed;
  if (/\/v1$/i.test(trimmed)) return trimmed;
  return `${trimmed}/v1`;
}

export function buildMimoAuthHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'api-key': apiKey,
  };
}

export function buildOpenAICompatibleRequestBody(
  config: API配置项,
  messages: ChatMessagePayload[],
  request: ChatCompletionRequest,
  stream: boolean,
  includeUsage: boolean = true,
): Record<string, unknown> {
  const isMimo = isMimoConfig(config);
  const body: Record<string, unknown> = {
    model: normalizeOpenAICompatibleModel(config),
    messages,
    stream,
  };
  if (isMimo) {
    body.max_completion_tokens = request.maxTokens ?? config.maxTokens ?? 2048;
    body.thinking = { type: 'disabled' };
  } else {
    body.max_tokens = request.maxTokens ?? config.maxTokens ?? 2048;
    body.temperature = request.temperature ?? config.temperature ?? 0.8;
    // Phase 3：采样参数贯通（OpenAI 兼容 / DeepSeek / Ark / Pioneer 等）
    // top_p / frequency_penalty / presence_penalty / repetition_penalty 大多数 OpenAI 兼容端点支持
    const topP = request.topP ?? config.topP;
    if (typeof topP === 'number') body.top_p = topP;
    const freqPenalty = request.frequencyPenalty ?? config.frequencyPenalty;
    if (typeof freqPenalty === 'number') body.frequency_penalty = freqPenalty;
    const presPenalty = request.presencePenalty ?? config.presencePenalty;
    if (typeof presPenalty === 'number') body.presence_penalty = presPenalty;
    const repPenalty = request.repetitionPenalty ?? config.repetitionPenalty;
    if (typeof repPenalty === 'number') body.repetition_penalty = repPenalty;
    // max_context：OpenAI 兼容端点通常不支持显式字段，但 OpenRouter 等支持 max_context_tokens
    const maxCtx = request.maxContext ?? config.maxContext;
    if (typeof maxCtx === 'number') body.max_context_tokens = maxCtx;
  }
  if (stream && includeUsage && request.onUsage) {
    body.stream_options = { include_usage: true };
  }
  return body;
}

export function formatOpenAICompatibleError(config: API配置项, status: number, text: string): Error {
  if (isArkConfig(config)) {
    const lower = text.toLowerCase();
    const hint = (() => {
      if (lower.includes('modelnotopen') || lower.includes('model not open')) {
        return '火山方舟模型服务未开通，请到火山方舟控制台开通对应模型后再试。';
      }
      if (status === 401 || status === 403) return '请检查火山方舟 API Key、访问权限和模型服务是否已开通。';
      if (status === 404) return '请检查火山方舟模型 ID、Base URL 是否为 https://ark.cn-beijing.volces.com/api/v3。';
      return '请检查火山方舟 Base URL、模型 ID、API Key、余额和模型服务开通状态。';
    })();
    return new Error(`火山方舟 API Error ${status}: ${hint}\n${text}`);
  }
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

export async function fetchWithApiErrorReport(
  config: API配置项,
  source: string,
  url: string,
  requestMode: 'stream' | 'non-stream' | 'models' | 'test' | 'unknown',
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error && typeof error === 'object') {
      (error as Error & { alreadyReportedByApiLayer?: boolean }).alreadyReportedByApiLayer = true;
    }
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

export function normalizeClaudeMessages(
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

export function buildClaudeTextBlocks(text: string): Array<{ type: 'text'; text: string }> {
  const content = text.trim();
  return content ? [{ type: 'text', text: content }] : [{ type: 'text', text: ' ' }];
}

export function buildClaudeRequestBody(
  config: API配置项,
  messages: Array<{ role: string; content: string }>,
  request: ChatCompletionRequest,
  stream: boolean,
): Record<string, unknown> {
  const claudePayload = normalizeClaudeMessages(messages);
  const bodyObj: Record<string, unknown> = {
    model: config.model,
    max_tokens: request.maxTokens ?? config.maxTokens ?? 2048,
    messages: claudePayload.messages.map((message) => ({
      role: message.role,
      content: buildClaudeTextBlocks(message.content),
    })),
    stream,
  };
  if (claudePayload.system) {
    bodyObj.system = buildClaudeTextBlocks(claudePayload.system);
  }
  // Phase 3：Claude 仅支持 max_context（通过 max_tokens 间接控制），
  // 其他采样参数 Claude 故意不上传（参考 ST 行为，避免冲突）
  // max_context 不直接发给 Claude，但可用于客户端侧裁剪历史（暂未实现）
  return bodyObj;
}

export function claudeHeaders(config: API配置项): HeadersInit {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-api-key': config.apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (config.provider === 'claude_compatible') {
    headers['anthropic-client-name'] = 'claude-code';
    headers['anthropic-client-version'] = '1.0.0';
    headers['x-claude-code-attribution'] = '1';
    headers['x-claude-code-client'] = 'claude-code';
  }
  return headers;
}

export function formatClaudeError(status: number, text: string): Error {
  const lower = text.toLowerCase();
  const hint = (() => {
    if (status === 401) return 'API Key 无效或未授权。';
    if (status === 403) return '账号权限、模型权限、地区限制或浏览器直连权限被拒绝。';
    if (status === 404) return 'Base URL、/v1 路径或模型名可能不正确。';
    if (status === 400 && (lower.includes('final') || lower.includes('role'))) {
      return '消息角色格式不符合 Claude 要求；客户端已自动尝试保证最后一条为用户内容。';
    }
    if (status === 400 && lower.includes('system') && (lower.includes('数组') || lower.includes('array'))) {
      return '当前 Claude 专用模式会使用根级 system 数组；如果仍报错，请检查中转是否裁剪了请求体或要求 Claude Code 专属字段。';
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

export function parseClaudeTextResponse(json: unknown): string {
  const data = json as { content?: Array<{ type?: string; text?: string }> };
  return (data.content ?? [])
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join('');
}
import type { API配置项 } from '@/models/settings';
import { appendApiErrorReport } from './apiErrorReportService';
import { isArkBaseUrl } from './arkProxyCore';
import { isPioneerBaseUrl, normalizePioneerBaseUrl } from './pioneerProxyCore';
import { detectProvider, type ChatMessagePayload } from './chatCompletionProtocol';
import type { ChatCompletionRequest } from './chatCompletionClient';
