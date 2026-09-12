import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  SaveCatalogRepairResult,
  SaveCatalogRepairScope,
  SaveCatalogRepairState,
  SaveCatalogSnapshot,
  SaveListItemSummary,
} from '@/contracts/storage';
import { devLogError } from '@/utils/devLog';
import type { SaveTabFilter } from '@/utils/saveTreeView';

import { pickSavePackageFile } from '@/components/features/SaveLoad/pickSaveFile';

/**
 * 存档管理共享逻辑（模态与设置页两个变体共用）：
 * 目录快照、后台修复订阅、读取/分支/删除/导入导出全部收在这里，变体只负责布局与错误通道。
 */
export interface SaveManagerActions {
  showAutoArchives: boolean;
  onLoad: (id: number) => Promise<boolean>;
  /** 回档（分支）用例动作：未提供时回退 onLoad（enterSession 已按节点类型分派）。 */
  onBranch?: (id: number) => Promise<boolean>;
  onDeleteSave: (save: SaveListItemSummary) => Promise<boolean>;
  onDeleteSaveTree: (rootId: string) => Promise<void>;
  onClearActiveSaveTreeMeta: (target?: { rootId?: string; nodeId?: string } | null) => void;
  onGetSaveCatalogSnapshot: () => Promise<SaveCatalogSnapshot>;
  onStartSaveCatalogRepair: (scope?: SaveCatalogRepairScope) => Promise<SaveCatalogRepairResult>;
  onSubscribeSaveCatalogRepair: (listener: (state: SaveCatalogRepairState) => void) => () => void;
  onRepairSaveDatabase: () => Promise<void>;
  onDeleteLegacyBackupSaves: () => Promise<number>;
  onExportSavePackage: (id: number) => Promise<void>;
  onExportSaveTreePackage: (rootId: string) => Promise<void>;
  onImportSaveFileAsMany: (file: File) => Promise<number>;
  /** 行级操作的错误通道：模态弹 alert，设置页写内联错误；devLog 由模型统一负责。 */
  operationErrorMode: 'alert' | 'inline';
}

/** 调用方共享动作：错误通道由 SaveManager 按变体注入。 */
export type SaveManagerCallerActions = Omit<SaveManagerActions, 'operationErrorMode'>;

const 空修复态: SaveCatalogRepairState = {
  phase: 'idle',
  scope: 'missing-only',
  total: 0,
  processed: 0,
  failed: 0,
};

