/**
 * Session persistence schema versioning (Phase 4 / Stage 5.1 / 5.2 / 5.3).
 *
 * - Every durable snapshot carries schemaVersion.
 * - Migration runs once at repository / import ingress.
 * - Irreversible bumps require backup; composition-flag rollback is not
 *   lossless when old code cannot read the new schema.
 * - Single schemaVersion on write — no indefinite dual-schema write.
 * - Stage 5.1: still schemaVersion 1; missing `variables` filled from travelerName.
 * - Stage 5.2: still schemaVersion 1; missing `knowledge` filled with empty defaults.
 * - Stage 5.3: still schemaVersion 1; missing `phone` / `news` filled with empty constructors.
 */

import type { GameState, KernelKnowledge } from './types';
import {
  cloneGameState,
  cloneKernelKnowledge,
  createEmptyKernelKnowledge,
} from './types';
import type {
  KernelStoryArchive,
  KernelYitingEntry,
  KernelZhikuEntry,
} from '@/src/kernel/domain/knowledge/types';
import type {
  KernelNewsEntry,
  KernelNewsSystem,
} from '@/src/kernel/domain/news/types';
import {
  cloneKernelNews,
  createEmptyKernelNews,
} from '@/src/kernel/domain/news/types';
import type {
  KernelPhoneMessage,
  KernelPhoneSystem,
  KernelPhoneThread,
} from '@/src/kernel/domain/phone/types';
import {
  cloneKernelPhone,
  createEmptyKernelPhone,
} from '@/src/kernel/domain/phone/types';
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

  // v0 (missing schemaVersion) and v1 share GameState; variables/knowledge may be absent.
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
  const knowledge = readKnowledge(state.knowledge, 'state.knowledge');
  const phone = readPhone(state.phone, 'state.phone');
  const news = readNews(state.news, 'state.news');

  return cloneGameState(
    {
      turnCount: requireNonNegativeInt(state.turnCount, 'state.turnCount'),
      messages: readMessages(state.messages),
      turns: readTurns(state.turns),
      travelerName,
      variables,
      knowledge,
      phone,
      news,
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

function readKnowledge(raw: unknown, field: string): KernelKnowledge {
  if (raw === undefined || raw === null) {
    // Pre-Stage-5.2 rows: empty knowledge slice.
    return createEmptyKernelKnowledge();
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object when present`,
      { field },
    );
  }

  const root = raw as Record<string, unknown>;
  return createEmptyKernelKnowledge({
    zhiku: { entries: readZhikuEntries(root.zhiku, `${field}.zhiku`) },
    yiting: { entries: readYitingEntries(root.yiting, `${field}.yiting`) },
    story: readStoryProgress(root.story, `${field}.story`),
    memory: readMemoryTier(root.memory, `${field}.memory`),
  });
}

function readZhikuEntries(raw: unknown, field: string): KernelZhikuEntry[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object`,
      { field },
    );
  }
  const system = raw as Record<string, unknown>;
  if (system.entries === undefined) return [];
  if (!Array.isArray(system.entries)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field}.entries must be an array`,
      { field: `${field}.entries` },
    );
  }
  return system.entries.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}.entries[${index}] must be an object`,
        { field: `${field}.entries[${index}]` },
      );
    }
    const e = entry as Record<string, unknown>;
    return {
      id: requireString(e.id, `${field}.entries[${index}].id`),
      title: requireString(e.title, `${field}.entries[${index}].title`),
      category: requireString(e.category, `${field}.entries[${index}].category`),
      unlockStatus: requireString(e.unlockStatus, `${field}.entries[${index}].unlockStatus`),
      runtimeUnlockStatus: optionalStringOrUndefined(e.runtimeUnlockStatus),
      runtimeUnlockNote: optionalStringOrUndefined(e.runtimeUnlockNote),
      usableForLink: typeof e.usableForLink === 'boolean' ? e.usableForLink : undefined,
      unlockCondition: optionalStringOrUndefined(e.unlockCondition),
      relatedSegment: optionalStringOrUndefined(e.relatedSegment),
      body: optionalStringOrUndefined(e.body),
      keywords: readOptionalStringArray(e.keywords, `${field}.entries[${index}].keywords`),
    };
  });
}

