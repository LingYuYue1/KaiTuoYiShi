import type {
  六维属性,
} from './journey';
import {
  创建空属性,
} from './journey';
import type {
  命途ID,
} from './journey';
import type { 命途进度 } from './path';
import { 创建命途进度 } from './path';
import type { 装备槽位ID } from './equipment';
import type { 背包物品 } from './inventory';
import type { 战技记录 } from './skill';

export interface 角色数据结构 {
  // 基本信息
  姓名: string;
  别名: string;
  性别: string;
  年龄: number;
  生日: string;
  身高: string;

  // 身份(用于第一人称叙述/AI 推断)
  身份: string;

  // 外观与心性
  外貌: string;
  性格: string;
  背景: string;
  专长知识: string[];
  头像: string;
  图像档案?: {
    头像?: string;
    正文头像?: string;
    手机头像?: string;
    立绘?: string;
  };

  // 「踏上旅途」相关字段
  属性: 六维属性;
  /** 兼容字段：开局选的主命途 id。新代码请用 命途列表[] 数组 */
  主命途: 命途ID | '';
  /** 旅人当前承载的全部命途（含进度/阶段）。开局会用 主命途 字段初始化一条。 */
  命途列表: 命途进度[];
  能力: string[];

  // 装备 + 背包(v2 统一为 背包物品。装备字段是 槽位 → 背包物品.id 的引用映射,
  // 真正的物品数据存在 背包 数组里;查询装备时从 背包 里按 id 找。)
  装备: Partial<Record<装备槽位ID, string>>;
  背包: 背包物品[];
  战技列表: 战技记录[];
}

export function 创建空角色(): 角色数据结构 {
  return {
    姓名: '',
    别名: '',
    性别: '',
    年龄: 25,
    生日: '',
    身高: '',
    身份: '',
    外貌: '',
    性格: '',
    背景: '',
    专长知识: [],
    头像: '',
    图像档案: {},
    属性: 创建空属性(),
    主命途: '',
    命途列表: [],
    能力: [],
    装备: {},
    背包: [],
    战技列表: [],
  };
}

/**
 * 老存档兼容：如果 traveler.命途列表 缺失但 traveler.主命途 有值，
 * 据此补一条主命途记录。无副作用：传入即返回新对象。
 */
export function 确保命途列表(t: 角色数据结构, awakenedAt = ''): 角色数据结构 {
  if (Array.isArray(t.命途列表) && t.命途列表.length > 0) return t;
  if (t.主命途 && t.主命途 !== 'none') {
    return {
      ...t,
      命途列表: [创建命途进度(t.主命途 as 命途ID, true, awakenedAt, '开局承载')],
    };
  }
  return { ...t, 命途列表: [] };
}
