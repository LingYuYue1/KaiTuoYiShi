import type { 主题预设 } from '@/models/settings';
import { themes } from '@/styles/themes';

interface Props {
  current: 主题预设;
  onChange: (t: 主题预设) => void;
}

const cardClip =
  'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

export function ThemeSettingsTab({ current, onChange }: Props) {
  return (
    <div>
      <p
        className="mb-4 text-xs font-serif tracking-[0.2em]"
        style={{ color: 'rgba(200, 188, 158, 0.75)' }}
      >
        ◆ 为这趟旅程挑一种基调
      </p>
      <div className="grid grid-cols-1 gap-3">
        {themes.map((t) => {
          const active = current === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onChange(t.id as 主题预设)}
              className="p-4 text-left transition-all hover:opacity-95"
              style={{
                background: active
                  ? 'linear-gradient(135deg, rgba(245, 217, 122, 0.10), rgba(196, 163, 90, 0.04))'
                  : 'rgba(16, 14, 16, 0.55)',
                boxShadow: active
                  ? 'inset 0 0 0 1px rgba(245, 217, 122, 0.55), 0 0 14px rgba(245, 217, 122, 0.12)'
                  : 'inset 0 0 0 1px rgba(245, 217, 122, 0.18)',
                clipPath: cardClip,
              }}
            >
              <div className="flex items-center gap-3">
                {/* Color preview swatches */}
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map((i) => {
                    const keys = ['--tj-bg-primary', '--tj-bg-secondary', '--tj-accent-primary', '--tj-text-primary'];
                    const val = t.variables[keys[i]] || '0,0,0';
                    return (
                      <div
                        key={i}
                        className="h-6 w-6"
                        style={{
                          background: `rgb(${val})`,
                          boxShadow: 'inset 0 0 0 1px rgba(245, 217, 122, 0.4)',
                          clipPath:
                            'polygon(4px 0, 100% 0, 100% calc(100% - 4px), calc(100% - 4px) 100%, 0 100%, 0 4px)',
                        }}
                      />
                    );
                  })}
                </div>
                <div>
                  <div
                    className="font-serif font-bold text-sm tracking-wider"
                    style={{ color: active ? 'rgb(245, 217, 122)' : 'rgb(var(--tj-text-primary))' }}
                  >
                    {t.name}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'rgba(200, 188, 158, 0.7)' }}>
                    {t.description}
                  </div>
                </div>
                {active && (
                  <span
                    className="ml-auto text-xs font-serif tracking-[0.25em]"
                    style={{ color: 'rgba(245, 217, 122, 0.95)' }}
                  >
                    使用中
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
