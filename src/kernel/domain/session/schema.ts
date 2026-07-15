/**
 * Session persistence schema versioning (Phase 4 / Stage 5.1 / 5.2 / 5.3 / 5.4).
 *
 * - Every durable snapshot carries schemaVersion.
 * - Migration runs once at repository / import ingress.
 * - Irreversible bumps require backup; composition-flag rollback is not
 *   lossless when old code cannot read the new schema.
 * - Single schemaVersion on write — no indefinite dual-schema write.
 * - Stage 5.1: still schemaVersion 1; missing `variables` filled from travelerName.
 * - Stage 5.2: still schemaVersion 1; missing `knowledge` filled with empty defaults.
 * - Stage 5.3: still schemaVersion 1; missing `phone` / `news` filled with empty constructors.
 * - Stage 5.4: still schemaVersion 1; missing `album` filled with createEmptyKernelAlbum().
 */

import type { GameState, KernelKnowledge } from './types';
import {
  cloneGameState,
  cloneKernelKnowledge,
  createEmptyKernelKnowledge,
} from './types';
import type {
  KernelAlbum,
  KernelAlbumEntry,
  KernelAsset,
  KernelImageSlot,
  KernelImageTargetType,
  KernelImageTask,
  KernelSlotBinding,
} from '@/src/kernel/domain/album';
import {
  cloneKernelAlbum,
  createEmptyKernelAlbum,
} from '@/src/kernel/domain/album';
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
  const album = readAlbum(state.album, 'state.album');

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
      album,
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

/**
 * Stage 5.4 ingress: missing album → empty system (one place only).
 * Accepts empty/missing; minimal validation of arrays if present.
 * Does not migrate legacy 相册系统 shapes.
 */
function readAlbum(raw: unknown, field: string): KernelAlbum {
  if (raw === undefined || raw === null) {
    return createEmptyKernelAlbum();
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an object when present`,
      { field },
    );
  }
  const root = raw as Record<string, unknown>;
  // Empty shell without arrays → empty album.
  if (
    root.assets === undefined
    && root.entries === undefined
    && root.tasks === undefined
    && root.slots === undefined
  ) {
    return createEmptyKernelAlbum();
  }
  return cloneKernelAlbum({
    assets: readAlbumAssets(root.assets, `${field}.assets`),
    entries: readAlbumEntries(root.entries, `${field}.entries`),
    tasks: readAlbumTasks(root.tasks, `${field}.tasks`),
    slots: readAlbumSlots(root.slots, `${field}.slots`),
  });
}

function readAlbumAssets(raw: unknown, field: string): KernelAsset[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an array`,
      { field },
    );
  }
  return raw.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}] must be an object`,
        { field: `${field}[${index}]` },
      );
    }
    const asset = item as Record<string, unknown>;
    const source = requireString(asset.source, `${field}[${index}].source`);
    if (source !== 'generated' && source !== 'upload' && source !== 'remote') {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}].source must be generated|upload|remote`,
        { field: `${field}[${index}].source` },
      );
    }
    const status = requireString(asset.status, `${field}[${index}].status`);
    if (status !== 'ready' && status !== 'failed' && status !== 'pending') {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}].status must be ready|failed|pending`,
        { field: `${field}[${index}].status` },
      );
    }
    if (typeof asset.nsfw !== 'boolean') {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}].nsfw must be a boolean`,
        { field: `${field}[${index}].nsfw` },
      );
    }
    return {
      id: requireString(asset.id, `${field}[${index}].id`),
      source,
      status,
      nsfw: asset.nsfw,
      createdAt: requireFiniteNumber(asset.createdAt, `${field}[${index}].createdAt`),
      ...(typeof asset.mimeType === 'string' ? { mimeType: asset.mimeType } : {}),
      ...(typeof asset.contentHash === 'string' ? { contentHash: asset.contentHash } : {}),
      ...(typeof asset.width === 'number' && Number.isFinite(asset.width)
        ? { width: asset.width }
        : {}),
      ...(typeof asset.height === 'number' && Number.isFinite(asset.height)
        ? { height: asset.height }
        : {}),
      ...(typeof asset.size === 'number' && Number.isFinite(asset.size)
        ? { size: asset.size }
        : {}),
      ...(typeof asset.prompt === 'string' ? { prompt: asset.prompt } : {}),
      ...(typeof asset.negativePrompt === 'string'
        ? { negativePrompt: asset.negativePrompt }
        : {}),
      ...(typeof asset.model === 'string' ? { model: asset.model } : {}),
      ...(typeof asset.backend === 'string' ? { backend: asset.backend } : {}),
      ...(typeof asset.remoteUrl === 'string' ? { remoteUrl: asset.remoteUrl } : {}),
    };
  });
}

