import { useEffect, useMemo, useState } from 'react';
import {
  deleteLegacyBackupSaves,
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
import { clearActiveSaveTreeMetaIfMatches, resolve存档删除目标, delete存档目标, type 存档删除目标 } from '@/hooks/useGame/saveLoadWorkflow';
import { buildSaveTreeGroups, type SaveTreeDisplayGroup } from '@/utils/saveTreeView';

interface Props {
  showAutoArchives: boolean;
  onSave: () => Promise<number>;
  onContinue: () => Promise<boolean>;
  onLoadSave: (id: number) => Promise<boolean>;
}

type Filter = 'all' | 'manual' | 'auto' | 'imported';

const cardClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function StorageManagerTab({ showAutoArchives, onSave, onContinue, onLoadSave }: Props) {
  const [saves, setSaves] = useState<SaveListItemSummary[]>([]);
  const [legacyBackups, setLegacyBackups] = useState<SaveListItemSummary[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deletingRootId, setDeletingRootId] = useState<string | null>(null);
  const [repairState, setRepairState] = useState<SaveCatalogRepairState>(() => getSaveCatalogRepairState());

  const refresh = async () => {
    setLoadError('');
    try {
      const snapshot = await getSaveCatalogSnapshot();
      setSaves(snapshot.items);
      setLegacyBackups(snapshot.legacyBackups);
      return snapshot;
    } catch (error) {
      console.error('[storage-manager] save list failed', error);
      setLoadError(error instanceof Error ? error.message : '存档列表读取失败');
      return null;
    }
  };

  useEffect(() => {
    const cancelledRef: { current: boolean } = { current: false };
    const isCancelled = (): boolean => cancelledRef.current;
    void (async () => {
      const snapshot = await refresh();
      if (!isCancelled() && snapshot?.pendingIds.length) {
        await startSaveCatalogRepair('missing-only');
        if (!isCancelled()) await refresh();
      }
    })();
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  useEffect(() => subscribeSaveCatalogRepair((state) => {
    setRepairState(state);
    if (state.phase === 'completed' || state.phase === 'partial-failure') void refresh();
  }), []);

  const displaySaves = useMemo(
    () => showAutoArchives ? saves : saves.filter((save) => save.type !== 'auto'),
    [saves, showAutoArchives],
  );
  const visibleSaves = useMemo(
    () => displaySaves.filter((save) => filter === 'all' || save.type === filter),
    [displaySaves, filter],
  );
  const treeGroups = useMemo(() => buildSaveTreeGroups(visibleSaves), [visibleSaves]);
  const selectedTree = treeGroups.find((group) => group.rootId === selectedRootId) ?? treeGroups.at(0) ?? null;
  const repairing = repairState.phase === 'checking'
    || repairState.phase === 'waiting-for-lease'
    || repairState.phase === 'repairing'
    || repairState.phase === 'paused-for-write';

  const handleSave = async () => {
    setBusy(true);
    try {
      await onSave();
      await refresh();
      setFilter('manual');
    } finally {
      setBusy(false);
    }
  };

  const handleContinue = async () => {
    setBusy(true);
    try {
      if (!(await onContinue())) alert('没有可用的存档');
    } catch (error) {
      alert(`读取失败：${error instanceof Error ? error.message : '存档读取或恢复过程异常'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleLoad = async (id: number) => {
    if (!confirm('读取这个存档会替换当前未保存的进度，是否继续？')) return;
    setLoadingId(id);
    try {
      if (!(await onLoadSave(id))) alert('读取失败：没有读取到可用存档内容');
    } catch (error) {
      alert(`读取失败：${error instanceof Error ? error.message : '存档读取或恢复过程异常'}`);
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (id: number) => {
    const target = [...saves, ...legacyBackups].find((save) => save.id === id);
    let deleteTarget: 存档删除目标;
    try {
      deleteTarget = await resolve存档删除目标(target);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '存档删除过程异常');
      return;
    }
    const confirmMessage = deleteTarget.cascadeCount !== null && deleteTarget.cascadeCount > 1
      ? `确定删除这个存档及其子节点？将级联删除 ${deleteTarget.cascadeCount} 个存档，此操作不可恢复。`
      : '确定删除这个存档？此操作不可恢复。';
    if (!confirm(confirmMessage)) return;
    setDeletingId(id);
    try {
      await delete存档目标(id, deleteTarget);
      await refresh();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '存档删除过程异常');
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteTree = async (group: SaveTreeDisplayGroup) => {
    if (!confirm(`确定删除这整棵存档树？将删除 ${group.nodeCount} 个节点，此操作不可恢复。`)) return;
    setDeletingRootId(group.rootId);
    try {
      await deleteSaveTree(group.rootId);
      clearActiveSaveTreeMetaIfMatches({ rootId: group.rootId });
      await refresh();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '存档树删除过程异常');
    } finally {
      setDeletingRootId(null);
    }
  };

  const handleDeleteLegacyBackups = async () => {
    if (!legacyBackups.length || !confirm(`确定清理全部 ${legacyBackups.length} 个历史恢复点？此操作不可恢复。`)) return;
    setBusy(true);
    try {
      await deleteLegacyBackupSaves();
      await refresh();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '历史恢复点清理失败');
    } finally {
      setBusy(false);
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
      setBusy(true);
      try {
        const imported = await importSaveFileAsMany(file);
        const now = Date.now();
        for (const [index, data] of imported.entries()) {
          await saveGame({ ...data, id: 0, type: 'imported', timestamp: now + index });
        }
        await refresh();
        setFilter('imported');
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : '存档文件格式无效');
      } finally {
        setBusy(false);
      }
    };
    input.click();
  };

  const handleRepair = async () => {
    setBusy(true);
    try {
      await repairSaveDatabase();
      await refresh();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : '存档摘要修复失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="grid gap-4">
      <header
        className="grid gap-3 p-4"
        style={{
          background: 'linear-gradient(135deg, rgba(var(--tj-panel-bg-end),0.88), rgba(var(--tj-surface-bg-start),0.72))',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.2)',
          clipPath: cardClip,
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[11px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.86)' }}>
              存档管理
            </div>
            <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.75)' }}>
              存档、设置与资源均保存在当前浏览器的本地数据中。
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton label={busy ? '处理中' : '保存当前进度'} onClick={() => void handleSave()} disabled={busy} primary />
            <ActionButton label={busy ? '处理中' : '继续游戏'} onClick={() => void handleContinue()} disabled={busy} />
            <ActionButton label="导入存档" onClick={handleImport} disabled={busy} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'manual', 'auto', 'imported'] as Filter[]).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className="cursor-pointer px-3 py-1 text-[11px]"
              style={{
                color: filter === value ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-text-secondary),0.78)',
                background: filter === value ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary),0.05)',
                clipPath: smallClip,
              }}
            >
              {{ all: '全部', manual: '手动', auto: '自动', imported: '导入' }[value]}
            </button>
          ))}
        </div>
      </header>

      {loadError && (
        <div className="p-3 text-xs" style={{ color: 'rgba(var(--tj-danger),0.92)', background: 'rgba(var(--tj-danger),0.08)' }}>
          {loadError}
        </div>
      )}

      {repairing && (
        <div className="text-xs" style={{ color: 'rgba(var(--tj-accent-primary),0.84)' }}>
          正在修复存档索引：{repairState.processed}/{repairState.total}
        </div>
      )}

      {!treeGroups.length ? (
        <div className="p-6 text-center text-sm" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
          暂无符合条件的存档。
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.7fr)]">
          <div className="grid gap-2">
            {treeGroups.map((group) => (
              <SaveTreeCard
                key={group.rootId}
                group={group}
                selected={selectedTree?.rootId === group.rootId}
                deleting={deletingRootId === group.rootId}
                deletingId={deletingId}
                loadingId={loadingId}
                onSelect={() => setSelectedRootId(group.rootId)}
                onDeleteTree={() => void handleDeleteTree(group)}
                onLoad={(id) => void handleLoad(id)}
                onDelete={(id) => void handleDelete(id)}
                onExport={(id) => void handleExport(id)}
              />
            ))}
          </div>
          {selectedTree && (
            <div
              className="h-fit grid gap-2 p-3 text-xs"
              style={{
                background: 'rgba(var(--tj-panel-bg-end),0.62)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
                clipPath: cardClip,
              }}
            >
              <div className="tracking-[0.16em]" style={{ color: 'rgba(var(--tj-accent-primary),0.84)' }}>存档树</div>
              <MetaLine label="旅人" value={selectedTree.latestSave.travelerName || '未命名旅人'} />
              <MetaLine label="节点" value={`${selectedTree.nodeCount} 个`} />
              <MetaLine label="最近进度" value={selectedTree.latestSave.lastSummary || selectedTree.latestSave.currentLocation || '暂无摘要'} />
              <ActionButton label="导出整棵存档树" onClick={() => void handleExportTree(selectedTree.rootId)} />
              {legacyBackups.length > 0 && (
                <ActionButton label={`清理历史恢复点（${legacyBackups.length}）`} onClick={() => void handleDeleteLegacyBackups()} disabled={busy} />
              )}
              <ActionButton label="修复存档索引" onClick={() => void handleRepair()} disabled={busy} />
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SaveTreeCard({
  group,
  selected,
  deleting,
  deletingId,
  loadingId,
  onSelect,
  onDeleteTree,
  onLoad,
  onDelete,
  onExport,
}: {
  group: SaveTreeDisplayGroup;
  selected: boolean;
  deleting: boolean;
  deletingId: number | null;
  loadingId: number | null;
  onSelect: () => void;
  onDeleteTree: () => void;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
  onExport: (id: number) => void;
}) {
  return (
    <article
      className="grid gap-2 p-3"
      style={{
        background: selected ? 'rgba(var(--tj-accent-primary),0.08)' : 'rgba(var(--tj-panel-bg-end),0.5)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.14)',
        clipPath: cardClip,
      }}
    >
      <button type="button" className="cursor-pointer text-left" onClick={onSelect}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm" style={{ color: 'rgba(var(--tj-text-primary),0.9)' }}>
            {group.latestSave.travelerName || '未命名旅人'}
          </span>
          <span className="text-[11px]" style={{ color: 'rgba(var(--tj-accent-primary),0.8)' }}>
            {group.nodeCount} 节点
          </span>
        </div>
        <div className="mt-1 text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.72)' }}>
          {group.latestSave.currentLocation || group.latestSave.worldPeriodName || '未知位置'} · {formatTime(group.latestSave.timestamp)}
        </div>
      </button>
      <div className="grid gap-1">
        {group.nodes.map(({ save, depth, isLatest }) => (
          <div
            key={save.id}
            className="grid gap-2 p-2 sm:grid-cols-[minmax(0,1fr)_auto]"
            style={{
              marginLeft: `${depth * 12}px`,
              background: isLatest ? 'rgba(var(--tj-accent-primary),0.07)' : 'rgba(var(--tj-text-primary),0.025)',
              clipPath: smallClip,
            }}
          >
            <div className="min-w-0">
              <div className="truncate text-xs" style={{ color: 'rgba(var(--tj-text-primary),0.84)' }}>
                #{save.id} · {save.currentLocation || save.worldPeriodName || '未知位置'}
              </div>
              <div className="mt-1 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary),0.66)' }}>
                {save.lastSummary || '暂无摘要'} · 第 {save.turnCount} 回合
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              <MiniButton label={loadingId === save.id ? '读取中' : '读取'} onClick={() => onLoad(save.id)} disabled={loadingId !== null} />
              <MiniButton label="导出" onClick={() => onExport(save.id)} />
              <MiniButton label={deletingId === save.id ? '删除中' : '删除'} onClick={() => onDelete(save.id)} disabled={deletingId !== null} danger />
            </div>
          </div>
        ))}
      </div>
      {group.nodeCount > 1 && (
        <ActionButton label={deleting ? '删除中' : '删除整棵存档树'} onClick={onDeleteTree} disabled={deleting} danger />
      )}
    </article>
  );
}

function ActionButton({ label, onClick, disabled = false, primary = false, danger = false }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer px-3 py-2 text-[11px] transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        color: primary ? 'rgb(var(--tj-ui-active-text))' : danger ? 'rgba(var(--tj-danger),0.94)' : 'rgba(var(--tj-accent-primary),0.92)',
        background: primary ? 'rgb(var(--tj-accent-primary))' : danger ? 'rgba(var(--tj-danger),0.07)' : 'rgba(var(--tj-accent-primary),0.07)',
        boxShadow: `inset 0 0 0 1px ${danger ? 'rgba(var(--tj-danger),0.22)' : 'rgba(var(--tj-accent-primary),0.22)'}`,
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

function MiniButton({ label, onClick, disabled = false, danger = false }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer px-2 py-1 text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        color: danger ? 'rgba(var(--tj-danger),0.9)' : 'rgba(var(--tj-accent-primary),0.88)',
        background: danger ? 'rgba(var(--tj-danger),0.06)' : 'rgba(var(--tj-accent-primary),0.06)',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

function MetaLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[70px_minmax(0,1fr)] gap-2">
      <span style={{ color: 'rgba(var(--tj-text-secondary),0.62)' }}>{label}</span>
      <span className="min-w-0 break-words" style={{ color: 'rgba(var(--tj-text-primary),0.82)' }}>{value}</span>
    </div>
  );
}

function formatTime(timestamp: number): string {
  return new Date(timestamp || Date.now()).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
