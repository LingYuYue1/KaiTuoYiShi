import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SaveCatalogRepairResult, SaveCatalogRepairScope, SaveCatalogRepairState, SaveCatalogSnapshot, SaveListItemSummary } from '@/contracts/storage';
import { devLogError } from '@/utils/devLog';
import { 格式化存档体积 } from '@/utils/format';
import { buildSaveTreeGroups, buildVisibleSaveTreeGroup, type SaveTabFilter, type SaveTreeDisplayGroup } from '@/utils/saveTreeView';

import { LegacyBackupSection } from './legacyBackupSection';
import { MiniSaveTreeMap } from './miniSaveTreeMap';
import { EmptyState, SaveActionButton, SaveMetric, TabButton } from './primitives';
import { SaveTreeGroup } from './saveTreeGroup';
import { MobileSaveTreeStrip, SaveTreeSelector } from './saveTreeSelector';
import { cardClip, shellClip, smallClip } from './saveLoadStyles';

interface Props {
  showAutoArchives: boolean;
  onLoad: (id: number) => Promise<boolean>;
  /** 回档（分支）用例动作：检查点按钮显示「分支」，由 App 从 useGame 门面注入；未提供时回退 onLoad（文本仍显示「分支」）。 */
  onBranch?: (id: number) => Promise<boolean>;
  /** 导出当前工作区叶子节点（子任务 A）：手动存档已移除，「导出当前节点」改指活跃叶子。 */
  onExportActiveLeafPackage: () => Promise<number | null>;
  /** 存档删除用例动作：resolve→确认→级联删除（由 App 从 useGame 门面注入）。 */
  onDeleteSave: (save: SaveListItemSummary) => Promise<boolean>;
  /** 整棵存档树删除用例动作（由 App 从 useGame 门面注入）。 */
  onDeleteSaveTree: (rootId: string) => Promise<void>;
  /** 活动存档树元信息清理用例动作（由 App 从 useGame 门面注入）。 */
  onClearActiveSaveTreeMeta: (target?: { rootId?: string; nodeId?: string } | null) => void;
  /** 存档目录快照用例动作（片 panel-p7）：由 App 从 useGame 门面注入，两处面板共用。 */
  onGetSaveCatalogSnapshot: () => Promise<SaveCatalogSnapshot>;
  /** 目录后台修复用例动作（片 panel-p7）：启动 missing-only 后台补齐目录摘要。 */
  onStartSaveCatalogRepair: (scope?: SaveCatalogRepairScope) => Promise<SaveCatalogRepairResult>;
  /** 目录修复进度订阅用例动作（片 panel-p7）：返回退订函数，组件 effect 负责生命周期清理。 */
  onSubscribeSaveCatalogRepair: (listener: (state: SaveCatalogRepairState) => void) => () => void;
  /** 手动全量修复存档索引用例动作（片 panel-p7）。 */
  onRepairSaveDatabase: () => Promise<void>;
  /** 历史恢复点批量清理用例动作（片 panel-p7）：返回实际删除数量。 */
  onDeleteLegacyBackupSaves: () => Promise<number>;
  /** 导出单节点存档包用例动作（片 panel-p7）：数据库读取 + 文件下载全部收敛到门面。 */
  onExportSavePackage: (id: number) => Promise<void>;
  /** 导出整树存档包用例动作（片 panel-p7）。 */
  onExportSaveTreePackage: (rootId: string) => Promise<void>;
  /** 导入存档包用例动作（片 panel-p7）：解析 + 批量落库收敛到门面，返回导入数量。 */
  onImportSaveFileAsMany: (file: File) => Promise<number>;
  onClose: () => void;
}

type Tab = SaveTabFilter;

