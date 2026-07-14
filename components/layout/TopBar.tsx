import { memo, useState } from 'react';
import type { 世界状态 } from '@/models/world';
import type { 主题预设 } from '@/models/settings';
import type { 新闻条目 } from '@/models/news';
import { 天气Emoji映射, 天气名映射 } from '@/data/weatherRules';

interface TopBarProps {
  worldState: 世界状态;
  currentTheme: 主题预设;
  onHome: () => void;
  news: 新闻条目[];
  onOpenNews?: () => void;
}

const clip10 =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const clip12 =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';

export const TopBar = memo(function TopBar({ worldState, onHome, news, onOpenNews }: TopBarProps) {
  const [mobileCollapsed, setMobileCollapsed] = useState(false);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const dateText = worldState.当前日期?.trim() || '日期未设定';
  const timeText = formatClock(worldState.当前时间) || '时间未设定';
  const locationText = worldState.当前地点?.trim() || '地点未设定';
  const dayText = `DAY ${Math.max(1, worldState.开拓天数 || 1).toString().padStart(2, '0')}`;

  const weatherId = worldState.当前天气;
  const weatherDisplay = weatherId ? (
    <span className="flex min-w-0 items-center gap-1 whitespace-nowrap">
      <span className="text-[13px]">{天气Emoji映射[weatherId] ?? '🌤️'}</span>
      <span className="truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
        {天气名映射[weatherId] ?? weatherId}
      </span>
    </span>
  ) : null;

  const headlines = buildHeadlines(news);

  return (
    <>
      {/* ===== 移动端悬浮面板（不变） ===== */}
      <div className="fixed left-2 top-[calc(var(--app-safe-top,0px)+10px)] z-40 flex items-start gap-2 md:hidden">
        <button
          type="button"
          onClick={() => {
            setMobileCollapsed((current) => !current);
            setMobileExpanded(false);
          }}
          className="flex h-10 w-10 items-center justify-center text-sm transition-all"
          style={{
            color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))',
            background: 'rgba(var(--tj-surface), 0.88)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.34), 0 10px 28px rgba(var(--tj-shadow), 0.28)',
            backdropFilter: 'blur(4px)',
            clipPath: clip10,
          }}
          aria-label={mobileCollapsed ? '展开状态栏' : '收起状态栏'}
        >
          {mobileCollapsed ? '>' : '<'}
        </button>

        {!mobileCollapsed && (
          <div className="flex flex-col gap-1">
            <button
              type="button"
              onClick={() => setMobileExpanded((current) => !current)}
              className="max-w-[calc(100vw-96px)] px-3 py-2 text-left transition-all"
              style={{
                color: 'rgb(var(--tj-text-primary))',
                background: 'rgba(var(--tj-surface), 0.90)',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3), 0 12px 30px rgba(var(--tj-shadow), 0.28)',
                backdropFilter: 'blur(5px)',
                clipPath: clip10,
              }}
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="shrink-0 font-mono text-[11px] font-bold tracking-[0.14em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                  {dayText}
                </span>
                <span className="shrink-0 text-[11px]" style={{ color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.86), rgba(var(--tj-accent-secondary),0.82))' }}>
                  {timeText}
                </span>
                <span className="min-w-0 truncate text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.92)' }}>
                  {locationText}
                </span>
              </div>
            </button>

            {mobileExpanded && (
              <div
                className="max-w-[min(78vw,320px)] space-y-2 px-3 py-3 text-xs"
                style={{
                  color: 'rgba(var(--tj-text-primary), 0.92)',
                  background: 'rgba(var(--tj-surface), 0.94)',
                  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.26), 0 16px 36px rgba(var(--tj-shadow), 0.32)',
                  backdropFilter: 'blur(6px)',
                  clipPath: clip12,
                }}
              >
                <MobileDetail label="日期" value={dateText} />
                <MobileDetail label="时间" value={timeText} />
                <MobileDetail label="地点" value={locationText} />
                <MobileDetail label="开拓" value={dayText} />
                <button
                  type="button"
                  onClick={onHome}
                  className="mt-1 w-full px-3 py-2 font-serif text-[11px] tracking-[0.18em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary), 0.92)',
                    background: 'rgba(var(--tj-accent-primary), 0.08)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
                    clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
                  }}
                >
                  返回首页
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ===== 桌面端顶栏：新闻底层 + 日期芯片上层 ===== */}
      <div
        className="kaituo-topbar relative hidden items-center overflow-hidden px-5 py-2.5 text-sm md:grid"
        style={{
          gridTemplateColumns: 'minmax(160px, 1fr) auto minmax(160px, 1fr)',
        }}
      >
        {/* ── 底层：新闻滚动条（absolute 铺满） ── */}
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center overflow-hidden">
          {headlines.length > 0 && (
            <div className="w-full overflow-hidden">
              <div
                className="flex items-center gap-0 whitespace-nowrap min-w-max animate-marquee-linear"
                style={{
                  animation: 'marqueeLinear var(--marquee-duration, 36s) linear infinite',
                  ['--marquee-duration' as any]: headlines.length > 3 ? '40s' : '60s',
                  fontSize: '15px',
                  color: 'rgba(var(--tj-text-secondary), 0.72)',
                  fontFamily: '"Noto Serif SC", SimSun, serif',
                  letterSpacing: '0.06em',
                }}
              >
                <span className="inline-flex items-center">
                  {headlines.map((h, i) => (
                    <span key={`n-${i}`} className="mx-6 inline-block">{h}</span>
                  ))}
                </span>
                <span className="inline-flex items-center" aria-hidden>
                  {headlines.map((h, i) => (
                    <span key={`n-dup-${i}`} className="mx-6 inline-block">{h}</span>
                  ))}
                </span>
                <span className="inline-flex items-center" aria-hidden>
                  {headlines.map((h, i) => (
                    <span key={`n-dup2-${i}`} className="mx-6 inline-block">{h}</span>
                  ))}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── 上层：左列品牌 ── */}
        <button
          onClick={onHome}
          className="relative z-10 flex items-center gap-2.5 transition-opacity hover:opacity-80 justify-self-start"
        >
          <span className="text-base" style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}>+</span>
          <span
            className="font-serif font-bold tracking-[0.25em]"
            style={{
              background: 'linear-gradient(180deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 60%, rgb(var(--tj-accent-secondary)) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            开拓轶事
          </span>
        </button>

        {/* ── 上层：中列日期芯片（浮在新闻上方） ── */}
        <div className="relative z-10 justify-self-center">
          <div
            className="flex max-w-[min(56vw,720px)] items-center gap-2 px-3 py-1.5"
            style={{
              background: 'linear-gradient(90deg, rgba(var(--tj-bg-primary), 0.92), rgba(var(--tj-surface-bg-start), 0.88), rgba(var(--tj-bg-primary), 0.92))',
              boxShadow: 'inset 0 1px 0 rgba(var(--tj-accent-primary), 0.22), inset 0 -1px 0 rgba(var(--tj-accent-primary), 0.18)',
            }}
          >
            <TimeChip label="日期" value={dateText} tone="bright" />
            <Divider />
            <TimeChip label="时间" value={timeText} />
            <Divider />
            {weatherDisplay}
            <Divider />
            <TimeChip label="地点" value={locationText} wide />
          </div>
        </div>

        {/* ── 上层：右列 DAY 徽章 ── */}
        <div className="relative z-10 justify-self-end">
          <div
            className="flex items-baseline gap-2 px-3 py-1"
            style={{
              background: 'rgba(var(--tj-bg-primary), 0.9)',
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
              clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
            }}
            title="开拓天数"
          >
            <span className="font-serif text-[10px] tracking-[0.22em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
              开拓
            </span>
            <span className="font-mono text-[13px] font-bold tracking-[0.14em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
              {dayText}
            </span>
          </div>
        </div>
      </div>
    </>
  );
});

