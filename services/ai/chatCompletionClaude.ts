// 由 docs/plans/chatCompletionClient-deepclean-slim.md S7 拆分生成。
import type { API配置项 } from '@/models/settings';
import { errorText, fetchWithApiErrorReport, throwApiError } from './chatCompletionOpenAICompat';
import { normalizeClaudeBaseUrl } from './chatCompletionProvider';
import { parseClaudeTextResponse, readOpenAICompatibleStreamDelta, runSseStream } from './chatCompletionStream';
import type { ChatCompletionRequest, StreamCallbacks } from './chatCompletionTypes';
import { emitUsageFromResponse } from './chatCompletionUsage';

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
    const last = normalized.at(-1);
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

function buildClaudeTextBlocks(text: string): Array<{ type: 'text'; text: string }> {
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

function claudeHeaders(config: API配置项): HeadersInit {
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

function formatClaudeError(status: number, text: string): Error {
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

export // ── Claude streaming (Anthropic Messages API) ──
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
    await throwApiError(config, 'Claude 聊天补全', url, 'stream', response.status, await errorText(response), formatClaudeError);
  }

  // Claude extended thinking 用独立 content_block；readOpenAICompatibleStreamDelta 统一处理 thinking 状态
  return runSseStream(response, {
    provider: 'claude',
    config,
    request,
    callbacks,
    extractText: readOpenAICompatibleStreamDelta,
  });
}

export async function completionClaudeNonStream(
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
    await throwApiError(config, 'Claude 非流式补全', url, 'non-stream', response.status, await errorText(response), formatClaudeError);
  }

  const json = await response.json();
  emitUsageFromResponse(json, config, request);
  return parseClaudeTextResponse(json);
}
