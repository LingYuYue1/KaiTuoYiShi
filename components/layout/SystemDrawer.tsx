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
        className="absolute inset-0 z-30 transition-opacity duration-200"
        style={{
          background: 'rgba(6, 5, 14, 0.55)',
          opacity: open ? 1 : 0,
          pointerEvents: open ? 'auto' : 'none',
        }}
      />

      <aside
        className="absolute inset-0 z-40 flex flex-col overflow-hidden transition-transform duration-300"
        style={{
          transform: open ? 'translateX(0)' : 'translateX(105%)',
          background:
            'linear-gradient(180deg, rgba(18, 16, 18, 0.98), rgba(10, 9, 10, 0.99))',
          boxShadow:
            'inset 1px 0 0 rgba(245, 217, 122, 0.45), -8px 0 24px rgba(0, 0, 0, 0.45)',
        }}
        aria-hidden={!open}
      >
        {/* 左侧中部圆形关闭按钮 —— 大抽屉下手最顺的关闭入口 */}
        <button
          type="button"
          onClick={onClose}
          aria-label="关闭面板"
          title="关闭"
          className="absolute z-50 flex h-9 w-9 items-center justify-center font-serif text-base transition-all hover:bg-[rgba(245,217,122,0.18)]"
          style={{
            top: '50%',
            left: '-18px',
            transform: 'translateY(-50%)',
            color: 'rgb(245, 217, 122)',
            background:
              'linear-gradient(135deg, rgba(20, 18, 20, 0.96), rgba(10, 9, 10, 0.98))',
            boxShadow:
              'inset 0 0 0 1px rgba(245, 217, 122, 0.55), -2px 0 8px rgba(0, 0, 0, 0.45)',
            borderRadius: '50%',
          }}
        >
          ‹
        </button>
        <header
          className="flex items-center gap-3 px-5 py-4"
          style={{
            borderBottom: '1px solid rgba(245, 217, 122, 0.28)',
            background:
              'linear-gradient(180deg, rgba(245, 217, 122, 0.07), rgba(245, 217, 122, 0))',
            clipPath: headerClip,
          }}
        >
          {glyph && (
            <span
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center font-serif text-base"
              style={{
                color: 'rgb(245, 217, 122)',
                background:
                  'linear-gradient(135deg, rgba(245, 217, 122, 0.12), rgba(245, 217, 122, 0.02))',
                boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.45)',
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
                  'linear-gradient(135deg, #fff4d4 0%, #f5d97a 55%, #c4a35a 100%)',
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
                style={{ color: 'rgba(235, 223, 193, 0.92)' }}
              >
                {subtitle}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-2 py-1 text-lg font-serif transition-all hover:opacity-80"
            style={{ color: 'rgba(200, 188, 158, 0.7)' }}
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
