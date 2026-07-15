/**
 * Phase 4.3 — schema version at ingress + migration hooks.
 */

import { describe, expect, it } from 'vitest';
import {
  asCommandId,
  asRevision,
  asSessionId,
} from '@/src/kernel/contract';
import {
  migrateSessionRecord,
  migrateV0ToV1,
  SESSION_SCHEMA_VERSION,
  SessionSchemaError,
} from '@/src/kernel/domain/session/schema';
import {
  createMemoryPersistentSessionRepositoryWithBackend,
} from '@/src/kernel/adapters/indexeddb/PersistentSessionRepository';
import { createEmptyGameState } from '@/src/kernel/domain/session/types';

const SESSION = 'phase4-schema';

describe('session schema migration (Phase 4.3)', () => {
  it('SESSION_SCHEMA_VERSION is 1', () => {
    expect(SESSION_SCHEMA_VERSION).toBe(1);
  });

  it('v0 package (missing schemaVersion) migrates to v1', () => {
    const v0 = {
      // no schemaVersion
      sessionId: SESSION,
      revision: 2,
      state: {
        turnCount: 3,
        messages: [{ role: 'user', content: 'a' }],
        turns: [{ id: 't1', playerText: 'a', narrativeText: 'b' }],
        travelerName: '开拓者',
      },
    };
    const migrated = migrateV0ToV1(v0);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.sessionId).toBe(SESSION);
    expect(migrated.revision).toBe(2);
    expect(migrated.state.turnCount).toBe(3);
    expect(migrated.state.travelerName).toBe('开拓者');
    expect(migrated.state.turns[0]?.travelerNameBefore).toBeNull();
  });

  it('current v1 package is identity-migrated', () => {
    const v1 = {
      schemaVersion: 1,
      sessionId: SESSION,
      revision: 0,
      state: createEmptyGameState({ travelerName: '星' }),
    };
    const migrated = migrateSessionRecord(v1);
    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.state.travelerName).toBe('星');
  });

  it('future schemaVersion is rejected clearly', () => {
    expect(() =>
      migrateSessionRecord({
        schemaVersion: 99,
        sessionId: SESSION,
        revision: 0,
        state: createEmptyGameState(),
      }),
    ).toThrow(SessionSchemaError);

    try {
      migrateSessionRecord({
        schemaVersion: 99,
        sessionId: SESSION,
        revision: 0,
        state: createEmptyGameState(),
      });
      expect.unreachable('should throw');
    } catch (err) {
      expect(err).toBeInstanceOf(SessionSchemaError);
      if (err instanceof SessionSchemaError) {
        expect(err.code).toBe('future_schema');
        expect(err.message).toMatch(/Unsupported schemaVersion 99/);
        expect(err.message).toMatch(/not lossless/);
      }
    }
  });

  it('repository read migrates legacy v0 wire rows at ingress', async () => {
    const { repository, backend } = createMemoryPersistentSessionRepositoryWithBackend();

    // Seed raw v0 row (schemaVersion 0) via backend — simulates pre-Phase-4 store.
    backend.seedSession({
      schemaVersion: 0,
      sessionId: SESSION,
      revision: 1,
      state: createEmptyGameState({
        turnCount: 2,
        travelerName: '遗留',
        messages: [
          { role: 'user', content: '旧' },
          { role: 'assistant', content: '文' },
        ],
        turns: [{ id: 'turn_old', playerText: '旧', narrativeText: '文', travelerNameBefore: null }],
      }),
    });

    const snap = await repository.read(asSessionId(SESSION));
    expect(snap.revision).toBe(asRevision(1));
    expect(snap.state.travelerName).toBe('遗留');
    expect(snap.state.turns).toHaveLength(1);

    // Next durable write uses current schema only.
    const cas = await repository.compareAndSwap({
      sessionId: asSessionId(SESSION),
      expectedRevision: asRevision(1),
      commandId: asCommandId('cmd-schema-write'),
      nextState: createEmptyGameState({
        turnCount: 3,
        travelerName: '遗留',
        messages: [
          { role: 'user', content: '旧' },
          { role: 'assistant', content: '文' },
          { role: 'user', content: '新' },
          { role: 'assistant', content: '写' },
        ],
        turns: [
          { id: 'turn_old', playerText: '旧', narrativeText: '文', travelerNameBefore: null },
          { id: 'turn_new', playerText: '新', narrativeText: '写', travelerNameBefore: null },
        ],
      }),
    });
    expect(cas.type).toBe('committed');

    // Inspect backend wire: schemaVersion present and current.
    const stored = await backend.runAtomic((tx) => tx.getSession(SESSION));
    expect(stored?.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
  });

  it('invalid payloads fail closed', () => {
    expect(() => migrateSessionRecord(null)).toThrow(SessionSchemaError);
    expect(() => migrateSessionRecord('x')).toThrow(SessionSchemaError);
    expect(() =>
      migrateSessionRecord({ sessionId: '', revision: 0, state: {} }),
    ).toThrow(SessionSchemaError);
    expect(() =>
      migrateSessionRecord({
        sessionId: SESSION,
        revision: 0,
        state: {},
      }),
    ).toThrow(SessionSchemaError);
    expect(() =>
      migrateSessionRecord({
        sessionId: SESSION,
        revision: 0,
        state: {
          turnCount: 1,
          travelerName: '星',
          messages: [{ role: 'system', content: 'not formal' }],
          turns: [],
        },
      }),
    ).toThrow(SessionSchemaError);
  });
});
