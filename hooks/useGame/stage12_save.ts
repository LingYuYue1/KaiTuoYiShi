import type { TurnContext, TurnDeltas } from './turnTypes';
import type { NewestStory记录 } from '@/models/newestStory';
import {
  clearWorkflowRecoveryJournal,
  updateWorkflowRecoveryJournal,
  persistWorkflowRecoveryJournal,
} from '@/services/workflowRecovery';
import { commitTurn } from './commitTurn';
import { pushQueueTask } from './workflowTaskRuntime';
import { devLog } from '@/utils/devLog';

export async function stage12_save(
  ctx: TurnContext,
  d: TurnDeltas,
  finalValues: {
    finalHistoryForSave: TurnDeltas['finalHistoryForSave'];
    memoryAfterStoryProgress: Exclude<TurnDeltas['memoryAfterStoryProgress'], null>;
    yitingAfterTurnRecall: TurnDeltas['yitingAfterTurnRecall'];
    phoneAfterFallbackSeed: TurnDeltas['phoneAfterFallbackSeed'];
    newest: NewestStory记录;
  },
): Promise<Partial<TurnDeltas>> {
  const {
    state,
    assertWorkflowActive,
    turnCountAtStart,
    queueTasksMirror,
  } = ctx;
  const { newest } = finalValues;
  let recoveryJournal = ctx.recoveryJournal;
  devLog('stage', 'stage12_save.enter', { turn: turnCountAtStart });

  // 10. commitTurn —— 每回合必写 checkpoint（D2-A：与 enableAutoSaveEveryTurn 开关无关，
  //     开关只控「是否在存档列表为用户保留自动存档」，列表侧过滤见片 5a-2 #8）。
  recoveryJournal = updateWorkflowRecoveryJournal(recoveryJournal, { phase: 'autosave' });
  await persistWorkflowRecoveryJournal(recoveryJournal);
  pushQueueTask(state, 'autosave', 'pending', { detail: '正在写入本回合自动存档。' }, turnCountAtStart, queueTasksMirror);
  assertWorkflowActive();
  await commitTurn(ctx, d, newest);
  assertWorkflowActive();
  pushQueueTask(state, 'autosave', 'success', { detail: '本回合自动存档完成。' }, turnCountAtStart, queueTasksMirror);
  state.setHasSave(true);
  await clearWorkflowRecoveryJournal(recoveryJournal.workflowId);

  devLog('stage', 'stage12_save.exit', { turn: turnCountAtStart, outputs: [] });
  return {};
}
