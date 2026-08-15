import type { ReactNode } from 'react';
import type { WorldbookTab } from '@/hooks/useWorldbookManager';
import { smallClip } from './worldbookStyles';

export function HeaderButton({ children, onClick, primary = false }: { children: ReactNode; onClick: () => void; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="cursor-pointer px-2 py-1 text-[11px] font-serif tracking-[0.12em] transition-all duration-200 hover:opacity-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.6)] md:px-3 md:py-1.5 md:text-xs md:tracking-[0.2em]"
      style={{
        color: primary ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.96), rgba(var(--tj-accent-secondary),0.92))' : 'rgba(var(--tj-text-secondary), 0.9)',
        boxShadow: `inset 0 0 0 1px ${primary ? 'rgba(var(--tj-accent-primary), 0.55)' : 'rgba(var(--tj-accent-primary), 0.3)'}`,
        background: primary ? 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.12), rgba(var(--tj-accent-primary), 0.02))' : 'transparent',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

export function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 cursor-pointer px-2 py-1.5 text-xs font-serif tracking-[0.25em] transition-all duration-200 hover:opacity-85 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.5)]"
      style={{
        color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-secondary), 0.75)',
        background: active ? 'linear-gradient(180deg, rgba(var(--tj-accent-primary), 0.18), rgba(var(--tj-accent-primary), 0.04))' : 'transparent',
        boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.45)' : 'none',
        clipPath: smallClip,
      }}
    >
      {label}
    </button>
  );
}

export function ToggleSwitch({
  checked,
  disabled = false,
  onChange,
  title,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  title?: string;
}) {
  return (
    <span
      role="switch"
      tabIndex={disabled ? -1 : 0}
      aria-checked={checked}
      aria-disabled={disabled}
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        if (disabled) return;
        onChange(!checked);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === ' ' || event.key === 'Enter') {
          event.preventDefault();
          onChange(!checked);
        }
      }}
      className="relative inline-flex h-[18px] w-[34px] flex-shrink-0 items-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[rgba(var(--tj-accent-primary),0.6)]"
      style={{
        background: checked
          ? 'linear-gradient(90deg, rgba(var(--tj-accent-primary), 0.55), rgba(var(--tj-accent-secondary), 0.75))'
          : 'rgba(var(--tj-bg-primary), 0.85)',
        boxShadow: checked
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.8), 0 0 6px rgba(var(--tj-accent-primary), 0.35)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.28)',
        borderRadius: 10,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.78 : 1,
      }}
    >
      <span
        className="absolute h-[12px] w-[12px] transition-all duration-200"
        style={{
          left: checked ? 18 : 3,
          background: checked ? 'rgb(var(--tj-text-primary))' : 'rgba(var(--tj-text-secondary), 0.7)',
          boxShadow: '0 0 3px rgba(0,0,0,0.4)',
          borderRadius: 6,
        }}
      />
    </span>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-[10px] font-serif tracking-[0.3em]" style={{ color: 'rgba(var(--tj-accent-primary), 0.82)' }}>
        {label}
      </div>
      {children}
    </label>
  );
}

export function EmptyList({ activeTab }: { activeTab: WorldbookTab }) {
  return (
    <div className="px-4 py-10 text-center text-xs font-serif leading-6 tracking-wider whitespace-pre-line" style={{ color: 'rgba(var(--tj-text-secondary), 0.75)' }}>
      <div className="mb-2 text-3xl" style={{ color: 'rgba(var(--tj-accent-primary), 0.45)' }}>◇</div>
      {activeTab === 'user' ? '尚无额外世界书\n点击顶部「＋ 新建世界书」' : '内置世界书加载异常'}
    </div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="flex h-full items-center justify-center py-12">
      <div className="text-center">
        <div className="mb-3 text-4xl" style={{ color: 'rgba(var(--tj-accent-primary), 0.5)' }}>
          ◇
        </div>
        <div className="whitespace-pre-line text-sm font-serif tracking-[0.2em]" style={{ color: 'rgba(var(--tj-text-secondary), 0.78)' }}>
          {text}
        </div>
      </div>
    </div>
  );
}
