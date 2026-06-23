import type { 存档数据 } from '@/models/settings';
import { createAppStorageAdapter } from '@/services/storage/appStorageAdapter';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';
import { stripSaveAssetPayloadForStorage } from '@/utils/saveAssetStorage';

export type DesktopMigrationBackupReason = 'before-migration';

export interface DesktopMigrationBackupFile {
  path: string;
  kind: 'text' | 'base64';
  bytes: number;
  content: string;
}

export interface DesktopMigrationBackupIntegrity {
  algorithm: 'SHA-256';
  checksum: string;
  payloadBytes: number;
  indexedSaveCount: number;
  fileCount: number;
}

export interface DesktopMigrationBackupRecord {
  kind: 'kaituoyishi-desktop-migration-backup';
  version: 1;
  createdAt: number;
  reason: DesktopMigrationBackupReason;
  indexedSaveCount: number;
  indexedSaves: 存档数据[];
  files: DesktopMigrationBackupFile[];
  integrity: DesktopMigrationBackupIntegrity;
}

export type DesktopMigrationBackupIntegrityStatus = 'verified' | 'mismatch' | 'unreadable';

export interface DesktopMigrationBackupSummary {
  fileName: string;
  path: string;
  createdAt: number;
  reason: DesktopMigrationBackupReason;
  indexedSaveCount: number;
  fileCount: number;
  payloadBytes: number;
  checksum: string;
  integrityStatus: DesktopMigrationBackupIntegrityStatus;
  error?: string;
}

export interface DesktopMigrationBackupPreview {
  indexedSaveCount: number;
  fileCount: number;
  estimatedPayloadBytes: number;
  directoryCount: number;
  reason: DesktopMigrationBackupReason;
}

const BACKUP_DIR = 'backups';
const BACKUP_PREFIX = 'desktop-migration-backup-';
const TEXT_DIRS = ['saves', 'saves/transactions', 'saves/deltas', 'config', 'zhiku', 'worldbooks', 'assets'];
const GENERATED_ASSET_DIR = 'assets/generated-images';

export async function writeDesktopMigrationBackup(
  indexedSaves: 存档数据[],
  reason: DesktopMigrationBackupReason = 'before-migration',
): Promise<DesktopMigrationBackupSummary | null> {
  if (!isDesktopRuntime()) return null;
  const createdAt = Date.now();
  const fileName = `${BACKUP_PREFIX}${formatBackupTimestamp(createdAt)}.json`;
  const backupPath = `${BACKUP_DIR}/${fileName}`;
  const strippedSaves = indexedSaves.map((save) => stripSaveAssetPayloadForStorage(save));
  const files = await collectDesktopMigrationFiles();
  const integrity = await buildDesktopMigrationBackupIntegrity(strippedSaves, files);
  const record: DesktopMigrationBackupRecord = {
    kind: 'kaituoyishi-desktop-migration-backup',
    version: 1,
    createdAt,
    reason,
    indexedSaveCount: strippedSaves.length,
    indexedSaves: strippedSaves,
    files,
    integrity,
  };
  const adapter = createAppStorageAdapter();
  await adapter.writeJson<DesktopMigrationBackupRecord>(backupPath, record);
  return {
    fileName,
    path: backupPath,
    createdAt,
    reason,
    indexedSaveCount: strippedSaves.length,
    fileCount: files.length,
    payloadBytes: integrity.payloadBytes,
    checksum: integrity.checksum,
    integrityStatus: 'verified',
  };
}

export async function listDesktopMigrationBackups(): Promise<DesktopMigrationBackupSummary[]> {
  if (!isDesktopRuntime()) return [];
  const adapter = createAppStorageAdapter();
  const files = await adapter.list(BACKUP_DIR);
  const summaries: DesktopMigrationBackupSummary[] = [];
  for (const fileName of files) {
    if (!fileName.startsWith(BACKUP_PREFIX) || !fileName.endsWith('.json')) continue;
    const backupPath = `${BACKUP_DIR}/${fileName}`;
    try {
      const record = await adapter.readJson<DesktopMigrationBackupRecord>(backupPath);
      if (record?.kind !== 'kaituoyishi-desktop-migration-backup' || record.version !== 1 || !Array.isArray(record.indexedSaves) || !Array.isArray(record.files)) {
        summaries.push(buildUnreadableMigrationBackupSummary(fileName, backupPath, '迁移备份文件格式不正确'));
        continue;
      }
      const integrityStatus = await verifyDesktopMigrationBackupIntegrity(record);
      summaries.push({
        fileName,
        path: backupPath,
        createdAt: Number(record.createdAt) || 0,
        reason: record.reason,
        indexedSaveCount: Number(record.indexedSaveCount) || record.indexedSaves.length || 0,
        fileCount: record.files.length,
        payloadBytes: record.integrity?.payloadBytes || 0,
        checksum: record.integrity?.checksum || '',
        integrityStatus,
      });
    } catch (error) {
      console.warn(`[desktop-migration-backup] skip unreadable migration backup ${fileName}`, error);
      summaries.push(buildUnreadableMigrationBackupSummary(
        fileName,
        backupPath,
        error instanceof Error ? error.message : '迁移备份文件无法读取',
      ));
    }
  }
  return summaries.sort((left, right) => right.createdAt - left.createdAt);
}

