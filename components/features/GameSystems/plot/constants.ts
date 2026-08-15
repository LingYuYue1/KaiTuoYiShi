import type { 剧情编织分段, 剧情编织运行状态 } from '@/models/storyWeaving';

export type TrackTab = 'canon' | 'custom';

export const cardClip = 'polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px)';
export const smallClip = 'polygon(6px 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%, 0 6px)';

export const statusColor: Record<剧情编织分段['处理状态'], string> = {
  待处理: 'rgba(var(--tj-text-secondary), 0.8)',
  处理中: 'rgba(var(--tj-accent-primary), 0.95)',
  已完成: 'rgba(var(--tj-ui-success),0.95)',
  失败: 'rgba(var(--tj-danger),0.95)',
};

export const statusBg: Record<剧情编织分段['处理状态'], string> = {
  待处理: 'rgba(var(--tj-text-secondary), 0.12)',
  处理中: 'rgba(var(--tj-accent-primary), 0.16)',
  已完成: 'rgba(var(--tj-ui-success),0.14)',
  失败: 'rgba(var(--tj-danger),0.14)',
};

export const runtimeStatusColor: Record<剧情编织运行状态, string> = {
  未开始: 'rgba(var(--tj-text-secondary), 0.82)',
  当前: 'rgba(var(--tj-accent-primary), 0.96)',
  已经历: 'rgba(var(--tj-ui-success),0.95)',
  已跳过: 'rgba(var(--tj-tech-blue),0.88)',
  已偏离: 'rgba(var(--tj-accent-secondary),0.92)',
  暂停: 'rgba(var(--tj-text-secondary),0.82)',
};

export const runtimeStatusBg: Record<剧情编织运行状态, string> = {
  未开始: 'rgba(var(--tj-text-secondary), 0.08)',
  当前: 'rgba(var(--tj-accent-primary), 0.15)',
  已经历: 'rgba(var(--tj-ui-success),0.12)',
  已跳过: 'rgba(var(--tj-tech-blue),0.10)',
  已偏离: 'rgba(var(--tj-accent-secondary),0.12)',
  暂停: 'rgba(var(--tj-text-secondary),0.08)',
};

export const runtimeStatusOptions: 剧情编织运行状态[] = ['未开始', '当前', '已经历', '已跳过', '已偏离', '暂停'];
