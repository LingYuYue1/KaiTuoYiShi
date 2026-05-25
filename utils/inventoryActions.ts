// 背包服务层。集中处理 获取/使用/丢弃/穿戴/卸下,保持 UI 与 AI 链路只调这些函数,
// 不直接戳 traveler.背包 数组,避免遗漏副作用(同步装备槽、堆叠合并、属性重算入口)。

import type { 角色数据结构 } from '@/models/character';
import type {
  背包物品,
  物品分类,
  物品品质,
  物品来源,
  物品使用效果,
  使用效果目标,
} from '@/models/inventory';
import {
  创建背包物品,
  defaultStackable,
  EQUIPPABLE_CATEGORIES,
  是装备类,
} from '@/models/inventory';
import type { 装备槽位ID } from '@/models/equipment';
import { ACCESSORY_SLOTS, CLOTHING_SLOTS } from '@/models/equipment';

// ── 获取物品 ──
// 同名同类且双方都「可堆叠」时合并数量;否则作为新条目 push。
// 装备类(光锥/武器)默认不堆叠 → 每件独立存在。
export interface 获取物品输入 {
  类别: 物品分类;
  名称: string;
  描述?: string;
  数量?: number;
  品质?: 物品品质;
  可堆叠?: boolean;
  装备槽位?: 装备槽位ID;
  叙事效果?: string[];
  /** @deprecated 旧数值装备字段，仅用于兼容旧存档。 */
  属性加成?: Record<string, number>;
  使用效果?: 物品使用效果[];
  价值?: number;
  来源?: 物品来源;
  来源描述?: string;
  获得时间?: string;
}

export interface 获取物品结果 {
  traveler: 角色数据结构;
  item: 背包物品;
  stacked: boolean;
  message: string;
}

export function 获取物品(
  traveler: 角色数据结构,
  input: 获取物品输入,
  options: { 获得回合: number } = { 获得回合: 0 },
): 获取物品结果 {
  const inventory = traveler.背包 ?? [];
  const requested = Math.max(1, Math.trunc(input.数量 ?? 1));
  const stackable = input.可堆叠 ?? defaultStackable(input.类别);

  // 装备类:每件独立,直接 push
  if (EQUIPPABLE_CATEGORIES.includes(input.类别) || !stackable) {
    const item = 创建背包物品({
      ...input,
      数量: requested,
      可堆叠: false,
      获得回合: options.获得回合,
    });
    return {
      traveler: { ...traveler, 背包: [...inventory, item] },
      item,
      stacked: false,
      message: `获得 ${item.名称}${requested > 1 ? ` ×${requested}` : ''}`,
    };
  }

  // 尝试堆叠:同名 + 同类 + 双方都可堆叠
  const existIdx = inventory.findIndex(
    (it) => it.类别 === input.类别 && it.名称 === input.名称 && it.可堆叠,
  );
  if (existIdx >= 0) {
    const existing = inventory[existIdx];
    const next: 背包物品 = { ...existing, 数量: existing.数量 + requested };
    const nextInventory = [...inventory];
    nextInventory[existIdx] = next;
    return {
      traveler: { ...traveler, 背包: nextInventory },
      item: next,
      stacked: true,
      message: `获得 ${next.名称} ×${requested}(已堆叠至 ${next.数量})`,
    };
  }

  // 新条目
  const item = 创建背包物品({
    ...input,
    数量: requested,
    可堆叠: true,
    获得回合: options.获得回合,
  });
  return {
    traveler: { ...traveler, 背包: [...inventory, item] },
    item,
    stacked: false,
    message: `获得 ${item.名称}${requested > 1 ? ` ×${requested}` : ''}`,
  };
}

// ── 使用物品(消耗品 / 食物) ──
// - 仅 类别 ∈ {food, consumable} 可用
// - 扣 count(默认 1);堆叠数到 0 后删条目
// - 使用效果只作为叙事记录，不再修改旧战斗数值
export interface 使用物品结果 {
  traveler: 角色数据结构;
  ok: boolean;
  consumed: boolean;
  effects: { 目标属性: 使用效果目标; 数值: number }[];
  message: string;
}

const USABLE_CATEGORIES: 物品分类[] = ['food', 'consumable'];

export function 使用物品(
  traveler: 角色数据结构,
  itemId: string,
  count = 1,
): 使用物品结果 {
  const inventory = traveler.背包 ?? [];
  const idx = inventory.findIndex((it) => it.id === itemId);
  if (idx < 0) {
    return { traveler, ok: false, consumed: false, effects: [], message: '背包中未找到该物品' };
  }
  const item = inventory[idx];
  if (!USABLE_CATEGORIES.includes(item.类别)) {
    return { traveler, ok: false, consumed: false, effects: [], message: '此物品不可使用' };
  }
  const useCount = Math.max(1, Math.min(item.数量, Math.trunc(count)));

  let next = { ...traveler };
  const applied: { 目标属性: 使用效果目标; 数值: number }[] = [];
  if (Array.isArray(item.使用效果)) {
    for (const eff of item.使用效果) {
      const delta = eff.数值 * useCount;
      applied.push({ 目标属性: eff.目标属性, 数值: delta });
    }
  }

  // 扣堆叠数量
  const remain = item.数量 - useCount;
  const nextInventory = [...inventory];
  if (remain > 0) {
    nextInventory[idx] = { ...item, 数量: remain };
  } else {
    nextInventory.splice(idx, 1);
  }

  const effectSummary = applied.length
    ? applied.map((e) => `${e.目标属性} ${e.数值 >= 0 ? '+' : ''}${e.数值}`).join('、')
    : '';
  const message = effectSummary
    ? `使用 ${item.名称}${useCount > 1 ? ` ×${useCount}` : ''}(${effectSummary})`
    : `使用 ${item.名称}${useCount > 1 ? ` ×${useCount}` : ''}`;

  return {
    traveler: { ...next, 背包: nextInventory },
    ok: true,
    consumed: true,
    effects: applied,
    message,
  };
}

