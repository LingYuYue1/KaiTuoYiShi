import type { TurnExecutionState } from '@/src/kernel/application/turn/turnExecutionState';
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

export function restorePreTurnSnapshot(state: TurnExecutionState, snapshot: 回合快照): 剧情编织系统 {
  state.旅人 = snapshot.旅人;
  state.世界 = 归一化世界状态(snapshot.世界 as TurnExecutionState['世界']);
  state.记忆 = snapshot.记忆;
  state.忆庭 = 归一化忆庭系统(snapshot.忆庭 as TurnExecutionState['忆庭']);
  state.智库 = 归一化智库系统(snapshot.智库 as TurnExecutionState['智库']);
  state.手机 = 归一化手机系统(snapshot.手机 as TurnExecutionState['手机']);
  state.NPC = 归一化NPC记录列表(snapshot.NPC as TurnExecutionState['NPC']);
  state.相册 = restoreAlbumSnapshot(snapshot.相册 as TurnExecutionState['相册'], state.相册);
  state.新闻 = 归一化新闻列表(snapshot.新闻 as TurnExecutionState['新闻']);
  state.剧情 = 归一化剧情节点列表(snapshot.剧情);
  const storyWeaving = hydratePersistedStoryWeavingSystem(
    归一化剧情编织系统(snapshot.剧情编织 as TurnExecutionState['剧情编织']),
    state.剧情编织,
  );
  state.剧情编织 = storyWeaving;
  state.variableBatches = [...snapshot.variableBatches];
  state.durableJobs = [...snapshot.jobs];
  state.turnCount = snapshot.turnCount;
  state.pendingOpeningTrigger = snapshot.pendingOpeningTrigger ?? null;
  return storyWeaving;
}

function restoreAlbumSnapshot(snapshotAlbum: TurnExecutionState['相册'], currentAlbum: 相册系统): 相册系统 {
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
