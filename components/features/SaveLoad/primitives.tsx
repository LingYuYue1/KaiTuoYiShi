import type { ReactNode } from 'react';

import { cardClip, smallClip } from './saveLoadStyles';

export function SaveActionButton({
  children,
  primary = false,
  warn = false,
  danger = false,
  disabled,
  onClick,
  className = '',
  size = 'md',
}: {
  children: ReactNode;
  primary?: boolean;
  warn?: boolean;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
  className?: string;
  size?: 'sm' | 'md';
}) {
  // 用 size prop 区分尺寸,避免 PC 默认 padding 与 mobile 传入的 px-2 py-2 在 Tailwind 里冲突
  // (Tailwind 中 px-4 的 CSS 定义在 px-2 之后,会覆盖 mobile 的值)。
  const sizeClass = size === 'sm' ? 'px-2.5 py-2 text-[11px]' : 'px-4 py-3 text-[12px]';
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={disabled}
      className={`cursor-pointer font-serif ${sizeClass} font-semibold tracking-[0.16em] transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      style={{
        color: primary ? 'rgba(var(--tj-surface-bg-start),1)' : danger ? 'rgba(var(--tj-danger),0.92)' : warn ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary),0.76)',
        background: primary
          ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),1))'
          : danger
            ? 'rgba(var(--tj-danger),0.07)'
          : warn
            ? 'rgba(var(--tj-accent-primary),0.06)'
            : 'rgba(var(--tj-accent-primary),0.07)',
        boxShadow: primary
          ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55), 0 0 20px rgba(var(--tj-tech-blue), 0.24)'
          : danger
            ? 'inset 0 0 0 1px rgba(var(--tj-danger),0.28)'
          : warn
            ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.28)'
            : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.18)',
        clipPath: smallClip,
      }}
    >
      {children}
    </button>
  );
}

export function SaveMetric({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="px-3 py-3 font-serif"
      style={{
        background: 'rgba(var(--tj-accent-primary),0.055)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.13)',
        clipPath: smallClip,
      }}
    >
      <b className="block text-[21px] leading-none tracking-[0.04em]" style={{ color: 'rgba(var(--tj-accent-primary),1)' }}>
        {value}
      </b>
      <span className="mt-1 block text-[11px] tracking-[0.16em]" style={{ color: 'rgba(var(--tj-text-primary),0.42)' }}>
        {label}
      </span>
    </div>
  );
}

export function TabButton({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer px-3 py-2 font-serif text-[12px] tracking-[0.16em] transition-all md:px-4 md:text-[13px] md:tracking-[0.24em]"
      style={{
        color: active ? 'rgba(var(--tj-surface-bg-start),1)' : 'rgba(var(--tj-text-primary),0.70)',
        background: active ? 'linear-gradient(135deg, rgba(var(--tj-accent-primary),1), rgba(var(--tj-accent-secondary),1))' : 'rgba(var(--tj-accent-primary),0.05)',
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-surface-bg-start), 0.55), 0 0 24px rgba(var(--tj-accent-primary), 0.28)'
          : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)',
        clipPath: smallClip,
      }}
    >
      {label}
      <span className="ml-2 text-[11px]" style={{ color: active ? 'rgba(var(--tj-panel-bg-start),0.66)' : 'rgba(var(--tj-text-primary),0.46)' }}>
        {count}
      </span>
    </button>
  );
}

export function SmallTag({ children, gold = false }: { children: ReactNode; gold?: boolean }) {
  return (
    <span
      className="px-1.5 py-0.5 font-serif text-[10px] tracking-[0.12em]"
      style={{
        color: gold ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-accent-primary),1)',
        background: gold ? 'rgba(var(--tj-accent-primary),0.08)' : 'rgba(var(--tj-accent-primary),0.08)',
        boxShadow: gold ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.16)',
        clipPath: smallClip,
      }}
    >
      {children}
    </span>
  );
}

export function EmptyState({ text, detail }: { text: string; detail?: string }) {
  return (
    <div
      className="p-6 text-center font-serif"
      style={{
        background: 'rgba(var(--tj-panel-bg-start),0.46)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.15)',
        clipPath: cardClip,
      }}
    >
      <p className="text-sm tracking-[0.2em]" style={{ color: 'rgba(var(--tj-text-primary),0.86)' }}>
        {text}
      </p>
      {detail && (
        <p className="mt-1.5 text-xs tracking-wider" style={{ color: 'rgba(var(--tj-text-primary),0.56)' }}>
          {detail}
        </p>
      )}
    </div>
  );
}
