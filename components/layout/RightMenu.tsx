import { GAME_MENU_ITEMS, type GameSystemId } from '@/data/gameMenu';

interface RightMenuProps {
  activeId: GameSystemId | null;
  onSelect: (id: GameSystemId) => void;
  onSaveGame: () => void;
  onLoadGame: () => void;
  onSettings: () => void;
}

const itemClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

export function RightMenu({ activeId, onSelect, onSaveGame, onLoadGame, onSettings }: RightMenuProps) {
  return (
    <div className="kaituo-right-menu hidden md:flex md:w-[16%] min-w-[200px] max-w-[240px] flex-col">
      <div
        className="px-4 py-3.5 text-center"
        style={{ borderBottom: '1px solid rgba(var(--tj-border), 0.72)' }}
      >
        <div
          className="font-serif text-[11px] tracking-[0.5em]"
          style={{ color: 'rgba(var(--tj-accent-primary), 0.72)' }}
        >
          ◆ MENU
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2.5 py-3">
        {GAME_MENU_ITEMS.map((item) => (
          <SystemButton
            key={item.id}
            glyph={item.glyph}
            label={item.label}
            subtitle={item.subtitle}
            active={activeId === item.id}
            onClick={() => onSelect(item.id)}
          />
        ))}
      </div>

      <div
        className="px-3 py-3"
        style={{
          borderTop: '1px solid rgba(var(--tj-border), 0.72)' ,
          background: 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.03), transparent)',
        }}
      >
        <FooterButton label="保存存档" onClick={onSaveGame} />
        <FooterButton label="读取存档" onClick={onLoadGame} />
        <FooterButton label="设置" onClick={onSettings} />
      </div>
    </div>
  );
}

function SystemButton({
  glyph,
  label,
  subtitle,
  active,
  onClick,
}: {
  glyph: string;
  label: string;
  subtitle: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="kaituo-menu-item group mb-1.5 flex w-full items-center gap-3 px-3 py-2.5 text-left transition-all"
      style={{
        background: active
          ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-primary), 0.025))'
          : 'rgba(var(--tj-bubble), 0.34)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.5), inset 3px 0 0 rgba(var(--tj-accent-primary), 0.95)'
          : 'inset 0 0 0 1px rgba(var(--tj-border), 0.64)',
        clipPath: itemClip,
      }}
    >
      <span
        className="kaituo-menu-glyph flex h-9 w-9 flex-shrink-0 items-center justify-center font-serif text-lg transition-all"
        style={{
          color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-accent-primary), 0.72)',
          background: active ? 'rgba(var(--tj-accent-primary), 0.14)' : 'rgba(var(--tj-accent-primary), 0.05)',
          boxShadow: `inset 0 0 0 1px rgba(var(--tj-accent-primary), ${active ? 0.55 : 0.28})`,
          clipPath: itemClip,
        }}
      >
        {glyph}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className="kaituo-menu-label block truncate font-serif text-[15px] font-semibold tracking-[0.22em] transition-colors"
          style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.95)' }}
        >
          {label}
        </span>
        <span
          className="mt-0.5 block truncate font-serif text-[11px] tracking-[0.16em]"
          style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}
        >
          {subtitle}
        </span>
      </span>
    </button>
  );
}

function FooterButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="kaituo-menu-footer mb-1.5 block w-full px-3 py-2 text-center font-serif text-sm tracking-[0.28em] transition-all last:mb-0"
      style={{
        color: 'rgba(var(--tj-text-primary), 0.92)',
        background: 'rgba(var(--tj-accent-primary), 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72)',
        clipPath: itemClip,
      }}
    >
      {label}
    </button>
  );
}
