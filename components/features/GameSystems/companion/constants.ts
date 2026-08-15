import type { CSSProperties } from 'react';

export const cardClip =
  'polygon(12px 0, 100% 0, 100% calc(100% - 12px), calc(100% - 12px) 100%, 0 100%, 0 12px)';
export const smallClip =
  'polygon(7px 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%, 0 7px)';

export const panelStyle: CSSProperties = {
  background: 'radial-gradient(circle at 12% 0%, rgba(var(--tj-tech-cyan), 0.12), transparent 34%), linear-gradient(180deg, rgba(var(--tj-surface), 0.74), rgba(var(--tj-bg-primary), 0.92))',
  boxShadow: 'inset 0 0 0 1px rgba(var(--tj-border), 0.72), inset 3px 0 0 rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), 0.36)',
  clipPath: cardClip,
};
export const titleColor = 'rgb(var(--tj-ui-title))';
export const bodyColor = 'rgba(var(--tj-ui-body), 0.95)';
export const mutedColor = 'rgba(var(--tj-ui-muted), 0.82)';
export const faintColor = 'rgba(var(--tj-ui-faint), 0.74)';
export const accentColor = 'rgb(var(--tj-accent-primary))';
export const nsfwColor = 'rgb(var(--tj-ui-nsfw))';
export const activeSurface = 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start), 0.16), rgba(var(--tj-tech-cyan), 0.055))';
export const quietSurface = 'linear-gradient(135deg, rgba(var(--tj-ui-panel), 0.62), rgba(var(--tj-ui-panel-strong), 0.72))';
