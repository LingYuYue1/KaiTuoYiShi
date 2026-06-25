import { themes } from '@/styles/themes';
import type { 主题预设 } from '@/models/settings';

const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const previewKeys = [
  '--tj-bg-primary',
  '--tj-bg-secondary',
  '--tj-accent-primary',
  '--tj-accent-secondary',
  '--tj-text-primary',
];

export function ThemeSettingsTab({
  current,
  onChange,
}: {
  current: 主题预设;
  onChange: (t: 主题预设) => void;
}) {
  return (
    <div>
      <div className="mb-5">
        <p
          className="font-serif text-sm tracking-[0.22em]"
          style={{ color: 'rgba(var(--tj-text-primary), 0.88)' }}
        >
          ◆ 选择主题
        </p>
        <p className="mt-1 text-xs tracking-wider" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
          切换后立即生效，所有面板与控件配色同步变更。
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {themes.map((t) => {
          const active = t.id === current;
          const accent = t.variables['--tj-accent-primary'];
          const accentSecondary = t.variables['--tj-accent-secondary'];
          const bg = t.variables['--tj-bg-secondary'];
          const text = t.variables['--tj-text-primary'];
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id as 主题预设)}
              className="min-h-[132px] p-4 text-left transition-all"
              style={{
                background: active
                  ? `linear-gradient(135deg, rgba(${accent}, 0.16), rgba(${bg}, 0.74))`
                  : `rgba(var(--tj-bg-secondary), 0.34)`,
                boxShadow: active
                  ? `inset 0 0 0 1px rgba(${accent}, 0.7), 0 0 18px rgba(${accent}, 0.16)`
                  : `inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.15)`,
                clipPath: cardClip,
              }}
            >
              <div className="flex h-full flex-col justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div
                    className="grid h-12 w-12 flex-shrink-0 grid-cols-2 overflow-hidden"
                    style={{
                      boxShadow: `inset 0 0 0 1px rgba(${accent}, 0.42)`,
                      clipPath:
                        'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)',
                    }}
                  >
                    {previewKeys.slice(0, 4).map((key) => (
                      <span key={key} style={{ background: `rgb(${t.variables[key] || '0,0,0'})` }} />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className="font-serif text-sm font-bold tracking-wider"
                      style={{ color: `rgb(${accent})` }}
                    >
                      {t.name}
                    </div>
                    <div className="mt-1 text-xs leading-relaxed" style={{ color: `rgba(${text}, 0.72)` }}>
                      {t.description}
                    </div>
                  </div>
                  {active && (
                    <span
                      className="flex-shrink-0 text-xs font-serif tracking-[0.22em]"
                      style={{ color: `rgba(${accent}, 0.96)` }}
                    >
                      使用中
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {previewKeys.map((key) => {
                    const val = t.variables[key] || '0,0,0';
                    return (
                      <div
                        key={key}
                        className="h-5 flex-1"
                        style={{
                          background: `rgb(${val})`,
                          boxShadow: `inset 0 0 0 1px rgba(${accentSecondary}, 0.35)`,
                          clipPath:
                            'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
