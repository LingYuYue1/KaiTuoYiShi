import type { CSSProperties } from 'react';

export const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
export const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';
export const albumGridLayer = 'linear-gradient(90deg, rgba(var(--tj-btn-primary-start),0.062) 1px, transparent 1px), linear-gradient(180deg, rgba(var(--tj-tech-cyan),0.048) 1px, transparent 1px)';
export const albumGridSize = '26px 26px, 26px 26px, auto, auto';
export const heroSurface = `${albumGridLayer}, radial-gradient(circle at 14% 0%, rgba(var(--tj-tech-cyan), 0.14), transparent 34%), linear-gradient(180deg, rgba(var(--tj-surface),0.78), rgba(var(--tj-bg-primary),0.94))`;
export const panelSurface = 'radial-gradient(circle at 14% 0%, rgba(var(--tj-tech-cyan), 0.08), transparent 28%), linear-gradient(180deg, rgba(var(--tj-surface),0.74), rgba(var(--tj-bg-primary),0.94))';
export const insetSurface = 'linear-gradient(135deg, rgba(var(--tj-surface),0.64), rgba(var(--tj-surface-strong),0.76))';
export const imageWellSurface = 'linear-gradient(135deg, rgba(var(--tj-surface-strong),0.8), rgba(var(--tj-bg-primary),0.88))';
export const titleColor = 'rgb(var(--tj-ui-title))';
export const bodyColor = 'rgba(var(--tj-ui-body),0.94)';
export const mutedColor = 'rgba(var(--tj-ui-muted),0.78)';
export const faintColor = 'rgba(var(--tj-ui-faint),0.66)';
export const activeTextColor = 'rgb(var(--tj-ui-active-text))';
export const accentColor = 'rgb(var(--tj-accent-primary))';
export const nsfwColor = 'rgb(var(--tj-ui-nsfw))';
export const activeAccentSurface = 'linear-gradient(135deg, rgb(var(--tj-accent-primary)) 0%, rgba(var(--tj-accent-mid),0.96) 48%, rgb(var(--tj-tech-cyan)) 100%)';
export const cardSurface = 'linear-gradient(135deg, rgba(var(--tj-ui-panel),0.76), rgba(var(--tj-ui-panel-strong),0.72))';
export const labelColor = 'rgba(var(--tj-btn-primary-start),0.68)';
export const insetBorder = 'inset 0 0 0 1px rgba(var(--tj-btn-primary-start),0.12)';
export const panelStrongSurface = 'rgba(var(--tj-ui-panel-strong),0.36)';
export const heroGridBackgroundStyle = {
  backgroundSize: albumGridSize,
  backgroundPosition: '0 0, 0 0, center, center',
} as CSSProperties;
