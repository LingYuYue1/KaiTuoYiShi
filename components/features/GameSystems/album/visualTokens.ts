import type { CSSProperties } from 'react';

export { cardClip, smallClip } from '@/components/ui/clipPaths';
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
/* 细描边。原本叫 insetBorder，值是伪边框（inset 阴影）——垫片会丢弃内阴影，
   故改成真 border 并更名，调用处同步从 `boxShadow:` 改为 `border:`。 */
export const hairlineBorder = '1px solid rgba(var(--tj-btn-primary-start), var(--tj-edge-tint-weak))';
export const panelStrongSurface = 'rgba(var(--tj-ui-panel-strong),0.36)';
export const heroGridBackgroundStyle = {
  backgroundSize: albumGridSize,
  backgroundPosition: '0 0, 0 0, center, center',
} as CSSProperties;

/* 左侧 3px 强调条：原本写在各卡片的 boxShadow 里（`inset 3px 0 0`）。内阴影会被
   corner-shape 垫片丢弃，所以改成背景条纹——背景在原生与垫片两条路径上都会被正确
   塑形。条纹必须排在背景层的第一层（背景自上而下叠加）。 */
export const railStripe =
  'linear-gradient(90deg, rgba(var(--tj-tech-cyan), var(--tj-edge-tint-strong)) 0 3px, transparent 3px)';
export const heroSurfaceRailled = `${railStripe}, ${heroSurface}`;
export const panelSurfaceRailled = `${railStripe}, ${panelSurface}`;
/* 背景层数从 4 变 5，background-size / -position 是按层序对齐的列表，必须同步多一项，
   否则每一层都会错位到相邻图层的尺寸。 */
export const heroGridRailledStyle = {
  backgroundSize: `3px 100%, ${albumGridSize}`,
  backgroundPosition: '0 0, 0 0, 0 0, center, center',
} as CSSProperties;
