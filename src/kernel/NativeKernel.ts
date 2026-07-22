import type {
  CommandId,
  CommandEnvelope,
  CreateSessionEnvelope,
  ExecutionFrame,
  KernelQuery,
  QueryResult,
  SessionCommandEnvelope,
  SessionId,
  SessionExistenceView,
  SessionExistsQuery,
  SessionReadQuery,
  SessionView,
} from '@/src/kernel/contract';
import type { CommandExecutor } from '@/src/kernel/application/CommandExecutor';
import type { SessionRepository } from '@/src/kernel/ports';
import type { ContentResolver } from '@/src/kernel/ports';
import type { StoryWeavingProcessor } from '@/src/kernel/ports';
import type { AlbumImageGenerator } from '@/src/kernel/ports';
import type { AlbumAuthoring } from '@/src/kernel/ports';
import type { PhoneReplyGenerator } from '@/src/kernel/ports';
import type { Clock } from '@/src/kernel/ports/Clock';
import type { IdGenerator } from '@/src/kernel/ports/IdGenerator';
import type { ExecutionContextProvider } from '@/src/kernel/ports/ExecutionContextProvider';
import { executeTurn, executeTurnText } from '@/src/kernel/application/executeTurn';
import { rerollTurn } from '@/src/kernel/application/rerollTurn';
import { resetSession } from '@/src/kernel/application/resetSession';
import { regenerateNarrativeImage } from '@/src/kernel/application/executeRuntimeAction';
import { declineSessionPathAwakening, setSessionPrimaryPath } from '@/src/kernel/application/executePathCommand';
import { editSessionMessageBody } from '@/src/kernel/application/editMessageBody';
import { setCompanionTier, setCompanionTraveling } from '@/src/kernel/application/executeCompanionCommand';
import { compressSessionMemory } from '@/src/kernel/application/compressSessionMemory';
import { setSessionStoryMode } from '@/src/kernel/application/setStoryMode';
import { deleteSessionSkill, saveSessionSkill, setSessionSkillEnabled } from '@/src/kernel/application/executeSkillCommand';
import { dropSessionInventoryItem, undoSessionInventoryDrop, useSessionInventoryItem } from '@/src/kernel/application/executeInventoryCommand';
import { createZhikuEntry, deleteZhikuEntry, refreshBundledZhiku, updateZhikuEntry } from '@/src/kernel/application/executeZhikuCommand';
import { executePlotCommand } from '@/src/kernel/application/executePlotCommand';
import { executeAlbumCommand } from '@/src/kernel/application/executeAlbumCommand';
import { executePhoneCommand } from '@/src/kernel/application/executePhoneCommand';
import { executeJobCommand } from '@/src/kernel/application/executeJobCommand';
import { executeDurableJob, executeJobLifecycleCommand } from '@/src/kernel/application/executeDurableJob';
import { replaceStoryPolicy } from '@/src/kernel/application/replaceStoryPolicy';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';
import { fingerprintCommand } from '@/src/kernel/domain/session/commandFingerprint';
import type { CommittedProjection } from '@/src/kernel/application/CommandExecutor';
import type { KernelLogger } from '@/src/kernel/ports/KernelLogger';

export type NativeKernelDependencies = Readonly<{
  sessions: SessionRepository;
  context: ExecutionContextProvider;
  content: ContentResolver;
  storyWeaving: StoryWeavingProcessor;
  albumAuthoring: AlbumAuthoring;
  albumImages: AlbumImageGenerator;
  phoneReplies: PhoneReplyGenerator;
  clock: Clock;
  ids: IdGenerator;
  logger: KernelLogger;
}>;

/** The only runtime kernel. Every dependency is mandatory and every call is async. */
export class NativeKernel implements CommandExecutor {
  private readonly running = new Map<string, {
    controller: AbortController;
    settled: Promise<void>;
    resolveSettled: () => void;
  }>();
  private readonly activeSessionCommands = new Map<string, ActiveCommandOwner>();
  private readonly scheduledJobDrains = new Set<string>();
  private readonly jobRunnerId: string;
  private readonly commitListeners = new Set<(commit: CommittedProjection) => void>();
  private readonly logger: KernelLogger;