// ── 丢弃物品 ──
// count 不传或 Infinity 表示全丢。装备类条目被丢光时同步清装备槽。
export interface 丢弃物品结果 {
  traveler: 角色数据结构;
  ok: boolean;
  message: string;
}

export function 丢弃物品(
  traveler: 角色数据结构,
  itemId: string,
  count?: number,
): 丢弃物品结果 {
  const inventory = traveler.背包 ?? [];
  const idx = inventory.findIndex((it) => it.id === itemId);
  if (idx < 0) return { traveler, ok: false, message: '背包中未找到该物品' };
  const item = inventory[idx];

  const requested = count == null || count === Infinity
    ? item.数量
    : Math.max(1, Math.trunc(count));
  const drop = Math.min(item.数量, requested);
  const remain = item.数量 - drop;

  const nextInventory = [...inventory];
  let nextSlots = traveler.装备 ?? {};
  if (remain > 0) {
    nextInventory[idx] = { ...item, 数量: remain };
  } else {
    // 整条删除,且若已穿戴,同步清装备槽
    nextInventory.splice(idx, 1);
    if (item.当前装备部位 && nextSlots[item.当前装备部位] === item.id) {
      nextSlots = { ...nextSlots };
      delete nextSlots[item.当前装备部位];
    }
  }

  return {
    traveler: { ...traveler, 背包: nextInventory, 装备: nextSlots },
    ok: true,
    message: drop > 1 ? `丢弃 ${item.名称} ×${drop}` : `丢弃 ${item.名称}`,
  };
}

// ── 穿戴物品 ──
// 把背包里某件装备类物品穿到它的 装备槽位 上。如该槽位已有装备,先卸下原装备。
export interface 穿戴结果 {
  traveler: 角色数据结构;
  ok: boolean;
  message: string;
}

export function 穿戴物品(traveler: 角色数据结构, itemId: string): 穿戴结果 {
  const inventory = traveler.背包 ?? [];
  const item = inventory.find((it) => it.id === itemId);
  if (!item) return { traveler, ok: false, message: '背包中未找到该物品' };
  if (!是装备类(item)) return { traveler, ok: false, message: '此物品不可穿戴' };
  if (!item.装备槽位) return { traveler, ok: false, message: '此物品未声明装备槽位' };
  if (item.当前装备部位) {
    return { traveler, ok: false, message: `${item.名称} 已穿戴` };
  }

  const slots = { ...(traveler.装备 ?? {}) };
  const targetSlot = 决定目标槽位(item, item.装备槽位, slots);

  // 把目标槽位上原有的装备先卸下(同步清掉它的 当前装备部位)
  const prevItemId = slots[targetSlot];
  const nextInventory = inventory.map((it) => {
    if (prevItemId && it.id === prevItemId) return { ...it, 当前装备部位: undefined };
    if (it.id === item.id) return { ...it, 当前装备部位: targetSlot };
    return it;
  });

  slots[targetSlot] = item.id;

  return {
    traveler: { ...traveler, 背包: nextInventory, 装备: slots },
    ok: true,
    message: prevItemId ? `穿戴 ${item.名称}(替换原装备)` : `穿戴 ${item.名称}`,
  };
}

// 决定实际穿戴目标:饰品/服装类支持槽位族,空位优先;其它就用 item.装备槽位 本身。
function 决定目标槽位(
  item: 背包物品,
  declared: 装备槽位ID,
  slots: Partial<Record<装备槽位ID, string>>,
): 装备槽位ID {
  const family =
    item.类别 === 'accessory'
      ? ACCESSORY_SLOTS
      : item.类别 === 'clothing'
        ? CLOTHING_SLOTS
        : null;
  if (!family || !family.includes(declared)) return declared;
  // 声明槽空着 → 用声明槽
  if (!slots[declared]) return declared;
  // 找族里第一个空槽
  const empty = family.find((s) => !slots[s]);
  return empty ?? declared;
}

// ── 卸下槽位 ──
export interface 卸下结果 {
  traveler: 角色数据结构;
  ok: boolean;
  message: string;
}

export function 卸下槽位(traveler: 角色数据结构, slot: 装备槽位ID): 卸下结果 {
  const slots = { ...(traveler.装备 ?? {}) };
  const itemId = slots[slot];
  if (!itemId) return { traveler, ok: false, message: '该槽位本就为空' };
  delete slots[slot];
  const nextInventory = (traveler.背包 ?? []).map((it) =>
    it.id === itemId ? { ...it, 当前装备部位: undefined } : it,
  );
  const item = nextInventory.find((it) => it.id === itemId);
  return {
    traveler: { ...traveler, 背包: nextInventory, 装备: slots },
    ok: true,
    message: item ? `卸下 ${item.名称}` : '卸下完成',
  };
}

// ── 派生:已穿戴装备的叙事效果 ──
// 给正文提示词和 UI 展示使用；装备不再提供旧五维数值加成。
export function 读取装备叙事效果(traveler: 角色数据结构): string[] {
  const slots = traveler.装备 ?? {};
  const inventory = traveler.背包 ?? [];
  const effects: string[] = [];
  for (const slotKey of Object.keys(slots) as 装备槽位ID[]) {
    const id = slots[slotKey];
    if (!id) continue;
    const item = inventory.find((it) => it.id === id);
    if (!item?.叙事效果?.length) continue;
    effects.push(...item.叙事效果);
  }
  return Array.from(new Set(effects.map((item) => item.trim()).filter(Boolean)));
}