// ---- helpers ----

function MobileDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[52px_minmax(0,1fr)] gap-2">
      <span className="font-serif tracking-[0.18em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.72)' }}>
        {label}
      </span>
      <span className="min-w-0 truncate" title={value}>
        {value}
      </span>
    </div>
  );
}

function TimeChip({
  label,
  value,
  tone = 'normal',
  wide = false,
}: {
  label: string;
  value: string;
  tone?: 'normal' | 'bright';
  wide?: boolean;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <span
        className="font-serif text-[11px] tracking-[0.18em]"
        style={{ color: tone === 'bright' ? 'rgba(var(--tj-accent-primary), 0.92)' : 'rgba(var(--tj-text-secondary), 0.82)' }}
      >
        {label}
      </span>
      <span
        className={`${wide ? 'max-w-[220px]' : 'max-w-[140px]'} truncate text-[12px]`}
        style={{ color: tone === 'bright' ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-primary), 0.92)' }}
        title={value}
      >
        {value}
      </span>
    </span>
  );
}

function Divider() {
  return <span className="shrink-0 text-[10px]" style={{ color: 'rgba(var(--tj-accent-primary), 0.34)' }}>-</span>;
}

function formatClock(value?: string | null): string {
  const raw = value?.trim();
  if (!raw) return '';
  const embedded = raw.match(/(\d{1,2}:\d{2})/);
  if (embedded) {
    const [hours, minutes] = embedded[1].split(':').map((part) => Number(part));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return `${Math.max(0, Math.min(23, hours)).toString().padStart(2, '0')}:${Math.max(0, Math.min(59, minutes)).toString().padStart(2, '0')}`;
    }
  }
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [hours, minutes] = raw.split(':').map((part) => Number(part));
    if (Number.isFinite(hours) && Number.isFinite(minutes)) {
      return `${Math.max(0, Math.min(23, hours)).toString().padStart(2, '0')}:${Math.max(0, Math.min(59, minutes)).toString().padStart(2, '0')}`;
    }
  }
  const legacyMap: Record<string, string> = {
    清晨: '06:40',
    上午: '09:40',
    午后: '14:10',
    黄昏: '18:20',
    夜晚: '21:30',
    深夜: '00:30',
  };
  return legacyMap[raw] ?? raw;
}

function buildHeadlines(news: 新闻条目[]): string[] {
  const items = Array.isArray(news) ? news : [];
  const rank = (s: string) => {
    if (s === '进行中') return 0;
    if (s === '即将发生') return 1;
    return 2;
  };
  const sorted = [...items]
    .filter((n) => n.标题?.trim())
    .sort((a, b) => rank(a.状态) - rank(b.状态));
  const seen = new Set<string>();
  return sorted
    .map((n) => n.标题.trim())
    .filter((t) => {
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    })
    .slice(0, 12);
}