  async readStory(sessionId: SessionId) {
    return structuredClone((await this.dependencies.sessions.read(sessionId)).state.story);
  }

  constructor(private readonly dependencies: NativeKernelDependencies) {
    this.jobRunnerId = dependencies.ids.next('job-runner');
    this.logger = dependencies.logger;
  }

  async *execute(envelope: CommandEnvelope): AsyncIterable<ExecutionFrame> {
    for await (const frame of this.executeLocked(envelope)) {
      if (frame.type === 'committed') {
        for (const listener of this.commitListeners) listener({ view: frame.view, cause: envelope.command.type });
        if ('expectedRevision' in envelope && envelope.command.type === 'job.cancel') {
          this.logger.write({
            level: 'info', scope: 'kernel.durable-job', event: 'cancelled',
            data: { jobId: envelope.command.jobId, commandId: String(envelope.commandId) },
          });
        }
      }
      if (frame.type === 'rejected' && frame.error.code === 'cancelled') {
        this.logger.write({
          level: 'info', scope: 'kernel.command', event: 'cancelled',
          data: { commandId: String(envelope.commandId), sessionId: String(envelope.sessionId), command: envelope.command.type },
        });
      }
      yield frame;
    }
  }

  subscribeCommitted(listener: (commit: CommittedProjection) => void): () => void {
    this.commitListeners.add(listener);
    return () => this.commitListeners.delete(listener);
  }