export async function previewDesktopMigrationBackup(
  indexedSaves: 存档数据[],
  reason: DesktopMigrationBackupReason = 'before-migration',
): Promise<DesktopMigrationBackupPreview | null> {
  if (!isDesktopRuntime()) return null;
  const strippedSaves = indexedSaves.map((save) => stripSaveAssetPayloadForStorage(save));
  const files = await collectDesktopMigrationFiles();
  const payload = JSON.stringify({ indexedSaves: strippedSaves, files });
  return {
    indexedSaveCount: strippedSaves.length,
    fileCount: files.length,
    estimatedPayloadBytes: new TextEncoder().encode(payload).byteLength,
    directoryCount: TEXT_DIRS.length + 1,
    reason,
  };
}

async function collectDesktopMigrationFiles(): Promise<DesktopMigrationBackupFile[]> {
  const adapter = createAppStorageAdapter();
  const files: DesktopMigrationBackupFile[] = [];
  const seen = new Set<string>();

  for (const dir of TEXT_DIRS) {
    for (const fileName of await adapter.list(dir)) {
      if (!fileName.endsWith('.json')) continue;
      const path = `${dir}/${fileName}`;
      if (seen.has(path)) continue;
      const content = await adapter.readText(path);
      if (content === null) continue;
      seen.add(path);
      files.push({
        path,
        kind: 'text',
        bytes: new TextEncoder().encode(content).byteLength,
        content,
      });
    }
  }

  for (const fileName of await adapter.list(GENERATED_ASSET_DIR)) {
    const path = `${GENERATED_ASSET_DIR}/${fileName}`;
    if (seen.has(path)) continue;
    if (fileName.endsWith('.meta.json')) {
      const content = await adapter.readText(path);
      if (content === null) continue;
      seen.add(path);
      files.push({
        path,
        kind: 'text',
        bytes: new TextEncoder().encode(content).byteLength,
        content,
      });
      continue;
    }
    if (!adapter.readBase64File) continue;
    const content = await adapter.readBase64File(path);
    if (!content) continue;
    seen.add(path);
    files.push({
      path,
      kind: 'base64',
      bytes: estimateBase64Bytes(content),
      content,
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function buildUnreadableMigrationBackupSummary(
  fileName: string,
  path: string,
  error: string,
): DesktopMigrationBackupSummary {
  return {
    fileName,
    path,
    createdAt: 0,
    reason: 'before-migration',
    indexedSaveCount: 0,
    fileCount: 0,
    payloadBytes: 0,
    checksum: '',
    integrityStatus: 'unreadable',
    error,
  };
}

async function buildDesktopMigrationBackupIntegrity(
  indexedSaves: 存档数据[],
  files: DesktopMigrationBackupFile[],
): Promise<DesktopMigrationBackupIntegrity> {
  const payload = JSON.stringify({ indexedSaves, files });
  return {
    algorithm: 'SHA-256',
    checksum: await sha256Hex(payload),
    payloadBytes: new TextEncoder().encode(payload).byteLength,
    indexedSaveCount: indexedSaves.length,
    fileCount: files.length,
  };
}

async function verifyDesktopMigrationBackupIntegrity(
  record: DesktopMigrationBackupRecord,
): Promise<DesktopMigrationBackupIntegrityStatus> {
  if (!record.integrity || record.integrity.algorithm !== 'SHA-256') return 'mismatch';
  if (!Array.isArray(record.indexedSaves) || !Array.isArray(record.files)) return 'mismatch';
  const current = await buildDesktopMigrationBackupIntegrity(record.indexedSaves, record.files);
  return current.checksum === record.integrity.checksum
    && current.payloadBytes === record.integrity.payloadBytes
    && current.indexedSaveCount === record.integrity.indexedSaveCount
    && current.fileCount === record.integrity.fileCount
    ? 'verified'
    : 'mismatch';
}

function estimateBase64Bytes(base64Content: string): number {
  const clean = base64Content.trim();
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((clean.length * 3) / 4) - padding);
}

function formatBackupTimestamp(timestamp: number): string {
  return new Date(timestamp)
    .toISOString()
    .replace(/[:.]/g, '-');
}

async function sha256Hex(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
