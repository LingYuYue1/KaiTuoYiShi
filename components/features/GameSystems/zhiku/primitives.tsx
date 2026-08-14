import type { ReactNode } from 'react';
import { smallClip } from './constants';

export function CategoryButton({ label, count, desc, active, onClick }: { label: string; count: number; desc: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mb-0 flex h-[70px] min-w-[76px] shrink-0 flex-col justify-between px-2 py-2 text-center transition-all md:mb-2 md:h-auto md:w-full md:min-w-0 md:px-3 md:py-3 md:text-left md:last:mb-0"
      style={{
        background: active ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.14), rgba(var(--tj-btn-primary-start), 0.03))' : 'rgba(var(--tj-btn-primary-start), 0.035)',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42)' : 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
        clipPath: smallClip,
      }}
    >
      <div className="flex flex-col items-center justify-between gap-1 md:flex-row md:gap-3">
        <span className="line-clamp-1 font-serif text-xs tracking-[0.12em] md:text-sm md:tracking-[0.22em]" style={{ color: 'rgb(var(--tj-accent-primary))' }}>{label}</span>
        <span className="text-[10px] font-mono md:text-[11px]" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>{count}</span>
      </div>
      <div className="hidden md:mt-1 md:block md:text-[11px] md:leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.7)' }}>{desc}</div>
    </button>
  );
}

export function StatusChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="px-3 py-1.5"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-bubble),0.86), rgba(var(--tj-surface-strong),0.62))',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.66)',
        clipPath: smallClip,
      }}
    >
      <div className="text-[10px] font-mono tracking-[0.22em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.92)' }}>
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold" style={{ color: 'rgba(var(--tj-text-primary), 0.92)' }}>
        {value}
      </div>
    </div>
  );
}

export function TinyTab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 text-xs font-mono tracking-[0.3em] transition-all"
      style={{
        color: active ? 'rgb(var(--tj-bg-primary))' : 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.92), rgba(var(--tj-btn-primary-end), 0.88))',
        background: active ? 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-amber-deep), 0.95))' : 'rgba(var(--tj-btn-primary-start), 0.04)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.22)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="mt-3 block">
      <div className="mb-1.5 text-xs font-mono tracking-[0.24em]" style={{ color: 'rgba(var(--tj-btn-primary-start), 0.95)' }}>
        {label}
      </div>
      {children}
    </label>
  );
}

export function PerformanceTextarea({ label, value, editable, onChange }: { label: string; value: string; editable: boolean; onChange: (value: string) => void }) {
  return (
    <label className="block">
      <div className="mb-1 text-[11px] font-mono tracking-[0.18em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.76)' }}>
        {label}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={!editable}
        rows={3}
        className="kaituo-input w-full resize-y px-3 py-2 text-xs leading-relaxed"
        style={{ clipPath: smallClip }}
      />
    </label>
  );
}

export function StructuredFlag({ label, checked, editable, onChange }: { label: string; checked?: boolean; editable: boolean; onChange: (checked: boolean | undefined) => void }) {
  return (
    <label className="flex min-w-0 items-center justify-between gap-2 px-3 py-2" style={{ background: 'rgba(var(--tj-bubble),0.48)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)', clipPath: smallClip }}>
      <span className="truncate text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>{label}</span>
      <select
        value={typeof checked === 'boolean' ? String(checked) : ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}
        disabled={!editable}
        className="kaituo-input max-w-[7rem] px-2 py-1 text-xs"
        style={{ clipPath: smallClip }}
      >
        <option value="">继承范围</option>
        <option value="true">允许</option>
        <option value="false">禁止</option>
      </select>
    </label>
  );
}

export function EmptyNotice({ text }: { text: string }) {
  return (
    <div
      className="flex h-full min-h-[12rem] items-center justify-center px-5 text-center text-sm leading-relaxed"
      style={{
        color: 'rgba(var(--tj-text-secondary), 0.68)',
        background: 'rgba(var(--tj-bg-secondary), 0.35)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.12)',
        clipPath: smallClip,
      }}
    >
      {text}
    </div>
  );
}
