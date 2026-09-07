import { describe, expect, it } from 'vitest';
import { validateApiProfile } from '@/utils/apiProfile';

const 合法包 = {
  app: 'KaiTuoYiShi',
  kind: 'api-profile',
  version: 1,
  exportedAt: '2026-08-31T00:00:00.000Z',
  includeApiKeys: false,
  apiSettings: { activeConfigId: null, configs: [] },
  routes: {
    variableApi: { provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '', retryCount: 2 },
    新闻系统: { provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '', retryCount: 2 },
    手机系统: { provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '', retryCount: 2 },
    智库系统: { provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '', retryCount: 2 },
    剧情编织系统: { provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '', retryCount: 2 },
    记忆总结API: { provider: '', baseUrl: '', apiKey: '', model: '', retryCount: 2 },
    忆庭召回API: { provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '', retryCount: 2 },
    忆庭精炼API: { provider: 'openai_compatible', baseUrl: '', apiKey: '', model: '', retryCount: 2 },
    文生图普通接口: { enabled: true, backend: 'openai_compatible', baseUrl: '', apiKey: '', model: '', pathMode: 'preset', presetPath: 'openai_images', customPath: '', responseFormat: 'url', defaultSize: '1024x1024', defaultStyle: 'hsr', customStyle: '', steps: 20, cfgScale: 7, seed: -1, sampler: 'k_euler', noiseSchedule: 'native', useDefaultComfyWorkflow: true, comfyWorkflowJson: '', negativePrompt: '', retryCount: 1 },
    文生图场景接口: { enabled: true, backend: 'openai_compatible', baseUrl: '', apiKey: '', model: '', pathMode: 'preset', presetPath: 'openai_images', customPath: '', responseFormat: 'url', defaultSize: '1024x1024', defaultStyle: 'hsr', customStyle: '', steps: 20, cfgScale: 7, seed: -1, sampler: 'k_euler', noiseSchedule: 'native', useDefaultComfyWorkflow: true, comfyWorkflowJson: '', negativePrompt: '', retryCount: 1 },
    文生图NSFW接口: { enabled: true, backend: 'openai_compatible', baseUrl: '', apiKey: '', model: '', pathMode: 'preset', presetPath: 'openai_images', customPath: '', responseFormat: 'url', defaultSize: '1024x1024', defaultStyle: 'hsr', customStyle: '', steps: 20, cfgScale: 7, seed: -1, sampler: 'k_euler', noiseSchedule: 'native', useDefaultComfyWorkflow: true, comfyWorkflowJson: '', negativePrompt: '', retryCount: 1 },
    文生图词组转化器API: { provider: '', baseUrl: '', apiKey: '', model: '', retryCount: 2 },
  },
};

describe('API 配置包导入校验', () => {
  it('合法包原样通过', () => {
    expect(validateApiProfile(合法包)).toStrictEqual(合法包);
  });

  it('保留主配置的高级采样字段', () => {
    const profile = {
      ...合法包,
      apiSettings: {
        activeConfigId: 'config-1',
        configs: [{
          id: 'config-1', name: '主配置', provider: 'openai', baseUrl: '', apiKey: '', model: 'gpt',
          maxTokens: 32000, temperature: 0.7, topP: 0.9, topK: 40, topA: 0.1, minP: 0.05,
          repetitionPenalty: 1.1, frequencyPenalty: 0.2, presencePenalty: 0.3, maxContext: 64000,
          retryCount: 3, enableClaudeMode: true, createdAt: 1, updatedAt: 2,
        }],
      },
    };
    expect(validateApiProfile(profile)).toStrictEqual(profile);
  });

  it('允许旧包省略可选覆盖字段', () => {
    const legacy = structuredClone(合法包);
    for (const route of [
      legacy.routes.variableApi,
      legacy.routes.新闻系统,
      legacy.routes.手机系统,
      legacy.routes.智库系统,
      legacy.routes.剧情编织系统,
      legacy.routes.记忆总结API,
      legacy.routes.忆庭召回API,
      legacy.routes.忆庭精炼API,
      legacy.routes.文生图词组转化器API,
    ]) {
      delete (route as Record<string, unknown>).retryCount;
      delete (route as Record<string, unknown>).maxTokens;
      delete (route as Record<string, unknown>).temperature;
    }
    const parsed = validateApiProfile(legacy);
    expect(parsed.routes.variableApi.retryCount).toBeUndefined();
    expect(parsed.routes['记忆总结API'].retryCount).toBe(2);
    expect(parsed.routes['文生图普通接口']).toStrictEqual(legacy.routes['文生图普通接口']);
  });

  it('应用标识或包类型不对时报「不是有效的配置包」', () => {
    expect(() => validateApiProfile({ ...合法包, app: '别的游戏' }))
      .toThrow('不是有效的开拓轶事 API 配置包。');
    expect(() => validateApiProfile({ ...合法包, kind: 'save' }))
      .toThrow('不是有效的开拓轶事 API 配置包。');
    expect(() => validateApiProfile('不是对象')).toThrow('不是有效的开拓轶事 API 配置包。');
  });

  it('版本不对时报版本不兼容', () => {
    expect(() => validateApiProfile({ ...合法包, version: 2 }))
      .toThrow('API 配置包版本不兼容，请更新客户端后再导入。');
  });

  it('缺必要结构时报缺少必要配置', () => {
    expect(() => validateApiProfile({ ...合法包, apiSettings: {} }))
      .toThrow('API 配置包缺少必要配置。');
    expect(() => validateApiProfile({ ...合法包, routes: undefined }))
      .toThrow('API 配置包缺少必要配置。');
  });

  it('深层配置形状错误时拒绝导入', () => {
    expect(() => validateApiProfile({ ...合法包, routes: { ...合法包.routes, variableApi: { provider: 'invalid' } } }))
      .toThrow('API 配置包缺少必要配置。');
  });
});
