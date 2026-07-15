/**
 * Phase 3 — commandId idempotency across repository + executeTurn.
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
import {
  createMemoryPersistentSessionRepository,
} from '@/src/kernel/adapters/indexeddb/PersistentSessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import {
  createEmptyGameState,
  createSessionSnapshot,
} from '@/src/kernel/domain/session/types';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';

const SESSION = asSessionId('idem-session');

type Seedable = SessionRepository & {
  seed(
    snapshot: ReturnType<typeof createSessionSnapshot>,
  ): void | Promise<void>;
};

const factories: ReadonlyArray<{ name: string; create: () => Seedable }> = [
  { name: 'InMemory', create: () => new InMemorySessionRepository() },
  {
    name: 'Persistent(memory)',
    create: () => createMemoryPersistentSessionRepository(),
  },
];

function narrative(text: string): string {
  return `叙事：${text}`;
}

function advance(
  text: string,
  opts: Readonly<{ commandId: string; expectedRevision: number }>,
): AdvanceTurnEnvelope {
  return {
    protocolVersion: 1,
    commandId: asCommandId(opts.commandId),
    sessionId: SESSION,
    expectedRevision: asRevision(opts.expectedRevision),
    command: { type: 'turn.advance', input: { text } },
  };
}

for (const factory of factories) {
  describe(`commandId idempotency — ${factory.name}`, () => {
    it('retry same commandId does not produce a duplicate turn', async () => {
      const sessions = factory.create();
      await sessions.seed(
        createSessionSnapshot({
          sessionId: SESSION,
          revision: asRevision(0),
          state: { turnCount: 1, travelerName: '开拓者' },
        }),
      );

      let modelCalls = 0;
      const model = new ScriptedModelGateway(async ({ playerText }) => {
        modelCalls += 1;
        return {
          kind: 'success',
          chunks: [narrative(playerText)],
          completedText: narrative(playerText),
        };
      });

      const envelope = advance('第一步', {
        commandId: 'same-cmd',
        expectedRevision: 0,
      });

      const firstFrames = await collectAsync(executeTurn(envelope, { sessions, model }));
      expect(terminalFrames(firstFrames).at(-1)?.type).toBe('committed');
      expect(modelCalls).toBe(1);

      const afterFirst = await sessions.read(SESSION);
      expect(afterFirst.revision).toBe(1);
      expect(afterFirst.state.turns).toHaveLength(1);
      expect(afterFirst.state.turnCount).toBe(2);

      // Retry identical commandId (client may also send stale expectedRevision).
      const retryFrames = await collectAsync(
        executeTurn(
          advance('第一步', { commandId: 'same-cmd', expectedRevision: 0 }),
          { sessions, model },
        ),
      );
      const retryTerminal = terminalFrames(retryFrames).at(-1);
      expect(retryTerminal?.type).toBe('committed');
      if (retryTerminal?.type !== 'committed') throw new Error('expected committed');
      expect(retryTerminal.revision).toBe(1);
      expect(retryTerminal.view.turns).toHaveLength(1);

      // Model must not run again; formal state unchanged.
      expect(modelCalls).toBe(1);
      const afterRetry = await sessions.read(SESSION);
      expect(afterRetry).toEqual(afterFirst);
      expect(afterRetry.state.turns).toHaveLength(1);
    });

    it('repository CAS alone is idempotent without re-applying nextState', async () => {
      const sessions = factory.create();
      await sessions.seed(
        createSessionSnapshot({
          sessionId: SESSION,
          revision: asRevision(0),
        }),
      );

      const committed = await sessions.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        commandId: asCommandId('cas-idem'),
        nextState: createEmptyGameState({
          turnCount: 2,
          turns: [{ id: 't1', playerText: 'x', narrativeText: 'y', travelerNameBefore: null }],
        }),
      });
      expect(committed.type).toBe('committed');

      const again = await sessions.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        commandId: asCommandId('cas-idem'),
        nextState: createEmptyGameState({ turnCount: 50 }),
      });
      expect(again.type).toBe('committed');
      if (again.type !== 'committed' || committed.type !== 'committed') {
        throw new Error('expected committed');
      }
      expect(again.snapshot.state.turnCount).toBe(2);
      expect(again.snapshot.revision).toBe(1);

      // Different command still races against revision.
      const other = await sessions.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        commandId: asCommandId('other'),
        nextState: createEmptyGameState({ turnCount: 3 }),
      });
      expect(other.type).toBe('conflict');
    });
  });
}
