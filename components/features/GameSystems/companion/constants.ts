import type { CSSProperties } from 'react';

// 本模块两张卡历来取 12px / 7px，按刻度的邻近档位固定为 badgeClip / smallClip。
import { badgeClip as cardClip, smallClip } from '@/components/ui/clipPaths';
export { cardClip, smallClip };

// 左侧那条 3px 强调原本写成 `inset 3px 0 0`（内阴影）——垫片会丢弃内阴影，故改为背景条纹。
// 条纹必须并进 background 的第一层：背景层自上而下叠加，单写 backgroundImage 会覆盖掉下面那层渐变。
const panelStripe =
  'linear-gradient(90deg, rgba(var(--tj-tech-cyan-deep, var(--tj-accent-primary)), var(--tj-edge-tint-strong)) 0 3px, transparent 3px)';

export const panelStyle: CSSProperties = {
  background: `${panelStripe}, radial-gradient(circle at 12% 0%, rgba(var(--tj-tech-cyan), 0.12), transparent 34%), linear-gradient(180deg, rgba(var(--tj-surface), 0.74), rgba(var(--tj-bg-primary), 0.92))`,
  border: '1px solid rgba(var(--tj-border), var(--tj-edge-strong))',
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
