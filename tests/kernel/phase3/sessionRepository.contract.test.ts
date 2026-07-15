/**
 * Phase 3 — SessionRepository contract suite.
 * Same cases run against InMemory + production Persistent (memory backend).
 */

import { describe, expect, it } from 'vitest';
import {
  asCommandId,
  asRevision,
  asSessionId,
} from '@/src/kernel/contract';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import {
  createMemoryPersistentSessionRepository,
} from '@/src/kernel/adapters/indexeddb/PersistentSessionRepository';
import {
  createEmptyGameState,
  createSessionSnapshot,
} from '@/src/kernel/domain/session/types';

const SESSION = asSessionId('phase3-contract-session');

type SeedableRepo = SessionRepository & {
  seed(snapshot: ReturnType<typeof createSessionSnapshot>): void | Promise<void>;
};

function makeInMemory(): SeedableRepo {
  return new InMemorySessionRepository();
}

function makePersistent(): SeedableRepo {
  return createMemoryPersistentSessionRepository();
}

const adapters: ReadonlyArray<{ name: string; create: () => SeedableRepo }> = [
  { name: 'InMemorySessionRepository', create: makeInMemory },
  { name: 'PersistentSessionRepository(memory)', create: makePersistent },
];

async function seed(
  repo: SeedableRepo,
  revision = 0,
  turnCount = 1,
): Promise<void> {
  await repo.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(revision),
      state: { turnCount, travelerName: '开拓者' },
    }),
  );
}

for (const adapter of adapters) {
  describe(`SessionRepository contract — ${adapter.name}`, () => {
    it('read returns a deep clone of formal snapshot', async () => {
      const repo = adapter.create();
      await seed(repo, 0, 3);
      const a = await repo.read(SESSION);
      const b = await repo.read(SESSION);
      expect(a).toEqual(b);
      expect(a).not.toBe(b);
      expect(a.state).not.toBe(b.state);
      expect(a.state.turnCount).toBe(3);
    });

    it('compareAndSwap commits once and bumps revision', async () => {
      const repo = adapter.create();
      await seed(repo, 0, 1);
      const next = createEmptyGameState({
        turnCount: 2,
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'assistant', content: 'ok' },
        ],
        turns: [{ id: 'turn_c1', playerText: 'hi', narrativeText: 'ok', travelerNameBefore: null }],
        travelerName: '开拓者',
      });

      const result = await repo.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        commandId: asCommandId('c1'),
        nextState: next,
      });

      expect(result.type).toBe('committed');
      if (result.type !== 'committed') throw new Error('expected committed');
      expect(result.snapshot.revision).toBe(1);
      expect(result.snapshot.state.turnCount).toBe(2);

      const read = await repo.read(SESSION);
      expect(read.revision).toBe(1);
      expect(read.state.messages).toHaveLength(2);
    });

    it('stale expectedRevision yields conflict without mutation', async () => {
      const repo = adapter.create();
      await seed(repo, 1, 2);
      const before = await repo.read(SESSION);

      const result = await repo.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        commandId: asCommandId('stale'),
        nextState: createEmptyGameState({ turnCount: 99 }),
      });

      expect(result).toEqual({ type: 'conflict', actualRevision: 1 });
      expect(await repo.read(SESSION)).toEqual(before);
    });

    it('concurrent CAS: only one winner', async () => {
      const repo = adapter.create();
      await seed(repo, 0, 1);
      const a = repo.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        commandId: asCommandId('race-a'),
        nextState: createEmptyGameState({ turnCount: 2, travelerName: 'A' }),
      });
      const b = repo.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        commandId: asCommandId('race-b'),
        nextState: createEmptyGameState({ turnCount: 2, travelerName: 'B' }),
      });
      const [ra, rb] = await Promise.all([a, b]);
      const types = [ra.type, rb.type].sort();
      expect(types).toEqual(['committed', 'conflict']);
      const snap = await repo.read(SESSION);
      expect(snap.revision).toBe(1);
    });

    it('findByCommandId returns prior commit after successful CAS', async () => {
      const repo = adapter.create();
      await seed(repo, 0, 1);
      const next = createEmptyGameState({ turnCount: 2, travelerName: '丹恒' });
      await repo.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        commandId: asCommandId('find-1'),
        nextState: next,
      });

      const found = await repo.findByCommandId(SESSION, asCommandId('find-1'));
      expect(found).not.toBeNull();
      expect(found?.revision).toBe(1);
      expect(found?.state.travelerName).toBe('丹恒');

      const missing = await repo.findByCommandId(
        SESSION,
        asCommandId('never'),
      );
      expect(missing).toBeNull();
    });

    it('same commandId retry returns prior commit without second turn', async () => {
      const repo = adapter.create();
      await seed(repo, 0, 1);
      const firstNext = createEmptyGameState({
        turnCount: 2,
        turns: [{ id: 'turn_idem', playerText: 'a', narrativeText: 'A', travelerNameBefore: null }],
        travelerName: '开拓者',
      });
      const first = await repo.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0),
        commandId: asCommandId('idem-1'),
        nextState: firstNext,
      });
      expect(first.type).toBe('committed');
      if (first.type !== 'committed') throw new Error('expected committed');

      const retry = await repo.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(0), // stale on purpose
        commandId: asCommandId('idem-1'),
        nextState: createEmptyGameState({
          turnCount: 99,
          travelerName: 'should-not-apply',
        }),
      });

      expect(retry.type).toBe('committed');
      if (retry.type !== 'committed') throw new Error('expected committed');
      expect(retry.snapshot).toEqual(first.snapshot);
      expect(retry.snapshot.state.turnCount).toBe(2);
      expect(retry.snapshot.state.travelerName).toBe('开拓者');

      const current = await repo.read(SESSION);
      expect(current.revision).toBe(1);
      expect(current.state.turns).toHaveLength(1);
    });

    it('caller mutation of read snapshot does not affect store', async () => {
      const repo = adapter.create();
      await seed(repo, 0, 1);
      const snap = await repo.read(SESSION);
      // Attempt mutation on returned object graph.
      (snap.state as { turnCount: number }).turnCount = 999;
      (snap.state.messages as { role: string; content: string }[]).push({
        role: 'user',
        content: 'leak',
      });

      const again = await repo.read(SESSION);
      expect(again.state.turnCount).toBe(1);
      expect(again.state.messages).toHaveLength(0);
    });
  });
}
