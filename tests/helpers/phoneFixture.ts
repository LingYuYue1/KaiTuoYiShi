import { 创建空手机系统, type 主动来信种子, type 手机系统 } from '@/models/phone';

export const PHONE_SEED_TURN = 10;

export function createPhoneSeed(overrides: Partial<主动来信种子> = {}): 主动来信种子 {
  return {
    id: 'seed-other',
    turn: PHONE_SEED_TURN - 1,
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

export function createPhoneSystem(seeds: 主动来信种子[] = []): 手机系统 {
  return { ...创建空手机系统(), messageSeeds: seeds };
}
