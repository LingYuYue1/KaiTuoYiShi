/**
 * 阶段 12：保存 / 收尾 —— 自动存档（saveGame）、回合末固定 saveSetting、
 *  恢复日志清空。全部 async。
 *
 * 读 d 字段:
 *   - variableOverrides (S8)
 *   - finalHistoryForSave (S11)
 *   - memoryAfterStoryProgress (S10)
 *   - yitingAfterTurnRecall (S11)
 *   - phoneAfterFallbackSeed (S11)
 *   - npcAfterCompression (S9→S10 写回)
 *   - newsAfterGeneration (S11)
 *   - storyWeavingForSave (S10)
 *   - zhikuAfterRuntimeUnlock (S10)
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import { saveGame, saveSetting } from '@/services/dbService';
import {
  clearWorkflowRecoveryJournal,
  updateWorkflowRecoveryJournal,
  persistWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { buildSavePayload, commitActiveSaveTreeMeta } from './saveLoadWorkflow';
import { compactVariableBatchHistory } from '@/utils/longSessionRetention';
import { pushQueueTask } from './workflowTaskRuntime';

export async function stage12_save(
  ctx: TurnContext,
  d: TurnDeltas,
): Promise<Partial<TurnDeltas>> {
  const { state, assertWorkflowActive } = ctx;
  const variableOverrides = d.variableOverrides as Record<string, any> | null | undefined;
  const finalHistoryForSave = d.finalHistoryForSave!;
  const memoryAfterStoryProgress = (d as any).memoryAfterStoryProgress as typeof state.记忆;
  const yitingAfterTurnRecall = d.yitingAfterTurnRecall!;
  const phoneAfterFallbackSeed = d.phoneAfterFallbackSeed!;
  const npcAfterCompression = (d as any).npcAfterCompression as typeof state.NPC;
  const newsAfterGeneration = d.newsAfterGeneration as any;
  const storyWeavingForSave = (d as any).storyWeavingForSave as typeof state.剧情编织;
  const zhikuAfterRuntimeUnlock = (d as any).zhikuAfterRuntimeUnlock as typeof state.智库;
  let recoveryJournal = ctx.recoveryJournal;

  // 10. Auto-save —— 每回合只在后台队列收尾写一次，避免正文/变量阶段重复生成多条自动存档。
  if (state.gameSettings.enableAutoSaveEveryTurn) {
    recoveryJournal = updateWorkflowRecoveryJournal(recoveryJournal, { phase: 'autosave' });
    await persistWorkflowRecoveryJournal(recoveryJournal);
    pushQueueTask(state, 'autosave', 'pending', { detail: '正在写入本回合自动存档。' });
    const variableBatchesForSave = compactVariableBatchHistory(variableOverrides?.batch
      ? [...state.variableBatches, variableOverrides.batch]
      : state.variableBatches);
    const saveData = buildSavePayload(state, 'auto', {
      chatHistory: finalHistoryForSave,
      记忆: memoryAfterStoryProgress,
      忆庭: yitingAfterTurnRecall,
      手机: phoneAfterFallbackSeed,
      旅人: variableOverrides?.旅人,
      世界: variableOverrides?.世界,
      NPC: npcAfterCompression,
      新闻: newsAfterGeneration ?? variableOverrides?.新闻,
      剧情: variableOverrides?.剧情,
      剧情编织: storyWeavingForSave,
      智库: zhikuAfterRuntimeUnlock,
      variableBatches: variableBatchesForSave,
      queueTasks: state.queueTasks,
      turnCount: state.turnCount + 1,
    });
    assertWorkflowActive();
    await saveGame(saveData);
    commitActiveSaveTreeMeta(saveData);
    assertWorkflowActive();
    pushQueueTask(state, 'autosave', 'success', { detail: '本回合自动存档完成。' });
    state.setHasSave(true);
  }

  await saveSetting('theme', state.currentTheme);
  await saveSetting('apiSettings', state.apiSettings);
  await saveSetting('gameSettings', state.gameSettings);
  await saveSetting('worldbooks', state.worldbooks);
  await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);

  return {};
}
