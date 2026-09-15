import { policyLabel } from '@/utils/variableManagerLogic';
import type { EditMode, SystemMeta } from '@/utils/variableManagerLogic';
import { cardClip, smallClip } from './settingsShared';

export function SystemBanner({ system, title, subtitle }: {
  system: SystemMeta;
  title: string;
  subtitle: string;
}) {
  return (
    <div
      className="p-4"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-tech-cyan), 0.10), rgba(var(--tj-bg-secondary), 0.42) 58%, rgba(var(--tj-bg-secondary), 0.68))',
        border: '1px solid rgba(var(--tj-tech-cyan), var(--tj-edge-tint))',
        clipPath: cardClip,
      }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="h-2 w-2" style={{ background: system.accent, boxShadow: `0 0 12px ${system.accent}` }} />
            <h3
              className="min-w-0 font-serif text-lg font-bold tracking-[0.22em]"
              style={{
                background: 'linear-gradient(135deg, rgb(var(--tj-text-primary)) 0%, rgb(var(--tj-tech-cyan)) 46%, rgb(var(--tj-accent-primary)) 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              {title}
            </h3>
            <span
              className="px-2 py-0.5 text-xs"
              style={{
                color: system.policy === 'writable' ? 'rgba(var(--tj-ui-success),0.95)' : 'rgba(var(--tj-ui-muted),0.86)',
                border: `1px solid ${system.policy === 'writable' ? 'rgba(180,235,190, var(--tj-edge-tint-strong))' : 'rgba(var(--tj-tech-cyan), var(--tj-edge-tint))'}`,
                clipPath: smallClip,
              }}
            >
              {policyLabel(system.policy)}
            </span>
          </div>
          <p className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.68)' }}>
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

export function EditorToolbar({ mode, onModeChange, stats, onReset, onSave, savedFlash, error, locked }: {
  mode: EditMode;
  onModeChange: (m: EditMode) => void;
  stats: string[];
  onReset: () => void;
  onSave: () => void;
  savedFlash: boolean;
  error: string | null;
  locked: boolean;
}) {
  return (
    <div className="flex flex-col items-stretch justify-between gap-2 sm:flex-row sm:items-center">
      <div className="flex gap-1">
        <button
          onClick={() => onModeChange('fields')}
          className="px-4 py-1.5 text-sm font-serif tracking-wider"
          style={{
            background: mode === 'fields' ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))' : 'transparent',
            color: mode === 'fields' ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.85)',
            border: mode === 'fields' ? 'none' : '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint))',
            clipPath: smallClip,
          }}
        >
          逐条修改
        </button>
        <button
          onClick={() => onModeChange('json')}
          className="px-4 py-1.5 text-sm font-serif tracking-wider"
          style={{
            background: mode === 'json' ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.86))' : 'transparent',
            color: mode === 'json' ? 'rgb(var(--tj-bg-primary))' : 'rgba(var(--tj-text-secondary), 0.85)',
            border: mode === 'json' ? 'none' : '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint))',
            clipPath: smallClip,
          }}
        >
          整体 JSON
        </button>
      </div>
      <div className="flex flex-col items-stretch gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex gap-1">
            <button
              onClick={onReset}
              disabled={locked}
              className="px-3 py-1.5 text-sm font-serif tracking-wider"
              style={{ color: 'rgba(var(--tj-text-secondary), 0.85)', border: '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint))', clipPath: smallClip }}
            >
              重置草稿
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {stats.map((item) => (
              <span
                key={item}
                className="px-2 py-1 font-mono text-xs"
                style={{
                  color: 'rgba(var(--tj-text-primary), 0.9)',
                  background: 'rgba(var(--tj-bg-primary), 0.38)',
                  border: '1px solid rgba(var(--tj-tech-cyan), var(--tj-edge-tint-weak))',
                  clipPath: smallClip,
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>

        <button
          onClick={onSave}
          disabled={locked}
          className="w-full py-3 text-sm font-serif tracking-[0.4em] transition-all hover:opacity-90"
          style={{
            background: savedFlash
              ? 'linear-gradient(135deg, rgba(140, 220, 160, 0.95), rgba(100, 180, 130, 0.95))'
              : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.96), rgba(var(--tj-btn-primary-end), 0.84))',
            color: 'rgb(var(--tj-on-accent))',
            border: savedFlash
              ? '1px solid rgba(220, 255, 230, var(--tj-edge-tint-strong))'
              : '1px solid rgba(var(--tj-text-primary), var(--tj-edge))',
            clipPath: cardClip,
          }}
        >
          {savedFlash ? '✓ 已 保 存' : '◆ 保 存 修 改'}
        </button>

        {locked && (
          <div
            className="px-3 py-2 text-xs"
            style={{
              color: 'rgba(var(--tj-accent-primary),0.92)',
              background: 'rgba(var(--tj-accent-primary),0.06)',
              border: '1px solid rgba(var(--tj-accent-primary), var(--tj-edge-tint))',
              clipPath: smallClip,
            }}
          >
            本回合结算中，完成后可修改。当前仍可浏览变量内容。
          </div>
        )}

        {error && (
          <div
            className="px-3 py-2 text-xs"
            style={{
              color: 'rgba(220, 120, 120, 0.9)',
              background: 'rgba(220, 120, 120, 0.06)',
              border: '1px solid rgba(220, 120, 120, var(--tj-edge-tint))',
              clipPath: smallClip,
            }}
          >
            ✕ {error}
          </div>
        )}
      </div>
    </div>
  );
}
