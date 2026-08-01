import { useEffect, useMemo, useState } from 'react';
import {
  deleteLegacyBackupSaves,
  deleteSave,
  deleteSaveTree,
  exportSavePackage,
  exportSaveTreePackage,
  getSaveCatalogRepairState,
  getSaveCatalogSnapshot,
  importSaveFileAsMany,
  loadSave,
  loadSaveTree,
  repairSaveDatabase,
  saveGame,
  startSaveCatalogRepair,
  subscribeSaveCatalogRepair,
  type SaveCatalogRepairState,
  type SaveListItemSummary,
} from '@/services/dbService';
import { clearActiveSaveTreeMetaIfMatches } from '@/hooks/useGame/saveLoadWorkflow';
import { buildSaveTreeGroups, type SaveTreeDisplayGroup } from '@/utils/saveTreeView';

interface Props {
  onSave: () => Promise<number>;
  onContinue: () => Promise<boolean>;
  onLoadSave: (id: number) => Promise<boolean>;
}

type Filter = 'all' | 'manual' | 'auto' | 'imported';

const cardClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function StorageManagerTab({ onSave, onContinue, onLoadSave }: Props) {
  const [saves, setSaves] = useState<SaveListItemSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingRootId, setDeletingRootId] = useState<string | null>(null);
  const [deletingLegacyBackups, setDeletingLegacyBackups] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [loadError, setLoadError] = useState('');
  const [legacyBackups, setLegacyBackups] = useState<SaveListItemSummary[]>([]);
  const [pendingSummaryCount, setPendingSummaryCount] = useState(0);
  const [unreadableSummaryCount, setUnreadableSummaryCount] = useState(0);
  const [catalogComplete, setCatalogComplete] = useState(true);
  const [repairState, setRepairState] = useState<SaveCatalogRepairState>(() => getSaveCatalogRepairState());
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

  const refresh = async () => {
    setLoadError('');
    try {
      const snapshot = await getSaveCatalogSnapshot();
      setSaves(snapshot.items);
      setLegacyBackups(snapshot.legacyBackups);
      setPendingSummaryCount(snapshot.pendingIds.length);
      setUnreadableSummaryCount(snapshot.unreadableIds.length);
      setCatalogComplete(snapshot.catalogComplete);
      return snapshot;
    } catch (err) {
      console.error('[storage-manager] save list failed', err);
      setLoadError(err instanceof Error ? err.message : '存档列表读取失败');
    }
  };

  useEffect(() => {
    let cancelled = false;
    const loadAndRepair = async () => {
      try {
        const snapshot = await refresh();
        if (!cancelled && snapshot?.pendingIds.length) {
          await startSaveCatalogRepair('missing-only');
          if (!cancelled) await refresh();
        }
      } catch (err) {
        console.warn('[storage-manager] background catalog recovery failed', err);
      }
    };
    void loadAndRepair();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => subscribeSaveCatalogRepair((state) => {
    setRepairState(state);
    if (state.phase === 'completed' || state.phase === 'partial-failure') {
      void refresh();
    }
  }), []);

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

  const visibleSaves = useMemo(
    () => saves.filter((save) => save.id !== deletingId && save.saveTree?.rootId !== deletingRootId),
    [deletingId, deletingRootId, saves],
  );

  const grouped = useMemo(() => {
    const manual = visibleSaves.filter((s) => s.type === 'manual');
    const auto = visibleSaves.filter((s) => s.type === 'auto');
    const imported = visibleSaves.filter((s) => s.type === 'imported');
    return { manual, auto, imported };
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
      .map((group) => buildVisibleSaveTreeGroup(group, filter))
      .filter((group): group is SaveTreeDisplayGroup => Boolean(group)),
    [allTreeGroups, filter],
  );
  const selectedTree =
    visibleTreeGroups.find((group) => group.rootId === selectedRootId) ??
    visibleTreeGroups[0] ??
    null;

  useEffect(() => {
    if (filter !== 'all' && visibleSaves.length > 0 && visibleTreeGroups.length === 0) {
      setFilter('all');
    }
  }, [filter, visibleSaves.length, visibleTreeGroups.length]);

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
    if (!confirm('读取这个存档会替换当前未保存的进度，是否继续？')) return;
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
    const target = [...saves, ...legacyBackups].find((save) => save.id === id)?.saveTree;
    setDeletingId(id);
    setSaves((prev) => prev.filter((save) => save.id !== id));
    setLegacyBackups((prev) => prev.filter((save) => save.id !== id));
    try {
      await deleteSave(id);
      clearActiveSaveTreeMetaIfMatches(target ? { nodeId: target.nodeId } : null);
      setDeletingId(null);
      void refresh();
    } catch (err) {
      console.error('[storage-manager] delete failed', err);
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
      await deleteLegacyBackupSaves();
      for (const backup of legacyBackups) {
        clearActiveSaveTreeMetaIfMatches(backup.saveTree ? { nodeId: backup.saveTree.nodeId } : null);
      }
      await refresh();
    } catch (err) {
      console.error('[storage-manager] legacy backup cleanup failed', err);
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
      await deleteSaveTree(rootId);
      clearActiveSaveTreeMetaIfMatches({ rootId });
      setDeletingRootId(null);
      void refresh();
    } catch (err) {
      console.error('[storage-manager] delete tree failed', err);
      alert(`删除整树失败：${err instanceof Error ? err.message : '存档树删除过程异常'}`);
      await refresh();
      setDeletingRootId(null);
    }
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
        setFilter('imported');
      } catch (err) {
        alert(`导入失败：${err instanceof Error ? err.message : '存档文件格式无效'}`);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  return (
    <div
      className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-x-hidden p-1"
      style={{
        background:
          'radial-gradient(circle at 12% 0%, rgba(var(--tj-tech-cyan-deep),0.14), transparent 30%), linear-gradient(90deg, rgba(var(--tj-tech-cyan),0.035) 1px, transparent 1px), linear-gradient(180deg, rgba(var(--tj-tech-cyan),0.028) 1px, transparent 1px)',
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
          <FilterButton label="全部" count={visibleSaves.length} active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterButton label="手动" count={grouped.manual.length} active={filter === 'manual'} onClick={() => setFilter('manual')} />
          <FilterButton label="自动" count={grouped.auto.length} active={filter === 'auto'} onClick={() => setFilter('auto')} />
          <FilterButton label="导入存档" count={grouped.imported.length} active={filter === 'imported'} onClick={() => setFilter('imported')} />
        </div>
      </div>

      <div
        className="grid grid-cols-2 gap-3 px-3 py-3 text-center font-serif text-[12px] tracking-[0.18em] lg:grid-cols-4"
        style={{
          color: 'rgba(var(--tj-text-primary),0.82)',
          background: 'rgba(var(--tj-tech-cyan),0.055)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.13)',
          clipPath: cardClip,
        }}
      >
        <Metric label="手动" value={grouped.manual.length} />
        <Metric label="自动" value={grouped.auto.length} />
        <Metric label="导入存档" value={grouped.imported.length} />
        <Metric label="总计" value={saves.length} />
      </div>

      <div
        className="px-3 py-2 font-serif text-[12px] leading-relaxed tracking-wider"
        style={{
          color: 'rgba(var(--tj-text-primary),0.68)',
          background: 'rgba(var(--tj-panel-bg-start),0.42)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.12)',
          clipPath: cardClip,
        }}
      >
        存档与设置保存在当前浏览器的 IndexedDB 中。导出存档包默认不包含 API Key / API 配置；导入存档包 / 旧 JSON 会放入导入存档分区。
        {repairingSummaries
          ? repairState.phase === 'paused-for-write'
            ? ' 索引恢复已暂停，正在优先保存或删除。'
            : ` 正在恢复节点详情 ${repairState.processed}/${Math.max(repairState.total, pendingSummaryCount)}。`
          : ''}
        {!repairingSummaries && unreadableSummaryCount > 0 ? ` ${unreadableSummaryCount} 个节点详情读取失败，可使用修复摘要重试。` : ''}
      </div>

      <div className="kaituo-options-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pb-5 pr-1">
        {legacyBackups.length > 0 && (
          <StorageLegacyBackupSection
            backups={legacyBackups}
            loadingId={loadingId}
            deletingId={deletingId}
            deletingAll={deletingLegacyBackups}
            onLoad={handleLoad}
            onExport={handleExport}
            onDelete={handleDelete}
            onDeleteAll={handleDeleteLegacyBackups}
          />
        )}
        {loadError ? (
          <div
            className="p-5 text-center font-serif"
            style={{
              color: 'rgba(var(--tj-text-secondary), 0.82)',
              background: 'rgba(var(--tj-danger), 0.28)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.25)',
              clipPath: cardClip,
            }}
          >
            <div className="text-sm tracking-[0.18em]" style={{ color: 'rgba(var(--tj-danger),0.92)' }}>
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
              color: 'rgba(var(--tj-text-primary),0.72)',
              background: 'rgba(var(--tj-panel-bg-start),0.46)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.15)',
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
                deletingId={deletingId}
                deletingRootId={deletingRootId}
                onLoad={handleLoad}
                onExport={handleExport}
                onExportTree={handleExportTree}
                onDelete={handleDelete}
                onDeleteTree={handleDeleteTree}
                catalogComplete={catalogComplete}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StorageLegacyBackupSection({
  backups,
  loadingId,
  deletingId,
  deletingAll,
  onLoad,
  onExport,
  onDelete,
  onDeleteAll,
}: {
  backups: SaveListItemSummary[];
  loadingId: number | null;
  deletingId: number | null;
  deletingAll: boolean;
  onLoad: (id: number) => void;
  onExport: (id: number) => void;
  onDelete: (id: number) => void;
  onDeleteAll: () => void;
}) {
  return (
    <details
      className="mb-3 overflow-hidden"
      style={{
        background: 'rgba(var(--tj-tech-cyan),0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.15)',
        clipPath: cardClip,
      }}
    >
      <summary className="cursor-pointer px-4 py-3 font-serif text-[13px] tracking-[0.16em]" style={{ color: 'rgb(var(--tj-accent-secondary))' }}>
        历史恢复点 {backups.length} 个
      </summary>
      <div className="space-y-3 border-t px-3 pb-3 pt-3" style={{ borderColor: 'rgba(var(--tj-tech-cyan),0.12)' }}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] leading-relaxed tracking-wider" style={{ color: 'rgba(var(--tj-text-primary),0.62)' }}>
          <span>旧版本读档前自动创建的恢复点已停止新增，可按需读取、导出或清理。</span>
          <ActionButton
            label={deletingAll ? '清理中' : '清理全部旧恢复点'}
            disabled={deletingAll || loadingId !== null || deletingId !== null}
            onClick={onDeleteAll}
          />
        </div>
        {backups.map((backup) => (
          <SaveCard
            key={backup.id}
            save={backup}
            loadingId={loadingId}
            deletingId={deletingId}
            onLoad={onLoad}
            onExport={onExport}
            onDelete={onDelete}
            treeLabel="旧恢复点"
          />
        ))}
      </div>
    </details>
  );
}

function StorageSaveTreeGroup({
  group,
  loadingId,
  deletingId,
  deletingRootId,
  onLoad,
  onExport,
  onExportTree,
  onDelete,
  onDeleteTree,
  catalogComplete,
}: {
  group: SaveTreeDisplayGroup;
  loadingId: number | null;
  deletingId: number | null;
  deletingRootId: string | null;
  onLoad: (id: number) => void;
  onExport: (id: number) => void;
  onExportTree: (rootId: string) => void;
  onDelete: (id: number) => void;
  onDeleteTree: (rootId: string, nodeCount: number) => void;
  catalogComplete: boolean;
}) {
  return (
    <section
      className="min-w-0 p-2"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-panel-bg-start),0.52), rgba(var(--tj-panel-bg-end),0.56))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-2 py-1.5 font-serif">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            <span className="text-[11px] tracking-[0.18em]" style={{ color: 'rgb(var(--tj-tech-cyan))' }}>
              存档树
            </span>
            <span className="truncate text-[14px] font-bold tracking-wider" style={{ color: 'rgb(var(--tj-accent-secondary))' }}>
              {group.latestSave.travelerName || group.rootSave.travelerName || '未命名旅人'}
            </span>
            <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
              最新 #{group.latestSave.id}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tracking-wider" style={{ color: 'rgba(var(--tj-text-primary),0.58)' }}>
            <span>{group.nodeCount} 个节点</span>
            <span>{group.branchCount} 个分支</span>
            <span>{formatSize(group.totalSizeBytes)}</span>
          </div>
        </div>
        <div className="text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.82)' }}>
          第 {group.latestSave.turnCount} 回合
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!catalogComplete || loadingId !== null || deletingRootId !== null || deletingId !== null}
            onClick={() => onExportTree(group.rootId)}
            className="px-2.5 py-1 font-serif text-[11px] tracking-[0.14em] transition-all hover:opacity-90 disabled:opacity-50"
            style={{
              color: 'rgba(var(--tj-tech-cyan), 0.92)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.28)',
              clipPath: smallClip,
            }}
          >
            导出整树
          </button>
          <button
            type="button"
            disabled={!catalogComplete || loadingId !== null || deletingRootId !== null || deletingId !== null}
            onClick={() => onDeleteTree(group.rootId, group.nodeCount)}
            className="px-2.5 py-1 font-serif text-[11px] tracking-[0.14em] transition-all hover:opacity-90 disabled:opacity-50"
            style={{
              color: 'rgba(var(--tj-danger), 0.92)',
              background: 'rgba(var(--tj-danger), 0.07)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger), 0.28)',
              clipPath: smallClip,
            }}
          >
            {deletingRootId === group.rootId ? '删除中' : catalogComplete ? '删除整树' : '目录恢复后可删'}
          </button>
        </div>
      </div>
      <div className="relative space-y-2 pl-5">
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-[7px] top-2 w-px"
          style={{ background: 'linear-gradient(rgb(var(--tj-tech-cyan)), rgba(var(--tj-tech-cyan),0.08))' }}
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
                    background: 'rgba(var(--tj-tech-cyan),0.32)',
                  }}
                />
              )}
              <SaveCard
                save={node.save}
                loadingId={loadingId}
                deletingId={deletingId}
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
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.12)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium tracking-[0.22em]" style={{ color: 'rgba(var(--tj-tech-cyan),0.86)' }}>
          存档树列表
        </h3>
        <span className="text-[11px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
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
                  ? 'linear-gradient(90deg, rgba(var(--tj-tech-cyan),0.18), rgba(var(--tj-tech-cyan-deep),0.06))'
                  : 'rgba(var(--tj-tech-cyan),0.045)',
                boxShadow: active
                  ? 'inset 3px 0 0 rgb(var(--tj-tech-cyan)), inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.32)'
                  : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.12)',
                clipPath: smallClip,
              }}
            >
              <div className="flex min-w-0 items-center justify-between gap-2">
                <span
                  className="truncate text-[13px] font-semibold tracking-[0.12em]"
                  style={{ color: active ? 'rgb(var(--tj-accent-secondary))' : 'rgba(var(--tj-text-primary),0.78)' }}
                >
                  {title}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color: active ? 'rgb(var(--tj-tech-cyan))' : 'rgba(var(--tj-text-primary),0.42)' }}>
                  #{group.latestSave.id}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] tracking-[0.1em]" style={{ color: 'rgba(var(--tj-text-primary),0.54)' }}>
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
        color: tone === 'primary' ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-tech-cyan),0.92)',
        background: tone === 'primary'
          ? 'linear-gradient(135deg, rgb(var(--tj-btn-primary-start)), rgb(var(--tj-btn-primary-end)))'
          : 'rgba(var(--tj-tech-cyan),0.07)',
        boxShadow: tone === 'primary'
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.55), 0 0 18px rgba(var(--tj-tech-cyan-deep),0.20)'
          : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.24)',
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
        color: active ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-text-primary),0.70)',
        background: active
          ? 'linear-gradient(135deg, rgb(var(--tj-tech-cyan)), rgb(var(--tj-tech-cyan-deep)))'
          : 'rgba(var(--tj-tech-cyan),0.05)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.55), 0 0 22px rgba(var(--tj-tech-cyan-deep),0.22)'
          : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.15)',
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
      <div className="text-[11px]" style={{ color: 'rgba(var(--tj-text-primary),0.52)' }}>{label}</div>
      <div className="mt-0.5 text-base font-bold" style={{ color: 'rgb(var(--tj-tech-cyan))' }}>{value}</div>
    </div>
  );
}

