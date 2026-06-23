import { invoke } from '@tauri-apps/api/core';
import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';

export interface DesktopAppInfo {
  productName: string;
  version: string;
  identifier: string;
  appDataDir: string;
  saveDir: string;
  backupDir: string;
  assetDir: string;
  logDir: string;
  configDir: string;
  zhikuDir: string;
  worldbookDir: string;
}

export interface DesktopProbeResult {
  ok: boolean;
  appDataDir: string;
  probeFile: string;
  writtenAtMs: number;
}

export interface DesktopUpdateStatus {
  checked: boolean;
  available: boolean;
  currentVersion?: string;
  version?: string;
  date?: string;
  body?: string;
  error?: string;
}

export interface DesktopUpdateProgress {
  phase: 'idle' | 'started' | 'downloading' | 'finished' | 'installing';
  downloadedBytes: number;
  contentLength?: number;
}

let pendingUpdate: Update | null = null;

export async function getDesktopAppInfo(): Promise<DesktopAppInfo | null> {
  if (!isDesktopRuntime()) return null;
  return invoke<DesktopAppInfo>('desktop_app_info');
}

export async function writeDesktopProbe(): Promise<DesktopProbeResult | null> {
  if (!isDesktopRuntime()) return null;
  return invoke<DesktopProbeResult>('write_desktop_probe');
}

export async function openDesktopDataDir(
  target: 'appData' | 'saves' | 'backups' | 'logs' | 'assets' | 'config' | 'zhiku' | 'worldbooks' = 'appData',
): Promise<void> {
  if (!isDesktopRuntime()) return;
  await invoke('open_desktop_data_dir', { target });
}

export async function pickDesktopFolder(): Promise<string | null> {
  if (!isDesktopRuntime()) return null;
  return invoke<string | null>('pick_desktop_folder');
}

export async function setDesktopStorageRoots(input: {
  saveDir: string | null;
  backupDir: string | null;
}): Promise<DesktopAppInfo> {
  if (!isDesktopRuntime()) throw new Error('当前不是桌面运行环境');
  return invoke<DesktopAppInfo>('set_desktop_storage_roots', input);
}

export async function checkForDesktopUpdate(): Promise<DesktopUpdateStatus> {
  if (!isDesktopRuntime()) {
    return { checked: true, available: false, error: '当前不是桌面端运行环境' };
  }

  pendingUpdate?.close().catch(() => undefined);
  pendingUpdate = await check();
  if (!pendingUpdate) return { checked: true, available: false };

  return {
    checked: true,
    available: true,
    currentVersion: pendingUpdate.currentVersion,
    version: pendingUpdate.version,
    date: pendingUpdate.date,
    body: pendingUpdate.body,
  };
}

export async function downloadAndInstallDesktopUpdate(
  onProgress?: (progress: DesktopUpdateProgress) => void,
): Promise<void> {
  if (!isDesktopRuntime()) throw new Error('当前不是桌面端运行环境');
  if (!pendingUpdate) throw new Error('请先检查更新');

  let downloadedBytes = 0;
  onProgress?.({ phase: 'started', downloadedBytes });
  await pendingUpdate.download((event: DownloadEvent) => {
    if (event.event === 'Started') {
      downloadedBytes = 0;
      onProgress?.({
        phase: 'started',
        downloadedBytes,
        contentLength: event.data.contentLength,
      });
      return;
    }
    if (event.event === 'Progress') {
      downloadedBytes += event.data.chunkLength;
      onProgress?.({ phase: 'downloading', downloadedBytes });
      return;
    }
    onProgress?.({ phase: 'finished', downloadedBytes });
  });
  onProgress?.({ phase: 'installing', downloadedBytes });
  await pendingUpdate.install();
}
