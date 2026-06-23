import { getRuntimePlatform } from '@/utils/platform/desktopRuntime';
import { createAppStorageAdapter } from '@/services/storage/appStorageAdapter';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';
import type { DesktopAppInfo, DesktopUpdateStatus } from '@/services/desktop/desktopBridge';
import type { DesktopAssetMaintenanceSummary, DesktopAssetMirrorHealth } from '@/services/desktop/desktopAssetMirror';
import type { DesktopMigrationBackupPreview, DesktopMigrationBackupSummary } from '@/services/desktop/desktopMigrationBackup';
import type { DesktopSaveBackupSummary } from '@/services/desktop/desktopSaveBackup';
import type { DesktopSaveDeltaMirrorHealth } from '@/services/desktop/desktopSaveDeltaMirror';
import type { DesktopSaveMirrorHealth } from '@/services/desktop/desktopSaveMirror';
import type { DesktopReleaseInfo } from '@/services/desktop/desktopReleaseInfo';
import type { DesktopSpecialSettingMirrorStatus } from '@/services/desktop/desktopSettingsMirror';

export interface DesktopDiagnosticReportInput {
  appInfo: DesktopAppInfo | null;
  saveCount: number;
  desktopMirrorCount: number;
  desktopConfigCount: number;
  specialSettingMirrors: DesktopSpecialSettingMirrorStatus[];
  desktopAssetCount: number;
  desktopBackupCount: number;
  unreadableDesktopBackupCount: number;
  desktopMigrationBackupCount: number;
  unreadableDesktopMigrationBackupCount: number;
  desktopMigrationBackupPreview: DesktopMigrationBackupPreview | null;
  saveMirrorHealth: DesktopSaveMirrorHealth | null;
  saveDeltaMirrorHealth: DesktopSaveDeltaMirrorHealth | null;
  assetMirrorHealth: DesktopAssetMirrorHealth | null;
  assetSummary: DesktopAssetMaintenanceSummary | null;
  latestBackup: DesktopSaveBackupSummary | null;
  latestMigrationBackup: DesktopMigrationBackupSummary | null;
  updateStatus: DesktopUpdateStatus | null;
  releaseInfo: DesktopReleaseInfo | null;
  lastError?: string;
}

export interface DesktopDiagnosticReportResult {
  fileName: string;
  path: string;
  createdAt: number;
}

export interface DesktopDiagnosticReportSummary {
  fileName: string;
  path: string;
  createdAt: number;
  appVersion?: string;
  updateChecked: boolean;
  updateAvailable: boolean;
  lastError?: string;
}

export interface DesktopDiagnosticReport {
  kind: 'kaituoyishi-desktop-diagnostic-report';
  version: 1;
  createdAt: number;
  runtime: ReturnType<typeof getRuntimePlatform>;
  app: {
    productName?: string;
    version?: string;
    identifier?: string;
  };
  directories: {
    appDataDir?: string;
    saveDir?: string;
    backupDir?: string;
    assetDir?: string;
    logDir?: string;
    configDir?: string;
    zhikuDir?: string;
    worldbookDir?: string;
  };
  storage: {
    saveCount: number;
    desktopMirrorCount: number;
    desktopConfigCount: number;
    specialSettingMirrors: DesktopSpecialSettingMirrorStatus[];
    desktopAssetCount: number;
    desktopBackupCount: number;
    unreadableDesktopBackupCount: number;
    desktopMigrationBackupCount: number;
    unreadableDesktopMigrationBackupCount: number;
    desktopMigrationBackupPreview: DesktopMigrationBackupPreview | null;
    saveMirrorHealth: DesktopSaveMirrorHealth | null;
    saveDeltaMirrorHealth: DesktopSaveDeltaMirrorHealth | null;
    assetMirrorHealth: DesktopAssetMirrorHealth | null;
    assetSummary: DesktopAssetMaintenanceSummary | null;
    latestBackup: Pick<DesktopSaveBackupSummary, 'fileName' | 'createdAt' | 'reason' | 'count' | 'integrityStatus' | 'integrity'> | null;
    latestMigrationBackup: Pick<DesktopMigrationBackupSummary, 'fileName' | 'createdAt' | 'reason' | 'indexedSaveCount' | 'fileCount' | 'payloadBytes' | 'checksum' | 'integrityStatus'> | null;
  };
  update: {
    checked: boolean;
    available: boolean;
    currentVersion?: string;
    version?: string;
    date?: string;
    error?: string;
  };
  release: DesktopReleaseInfo | null;
  diagnostics: {
    lastError?: string;
    userAgent?: string;
  };
}

const LOG_DIR = 'logs';
const REPORT_PREFIX = 'diagnostic-report-';