function 取错误文案(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useSaveManager(actions: SaveManagerActions) {
  const {
    showAutoArchives,
    onLoad,
    onBranch,
    onDeleteSave,
    onDeleteSaveTree,
    onClearActiveSaveTreeMeta,
    onGetSaveCatalogSnapshot,
    onStartSaveCatalogRepair,
    onSubscribeSaveCatalogRepair,
    onRepairSaveDatabase,
    onDeleteLegacyBackupSaves,
    onExportSavePackage,
    onExportSaveTreePackage,
    onImportSaveFileAsMany,
    operationErrorMode,
  } = actions;

  const [saves, setSaves] = useState<SaveListItemSummary[]>([]);
  const [legacyBackups, setLegacyBackups] = useState<SaveListItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingRootId, setDeletingRootId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingLegacyBackups, setDeletingLegacyBackups] = useState(false);
  const [filter, setFilter] = useState<SaveTabFilter>('all');
  const [loadError, setLoadError] = useState('');
  const [pendingSummaryCount, setPendingSummaryCount] = useState(0);
  const [unreadableSummaryCount, setUnreadableSummaryCount] = useState(0);
  const [catalogComplete, setCatalogComplete] = useState(true);
  // 修复进度初始态取 idle 兜底；订阅 effect 挂载时会立刻推送当前真实状态。
  const [repairState, setRepairState] = useState<SaveCatalogRepairState>(空修复态);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

  const reportOperationError = useCallback((message: string) => {
    if (operationErrorMode === 'alert') alert(message);
    else setLoadError(message);
  }, [operationErrorMode]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const snapshot = await onGetSaveCatalogSnapshot();
      setSaves(snapshot.items);
      setLegacyBackups(snapshot.legacyBackups);
      setPendingSummaryCount(snapshot.pendingIds.length);
      setUnreadableSummaryCount(snapshot.unreadableIds.length);
      setCatalogComplete(snapshot.catalogComplete);
      return snapshot;
    } catch (error) {
      devLogError('save', 'catalog-refresh-failed', error);
      setLoadError(取错误文案(error, '存档列表读取失败'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [onGetSaveCatalogSnapshot]);

  useEffect(() => {
    let cancelled = false;
    const isCancelled = (): boolean => cancelled;
    const loadAndRepair = async () => {
      try {
        const snapshot = await refresh();
        if (!isCancelled() && snapshot?.pendingIds.length) {
          await onStartSaveCatalogRepair('missing-only');
          if (!isCancelled()) await refresh();
        }
      } catch (error) {
        devLogError('save', 'background-catalog-recovery-failed', error);
      }
    };
    void loadAndRepair();
    return () => {
      cancelled = true;
    };
  }, [onStartSaveCatalogRepair, refresh]);

  useEffect(() => onSubscribeSaveCatalogRepair((state) => {
    setRepairState(state);
    if (state.phase === 'completed' || state.phase === 'partial-failure') {
      void refresh();
    }
  }), [onSubscribeSaveCatalogRepair, refresh]);

  const handleRepairList = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      await onRepairSaveDatabase();
      await refresh();
    } catch (error) {
      devLogError('save', 'catalog-repair-failed', error);
      setLoadError(取错误文案(error, '存档摘要修复失败'));
    } finally {
      setLoading(false);
    }
  }, [onRepairSaveDatabase, refresh]);

  const handleLoad = useCallback(async (id: number) => {
    if (!confirm('读取这个存档会替换当前未保存的进度，是否继续？')) return;
    setLoadingId(id);
    try {
      const ok = await onLoad(id);
      if (!ok) alert('加载失败：没有读取到可用存档内容');
    } catch (error) {
      devLogError('save', 'load-failed', error);
      alert(`加载失败：${取错误文案(error, '存档读取或恢复过程异常')}`);
    } finally {
      setLoadingId(null);
    }
  }, [onLoad]);

  // 回档（分支）：独立动词入口，核心行为复用 onBranch（enterSession 检查点分叉路径）。
  const handleBranch = useCallback(async (id: number) => {
    if (!confirm('从这个检查点分支会创建新的工作区分支，是否继续？')) return;
    setLoadingId(id);
    try {
      const ok = await (onBranch ?? onLoad)(id);
      if (!ok) alert('分支失败：没有读取到可用存档内容');
    } catch (error) {
      devLogError('save', 'branch-failed', error);
      alert(`分支失败：${取错误文案(error, '存档读取或恢复过程异常')}`);
    } finally {
      setLoadingId(null);
    }
  }, [onBranch, onLoad]);

  const handleDelete = useCallback(async (id: number) => {
    const target = [...saves, ...legacyBackups].find((save) => save.id === id);
    if (!target) return;
    setDeletingId(id);
    try {
      // resolve→确认→级联删除收敛在门面用例动作，组件只做列表乐观更新。
      const ok = await onDeleteSave(target);
      if (ok) {
        setSaves((prev) => prev.filter((save) => save.id !== id));
        setLegacyBackups((prev) => prev.filter((save) => save.id !== id));
        setDeletingId(null);
        await refresh();
      } else {
        setDeletingId(null);
      }
    } catch (error) {
      devLogError('save', 'save-delete-failed', error, { id });
      reportOperationError(`删除失败：${取错误文案(error, '存档删除过程异常')}`);
      await refresh();
      setDeletingId(null);
    }
  }, [legacyBackups, onDeleteSave, refresh, reportOperationError, saves]);

  const handleDeleteTree = useCallback(async (rootId: string, nodeCount: number) => {
    if (!confirm(`确定删除这整棵存档树？将删除 ${nodeCount} 个节点，此操作不可恢复。`)) return;
    setDeletingRootId(rootId);
    setSaves((prev) => prev.filter((save) => save.saveTree?.rootId !== rootId));
    try {
      await onDeleteSaveTree(rootId);
      setDeletingRootId(null);
      void refresh();
    } catch (error) {
      devLogError('save', 'save-delete-tree-failed', error, { rootId });
      reportOperationError(`删除整树失败：${取错误文案(error, '存档树删除过程异常')}`);
      await refresh();
      setDeletingRootId(null);
    }
  }, [onDeleteSaveTree, refresh, reportOperationError]);

  const handleDeleteLegacyBackups = useCallback(async () => {
    if (!legacyBackups.length || deletingLegacyBackups) return;
    if (!confirm(`确定清理全部 ${legacyBackups.length} 个历史恢复点？此操作不可恢复。`)) return;
    setDeletingLegacyBackups(true);
    try {
      await onDeleteLegacyBackupSaves();
      // 面板逐条收敛活动树元信息清理，不进门面。
      for (const backup of legacyBackups) {
        onClearActiveSaveTreeMeta(backup.saveTree ? { nodeId: backup.saveTree.nodeId } : null);
      }
      await refresh();
    } catch (error) {
      devLogError('save', 'save-delete-legacy-backups-failed', error);
      reportOperationError(`历史恢复点清理失败：${取错误文案(error, '存档删除过程异常')}`);
    } finally {
      setDeletingLegacyBackups(false);
    }
  }, [deletingLegacyBackups, legacyBackups, onClearActiveSaveTreeMeta, onDeleteLegacyBackupSaves, refresh, reportOperationError]);

  const handleExport = useCallback(async (id: number) => {
    await onExportSavePackage(id);
  }, [onExportSavePackage]);

  const handleExportTree = useCallback(async (rootId: string) => {
    await onExportSaveTreePackage(rootId);
  }, [onExportSaveTreePackage]);

  const handleImport = useCallback(async () => {
    const file = await pickSavePackageFile();
    if (!file) return;
    setImporting(true);
    try {
      await onImportSaveFileAsMany(file);
      await refresh();
      setFilter('imported');
    } catch (error) {
      devLogError('save', 'save-import-failed', error);
      reportOperationError(`导入失败：${取错误文案(error, '存档文件格式无效')}`);
    } finally {
      setImporting(false);
    }
  }, [onImportSaveFileAsMany, refresh, reportOperationError]);

  const displaySaves = useMemo(
    () => (showAutoArchives ? saves : saves.filter((save) => save.type !== 'auto')),
    [saves, showAutoArchives],
  );

  const repairingSummaries = pendingSummaryCount > 0 && (
    repairState.phase === 'checking'
    || repairState.phase === 'waiting-for-lease'
    || repairState.phase === 'repairing'
    || repairState.phase === 'paused-for-write'
  );

  return {
    saves,
    legacyBackups,
    loading,
    loadingId,
    deletingId,
    deletingRootId,
    saving,
    setSaving,
    importing,
    deletingLegacyBackups,
    filter,
    setFilter,
    loadError,
    pendingSummaryCount,
    unreadableSummaryCount,
    catalogComplete,
    repairState,
    selectedRootId,
    setSelectedRootId,
    displaySaves,
    repairingSummaries,
    refresh,
    handleRepairList,
    handleLoad,
    handleBranch,
    handleDelete,
    handleDeleteTree,
    handleDeleteLegacyBackups,
    handleExport,
    handleExportTree,
    handleImport,
  };
}

export type SaveManagerModel = ReturnType<typeof useSaveManager>;
