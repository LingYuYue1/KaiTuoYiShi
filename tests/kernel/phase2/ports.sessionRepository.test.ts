/**
 * Phase 2 — SessionRepository port contract (InMemory adapter).
 */

import { describe, expect, it } from 'vitest';
import {
  asCommandId,
  asRevision,
  asSessionId,
} from '@/src/kernel/contract';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import {
  createEmptyGameState,
  createSessionSnapshot,
} from '@/src/kernel/domain/session/types';

const SESSION = asSessionId('repo-session');

function seedRepo(revision = 0, turnCount = 1) {
  const repo = new InMemorySessionRepository();
  repo.seed(
    createSessionSnapshot({
      sessionId: SESSION,
      revision: asRevision(revision),
      state: { turnCount, travelerName: '开拓者' },
    }),
  );
  return repo;
}

describe('SessionRepository (InMemory) Phase 2', () => {
  it('read returns a deep clone of formal snapshot', async () => {
    const repo = seedRepo(0, 3);
    const a = await repo.read(SESSION);
    const b = await repo.read(SESSION);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.state).not.toBe(b.state);
    expect(a.state.turnCount).toBe(3);
  });

  it('compareAndSwap commits once and bumps revision', async () => {
    const repo = seedRepo(0, 1);
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
    const repo = seedRepo(1, 2);
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
    const repo = seedRepo(0, 1);
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
});
