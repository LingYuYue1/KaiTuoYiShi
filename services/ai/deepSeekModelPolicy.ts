import type { API配置项 } from '@/models/settings';

export type DeepSeekConfidence = 'none' | 'weak' | 'strong';
export type DeepSeekCapability = 'unknown' | 'chat' | 'reasoning';

export interface DeepSeekModelProfile {
  confidence: DeepSeekConfidence;
  capability: DeepSeekCapability;
  isOfficialEndpoint: boolean;
}
const REASONING_MODEL_TOKEN = /(^|[\/:._\-\s])(reasoner|r1(?:[-_\s]\d+)?|thinking|distill)(?=$|[\/:._\-\s])/i;

function readHostname(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function isOfficialDeepSeekBaseUrl(baseUrl: string): boolean {
  const hostname = readHostname(baseUrl.trim());
  return hostname === 'deepseek.com' || hostname.endsWith('.deepseek.com');
}

export function isReasoningModelId(model: string): boolean {
  return REASONING_MODEL_TOKEN.test(model.trim());
}

export function classifyDeepSeekConfig(
  config: Pick<API配置项, 'provider' | 'baseUrl' | 'model'>,
): DeepSeekModelProfile {
  const provider = String(config.provider ?? '').toLowerCase();
  const model = String(config.model ?? '').trim();
  const isOfficialEndpoint = isOfficialDeepSeekBaseUrl(String(config.baseUrl ?? ''));
  const strong = provider === 'deepseek' || isOfficialEndpoint || /deepseek/i.test(model);
  const reasoning = isReasoningModelId(model);
  const confidence: DeepSeekConfidence = strong ? 'strong' : reasoning ? 'weak' : 'none';

  return {
    confidence,
    capability: reasoning ? 'reasoning' : strong ? 'chat' : 'unknown',
    isOfficialEndpoint,
  };
}

export function resolveKnownDeepSeekChatModel(
  config: Pick<API配置项, 'provider' | 'baseUrl' | 'model'>,
): string | undefined {
  const profile = classifyDeepSeekConfig(config);
  if (!profile.isOfficialEndpoint || profile.confidence !== 'strong') return undefined;
  return /^deepseek-reasoner(?:$|[\/:._\-\s])/i.test(config.model.trim())
    ? 'deepseek-chat'
    : undefined;
}

function fallbackScore(model: string): number {
  const normalized = model.trim().toLowerCase();
  if (normalized === 'deepseek-chat') return 0;
  if (/deepseek[-_\/:.]?v3/i.test(normalized)) return 1;
  if (normalized.includes('deepseek') && normalized.includes('chat')) return 2;
  return 3;
}

export function selectDeepSeekFallbackModel(models: string[], failedModel: string): string | undefined {
  const failed = failedModel.trim().toLowerCase();
  return Array.from(new Set(models.map((model) => String(model).trim()).filter(Boolean)))
    .filter((model) => {
      const normalized = model.toLowerCase();
      return normalized !== failed && normalized.includes('deepseek') && !isReasoningModelId(model);
    })
    .sort((left, right) => fallbackScore(left) - fallbackScore(right) || left.localeCompare(right))[0];
}
