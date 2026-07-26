/**
 * 阶段 8：变量模型校准 —— 主回复完成 → 调用独立的变量模型分析正文，把结构化命令落地。
 * 含网络调用（变量模型 API），abortController 从 ctx 取。
 * 切点：variableOverrides 产出后即交还给调用方（后续 S9+ 读取 variableOverrides）。
 *
 * 读 d 字段:
 *   parsedForDisplay (S5, stage5_replyLanding ~第 132 行)
 *   displayText (S5, stage5_replyLanding ~第 56 行)
 *   mem (S6, stage6_memory ~第 42 行)
 *   worldAfter (S7, stage7_worldTraveler)
 *   travelerAfter (S7, stage7_worldTraveler)
 *   yitingEnabled (S2, stage2_preModel)
 *
 * 写 d 字段: variableOverrides (S8)
 *   variableOverrides?: Record<string, unknown> | null
 */
import type { TurnContext, TurnDeltas } from './turnTypes';
import { runVariableCalibrationStep } from './variableWorkflow';
import { pushQueueTask } from './workflowTaskRuntime';

export async function stage8_variable(
  ctx: TurnContext,
  d: TurnDeltas,
): Promise<Partial<TurnDeltas>> {
  const { state, userInput, config, abortController, assertWorkflowActive, isCurrentWorkflow, turnCountAtStart } = ctx;
  const {
    parsedForDisplay,
    displayText,
    mem,
    worldAfter,
    travelerAfter,
    yitingEnabled,
  } = d;

  pushQueueTask(state, 'variable', state.gameSettings.enableVariableUpdate ? 'pending' : 'skipped', {
    detail: state.gameSettings.enableVariableUpdate ? '正在调用变量模型校准正文。' : '变量更新未启用，已跳过。',
  }, turnCountAtStart);

  const variableOverrides = await runVariableCalibrationStep({
    state,
    mainApiConfig: config,
    userInput,
    body: displayText!,
    variableDraft: (parsedForDisplay as any)?.variableDraft,
    turnAfter: turnCountAtStart + 1,
    memorySystemSnapshot: mem!,
    travelerSnapshot: travelerAfter as any,
    worldSnapshot: worldAfter as any,
    signal: abortController.signal,
    allowYiting: Boolean(yitingEnabled),
    shouldCommit: isCurrentWorkflow,
  });
  assertWorkflowActive();

  if (state.gameSettings.enableVariableUpdate) {
    const variableApplied = Boolean(variableOverrides && Object.keys(variableOverrides).some(
      (key) => key !== 'batch' && key !== 'npcLedgerUpdate',
    ));
    pushQueueTask(state, 'variable', 'success', {
      detail: variableApplied ? '变量命令已落地。' : '本回合没有可落地的变量命令，已记录变量报告。',
    }, turnCountAtStart);
  }

  return { variableOverrides: variableOverrides as Record<string, unknown> | null };
}
