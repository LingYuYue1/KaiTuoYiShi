import type { ReactNode } from 'react';
import type { OpeningSource } from '@/models/opening';
import {
  cardClip,
  smallClip,
  tightClip,
  openingCardBackground,
  openingActiveCardBackground,
  openingCardBorder,
  getOpeningDisplayHighlights,
  getOpeningDisplaySummary,
  getOpeningOfficialChapterName,
  getOpeningOfficialChapterPhase,
  getOpeningChapterBadge,
  getOpeningPriorStoryState,
  type OpeningDisplayScenario,
} from './wizardData';
import { Chip } from './atoms';

export function SectionCard({
  children,
  variant = 'panel',
  color,
  className,
}: {
  children: ReactNode;
  variant?: 'panel' | 'emphasis' | 'opening';
  color?: string;
  className?: string;
}) {
  if (variant === 'emphasis') {
    return (
      <div
        className={`p-4${className ? ` ${className}` : ''}`}
        style={{
          background: 'linear-gradient(180deg, rgba(var(--tj-panel-bg-start), 0.95) 0%, rgba(var(--tj-panel-bg-end), 0.98) 100%)',
          boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.22)',
          clipPath: cardClip,
        }}
      >
        {children}
      </div>
    );
  }
  if (variant === 'opening') {
    return (
      <div
        className={`p-[13px]${className ? ` ${className}` : ''}`}
        style={{ background: openingCardBackground, boxShadow: openingCardBorder, clipPath: smallClip, color }}
      >
        {children}
      </div>
    );
  }
  return (
    <div
      className={`p-4${className ? ` ${className}` : ''}`}
      style={{
        background: 'rgba(var(--tj-panel-bg-end),0.58)',
        boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.16)',
        clipPath: cardClip,
      }}
    >
      {children}
    </div>
  );
}

export function TipBox({
  children,
  className,
  background = 'rgba(var(--tj-bg-primary), 0.52)',
  color = 'rgba(var(--tj-text-secondary), 0.84)',
  border = 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)',
}: {
  children: ReactNode;
  className: string;
  background?: string;
  color?: string;
  border?: string;
}) {
  return (
    <div className={className} style={{ background, color, boxShadow: border, clipPath: smallClip }}>
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  compact = false,
  margin = 'md',
}: {
  children: ReactNode;
  compact?: boolean;
  margin?: 'sm' | 'md' | 'none';
}) {
  const m = margin === 'sm' ? 'mb-2' : margin === 'md' ? 'mb-3' : '';
  return (
    <div
      className={`${m} text-[11px] ${compact ? 'tracking-[0.24em]' : 'tracking-[0.28em]'}`}
      style={{ color: 'rgba(var(--tj-btn-primary-start), 0.68)' }}
    >
      {children}
    </div>
  );
}

export function ScenarioAnchorCard({
  item,
  active,
  openingSource,
  onClick,
}: {
  item: OpeningDisplayScenario;
  active: boolean;
  openingSource: OpeningSource;
  onClick: () => void;
}) {
  const highlights = getOpeningDisplayHighlights(item).slice(0, openingSource === 'official_preset' ? 4 : 3);
  if (openingSource !== 'official_preset') {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full p-[13px] text-left transition-shadow"
        style={{
          background: active ? openingActiveCardBackground : openingCardBackground,
          boxShadow: active
            ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), inset 4px 0 0 rgba(var(--tj-btn-primary-start), 0.54), 0 0 18px rgba(var(--tj-btn-primary-start), 0.08)'
            : openingCardBorder,
          clipPath: smallClip,
        }}
      >
        <div className="grid gap-3 md:grid-cols-[172px_minmax(0,1fr)]">
          <div>
            <div
              className="text-[11px] leading-relaxed"
              style={{ color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))' }}
            >
              {getOpeningOfficialChapterName(item)}
            </div>
            <div className="mt-1 text-xs font-bold" style={{ color: 'rgb(var(--tj-text-primary))' }}>
              {getOpeningOfficialChapterPhase(item) || '主线坐标'}
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-sm font-bold tracking-[0.08em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
                {item.name}
              </div>
              <Chip
                className="px-2 py-1 text-[11px]"
                background="rgba(var(--tj-btn-primary-end), 0.08)"
                color="rgba(var(--tj-btn-primary-end), 0.9)"
                border="inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.18)"
              >
                原作世界坐标
              </Chip>
            </div>
            <div className="mt-1 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.8)' }}>
              {getOpeningDisplaySummary(item)}
            </div>
            <div className="mt-2 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.68)' }}>
              前置处理：{getOpeningPriorStoryState(item)}
            </div>
            {highlights.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {highlights.map((tag) => (
                  <Chip
                    key={tag}
                    className="px-2 py-1 text-[11px]"
                    background="rgba(var(--tj-btn-primary-start), 0.06)"
                    color="linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.86), rgba(var(--tj-btn-primary-end),0.82))"
                    border="inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.14)"
                  >
                    {tag}
                  </Chip>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[158px] p-[14px] text-left transition-shadow"
      style={{
        background: openingCardBackground,
        boxShadow: active
          ? 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.42), 0 0 20px rgba(var(--tj-btn-primary-start), 0.09)'
          : openingCardBorder,
        clipPath: tightClip,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="font-serif text-base font-bold tracking-[0.14em]" style={{ color: 'rgb(var(--tj-text-primary))' }}>
          {item.name}
        </div>
        <div
          className="max-w-[46%] px-2 py-1 text-right text-[11px] leading-snug"
          style={{
            color: 'linear-gradient(135deg, rgba(var(--tj-btn-primary-start),0.9), rgba(var(--tj-btn-primary-end),0.86))',
            background: 'rgba(var(--tj-btn-primary-start), 0.08)',
            boxShadow: 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start), 0.18)',
            clipPath: smallClip,
          }}
        >
          {getOpeningChapterBadge(item)}
        </div>
      </div>
      <div className="mt-2 text-xs leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.82)' }}>
        {getOpeningDisplaySummary(item)}
      </div>
      <div className="mt-3 text-[11px] leading-relaxed" style={{ color: 'rgba(var(--tj-text-secondary), 0.72)' }}>
        前置处理：{getOpeningPriorStoryState(item)}
      </div>
      {highlights.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {highlights.map((tag) => (
            <Chip
              key={tag}
              className="px-2 py-1 text-[11px]"
              background="rgba(var(--tj-btn-primary-end), 0.08)"
              color="rgba(var(--tj-btn-primary-end), 0.92)"
              border="inset 0 0 0 1px rgba(var(--tj-btn-primary-end), 0.18)"
            >
              {tag}
            </Chip>
          ))}
        </div>
      ) : null}
    </button>
  );
}
