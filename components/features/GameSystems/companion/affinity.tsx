import { NPC_AFFINITY_MAX, NPC_AFFINITY_MIN } from '@/models/npc';
import { cardClip, mutedColor } from './constants';

export function AffinityBadge({ value }: { value: number }) {
  const tone = getAffinityTone(value);
  return (
    <div
      className="flex w-[92px] shrink-0 flex-col items-center justify-center px-3 py-3"
      style={{
        background: 'linear-gradient(135deg, rgba(var(--tj-surface),0.62), rgba(var(--tj-surface-strong),0.72))',
        boxShadow: `inset 0 0 0 1px ${tone.stroke}`,
        clipPath: cardClip,
      }}
    >
      <div className="font-serif text-[34px] leading-none" style={{ color: tone.color }}>
        ♥
      </div>
      <div className="mt-1 font-mono text-[17px] font-semibold" style={{ color: tone.color }}>
        {value > 0 ? '+' : ''}
        {value}
      </div>
      <div className="mt-1 font-serif text-[11px] tracking-[0.22em]" style={{ color: mutedColor }}>
        好感度
      </div>
    </div>
  );
}

export function AffinityMeter({ value, compact = false }: { value: number; compact?: boolean }) {
  const tone = getAffinityTone(value);
  const percent = Math.max(0, Math.min(100, ((value - NPC_AFFINITY_MIN) / (NPC_AFFINITY_MAX - NPC_AFFINITY_MIN)) * 100));
  return (
    <div className={compact ? 'mt-1.5 flex items-center gap-2' : 'mt-2 flex items-center gap-2'}>
      <span className="font-serif text-[12px]" style={{ color: tone.color }}>
        ♥
      </span>
      <div
        className="relative h-1.5 flex-1 overflow-hidden"
        style={{
          background: 'rgba(var(--tj-surface-strong),0.72)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.42)',
        }}
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${percent}%`,
            background: tone.fill,
          }}
        />
      </div>
      <span className="w-8 text-right font-mono text-[11px]" style={{ color: mutedColor }}>
        {value > 0 ? '+' : ''}
        {value}
      </span>
    </div>
  );
}

export function getAffinityTone(value: number) {
  if (value >= 60) {
    return {
      color: 'rgba(var(--tj-ui-nsfw),0.98)',
      stroke: 'rgba(var(--tj-ui-nsfw),0.45)',
      fill: 'linear-gradient(90deg, rgba(var(--tj-ui-nsfw),0.62), rgba(var(--tj-ui-nsfw),0.96))',
    };
  }
  if (value >= 30) {
    return {
      color: 'rgba(var(--tj-ui-nsfw),0.96)',
      stroke: 'rgba(var(--tj-ui-nsfw),0.38)',
      fill: 'linear-gradient(90deg, rgba(var(--tj-ui-nsfw),0.5), rgba(var(--tj-ui-nsfw),0.9))',
    };
  }
  if (value >= 0) {
    return {
      color: 'rgba(var(--tj-text-secondary),0.9)',
      stroke: 'rgba(var(--tj-border), 0.42)',
      fill: 'linear-gradient(90deg, rgba(var(--tj-text-secondary),0.4), rgba(var(--tj-text-secondary),0.78))',
    };
  }
  return {
    color: 'rgba(var(--tj-tech-blue),0.86)',
    stroke: 'rgba(var(--tj-tech-blue),0.34)',
    fill: 'linear-gradient(90deg, rgba(var(--tj-panel-bg-start),0.75), rgba(var(--tj-tech-blue),0.62))',
  };
}
