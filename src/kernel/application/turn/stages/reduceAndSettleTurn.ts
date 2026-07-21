import type { TurnExecutionState } from '../turnExecutionState';
import type { PreparedTurnContext } from './prepareTurnContext';
import type { PreparedTurnScope } from './prepareTurnScope';
import type { TurnPromptPlan } from './buildTurnPromptPlan';
import type { NarrativeGeneration } from './generateNarrative';
import type { finalizeAssistantMessage } from './finalizeAssistantMessage';
import { reduceWorldState } from './reduceWorldState';
import { settleTurnMemory } from './settleTurnMemory';
import { runVariableCalibrationStep, type VariableCalibrationOverrides } from './variableCalibration';
import { settleNpcAndStoryProgress } from './settleNpcAndStoryProgress';
import { pushQueueTask } from './turnRuntime';

type FinalizedMessage = Awaited<ReturnType<typeof finalizeAssistantMessage>>;

export async function reduceAndSettleTurn(input: Readonly<{
  state: TurnExecutionState;
  scope: PreparedTurnScope;
  context: PreparedTurnContext;
  prompt: TurnPromptPlan;
  generation: NarrativeGeneration;
  finalized: FinalizedMessage;
  userInput: string;
  signal: AbortSignal;
  isActive(): boolean;
  assertActive(): void;
}>): Promise<void> {
  const { state, finalized } = input;
  const history = [...input.context.history, finalized.message];
  state.chatHistory = history;
  state.turnCount += 1;
  const memory = await settleTurnMemory({
    state,
    settings: input.scope.gameSettings,
    turn: state.turnCount - 1,
    userInput: input.userInput,
    parsed: finalized.parsed,
    narrative: finalized.narrative,
    signal: input.signal,
  });
  input.assertActive();
  const reduced = reduceWorldState({
    world: input.scope.effectiveWorld,
    traveler: state.旅人,
    parsed: finalized.parsed,
    rawResponse: input.generation.result.fullText || finalized.narrative,
  });
  state.世界 = reduced.world;
  state.旅人 = reduced.traveler;
  const overrides = await calibrateVariables(input, memory, reduced);
  settleNpcAndStoryProgress({
    state,
    settings: input.scope.gameSettings,
    overrides,
    memory,
    history,
    assistantMessageId: finalized.message.id,
    opening: input.scope.isOpeningSystemTrigger,
    userInput: input.userInput,
    narrative: finalized.narrative,
    world: reduced.world,
    effectiveWorld: input.scope.effectiveWorld,
    storyGate: input.prompt.storyGate,
    assertActive: input.assertActive,
  });
}

async function calibrateVariables(
  input: Parameters<typeof reduceAndSettleTurn>[0],
  memory: TurnExecutionState['记忆'],
  reduced: ReturnType<typeof reduceWorldState>,
): Promise<VariableCalibrationOverrides | null> {
  if (!input.scope.gameSettings.enableVariableUpdate) return null;
  pushQueueTask(input.state, 'variable', 'pending', { detail: '正在调用变量模型校准正文。' });
  const overrides = await runVariableCalibrationStep({
    gameSettings: input.scope.gameSettings,
    state: input.state,
    userInput: input.userInput,
    body: input.finalized.narrative,
    variableDraft: input.finalized.parsed.variableDraft,
    turnAfter: input.state.turnCount,
    memorySystemSnapshot: memory,
    travelerSnapshot: reduced.traveler,
    worldSnapshot: reduced.world,
    signal: input.signal,
    shouldCommit: input.isActive,
  });
  input.assertActive();
  const applied = Boolean(overrides && Object.keys(overrides).some((key) => key !== 'batch' && key !== 'npcLedgerUpdate'));
  pushQueueTask(input.state, 'variable', 'success', {
    detail: applied ? '变量命令已落地。' : '本回合没有可落地的变量命令，已记录变量报告。',
  });
  return overrides;
}
