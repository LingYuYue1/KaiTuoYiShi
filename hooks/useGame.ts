import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useGameState, type UseGameStateReturn } from '@/hooks/useGameState';
import type { ContextSnapshot, ContextSnapshotKind } from '@/src/kernel/workflows/contextSnapshot';
import { 创建空记忆系统 } from '@/models/memory';
import { 创建空忆庭系统 } from '@/models/yiting';
import { 创建空手机系统 } from '@/models/phone';
import { 创建空相册系统 } from '@/models/imageGeneration';
import type { 角色数据结构 } from '@/models/character';
import type { NPC记录 } from '@/models/npc';
import type { 队列任务记录 } from '@/models/queueTask';
import { 根据开局档案创建初始NPC记录, 生成开局已成立事实, 归一化开局档案, type 世界状态 } from '@/models/world';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import { alignStoryWeavingToOpeningArchive } from '@/data/storyWeavingPreset';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import type { IKernel, SessionCommand, SessionView } from '@/src/kernel/contract';
import {
  asCommandId,
} from '@/src/kernel/contract';
import { APP_SESSION_ID, getAppKernel } from '@/src/kernel/appKernel';
import type { RuntimeGameState } from '@/src/kernel/domain/session/runtimeState';
import { cloneRuntimeGameState } from '@/src/kernel/domain/session/runtimeState';
import type { 存档数据, 存档类型 } from '@/models/settings';
import { consumeExecution, executeTurnIntent } from '@/src/adaptations/execution';
import {
  applyExecutionFrame,
  createProjectionState,
  restoreProjectionFromKernel,
  type ProjectionState,
} from '@/src/adaptations/projections';

export interface UseGameReturn {
  state: UseGameStateReturn;
  actions: {
    handleSend: (text: string) => Promise<void>;
    handleAbort: () => Promise<void>;
    handleNewGame: () => void;
    handleContinue: () => Promise<boolean>;
    handleGoHome: () => Promise<void>;
    handleSave: () => Promise<number>;
    handleLoadSave: (id: number) => Promise<boolean>;
    handleReroll: () => Promise<string | void>;
    handleRegenerateNarrativeImage: (messageId: string) => Promise<void>;
    handleRetryQueueTask: (task: 队列任务记录, mode?: 'retry' | 'reroll') => Promise<void>;
    handleRestartOpening: () => Promise<void>;
    handleStartSession: (
      traveler: 角色数据结构,
      world: 世界状态,
      npc: NPC记录[],
      storyWeaving: 剧情编织系统,
    ) => Promise<void>;
    getContextSnapshot: (kind?: ContextSnapshotKind) => Promise<ContextSnapshot>;
  };
}

