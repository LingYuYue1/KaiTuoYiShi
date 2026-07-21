/**
 * KernelSessionDirectory — the SessionDirectory/ISession implementation
 * (IKernelIdealRefactorPlan §3).
 *
 * ISession owns command identity, revision bookkeeping, envelope
 * construction, and cancellation routing. Components can no longer assemble
 * envelopes: they call typed use cases and receive CommandHandles.
 *
 * All state-changing methods delegate to the single private CommandRunner.
 */

import type {
  CommandId,
  Revision,
  SessionId,
  SessionView,
} from '@/src/kernel/contract';
import type { CommandExecutor } from './CommandExecutor';
import { asCommandId } from '@/src/kernel/contract';
import type {
  CommandHandle,
  CompanionPlanningProjection,
  CompanionUseCases,
  GameEvent,
  ISession,
  InventoryUseCases,
  MediaUseCases,
  SessionJobUseCases,
  MemoryUseCases,
  MessageUseCases,
  PathUseCases,
  SessionCommit,
  SessionDirectory,
  SessionLifecycleUseCases,
  SessionInspectionUseCases,
  SkillUseCases,
  SessionProjectionReader,
  TurnCommit,
  TurnUseCases,
  WorldUseCases,
  StoryPolicyUseCases,
  ZhikuUseCases,
  PlotUseCases,
  AlbumUseCases,
  PhoneUseCases,
} from '@/src/kernel/contract/session';
import { createStoryState, type NewStorySeed, type StoryState } from '@/src/kernel/domain/session/storyState';
import { CommandRunner } from './CommandRunner';
import { buildNpcRelationshipPlanning } from '@/src/kernel/domain/npc/npcRelationshipPlanning';
import type { ExecutionContextProvider } from '@/src/kernel/ports/ExecutionContextProvider';
import type { SkillDraftGenerator } from '@/src/kernel/ports/SkillDraftGenerator';
import type { ContextSnapshotBuilder } from '@/src/kernel/ports/ContextSnapshotBuilder';
import type { AlbumAuthoring } from '@/src/kernel/ports/AlbumAuthoring';
import type { Clock } from '@/src/kernel/ports/Clock';
import type { IdGenerator } from '@/src/kernel/ports/IdGenerator';
import { resolveCommandSettings } from './turn/turnExecutionState';

export class KernelSessionDirectory implements SessionDirectory {
  private readonly runner: CommandRunner;
  private readonly projections = new SessionProjectionHub();

  constructor(
    private readonly kernel: CommandExecutor,
    private readonly context: ExecutionContextProvider,
    private readonly skillDraftGenerator: SkillDraftGenerator,
    private readonly contextSnapshotBuilder: ContextSnapshotBuilder,
    private readonly albumAuthoring: AlbumAuthoring,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {
    this.runner = new CommandRunner(kernel);
    kernel.subscribeCommitted((commit) => this.projections.publish(commit));
  }

  exists(sessionId: SessionId): Promise<boolean> {
    return this.kernel
      .read({ type: 'session.exists', sessionId })
      .then((view) => view.exists);
  }

  readStory(sessionId: SessionId): Promise<StoryState> {
    return this.kernel.readStory(sessionId);
  }

  async open(sessionId: SessionId): Promise<ISession> {
    const existence = await this.kernel.read({ type: 'session.exists', sessionId });
    if (!existence.exists) throw new Error(`Session not found: ${sessionId}`);
    return new KernelSession(sessionId, this.kernel, this.runner, this.context, this.skillDraftGenerator, this.contextSnapshotBuilder, this.albumAuthoring, this.clock, this.ids, this.projections);
  }

  create(sessionId: SessionId, seed: NewStorySeed): CommandHandle<GameEvent, SessionCommit> {
    const story = createStoryState(seed);
    return this.runner.run(
      {
        protocolVersion: 1,
        commandId: this.commandId(),
        sessionId,
        command: { type: 'session.create', story },
      },
      (view, revision) => ({ revision: revision as Revision, view }),
    );
  }

  private replace(sessionId: SessionId, story: StoryState): CommandHandle<GameEvent, SessionCommit> {
    return deferredHandle(
      () => this.commandId(),
      () => this.kernel.read({ type: 'session.read', sessionId }).then((view) => view.revision),
      (expectedRevision, commandId) =>
        this.runner.run(
          {
            protocolVersion: 1,
            commandId,
            sessionId,
            expectedRevision,
            command: { type: 'session.reset', story },
          },
          (view, revision) => ({ revision: revision as Revision, view }),
        ),
    );
  }

  async restore(sessionId: SessionId, story: StoryState): Promise<CommandHandle<GameEvent, SessionCommit>> {
    if (!await this.exists(sessionId)) {
      return this.runner.run(
        {
          protocolVersion: 1,
          commandId: this.commandId(),
          sessionId,
          command: { type: 'session.create', story },
        },
        (view, revision) => ({ revision: revision as Revision, view }),
      );
    }
    return this.replace(sessionId, story);
  }

  private commandId(): CommandId {
    return asCommandId(this.ids.next('command'));
  }

}

class KernelSession implements ISession {
  readonly projection: SessionProjectionReader;
  readonly turns: TurnUseCases;
  readonly media: MediaUseCases;
  readonly jobs: SessionJobUseCases;
  readonly paths: PathUseCases;
  readonly messages: MessageUseCases;
  readonly companions: CompanionUseCases;
  readonly memory: MemoryUseCases;
  readonly world: WorldUseCases;
  readonly policy: StoryPolicyUseCases;
  readonly skills: SkillUseCases;
  readonly inventory: InventoryUseCases;
  readonly zhiku: ZhikuUseCases;
  readonly plot: PlotUseCases;
  readonly album: AlbumUseCases;
  readonly phone: PhoneUseCases;
  readonly lifecycle: SessionLifecycleUseCases;
  readonly inspection: SessionInspectionUseCases;
  private activeHandle: CommandHandle<GameEvent, unknown> | null = null;

