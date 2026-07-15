/**
 * Session persistence schema versioning (Phase 4).
 *
 * - Every durable snapshot carries schemaVersion.
 * - Migration runs once at repository / import ingress.
 * - Irreversible bumps require backup; composition-flag rollback is not
 *   lossless when old code cannot read the new schema.
 * - Single schemaVersion on write — no indefinite dual-schema write.
 */

import type { GameState } from './types';
import { cloneGameState } from './types';

/** Current formal session schema. Bump only with a migration path. */
export const SESSION_SCHEMA_VERSION = 1 as const;

export type SessionSchemaVersion = number;

export type MigratedSessionRecord = Readonly<{
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  sessionId: string;
  revision: number;
  state: GameState;
}>;

/**
 * Normalize unknown wire / package payloads into the current schema.
 * Fail closed on future versions the running code cannot understand.
 */
export function migrateSessionRecord(raw: unknown): MigratedSessionRecord {
  if (raw === null || typeof raw !== 'object') {
    throw new SessionSchemaError(
      'invalid_payload',
      'Session record must be a non-null object',
    );
  }

  const record = raw as Record<string, unknown>;
  const sessionId = requireString(record.sessionId, 'sessionId');
  const revision = requireNonNegativeInt(record.revision, 'revision');
  const schemaVersion = readSchemaVersion(record);

  if (schemaVersion > SESSION_SCHEMA_VERSION) {
    throw new SessionSchemaError(
      'future_schema',
      `Unsupported schemaVersion ${schemaVersion} (current ${SESSION_SCHEMA_VERSION}). ` +
        'Restore a backup or upgrade the client; composition-flag rollback is not lossless.',
      { schemaVersion, current: SESSION_SCHEMA_VERSION },
    );
  }

  // v0 (missing schemaVersion) and v1 share the same minimal GameState shape.
  const state = readGameState(record.state);

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    sessionId,
    revision,
    state,
  };
}

/**
 * Identity migration hook for explicit v0 → v1 packages/tests.
 * v0 = no schemaVersion field on the wire object.
 */
export function migrateV0ToV1(raw: unknown): MigratedSessionRecord {
  if (raw !== null && typeof raw === 'object' && 'schemaVersion' in raw) {
    const version = (raw as { schemaVersion: unknown }).schemaVersion;
    if (version !== undefined && version !== 0) {
      throw new SessionSchemaError(
        'not_v0',
        `migrateV0ToV1 expected schemaVersion 0 or missing, got ${String(version)}`,
      );
    }
  }
  return migrateSessionRecord(raw);
}

export class SessionSchemaError extends Error {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>>;

  constructor(
    code: string,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'SessionSchemaError';
    this.code = code;
    this.details = details;
  }
}

function readSchemaVersion(record: Record<string, unknown>): number {
  if (!('schemaVersion' in record) || record.schemaVersion === undefined) {
    // Legacy wire rows written before Phase 4 — treat as v0.
    return 0;
  }
  return requireNonNegativeInt(record.schemaVersion, 'schemaVersion');
}

function readGameState(raw: unknown): GameState {
  if (raw === null || typeof raw !== 'object') {
    throw new SessionSchemaError(
      'invalid_field',
      'Session record.state must be a non-null object',
      { field: 'state' },
    );
  }

  const state = raw as Record<string, unknown>;
  return cloneGameState(
    {
      turnCount: requireNonNegativeInt(state.turnCount, 'state.turnCount'),
      messages: readMessages(state.messages),
      turns: readTurns(state.turns),
      travelerName: requireString(state.travelerName, 'state.travelerName'),
    },
  );
}

function readMessages(value: unknown): GameState['messages'] {
  if (!Array.isArray(value)) {
    throw new SessionSchemaError(
      'invalid_field',
      'Session record.state.messages must be an array',
      { field: 'state.messages' },
    );
  }

  return value.map((raw, index) => {
    if (raw === null || typeof raw !== 'object') {
      throw invalidMessage(index, 'must be an object');
    }
    const message = raw as Record<string, unknown>;
    if (message.role !== 'user' && message.role !== 'assistant') {
      throw invalidMessage(index, 'role must be "user" or "assistant"');
    }
    return {
      role: message.role,
      content: requireString(message.content, `state.messages[${index}].content`),
    };
  });
}

function readTurns(value: unknown): GameState['turns'] {
  if (!Array.isArray(value)) {
    throw new SessionSchemaError(
      'invalid_field',
      'Session record.state.turns must be an array',
      { field: 'state.turns' },
    );
  }

  return value.map((raw, index) => {
    if (raw === null || typeof raw !== 'object') {
      throw invalidTurn(index, 'must be an object');
    }
    const turn = raw as Record<string, unknown>;
    return {
      id: requireString(turn.id, `state.turns[${index}].id`),
      playerText: requireString(turn.playerText, `state.turns[${index}].playerText`),
      narrativeText: requireString(turn.narrativeText, `state.turns[${index}].narrativeText`),
      travelerNameBefore: readTravelerNameBefore(turn, index),
    };
  });
}

function readTravelerNameBefore(
  turn: Record<string, unknown>,
  index: number,
): string | null {
  if (!('travelerNameBefore' in turn)) {
    // Old rows cannot reconstruct this value safely; make reroll fail fast.
    return null;
  }
  if (turn.travelerNameBefore === null) {
    return null;
  }
  return requireString(
    turn.travelerNameBefore,
    `state.turns[${index}].travelerNameBefore`,
  );
}

function invalidMessage(index: number, reason: string): SessionSchemaError {
  return new SessionSchemaError(
    'invalid_field',
    `Session record.state.messages[${index}] ${reason}`,
    { field: `state.messages[${index}]` },
  );
}

function invalidTurn(index: number, reason: string): SessionSchemaError {
  return new SessionSchemaError(
    'invalid_field',
    `Session record.state.turns[${index}] ${reason}`,
    { field: `state.turns[${index}]` },
  );
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be a non-empty string`,
      { field },
    );
  }
  return value;
}

function requireNonNegativeInt(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be a non-negative integer`,
      { field, value },
    );
  }
  return value;
}
