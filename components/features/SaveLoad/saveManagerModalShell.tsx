import { useMemo } from 'react';
import { devLogError } from '@/utils/devLog';
import { 格式化存档体积 } from '@/utils/format';
import {
  buildSaveTreeGroups,
  buildVisibleSaveTreeGroup,
  resolveEffectiveSaveTab,
  resolveSelectedSaveTree,
  type SaveTreeDisplayGroup,
} from '@/utils/saveTreeView';
import type { SaveManagerModel } from '@/hooks/useSaveManager';

import { LegacyBackupSection } from './legacyBackupSection';
import { MiniSaveTreeMap } from './miniSaveTreeMap';
import { EmptyState, SaveActionButton, SaveMetric, TabButton } from './primitives';
import { SaveTreeGroup } from './saveTreeGroup';
import { MobileSaveTreeStrip, SaveTreeSelector } from './saveTreeSelector';
import { cardClip, shellClip, smallClip } from './saveLoadStyles';

interface Props {
  model: SaveManagerModel;
  /** 导出当前工作区叶子节点：手动存档已移除，「导出当前节点」指活跃叶子。 */
  onExportActiveLeafPackage: () => Promise<number | null>;
  onClose: () => void;
}

export function SaveManagerModalShell({ model, onExportActiveLeafPackage, onClose }: Props) {
  const {
    displaySaves,
    filter,
    setFilter,
    selectedRootId,
    setSelectedRootId,
  } = model;

  const handleExportCurrent = async () => {
    model.setSaving(true);
    try {
      const id = await onExportActiveLeafPackage();
      if (id === null) {
        alert('当前没有可导出的工作区节点');
        return;
      }
      await model.refresh();
    } catch (error) {
      devLogError('save', 'save-export-current-failed', error);
      alert('导出失败');
    } finally {
      model.setSaving(false);
    }
  };

  const allTreeGroups = useMemo(() => buildSaveTreeGroups(displaySaves), [displaySaves]);
  const nodeFilteredGroups = useMemo(
    () => allTreeGroups
      .map((group) => buildVisibleSaveTreeGroup(group, filter))
      .filter((group): group is SaveTreeDisplayGroup => Boolean(group)),
    [allTreeGroups, filter],
  );
  const tab = resolveEffectiveSaveTab(filter, displaySaves.length, nodeFilteredGroups.length);
  const visibleTreeGroups = tab === filter ? nodeFilteredGroups : allTreeGroups;
  const visibleNodeCount = useMemo(
    () => visibleTreeGroups.reduce((sum, group) => sum + group.nodeCount, 0),
    [visibleTreeGroups],
  );
  const totalBranches = allTreeGroups.reduce((sum, group) => sum + group.branchCount, 0);
  const totalSizeBytes = allTreeGroups.reduce((sum, group) => sum + group.totalSizeBytes, 0);
  const autoSaves = useMemo(() => displaySaves.filter((save) => save.type === 'auto'), [displaySaves]);
  const importedSaves = useMemo(() => displaySaves.filter((save) => save.type === 'imported'), [displaySaves]);
  const latestSave = displaySaves.at(0);
  const selectedTree = resolveSelectedSaveTree(visibleTreeGroups, selectedRootId);

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
            {model.repairingSummaries && <span style={{ color: 'rgba(var(--tj-accent-primary),0.9)' }}>索引恢复中</span>}
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
                <SaveActionButton onClick={model.handleImport} disabled={model.importing}>
                  {model.importing ? '导入中' : '导入存档包'}
                </SaveActionButton>
                <SaveActionButton onClick={() => void handleExportCurrent()} disabled={model.saving}>
                  导出当前节点
                </SaveActionButton>
                <SaveActionButton warn onClick={() => void model.handleRepairList()} disabled={model.loading}>
                  {model.loading ? '修复中' : '修复存档索引'}
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
                {model.repairingSummaries ? ` / 正在恢复 ${model.pendingSummaryCount} 个节点目录` : ''}
              </div>
            </div>
          </aside>

          <main className="flex min-w-0 flex-col md:min-h-0 md:flex-1 md:overflow-hidden">
            <div className="md:hidden flex flex-col">
              <div className="flex gap-1.5 px-3 pb-1.5 pt-2.5">
                <SaveActionButton size="sm" onClick={model.handleImport} disabled={model.importing} className="flex-1 min-w-0">
                  {model.importing ? '导入中' : '导入'}
                </SaveActionButton>
                <SaveActionButton size="sm" onClick={() => void handleExportCurrent()} disabled={model.saving} className="flex-1 min-w-0">
                  导出
                </SaveActionButton>
                <SaveActionButton warn size="sm" onClick={() => void model.handleRepairList()} disabled={model.loading} className="flex-1 min-w-0">
                  {model.loading ? '修复中' : '修复'}
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
                <TabButton label="全部" count={displaySaves.length} active={tab === 'all'} onClick={() => setFilter('all')} />
                <TabButton label="自动" count={autoSaves.length} active={tab === 'auto'} onClick={() => setFilter('auto')} />
                <TabButton label="导入" count={importedSaves.length} active={tab === 'imported'} onClick={() => setFilter('imported')} />
              </div>
              <div className="font-serif text-[12px] tracking-[0.12em] md:block hidden" style={{ color: 'rgba(var(--tj-text-primary),0.58)' }}>
                当前视图：{visibleTreeGroups.length} 棵树 / {visibleNodeCount} 节点
                {selectedTree ? ` / 当前树 #${selectedTree.latestSave.id}` : ''}
              </div>
            </div>

            <div className="kaituo-options-scroll relative overflow-x-hidden px-4 py-4 pb-7 md:min-h-0 md:flex-1 md:overflow-y-auto md:px-5">
              {model.loading && displaySaves.length === 0 && <EmptyState text="加载中..." />}

              {model.repairingSummaries && (
                <div
                  className="mb-3 px-3 py-2 text-center font-serif text-[12px] tracking-[0.14em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary),0.92)',
                    background: 'rgba(var(--tj-accent-primary),0.08)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
                    clipPath: smallClip,
                  }}
                >
                  {model.repairState.phase === 'paused-for-write'
                    ? '索引恢复已暂停，正在优先保存或删除'
                    : `正在恢复节点详情 ${model.repairState.processed} / ${Math.max(model.repairState.total, model.pendingSummaryCount)}`}
                </div>
              )}

              {!model.repairingSummaries && model.unreadableSummaryCount > 0 && (
                <div
                  className="mb-3 px-3 py-2 text-center font-serif text-[12px] tracking-[0.12em]"
                  style={{
                    color: 'rgba(var(--tj-danger),0.9)',
                    background: 'rgba(var(--tj-danger),0.08)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.2)',
                    clipPath: smallClip,
                  }}
                >
                  {model.unreadableSummaryCount} 个节点详情读取失败，可使用“修复存档索引”重试
                </div>
              )}

              {model.legacyBackups.length > 0 && (
                <LegacyBackupSection
                  backups={model.legacyBackups}
                  loadingId={model.loadingId}
                  deletingId={model.deletingId}
                  deletingAll={model.deletingLegacyBackups}
                  onLoad={(id) => void model.handleLoad(id)}
                  onBranch={(id) => void model.handleBranch(id)}
                  onDelete={(id) => void model.handleDelete(id)}
                  onExport={(id) => void model.handleExport(id)}
                  onDeleteAll={() => void model.handleDeleteLegacyBackups()}
                />
              )}

              {!model.loading && model.loadError && (
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
                    {model.loadError}
                  </div>
                  <div className="mt-4 flex flex-wrap justify-center gap-2">
                    <SaveActionButton onClick={() => void model.refresh()}>重新读取</SaveActionButton>
                    <SaveActionButton primary onClick={() => void model.handleRepairList()} disabled={model.loading}>
                      修复摘要
                    </SaveActionButton>
                  </div>
                </div>
              )}

              {!model.loading && !model.loadError && visibleTreeGroups.length === 0 && (
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
                    loadingId={model.loadingId}
                    deletingId={model.deletingId}
                    deletingRootId={model.deletingRootId}
                    onLoad={(id) => void model.handleLoad(id)}
                    onBranch={(id) => void model.handleBranch(id)}
                    onDelete={(id) => void model.handleDelete(id)}
                    onExport={(id) => void model.handleExport(id)}
                    onExportTree={(rootId) => void model.handleExportTree(rootId)}
                    onDeleteTree={(rootId, nodeCount) => void model.handleDeleteTree(rootId, nodeCount)}
                    catalogComplete={model.catalogComplete}
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
