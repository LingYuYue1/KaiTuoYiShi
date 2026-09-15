import { useMemo, useState } from 'react';
import { GAME_MENU_ITEMS, type GameSystemId } from '@/data/gameMenu';
import { cardClip as itemClip, panelClip } from '@/components/ui/clipPaths';

interface MobileQuickMenuProps {
  onCharacter: () => void;
  onPhone: () => void;
  onSettings: () => void;
  onSave: () => void;
  onHome: () => void;
  onSystemSelect: (id: GameSystemId) => void;
  phoneUnread?: number;
}

type MenuItem = {
  id: string;
  label: string;
  glyph: string;
  onClick: () => void;
  badge?: number;
};


export function MobileQuickMenu({
  onCharacter,
  onPhone,
  onSettings,
  onSave,
  onHome,
  onSystemSelect,
  phoneUnread = 0,
}: MobileQuickMenuProps) {
  const [showMore, setShowMore] = useState(false);

  const primaryItems = useMemo<MenuItem[]>(
    () => [
      { id: 'character', label: '旅人', glyph: '人', onClick: onCharacter },
      { id: 'phone', label: '手机', glyph: '信', onClick: onPhone, badge: phoneUnread },
      { id: 'save', label: '存档', glyph: '存', onClick: onSave },
      { id: 'companion', label: '伙伴', glyph: '伴', onClick: () => onSystemSelect('companion') },
    ],
    [onCharacter, onPhone, onSave, onSystemSelect, phoneUnread],
  );

  const moreItems = useMemo<MenuItem[]>(
    () => [
      ...GAME_MENU_ITEMS.filter((item) => item.id !== 'companion').map((item) => ({
        id: item.id,
        label: item.label,
        glyph: item.glyph,
        onClick: () => onSystemSelect(item.id),
      })),
      { id: 'settings', label: '设置', glyph: '设', onClick: onSettings },
      { id: 'home', label: '首页', glyph: '归', onClick: onHome },
    ],
    [onHome, onSettings, onSystemSelect],
  );

  const handleItemClick = (item: MenuItem) => {
    setShowMore(false);
    item.onClick();
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(var(--app-safe-bottom)+8px)] z-40 px-3 md:hidden">
      {showMore && (
        <div
          className="pointer-events-auto mx-auto mb-2 max-h-[min(42dvh,320px)] w-full max-w-[390px] overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, rgba(var(--tj-surface), 0.94), rgba(var(--tj-bg-primary), 0.96))',
            border: '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint))',
            backdropFilter: 'blur(5px)',
            clipPath: panelClip,
          }}
        >
          <div className="flex items-center justify-between border-b border-[rgba(var(--tj-accent-primary),0.16)] px-3 py-2">
            <span className="font-serif text-[10px] tracking-[0.2em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.74)' }}>
              更多功能
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
              {moreItems.length}
            </span>
          </div>
          <div className="grid max-h-[min(34dvh,260px)] grid-cols-3 gap-2 overflow-y-auto p-2 no-scrollbar">
            {moreItems.map((item) => (
              <MenuTile key={item.id} item={item} onClick={() => handleItemClick(item)} />
            ))}
          </div>
        </div>
      )}

      <div
        className="pointer-events-auto mx-auto grid w-full max-w-[390px] grid-cols-5 gap-1.5 px-2 py-1.5"
        style={{
          background: `linear-gradient(180deg, rgba(var(--tj-accent-primary), var(--tj-edge-tint)) 0 1px, transparent 1px), linear-gradient(180deg, rgba(var(--tj-surface), 0.92), rgba(var(--tj-bg-primary), 0.95))`,
          border: '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint))',
          backdropFilter: 'blur(4px)',
          clipPath: panelClip,
        }}
      >
        {primaryItems.map((item) => (
          <DockButton key={item.id} item={item} onClick={() => handleItemClick(item)} />
        ))}
        <DockButton
          item={{ id: 'more', label: showMore ? '收起' : '更多', glyph: showMore ? '收' : '更', onClick: () => setShowMore((current) => !current) }}
          active={showMore}
          onClick={() => setShowMore((current) => !current)}
        />
      </div>
    </div>
  );
}

function DockButton({ item, active = false, onClick }: { item: MenuItem; active?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative flex h-[46px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 text-[12px] transition-all"
      style={{
        color: active ? 'rgb(var(--tj-text-primary))' : 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.92), rgba(var(--tj-accent-secondary),0.88))',
        background: active
          ? 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-primary), 0.06))'
          : 'linear-gradient(180deg, rgba(var(--tj-bg-secondary), 0.58), rgba(var(--tj-bg-primary), 0.36))',
        border: active
          ? '1px solid rgba(var(--tj-accent-primary), var(--tj-edge))'
          : '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint))',
        clipPath: itemClip,
      }}
      aria-label={item.label}
      title={item.label}
    >
      <span className="font-serif text-[15px] leading-none">{item.glyph}</span>
      <span className="max-w-full truncate text-[10px] leading-none tracking-[0.08em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
        {item.label}
      </span>
      {!!item.badge && item.badge > 0 && <Badge value={item.badge} />}
    </button>
  );
}

function MenuTile({ item, onClick }: { item: MenuItem; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-w-0 flex-col items-center gap-1 px-1 py-2 transition-all"
    >
      <span
        className="relative flex h-8 w-8 items-center justify-center text-[12px]"
        style={{
          color: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.94), rgba(var(--tj-accent-secondary),0.9))',
          background: 'rgba(var(--tj-bg-secondary), 0.5)',
          border: '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint))',
          clipPath: itemClip,
        }}
      >
        {item.glyph}
        {!!item.badge && item.badge > 0 && <Badge value={item.badge} />}
      </span>
      <span className="max-w-full truncate text-[10px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.86)' }}>
        {item.label}
      </span>
    </button>
  );
}

function Badge({ value }: { value: number }) {
  return (
    <span
      className="absolute -right-1 -top-1 min-w-4 px-1 text-center text-[9px] font-bold leading-4"
      style={{
        color: 'rgb(var(--tj-text-primary))',
        background: 'rgba(var(--tj-danger), 0.92)',
        borderRadius: 999,
      }}
    >
      {value > 99 ? '99+' : value}
    </span>
  );
}
