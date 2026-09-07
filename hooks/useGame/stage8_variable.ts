import type { TurnContext, TurnDeltas } from './turnTypes';
import { runVariableCalibrationStep } from './variableWorkflow';
import { pushQueueTask } from './workflowTaskRuntime';

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

  const variableOverrides = await runVariableCalibrationStep({
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
  assertWorkflowActive();

  if (state.deviceSettings.gameSettings.enableVariableUpdate) {
    const variableApplied = Boolean(variableOverrides && Object.keys(variableOverrides).some(
      (key) => key !== 'batch' && key !== 'failedBatch' && key !== 'npcLedgerUpdate',
    ));
    pushQueueTask(state, 'variable', 'success', {
      detail: variableApplied ? '变量命令已落地。' : '本回合没有可落地的变量命令，已记录变量报告。',
    }, turnCountAtStart, queueTasksMirror);
  }

  return {
    variableOverrides,
    failedVariableBatch: variableOverrides?.failedBatch,
  };
}
