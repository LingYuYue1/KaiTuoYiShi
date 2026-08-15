import { detectTavernMacroInfo } from '@/utils/tavernMacroDetect';
import { smallClip } from './settingsShared';

export function TogglePill({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className="inline-flex items-center gap-2 text-xs transition-all disabled:cursor-not-allowed"
      style={{ color: checked ? 'rgba(var(--tj-ui-nsfw), 0.92)' : 'rgba(var(--tj-text-secondary), 0.58)' }}
    >
      {label && <span>{label}</span>}
      <span
        className="relative inline-flex h-5 w-9 items-center"
        style={{
          background: checked ? 'rgba(var(--tj-ui-nsfw), 0.2)' : 'rgba(var(--tj-bg-primary), 0.42)',
          boxShadow: `inset 0 0 0 1px ${checked ? 'rgba(var(--tj-ui-nsfw), 0.42)' : 'rgba(var(--tj-text-secondary), 0.18)'}`,
          clipPath: smallClip,
          opacity: disabled ? 0.62 : 1,
        }}
      >
        <span
          className="absolute top-1 h-3 w-3 transition-all"
          style={{
            left: checked ? 'calc(100% - 1rem)' : '0.25rem',
            background: checked ? 'rgba(var(--tj-ui-nsfw), 0.95)' : 'rgba(var(--tj-text-secondary), 0.66)',
            clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)',
          }}
        />
      </span>
    </button>
  );
}

export function MacroInspector({ content }: { content: string }) {
  const macro = detectTavernMacroInfo(content);
  if (macro.level === 'none') {
    return (
      <div className="px-3 py-2 text-xs" style={{ color: 'rgba(var(--tj-text-secondary), 0.58)', boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary), 0.08)', clipPath: smallClip }}>
        宏检测：未发现宏。
      </div>
    );
  }
  return (
    <div
      className="flex flex-col gap-2 px-3 py-2 text-xs"
      style={{
        color: 'rgba(var(--tj-text-secondary), 0.72)',
        boxShadow: `inset 0 0 0 1px ${macro.level === 'advanced' ? 'rgba(var(--tj-danger), 0.22)' : 'rgba(var(--tj-ui-nsfw), 0.18)'}`,
        clipPath: smallClip,
      }}
    >
      <div className="font-serif tracking-[0.14em]" style={{ color: macro.level === 'advanced' ? 'rgba(var(--tj-danger), 0.86)' : 'rgba(var(--tj-ui-nsfw), 0.82)' }}>
        宏检测 · {macro.level === 'advanced' ? '高级宏' : '基础宏'}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {macro.macros.map((item) => (
          <span key={item} className="px-1.5 py-0.5" style={{ color: 'rgba(var(--tj-text-primary), 0.72)', background: 'rgba(var(--tj-bg-primary), 0.36)', clipPath: smallClip }}>
            {item}
          </span>
        ))}
      </div>
      {macro.level === 'advanced' && (
        <div className="leading-5">
          该条目可能承担变量赋值、条件分支或随机选择逻辑，建议审查后再关闭。
        </div>
      )}
    </div>
  );
}
