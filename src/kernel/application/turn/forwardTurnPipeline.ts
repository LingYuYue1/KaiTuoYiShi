import type { CommandId, ExecutionFrame } from '@/src/kernel/contract';
import type { StoryState } from '@/src/kernel/domain/session/storyState';
import type { TurnExecutionState } from './turnExecutionState';
import { runTurnPipeline } from './runTurnPipeline';

export async function* forwardTurnPipeline(input: Readonly<{
  state: TurnExecutionState;
  baseStory: StoryState;
  text: string;
  signal: AbortSignal;
  commandId: CommandId;
}>): AsyncGenerator<ExecutionFrame, StoryState, void> {
  let story: StoryState | null = null;
  for await (const frame of runTurnPipeline(
    { state: input.state, baseStory: input.baseStory, text: input.text },
    input.signal,
  )) {
    if (frame.type === 'narrative.delta') {
      if (story) throw new Error('Turn pipeline emitted progress after completed');
      yield { type: 'progress', commandId: input.commandId, delta: { kind: 'narrative', text: frame.text } };
    } else if (frame.type === 'stage.changed' || frame.type === 'stage.retrying') {
      yield { ...frame, commandId: input.commandId };
    } else if (frame.type === 'assistant.ready') {
      yield { type: 'assistant.ready', commandId: input.commandId, message: frame.message };
    } else {
      if (story) throw new Error('Turn pipeline emitted multiple completed frames');
      story = frame.story;
    }
  }
  if (!story) throw new Error('Turn pipeline completed without state');
  return story;
}
