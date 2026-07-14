import  { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { getSaveList, type SaveListItemSummary } from '@/services/dbService';
import {
  buildDesktopReleaseInfo,
  type DesktopReleaseInfo,
} from '@/services/desktop/desktopReleaseInfo';
import {
  checkForDesktopUpdate,
  downloadAndInstallDesktopUpdate,
  getDesktopAppInfo,
  openDesktopDataDir,
  writeDesktopProbe,
  type DesktopAppInfo,
  type DesktopProbeResult,
  type DesktopUpdateProgress,
  type DesktopUpdateStatus,
} from '@/services/desktop/desktopBridge';
import { isDesktopRuntime } from '@/utils/platform/desktopRuntime';
import type { SettingsTab } from '@/components/features/Settings/SettingsModal';

interface DesktopHomeScreenProps {
  onNewGame: () => void;
  onLoadSave: () => void;
  onContinue: () => Promise<boolean>;
  onOpenSettings: (tab?: SettingsTab) => void;
  onOpenStorageManager: () => void;
  onOpenWorldbookManager: () => void;
  onOpenZhikuManager: () => void;
  onOpenCloudSave: () => void;
  onOpenReleaseAnnouncements: () => void;
  onDiscordPost: () => void;
  onMysteryChat: () => void;
}

type DataDirTarget = 'appData' | 'saves' | 'backups' | 'logs' | 'assets' | 'config' | 'zhiku' | 'worldbooks';

interface StarDot {
  x: number;
  y: number;
  size: number;
  opacity: number;
}

const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip = 'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)';

export function DesktopHomeScreen({
  onNewGame,
  onLoadSave,
  onContinue,
  onOpenSettings,
  onOpenStorageManager,
  onOpenWorldbookManager,
  onOpenZhikuManager,
  onOpenCloudSave,
  onOpenReleaseAnnouncements,
  onDiscordPost,
  onMysteryChat,
}: DesktopHomeScreenProps) {
  const [desktopInfo, setDesktopInfo] = useState<DesktopAppInfo | null>(null);
  const [saveList, setSaveList] = useState<SaveListItemSummary[]>([]);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdateStatus | null>(null);
  const [desktopReleaseInfo, setDesktopReleaseInfo] = useState<DesktopReleaseInfo | null>(null);
  const [desktopProbe, setDesktopProbe] = useState<DesktopProbeResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<DesktopUpdateProgress | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const [toolboxOpen, setToolboxOpen] = useState(true);

  const stars = useMemo<StarDot[]>(() => {
    const list: StarDot[] = [];
    for (let i = 0; i < 24; i++) {
      list.push({
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: Math.random() < 0.12 ? 2 + Math.random() * 1.6 : 0.7 + Math.random() * 1.2,
        opacity: 0.16 + Math.random() * 0.5,
      });
    }
    return list;
  }, []);

  const refreshOverview = useCallback(async () => {
    setLoadError('');
    try {
      const [info, saves] = await Promise.all([getDesktopAppInfo(), getSaveList()]);
      setDesktopInfo(info);
      setSaveList(saves);
      setDesktopReleaseInfo(buildDesktopReleaseInfo(info, null));
    } catch (error) {
      console.error('[desktop-home] overview refresh failed', error);
      setLoadError(error instanceof Error ? error.message : '桌面首页状态读取失败');
    }
  }, []);

  useEffect(() => {
    if (!isDesktopRuntime()) return;
    void refreshOverview();
  }, [refreshOverview]);

  const latestSave = saveList[0] ?? null;
  const hasSave = Boolean(latestSave);
  const saveCount = saveList.filter((save) => save.type !== 'auto').length;
  const appVersion = desktopInfo?.version || desktopReleaseInfo?.version || '0.0.0';
  const updateText = desktopUpdate?.available
    ? `发现新版本 ${desktopUpdate.version ?? '未知'}`
    : desktopUpdate?.checked
      ? '当前已是最新版本'
      : '尚未检查更新';
  const releaseNotes = desktopReleaseInfo?.notes || updateText;
  const continueLabel = hasSave ? `继续游戏 · 最近存档 #${latestSave?.id ?? '?'}` : '继续游戏';
  const continueHint = latestSave
    ? `${latestSave.travelerName || '未命名旅人'} / ${latestSave.currentLocation || latestSave.worldPeriodName || '未知坐标'}`
    : '当前没有可继续的存档。';

  const handleOpenDir = useCallback(async (target: DataDirTarget) => {
    await openDesktopDataDir(target);
  }, []);

  const handleCheckUpdate = useCallback(async () => {
    setCheckingUpdate(true);
    setStatusMessage('正在检查更新...');
    setLoadError('');
    try {
      const result = await checkForDesktopUpdate();
      setDesktopUpdate(result);
      setDesktopReleaseInfo(buildDesktopReleaseInfo(desktopInfo, result));
      setStatusMessage(result.available
        ? `发现 Desktop Edition ${result.version ?? '新版本'}`
        : '当前已是最新版本');
    } catch (error) {
      console.error('[desktop-home] check update failed', error);
      setStatusMessage('');
      setLoadError(error instanceof Error ? error.message : '检查更新失败');
    } finally {
      setCheckingUpdate(false);
    }
  }, [desktopInfo]);

  const handleInstallUpdate = useCallback(async () => {
    if (!desktopUpdate?.available) return;
    setInstallingUpdate(true);
    setLoadError('');
    setStatusMessage('正在下载并安装更新...');
    setUpdateProgress(null);
    try {
      await downloadAndInstallDesktopUpdate((progress) => setUpdateProgress(progress));
      setStatusMessage('更新已提交安装，应用将重启或由安装器继续完成。');
    } catch (error) {
      console.error('[desktop-home] install update failed', error);
      setStatusMessage('');
      setLoadError(error instanceof Error ? error.message : '下载并安装更新失败');
    } finally {
      setInstallingUpdate(false);
      setUpdateProgress(null);
    }
  }, [desktopUpdate?.available]);

  const handleWriteProbe = useCallback(async () => {
    setLoadError('');
    try {
      const result = await writeDesktopProbe();
      setDesktopProbe(result);
      setStatusMessage(result?.ok ? `探针已写入 ${result.probeFile}` : '探针写入失败');
    } catch (error) {
      console.error('[desktop-home] probe failed', error);
      setLoadError(error instanceof Error ? error.message : '探针写入失败');
    }
  }, []);

  return (
    <div
      className="relative flex min-h-[100dvh] overflow-hidden px-4 py-4 sm:px-6 sm:py-6"
      style={{ background: 'radial-gradient(circle at top, rgba(var(--tj-panel-bg-start),0.42), rgba(var(--tj-bg-primary),1) 58%)' }}
    >
      {stars.map((star, index) => (
        <span
          key={`desktop-star-${index}`}
          className="absolute rounded-full"
          style={{
            left: `${star.x}%`,
            top: `${star.y}%`,
            width: `${star.size}px`,
            height: `${star.size}px`,
            opacity: star.opacity,
            background: 'rgba(var(--tj-accent-primary),0.95)',
            boxShadow: star.size > 1.8 ? '0 0 12px rgba(var(--tj-accent-primary),0.3)' : 'none',
          }}
        />
      ))}

      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at 50% 18%, rgba(var(--tj-accent-primary),0.06), transparent 34%), radial-gradient(ellipse at 22% 78%, rgba(var(--tj-tech-cyan),0.05), transparent 28%)',
        }}
      />

      <div className="relative z-10 grid w-full min-w-0 gap-4 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside
          className="hidden flex-col gap-3 xl:flex"
          style={{
            background: 'rgba(var(--tj-panel-bg-end),0.72)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12), 0 18px 38px rgba(0,0,0,0.18)',
            clipPath: cardClip,
          }}
        >
          <div className="px-4 pt-4">
            <div className="text-[11px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.8)' }}>工具箱</div>
            <div className="mt-2 text-[22px] font-serif tracking-[0.16em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>本地入口</div>
            <p className="mt-2 text-[12px] leading-6" style={{ color: 'rgba(var(--tj-text-primary),0.62)' }}>
              更新、目录、探针和迁移都放在这里，不占主视野。
            </p>
          </div>
          <div className="px-4 pb-4 space-y-2">
            <ToolButton label="检查更新" onClick={() => void handleCheckUpdate()} active={checkingUpdate} tone="accent" />
            <ToolButton label="写入探针" onClick={() => void handleWriteProbe()} active={false} tone="secondary" />
            <ToolButton label="存档目录" onClick={() => void handleOpenDir('saves')} active={false} tone="secondary" />
            <ToolButton label="备份目录" onClick={() => void handleOpenDir('backups')} active={false} tone="secondary" />
            <ToolButton label="设置" onClick={() => onOpenSettings('api')} active={false} tone="secondary" />
            <ToolButton label="存储管理" onClick={onOpenStorageManager} active={false} tone="secondary" />
            <ToolButton label="世界书" onClick={onOpenWorldbookManager} active={false} tone="secondary" />
            <ToolButton label="智库" onClick={onOpenZhikuManager} active={false} tone="secondary" />
            <ToolButton label="云存档" onClick={onOpenCloudSave} active={false} tone="secondary" />
            <ToolButton label="更新公告" onClick={onOpenReleaseAnnouncements} active={false} tone="secondary" />
          </div>
        </aside>

        <main className="flex min-w-0 flex-col gap-4">
          <header
            className="grid gap-4 px-4 py-4 lg:grid-cols-[1.15fr_0.85fr]"
            style={{
              background: 'rgba(var(--tj-panel-bg-end),0.74)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14), 0 18px 42px rgba(0,0,0,0.26)',
              clipPath: cardClip,
            }}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.84)' }}>
                <span className="px-2 py-1" style={{ background: 'rgba(var(--tj-accent-primary),0.08)', clipPath: smallClip }}>DESKTOP EDITION</span>
                <span>?</span>
                <span>{appVersion}</span>
                <span>?</span>
                <span>{desktopInfo?.identifier || 'com.kaituoyishi.desktop'}</span>
              </div>
              <h1 className="mt-3 font-serif text-[54px] font-bold leading-none tracking-[0.16em] sm:text-[60px] lg:text-[66px]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                开拓轶事
              </h1>
              <p className="mt-3 max-w-[58ch] text-sm leading-7" style={{ color: 'rgba(var(--tj-text-primary),0.78)' }}>
                真正的桌面分支。继续游玩、检查更新、本地目录维护和离线数据主权，都在这一版里。
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void onContinue()}
                  disabled={!hasSave}
                  className="kaituo-btn kaituo-btn-primary px-6 py-3.5 text-base disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="relative">{continueLabel}</span>
                </button>
                <button type="button" onClick={onLoadSave} className="kaituo-btn kaituo-btn-secondary px-6 py-3.5 text-base">
                  <span className="relative">读取光锥</span>
                </button>
                <button type="button" onClick={onNewGame} className="kaituo-btn kaituo-btn-secondary px-6 py-3.5 text-base">
                  <span className="relative">踏上旅途</span>
                </button>
              </div>
            </div>

            <div className="grid gap-2 text-[12px]" style={{ color: 'rgba(var(--tj-text-primary),0.82)' }}>
              <DesktopLine label="更新状态" value={updateText} />
              <DesktopLine label="存档数量" value={`${saveCount} 个`} />
              <DesktopLine label="最近存档" value={latestSave ? `${latestSave.travelerName || '未命名旅人'} #${latestSave.id}` : '暂无可用存档'} />
              <DesktopLine label="存档目录" value={desktopInfo?.saveDir || '读取中'} />
              <DesktopLine label="备份目录" value={desktopInfo?.backupDir || '读取中'} />
              <DesktopLine label="状态消息" value={loadError || statusMessage || releaseNotes} />
            </div>
          </header>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <DesktopPanel title="本地档案" subtitle="存档、备份、资源和日志都在本地。">
              <div className="grid gap-2 sm:grid-cols-2">
                <StatTile label="存档" value={`${saveCount}`} detail={latestSave ? `最新 ${latestSave.currentDate || latestSave.timestamp}` : '暂无'} />
                <StatTile label="备份" value={desktopInfo ? '可管理' : '读取中'} detail="本地备份与迁移前完整备份" />
                <StatTile label="资源" value={desktopInfo?.assetDir ? '可打开' : '读取中'} detail="图片、壁纸与生成资源" />
                <StatTile label="日志" value={desktopInfo?.logDir ? '可导出' : '读取中'} detail="诊断报告与错误记录" />
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <SecondaryButton label="打开存档目录" onClick={() => void handleOpenDir('saves')} />
                <SecondaryButton label="打开备份目录" onClick={() => void handleOpenDir('backups')} />
                <SecondaryButton label="存储管理" onClick={onOpenStorageManager} />
                <SecondaryButton label="写入探针" onClick={() => void handleWriteProbe()} />
              </div>
              <div className="mt-4 rounded-sm px-3 py-3 text-sm" style={{ background: 'rgba(var(--tj-panel-bg-start),0.78)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)' }}>
                <SectionLabel text="最近存档" />
                {latestSave ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="font-serif text-[15px] tracking-[0.16em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{latestSave.travelerName || '未命名旅人'}</div>
                    <DesktopLine label="回合" value={`第 ${latestSave.turnCount} 回合`} />
                    <DesktopLine label="地点" value={latestSave.currentLocation || latestSave.worldPeriodName || '未知坐标'} />
                    <DesktopLine label="时间" value={new Date(latestSave.timestamp).toLocaleString('zh-CN')} />
                    <DesktopLine label="摘要" value={latestSave.lastSummary || '暂无摘要'} />
                  </div>
                ) : (
                  <div className="mt-2" style={{ color: 'rgba(var(--tj-text-primary),0.62)' }}>当前没有可继续的本地存档。</div>
                )}
              </div>
            </DesktopPanel>

            <DesktopPanel title="桌面工具箱" subtitle="左侧是你要的展开工具箱，这里是桌面专属能力。">
              <div className="grid gap-2 sm:grid-cols-2">
                <SecondaryButton label="检查更新" onClick={() => void handleCheckUpdate()} />
                <SecondaryButton label="下载并安装" onClick={() => void handleInstallUpdate()} />
                <SecondaryButton label="云存档" onClick={onOpenCloudSave} />
                <SecondaryButton label="更新公告" onClick={onOpenReleaseAnnouncements} />
                <SecondaryButton label="Discord 帖" onClick={onDiscordPost} />
                <SecondaryButton label="神秘聊天" onClick={onMysteryChat} />
              </div>
              <div className="mt-4 space-y-2 rounded-sm px-3 py-3 text-sm" style={{ background: 'rgba(var(--tj-panel-bg-start),0.76)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)' }}>
                <SectionLabel text="版本信息" />
                <DesktopLine label="当前版本" value={desktopReleaseInfo?.title || `开拓轶事 Desktop Edition ${appVersion}`} />
                <DesktopLine label="更新源" value={desktopReleaseInfo?.updateEndpoint || '读取中'} />
                <DesktopLine label="发布说明" value={releaseNotes} />
                {updateProgress && (
                  <>
                    <DesktopLine label="进度" value={updateProgress.phase} />
                    <DesktopLine label="已下载" value={`${formatSize(updateProgress.downloadedBytes)}${updateProgress.contentLength ? ` / ${formatSize(updateProgress.contentLength)}` : ''}`} />
                  </>
                )}
              </div>
              <div className="mt-4 rounded-sm px-3 py-3 text-sm" style={{ background: 'rgba(var(--tj-panel-bg-start),0.76)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)' }}>
                <SectionLabel text="启动提示" />
                <div className="mt-2 text-[12px] leading-7" style={{ color: 'rgba(var(--tj-text-primary),0.68)' }}>{continueHint}</div>
                {statusMessage && <div className="mt-2 text-[12px] leading-7" style={{ color: 'rgba(var(--tj-tech-cyan),0.84)' }}>{statusMessage}</div>}
                {loadError && <div className="mt-2 text-[12px] leading-7" style={{ color: 'rgba(var(--tj-danger),0.9)' }}>{loadError}</div>}
              </div>
            </DesktopPanel>
          </section>
        </main>
      </div>
    </div>
  );
}

