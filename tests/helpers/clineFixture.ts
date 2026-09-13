import type { API配置项 } from '@/models/settings';

export function clineConfig(overrides: Partial<API配置项> = {}): API配置项 {
  return {
    id: 'cline-1',
    name: 'Cline',
    provider: 'cline',
    baseUrl: 'https://api.cline.bot/api/v1',
    apiKey: 'sk-cline',
    model: 'cline-pass/kimi-k3',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}
