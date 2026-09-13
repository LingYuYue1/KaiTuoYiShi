import { describe, expect, it, vi } from 'vitest';
import type { API配置项 } from '@/models/settings';
import { AI提供商列表 } from '@/models/settings';
import { providerOptions } from '@/components/features/Settings/settingsShared';
import { CLINE_RECOMMENDED_MODELS } from '@/services/ai/clineModels';
import { detectProvider, isClineConfig, withPrefixMessages } from '@/services/ai/chatCompletionProvider';
import { fetchModels } from '@/services/ai/apiTools';

function clineConfig(overrides: Partial<API配置项> = {}): API配置项 {
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

describe('Cline 提供商登记', () => {
  it('AI提供商列表与设置选项包含 cline 及默认值', () => {
    expect(AI提供商列表).toContain('cline');
    expect(providerOptions.find((option) => option.value === 'cline')).toMatchObject({
      label: 'Cline',
      defaultBaseUrl: 'https://api.cline.bot/api/v1',
      defaultModel: 'cline-pass/kimi-k3',
    });
  });

  it('推荐模型目录非空、无重复且包含默认模型', () => {
    const models = [...CLINE_RECOMMENDED_MODELS];
    expect(models.length).toBeGreaterThan(0);
    expect(new Set(models).size).toBe(models.length);
    expect(models).toContain('cline-pass/kimi-k3');
  });
});

describe('Cline 提供商探测与 prefill', () => {
  it('provider 或官方 baseUrl 任一命中都判定为 cline', () => {
    expect(detectProvider(clineConfig())).toBe('cline');
    expect(detectProvider(clineConfig({ provider: 'openai_compatible' }))).toBe('cline');
    expect(isClineConfig(clineConfig({ provider: 'openai_compatible' }))).toBe(true);
  });

  it('非 Cline 配置不误判', () => {
    const openai = clineConfig({ provider: 'openai_compatible', baseUrl: 'https://api.openai.com/v1' });
    expect(detectProvider(openai)).toBe('openai_compatible');
    expect(isClineConfig(openai)).toBe(false);
  });

  it('prefixMode 下不追加 assistant prefill（Cline 不支持）', () => {
    const result = withPrefixMessages(clineConfig(), [{ role: 'user', content: '你好' }], {
      messages: [],
      prefixMode: true,
      prefixContent: '<thinking>\n',
    });
    expect(result.prefix).toBe('');
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({ role: 'user', content: '你好' });
  });
});

describe('Cline 模型发现', () => {
  it('不请求 /models，直接返回内置推荐目录', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('不应发起网络请求');
    });
    vi.stubGlobal('fetch', fetchSpy);
    try {
      const models = await fetchModels({
        provider: 'cline',
        baseUrl: 'https://api.cline.bot/api/v1',
        apiKey: 'k',
        retryCount: 0,
      });
      expect(models).toEqual([...CLINE_RECOMMENDED_MODELS]);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
