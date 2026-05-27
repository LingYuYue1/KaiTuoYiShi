import type { 剧情推进建议 } from '@/models/storyProgress';

interface Props {
  suggestion: 剧情推进建议 | null;
  disabled?: boolean;
  compact?: boolean;
  onConfirm: () => void;
  onDeviate: () => void;
  onDismiss: () => void;
}

const cardClip = 'polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px)';
const btnClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';

export function StoryProgressSuggestionCard({ suggestion, disabled, compact = false, onConfirm, onDeviate, onDismiss }: Props) {
  if (!suggestion) return null;
  return (
    <div
      className={compact ? 'mt-3 p-3' : 'mx-3 mb-2 p-4'}
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-tech-wash),0.88), rgba(var(--tj-bubble),0.9) 42%, rgba(var(--tj-surface-strong),0.72))',
        boxShadow: 'inset 0 0 0 1px rgba(38,105,116,0.24), inset 4px 0 0 rgba(var(--tj-accent-primary),0.62)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-2 text-xs tracking-[0.32em]" style={{ color: 'rgba(38,105,116,0.92)' }}>
        剧 情 编 织 · 进 度 建 议
      </div>
      <div className="font-serif text-sm font-bold leading-relaxed" style={{ color: 'rgb(var(--tj-text-primary))' }}>
        是否结束「{suggestion.分段标题}」？
      </div>
      <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary),0.84)' }}>
        系统检测到当前正文可能已经完成这段剧情。理由：{suggestion.理由}
      </div>
      {suggestion.下一分段标题 && (
      <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-accent-primary),0.94)' }}>
          确认后会标记本段为“已经历”，并将「{suggestion.下一分段标题}」设为当前段。
        </div>
      )}
      <div className={compact ? 'mt-3 grid gap-2' : 'mt-3 flex flex-wrap gap-2'}>
        <button
          type="button"
          disabled={disabled}
          onClick={onConfirm}
          className="flex-1 px-3 py-2 text-xs font-serif tracking-[0.2em] transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, rgba(var(--tj-accent-primary),0.9), rgba(212,177,90,0.9))',
            color: 'rgb(var(--tj-on-accent))',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-text-primary),0.45)',
            clipPath: btnClip,
          }}
        >
          确认推进
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onDeviate}
          className="px-3 py-2 text-xs tracking-[0.16em] transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            background: 'rgba(var(--tj-accent-primary),0.08)',
            color: 'rgba(var(--tj-accent-primary),0.96)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-accent-primary),0.34)',
            clipPath: btnClip,
          }}
        >
          标记偏离
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={onDismiss}
          className="px-3 py-2 text-xs tracking-[0.16em] transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            background: 'rgba(var(--tj-surface-strong),0.78)',
            color: 'rgba(var(--tj-text-primary),0.88)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border),0.68)',
            clipPath: btnClip,
          }}
        >
          暂不处理
        </button>
      </div>
    </div>
  );
}
