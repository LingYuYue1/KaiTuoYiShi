import type { UseGameStateReturn } from '@/hooks/useGameState';
import type { 回合快照 } from '@/models/chat';
import { 归一化相册系统, type 相册系统 } from '@/models/imageGeneration';
import { 归一化NPC记录列表 } from '@/models/npc';
import { 归一化手机系统 } from '@/models/phone';
import { 归一化新闻列表 } from '@/models/news';
import { 归一化剧情编织系统 } from '@/models/storyWeaving';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { 归一化世界状态 } from '@/models/world';
import { 归一化忆庭系统 } from '@/models/yiting';
import { 归一化智库系统 } from '@/models/zhiku';
import { hydratePersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';

export function restorePreTurnSnapshot(state: UseGameStateReturn, snapshot: 回合快照): 剧情编织系统 {
  state.set旅人(snapshot.旅人 as Parameters<typeof state.set旅人>[0]);
  state.set世界(归一化世界状态(snapshot.世界 as UseGameStateReturn['世界']));
  state.set记忆(snapshot.记忆 as Parameters<typeof state.set记忆>[0]);
  state.set忆庭(归一化忆庭系统(snapshot.忆庭 as UseGameStateReturn['忆庭']));
  state.set智库(归一化智库系统(snapshot.智库 as UseGameStateReturn['智库']));
  state.set手机(归一化手机系统(snapshot.手机 as UseGameStateReturn['手机']));
  state.setNPC(归一化NPC记录列表(snapshot.NPC));
  state.set相册((current) => restoreAlbumSnapshot(snapshot.相册 as UseGameStateReturn['相册'], current));
  state.set新闻(归一化新闻列表(snapshot.新闻 as UseGameStateReturn['新闻']));
  state.set剧情(snapshot.剧情 as Parameters<typeof state.set剧情>[0]);
  const storyWeaving = hydratePersistedStoryWeavingSystem(
    归一化剧情编织系统(snapshot.剧情编织 as UseGameStateReturn['剧情编织']),
    state.剧情编织,
  );
  state.set剧情编织(storyWeaving);
  state.setVariableBatches(snapshot.variableBatches as Parameters<typeof state.setVariableBatches>[0]);
  state.setQueueTasks((snapshot.queueTasks ?? []) as Parameters<typeof state.setQueueTasks>[0]);
  state.setTurnCount(snapshot.turnCount);
  // 触发文本是「消费即原子清空」的暂存标记：取消/重roll 回滚不得重新武装，
  // 否则 App 自动触发 effect（App.tsx:507）会在开局取消后无限重发第 0 回合。
  state.setPendingOpeningTrigger(null);
  return storyWeaving;
}

function restoreAlbumSnapshot(snapshotAlbum: UseGameStateReturn['相册'], currentAlbum: 相册系统): 相册系统 {
  const normalized = 归一化相册系统(snapshotAlbum);
  const currentAssets = new Map((currentAlbum.assets ?? []).map((asset) => [asset.id, asset]));
  return {
    ...normalized,
    assets: normalized.assets.map((asset) => {
      const current = currentAssets.get(asset.id);
      // Snapshots store asset: refs only. Keep the ref; binary lives in the Blob cache.
      // Prefer current metadata when the ref already points at a known asset.
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
