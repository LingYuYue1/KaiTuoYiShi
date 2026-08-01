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
import { addImmediateMemory } from './memoryUtils';
import { pushQueueTask } from './workflowTaskRuntime';
import { devLog } from '@/utils/devLog';
import type { 记忆系统 } from '@/models/memory';
import type { 世界状态 } from '@/models/world';
import type { NPC记录 } from '@/models/npc';
import type { 剧情编织门禁快照 } from '@/services/storyWeaving';
import {
  applyStoryProgressNpcMemory,
  buildStoryProgressMemoryLine,
  resolveStoryWeavingForBackgroundWrite,
} from './storyWeavingWorkflow';

type VariableOverridesForStoryZhiku = {
  记忆?: 记忆系统;
  世界?: 世界状态;
};

export async function stage10_storyZhiku(
  ctx: TurnContext,
  d: TurnDeltas,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, effectiveWorld, assertWorkflowActive, turnCountAtStart, queueTasksMirror, zhikuAtStart } = ctx;
  devLog('stage', 'stage10_storyZhiku.enter', { turn: turnCountAtStart });
  const variableOverrides = d.variableOverrides as VariableOverridesForStoryZhiku | null | undefined;
  const displayText = d.displayText as string;
  const worldAfter = d.worldAfter;
  const storyWeavingGate = d.storyWeavingGate as 剧情编织门禁快照 | undefined;
  let npcAfterCompression = d.npcAfterCompression as NPC记录[];
  const mem = d.mem as 记忆系统;

  const isOpeningSystemTrigger = turnCountAtStart === 1 && userInput.startsWith('[系统]');

  let memoryAfterStoryProgress = variableOverrides?.记忆 ?? mem;
  const storyAlignment = isOpeningSystemTrigger
    ? { system: state.剧情编织, changed: false, progressed: false }
    : autoAlignCanonStoryProgress({
        storyWeaving: state.剧情编织,
        turnCount: turnCountAtStart + 1,
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
      // 投影点（B2 定性，S24）：章节摘要/剧情面板即时刷新；管线与存档只认 ctx/d，不回读此 state
      state.set剧情编织(storyWeavingForSave);
      // 片 5a-2：剧情编织 newest 覆盖集由 S11 阶段边界统一写（报告 c 节「二选一」选项 2）
    } else {
      pushQueueTask(state, 'zhiku', 'success', {
        detail: '检测到剧情编织面板已有更新，本回合后台未覆盖最新导入/分解结果。',
      }, turnCountAtStart, queueTasksMirror);
    }
    assertWorkflowActive();
    if (storyProgressMemoryLine && !storyWeavingConcurrentChange) {
      memoryAfterStoryProgress = addImmediateMemory(memoryAfterStoryProgress, storyProgressMemoryLine, turnCountAtStart + 1);
      const npcAfterStoryProgress = applyStoryProgressNpcMemory(
        npcAfterCompression,
        storyWeavingForSave,
        storyProgressMemoryLine,
        turnCountAtStart + 1,
      );
      if (npcAfterStoryProgress !== npcAfterCompression) {
        npcAfterCompression = npcAfterStoryProgress;
        // 投影点（B2 定性，S26）：聊天 NPC/伙伴面板即时刷新；管线与存档只认 ctx/d，不回读此 state
        state.setNPC(npcAfterCompression);
      }
    }
  }
  let zhikuAfterRuntimeUnlock = zhikuAtStart;
  if (storyAlignment.progressed && !storyWeavingConcurrentChange) {
    const zhikuUnlock = applyStoryArchiveZhikuRuntimeUnlock({
      zhiku: zhikuAtStart,
      storyWeaving: storyWeavingForSave,
    });
    if (zhikuUnlock.changed) {
      assertWorkflowActive();
      zhikuAfterRuntimeUnlock = zhikuUnlock.system;
      // 投影点（B2 定性，S27）：智库面板即时刷新；管线与存档只认 ctx/d，不回读此 state
      state.set智库(zhikuAfterRuntimeUnlock);
      // 片 5a-2：智库 newest 覆盖集由 S11 阶段边界统一写（报告 c 节「二选一」选项 2）
      assertWorkflowActive();
      pushQueueTask(state, 'zhiku', 'success', {
        detail: `剧情归档已更新智库门禁：${zhikuUnlock.unlocked.slice(0, 3).map((item) => `${item.title}→${item.status}`).join('、')}${zhikuUnlock.unlocked.length > 3 ? ` 等 ${zhikuUnlock.unlocked.length} 项` : ''}。`,
      }, turnCountAtStart, queueTasksMirror);
    }
  }

  devLog('stage', 'stage10_storyZhiku.exit', {
    turn: turnCountAtStart,
    outputs: ['storyWeavingForSave', 'memoryAfterStoryProgress', 'zhikuAfterRuntimeUnlock', 'npcAfterCompression', 'storyProgressMemoryLine'],
  });
  return {
    storyWeavingForSave,
    memoryAfterStoryProgress,
    zhikuAfterRuntimeUnlock,
    npcAfterCompression,
    storyProgressMemoryLine,
  };
}
