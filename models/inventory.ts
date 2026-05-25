// 背包系统数据模型(v2,统一装备+背包)。
//
// 设计要点:
// - 6 大分类(食物/消耗品/光锥/武器/纪念品/关键道具)
// - 品质三档:蓝/紫/金(对应崩铁原著 3/4/5 星)
// - 装备 + 背包统一 schema:光锥/武器也是背包物品,
//   通过 `当前装备部位` 字段判断是否已穿戴
// - 消耗品 / 食物可写 `使用效果`,玩家点「使用」直接走服务层施加到角色

import type { 装备槽位ID } from './equipment';

export type 物品分类 =
  | 'food'
  | 'consumable'
  | 'lightcone'
  | 'weapon'
  | 'clothing'
  | 'accessory'
  | 'memento'
  | 'key';

export const ITEM_CATEGORY_LABELS: Record<物品分类, string> = {
  food: '食物',
  consumable: '消耗品',
  lightcone: '光锥',
  weapon: '武器',
  clothing: '衣服',
  accessory: '饰品',
  memento: '纪念品',
  key: '关键道具',
};

export const ITEM_CATEGORY_ORDER: 物品分类[] = [
  'food',
  'consumable',
  'lightcone',
  'weapon',
  'clothing',
  'accessory',
  'memento',
  'key',
];

/** 装备类的分类:这些类型可以穿戴。 */
export const EQUIPPABLE_CATEGORIES: 物品分类[] = ['lightcone', 'weapon', 'clothing', 'accessory'];

export type 物品品质 = '蓝' | '紫' | '金';

export const ITEM_QUALITY_ORDER: 物品品质[] = ['金', '紫', '蓝'];

export const ITEM_QUALITY_COLORS: Record<物品品质, string> = {
  蓝: 'rgba(120, 170, 230, 0.85)',
  紫: 'rgba(190, 145, 230, 0.9)',
  金: 'rgba(245, 217, 122, 0.95)',
};

/** 消耗品 / 食物的使用效果。只作为叙事提示，不再改旧战斗数值。 */
export type 使用效果目标 = '恢复体力' | '缓解伤势' | '稳定情绪' | '补充物资' | '其它';

export interface 物品使用效果 {
  目标属性: 使用效果目标;
  数值: number;
  依据?: string;
}

/** 物品来源(给玩家一个出处,可选)。 */
export type 物品来源 = '剧情掉落' | '任务奖励' | '商店' | '打造' | '其它';

export interface 背包物品 {
  id: string;
  类别: 物品分类;
  名称: string;
  描述: string;
  数量: number;
  品质: 物品品质;
  可堆叠: boolean;
  获得回合: number;

  // 装备类专用(仅当 类别 ∈ EQUIPPABLE_CATEGORIES 时有意义)
  装备槽位?: 装备槽位ID;          // 这件装备的目标槽位
  当前装备部位?: 装备槽位ID;       // 当前穿戴在哪个槽位(空 = 未穿戴)
  叙事效果?: string[];
  /** @deprecated 旧数值装备字段，仅用于兼容旧存档。新物品不要再写入。 */
  属性加成?: Record<string, number>;

  // 消耗品 / 食物专用
  使用效果?: 物品使用效果[];

  // 通用扩展(均可省略)
  价值?: number;
  来源?: 物品来源;
  来源描述?: string;
  获得时间?: string; // in-fiction 日期
}

export function 创建背包物品(input: {
  类别: 物品分类;
  名称: string;
  描述?: string;
  数量?: number;
  品质?: 物品品质;
  可堆叠?: boolean;
  获得回合: number;
  装备槽位?: 装备槽位ID;
  叙事效果?: string[];
  /** @deprecated 旧数值装备字段，仅用于兼容旧存档。 */
  属性加成?: Record<string, number>;
  使用效果?: 物品使用效果[];
  价值?: number;
  来源?: 物品来源;
  来源描述?: string;
  获得时间?: string;
}): 背包物品 {
  return {
    id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    类别: input.类别,
    名称: input.名称,
    描述: input.描述 ?? '',
    数量: input.数量 ?? 1,
    品质: input.品质 ?? '蓝',
    可堆叠: input.可堆叠 ?? defaultStackable(input.类别),
    获得回合: input.获得回合,
    装备槽位: input.装备槽位,
    叙事效果: input.叙事效果,
    属性加成: input.属性加成,
    使用效果: input.使用效果,
    价值: input.价值,
    来源: input.来源,
    来源描述: input.来源描述,
    获得时间: input.获得时间,
  };
}

/** 默认堆叠规则:装备类不堆叠(每件独立),其它默认可叠。 */
export function defaultStackable(category: 物品分类): boolean {
  return !EQUIPPABLE_CATEGORIES.includes(category);
}

/** 是否属于装备类。 */
export function 是装备类(item: 背包物品): boolean {
  return EQUIPPABLE_CATEGORIES.includes(item.类别);
}

/** 是否已穿戴(装备类专用)。 */
export function 是已穿戴(item: 背包物品): boolean {
  return Boolean(item.当前装备部位);
}
