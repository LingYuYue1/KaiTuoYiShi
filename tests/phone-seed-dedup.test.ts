import { describe, expect, it } from 'vitest';
import { buildFallbackPhoneSeed } from '@/hooks/useGame/phoneWorkflow';
import { 创建NPC记录, type NPC记录 } from '@/models/npc';
import { 创建空手机系统, type 主动来信种子, type 手机系统 } from '@/models/phone';

const TURN = 10;

function createCompanion(): NPC记录 {
  return {
    ...创建NPC记录({ 姓名: '三月七', 阶位: 'companion', 初见回合: TURN }),
    同行: true,
    最近回合: TURN,
    关系: 'acquaintance',
  };
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

interface BuildOverrides {
  maxSeedsPerTurn?: number;
  contactCooldownTurns?: number;
  userInput?: string;
  body?: string;
}

function build(npc: NPC记录, phone: 手机系统, overrides: BuildOverrides = {}): 主动来信种子 | null {
  return buildFallbackPhoneSeed({
    phone,
    npcs: [npc],
    turn: TURN,
    userInput: overrides.userInput ?? '继续前进',
    body: overrides.body ?? '警报声在舱段尽头回荡。',
    maxSeedsPerTurn: overrides.maxSeedsPerTurn ?? 2,
    contactCooldownTurns: overrides.contactCooldownTurns ?? 3,
  });
}

function requireSeed(seed: 主动来信种子 | null): 主动来信种子 {
  if (!seed) throw new Error('expected a fallback phone seed');
  return seed;
}

describe('fallback phone seed dedup', () => {
  it('creates one low-priority pending seed when nothing blocks it', () => {
    const npc = createCompanion();
    const seed = requireSeed(build(npc, createPhone()));

    expect(seed.status).toBe('pending');
    expect(seed.priority).toBe('low');
    expect(seed.source).toBe('main_story');
    expect(seed.targetId).toBe(npc.id);
    expect(seed.relatedNpcIds).toEqual([npc.id]);
  });

  it('respects maxSeedsPerTurn = 0 as disabled', () => {
    expect(build(createCompanion(), createPhone(), { maxSeedsPerTurn: 0 })).toBeNull();
  });

  it('suppresses a new seed while any seed is pending', () => {
    const npc = createCompanion();
    const pendingOther = createSeed({ targetId: 'npc-other', status: 'pending' });
    expect(build(npc, createPhone([pendingOther]))).toBeNull();

    const pendingAtCap = createSeed({ targetId: npc.id, status: 'pending' });
    expect(build(npc, createPhone([pendingAtCap]), { maxSeedsPerTurn: 1 })).toBeNull();
  });

  it('holds the global cooldown for non-urgent seeds but lets urgent seeds through', () => {
    const npc = createCompanion();
    const recentNormal = createSeed({ turn: TURN - 1, priority: 'low' });
    expect(build(npc, createPhone([recentNormal]))).toBeNull();

    const olderNormal = createSeed({ turn: TURN - 3, priority: 'normal' });
    expect(build(npc, createPhone([olderNormal]))).not.toBeNull();

    const recentUrgent = createSeed({ turn: TURN - 1, priority: 'urgent' });
    expect(build(npc, createPhone([recentUrgent]))).not.toBeNull();

    const turnFourNormal = createSeed({ turn: TURN - 4, priority: 'normal' });
    expect(build(npc, createPhone([turnFourNormal]), { contactCooldownTurns: 5 })).toBeNull();
  });

  it('holds the per-contact cooldown before the similarity window', () => {
    const npc = createCompanion();
    const priorForNpc = createSeed({
      targetId: npc.id,
      relatedNpcIds: [npc.id],
      turn: TURN - 1,
      priority: 'urgent',
      title: 'MAR',
      context: 'ABCDEFGHIJKLMNOP',
    });

    expect(build(npc, createPhone([priorForNpc]))).toBeNull();
    expect(build(npc, createPhone([priorForNpc]), { contactCooldownTurns: 1 })).not.toBeNull();
  });

  it('rejects a recent similar seed for the same target', () => {
    const npc = createCompanion();
    const first = requireSeed(build(npc, createPhone()));
    const asGenerated: 主动来信种子 = {
      ...first,
      status: 'generated',
      priority: 'urgent',
      turn: TURN - 1,
    };

    expect(build(npc, createPhone([asGenerated]), { contactCooldownTurns: 1 })).toBeNull();

    const dissimilar: 主动来信种子 = { ...asGenerated, title: 'MAR', context: 'ABCDEFGHIJKLMNOP' };
    expect(build(npc, createPhone([dissimilar]), { contactCooldownTurns: 1 })).not.toBeNull();
  });

  it('treats an npc_ contact id as the same private target', () => {
    const npc = createCompanion();
    const first = requireSeed(build(npc, createPhone()));
    const asContactId: 主动来信种子 = {
      ...first,
      targetId: `npc_${npc.id}`,
      relatedNpcIds: [],
      status: 'generated',
      priority: 'urgent',
      turn: TURN - 1,
    };

    expect(build(npc, createPhone([asContactId]), { contactCooldownTurns: 1 })).toBeNull();
  });

  it('passes similar content for a different target', () => {
    const npc = createCompanion();
    const first = requireSeed(build(npc, createPhone()));
    const otherTarget: 主动来信种子 = {
      ...first,
      targetId: 'npc-other',
      relatedNpcIds: [],
      status: 'generated',
      priority: 'urgent',
      turn: TURN - 1,
    };

    expect(build(npc, createPhone([otherTarget]), { contactCooldownTurns: 1 })).not.toBeNull();
  });
});
