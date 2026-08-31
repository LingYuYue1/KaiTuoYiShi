import * as z from 'zod';
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
 * 导入边界的信封校验：只验证「这是不是我们自己的包、版本对不对、必要结构在不在」。
 * 包内具体配置项（apiSettings/routes 的深层内容）的形状校验见 P1——信封一旦确认是本应用的包，
 * 深层内容按既有类型信任，与 settings 各子系统 schema 化后对齐。
 */
export const API配置包信封Schema = z.object({
  app: z.literal('KaiTuoYiShi'),
  kind: z.literal('api-profile'),
  version: z.literal(1),
  apiSettings: z.object({ configs: z.array(z.unknown()) }),
  routes: z.record(z.string(), z.unknown()),
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
