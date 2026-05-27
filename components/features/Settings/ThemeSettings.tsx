import type { 主题预设 } from '@/models/settings';
import { themes } from '@/styles/themes';

interface Props {
  current: 主题预设;
  onChange: (t: 主题预设) => void;
}

const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

const previewKeys = [
  '--tj-bg-primary',
  '--tj-bg-secondary',
  '--tj-accent-primary',
  '--tj-accent-secondary',
  '--tj-text-primary',
];

export function ThemeSettingsTab({ current, onChange }: Props) {
  return (
    <div>
      <div className="mb-5">
        <p
          className="font-serif text-sm tracking-[0.22em]"
          style={{ color: 'rgba(var(--tj-text-primary), 0.88)' }}
        >
          ◆ 为这趟旅程挑一种基调
        </p>
        <p className="mt-1 text-xs tracking-wider" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
          主题会立刻应用到游戏内界面，并随本地设置保存。
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {themes.map((t) => {
          const active = current === t.id;
          const accent = t.variables['--tj-accent-primary'];
          const accentSecondary = t.variables['--tj-accent-secondary'];
          const bg = t.variables['--tj-bg-secondary'];
          const text = t.variables['--tj-text-primary'];
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id as 主题预设)}
              className="group min-h-[132px] p-4 text-left transition-all hover:-translate-y-0.5"
              style={{
                background: active
                  ? `linear-gradient(135deg, rgba(${accent}, 0.16), rgba(${bg}, 0.74))`
                  : `linear-gradient(135deg, rgba(${bg}, 0.64), rgba(var(--tj-bg-primary), 0.42))`,
                boxShadow: active
                  ? `inset 0 0 0 1px rgba(${accent}, 0.7), 0 0 18px rgba(${accent}, 0.16)`
                  : `inset 0 0 0 1px rgba(${accent}, 0.22)`,
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
                      style={{ color: active ? `rgb(${accent})` : `rgb(${text})` }}
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