  constructor(
    readonly id: SessionId,
    private readonly kernel: CommandExecutor,
    private readonly runner: CommandRunner,
    private readonly context: ExecutionContextProvider,
    private readonly skillDraftGenerator: SkillDraftGenerator,
    private readonly contextSnapshotBuilder: ContextSnapshotBuilder,
    private readonly albumAuthoring: AlbumAuthoring,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly projections: SessionProjectionHub,
  ) {
    this.projection = {
      current: () => this.kernel.read({ type: 'session.read', sessionId: this.id }),
      subscribe: (listener) => this.projections.subscribe(this.id, listener),
      resync: () => this.kernel.read({ type: 'session.read', sessionId: this.id }),
    };

    this.turns = {
      advance: (input) => this.track(this.sessionCommand<TurnCommit>({
        type: 'turn.advance',
        input: { text: input.text, createdAt: this.clock.now() },
      })),
      reroll: (input) => this.track(this.sessionCommand<TurnCommit>({
        type: 'turn.reroll',
        turnId: input.turnId,
        createdAt: this.clock.now(),
      })),
    };

    this.media = {
      regenerateNarrativeImage: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'message.image.regenerate',
        messageId: input.messageId,
      })),
    };

    this.jobs = {
      list: async () => (await this.projection.current()).jobs,
      retry: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'job.retry',
        jobId: input.jobId,
        availableAt: this.clock.now(),
      })),
      cancel: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'job.cancel',
        jobId: input.jobId,
        reason: input.reason ?? 'Cancelled by User',
        cancelledAt: this.clock.now(),
      })),
    };

    this.paths = {
      setPrimary: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'path.set-primary',
        pathId: input.pathId,
      })),
      enterAwakening: () => this.track(this.sessionCommand<TurnCommit>({
        type: 'path.awakening.enter',
        createdAt: this.clock.now(),
      })),
      declineAwakening: () => this.track(this.sessionCommand<SessionCommit>({
        type: 'path.awakening.decline',
      })),
    };

    this.messages = {
      editBody: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'message.edit-body',
        messageId: input.messageId,
        body: input.body,
      })),
    };

    this.companions = {
      planning: async () => {
        const view = await this.projection.current();
        const planning = buildNpcRelationshipPlanning(view.story.characters.npcs, view.story.conversation.turnCount);
        return {
          summary: planning.总览,
          entries: planning.条目.map((entry) => ({
            npcId: entry.npcId,
            name: entry.姓名,
            relationship: entry.关系,
            affinity: entry.好感度,
            traveling: entry.同行,
            priority: entry.优先级,
            suggestedAction: entry.建议动作,
            reasons: entry.理由,
            focusPoints: entry.关注点,
          })),
        } satisfies CompanionPlanningProjection;
      },
      setTier: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'companion.set-tier',
        npcId: input.npcId,
        tier: input.tier,
      })),
      setTraveling: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'companion.set-traveling',
        npcId: input.npcId,
        traveling: input.traveling,
      })),
    };

    this.memory = {
      compress: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'memory.compress',
        layer: input.layer,
        force: input.force,
      })),
    };

    this.world = {
      setStoryMode: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'world.set-story-mode',
        mode: input.mode,
      })),
    };

    this.policy = {
      replace: (policy) => this.track(this.sessionCommand<SessionCommit>({ type: 'story-policy.replace', policy })),
    };

    this.skills = {
      generateDraft: async (input) => {
        const [view, overlay] = await Promise.all([
          this.projection.current(),
          this.context.captureDeviceOverlay(),
        ]);
        const activeId = overlay.apiSettings.activeConfigId;
        if (!activeId) throw new Error('请先在设置中选择主剧情 API。');
        const config = overlay.apiSettings.configs.find((candidate) => candidate.id === activeId);
        if (!config) throw new Error(`找不到主剧情 API 配置：${activeId}`);
        return this.skillDraftGenerator.generate(
          { ...config, enableClaudeMode: overlay.executionPolicy.enableClaudeMode === true },
          view.story.traveler,
          input,
        );
      },
      save: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'skill.save',
        skillId: input.skillId,
        slot: input.slot,
        draft: input.draft,
        createdAt: this.clock.now(),
      })),
      delete: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'skill.delete',
        skillId: input.skillId,
      })),
      setEnabled: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'skill.set-enabled',
        skillId: input.skillId,
        enabled: input.enabled,
        updatedAt: this.clock.now(),
      })),
    };

    this.inventory = {
      use: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'inventory.use',
        itemId: input.itemId,
        count: input.count ?? 1,
      })),
      drop: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'inventory.drop',
        itemId: input.itemId,
        count: input.count,
      })),
      undoDrop: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'inventory.undo-drop',
        dropCommandId: input.dropCommandId,
      })),
    };

    this.zhiku = {
      create: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'zhiku.create',
        draft: input.draft,
        createdAt: this.clock.now(),
      })),
      update: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'zhiku.update',
        entryId: input.entryId,
        patch: input.patch,
        updatedAt: this.clock.now(),
      })),
      delete: (input) => this.track(this.sessionCommand<SessionCommit>({
        type: 'zhiku.delete',
        entryId: input.entryId,
      })),
      refreshBundled: () => this.track(this.sessionCommand<SessionCommit>({
        type: 'zhiku.refresh-bundled',
        cacheBust: this.clock.now(),
      })),
    };

    this.plot = {
      importText: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.import-text', ...input })),
      importJson: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.import-json', ...input })),
      restoreBundled: () => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.restore-bundled' })),
      renameSeries: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.rename-series', ...input, updatedAt: this.clock.now() })),
      rebuildSeries: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.rebuild-series', ...input })),
      toggleSeriesInjection: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.toggle-series-injection', ...input, updatedAt: this.clock.now() })),
      setCurrent: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.set-current', ...input, updatedAt: this.clock.now() })),
      setSegmentStatus: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.set-segment-status', ...input, updatedAt: this.clock.now() })),
      saveSegment: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.save-segment', ...input, updatedAt: this.clock.now() })),
      deleteSeries: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.delete-series', ...input })),
      decompose: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.decompose', ...input })),
      decomposeBatch: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'plot.decompose-batch', ...input })),
    };

    this.album = {
      importReference: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'album.import-reference', ...input, createdAt: this.clock.now() })),
      setReference: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'album.set-reference', ...input })),
      bindSlot: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'album.bind-slot', ...input })),
      deleteEntries: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'album.delete-entries', ...input })),
      importArchive: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'album.import-archive', ...input })),
      setCharacterAnchor: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'album.set-character-anchor', ...input, updatedAt: this.clock.now() })),
      generate: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'album.generate', ...input, createdAt: this.clock.now() })),
      extractCharacterAnchor: async (input) => this.albumAuthoring.extractCharacterAnchor(
        await this.commandSettings(),
        input,
      ),
      tokenizePrompt: async (input) => this.albumAuthoring.tokenizePrompt(
        await this.commandSettings(),
        input,
      ),
      parseScene: async (input) => this.albumAuthoring.parseScene(
        await this.commandSettings(),
        input,
      ),
      parseStorySnapshot: async (input) => this.albumAuthoring.parseStorySnapshot(
        await this.commandSettings(),
        input,
      ),
    };

    this.phone = {
      dismissSeed: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.dismiss-seed', ...input })),
      markRead: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.mark-read', ...input })),
      addContact: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.add-contact', ...input, updatedAt: this.clock.now() })),
      openPrivateChat: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.open-private-chat', ...input, createdAt: this.clock.now() })),
      createGroup: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.create-group', ...input, createdAt: this.clock.now() })),
      renameGroup: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.rename-group', ...input, updatedAt: this.clock.now() })),
      addGroupMember: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.add-group-member', ...input, updatedAt: this.clock.now() })),
      setWallpaper: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.set-wallpaper', ...input })),
      send: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.send', ...input, createdAt: this.clock.now() })),
      generateSeed: (input) => this.track(this.sessionCommand<SessionCommit>({ type: 'phone.generate-seed', ...input, createdAt: this.clock.now() })),
    };

    this.lifecycle = {
      restart: (seed) => this.track(this.sessionCommand<SessionCommit>({
        type: 'session.reset',
        story: createStoryState(seed),
      })),
    };

    this.inspection = {
      contextSnapshot: async (kind) => {
        const [story, overlay] = await Promise.all([
          this.kernel.readStory(this.id),
          this.context.captureDeviceOverlay(),
        ]);
        return this.contextSnapshotBuilder.build(story, overlay, kind);
      },
    };
  }

  async close(options: Readonly<{ activeCommand: 'detach' | 'cancel-and-wait' }>): Promise<void> {
    const active = this.activeHandle;
    this.activeHandle = null;
    if (options.activeCommand === 'cancel-and-wait' && active) {
      await active.cancelAndWait();
    }
    // 'detach' releases the presentation handle without touching command state.
  }

  private async commandSettings() {
    const [story, overlay] = await Promise.all([this.kernel.readStory(this.id), this.context.captureDeviceOverlay()]);
    return resolveCommandSettings(story, overlay);
  }

  /** Build a session-scoped envelope with fresh command identity + revision. */
  private sessionCommand<Result extends { revision: Revision; view: SessionView }>(
    command:
      | { type: 'turn.advance'; input: { text: string; createdAt: number } }
      | { type: 'turn.reroll'; turnId: string; createdAt: number }
      | { type: 'session.reset'; story: StoryState }
      | { type: 'message.image.regenerate'; messageId: string }
      | { type: 'job.retry'; jobId: string; availableAt: number }
      | { type: 'job.cancel'; jobId: string; reason: string; cancelledAt: number }
      | { type: 'path.set-primary'; pathId: import('@/models/journey').命途ID }
      | { type: 'path.awakening.enter'; createdAt: number }
      | { type: 'path.awakening.decline' }
      | { type: 'message.edit-body'; messageId: string; body: string }
      | { type: 'companion.set-tier'; npcId: string; tier: import('@/models/npc').NPC阶位 }
      | { type: 'companion.set-traveling'; npcId: string; traveling: boolean }
      | { type: 'memory.compress'; layer: 'immediate' | 'short' | 'middle'; force: boolean }
      | { type: 'world.set-story-mode'; mode: import('@/models/journey').剧情模式 }
      | { type: 'story-policy.replace'; policy: import('@/models/settingsPlanes').StoryPolicy }
      | { type: 'skill.save'; skillId?: string; slot: { kind: 'normal' | 'path'; index: number; pathId?: import('@/models/journey').命途ID; pathStage?: import('@/models/path').命途阶段 }; draft: import('@/src/kernel/contract').SkillDraftInput; createdAt: number }
      | { type: 'skill.delete'; skillId: string }
      | { type: 'skill.set-enabled'; skillId: string; enabled: boolean; updatedAt: number }
      | { type: 'inventory.use'; itemId: string; count: number }
      | { type: 'inventory.drop'; itemId: string; count?: number }
      | { type: 'inventory.undo-drop'; dropCommandId: CommandId }
      | { type: 'zhiku.create'; draft: import('@/models/zhiku').智库条目草稿; createdAt: number }
      | { type: 'zhiku.update'; entryId: string; patch: Partial<Omit<import('@/models/zhiku').智库条目, 'id' | 'builtin' | 'createdAt' | 'updatedAt'>>; updatedAt: number }
      | { type: 'zhiku.delete'; entryId: string }
      | { type: 'zhiku.refresh-bundled'; cacheBust: number }
      | import('@/src/kernel/contract').PlotCommand
      | import('@/src/kernel/contract').AlbumCommand
      | import('@/src/kernel/contract').PhoneCommand,
  ): CommandHandle<GameEvent, Result> {
    return deferredHandle(
      () => asCommandId(this.ids.next('command')),
      () => this.kernel.read({ type: 'session.read', sessionId: this.id }).then((view) => view.revision),
      (expectedRevision, commandId) =>
        this.runner.run(
          {
            protocolVersion: 1,
            commandId,
            sessionId: this.id,
            expectedRevision,
            command,
          },
          (view, revision) => ({ revision: revision as Revision, view } as Result),
        ),
    );
  }

  private track<Result>(handle: CommandHandle<GameEvent, Result>): CommandHandle<GameEvent, Result> {
    this.activeHandle = handle as CommandHandle<GameEvent, unknown>;
    void handle.result.finally(() => {
      if (this.activeHandle === handle) this.activeHandle = null;
    });
    return handle;
  }
}