function DesktopPanel({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode; }) {
  return (
    <section className="flex min-h-0 flex-col gap-3 px-4 py-4" style={{ background: 'rgba(var(--tj-panel-bg-end),0.78)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12), 0 18px 38px rgba(0,0,0,0.18)', clipPath: cardClip }}>
      <div>
        <div className="font-serif text-[18px] tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{title}</div>
        <p className="mt-1 text-[12px] leading-6" style={{ color: 'rgba(var(--tj-text-primary),0.62)' }}>{subtitle}</p>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

function DesktopLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 text-[12px] sm:grid-cols-[72px_1fr]">
      <span style={{ color: 'rgba(var(--tj-accent-primary),0.78)' }}>{label}</span>
      <span className="min-w-0 break-all leading-6" style={{ color: 'rgba(var(--tj-text-primary),0.74)' }}>{value}</span>
    </div>
  );
}

function StatTile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="px-3 py-3" style={{ background: 'rgba(var(--tj-panel-bg-start),0.72)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)', clipPath: smallClip }}>
      <div className="text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),0.72)' }}>{label}</div>
      <div className="mt-1 font-serif text-[15px] tracking-[0.12em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>{value}</div>
      <div className="mt-1 text-[11px] leading-5" style={{ color: 'rgba(var(--tj-text-primary),0.56)' }}>{detail}</div>
    </div>
  );
}

function ToolButton({ label, onClick, active, tone }: { label: string; onClick: () => void; active: boolean; tone: 'accent' | 'secondary'; }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-2 text-left text-[12px] tracking-[0.16em] transition-all hover:opacity-90"
      style={{
        color: tone === 'accent' ? 'rgba(var(--tj-surface-bg-start),1)' : 'rgba(var(--tj-text-primary),0.9)',
        background: active
          ? 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgba(var(--tj-tech-cyan),1))'
          : tone === 'accent'
            ? 'rgba(var(--tj-tech-cyan),0.09)'
            : 'rgba(var(--tj-panel-bg-end),0.82)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.5), 0 0 18px rgba(var(--tj-accent-primary),0.14)'
          : tone === 'accent'
            ? 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.26)'
            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

function SecondaryButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90"
      style={{
        color: 'rgba(var(--tj-text-primary),0.9)',
        background: 'rgba(var(--tj-panel-bg-end),0.82)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

function SectionLabel({ text }: { text: string }) {
  return <div className="text-[11px] tracking-[0.2em]" style={{ color: 'rgba(var(--tj-accent-primary),0.74)' }}>{text}</div>;
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
