import type { 存档类型 } from '@/models/settings';
import type { 存档树元信息 } from '@/utils/saveTree';

export const SAVE_CATALOG_VERSION = 2 as const;

export type SaveCatalogVisibility =
  | 'visible'
  | 'hidden-delta-base'
  | 'legacy-backup'
  | 'unreadable';

export interface SaveListItemSummary {
  id: number;
  type: 存档类型;
  timestamp: number;
  saveTree?: 存档树元信息;
  travelerName: string;
  turnCount: number;
  worldPeriodName: string;
  currentDate: string;
  currentTime: string;
  currentLocation: string;
  lastSummary: string;
  sizeBytes: number;
}

export interface VisibleSaveCatalogRecord extends SaveListItemSummary {
  catalogVersion: typeof SAVE_CATALOG_VERSION;
  visibility: 'visible';
}

export interface LegacyBackupCatalogRecord extends SaveListItemSummary {
  catalogVersion: typeof SAVE_CATALOG_VERSION;
  visibility: 'legacy-backup';
  type: 'backup';
}

export interface HiddenDeltaBaseCatalogRecord {
  id: number;
  catalogVersion: typeof SAVE_CATALOG_VERSION;
  visibility: 'hidden-delta-base';
  type?: 存档类型;
  timestamp?: number;
}

export interface UnreadableSaveCatalogRecord {
  id: number;
  catalogVersion: typeof SAVE_CATALOG_VERSION;
  visibility: 'unreadable';
  type?: 存档类型;
  timestamp?: number;
  lastErrorCode: string;
  failedAt: number;
  retryCount: number;
}

export type SaveCatalogRecord =
  | VisibleSaveCatalogRecord
  | LegacyBackupCatalogRecord
  | HiddenDeltaBaseCatalogRecord
  | UnreadableSaveCatalogRecord;

export interface SaveCatalogSnapshot {
  items: SaveListItemSummary[];
  legacyBackups: SaveListItemSummary[];
  pendingIds: number[];
  unreadableIds: number[];
  staleCatalogIds: number[];
  hiddenBaseCount: number;
  totalStoredCount: number;
  catalogComplete: boolean;
}

export function createCatalogRecordFromSummary(
  summary: SaveListItemSummary,
): VisibleSaveCatalogRecord | LegacyBackupCatalogRecord {
  if (summary.type === 'backup') {
    return {
      ...summary,
      catalogVersion: SAVE_CATALOG_VERSION,
      visibility: 'legacy-backup',
      type: 'backup',
    };
  }
  return {
    ...summary,
    catalogVersion: SAVE_CATALOG_VERSION,
    visibility: 'visible',
  };
}

export function createHiddenDeltaBaseCatalogRecord(input: {
  id: number;
  type?: 存档类型;
  timestamp?: number;
}): HiddenDeltaBaseCatalogRecord {
  return {
    id: input.id,
    catalogVersion: SAVE_CATALOG_VERSION,
    visibility: 'hidden-delta-base',
    ...(input.type ? { type: input.type } : {}),
    ...(typeof input.timestamp === 'number' ? { timestamp: input.timestamp } : {}),
  };
}

export function createUnreadableSaveCatalogRecord(input: {
  id: number;
  error: unknown;
  retryCount?: number;
}): UnreadableSaveCatalogRecord {
  return {
    id: input.id,
    catalogVersion: SAVE_CATALOG_VERSION,
    visibility: 'unreadable',
    lastErrorCode: getCatalogErrorCode(input.error),
    failedAt: Date.now(),
    retryCount: Math.max(1, Math.floor(input.retryCount ?? 1)),
  };
}

export function normalizeSaveCatalogRecord(value: unknown): SaveCatalogRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = normalizePositiveInteger(raw.id);
  if (!id) return null;

  if (raw.visibility === 'hidden-delta-base') {
    return createHiddenDeltaBaseCatalogRecord({
      id,
      type: normalizeOptionalSaveType(raw.type),
      timestamp: normalizeOptionalTimestamp(raw.timestamp),
    });
  }
  if (raw.visibility === 'unreadable') {
    return {
      id,
      catalogVersion: SAVE_CATALOG_VERSION,
      visibility: 'unreadable',
      ...(normalizeOptionalSaveType(raw.type) ? { type: normalizeOptionalSaveType(raw.type) } : {}),
      ...(normalizeOptionalTimestamp(raw.timestamp) !== undefined
        ? { timestamp: normalizeOptionalTimestamp(raw.timestamp) }
        : {}),
      lastErrorCode: typeof raw.lastErrorCode === 'string' && raw.lastErrorCode.trim()
        ? raw.lastErrorCode.trim().slice(0, 80)
        : 'unknown',
      failedAt: normalizeOptionalTimestamp(raw.failedAt) ?? Date.now(),
      retryCount: Math.max(1, Math.floor(Number(raw.retryCount) || 1)),
    };
  }

  const summary = normalizeSaveListItemSummary(raw);
  if (!summary) return null;
  return createCatalogRecordFromSummary(summary);
}

