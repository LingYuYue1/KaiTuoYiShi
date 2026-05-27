import { useMemo, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { 新闻条目, 新闻状态 } from '@/models/news';
import {
  NEWS_CATEGORY_LABELS,
  NEWS_STATUS_LABELS,
  NEWS_STATUS_ORDER,
} from '@/models/news';

interface NewsPanelProps {
  news: 新闻条目[];
  onNewsChange: Dispatch<SetStateAction<新闻条目[]>>;
  turnCount: number;
}

const panelClip =
  'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)';
const chipClip =
  'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)';

const STATUS_COLORS: Record<新闻状态, string> = {
  upcoming: 'rgb(var(--tj-accent-primary))',
  ongoing: 'rgb(var(--tj-tech-cyan-deep))',
  completed: 'rgb(var(--tj-amber-deep))',
  archived: 'rgba(var(--tj-text-secondary), 0.92)',
};

const STATUS_BACKGROUNDS: Record<新闻状态, string> = {
  upcoming: 'rgba(var(--tj-accent-primary), 0.14)',
  ongoing: 'rgba(var(--tj-tech-cyan), 0.16)',
  completed: 'rgba(var(--tj-amber-soft), 0.18)',
  archived: 'rgba(var(--tj-surface-strong), 0.95)',
};

const STATUS_CODES: Record<新闻状态, string> = {
  upcoming: 'PENDING',
  ongoing: 'LIVE',
  completed: 'CLOSED',
  archived: 'ARCHIVE',
};

export function NewsPanel({ news, turnCount }: NewsPanelProps) {
  const issue = Math.max(1, Math.floor(turnCount / 10) + 1);
  const [tab, setTab] = useState<新闻状态 | 'all'>('all');

  const sorted = useMemo(
    () =>
      [...news].sort((a, b) => {
        const statusDelta = NEWS_STATUS_ORDER.indexOf(a.状态) - NEWS_STATUS_ORDER.indexOf(b.状态);
        if (statusDelta !== 0) return statusDelta;
        if (b.回合 !== a.回合) return b.回合 - a.回合;
        return b.时间戳 - a.时间戳;
      }),
    [news],
  );

  const counts = useMemo(
    () =>
      NEWS_STATUS_ORDER.reduce(
        (acc, status) => {
          acc[status] = news.filter((item) => item.状态 === status).length;
          return acc;
        },
        {} as Record<新闻状态, number>,
      ),
    [news],
  );

  const visible = tab === 'all' ? sorted : sorted.filter((item) => item.状态 === tab);
  const featured = visible.find((item) => item.重要) ?? visible[0] ?? null;
  const list = featured ? visible.filter((item) => item.id !== featured.id) : visible;

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden" style={{ color: 'rgb(var(--tj-text-primary))' }}>
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'linear-gradient(rgba(117, 214, 216, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.035) 1px, transparent 1px)',
          backgroundSize: '22px 22px, 22px 22px',
          maskImage: 'linear-gradient(180deg, rgba(0,0,0,0.95), rgba(0,0,0,0.28))',
        }}
      />

      <header className="relative mb-3" style={{ clipPath: panelClip }}>
        <div
          className="px-4 py-3"
          style={{
            background:
              'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.16), rgb(var(--tj-bubble)) 42%, rgba(var(--tj-amber-soft), 0.12))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.78), inset 4px 0 0 rgba(var(--tj-tech-cyan-deep), 0.52)',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2" style={{ background: 'rgb(var(--tj-tech-cyan-deep))', boxShadow: '0 0 8px rgba(var(--tj-tech-cyan), 0.45)' }} />
                <span className="font-serif text-[12px] font-bold tracking-[0.28em]" style={{ color: 'rgb(var(--tj-tech-cyan-deep))' }}>
                  IPC SECURE FEED
                </span>
              </div>
              <div className="mt-1 font-serif text-[18px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                星际和平周报
              </div>
              <div className="mt-1 text-[12px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary), 0.82)' }}>
                第 {issue} 期 / 总第 {turnCount} 回 / INTERASTRAL BULLETIN
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 text-right">
              <span className="text-[12px] font-bold tracking-[0.2em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                ON-AIR
              </span>
              <SignalBars />
              <span className="text-[12px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
                {news.length} 条记录
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative mb-3 grid grid-cols-2 gap-2">
        <StatusChip label="全部频道" code="ALL" count={news.length} active={tab === 'all'} onClick={() => setTab('all')} />
        {NEWS_STATUS_ORDER.map((status) => (
          <StatusChip
            key={status}
            label={NEWS_STATUS_LABELS[status]}
            code={STATUS_CODES[status]}
            count={counts[status]}
            active={tab === status}
            onClick={() => setTab(status)}
            color={STATUS_COLORS[status]}
          />
        ))}
      </div>

      <div className="relative mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-px w-8" style={{ background: 'linear-gradient(90deg, rgb(var(--tj-accent-primary)), transparent)' }} />
          <span className="font-serif text-[12px] font-bold tracking-[0.22em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.9)' }}>
            {tab === 'all' ? '全域新闻流' : NEWS_STATUS_LABELS[tab]}
          </span>
        </div>
        <span className="text-[12px] tracking-[0.16em]" style={{ color: 'rgb(var(--tj-tech-cyan-deep))' }}>
          {visible.length.toString().padStart(2, '0')} ITEMS
        </span>
      </div>

      <div className="relative min-h-0 flex-1 overflow-y-auto pr-1">
        {visible.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {featured && <FeaturedCard entry={featured} />}
            <div className="mt-2 flex flex-col gap-2">
              {list.map((entry) => (
                <NewsCard key={entry.id} entry={entry} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SignalBars() {
  return (
    <div className="flex h-5 items-end gap-1">
      {[7, 11, 15, 19].map((height, index) => (
        <span
          key={height}
          className="w-1.5"
          style={{
            height,
            background: index === 3 ? 'rgb(var(--tj-accent-primary))' : 'rgb(var(--tj-tech-cyan-deep))',
            boxShadow: index === 3 ? '0 0 8px rgba(var(--tj-accent-primary), 0.35)' : '0 0 8px rgba(var(--tj-tech-cyan), 0.28)',
            opacity: 0.88,
          }}
        />
      ))}
    </div>
  );
}

function StatusChip({
  label,
  code,
  count,
  active,
  onClick,
  color = 'rgb(var(--tj-accent-primary))',
}: {
  label: string;
  code: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className="group min-w-0 px-3 py-2 text-left transition-all"
      style={{
        clipPath: chipClip,
        color: active ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-primary), 0.84)',
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-amber-soft), 0.18), rgba(var(--tj-tech-cyan), 0.12))'
          : 'linear-gradient(135deg, rgb(var(--tj-bubble)), rgb(var(--tj-surface-strong)))',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.48), 0 0 18px rgba(var(--tj-accent-primary), 0.08)'
          : 'inset 0 0 0 1px rgba(117, 214, 216, 0.16)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-serif text-[12px] font-bold tracking-[0.16em]">{label}</span>
        <span className="text-[14px] font-bold" style={{ color }}>{count}</span>
      </div>
      <div className="mt-0.5 text-[12px] tracking-[0.18em]" style={{ color: active ? color : 'rgba(var(--tj-tech-cyan-deep), 0.82)' }}>
        {code}
      </div>
    </button>
  );
}

function FeaturedCard({ entry }: { entry: 新闻条目 }) {
  const color = STATUS_COLORS[entry.状态];
  return (
    <article
      className="relative overflow-hidden p-3"
      style={{
        clipPath: panelClip,
        background:
          'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.14), rgb(var(--tj-bubble)) 48%, rgba(var(--tj-amber-soft), 0.14))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.76), inset 4px 0 0 rgba(var(--tj-accent-primary), 0.72)',
      }}
    >
      <div className="pointer-events-none absolute right-3 top-3 text-[34px] font-bold leading-none opacity-[0.07]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        IPC
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="font-serif text-[12px] font-bold tracking-[0.24em]" style={{ color }}>
          HEADLINE / {NEWS_STATUS_LABELS[entry.状态]}
        </span>
        <span className="text-[12px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary), 0.78)' }}>
          TURN {entry.回合}
        </span>
      </div>
      <h3 className="mt-2 font-serif text-[16px] font-bold leading-relaxed" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        {entry.标题}
      </h3>
      {entry.正文 && (
        <p className="mt-2 text-[13px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.88)' }}>
          {entry.正文}
        </p>
      )}
      <MetaLine entry={entry} featured />
    </article>
  );
}

function NewsCard({ entry }: { entry: 新闻条目 }) {
  const color = STATUS_COLORS[entry.状态];
  return (
    <article
      className="relative overflow-hidden px-3 py-2.5"
      style={{
        clipPath: panelClip,
        background:
          'linear-gradient(90deg, rgba(var(--tj-tech-cyan), 0.12), rgb(var(--tj-bubble)) 36%, rgb(var(--tj-surface-strong)))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.68)',
      }}
    >
      <div className="flex gap-3">
        <div className="flex w-8 flex-shrink-0 flex-col items-center gap-1 pt-1">
          <span className="h-2 w-2" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
          <span className="w-px flex-1 min-h-12" style={{ background: `linear-gradient(${color}, transparent)` }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className="font-serif text-[12px] font-bold tracking-[0.18em]" style={{ color }}>
              {STATUS_CODES[entry.状态]}
            </span>
            <span className="text-[12px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-text-primary), 0.78)' }}>
              #{entry.回合}
            </span>
          </div>
          <h4 className="mt-1 font-serif text-[14px] font-bold leading-snug" style={{ color: 'rgba(var(--tj-text-primary), 0.95)' }}>
            {entry.标题}
          </h4>
          {entry.正文 && (
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.84)' }}>
              {entry.正文}
            </p>
          )}
          <MetaLine entry={entry} />
        </div>
      </div>
    </article>
  );
}

function MetaLine({ entry, featured = false }: { entry: 新闻条目; featured?: boolean }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      <MetaTag text={NEWS_CATEGORY_LABELS[entry.类目]} tone="cyan" />
      <MetaTag text={NEWS_STATUS_LABELS[entry.状态]} tone="status" status={entry.状态} />
      {entry.重要 && <MetaTag text="重要播报" tone="gold" />}
      {entry.关联剧情系列ID || entry.关联剧情分段ID ? <MetaTag text="剧情关联" tone="gold" /> : null}
      {entry.关联系统?.length ? <MetaTag text={entry.关联系统.join(' / ')} tone="muted" /> : null}
      {(entry.组织标签 ?? entry.阵营标签)?.length ? <MetaTag text={`组织 ${(entry.组织标签 ?? entry.阵营标签)?.length ?? 0}`} tone="muted" /> : null}
      {featured && <MetaTag text="公司认证频道" tone="gold" />}
    </div>
  );
}

function MetaTag({
  text,
  tone = 'muted',
  status,
}: {
  text: string;
  tone?: 'muted' | 'gold' | 'cyan' | 'status';
  status?: 新闻状态;
}) {
  const color =
    tone === 'gold'
      ? 'rgb(var(--tj-accent-primary))'
      : tone === 'cyan'
        ? 'rgb(var(--tj-tech-cyan-deep))'
        : tone === 'status' && status
          ? STATUS_COLORS[status]
          : 'rgba(var(--tj-text-primary), 0.82)';
  const background = status ? STATUS_BACKGROUNDS[status] : 'rgb(var(--tj-bubble))';
  return (
    <span
      className="px-2 py-0.5 text-[12px] tracking-[0.1em]"
      style={{
        color,
        background,
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.58)',
        clipPath: chipClip,
      }}
    >
      {text}
    </span>
  );
}

function EmptyState() {
  return (
    <div
      className="relative overflow-hidden px-4 py-9 text-center"
      style={{
        clipPath: panelClip,
        background: 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.13), rgb(var(--tj-bubble)), rgba(var(--tj-amber-soft), 0.12))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72)',
      }}
    >
      <div className="mx-auto mb-3 h-14 w-14" style={{
        background: 'repeating-conic-gradient(from 0deg, rgba(var(--tj-tech-cyan-deep),0.75) 0deg 12deg, transparent 12deg 24deg)',
        borderRadius: '999px',
        boxShadow: '0 0 22px rgba(117, 214, 216, 0.16)',
      }} />
      <div className="font-serif text-[14px] font-bold tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        周报频道待机中
      </div>
      <div className="mt-1 text-[13px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-primary), 0.8)' }}>
        暂无可刊登事件。新闻模型会在世界态势出现变化后写入记录。
      </div>
    </div>
  );
}
