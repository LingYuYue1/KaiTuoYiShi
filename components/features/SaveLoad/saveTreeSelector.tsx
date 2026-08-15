import type { SaveTreeDisplayGroup } from '@/utils/saveTreeView';

import { cardClip, smallClip } from './saveLoadStyles';

export function SaveTreeSelector({
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

export function MobileSaveTreeStrip({
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
      className="mx-3 mb-2 overflow-hidden font-serif"
      style={{
        background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary),0.075), rgba(0,0,0,0.18))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16), 0 0 24px rgba(0,0,0,0.18)',
        clipPath: cardClip,
      }}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
        <h3 className="text-[11px] font-medium tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary),0.86)' }}>
          存档树列表
        </h3>
        <span className="text-[10px] tracking-[0.12em]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
          横向滚动切换
        </span>
      </div>
      <div className="overflow-x-auto px-3 pb-2.5 no-scrollbar">
        <div className="flex gap-2 w-max">
          {groups.map((group) => {
            const active = group.rootId === selectedRootId;
            const title = group.latestSave.travelerName || group.rootSave.travelerName || '未命名旅人';
            return (
              <button
                key={group.rootId}
                type="button"
                onClick={() => onSelect(group.rootId)}
                className="w-[155px] shrink-0 cursor-pointer px-2.5 py-2 text-left transition-all"
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
                <div className="flex min-w-0 items-center justify-between gap-1">
                  <span className="truncate text-[12px] font-semibold tracking-[0.1em]" style={{ color: active ? 'rgba(var(--tj-accent-secondary),1)' : 'rgba(var(--tj-text-primary),0.78)' }}>
                    {title}
                  </span>
                  <span className="shrink-0 text-[10px]" style={{ color: active ? 'rgba(var(--tj-accent-primary),1)' : 'rgba(var(--tj-text-primary),0.42)' }}>
                    #{group.latestSave.id}
                  </span>
                </div>
                <div className="mt-0.5 flex gap-2 text-[10px] tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-primary),0.54)' }}>
                  <span>{group.nodeCount}节点</span>
                  <span>{group.branchCount}分支</span>
                  <span>第{group.latestSave.turnCount}回合</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
