import { useEffect, useMemo, useState } from 'react';
import {
  backupDesktopStateBeforeOneTimeMigration,
  backupCurrentSavesToDesktop,
  cleanupUnreferencedDesktopAssets,
  deleteSave,
  exportSavePackage,
  exportSaveTreePackage,
  getSaveList,
  importSaveFileAsMany,
  loadSave,
  loadSaveTree,
  repairSaveDatabase,
  rebuildSaveSummariesBatch,
  previewDesktopStateBeforeOneTimeMigration,
  restoreSavesFromDesktopBackup,
  restoreSavesFromDesktopMirror,
  saveGame,
  summarizeDesktopAssets,
  type SaveListItemSummary,
} from '@/services/dbService';
import {
  checkForDesktopUpdate,
  downloadAndInstallDesktopUpdate,
  getDesktopAppInfo,
  openDesktopDataDir,
  pickDesktopFolder,
  setDesktopStorageRoots,
  writeDesktopProbe,
  type DesktopAppInfo,
  type DesktopProbeResult,
  type DesktopUpdateProgress,
  type DesktopUpdateStatus,
} from '@/services/desktop/desktopBridge';
import {
  deleteDesktopDiagnosticReport,
  listDesktopDiagnosticReports,
  loadDesktopDiagnosticReport,
  writeDesktopDiagnosticReport,
  type DesktopDiagnosticReport,
  type DesktopDiagnosticReportResult,
  type DesktopDiagnosticReportSummary,
} from '@/services/desktop/desktopDiagnostics';
import {
  buildDesktopReleaseInfo,
  type DesktopReleaseInfo,
} from '@/services/desktop/desktopReleaseInfo';
import { inspectDesktopAssetMirrorHealth, listDesktopAssetMirror, repairDesktopAssetMirrorIndex } from '@/services/desktop/desktopAssetMirror';
import type { DesktopAssetMaintenanceSummary, DesktopAssetMirrorHealth } from '@/services/desktop/desktopAssetMirror';
import {
  deleteDesktopSaveBackup,
  loadDesktopSaveBackup,
  listDesktopSaveBackups,
  type DesktopSaveBackupRecord,
  type DesktopSaveBackupSummary,
} from '@/services/desktop/desktopSaveBackup';
import {
  listDesktopMigrationBackups,
  type DesktopMigrationBackupPreview,
  type DesktopMigrationBackupSummary,
} from '@/services/desktop/desktopMigrationBackup';
import { inspectDesktopSaveDeltaMirrorHealth, repairDesktopSaveDeltaMirrorIndex } from '@/services/desktop/desktopSaveDeltaMirror';
import type { DesktopSaveDeltaMirrorHealth } from '@/services/desktop/desktopSaveDeltaMirror';
import { inspectDesktopSaveMirrorHealth, listDesktopSaveMirror, repairDesktopSaveMirrorIndex, repairUnresolvedDesktopSaveTransactions } from '@/services/desktop/desktopSaveMirror';
import type { DesktopSaveMirrorHealth } from '@/services/desktop/desktopSaveMirror';
import {
  listDesktopSettingsMirrorKeys,
  listDesktopSpecialSettingMirrors,
} from '@/services/desktop/desktopSettingsMirror';
import { buildSaveTreeGroups, type SaveTreeDisplayGroup } from '@/utils/saveTreeView';
import { getRuntimePlatform, type RuntimePlatform } from '@/utils/platform/desktopRuntime';

interface Props {
  onSave: () => Promise<number>;
  onContinue: () => Promise<boolean>;
  onLoadSave: (id: number) => Promise<boolean>;
}

type Filter = 'all' | 'manual' | 'auto' | 'protected';

const cardClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function StorageManagerTab({ onSave, onContinue, onLoadSave }: Props) {
  const [saves, setSaves] = useState<SaveListItemSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<Filter>('manual');
  const [loadError, setLoadError] = useState('');
  const [rebuildingSummaries, setRebuildingSummaries] = useState(false);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [desktopInfo, setDesktopInfo] = useState<DesktopAppInfo | null>(null);
  const [desktopReleaseInfo, setDesktopReleaseInfo] = useState<DesktopReleaseInfo | null>(null);
  const [desktopProbe, setDesktopProbe] = useState<DesktopProbeResult | null>(null);
  const [desktopError, setDesktopError] = useState('');
  const [checkingDesktop, setCheckingDesktop] = useState(false);
  const [desktopUpdate, setDesktopUpdate] = useState<DesktopUpdateStatus | null>(null);
  const [desktopMirrorCount, setDesktopMirrorCount] = useState(0);
  const [desktopConfigCount, setDesktopConfigCount] = useState(0);
  const [desktopAssetCount, setDesktopAssetCount] = useState(0);
  const [desktopAssetSummary, setDesktopAssetSummary] = useState<DesktopAssetMaintenanceSummary | null>(null);
  const [saveRootEdit, setSaveRootEdit] = useState<string | null>(null);
  const [backupRootEdit, setBackupRootEdit] = useState<string | null>(null);
  const [desktopSaveMirrorHealth, setDesktopSaveMirrorHealth] = useState<DesktopSaveMirrorHealth | null>(null);
  const [desktopSaveDeltaMirrorHealth, setDesktopSaveDeltaMirrorHealth] = useState<DesktopSaveDeltaMirrorHealth | null>(null);
  const [desktopAssetMirrorHealth, setDesktopAssetMirrorHealth] = useState<DesktopAssetMirrorHealth | null>(null);
  const [desktopBackupCount, setDesktopBackupCount] = useState(0);
  const [latestDesktopBackup, setLatestDesktopBackup] = useState<DesktopSaveBackupSummary | null>(null);
  const [desktopBackups, setDesktopBackups] = useState<DesktopSaveBackupSummary[]>([]);
  const [selectedDesktopBackupPath, setSelectedDesktopBackupPath] = useState<string | null>(null);
  const [deletingDesktopBackupPath, setDeletingDesktopBackupPath] = useState<string | null>(null);
  const [exportingDesktopBackupPath, setExportingDesktopBackupPath] = useState<string | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [restoringDesktopMirror, setRestoringDesktopMirror] = useState(false);
  const [restoringDesktopBackup, setRestoringDesktopBackup] = useState(false);
  const [cleaningDesktopAssets, setCleaningDesktopAssets] = useState(false);
  const [repairingDesktopIndexes, setRepairingDesktopIndexes] = useState(false);
  const [desktopIndexRepairSummary, setDesktopIndexRepairSummary] = useState('');
  const [backingUpDesktop, setBackingUpDesktop] = useState(false);
  const [backingUpDesktopMigration, setBackingUpDesktopMigration] = useState(false);
  const [latestDesktopMigrationBackup, setLatestDesktopMigrationBackup] = useState<DesktopMigrationBackupSummary | null>(null);
  const [desktopMigrationBackupPreview, setDesktopMigrationBackupPreview] = useState<DesktopMigrationBackupPreview | null>(null);
  const [desktopMigrationBackupCount, setDesktopMigrationBackupCount] = useState(0);
  const [unreadableDesktopMigrationBackupCount, setUnreadableDesktopMigrationBackupCount] = useState(0);
  const [exportingDiagnostic, setExportingDiagnostic] = useState(false);
  const [latestDiagnosticReport, setLatestDiagnosticReport] = useState<DesktopDiagnosticReportResult | DesktopDiagnosticReportSummary | null>(null);
  const [desktopDiagnosticReports, setDesktopDiagnosticReports] = useState<DesktopDiagnosticReportSummary[]>([]);
  const [exportingDiagnosticReportPath, setExportingDiagnosticReportPath] = useState<string | null>(null);
  const [deletingDiagnosticReportPath, setDeletingDiagnosticReportPath] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<DesktopUpdateProgress | null>(null);
  const [updateError, setUpdateError] = useState('');

  const refresh = async () => {
    setLoadError('');
    try {
      const list = await getSaveList();
      setSaves(list);
    } catch (err) {
      console.error('[storage-manager] save list failed', err);
      setLoadError(err instanceof Error ? err.message : '存档列表读取失败');
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadDesktopInfo = async () => {
      setDesktopError('');
      try {
        const info = await getDesktopAppInfo();
        if (!cancelled) {
          setDesktopInfo(info);
          setSaveRootEdit(info?.saveDir ?? null);
          setBackupRootEdit(info?.backupDir ?? null);
        }
        if (!cancelled) setDesktopReleaseInfo(buildDesktopReleaseInfo(info, null));
        const mirror = await listDesktopSaveMirror();
        if (!cancelled) setDesktopMirrorCount(mirror.length);
        const configKeys = await listDesktopSettingsMirrorKeys();
        if (!cancelled) setDesktopConfigCount(configKeys.length);
        const assetMirror = await listDesktopAssetMirror();
        if (!cancelled) setDesktopAssetCount(assetMirror.length);
        const assetSummary = await summarizeDesktopAssets();
        if (!cancelled) setDesktopAssetSummary(assetSummary);
        const saveMirrorHealth = await inspectDesktopSaveMirrorHealth();
        if (!cancelled) setDesktopSaveMirrorHealth(saveMirrorHealth);
        const saveDeltaMirrorHealth = await inspectDesktopSaveDeltaMirrorHealth();
        if (!cancelled) setDesktopSaveDeltaMirrorHealth(saveDeltaMirrorHealth);
        const assetMirrorHealth = await inspectDesktopAssetMirrorHealth();
        if (!cancelled) setDesktopAssetMirrorHealth(assetMirrorHealth);
        const backups = await listDesktopSaveBackups();
        const migrationBackups = await listDesktopMigrationBackups();
        const migrationPreview = await previewDesktopStateBeforeOneTimeMigration();
        const reports = await listDesktopDiagnosticReports();
        if (!cancelled) {
          setDesktopBackupCount(backups.length);
          setLatestDesktopBackup(findLatestRestorableDesktopBackup(backups));
          setDesktopBackups(backups);
          setDesktopMigrationBackupCount(migrationBackups.length);
          setUnreadableDesktopMigrationBackupCount(countUnreadableDesktopMigrationBackups(migrationBackups));
          setLatestDesktopMigrationBackup(findLatestVerifiedDesktopMigrationBackup(migrationBackups));
          setDesktopMigrationBackupPreview(migrationPreview);
          setDesktopDiagnosticReports(reports);
          setLatestDiagnosticReport(reports[0] ?? null);
        }
      } catch (err) {
        console.error('[storage-manager] desktop info failed', err);
        if (!cancelled) setDesktopError(err instanceof Error ? err.message : '桌面端信息读取失败');
      }
    };
    void loadDesktopInfo();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const rebuildLoop = async () => {
      setRebuildingSummaries(true);
      try {
        for (let guard = 0; guard < 200 && !cancelled; guard += 1) {
          const added = await rebuildSaveSummariesBatch(24);
          if (cancelled || added <= 0) break;
          const list = await getSaveList();
          if (!cancelled) setSaves(list);
          await new Promise((resolve) => globalThis.setTimeout(resolve, 80));
        }
      } catch (err) {
        console.warn('[storage-manager] background summary recovery failed', err);
      } finally {
        if (!cancelled) setRebuildingSummaries(false);
      }
    };
    void rebuildLoop();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRepairList = async () => {
    setLoading(true);
    setLoadError('');
    try {
      await repairSaveDatabase();
      await refresh();
    } catch (err) {
      console.error('[storage-manager] repair failed', err);
      setLoadError(err instanceof Error ? err.message : '存档摘要修复失败');
    } finally {
      setLoading(false);
    }
  };

  const grouped = useMemo(() => {
    const manual = saves.filter((s) => s.type === 'manual');
    const auto = saves.filter((s) => s.type === 'auto');
    const protectedItems = saves.filter((s) => s.type === 'backup' || s.type === 'imported');
    return { manual, auto, protectedItems };
  }, [saves]);
  const allVisibleSaves = useMemo(() => saves.filter((s) => s.type !== 'auto'), [saves]);

  const allTreeGroups = useMemo(() => buildSaveTreeGroups(saves), [saves]);
  const visibleTreeGroups = useMemo(
    () => allTreeGroups
      .map((group) => buildVisibleSaveTreeGroup(group, filter))
      .filter((group): group is SaveTreeDisplayGroup => Boolean(group)),
    [allTreeGroups, filter],
  );
  const selectedTree =
    visibleTreeGroups.find((group) => group.rootId === selectedRootId) ??
    visibleTreeGroups[0] ??
    null;
  const selectedDesktopBackup = useMemo(
    () => desktopBackups.find((backup) => backup.path === selectedDesktopBackupPath) ?? desktopBackups[0] ?? null,
    [desktopBackups, selectedDesktopBackupPath],
  );

  useEffect(() => {
    if (visibleTreeGroups.length === 0) {
      if (selectedRootId !== null) setSelectedRootId(null);
      return;
    }
    if (!selectedRootId || !visibleTreeGroups.some((group) => group.rootId === selectedRootId)) {
      setSelectedRootId(visibleTreeGroups[0].rootId);
    }
  }, [selectedRootId, visibleTreeGroups]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      await refresh();
      await refreshDesktopMirrorCount();
      setFilter('manual');
    } finally {
      setSaving(false);
    }
  };

  const handleExportCurrent = async () => {
    setSaving(true);
    try {
      const id = await onSave();
      const save = await loadSave(id);
      if (save) await exportSavePackage(save);
      await refresh();
      await refreshDesktopMirrorCount();
      setFilter('manual');
    } finally {
      setSaving(false);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    try {
      const ok = await onContinue();
      if (!ok) alert('没有可用的存档');
    } catch (err) {
      console.error('[storage-manager] continue failed', err);
      alert(`读取失败：${err instanceof Error ? err.message : '存档读取或恢复过程异常'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = async (id: number) => {
    setLoadingId(id);
    try {
      const ok = await onLoadSave(id);
      if (!ok) alert('读取失败：没有读取到可用存档内容');
    } catch (err) {
      console.error('[storage-manager] load failed', err);
      alert(`读取失败：${err instanceof Error ? err.message : '存档读取或恢复过程异常'}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定删除这个存档？此操作不可恢复。')) return;
    await deleteSave(id);
    await refresh();
    await refreshDesktopMirrorCount();
  };

  const handleExport = async (id: number) => {
    const save = await loadSave(id);
    if (save) await exportSavePackage(save);
  };

  const handleExportTree = async (rootId: string) => {
    const treeSaves = await loadSaveTree(rootId);
    if (treeSaves.length) await exportSaveTreePackage(treeSaves);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ktysave,.zip,.json,application/zip,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setImporting(true);
      try {
        const imported = await importSaveFileAsMany(file);
        const now = Date.now();
        for (const [index, data] of imported.entries()) {
          data.id = 0;
          data.type = 'imported';
          data.timestamp = now + index;
          await saveGame(data);
        }
        await refresh();
        await refreshDesktopMirrorCount();
        setFilter('protected');
      } catch (err) {
        alert(`导入失败：${err instanceof Error ? err.message : '存档文件格式无效'}`);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const handleDesktopProbe = async () => {
    setCheckingDesktop(true);
    setDesktopError('');
    try {
      const result = await writeDesktopProbe();
      setDesktopProbe(result);
      const info = await getDesktopAppInfo();
      setDesktopInfo(info);
      setDesktopReleaseInfo(buildDesktopReleaseInfo(info, desktopUpdate));
      await refreshDesktopMirrorCount();
    } catch (err) {
      console.error('[storage-manager] desktop probe failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面端探针写入失败');
    } finally {
      setCheckingDesktop(false);
    }
  };

  const handleOpenDesktopSaveDir = async () => {
    setDesktopError('');
    try {
      await openDesktopDataDir('saves');
    } catch (err) {
      console.error('[storage-manager] open desktop save dir failed', err);
      setDesktopError(err instanceof Error ? err.message : '打开桌面存档目录失败');
    }
  };

  const handleOpenDesktopConfigDir = async () => {
    setDesktopError('');
    try {
      await openDesktopDataDir('config');
    } catch (err) {
      console.error('[storage-manager] open desktop config dir failed', err);
      setDesktopError(err instanceof Error ? err.message : '打开桌面配置目录失败');
    }
  };

  const handleOpenDesktopZhikuDir = async () => {
    setDesktopError('');
    try {
      await openDesktopDataDir('zhiku');
    } catch (err) {
      console.error('[storage-manager] open desktop zhiku dir failed', err);
      setDesktopError(err instanceof Error ? err.message : '打开桌面智库目录失败');
    }
  };

  const handleOpenDesktopWorldbookDir = async () => {
    setDesktopError('');
    try {
      await openDesktopDataDir('worldbooks');
    } catch (err) {
      console.error('[storage-manager] open desktop worldbook dir failed', err);
      setDesktopError(err instanceof Error ? err.message : '打开桌面世界书目录失败');
    }
  };

  const handleOpenDesktopAssetDir = async () => {
    setDesktopError('');
    try {
      await openDesktopDataDir('assets');
    } catch (err) {
      console.error('[storage-manager] open desktop asset dir failed', err);
      setDesktopError(err instanceof Error ? err.message : '打开桌面资源目录失败');
    }
  };

  const handleOpenDesktopBackupDir = async () => {
    setDesktopError('');
    try {
      await openDesktopDataDir('backups');
    } catch (err) {
      console.error('[storage-manager] open desktop backup dir failed', err);
      setDesktopError(err instanceof Error ? err.message : '打开桌面备份目录失败');
    }
  };

  const handleChooseSaveRoot = async () => {
    setDesktopError('');
    try {
      const folder = await pickDesktopFolder();
      if (folder) setSaveRootEdit(folder);
    } catch (err) {
      console.error('[storage-manager] choose save root failed', err);
      setDesktopError(err instanceof Error ? err.message : '选择存档目录失败');
    }
  };

  const handleChooseBackupRoot = async () => {
    setDesktopError('');
    try {
      const folder = await pickDesktopFolder();
      if (folder) setBackupRootEdit(folder);
    } catch (err) {
      console.error('[storage-manager] choose backup root failed', err);
      setDesktopError(err instanceof Error ? err.message : '选择备份目录失败');
    }
  };

  const handleResetSaveRoot = async () => {
    setSaveRootEdit(null);
  };

  const handleResetBackupRoot = async () => {
    setBackupRootEdit(null);
  };

  const handleApplyStorageRoots = async () => {
    setDesktopError('');
    try {
      const info = await setDesktopStorageRoots({
        saveDir: saveRootEdit?.trim() ? saveRootEdit.trim() : null,
        backupDir: backupRootEdit?.trim() ? backupRootEdit.trim() : null,
      });
      setDesktopInfo(info);
      setSaveRootEdit(info.saveDir ?? null);
      setBackupRootEdit(info.backupDir ?? null);
    } catch (err) {
      console.error('[storage-manager] apply storage roots failed', err);
      setDesktopError(err instanceof Error ? err.message : '保存存储路径失败');
    }
  };

  const handleOpenDesktopLogDir = async () => {
    setDesktopError('');
    try {
      await openDesktopDataDir('logs');
    } catch (err) {
      console.error('[storage-manager] open desktop log dir failed', err);
      setDesktopError(err instanceof Error ? err.message : '打开桌面日志目录失败');
    }
  };

  const handleCheckDesktopUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateError('');
    setUpdateProgress(null);
    try {
      const result = await checkForDesktopUpdate();
      setDesktopUpdate(result);
      setDesktopReleaseInfo(buildDesktopReleaseInfo(desktopInfo, result));
      if (result.error) setUpdateError(result.error);
    } catch (err) {
      console.error('[storage-manager] desktop update check failed', err);
      setUpdateError(err instanceof Error ? err.message : '桌面端更新检查失败');
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleInstallDesktopUpdate = async () => {
    setInstallingUpdate(true);
    setUpdateError('');
    try {
      await downloadAndInstallDesktopUpdate(setUpdateProgress);
    } catch (err) {
      console.error('[storage-manager] desktop update install failed', err);
      setUpdateError(err instanceof Error ? err.message : '桌面端更新安装失败');
    } finally {
      setInstallingUpdate(false);
    }
  };

  const refreshDesktopMirrorCount = async () => {
    const mirror = await listDesktopSaveMirror();
    setDesktopMirrorCount(mirror.length);
    const configKeys = await listDesktopSettingsMirrorKeys();
    setDesktopConfigCount(configKeys.length);
    const assetMirror = await listDesktopAssetMirror();
    setDesktopAssetCount(assetMirror.length);
    const assetSummary = await summarizeDesktopAssets();
    setDesktopAssetSummary(assetSummary);
    const saveMirrorHealth = await inspectDesktopSaveMirrorHealth();
    setDesktopSaveMirrorHealth(saveMirrorHealth);
    const saveDeltaMirrorHealth = await inspectDesktopSaveDeltaMirrorHealth();
    setDesktopSaveDeltaMirrorHealth(saveDeltaMirrorHealth);
    const assetMirrorHealth = await inspectDesktopAssetMirrorHealth();
    setDesktopAssetMirrorHealth(assetMirrorHealth);
    const backups = await listDesktopSaveBackups();
    setDesktopBackupCount(backups.length);
    setLatestDesktopBackup(findLatestRestorableDesktopBackup(backups));
    setDesktopBackups(backups);
    const migrationBackups = await listDesktopMigrationBackups();
    setDesktopMigrationBackupCount(migrationBackups.length);
    setUnreadableDesktopMigrationBackupCount(countUnreadableDesktopMigrationBackups(migrationBackups));
    setLatestDesktopMigrationBackup(findLatestVerifiedDesktopMigrationBackup(migrationBackups));
    setDesktopMigrationBackupPreview(await previewDesktopStateBeforeOneTimeMigration());
    const reports = await listDesktopDiagnosticReports();
    setDesktopDiagnosticReports(reports);
    setLatestDiagnosticReport(reports[0] ?? null);
  };

  const handleCleanupDesktopAssets = async () => {
    if (!confirm('确定清理桌面端无引用图片资源？只会删除当前存档库未引用的本地图片镜像。')) return;
    setCleaningDesktopAssets(true);
    setDesktopError('');
    try {
      const summary = await cleanupUnreferencedDesktopAssets();
      setDesktopAssetSummary(summary);
      await refreshDesktopMirrorCount();
    } catch (err) {
      console.error('[storage-manager] desktop asset cleanup failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面资源清理失败');
    } finally {
      setCleaningDesktopAssets(false);
    }
  };

  const handleRepairDesktopIndexes = async () => {
    setRepairingDesktopIndexes(true);
    setDesktopError('');
    setDesktopIndexRepairSummary('');
    try {
      await backupCurrentSavesToDesktop('before-repair');
      const repairedSaves = await repairDesktopSaveMirrorIndex();
      const repairedTransactions = await repairUnresolvedDesktopSaveTransactions();
      const repairedDeltas = await repairDesktopSaveDeltaMirrorIndex();
      const repairedAssets = await repairDesktopAssetMirrorIndex();
      setDesktopIndexRepairSummary(`已重建本地镜像索引（已先备份当前数据）：${repairedSaves.length} 个存档 / ${repairedDeltas.length} 个增量 / ${repairedAssets.length} 个资源 / 清理 ${repairedTransactions.removedTransactions} 个已完成事务 / 保留 ${repairedTransactions.retainedTransactions + repairedTransactions.unreadableTransactions} 个待排查事务`);
      await refreshDesktopMirrorCount();
    } catch (err) {
      console.error('[storage-manager] desktop index repair failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面镜像索引修复失败');
    } finally {
      setRepairingDesktopIndexes(false);
    }
  };

  const handleBackupDesktopSaves = async () => {
    setBackingUpDesktop(true);
    setDesktopError('');
    try {
      const backup = await backupCurrentSavesToDesktop('manual');
      if (backup) {
        setLatestDesktopBackup(backup);
        setSelectedDesktopBackupPath(backup.path);
      }
      await refreshDesktopMirrorCount();
    } catch (err) {
      console.error('[storage-manager] desktop save backup failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面本地备份失败');
    } finally {
      setBackingUpDesktop(false);
    }
  };

  const handleBackupDesktopMigration = async () => {
    if (!confirm('生成迁移前完整备份？此操作只写入备份文件，不会迁移、删除或覆盖当前数据。')) return;
    setBackingUpDesktopMigration(true);
    setDesktopError('');
    try {
      const backup = await backupDesktopStateBeforeOneTimeMigration();
      if (backup) {
        setLatestDesktopMigrationBackup(backup);
      }
      await refreshDesktopMirrorCount();
    } catch (err) {
      console.error('[storage-manager] desktop migration backup failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面迁移前完整备份失败');
    } finally {
      setBackingUpDesktopMigration(false);
    }
  };

  const handleWriteDesktopDiagnosticReport = async () => {
    setExportingDiagnostic(true);
    setDesktopError('');
    try {
      const info = desktopInfo ?? await getDesktopAppInfo();
      if (info) setDesktopInfo(info);
      const specialSettingMirrors = await listDesktopSpecialSettingMirrors();
      const saveMirrorHealth = await inspectDesktopSaveMirrorHealth();
      const saveDeltaMirrorHealth = await inspectDesktopSaveDeltaMirrorHealth();
      const assetMirrorHealth = await inspectDesktopAssetMirrorHealth();
      const report = await writeDesktopDiagnosticReport({
        appInfo: info,
        saveCount: saves.length,
        desktopMirrorCount,
        desktopConfigCount,
        specialSettingMirrors,
        desktopAssetCount,
        desktopBackupCount,
        unreadableDesktopBackupCount: countUnreadableDesktopBackups(desktopBackups),
        desktopMigrationBackupCount,
        unreadableDesktopMigrationBackupCount,
        desktopMigrationBackupPreview,
        saveMirrorHealth,
        saveDeltaMirrorHealth,
        assetMirrorHealth,
        assetSummary: desktopAssetSummary,
        latestBackup: latestDesktopBackup,
        latestMigrationBackup: latestDesktopMigrationBackup,
        updateStatus: desktopUpdate,
        releaseInfo: desktopReleaseInfo,
        lastError: desktopError || loadError || updateError || undefined,
      });
      setLatestDiagnosticReport(report);
      await refreshDesktopMirrorCount();
    } catch (err) {
      console.error('[storage-manager] desktop diagnostic export failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面诊断报告导出失败');
    } finally {
      setExportingDiagnostic(false);
    }
  };

  const handleRestoreDesktopMirror = async () => {
    if (!confirm('确定用桌面本地镜像恢复当前存档库？当前存档列表会被镜像内容替换。')) return;
    setRestoringDesktopMirror(true);
    setLoadError('');
    try {
      const restored = await restoreSavesFromDesktopMirror();
      await refresh();
      await refreshDesktopMirrorCount();
      setFilter('all');
      if (restored <= 0) alert('没有可恢复的桌面存档镜像');
    } catch (err) {
      console.error('[storage-manager] desktop mirror restore failed', err);
      setLoadError(err instanceof Error ? err.message : '桌面存档镜像恢复失败');
    } finally {
      setRestoringDesktopMirror(false);
    }
  };

  const handleRestoreDesktopBackup = async (backup: DesktopSaveBackupSummary | null) => {
    if (!backup) {
      alert('没有可恢复的桌面本地备份');
      return;
    }
    if (!isRestorableDesktopBackup(backup)) {
      alert('这份桌面本地备份不可恢复，请检查备份列表中的校验状态。');
      return;
    }
    if (!confirm(`确定恢复这份桌面本地备份？当前存档库会先自动备份，再替换为 ${backup.count} 个备份存档。`)) return;
    setRestoringDesktopBackup(true);
    setLoadError('');
    try {
      const restored = await restoreSavesFromDesktopBackup(backup.path);
      await refresh();
      await refreshDesktopMirrorCount();
      setFilter('all');
      if (restored <= 0) alert('这份桌面本地备份没有可恢复的存档');
    } catch (err) {
      console.error('[storage-manager] desktop backup restore failed', err);
      setLoadError(err instanceof Error ? err.message : '桌面本地备份恢复失败');
    } finally {
      setRestoringDesktopBackup(false);
    }
  };

  const handleDeleteDesktopBackup = async (backup: DesktopSaveBackupSummary) => {
    if (!confirm(`确定删除这份桌面本地备份？${new Date(backup.createdAt).toLocaleString('zh-CN')} / ${backup.count} 个存档。`)) return;
    setDeletingDesktopBackupPath(backup.path);
    setDesktopError('');
    try {
      await deleteDesktopSaveBackup(backup.path);
      if (selectedDesktopBackupPath === backup.path) {
        setSelectedDesktopBackupPath(null);
      }
      await refreshDesktopMirrorCount();
    } catch (err) {
      console.error('[storage-manager] desktop backup delete failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面本地备份删除失败');
    } finally {
      setDeletingDesktopBackupPath(null);
    }
  };

  const handleExportDesktopBackup = async (backup: DesktopSaveBackupSummary) => {
    setExportingDesktopBackupPath(backup.path);
    setDesktopError('');
    try {
      const record = await loadDesktopSaveBackup(backup.path);
      if (!record) {
        alert('这份桌面本地备份无法读取或格式不正确');
        return;
      }
      downloadDesktopBackupRecord(record, backup.fileName);
    } catch (err) {
      console.error('[storage-manager] desktop backup export failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面本地备份导出失败');
    } finally {
      setExportingDesktopBackupPath(null);
    }
  };

  const handleExportDesktopDiagnosticReport = async (report: DesktopDiagnosticReportSummary) => {
    setExportingDiagnosticReportPath(report.path);
    setDesktopError('');
    try {
      const payload = await loadDesktopDiagnosticReport(report.path);
      if (!payload) {
        alert('这份桌面诊断报告无法读取或格式不正确');
        return;
      }
      downloadDesktopDiagnosticReport(payload, report.fileName);
    } catch (err) {
      console.error('[storage-manager] desktop diagnostic report export failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面诊断报告导出失败');
    } finally {
      setExportingDiagnosticReportPath(null);
    }
  };

  const handleDeleteDesktopDiagnosticReport = async (report: DesktopDiagnosticReportSummary) => {
    if (!confirm(`确定删除这份桌面诊断报告？${new Date(report.createdAt).toLocaleString('zh-CN')}。`)) return;
    setDeletingDiagnosticReportPath(report.path);
    setDesktopError('');
    try {
      await deleteDesktopDiagnosticReport(report.path);
      await refreshDesktopMirrorCount();
    } catch (err) {
      console.error('[storage-manager] desktop diagnostic report delete failed', err);
      setDesktopError(err instanceof Error ? err.message : '桌面诊断报告删除失败');
    } finally {
      setDeletingDiagnosticReportPath(null);
    }
  };

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden p-1"
      style={{
        background:
          'radial-gradient(circle at 12% 0%, rgba(91,153,255,0.14), transparent 30%), linear-gradient(90deg, rgba(142,215,255,0.035) 1px, transparent 1px), linear-gradient(180deg, rgba(142,215,255,0.028) 1px, transparent 1px)',
        backgroundSize: 'auto, 44px 44px, 44px 44px',
      }}
    >
      <div className="grid min-w-0 gap-3 lg:grid-cols-[1fr_auto]">
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap">
          <ActionButton label={saving ? '保存中' : '手动存档'} tone="primary" disabled={saving} onClick={handleSave} />
          <ActionButton label={loading ? '读取中' : '载入最新'} disabled={loading} onClick={handleContinue} />
          <ActionButton label={importing ? '导入中' : '导入存档包'} disabled={importing} onClick={handleImport} />
          <ActionButton label="导出当前" disabled={saving} onClick={handleExportCurrent} />
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <FilterButton label="手动" count={grouped.manual.length} active={filter === 'manual'} onClick={() => setFilter('manual')} />
          <FilterButton label="自动" count={grouped.auto.length} active={filter === 'auto'} onClick={() => setFilter('auto')} />
          <FilterButton label="全部" count={allVisibleSaves.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterButton label="保护存档" count={grouped.protectedItems.length} active={filter === 'protected'} onClick={() => setFilter('protected')} />
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-3 px-3 py-3 text-center font-serif text-[12px] tracking-[0.18em] lg:grid-cols-4"
        style={{
          color: 'rgba(238,226,198,0.82)',
          background: 'rgba(142,215,255,0.055)',
          boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.13)',
          clipPath: cardClip,
        }}
      >
        <Metric label="手动" value={grouped.manual.length} />
        <Metric label="自动" value={grouped.auto.length} />
        <Metric label="保护存档" value={grouped.protectedItems.length} />
        <Metric label="总计" value={saves.length} />
      </div>

      <div
        className="px-3 py-2 font-serif text-[12px] leading-relaxed tracking-wider"
        style={{
          color: 'rgba(238,226,198,0.68)',
          background: 'rgba(18,28,43,0.42)',
          boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.12)',
          clipPath: cardClip,
        }}
      >
        导出存档包默认不包含 API Key / API 配置；导入存档包 / 旧 JSON 会放入保护存档分区。
        {rebuildingSummaries ? ' 正在恢复旧存档索引，存档数量可能继续增加。' : ''}
      </div>

      <DesktopStorageStatus
        platform={getRuntimePlatform()}
        info={desktopInfo}
        releaseInfo={desktopReleaseInfo}
        probe={desktopProbe}
        error={desktopError}
        checking={checkingDesktop}
        update={desktopUpdate}
        updateProgress={updateProgress}
        updateError={updateError}
        checkingUpdate={checkingUpdate}
        installingUpdate={installingUpdate}
        desktopMirrorCount={desktopMirrorCount}
        desktopConfigCount={desktopConfigCount}
        desktopAssetCount={desktopAssetCount}
        desktopAssetSummary={desktopAssetSummary}
        desktopSaveMirrorHealth={desktopSaveMirrorHealth}
        desktopSaveDeltaMirrorHealth={desktopSaveDeltaMirrorHealth}
        desktopAssetMirrorHealth={desktopAssetMirrorHealth}
        desktopBackupCount={desktopBackupCount}
        desktopMigrationBackupCount={desktopMigrationBackupCount}
        unreadableDesktopMigrationBackupCount={unreadableDesktopMigrationBackupCount}
        latestDesktopBackup={latestDesktopBackup}
        desktopMigrationBackupPreview={desktopMigrationBackupPreview}
        desktopBackups={desktopBackups}
        selectedDesktopBackup={selectedDesktopBackup}
        restoringDesktopMirror={restoringDesktopMirror}
        restoringDesktopBackup={restoringDesktopBackup}
        deletingDesktopBackupPath={deletingDesktopBackupPath}
        exportingDesktopBackupPath={exportingDesktopBackupPath}
        cleaningDesktopAssets={cleaningDesktopAssets}
        repairingDesktopIndexes={repairingDesktopIndexes}
        desktopIndexRepairSummary={desktopIndexRepairSummary}
        backingUpDesktop={backingUpDesktop}
        backingUpDesktopMigration={backingUpDesktopMigration}
        latestDesktopMigrationBackup={latestDesktopMigrationBackup}
        exportingDiagnostic={exportingDiagnostic}
        latestDiagnosticReport={latestDiagnosticReport}
        diagnosticReports={desktopDiagnosticReports}
        exportingDiagnosticReportPath={exportingDiagnosticReportPath}
        deletingDiagnosticReportPath={deletingDiagnosticReportPath}
        onProbe={handleDesktopProbe}
        onOpenSaveDir={handleOpenDesktopSaveDir}
        onOpenBackupDir={handleOpenDesktopBackupDir}
        saveRootEdit={saveRootEdit}
        backupRootEdit={backupRootEdit}
        onChooseSaveRoot={handleChooseSaveRoot}
        onChooseBackupRoot={handleChooseBackupRoot}
        onResetSaveRoot={handleResetSaveRoot}
        onResetBackupRoot={handleResetBackupRoot}
        onApplyStorageRoots={handleApplyStorageRoots}
        onOpenLogDir={handleOpenDesktopLogDir}
        onOpenConfigDir={handleOpenDesktopConfigDir}
        onOpenZhikuDir={handleOpenDesktopZhikuDir}
        onOpenWorldbookDir={handleOpenDesktopWorldbookDir}
        onOpenAssetDir={handleOpenDesktopAssetDir}
        onCleanupDesktopAssets={handleCleanupDesktopAssets}
        onRepairDesktopIndexes={handleRepairDesktopIndexes}
        onBackupDesktopSaves={handleBackupDesktopSaves}
        onBackupDesktopMigration={handleBackupDesktopMigration}
        onWriteDiagnosticReport={handleWriteDesktopDiagnosticReport}
        onExportDiagnosticReport={handleExportDesktopDiagnosticReport}
        onDeleteDiagnosticReport={handleDeleteDesktopDiagnosticReport}
        onRestoreDesktopBackup={handleRestoreDesktopBackup}
        onDeleteDesktopBackup={handleDeleteDesktopBackup}
        onExportDesktopBackup={handleExportDesktopBackup}
        onSelectDesktopBackup={(backup) => setSelectedDesktopBackupPath(backup.path)}
        onCheckUpdate={handleCheckDesktopUpdate}
        onInstallUpdate={handleInstallDesktopUpdate}
        onRestoreDesktopMirror={handleRestoreDesktopMirror}
      />

      <div className="kaituo-options-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-5 pr-1">
        {loadError ? (
          <div
            className="p-5 text-center font-serif"
            style={{
              color: 'rgba(var(--tj-text-secondary), 0.82)',
              background: 'rgba(92, 36, 36, 0.28)',
              boxShadow: 'inset 0 0 0 1px rgba(255, 150, 150, 0.25)',
              clipPath: cardClip,
            }}
          >
            <div className="text-sm tracking-[0.18em]" style={{ color: 'rgba(255, 205, 205, 0.92)' }}>
              存档列表读取失败
            </div>
            <div className="mt-2 text-xs leading-relaxed tracking-wider">{loadError}</div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <ActionButton label="重新读取" onClick={refresh} />
              <ActionButton label={loading ? '修复中' : '修复摘要'} tone="primary" disabled={loading} onClick={handleRepairList} />
            </div>
          </div>
        ) : visibleTreeGroups.length === 0 ? (
          <div
            className="p-6 text-center text-sm font-serif tracking-[0.2em]"
            style={{
              color: 'rgba(238,226,198,0.72)',
              background: 'rgba(18,28,43,0.46)',
              boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.15)',
              clipPath: cardClip,
            }}
          >
            暂无对应存档
          </div>
        ) : (
          <div className="grid min-h-0 min-w-0 gap-3 pb-3 lg:grid-cols-[260px_1fr]">
            <StorageTreeSelector
              groups={visibleTreeGroups}
              selectedRootId={selectedTree?.rootId ?? null}
              onSelect={setSelectedRootId}
            />
            {selectedTree && (
              <StorageSaveTreeGroup
                key={selectedTree.rootId}
                group={selectedTree}
                loadingId={loadingId}
                onLoad={handleLoad}
                onExport={handleExport}
                onExportTree={handleExportTree}
                onDelete={handleDelete}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StorageSaveTreeGroup({
  group,
  loadingId,
  onLoad,
  onExport,
  onExportTree,
  onDelete,
}: {
  group: SaveTreeDisplayGroup;
  loadingId: number | null;
  onLoad: (id: number) => void;
  onExport: (id: number) => void;
  onExportTree: (rootId: string) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <section
      className="min-w-0 p-2"
      style={{
        background: 'linear-gradient(135deg, rgba(18,28,43,0.52), rgba(8,12,20,0.56))',
        boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 font-serif">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            <span className="text-[11px] tracking-[0.18em]" style={{ color: '#8ed7ff' }}>
              存档树
            </span>
            <span className="truncate text-[14px] font-bold tracking-wider" style={{ color: '#eee2c6' }}>
              {group.latestSave.travelerName || group.rootSave.travelerName || '未命名旅人'}
            </span>
            <span className="text-[11px]" style={{ color: 'rgba(238,226,198,0.42)' }}>
              最新 #{group.latestSave.id}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tracking-wider" style={{ color: 'rgba(238,226,198,0.58)' }}>
            <span>{group.nodeCount} 个节点</span>
            <span>{group.branchCount} 个分支</span>
            <span>{formatSize(group.totalSizeBytes)}</span>
          </div>
        </div>
        <div className="text-[11px] tracking-[0.16em]" style={{ color: 'rgba(142,215,255,0.82)' }}>
          第 {group.latestSave.turnCount} 回合
        </div>
        <button
          type="button"
          disabled={loadingId !== null}
          onClick={() => onExportTree(group.rootId)}
          className="px-2.5 py-1 font-serif text-[11px] tracking-[0.14em] transition-all hover:opacity-90 disabled:opacity-50"
          style={{
            color: 'rgba(140, 210, 255, 0.92)',
            boxShadow: 'inset 0 0 0 1px rgba(140, 210, 255, 0.28)',
            clipPath: smallClip,
          }}
        >
          导出整树
        </button>
      </div>
      <div className="relative space-y-2 pl-5">
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-[7px] top-2 w-px"
          style={{ background: 'linear-gradient(#8ed7ff, rgba(142,215,255,0.08))' }}
        />
        {group.nodes.map((node, index) => {
          const indent = Math.min(index, 5) * 14;
          return (
            <div key={node.save.id} className="relative" style={{ paddingLeft: indent }}>
              {node.depth > 0 && (
                <span
                  aria-hidden="true"
                  className="absolute left-1 top-4 h-px"
                  style={{
                    width: Math.max(8, indent - 6),
                    background: 'rgba(142,215,255,0.32)',
                  }}
                />
              )}
              <SaveCard
                save={node.save}
                loadingId={loadingId}
                onLoad={onLoad}
                onExport={onExport}
                onDelete={onDelete}
                treeLabel={node.isRoot ? '根节点' : `分支 +${node.depth}`}
                isLatest={node.isLatest}
              />
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StorageTreeSelector({
  groups,
  selectedRootId,
  onSelect,
}: {
  groups: SaveTreeDisplayGroup[];
  selectedRootId: string | null;
  onSelect: (rootId: string) => void;
}) {
  return (
    <aside
      className="kaituo-options-scroll min-h-0 p-3 pb-5 font-serif lg:max-h-[calc(100vh-330px)] lg:overflow-y-auto"
      style={{
        background: 'rgba(0,0,0,0.18)',
        boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.12)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium tracking-[0.22em]" style={{ color: 'rgba(142,215,255,0.86)' }}>
          存档树列表
        </h3>
        <span className="text-[11px] tracking-[0.12em]" style={{ color: 'rgba(238,226,198,0.42)' }}>
          点击切换
        </span>
      </div>
      <div className="grid gap-2">
        {groups.map((group) => {
          const active = group.rootId === selectedRootId;
          const title = group.latestSave.travelerName || group.rootSave.travelerName || '未命名旅人';
          return (
            <button
              key={group.rootId}
              type="button"
              onClick={() => onSelect(group.rootId)}
              className="min-w-0 cursor-pointer px-3 py-2 text-left transition-all hover:opacity-90"
              style={{
                background: active
                  ? 'linear-gradient(90deg, rgba(142,215,255,0.18), rgba(91,153,255,0.06))'
                  : 'rgba(142,215,255,0.045)',
                boxShadow: active
                  ? 'inset 3px 0 0 #8ed7ff, inset 0 0 0 1px rgba(142,215,255,0.32)'
                  : 'inset 0 0 0 1px rgba(142,215,255,0.12)',
                clipPath: smallClip,
              }}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span
                  className="truncate text-[13px] font-semibold tracking-[0.12em]"
                  style={{ color: active ? '#eee2c6' : 'rgba(238,226,198,0.78)' }}
                >
                  {title}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color: active ? '#8ed7ff' : 'rgba(238,226,198,0.42)' }}>
                  #{group.latestSave.id}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] tracking-[0.1em]" style={{ color: 'rgba(238,226,198,0.54)' }}>
                <span>{group.nodeCount} 节点</span>
                <span>{group.branchCount} 分支</span>
                <span>第 {group.latestSave.turnCount} 回合</span>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function ActionButton({
  label,
  tone = 'quiet',
  disabled,
  onClick,
}: {
  label: string;
  tone?: 'primary' | 'quiet';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="w-full cursor-pointer px-4 py-2 text-sm font-serif tracking-[0.18em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      style={{
        color: tone === 'primary' ? '#07101a' : 'rgba(142,215,255,0.92)',
        background: tone === 'primary'
          ? 'linear-gradient(135deg, #8ed7ff, #5b99ff)'
          : 'rgba(142,215,255,0.07)',
        boxShadow: tone === 'primary'
          ? 'inset 0 0 0 1px rgba(236,249,255,0.55), 0 0 18px rgba(91,153,255,0.20)'
          : 'inset 0 0 0 1px rgba(142,215,255,0.24)',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

function FilterButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full cursor-pointer px-3 py-2 text-[12px] font-serif tracking-[0.16em] transition-all sm:w-auto"
      style={{
        color: active ? '#07101a' : 'rgba(238,226,198,0.70)',
        background: active
          ? 'linear-gradient(135deg, #8ed7ff, #5b99ff)'
          : 'rgba(142,215,255,0.05)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(236,249,255,0.55), 0 0 22px rgba(91,153,255,0.22)'
          : 'inset 0 0 0 1px rgba(142,215,255,0.15)',
        clipPath: smallClip,
      }}
    >
      {label} <span style={{ opacity: 0.72 }}>{count}</span>
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[11px]" style={{ color: 'rgba(238,226,198,0.52)' }}>{label}</div>
      <div className="mt-0.5 text-base font-bold" style={{ color: '#8ed7ff' }}>{value}</div>
    </div>
  );
}

function DesktopStorageStatus({
  platform,
  info,
  releaseInfo,
  probe,
  error,
  checking,
  update,
  updateProgress,
  updateError,
  checkingUpdate,
  installingUpdate,
  desktopMirrorCount,
  desktopConfigCount,
  desktopAssetCount,
  desktopAssetSummary,
  desktopSaveMirrorHealth,
  desktopSaveDeltaMirrorHealth,
  desktopAssetMirrorHealth,
  desktopBackupCount,
  desktopMigrationBackupCount,
  unreadableDesktopMigrationBackupCount,
  latestDesktopBackup,
  desktopMigrationBackupPreview,
  desktopBackups,
  selectedDesktopBackup,
  restoringDesktopMirror,
  restoringDesktopBackup,
  deletingDesktopBackupPath,
  exportingDesktopBackupPath,
  cleaningDesktopAssets,
  repairingDesktopIndexes,
  desktopIndexRepairSummary,
  backingUpDesktop,
  backingUpDesktopMigration,
  latestDesktopMigrationBackup,
  exportingDiagnostic,
  latestDiagnosticReport,
  diagnosticReports,
  exportingDiagnosticReportPath,
  deletingDiagnosticReportPath,
  onProbe,
  onOpenSaveDir,
  onOpenBackupDir,
  saveRootEdit,
  backupRootEdit,
  onChooseSaveRoot,
  onChooseBackupRoot,
  onResetSaveRoot,
  onResetBackupRoot,
  onApplyStorageRoots,
  onOpenLogDir,
  onOpenConfigDir,
  onOpenZhikuDir,
  onOpenWorldbookDir,
  onOpenAssetDir,
  onCleanupDesktopAssets,
  onRepairDesktopIndexes,
  onBackupDesktopSaves,
  onBackupDesktopMigration,
  onWriteDiagnosticReport,
  onExportDiagnosticReport,
  onDeleteDiagnosticReport,
  onRestoreDesktopBackup,
  onDeleteDesktopBackup,
  onExportDesktopBackup,
  onSelectDesktopBackup,
  onCheckUpdate,
  onInstallUpdate,
  onRestoreDesktopMirror,
}: {
  platform: RuntimePlatform;
  info: DesktopAppInfo | null;
  releaseInfo: DesktopReleaseInfo | null;
  probe: DesktopProbeResult | null;
  error: string;
  checking: boolean;
  update: DesktopUpdateStatus | null;
  updateProgress: DesktopUpdateProgress | null;
  updateError: string;
  checkingUpdate: boolean;
  installingUpdate: boolean;
  desktopMirrorCount: number;
  desktopConfigCount: number;
  desktopAssetCount: number;
  desktopAssetSummary: DesktopAssetMaintenanceSummary | null;
  desktopSaveMirrorHealth: DesktopSaveMirrorHealth | null;
  desktopSaveDeltaMirrorHealth: DesktopSaveDeltaMirrorHealth | null;
  desktopAssetMirrorHealth: DesktopAssetMirrorHealth | null;
  desktopBackupCount: number;
  desktopMigrationBackupCount: number;
  unreadableDesktopMigrationBackupCount: number;
  latestDesktopBackup: DesktopSaveBackupSummary | null;
  desktopMigrationBackupPreview: DesktopMigrationBackupPreview | null;
  desktopBackups: DesktopSaveBackupSummary[];
  selectedDesktopBackup: DesktopSaveBackupSummary | null;
  restoringDesktopMirror: boolean;
  restoringDesktopBackup: boolean;
  deletingDesktopBackupPath: string | null;
  exportingDesktopBackupPath: string | null;
  cleaningDesktopAssets: boolean;
  repairingDesktopIndexes: boolean;
  desktopIndexRepairSummary: string;
  backingUpDesktop: boolean;
  backingUpDesktopMigration: boolean;
  latestDesktopMigrationBackup: DesktopMigrationBackupSummary | null;
  exportingDiagnostic: boolean;
  latestDiagnosticReport: DesktopDiagnosticReportResult | DesktopDiagnosticReportSummary | null;
  diagnosticReports: DesktopDiagnosticReportSummary[];
  exportingDiagnosticReportPath: string | null;
  deletingDiagnosticReportPath: string | null;
  onProbe: () => void;
  onOpenSaveDir: () => void;
  onOpenBackupDir: () => void;
  saveRootEdit: string | null;
  backupRootEdit: string | null;
  onChooseSaveRoot: () => void;
  onChooseBackupRoot: () => void;
  onResetSaveRoot: () => void;
  onResetBackupRoot: () => void;
  onApplyStorageRoots: () => void;
  onOpenLogDir: () => void;
  onOpenConfigDir: () => void;
  onOpenZhikuDir: () => void;
  onOpenWorldbookDir: () => void;
  onOpenAssetDir: () => void;
  onCleanupDesktopAssets: () => void;
  onRepairDesktopIndexes: () => void;
  onBackupDesktopSaves: () => void;
  onBackupDesktopMigration: () => void;
  onWriteDiagnosticReport: () => void;
  onExportDiagnosticReport: (report: DesktopDiagnosticReportSummary) => void;
  onDeleteDiagnosticReport: (report: DesktopDiagnosticReportSummary) => void;
  onRestoreDesktopBackup: (backup: DesktopSaveBackupSummary | null) => void;
  onDeleteDesktopBackup: (backup: DesktopSaveBackupSummary) => void;
  onExportDesktopBackup: (backup: DesktopSaveBackupSummary) => void;
  onSelectDesktopBackup: (backup: DesktopSaveBackupSummary) => void;
  onCheckUpdate: () => void;
  onInstallUpdate: () => void;
  onRestoreDesktopMirror: () => void;
}) {
  const isDesktop = platform === 'desktop';
  const updateHint = buildUpdateHint(update, updateProgress, updateError);
  const currentVersion = releaseInfo?.version ?? info?.version ?? update?.currentVersion ?? '读取中';
  const latestVersion = releaseInfo?.latestVersion ?? update?.version ?? (update?.checked ? currentVersion : '待检查');
  const updateStateLabel = updateError
    ? '更新异常'
    : updateProgress
      ? '更新处理中'
      : update?.available
        ? '发现新版本'
        : update?.checked
          ? '已是最新'
          : '等待检查';
  return (
    <section
      className="grid min-w-0 gap-3 px-3 py-3 font-serif text-[12px] leading-relaxed tracking-wider lg:grid-cols-[1fr_auto]"
      style={{
        color: 'rgba(238,226,198,0.72)',
        background: isDesktop
          ? 'linear-gradient(135deg, rgba(142,215,255,0.09), rgba(245,217,122,0.045)), rgba(18,28,43,0.44)'
          : 'rgba(18,28,43,0.34)',
        boxShadow: isDesktop
          ? 'inset 0 0 0 1px rgba(142,215,255,0.22)'
          : 'inset 0 0 0 1px rgba(142,215,255,0.12)',
        clipPath: cardClip,
      }}
    >
      <div
        className="grid min-w-0 gap-3 px-3 py-3 lg:col-span-2 lg:grid-cols-[1.15fr_0.85fr_auto]"
        style={{
          background: isDesktop
            ? 'linear-gradient(135deg, rgba(8,12,20,0.82), rgba(21,22,24,0.62)), radial-gradient(circle at 12% 0%, rgba(245,217,122,0.13), transparent 34%)'
            : 'rgba(0,0,0,0.16)',
          boxShadow: isDesktop
            ? 'inset 0 0 0 1px rgba(245,217,122,0.24), inset 0 1px 0 rgba(255,244,212,0.08), 0 0 24px rgba(245,217,122,0.08)'
            : 'inset 0 0 0 1px rgba(142,215,255,0.12)',
          clipPath: cardClip,
        }}
      >
        <div className="min-w-0">
          <div className="text-[11px] tracking-[0.24em]" style={{ color: isDesktop ? 'rgba(245,217,122,0.86)' : 'rgba(238,226,198,0.52)' }}>
            关于 / 更新
          </div>
          <div className="mt-1 flex min-w-0 flex-wrap items-baseline gap-2">
            <span className="text-[16px] font-bold tracking-[0.16em]" style={{ color: isDesktop ? '#eee2c6' : 'rgba(238,226,198,0.72)' }}>
              {isDesktop ? '开拓轶事 Desktop Edition' : '开拓轶事 Web Edition'}
            </span>
            <span
              className="px-2 py-0.5 text-[11px] tracking-[0.16em]"
              style={{
                color: updateError ? 'rgba(255,156,156,0.94)' : update?.available ? '#07101a' : 'rgba(142,215,255,0.92)',
                background: updateError
                  ? 'rgba(255,156,156,0.08)'
                  : update?.available
                    ? 'linear-gradient(135deg, #f5d97a, #8ed7ff)'
                    : 'rgba(142,215,255,0.08)',
                boxShadow: updateError
                  ? 'inset 0 0 0 1px rgba(255,156,156,0.24)'
                  : update?.available
                    ? 'inset 0 0 0 1px rgba(255,255,255,0.42), 0 0 16px rgba(245,217,122,0.14)'
                    : 'inset 0 0 0 1px rgba(142,215,255,0.22)',
                clipPath: smallClip,
              }}
            >
              {updateStateLabel}
            </span>
          </div>
          <div className="mt-2 text-[11px]" style={{ color: updateError ? 'rgba(255,156,156,0.9)' : 'rgba(238,226,198,0.68)' }}>
            {updateHint}
          </div>
        </div>
        <div className="grid min-w-0 gap-1 text-[11px]">
          <PathLine label="当前版本" value={`v${currentVersion}`} />
          <PathLine label="最新版本" value={latestVersion === '待检查' ? latestVersion : `v${latestVersion}`} />
          <PathLine label="更新渠道" value={releaseInfo?.releaseSource ?? (isDesktop ? 'desktop' : 'web')} />
          <PathLine label="更新源" value={releaseInfo?.updateEndpoint ?? '桌面端可用'} />
          <PathLine label="数据目录" value={info?.appDataDir ?? (isDesktop ? '读取中' : 'Web 存储')} />
        </div>
        <div className="flex min-w-[150px] flex-wrap content-start gap-2 lg:justify-end">
          <button
            type="button"
            disabled={!isDesktop || checkingUpdate || installingUpdate}
            onClick={onCheckUpdate}
            className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              color: isDesktop ? 'rgba(142,215,255,0.94)' : 'rgba(238,226,198,0.44)',
              background: 'rgba(142,215,255,0.08)',
              boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.26)',
              clipPath: smallClip,
            }}
          >
            {checkingUpdate ? '检查中' : '检查更新'}
          </button>
          {update?.available && (
            <button
              type="button"
              disabled={!isDesktop || installingUpdate}
              onClick={onInstallUpdate}
              className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                color: '#07101a',
                background: 'linear-gradient(135deg, #f5d97a, #8ed7ff)',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.46), 0 0 18px rgba(245,217,122,0.16)',
                clipPath: smallClip,
              }}
            >
              {installingUpdate ? '安装中' : '下载并安装'}
            </button>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-[11px] tracking-[0.2em]" style={{ color: isDesktop ? '#8ed7ff' : 'rgba(238,226,198,0.52)' }}>
            运行平台
          </span>
          <span className="text-[14px] font-bold tracking-[0.16em]" style={{ color: isDesktop ? '#eee2c6' : 'rgba(238,226,198,0.72)' }}>
            {isDesktop ? 'Desktop Edition' : 'Web Edition'}
          </span>
          {info && (
            <span className="text-[11px]" style={{ color: 'rgba(238,226,198,0.46)' }}>
              v{info.version}
            </span>
          )}
        </div>
        {isDesktop ? (
          <div className="mt-2 grid min-w-0 gap-1 text-[11px]" style={{ color: 'rgba(238,226,198,0.62)' }}>
            {releaseInfo && (
              <>
                <PathLine label="发行版本" value={releaseInfo.title} />
                <PathLine label="更新源" value={releaseInfo.updateEndpoint} />
                <PathLine label="发行说明" value={releaseInfo.notes} />
              </>
            )}
            <PathLine label="应用数据" value={info?.appDataDir ?? '读取中'} />
            <PathLine label="存档目录" value={info?.saveDir ?? '读取中'} />
            <PathLine label="备份目录" value={info?.backupDir ?? '读取中'} />
            <PathLine label="智库目录" value={info?.zhikuDir ?? '读取中'} />
            <PathLine label="世界书目录" value={info?.worldbookDir ?? '读取中'} />
            <div
              className="mt-2 grid gap-2 px-3 py-3"
              style={{
                background: 'rgba(12,18,28,0.62)',
                boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.16)',
                clipPath: smallClip,
              }}
            >
              <div className="text-[11px] tracking-[0.18em]" style={{ color: 'rgba(142,215,255,0.84)' }}>
                存储路径
              </div>
              <PathLine label="存档根目录" value={saveRootEdit || '跟随默认应用数据目录'} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!isDesktop}
                  onClick={onChooseSaveRoot}
                  className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    color: 'rgba(142,215,255,0.92)',
                    background: 'rgba(142,215,255,0.07)',
                    boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
                    clipPath: smallClip,
                  }}
                >
                  选择存档目录
                </button>
                <button
                  type="button"
                  disabled={!isDesktop}
                  onClick={onResetSaveRoot}
                  className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    color: 'rgba(238,226,198,0.82)',
                    background: 'rgba(238,226,198,0.06)',
                    boxShadow: 'inset 0 0 0 1px rgba(238,226,198,0.18)',
                    clipPath: smallClip,
                  }}
                >
                  恢复默认
                </button>
              </div>
              <PathLine label="备份根目录" value={backupRootEdit || '跟随默认应用数据目录'} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!isDesktop}
                  onClick={onChooseBackupRoot}
                  className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    color: 'rgba(142,215,255,0.92)',
                    background: 'rgba(142,215,255,0.07)',
                    boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
                    clipPath: smallClip,
                  }}
                >
                  选择备份目录
                </button>
                <button
                  type="button"
                  disabled={!isDesktop}
                  onClick={onResetBackupRoot}
                  className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    color: 'rgba(238,226,198,0.82)',
                    background: 'rgba(238,226,198,0.06)',
                    boxShadow: 'inset 0 0 0 1px rgba(238,226,198,0.18)',
                    clipPath: smallClip,
                  }}
                >
                  恢复默认
                </button>
                <button
                  type="button"
                  disabled={!isDesktop}
                  onClick={onApplyStorageRoots}
                  className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    color: '#07101a',
                    background: 'linear-gradient(135deg, #f5d97a, #8ed7ff)',
                    boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.46)',
                    clipPath: smallClip,
                  }}
                >
                  应用路径
                </button>
              </div>
            </div>
            <PathLine label="镜像存档" value={`${desktopMirrorCount} 个`} />
            {desktopSaveMirrorHealth && (
              <PathLine label="存档镜像健康" value={formatDesktopSaveMirrorHealth(desktopSaveMirrorHealth)} />
            )}
            {desktopSaveDeltaMirrorHealth && (
              <PathLine label="增量镜像健康" value={formatDesktopSaveDeltaMirrorHealth(desktopSaveDeltaMirrorHealth)} />
            )}
            <PathLine label="本地备份" value={`${desktopBackupCount} 份`} />
            <PathLine
              label="迁移备份"
              value={`${desktopMigrationBackupCount} 份${unreadableDesktopMigrationBackupCount > 0 ? ` / 异常 ${unreadableDesktopMigrationBackupCount} 份` : ''}`}
            />
            {desktopMigrationBackupPreview && (
              <PathLine
                label="迁移预估"
                value={`${desktopMigrationBackupPreview.indexedSaveCount} 个存档 / ${desktopMigrationBackupPreview.fileCount} 个文件 / ${formatSize(desktopMigrationBackupPreview.estimatedPayloadBytes)} / ${desktopMigrationBackupPreview.directoryCount} 个目录`}
              />
            )}
            <PathLine label="配置镜像" value={`${desktopConfigCount} 项`} />
            <PathLine label="资源镜像" value={`${desktopAssetCount} 个`} />
            {desktopAssetMirrorHealth && (
              <PathLine label="资源镜像健康" value={formatDesktopAssetMirrorHealth(desktopAssetMirrorHealth)} />
            )}
            {desktopAssetSummary && (
              <>
                <PathLine label="资源占用" value={formatSize(desktopAssetSummary.totalBytes)} />
                <PathLine
                  label="无引用资源"
                  value={`${desktopAssetSummary.orphanAssets} 个 / ${formatSize(desktopAssetSummary.orphanBytes)}`}
                />
              </>
            )}
            {desktopIndexRepairSummary && (
              <PathLine label="索引修复" value={desktopIndexRepairSummary} />
            )}
            {latestDesktopBackup && (
              <PathLine
                label="最近备份"
                value={`${new Date(latestDesktopBackup.createdAt).toLocaleString('zh-CN')} / ${latestDesktopBackup.count} 个存档`}
              />
            )}
            {latestDesktopMigrationBackup && (
              <PathLine
                label="迁移前完整备份"
                value={`${new Date(latestDesktopMigrationBackup.createdAt).toLocaleString('zh-CN')} / ${latestDesktopMigrationBackup.indexedSaveCount} 个存档 / ${latestDesktopMigrationBackup.fileCount} 个文件 / ${formatSize(latestDesktopMigrationBackup.payloadBytes)} / ${latestDesktopMigrationBackup.path}`}
              />
            )}
            {desktopBackups.length > 0 && (
              <div className="mt-2 grid min-w-0 gap-1">
                <div style={{ color: 'rgba(142,215,255,0.72)' }}>备份列表</div>
                {desktopBackups.slice(0, 5).map((backup) => (
                  <div
                    key={backup.path}
                    className="grid min-w-0 gap-2 px-2 py-1 sm:grid-cols-[1fr_auto]"
                    style={{
                      background: 'rgba(142,215,255,0.045)',
                      boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.12)',
                      clipPath: smallClip,
                    }}
                  >
                    <div className="min-w-0 break-all" style={{ color: 'rgba(238,226,198,0.68)' }}>
                      {formatDesktopBackupLine(backup)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={!isDesktop}
                        onClick={() => onSelectDesktopBackup(backup)}
                        className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          color: selectedDesktopBackup?.path === backup.path ? '#07101a' : 'rgba(142,215,255,0.92)',
                          background: selectedDesktopBackup?.path === backup.path
                            ? 'linear-gradient(135deg, #f5d97a, #8ed7ff)'
                            : 'rgba(142,215,255,0.08)',
                          boxShadow: selectedDesktopBackup?.path === backup.path
                            ? 'inset 0 0 0 1px rgba(255,255,255,0.42)'
                            : 'inset 0 0 0 1px rgba(142,215,255,0.22)',
                          clipPath: smallClip,
                        }}
                      >
                        详情
                      </button>
                      <button
                        type="button"
                        disabled={!isDesktop || exportingDesktopBackupPath === backup.path}
                        onClick={() => onExportDesktopBackup(backup)}
                        className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          color: 'rgba(142,215,255,0.92)',
                          background: 'rgba(142,215,255,0.08)',
                          boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.22)',
                          clipPath: smallClip,
                        }}
                      >
                        {exportingDesktopBackupPath === backup.path ? '导出中' : '导出'}
                      </button>
                      <button
                        type="button"
                        disabled={!isDesktop || restoringDesktopBackup || !isRestorableDesktopBackup(backup)}
                        onClick={() => onRestoreDesktopBackup(backup)}
                        className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          color: 'rgba(245,217,122,0.96)',
                          background: 'rgba(245,217,122,0.08)',
                          boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.22)',
                          clipPath: smallClip,
                        }}
                      >
                        恢复
                      </button>
                      <button
                        type="button"
                        disabled={!isDesktop || deletingDesktopBackupPath === backup.path}
                        onClick={() => onDeleteDesktopBackup(backup)}
                        className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          color: 'rgba(255,156,156,0.92)',
                          background: 'rgba(255,156,156,0.07)',
                          boxShadow: 'inset 0 0 0 1px rgba(255,156,156,0.22)',
                          clipPath: smallClip,
                        }}
                      >
                        {deletingDesktopBackupPath === backup.path ? '删除中' : '删除'}
                      </button>
                    </div>
                  </div>
                ))}
                {selectedDesktopBackup && (
                  <DesktopBackupDetailPanel backup={selectedDesktopBackup} />
                )}
              </div>
            )}
            {probe && (
              <PathLine label="探针文件" value={probe.probeFile} />
            )}
            {latestDiagnosticReport && (
              <PathLine label="诊断报告" value={latestDiagnosticReport.path} />
            )}
            {diagnosticReports.length > 0 && (
              <div className="mt-2 grid min-w-0 gap-1">
                <div style={{ color: 'rgba(142,215,255,0.72)' }}>日志中心</div>
                {diagnosticReports.slice(0, 5).map((report) => (
                  <div
                    key={report.path}
                    className="grid min-w-0 gap-2 px-2 py-1 sm:grid-cols-[1fr_auto]"
                    style={{
                      background: 'rgba(142,215,255,0.045)',
                      boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.12)',
                      clipPath: smallClip,
                    }}
                  >
                    <div className="min-w-0 break-all" style={{ color: 'rgba(238,226,198,0.68)' }}>
                      {formatDesktopDiagnosticReportLine(report)}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        disabled={!isDesktop || exportingDiagnosticReportPath === report.path}
                        onClick={() => onExportDiagnosticReport(report)}
                        className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          color: 'rgba(142,215,255,0.92)',
                          background: 'rgba(142,215,255,0.08)',
                          boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.22)',
                          clipPath: smallClip,
                        }}
                      >
                        {exportingDiagnosticReportPath === report.path ? '导出中' : '导出'}
                      </button>
                      <button
                        type="button"
                        disabled={!isDesktop || deletingDiagnosticReportPath === report.path}
                        onClick={() => onDeleteDiagnosticReport(report)}
                        className="cursor-pointer px-2 py-1 text-[11px] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          color: 'rgba(255,156,156,0.92)',
                          background: 'rgba(255,156,156,0.07)',
                          boxShadow: 'inset 0 0 0 1px rgba(255,156,156,0.22)',
                          clipPath: smallClip,
                        }}
                      >
                        {deletingDiagnosticReportPath === report.path ? '删除中' : '删除'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-1" style={{ color: updateError ? 'rgba(255,156,156,0.9)' : 'rgba(238,226,198,0.62)' }}>
              {updateHint}
            </div>
            {error && (
              <div style={{ color: 'rgba(255,156,156,0.9)' }}>{error}</div>
            )}
          </div>
        ) : (
          <div className="mt-1 text-[11px]" style={{ color: 'rgba(238,226,198,0.58)' }}>
            当前为浏览器运行模式，存档仍使用 Web 存储。桌面版会在本地应用数据目录创建 saves / backups / assets / logs 等目录，并提供应用内更新检查。
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
        <button
          type="button"
          disabled={!isDesktop || checking}
          onClick={onProbe}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? '#07101a' : 'rgba(238,226,198,0.44)',
            background: isDesktop ? 'linear-gradient(135deg, #8ed7ff, #5b99ff)' : 'rgba(142,215,255,0.04)',
            boxShadow: isDesktop
              ? 'inset 0 0 0 1px rgba(236,249,255,0.55), 0 0 18px rgba(91,153,255,0.18)'
              : 'inset 0 0 0 1px rgba(142,215,255,0.12)',
            clipPath: smallClip,
          }}
        >
          {checking ? '写入中' : '写入桌面探针'}
        </button>
        <button
          type="button"
          disabled={!isDesktop}
          onClick={onOpenSaveDir}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(142,215,255,0.92)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(142,215,255,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
            clipPath: smallClip,
          }}
        >
          打开存档目录
        </button>
        <button
          type="button"
          disabled={!isDesktop || backingUpDesktop}
          onClick={onBackupDesktopSaves}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(245,217,122,0.96)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(245,217,122,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.24)',
            clipPath: smallClip,
          }}
        >
          {backingUpDesktop ? '备份中' : '备份到本地'}
        </button>
        <button
          type="button"
          disabled={!isDesktop || backingUpDesktopMigration}
          onClick={onBackupDesktopMigration}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(245,217,122,0.96)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(245,217,122,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.24)',
            clipPath: smallClip,
          }}
        >
          {backingUpDesktopMigration ? '备份中' : '迁移前完整备份'}
        </button>
        <button
          type="button"
          disabled={!isDesktop}
          onClick={onOpenBackupDir}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(142,215,255,0.92)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(142,215,255,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
            clipPath: smallClip,
          }}
        >
          打开备份目录
        </button>
        <button
          type="button"
          disabled={!isDesktop}
          onClick={onOpenLogDir}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(142,215,255,0.92)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(142,215,255,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
            clipPath: smallClip,
          }}
        >
          打开日志目录
        </button>
        <button
          type="button"
          disabled={!isDesktop || exportingDiagnostic}
          onClick={onWriteDiagnosticReport}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(245,217,122,0.96)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(245,217,122,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.24)',
            clipPath: smallClip,
          }}
        >
          {exportingDiagnostic ? '导出中' : '导出诊断报告'}
        </button>
        <button
          type="button"
          disabled={!isDesktop || restoringDesktopBackup || !latestDesktopBackup || !isRestorableDesktopBackup(latestDesktopBackup)}
          onClick={() => onRestoreDesktopBackup(latestDesktopBackup)}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop && latestDesktopBackup && isRestorableDesktopBackup(latestDesktopBackup) ? 'rgba(245,217,122,0.96)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(245,217,122,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.24)',
            clipPath: smallClip,
          }}
        >
          {restoringDesktopBackup ? '恢复中' : '恢复最近备份'}
        </button>
        <button
          type="button"
          disabled={!isDesktop}
          onClick={onOpenConfigDir}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(142,215,255,0.92)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(142,215,255,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
            clipPath: smallClip,
          }}
        >
          打开配置目录
        </button>
        <button
          type="button"
          disabled={!isDesktop}
          onClick={onOpenZhikuDir}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(142,215,255,0.92)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(142,215,255,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
            clipPath: smallClip,
          }}
        >
          打开智库目录
        </button>
        <button
          type="button"
          disabled={!isDesktop}
          onClick={onOpenWorldbookDir}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(142,215,255,0.92)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(142,215,255,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
            clipPath: smallClip,
          }}
        >
          打开世界书目录
        </button>
        <button
          type="button"
          disabled={!isDesktop}
          onClick={onOpenAssetDir}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(142,215,255,0.92)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(142,215,255,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
            clipPath: smallClip,
          }}
        >
          打开资源目录
        </button>
        <button
          type="button"
          disabled={!isDesktop || cleaningDesktopAssets || !desktopAssetSummary || desktopAssetSummary.orphanAssets <= 0}
          onClick={onCleanupDesktopAssets}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop && desktopAssetSummary && desktopAssetSummary.orphanAssets > 0 ? 'rgba(245,217,122,0.96)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(245,217,122,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.24)',
            clipPath: smallClip,
          }}
        >
          {cleaningDesktopAssets ? '清理中' : '清理无引用资源'}
        </button>
        <button
          type="button"
          disabled={!isDesktop || repairingDesktopIndexes}
          onClick={onRepairDesktopIndexes}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop ? 'rgba(142,215,255,0.92)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(142,215,255,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(142,215,255,0.24)',
            clipPath: smallClip,
          }}
        >
          {repairingDesktopIndexes ? '修复中' : '修复镜像索引'}
        </button>
        <button
          type="button"
          disabled={!isDesktop || restoringDesktopMirror || desktopMirrorCount <= 0}
          onClick={onRestoreDesktopMirror}
          className="w-full cursor-pointer px-3 py-2 text-[12px] tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: isDesktop && desktopMirrorCount > 0 ? 'rgba(245,217,122,0.96)' : 'rgba(238,226,198,0.44)',
            background: 'rgba(245,217,122,0.07)',
            boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.24)',
            clipPath: smallClip,
          }}
        >
          {restoringDesktopMirror ? '恢复中' : '恢复本地镜像'}
        </button>
      </div>
    </section>
  );
}

