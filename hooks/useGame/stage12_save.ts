import type { TurnContext, TurnDeltas } from './turnTypes';
import type { NewestStory记录 } from '@/models/newestStory';
import { commitTurn } from './commitTurn';
import { clearRecoveryProjection } from './recoveryActions';
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
  devLog('stage', 'stage12_save.enter', { turn: turnCountAtStart });

  // 10. commitTurn —— 每回合必写 checkpoint（D2-A：与 enableAutoSaveEveryTurn 开关无关，
  //     开关只控「是否在存档列表为用户保留自动存档」，列表侧过滤见片 5a-2 #8）。
  pushQueueTask(state, 'autosave', 'pending', { detail: '正在写入本回合自动存档。' }, turnCountAtStart, queueTasksMirror);
  assertWorkflowActive();
  await commitTurn(ctx, d, newest);
  assertWorkflowActive();
  pushQueueTask(state, 'autosave', 'success', { detail: '本回合自动存档完成。' }, turnCountAtStart, queueTasksMirror);
  state.setHasSave(true);
  // 封版完成：活跃叶子回到无未封版回合状态，恢复投影随之清空（U2 / K8）。
  clearRecoveryProjection(state);

  devLog('stage', 'stage12_save.exit', { turn: turnCountAtStart, outputs: [] });
  return {};
}
