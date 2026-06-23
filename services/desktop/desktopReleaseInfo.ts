import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';
import type { DesktopAppInfo, DesktopUpdateStatus } from '@/services/desktop/desktopBridge';

export interface DesktopReleaseInfo {
  channel: 'desktop';
  version: string;
  title: string;
  notes: string;
  releaseSource: 'bundled';
  updateEndpoint: string;
  updateAvailable: boolean;
  latestVersion?: string;
}

const DEFAULT_UPDATE_ENDPOINT = 'https://github.com/LingYuYue1/KaiTuoYiShi/releases/latest/download/latest.json';

export function buildDesktopReleaseInfo(
  appInfo: DesktopAppInfo | null,
  updateStatus: DesktopUpdateStatus | null,
): DesktopReleaseInfo | null {
  if (!isDesktopRuntime()) return null;
  const version = appInfo?.version || updateStatus?.currentVersion || '0.0.0';
  return {
    channel: 'desktop',
    version,
    title: `开拓轶事 Desktop Edition ${version}`,
    notes: buildReleaseNotes(version, updateStatus),
    releaseSource: 'bundled',
    updateEndpoint: DEFAULT_UPDATE_ENDPOINT,
    updateAvailable: Boolean(updateStatus?.available),
    latestVersion: updateStatus?.version,
  };
}

function buildReleaseNotes(version: string, updateStatus: DesktopUpdateStatus | null): string {
  if (updateStatus?.available && updateStatus.version) {
    return updateStatus.body?.trim()
      || `发现 Desktop Edition ${updateStatus.version}，当前版本 ${updateStatus.currentVersion || version}。`;
  }
  if (updateStatus?.checked) return `当前 Desktop Edition ${version} 已是最新版本。`;
  return `Desktop Edition ${version}：可安装、可更新、本地数据优先的桌面分支版本。`;
}
