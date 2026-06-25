import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  onLoad: (id: number) => Promise<boolean>;
  onClose: () => void;
}

type Tab = 'all' | 'manual' | 'auto' | 'protected';

const shellClip =
  'polygon(18px 0, 100% 0, 100% calc(100% - 18px), calc(100% - 18px) 100%, 0 100%, 0 18px)';
const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function SaveLoadModal({ onSave, onLoad, onClose }: Props) {
  const [saves, setSaves] = useState<SaveListItemSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tab, setTab] = useState<Tab>('manual');
  const [showMobileHelp, setShowMobileHelp] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [rebuildingSummaries, setRebuildingSummaries] = useState(false);
  const [selectedRootId, setSelectedRootId] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await getSaveList();
      setSaves(list);
    } catch (err) {
      console.error('[save-list] load failed', err);
      setLoadError(err instanceof Error ? err.message : '存档列表读取失败');
    } finally {
      setLoading(false);
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
        console.warn('[save-list] background summary recovery failed', err);
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
      const list = await getSaveList();
      setSaves(list);
    } catch (err) {
      console.error('[save-list] repair failed', err);
      setLoadError(err instanceof Error ? err.message : '存档摘要修复失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      await refresh();
      setTab('manual');
    } catch (err) {
      console.error('[save] failed', err);
      alert('保存失败');
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
      setTab('manual');
    } catch (err) {
      console.error('[save-export-current] failed', err);
      alert('导出失败');
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = async (id: number) => {
    setLoadingId(id);
    try {
      const ok = await onLoad(id);
      if (!ok) alert('加载失败：没有读取到可用存档内容');
    } catch (err) {
      console.error('[save-load] load failed', err);
      alert(`加载失败：${err instanceof Error ? err.message : '存档读取或恢复过程异常'}`);
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
        setTab('protected');
      } catch (err) {
        console.error('[save-import] failed', err);
        alert(`导入失败：${err instanceof Error ? err.message : '存档文件格式无效'}`);
      } finally {
        setImporting(false);
      }
    };
    input.click();
  };

  const { manualSaves, autoSaves, protectedSaves } = useMemo(() => {
    const manual = saves.filter((s) => s.type === 'manual');
    const auto = saves.filter((s) => s.type === 'auto');
    const protectedItems = saves.filter((s) => s.type === 'backup' || s.type === 'imported');
    return { manualSaves: manual, autoSaves: auto, protectedSaves: protectedItems };
  }, [saves]);
  const allVisibleSaves = useMemo(() => saves.filter((s) => s.type !== 'auto'), [saves]);

  const allTreeGroups = useMemo(() => buildSaveTreeGroups(saves), [saves]);
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
  const latestSave = saves[0];
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

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div
      className="kaituo-modal-overlay fixed inset-0 z-50 flex items-stretch justify-center p-0 md:items-center md:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="flex h-[100dvh] w-full min-w-0 max-w-[1500px] flex-col animate-slide-up overflow-hidden md:h-[88vh]"
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
          className="relative flex items-center justify-between gap-3 overflow-hidden px-4 py-3 md:px-6"
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
            {rebuildingSummaries && <span style={{ color: 'rgba(var(--tj-accent-primary),0.9)' }}>索引恢复中</span>}
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

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden md:grid md:grid-cols-[320px_minmax(0,1fr)_270px] md:overflow-hidden">
          <aside
            className="kaituo-options-scroll grid w-full flex-shrink-0 grid-cols-2 gap-2 overflow-y-visible px-4 py-4 pb-6 md:flex md:min-h-0 md:w-auto md:flex-col md:gap-4 md:overflow-y-auto md:px-5 md:py-5 md:pb-6 md:pr-4"
            style={{
              borderRight: '1px solid rgba(var(--tj-accent-primary),0.18)',
              background: 'radial-gradient(circle at 0 0, rgba(var(--tj-accent-primary),0.12), transparent 34%), rgba(var(--tj-bg-primary), 0.62)',
            }}
          >
            <div className="col-span-2 grid gap-2">
              <SaveActionButton primary onClick={handleSave} disabled={saving}>
                {saving ? '保存中' : '保存新节点'}
              </SaveActionButton>
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

            <details
              open={showMobileHelp}
              onToggle={(event) => setShowMobileHelp(event.currentTarget.open)}
              className="col-span-2 md:hidden"
              style={{
                color: 'rgba(var(--tj-text-primary),0.84)',
                background: 'rgba(var(--tj-accent-secondary),0.62)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
                clipPath: cardClip,
              }}
            >
              <summary className="cursor-pointer px-3 py-2 font-serif text-[12px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.88)' }}>
                关于存档
              </summary>
              <div className="px-3 pb-3 font-serif text-[12px] leading-relaxed tracking-wider">
                <div>手动存档可随时保存，读取旧节点后会形成新的分支。</div>
                <div>自动节点优先使用差量存储，旧存档会在后台恢复摘要索引。</div>
                <div>导出存档包默认不包含 API Key / API 配置。</div>
              </div>
            </details>

            <div className="col-span-2 grid grid-cols-2 gap-2">
              <SaveMetric value={saves.length} label="总节点" />
              <SaveMetric value={totalBranches} label="分支" />
              <SaveMetric value={autoSaves.length} label="自动" />
              <SaveMetric value={protectedSaves.length} label="保护" />
            </div>

            <MiniSaveTreeMap
              nodeCount={saves.length}
              branchCount={totalBranches}
              sizeText={formatSize(totalSizeBytes)}
            />

            <div
              className="col-span-2 hidden px-3 py-3 font-serif text-[12px] leading-relaxed tracking-wider md:block"
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
              <div>手动节点最多保留 6 个，超出后清理最旧节点</div>
              <div>自动存档最多保留 6 棵树，并优先使用差量存储</div>
              <div>保护 / 导入存档不计入手动上限</div>
              <div>读取节点后继续保存会生成新分支</div>
              <div>整树导出会带走当前旅程分叉</div>
            </div>

            <div className="hidden flex-1 md:block" />

            <div className="col-span-2 hidden text-center font-serif text-[12px] tracking-[0.22em] md:block" style={{ color: 'rgba(var(--tj-text-primary),0.46)' }}>
              共 {saves.length} 节点 / {allTreeGroups.length} 棵树
              {rebuildingSummaries ? ' / 正在恢复旧存档索引' : ''}
            </div>
          </aside>

          <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div
              className="flex flex-shrink-0 flex-col gap-3 px-4 pb-3 pt-4 md:px-5 lg:flex-row lg:items-center lg:justify-between"
              style={{ borderBottom: '1px solid rgba(var(--tj-accent-primary),0.14)' }}
            >
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                <TabButton label="手动" count={manualSaves.length} active={tab === 'manual'} onClick={() => setTab('manual')} />
                <TabButton label="自动" count={autoSaves.length} active={tab === 'auto'} onClick={() => setTab('auto')} />
                <TabButton label="保护" count={protectedSaves.length} active={tab === 'protected'} onClick={() => setTab('protected')} />
                <TabButton label="全部" count={allVisibleSaves.length} active={tab === 'all'} onClick={() => setTab('all')} />
              </div>
              <div className="font-serif text-[12px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-primary),0.58)' }}>
                当前视图：{visibleTreeGroups.length} 棵树 / {visibleNodeCount} 节点
                {selectedTree ? ` / 当前树 #${selectedTree.latestSave.id}` : ''}
              </div>
            </div>

            <div className="kaituo-options-scroll relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-4 pb-7 md:px-5">
              {loading && saves.length === 0 && <EmptyState text="加载中..." />}

              {rebuildingSummaries && saves.length > 0 && (
                <div
                  className="mb-3 px-3 py-2 text-center font-serif text-[12px] tracking-[0.14em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary),0.92)',
                    background: 'rgba(var(--tj-accent-primary),0.08)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
                    clipPath: smallClip,
                  }}
                >
                  正在恢复旧存档索引，存档数量可能继续增加
                </div>
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
                    <SaveActionButton onClick={refresh}>重新读取</SaveActionButton>
                    <SaveActionButton primary onClick={handleRepairList} disabled={loading}>
                      修复摘要
                    </SaveActionButton>
                  </div>
                </div>
              )}

              {!loading && !loadError && visibleTreeGroups.length === 0 && (
                <EmptyState
                  text={
                    tab === 'manual'
                      ? '暂无手动存档'
                      : tab === 'auto'
                        ? '暂无自动存档'
                        : tab === 'protected'
                          ? '暂无保护存档'
                          : '暂无存档'
                  }
                  detail={
                    tab === 'manual'
                      ? '点击左侧“保存新节点”留下第一道印记。'
                      : '推进旅程后，新的节点会显示在这里。'
                  }
                />
              )}

              {selectedTree && (
                <div className="space-y-4">
                  <SaveTreeGroup
                    key={selectedTree.rootId}
                    group={selectedTree}
                    loadingId={loadingId}
                    onLoad={handleLoad}
                    onDelete={handleDelete}
                    onExport={handleExport}
                    onExportTree={handleExportTree}
                    formatTime={formatTime}
                  />
                </div>
              )}
            </div>
          </main>

          <aside
            className="flex min-h-0 min-w-0 flex-col px-4 py-4 md:px-4 md:py-5"
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

