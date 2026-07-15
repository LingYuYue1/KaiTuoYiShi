/**
 * Stage 5.2 — planTurnRequest injects knowledge (yiting + story + zhiku)
 * from formal GameState into the model prompt.
 */

import { describe, expect, it } from 'vitest';
import { createEmptyGameState } from '@/src/kernel/domain/session/types';
import { planTurnRequest } from '@/src/kernel/domain/turn/planTurnRequest';

describe('planTurnRequest knowledge injection (Stage 5.2)', () => {
  it('seeded yiting + story appear in the planned prompt', () => {
    const state = createEmptyGameState({
      travelerName: '开拓者',
      knowledge: {
        yiting: {
          entries: [
            {
              id: 'y1',
              name: '【回忆001】',
              turn: 3,
              summary: '三月七在观景车厢丢了帽子',
              keywords: ['三月七', '帽子', '观景车厢'],
            },
          ],
        },
        zhiku: {
          entries: [
            {
              id: 'z1',
              title: '星核资料',
              category: 'term',
              unlockStatus: '已解锁',
            },
          ],
        },
        story: {
          archives: [
            {
              segmentTitle: '开局·列车启航',
              summary: '星穹列车离开空间站',
            },
          ],
        },
        memory: { recentSummaries: [] },
      },
    });

    const request = planTurnRequest(state, { text: '去找三月七的帽子' });

    expect(request.prompt).toContain('知识上下文');
    // Yiting local recall injection header
    expect(request.prompt).toMatch(/剧情回忆|即时剧情回顾/);
    expect(request.prompt).toContain('三月七');
    // Story archive injection
    expect(request.prompt).toMatch(/剧情编织|开局·列车启航|星穹列车/);
    // Unlocked zhiku titles
    expect(request.prompt).toMatch(/智库|星核资料/);
    expect(request.playerText).toBe('去找三月七的帽子');
  });

  it('empty knowledge omits knowledge block', () => {
    const state = createEmptyGameState({ travelerName: '开拓者' });
    const request = planTurnRequest(state, { text: '随便走走' });
    expect(request.prompt).not.toContain('知识上下文');
    expect(request.prompt).toContain('玩家: 随便走走');
  });
});
