import type { TurnContext, TurnDeltas } from './turnTypes';
import { runVariableCalibrationStep } from './variableWorkflow';
import { pushQueueTask } from './workflowTaskRuntime';
import { devLogError } from '@/utils/devLog';

export async function stage8_variable(
  ctx: TurnContext,
  d: TurnDeltas,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, config, abortController, assertWorkflowActive, isCurrentWorkflow, turnCountAtStart, queueTasksMirror } = ctx;
  const {
    parsedForDisplay,
    displayText,
    mem,
    worldAfter,
    travelerAfter,
    yitingEnabled,
    receipt,
  } = d;
  if (!displayText || !mem || !receipt) {
    throw new Error('stage8_variable: stage5/6 必须写入 displayText、mem 与 receipt');
  }

  pushQueueTask(state, 'variable', state.deviceSettings.gameSettings.enableVariableUpdate ? 'pending' : 'skipped', {
    detail: state.deviceSettings.gameSettings.enableVariableUpdate ? '正在调用变量模型校准正文。' : '变量更新未启用，已跳过。',
  }, turnCountAtStart, queueTasksMirror);

  let variableOverrides: Awaited<ReturnType<typeof runVariableCalibrationStep>>;
  try {
    variableOverrides = await runVariableCalibrationStep({
      state,
      mainApiConfig: config,
      userInput,
      body: displayText,
      variableDraft: parsedForDisplay?.variableDraft,
      receipt,
      memorySystemSnapshot: mem,
      travelerSnapshot: travelerAfter,
      worldSnapshot: worldAfter,
      signal: abortController.signal,
      allowYiting: Boolean(yitingEnabled),
      shouldCommit: isCurrentWorkflow,
      queueTasksMirror,
      pathAwakeningTurn: d.isPathAwakeningTurn === true,
    });
  } catch (error) {
    // 关键位失败：叶子保持 settling，由「继续结算 / 放弃」承载；这里只落可见队列诊断。
    if ((error as Error).name === 'AbortError') throw error;
    devLogError('stage', 'stage8_variable.failed', error, { turn: turnCountAtStart });
    pushQueueTask(state, 'variable', 'failed', {
      detail: error instanceof Error ? error.message : '变量结算失败。',
    }, turnCountAtStart, queueTasksMirror);
    throw error;
  }
  assertWorkflowActive();

  if (state.deviceSettings.gameSettings.enableVariableUpdate) {
    const variableApplied = Boolean(variableOverrides && Object.keys(variableOverrides).some(
      (key) => key !== 'batch' && key !== 'npcLedgerUpdate',
    ));
    pushQueueTask(state, 'variable', 'success', {
      detail: variableApplied ? '变量命令已落地。' : '本回合没有可落地的变量命令，已记录变量报告。',
    }, turnCountAtStart, queueTasksMirror);
  }

  return { variableOverrides };
}
