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
        background: 'linear-gradient(135deg, rgba(117,214,216,0.08), rgba(245,217,122,0.07), rgba(10,9,10,0.82))',
        boxShadow: 'inset 0 0 0 1px rgba(117,214,216,0.34), inset 4px 0 0 rgba(245,217,122,0.5)',
        clipPath: cardClip,
      }}
    >
      <div className="mb-2 text-xs tracking-[0.32em]" style={{ color: 'rgba(117,214,216,0.82)' }}>
        剧 情 编 织 · 进 度 建 议
      </div>
      <div className="font-serif text-sm font-bold leading-relaxed" style={{ color: '#fff4d4' }}>
        是否结束「{suggestion.分段标题}」？
      </div>
      <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(220,208,178,0.84)' }}>
        系统检测到当前正文可能已经完成这段剧情。理由：{suggestion.理由}
      </div>
      {suggestion.下一分段标题 && (
        <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(245,217,122,0.78)' }}>
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
            background: 'linear-gradient(135deg, rgba(245,217,122,0.9), rgba(212,177,90,0.9))',
            color: '#1a1325',
            boxShadow: 'inset 0 0 0 1px rgba(255,245,200,0.45)',
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
            background: 'rgba(230,170,120,0.12)',
            color: 'rgba(245,190,140,0.9)',
            boxShadow: 'inset 0 0 0 1px rgba(230,170,120,0.28)',
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
            background: 'rgba(50,45,40,0.55)',
            color: 'rgba(200,188,160,0.86)',
            boxShadow: 'inset 0 0 0 1px rgba(160,148,120,0.28)',
            clipPath: btnClip,
          }}
        >
          暂不处理
        </button>
      </div>
    </div>
  );
}
