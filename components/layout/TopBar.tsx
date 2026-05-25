import type { 世界状态 } from '@/models/world';
import type { 主题预设 } from '@/models/settings';

interface TopBarProps {
  worldState: 世界状态;
  currentTheme: 主题预设;
  onHome: () => void;
}

export function TopBar({ worldState, onHome }: TopBarProps) {
  const dateText = worldState.当前日期?.trim() || '日期未设定';
  const timeText = formatClock(worldState.当前时间) || '时间未设定';
  const locationText = worldState.当前地点?.trim() || '地点未设定';
  const dayText = `DAY ${Math.max(1, worldState.开拓天数 || 1).toString().padStart(2, '0')}`;

  return (
    <div
      className="hidden md:grid items-center px-5 py-2.5 text-sm"
      style={{
        gridTemplateColumns: 'minmax(160px, 1fr) auto minmax(160px, 1fr)',
        background: 'linear-gradient(180deg, rgba(14, 12, 14, 0.98), rgba(8, 7, 9, 0.98))',
        boxShadow: 'inset 0 -1px 0 rgba(245, 217, 122, 0.25)',
      }}
    >
      <button
        onClick={onHome}
        className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
      >
        <span className="text-base" style={{ color: 'rgba(245, 217, 122, 0.75)' }}>✦</span>
        <span
          className="font-serif font-bold tracking-[0.25em]"
          style={{
            background: 'linear-gradient(180deg, #fff4d4 0%, #f5d97a 60%, #c4a35a 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          开拓轶事
        </span>
      </button>

      <div className="justify-self-center">
        <div
          className="flex max-w-[min(56vw,720px)] items-center gap-2 overflow-hidden px-3 py-1.5"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(245, 217, 122, 0.055), transparent)',
            boxShadow: 'inset 0 1px 0 rgba(245, 217, 122, 0.2), inset 0 -1px 0 rgba(245, 217, 122, 0.16)',
          }}
        >
          <TimeChip label="日期" value={dateText} tone="bright" />
          <Divider />
          <TimeChip label="时间" value={timeText} />
          <Divider />
          <TimeChip label="地点" value={locationText} wide />
        </div>
      </div>

      <div className="justify-self-end">
        <div
          className="flex items-baseline gap-2 px-3 py-1"
          style={{
            background: 'linear-gradient(90deg, rgba(245, 217, 122, 0.04), rgba(245, 217, 122, 0.12))',
            boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.28)',
            clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)',
          }}
          title="开拓天数"
        >
          <span className="font-serif text-[10px] tracking-[0.22em]" style={{ color: 'rgba(220, 208, 178, 0.78)' }}>
            开拓
          </span>
          <span className="font-mono text-[13px] font-bold tracking-[0.14em]" style={{ color: '#fff4d4' }}>
            {dayText}
          </span>
        </div>
      </div>
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
        style={{ color: tone === 'bright' ? 'rgba(245, 217, 122, 0.92)' : 'rgba(220, 208, 178, 0.82)' }}
      >
        {label}
      </span>
      <span
        className={`${wide ? 'max-w-[220px]' : 'max-w-[140px]'} truncate text-[12px]`}
        style={{ color: tone === 'bright' ? '#fff4d4' : 'rgba(235, 223, 193, 0.92)' }}
        title={value}
      >
        {value}
      </span>
    </span>
  );
}

function Divider() {
  return <span className="shrink-0 text-[10px]" style={{ color: 'rgba(245, 217, 122, 0.34)' }}>◆</span>;
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
