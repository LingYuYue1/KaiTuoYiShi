import { BUILTIN_PHONE_WALLPAPERS } from '@/data/builtinPhoneWallpapers';
import type { PhoneActions, PhoneState } from '@/hooks/usePhone';
import { cardClip, smallClip } from './phoneStyles';

export function WallpaperApp({ state, actions }: { state: PhoneState; actions: PhoneActions }) {
  return (
    <WallpaperSurface
      homeWallpaper={state.homeWallpaper}
      chatWallpaper={state.chatWallpaperSetting}
      onSetHome={(src) => actions.setWallpaper('home', src)}
      onSetChat={(src) => actions.setWallpaper('chat', src)}
      onResetHome={() => actions.setWallpaper('home', undefined)}
      onResetChat={() => actions.setWallpaper('chat', undefined)}
    />
  );
}

function WallpaperSurface({
  homeWallpaper,
  chatWallpaper,
  onSetHome,
  onSetChat,
  onResetHome,
  onResetChat,
}: {
  homeWallpaper: string;
  chatWallpaper: string;
  onSetHome: (src: string) => void;
  onSetChat: (src: string) => void;
  onResetHome: () => void;
  onResetChat: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-5 py-5 lg:grid-cols-[220px_1fr]">
        <aside className="space-y-3">
          <WallpaperPreview title="桌面预览" src={homeWallpaper} />
          <WallpaperPreview title="短讯背景" src={chatWallpaper} compact />
          <div className="grid grid-cols-2 gap-2">
            <PhoneSmallButton label="桌面默认" onClick={onResetHome} />
            <PhoneSmallButton label="短讯默认" onClick={onResetChat} />
          </div>
        </aside>

        <main className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="font-serif text-sm font-bold tracking-[0.18em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                内置壁纸
              </div>
              <div className="mt-1 text-[11px] tracking-[0.14em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
                选择后会写入手机存档，玩家自定义优先于默认壁纸
              </div>
            </div>
            <span className="text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.62)' }}>
              {BUILTIN_PHONE_WALLPAPERS.length}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {BUILTIN_PHONE_WALLPAPERS.map((wallpaper) => {
              const isHome = homeWallpaper === wallpaper.src;
              const isChat = chatWallpaper === wallpaper.src;
              return (
                <article
                  key={wallpaper.id}
                  className="overflow-hidden"
                  style={{
                    background: 'rgba(var(--tj-bg-primary), 0.48)',
                    boxShadow: isHome || isChat
                      ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.58), 0 0 18px rgba(var(--tj-accent-primary),0.08)'
                      : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
                    clipPath: cardClip,
                  }}
                >
                  <div className="aspect-[9/16] max-h-[260px] w-full overflow-hidden">
                    <img
                      src={wallpaper.src}
                      alt={wallpaper.title}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="space-y-2 px-3 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate font-serif text-sm font-bold tracking-[0.12em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                        {wallpaper.title}
                      </h3>
                      {(isHome || isChat) && (
                        <span className="shrink-0 text-[10px]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                          {isHome && isChat ? '桌面/短讯' : isHome ? '桌面' : '短讯'}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
                      {wallpaper.description}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <PhoneSmallButton label="设为桌面" active={isHome} onClick={() => onSetHome(wallpaper.src)} />
                      <PhoneSmallButton label="设为短讯" active={isChat} onClick={() => onSetChat(wallpaper.src)} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}

function WallpaperPreview({ title, src, compact = false }: { title: string; src: string; compact?: boolean }) {
  return (
    <section
      className="overflow-hidden"
      style={{
        background: 'rgba(var(--tj-bg-primary), 0.48)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.18)',
        clipPath: cardClip,
      }}
    >
      <div className={compact ? 'aspect-[16/9]' : 'aspect-[9/16]'}>
        <img src={src} alt={title} loading="lazy" className="h-full w-full object-cover" />
      </div>
      <div className="px-3 py-2 font-serif text-xs tracking-[0.16em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
        {title}
      </div>
    </section>
  );
}

function PhoneSmallButton({
  label,
  active = false,
  onClick,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2.5 py-1.5 text-[11px] font-serif tracking-[0.12em] transition-all hover:opacity-90"
      style={{
        color: active ? 'rgb(var(--tj-bg-primary))' : 'rgb(var(--tj-accent-primary))',
        background: active
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.95), rgba(var(--tj-amber-deep),0.95))'
          : 'rgba(var(--tj-accent-primary), 0.055)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.45)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.22)',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}
