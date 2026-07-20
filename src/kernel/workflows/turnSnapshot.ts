import type { 回合快照 } from '@/models/chat';
import { 归一化相册系统, type 相册系统 } from '@/models/imageGeneration';
import { 归一化NPC记录列表 } from '@/models/npc';
import { 归一化手机系统 } from '@/models/phone';
import { 归一化新闻列表 } from '@/models/news';
import { 归一化剧情节点列表 } from '@/models/plot';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化世界状态 } from '@/models/world';
import { 归一化忆庭系统 } from '@/models/yiting';
import { 归一化智库系统 } from '@/models/zhiku';
import { hydratePersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';

/** Pure: restores story fields from a pre-turn snapshot. Returns the fields to apply. */
export function restorePreTurnSnapshot(
  snapshot: 回合快照,
  currentAlbum: 相册系统,
): {
  storyWeaving: 剧情编织系统;
  旅人: 回合快照['旅人'];
  世界: ReturnType<typeof 归一化世界状态>;
  记忆: 回合快照['记忆'];
  忆庭: ReturnType<typeof 归一化忆庭系统>;
  智库: ReturnType<typeof 归一化智库系统>;
  手机: ReturnType<typeof 归一化手机系统>;
  NPC: ReturnType<typeof 归一化NPC记录列表>;
  相册: 相册系统;
  新闻: ReturnType<typeof 归一化新闻列表>;
  剧情: ReturnType<typeof 归一化剧情节点列表>;
  剧情编织: 剧情编织系统;
  variableBatches: 回合快照['variableBatches'];
  durableJobs: 回合快照['jobs'];
  turnCount: number;
  pendingOpeningTrigger: string | null;
} {
  const storyWeaving = hydratePersistedStoryWeavingSystem(
    归一化剧情编织系统(snapshot.剧情编织 as any),
    currentAlbum as unknown as 剧情编织系统,
  );
  return {
    storyWeaving,
    旅人: snapshot.旅人,
    世界: 归一化世界状态(snapshot.世界 as any),
    记忆: snapshot.记忆,
    忆庭: 归一化忆庭系统(snapshot.忆庭 as any),
    智库: 归一化智库系统(snapshot.智库 as any),
    手机: 归一化手机系统(snapshot.手机 as any),
    NPC: 归一化NPC记录列表(snapshot.NPC as any),
    相册: restoreAlbumSnapshot(snapshot.相册 as any, currentAlbum),
    新闻: 归一化新闻列表(snapshot.新闻 as any),
    剧情: 归一化剧情节点列表(snapshot.剧情),
    剧情编织: storyWeaving,
    variableBatches: [...snapshot.variableBatches],
    durableJobs: [...snapshot.jobs],
    turnCount: snapshot.turnCount,
    pendingOpeningTrigger: snapshot.pendingOpeningTrigger ?? null,
  };
}

function restoreAlbumSnapshot(snapshotAlbum: any, currentAlbum: 相册系统): 相册系统 {
  const normalized = 归一化相册系统(snapshotAlbum);
  const currentAssets = new Map((currentAlbum.assets ?? []).map((asset) => [asset.id, asset]));
  return {
    ...normalized,
    assets: normalized.assets.map((asset) => {
      const current = currentAssets.get(asset.id);
      if (typeof asset.dataUrl === 'string' && asset.dataUrl.startsWith('asset:') && current) {
        return {
          ...asset,
          dataUrl: asset.dataUrl,
          originalUrl: current.originalUrl ?? asset.originalUrl,
          mimeType: current.mimeType ?? asset.mimeType,
          size: current.size ?? asset.size,
          width: current.width ?? asset.width,
          height: current.height ?? asset.height,
        };
      }
      return asset;
    }),
  };
}
