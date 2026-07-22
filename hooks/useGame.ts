import { useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import { useGameState, type UseGameStateReturn } from '@/hooks/useGameState';
import type { ContextSnapshot, ContextSnapshotKind } from '@/src/kernel/contract/inspection';
import type { 角色数据结构 } from '@/models/character';
import type { NPC记录, NPC阶位 } from '@/models/npc';
import { 根据开局档案创建初始NPC记录, 生成开局已成立事实, 归一化开局档案, type 世界状态 } from '@/models/world';
import type { 剧情编织系统 } from '@/models/storyWeaving';
import type { 命途ID } from '@/models/journey';
import type { 剧情模式 } from '@/models/journey';
import { alignStoryWeavingToOpeningArchive } from '@/data/storyWeavingPreset';
import { hydrateRuntimeZhiku } from '@/data/zhikuPreset';
import { setStreamingMessage } from '@/utils/streamingMessageStore';
import { reportAppError } from '@/components/ui/AppErrorReporter';
import type { CommandId, ExecutionFrame, JobProjection, KernelError, MessageProjection, NarrativeProgressDelta, SessionView, TurnStage } from '@/src/kernel/contract';
import type {
  CommandHandle,
  CommandTerminal,
  CompanionPlanningProjection,
  GameEvent,
  ISession,
  GeneratedSkillDraft,
  SkillDraftGenerationInput,
  SessionCommit,
  SkillSaveInput,
  TurnCommit,
} from '@/src/kernel/contract/session';
import { APP_SESSION_ID, getAppRoot } from '@/src/adaptations/kernel';
import type { 智库条目, 智库条目草稿 } from '@/models/zhiku';
import type { StorySegmentDraftInput } from '@/src/kernel/contract';
import type { 剧情编织运行状态 } from '@/models/storyWeaving';
import type { AlbumCommand } from '@/src/kernel/contract';
import { projectionHasDraft, projectionNarrativeText, type ProjectionState } from '@/src/adaptations/projections';
import { splitSettings } from '@/models/settingsPlanes';

export interface UseGameReturn {
  state: UseGameStateReturn;
  actions: {
    handleSend: (text: string) => Promise<void>;
    handleOpeningTrigger: (text: string) => Promise<void>;
    handleAbort: () => Promise<void>;
    handleNewGame: () => void;
    handleContinue: () => Promise<boolean>;
    handleGoHome: () => Promise<void>;
    handleSave: () => Promise<number>;
    handleLoadSave: (id: number) => Promise<boolean>;
    handleReroll: () => Promise<string | void>;
    handleRegenerateNarrativeImage: (messageId: string) => Promise<void>;
    handleRetryJob: (job: JobProjection) => Promise<void>;
    handleCancelJob: (jobId: string) => Promise<void>;
    handleSetPrimaryPath: (pathId: 命途ID) => Promise<void>;
    handleDeclinePathAwakening: () => Promise<void>;
    handleEnterPathAwakening: () => Promise<void>;
    handleEditMessageBody: (messageId: string, body: string) => Promise<void>;
    getCompanionPlanning: () => Promise<CompanionPlanningProjection>;
    handleSetCompanionTier: (npcId: string, tier: NPC阶位) => Promise<void>;
    handleSetCompanionTraveling: (npcId: string, traveling: boolean) => Promise<void>;
    handleCompressMemory: (layer: 'immediate' | 'short' | 'middle', force: boolean) => Promise<void>;
    handleSetStoryMode: (mode: 剧情模式) => Promise<void>;
    handleSaveSkill: (input: SkillSaveInput) => Promise<void>;
    handleGenerateSkillDraft: (input: SkillDraftGenerationInput) => Promise<GeneratedSkillDraft>;
    handleDeleteSkill: (skillId: string) => Promise<void>;
    handleSetSkillEnabled: (skillId: string, enabled: boolean) => Promise<void>;
    handleUseInventoryItem: (itemId: string, count?: number) => Promise<void>;
    handleDropInventoryItem: (itemId: string, count?: number) => Promise<CommandId>;
    handleUndoInventoryDrop: (dropCommandId: CommandId) => Promise<void>;
    handleCreateZhikuEntry: (draft: 智库条目草稿) => Promise<string>;
    handleUpdateZhikuEntry: (entryId: string, patch: Partial<Omit<智库条目, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
    handleDeleteZhikuEntry: (entryId: string) => Promise<void>;
    handleRefreshBundledZhiku: () => Promise<void>;
    handlePlotImportText: (input: { text: string; title: string; fileName?: string; chaptersPerSegment: number }) => Promise<void>;
    handlePlotImportJson: (json: string) => Promise<void>;
    handlePlotRestoreBundled: () => Promise<void>;
    handlePlotRenameSeries: (seriesId: string, title: string) => Promise<void>;
    handlePlotRebuildSeries: (seriesId: string, chaptersPerSegment: number) => Promise<void>;
    handlePlotToggleSeriesInjection: (seriesId: string) => Promise<void>;
    handlePlotSetCurrent: (seriesId: string, group: number) => Promise<void>;
    handlePlotSetSegmentStatus: (seriesId: string, segmentId: string, status: 剧情编织运行状态) => Promise<void>;
    handlePlotSaveSegment: (seriesId: string, segmentId: string, draft: StorySegmentDraftInput) => Promise<void>;
    handlePlotDeleteSeries: (seriesId: string) => Promise<void>;
    handlePlotDecompose: (seriesId: string, segmentId: string) => Promise<void>;
    handlePlotDecomposeBatch: (seriesId: string, mode: 'pending' | 'from-current' | 'all') => Promise<void>;
    handleAlbumImportReference: (input: Omit<Extract<AlbumCommand, { type: 'album.import-reference' }>, 'type' | 'createdAt'>) => Promise<string>;
    handleAlbumSetReference: (entryId: string, characterId: string, enabled: boolean) => Promise<void>;
    handleAlbumGenerate: (input: Omit<Extract<AlbumCommand, { type: 'album.generate' }>, 'type' | 'createdAt'>) => Promise<{ entryId: string; task: import('@/models/imageGeneration').图片生成任务 }>;
    handleAlbumBindSlot: (input: Omit<Extract<AlbumCommand, { type: 'album.bind-slot' }>, 'type'>) => Promise<void>;
    handleAlbumDeleteEntries: (entryIds: readonly string[]) => Promise<void>;
    handleAlbumImportArchive: (album: import('@/models/imageGeneration').相册系统) => Promise<void>;
    handleAlbumSetCharacterAnchor: (input: Omit<Extract<AlbumCommand, { type: 'album.set-character-anchor' }>, 'type' | 'updatedAt'>) => Promise<void>;
    handleAlbumExtractCharacterAnchor: ISession['album']['extractCharacterAnchor'];
    handleAlbumTokenizePrompt: ISession['album']['tokenizePrompt'];
    handleAlbumParseScene: ISession['album']['parseScene'];
    handleAlbumParseStorySnapshot: ISession['album']['parseStorySnapshot'];
    handlePhoneDismissSeed: (seedId: string) => Promise<void>;
    handlePhoneMarkRead: (chatId: string) => Promise<void>;
    handlePhoneAddContact: (npcId: string) => Promise<void>;
    handlePhoneOpenPrivateChat: (npcId: string) => Promise<string>;
    handlePhoneCreateGroup: (npcIds: readonly string[], title: string) => Promise<string>;
    handlePhoneRenameGroup: (chatId: string, title: string) => Promise<void>;
    handlePhoneAddGroupMember: (chatId: string, npcId: string) => Promise<void>;
    handlePhoneSetWallpaper: (slot: 'home' | 'chat', assetRef?: string) => Promise<void>;
    handlePhoneSend: (chatId: string, text: string) => Promise<void>;
    handlePhoneGenerateSeed: (seedId: string) => Promise<string>;
    handleRestartOpening: () => Promise<void>;
    handleStartSession: (
      traveler: 角色数据结构,
      world: 世界状态,
      npc: NPC记录[],
      storyWeaving: 剧情编织系统,
      pendingOpeningTrigger?: string | null,
    ) => Promise<void>;
    getContextSnapshot: (kind?: ContextSnapshotKind) => Promise<ContextSnapshot>;
  };
}

type ExecutionSink = Readonly<{
  applyEvent?(event: GameEvent): void;
  showPrepared(view: SessionView): void;
  showStage(stage: TurnStage): void;
  showRetry(stage: TurnStage, attempt: number, limit: number): void;
  showProgress(delta: NarrativeProgressDelta): void;
  showAssistant(message: MessageProjection): void;
  replaceProjection(view: SessionView): void;
  showError(error: KernelError): void;
}>;

export function useGame(): UseGameReturn {
  const state = useGameState();
  // Keep a live ref so action callbacks stay identity-stable across state ticks.
  const stateRef = useRef(state);
  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);
  const sessionPromiseRef = useRef<Promise<ISession> | null>(null);
  const autosaveUnsubscribeRef = useRef<(() => void) | null>(null);
  const projectionUnsubscribeRef = useRef<(() => void) | null>(null);
  const activeCommandRef = useRef<CommandHandle<GameEvent, SessionCommit | TurnCommit> | null>(null);
  const resyncPromiseRef = useRef<Promise<void> | null>(null);
  const projectionStore = state.projectionStore;

  const connectSession = useCallback(async (): Promise<ISession> => {
    const root = await getAppRoot();
    type ConnectionLog = Omit<Parameters<typeof root.diagnostics.recordKernelLog>[0], 'scope'>;
    const log = (input: ConnectionLog) => {
      root.diagnostics.recordKernelLog({ ...input, scope: 'ui.session-connection' });
    };
    log({ level: 'debug', event: 'open.started', data: { sessionId: APP_SESSION_ID } });
    autosaveUnsubscribeRef.current?.();
    autosaveUnsubscribeRef.current = null;
    projectionUnsubscribeRef.current?.();
    projectionUnsubscribeRef.current = null;
    try {
      const session = await root.sessions.open(APP_SESSION_ID);

      // Establish a usable projection before any commit can reach the listener.
      const initialView = await session.projection.current();
      syncStreamFromProjection(projectionStore.initialize(initialView));
      log({
        level: 'info',
        event: 'projection.initialized',
        data: { sessionId: APP_SESSION_ID, revision: Number(initialView.revision) },
      });

      projectionUnsubscribeRef.current = session.projection.subscribe((commit) => {
        log({
          level: 'debug',
          event: 'projection.commit.received',
          data: { cause: commit.cause, revision: Number(commit.view.revision) },
        });
        syncStreamFromProjection(projectionStore.followCommitted(commit.view));
      });
      autosaveUnsubscribeRef.current = await root.saves.followAutosave(session);

      // Close the read -> subscribe race: a commit may have landed between the
      // initial read and listener registration.
      const synchronizedView = await session.projection.resync();
      syncStreamFromProjection(projectionStore.followCommitted(synchronizedView));
      log({
        level: 'debug',
        event: 'projection.resynchronized',
        data: { sessionId: APP_SESSION_ID, revision: Number(synchronizedView.revision) },
      });
      sessionPromiseRef.current = Promise.resolve(session);
      log({ level: 'info', event: 'open.completed', data: { sessionId: APP_SESSION_ID } });
      return session;
    } catch (error) {
      autosaveUnsubscribeRef.current?.();
      autosaveUnsubscribeRef.current = null;
      projectionUnsubscribeRef.current?.();
      projectionUnsubscribeRef.current = null;
      log({ level: 'error', event: 'open.failed', error });
      throw error;
    }
  }, [projectionStore]);

  const getSession = useCallback(async (): Promise<ISession> => {
    if (!sessionPromiseRef.current) {
      sessionPromiseRef.current = connectSession();
    }
    return sessionPromiseRef.current;
  }, [connectSession]);

  useLayoutEffect(() => () => {
    autosaveUnsubscribeRef.current?.();
    autosaveUnsubscribeRef.current = null;
    projectionUnsubscribeRef.current?.();
    projectionUnsubscribeRef.current = null;
  }, []);

  const cancelActiveCommandAndWait = useCallback(async (): Promise<void> => {
    const handle = activeCommandRef.current;
    if (!handle) return;
    await handle.cancelAndWait();
    if (activeCommandRef.current === handle) activeCommandRef.current = null;
  }, []);

  /** Single stream writer: projection.progress is the only source of stream text. */
  const applyProjectionFrame = useCallback((frame: ExecutionFrame): ProjectionState => {
    const next = projectionStore.apply(frame);
    syncStreamFromProjection(next);
    return next;
  }, [projectionStore]);

  const applyProjectionEvent = useCallback((event: GameEvent): void => {
    const next = projectionStore.applyEvent(event);
    syncStreamFromProjection(next);
    if (next.phase !== 'resyncing' || resyncPromiseRef.current) return;
    resyncPromiseRef.current = getSession()
      .then((session) => session.projection.resync())
      .then((view) => { syncStreamFromProjection(projectionStore.initialize(view)); })
      .finally(() => { resyncPromiseRef.current = null; });
  }, [getSession, projectionStore]);

  /** Session transitions: drop draft/progress through projection (or empty stream if cold). */
  const resetUiProjectionEphemerals = useCallback(() => {
    const current = projectionStore.current();
    if (!current) {
      setStreamingMessage('');
      return;
    }
    const next = projectionStore.clearEphemerals();
    if (next) syncStreamFromProjection(next);
  }, [projectionStore]);

  /**
   * Safety net for non-terminal errors (checkpoint fail, throw mid-stream without rejected).
   * Normal rejected terminals already clear via showError — this no-ops then.
   */
  const recoverProjectionAfterCommandError = useCallback(() => {
    const proj = projectionStore.current();
    if (!proj || !projectionHasDraft(proj)) return;
    const next = projectionStore.clearEphemerals();
    if (next) syncStreamFromProjection(next);
  }, [projectionStore]);

  const createLiveSink = useCallback((commandId: CommandId): ExecutionSink => ({
    applyEvent: applyProjectionEvent,
    showPrepared: (view) => {
      applyProjectionFrame({ type: 'prepared', commandId, view });
    },
    showStage: (stage) => {
      applyProjectionFrame({ type: 'stage.changed', commandId, stage });
    },
    showRetry: (stage, attempt, limit) => {
      applyProjectionFrame({ type: 'stage.retrying', commandId, stage, attempt, limit });
    },
    showProgress: (delta) => {
      applyProjectionFrame({ type: 'progress', commandId, delta });
    },
    showAssistant: (message) => {
      applyProjectionFrame({ type: 'assistant.ready', commandId, message });
    },
    replaceProjection: (view) => {
      applyProjectionFrame({ type: 'committed', commandId, revision: view.revision, view });
    },
    showError: (error) => {
      applyProjectionFrame({ type: 'rejected', commandId, error });
    },
  }), [applyProjectionEvent, applyProjectionFrame]);

  const handleStartSession = useCallback(async (
    traveler: 角色数据结构,
    world: 世界状态,
    npc: NPC记录[],
    storyWeaving: 剧情编织系统,
    pendingOpeningTrigger: string | null = null,
  ): Promise<void> => {
    const current = stateRef.current;
    clearEphemeralUi(current);
    resetUiProjectionEphemerals();
    // Session boundary: always rehydrate bundled 智库 so new games never start on shells/empty.
    const 智库 = await hydrateRuntimeZhiku(current.智库);
    const seed = {
      traveler,
      world,
      initialNpcRecords: npc,
      zhikuRuntime: 智库,
      storyWeaving,
      pendingOpeningTrigger,
      policy: splitSettings(current.gameSettings, current.apiSettings, current.currentTheme).story,
    };
    const root = await getAppRoot();
    const handle = await root.sessions.exists(APP_SESSION_ID)
      ? (await root.sessions.open(APP_SESSION_ID)).lifecycle.restart(seed)
      : root.sessions.create(APP_SESSION_ID, seed);
    activeCommandRef.current = handle;
    const terminal = await consumeSessionHandle(handle, {
      showPrepared: () => {},
      showStage: () => {},
      showRetry: () => {},
      showProgress: () => {},
      showAssistant: () => {},
      replaceProjection: (view) => {
        syncStreamFromProjection(projectionStore.initialize(view));
      },
      showError: () => {},
    });
    if (activeCommandRef.current === handle) activeCommandRef.current = null;
    if (terminal.outcome === 'rejected') throw new Error(terminal.error.message);
    await connectSession();
  }, [connectSession, projectionStore, resetUiProjectionEphemerals]);

  const handleSend = useCallback(
    async (text: string, openingTrigger?: string) => {
      const s = stateRef.current;
      if (activeCommandRef.current || s.loading) {
        throw new Error('Another kernel command is running');
      }
      s.setInterruptedWorkflow(null);
      let handle: CommandHandle<GameEvent, TurnCommit> | null = null;
      try {
        handle = (await getSession()).turns.advance({ text, openingTrigger });
        activeCommandRef.current = handle;
        const terminal = await consumeSessionHandle(handle, createLiveSink(handle.commandId));
        if (terminal.outcome === 'rejected') throw new Error(terminal.error.message);
      } catch (error) {
        recoverProjectionAfterCommandError();
        reportAppError({ source: '主剧情命令', error });
        throw error;
      } finally {
        if (activeCommandRef.current === handle) activeCommandRef.current = null;
      }
    },
    [createLiveSink, getSession, recoverProjectionAfterCommandError],
  );

  const handleOpeningTrigger = useCallback(async (text: string): Promise<void> => {
    const root = await getAppRoot();
    const log = (input: Omit<Parameters<typeof root.diagnostics.recordKernelLog>[0], 'scope'>) => {
      root.diagnostics.recordKernelLog({ ...input, scope: 'ui.opening-trigger' });
    };
    log({ level: 'info', event: 'opening.started', data: { triggerLength: text.length } });
    try {
      await handleSend(text, text);
      log({ level: 'info', event: 'opening.completed' });
    } catch (error) {
      log({ level: 'warn', event: 'opening.failed', error });
      throw error;
    }
  }, [handleSend]);

  const handleAbort = useCallback(async () => {
    if (!activeCommandRef.current) throw new Error('No kernel command is running');
    await cancelActiveCommandAndWait();
  }, [cancelActiveCommandAndWait]);

  const handleNewGame = useCallback(() => {
    const s = stateRef.current;
    s.setInterruptedWorkflow(null);
    s.setView('new_game');
  }, []);

  const handleContinue = useCallback(async (): Promise<boolean> => {
    await cancelActiveCommandAndWait();
    const root = await getAppRoot();
    if (!await root.sessions.exists(APP_SESSION_ID)) throw new Error('Kernel session does not exist');
    const session = await connectSession();
    const view = await session.projection.current();
    clearEphemeralUi(stateRef.current);
    syncStreamFromProjection(projectionStore.initialize(view));
    stateRef.current.setView('game');
    return true;
  }, [cancelActiveCommandAndWait, connectSession, projectionStore]);

  const handleGoHome = useCallback(async () => {
    await cancelActiveCommandAndWait();
    clearEphemeralUi(stateRef.current);
    resetUiProjectionEphemerals();
    stateRef.current.setView('home');
  }, [cancelActiveCommandAndWait, resetUiProjectionEphemerals]);

  const handleSave = useCallback(async (): Promise<number> => {
    await getSession();
    return (await getAppRoot()).saves.saveSession(APP_SESSION_ID, 'manual');
  }, [getSession]);

  const handleLoadSave = useCallback(async (id: number): Promise<boolean> => {
    await cancelActiveCommandAndWait();
    clearEphemeralUi(stateRef.current);
    resetUiProjectionEphemerals();
    const root = await getAppRoot();
    const handle = await root.saves.restoreIntoSession(id, APP_SESSION_ID);
    activeCommandRef.current = handle;
    const terminal = await consumeSessionHandle(handle, {
      showPrepared: () => {},
      showStage: () => {},
      showRetry: () => {},
      showProgress: () => {},
      showAssistant: () => {},
      replaceProjection: (view) => {
        syncStreamFromProjection(projectionStore.initialize(view));
      },
      showError: () => {},
    });
    if (activeCommandRef.current === handle) activeCommandRef.current = null;
    if (terminal.outcome === 'rejected') throw new Error(terminal.error.message);
    await connectSession();
    stateRef.current.setView('game');
    return true;
  }, [cancelActiveCommandAndWait, connectSession, projectionStore, resetUiProjectionEphemerals]);

  const handleReroll = useCallback(async (): Promise<string | void> => {
    const s = stateRef.current;
    if (activeCommandRef.current || s.loading) {
      throw new Error('Cannot reroll while another kernel command is running');
    }
    let handle: CommandHandle<GameEvent, TurnCommit> | null = null;
    try {
      const session = await getSession();
      const view = await session.projection.current();
      const turn = view.turns.at(-1);
      if (!turn) throw new Error('Cannot reroll an empty session');
      handle = session.turns.reroll({ turnId: turn.id });
      activeCommandRef.current = handle;
      const terminal = await consumeSessionHandle(handle, createLiveSink(handle.commandId));
      if (terminal.outcome === 'rejected') throw new Error(terminal.error.message);
    } catch (error) {
      recoverProjectionAfterCommandError();
      reportAppError({ source: '重试命令', error });
      throw error;
    } finally {
      if (activeCommandRef.current === handle) activeCommandRef.current = null;
    }
  }, [createLiveSink, getSession, recoverProjectionAfterCommandError]);

  const executeProjectedCommand = useCallback(async (
    start: (session: ISession) => CommandHandle<GameEvent, SessionCommit>,
  ): Promise<CommandId> => {
    const s = stateRef.current;
    if (activeCommandRef.current || s.loading) throw new Error('Another kernel command is running');
    let handle: CommandHandle<GameEvent, SessionCommit> | null = null;
    try {
      handle = start(await getSession());
      activeCommandRef.current = handle;
      const terminal = await consumeSessionHandle(handle, createLiveSink(handle.commandId));
      if (terminal.outcome === 'rejected') throw new Error(terminal.error.message);
      return handle.commandId;
    } catch (error) {
      recoverProjectionAfterCommandError();
      reportAppError({ source: '游戏命令', error });
      throw error;
    } finally {
      if (activeCommandRef.current === handle) activeCommandRef.current = null;
    }
  }, [createLiveSink, getSession, recoverProjectionAfterCommandError]);

  const handleRegenerateNarrativeImage = useCallback(async (messageId: string) => {
    await executeProjectedCommand((session) => session.media.regenerateNarrativeImage({ messageId }));
  }, [executeProjectedCommand]);

  const handleRetryJob = useCallback(async (job: JobProjection) => {
    await executeProjectedCommand((session) => session.jobs.retry({ jobId: job.id }));
  }, [executeProjectedCommand]);

  const handleCancelJob = useCallback(async (jobId: string) => {
    await executeProjectedCommand((session) => session.jobs.cancel({ jobId }));
  }, [executeProjectedCommand]);

  const handleSetPrimaryPath = useCallback(async (pathId: 命途ID) => {
    await executeProjectedCommand((session) => session.paths.setPrimary({ pathId }));
  }, [executeProjectedCommand]);

  const handleDeclinePathAwakening = useCallback(async () => {
    await executeProjectedCommand((session) => session.paths.declineAwakening());
  }, [executeProjectedCommand]);

  const handleEnterPathAwakening = useCallback(async () => {
    await executeProjectedCommand((session) => session.paths.enterAwakening());
  }, [executeProjectedCommand]);

  const handleEditMessageBody = useCallback(async (messageId: string, body: string) => {
    await executeProjectedCommand((session) => session.messages.editBody({ messageId, body }));
  }, [executeProjectedCommand]);

  const getCompanionPlanning = useCallback(async () => (await getSession()).companions.planning(), [getSession]);

  const handleSetCompanionTier = useCallback(async (npcId: string, tier: NPC阶位) => {
    await executeProjectedCommand((session) => session.companions.setTier({ npcId, tier }));
  }, [executeProjectedCommand]);

  const handleSetCompanionTraveling = useCallback(async (npcId: string, traveling: boolean) => {
    await executeProjectedCommand((session) => session.companions.setTraveling({ npcId, traveling }));
  }, [executeProjectedCommand]);

  const handleCompressMemory = useCallback(async (
    layer: 'immediate' | 'short' | 'middle',
    force: boolean,
  ) => {
    await executeProjectedCommand((session) => session.memory.compress({ layer, force }));
  }, [executeProjectedCommand]);

  const handleSetStoryMode = useCallback(async (mode: 剧情模式) => {
    await executeProjectedCommand((session) => session.world.setStoryMode({ mode }));
  }, [executeProjectedCommand]);

  const handleSaveSkill = useCallback(async (input: SkillSaveInput) => {
    await executeProjectedCommand((session) => session.skills.save(input));
  }, [executeProjectedCommand]);

  const handleGenerateSkillDraft = useCallback(async (input: SkillDraftGenerationInput) => {
    return (await getSession()).skills.generateDraft(input);
  }, [getSession]);

  const handleDeleteSkill = useCallback(async (skillId: string) => {
    await executeProjectedCommand((session) => session.skills.delete({ skillId }));
  }, [executeProjectedCommand]);

  const handleSetSkillEnabled = useCallback(async (skillId: string, enabled: boolean) => {
    await executeProjectedCommand((session) => session.skills.setEnabled({ skillId, enabled }));
  }, [executeProjectedCommand]);

  const handleUseInventoryItem = useCallback(async (itemId: string, count = 1) => {
    await executeProjectedCommand((session) => session.inventory.use({ itemId, count }));
  }, [executeProjectedCommand]);

  const handleDropInventoryItem = useCallback((itemId: string, count?: number) =>
    executeProjectedCommand((session) => session.inventory.drop({ itemId, count })),
  [executeProjectedCommand]);

  const handleUndoInventoryDrop = useCallback(async (dropCommandId: CommandId) => {
    await executeProjectedCommand((session) => session.inventory.undoDrop({ dropCommandId }));
  }, [executeProjectedCommand]);

  const handleCreateZhikuEntry = useCallback(async (draft: 智库条目草稿) => {
    const commandId = await executeProjectedCommand((session) => session.zhiku.create({ draft }));
    return `zhiku_${commandId}`;
  }, [executeProjectedCommand]);

  const handleUpdateZhikuEntry = useCallback(async (
    entryId: string,
    patch: Partial<Omit<智库条目, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>>,
  ) => {
    await executeProjectedCommand((session) => session.zhiku.update({ entryId, patch }));
  }, [executeProjectedCommand]);

  const handleDeleteZhikuEntry = useCallback(async (entryId: string) => {
    await executeProjectedCommand((session) => session.zhiku.delete({ entryId }));
  }, [executeProjectedCommand]);

  const handleRefreshBundledZhiku = useCallback(async () => {
    await executeProjectedCommand((session) => session.zhiku.refreshBundled());
  }, [executeProjectedCommand]);

  const handlePlotImportText = useCallback(async (input: { text: string; title: string; fileName?: string; chaptersPerSegment: number }) => {
    await executeProjectedCommand((session) => session.plot.importText(input));
  }, [executeProjectedCommand]);
  const handlePlotImportJson = useCallback(async (json: string) => {
    await executeProjectedCommand((session) => session.plot.importJson({ json }));
  }, [executeProjectedCommand]);
  const handlePlotRestoreBundled = useCallback(async () => {
    await executeProjectedCommand((session) => session.plot.restoreBundled());
  }, [executeProjectedCommand]);
  const handlePlotRenameSeries = useCallback(async (seriesId: string, title: string) => {
    await executeProjectedCommand((session) => session.plot.renameSeries({ seriesId, title }));
  }, [executeProjectedCommand]);
  const handlePlotRebuildSeries = useCallback(async (seriesId: string, chaptersPerSegment: number) => {
    await executeProjectedCommand((session) => session.plot.rebuildSeries({ seriesId, chaptersPerSegment }));
  }, [executeProjectedCommand]);
  const handlePlotToggleSeriesInjection = useCallback(async (seriesId: string) => {
    await executeProjectedCommand((session) => session.plot.toggleSeriesInjection({ seriesId }));
  }, [executeProjectedCommand]);
  const handlePlotSetCurrent = useCallback(async (seriesId: string, group: number) => {
    await executeProjectedCommand((session) => session.plot.setCurrent({ seriesId, group }));
  }, [executeProjectedCommand]);
  const handlePlotSetSegmentStatus = useCallback(async (seriesId: string, segmentId: string, status: 剧情编织运行状态) => {
    await executeProjectedCommand((session) => session.plot.setSegmentStatus({ seriesId, segmentId, status }));
  }, [executeProjectedCommand]);
  const handlePlotSaveSegment = useCallback(async (seriesId: string, segmentId: string, draft: StorySegmentDraftInput) => {
    await executeProjectedCommand((session) => session.plot.saveSegment({ seriesId, segmentId, draft }));
  }, [executeProjectedCommand]);
  const handlePlotDeleteSeries = useCallback(async (seriesId: string) => {
    await executeProjectedCommand((session) => session.plot.deleteSeries({ seriesId }));
  }, [executeProjectedCommand]);
  const handlePlotDecompose = useCallback(async (seriesId: string, segmentId: string) => {
    await executeProjectedCommand((session) => session.plot.decompose({ seriesId, segmentId }));
  }, [executeProjectedCommand]);
  const handlePlotDecomposeBatch = useCallback(async (seriesId: string, mode: 'pending' | 'from-current' | 'all') => {
    await executeProjectedCommand((session) => session.plot.decomposeBatch({ seriesId, mode }));
  }, [executeProjectedCommand]);

  const handleAlbumImportReference = useCallback(async (input: Omit<Extract<AlbumCommand, { type: 'album.import-reference' }>, 'type' | 'createdAt'>) => {
    const commandId = await executeProjectedCommand((session) => session.album.importReference(input));
    const view = await (await getSession()).projection.current();
    const assetIds = new Set(view.story.album.assets
      .filter((asset) => asset.contentHash === input.contentHash || asset.dataUrl === input.src || asset.url === input.src || asset.originalUrl === input.src)
      .map((asset) => asset.id));
    return view.story.album.entries.find((entry) =>
      assetIds.has(entry.assetId)
      && entry.targetType === (input.targetKind === 'traveler' ? 'traveler' : 'npc')
      && entry.targetId === input.targetId
      && entry.slot === 'misc')?.id ?? `album_${commandId}`;
  }, [executeProjectedCommand, getSession]);
  const handleAlbumSetReference = useCallback(async (entryId: string, characterId: string, enabled: boolean) => {
    await executeProjectedCommand((session) => session.album.setReference({ entryId, characterId, enabled }));
  }, [executeProjectedCommand]);
  const handleAlbumGenerate = useCallback(async (input: Omit<Extract<AlbumCommand, { type: 'album.generate' }>, 'type' | 'createdAt'>) => {
    const commandId = await executeProjectedCommand((session) => session.album.generate(input));
    const view = await (await getSession()).projection.current();
    const entryId = `album_${commandId}`;
    const taskId = `img_task_${commandId}`;
    const task = view.story.album.tasks.find((candidate) => candidate.id === taskId);
    if (!view.story.album.entries.some((entry) => entry.id === entryId) || !task) {
      throw new Error('图片生成已提交，但相册投影缺少生成结果。');
    }
    return { entryId, task };
  }, [executeProjectedCommand, getSession]);
  const handleAlbumBindSlot = useCallback(async (input: Omit<Extract<AlbumCommand, { type: 'album.bind-slot' }>, 'type'>) => {
    await executeProjectedCommand((session) => session.album.bindSlot(input));
  }, [executeProjectedCommand]);
  const handleAlbumDeleteEntries = useCallback(async (entryIds: readonly string[]) => {
    await executeProjectedCommand((session) => session.album.deleteEntries({ entryIds }));
  }, [executeProjectedCommand]);
  const handleAlbumImportArchive = useCallback(async (album: import('@/models/imageGeneration').相册系统) => {
    await executeProjectedCommand((session) => session.album.importArchive({ album }));
  }, [executeProjectedCommand]);
  const handleAlbumSetCharacterAnchor = useCallback(async (input: Omit<Extract<AlbumCommand, { type: 'album.set-character-anchor' }>, 'type' | 'updatedAt'>) => {
    await executeProjectedCommand((session) => session.album.setCharacterAnchor(input));
  }, [executeProjectedCommand]);
  const handleAlbumExtractCharacterAnchor = useCallback(async (input: Parameters<ISession['album']['extractCharacterAnchor']>[0]) => {
    return (await getSession()).album.extractCharacterAnchor(input);
  }, [getSession]);
  const handleAlbumTokenizePrompt = useCallback(async (input: Parameters<ISession['album']['tokenizePrompt']>[0]) => {
    return (await getSession()).album.tokenizePrompt(input);
  }, [getSession]);
  const handleAlbumParseScene = useCallback(async (input: Parameters<ISession['album']['parseScene']>[0]) => {
    return (await getSession()).album.parseScene(input);
  }, [getSession]);
  const handleAlbumParseStorySnapshot = useCallback(async (input: Parameters<ISession['album']['parseStorySnapshot']>[0]) => {
    return (await getSession()).album.parseStorySnapshot(input);
  }, [getSession]);
  const handlePhoneDismissSeed = useCallback(async (seedId: string) => { await executeProjectedCommand((session) => session.phone.dismissSeed({ seedId })); }, [executeProjectedCommand]);
  const handlePhoneMarkRead = useCallback(async (chatId: string) => { await executeProjectedCommand((session) => session.phone.markRead({ chatId })); }, [executeProjectedCommand]);
  const handlePhoneAddContact = useCallback(async (npcId: string) => { await executeProjectedCommand((session) => session.phone.addContact({ npcId })); }, [executeProjectedCommand]);
  const handlePhoneOpenPrivateChat = useCallback(async (npcId: string) => {
    const commandId = await executeProjectedCommand((session) => session.phone.openPrivateChat({ npcId }));
    const phone = (await (await getSession()).projection.current()).story.phone;
    return phone.chats.find((chat) => chat.type === 'private' && chat.participantIds.some((id) => id === npcId || id === `npc_${npcId}`))?.id ?? `phone_chat_${commandId}`;
  }, [executeProjectedCommand, getSession]);
  const handlePhoneCreateGroup = useCallback(async (npcIds: readonly string[], title: string) => {
    const commandId = await executeProjectedCommand((session) => session.phone.createGroup({ npcIds, title }));
    return `phone_chat_${commandId}`;
  }, [executeProjectedCommand]);
  const handlePhoneRenameGroup = useCallback(async (chatId: string, title: string) => { await executeProjectedCommand((session) => session.phone.renameGroup({ chatId, title })); }, [executeProjectedCommand]);
  const handlePhoneAddGroupMember = useCallback(async (chatId: string, npcId: string) => { await executeProjectedCommand((session) => session.phone.addGroupMember({ chatId, npcId })); }, [executeProjectedCommand]);
  const handlePhoneSetWallpaper = useCallback(async (slot: 'home' | 'chat', assetRef?: string) => { await executeProjectedCommand((session) => session.phone.setWallpaper({ slot, assetRef })); }, [executeProjectedCommand]);
  const handlePhoneSend = useCallback(async (chatId: string, text: string) => { await executeProjectedCommand((session) => session.phone.send({ chatId, text })); }, [executeProjectedCommand]);
  const handlePhoneGenerateSeed = useCallback(async (seedId: string) => {
    const commandId = await executeProjectedCommand((session) => session.phone.generateSeed({ seedId }));
    const phone = (await (await getSession()).projection.current()).story.phone;
    const seed = phone.messageSeeds.find((candidate) => candidate.id === seedId);
    if (!seed) throw new Error('主动来信提交后无法读取种子。');
    if (seed.targetType === 'group') return phone.chats.find((chat) => chat.id === seed.targetId)?.id ?? `phone_chat_${commandId}`;
    const npcId = seed.relatedNpcIds[0] ?? seed.targetId.replace(/^npc_/, '');
    return phone.chats.find((chat) => chat.type === 'private' && chat.participantIds.some((id) => id === npcId || id === `npc_${npcId}`))?.id ?? `phone_chat_${commandId}`;
  }, [executeProjectedCommand, getSession]);

  const handleRestartOpening = useCallback(async () => {
    const s = stateRef.current;
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
      '[系统] 开启第 0 回合',
    );
  }, [handleStartSession]);

  const getContextSnapshot = useCallback(async (kind?: ContextSnapshotKind): Promise<ContextSnapshot> => {
    return (await getSession()).inspection.contextSnapshot(kind);
  }, [getSession]);

  const actions = useMemo(() => ({
    handleSend,
    handleOpeningTrigger,
    handleAbort,
    handleNewGame,
    handleContinue,
    handleGoHome,
    handleSave,
    handleLoadSave,
    handleReroll,
    handleRegenerateNarrativeImage,
    handleRetryJob,
    handleCancelJob,
    handleSetPrimaryPath,
    handleDeclinePathAwakening,
    handleEnterPathAwakening,
    handleEditMessageBody,
    getCompanionPlanning,
    handleSetCompanionTier,
    handleSetCompanionTraveling,
    handleCompressMemory,
    handleSetStoryMode,
    handleSaveSkill,
    handleGenerateSkillDraft,
    handleDeleteSkill,
    handleSetSkillEnabled,
    handleUseInventoryItem,
    handleDropInventoryItem,
    handleUndoInventoryDrop,
    handleCreateZhikuEntry,
    handleUpdateZhikuEntry,
    handleDeleteZhikuEntry,
    handleRefreshBundledZhiku,
    handlePlotImportText,
    handlePlotImportJson,
    handlePlotRestoreBundled,
    handlePlotRenameSeries,
    handlePlotRebuildSeries,
    handlePlotToggleSeriesInjection,
    handlePlotSetCurrent,
    handlePlotSetSegmentStatus,
    handlePlotSaveSegment,
    handlePlotDeleteSeries,
    handlePlotDecompose,
    handlePlotDecomposeBatch,
    handleAlbumImportReference,
    handleAlbumSetReference,
    handleAlbumGenerate,
    handleAlbumBindSlot,
    handleAlbumDeleteEntries,
    handleAlbumImportArchive,
    handleAlbumSetCharacterAnchor,
    handleAlbumExtractCharacterAnchor,
    handleAlbumTokenizePrompt,
    handleAlbumParseScene,
    handleAlbumParseStorySnapshot,
    handlePhoneDismissSeed,
    handlePhoneMarkRead,
    handlePhoneAddContact,
    handlePhoneOpenPrivateChat,
    handlePhoneCreateGroup,
    handlePhoneRenameGroup,
    handlePhoneAddGroupMember,
    handlePhoneSetWallpaper,
    handlePhoneSend,
    handlePhoneGenerateSeed,
    handleRestartOpening,
    handleStartSession,
    getContextSnapshot,
  }), [
    handleSend,
    handleOpeningTrigger,
    handleAbort,
    handleNewGame,
    handleContinue,
    handleGoHome,
    handleSave,
    handleLoadSave,
    handleReroll,
    handleRegenerateNarrativeImage,
    handleRetryJob,
    handleCancelJob,
    handleSetPrimaryPath,
    handleDeclinePathAwakening,
    handleEnterPathAwakening,
    handleEditMessageBody,
    getCompanionPlanning,
    handleSetCompanionTier,
    handleSetCompanionTraveling,
    handleCompressMemory,
    handleSetStoryMode,
    handleSaveSkill,
    handleGenerateSkillDraft,
    handleDeleteSkill,
    handleSetSkillEnabled,
    handleUseInventoryItem,
    handleDropInventoryItem,
    handleUndoInventoryDrop,
    handleCreateZhikuEntry,
    handleUpdateZhikuEntry,
    handleDeleteZhikuEntry,
    handleRefreshBundledZhiku,
    handlePlotImportText,
    handlePlotImportJson,
    handlePlotRestoreBundled,
    handlePlotRenameSeries,
    handlePlotRebuildSeries,
    handlePlotToggleSeriesInjection,
    handlePlotSetCurrent,
    handlePlotSetSegmentStatus,
    handlePlotSaveSegment,
    handlePlotDeleteSeries,
    handlePlotDecompose,
    handlePlotDecomposeBatch,
    handleAlbumImportReference,
    handleAlbumSetReference,
    handleAlbumGenerate,
    handleAlbumBindSlot,
    handleAlbumDeleteEntries,
    handleAlbumImportArchive,
    handleAlbumSetCharacterAnchor,
    handleAlbumExtractCharacterAnchor,
    handleAlbumTokenizePrompt,
    handleAlbumParseScene,
    handleAlbumParseStorySnapshot,
    handlePhoneDismissSeed,
    handlePhoneMarkRead,
    handlePhoneAddContact,
    handlePhoneOpenPrivateChat,
    handlePhoneCreateGroup,
    handlePhoneRenameGroup,
    handlePhoneAddGroupMember,
    handlePhoneSetWallpaper,
    handlePhoneSend,
    handlePhoneGenerateSeed,
    handleRestartOpening,
    handleStartSession,
    getContextSnapshot,
  ]);

  return {
    state,
    actions,
  };
}

