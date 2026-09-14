import type { 世界状态 } from '@/models/world';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 获取激活剧情系列 } from '@/services/storyProgressService';
import {
  评估剧情区域连续性,
  区域显示名称,
  校正世界区域,
  推断系列区域ID,
  重绑系列区域,
} from '@/models/region';
import { devLog } from '@/utils/devLog';
import { BannerButton } from './BannerButton';

interface Props {
  world: 世界状态;
  storyWeaving: 剧情编织系统;
  setWorld: React.Dispatch<React.SetStateAction<世界状态>>;
  setStoryWeaving: React.Dispatch<React.SetStateAction<剧情编织系统>>;
}

/**
 * 剧情区域连续性横幅：世界当前区域与激活系列区域不一致时暂停注入/推进，
 * 由玩家二选一——确认转场（系列跟随当前区域）或保持轨道（世界校正回系列区域）。
 */
export function ContinuityBanner({ world, storyWeaving, setWorld, setStoryWeaving }: Props) {
  const series = 获取激活剧情系列(storyWeaving);
  if (!series) return null;
  const seriesRegion = 推断系列区域ID(series);
  const decision = 评估剧情区域连续性({
    currentRegionId: world.当前区域ID,
    currentLocation: world.当前地点,
    openingRegionId: world.开局档案?.地区ID,
    seriesRegionId: seriesRegion,
  });
  if (!decision.hold) return null;

  const confirmTransition = () => {
    devLog('ui', 'continuity_banner.confirm_transition', { series: series.标题, from: seriesRegion, to: world.当前区域ID });
    setStoryWeaving((prev) => 重绑系列区域(prev, series.id, world.当前区域ID));
  };
  const keepTrack = () => {
    devLog('ui', 'continuity_banner.keep_track', { series: series.标题, from: world.当前区域ID, to: seriesRegion });
    setWorld((prev) => 校正世界区域(prev, seriesRegion));
  };

  return (
    <div
      className="mx-3 mb-2 border px-3 py-2 text-sm"
      style={{
        borderColor: 'rgba(var(--tj-accent-primary),0.35)',
        background: 'rgba(var(--tj-surface),0.94)',
        color: 'rgb(var(--tj-text-primary))',
      }}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 flex-1">
          当前区域「{区域显示名称(world.当前区域ID)}」与剧情系列「{series.标题}」的
          「{区域显示名称(seriesRegion)}」不一致，已暂停剧情注入与推进。
        </span>
        <BannerButton label="确认转场" accent onClick={confirmTransition} />
        <BannerButton label="保持轨道" accent={false} onClick={keepTrack} />
      </div>
      <div className="mt-1 text-xs" style={{ color: 'rgba(var(--tj-text-secondary),0.75)' }}>
        确认转场：剧情确已离开原区域，系列区域改为跟随当前区域；保持轨道：当前区域是误判，把世界区域校正回系列区域。
      </div>
    </div>
  );
}
