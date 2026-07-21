import type { API配置项 } from '@/models/settings';
import type { TurnExecutionState } from '../turnExecutionState';
import type { SendWorkflowDeps } from '../turnWorkflowTypes';
import type { PreparedTurnContext } from './prepareTurnContext';
import type { PreparedTurnScope } from './prepareTurnScope';
import type { TurnPromptPlan } from './buildTurnPromptPlan';
import { generateNarrative, type NarrativeGeneration } from './generateNarrative';
import { finalizeAssistantMessage } from './finalizeAssistantMessage';
import { pushQueueTask } from './turnRuntime';

type ProgressSink = Readonly<{ set(text: string): void; flush(text: string): void; cancel(): void }>;
type FinalizedMessage = Awaited<ReturnType<typeof finalizeAssistantMessage>>;

export async function generateAndFinalizeTurn(input: Readonly<{
  state: TurnExecutionState;
  scope: PreparedTurnScope;
  context: PreparedTurnContext;
  prompt: TurnPromptPlan;
  config: API配置项;
  userInput: string;
  reroll?: SendWorkflowDeps['rerollContext'];
  signal: AbortSignal;
  progress: ProgressSink;
  startedAt: number;
  emitProcess?: SendWorkflowDeps['emitProcess'];
  assertActive(): void;
}>): Promise<Readonly<{ generation: NarrativeGeneration; finalized: FinalizedMessage }>> {
  input.emitProcess?.({ type: 'stage.changed', stage: 'generating' });
  const generation = await generateNarrative({
    state: input.state,
    config: input.config,
    settings: input.scope.gameSettings,
    systemPrompt: input.prompt.systemPrompt,
    request: input.prompt.request,
    reroll: input.reroll,
    signal: input.signal,
    progress: input.progress,
    emitProcess: input.emitProcess,
    tavernPreset: input.prompt.preset?.preset,
  });
  input.assertActive();
  input.emitProcess?.({ type: 'stage.changed', stage: 'parsing' });
  const finalized = await finalizeAssistantMessage({
    state: input.state,
    settings: input.scope.gameSettings,
    config: input.config,
    userInput: input.userInput,
    world: input.scope.effectiveWorld,
    history: input.context.history,
    systemPrompt: input.prompt.systemPrompt,
    generation,
    request: input.prompt.request,
    tavernV2Enabled: input.prompt.tavernV2Enabled,
    recall: input.context.recall,
    recallSummary: input.context.recallSummary,
    recallFullContent: input.context.recallFullContent,
    npcLedgers: input.context.npcLedgers,
    storyGate: input.prompt.storyGate,
    storyDiagnostics: input.prompt.storyDiagnostics,
    startedAt: input.startedAt,
    progress: input.progress,
    signal: input.signal,
    emitProcess: input.emitProcess,
  });
  pushQueueTask(input.state, 'main_story', 'success', {
    detail: generation.softProtocolIssues.length
      ? `正文生成完成，用时 ${Math.round(finalized.duration)}s。协议部分字段缺失，已按正文提交。`
      : `正文生成完成，用时 ${Math.round(finalized.duration)}s。`,
  });
  input.emitProcess?.({
    type: 'assistant.ready',
    message: {
      id: finalized.message.id,
      role: 'assistant',
      content: finalized.message.content,
      timestamp: finalized.message.timestamp,
      gameTime: finalized.message.gameTime,
    },
  });
  return { generation, finalized };
}
