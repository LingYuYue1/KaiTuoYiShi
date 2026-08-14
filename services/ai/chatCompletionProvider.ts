// 由 docs/plans/chatCompletionClient-deepclean-slim.md S7 拆分生成。
import { isArkBaseUrl } from './arkProxyCore';
import { isPioneerBaseUrl } from './pioneerProxyCore';
import type { API配置项 } from '@/models/settings';
import type { ChatCompletionRequest, ChatMessagePayload } from './chatCompletionTypes';

export function detectProvider(config: API配置项): string {
  const url = config.baseUrl.toLowerCase();
  if (config.provider === 'mimo' || /xiaomimimo|mimo\.mi/i.test(url)) return 'mimo';
  if (config.provider === 'ark' || isArkBaseUrl(config.baseUrl)) return 'ark';
  if (config.provider === 'opencode' || /opencode\.ai\/zen\/v1/i.test(url)) return 'opencode';
  if (config.provider === 'deepseek' || url.includes('deepseek')) return 'deepseek';
  if (config.provider === 'gemini' || url.includes('gemini') || url.includes('googleapis')) return 'gemini';
  if (shouldUseClaudeMessagesApi(config)) {
    return 'claude';
  }
  return 'openai_compatible';
}

function isLikelyClaudeModel(model: string): boolean {
  return /(^|[/:._\-\s])(claude|opus|sonnet|haiku)([/:._\-\s]|$)/i.test(model.trim());
}

function shouldUseClaudeMessagesApi(config: API配置项): boolean {
  if (config.provider === 'claude') return true;
  if (config.provider !== 'claude_compatible') return false;
  if (config.enableClaudeMode !== true) return false;
  return isLikelyClaudeModel(config.model);
}

export function buildMessages(
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

function normalizeDeepSeekPrefixBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed || !/deepseek/i.test(trimmed)) return trimmed;
  if (/\/beta$/i.test(trimmed)) return trimmed;
  if (/\/v\d+$/i.test(trimmed)) return trimmed.replace(/\/v\d+$/i, '/beta');
  return `${trimmed}/beta`;
}

/** 通用 prefill 追加：role 区分 provider（assistant/model），baseUrlOverride 供 DeepSeek /beta。 */
function appendPrefill(
  config: API配置项,
  messages: ChatMessagePayload[],
  prefix: string,
  role: string,
  baseUrlOverride?: string,
): { config: API配置项; messages: ChatMessagePayload[]; prefix: string } {
  return {
    config: baseUrlOverride ? { ...config, baseUrl: baseUrlOverride } : config,
    messages: [...messages, { role, content: prefix, prefix: true }],
    prefix,
  };
}

export /**
 * Phase 4：通用化 assistant prefill。按 provider 分流：
 * - DeepSeek：baseUrl 改 /beta + assistant prefill（beta 特性）
 * - Claude / OpenAI 兼容 / OpenCode / Ark / Mimo：末尾追加 assistant prefill
 * - Gemini：末尾追加 model prefill
 * - 其余 provider 静默降级，不 prefill。
 * prefix 内容优先从 request.prefixContent 读取，默认 '<thinking>\n'。
 */
function withPrefixMessages(
  config: API配置项,
  messages: ChatMessagePayload[],
  request: ChatCompletionRequest,
): { config: API配置项; messages: ChatMessagePayload[]; prefix: string } {
  if (request.prefixMode !== true) return { config, messages, prefix: '' };
  const prefix = request.prefixContent ?? '<thinking>\n';
  if (!prefix) return { config, messages, prefix: '' };
  const withoutOldPrefix = messages.filter((msg) => msg.prefix !== true);
  switch (detectProvider(config)) {
    case 'deepseek':
      return appendPrefill(config, withoutOldPrefix, prefix, 'assistant', normalizeDeepSeekPrefixBaseUrl(config.baseUrl));
    case 'claude':
    case 'openai_compatible':
    case 'opencode':
    case 'ark':
    case 'mimo':
      return appendPrefill(config, withoutOldPrefix, prefix, 'assistant');
    case 'gemini':
      return appendPrefill(config, withoutOldPrefix, prefix, 'model');
    default:
      return { config, messages, prefix: '' };
  }
}

export function stripDeepSeekPrefixMessages(messages: ChatMessagePayload[]): ChatMessagePayload[] {
  return messages
    .filter((msg) => msg.prefix !== true)
    .map((msg) => {
      const rest = { ...msg };
      delete rest.prefix;
      return rest;
    });
}

export function mergePrefixResult(prefix: string, text: string): string {
  if (!prefix) return text;
  return text.startsWith(prefix) ? text : `${prefix}${text}`;
}

export function isDeepSeekPrefixUnsupportedError(error: unknown): boolean {
  const text = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  return /prefix/i.test(text) && /(unsupported|not support|不支持|invalid|beta|400|422)/i.test(text);
}

export function normalizeClaudeBaseUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return base.endsWith('/v1') ? base : `${base}/v1`;
}

export function buildOpenAICompatibleChatUrl(baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  if (/\/chat\/completions$/i.test(base)) return base;
  return `${base}/chat/completions`;
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