function DesktopBackupDetailPanel({ backup }: { backup: DesktopSaveBackupSummary }) {
  const checksumPreview = backup.integrity?.checksum
    ? `${backup.integrity.checksum.slice(0, 12)}...`
    : '无';
  return (
    <div
      className="mt-2 grid min-w-0 gap-2 px-3 py-2"
      style={{
        background: 'linear-gradient(135deg, rgba(8,12,20,0.58), rgba(21,22,24,0.42))',
        boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.18)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[11px] tracking-[0.18em]" style={{ color: 'rgba(245,217,122,0.82)' }}>
        备份详情
      </div>
      <div className="grid min-w-0 gap-1 text-[11px] sm:grid-cols-2">
        <PathLine label="文件名" value={backup.fileName} />
        <PathLine label="创建时间" value={formatDesktopBackupCreatedAt(backup)} />
        <PathLine label="备份来源" value={formatDesktopBackupReason(backup)} />
        <PathLine label="存档数量" value={`${backup.count} 个`} />
        <PathLine label="校验状态" value={formatDesktopBackupIntegrityStatus(backup)} />
        <PathLine label="可恢复性" value={isRestorableDesktopBackup(backup) ? '可恢复' : '不可恢复'} />
        <PathLine label="Payload 大小" value={backup.integrity ? formatSize(backup.integrity.payloadBytes) : '无校验记录'} />
        <PathLine label="校验存档数" value={backup.integrity ? `${backup.integrity.saveCount} 个` : '无校验记录'} />
        <PathLine label="校验算法" value={backup.integrity?.algorithm ?? '无校验记录'} />
        <PathLine label="Checksum" value={checksumPreview} />
        {backup.error && <PathLine label="读取错误" value={backup.error} />}
        <PathLine label="本地路径" value={backup.path} />
      </div>
    </div>
  );
}

function buildUpdateHint(
  update: DesktopUpdateStatus | null,
  progress: DesktopUpdateProgress | null,
  error: string,
): string {
  if (error) return `更新检查失败：${error}`;
  if (progress) {
    const size = progress.contentLength ? ` / ${formatSize(progress.contentLength)}` : '';
    if (progress.phase === 'installing') return '更新包已下载，正在安装。';
    if (progress.phase === 'finished') return '更新包下载完成，准备安装。';
    if (progress.phase === 'downloading') return `更新下载中：${formatSize(progress.downloadedBytes)}${size}`;
    return '更新下载已开始。';
  }
  if (!update?.checked) return '桌面版可在此检查应用更新。';
  if (!update.available) return '当前已是最新版本。';
  return `发现新版本 ${update.version ?? ''}${update.currentVersion ? `，当前版本 ${update.currentVersion}` : ''}。`;
}

function formatDesktopSaveMirrorHealth(health: DesktopSaveMirrorHealth): string {
  const sequenceIssue =
    health.sequenceBehindIndex
    || health.sequenceStatus === 'invalid'
    || health.sequenceStatus === 'unreadable'
    || (health.sequenceStatus === 'missing' && (health.indexedSaves > 0 || health.saveFiles > 0));
  const issueCount =
    health.invalidSaveFiles +
    health.unreadableSaveFiles +
    health.missingIndexedSaveFiles +
    health.orphanSaveFiles +
    health.pendingTransactions +
    health.unreadableTransactions +
    (sequenceIssue ? 1 : 0);
  const sequenceLabel = `${formatDesktopMirrorIndexStatus(health.sequenceStatus)}#${health.sequenceLastSaveId || 0}${health.sequenceBehindIndex ? '落后' : ''}`;
  return `索引 ${formatDesktopMirrorIndexStatus(health.indexStatus)} / 序列 ${sequenceLabel} / 有效 ${health.validSaveFiles}/${health.saveFiles} / 缺失 ${health.missingIndexedSaveFiles} / 孤儿 ${health.orphanSaveFiles} / 事务 ${health.pendingTransactions} / 异常 ${issueCount}`;
}

function formatDesktopSaveDeltaMirrorHealth(health: DesktopSaveDeltaMirrorHealth): string {
  const issueCount =
    health.invalidDeltaFiles +
    health.unreadableDeltaFiles +
    health.missingIndexedDeltaFiles +
    health.orphanDeltaFiles;
  return `索引 ${formatDesktopMirrorIndexStatus(health.indexStatus)} / 有效 ${health.validDeltaFiles}/${health.deltaFiles} / 缺失 ${health.missingIndexedDeltaFiles} / 孤儿 ${health.orphanDeltaFiles} / 异常 ${issueCount}`;
}

function formatDesktopAssetMirrorHealth(health: DesktopAssetMirrorHealth): string {
  const issueCount =
    health.invalidMetadataFiles +
    health.unreadableMetadataFiles +
    health.missingPayloadFiles +
    health.missingIndexedMetadataFiles +
    health.orphanMetadataFiles;
  return `索引 ${formatDesktopMirrorIndexStatus(health.indexStatus)} / metadata ${health.validMetadataFiles}/${health.metadataFiles} / payload缺失 ${health.missingPayloadFiles} / 孤儿 ${health.orphanMetadataFiles} / 异常 ${issueCount}`;
}

function formatDesktopMirrorIndexStatus(status: DesktopSaveMirrorHealth['indexStatus'] | DesktopSaveMirrorHealth['sequenceStatus'] | DesktopSaveDeltaMirrorHealth['indexStatus'] | DesktopAssetMirrorHealth['indexStatus']): string {
  const statusLabel: Record<typeof status, string> = {
    ok: '正常',
    missing: '缺失',
    invalid: '格式异常',
    unreadable: '不可读',
  };
  return statusLabel[status];
}

function formatDesktopBackupLine(backup: DesktopSaveBackupSummary): string {
  const sizeLabel = backup.integrity?.payloadBytes ? ` / ${formatSize(backup.integrity.payloadBytes)}` : '';
  const errorLabel = backup.error ? ` / ${backup.error}` : '';
  return `${formatDesktopBackupCreatedAt(backup)} / ${formatDesktopBackupReason(backup)} / ${backup.count} 个存档 / ${formatDesktopBackupIntegrityStatus(backup)}${sizeLabel}${errorLabel} / ${backup.fileName}`;
}

function formatDesktopBackupCreatedAt(backup: DesktopSaveBackupSummary): string {
  return backup.createdAt ? new Date(backup.createdAt).toLocaleString('zh-CN') : '时间未知';
}

function formatDesktopBackupReason(backup: DesktopSaveBackupSummary): string {
  const reasonLabel: Record<NonNullable<DesktopSaveBackupSummary['reason']>, string> = {
    manual: '手动备份',
    'before-restore': '恢复前备份',
    'before-replace': '替换前备份',
    'before-repair': '修复前备份',
  };
  return backup.reason ? reasonLabel[backup.reason] ?? backup.reason : '未知来源';
}

function formatDesktopBackupIntegrityStatus(backup: DesktopSaveBackupSummary): string {
  const integrityLabel: Record<DesktopSaveBackupSummary['integrityStatus'], string> = {
    verified: '校验通过',
    missing: '旧备份无校验',
    mismatch: '校验异常',
    unreadable: '不可读',
  };
  return integrityLabel[backup.integrityStatus];
}

function isRestorableDesktopBackup(backup: DesktopSaveBackupSummary | null): backup is DesktopSaveBackupSummary {
  return Boolean(
    backup
    && backup.count > 0
    && backup.integrityStatus !== 'unreadable'
    && backup.integrityStatus !== 'mismatch',
  );
}

function findLatestRestorableDesktopBackup(backups: DesktopSaveBackupSummary[]): DesktopSaveBackupSummary | null {
  return backups.find(isRestorableDesktopBackup) ?? null;
}

function countUnreadableDesktopBackups(backups: DesktopSaveBackupSummary[]): number {
  return backups.filter((backup) => backup.integrityStatus === 'unreadable').length;
}

function findLatestVerifiedDesktopMigrationBackup(backups: DesktopMigrationBackupSummary[]): DesktopMigrationBackupSummary | null {
  return backups.find((backup) => backup.integrityStatus === 'verified') ?? null;
}

function countUnreadableDesktopMigrationBackups(backups: DesktopMigrationBackupSummary[]): number {
  return backups.filter((backup) => backup.integrityStatus !== 'verified').length;
}

function formatDesktopDiagnosticReportLine(report: DesktopDiagnosticReportSummary): string {
  const updateLabel = report.updateChecked
    ? report.updateAvailable ? '发现更新' : '已检查更新'
    : '未检查更新';
  const errorLabel = report.lastError ? ` / 最近错误：${report.lastError}` : '';
  return `${new Date(report.createdAt).toLocaleString('zh-CN')} / v${report.appVersion ?? '未知'} / ${updateLabel}${errorLabel} / ${report.fileName}`;
}

function downloadDesktopBackupRecord(record: DesktopSaveBackupRecord, fileName: string): void {
  const json = JSON.stringify(record, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `export-${fileName}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function downloadDesktopDiagnosticReport(report: DesktopDiagnosticReport, fileName: string): void {
  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `export-${fileName}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function PathLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1 sm:grid-cols-[72px_1fr]">
      <span style={{ color: 'rgba(142,215,255,0.72)' }}>{label}</span>
      <span className="min-w-0 break-all" style={{ color: 'rgba(238,226,198,0.72)' }}>{value}</span>
    </div>
  );
}

function SaveCard({
  save,
  loadingId,
  onLoad,
  onExport,
  onDelete,
  treeLabel,
  isLatest = false,
}: {
  save: SaveListItemSummary;
  loadingId: number | null;
  onLoad: (id: number) => void;
  onExport: (id: number) => void;
  onDelete: (id: number) => void;
  treeLabel?: string;
  isLatest?: boolean;
}) {
  return (
    <div
      className={`grid min-w-0 gap-3 lg:grid-cols-[1fr_auto] ${
        isLatest ? 'p-4 lg:gap-4' : 'p-3'
      }`}
      style={{
        background: isLatest
          ? 'linear-gradient(135deg, rgba(142,215,255,0.18), rgba(245,217,122,0.09)), rgba(10,16,27,0.92)'
          : 'rgba(10,16,27,0.74)',
        boxShadow: isLatest
          ? 'inset 0 0 0 1px rgba(245,217,122,0.46), inset 0 0 0 2px rgba(142,215,255,0.08), 0 0 28px rgba(142,215,255,0.10), 0 0 22px rgba(245,217,122,0.08)'
          : 'inset 0 0 0 1px rgba(142,215,255,0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`font-serif tracking-[0.16em] ${isLatest ? 'text-[12px]' : 'text-[11px]'}`} style={{ color: typeColor(save.type) }}>
            {typeLabel(save.type)}
          </span>
          <span className={`font-serif font-bold tracking-wider ${isLatest ? 'text-[17px]' : 'text-[15px]'}`} style={{ color: '#eee2c6' }}>
            {save.travelerName || '未命名旅人'}
          </span>
          <span className="text-[11px]" style={{ color: 'rgba(238,226,198,0.42)' }}>#{save.id}</span>
          {treeLabel && (
            <span
              className="px-1.5 py-0.5 text-[10px] font-serif tracking-[0.12em]"
              style={{
                color: 'rgba(140, 210, 255, 0.92)',
                background: 'rgba(140, 210, 255, 0.09)',
                boxShadow: 'inset 0 0 0 1px rgba(140, 210, 255, 0.25)',
                clipPath: smallClip,
              }}
            >
              {treeLabel}
            </span>
          )}
          {isLatest && (
            <span
              className="px-1.5 py-0.5 text-[10px] font-serif tracking-[0.12em]"
              style={{
                color: '#f5d97a',
                background: 'rgba(245,217,122,0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(245,217,122,0.16)',
                clipPath: smallClip,
              }}
            >
              最新
            </span>
          )}
        </div>
        <div className={`flex flex-wrap gap-x-3 gap-y-1 font-serif tracking-wider ${isLatest ? 'mt-2 text-[13px]' : 'mt-1 text-[12px]'}`} style={{ color: 'rgba(238,226,198,0.78)' }}>
          <span style={{ color: '#8ed7ff' }}>第 {save.turnCount} 回合</span>
          <span>{[save.currentDate, save.currentTime, save.currentLocation].filter(Boolean).join(' / ') || save.worldPeriodName || '未知坐标'}</span>
          <span>{new Date(save.timestamp).toLocaleString('zh-CN')}</span>
          <span>{formatSize(save.sizeBytes)}</span>
        </div>
        {save.lastSummary && (
          <div className={`leading-relaxed ${isLatest ? 'mt-2 line-clamp-3 text-[13px]' : 'mt-1.5 line-clamp-2 text-[12px]'}`} style={{ color: 'rgba(238,226,198,0.62)' }}>
            {save.lastSummary}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
        <ActionButton label={loadingId === save.id ? '读取中' : '读取'} disabled={loadingId !== null} onClick={() => onLoad(save.id)} />
        <ActionButton label="导出" disabled={loadingId !== null} onClick={() => onExport(save.id)} />
        <button
          type="button"
          disabled={loadingId !== null}
          onClick={() => onDelete(save.id)}
          className="w-full cursor-pointer px-3 py-2 text-[12px] font-serif tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: 'rgba(255,156,156,0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(255,156,156,0.28)',
            clipPath: smallClip,
          }}
        >
          删除
        </button>
      </div>
    </div>
  );
}

function typeLabel(type: SaveListItemSummary['type']): string {
  if (type === 'auto') return '自动';
  if (type === 'backup') return '保护';
  if (type === 'imported') return '导入';
  return '手动';
}

function typeColor(type: SaveListItemSummary['type']): string {
  if (type === 'auto') return 'rgba(140, 210, 255, 0.86)';
  if (type === 'backup') return 'rgba(var(--tj-tech-cyan), 0.9)';
  if (type === 'imported') return 'rgba(165, 230, 170, 0.9)';
  return 'rgba(var(--tj-tech-cyan), 0.9)';
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function matchesSaveFilter(save: SaveListItemSummary, filter: Filter): boolean {
  if (filter === 'all') return save.type !== 'auto';
  if (filter === 'manual') return save.type === 'manual';
  if (filter === 'auto') return save.type === 'auto';
  return save.type === 'backup' || save.type === 'imported';
}

function buildVisibleSaveTreeGroup(group: SaveTreeDisplayGroup, filter: Filter): SaveTreeDisplayGroup | null {
  const nodes = group.nodes.filter((node) => matchesSaveFilter(node.save, filter));
  if (!nodes.length) return null;
  const latestSave = [...nodes].sort((a, b) => b.save.timestamp - a.save.timestamp || b.save.id - a.save.id)[0].save;
  const rootSave = nodes.find((node) => node.isRoot)?.save ?? nodes[nodes.length - 1].save;
  const forkNodeIds = new Set<string>();
  for (const node of nodes) {
    const parentNodeId = node.save.saveTree?.parentNodeId;
    if (parentNodeId && nodes.some((candidate) => candidate.save.saveTree?.nodeId === parentNodeId)) {
      forkNodeIds.add(parentNodeId);
    }
  }
  return {
    ...group,
    rootSave,
    latestSave,
    nodes,
    nodeCount: nodes.length,
    branchCount: Math.max(0, forkNodeIds.size ? group.branchCount : 0),
    totalSizeBytes: nodes.reduce((sum, node) => sum + Math.max(0, node.save.sizeBytes || 0), 0),
  };
}