function SaveActionButton({
  children,
  primary = false,
  warn = false,
  disabled,
  onClick,
}: {
  children: ReactNode;
  primary?: boolean;
  warn?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer px-3 py-2.5 font-serif text-[12px] font-semibold tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        color: primary ? 'rgba(var(--tj-surface-bg-start),1)' : warn ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary),0.76)',
        background: primary
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),1))'
          : warn
            ? 'rgba(var(--tj-accent-primary),0.06)'
            : 'rgba(var(--tj-accent-primary),0.07)',
        boxShadow: primary
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55), 0 0 20px rgba(var(--tj-tech-blue), 0.24)'
          : warn
            ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)'
            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

function SaveMetric({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="px-3 py-3 font-serif"
      style={{
        background: 'rgba(var(--tj-accent-primary),0.055)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.13)',
        clipPath: smallClip,
      }}
    >
      <b className="block text-[21px] leading-none tracking-[0.04em]" style={{ color: 'rgba(var(--tj-accent-primary),1)' }}>
        {value}
      </b>
      <span className="mt-1 block text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
        {label}
      </span>
    </div>
  );
}

function MiniSaveTreeMap({
  nodeCount,
  branchCount,
  sizeText,
}: {
  nodeCount: number;
  branchCount: number;
  sizeText: string;
}) {
  return (
    <div
      className="col-span-2 min-h-[170px] px-3 py-3 font-serif"
      style={{
        background: 'rgba(0,0,0,0.20)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.86)' }}>
          当前存档树
        </h3>
        <span className="text-[11px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
          {sizeText}
        </span>
      </div>
      <div className="relative h-[112px]">
        <MiniLine left={26} top={24} width={88} rotate={20} />
        <MiniLine left={105} top={55} width={88} rotate={-18} />
        <MiniLine left={105} top={55} width={68} rotate={42} />
        <MiniDot left={22} top={20} />
        <MiniDot left={102} top={50} />
        <MiniDot left={190} top={25} gold />
        <MiniDot left={167} top={101} />
      </div>
      <div className="flex flex-wrap gap-2">
        <SmallTag>{nodeCount} 节点</SmallTag>
        <SmallTag gold>{branchCount} 分支</SmallTag>
      </div>
    </div>
  );
}

