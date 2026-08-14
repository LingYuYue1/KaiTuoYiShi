import { usePhone, type PhoneModalProps } from '@/hooks/usePhone';

import { ContactsApp } from './ContactsApp';
import { MessagesApp } from './MessagesApp';
import { NewsApp } from './NewsApp';
import { PhoneHome } from './PhoneHome';
import { WallpaperApp } from './WallpaperApp';
import { cardClip, phoneScreenSurface, phoneShellClip, phoneShellSurface, smallClip } from './phoneStyles';

const APP_TITLES = {
  messages: ['短讯', 'MESSAGE APP'],
  contacts: ['通讯录', 'CONTACTS'],
  news: ['星际和平周报', 'NEWS FEED'],
  wallpapers: ['壁纸', 'WALLPAPER'],
} as const;

export function PhoneModal(props: PhoneModalProps) {
  const { state, actions } = usePhone(props);
  const [title, subtitle] = APP_TITLES[state.activeApp ?? 'wallpapers'];

  return (
    <div
      className="fixed inset-0 z-50 overflow-auto p-3 sm:p-4"
      style={{ background: 'rgba(var(--tj-bg-primary), 0.88)', backdropFilter: 'blur(4px)' }}
      onClick={props.onClose}
      role="presentation"
    >
      {/* Content stops propagation so only blank scrim dismisses (desktop click-outside). */}
      <div
        className="flex w-full flex-col items-start gap-3 xl:flex-row xl:items-start"
        onClick={(e) => e.stopPropagation()}
      >
        <section
          className={`${state.activeApp ? 'hidden xl:flex' : 'flex'} relative h-[min(84vh,760px)] w-full max-w-[340px] flex-shrink-0 overflow-hidden p-3 xl:w-[340px]`}
          style={{
            background: phoneShellSurface,
            boxShadow:
              'inset 0 0 0 1px rgba(var(--tj-border), 0.72), inset 0 0 0 8px rgba(var(--tj-surface),0.48), 0 24px 54px rgba(var(--tj-shadow), 0.16)',
            clipPath: phoneShellClip,
          }}
        >
          <div
            className="pointer-events-none absolute left-1/2 top-2 h-1.5 w-24 -translate-x-1/2"
            style={{
              background: 'rgba(var(--tj-accent-primary), 0.22)',
              borderRadius: 999,
              boxShadow: '0 0 10px rgba(var(--tj-accent-primary),0.18)',
            }}
          />
          <div
            className="flex min-h-0 flex-1 overflow-hidden"
            style={{
              background: phoneScreenSurface,
              boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)',
              clipPath: cardClip,
            }}
          >
            <PhoneHome
              unread={state.unreadTotal}
              contactCount={state.contacts.length}
              chatCount={state.chatCount}
              activeApp={state.activeApp}
              onOpen={actions.openApp}
              onClose={props.onClose}
              wallpaper={state.homeWallpaper}
            />
          </div>
        </section>

        {state.activeApp && (
          <section
            className="relative flex h-[min(86vh,780px)] w-full min-w-0 flex-none overflow-hidden p-3 xl:h-[min(84vh,760px)] xl:w-[980px]"
            style={{
              background: phoneShellSurface,
              boxShadow:
                'inset 0 0 0 1px rgba(var(--tj-border), 0.7), inset 0 0 0 8px rgba(var(--tj-surface),0.48), 0 24px 54px rgba(var(--tj-shadow), 0.14)',
              clipPath: phoneShellClip,
            }}
          >
            <div
              className="flex min-h-0 w-full flex-col overflow-hidden"
              style={{
                background: state.chatWallpaper
                  ? `linear-gradient(180deg, rgba(var(--tj-surface), 0.88), rgba(var(--tj-bg-secondary), 0.94)), url(${state.chatWallpaper}) center/cover`
                  : phoneScreenSurface,
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.62)',
                clipPath: cardClip,
              }}
            >
              <header className="flex items-center justify-between gap-4 border-b px-4 py-3 sm:px-5 sm:py-4" style={{ borderColor: 'rgba(var(--tj-accent-primary), 0.18)' }}>
                <div className="min-w-0">
                  <div className="truncate font-serif text-base font-bold tracking-[0.2em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>
                    {title}
                  </div>
                  <div className="mt-1 text-[11px] tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.64)' }}>
                    {subtitle}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={actions.closeApp}
                  className="px-2 py-1 text-xs font-serif tracking-[0.16em]"
                  style={{
                    color: 'rgba(var(--tj-accent-primary), 0.85)',
                    background: 'rgba(var(--tj-accent-primary), 0.05)',
                    boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.2)',
                    clipPath: smallClip,
                  }}
                >
                  回到桌面
                </button>
              </header>

              {state.activeApp === 'messages' ? (
                <MessagesApp state={state} actions={actions} traveler={props.traveler} />
              ) : state.activeApp === 'contacts' ? (
                <ContactsApp state={state} actions={actions} />
              ) : state.activeApp === 'news' ? (
                <NewsApp news={props.news} />
              ) : (
                <WallpaperApp state={state} actions={actions} />
              )}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
