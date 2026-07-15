/**
 * Stage 5.1 — reduceVariables pure reducer tests.
 */

import { describe, expect, it } from 'vitest';
import {
  createEmptyKernelVariables,
  reduceVariables,
  type VariableDomainCommand,
} from '@/src/kernel/domain/variables';

function reduce(commands: VariableDomainCommand[], name = '开拓者') {
  return reduceVariables(
    commands,
    createEmptyKernelVariables({ 旅人: { 姓名: name } }),
  );
}

describe('reduceVariables (Stage 5.1)', () => {
  it('applies successful set on traveler profile fields', () => {
    const result = reduce([
      { action: 'set', key: '旅人.姓名', value: '星' },
      { action: 'set', key: '旅人.身份', value: '开拓者' },
      { action: 'set', key: '旅人.外貌', value: '灰发' },
    ]);
    expect(result.changed).toBe(true);
    expect(result.nextVariables.旅人.姓名).toBe('星');
    expect(result.nextVariables.旅人.身份).toBe('开拓者');
    expect(result.nextVariables.旅人.外貌).toBe('灰发');
    expect(result.results.every((r) => r.ok)).toBe(true);
  });

  it('applies add/sub/set on 数值属性', () => {
    const first = reduce([
      { action: 'set', key: '旅人.数值属性.好感', value: 10 },
      { action: 'add', key: '旅人.数值属性.好感', value: 5 },
      { action: 'sub', key: '旅人.数值属性.好感', value: 3 },
    ]);
    expect(first.nextVariables.旅人.数值属性.好感).toBe(12);
  });

  it('illegal path fails closed (state unchanged for that command)', () => {
    const result = reduce(
      [
        { action: 'set', key: '旅人.姓名', value: '合法' },
        { action: 'set', key: '世界.当前地点', value: '观景车厢' },
        { action: 'push', key: '旅人.背包', value: { 名称: '面包' } },
        { action: 'set', key: '未知根.字段', value: 'x' },
      ],
      '旧名',
    );
    expect(result.nextVariables.旅人.姓名).toBe('合法');
    expect(result.results[0]?.ok).toBe(true);
    expect(result.results[1]?.ok).toBe(false);
    expect(result.results[2]?.ok).toBe(false);
    expect(result.results[3]?.ok).toBe(false);
    // No accidental world / backpack roots on formal slice.
    expect(result.nextVariables).toEqual(
      createEmptyKernelVariables({ 旅人: { 姓名: '合法' } }),
    );
  });

  it('rejects wrong types / illegal actions on scalar fields', () => {
    const result = reduce([
      { action: 'add', key: '旅人.姓名', value: 1 },
      { action: 'set', key: '旅人.身份', value: 42 },
      { action: 'set', key: '旅人.数值属性.x', value: 'not-a-number' },
    ]);
    expect(result.changed).toBe(false);
    expect(result.results.every((r) => !r.ok)).toBe(true);
  });

  it('does not mutate the input snapshot', () => {
    const initial = createEmptyKernelVariables({ 旅人: { 姓名: 'A' } });
    const frozen = JSON.stringify(initial);
    reduceVariables(
      [{ action: 'set', key: '旅人.姓名', value: 'B' }],
      initial,
    );
    expect(JSON.stringify(initial)).toBe(frozen);
  });
});
