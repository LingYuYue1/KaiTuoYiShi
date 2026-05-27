interface MobileQuickMenuProps {
  onCharacter: () => void;
  onPhone: () => void;
  onSettings: () => void;
  onSave: () => void;
  onHome: () => void;
  phoneUnread?: number;
}

export function MobileQuickMenu({
  onCharacter,
  onPhone,
  onSettings,
  onSave,
  onHome,
  phoneUnread = 0,
}: MobileQuickMenuProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden">
      <div
        className="h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--tj-accent-primary), 0.5), transparent)' }}
      />
      <div
        className="flex items-center justify-around px-2 py-2"
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-bg-secondary), 0.95), rgba(var(--tj-bg-primary), 0.98))',
          backdropFilter: 'blur(8px)',
        }}
      >
        <QuickButton icon="✦" label="首页" onClick={onHome} />
        <QuickButton icon="❖" label="旅人" onClick={onCharacter} />
        <QuickButton icon="▣" label="手机" onClick={onPhone} badge={phoneUnread} />
        <QuickButton icon="✧" label="存档" onClick={onSave} />
        <QuickButton icon="⚙" label="设置" onClick={onSettings} />
      </div>
    </div>
  );
}

function QuickButton({
  icon,
  label,
  onClick,
  badge = 0,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center gap-0.5 px-3 py-1.5 transition-all"
    >
      <span
        className="text-base transition-all"
        style={{ color: 'rgba(var(--tj-accent-primary), 0.75)' }}
      >
        {icon}
      </span>
      <span
        className="font-serif tracking-[0.1em] transition-colors"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.85)', fontSize: '10px' }}
      >
        {label}
      </span>
      {badge > 0 && (
        <span
          className="absolute right-1 top-0 min-w-4 rounded-full px-1 text-[9px] font-bold leading-4"
          style={{ background: 'rgba(220, 80, 80, 0.9)', color: 'rgb(var(--tj-text-primary))' }}
        >
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}
