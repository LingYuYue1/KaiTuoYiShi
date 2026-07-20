import { executeSendWorkflow } from './executeTurnWorkflow';
import { resolveActiveModelConfig, storyFromTurnExecutionState, type TurnExecutionState } from './turnExecutionState';
import type { MessageProjection, TurnStage } from '@/src/kernel/contract';
import type { StoryState } from '@/src/kernel/domain/session/storyState';
import { reduceTurnMachine, type TurnMachine } from '@/src/kernel/domain/turn/turnMachine';

export type TurnPipelineFrame =
  | Readonly<{ type: 'stage.changed'; stage: Exclude<TurnStage, 'committing'> }>
  | Readonly<{ type: 'stage.retrying'; stage: 'generating'; attempt: number; limit: number }>
  | Readonly<{ type: 'narrative.delta'; text: string }>
  | Readonly<{ type: 'assistant.ready'; message: MessageProjection }>
  | Readonly<{ type: 'completed'; story: StoryState }>;

export async function* runTurnPipeline(
  request: Readonly<{ state: TurnExecutionState; baseStory: StoryState; text: string }>,
  signal: AbortSignal,
): AsyncIterable<TurnPipelineFrame> {
  if (signal.aborted) throw new DOMException('Turn aborted before execution', 'AbortError');
  const draft = structuredClone(request.state) as any;
  let pendingText = '';
  let pending = false;
  const processEvents: any[] = [];
  let result: TurnExecutionState | null = null;
  let failure: Error | null = null;
  let finished = false;
  let wake = createWakeSignal();
  let machine: TurnMachine = reduceTurnMachine({ phase: 'accepted' }, { type: 'prepared' });
  const notify = () => {
    wake.resolve();
    wake = createWakeSignal();
  };

  void executeSendWorkflow(request.text, {
    state: draft,
    gameSettings: request.state.gameSettings,
    worldbooks: request.state.worldbooks.slice(),
    onBeforeSend: () => {},
    onAfterSend: () => {},
    signal,
    getActiveConfig: () => resolveActiveModelConfig(request.state),
    emitProcess: (event: unknown) => {
      processEvents.push(event);
      notify();
    },
    onStreamProgress: (text) => {
      pendingText = text;
      pending = true;
      notify();
    },
  }).then(
    () => { finished = true; notify(); },
    (error: unknown) => {
      failure = error instanceof Error ? error : new Error(String(error));
      finished = true;
      notify();
    },
  );

  while (!finished || pending || processEvents.length > 0) {
    const event = processEvents.shift();
    if (event) {
      machine = event.type === 'stage.changed'
        ? reduceTurnMachine(machine, { type: 'stage', stage: event.stage })
        : event.type === 'stage.retrying'
          ? reduceTurnMachine(machine, { type: 'retry', stage: event.stage, attempt: event.attempt, limit: event.limit })
          : reduceTurnMachine(machine, { type: 'stage', stage: 'assistant-ready' });
      yield event;
    } else if (pending) {
      pending = false;
      yield { type: 'narrative.delta', text: pendingText };
    } else {
      await wake.promise;
    }
  }
  if (failure) throw failure;
  if (!result) throw new Error('Turn pipeline completed without a result');
  if (machine.phase !== 'executing' || machine.stage !== 'reducing') {
    throw new Error(`Turn pipeline completed from illegal phase ${machine.phase}`);
  }
  yield { type: 'completed', story: storyFromTurnExecutionState(result, request.baseStory) };
}

function createWakeSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}
