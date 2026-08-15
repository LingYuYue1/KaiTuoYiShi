import type { SaveListItemSummary } from '@/contracts/storage';

import { SaveActionButton } from './primitives';
import { SaveRow } from './saveRow';
import { cardClip } from './saveLoadStyles';

export function LegacyBackupSection({
  backups,
  loadingId,
  deletingId,
  deletingAll,
  onLoad,
  onBranch,
  onDelete,
  onExport,
  onDeleteAll,
}: {
  backups: SaveListItemSummary[];
  loadingId: number | null;
  deletingId: number | null;
  deletingAll: boolean;
  onLoad: (id: number) => void;
  onBranch: (id: number) => void;
  onDelete: (id: number) => void;
  onExport: (id: number) => void;
  onDeleteAll: () => void;
}) {
  return (
    <details
      className="mb-4 overflow-hidden"
      style={{
        background: 'rgba(var(--tj-accent-primary),0.045)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
        clipPath: cardClip,
      }}
    >
      <summary className="cursor-pointer px-4 py-3 font-serif text-[13px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-accent-secondary),0.92)' }}>
        历史恢复点 {backups.length} 个
      </summary>
      <div className="border-t px-3 pb-3 pt-3" style={{ borderColor: 'rgba(var(--tj-accent-primary),0.12)' }}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] leading-relaxed tracking-wider" style={{ color: 'rgba(var(--tj-text-primary),0.6)' }}>
          <span>这是旧版本读档前自动生成的恢复点。系统已停止新建，清理与否由你决定。</span>
          <SaveActionButton danger onClick={onDeleteAll} disabled={deletingAll || loadingId !== null || deletingId !== null}>
            {deletingAll ? '清理中' : '清理全部旧恢复点'}
          </SaveActionButton>
        </div>
        <div className="space-y-3 pl-6">
          {backups.map((backup, index) => (
            <SaveRow
              key={backup.id}
              item={backup}
              loadingId={loadingId}
              deletingId={deletingId}
              onLoad={onLoad}
              onBranch={onBranch}
              onDelete={onDelete}
              onExport={onExport}
              treeLabel="旧恢复点"
              depth={0}
              visualLevel={index}
            />
          ))}
        </div>
      </div>
    </details>
  );
}
