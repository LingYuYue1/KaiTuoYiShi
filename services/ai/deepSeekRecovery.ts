import type { API配置项 } from '@/models/settings';

export interface DeepSeekAttemptDiagnostics {
  sawReasoning: boolean;
  sawVisibleContent: boolean;
  finishReason?: string;
  selectedModel: string;
}

export interface DeepSeekAttemptOptions {
  maxTokens?: number;
}

export interface DeepSeekRecoverySummary {
  model: string;
  sawReasoning: boolean;
  attempts: number;
}

export interface DeepSeekRecoveryOptions {
  maxTokens?: number;
  onSummary?: (summary: DeepSeekRecoverySummary) => void;
  execute: (
    config: API配置项,
    options: DeepSeekAttemptOptions,
  ) => Promise<{ text: string; diagnostics: DeepSeekAttemptDiagnostics }>;
}

/**
 * DeepSeek uses the exact configured model. This coordinator records transport
 * diagnostics only; model substitution and hidden recovery prompts do not exist.
 */
export async function executeWithDeepSeekRecovery(
  config: API配置项,
  options: DeepSeekRecoveryOptions,
): Promise<{ text: string; diagnostics: DeepSeekAttemptDiagnostics; summary: DeepSeekRecoverySummary }> {
  const result = await options.execute(config, { maxTokens: options.maxTokens });
  const summary: DeepSeekRecoverySummary = {
    model: config.model,
    sawReasoning: result.diagnostics.sawReasoning,
    attempts: 1,
  };
  options.onSummary?.(summary);
  if (!result.diagnostics.sawVisibleContent) {
    throw new Error(`DeepSeek model ${config.model} returned no visible content`);
  }
  return { ...result, summary };
}
