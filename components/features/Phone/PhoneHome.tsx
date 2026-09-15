import { cardClip, phoneCardSurface, phoneScreenSurface, smallClip } from './phoneStyles';

export function PhoneHome({
  unread,
  contactCount,
  chatCount,
  activeApp,
  onOpen,
  onClose,
  wallpaper,
}: {
  unread: number;
  contactCount: number;
  chatCount: number;
  activeApp: string | null;
  onOpen: (view: 'messages' | 'contacts' | 'news' | 'wallpapers') => void;
  onClose: () => void;
  wallpaper?: string;
}) {
  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
      style={{
        background: wallpaper
          ? `linear-gradient(180deg, rgba(var(--tj-surface),0.48), rgba(var(--tj-bg-secondary),0.72)), url(${wallpaper}) center/cover`
          : phoneScreenSurface,
      }}
    >
      <div
        className="pointer-events-none absolute left-3 right-14 top-3 flex items-center justify-between gap-2 text-[9px] font-mono tracking-[0.14em]"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}
      >
        <span className="truncate whitespace-nowrap">IPC-LINK 23:47</span>
        <span className="truncate whitespace-nowrap">SYNC ◆ 97%</span>
      </div>

      <div className="absolute right-3 top-3">
        <button
          type="button"
          onClick={onClose}
          className="px-2 py-1 text-[10px] font-serif tracking-[0.12em]"
          style={{
            color: 'rgba(var(--tj-accent-primary), 0.85)',
            background: 'rgba(var(--tj-accent-primary), 0.05)',
            border: '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint))',
            clipPath: smallClip,
          }}
          aria-label="关闭"
        >
          ×
        </button>
      </div>

      <div className="grid flex-1 content-start grid-cols-2 gap-3 px-4 pb-4 pt-12">
        <AppIcon
          title="短讯"
          subtitle={`${chatCount} 会话`}
          glyph="▣"
          badge={unread}
          active={activeApp === 'messages'}
          onClick={() => onOpen('messages')}
        />
        <AppIcon
          title="通讯录"
          subtitle={`${contactCount} 联系人`}
          glyph="◇"
          active={activeApp === 'contacts'}
          onClick={() => onOpen('contacts')}
        />
        <AppIcon
          title="星际周报"
          subtitle="新闻"
          glyph="☉"
          active={activeApp === 'news'}
          onClick={() => onOpen('news')}
        />
        <AppIcon title="任务便签" subtitle="未启用" glyph="✧" disabled />
        <AppIcon
          title="相册"
          subtitle="壁纸"
          glyph="◌"
          active={activeApp === 'wallpapers'}
          onClick={() => onOpen('wallpapers')}
        />
      </div>
    </div>
  );
}

function AppIcon({
  title,
  subtitle,
  glyph,
  badge = 0,
  active = false,
  disabled,
  onClick,
}: {
  title: string;
  subtitle: string;
  glyph: string;
  badge?: number;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="group relative flex min-h-[104px] flex-col items-center justify-center gap-1.5 transition-all hover:scale-[1.02] disabled:opacity-45 disabled:hover:scale-100"
      style={{
        // 左侧 3px 强调条由内阴影改为背景条纹（垫片会丢弃内阴影），排在 background 第一层；
        // 两个分支各自夹带的外投影被切角裁掉、不可见，一并删除。
        background: disabled
          ? 'rgba(var(--tj-surface-strong), 0.68)'
          : active
            ? `linear-gradient(90deg, rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), var(--tj-edge-tint-strong)) 0 3px, transparent 3px), linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-tech-cyan, var(--tj-accent-primary)), 0.12))`
            : phoneCardSurface,
        border: active
          ? '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint-strong))'
          : '1px solid rgba(var(--tj-border), var(--tj-edge))',
        clipPath: cardClip,
      }}
    >
      {badge > 0 && (
        <span
          className="absolute right-2.5 top-2.5 rounded-full px-1.5 text-[10px] font-bold"
          style={{ color: 'rgb(var(--tj-on-accent))', background: 'rgb(var(--tj-danger))' }}
        >
          {badge}
        </span>
      )}
      <span
        className="flex h-10 w-10 items-center justify-center font-serif text-xl"
        style={{
          color: disabled ? 'rgba(var(--tj-text-secondary), 0.7)' : 'rgb(var(--tj-accent-primary))',
          background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.96), rgba(var(--tj-surface-strong),0.82))',
          border: '1px solid rgba(var(--tj-border), var(--tj-edge))',
          clipPath: smallClip,
        }}
      >
        {glyph}
      </span>
      <span className="font-serif text-[12px] font-semibold tracking-[0.16em]" style={{ color: disabled ? 'rgba(var(--tj-text-secondary), 0.72)' : 'rgb(var(--tj-text-primary))' }}>
        {title}
      </span>
      <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
        {subtitle}
      </span>
    </button>
  );
}
