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
import { composeZhikuSystem, buildPersistedZhikuSystem } from '@/data/zhikuPreset';
import { hydratePersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';

export function restorePreTurnSnapshot(state: UseGameStateReturn, snapshot: 回合快照): 剧情编织系统 {
  state.set旅人(snapshot.旅人 as Parameters<typeof state.set旅人>[0]);
  state.set世界(归一化世界状态(snapshot.世界 as UseGameStateReturn['世界']));
  state.set记忆(snapshot.记忆 as Parameters<typeof state.set记忆>[0]);
  state.set忆庭(归一化忆庭系统(snapshot.忆庭 as UseGameStateReturn['忆庭']));
  state.set智库(composeZhikuSystem(
    state.智库,
    snapshot.智库 as UseGameStateReturn['智库'],
  ));
  state.set手机(归一化手机系统(snapshot.手机 as UseGameStateReturn['手机']));
  state.setNPC(归一化NPC记录列表(snapshot.NPC as UseGameStateReturn['NPC']));
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
  state.setPendingOpeningTrigger(snapshot.pendingOpeningTrigger ?? null);
  // 恢复回合前的 gameSettings 运行时字段（宏全局变量 / 世界书触发状态）：
  // 只有成功提交的回合才消费一次 cooldown/delay 并保留宏全局变量变化。
  const turnState = snapshot.gameSettingsTurnState;
  if (turnState) {
    state.setGameSettings((prev) => {
      const next = { ...prev };
      if (turnState.macroGlobalVars !== undefined) {
        next.macroGlobalVars = { ...turnState.macroGlobalVars };
      }
      if (turnState.worldbookTriggerStates !== undefined) {
        next.worldbookTriggerStates = { ...turnState.worldbookTriggerStates };
      }
      return next;
    });
  }
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

/**
 * 恢复回合前快照时同步恢复 IndexedDB 中的持久化智库运行态与持久化 gameSettings 回合字段。
 * 重 Roll / Abort / API 失败 / 自动存档失败后，刷新页面也不能重新出现被撤销的智库解锁、
 * 被消费的宏变量或世界书 cooldown/delay 状态。
 * - bundled catalog 继续作为静态内容权威，只把快照中的运行时解锁字段写回持久化；
 * - gameSettings 只覆盖 snapshot.gameSettingsTurnState 中的 macroGlobalVars 与
 *   worldbookTriggerStates，API 配置、玩家普通设置等其余字段保留当前持久化值；
 * - snapshot.gameSettingsTurnState 不存在时不写持久化 gameSettings；
 * - zhikuSystem 与 gameSettings 的恢复失败分别报告，互不阻断。
 */
export async function restorePreTurnSnapshotPersisted(
  state: UseGameStateReturn,
  snapshot: 回合快照,
  updateSettingImpl: (key: string, updater: (current: any) => any) => Promise<any>,
): Promise<剧情编织系统> {
  const storyWeaving = restorePreTurnSnapshot(state, snapshot);
  if (snapshot.智库) {
    try {
      await updateSettingImpl('zhikuSystem', () => (
        buildPersistedZhikuSystem(snapshot.智库 as import('@/models/zhiku').智库系统)
      ));
    } catch (err) {
      console.warn('[turn-snapshot] 持久化智库运行态恢复失败', err instanceof Error ? err.message : String(err));
    }
  }
  const turnState = snapshot.gameSettingsTurnState;
  if (turnState) {
    try {
      await updateSettingImpl('gameSettings', (current: any) => {
        const base = (current && typeof current === 'object' ? current : {}) as Record<string, unknown>;
        return {
          ...base,
          ...(turnState.macroGlobalVars !== undefined
            ? { macroGlobalVars: { ...turnState.macroGlobalVars } }
            : {}),
          ...(turnState.worldbookTriggerStates !== undefined
            ? { worldbookTriggerStates: { ...turnState.worldbookTriggerStates } }
            : {}),
        };
      });
    } catch (err) {
      console.warn('[turn-snapshot] 持久化 gameSettings 回合字段恢复失败', err instanceof Error ? err.message : String(err));
    }
  }
  return storyWeaving;
}
