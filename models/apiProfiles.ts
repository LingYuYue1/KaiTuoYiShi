import * as z from 'zod';
import { AI提供商列表, 文生图后端列表 } from '@/models/settings';
import type { AI提供商, API设置, 游戏设置 } from '@/models/settings';

/**
 * API 配置包：主 API 与各子功能独立接口的快照，用于本机方案槽位与导入导出。
 * 原定义在 ApiSettings.tsx 组件内（片 panel-p9 提升为共享模型，供 useDeviceSettings 强类型使用）。
 */
export interface API配置包 {
  app: 'KaiTuoYiShi';
  kind: 'api-profile';
  version: 1;
  exportedAt: string;
  includeApiKeys: boolean;
  enableClaudeMode?: boolean;
  deepSeekMainMode?: 游戏设置['deepSeekMainMode'];
  apiSettings: API设置;
  routes: {
    variableApi: 游戏设置['variableApi'];
    新闻系统: 游戏设置['新闻系统']['api'];
    手机系统: 游戏设置['手机系统']['api'];
    智库系统: 游戏设置['智库系统']['api'];
    剧情编织系统: 游戏设置['剧情编织系统']['api'];
    记忆总结API: 游戏设置['记忆系统']['记忆总结API'];
    忆庭召回API: 游戏设置['记忆系统']['忆庭召回API'];
    忆庭精炼API: 游戏设置['记忆系统']['忆庭精炼API'];
    文生图普通接口: 游戏设置['文生图系统']['普通接口'];
    文生图场景接口: 游戏设置['文生图系统']['场景接口'];
    文生图NSFW接口: 游戏设置['文生图系统']['NSFW接口'];
    文生图词组转化器API: 游戏设置['文生图系统']['词组转化器API'];
  };
}

/**
 * 导入边界校验包标识、版本和各配置项的持久化形状。
 * 路由只声明 resolveApiOverrideFields 实际消费的覆盖字段；高级采样参数属于主配置。
 */
const AI提供商Schema = z.enum(AI提供商列表);
const API覆盖Schema = z.object({
  provider: AI提供商Schema,
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  maxTokens: z.number().int().optional(),
  temperature: z.number().optional(),
  retryCount: z.number().int().min(0).optional(),
});
const 可空ProviderAPI覆盖Schema = API覆盖Schema.extend({ provider: AI提供商Schema.or(z.literal('')) });
const 忆庭API覆盖Schema = 可空ProviderAPI覆盖Schema.extend({
  retryCount: z.number().int().min(0).optional().default(2),
});

const API配置项Schema = API覆盖Schema.extend({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  topP: z.number().optional(),
  topK: z.number().optional(),
  topA: z.number().optional(),
  minP: z.number().optional(),
  repetitionPenalty: z.number().optional(),
  frequencyPenalty: z.number().optional(),
  presencePenalty: z.number().optional(),
  maxContext: z.number().int().optional(),
  enableClaudeMode: z.boolean().optional(),
});

const API设置Schema = z.object({
  activeConfigId: z.string().nullable(),
  configs: z.array(API配置项Schema),
});

const 文生图配置Schema = z.object({
  enabled: z.boolean(),
  backend: z.enum(文生图后端列表),
  baseUrl: z.string(),
  apiKey: z.string(),
  model: z.string(),
  pathMode: z.enum(['preset', 'custom']),
  presetPath: z.enum(['openai_images', 'novelai_generate', 'sd_txt2img', 'comfyui_prompt']),
  customPath: z.string(),
  responseFormat: z.enum(['url', 'b64_json', 'dataUrl']),
  defaultSize: z.string(),
  defaultStyle: z.enum(['hsr', 'anime', 'realistic', 'custom']),
  customStyle: z.string(),
  steps: z.number(),
  cfgScale: z.number(),
  seed: z.number(),
  sampler: z.enum(['k_euler', 'k_euler_ancestral', 'k_dpmpp_2m', 'k_dpmpp_2s_ancestral', 'k_dpmpp_sde', 'k_dpmpp_2m_sde']),
  noiseSchedule: z.enum(['native', 'karras', 'exponential', 'polyexponential']),
  useDefaultComfyWorkflow: z.boolean(),
  comfyWorkflowJson: z.string(),
  negativePrompt: z.string(),
  retryCount: z.number().int().min(0),
});

export const API配置包信封Schema = z.object({
  app: z.literal('KaiTuoYiShi'),
  kind: z.literal('api-profile'),
  version: z.literal(1),
  exportedAt: z.string(),
  includeApiKeys: z.boolean(),
  enableClaudeMode: z.boolean().optional(),
  deepSeekMainMode: z.enum(['off', 'standard', 'lock_format']).optional(),
  apiSettings: API设置Schema,
  routes: z.object({
    variableApi: API覆盖Schema,
    新闻系统: API覆盖Schema,
    手机系统: API覆盖Schema,
    智库系统: API覆盖Schema,
    剧情编织系统: API覆盖Schema,
    记忆总结API: 忆庭API覆盖Schema,
    忆庭召回API: 忆庭API覆盖Schema,
    忆庭精炼API: 忆庭API覆盖Schema,
    文生图普通接口: 文生图配置Schema,
    文生图场景接口: 文生图配置Schema,
    文生图NSFW接口: 文生图配置Schema,
    文生图词组转化器API: 可空ProviderAPI覆盖Schema,
  }),
});

export type API配置包信封 = z.infer<typeof API配置包信封Schema>;

/** 本机 API 方案槽位：保存整套 API 配置的本地快照，最多 12 个。原定义在 ApiSettings.tsx 组件内（片 panel-p9 提升共享）。 */
export interface API方案槽位 {
  id: string;
  name: string;
  savedAt: number;
  profile: API配置包;
}

/** 辅助 API 配置：其他文本 API 批量套用形态。原定义在 ApiSettings.tsx 组件内（片 panel-p9 提升共享）。 */
export interface AuxApiProfileState {
  provider: AI提供商;
  baseUrl: string;
  apiKey: string;
  model: string;
}
