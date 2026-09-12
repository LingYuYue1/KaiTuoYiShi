import { describe, expect, it } from 'vitest';
import { 创建空角色 } from '@/models/character';
import { 创建NPC记录, type NPC记录 } from '@/models/npc';
import { 创建空手机系统, type 主动来信种子, type 手机系统 } from '@/models/phone';
import type { 手机来信变量事实 } from '@/models/variableCommand';
import { 创建空世界状态 } from '@/models/world';
import type { VariableExecContext } from '@/utils/variableExecContext';
import { reduceVariableCommands } from '@/utils/variableExecutor';
import { factsToVariableCommands } from '@/utils/variableFacts';
import { canonicalContactId } from '@/utils/phone';
import { createVariableStateFixture } from './prompts/fixtures';

const TURN = 10;
const FIXED_CTX: VariableExecContext = {
  now: () => 1,
  randomString: (len) => 'x'.repeat(len),
};

function createNpc(姓名: string): NPC记录 {
  return 创建NPC记录({ 姓名, 阶位: 'companion', 初见回合: TURN });
}

function createSeed(overrides: Partial<主动来信种子> = {}): 主动来信种子 {
  return {
    id: 'seed-other',
    turn: TURN - 1,
    source: 'main_story',
    triggerType: 'relationship',
    priority: 'low',
    targetType: 'private',
    targetId: 'npc-other',
    title: '其他目标的跟进短讯',
    context: '其他目标近期与玩家有互动。',
    relatedNpcIds: ['npc-other'],
    status: 'generated',
    ...overrides,
  };
}

function createPhone(seeds: 主动来信种子[] = []): 手机系统 {
  return { ...创建空手机系统(), messageSeeds: seeds };
}

function createFact(overrides: Partial<手机来信变量事实> = {}): 手机来信变量事实 {
  return {
    type: 'phone_seed',
    targetId: 'npc-other',
    title: '主动发来的短讯',
    context: '对方近期与玩家有互动，想确认一些事情。',
    ...overrides,
  };
}

function createState(phone: 手机系统) {
  return createVariableStateFixture({
    旅人: { ...创建空角色(), 姓名: '开拓者' },
    世界: 创建空世界状态(),
    手机: phone,
  });
}

function run(
  facts: 手机来信变量事实[],
  phone: 手机系统,
  options: { phoneSeedsEnabled?: boolean; maxPhoneSeedsPerTurn?: number } = {},
) {
  return factsToVariableCommands(facts, createState(phone), TURN, options, FIXED_CTX);
}

