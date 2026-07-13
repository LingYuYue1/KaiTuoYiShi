import type { API配置项 } from '@/models/settings';
import {
  classifyDeepSeekConfig,
  resolveKnownDeepSeekChatModel,
  selectDeepSeekFallbackModel,
} from './deepSeekModelPolicy';
import { fetchOpenAICompatibleModelsCached } from './openAICompatibleModels';

export interface DeepSeekAttemptDiagnostics {
  sawReasoning: boolean;
  sawVisibleContent: boolean;
  finishReason?: string;
  selectedModel: string;
}

export interface DeepSeekAttemptOptions {
  appendRecoveryInstruction: boolean;
  maxTokens?: number;
}

export interface DeepSeekRecoverySummary {
  originalModel: string;
  initialModel: string;
  fallbackModel?: string;
  sawReasoning: boolean;
  attempts: number;
}

export interface DeepSeekRecoveryOptions {
  disabled?: boolean;
  maxTokens?: number;
  onSummary?: (summary: DeepSeekRecoverySummary) => void;
  execute: (
    config: API配置项,
    options: DeepSeekAttemptOptions,
  ) => Promise<{ text: string; diagnostics: DeepSeekAttemptDiagnostics }>;
}

export const DEEPSEEK_FINAL_CONTENT_GUARD = [
  '前一次响应没有产生可用的正式 content。',
  '请停止继续展开推理，立即按原请求要求和原输出格式给出最终可见结果。',
  '不得只返回 reasoning/thinking，不得返回空 content。',
].join('\n');

export class DeepSeekRecoveryExhaustedError extends Error {
  readonly nonRetryable = true;
  readonly summary: DeepSeekRecoverySummary;
  readonly catalogAvailable: boolean;

  constructor(message: string, summary: DeepSeekRecoverySummary, catalogAvailable: boolean) {
    super(message);
    this.name = 'DeepSeekRecoveryExhaustedError';
    this.summary = summary;
    this.catalogAvailable = catalogAvailable;
  }
}

export function isNonRetryableAIError(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { nonRetryable?: boolean }).nonRetryable === true);
}

function hasVisibleContent(result: { text: string; diagnostics: DeepSeekAttemptDiagnostics }): boolean {
  return result.diagnostics.sawVisibleContent;
}

function isOutputBudgetFinish(reason?: string): boolean {
  return reason === 'length' || reason === 'max_tokens';
}

function isModelNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /(?:404|model).*(?:not found|does not exist|不存在|未找到)|(?:not found|does not exist|不存在|未找到).*model/i.test(message);
}

function isMaxTokensLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /max[_\s-]?(?:tokens|completion tokens).*(?:limit|maximum|too large|exceed|上限|过大|超出)/i.test(message);
}

function buildSummary(
  originalModel: string,
  initialModel: string,
  attempts: number,
  sawReasoning: boolean,
  fallbackModel?: string,
): DeepSeekRecoverySummary {
  return { originalModel, initialModel, fallbackModel, sawReasoning, attempts };
}

export async function executeWithDeepSeekRecovery(
  config: API配置项,
  options: DeepSeekRecoveryOptions,
): Promise<{ text: string; diagnostics: DeepSeekAttemptDiagnostics; summary?: DeepSeekRecoverySummary }> {
  const profile = classifyDeepSeekConfig(config);
  const knownChatModel = resolveKnownDeepSeekChatModel(config);
  const initialConfig = knownChatModel ? { ...config, model: knownChatModel } : config;
  const initialModel = initialConfig.model;
  let attempts = 0;
  let sawReasoning = false;

  const run = async (attemptConfig: API配置项, attemptOptions: DeepSeekAttemptOptions) => {
    attempts += 1;
    const result = await options.execute(attemptConfig, attemptOptions);
    sawReasoning ||= result.diagnostics.sawReasoning;
    return result;
  };

  if (options.disabled || profile.confidence === 'none') {
    return run(config, { appendRecoveryInstruction: false, maxTokens: options.maxTokens });
  }

  let firstResult: Awaited<ReturnType<typeof run>> | undefined;
  let shouldSkipToFallback = false;
  try {
    firstResult = await run(initialConfig, {
      appendRecoveryInstruction: false,
      maxTokens: options.maxTokens,
    });
  } catch (error) {
    if (profile.confidence === 'strong' && isModelNotFoundError(error)) {
      shouldSkipToFallback = true;
    } else {
      throw error;
    }
  }

  if (firstResult && hasVisibleContent(firstResult)) {
    const summary = buildSummary(config.model, initialModel, attempts, sawReasoning);
    options.onSummary?.(summary);
    return { ...firstResult, summary };
  }

  if (profile.confidence === 'weak' && firstResult?.diagnostics.sawReasoning !== true) {
    return firstResult ?? run(config, { appendRecoveryInstruction: false, maxTokens: options.maxTokens });
  }

  if (!shouldSkipToFallback && firstResult) {
    const raiseBudget = firstResult.diagnostics.sawReasoning || isOutputBudgetFinish(firstResult.diagnostics.finishReason);
    try {
      const retryResult = await run(initialConfig, {
        appendRecoveryInstruction: true,
        maxTokens: raiseBudget ? Math.max(options.maxTokens ?? config.maxTokens ?? 2048, 8192) : options.maxTokens,
      });
      if (hasVisibleContent(retryResult)) {
        const summary = buildSummary(config.model, initialModel, attempts, sawReasoning);
        options.onSummary?.(summary);
        return { ...retryResult, summary };
      }
    } catch (error) {
      if (!isMaxTokensLimitError(error) && !isModelNotFoundError(error)) throw error;
    }
  }

  let catalogAvailable = false;
  let fallbackModel: string | undefined;
  try {
    const models = await fetchOpenAICompatibleModelsCached(config.baseUrl, config.apiKey);
    catalogAvailable = true;
    fallbackModel = selectDeepSeekFallbackModel(models, initialModel);
  } catch {
    if (profile.isOfficialEndpoint && initialModel.toLowerCase() !== 'deepseek-chat') {
      fallbackModel = 'deepseek-chat';
    }
  }

  if (!fallbackModel) {
    const summary = buildSummary(config.model, initialModel, attempts, sawReasoning);
    options.onSummary?.(summary);
    throw new DeepSeekRecoveryExhaustedError(
      catalogAvailable
        ? `DeepSeek 模型 ${initialModel} 没有返回正式正文，同接口未找到可用的 DeepSeek Chat/V3 模型。`
        : `DeepSeek 模型 ${initialModel} 没有返回正式正文，且模型目录不可用，无法安全选择回退模型。`,
      summary,
      catalogAvailable,
    );
  }

  const fallbackConfig = { ...config, model: fallbackModel };
  const fallbackResult = await run(fallbackConfig, {
    appendRecoveryInstruction: true,
    maxTokens: options.maxTokens,
  });
  const summary = buildSummary(config.model, initialModel, attempts, sawReasoning, fallbackModel);
  options.onSummary?.(summary);
  if (!hasVisibleContent(fallbackResult)) {
    throw new DeepSeekRecoveryExhaustedError(
      `DeepSeek 原模型 ${initialModel} 与回退模型 ${fallbackModel} 都没有返回正式正文。`,
      summary,
      catalogAvailable,
    );
  }
  return { ...fallbackResult, summary };
}
