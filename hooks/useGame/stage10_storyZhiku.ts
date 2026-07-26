/**
 * 阶段 10：剧情编织 / 智库 —— 剧情进度对齐、编织系统更新、剧情记忆注入 NPC/记忆、
 *  智库运行时解锁。含 async（await resolveStoryWeavingForBackgroundWrite /
 *  saveSetting × 2）。
 *
 * 读 d 字段:
 *   - variableOverrides (S8, stage8_variable ~第 60 行)
 *   - displayText (S5, stage5_replyLanding ~第 56 行)
 *   - mem (S6, stage6_memory ~第 42 行)
 *   - worldAfter (S7, stage7_worldTraveler)
 *   - storyWeavingGate (S2, stage2_preModel)
 *   - npcAfterCompression (S9, stage9_npcLedger)
 *
 * 写 d 字段: storyWeavingForSave (S10), memoryAfterStoryProgress (S10),
 *   zhikuAfterRuntimeUnlock (S10), npcAfterCompression (写回 updated),
 *   storyProgressMemoryLine
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import { autoAlignCanonStoryProgress } from '@/services/storyProgressService';
import { applyStoryArchiveZhikuRuntimeUnlock } from '@/services/zhikuRuntimeUnlock';
import { buildPersistedZhikuSystem } from '@/data/zhikuPreset';
import { buildPersistedStoryWeavingSystem } from '@/data/storyWeavingPreset';
import { addImmediateMemory } from './memoryUtils';
import { saveSetting } from '@/services/dbService';
import { pushQueueTask } from './workflowTaskRuntime';
import {
  applyStoryProgressNpcMemory,
  buildStoryProgressMemoryLine,
  resolveStoryWeavingForBackgroundWrite,
} from './storyWeavingWorkflow';

export async function stage10_storyZhiku(
  ctx: TurnContext,
  d: TurnDeltas,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, effectiveWorld, assertWorkflowActive } = ctx;
  const variableOverrides = d.variableOverrides as Record<string, any> | null | undefined;
  const displayText = d.displayText!;
  const worldAfter = (d as any).worldAfter as typeof state.世界 | undefined;
  const storyWeavingGate = d.storyWeavingGate as any;
  let npcAfterCompression = (d as any).npcAfterCompression as typeof state.NPC;
  const mem = d.mem!;

  const isOpeningSystemTrigger = state.turnCount === 1 && userInput.startsWith('[系统]');

  let memoryAfterStoryProgress = variableOverrides?.记忆 ?? mem;
  const storyAlignment = isOpeningSystemTrigger
    ? { system: state.剧情编织, changed: false, progressed: false }
    : autoAlignCanonStoryProgress({
        storyWeaving: state.剧情编织,
        turnCount: state.turnCount + 1,
        userInput,
        body: displayText,
        currentLocation: variableOverrides?.世界?.当前地点 ?? worldAfter?.当前地点 ?? effectiveWorld.当前地点,
        gateSnapshot: storyWeavingGate,
      });
  const storyProgressMemoryLine = storyAlignment.progressed
    ? buildStoryProgressMemoryLine(state.剧情编织, storyAlignment.system)
    : '';
  let storyWeavingForSave = storyAlignment.system;
  let storyWeavingConcurrentChange = false;
  if (storyAlignment.changed) {
    assertWorkflowActive();
    const resolvedStory = await resolveStoryWeavingForBackgroundWrite({
      workflowBase: state.剧情编织,
      proposed: storyAlignment.system,
    });
    storyWeavingForSave = resolvedStory.system;
    storyWeavingConcurrentChange = resolvedStory.concurrentChange;
    if (!storyWeavingConcurrentChange) {
      state.set剧情编织(storyWeavingForSave);
      await saveSetting('storyWeavingSystem', buildPersistedStoryWeavingSystem(storyWeavingForSave));
    } else {
      pushQueueTask(state, 'zhiku', 'success', {
        detail: '检测到剧情编织面板已有更新，本回合后台未覆盖最新导入/分解结果。',
      });
    }
    assertWorkflowActive();
    if (storyProgressMemoryLine && !storyWeavingConcurrentChange) {
      memoryAfterStoryProgress = addImmediateMemory(memoryAfterStoryProgress, storyProgressMemoryLine, state.turnCount + 1);
      state.set记忆(memoryAfterStoryProgress);
      const npcAfterStoryProgress = applyStoryProgressNpcMemory(
        npcAfterCompression,
        storyWeavingForSave,
        storyProgressMemoryLine,
        state.turnCount + 1,
      );
      if (npcAfterStoryProgress !== npcAfterCompression) {
        npcAfterCompression = npcAfterStoryProgress;
        state.setNPC(npcAfterCompression);
      }
    }
  }
  let zhikuAfterRuntimeUnlock = state.智库;
  if (storyAlignment.progressed && !storyWeavingConcurrentChange) {
    const zhikuUnlock = applyStoryArchiveZhikuRuntimeUnlock({
      zhiku: state.智库,
      storyWeaving: storyWeavingForSave,
    });
    if (zhikuUnlock.changed) {
      assertWorkflowActive();
      zhikuAfterRuntimeUnlock = zhikuUnlock.system;
      state.set智库(zhikuAfterRuntimeUnlock);
      await saveSetting('zhikuSystem', buildPersistedZhikuSystem(zhikuAfterRuntimeUnlock));
      assertWorkflowActive();
      pushQueueTask(state, 'zhiku', 'success', {
        detail: `剧情归档已更新智库门禁：${zhikuUnlock.unlocked.slice(0, 3).map((item) => `${item.title}→${item.status}`).join('、')}${zhikuUnlock.unlocked.length > 3 ? ` 等 ${zhikuUnlock.unlocked.length} 项` : ''}。`,
      });
    }
  }

  return {
    storyWeavingForSave,
    memoryAfterStoryProgress,
    zhikuAfterRuntimeUnlock,
    npcAfterCompression,
    storyProgressMemoryLine,
  };
}
