// 装备槽位定义(v3,8 槽位)。
// 装备物品 已统一进 背包物品(见 inventory.ts)。这里只是枚举 + 标签。
//
// 槽位族:
// - 武器类:lightcone(光锥)、weapon(武器)
// - 服装类:head(帽子)、outfit(衣服)、legs(裤子)、feet(鞋子)
// - 饰品类:accessory1(饰品 I)、accessory2(饰品 II)
//
// 物品的 类别 决定它能戴到哪个槽位族:
//   lightcone 类别 → lightcone 槽位
//   weapon    类别 → weapon    槽位
//   clothing  类别 → head / outfit / legs / feet 之一(由 装备槽位 字段指定)
//   accessory 类别 → accessory1 / accessory2(穿戴时优先空槽)

export type 装备槽位ID =
  | 'lightcone'
  | 'weapon'
  | 'head'
  | 'outfit'
  | 'legs'
  | 'feet'
  | 'accessory1'
  | 'accessory2';

export const EQUIP_SLOT_LABELS: Record<装备槽位ID, string> = {
  lightcone: '光锥',
  weapon: '武器',
  head: '帽子',
  outfit: '衣服',
  legs: '裤子',
  feet: '鞋子',
  accessory1: '饰品 I',
  accessory2: '饰品 II',
};

export const EQUIP_SLOT_ORDER: 装备槽位ID[] = [
  'lightcone',
  'weapon',
  'head',
  'outfit',
  'legs',
  'feet',
  'accessory1',
  'accessory2',
];

/** 服装类槽位:被 clothing 类别共用。 */
export const CLOTHING_SLOTS: 装备槽位ID[] = ['head', 'outfit', 'legs', 'feet'];

/** 饰品类槽位:被 accessory 类别共用。 */
export const ACCESSORY_SLOTS: 装备槽位ID[] = ['accessory1', 'accessory2'];
