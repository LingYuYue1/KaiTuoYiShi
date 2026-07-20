import type { API设置, 游戏设置, AI提供商 } from './settings';

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

export interface API方案槽位 {
  id: string;
  name: string;
  savedAt: number;
  profile: API配置包;
}

export interface AuxApiProfileState {
  provider: AI提供商;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const API_PROFILE_SLOTS_KEY = 'apiProfileSlots';
export const AUX_API_PROFILE_KEY = 'apiAuxProfileStates';

