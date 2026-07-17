import { type LucideIcon } from 'lucide-react';
import { Tooltip } from './Tooltip';

const iconClip =
  'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)';

interface IconButtonProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  disabledReason?: string;
  active?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  onClick?: () => void;
}

/** Shared command icon button with an accessible tooltip and touch-sized hit target. */
export function IconButton({ icon: Icon, label, description, disabledReason, active, disabled, pressed, onClick }: IconButtonProps) {
  return (
    <Tooltip label={label} description={disabled ? disabledReason ?? description : description}>
      <button
        type="button"
        onClick={() => { if (!disabled) onClick?.(); }}
        aria-label={label}
        aria-disabled={disabled || undefined}
        aria-pressed={pressed}
        className="flex h-11 w-11 items-center justify-center transition-[color,background-color,box-shadow,opacity] duration-100 hover:bg-[rgba(var(--tj-accent-primary),0.14)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(var(--tj-accent-primary),0.72)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--tj-surface))] motion-reduce:transition-none md:h-8 md:w-10"
        style={{
          color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-accent-primary), 0.85)',
          background: active ? 'rgba(var(--tj-accent-primary), 0.14)' : 'rgba(var(--tj-accent-primary), 0.05)',
          boxShadow: active ? 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.55)' : 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.3)',
          clipPath: iconClip, opacity: disabled ? 0.35 : 1, cursor: disabled ? 'not-allowed' : 'default',
        }}
      >
        <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
      </button>
    </Tooltip>
  );
}