function MiniLine({ left, top, width, rotate }: { left: number; top: number; width: number; rotate: number }) {
  return (
    <span
      aria-hidden="true"
      className="absolute h-px"
      style={{
        left,
        top,
        width,
        transform: `rotate(${rotate}deg)`,
        transformOrigin: 'left center',
        background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.36), rgba(var(--tj-accent-secondary),0.3))',
      }}
    />
  );
}

function MiniDot({ left, top, gold = false }: { left: number; top: number; gold?: boolean }) {
  return (
    <i
      aria-hidden="true"
      className="absolute h-[9px] w-[9px] rounded-full"
      style={{
        left,
        top,
        background: gold ? 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))' : 'linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),1))',
        boxShadow: gold ? '0 0 14px rgba(var(--tj-accent-primary),0.72)' : '0 0 16px rgba(var(--tj-accent-primary),.8)',
      }}
    />
  );
}

function SaveTreeSelector({
  groups,
  selectedRootId,
  onSelect,
}: {
  groups: SaveTreeDisplayGroup[];
  selectedRootId: string | null;
  onSelect: (rootId: string) => void;
}) {
  return (
    <div
      className="kaituo-options-scroll min-h-0 flex-1 px-3 py-3 pb-5 font-serif md:overflow-y-auto"
      style={{
        background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary),0.075), rgba(0,0,0,0.18))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16), 0 0 24px rgba(0,0,0,0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-medium tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.86)' }}>
          存档树列表
        </h3>
        <span className="text-[11px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
          点击切换路线
        </span>
      </div>
      {groups.length === 0 ? (
        <div className="py-3 text-center text-[12px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary),0.46)' }}>
          暂无可选存档树
        </div>
      ) : (
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
                    ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.18), rgba(var(--tj-accent-primary), 0.06))'
                    : 'rgba(var(--tj-accent-primary),0.045)',
                  boxShadow: active
                    ? 'inset 3px 0 0 rgba(var(--tj-accent-primary),1), inset 0 0 0 1px rgba(var(--tj-accent-primary),0.32)'
                    : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.12)',
                  clipPath: smallClip,
                }}
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold tracking-[0.12em]" style={{ color: active ? 'rgba(var(--tj-accent-secondary),1)' : 'rgba(var(--tj-text-primary),0.78)' }}>
                    {title}
                  </span>
                  <span className="shrink-0 text-[11px]" style={{ color: active ? 'rgba(var(--tj-accent-primary),1)' : 'rgba(var(--tj-text-primary),0.42)' }}>
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
      )}
    </div>
  );
}

