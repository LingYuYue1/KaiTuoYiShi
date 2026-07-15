/**
 * Phase 4.3 — crash recovery semantics around CAS.
 *
 * - Crash before CAS durable write → read returns old revision
 * - Crash after successful CAS → read returns new complete revision
 */

import { describe, expect, it } from 'vitest';
import {
  asCommandId,
  asRevision,
  asSessionId,
} from '@/src/kernel/contract';
import {
  createMemoryPersistentSessionRepositoryWithBackend,
} from '@/src/kernel/adapters/indexeddb/PersistentSessionRepository';
import {
  createEmptyGameState,
  createSessionSnapshot,
} from '@/src/kernel/domain/session/types';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import { SESSION_SCHEMA_VERSION } from '@/src/kernel/domain/session/schema';

const SESSION = asSessionId('phase4-crash');

describe('crash recovery (Phase 4.3)', () => {
  it('crash before CAS durable write leaves old revision on read', async () => {
    const { repository, backend } =
      createMemoryPersistentSessionRepositoryWithBackend();

    await repository.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(5),
        state: createEmptyGameState({
          turnCount: 6,
          travelerName: '安全',
          messages: [
            { role: 'user', content: 'before' },
            { role: 'assistant', content: 'ok' },
          ],
          turns: [
            { id: 'turn_old', playerText: 'before', narrativeText: 'ok', travelerNameBefore: null },
          ],
        }),
      }),
    );

    const before = await repository.read(SESSION);
    expect(before.revision).toBe(5);

    backend.armCrashBeforeCommit('simulated crash before CAS durable write');

    await expect(
      repository.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(5),
        commandId: asCommandId('crash-before'),
        nextState: createEmptyGameState({
          turnCount: 7,
          travelerName: '不应出现',
          messages: [
            { role: 'user', content: 'before' },
            { role: 'assistant', content: 'ok' },
            { role: 'user', content: 'after' },
            { role: 'assistant', content: 'bad' },
          ],
          turns: [
            { id: 'turn_old', playerText: 'before', narrativeText: 'ok', travelerNameBefore: null },
            { id: 'turn_new', playerText: 'after', narrativeText: 'bad', travelerNameBefore: null },
          ],
        }),
      }),
    ).rejects.toThrow(/simulated crash before CAS/);

    // Formal authority unchanged.
    const afterCrash = await repository.read(SESSION);
    expect(afterCrash.revision).toBe(5);
    expect(afterCrash.state.travelerName).toBe('安全');
    expect(afterCrash.state.turns).toHaveLength(1);
    expect(afterCrash).toEqual(before);

    // commandId was not recorded (retry should attempt again, not idempotent hit).
    const prior = await repository.findByCommandId(
      SESSION,
      asCommandId('crash-before'),
    );
    expect(prior).toBeNull();
  });

  it('crash after staging session but before command write leaves no partial revision', async () => {
    const { repository, backend } =
      createMemoryPersistentSessionRepositoryWithBackend();

    await repository.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(5),
        state: createEmptyGameState({ turnCount: 6, travelerName: '原状态' }),
      }),
    );
    backend.armCrashBeforeCommandWrite('simulated crash before command write');

    await expect(
      repository.compareAndSwap({
        sessionId: SESSION,
        expectedRevision: asRevision(5),
        commandId: asCommandId('crash-between-records'),
        nextState: createEmptyGameState({ turnCount: 7, travelerName: '半写入' }),
      }),
    ).rejects.toThrow(/simulated crash before command write/);

    const afterCrash = await repository.read(SESSION);
    expect(afterCrash.revision).toBe(5);
    expect(afterCrash.state.travelerName).toBe('原状态');
    await expect(
      repository.findByCommandId(
        SESSION,
        asCommandId('crash-between-records'),
      ),
    ).resolves.toBeNull();
  });

  it('successful CAS then "crash" (process end) → read returns complete new revision', async () => {
    const { repository, backend } =
      createMemoryPersistentSessionRepositoryWithBackend();

    await repository.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(0),
        state: createEmptyGameState({ turnCount: 1 }),
      }),
    );

    const next = createEmptyGameState({
      turnCount: 2,
      messages: [
        { role: 'user', content: 'go' },
        { role: 'assistant', content: 'done' },
      ],
      turns: [{ id: 'turn_c', playerText: 'go', narrativeText: 'done', travelerNameBefore: null }],
      travelerName: '开拓者',
    });

    const result = await repository.compareAndSwap({
      sessionId: SESSION,
      expectedRevision: asRevision(0),
      commandId: asCommandId('crash-after'),
      nextState: next,
    });
    expect(result.type).toBe('committed');

    // Simulate process restart: new repository over the same durable backend.
    const {
      PersistentSessionRepository,
    } = await import(
      '@/src/kernel/adapters/indexeddb/PersistentSessionRepository'
    );
    const reopened = new PersistentSessionRepository(backend);
    const restored = await reopened.read(SESSION);
    expect(restored.revision).toBe(1);
    expect(restored.state.turns).toHaveLength(1);
    expect(restored.state.messages.at(-1)?.content).toBe('done');

    const wire = await backend.runAtomic((tx) => tx.getSession(String(SESSION)));
    expect(wire?.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(wire?.revision).toBe(1);
  });

  it('executeTurn model done but CAS aborted → formal state stays old', async () => {
    const { repository, backend } =
      createMemoryPersistentSessionRepositoryWithBackend();

    await repository.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(2),
        state: createEmptyGameState({ turnCount: 3, travelerName: '甲' }),
      }),
    );

    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['本应提交'],
      completedText: '本应提交',
    });

    // Arm crash so CAS putSession throws after model success.
    backend.armCrashBeforeCommit('CAS aborted after model');

    await expect(
      collectAsync(
        executeTurn(
          {
            protocolVersion: 1,
            commandId: asCommandId('mid-crash'),
            sessionId: SESSION,
            expectedRevision: asRevision(2),
            command: { type: 'turn.advance', input: { text: '冲' } },
          },
          { sessions: repository, model },
        ),
      ),
    ).rejects.toThrow(/CAS aborted after model/);

    const after = await repository.read(SESSION);
    expect(after.revision).toBe(2);
    expect(after.state.travelerName).toBe('甲');
    expect(after.state.messages).toHaveLength(0);
  });
});
