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
import type { 背包物品 } from './inventory';
import type { 战技记录 } from './skill';
import type { NPC角色锚点档案 } from './npc';

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
    角色锚点?: NPC角色锚点档案;
  };

  // 「踏上旅途」相关字段
  属性: 六维属性;
  /** 兼容字段：开局选的主命途 id。新代码请用 命途列表[] 数组 */
  主命途: 命途ID | '';
  /** 旅人当前承载的全部命途（含进度/阶段）。开局会用 主命途 字段初始化一条。 */
  命途列表: 命途进度[];
  能力: string[];

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
      命途列表: [创建命途进度(t.主命途, true, awakenedAt, '开局承载')],
    };
  }
  return { ...t, 命途列表: [] };
}

/**
 * 旅人归一化单一来源（GitHub #15）：读档侧（saveLoadWorkflow）与新局初始化侧
 * （newGameInitialization）共用的兜底收口，替换两侧各自的复制实现。
 * 容忍未知/半成品数据：
 *  - 非对象（null / 数组 / 原始值）→ 空角色兜底；
 *  - 各字段按类型兜底，对已归一化旅人是内容守恒的收口；
 *  - 命途列表缺失但 主命途 有值时，用 awakenedAt 补一条主命途记录（读档侧传当前日期，新局侧用默认空）。
 */
export function 归一化旅人(value: unknown, awakenedAt = ''): 角色数据结构 {
  const base = 创建空角色();
  const raw = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Partial<角色数据结构>
    : {};
  return 确保命途列表({
    ...base,
    ...raw,
    姓名: typeof raw.姓名 === 'string' ? raw.姓名 : base.姓名,
    别名: typeof raw.别名 === 'string' ? raw.别名 : base.别名,
    性别: typeof raw.性别 === 'string' ? raw.性别 : base.性别,
    年龄: Number.isFinite(Number(raw.年龄)) ? Number(raw.年龄) : base.年龄,
    专长知识: Array.isArray(raw.专长知识) ? raw.专长知识.filter((item): item is string => typeof item === 'string') : base.专长知识,
    图像档案: raw.图像档案 && typeof raw.图像档案 === 'object' ? raw.图像档案 : base.图像档案,
    属性: raw.属性 ?? base.属性,
    命途列表: Array.isArray(raw.命途列表) ? raw.命途列表 : base.命途列表,
    能力: Array.isArray(raw.能力) ? raw.能力.filter((item): item is string => typeof item === 'string') : base.能力,
    背包: Array.isArray(raw.背包) ? raw.背包 : base.背包,
    战技列表: Array.isArray(raw.战技列表) ? raw.战技列表 : base.战技列表,
  }, awakenedAt);
}