export function useGame(): UseGameReturn {
  const state = useGameState();
  // Keep a live ref so action callbacks stay identity-stable across state ticks.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const kernelPromiseRef = useRef<Promise<IKernel> | null>(null);
  const activeCommandRef = useRef<ReturnType<typeof asCommandId> | null>(null);
  /**
   * UI Projection Store (Phase 3 Stage 3.3).
   * Holds SessionView + temporary progress buffer only.
   * Progress never formal-commits React game domain state.
   */
  const projectionRef = useRef<ProjectionState | null>(null);

  const getKernel = useCallback(async (): Promise<IKernel> => {
    if (!kernelPromiseRef.current) {
      kernelPromiseRef.current = getAppKernel();
    }
    return kernelPromiseRef.current;
  }, []);

  const replaceSessionRuntime = useCallback(async (
    kernel: IKernel,
    runtime: RuntimeGameState,
  ): Promise<SessionView> => {
    if (!runtime.旅人.姓名.trim()) throw new Error('Traveler name is required to create a kernel session');
    const existence = await kernel.read({ type: 'session.exists', sessionId: APP_SESSION_ID });
    const commandId = asCommandId(crypto.randomUUID());
    const envelope = existence.exists
      ? {
          protocolVersion: 1 as const,
          commandId,
    sessionId: APP_SESSION_ID,
          expectedRevision: (await kernel.read({ type: 'session.read', sessionId: APP_SESSION_ID })).revision,
          command: { type: 'session.reset' as const, runtime },
        }
      : {
          protocolVersion: 1 as const,
          commandId,
          sessionId: APP_SESSION_ID,
          command: { type: 'session.create' as const, runtime },
        };
    const terminal = await consumeExecution(kernel, envelope, {
      showProgress: () => {},
      replaceProjection: (view) => {
        projectionRef.current = createProjectionState(view);
        applySessionView(stateRef.current, view);
        stateRef.current.setHasSave(true);
      },
      showError: () => {},
    });
    if (terminal.type === 'rejected') throw new Error(terminal.error.message);
    return terminal.view;
  }, []);

  const handleStartSession = useCallback(async (
    traveler: 角色数据结构,
    world: 世界状态,
    npc: NPC记录[],
    storyWeaving: 剧情编织系统,
  ): Promise<void> => {
    const current = stateRef.current;
    const runtime = cloneRuntimeGameState({
      ...snapshotRuntimeState(current),
      旅人: traveler,
      世界: world,
      chatHistory: [],
      记忆: 创建空记忆系统(),
      忆庭: 创建空忆庭系统(),
      手机: 创建空手机系统(),
      NPC: npc,
      相册: 创建空相册系统(),
      新闻: [],
      剧情: [],
      剧情编织: storyWeaving,
      variableBatches: [],
      queueTasks: [],
      turnCount: 1,
    });
    await replaceSessionRuntime(await getKernel(), runtime);
  }, [getKernel, replaceSessionRuntime]);

  const checkpointRuntime = useCallback(async (kernel: IKernel): Promise<SessionView> => {
    const projection = requireProjection(projectionRef.current);
    const commandId = asCommandId(crypto.randomUUID());
    const terminal = await consumeExecution(kernel, {
      protocolVersion: 1,
      commandId,
      sessionId: APP_SESSION_ID,
      expectedRevision: projection.session.revision,
      command: { type: 'session.checkpoint', runtime: snapshotRuntimeState(stateRef.current) },
    }, {
      showProgress: () => {},
      replaceProjection: (view) => { projectionRef.current = createProjectionState(view); },
      showError: () => {},
    });
    if (terminal.type === 'rejected') throw new Error(terminal.error.message);
    return terminal.view;
  }, []);

  const handleSend = useCallback(
    async (text: string) => {
      const s = stateRef.current;
      if (activeCommandRef.current || s.loading) {
        throw new Error('Another kernel command is running');
      }
      s.setInterruptedWorkflow(null);
      s.setLoading(true);
      s.setWorkflowStatus('searching');
      const kernel = await getKernel();
      const commandId = crypto.randomUUID();
      const commandIdBrand = asCommandId(commandId);
      activeCommandRef.current = commandIdBrand;
      try {
        const checkpoint = await checkpointRuntime(kernel);
        const terminal = await executeTurnIntent(kernel, {
          text,
          commandId,
          sessionId: APP_SESSION_ID,
          expectedRevision: checkpoint.revision,
          createdAt: Date.now(),
        }, {
          showProgress: (delta) => {
            setStreamingMessage(delta.text);
            projectionRef.current = applyExecutionFrame(requireProjection(projectionRef.current), {
              type: 'progress', commandId: commandIdBrand, delta,
            });
          },
          replaceProjection: (view) => {
            projectionRef.current = applyExecutionFrame(requireProjection(projectionRef.current), {
              type: 'committed', commandId: commandIdBrand, revision: view.revision, view,
            });
            applySessionView(stateRef.current, view);
          },
          showError: (error) => {
            projectionRef.current = applyExecutionFrame(requireProjection(projectionRef.current), {
              type: 'rejected', commandId: commandIdBrand, error,
            });
          },
        });
        if (terminal.type === 'rejected') throw new Error(terminal.error.message);
        setStreamingMessage('');
        s.setWorkflowStatus('');
      } catch (error) {
        s.setWorkflowStatus('');
        s.setWorkflowHint(error instanceof Error ? error.message : String(error));
        throw error;
      } finally {
        if (activeCommandRef.current === commandIdBrand) activeCommandRef.current = null;
        s.setLoading(false);
      }
    },
    [checkpointRuntime, getKernel],
  );

  const handleAbort = useCallback(async () => {
    const commandId = activeCommandRef.current;
    if (!commandId) throw new Error('No kernel command is running');
    await (await getKernel()).cancel(commandId);
  }, [getKernel]);

  const handleNewGame = useCallback(() => {
    const s = stateRef.current;
    s.setInterruptedWorkflow(null);
    s.setView('new_game');
  }, []);

  const handleContinue = useCallback(async (): Promise<boolean> => {
    const kernel = await getKernel();
    const existence = await kernel.read({ type: 'session.exists', sessionId: APP_SESSION_ID });
    if (!existence.exists) throw new Error('Kernel session does not exist');
    const livePreferences = {
      apiSettings: stateRef.current.apiSettings,
      gameSettings: stateRef.current.gameSettings,
      currentTheme: stateRef.current.currentTheme,
      worldbooks: stateRef.current.worldbooks,
    };
    projectionRef.current = await restoreProjectionFromKernel(kernel, APP_SESSION_ID);
    applySessionView(stateRef.current, projectionRef.current.session);
    stateRef.current.setApiSettings(livePreferences.apiSettings);
    stateRef.current.setGameSettings(livePreferences.gameSettings);
    stateRef.current.setCurrentTheme(livePreferences.currentTheme);
    stateRef.current.setWorldbooks(livePreferences.worldbooks);
    stateRef.current.setView('game');
    return true;
  }, [getKernel]);

  const handleGoHome = useCallback(async () => {
    const kernel = await getKernel();
    if (activeCommandRef.current) await kernel.cancel(activeCommandRef.current);
    await checkpointRuntime(kernel);
    stateRef.current.setView('home');
  }, [checkpointRuntime, getKernel]);

  const handleSave = useCallback(async (): Promise<number> => {
    const kernel = await getKernel();
    const checkpoint = await checkpointRuntime(kernel);
    return kernel.saves.saveGame(runtimeToSave(checkpoint.runtime, 'manual'));
  }, [checkpointRuntime, getKernel]);

  const handleLoadSave = useCallback(async (id: number): Promise<boolean> => {
    const kernel = await getKernel();
    const save = await kernel.saves.loadSave(id);
    if (!save) throw new Error(`Save not found: ${id}`);
    const runtime = saveToRuntime(save, stateRef.current.worldbooks);
    await replaceSessionRuntime(kernel, runtime);
    stateRef.current.setView('game');
    return true;
  }, [getKernel, replaceSessionRuntime]);

  const handleReroll = useCallback(async (): Promise<string | void> => {
    const s = stateRef.current;
    if (s.loading || s.pendingVariable) {
      throw new Error('Cannot reroll while another kernel command is running');
    }
    let commandId: ReturnType<typeof asCommandId> | null = null;
    s.setLoading(true);
    s.setWorkflowStatus('searching');
    try {
      const kernel = await getKernel();
      const checkpoint = await checkpointRuntime(kernel);
      const turn = checkpoint.turns.at(-1);
      if (!turn) throw new Error('Cannot reroll an empty session');
      const runningCommandId = asCommandId(crypto.randomUUID());
      commandId = runningCommandId;
      activeCommandRef.current = runningCommandId;
      const terminal = await consumeExecution(kernel, {
        protocolVersion: 1,
        commandId: runningCommandId,
        sessionId: APP_SESSION_ID,
        expectedRevision: checkpoint.revision,
        command: { type: 'turn.reroll', turnId: turn.id, createdAt: Date.now() },
      }, {
        showProgress: (delta) => {
          setStreamingMessage(delta.text);
          projectionRef.current = applyExecutionFrame(requireProjection(projectionRef.current), {
            type: 'progress', commandId: runningCommandId, delta,
          });
        },
        replaceProjection: (view) => {
          projectionRef.current = applyExecutionFrame(requireProjection(projectionRef.current), {
            type: 'committed', commandId: runningCommandId, revision: view.revision, view,
          });
          applySessionView(stateRef.current, view);
        },
        showError: (error) => {
          projectionRef.current = applyExecutionFrame(requireProjection(projectionRef.current), {
            type: 'rejected', commandId: runningCommandId, error,
          });
        },
      });
      if (terminal.type === 'rejected') throw new Error(terminal.error.message);
      setStreamingMessage('');
      s.setWorkflowStatus('');
    } catch (error) {
      s.setWorkflowStatus('');
      s.setWorkflowHint(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (commandId && activeCommandRef.current === commandId) activeCommandRef.current = null;
      s.setLoading(false);
    }
  }, [checkpointRuntime, getKernel]);

  const executeProjectedCommand = useCallback(async (command: SessionCommand): Promise<void> => {
    const s = stateRef.current;
    if (s.loading) throw new Error('Another kernel command is running');
    const kernel = await getKernel();
    const commandId = asCommandId(crypto.randomUUID());
    activeCommandRef.current = commandId;
    s.setLoading(true);
    try {
      const checkpoint = await checkpointRuntime(kernel);
      const terminal = await consumeExecution(kernel, {
        protocolVersion: 1,
        commandId,
        sessionId: APP_SESSION_ID,
        expectedRevision: checkpoint.revision,
        command,
      }, {
        showProgress: (delta) => {
          setStreamingMessage(delta.text);
          projectionRef.current = applyExecutionFrame(requireProjection(projectionRef.current), {
            type: 'progress', commandId, delta,
          });
        },
        replaceProjection: (view) => {
          projectionRef.current = createProjectionState(view);
          applySessionView(stateRef.current, view);
        },
        showError: (error) => {
          projectionRef.current = applyExecutionFrame(requireProjection(projectionRef.current), {
            type: 'rejected', commandId, error,
          });
        },
      });
      if (terminal.type === 'rejected') throw new Error(terminal.error.message);
    } catch (error) {
      s.setWorkflowHint(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      if (activeCommandRef.current === commandId) activeCommandRef.current = null;
      s.setLoading(false);
      setStreamingMessage('');
    }
  }, [checkpointRuntime, getKernel]);

  const handleRegenerateNarrativeImage = useCallback(async (messageId: string) => {
    await executeProjectedCommand({
      type: 'message.image.regenerate',
      messageId,
    });
  }, [executeProjectedCommand]);

  const handleRetryQueueTask = useCallback(async (task: 队列任务记录, mode: 'retry' | 'reroll' = 'retry') => {
    await executeProjectedCommand({
      type: 'queue.retry',
      taskId: task.id,
      mode,
    });
  }, [executeProjectedCommand]);

  const handleRestartOpening = useCallback(async () => {
    const s = stateRef.current;
    if (s.loading) throw new Error('Cannot restart while a kernel command is running');

    const restartOpeningArchive = 归一化开局档案(s.世界.开局档案, s.世界);
    const nextStoryWeaving = alignStoryWeavingToOpeningArchive(s.剧情编织, restartOpeningArchive);
    const openingSummary = restartOpeningArchive.整理档案;
    const nextLocation = openingSummary?.初始地点参考?.trim();
    const nextDate = openingSummary?.初始日期参考?.trim();
    const nextTime = openingSummary?.初始时间参考?.trim();
    if (!nextLocation || !nextDate || !nextTime) {
      throw new Error('Opening archive requires location, date, and time');
    }
    const nextWorld = {
      ...s.世界,
      开局档案: restartOpeningArchive,
      起航之地ID: restartOpeningArchive.章节锚点ID,
      自定义开局: restartOpeningArchive.玩家介入原文,
      当前地点: nextLocation,
      已访问时段: [],
      开拓天数: 1,
      当前日期: nextDate,
      当前时间: nextTime,
      全局事件: 生成开局已成立事实(restartOpeningArchive, {
        currentDate: nextDate,
        currentTime: nextTime,
        currentLocation: nextLocation,
        originalProtagonist: s.世界.原著主角,
      }),
      活跃人物: [],
      氛围变化: '',
    };
    await handleStartSession(
      { ...s.旅人, 背包: [] },
      nextWorld,
      根据开局档案创建初始NPC记录(restartOpeningArchive),
      nextStoryWeaving,
    );
    setStreamingMessage('');
    s.setPendingOpeningTrigger('[系统] 开启第 0 回合');
  }, [handleStartSession]);

  const getContextSnapshot = useCallback(async (kind?: ContextSnapshotKind): Promise<ContextSnapshot> => {
    const kernel = await getKernel();
    return kernel.services.contextSnapshot.buildContextSnapshot(
      cloneRuntimeGameState(snapshotRuntimeState(stateRef.current)),
      kind,
    );
  }, [getKernel]);

  const actions = useMemo(() => ({
    handleSend,
    handleAbort,
    handleNewGame,
    handleContinue,
    handleGoHome,
    handleSave,
    handleLoadSave,
    handleReroll,
    handleRegenerateNarrativeImage,
    handleRetryQueueTask,
    handleRestartOpening,
    handleStartSession,
    getContextSnapshot,
  }), [
    handleSend,
    handleAbort,
    handleNewGame,
    handleContinue,
    handleGoHome,
    handleSave,
    handleLoadSave,
    handleReroll,
    handleRegenerateNarrativeImage,
    handleRetryQueueTask,
    handleRestartOpening,
    handleStartSession,
    getContextSnapshot,
  ]);

  return {
    state,
    actions,
  };
}

function requireProjection(projection: ProjectionState | null): ProjectionState {
  if (!projection) throw new Error('Kernel projection is not initialized');
  return projection;
}

function applySessionView(state: UseGameStateReturn, view: SessionView): void {
  const runtime = cloneRuntimeGameState(view.runtime);
  state.set旅人(runtime.旅人);
  state.set世界(runtime.世界);
  state.setChatHistory(runtime.chatHistory.slice());
  state.set记忆(runtime.记忆);
  state.set忆庭(runtime.忆庭);
  state.set智库(runtime.智库);
  state.set手机(runtime.手机);
  state.setNPC(runtime.NPC.slice());
  state.set相册(runtime.相册);
  state.set新闻(runtime.新闻.slice());
  state.set剧情(runtime.剧情.slice());
  state.set剧情编织(runtime.剧情编织);
  state.setVariableBatches(runtime.variableBatches.slice());
  state.setQueueTasks(runtime.queueTasks.slice());
  state.setApiSettings(runtime.apiSettings);
  state.setGameSettings(runtime.gameSettings);
  state.setCurrentTheme(runtime.currentTheme);
  state.setWorldbooks(runtime.worldbooks.slice());
  state.setTurnCount(runtime.turnCount);
}

function snapshotRuntimeState(state: UseGameStateReturn): RuntimeGameState {
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

function runtimeToSave(runtime: RuntimeGameState, type: 存档类型): 存档数据 {
  return {
    id: 0,
    type,
    timestamp: Date.now(),
    turnCount: runtime.turnCount,
    旅人: runtime.旅人,
    世界: runtime.世界,
    chatHistory: runtime.chatHistory.slice(),
    记忆: runtime.记忆,
    忆庭: runtime.忆庭,
    智库: runtime.智库,
    手机: runtime.手机,
    NPC: runtime.NPC.slice(),
    相册: runtime.相册,
    新闻: runtime.新闻.slice(),
    剧情: runtime.剧情.slice(),
    剧情编织: runtime.剧情编织,
    variableBatches: runtime.variableBatches.slice(),
    queueTasks: runtime.queueTasks.slice(),
    gameSettings: runtime.gameSettings,
    apiSettings: runtime.apiSettings,
    theme: runtime.currentTheme,
  };
}

function saveToRuntime(save: 存档数据, worldbooks: UseGameStateReturn['worldbooks']): RuntimeGameState {
  const required = ['turnCount', '忆庭', '智库', '手机', 'NPC', '相册', '新闻', '剧情', '剧情编织', 'variableBatches', 'queueTasks'] as const;
  for (const field of required) {
    if (save[field] === undefined) throw new Error(`Save requires ${field}`);
  }
  return cloneRuntimeGameState({
    旅人: save.旅人,
    世界: save.世界,
    chatHistory: save.chatHistory,
    记忆: save.记忆,
    忆庭: save.忆庭!,
    智库: save.智库!,
    手机: save.手机!,
    NPC: save.NPC!,
    相册: save.相册!,
    新闻: save.新闻!,
    剧情: save.剧情!,
    剧情编织: save.剧情编织!,
    variableBatches: save.variableBatches!,
    queueTasks: save.queueTasks!,
    apiSettings: save.apiSettings,
    gameSettings: save.gameSettings,
    currentTheme: save.theme,
    worldbooks,
    turnCount: save.turnCount!,
  });
}
