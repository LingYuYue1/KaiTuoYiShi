import type {
  AdvanceTurnEnvelope,
  CommandId,
  CommandEnvelope,
  CheckpointSessionEnvelope,
  CreateSessionEnvelope,
  ExecutionFrame,
  IKernel,
  KernelQuery,
  QueryResult,
  ResetSessionEnvelope,
  RegenerateNarrativeImageEnvelope,
  RetryQueueTaskEnvelope,
  RerollTurnEnvelope,
  SessionCommandEnvelope,
  SessionExistenceView,
  SessionExistsQuery,
  SessionReadQuery,
  SessionView,
} from '@/src/kernel/contract';
import type { KernelServices, PreferenceStore, RuntimeActionEngine, SaveCatalogPort, SessionRepository, TurnEngine } from '@/src/kernel/ports';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import { rerollTurn } from '@/src/kernel/application/rerollTurn';
import { resetSession } from '@/src/kernel/application/resetSession';
import { regenerateNarrativeImage, retryRuntimeQueueTask } from '@/src/kernel/application/executeRuntimeAction';
import { checkpointSession } from '@/src/kernel/application/checkpointSession';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';

export type NativeKernelDependencies = Readonly<{
  sessions: SessionRepository;
  turns: TurnEngine;
  actions: RuntimeActionEngine;
  preferences: PreferenceStore;
  saves: SaveCatalogPort;
  services: KernelServices;
}>;

/** The only runtime kernel. Every dependency is mandatory and every call is async. */
export class NativeKernel implements IKernel {
  private readonly running = new Map<string, AbortController>();

  constructor(private readonly dependencies: NativeKernelDependencies) {}

  get saves(): SaveCatalogPort {
    return this.dependencies.saves;
  }

  get services(): KernelServices {
    return this.dependencies.services;
  }

  async *execute(envelope: CommandEnvelope): AsyncIterable<ExecutionFrame> {
    const controller = new AbortController();
    const commandKey = String(envelope.commandId);
    if (this.running.has(commandKey)) throw new Error(`Command is already running: ${commandKey}`);
    this.running.set(commandKey, controller);
    try {
      if (envelope.command.type === 'session.create') {
        yield await this.createSession(envelope as CreateSessionEnvelope);
        return;
      }

      const command = envelope as SessionCommandEnvelope;
      switch (command.command.type) {
        case 'session.checkpoint':
          yield* checkpointSession(command as CheckpointSessionEnvelope, this.dependencies.sessions);
          return;
        case 'session.reset':
          yield* resetSession(command as ResetSessionEnvelope, this.dependencies.sessions);
          return;
        case 'message.image.regenerate':
          yield* regenerateNarrativeImage(command as RegenerateNarrativeImageEnvelope, {
            sessions: this.dependencies.sessions,
            actions: this.dependencies.actions,
            signal: controller.signal,
          });
          return;
        case 'queue.retry':
          yield* retryRuntimeQueueTask(command as RetryQueueTaskEnvelope, {
            sessions: this.dependencies.sessions,
            actions: this.dependencies.actions,
            signal: controller.signal,
          });
          return;
        case 'turn.advance':
          yield* executeTurn(command as AdvanceTurnEnvelope, {
            sessions: this.dependencies.sessions,
            turns: this.dependencies.turns,
            signal: controller.signal,
          });
          return;
        case 'turn.reroll':
          yield* rerollTurn(command as RerollTurnEnvelope, {
            sessions: this.dependencies.sessions,
            turns: this.dependencies.turns,
            signal: controller.signal,
          });
          return;
      }

      const exhaustive: never = command.command;
      throw new Error(`Unknown kernel command: ${String((exhaustive as { type: string }).type)}`);
    } finally {
      this.running.delete(commandKey);
    }
  }

  async cancel(commandId: CommandId): Promise<void> {
    const controller = this.running.get(String(commandId));
    if (!controller) throw new Error(`Command is not running: ${commandId}`);
    controller.abort();
  }

  getPreference<T>(key: string): Promise<T | null> {
    return this.dependencies.preferences.get<T>(key);
  }

  setPreference(key: string, value: unknown): Promise<void> {
    return this.dependencies.preferences.set(key, value);
  }

  deletePreference(key: string): Promise<void> {
    return this.dependencies.preferences.delete(key);
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
    if (query.type === 'session.read') return projectSession(snapshot);
    const exhaustive: never = query;
    throw new Error(`Unknown kernel query: ${String((exhaustive as { type: string }).type)}`);
  }

  private async createSession(envelope: CreateSessionEnvelope): Promise<ExecutionFrame> {
    const result = await this.dependencies.sessions.create({
      sessionId: envelope.sessionId,
      commandId: envelope.commandId,
      initialState: { runtime: envelope.command.runtime },
    });
    if (result.type === 'conflict') {
      return {
        type: 'rejected',
        commandId: envelope.commandId,
        error: {
          code: 'revision_conflict',
          message: `Session already exists at revision ${result.actualRevision}`,
          details: { actualRevision: result.actualRevision },
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
}
