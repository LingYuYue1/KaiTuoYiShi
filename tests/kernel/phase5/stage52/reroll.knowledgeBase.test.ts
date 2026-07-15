/**
 * Stage 5.2 — findTurnBaseSnapshot restores knowledgeBefore on reroll base.
 */

import { describe, expect, it } from 'vitest';
import { asRevision, asSessionId } from '@/src/kernel/contract';
import {
  createEmptyKernelKnowledge,
  createSessionSnapshot,
} from '@/src/kernel/domain/session/types';
import { findTurnBaseSnapshot } from '@/src/kernel/domain/turn/findTurnBaseSnapshot';
import { createEmptyKernelVariables } from '@/src/kernel/domain/variables';

const SESSION = asSessionId('phase52-reroll-knowledge');

describe('reroll knowledge base (Stage 5.2)', () => {
  it('restores knowledgeBefore when present on the turn', () => {
    const knowledgeBefore = createEmptyKernelKnowledge({
      zhiku: {
        entries: [
          {
            id: 'z1',
            title: '锁定资料',
            category: 'character',
            unlockStatus: '未解锁',
          },
        ],
      },
      yiting: {
        entries: [
          {
            id: 'y1',
            name: '【回忆001】',
            turn: 1,
            summary: '旧回忆',
          },
        ],
      },
    });
    const knowledgeAfter = createEmptyKernelKnowledge({
      zhiku: {
        entries: [
          {
            id: 'z1',
            title: '锁定资料',
            category: 'character',
            unlockStatus: '未解锁',
            runtimeUnlockStatus: '已解锁',
          },
        ],
      },
      yiting: knowledgeBefore.yiting,
      story: {
        archives: [{ segmentTitle: '段A', summary: '摘要' }],
      },
    });

    const snapshot = createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(1),
      state: {
        turnCount: 2,
        travelerName: '开拓者',
        variables: createEmptyKernelVariables({ 旅人: { 姓名: '开拓者' } }),
        knowledge: knowledgeAfter,
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'ok' },
        ],
        turns: [
          {
            id: 'turn_1',
            playerText: 'hi',
            narrativeText: 'ok',
            travelerNameBefore: '开拓者',
            variablesBefore: createEmptyKernelVariables({ 旅人: { 姓名: '开拓者' } }),
            knowledgeBefore,
          },
        ],
      },
    });

    const base = findTurnBaseSnapshot(snapshot, 'turn_1');
    expect(base).not.toBeNull();
    expect(base!.state.knowledge.zhiku.entries[0]?.runtimeUnlockStatus).toBeUndefined();
    expect(base!.state.knowledge.zhiku.entries[0]?.unlockStatus).toBe('未解锁');
    expect(base!.state.knowledge.yiting.entries).toHaveLength(1);
    expect(base!.state.knowledge.story.archives).toHaveLength(0);
    expect(base!.state.turnCount).toBe(1);
    expect(base!.state.messages).toEqual([]);
  });

  it('pre-5.2 turns without knowledgeBefore restore empty knowledge', () => {
    const snapshot = createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(1),
      state: {
        turnCount: 2,
        travelerName: '开拓者',
        knowledge: createEmptyKernelKnowledge({
          zhiku: {
            entries: [
              {
                id: 'z1',
                title: '后来加的',
                category: 'term',
                unlockStatus: '已解锁',
              },
            ],
          },
        }),
        messages: [
          { role: 'user', content: 'a' },
          { role: 'assistant', content: 'b' },
        ],
        turns: [
          {
            id: 'turn_old',
            playerText: 'a',
            narrativeText: 'b',
            travelerNameBefore: '开拓者',
            variablesBefore: null,
            knowledgeBefore: null,
          },
        ],
      },
    });

    const base = findTurnBaseSnapshot(snapshot, 'turn_old');
    expect(base).not.toBeNull();
    expect(base!.state.knowledge.zhiku.entries).toEqual([]);
    expect(base!.state.knowledge.yiting.entries).toEqual([]);
    expect(base!.state.knowledge.story.archives).toEqual([]);
  });
});
