import { mediumClip, smallClip } from './turnStyles';

export function ToolButton({
  label,
  glyph,
  active,
  disabled,
  title,
  onClick,
}: {
  label: string;
  glyph: string;
  active?: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 px-2.5 py-1 font-serif text-[11px] tracking-[0.18em] transition-all hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
      style={{
        color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-text-primary), 0.85)',
        background: active ? 'rgba(var(--tj-btn-primary-start), 0.14)' : 'rgba(var(--tj-btn-primary-start), 0.04)',
        border: active
          ? '1px solid rgba(var(--tj-btn-primary-start), var(--tj-edge))'
          : '1px solid rgba(var(--tj-btn-primary-start), var(--tj-edge-tint))',
        clipPath: smallClip,
      }}
      title={title ?? label}
    >
      <span className="text-xs" style={{ color: active ? 'rgb(var(--tj-accent-primary))' : 'rgba(var(--tj-btn-primary-start), 0.65)' }}>
        {glyph}
      </span>
      <span>{label}</span>
    </button>
  );
}

export function TurnBadge({ value }: { value: string }) {
  return (
    <div
      className="px-3 py-1 font-serif text-[11px] tracking-[0.22em]"
      style={{
        color: 'rgb(var(--tj-accent-primary))',
        background:
          'linear-gradient(180deg, rgba(var(--tj-btn-primary-start), 0.18), rgba(var(--tj-btn-primary-end), 0.08))',
        border: '1px solid rgba(var(--tj-btn-primary-start), var(--tj-edge))',
        clipPath: smallClip,
      }}
    >
      第 {value} 回合
    </div>
  );
}

export function PanelText({ content, label }: { content: string; label: string }) {
  return (
    <div className="px-4 py-3">
      <div
        className="mb-1.5 font-serif text-[11px] tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-btn-primary-start), 0.7)' }}
      >
        ◆ {label}
      </div>
      <div
        className="whitespace-pre-wrap text-xs leading-relaxed"
        style={{ color: 'rgba(var(--tj-text-secondary), 0.92)' }}
      >
        {content}
      </div>
    </div>
  );
}

export function EditBodyPanel({
  draft,
  setDraft,
  onSave,
  onCancel,
}: {
  draft: string;
  setDraft: (v: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="px-4 py-3">
      <div
        className="mb-1.5 font-serif text-[11px] tracking-[0.3em]"
        style={{ color: 'rgba(var(--tj-btn-primary-start), 0.7)' }}
      >
        ◆ 修改正文
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        className="kaituo-input w-full resize-y px-3 py-2 text-sm"
        style={{
          clipPath: mediumClip,
        }}
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-1.5 font-serif text-xs tracking-[0.25em] transition-all hover:opacity-90"
          style={{
            color: 'rgba(var(--tj-text-primary), 0.9)',
            background: 'rgba(var(--tj-btn-primary-start), 0.04)',
            border: '1px solid rgba(var(--tj-btn-primary-start), var(--tj-edge-tint))',
            clipPath: smallClip,
          }}
        >
          取消
        </button>
        <button
          type="button"
          onClick={onSave}
          className="px-4 py-1.5 font-serif text-xs tracking-[0.25em] transition-all hover:opacity-90"
          style={{
            color: 'rgb(var(--tj-on-accent))',
            background: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start), 0.95), rgba(var(--tj-btn-primary-end), 0.95))',
            border: '1px solid rgba(var(--tj-text-primary), var(--tj-edge))',
            clipPath: smallClip,
          }}
        >
          保存
        </button>
      </div>
    </div>
  );
}
