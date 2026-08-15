import type { KeyboardEvent, ReactNode } from 'react';
import { smallClip } from './wizardData';

export function Chip({
  children,
  background,
  color,
  className,
  border,
}: {
  children: ReactNode;
  background: string;
  color: string;
  className: string;
  border?: string;
}) {
  return (
    <span className={className} style={{ background, color, clipPath: smallClip, boxShadow: border }}>
      {children}
    </span>
  );
}

export function DraftInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  id,
  onKeyDown,
  className = 'w-full px-3 py-2 text-sm',
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  id?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      disabled={disabled}
      id={id}
      onKeyDown={onKeyDown}
      className={`kaituo-input ${className}`}
      style={{ clipPath: smallClip }}
    />
  );
}

export function DraftTextarea({
  value,
  onChange,
  placeholder,
  rows,
  className = 'w-full resize-none px-3 py-2 text-sm',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={`kaituo-input ${className}`}
      style={{ clipPath: smallClip }}
    />
  );
}

export function SmallActionButton({
  children,
  onClick,
  background,
  color,
  className,
  boxShadow,
}: {
  children: ReactNode;
  onClick: () => void;
  background: string;
  color: string;
  className?: string;
  boxShadow?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-1 text-[11px]${className ? ` ${className}` : ''}`}
      style={{ background, color, boxShadow, clipPath: smallClip }}
    >
      {children}
    </button>
  );
}
