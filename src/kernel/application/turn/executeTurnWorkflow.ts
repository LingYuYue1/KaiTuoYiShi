import type { TurnExecutionState } from '@/src/kernel/application/turn/turnExecutionState';
import type { SendWorkflowDeps } from '@/src/kernel/application/turn/turnWorkflowTypes';
import { prepareTurnScope } from '@/src/kernel/application/turn/stages/prepareTurnScope';
import { prepareTurnContext } from '@/src/kernel/application/turn/stages/prepareTurnContext';
import { buildTurnPromptPlan } from '@/src/kernel/application/turn/stages/buildTurnPromptPlan';
import { generateAndFinalizeTurn } from '@/src/kernel/application/turn/stages/generateAndFinalizeTurn';
import { reduceAndSettleTurn } from '@/src/kernel/application/turn/stages/reduceAndSettleTurn';
import { createTurnWorkflowControl } from '@/src/kernel/application/turn/stages/turnWorkflowControl';
export async function executeSendWorkflow(
  userInput: string,
  deps: SendWorkflowDeps,
): Promise<TurnExecutionState> {
  const { state } = deps;
  const config = deps.getActiveConfig();
  if (!config) throw new Error('请先在设置中配置API');
  const scope = prepareTurnScope(state, userInput);
  if (scope.effectiveWorld !== state.世界) state.世界 = scope.effectiveWorld;
  const control = createTurnWorkflowControl({ state, deps, config });

  try {
    deps.emitProcess?.({ type: 'stage.changed', stage: 'resolving-content' });
    deps.emitProcess?.({ type: 'stage.changed', stage: 'retrieving-context' });
    const context = await prepareTurnContext({
      state,
      scope,
      userInput,
      signal: control.signal,
      isActive: control.isActive,
      assertActive: control.assertActive,
    });
    deps.emitProcess?.({ type: 'stage.changed', stage: 'planning-request' });
    const promptPlan = buildTurnPromptPlan({
      state,
      scope,
      context,
      config,
      userInput,
      reroll: deps.rerollContext,
    });
    const produced = await generateAndFinalizeTurn({
      state,
      scope,
      context,
      prompt: promptPlan,
      config,
      userInput,
      reroll: deps.rerollContext,
      signal: control.signal,
      progress: control.progress,
      startedAt: control.startedAt,
      emitProcess: deps.emitProcess,
      assertActive: control.assertActive,
    });
    control.markNarrativeReady();
    deps.emitProcess?.({ type: 'stage.changed', stage: 'reducing' });
    await reduceAndSettleTurn({
      state,
      scope,
      context,
      prompt: promptPlan,
      generation: produced.generation,
      finalized: produced.finalized,
      userInput,
      signal: control.signal,
      isActive: control.isActive,
      assertActive: control.assertActive,
    });
    return state;
  } catch (err: unknown) {
    return control.reportFailure(err);
  } finally {
    control.dispose();
  }
}