describe('fact-driven phone seed dedup', () => {
  it('enforces maxPhoneSeedsPerTurn deterministically', () => {
    const first = createFact({ targetId: 'npc-a', title: '甲事件跟进' });
    const second = createFact({ targetId: 'npc-b', title: '乙事件跟进' });

    const capped = run([first, second], createPhone(), { maxPhoneSeedsPerTurn: 1 });
    expect(capped.commands).toHaveLength(1);
    const emitted = capped.commands[0];
    expect(emitted.action).toBe('push');
    expect(emitted.key).toBe('手机.messageSeeds');
    const emittedSeed = emitted.value as { id: string; targetId: string };
    expect(emittedSeed.id).toBe(`phone_seed_${TURN}_xxxxxx`);
    expect(emittedSeed.targetId).toBe('npc-a');
    expect(capped.warnings).toHaveLength(1);

    const disabled = run([first], createPhone(), { maxPhoneSeedsPerTurn: 0 });
    expect(disabled.commands).toHaveLength(0);
    expect(disabled.warnings).toHaveLength(1);
  });

  it('holds the non-urgent cooldown while urgent facts bypass it', () => {
    const npc = createNpc('三月七');
    const recentNormal = createSeed({
      targetId: npc.id,
      relatedNpcIds: [npc.id],
      title: '三月七的日常',
      context: '三月七刚和玩家聊过天。',
    });
    const suppressed = run(
      [createFact({ targetId: npc.id, title: '新的委托', context: '需要玩家帮忙确认流程。' })],
      createPhone([recentNormal]),
    );
    expect(suppressed.commands).toHaveLength(0);
    expect(suppressed.warnings).toHaveLength(1);

    const recentUrgent = createSeed({
      targetId: npc.id,
      relatedNpcIds: [npc.id],
      priority: 'urgent',
      title: '三月七的日常',
      context: '三月七刚和玩家聊过天。',
    });
    const allowed = run(
      [createFact({ targetId: npc.id, priority: 'urgent', title: '紧急委托', context: '需要玩家立刻确认流程。' })],
      createPhone([recentUrgent]),
    );
    expect(allowed.commands).toHaveLength(1);

    const olderNormal = createSeed({
      targetId: npc.id,
      relatedNpcIds: [npc.id],
      turn: TURN - 3,
      title: '更早的来信',
      context: '更早的内容。',
    });
    const allowedBoundary = run(
      [createFact({ targetId: npc.id, title: '全新的委托', context: '完全不同的内容。' })],
      createPhone([olderNormal]),
    );
    expect(allowedBoundary.commands).toHaveLength(1);
  });

  it('passes similar content for a different target', () => {
    const existing = createSeed({
      targetId: 'npc-a',
      relatedNpcIds: [],
      priority: 'urgent',
      title: '同一件事的短讯',
      context: '同一件事的详细内容。',
    });
    const emitted = run(
      [createFact({ targetId: 'npc-b', title: '同一件事的短讯', context: '同一件事的详细内容。' })],
      createPhone([existing]),
    );
    expect(emitted.commands).toHaveLength(1);
  });

  it('keeps existing seeds when the emitted push is applied', () => {
    const existing = createSeed({
      id: 'seed-existing',
      priority: 'high',
      title: '既有的来信',
      context: '已经存在手机里的种子。',
    });
    const state = createState(createPhone([existing]));
    const { commands } = factsToVariableCommands(
      [createFact({ targetId: 'npc-new', title: '新的来信', context: '新的内容。' })],
      state,
      TURN,
      {},
      FIXED_CTX,
    );
    expect(commands).toHaveLength(1);

    const { nextState } = reduceVariableCommands(commands, state, FIXED_CTX);
    const seeds = (nextState.手机 as 手机系统).messageSeeds;
    expect(seeds).toHaveLength(2);
    expect(seeds[0]).toEqual(existing);
    expect(seeds[1].targetId).toBe('npc-new');
  });

  it('treats raw and npc_-prefixed target ids as one canonical identity', () => {
    const npc = createNpc('三月七');
    const existing = createSeed({
      targetId: npc.id,
      relatedNpcIds: [],
      priority: 'urgent',
      title: '三月七的跟进短讯',
      context: '三月七近期与玩家有互动。',
    });

    const duplicate = run(
      [createFact({
        targetId: canonicalContactId(npc.id),
        relatedNpcIds: [],
        title: '三月七的跟进短讯',
        context: '三月七近期与玩家有互动。',
      })],
      createPhone([existing]),
    );
    expect(duplicate.commands).toHaveLength(0);
    expect(duplicate.warnings).toHaveLength(1);

    const distinct = run(
      [createFact({
        targetId: canonicalContactId(npc.id),
        relatedNpcIds: [],
        title: '完全不同的一件事',
        context: '与既有来信无关联。',
      })],
      createPhone([existing]),
    );
    expect(distinct.commands).toHaveLength(1);
  });

  it('never dedups a private seed against a group seed with the same target id', () => {
    const text = { title: '同一件事的短讯', context: '同一件事的详细内容。' };
    const groupSeed = createSeed({
      targetType: 'group',
      targetId: 'group-1',
      relatedNpcIds: [],
      priority: 'urgent',
      ...text,
    });

    const privateFact = run(
      [createFact({ targetId: 'group-1', ...text })],
      createPhone([groupSeed]),
    );
    expect(privateFact.commands).toHaveLength(1);

    const groupFact = run(
      [createFact({ targetType: 'group', targetId: 'group-1', ...text })],
      createPhone([groupSeed]),
    );
    expect(groupFact.commands).toHaveLength(0);
    expect(groupFact.warnings).toHaveLength(1);
  });
});
