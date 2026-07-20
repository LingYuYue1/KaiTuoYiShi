import type { 游戏设置 } from '@/models/settings';
import type { 剧情编织分段, 剧情编织系列 } from '@/models/storyWeaving';

export interface StoryWeavingProcessor {
  decompose(input: Readonly<{
    settings: 游戏设置;
    series: 剧情编织系列;
    segment: 剧情编织分段;
    previousSegment?: 剧情编织分段;
    signal: AbortSignal;
  }>): Promise<剧情编织分段>;
}