function readAlbumEntries(raw: unknown, field: string): KernelAlbumEntry[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an array`,
      { field },
    );
  }
  return raw.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}] must be an object`,
        { field: `${field}[${index}]` },
      );
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.nsfw !== 'boolean') {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}].nsfw must be a boolean`,
        { field: `${field}[${index}].nsfw` },
      );
    }
    return {
      id: requireString(entry.id, `${field}[${index}].id`),
      assetId: requireString(entry.assetId, `${field}[${index}].assetId`),
      title: requireString(entry.title, `${field}[${index}].title`),
      targetType: requireString(
        entry.targetType,
        `${field}[${index}].targetType`,
      ) as KernelImageTargetType,
      ...(typeof entry.targetId === 'string' ? { targetId: entry.targetId } : {}),
      slot: requireString(entry.slot, `${field}[${index}].slot`) as KernelImageSlot,
      tags: readOptionalStringArray(entry.tags, `${field}[${index}].tags`) ?? [],
      nsfw: entry.nsfw,
      createdAt: requireFiniteNumber(entry.createdAt, `${field}[${index}].createdAt`),
      ...(typeof entry.note === 'string' ? { note: entry.note } : {}),
      referenceTargets:
        readOptionalStringArray(
          entry.referenceTargets,
          `${field}[${index}].referenceTargets`,
        ) ?? [],
    };
  });
}

function readAlbumTasks(raw: unknown, field: string): KernelImageTask[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an array`,
      { field },
    );
  }
  return raw.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}] must be an object`,
        { field: `${field}[${index}]` },
      );
    }
    const task = item as Record<string, unknown>;
    if (typeof task.nsfw !== 'boolean') {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}].nsfw must be a boolean`,
        { field: `${field}[${index}].nsfw` },
      );
    }
    const source = requireString(task.source, `${field}[${index}].source`);
    if (source !== 'manual' && source !== 'auto' && source !== 'retry') {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}].source must be manual|auto|retry`,
        { field: `${field}[${index}].source` },
      );
    }
    const status = requireString(task.status, `${field}[${index}].status`);
    if (
      status !== 'queued'
      && status !== 'running'
      && status !== 'success'
      && status !== 'failed'
      && status !== 'cancelled'
    ) {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}].status must be a KernelImageTaskStatus`,
        { field: `${field}[${index}].status` },
      );
    }
    return {
      id: requireString(task.id, `${field}[${index}].id`),
      targetType: requireString(
        task.targetType,
        `${field}[${index}].targetType`,
      ) as KernelImageTargetType,
      ...(typeof task.targetId === 'string' ? { targetId: task.targetId } : {}),
      slot: requireString(task.slot, `${field}[${index}].slot`) as KernelImageSlot,
      source,
      status,
      backend: requireString(task.backend, `${field}[${index}].backend`),
      nsfw: task.nsfw,
      prompt: typeof task.prompt === 'string'
        ? task.prompt
        : requireString(task.prompt, `${field}[${index}].prompt`),
      ...(typeof task.negativePrompt === 'string'
        ? { negativePrompt: task.negativePrompt }
        : {}),
      ...(typeof task.resultAssetId === 'string'
        ? { resultAssetId: task.resultAssetId }
        : {}),
      ...(typeof task.error === 'string' ? { error: task.error } : {}),
      retryCount: requireFiniteNumber(task.retryCount, `${field}[${index}].retryCount`),
      createdAt: requireFiniteNumber(task.createdAt, `${field}[${index}].createdAt`),
      ...(typeof task.startedAt === 'number' && Number.isFinite(task.startedAt)
        ? { startedAt: task.startedAt }
        : {}),
      ...(typeof task.finishedAt === 'number' && Number.isFinite(task.finishedAt)
        ? { finishedAt: task.finishedAt }
        : {}),
    };
  });
}

function readAlbumSlots(raw: unknown, field: string): KernelSlotBinding[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be an array`,
      { field },
    );
  }
  return raw.map((item, index) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      throw new SessionSchemaError(
        'invalid_field',
        `Session record.${field}[${index}] must be an object`,
        { field: `${field}[${index}]` },
      );
    }
    const binding = item as Record<string, unknown>;
    return {
      targetType: requireString(
        binding.targetType,
        `${field}[${index}].targetType`,
      ) as KernelImageTargetType,
      targetId: requireString(binding.targetId, `${field}[${index}].targetId`),
      slot: requireString(binding.slot, `${field}[${index}].slot`) as KernelImageSlot,
      assetId: requireString(binding.assetId, `${field}[${index}].assetId`),
      entryId: requireString(binding.entryId, `${field}[${index}].entryId`),
    };
  });
}

function requireFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SessionSchemaError(
      'invalid_field',
      `Session record.${field} must be a finite number`,
      { field, value },
    );
  }
  return value;
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