export function buildSaveCatalogSnapshot(
  records: SaveCatalogRecord[],
  saveKeys: IDBValidKey[],
): SaveCatalogSnapshot {
  const saveIds = Array.from(new Set(
    saveKeys
      .map((key) => normalizePositiveInteger(key))
      .filter((id): id is number => Boolean(id)),
  ));
  const saveIdSet = new Set(saveIds);
  const byId = new Map<number, SaveCatalogRecord>();
  for (const record of records) {
    if (record.id > 0) byId.set(record.id, record);
  }

  const items: SaveListItemSummary[] = [];
  const legacyBackups: SaveListItemSummary[] = [];
  const unreadableIds: number[] = [];
  let hiddenBaseCount = 0;

  for (const id of saveIds) {
    const record = byId.get(id);
    if (!record) continue;
    if (record.visibility === 'visible') items.push(stripCatalogMetadata(record));
    else if (record.visibility === 'legacy-backup') legacyBackups.push(stripCatalogMetadata(record));
    else if (record.visibility === 'hidden-delta-base') hiddenBaseCount += 1;
    else if (record.visibility === 'unreadable') unreadableIds.push(id);
  }

  const pendingIds = saveIds.filter((id) => !byId.has(id)).sort((a, b) => b - a);
  const staleCatalogIds = Array.from(byId.keys())
    .filter((id) => !saveIdSet.has(id))
    .sort((a, b) => b - a);

  return {
    items: sortSummaries(items),
    legacyBackups: sortSummaries(legacyBackups),
    pendingIds,
    unreadableIds: unreadableIds.sort((a, b) => b - a),
    staleCatalogIds,
    hiddenBaseCount,
    totalStoredCount: saveIds.length,
    catalogComplete: pendingIds.length === 0 && unreadableIds.length === 0,
  };
}

export function isDisplaySaveCatalogRecord(
  record: SaveCatalogRecord,
): record is VisibleSaveCatalogRecord | LegacyBackupCatalogRecord {
  return record.visibility === 'visible' || record.visibility === 'legacy-backup';
}

function stripCatalogMetadata(
  record: VisibleSaveCatalogRecord | LegacyBackupCatalogRecord,
): SaveListItemSummary {
  const { catalogVersion: _catalogVersion, visibility: _visibility, ...summary } = record;
  void _catalogVersion;
  void _visibility;
  return summary;
}

function normalizeSaveListItemSummary(raw: Record<string, unknown>): SaveListItemSummary | null {
  if ('chatHistory' in raw) return null;
  const id = normalizePositiveInteger(raw.id);
  const timestamp = normalizeOptionalTimestamp(raw.timestamp);
  if (!id || timestamp === undefined) return null;
  const saveTree = raw.saveTree && typeof raw.saveTree === 'object'
    ? raw.saveTree as 存档树元信息
    : undefined;
  return {
    id,
    type: normalizeSaveType(raw.type),
    timestamp,
    ...(saveTree ? { saveTree } : {}),
    travelerName: normalizeText(raw.travelerName),
    turnCount: Math.max(0, Math.floor(Number(raw.turnCount) || 0)),
    worldPeriodName: normalizeText(raw.worldPeriodName),
    currentDate: normalizeText(raw.currentDate),
    currentTime: normalizeText(raw.currentTime),
    currentLocation: normalizeText(raw.currentLocation),
    lastSummary: normalizeText(raw.lastSummary),
    sizeBytes: Math.max(0, Number(raw.sizeBytes) || 0),
  };
}

function sortSummaries(list: SaveListItemSummary[]): SaveListItemSummary[] {
  return [...list].sort((a, b) => b.timestamp - a.timestamp || b.id - a.id);
}

function normalizeSaveType(value: unknown): 存档类型 {
  return value === 'auto' || value === 'backup' || value === 'imported' ? value : 'manual';
}

function normalizeOptionalSaveType(value: unknown): 存档类型 | undefined {
  if (value === 'manual' || value === 'auto' || value === 'backup' || value === 'imported') return value;
  return undefined;
}

function normalizePositiveInteger(value: unknown): number | null {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOptionalTimestamp(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function getCatalogErrorCode(error: unknown): string {
  if (error instanceof DOMException && error.name) return error.name.slice(0, 80);
  if (error instanceof Error && error.name) return error.name.slice(0, 80);
  return 'unknown';
}