  private async *executeLocked(envelope: CommandEnvelope): AsyncIterable<ExecutionFrame> {
    const controller = new AbortController();
    const commandKey = String(envelope.commandId);
    const sessionKey = String(envelope.sessionId);
    if (this.running.has(commandKey)) throw new Error(`Command is already running: ${commandKey}`);
    const owner = commandOwner(envelope);
    const activeOwner = this.activeSessionCommands.get(sessionKey);
    if (activeOwner) {
      if (canPreempt(envelope, activeOwner)) {
        this.logger.write({
          level: 'info', scope: 'kernel.durable-job', event: 'cancel.requested',
          data: { jobId: activeOwner.jobId, commandId: String(activeOwner.commandId) },
        });
        this.activeSessionCommands.set(sessionKey, owner);
        try {
          await this.cancelAndWait(activeOwner.commandId);
        } catch (error) {
          if (this.activeSessionCommands.get(sessionKey) === owner) this.activeSessionCommands.delete(sessionKey);
          throw error;
        }
      } else {
        yield {
          type: 'rejected',
          commandId: envelope.commandId,
          error: {
            code: 'command_in_progress',
            message: `Session already has an active command: ${activeOwner.commandId}`,
          },
        };
        return;
      }
    }
    let resolveSettled!: () => void;
    const settled = new Promise<void>((resolve) => { resolveSettled = resolve; });
    this.running.set(commandKey, { controller, settled, resolveSettled });
    this.activeSessionCommands.set(sessionKey, owner);
    try {
      yield { type: 'accepted', commandId: envelope.commandId };
      if (!('expectedRevision' in envelope)) {
        yield await this.createSession(envelope);
        return;
      }

      const command: SessionCommandEnvelope = envelope;
      switch (command.command.type) {
        case 'session.reset':
          yield* resetSession({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'message.image.regenerate':
          yield* regenerateNarrativeImage({ ...command, command: command.command }, {
            sessions: this.dependencies.sessions,
            clock: this.dependencies.clock,
          });
          return;
        case 'job.retry':
        case 'job.cancel':
          yield* executeJobCommand({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'job.recover':
        case 'job.claim-next':
        case 'job.start':
          yield* executeJobLifecycleCommand({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'job.execute':
          yield* executeDurableJob({ ...command, command: command.command }, {
            sessions: this.dependencies.sessions,
            context: this.dependencies.context,
            clock: this.dependencies.clock,
            albumAuthoring: this.dependencies.albumAuthoring,
            albumImages: this.dependencies.albumImages,
            ids: this.dependencies.ids,
            signal: controller.signal,
            logger: this.logger,
          });
          return;
        case 'path.set-primary':
          yield* setSessionPrimaryPath({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'path.awakening.decline':
          yield* declineSessionPathAwakening({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'path.awakening.enter':
          yield* executeTurnText(
            { ...command, command: command.command },
            '[系统] 踏入命途狭间',
            {
              sessions: this.dependencies.sessions,
              context: this.dependencies.context,
              signal: controller.signal,
            },
          );
          return;
        case 'message.edit-body':
          yield* editSessionMessageBody({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'companion.set-tier':
          yield* setCompanionTier({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'companion.set-traveling':
          yield* setCompanionTraveling({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'memory.compress':
          yield* compressSessionMemory(
            { ...command, command: command.command },
            this.dependencies.sessions,
            this.dependencies.context,
          );
          return;
        case 'world.set-story-mode':
          yield* setSessionStoryMode({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'story-policy.replace':
          yield* replaceStoryPolicy({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'skill.save':
          yield* saveSessionSkill({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'skill.delete':
          yield* deleteSessionSkill({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'skill.set-enabled':
          yield* setSessionSkillEnabled({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'inventory.use':
          yield* useSessionInventoryItem({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'inventory.drop':
          yield* dropSessionInventoryItem({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'inventory.undo-drop':
          yield* undoSessionInventoryDrop({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'zhiku.create':
          yield* createZhikuEntry({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'zhiku.update':
          yield* updateZhikuEntry({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'zhiku.delete':
          yield* deleteZhikuEntry({ ...command, command: command.command }, this.dependencies.sessions);
          return;
        case 'zhiku.refresh-bundled':
          yield* refreshBundledZhiku(
            { ...command, command: command.command },
            this.dependencies.sessions,
            this.dependencies.content,
          );
          return;
        case 'plot.import-text':
        case 'plot.import-json':
        case 'plot.restore-bundled':
        case 'plot.rename-series':
        case 'plot.rebuild-series':
        case 'plot.toggle-series-injection':
        case 'plot.set-current':
        case 'plot.set-segment-status':
        case 'plot.save-segment':
        case 'plot.delete-series':
        case 'plot.decompose':
        case 'plot.decompose-batch':
          yield* executePlotCommand({ ...command, command: command.command }, {
            sessions: this.dependencies.sessions,
            content: this.dependencies.content,
            context: this.dependencies.context,
            processor: this.dependencies.storyWeaving,
            signal: controller.signal,
          });
          return;
        case 'album.import-reference':
        case 'album.set-reference':
        case 'album.bind-slot':
        case 'album.delete-entries':
        case 'album.import-archive':
        case 'album.set-character-anchor':
        case 'album.generate':
          yield* executeAlbumCommand({ ...command, command: command.command }, {
            sessions: this.dependencies.sessions,
            context: this.dependencies.context,
            generator: this.dependencies.albumImages,
            signal: controller.signal,
            clock: this.dependencies.clock,
          });
          return;
        case 'phone.dismiss-seed':
        case 'phone.mark-read':
        case 'phone.add-contact':
        case 'phone.open-private-chat':
        case 'phone.create-group':
        case 'phone.rename-group':
        case 'phone.add-group-member':
        case 'phone.set-wallpaper':
        case 'phone.send':
        case 'phone.generate-seed':
          yield* executePhoneCommand({ ...command, command: command.command }, {
            sessions: this.dependencies.sessions,
            context: this.dependencies.context,
            replies: this.dependencies.phoneReplies,
            signal: controller.signal,
            clock: this.dependencies.clock,
          });
          return;
        case 'turn.advance':
          yield* executeTurn({ ...command, command: command.command }, {
            sessions: this.dependencies.sessions,
            context: this.dependencies.context,
            signal: controller.signal,
          });
          return;
        case 'turn.reroll':
          yield* rerollTurn({ ...command, command: command.command }, {
            sessions: this.dependencies.sessions,
            context: this.dependencies.context,
            signal: controller.signal,
          });
          return;
      }

      const exhaustive: never = command.command;
      throw new Error(`Unknown kernel command: ${String((exhaustive as { type: string }).type)}`);
    } finally {
      this.running.delete(commandKey);
      if (this.activeSessionCommands.get(sessionKey) === owner) {
        this.activeSessionCommands.delete(sessionKey);
      }
      resolveSettled();
      if (!isInternalJobCommand(envelope)) this.scheduleJobDrain(envelope.sessionId);
    }
  }

  async cancel(commandId: CommandId): Promise<void> {
    const running = this.running.get(String(commandId));
    if (!running) throw new Error(`Command is not running: ${commandId}`);
    this.logger.write({ level: 'info', scope: 'kernel.command', event: 'cancel.requested', data: { commandId: String(commandId) } });
    running.controller.abort();
  }

  async cancelAndWait(commandId: CommandId): Promise<void> {
    const running = this.running.get(String(commandId));
    if (!running) return;
    this.logger.write({ level: 'info', scope: 'kernel.command', event: 'cancel.requested', data: { commandId: String(commandId) } });
    running.controller.abort();
    await running.settled;
  }

  read(query: SessionExistsQuery): Promise<SessionExistenceView>;
  read(query: SessionReadQuery): Promise<SessionView>;
  async read(query: KernelQuery): Promise<QueryResult> {
    if (query.type === 'session.exists') {
      return {
        sessionId: query.sessionId,
        exists: await this.dependencies.sessions.exists(query.sessionId),
      };
    }
    const snapshot = await this.dependencies.sessions.read(query.sessionId);
    if (query.type === 'session.read') {
      const view = projectSession(snapshot);
      this.scheduleJobDrain(query.sessionId);
      return view;
    }
    const exhaustive: never = query;
    throw new Error(`Unknown kernel query: ${String((exhaustive as { type: string }).type)}`);
  }

  private async createSession(envelope: CreateSessionEnvelope): Promise<ExecutionFrame> {
    const result = await this.dependencies.sessions.create({
      sessionId: envelope.sessionId,
      commandId: envelope.commandId,
      fingerprint: fingerprintCommand(envelope.command),
      initialState: { story: structuredClone(envelope.command.story) },
    });
    if (result.type === 'duplicate_mismatch') {
      return {
        type: 'rejected',
        commandId: envelope.commandId,
        error: {
          code: 'duplicate_command',
          message: `Command id was reused with a different payload: ${envelope.commandId}`,
          details: { kind: 'duplicate_command', commandId: String(envelope.commandId) },
        },
      };
    }
    if (result.type === 'conflict') {
      return {
        type: 'rejected',
        commandId: envelope.commandId,
        error: {
          code: 'revision_conflict',
          message: `Session already exists at revision ${result.actualRevision}`,
          details: { kind: 'revision_conflict', actualRevision: Number(result.actualRevision) },
        },
      };
    }
    return {
      type: 'committed',
      commandId: envelope.commandId,
      revision: result.snapshot.revision,
      view: projectSession(result.snapshot),
    };
  }

  private scheduleJobDrain(sessionId: SessionId): void {
    const key = String(sessionId);
    if (this.scheduledJobDrains.has(key)) return;
    this.scheduledJobDrains.add(key);
    queueMicrotask(() => {
      void this.drainJobs(sessionId).finally(() => this.scheduledJobDrains.delete(key));
    });
  }

  private async drainJobs(sessionId: SessionId): Promise<void> {
    await this.runInternalJobCommand(sessionId, {
      type: 'job.recover', runnerId: this.jobRunnerId, recoveredAt: this.dependencies.clock.now(),
    });
    while (true) {
      const claim = await this.runInternalJobCommand(sessionId, {
        type: 'job.claim-next', runnerId: this.jobRunnerId, claimedAt: this.dependencies.clock.now(),
      });
      if (claim.type !== 'committed') {
        await this.scheduleFutureRetry(sessionId);
        return;
      }
      const claimedStory = await this.readStory(sessionId);
      const claimed = [...claimedStory.jobs.records].reverse().find((job) =>
        job.state === 'claimed' && job.claimedBy === this.jobRunnerId,
      );
      if (!claimed) throw new Error('Committed job claim did not project the claimed job');
      const started = await this.runInternalJobCommand(sessionId, {
        type: 'job.start', jobId: claimed.id, runnerId: this.jobRunnerId, startedAt: this.dependencies.clock.now(),
      });
      if (started.type !== 'committed') return;
      await this.runInternalJobCommand(sessionId, {
        type: 'job.execute', jobId: claimed.id, runnerId: this.jobRunnerId,
      });
    }
  }

  private async runInternalJobCommand(
    sessionId: SessionId,
    command: Extract<SessionCommandEnvelope['command'], { type: 'job.recover' | 'job.claim-next' | 'job.start' | 'job.execute' }>,
  ): Promise<Extract<ExecutionFrame, { type: 'committed' | 'rejected' }>> {
    const snapshot = await this.dependencies.sessions.read(sessionId);
    const commandId = this.dependencies.ids.next('job-command') as CommandId;
    let terminal: Extract<ExecutionFrame, { type: 'committed' | 'rejected' }> | null = null;
    for await (const frame of this.execute({
      protocolVersion: 1,
      commandId,
      sessionId,
      expectedRevision: snapshot.revision,
      command,
    })) {
      if (frame.type === 'committed' || frame.type === 'rejected') terminal = frame;
    }
    if (!terminal) throw new Error('Internal durable job command emitted no terminal frame');
    return terminal;
  }

  private async scheduleFutureRetry(sessionId: SessionId): Promise<void> {
    const snapshot = await this.dependencies.sessions.read(sessionId);
    const next = snapshot.state.story.jobs.records
      .map((job) => job.state === 'queued' || job.state === 'retry'
        ? job.availableAt
        : job.state === 'claimed' || job.state === 'running'
          ? job.leaseExpiresAt
          : null)
      .filter((time): time is number => time !== null)
      .reduce<number | null>((earliest, time) => earliest === null ? time : Math.min(earliest, time), null);
    if (next === null) return;
    const delay = Math.max(0, next - this.dependencies.clock.now());
    setTimeout(() => this.scheduleJobDrain(sessionId), delay);
  }
}

type ActiveCommandOwner =
  | Readonly<{ kind: 'foreground'; commandId: CommandId }>
  | Readonly<{ kind: 'durable-job'; commandId: CommandId; jobId: string }>;

function commandOwner(envelope: CommandEnvelope): ActiveCommandOwner {
  return 'expectedRevision' in envelope && envelope.command.type === 'job.execute'
    ? { kind: 'durable-job', commandId: envelope.commandId, jobId: envelope.command.jobId }
    : { kind: 'foreground', commandId: envelope.commandId };
}

function canPreempt(envelope: CommandEnvelope, owner: ActiveCommandOwner): owner is Extract<ActiveCommandOwner, { kind: 'durable-job' }> {
  return owner.kind === 'durable-job' &&
    'expectedRevision' in envelope &&
    envelope.command.type === 'job.cancel' &&
    envelope.command.jobId === owner.jobId;
}

function isInternalJobCommand(envelope: CommandEnvelope): boolean {
  return 'expectedRevision' in envelope && envelope.command.type.startsWith('job.') &&
    envelope.command.type !== 'job.retry' && envelope.command.type !== 'job.cancel';
}