function SaveCard({
  save,
  loadingId,
  deletingId,
  onLoad,
  onExport,
  onDelete,
  treeLabel,
  isLatest = false,
}: {
  save: SaveListItemSummary;
  loadingId: number | null;
  deletingId: number | null;
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
          ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan),0.18), rgba(var(--tj-accent-primary),0.09)), rgba(var(--tj-panel-bg-start),0.92)'
          : 'rgba(var(--tj-panel-bg-start),0.74)',
        boxShadow: isLatest
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.46), inset 0 0 0 2px rgba(var(--tj-tech-cyan),0.08), 0 0 28px rgba(var(--tj-tech-cyan),0.10), 0 0 22px rgba(var(--tj-accent-primary),0.08)'
          : 'inset 0 0 0 1px rgba(var(--tj-tech-cyan),0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`font-serif tracking-[0.16em] ${isLatest ? 'text-[12px]' : 'text-[11px]'}`} style={{ color: typeColor(save.type) }}>
            {typeLabel(save.type)}
          </span>
          <span className={`font-serif font-bold tracking-wider ${isLatest ? 'text-[17px]' : 'text-[15px]'}`} style={{ color: 'rgb(var(--tj-accent-secondary))' }}>
            {save.travelerName || '未命名旅人'}
          </span>
          <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>#{save.id}</span>
          {treeLabel && (
            <span
              className="px-1.5 py-0.5 text-[10px] font-serif tracking-[0.12em]"
              style={{
                color: 'rgba(var(--tj-tech-cyan), 0.92)',
                background: 'rgba(var(--tj-tech-cyan), 0.09)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.25)',
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
                color: 'rgb(var(--tj-accent-primary))',
                background: 'rgba(var(--tj-accent-primary),0.08)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
                clipPath: smallClip,
              }}
            >
              最新
            </span>
          )}
        </div>
        <div className={`flex flex-wrap gap-x-3 gap-y-1 font-serif tracking-wider ${isLatest ? 'mt-2 text-[13px]' : 'mt-1 text-[12px]'}`} style={{ color: 'rgba(var(--tj-text-primary),0.78)' }}>
          <span style={{ color: 'rgb(var(--tj-tech-cyan))' }}>第 {save.turnCount} 回合</span>
          <span>{[save.currentDate, save.currentTime, save.currentLocation].filter(Boolean).join(' / ') || save.worldPeriodName || '未知坐标'}</span>
          <span>{new Date(save.timestamp).toLocaleString('zh-CN')}</span>
          <span>{formatSize(save.sizeBytes)}</span>
        </div>
        {save.lastSummary && (
          <div className={`leading-relaxed ${isLatest ? 'mt-2 line-clamp-3 text-[13px]' : 'mt-1.5 line-clamp-2 text-[12px]'}`} style={{ color: 'rgba(var(--tj-text-primary),0.62)' }}>
            {save.lastSummary}
          </div>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
        <ActionButton label={loadingId === save.id ? '读取中' : '读取'} disabled={loadingId !== null || deletingId !== null} onClick={() => onLoad(save.id)} />
        <ActionButton label="导出" disabled={loadingId !== null || deletingId !== null} onClick={() => onExport(save.id)} />
        <button
          type="button"
          disabled={loadingId !== null || deletingId !== null}
          onClick={() => onDelete(save.id)}
          className="w-full cursor-pointer px-3 py-2 text-[12px] font-serif tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          style={{
            color: 'rgba(var(--tj-danger),0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.28)',
            clipPath: smallClip,
          }}
        >
          {deletingId === save.id ? '删除中' : '删除'}
        </button>
      </div>
    </div>
  );
}

function typeLabel(type: SaveListItemSummary['type']): string {
  if (type === 'auto') return '自动';
  if (type === 'backup') return '恢复点';
  if (type === 'imported') return '导入';
  return '手动';
}

function typeColor(type: SaveListItemSummary['type']): string {
  if (type === 'auto') return 'rgba(var(--tj-tech-cyan), 0.86)';
  if (type === 'backup') return 'rgba(var(--tj-tech-cyan), 0.9)';
  if (type === 'imported') return 'rgba(var(--tj-ui-success), 0.9)';
  return 'rgba(var(--tj-tech-cyan), 0.9)';
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function matchesSaveFilter(save: SaveListItemSummary, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'manual') return save.type === 'manual';
  if (filter === 'auto') return save.type === 'auto';
  return save.type === 'imported';
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
