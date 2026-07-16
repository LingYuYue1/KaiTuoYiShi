import type { GameState } from './types';
import { cloneGameState } from './types';

/**
 * Native kernel persistence is intentionally single-schema.
 * Old and partial rows are rejected at ingress; they are never repaired,
 * defaulted, or silently migrated into a different game state.
 */
export const SESSION_SCHEMA_VERSION = 2 as const;

export type StoredSession = Readonly<{
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  sessionId: string;
  revision: number;
  state: GameState;
}>;

export class SessionSchemaError extends Error {
  constructor(
    readonly code: 'invalid_payload' | 'schema_mismatch' | 'invalid_field',
    message: string,
  ) {
    super(message);
    this.name = 'SessionSchemaError';
  }
}

/** Decode one exact current-schema row. No compatibility path exists. */
export function readSessionRecord(raw: unknown): StoredSession {
  if (!isRecord(raw)) {
    throw new SessionSchemaError('invalid_payload', 'Session record must be an object');
  }
  if (raw.schemaVersion !== SESSION_SCHEMA_VERSION) {
    throw new SessionSchemaError(
      'schema_mismatch',
      `Session schema ${String(raw.schemaVersion)} is unsupported; required ${SESSION_SCHEMA_VERSION}`,
    );
  }
  if (typeof raw.sessionId !== 'string' || raw.sessionId.trim().length === 0) {
    throw new SessionSchemaError('invalid_field', 'Session record requires sessionId');
  }
  if (!Number.isSafeInteger(raw.revision) || Number(raw.revision) < 0) {
    throw new SessionSchemaError('invalid_field', 'Session record requires a non-negative revision');
  }
  if (!isRecord(raw.state)) {
    throw new SessionSchemaError('invalid_field', 'Session record requires state');
  }

  try {
    const state = cloneGameState(raw.state as GameState);
    assertGameState(state);
    return {
      schemaVersion: SESSION_SCHEMA_VERSION,
      sessionId: raw.sessionId,
      revision: Number(raw.revision),
      state,
    };
  } catch (error) {
    if (error instanceof SessionSchemaError) throw error;
    throw new SessionSchemaError(
      'invalid_field',
      `Session state does not match schema ${SESSION_SCHEMA_VERSION}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function assertGameState(state: GameState): void {
  if (!state.runtime || typeof state.runtime !== 'object') {
    throw new SessionSchemaError('invalid_field', 'state.runtime is required');
  }
  if (!Number.isSafeInteger(state.runtime.turnCount) || state.runtime.turnCount < 1) {
    throw new SessionSchemaError('invalid_field', 'state.runtime.turnCount must be a positive integer');
  }
  if (typeof state.runtime.旅人?.姓名 !== 'string' || state.runtime.旅人.姓名.trim().length === 0) {
    throw new SessionSchemaError('invalid_field', 'state.runtime.旅人.姓名 is required');
  }
  if (!Array.isArray(state.runtime.chatHistory)) {
    throw new SessionSchemaError('invalid_field', 'state.runtime.chatHistory must be an array');
  }
  if (state.runtime.chatHistory.length % 2 !== 0) {
    throw new SessionSchemaError('invalid_field', 'chatHistory requires complete user and assistant pairs');
  }
  for (let index = 0; index < state.runtime.chatHistory.length; index += 2) {
    const user = state.runtime.chatHistory[index];
    const assistant = state.runtime.chatHistory[index + 1];
    if (user?.role !== 'user' || assistant?.role !== 'assistant' || !assistant.parsedResponse) {
      throw new SessionSchemaError('invalid_field', `chatHistory pair ${index / 2} is invalid`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
