import type { SaveListItemSummary } from '@/contracts/storage';
import { 格式化存档体积, 格式化时间戳 } from '@/utils/format';

import { SmallTag } from './primitives';
import { cardClip, smallClip } from './saveLoadStyles';

function typeLabel(type: SaveListItemSummary['type']): string {
  if (type === 'auto') return '自动';
  if (type === 'backup') return '恢复点';
  if (type === 'imported') return '导入';
  return '手动';
}

function typeColor(type: SaveListItemSummary['type']): string {
  if (type === 'auto') return 'rgba(var(--tj-accent-primary),0.86)';
  if (type === 'backup') return 'rgba(var(--tj-accent-secondary),0.9)';
  if (type === 'imported') return 'rgba(var(--tj-ui-success),0.9)';
  return 'rgba(var(--tj-accent-primary),0.9)';
}

export function SaveRow({
  item,
  loadingId,
  deletingId,
  onLoad,
  onBranch,
  onDelete,
  onExport,
  treeLabel,
  isLatest = false,
  depth,
  visualLevel,
}: {
  item: SaveListItemSummary;
  loadingId: number | null;
  deletingId: number | null;
  onLoad: (id: number) => void;
  onBranch?: (id: number) => void;
  onDelete: (id: number) => void;
  onExport: (id: number) => void;
  treeLabel?: string;
  isLatest?: boolean;
  depth: number;
  visualLevel: number;
}) {
  const visualIndent = Math.min(visualLevel, 5) * 14;
  // 节点类型判定：目录摘要含 unsealedHead——true = 未封版叶子 =「读取」（直接水合即可编辑）；
  // 其余（已封版检查点、旧恢复点、导入节点）→「分支」= forkSaveTreeLeaf 分叉新叶子。
  const isLeaf = item.unsealedHead === true;
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
          <span style={{ color: 'rgba(var(--tj-text-primary),0.56)' }}>{格式化时间戳(item.timestamp)}</span>
          <span style={{ color: 'rgba(var(--tj-text-primary),0.28)' }}>/</span>
          <span style={{ color: 'rgba(var(--tj-text-primary),0.56)' }}>{格式化存档体积(item.sizeBytes)}</span>
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
          onClick={() => (isLeaf ? onLoad(item.id) : (onBranch ?? onLoad)(item.id))}
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
          {loadingId === item.id ? (isLeaf ? '读取中' : '分支中') : (isLeaf ? '读取' : '分支')}
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
          disabled={loadingId !== null || deletingId !== null}
          className="cursor-pointer px-2.5 py-2 text-xs font-serif tracking-wider transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          style={{
            color: 'rgba(var(--tj-danger),0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-danger),0.28)',
            clipPath: smallClip,
          }}
        >
          {deletingId === item.id ? '删除中' : '删除'}
        </button>
      </div>
    </article>
  );
}
