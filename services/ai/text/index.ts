import type { API配置项 } from '@/models/settings';
import type { 聊天消息 } from '@/models/chat';
import { chatCompletion, chatCompletionNonStream, type ChatCompletionUsage, type StreamCallbacks } from '@/services/ai/chatCompletionClient';
import { parseResponse } from '@/services/ai/responseParser';
import type { 解析后回复 } from '@/models/chat';

export interface ChatRequest {
  messages: 聊天消息[];
  systemPrompt: string;
  onDelta: (delta: string) => void;
  signal?: AbortSignal;
  streaming?: boolean;
  /** 是否启用标签修复（解析前先 repairTags）。默认 false。 */
  repairTags?: boolean;
  /** DeepSeek 主剧情锁格式：只在 DeepSeek provider 下生效。 */
  prefixMode?: boolean;
  prefixContent?: string;
}

export interface ChatResult {
  fullText: string;
  parsed: 解析后回复;
  usage?: ChatCompletionUsage;
}

export async function sendChatMessage(
  config: API配置项,
  request: ChatRequest,
): Promise<ChatResult> {
  const useStream = request.streaming !== false;
  const apiMessages = request.messages.map((m) => ({ role: m.role, content: m.content }));
  let usage: ChatCompletionUsage | undefined;
  const onUsage = (nextUsage: ChatCompletionUsage) => {
    const previous = usage;
    const mergedRawUsage = mergeRawUsage(previous?.rawUsage, nextUsage.rawUsage);
    const previousHasCache = hasReturnedCacheStats(previous);
    const nextHasCache = hasReturnedCacheStats(nextUsage);
    const mergedUsagePath = mergeUsagePath(previous?.usagePath, nextUsage.usagePath);
    usage = {
      ...(previous ?? {}),
      ...Object.fromEntries(Object.entries(nextUsage).filter(([, value]) => value !== undefined)),
      rawUsage: mergedRawUsage,
      rawUsageKeys: collectRawUsageKeys(mergedRawUsage, nextUsage.rawUsageKeys ?? previous?.rawUsageKeys),
      usagePath: mergedUsagePath ?? nextUsage.usagePath ?? previous?.usagePath,
      usageFormat: nextHasCache || !previousHasCache
        ? nextUsage.usageFormat ?? previous?.usageFormat
        : previous?.usageFormat ?? nextUsage.usageFormat,
      cacheDiagnostic: nextHasCache || !previousHasCache
        ? nextUsage.cacheDiagnostic ?? previous?.cacheDiagnostic
        : previous?.cacheDiagnostic ?? nextUsage.cacheDiagnostic,
      source: 'api',
    };
  };

  let fullText: string;
  if (useStream) {
    const callbacks: StreamCallbacks = {
      onDelta: request.onDelta,
      onDone: () => {},
      onError: (err) => { throw err; },
    };
    fullText = await chatCompletion(
      config,
      {
        messages: apiMessages,
        systemPrompt: request.systemPrompt,
        signal: request.signal,
        onUsage,
        prefixMode: request.prefixMode,
        prefixContent: request.prefixContent,
      },
      callbacks,
    );
  } else {
    fullText = await chatCompletionNonStream(config, {
      messages: apiMessages,
      systemPrompt: request.systemPrompt,
      signal: request.signal,
      onUsage,
      prefixMode: request.prefixMode,
      prefixContent: request.prefixContent,
    });
  }

  const parsed = parseResponse(fullText, { repair: request.repairTags === true });
  return { fullText, parsed, usage };
}

function mergeRawUsage(previous: unknown, next: unknown): unknown {
  if (isPlainRecord(previous) && isPlainRecord(next)) {
    const merged: Record<string, unknown> = { ...previous };
    for (const [key, value] of Object.entries(next)) {
      merged[key] = isPlainRecord(merged[key]) && isPlainRecord(value)
        ? { ...merged[key], ...value }
        : value;
    }
    return merged;
  }
  return next ?? previous;
}

function collectRawUsageKeys(rawUsage: unknown, fallback?: string[]): string[] | undefined {
  if (isPlainRecord(rawUsage)) return Object.keys(rawUsage).sort();
  return fallback;
}

function mergeUsagePath(previous?: string, next?: string): string | undefined {
  const parts = [...(previous ?? '').split('+'), ...(next ?? '').split('+')]
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.length) return undefined;
  return Array.from(new Set(parts)).join('+');
}

function hasReturnedCacheStats(usage?: ChatCompletionUsage): boolean {
  return Boolean(
    usage &&
    (
      typeof usage.cachedTokens === 'number' ||
      typeof usage.uncachedTokens === 'number' ||
      typeof usage.cacheHitRate === 'number'
    ),
  );
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}
