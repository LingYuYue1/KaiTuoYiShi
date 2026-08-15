import type { SystemKey } from '@/utils/variableManagerLogic';
import { cardClip, smallClip } from './settingsShared';

export interface SystemSidebarEntry {
  key: SystemKey;
  label: string;
  desc: string;
  accent: string;
  count: number;
}

export function SystemSidebar({ entries, activeKey, onSelect }: {
  entries: SystemSidebarEntry[];
  activeKey: SystemKey;
  onSelect: (key: SystemKey) => void;
}) {
  return (
    <aside
      className="max-h-[34dvh] space-y-2 overflow-y-auto p-3 md:max-h-none"
      style={{
        background: 'rgba(var(--tj-bg-secondary), 0.42)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.14)',
        clipPath: cardClip,
      }}
    >
      <div className="px-1 pb-1">
        <div
          className="font-serif text-base font-bold tracking-[0.24em]"
          style={{
            background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-tech-cyan)) 46%, rgb(var(--tj-accent-primary)) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          变量中枢
        </div>
        <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.68)' }}>
          按系统查看与修正存档数据。
        </div>
      </div>

      {entries.map((system) => {
        const active = system.key === activeKey;
        return (
          <button
            key={system.key}
            onClick={() => onSelect(system.key)}
            className="w-full px-3 py-2.5 text-left transition-all"
            style={{
              background: active
                ? 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.24), rgba(var(--tj-accent-primary), 0.08))'
                : 'rgba(var(--tj-bg-secondary), 0.34)',
              boxShadow: active
                ? `inset 3px 0 0 ${system.accent}, inset 0 0 0 1px rgba(var(--tj-tech-cyan), 0.56), 0 0 18px rgba(var(--tj-tech-cyan), 0.10)`
                : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.12)',
              clipPath: smallClip,
            }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-serif text-base font-bold tracking-wider" style={{ color: active ? system.accent : 'rgb(var(--tj-text-primary))' }}>
                {system.label}
              </span>
              <span className="font-mono text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
                {system.count}
              </span>
            </div>
            <div className="mt-0.5 truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.58)' }}>
              {system.desc}
            </div>
          </button>
        );
      })}
    </aside>
  );
}