function TabButton({
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
      className="cursor-pointer px-3 py-2 font-serif text-[12px] tracking-[0.16em] transition-all md:px-4 md:text-[13px] md:tracking-[0.24em]"
      style={{
        color: active ? 'rgba(var(--tj-surface-bg-start),1)' : 'rgba(var(--tj-text-primary),0.70)',
        background: active ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),1))' : 'rgba(var(--tj-accent-primary),0.05)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-surface-bg-start), 0.55), 0 0 24px rgba(var(--tj-accent-primary), 0.28)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)',
        clipPath: smallClip,
      }}
    >
      {label}
      <span className="ml-2 text-[11px]" style={{ color: active ? 'rgba(var(--tj-panel-bg-start),0.66)' : 'rgba(var(--tj-text-primary),0.46)' }}>
        {count}
      </span>
    </button>
  );
}

function SaveTreeGroup({
  group,
  loadingId,
  onLoad,
  onDelete,
  onExport,
  onExportTree,
  formatTime,
}: {
  group: SaveTreeDisplayGroup;
  loadingId: number | null;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
  onExport: (id: number) => void;
  onExportTree: (rootId: string) => void;
  formatTime: (ts: number) => string;
}) {
  return (
    <section
      className="min-w-0 overflow-hidden p-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-panel-bg-start),0.52), rgba(var(--tj-panel-bg-end),0.56))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-3 flex min-w-0 flex-wrap items-center justify-between gap-3 font-serif">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-baseline gap-2">
            <span className="text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary),1)' }}>
              存档树
            </span>
            <span className="truncate text-[15px] font-semibold tracking-wider" style={{ color: 'rgba(var(--tj-accent-secondary),1)' }}>
              {group.latestSave.travelerName || group.rootSave.travelerName || '未命名旅人'}
            </span>
            <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
              最新 #{group.latestSave.id}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tracking-wider" style={{ color: 'rgba(var(--tj-text-primary),0.58)' }}>
            <span>{group.nodeCount} 个节点</span>
            <span>{group.branchCount} 个分支</span>
            <span>{formatSize(group.totalSizeBytes)}</span>
            <span>第 {group.latestSave.turnCount} 回合</span>
          </div>
        </div>
        <SaveActionButton onClick={() => onExportTree(group.rootId)} disabled={loadingId !== null}>
          导出整树
        </SaveActionButton>
      </div>

      <div className="relative space-y-3 pl-6">
        <span
          aria-hidden="true"
          className="absolute bottom-2 left-[10px] top-2 w-px"
          style={{ background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),0.92))' }}
        />
        {group.nodes.map((node, index) => (
          <SaveRow
            key={node.save.id}
            item={node.save}
            loadingId={loadingId}
            onLoad={onLoad}
            onDelete={onDelete}
            onExport={onExport}
            formatTime={formatTime}
            treeLabel={node.isRoot ? '根节点' : `分支 +${node.depth}`}
            isLatest={node.isLatest}
            depth={node.depth}
            visualLevel={index}
          />
        ))}
      </div>
    </section>
  );
}

