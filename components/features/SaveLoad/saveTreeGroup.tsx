import { 格式化存档体积 } from '@/utils/format';
import type { SaveTreeDisplayGroup } from '@/utils/saveTreeView';

import { SaveActionButton } from './primitives';
import { SaveRow } from './saveRow';
import { cardClip } from './saveLoadStyles';

export function SaveTreeGroup({
  group,
  loadingId,
  deletingId,
  deletingRootId,
  onLoad,
  onBranch,
  onDelete,
  onExport,
  onExportTree,
  onDeleteTree,
  catalogComplete,
}: {
  group: SaveTreeDisplayGroup;
  loadingId: number | null;
  deletingId: number | null;
  deletingRootId: string | null;
  onLoad: (id: number) => void;
  onBranch: (id: number) => void;
  onDelete: (id: number) => void;
  onExport: (id: number) => void;
  onExportTree: (rootId: string) => void;
  onDeleteTree: (rootId: string, nodeCount: number) => void;
  catalogComplete: boolean;
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
            <span>{格式化存档体积(group.totalSizeBytes)}</span>
            <span>第 {group.latestSave.turnCount} 回合</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <SaveActionButton onClick={() => onExportTree(group.rootId)} disabled={loadingId !== null || deletingRootId !== null || deletingId !== null}>
            导出整树
          </SaveActionButton>
          <SaveActionButton onClick={() => onDeleteTree(group.rootId, group.nodeCount)} disabled={!catalogComplete || loadingId !== null || deletingRootId !== null || deletingId !== null} danger>
            {deletingRootId === group.rootId ? '删除中' : catalogComplete ? '删除整树' : '目录恢复后可删'}
          </SaveActionButton>
        </div>
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
            deletingId={deletingId}
            onLoad={onLoad}
            onBranch={onBranch}
            onDelete={onDelete}
            onExport={onExport}
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
