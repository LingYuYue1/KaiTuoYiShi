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

export function isLikelyClaudeModel(model: string): boolean {
  return /(^|[\/:._\-\s])(claude|opus|sonnet|haiku)([\/:._\-\s]|$)/i.test(model.trim());
}

export function shouldUseClaudeMessagesApi(config: API配置项): boolean {
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

export function normalizeDeepSeekPrefixBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed || !/deepseek/i.test(trimmed)) return trimmed;
  if (/\/beta$/i.test(trimmed)) return trimmed;
  if (/\/v\d+$/i.test(trimmed)) return trimmed.replace(/\/v\d+$/i, '/beta');
  return `${trimmed}/beta`;
}

/**
 * Phase 4：通用化 assistant prefill。
 *
 * 按 provider 分流到不同的 prefill 实现：
 * - DeepSeek：baseUrl 改 /beta + { role: 'assistant', content: prefix, prefix: true }（DeepSeek beta 特性）
 * - Claude：末尾追加 { role: 'assistant', content: prefix }（Claude 原生支持 prefill）
 * - Gemini：末尾追加 { role: 'model', content: prefix }（Gemini 原生支持 prefill）
 * - OpenAI 兼容：末尾追加 { role: 'assistant', content: prefix }（部分中转商支持）
 *
 * 不支持的 provider（如 mimo）静默降级，不 prefill。
 * prefix 内容优先从 request.prefixContent 读取，默认 '<thinking>\n'。
 */
export function withPrefixMessages(
  config: API配置项,
  messages: ChatMessagePayload[],
  request: ChatCompletionRequest,
): { config: API配置项; messages: ChatMessagePayload[]; prefix: string } {
  if (request.prefixMode !== true) return { config, messages, prefix: '' };
  const prefix = request.prefixContent ?? '<thinking>\n';
  if (!prefix) return { config, messages, prefix: '' };

  const provider = detectProvider(config);
  const withoutOldPrefix = messages.filter((msg) => msg.prefix !== true);

  // DeepSeek：走 /beta + prefix: true 标记
  if (provider === 'deepseek') {
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

  // Claude：末尾追加 assistant 消息（Claude 原生支持 prefill）
  // 注意：normalizeClaudeMessages 会强制末条 user，但 prefill assistant 会在它之前插入
  if (provider === 'claude') {
    return {
      config,
      messages: [
        ...withoutOldPrefix,
        { role: 'assistant', content: prefix, prefix: true },
      ],
      prefix,
    };
  }

  // Gemini：末尾追加 model 消息（Gemini 原生支持 prefill，角色名是 model）
  if (provider === 'gemini') {
    return {
      config,
      messages: [
        ...withoutOldPrefix,
        { role: 'model', content: prefix, prefix: true },
      ],
      prefix,
    };
  }

  // OpenAI 兼容 / OpenCode / Ark / Pioneer 等：末尾追加 assistant 消息
  // 部分中转商支持，不支持的会报错（由上层 try-catch 降级）
  if (provider === 'openai_compatible' || provider === 'opencode' || provider === 'ark' || provider === 'mimo') {
    return {
      config,
      messages: [
        ...withoutOldPrefix,
        { role: 'assistant', content: prefix, prefix: true },
      ],
      prefix,
    };
  }

  // 未知 provider 静默降级
  return { config, messages, prefix: '' };
}

export function mergePrefixResult(prefix: string, text: string): string {
  if (!prefix) return text;
  return text.startsWith(prefix) ? text : `${prefix}${text}`;
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
import type { API配置项 } from '@/models/settings';
import { isArkBaseUrl } from './arkProxyCore';
import type { ChatCompletionRequest } from './chatCompletionClient';

export type ChatMessagePayload = { role: string; content: string; prefix?: boolean };