function SaveRow({
  item,
  loadingId,
  onLoad,
  onDelete,
  onExport,
  formatTime,
  treeLabel,
  isLatest = false,
  depth,
  visualLevel,
}: {
  item: SaveListItemSummary;
  loadingId: number | null;
  onLoad: (id: number) => void;
  onDelete: (id: number) => void;
  onExport: (id: number) => void;
  formatTime: (ts: number) => string;
  treeLabel?: string;
  isLatest?: boolean;
  depth: number;
  visualLevel: number;
}) {
  const visualIndent = Math.min(visualLevel, 5) * 14;
  return (
    <article
      className={`relative grid min-w-0 gap-3 md:grid-cols-[1fr_auto] md:items-center ${
        isLatest ? 'p-4 md:gap-4' : 'p-3'
      }`}
      style={{
        marginLeft: visualIndent,
        background: isLatest
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.18), rgba(var(--tj-accent-primary),0.09)), rgba(var(--tj-panel-bg-start),0.92)'
          : 'rgba(var(--tj-panel-bg-start),0.74)',
        boxShadow: isLatest
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.46), inset 0 0 0 2px rgba(var(--tj-accent-primary),0.08), 0 0 28px rgba(var(--tj-accent-primary),0.10), 0 0 22px rgba(var(--tj-accent-primary),0.08)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
        clipPath: cardClip,
      }}
    >
      <span
        aria-hidden="true"
        className={`absolute left-[-22px] rounded-full ${isLatest ? 'top-6 h-[14px] w-[14px]' : 'top-5 h-[11px] w-[11px]'}`}
        style={{
          background: isLatest ? 'linear-gradient(135deg, rgb(var(--tj-accent-primary)), rgb(var(--tj-accent-secondary)))' : 'linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),1))',
          boxShadow: isLatest ? '0 0 18px rgba(var(--tj-accent-primary),0.82), 0 0 28px rgba(var(--tj-accent-primary),0.28)' : '0 0 16px rgba(var(--tj-accent-primary),0.78)',
        }}
      />
      {depth > 0 && (
        <span
          aria-hidden="true"
          className={`absolute left-[-16px] h-px ${isLatest ? 'top-[31px]' : 'top-[25px]'}`}
          style={{
            width: 16 + visualIndent,
            background: 'linear-gradient(90deg, rgba(var(--tj-accent-primary),0.36), rgba(var(--tj-accent-primary),0.05))',
          }}
        />
      )}

      <div className="min-w-0">
        <div className="flex min-w-0 flex-wrap items-baseline gap-2">
          <span className={`font-serif tracking-[0.18em] ${isLatest ? 'text-[12px]' : 'text-[11px]'}`} style={{ color: typeColor(item.type) }}>
            {typeLabel(item.type)}
          </span>
          <span className={`truncate font-serif font-semibold tracking-wider ${isLatest ? 'text-[17px]' : 'text-[15px]'}`} style={{ color: 'rgba(var(--tj-accent-secondary),1)' }}>
            {item.travelerName || '未命名旅人'}
          </span>
          <span className="font-serif text-[11px] tracking-wider" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
            #{item.id}
          </span>
          {treeLabel && <SmallTag>{treeLabel}</SmallTag>}
          {isLatest && <SmallTag gold>最新</SmallTag>}
        </div>
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 font-serif tracking-wider ${isLatest ? 'mt-2 text-[13px]' : 'mt-1 text-[12px]'}`} style={{ color: 'rgba(var(--tj-text-primary),0.78)' }}>
          <span style={{ color: 'rgba(var(--tj-accent-primary),1)' }}>第 {item.turnCount} 回合</span>
          {(item.currentDate || item.currentTime || item.currentLocation) && (
            <>
              <span style={{ color: 'rgba(var(--tj-text-primary),0.28)' }}>/</span>
              <span>{[item.currentDate, item.currentTime, item.currentLocation].filter(Boolean).join(' / ')}</span>
            </>
          )}
          {item.worldPeriodName && (
            <>
              <span style={{ color: 'rgba(var(--tj-text-primary),0.28)' }}>/</span>
              <span>{item.worldPeriodName}</span>
            </>
          )}
          <span style={{ color: 'rgba(var(--tj-text-primary),0.28)' }}>/</span>
          <span style={{ color: 'rgba(var(--tj-text-primary),0.56)' }}>{formatTime(item.timestamp)}</span>
          <span style={{ color: 'rgba(var(--tj-text-primary),0.28)' }}>/</span>
          <span style={{ color: 'rgba(var(--tj-text-primary),0.56)' }}>{formatSize(item.sizeBytes)}</span>
        </div>
        {item.lastSummary && (
          <div className={`font-serif leading-relaxed ${isLatest ? 'mt-2 line-clamp-3 text-[13px]' : 'mt-1 line-clamp-2 text-[12px]'}`} style={{ color: 'rgba(var(--tj-text-primary),0.62)' }}>
            {item.lastSummary}
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-1.5 md:flex md:flex-shrink-0">
        <button
          type="button"
          onClick={() => onLoad(item.id)}
          disabled={loadingId !== null}
          className={`cursor-pointer font-serif font-semibold tracking-wider transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${
            isLatest ? 'px-4 py-2.5 text-[13px]' : 'px-3 py-2 text-xs'
          }`}
          style={{
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),1))',
            color: 'rgba(var(--tj-surface-bg-start),1)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-surface-bg-start), 0.55), 0 0 18px rgba(var(--tj-accent-primary), 0.20)',
            clipPath: smallClip,
          }}
        >
          {loadingId === item.id ? '读取中' : '读取'}
        </button>
        <button
          type="button"
          onClick={() => onExport(item.id)}
          disabled={loadingId !== null}
          className="cursor-pointer px-2.5 py-2 text-xs font-serif tracking-wider transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            color: 'rgba(var(--tj-accent-primary),0.92)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)',
            clipPath: smallClip,
          }}
        >
          导出
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          disabled={loadingId !== null}
          className="cursor-pointer px-2.5 py-2 text-xs font-serif tracking-wider transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            color: 'rgba(var(--tj-danger),0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.28)',
            clipPath: smallClip,
          }}
        >
          删除
        </button>
      </div>
    </article>
  );
}

function SmallTag({ children, gold = false }: { children: ReactNode; gold?: boolean }) {
  return (
    <span
      className="px-1.5 py-0.5 font-serif text-[10px] tracking-[0.12em]"
      style={{
        color: gold ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-accent-primary),1)',
        background: gold ? 'rgba(var(--tj-accent-primary),0.08)' : 'rgba(var(--tj-accent-primary),0.08)',
        boxShadow: gold ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
        clipPath: smallClip,
      }}
    >
      {children}
    </span>
  );
}

function EmptyState({ text, detail }: { text: string; detail?: string }) {
  return (
    <div
      className="p-6 text-center font-serif"
      style={{
        background: 'rgba(var(--tj-panel-bg-start),0.46)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)',
        clipPath: cardClip,
      }}
    >
      <p className="text-sm tracking-[0.2em]" style={{ color: 'rgba(var(--tj-text-primary),0.86)' }}>
        {text}
      </p>
      {detail && (
        <p className="mt-1.5 text-xs tracking-wider" style={{ color: 'rgba(var(--tj-text-primary),0.56)' }}>
          {detail}
        </p>
      )}
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
  if (type === 'auto') return 'rgba(var(--tj-accent-primary),0.86)';
  if (type === 'backup') return 'rgba(var(--tj-accent-secondary),0.9)';
  if (type === 'imported') return 'rgba(var(--tj-ui-success),0.9)';
  return 'rgba(var(--tj-accent-primary),0.9)';
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function matchesSaveTab(save: SaveListItemSummary, tab: Tab): boolean {
  if (tab === 'all') return save.type !== 'auto';
  if (tab === 'manual') return save.type === 'manual';
  if (tab === 'auto') return save.type === 'auto';
  return save.type === 'backup' || save.type === 'imported';
}

function buildVisibleSaveTreeGroup(group: SaveTreeDisplayGroup, tab: Tab): SaveTreeDisplayGroup | null {
  const nodes = group.nodes.filter((node) => matchesSaveTab(node.save, tab));
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