function readYitingEntries(raw: unknown, field: string): KernelYitingEntry[] {
  if (raw === undefined || raw === null) return [];
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object`,
      { field },
    );
  }
  const system = raw as Record<string, unknown>;
  if (system.entries === undefined) return [];
  if (!Array.isArray(system.entries)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field}.entries must be an array`,
      { field: `${field}.entries` },
    );
  }
  return system.entries.map((entry, index) => {
    if (entry === null || typeof entry !== 'object') {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}.entries[${index}] must be an object`,
        { field: `${field}.entries[${index}]` },
      );
    }
    const e = entry as Record<string, unknown>;
    return {
      id: requireString(e.id, `${field}.entries[${index}].id`),
      name: requireString(e.name, `${field}.entries[${index}].name`),
      turn: requireNonNegativeInt(e.turn, `${field}.entries[${index}].turn`),
      summary: requireString(e.summary, `${field}.entries[${index}].summary`),
      raw: optionalStringOrUndefined(e.raw),
      keywords: readOptionalStringArray(e.keywords, `${field}.entries[${index}].keywords`),
      type: optionalStringOrUndefined(e.type),
    };
  });
}

function readStoryProgress(
  raw: unknown,
  field: string,
): KernelKnowledge['story'] {
  if (raw === undefined || raw === null) return { archives: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object`,
      { field },
    );
  }
  const story = raw as Record<string, unknown>;
  const archivesRaw = story.archives;
  const archives: KernelStoryArchive[] = [];
  if (archivesRaw !== undefined) {
    if (!Array.isArray(archivesRaw)) {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}.archives must be an array`,
        { field: `${field}.archives` },
      );
    }
    for (let index = 0; index < archivesRaw.length; index += 1) {
      const item = archivesRaw[index];
      if (item === null || typeof item !== 'object') {
        throw new SessionSchemaError(
          'invalid_field',
          `Session record.${field}.archives[${index}] must be an object`,
          { field: `${field}.archives[${index}]` },
        );
      }
      const a = item as Record<string, unknown>;
      archives.push({
        segmentTitle: requireString(a.segmentTitle, `${field}.archives[${index}].segmentTitle`),
        summary: optionalStringOrUndefined(a.summary),
        body: optionalStringOrUndefined(a.body),
      });
    }
  }
  return {
    archives,
    injectionHint: optionalStringOrUndefined(story.injectionHint),
  };
}

function readMemoryTier(
  raw: unknown,
  field: string,
): KernelKnowledge['memory'] {
  if (raw === undefined || raw === null) return { recentSummaries: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object`,
      { field },
    );
  }
  const memory = raw as Record<string, unknown>;
  return {
    recentSummaries: readOptionalStringArray(memory.recentSummaries, `${field}.recentSummaries`) ?? [],
  };
}

/**
 * Stage 5.3 ingress: missing phone → empty system (one place only).
 */
function readPhone(raw: unknown, field: string): KernelPhoneSystem {
  if (raw === undefined || raw === null) {
    return createEmptyKernelPhone();
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object when present`,
      { field },
    );
  }
  const root = raw as Record<string, unknown>;
  if (root.threads === undefined) {
    return createEmptyKernelPhone();
  }
  if (!Array.isArray(root.threads)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field}.threads must be an array`,
      { field: `${field}.threads` },
    );
  }
  return cloneKernelPhone({
    threads: root.threads.map((item, index) =>
      readPhoneThread(item, `${field}.threads[${index}]`),
    ),
  });
}

function readPhoneThread(raw: unknown, field: string): KernelPhoneThread {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object`,
      { field },
    );
  }
  const thread = raw as Record<string, unknown>;
  const messagesRaw = thread.messages;
  if (!Array.isArray(messagesRaw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field}.messages must be an array`,
      { field: `${field}.messages` },
    );
  }
  return {
    contactId: requireString(thread.contactId, `${field}.contactId`),
    contactName: requireString(thread.contactName, `${field}.contactName`),
    messages: messagesRaw.map((item, index) =>
      readPhoneMessage(item, `${field}.messages[${index}]`),
    ),
  };
}

function readPhoneMessage(raw: unknown, field: string): KernelPhoneMessage {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object`,
      { field },
    );
  }
  const message = raw as Record<string, unknown>;
  if (
    message.role !== 'user'
    && message.role !== 'contact'
    && message.role !== 'system'
  ) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field}.role must be "user", "contact", or "system"`,
      { field: `${field}.role` },
    );
  }
  return {
    id: requireString(message.id, `${field}.id`),
    role: message.role,
    contactId: requireString(message.contactId, `${field}.contactId`),
    content: requireString(message.content, `${field}.content`),
    turn: requireNonNegativeInt(message.turn, `${field}.turn`),
  };
}

/**
 * Stage 5.3 ingress: missing news → empty system (one place only).
 */
function readNews(raw: unknown, field: string): KernelNewsSystem {
  if (raw === undefined || raw === null) {
    return createEmptyKernelNews();
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object when present`,
      { field },
    );
  }
  const root = raw as Record<string, unknown>;
  if (root.entries === undefined) {
    return createEmptyKernelNews();
  }
  if (!Array.isArray(root.entries)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field}.entries must be an array`,
      { field: `${field}.entries` },
    );
  }
  return cloneKernelNews({
    entries: root.entries.map((item, index) =>
      readNewsEntry(item, `${field}.entries[${index}]`),
    ),
  });
}

function readNewsEntry(raw: unknown, field: string): KernelNewsEntry {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object`,
      { field },
    );
  }
  const entry = raw as Record<string, unknown>;
  return {
    id: requireString(entry.id, `${field}.id`),
    title: requireString(entry.title, `${field}.title`),
    body: typeof entry.body === 'string'
      ? entry.body
      : requireString(entry.body, `${field}.body`),
    issueNumber: requireNonNegativeInt(entry.issueNumber, `${field}.issueNumber`),
    createdAtTurn: requireNonNegativeInt(entry.createdAtTurn, `${field}.createdAtTurn`),
  };
}

function readOptionalStringArray(raw: unknown, field: string): string[] | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be a string array`,
      { field },
    );
  }
  return raw;
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

function optionalStringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
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
      knowledgeBefore: readKnowledgeBefore(turn, index),
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

function readKnowledgeBefore(
  turn: Record<string, unknown>,
  index: number,
): KernelKnowledge | null {
  if (!('knowledgeBefore' in turn) || turn.knowledgeBefore === undefined) {
    return null;
  }
  if (turn.knowledgeBefore === null) {
    return null;
  }
  return cloneKernelKnowledge(
    readKnowledge(turn.knowledgeBefore, `state.turns[${index}].knowledgeBefore`),
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
