import type { 智库分类 } from '@/models/zhiku';

export type Bucket = 'all' | 'builtin' | 'custom';

export const cardClip = 'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
export const smallClip = 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

export const categories: 智库分类[] = ['story', 'character', 'location', 'faction', 'term', 'event'];

export const categoryDescriptions: Record<智库分类, string> = {
  story: '主线 / 支线 / 续闻',
  character: '角色 / NPC / 称呼',
  npc: '常驻 NPC / 路人 / 联动对象',
  location: '星球 / 区域 / 场所',
  item: '道具 / 装备 / 遗物',
  faction: '组织 / 立场 / 动向',
  term: '命途 / 星神 / 专有名词',
  event: '事件 / 历史 / 新闻苗头',
  system: '项目规则 / 调用规范',
};

export const zhikuScopeOptions = ['主剧情', '手机', '新闻', '变量参考', '剧情编织', '通用', '只读'];

export const isDevBuild = typeof import.meta !== 'undefined' && Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

export type Draft = {
  标题: string; 分类: 智库分类; 来源: string; 关键词: string; 资料类型: string;
  关联角色ID: string; 关联形态ID: string; 解锁状态: string; 剧透等级: string;
  使用范围: string[]; 外貌锚点: string; 性格锚点: string; 说话方式: string;
  行为习惯: string; 关系边界: string; 禁止误写: string; 摘要: string; 原文: string;
  角色故事摘要: string; 重要度: number; 可用于联动: boolean;
};

export function 创建空草稿(分类: 智库分类 = 'story'): Draft {
  return {
    标题: '', 分类, 来源: '', 关键词: '', 资料类型: '', 关联角色ID: '', 关联形态ID: '',
    解锁状态: '', 剧透等级: '', 使用范围: [], 外貌锚点: '', 性格锚点: '', 说话方式: '',
    行为习惯: '', 关系边界: '', 禁止误写: '', 摘要: '', 原文: '', 角色故事摘要: '',
    重要度: 3, 可用于联动: true,
  };
}