async function consumeSessionHandle<Result>(
  handle: CommandHandle<GameEvent, Result>,
  sink: ExecutionSink,
): Promise<CommandTerminal<Result>> {
  const unsubscribe = handle.events.subscribe((event) => {
    if (sink.applyEvent) {
      sink.applyEvent(event);
      return;
    }
    switch (event.type) {
      case 'command.accepted':
        return;
      case 'turn.prepared':
        sink.showPrepared(event.view);
        return;
      case 'stage.changed':
        sink.showStage(event.stage);
        return;
      case 'stage.retrying':
        sink.showRetry(event.stage, event.attempt, event.limit);
        return;
      case 'assistant.ready':
        sink.showAssistant(event.message);
        return;
      case 'narrative.delta':
        sink.showProgress({ kind: 'narrative', text: event.text });
        return;
      case 'command.committed':
        sink.replaceProjection(event.view);
        return;
      case 'command.rejected':
        sink.showError(event.error);
        return;
      default: {
        const exhaustive: never = event;
        throw new Error(`Unknown session event: ${String((exhaustive as { type: string }).type)}`);
      }
    }
  });
  try {
    return await handle.result;
  } finally {
    unsubscribe();
  }
}

/** Single bridge: projection progress → streaming message store. */
function syncStreamFromProjection(projection: ProjectionState): void {
  setStreamingMessage(projectionNarrativeText(projection));
}

/** React chrome only — stream text is owned by projection + syncStreamFromProjection. */
function clearEphemeralUi(state: UseGameStateReturn): void {
  state.setInterruptedWorkflow(null);
}
