/**
 * Stage 5.2 — zhiku runtime unlock is part of the same CAS as narrative.
 *
 * - One turn unlocks a zhiku entry when story archives match
 * - revision +1 once (atomic with narrative)
 * - model failure leaves knowledge unchanged
 */

import { describe, expect, it } from 'vitest';
import { collectAsync, terminalFrames } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
  type AdvanceTurnEnvelope,
} from '@/src/kernel/contract';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import {
  createEmptyKernelKnowledge,
  createSessionSnapshot,
} from '@/src/kernel/domain/session/types';

const SESSION = asSessionId('phase52-zhiku-cas');

function seedWithLockedZhiku() {
  const sessions = new InMemorySessionRepository();
  sessions.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(0),
      state: {
        turnCount: 1,
        travelerName: '开拓者',
        knowledge: createEmptyKernelKnowledge({
          zhiku: {
            entries: [
              {
                id: 'zhiku_char_1',
                title: '三月七档案',
                category: 'character',
                unlockStatus: '未解锁',
                relatedSegment: '开局·列车启航',
                usableForLink: true,
              },
            ],
          },
          story: {
            archives: [
              {
                segmentTitle: '开局·列车启航',
                summary: '列车离开空间站，三月七登场',
              },
            ],
          },
        }),
      },
    }),
  );
  return sessions;
}

function advance(
  text: string,
  opts?: Readonly<{ commandId?: string; expectedRevision?: number }>,
): AdvanceTurnEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts?.commandId ?? 'cmd-1'),
    sessionId: SESSION,
    expectedRevision: asRevision(opts?.expectedRevision ?? 0),
    command: { type: 'turn.advance', input: { text } },
  };
}

describe('executeTurn zhiku unlock CAS (Stage 5.2)', () => {
  it('unlocks zhiku entry and bumps revision once with narrative', async () => {
    const sessions = seedWithLockedZhiku();
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['三月七挥了挥手。'],
      completedText: '三月七挥了挥手。',
    });
    const before = await sessions.read(SESSION);
    expect(before.state.knowledge.zhiku.entries[0]?.runtimeUnlockStatus).toBeUndefined();
    expect(before.state.knowledge.zhiku.entries[0]?.unlockStatus).toBe('未解锁');

    const frames = await collectAsync(
      executeTurn(advance('和三月七打招呼', { commandId: 'unlock-1' }), {
        sessions,
        model,
      }),
    );

    expect(terminalFrames(frames)).toHaveLength(1);
    expect(frames.at(-1)?.type).toBe('committed');

    const after = await sessions.read(SESSION);
    // Exactly one CAS: revision +1 (narrative + knowledge atomic)
    expect(after.revision).toBe(before.revision + 1);
    expect(after.state.turnCount).toBe(before.state.turnCount + 1);
    expect(after.state.messages.at(-1)?.content).toBe('三月七挥了挥手。');

    // Zhiku unlocked in same nextState
    const entry = after.state.knowledge.zhiku.entries[0];
    expect(entry?.runtimeUnlockStatus).toBe('已解锁');
    expect(entry?.runtimeUnlockNote).toMatch(/开局·列车启航/);

    // knowledgeBefore recorded for reroll
    expect(after.state.turns[0]?.knowledgeBefore?.zhiku.entries[0]?.unlockStatus).toBe(
      '未解锁',
    );
    expect(
      after.state.turns[0]?.knowledgeBefore?.zhiku.entries[0]?.runtimeUnlockStatus,
    ).toBeUndefined();

    // Projection exposes unlocked title
    const terminal = frames.at(-1);
    if (terminal?.type === 'committed') {
      expect(terminal.view.knowledge.unlockedZhikuTitles).toContain('三月七档案');
      expect(terminal.view.knowledge.zhikuEntryCount).toBe(1);
      expect(terminal.view.knowledge.storyArchiveCount).toBe(1);
      expect(terminal.view.revision).toBe(after.revision);
    }
  });

  it('model failure leaves knowledge and narrative unchanged', async () => {
    const sessions = seedWithLockedZhiku();
    const model = new ScriptedModelGateway();
    model.enqueue({ kind: 'failure', message: 'upstream timeout', chunks: ['…'] });
    const before = await sessions.read(SESSION);

    const frames = await collectAsync(
      executeTurn(advance('失败回合', { commandId: 'model-fail-k' }), {
        sessions,
        model,
      }),
    );

    expect(frames.at(-1)).toMatchObject({
      type: 'rejected',
      error: { code: 'model_failure' },
    });
    const after = await sessions.read(SESSION);
    expect(after).toEqual(before);
    expect(after.state.knowledge.zhiku.entries[0]?.runtimeUnlockStatus).toBeUndefined();
    expect(after.revision).toBe(0);
  });
});
