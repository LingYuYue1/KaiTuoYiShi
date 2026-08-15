import type { 剧情编织系列 } from '@/models/storyWeaving';
import { cardClip, smallClip } from './constants';

export function SeriesControl({
  series,
  onRename,
  onToggleInjection,
  onRebuild,
  onBatchPending,
  onBatchFromCurrent,
  onBatchAll,
  onDelete,
  busy,
}: {
  series: 剧情编织系列;
  onRename: () => void;
  onToggleInjection: () => void;
  onRebuild: () => void;
  onBatchPending: () => void;
  onBatchFromCurrent: () => void;
  onBatchAll: () => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const done = series.分段列表.filter((item) => item.处理状态 === '已完成').length;
  return (
    <div className="mb-3 px-3 py-3 md:px-4" style={{ background: 'rgba(var(--tj-accent-primary),0.045)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)', clipPath: cardClip }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="break-words font-serif text-[15px] font-bold md:text-base" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{series.标题}</div>
          <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.78)' }}>
            {series.来源类型 === 'canon' ? '原著剧情轨道' : '玩家自制剧情'} · {series.章节列表.length} 章 · {series.分段列表.length} 段 · 已完成 {done} 段 · 每段 {series.每段章数} 章
          </div>
          {series.当前阶段概括 && (
            <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
              {series.当前阶段概括}
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            {series.核心角色.slice(0, 4).map((item) => (
              <span key={item} className="px-2 py-1" style={{ background: 'rgba(var(--tj-accent-primary),0.08)', color: 'rgba(var(--tj-accent-primary),0.85)', clipPath: smallClip }}>
                {item}
              </span>
            ))}
            {series.涉及地点索引.slice(0, 3).map((item) => (
              <span key={item} className="px-2 py-1" style={{ background: 'rgba(var(--tj-ui-success),0.08)', color: 'rgba(var(--tj-ui-success),0.85)', clipPath: smallClip }}>
                {item}
              </span>
            ))}
            {series.涉及派系索引.slice(0, 3).map((item) => (
              <span key={item} className="px-2 py-1" style={{ background: 'rgba(var(--tj-tech-blue),0.08)', color: 'rgba(var(--tj-tech-blue),0.85)', clipPath: smallClip }}>
                {item}
              </span>
            ))}
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:justify-end">
          <button className="panel-btn" disabled={busy} onClick={onRename}>重命名</button>
          <button className="panel-btn" disabled={busy} onClick={onToggleInjection}>{series.激活注入 ? '暂停注入' : '启用注入'}</button>
          <button className="panel-btn" disabled={busy || series.来源类型 === 'canon'} onClick={onRebuild}>重建分段</button>
          <button className="panel-btn" disabled={busy} onClick={onBatchPending}>分解待处理</button>
          <button className="panel-btn" disabled={busy} onClick={onBatchFromCurrent}>分解当前后续</button>
          <button className="panel-btn strong" disabled={busy} onClick={onBatchAll}>重分解全部</button>
          <button className="panel-btn danger" disabled={busy || series.来源类型 === 'canon'} onClick={onDelete}>删除</button>
        </div>
      </div>
    </div>
  );
}
