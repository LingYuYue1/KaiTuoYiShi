import { useMemo, useState } from 'react';
import { buildSaveTreeGroups, matchesSaveTab, resolveSelectedSaveTree, type SaveTreeDisplayGroup } from '@/utils/saveTreeView';
import { 格式化时间戳 } from '@/utils/format';
import type { SaveManagerModel } from '@/hooks/useSaveManager';

interface Props {
  model: SaveManagerModel;
  onContinue: () => Promise<boolean>;
}

const cardClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';
const smallClip =
  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export function SaveManagerSettingsShell({ model, onContinue }: Props) {
  const [continuing, setContinuing] = useState(false);

  const handleContinue = async () => {
    setContinuing(true);
    try {
      if (!(await onContinue())) alert('没有可用的存档');
    } catch (error) {
      alert(`读取失败：${error instanceof Error ? error.message : '存档读取或恢复过程异常'}`);
    } finally {
      setContinuing(false);
    }
  };

  // 设置页保留整树过滤：先按类型筛节点再建树，与模态的节点级过滤是不同工作流。
  const treeGroups = useMemo(
    () => buildSaveTreeGroups(model.displaySaves.filter((save) => matchesSaveTab(save, model.filter))),
    [model.displaySaves, model.filter],
  );
  const selectedTree = resolveSelectedSaveTree(treeGroups, model.selectedRootId);
  const busy = continuing || model.importing || model.deletingLegacyBackups || model.loading;

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
            <ActionButton label={continuing ? '处理中' : '继续游戏'} onClick={() => void handleContinue()} disabled={busy} />
            <ActionButton label={model.importing ? '导入中' : '导入存档'} onClick={() => void model.handleImport()} disabled={busy} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(['all', 'auto', 'imported'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => model.setFilter(value)}
              className="cursor-pointer px-3 py-1 text-[11px]"
              style={{
                color: model.filter === value ? 'rgb(var(--tj-ui-active-text))' : 'rgba(var(--tj-text-secondary),0.78)',
                background: model.filter === value ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary),0.05)',
                clipPath: smallClip,
              }}
            >
              {{ all: '全部', auto: '自动', imported: '导入' }[value]}
            </button>
          ))}
        </div>
      </header>

      {model.loadError && (
        <div className="p-3 text-xs" style={{ color: 'rgba(var(--tj-danger),0.92)', background: 'rgba(var(--tj-danger),0.08)' }}>
          {model.loadError}
        </div>
      )}

      {model.repairingSummaries && (
        <div className="text-xs" style={{ color: 'rgba(var(--tj-accent-primary),0.84)' }}>
          正在修复存档索引：{model.repairState.processed}/{model.repairState.total}
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
                deleting={model.deletingRootId === group.rootId}
                deletingId={model.deletingId}
                loadingId={model.loadingId}
                onSelect={() => model.setSelectedRootId(group.rootId)}
                onDeleteTree={() => void model.handleDeleteTree(group.rootId, group.nodeCount)}
                onLoad={(id) => void model.handleLoad(id)}
                onBranch={(id) => void model.handleBranch(id)}
                onDelete={(id) => void model.handleDelete(id)}
                onExport={(id) => void model.handleExport(id)}
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
              <ActionButton label="导出整棵存档树" onClick={() => void model.handleExportTree(selectedTree.rootId)} />
              {model.legacyBackups.length > 0 && (
                <ActionButton label={`清理历史恢复点（${model.legacyBackups.length}）`} onClick={() => void model.handleDeleteLegacyBackups()} disabled={busy} />
              )}
              <ActionButton label="修复存档索引" onClick={() => void model.handleRepairList()} disabled={busy} />
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
  onBranch,
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
  onBranch: (id: number) => void;
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
          {group.latestSave.currentLocation || group.latestSave.worldPeriodName || '未知位置'} · {格式化时间戳(group.latestSave.timestamp)}
        </div>
      </button>
      <div className="grid gap-1">
        {group.nodes.map(({ save, depth, isLatest }) => {
          // 节点类型判定（与模态一致）：unsealedHead = 未封版叶子 =「读取」；其余 =「分支」。
          const isLeaf = save.unsealedHead === true;
          return (
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
                <MiniButton
                  label={loadingId === save.id ? (isLeaf ? '读取中' : '分支中') : (isLeaf ? '读取' : '分支')}
                  onClick={() => (isLeaf ? onLoad(save.id) : onBranch(save.id))}
                  disabled={loadingId !== null}
                />
                <MiniButton label="导出" onClick={() => onExport(save.id)} />
                <MiniButton label={deletingId === save.id ? '删除中' : '删除'} onClick={() => onDelete(save.id)} disabled={deletingId !== null} danger />
              </div>
            </div>
          );
        })}
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