export async function writeDesktopDiagnosticReport(
  input: DesktopDiagnosticReportInput,
): Promise<DesktopDiagnosticReportResult | null> {
  if (!isDesktopRuntime()) return null;
  const createdAt = Date.now();
  const fileName = `${REPORT_PREFIX}${formatReportTimestamp(createdAt)}.json`;
  const reportPath = `${LOG_DIR}/${fileName}`;
  const report: DesktopDiagnosticReport = {
    kind: 'kaituoyishi-desktop-diagnostic-report',
    version: 1,
    createdAt,
    runtime: getRuntimePlatform(),
    app: {
      productName: input.appInfo?.productName,
      version: input.appInfo?.version,
      identifier: input.appInfo?.identifier,
    },
    directories: {
      appDataDir: input.appInfo?.appDataDir,
      saveDir: input.appInfo?.saveDir,
      backupDir: input.appInfo?.backupDir,
      assetDir: input.appInfo?.assetDir,
      logDir: input.appInfo?.logDir,
      configDir: input.appInfo?.configDir,
      zhikuDir: input.appInfo?.zhikuDir,
      worldbookDir: input.appInfo?.worldbookDir,
    },
    storage: {
      saveCount: input.saveCount,
      desktopMirrorCount: input.desktopMirrorCount,
      desktopConfigCount: input.desktopConfigCount,
      specialSettingMirrors: input.specialSettingMirrors,
      desktopAssetCount: input.desktopAssetCount,
      desktopBackupCount: input.desktopBackupCount,
      unreadableDesktopBackupCount: input.unreadableDesktopBackupCount,
      desktopMigrationBackupCount: input.desktopMigrationBackupCount,
      unreadableDesktopMigrationBackupCount: input.unreadableDesktopMigrationBackupCount,
      desktopMigrationBackupPreview: input.desktopMigrationBackupPreview,
      saveMirrorHealth: input.saveMirrorHealth,
      saveDeltaMirrorHealth: input.saveDeltaMirrorHealth,
      assetMirrorHealth: input.assetMirrorHealth,
      assetSummary: input.assetSummary,
      latestBackup: input.latestBackup
        ? {
            fileName: input.latestBackup.fileName,
            createdAt: input.latestBackup.createdAt,
            reason: input.latestBackup.reason,
            count: input.latestBackup.count,
            integrityStatus: input.latestBackup.integrityStatus,
            integrity: input.latestBackup.integrity,
          }
        : null,
      latestMigrationBackup: input.latestMigrationBackup
        ? {
            fileName: input.latestMigrationBackup.fileName,
            createdAt: input.latestMigrationBackup.createdAt,
            reason: input.latestMigrationBackup.reason,
            indexedSaveCount: input.latestMigrationBackup.indexedSaveCount,
            fileCount: input.latestMigrationBackup.fileCount,
            payloadBytes: input.latestMigrationBackup.payloadBytes,
            checksum: input.latestMigrationBackup.checksum,
            integrityStatus: input.latestMigrationBackup.integrityStatus,
          }
        : null,
    },
    update: {
      checked: Boolean(input.updateStatus?.checked),
      available: Boolean(input.updateStatus?.available),
      currentVersion: input.updateStatus?.currentVersion,
      version: input.updateStatus?.version,
      date: input.updateStatus?.date,
      error: input.updateStatus?.error,
    },
    release: input.releaseInfo,
    diagnostics: {
      lastError: input.lastError || undefined,
      userAgent: globalThis.navigator?.userAgent,
    },
  };
  const adapter = createAppStorageAdapter();
  await adapter.writeJson<DesktopDiagnosticReport>(reportPath, report);
  return { fileName, path: reportPath, createdAt };
}

export async function listDesktopDiagnosticReports(): Promise<DesktopDiagnosticReportSummary[]> {
  if (!isDesktopRuntime()) return [];
  const adapter = createAppStorageAdapter();
  const files = await adapter.list(LOG_DIR);
  const summaries: DesktopDiagnosticReportSummary[] = [];
  for (const fileName of files) {
    if (!fileName.startsWith(REPORT_PREFIX) || !fileName.endsWith('.json')) continue;
    const reportPath = `${LOG_DIR}/${fileName}`;
    try {
      const report = await adapter.readJson<DesktopDiagnosticReport>(reportPath);
      if (report?.kind !== 'kaituoyishi-desktop-diagnostic-report' || report.version !== 1) continue;
      summaries.push({
        fileName,
        path: reportPath,
        createdAt: Number(report.createdAt) || 0,
        appVersion: report.app.version,
        updateChecked: Boolean(report.update.checked),
        updateAvailable: Boolean(report.update.available),
        lastError: report.diagnostics.lastError,
      });
    } catch (error) {
      console.warn(`[desktop-diagnostics] skip unreadable diagnostic report ${fileName}`, error);
    }
  }
  return summaries.sort((left, right) => right.createdAt - left.createdAt);
}

export async function loadDesktopDiagnosticReport(reportPath: string): Promise<DesktopDiagnosticReport | null> {
  if (!isDesktopRuntime()) return null;
  if (!isDiagnosticReportPath(reportPath)) {
    throw new Error(`诊断报告路径不合法: ${reportPath}`);
  }
  const adapter = createAppStorageAdapter();
  const report = await adapter.readJson<DesktopDiagnosticReport>(reportPath);
  if (report?.kind !== 'kaituoyishi-desktop-diagnostic-report' || report.version !== 1) return null;
  return report;
}

export async function deleteDesktopDiagnosticReport(reportPath: string): Promise<void> {
  if (!isDesktopRuntime()) return;
  if (!isDiagnosticReportPath(reportPath)) {
    throw new Error(`诊断报告路径不合法: ${reportPath}`);
  }
  const adapter = createAppStorageAdapter();
  await adapter.remove(reportPath);
}

function formatReportTimestamp(timestamp: number): string {
  return new Date(timestamp)
    .toISOString()
    .replace(/[:.]/g, '-');
}

function isDiagnosticReportPath(reportPath: string): boolean {
  return reportPath.startsWith(`${LOG_DIR}/${REPORT_PREFIX}`) && reportPath.endsWith('.json');
}
