import type { 背包物品 } from '@/models/inventory';

export type InventoryDropReceipt = Readonly<{
  kind: 'inventory.drop';
  item: 背包物品;
  index: number;
}>;

export type CommandReceipt = InventoryDropReceipt;

