import { describe, expect, it } from 'vitest';
import { isPhoneSeedTextSimilar, isSamePhoneSeedTarget, type PhoneSeedTargetRef } from '@/utils/phoneSeedMatch';

function target(overrides: Partial<PhoneSeedTargetRef> = {}): PhoneSeedTargetRef {
  return { targetType: 'private', targetId: 'npc-123', relatedNpcIds: [], ...overrides };
}

describe('isSamePhoneSeedTarget', () => {
  it('treats raw and npc_-prefixed private NPC ids as the same target', () => {
    expect(isSamePhoneSeedTarget(target(), target({ targetId: 'npc_npc-123' }))).toBe(true);
    expect(isSamePhoneSeedTarget(target({ targetId: 'npc-abc' }), target({ targetId: 'npc_npc-abc' }))).toBe(true);
  });

  it('matches private targets through relatedNpcIds', () => {
    expect(isSamePhoneSeedTarget(
      target({ targetId: 'npc-a' }),
      target({ targetId: 'npc-b', relatedNpcIds: ['npc-a'] }),
    )).toBe(true);
    expect(isSamePhoneSeedTarget(
      target({ targetId: 'npc-a' }),
      target({ targetId: 'npc-b', relatedNpcIds: ['npc_npc-a'] }),
    )).toBe(true);
  });

  it('keeps distinct private targets apart', () => {
    expect(isSamePhoneSeedTarget(
      target({ targetId: 'npc-a' }),
      target({ targetId: 'npc-b', relatedNpcIds: ['npc-c'] }),
    )).toBe(false);
  });

  it('compares group targets by exact id', () => {
    expect(isSamePhoneSeedTarget(
      target({ targetType: 'group', targetId: 'group-1' }),
      target({ targetType: 'group', targetId: 'group-1' }),
    )).toBe(true);
    expect(isSamePhoneSeedTarget(
      target({ targetType: 'group', targetId: 'abc' }),
      target({ targetType: 'group', targetId: 'npc_abc' }),
    )).toBe(false);
  });

  it('never matches across target types, even through relatedNpcIds', () => {
    expect(isSamePhoneSeedTarget(
      target({ targetType: 'group', targetId: 'channel-1' }),
      target({ targetId: 'channel-1' }),
    )).toBe(false);
    expect(isSamePhoneSeedTarget(
      target({ targetType: 'group', targetId: 'group-1', relatedNpcIds: ['npc-123'] }),
      target(),
    )).toBe(false);
  });
});

describe('isPhoneSeedTextSimilar', () => {
  it('ignores whitespace differences', () => {
    expect(isPhoneSeedTextSimilar('星 穹 列 车', '星穹列车')).toBe(true);
  });

  it('ignores punctuation and bracket variants', () => {
    expect(isPhoneSeedTextSimilar('（星穹列车）《出发》[已确认]', '星穹列车出发已确认')).toBe(true);
    expect(isPhoneSeedTextSimilar('[三月七]，收到', '三月七收到')).toBe(true);
    expect(isPhoneSeedTextSimilar('星穹列车准备出发，。', '星穹列车准备出发前方')).toBe(true);
  });

  it('matches long substring containment', () => {
    const long = '星穹列车即将重新启程前往远方';
    expect(isPhoneSeedTextSimilar(long, `${long}，请做好准备`)).toBe(true);
  });

  it('rejects near misses below the shared-character threshold', () => {
    expect(isPhoneSeedTextSimilar('甲乙丙丁戊己庚辛壬癸', '甲乙丙丁戊己庚辛子丑')).toBe(false);
    expect(isPhoneSeedTextSimilar('甲乙丙丁戊己庚辛壬癸', '甲乙丙丁戊己庚辛壬子')).toBe(true);
  });
});
