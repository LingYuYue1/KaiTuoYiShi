import { describe, expect, it } from 'vitest';
import { 创建空角色, type 角色数据结构 } from '@/models/character';
import { 创建背包物品, type 背包物品 } from '@/models/inventory';
import type { 变量命令 } from '@/models/variableCommand';
import { 创建空世界状态 } from '@/models/world';
import { reduceVariableCommands } from '@/utils/variableExecutor';
import { createVariableStateFixture } from './prompts/fixtures';

function createItem(overrides: Partial<背包物品> = {}): 背包物品 {
  return {
    ...创建背包物品({
      类别: 'consumable',
      名称: '压缩干粮',
      描述: '星穹列车的标准配给。',
      数量: 5,
      获得回合: 1,
    }),
    ...overrides,
  };
}

function createTraveler(背包: 背包物品[]): 角色数据结构 {
  return { ...创建空角色(), 姓名: '开拓者', 背包 };
}

function run(command: 变量命令, traveler: 角色数据结构) {
  return reduceVariableCommands(
    [command],
    createVariableStateFixture({ 旅人: traveler, 世界: 创建空世界状态() }),
  );
}

describe('inventory quantity deduction', () => {
  it('deducts the requested amount when the stack is sufficient', () => {
    const item = createItem({ 数量: 5 });
    const { results, nextState } = run(
      { action: 'sub', key: `旅人.背包[id=${item.id}].数量`, value: 2 },
      createTraveler([item]),
    );

    expect(results[0].ok).toBe(true);
    const nextTraveler = nextState.旅人 as 角色数据结构;
    expect(nextTraveler.背包).toHaveLength(1);
    expect(nextTraveler.背包[0].数量).toBe(3);
  });

  it('clamps a deduction beyond the available quantity and removes the exhausted entry', () => {
    const consumed = createItem({ 名称: '便携口粮', 数量: 3 });
    const untouched = createItem({ 名称: '星琼碎片', 数量: 4 });
    const { results, nextState } = run(
      { action: 'sub', key: `旅人.背包[id=${consumed.id}].数量`, value: 10 },
      createTraveler([consumed, untouched]),
    );

    expect(results[0].ok).toBe(true);
    const nextTraveler = nextState.旅人 as 角色数据结构;
    expect(nextTraveler.背包).toHaveLength(1);
    expect(nextTraveler.背包[0].名称).toBe('星琼碎片');
    expect(nextTraveler.背包[0].数量).toBe(4);
  });

  it('removes the stack when the deduction exactly exhausts it', () => {
    const item = createItem({ 数量: 2 });
    const { results, nextState } = run(
      { action: 'sub', key: `旅人.背包[id=${item.id}].数量`, value: 2 },
      createTraveler([item]),
    );

    expect(results[0].ok).toBe(true);
    expect((nextState.旅人 as 角色数据结构).背包).toEqual([]);
  });

  it('silently ignores a deduction from an empty or mismatched inventory', () => {
    const emptyTraveler = createTraveler([]);
    const emptyResult = run(
      { action: 'sub', key: '旅人.背包[id=missing].数量', value: 1 },
      emptyTraveler,
    );

    expect(emptyResult.results[0].ok).toBe(true);
    expect(emptyResult.nextState.旅人).toEqual(emptyTraveler);

    const item = createItem({ 数量: 1 });
    const mismatch = run(
      { action: 'sub', key: '旅人.背包[id=missing].数量', value: 1 },
      createTraveler([item]),
    );

    expect(mismatch.results[0].ok).toBe(true);
    expect((mismatch.nextState.旅人 as 角色数据结构).背包[0].数量).toBe(1);
  });

  it('resolves the name selector for deduction', () => {
    const item = createItem({ 名称: '压缩干粮', 数量: 2 });
    const { results, nextState } = run(
      { action: 'sub', key: '旅人.背包[名称=压缩干粮].数量', value: 1 },
      createTraveler([item]),
    );

    expect(results[0].ok).toBe(true);
    expect((nextState.旅人 as 角色数据结构).背包[0].数量).toBe(1);
  });

  it('does not let non-sub commands fall into the deduction channel', () => {
    const item = createItem({ 数量: 1 });
    const { results } = run(
      { action: 'set', key: '旅人.背包[id=missing].数量', value: 1 },
      createTraveler([item]),
    );

    expect(results[0].ok).toBe(false);
  });
});
