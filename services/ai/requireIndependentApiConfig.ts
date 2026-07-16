import type { AI提供商, API配置项 } from '@/models/settings';

type IndependentApiConfig = Readonly<{
  provider: AI提供商 | '';
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
  retryCount?: number;
}>;

export function requireIndependentApiConfig(
  feature: string,
  config: IndependentApiConfig,
  defaults: Readonly<{ maxTokens: number; temperature: number }>,
): API配置项 {
  const provider = config.provider;
  const baseUrl = config.baseUrl.trim();
  const apiKey = config.apiKey.trim();
  const model = config.model.trim();
  const missing = [
    !provider && 'provider',
    !baseUrl && 'baseUrl',
    !apiKey && 'apiKey',
    !model && 'model',
  ].filter(Boolean);
  if (!provider || !baseUrl || !apiKey || !model) {
    throw new Error(`${feature}独立 API 配置不完整：${missing.join('、')}`);
  }

  return {
    id: `kernel:${feature}`,
    name: feature,
    provider,
    baseUrl,
    apiKey,
    model,
    maxTokens: config.maxTokens ?? defaults.maxTokens,
    temperature: config.temperature ?? defaults.temperature,
    retryCount: config.retryCount ?? 2,
    createdAt: 0,
    updatedAt: 0,
  };
}
