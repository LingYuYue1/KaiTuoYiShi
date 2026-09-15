// 手机卡片的切角一直是 14px（即 panelClip 一级），此处保留本模块的既有取值为别名。
export { smallClip, panelClip as cardClip } from '@/components/ui/clipPaths';

// 机身外壳是八角切角，与通用切角不同形，留在本模块。
export const phoneShellClip =
  'polygon(28px 0, calc(100% - 28px) 0, 100% 28px, 100% calc(100% - 28px), calc(100% - 28px) 100%, 28px 100%, 0 calc(100% - 28px), 0 28px)';
/* 机身的 8px 半透明内衬，原本是 `inset 0 0 0 8px rgba(surface,0.48)`。
   垫片会丢弃内阴影；改成 8px 真边框又会让内容框两轴各缩 16px（外壳定高、带 p-3，
   里面的屏幕会跟着变小），所以改用四层背景渐变拼一个「画框」：
   上下两层满宽、左右两层满高，四层叠起来正好是一整圈，且完全不参与布局。 */
export const phoneBezelFrame = [
  'linear-gradient(180deg, rgba(var(--tj-surface), 0.48) 0 8px, transparent 8px)',
  'linear-gradient(0deg, rgba(var(--tj-surface), 0.48) 0 8px, transparent 8px)',
  'linear-gradient(90deg, rgba(var(--tj-surface), 0.48) 0 8px, transparent 8px)',
  'linear-gradient(270deg, rgba(var(--tj-surface), 0.48) 0 8px, transparent 8px)',
].join(', ');

export const phoneShellSurface =
  'radial-gradient(circle at 50% 0%, rgba(var(--tj-tech-cyan, var(--tj-accent-primary)), 0.16), transparent 32%), linear-gradient(180deg, rgba(var(--tj-bubble), 0.99), rgba(var(--tj-surface-strong), 0.98))';
export const phoneScreenSurface =
  'linear-gradient(180deg, rgba(var(--tj-surface), 0.98), rgba(var(--tj-bg-secondary), 0.96))';
export const phoneCardSurface =
  'linear-gradient(135deg, rgba(var(--tj-bubble), 0.96), rgba(var(--tj-surface-strong), 0.82))';

