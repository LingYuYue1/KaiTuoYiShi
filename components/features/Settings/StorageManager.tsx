import { useEffect, useMemo, useState } from 'react';
import {
  deleteSave,
  exportSavePackage,
  exportSaveTreePackage,
  getSaveList,
  importSaveFileAsMany,
  loadSave,
  loadSaveTree,
  repairSaveDatabase,
  rebuildSaveSummariesBatch,
  saveGame,
  type SaveListItemSummary,
} from '@/services/dbService';
import { buildSaveTreeGroups, type SaveTreeDisplayGroup } from '@/utils/saveTreeView';

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
        setFilter('protected');
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
  if (type === 'backup') return 'rgba(255, 190, 120, 0.9)';
  if (type === 'imported') return 'rgba(165, 230, 170, 0.9)';
  return 'rgba(245,217,122,0.9)';
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
