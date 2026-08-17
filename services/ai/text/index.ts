import type { API配置项 } from '@/models/settings';
import type { 聊天消息 } from '@/models/chat';
import { chatCompletion, chatCompletionNonStream, type ChatCompletionUsage, type StreamCallbacks } from '@/services/ai/chatCompletionClient';
import { parseResponse } from '@/services/ai/responseParser';
import type { 解析后回复 } from '@/models/chat';
import type { DeepSeekRecoverySummary } from '@/services/ai/deepSeekRecovery';

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
  /** 核采样概率阈值（0-1）。透传给 chatCompletion。 */
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
}

export interface ChatResult {
  fullText: string;
  parsed: 解析后回复;
  usage?: ChatCompletionUsage;
  /** 结束原因：'stop'（正常结束）/ 'length' 或 'max_tokens'（被截断）/ 其他 provider 特有值。
   *  用于抗截断检测，sendWorkflow 据此触发续写重试。 */
  finishReason?: string;
  deepSeekRecovery?: DeepSeekRecoverySummary;
}

export async function sendChatMessage(
  config: API配置项,
  request: ChatRequest,
): Promise<ChatResult> {
  const useStream = request.streaming !== false;
  // 传输层只接收 role/content；debugContext、快照和诊断字段永远留在本地历史/UI，不进入任何模型 payload。
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
  let finishReason: string | undefined;
  let deepSeekRecovery: DeepSeekRecoverySummary | undefined;
  if (useStream) {
    const callbacks: StreamCallbacks = {
      onDelta: request.onDelta,
      onDone: () => {},
      onError: (err) => { throw err; },
      onFinishReason: (reason) => { finishReason = reason; },
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
        topP: request.topP,
        topK: request.topK,
        topA: request.topA,
        minP: request.minP,
        repetitionPenalty: request.repetitionPenalty,
        frequencyPenalty: request.frequencyPenalty,
        presencePenalty: request.presencePenalty,
        maxContext: request.maxContext,
        onDeepSeekRecovery: (summary) => { deepSeekRecovery = summary; },
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
      topP: request.topP,
      topK: request.topK,
      topA: request.topA,
      minP: request.minP,
      repetitionPenalty: request.repetitionPenalty,
      frequencyPenalty: request.frequencyPenalty,
      presencePenalty: request.presencePenalty,
      maxContext: request.maxContext,
      onDeepSeekRecovery: (summary) => { deepSeekRecovery = summary; },
    });
  }

  const parsed = parseResponse(fullText, { repair: request.repairTags === true });
  return { fullText, parsed, usage, finishReason, deepSeekRecovery };
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
