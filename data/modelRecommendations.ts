// 模型输出推荐数据：用模型名正则匹配，给出官方最大输出与建议档位。
// 移植自墨色项目的同名结构。仅作为提示，不强制限制用户填值。

export type MaxOutputTier = '8k' | '32k' | '64k' | 'custom';

export interface MaxOutputTierPreset {
  id: MaxOutputTier;
  label: string;
  value?: number;
}

export const MAX_OUTPUT_TIERS: MaxOutputTierPreset[] = [
  { id: '8k', label: '8K', value: 8_192 },
  { id: '32k', label: '32K', value: 32_768 },
  { id: '64k', label: '64K', value: 65_536 },
  { id: 'custom', label: '自定义' },
];

export interface ModelRecommendation {
  key: string;
  providerLabel: string;
  modelLabel: string;
  matchers: RegExp[];
  officialMaxOutput: number;
  suggestedSelection: number;
  note: string;
  source: string;
  sourceLabel: string;
  updatedAt: string;
}

export const MODEL_RECOMMENDATIONS: ModelRecommendation[] = [
  {
    key: 'openai-gpt-5x',
    providerLabel: 'OpenAI',
    modelLabel: 'GPT-5 / GPT-5.1 / GPT-5.2',
    matchers: [/^gpt-5(\.|-|$)/i],
    officialMaxOutput: 128_000,
    suggestedSelection: 65_536,
    note: '复杂长文建议 64K 档位，超长任务可用自定义（<=128000）。',
    source: 'https://platform.openai.com/docs/models/gpt-5.2/',
    sourceLabel: 'OpenAI GPT-5.2',
    updatedAt: '2026-02',
  },
  {
    key: 'openai-gpt-4-1',
    providerLabel: 'OpenAI',
    modelLabel: 'GPT-4.1 系列',
    matchers: [/^gpt-4\.1/i],
    officialMaxOutput: 32_768,
    suggestedSelection: 32_768,
    note: '推荐 32K 档位。',
    source: 'https://platform.openai.com/docs/models/gpt-4.1',
    sourceLabel: 'OpenAI GPT-4.1',
    updatedAt: '2026-02',
  },
  {
    key: 'openai-gpt-4o',
    providerLabel: 'OpenAI',
    modelLabel: 'GPT-4o / GPT-4o-mini',
    matchers: [/^gpt-4o(-|$)/i, /^gpt-4o-mini(-|$)/i, /^chatgpt-4o/i],
    officialMaxOutput: 16_384,
    suggestedSelection: 8_192,
    note: '常规剧情建议 8K 档位，若需更长输出可自定义至 16384。',
    source: 'https://platform.openai.com/docs/models/gpt-4o',
    sourceLabel: 'OpenAI GPT-4o',
    updatedAt: '2026-02',
  },
  {
    key: 'anthropic-claude-4-5',
    providerLabel: 'Anthropic',
    modelLabel: 'Claude Sonnet/Haiku/Opus 4.5',
    matchers: [/^claude-(sonnet|haiku|opus)-4-5/i, /^claude-(sonnet|haiku|opus)-4\.5/i],
    officialMaxOutput: 65_536,
    suggestedSelection: 65_536,
    note: '默认可用 64K 档位；长上下文 1M 需额外 beta header（与输出上限无关）。',
    source: 'https://docs.anthropic.com/en/docs/models-overview',
    sourceLabel: 'Claude Models Overview',
    updatedAt: '2026-02',
  },
  {
    key: 'gemini-2-5',
    providerLabel: 'Google Gemini',
    modelLabel: 'Gemini 2.5 Pro / Flash / Flash-Lite',
    matchers: [/^gemini-2\.5-(pro|flash|flash-lite)/i],
    officialMaxOutput: 65_536,
    suggestedSelection: 65_536,
    note: '推荐 64K 档位。',
    source: 'https://ai.google.dev/gemini-api/docs/models/gemini-2.5-pro',
    sourceLabel: 'Gemini 2.5 Pro',
    updatedAt: '2026-02',
  },
  {
    key: 'deepseek-chat',
    providerLabel: 'DeepSeek',
    modelLabel: 'deepseek-chat (V3.2)',
    matchers: [/^deepseek-chat$/i],
    officialMaxOutput: 8_192,
    suggestedSelection: 8_192,
    note: '默认 4K，最大 8K。建议 8K 档位。',
    source: 'https://api-docs.deepseek.com/quick_start/pricing',
    sourceLabel: 'DeepSeek Models & Pricing',
    updatedAt: '2026-02',
  },
  {
    key: 'deepseek-reasoner',
    providerLabel: 'DeepSeek',
    modelLabel: 'deepseek-reasoner (V3.2)',
    matchers: [/^deepseek-reasoner$/i],
    officialMaxOutput: 65_536,
    suggestedSelection: 32_768,
    note: '默认 32K，最大 64K；优先 32K，必要时上调到 64K。',
    source: 'https://api-docs.deepseek.com/quick_start/pricing',
    sourceLabel: 'DeepSeek Models & Pricing',
    updatedAt: '2026-02',
  },
];

export function matchModelRecommendation(modelRaw: string): ModelRecommendation | null {
  const model = (modelRaw || '').trim();
  if (!model) return null;
  return MODEL_RECOMMENDATIONS.find((item) => item.matchers.some((m) => m.test(model))) || null;
}

export function inferMaxOutputTier(maxTokens: number | undefined): MaxOutputTier | null {
  if (typeof maxTokens !== 'number' || !Number.isFinite(maxTokens) || maxTokens <= 0) return null;
  if (maxTokens === 8_192) return '8k';
  if (maxTokens === 32_768) return '32k';
  if (maxTokens === 65_536) return '64k';
  return 'custom';
}
