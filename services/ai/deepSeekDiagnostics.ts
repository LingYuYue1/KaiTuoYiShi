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

export interface DeepSeekDiagnosticsSummary {
  model: string;
  sawReasoning: boolean;
  attempts: number;
}

export interface DeepSeekDiagnosticsOptions {
  maxTokens?: number;
  onSummary?: (summary: DeepSeekDiagnosticsSummary) => void;
  execute: (
    config: API配置项,
    options: DeepSeekAttemptOptions,
  ) => Promise<{ text: string; diagnostics: DeepSeekAttemptDiagnostics }>;
}

/**
 * DeepSeek uses the exact configured model. This coordinator records transport
 * diagnostics only; model substitution and hidden recovery prompts do not exist.
 */
export async function executeWithDeepSeekDiagnostics(
  config: API配置项,
  options: DeepSeekDiagnosticsOptions,
): Promise<{ text: string; diagnostics: DeepSeekAttemptDiagnostics; summary: DeepSeekDiagnosticsSummary }> {
  const result = await options.execute(config, { maxTokens: options.maxTokens });
  const summary: DeepSeekDiagnosticsSummary = {
    model: config.model,
    sawReasoning: result.diagnostics.sawReasoning,
    attempts: 1,
  };
  options.onSummary?.(summary);
  const explicitDeepSeek = config.provider === 'deepseek'
    || /deepseek/i.test(config.baseUrl)
    || /deepseek/i.test(config.model);
  if (explicitDeepSeek && !result.diagnostics.sawVisibleContent) {
    throw new Error(`DeepSeek model ${config.model} returned no visible content`);
  }
  return { ...result, summary };
}
