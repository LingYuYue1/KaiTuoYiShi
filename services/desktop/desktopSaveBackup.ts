import type { 存档数据 } from '@/models/settings';
import { createAppStorageAdapter } from '@/services/storage/appStorageAdapter';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';
import { stripSaveAssetPayloadForStorage } from '@/utils/saveAssetStorage';

export type DesktopSaveBackupReason = 'manual' | 'before-restore' | 'before-replace' | 'before-repair';

export interface DesktopSaveBackupRecord {
  kind: 'kaituoyishi-desktop-save-backup';
  version: 1;
  createdAt: number;
  reason: DesktopSaveBackupReason;
  count: number;
  saves: 存档数据[];
  integrity?: DesktopSaveBackupIntegrity;
}

export type DesktopSaveBackupIntegrityStatus = 'verified' | 'missing' | 'mismatch' | 'unreadable';

export interface DesktopSaveBackupIntegrity {
  algorithm: 'SHA-256';
  checksum: string;
  payloadBytes: number;
  saveCount: number;
}

export interface DesktopSaveBackupSummary {
  fileName: string;
  path: string;
  createdAt: number;
  reason?: DesktopSaveBackupReason;
  count: number;
  integrityStatus: DesktopSaveBackupIntegrityStatus;
  integrity?: DesktopSaveBackupIntegrity;
  error?: string;
}

const BACKUP_DIR = 'backups';
const BACKUP_PREFIX = 'desktop-save-backup-';

export async function writeDesktopSaveBackup(
  saves: 存档数据[],
  reason: DesktopSaveBackupReason = 'manual',
): Promise<DesktopSaveBackupSummary | null> {
  if (!isDesktopRuntime()) return null;
  const createdAt = Date.now();
  const fileName = `${BACKUP_PREFIX}${formatBackupTimestamp(createdAt)}.json`;
  const backupPath = `${BACKUP_DIR}/${fileName}`;
  const strippedSaves = saves.map((save) => stripSaveAssetPayloadForStorage(save));
  const integrity = await buildDesktopSaveBackupIntegrity(strippedSaves);
  const record: DesktopSaveBackupRecord = {
    kind: 'kaituoyishi-desktop-save-backup',
    version: 1,
    createdAt,
    reason,
    count: strippedSaves.length,
    saves: strippedSaves,
    integrity,
  };
  const adapter = createAppStorageAdapter();
  await adapter.writeJson<DesktopSaveBackupRecord>(backupPath, record);
  return {
    fileName,
    path: backupPath,
    createdAt,
    reason,
    count: saves.length,
    integrityStatus: 'verified',
    integrity,
  };
}

export async function listDesktopSaveBackups(): Promise<DesktopSaveBackupSummary[]> {
  if (!isDesktopRuntime()) return [];
  const adapter = createAppStorageAdapter();
  const files = await adapter.list(BACKUP_DIR);
  const summaries: DesktopSaveBackupSummary[] = [];
  for (const fileName of files) {
    if (!fileName.startsWith(BACKUP_PREFIX) || !fileName.endsWith('.json')) continue;
    const backupPath = `${BACKUP_DIR}/${fileName}`;
    try {
      const record = await adapter.readJson<DesktopSaveBackupRecord>(backupPath);
      if (record?.kind !== 'kaituoyishi-desktop-save-backup' || record.version !== 1 || !Array.isArray(record.saves)) {
        summaries.push(buildUnreadableBackupSummary(fileName, backupPath, '备份文件格式不正确'));
        continue;
      }
      const integrityStatus = await verifyDesktopSaveBackupIntegrity(record);
      summaries.push({
        fileName,
        path: backupPath,
        createdAt: Number(record.createdAt) || 0,
        reason: record.reason,
        count: Number(record.count) || record.saves.length || 0,
        integrityStatus,
        integrity: record.integrity,
      });
    } catch (error) {
      console.warn(`[desktop-save-backup] skip unreadable backup ${fileName}`, error);
      summaries.push(buildUnreadableBackupSummary(
        fileName,
        backupPath,
        error instanceof Error ? error.message : '备份文件无法读取',
      ));
    }
  }
  return summaries.sort((left, right) => right.createdAt - left.createdAt);
}

export async function loadDesktopSaveBackup(backupPath: string): Promise<DesktopSaveBackupRecord | null> {
  if (!isDesktopRuntime()) return null;
  if (!isBackupPath(backupPath)) {
    throw new Error(`备份路径不合法: ${backupPath}`);
  }
  const adapter = createAppStorageAdapter();
  const record = await adapter.readJson<DesktopSaveBackupRecord>(backupPath);
  if (record?.kind !== 'kaituoyishi-desktop-save-backup' || record.version !== 1 || !Array.isArray(record.saves)) {
    return null;
  }
  const integrityStatus = await verifyDesktopSaveBackupIntegrity(record);
  if (integrityStatus === 'mismatch') {
    throw new Error('桌面本地备份校验失败，已停止读取。');
  }
  return {
    ...record,
    count: Number(record.count) || record.saves.length,
    integrity: record.integrity,
  };
}

export async function deleteDesktopSaveBackup(backupPath: string): Promise<void> {
  if (!isDesktopRuntime()) return;
  if (!isBackupPath(backupPath)) {
    throw new Error(`备份路径不合法: ${backupPath}`);
  }
  const adapter = createAppStorageAdapter();
  await adapter.remove(backupPath);
}

function isBackupPath(backupPath: string): boolean {
  return backupPath.startsWith(`${BACKUP_DIR}/${BACKUP_PREFIX}`) && backupPath.endsWith('.json');
}

function formatBackupTimestamp(timestamp: number): string {
  return new Date(timestamp)
    .toISOString()
    .replace(/[:.]/g, '-');
}

function buildUnreadableBackupSummary(
  fileName: string,
  path: string,
  error: string,
): DesktopSaveBackupSummary {
  return {
    fileName,
    path,
    createdAt: 0,
    count: 0,
    integrityStatus: 'unreadable',
    error,
  };
}

async function buildDesktopSaveBackupIntegrity(saves: 存档数据[]): Promise<DesktopSaveBackupIntegrity> {
  const payload = JSON.stringify(saves);
  return {
    algorithm: 'SHA-256',
    checksum: await sha256Hex(payload),
    payloadBytes: new TextEncoder().encode(payload).byteLength,
    saveCount: saves.length,
  };
}

async function verifyDesktopSaveBackupIntegrity(record: DesktopSaveBackupRecord): Promise<DesktopSaveBackupIntegrityStatus> {
  if (!record.integrity) return 'missing';
  if (record.integrity.algorithm !== 'SHA-256' || !Array.isArray(record.saves)) return 'mismatch';
  const current = await buildDesktopSaveBackupIntegrity(record.saves);
  return current.checksum === record.integrity.checksum
    && current.payloadBytes === record.integrity.payloadBytes
    && current.saveCount === record.integrity.saveCount
    ? 'verified'
    : 'mismatch';
}

async function sha256Hex(payload: string): Promise<string> {
  const bytes = new TextEncoder().encode(payload);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
