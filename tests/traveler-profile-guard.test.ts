import { describe, expect, it } from 'vitest';
import { 创建空角色, type 角色数据结构 } from '@/models/character';
import type { 变量命令 } from '@/models/variableCommand';
import { 创建空世界状态 } from '@/models/world';
import { reduceVariableCommands } from '@/utils/variableExecutor';
import { factsToVariableCommands } from '@/utils/variableFacts';
import { createVariableStateFixture } from './prompts/fixtures';

function 创建玩家旅人(): 角色数据结构 {
  return {
    ...创建空角色(),
    姓名: '开拓者',
    别名: '星',
    外貌: '灰色长发，金色眼眸，列车制服。',
    背景: '来自星穹列车的无名客，为寻找记忆踏上旅途。',
  };
}

describe('traveler profile guard', () => {
  it('rejects variable commands that target player-authored profile fields', () => {
    const traveler = 创建玩家旅人();
    const commands: 变量命令[] = [
      { action: 'set', key: '旅人.姓名', value: '卡芙卡' },
      { action: 'set', key: '旅人.外貌', value: '被改写的临时伪装' },
      { action: 'set', key: '旅人.背景', value: '被改写的来历' },
      { action: 'delete', key: '旅人.别名', value: null },
      { action: 'set', key: '旅人', value: { ...traveler, 身份: '星核猎手' } },
    ];

    const { results, nextState } = reduceVariableCommands(
      commands,
      createVariableStateFixture({ 旅人: traveler, 世界: 创建空世界状态() }),
    );

    expect(results.map((result) => result.ok)).toEqual([false, false, false, false, false]);
    expect(nextState.旅人).toEqual(traveler);
  });

  it('stays stable when the same rejected commands are applied repeatedly', () => {
    const traveler = 创建玩家旅人();
    const commands: 变量命令[] = [
      { action: 'set', key: '旅人.姓名', value: '卡芙卡' },
      { action: 'set', key: '旅人.外貌', value: '被改写的临时伪装' },
      { action: 'set', key: '旅人.背景', value: '被改写的来历' },
      { action: 'delete', key: '旅人.别名', value: null },
      { action: 'set', key: '旅人', value: { ...traveler, 身份: '星核猎手' } },
    ];
    const initial = createVariableStateFixture({ 旅人: traveler, 世界: 创建空世界状态() });

    const first = reduceVariableCommands(commands, initial);
    const second = reduceVariableCommands(commands, first.nextState);

    expect(second.results.map((result) => result.ok)).toEqual([false, false, false, false, false]);
    expect(second.nextState).toEqual(first.nextState);
    expect(second.nextState.旅人).toEqual(traveler);
  });

  it('keeps runtime assets writable while profile fields stay guarded', () => {
    const traveler = 创建玩家旅人();
    const commands: 变量命令[] = [
      { action: 'set', key: '旅人.姓名', value: '卡芙卡' },
      {
        action: 'push',
        key: '旅人.背包',
        value: { 类别: 'consumable', 名称: '压缩干粮', 描述: '星穹列车的标准配给。', 数量: 2 },
      },
    ];

    const { results, nextState } = reduceVariableCommands(
      commands,
      createVariableStateFixture({ 旅人: traveler, 世界: 创建空世界状态() }),
    );

    expect(results[0].ok).toBe(false);
    expect(results[1].ok).toBe(true);
    const nextTraveler = nextState.旅人 as 角色数据结构;
    expect(nextTraveler.姓名).toBe('开拓者');
    expect(nextTraveler.背包).toHaveLength(1);
    expect(nextTraveler.背包[0].名称).toBe('压缩干粮');
    expect(nextTraveler.背包[0].数量).toBe(2);
  });

  it('silently ignores traveler_profile facts instead of turning them into commands', () => {
    const traveler = 创建玩家旅人();
    const { commands, notes } = factsToVariableCommands(
      [{
        type: 'traveler_profile',
        identity: '星核猎手',
        appearance: '黑色风衣',
        background: '被改写的来历',
        abilityAdd: ['言灵'],
        knowledgeAdd: ['星核'],
      }],
      createVariableStateFixture({ 旅人: traveler }),
      7,
    );

    expect(commands).toEqual([]);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/traveler_profile/);
  });
});
