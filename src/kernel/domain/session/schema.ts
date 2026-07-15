/**
 * Session persistence schema versioning (Phase 4 / Stage 5.1).
 *
 * - Every durable snapshot carries schemaVersion.
 * - Migration runs once at repository / import ingress.
 * - Irreversible bumps require backup; composition-flag rollback is not
 *   lossless when old code cannot read the new schema.
 * - Single schemaVersion on write — no indefinite dual-schema write.
 * - Stage 5.1: still schemaVersion 1; missing `variables` filled from travelerName.
 */

import type { GameState } from './types';
import { cloneGameState } from './types';
import type { KernelVariables } from '@/src/kernel/domain/variables/types';
import {
  cloneKernelVariables,
  createEmptyKernelVariables,
  withTravelerName,
} from '@/src/kernel/domain/variables/types';

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

  // v0 (missing schemaVersion) and v1 share GameState; variables may be absent.
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
  const travelerName = requireString(state.travelerName, 'state.travelerName');
  const variables = readVariables(state.variables, travelerName);

  return cloneGameState(
    {
      turnCount: requireNonNegativeInt(state.turnCount, 'state.turnCount'),
      messages: readMessages(state.messages),
      turns: readTurns(state.turns),
      travelerName,
      variables,
    },
  );
}

function readVariables(raw: unknown, travelerName: string): KernelVariables {
  if (raw === undefined) {
    // Pre-Stage-5.1 rows: synthesize traveler profile from travelerName only.
    return createEmptyKernelVariables({ 旅人: { 姓名: travelerName } });
  }
  if (typeof raw !== 'object') {
    throw new SessionSchemaError(
      'invalid_field',
      'Session record.state.variables must be an object when present',
      { field: 'state.variables' },
    );
  }

  const root = raw as Record<string, unknown>;
  const travelerRaw = root.旅人;
  if (travelerRaw === null || travelerRaw === undefined) {
    throw new SessionSchemaError(
      'invalid_field',
      'Session record.state.variables.旅人 must be an object when variables are present',
      { field: 'state.variables.旅人' },
    );
  }
  if (typeof travelerRaw !== 'object') {
    throw new SessionSchemaError(
      'invalid_field',
      'Session record.state.variables.旅人 must be an object',
      { field: 'state.variables.旅人' },
    );
  }

  const t = travelerRaw as Record<string, unknown>;
  const name =
    typeof t.姓名 === 'string' && t.姓名.length > 0 ? t.姓名 : travelerName;
  const variables = createEmptyKernelVariables({
    旅人: {
      姓名: name,
      身份: optionalString(t.身份),
      外貌: optionalString(t.外貌),
      性格: optionalString(t.性格),
      背景: optionalString(t.背景),
      数值属性: readNumericAttrs(t.数值属性),
    },
  });
  // Prefer explicit travelerName field as source of truth when both differ
  // (older dual-field rows); mirror into variables.
  return withTravelerName(variables, travelerName);
}

function readNumericAttrs(raw: unknown): Readonly<Record<string, number>> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      'Session record.state.variables.旅人.数值属性 must be an object',
      { field: 'state.variables.旅人.数值属性' },
    );
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = value;
    }
  }
  return out;
}

function optionalString(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
      variablesBefore: readVariablesBefore(turn, index),
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

function readVariablesBefore(
  turn: Record<string, unknown>,
  index: number,
): KernelVariables | null {
  if (!('variablesBefore' in turn) || turn.variablesBefore === undefined) {
    return null;
  }
  if (turn.variablesBefore === null) {
    return null;
  }
  if (typeof turn.variablesBefore !== 'object') {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.state.turns[${index}].variablesBefore must be an object or null`,
      { field: `state.turns[${index}].variablesBefore` },
    );
  }
  // Reuse variables reader; name fallback empty then filled by travelerNameBefore if needed.
  const nameHint =
    typeof turn.travelerNameBefore === 'string' ? turn.travelerNameBefore : '开拓者';
  return cloneKernelVariables(readVariables(turn.variablesBefore, nameHint));
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
