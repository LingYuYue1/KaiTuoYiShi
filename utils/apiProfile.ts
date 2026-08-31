import * as z from 'zod';
import type { AI提供商, API设置, API配置项, 游戏设置 } from '@/models/settings';
import { API配置包信封Schema } from '@/models/apiProfiles';
import type { API配置包, AuxApiProfileState } from '@/models/apiProfiles';
import { providerOptions } from '@/components/features/Settings/settingsShared';

/** 辅助 API 配置默认形态：provider 不存在时回落到目录第一项。 */
export function createDefaultAuxApiProfileState(provider: AI提供商 = 'gemini'): AuxApiProfileState {
  const meta = providerOptions.find((p) => p.value === provider) ?? providerOptions[0];
  return {
    provider: meta.value,
    baseUrl: meta.defaultBaseUrl,
    apiKey: '',
    model: meta.defaultModel,
  };
}

/** 归一化历史持久化的辅助 API 配置：provider 非法时回落，缺失字段补默认值。 */
export function normalizeAuxApiProfileState(input?: Partial<AuxApiProfileState>): AuxApiProfileState {
  const provider = providerOptions.find((p) => p.value === input?.provider) ?? providerOptions[0];
  return {
    provider: provider.value,
    baseUrl: input?.baseUrl ?? provider.defaultBaseUrl,
    apiKey: input?.apiKey ?? '',
    model: input?.model ?? provider.defaultModel,
  };
}

/** 新建主 API 配置项：id 用时间戳，默认值取自供应商目录。 */
export function makeNewConfig(provider: AI提供商): API配置项 {
  const meta = providerOptions.find((p) => p.value === provider) ?? providerOptions[0];
  return {
    id: `config_${Date.now()}`,
    name: `${meta.label} 配置`,
    provider,
    baseUrl: meta.defaultBaseUrl,
    apiKey: '',
    model: meta.defaultModel,
    maxTokens: 8192,
    temperature: 0.8,
    retryCount: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function cloneWithoutKeys<T>(value: T, includeApiKeys: boolean): T {
  const cloned = JSON.parse(JSON.stringify(value)) as T;
  if (includeApiKeys) return cloned;
  const clear = (target: unknown) => {
    if (target && typeof target === 'object' && 'apiKey' in target) {
      const holder = target as { apiKey?: string };
      holder.apiKey = '';
    }
  };
  const root = cloned as unknown as API配置包;
  for (const config of root.apiSettings.configs) clear(config);
  for (const item of Object.values(root.routes)) clear(item);
  return cloned;
}

/** 把当前主 API 设置与各子功能独立接口打包为可迁移快照。 */
export function buildApiProfile(settings: API设置, gameSettings: 游戏设置, includeApiKeys: boolean): API配置包 {
  return cloneWithoutKeys({
    app: 'KaiTuoYiShi',
    kind: 'api-profile',
    version: 1,
    exportedAt: new Date().toISOString(),
    includeApiKeys,
    enableClaudeMode: gameSettings.enableClaudeMode,
    deepSeekMainMode: gameSettings.deepSeekMainMode,
    apiSettings: settings,
    routes: {
      variableApi: gameSettings.variableApi,
      新闻系统: gameSettings.新闻系统.api,
      手机系统: gameSettings.手机系统.api,
      智库系统: gameSettings.智库系统.api,
      剧情编织系统: gameSettings.剧情编织系统.api,
      记忆总结API: gameSettings.记忆系统.记忆总结API,
      忆庭召回API: gameSettings.记忆系统.忆庭召回API,
      忆庭精炼API: gameSettings.记忆系统.忆庭精炼API,
      文生图普通接口: gameSettings.文生图系统.普通接口,
      文生图场景接口: gameSettings.文生图系统.场景接口,
      文生图NSFW接口: gameSettings.文生图系统.NSFW接口,
      文生图词组转化器API: gameSettings.文生图系统.词组转化器API,
    },
  }, includeApiKeys);
}

/** 把 envelope 的校验失败映射回原有的中文提示（用户可见文案不变）。 */
function 配置包错误文案(error: z.ZodError): string {
  const paths = new Set(error.issues.map((issue) => issue.path[0]));
  if (paths.has('version')) return 'API 配置包版本不兼容，请更新客户端后再导入。';
  if (paths.has('apiSettings') || paths.has('routes')) return 'API 配置包缺少必要配置。';
  return '不是有效的开拓轶事 API 配置包。';
}

/** 校验导入的配置包：应用标识、包类型、版本与必要结构。 */
export function validateApiProfile(input: unknown): API配置包 {
  const result = API配置包信封Schema.safeParse(input);
  if (!result.success) {
    throw new Error(配置包错误文案(result.error));
  }
  // 信封已确认是本应用的包，深层配置项按既有类型信任（形状校验见 P1）。
  return input as API配置包;
}

/** 触发浏览器下载配置包 JSON 文件。 */
export function downloadApiProfile(profile: API配置包): void {
  const blob = new Blob([JSON.stringify(profile, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  a.download = `KaiTuoYiShi-api-profile-${profile.includeApiKeys ? 'private' : 'safe'}-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
