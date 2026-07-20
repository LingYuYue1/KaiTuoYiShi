import type { 智库系统 } from '@/models/zhiku';

export interface ContentResolver {
  loadBundledZhiku(cacheBust?: number): Promise<智库系统>;
  loadBundledStoryWeaving(): Promise<import('@/models/storyWeaving').剧情编织系统>;
}
