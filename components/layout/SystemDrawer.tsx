import type { ReactNode } from 'react';

interface SystemDrawerProps {
  open: boolean;
  title: string;
  subtitle?: string;
  glyph?: string;
  onClose: () => void;
  children: ReactNode;
}

const headerClip =
  'polygon(0 0, 100% 0, 100% 100%, 18px 100%, 0 calc(100% - 18px))';

// 右侧抽屉：在中间「chat 区」内部用 absolute 滑出，不覆盖左侧信息栏和右侧菜单栏。
// 始终挂载，靠 transform 控制可见性，保证滑入/滑出动画。
export function SystemDrawer({ open, title, subtitle, glyph, onClose, children }: SystemDrawerProps) {
  return (
    <>
      <div
        onClick={onClose}
        className="kaituo-system-drawer-overlay absolute inset-0 z-30 transition-opacity duration-200"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      <aside
        className="kaituo-system-drawer absolute inset-0 z-40 flex flex-col overflow-hidden transition-transform duration-300"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(105%)',
        }}
        aria-hidden={!open}
      >
        {/* 左侧中部圆形关闭按钮 —— 大抽屉下手最顺的关闭入口 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭面板"
          title="关闭"
          className="absolute z-50 flex h-9 w-9 items-center justify-center font-serif text-base transition-all hover:bg-[rgba(var(--tj-accent-primary),0.18)]"
          style={{
            top: '50%',
            left: '-18px',
            transform: 'translateY(-50%)',
            color: 'rgb(var(--tj-accent-primary))',
            background:
              'linear-gradient(135deg, rgba(var(--tj-bubble), 0.98), rgba(var(--tj-surface), 0.98))',
            boxShadow:
              'inset 0 0 0 1px rgba(var(--tj-border), 0.9), -2px 0 8px rgba(var(--tj-shadow), 0.1)',
            borderRadius: '50%',
          }}
        >
          ‹
        </button>
        <header
          className="flex items-center gap-3 px-5 py-4"
          style={{
            borderBottom: '1px solid rgba(var(--tj-border), 0.78)' ,
            background:
              'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.07), rgba(var(--tj-accent-primary), 0))',
            clipPath: headerClip,
          }}
        >
          {glyph && (
            <span
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center font-serif text-base"
              style={{
                color: 'rgb(var(--tj-accent-primary))',
                background:
                  'linear-gradient(135deg, rgba(var(--tj-accent-primary), 0.12), rgba(var(--tj-accent-primary), 0.02))',
                boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72)',
                clipPath:
                  'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)',
              }}
            >
              {glyph}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h3
              className="truncate font-serif text-lg font-semibold tracking-[0.3em]"
              style={{
                background:
                  'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-accent-primary)) 55%, rgb(var(--tj-accent-secondary)) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                className="mt-1 font-serif text-[12px] italic leading-relaxed tracking-[0.16em]"
                style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 text-lg font-serif transition-all hover:opacity-80"
            style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}
            title="关闭"
          >
            ×
          </button>
        </header>

        <div className="flex flex-1 min-h-0 flex-col overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </>
  );
}