export function SaveLoadModal({ showAutoArchives, onLoad, onBranch, onExportActiveLeafPackage, onDeleteSave, onDeleteSaveTree, onClearActiveSaveTreeMeta, onGetSaveCatalogSnapshot, onStartSaveCatalogRepair, onSubscribeSaveCatalogRepair, onRepairSaveDatabase, onDeleteLegacyBackupSaves, onExportSavePackage, onExportSaveTreePackage, onImportSaveFileAsMany, onClose }: Props) {
  const [saves, setSaves] = useState<SaveListItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingRootId, setDeletingRootId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [deletingLegacyBackups, setDeletingLegacyBackups] = useState(false);
  const [tab, setTab] = useState<Tab>('all');
  const [loadError, setLoadError] = useState('');
  const [legacyBackups, setLegacyBackups] = useState<SaveListItemSummary[]>([]);
  const [pendingSummaryCount, setPendingSummaryCount] = useState(0);
  const [unreadableSummaryCount, setUnreadableSummaryCount] = useState(0);
  const [catalogComplete, setCatalogComplete] = useState(true);
  // 修复进度初始态取 idle 兜底；订阅 effect 挂载时会立刻推送当前真实状态（subscribeSaveCatalogRepair 语义）。
  const [repairState, setRepairState] = useState<SaveCatalogRepairState>({
    phase: 'idle',
    scope: 'missing-only',
    total: 0,
    processed: 0,
    failed: 0,
  });
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

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
    } catch (err) {
      console.error('[save-list] load failed', err);
      setLoadError(err instanceof Error ? err.message : '存档列表读取失败');
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
      } catch (err) {
        console.warn('[save-list] background catalog recovery failed', err);
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

  const handleRepairList = async () => {
    setLoading(true);
    setLoadError('');
    try {
      await onRepairSaveDatabase();
      await refresh();
    } catch (err) {
      console.error('[save-list] repair failed', err);
      setLoadError(err instanceof Error ? err.message : '存档摘要修复失败');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCurrent = async () => {
    setSaving(true);
    try {
      // 子任务 A：手动存档已移除，「导出当前节点」= 导出活跃叶子（工作区），不再先落盘新节点。
      const id = await onExportActiveLeafPackage();
      if (id === null) {
        alert('当前没有可导出的工作区节点');
        return;
      }
      await refresh();
    } catch (err) {
      console.error('[save-export-current] failed', err);
      alert('导出失败');
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (id: number) => {
    if (!confirm('读取这个存档会替换当前未保存的进度，是否继续？')) return;
    setLoadingId(id);
    try {
      const ok = await onLoad(id);
      if (!ok) alert('加载失败：没有读取到可用存档内容');
    } catch (err) {
      devLogError('save', 'load-failed', err);
      alert(`加载失败：${err instanceof Error ? err.message : '存档读取或恢复过程异常'}`);
    } finally {
      setLoadingId(null);
    }
  };

  // 回档（分支）：独立动词入口，核心行为复用 onBranch（enterSession 检查点分叉路径）；
  // onBranch 未注入时回退 onLoad，App 侧两者行为等价（enterSession 已按节点类型分派）。
  const handleBranch = async (id: number) => {
    if (!confirm('从这个检查点分支会创建新的工作区分支，是否继续？')) return;
    setLoadingId(id);
    try {
      const ok = await (onBranch ?? onLoad)(id);
      if (!ok) alert('分支失败：没有读取到可用存档内容');
    } catch (err) {
      devLogError('save', 'branch-failed', err);
      alert(`分支失败：${err instanceof Error ? err.message : '存档读取或恢复过程异常'}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    const target = [...saves, ...legacyBackups].find((save) => save.id === id);
    if (!target) return;
    setDeletingId(id);
    try {
      // 片 panel-p1：resolve→确认→级联删除收敛到门面用例动作，组件只做列表乐观更新。
      const ok = await onDeleteSave(target);
      if (ok) {
        setSaves((prev) => prev.filter((save) => save.id !== id));
        setLegacyBackups((prev) => prev.filter((save) => save.id !== id));
        setDeletingId(null);
        await refresh();
      } else {
        setDeletingId(null);
      }
    } catch (err) {
      devLogError('save', 'save-delete-failed', err, { id });
      alert(`删除失败：${err instanceof Error ? err.message : '存档删除过程异常'}`);
      await refresh();
      setDeletingId(null);
    }
  };

  const handleDeleteLegacyBackups = async () => {
    if (!legacyBackups.length || deletingLegacyBackups) return;
    if (!confirm(`确定清理全部 ${legacyBackups.length} 个历史恢复点？此操作不可恢复。`)) return;
    setDeletingLegacyBackups(true);
    try {
      await onDeleteLegacyBackupSaves();
      for (const backup of legacyBackups) {
        onClearActiveSaveTreeMeta(backup.saveTree ? { nodeId: backup.saveTree.nodeId } : null);
      }
      await refresh();
    } catch (err) {
      console.error('[save-delete-legacy-backups] failed', err);
      alert(`历史恢复点清理失败：${err instanceof Error ? err.message : '存档删除过程异常'}`);
    } finally {
      setDeletingLegacyBackups(false);
    }
  };

  const handleDeleteTree = async (rootId: string, nodeCount: number) => {
    if (!confirm(`确定删除这整棵存档树？将删除 ${nodeCount} 个节点，此操作不可恢复。`)) return;
    setDeletingRootId(rootId);
    setSaves((prev) => prev.filter((save) => save.saveTree?.rootId !== rootId));
    try {
      await onDeleteSaveTree(rootId);
      setDeletingRootId(null);
      void refresh();
    } catch (err) {
      console.error('[save-delete-tree] delete failed', err);
      alert(`删除整树失败：${err instanceof Error ? err.message : '存档树删除过程异常'}`);
      await refresh();
      setDeletingRootId(null);
    }
  };

  const handleExport = async (id: number) => {
    await onExportSavePackage(id);
  };

  const handleExportTree = async (rootId: string) => {
    await onExportSaveTreePackage(rootId);
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
        await onImportSaveFileAsMany(file);
        await refresh();
        setTab('imported');
      } catch (err) {
        console.error('[save-import] failed', err);
        alert(`导入失败：${err instanceof Error ? err.message : '存档文件格式无效'}`);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const displaySaves = useMemo(
    () => showAutoArchives ? saves : saves.filter((save) => save.type !== 'auto'),
    [saves, showAutoArchives],
  );
  const visibleSaves = useMemo(
    () => displaySaves.filter((save) => save.id !== deletingId && save.saveTree?.rootId !== deletingRootId),
    [deletingId, deletingRootId, displaySaves],
  );

  const { autoSaves, importedSaves } = useMemo(() => {
    const auto = visibleSaves.filter((s) => s.type === 'auto');
    const imported = visibleSaves.filter((s) => s.type === 'imported');
    return { autoSaves: auto, importedSaves: imported };
  }, [visibleSaves]);
  const repairingSummaries = pendingSummaryCount > 0 && (
    repairState.phase === 'checking'
    || repairState.phase === 'waiting-for-lease'
    || repairState.phase === 'repairing'
    || repairState.phase === 'paused-for-write'
  );

  const allTreeGroups = useMemo(() => buildSaveTreeGroups(visibleSaves), [visibleSaves]);
  const visibleTreeGroups = useMemo(
    () => allTreeGroups
      .map((group) => buildVisibleSaveTreeGroup(group, tab))
      .filter((group): group is SaveTreeDisplayGroup => Boolean(group)),
    [allTreeGroups, tab],
  );
  const visibleNodeCount = useMemo(
    () => visibleTreeGroups.reduce((sum, group) => sum + group.nodeCount, 0),
    [visibleTreeGroups],
  );
  const totalBranches = allTreeGroups.reduce((sum, group) => sum + group.branchCount, 0);
  const totalSizeBytes = allTreeGroups.reduce((sum, group) => sum + group.totalSizeBytes, 0);
  const latestSave = visibleSaves.at(0);
  const selectedTree =
    visibleTreeGroups.find((group) => group.rootId === selectedRootId) ??
    visibleTreeGroups.at(0) ??
    null;

  const [prevTab, setPrevTab] = useState(tab);
  const [prevSaveCount, setPrevSaveCount] = useState(visibleSaves.length);
  const [prevTreeGroupCount, setPrevTreeGroupCount] = useState(visibleTreeGroups.length);
  if (prevTab !== tab || prevSaveCount !== visibleSaves.length || prevTreeGroupCount !== visibleTreeGroups.length) {
    setPrevTab(tab);
    setPrevSaveCount(visibleSaves.length);
    setPrevTreeGroupCount(visibleTreeGroups.length);
    if (tab !== 'all' && visibleSaves.length > 0 && visibleTreeGroups.length === 0) {
      setTab('all');
    }
  }

  const [prevVisibleTreeGroups, setPrevVisibleTreeGroups] = useState(visibleTreeGroups);
  if (prevVisibleTreeGroups !== visibleTreeGroups) {
    setPrevVisibleTreeGroups(visibleTreeGroups);
    if (visibleTreeGroups.length === 0) {
      if (selectedRootId !== null) setSelectedRootId(null);
    } else if (!selectedRootId || !visibleTreeGroups.some((group) => group.rootId === selectedRootId)) {
      setSelectedRootId(visibleTreeGroups[0].rootId);
    }
  }

  return (
    <div
      className="kaituo-modal-overlay fixed inset-0 z-50 flex items-stretch justify-center p-0 md:items-center md:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex h-[100dvh] w-full min-w-0 max-w-[1500px] flex-col animate-slide-up md:h-[88vh] md:overflow-hidden"
          style={{
            background:
              'radial-gradient(circle at 15% 10%, rgba(var(--tj-tech-blue), 0.18), transparent 31%), radial-gradient(circle at 85% 20%, rgba(var(--tj-accent-primary), 0.10), transparent 28%), linear-gradient(90deg, rgba(var(--tj-tech-blue), 0.055) 1px, transparent 1px), linear-gradient(180deg, rgba(var(--tj-tech-blue), 0.045) 1px, transparent 1px), linear-gradient(135deg, rgb(var(--tj-bg-primary)), rgb(var(--tj-bg-secondary)) 44%, rgb(var(--tj-bg-primary)))',
            backgroundSize: 'auto, auto, 44px 44px, 44px 44px, auto',
            boxShadow:
              '0 24px 70px rgba(var(--tj-shadow), 0.55), inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28), inset 0 0 0 2px rgba(var(--tj-accent-primary), 0.04)',
            clipPath: shellClip,
          }}
        >
        <header
          className="relative flex shrink-0 items-center justify-between gap-3 overflow-hidden px-4 py-3 md:px-6"
          style={{
borderBottom: '1px solid rgba(var(--tj-border), 0.20)',
  background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.10), transparent 42%), rgba(var(--tj-surface), 0.82)',
          }}
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'linear-gradient(110deg, transparent 0 42%, rgba(var(--tj-accent-primary), 0.12) 47%, transparent 52%), radial-gradient(circle at 76% 0%, rgba(var(--tj-accent-primary), 0.08), transparent 28%)',
            }}
          />
          <div className="relative min-w-0">
            <div className="font-serif text-[11px] tracking-[0.28em]" style={{ color: 'rgba(var(--tj-accent-primary),0.82)' }}>
              SAVE TREE CONTROL
            </div>
            <h2
              className="mt-1 min-w-0 truncate font-serif text-xl font-bold tracking-[0.22em] md:tracking-[0.32em]"
              style={{ color: 'rgba(var(--tj-accent-secondary),1)' }}
            >
              存档树控制台
            </h2>
          </div>
          <div className="relative hidden min-w-0 flex-1 justify-end gap-3 text-right font-serif text-[12px] tracking-[0.12em] md:flex">
            <span style={{ color: 'rgba(var(--tj-text-primary), 0.66)' }}>
              {latestSave ? `最新节点 #${latestSave.id} / 第 ${latestSave.turnCount} 回合` : '暂无节点'}
            </span>
            {repairingSummaries && <span style={{ color: 'rgba(var(--tj-accent-primary),0.9)' }}>索引恢复中</span>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="relative h-9 w-9 shrink-0 text-lg transition-all hover:opacity-90"
            aria-label="关闭"
            style={{
              color: 'rgba(var(--tj-text-primary),0.78)',
              background: 'rgba(var(--tj-accent-primary),0.07)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
              clipPath: smallClip,
            }}
          >
            ×
          </button>
        </header>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto md:grid md:grid-cols-[320px_minmax(0,1fr)_270px] md:overflow-hidden">
          <aside
            className="hidden w-full flex-shrink-0 flex-col md:flex md:min-h-0 md:w-auto md:flex-col md:gap-4 md:overflow-y-auto md:px-5 md:py-5 md:pb-6 md:pr-4"
            style={{
              borderRight: '1px solid rgba(var(--tj-accent-primary),0.18)',
              background: 'radial-gradient(circle at 0 0, rgba(var(--tj-accent-primary),0.12), transparent 34%), rgba(var(--tj-bg-primary), 0.62)',
            }}
          >
            <div className="flex flex-col gap-4">
              <div className="grid gap-2">
                <SaveActionButton onClick={handleImport} disabled={importing}>
                  {importing ? '导入中' : '导入存档包'}
                </SaveActionButton>
                <SaveActionButton onClick={handleExportCurrent} disabled={saving}>
                  导出当前节点
                </SaveActionButton>
                <SaveActionButton warn onClick={handleRepairList} disabled={loading}>
                  {loading ? '修复中' : '修复存档索引'}
                </SaveActionButton>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <SaveMetric value={displaySaves.length} label="总节点" />
                <SaveMetric value={totalBranches} label="分支" />
                <SaveMetric value={autoSaves.length} label="自动" />
                <SaveMetric value={importedSaves.length} label="导入" />
              </div>

              <div className="mt-4">
                <MiniSaveTreeMap
                  nodeCount={displaySaves.length}
                  branchCount={totalBranches}
                  sizeText={格式化存档体积(totalSizeBytes)}
                />
              </div>

              <div
                className="mt-4 px-3 py-3 font-serif text-[12px] leading-relaxed tracking-wider"
                style={{
                  color: 'rgba(var(--tj-text-primary),0.82)',
                  background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.52), rgba(var(--tj-accent-secondary),0.48))',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
                  clipPath: cardClip,
                }}
              >
                <div className="mb-1.5 text-[11px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.86)' }}>
                  存档策略
                </div>
                <div>存档树数量不限，不会因树数量清理旧存档</div>
                <div>每回合封版晋升新节点，自动节点最多 6 个</div>
                <div>导入存档不计入自动节点上限</div>
                <div>历史恢复点已停止新建，可在列表中手动清理</div>
                <div>读取检查点会生成新分支；读取叶子切换工作区</div>
                <div>整树导出会带走当前旅程分叉</div>
              </div>

              <div className="flex-1" />

              <div className="mt-4 text-center font-serif text-[12px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-text-primary),0.46)' }}>
                共 {displaySaves.length} 节点 / {allTreeGroups.length} 棵树
                {repairingSummaries ? ` / 正在恢复 ${pendingSummaryCount} 个节点目录` : ''}
              </div>
            </div>
          </aside>

          <main className="flex min-w-0 flex-col md:min-h-0 md:flex-1 md:overflow-hidden">
            <div className="md:hidden flex flex-col">
              <div className="flex gap-1.5 px-3 pb-1.5 pt-2.5">
                <SaveActionButton size="sm" onClick={handleImport} disabled={importing} className="flex-1 min-w-0">
                  {importing ? '导入中' : '导入'}
                </SaveActionButton>
                <SaveActionButton size="sm" onClick={handleExportCurrent} disabled={saving} className="flex-1 min-w-0">
                  导出
                </SaveActionButton>
                <SaveActionButton warn size="sm" onClick={handleRepairList} disabled={loading} className="flex-1 min-w-0">
                  {loading ? '修复中' : '修复'}
                </SaveActionButton>
              </div>
              {visibleTreeGroups.length > 0 && (
                <MobileSaveTreeStrip
                  groups={visibleTreeGroups}
                  selectedRootId={selectedTree?.rootId ?? null}
                  onSelect={setSelectedRootId}
                />
              )}
            </div>
            <div
              className="flex flex-shrink-0 flex-col gap-2 px-3 pb-2 pt-3 md:px-5 md:pb-3 md:pt-4 lg:flex-row lg:items-center lg:justify-between"
              style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary),0.14)' }}
            >
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                <TabButton label="全部" count={visibleSaves.length} active={tab === 'all'} onClick={() => setTab('all')} />
                <TabButton label="自动" count={autoSaves.length} active={tab === 'auto'} onClick={() => setTab('auto')} />
                <TabButton label="导入" count={importedSaves.length} active={tab === 'imported'} onClick={() => setTab('imported')} />
              </div>
              <div className="font-serif text-[12px] tracking-[0.12em] md:block hidden" style={{ color: 'rgba(var(--tj-text-primary),0.58)' }}>
                当前视图：{visibleTreeGroups.length} 棵树 / {visibleNodeCount} 节点
                {selectedTree ? ` / 当前树 #${selectedTree.latestSave.id}` : ''}
              </div>
            </div>

            <div className="kaituo-options-scroll relative overflow-x-hidden px-4 py-4 pb-7 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-5">
              {loading && displaySaves.length === 0 && <EmptyState text="加载中..." />}

              {repairingSummaries && (
                <div
                  className="mb-3 px-3 py-2 text-center font-serif text-[12px] tracking-[0.14em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary),0.92)',
                    background: 'rgba(var(--tj-accent-primary),0.08)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
                    clipPath: smallClip,
                  }}
                >
                  {repairState.phase === 'paused-for-write'
                    ? '索引恢复已暂停，正在优先保存或删除'
                    : `正在恢复节点详情 ${repairState.processed} / ${Math.max(repairState.total, pendingSummaryCount)}`}
                </div>
              )}

              {!repairingSummaries && unreadableSummaryCount > 0 && (
                <div
                  className="mb-3 px-3 py-2 text-center font-serif text-[12px] tracking-[0.12em]"
                  style={{
                    color: 'rgba(var(--tj-danger),0.9)',
                    background: 'rgba(var(--tj-danger),0.08)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.2)',
                    clipPath: smallClip,
                  }}
                >
                  {unreadableSummaryCount} 个节点详情读取失败，可使用“修复存档索引”重试
                </div>
              )}

              {legacyBackups.length > 0 && (
                <LegacyBackupSection
                  backups={legacyBackups}
                  loadingId={loadingId}
                  deletingId={deletingId}
                  deletingAll={deletingLegacyBackups}
                  onLoad={(id) => void handleLoad(id)}
                  onBranch={(id) => void handleBranch(id)}
                  onDelete={(id) => void handleDelete(id)}
                  onExport={(id) => void handleExport(id)}
                  onDeleteAll={() => void handleDeleteLegacyBackups()}
                />
              )}

              {!loading && loadError && (
                <div
                  className="p-5 text-center font-serif"
                  style={{
                    background: 'rgba(var(--tj-danger), 0.28)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.25)',
                    clipPath: cardClip,
                  }}
                >
                  <div className="text-sm tracking-[0.18em]" style={{ color: 'rgba(var(--tj-danger),0.92)' }}>
                    存档列表读取失败
                  </div>
                  <div className="mt-2 text-xs leading-relaxed tracking-wider" style={{ color: 'rgba(var(--tj-text-primary),0.72)' }}>
                    {loadError}
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <SaveActionButton onClick={() => void refresh()}>重新读取</SaveActionButton>
                    <SaveActionButton primary onClick={handleRepairList} disabled={loading}>
                      修复摘要
                    </SaveActionButton>
                  </div>
                </div>
              )}

              {!loading && !loadError && visibleTreeGroups.length === 0 && (
                <EmptyState
                  text={
                    tab === 'auto'
                      ? '暂无自动存档'
                      : tab === 'imported'
                        ? '暂无导入存档'
                        : '暂无存档'
                  }
                  detail={tab === 'all' ? undefined : '推进旅程后，新的节点会显示在这里。'}
                />
              )}

              {selectedTree && (
                <div className="space-y-4">
                  <SaveTreeGroup
                    key={selectedTree.rootId}
                    group={selectedTree}
                    loadingId={loadingId}
                    deletingId={deletingId}
                    deletingRootId={deletingRootId}
                    onLoad={(id) => void handleLoad(id)}
                    onBranch={(id) => void handleBranch(id)}
                    onDelete={(id) => void handleDelete(id)}
                    onExport={(id) => void handleExport(id)}
                    onExportTree={(rootId) => void handleExportTree(rootId)}
                    onDeleteTree={(rootId, nodeCount) => void handleDeleteTree(rootId, nodeCount)}
                    catalogComplete={catalogComplete}
                  />
                </div>
              )}
            </div>
          </main>

          <aside
            className="hidden min-h-0 min-w-0 flex-col px-4 py-4 md:flex md:px-4 md:py-5"
            style={{
              borderLeft: '1px solid rgba(var(--tj-accent-primary),0.18)',
              background: 'radial-gradient(circle at 100% 0, rgba(var(--tj-accent-primary),0.10), transparent 36%), rgba(var(--tj-panel-bg-end),0.48)',
            }}
          >
            <SaveTreeSelector
              groups={visibleTreeGroups}
              selectedRootId={selectedTree?.rootId ?? null}
              onSelect={setSelectedRootId}
            />
          </aside>
        </div>
      </div>
    </div>
  );
}
