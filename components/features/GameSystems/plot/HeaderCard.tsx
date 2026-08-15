import type { 剧情编织进度锚点, 剧情编织系列 } from '@/models/storyWeaving';
import { cardClip } from './constants';
import { Pill, StatCard } from './primitives';

export function HeaderCard({
  activeSeries,
  progress,
  seriesCount,
  totalChapters,
  totalSegments,
  busyBatch,
}: {
  activeSeries?: 剧情编织系列;
  progress?: 剧情编织进度锚点;
  seriesCount: number;
  totalChapters: number;
  totalSegments: number;
  busyBatch: string;
}) {
  return (
    <div
      className="relative overflow-hidden px-3 py-3 md:px-4 md:py-4"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.12), rgba(var(--tj-tech-cyan), 0.05) 38%, rgba(var(--tj-bg-primary),0.95))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.24), 0 0 18px rgba(var(--tj-accent-primary),0.06)',
        clipPath: cardClip,
      }}
    >
      <div className="pointer-events-none absolute right-3 top-4 text-[34px] font-bold opacity-[0.05] md:right-4 md:top-1/2 md:-translate-y-1/2 md:text-[42px]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        WIRING
      </div>
      <div className="flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-start md:justify-between md:gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2" style={{ background: 'rgb(var(--tj-tech-cyan))', boxShadow: '0 0 12px rgba(var(--tj-tech-cyan), 0.8)' }} />
            <span className="font-serif text-[11px] tracking-[0.2em] md:text-[12px] md:tracking-[0.32em]" style={{ color: 'rgba(var(--tj-tech-cyan), 0.86)' }}>
              NARRATIVE WORKBENCH
            </span>
          </div>
          <div className="mt-1 font-serif text-[19px] font-bold tracking-[0.16em] md:text-[20px] md:tracking-[0.24em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
            剧情编织
          </div>
          <div className="mt-1 max-w-2xl text-[12px] leading-relaxed tracking-0" style={{ color: 'rgba(var(--tj-text-secondary),0.82)' }}>
            导入玩家自定义 TXT，将它拆成章节与分段，再分解为主剧情可读取的滑窗。这里负责章节结构、可见性边界、角色档案、地点档案与承接事实。
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <Pill text="TXT 导入" tone="gold" />
            <Pill text="章节滑窗" tone="cyan" />
            <Pill text="角色 / 地点 / 派系档案" tone="muted" />
            <Pill text={busyBatch ? `批量处理中：${busyBatch}` : '待机中'} tone={busyBatch ? 'gold' : 'muted'} />
          </div>
        </div>
        <div className="grid min-w-0 grid-cols-2 gap-2 md:min-w-[340px]">
          <StatCard label="系列" value={String(seriesCount).padStart(2, '0')} tone="rgb(var(--tj-accent-primary))" />
          <StatCard label="章节" value={String(totalChapters).padStart(2, '0')} tone="rgb(var(--tj-tech-cyan))" />
          <StatCard label="分段" value={String(totalSegments).padStart(2, '0')} tone="rgb(var(--tj-tech-cyan))" />
          <StatCard label="当前" value={progress ? `${progress.当前分段组号}` : activeSeries ? `${activeSeries.当前分段组号}` : '--'} tone="rgb(var(--tj-accent-primary))" />
        </div>
      </div>
    </div>
  );
}
