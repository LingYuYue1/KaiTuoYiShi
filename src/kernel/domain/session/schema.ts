import type { GameState } from './types';
import { cloneGameState } from './types';
import { assertTurnJournalEntry, assertTurnSnapshot } from './storyState';
import { assertStoryPolicy } from '@/models/settingsPlanes';

/**
 * Exact current kernel persistence schema. Older versions are unsupported and
 * fail at ingress; production contains no compatibility reader or migration.
 */
export const SESSION_SCHEMA_VERSION = 5 as const;

export type StoredSession = Readonly<{
  schemaVersion: typeof SESSION_SCHEMA_VERSION;
  sessionId: string;
  revision: number;
  state: GameState;
}>;

export class SessionSchemaError extends Error {
  readonly code: 'invalid_payload' | 'schema_mismatch' | 'invalid_field';

  constructor(
    code: 'invalid_payload' | 'schema_mismatch' | 'invalid_field',
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = 'SessionSchemaError';
  }
}

/** Decode one exact current-schema session record. */
export function readSessionRecord(raw: unknown): StoredSession {
  if (!isRecord(raw)) {
    throw new SessionSchemaError('invalid_payload', 'Session record must be an object');
  }

  const version = raw.schemaVersion;

  if (version !== SESSION_SCHEMA_VERSION) {
    throw new SessionSchemaError(
      'schema_mismatch',
      `Session schema ${String(version)} is unsupported; required ${SESSION_SCHEMA_VERSION}`,
    );
  }

  return validateCurrentRecord(raw);
}

// ── Current validation ──

function validateCurrentRecord(raw: Record<string, unknown>): StoredSession {
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
    assertCurrentState(state);
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

// ── State validation ──

function assertCurrentState(state: GameState): void {
  if (!state.story || typeof state.story !== 'object') {
    throw new SessionSchemaError('invalid_field', 'state.story is required');
  }
  const story = state.story as unknown as Record<string, unknown>;
  for (const forbidden of ['apiSettings', 'gameSettings', 'currentTheme', 'worldbooks', 'runtime']) {
    if (forbidden in story) throw new SessionSchemaError('invalid_field', `state.story must not contain ${forbidden}`);
  }
  const conversation = requireRecord(story.conversation, 'state.story.conversation');
  const content = requireRecord(story.content, 'state.story.content');

  // Story-plane authority fields: rollback/cooldown data is validated at
  // ingress, never cast-and-trusted downstream.
  if (!Array.isArray(conversation.turnJournal)) {
    throw new SessionSchemaError('invalid_field', 'state.story.conversation.turnJournal must be an array');
  }
  for (const entry of conversation.turnJournal as unknown[]) {
    try {
      assertTurnJournalEntry(entry);
    } catch (error) {
      throw new SessionSchemaError(
        'invalid_field',
        `state.story.conversation.turnJournal is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  if (!isRecord(content.worldbookTriggerStates)) {
    throw new SessionSchemaError('invalid_field', 'state.story.content.worldbookTriggerStates must be an object');
  }
  for (const value of Object.values(content.worldbookTriggerStates as Record<string, unknown>)) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new SessionSchemaError('invalid_field', 'state.story.content.worldbookTriggerStates values must be finite numbers');
    }
  }
  try {
    assertTurnSnapshot(storyToSnapshotShape(story));
  } catch (error) {
    throw new SessionSchemaError(
      'invalid_field',
      `state.story fields are invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  // Conversation fields are outside TurnSnapshot and validated separately.
  if (!isRecord(story.traveler) || typeof story.traveler.姓名 !== 'string' || story.traveler.姓名.trim().length === 0) {
    throw new SessionSchemaError('invalid_field', 'state.story.traveler.姓名 is required');
  }
  assertStoryPolicy(story.policy);
  if (!Array.isArray(conversation.history)) {
    throw new SessionSchemaError('invalid_field', 'state.story.conversation.history must be an array');
  }
  if (conversation.history.length > 0 && conversation.history.length % 2 !== 0) {
    throw new SessionSchemaError('invalid_field', 'chatHistory requires complete user and assistant pairs');
  }
  for (let index = 0; index < conversation.history.length; index += 2) {
    const history = conversation.history as Record<string, unknown>[];
    const user = history[index];
    const assistant = history[index + 1];
    if (!user || user.role !== 'user' || !assistant || assistant.role !== 'assistant' || !assistant.parsedResponse) {
      throw new SessionSchemaError('invalid_field', `chatHistory pair ${index / 2} is invalid`);
    }
  }
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new SessionSchemaError('invalid_field', `${path} must be an object`);
  return value;
}

function storyToSnapshotShape(story: Record<string, unknown>): Record<string, unknown> {
  const memory = requireRecord(story.memory, 'state.story.memory');
  const characters = requireRecord(story.characters, 'state.story.characters');
  const plot = requireRecord(story.plot, 'state.story.plot');
  const systems = requireRecord(story.systems, 'state.story.systems');
  const turn = requireRecord(story.turn, 'state.story.turn');
  const jobs = requireRecord(story.jobs, 'state.story.jobs');
  const content = requireRecord(story.content, 'state.story.content');
  const conversation = requireRecord(story.conversation, 'state.story.conversation');
  return {
    旅人: story.traveler, 世界: story.world, 记忆: memory.system, 忆庭: memory.yiting,
    智库: content.zhikuRuntime, 手机: story.phone, NPC: characters.npcs, 相册: story.album,
    新闻: story.news, 剧情: plot.nodes, 剧情编织: plot.weaving,
    variableBatches: systems.variableBatches, jobs: jobs.records,
    turnCount: conversation.turnCount, pendingOpeningTrigger: turn.pendingOpeningTrigger,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
