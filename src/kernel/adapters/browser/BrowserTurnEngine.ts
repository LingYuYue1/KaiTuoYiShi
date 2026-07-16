import {
  executeSendWorkflow,
  type SendWorkflowSettlement,
} from '@/src/kernel/workflows/sendWorkflow';
import type { RuntimeDraftState, RuntimeGameState, RuntimeStateUpdate } from '@/src/kernel/domain/session/runtimeState';
import { cloneRuntimeGameState } from '@/src/kernel/domain/session/runtimeState';
import { resolveActiveModelConfig } from '@/src/kernel/domain/session/runtimeState';
import type { TurnEngine, TurnEngineFrame, TurnEngineRequest } from '@/src/kernel/ports';

export class BrowserTurnEngine implements TurnEngine {
  async *advance(request: TurnEngineRequest, signal: AbortSignal): AsyncIterable<TurnEngineFrame> {
    const draft = createDraftState(request.state);
    let pendingProgress = '';
    let hasPendingProgress = false;
    const driver: {
      finished: boolean;
      settlement?: SendWorkflowSettlement;
      failure?: Error;
    } = { finished: false };
    let wake = createWakeSignal();
    const notify = () => {
      wake.resolve();
      wake = createWakeSignal();
    };

    const execution = executeSendWorkflow(request.text, {
      state: draft,
      getActiveConfig: () => resolveActiveModelConfig(request.state),
      onBeforeSend: () => {},
      onAfterSend: () => {},
      onStreamProgress: (text) => {
        pendingProgress = text;
        hasPendingProgress = true;
        notify();
      },
      onWorkflowSettled: (settlement) => {
        driver.settlement = settlement;
      },
    });
    const abort = () => draft.abortControllerRef.current?.abort();
    signal.addEventListener('abort', abort, { once: true });
    void execution.then(
      () => {
        driver.finished = true;
        notify();
      },
      (error: unknown) => {
        driver.failure = error instanceof Error ? error : new Error(String(error));
        driver.finished = true;
        notify();
      },
    );

    try {
      while (!driver.finished || hasPendingProgress) {
        if (hasPendingProgress) {
          const text = pendingProgress;
          hasPendingProgress = false;
          yield { type: 'progress', text };
          continue;
        }
        await wake.promise;
      }
      if (driver.failure) throw driver.failure;
      if (!driver.settlement) throw new Error('Turn workflow completed without settlement');
      if (!driver.settlement.ok) throw driver.settlement.error;
      yield { type: 'completed', state: snapshotDraftState(draft) };
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }
}

export function createDraftState(runtime: RuntimeGameState): RuntimeDraftState {
  const values = cloneRuntimeGameState(runtime);
  let state!: RuntimeDraftState;
  state = {
    ...values,
    hasSave: false,
    loading: false,
    workflowHint: '',
    workflowStatus: '',
    liveRecallSummary: '',
    liveRecallFullContent: '',
    pendingVariable: false,
    pendingOpeningTrigger: null,
    abortControllerRef: { current: null },
    set旅人: (update) => { state.旅人 = resolveUpdate(update, state.旅人); },
    set世界: (update) => { state.世界 = resolveUpdate(update, state.世界); },
    setChatHistory: (update) => { state.chatHistory = resolveUpdate(update, state.chatHistory); },
    set记忆: (update) => { state.记忆 = resolveUpdate(update, state.记忆); },
    set忆庭: (update) => { state.忆庭 = resolveUpdate(update, state.忆庭); },
    set智库: (update) => { state.智库 = resolveUpdate(update, state.智库); },
    set手机: (update) => { state.手机 = resolveUpdate(update, state.手机); },
    setNPC: (update) => { state.NPC = resolveUpdate(update, state.NPC); },
    set相册: (update) => { state.相册 = resolveUpdate(update, state.相册); },
    set新闻: (update) => { state.新闻 = resolveUpdate(update, state.新闻); },
    set剧情: (update) => { state.剧情 = resolveUpdate(update, state.剧情); },
    set剧情编织: (update) => { state.剧情编织 = resolveUpdate(update, state.剧情编织); },
    setVariableBatches: (update) => { state.variableBatches = resolveUpdate(update, state.variableBatches); },
    setQueueTasks: (update) => { state.queueTasks = resolveUpdate(update, state.queueTasks); },
    setGameSettings: (update) => { state.gameSettings = resolveUpdate(update, state.gameSettings); },
    setHasSave: (update) => { state.hasSave = resolveUpdate(update, state.hasSave); },
    setLoading: (update) => { state.loading = resolveUpdate(update, state.loading); },
    setWorkflowHint: (update) => { state.workflowHint = resolveUpdate(update, state.workflowHint); },
    setWorkflowStatus: (update) => { state.workflowStatus = resolveUpdate(update, state.workflowStatus); },
    setLiveRecallSummary: (update) => { state.liveRecallSummary = resolveUpdate(update, state.liveRecallSummary); },
    setLiveRecallFullContent: (update) => { state.liveRecallFullContent = resolveUpdate(update, state.liveRecallFullContent); },
    setPendingVariable: (update) => { state.pendingVariable = resolveUpdate(update, state.pendingVariable); },
    setTurnCount: (update) => { state.turnCount = resolveUpdate(update, state.turnCount); },
    setPendingOpeningTrigger: (update) => { state.pendingOpeningTrigger = resolveUpdate(update, state.pendingOpeningTrigger); },
  };
  return state;
}

export function snapshotDraftState(state: RuntimeDraftState): RuntimeGameState {
  return cloneRuntimeGameState({
    旅人: state.旅人,
    世界: state.世界,
    chatHistory: state.chatHistory,
    记忆: state.记忆,
    忆庭: state.忆庭,
    智库: state.智库,
    手机: state.手机,
    NPC: state.NPC,
    相册: state.相册,
    新闻: state.新闻,
    剧情: state.剧情,
    剧情编织: state.剧情编织,
    variableBatches: state.variableBatches,
    queueTasks: state.queueTasks,
    apiSettings: state.apiSettings,
    gameSettings: state.gameSettings,
    currentTheme: state.currentTheme,
    worldbooks: state.worldbooks,
    turnCount: state.turnCount,
  });
}

function resolveUpdate<Value>(update: RuntimeStateUpdate<Value>, current: Value): Value {
  return typeof update === 'function'
    ? (update as (previous: Value) => Value)(current)
    : update;
}

function createWakeSignal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => { resolve = next; });
  return { promise, resolve };
}