class SessionProjectionHub {
  private readonly listeners = new Map<string, Set<(commit: ProjectionCommit) => void>>();

  subscribe(sessionId: SessionId, listener: (commit: ProjectionCommit) => void): () => void {
    const key = String(sessionId);
    const listeners = this.listeners.get(key) ?? new Set<(commit: ProjectionCommit) => void>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }

  publish(commit: ProjectionCommit): void {
    for (const listener of this.listeners.get(String(commit.view.sessionId)) ?? []) listener(commit);
  }
}

type ProjectionCommit = Parameters<Parameters<CommandExecutor['subscribeCommitted']>[0]>[0];

// ── Helpers ──

/**
 * Wrap an async prologue (revision read) into an eager CommandHandle.
 *
 * Identity is allocated ONCE before the prologue and used for both the public
 * handle and the kernel envelope — consumers never observe two IDs for one
 * command. cancelAndWait before the prologue resolves records intent and
 * cancels the real command the moment it starts.
 */
function deferredHandle<Result>(
  allocateId: () => CommandId,
  prologue: () => Promise<Revision>,
  start: (expectedRevision: Revision, commandId: CommandId) => CommandHandle<GameEvent, Result>,
): CommandHandle<GameEvent, Result> {
  const commandId = allocateId();
  const listeners = new Set<(event: GameEvent) => void>();
  let inner: CommandHandle<GameEvent, Result> | null = null;
  let cancelRequested = false;

  const result = (async (): Promise<Awaited<CommandHandle<GameEvent, Result>['result']>> => {
    try {
      const revision = await prologue();
      const handle = start(revision, commandId);
      inner = handle;
      for (const listener of listeners) handle.events.subscribe(listener);
      listeners.clear();
      if (cancelRequested) {
        return await handle.cancelAndWait();
      }
      return await handle.result;
    } catch (error) {
      return {
        outcome: 'rejected' as const,
        error: { code: 'unknown' as const, message: error instanceof Error ? error.message : String(error) },
      };
    }
  })();

  return {
    commandId,
    events: {
      subscribe(listener) {
        if (inner) return inner.events.subscribe(listener);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      async *[Symbol.asyncIterator]() {
        // Bridge through a subscription so pre-start attachment works and
        // detaching (return) never cancels the command.
        const queue: GameEvent[] = [];
        let wake: (() => void) | null = null;
        let ended = false;
        const unsubscribe = (inner ?? { events: { subscribe: (l: (event: GameEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } } }).events.subscribe((event: GameEvent) => {
          queue.push(event);
          wake?.();
        });
        void result.finally(() => {
          ended = true;
          wake?.();
        });
        try {
          for (;;) {
            const item = queue.shift();
            if (item !== undefined) {
              yield item;
              continue;
            }
            if (ended) return;
            await new Promise<void>((resolve) => {
              wake = resolve;
            });
            wake = null;
          }
        } finally {
          unsubscribe();
        }
      },
    },
    result,
    cancelAndWait: async () => {
      cancelRequested = true;
      if (inner) return inner.cancelAndWait();
      // Prologue still running: the flag routes cancellation the moment the
      // real command starts; result settles with the cancelled terminal.
      return result;
    },
  };
}
