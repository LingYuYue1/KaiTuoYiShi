/**
 * Phase 4.2 — exportSession / importSession formal package roundtrip.
 */

import { describe, expect, it } from 'vitest';
import { collectAsync } from '@/tests/helpers/asyncFrames';
import {
  asCommandId,
  asRevision,
  asSessionId,
} from '@/src/kernel/contract';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import {
  decodeSessionPackage,
  exportSession,
  type SessionSavePackage,
} from '@/src/kernel/application/saveSession';
import { importSession } from '@/src/kernel/application/loadSession';
import { InMemorySessionRepository } from '@/src/kernel/adapters/test/InMemorySessionRepository';
import {
  createMemoryPersistentSessionRepository,
} from '@/src/kernel/adapters/indexeddb/PersistentSessionRepository';
import { ScriptedModelGateway } from '@/src/kernel/adapters/test/ScriptedModelGateway';
import {
  createEmptyGameState,
  createSessionSnapshot,
} from '@/src/kernel/domain/session/types';
import { SESSION_SCHEMA_VERSION } from '@/src/kernel/domain/session/schema';

const SESSION = asSessionId('phase4-save');

describe('save/load session package (Phase 4.2)', () => {
  it('export → import roundtrip preserves state and revision (InMemory)', async () => {
    const source = new InMemorySessionRepository();
    source.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(3),
        state: {
          turnCount: 4,
          travelerName: '星',
          messages: [
            { role: 'user', content: 'hi' },
            { role: 'assistant', content: 'hello' },
          ],
          turns: [
            {
              id: 'turn_c1',
              playerText: 'hi',
              narrativeText: 'hello',
              travelerNameBefore: null,
            },
          ],
        },
      }),
    );

    const bytes = await exportSession(SESSION, source);
    const raw = decodeSessionPackage(bytes) as SessionSavePackage;
    expect(raw.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(raw.sessionId).toBe(String(SESSION));
    expect(raw.revision).toBe(3);
    expect(raw.state.travelerName).toBe('星');

    const target = new InMemorySessionRepository();
    // Import revision policy: preserve package revision (roundtrip fidelity).
    const view = await importSession(bytes, target);
    expect(view).toMatchObject({
      sessionId: SESSION,
      revision: 3,
      turnCount: 4,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    });

    const restored = await target.read(SESSION);
    const original = await source.read(SESSION);
    expect(restored.revision).toBe(3);
    expect(restored.state).toEqual(original.state);
  });

  it('export after native advance, import into persistent repo', async () => {
    const sessions = new InMemorySessionRepository();
    sessions.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(0),
        state: createEmptyGameState({ turnCount: 1 }),
      }),
    );
    const model = new ScriptedModelGateway();
    model.enqueue({
      kind: 'success',
      chunks: ['存档叙事'],
      completedText: '存档叙事',
    });
    await collectAsync(
      executeTurn(
        {
          protocolVersion: 1,
          commandId: asCommandId('save-adv'),
          sessionId: SESSION,
          expectedRevision: asRevision(0),
          command: { type: 'turn.advance', input: { text: '存一下' } },
        },
        { sessions, model },
      ),
    );

    const bytes = await exportSession(SESSION, sessions);
    const durable = createMemoryPersistentSessionRepository();
    const view = await importSession(bytes, durable);

    expect(view.revision).toBe(1);
    expect(view.messages.at(-1)?.content).toBe('存档叙事');

    const readBack = await durable.read(SESSION);
    expect(readBack.state.turns).toHaveLength(1);
    expect(readBack.state.turns[0]!.playerText).toBe('存一下');
  });

  it('export always writes current schemaVersion (single schema write)', async () => {
    const sessions = new InMemorySessionRepository();
    sessions.seed(
      createSessionSnapshot({
        sessionId: SESSION,
        revision: asRevision(0),
      }),
    );
    const bytes = await exportSession(SESSION, sessions);
    const pkg = decodeSessionPackage(bytes) as SessionSavePackage;
    expect(pkg.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    // No dual fields for legacy schemas.
    expect('schemaVersions' in pkg).toBe(false);
  });
});
