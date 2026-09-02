import { describe, expect, it } from 'vitest';
import { 归一化NPC记录列表 } from '@/models/npc';

const 一条约定 = {
  id: 'a1',
  标题: '替她取回玉佩',
  内容: '三日内归还',
  当前状态: '等待中',
  回合: 12,
};

/** companion 阶位让记录不被「可丢弃 NPC」启发式过滤掉（该启发式不是本用例的被测对象）。 */
function 建NPC(overrides: Record<string, unknown>): Record<string, unknown> {
  return { 姓名: '阿绫', 阶位: 'companion', ...overrides };
}

describe('NPC 约定的归一化与合并', () => {
  it('归一化后约定仍在（新增字段不能被显式字面量丢掉）', () => {
    const [record] = 归一化NPC记录列表([建NPC({ 约定: [一条约定] })]);
    expect(record.约定).toHaveLength(1);
    expect(record.约定?.[0]).toMatchObject({
      id: 'a1',
      标题: '替她取回玉佩',
      内容: '三日内归还',
      当前状态: '等待中',
      回合: 12,
    });
  });

  it('无约定的记录归一化后是空数组而不是 undefined', () => {
    const [record] = 归一化NPC记录列表([建NPC({})]);
    expect(record.约定).toEqual([]);
  });

  it('同名记录合并时两侧约定都保留，同 id 以较新的为准', () => {
    const [record] = 归一化NPC记录列表([
      建NPC({ 约定: [一条约定] }),
      建NPC({
        约定: [
          { ...一条约定, 内容: '已延期', 当前状态: '已违约' },
          { id: 'a2', 标题: '同行一程', 内容: '', 当前状态: '已履行', 回合: 3 },
        ],
      }),
    ]);
    expect(record.约定).toHaveLength(2);
    expect(record.约定?.find((item) => item.id === 'a1'))
      .toMatchObject({ 内容: '已延期', 当前状态: '已违约' });
  });

  it('脏条目被丢弃，非法状态回落等待中，缺 id 时补生成', () => {
    const [record] = 归一化NPC记录列表([
      建NPC({ 约定: [null, '不是对象', {}, { 内容: '只有内容', 当前状态: '乱写' }] }),
    ]);
    expect(record.约定).toHaveLength(1);
    expect(record.约定?.[0]).toMatchObject({ 内容: '只有内容', 当前状态: '等待中' });
    expect(record.约定?.[0].id).toBeTruthy();
  });
});
