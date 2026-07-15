/**
 * NativeKernel — Phase 2 vertical slice.
 *
 * - turn.advance → executeTurn only (never legacy)
 * - other commands: optional transitional legacy fallback, else not_implemented
 * - read → SessionRepository projection
 *
 * Transitional: legacy dependency is ONLY for non-advance commands.
 * AdvanceTurn never falls back to legacy. Do not dual-write.
 */

import type {
  AdvanceTurnEnvelope,
  CommandEnvelope,
  CreateSessionEnvelope,
  ExecutionFrame,
  IKernel,
  KernelQuery,
  QueryResult,
  RerollTurnEnvelope,
  SessionCommandEnvelope,
} from '@/src/kernel/contract';
import type { ModelGateway } from '@/src/kernel/ports/ModelGateway';
import type { SessionRepository } from '@/src/kernel/ports/SessionRepository';
import type { LegacyKernelDependencies } from '@/src/kernel/adapters/legacy/LegacyKernelAdapter';
import { LegacyKernelAdapter } from '@/src/kernel/adapters/legacy/LegacyKernelAdapter';
import { executeTurn } from '@/src/kernel/application/executeTurn';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';

export type NativeKernelDependencies = Readonly<{
  sessions: SessionRepository;
  model: ModelGateway;
  /**
   * Transitional: non-advance commands may route here.
   * AdvanceTurn never uses this. Remove when Phase 3+ owns remaining commands.
   */
  legacy?: LegacyKernelDependencies;
}>;

export class NativeKernel implements IKernel {
  private readonly sessions: SessionRepository;
  private readonly model: ModelGateway;
  private readonly legacyAdapter: LegacyKernelAdapter | null;

  constructor(dependencies: NativeKernelDependencies) {
    this.sessions = dependencies.sessions;
    this.model = dependencies.model;
    this.legacyAdapter = dependencies.legacy
      ? new LegacyKernelAdapter(dependencies.legacy)
      : null;
  }

  async *execute(envelope: CommandEnvelope): AsyncIterable<ExecutionFrame> {
    if (envelope.command.type === 'session.create') {
      yield* this.executeCreateSession(envelope as CreateSessionEnvelope);
      return;
    }

    const sessionEnvelope = envelope as SessionCommandEnvelope;
    switch (sessionEnvelope.command.type) {
      case 'turn.advance':
        // Native only — never legacy.
        yield* executeTurn(sessionEnvelope as AdvanceTurnEnvelope, {
          sessions: this.sessions,
          model: this.model,
        });
        return;
      case 'turn.reroll':
        yield* this.executeReroll(sessionEnvelope as RerollTurnEnvelope);
        return;
      default: {
        const unknownType = (sessionEnvelope.command as { type: string }).type;
        yield {
          type: 'rejected',
          commandId: sessionEnvelope.commandId,
          error: {
            code: 'unsupported_command',
            message: `Unsupported command type: ${unknownType}`,
            details: { commandType: unknownType },
          },
        };
      }
    }
  }

  async read(query: KernelQuery): Promise<QueryResult> {
    if (query.type === 'session.read') {
      const snapshot = await this.sessions.read(query.sessionId);
      return projectSession(snapshot);
    }
    if (query.type === 'settings.read') {
      const snapshot = await this.sessions.read(query.sessionId);
      return {
        sessionId: snapshot.sessionId,
        revision: snapshot.revision,
      };
    }
    const _exhaustive: never = query;
    throw new Error(`Unsupported query: ${String((_exhaustive as { type: string }).type)}`);
  }

  private async *executeReroll(
    envelope: RerollTurnEnvelope,
  ): AsyncIterable<ExecutionFrame> {
    if (this.legacyAdapter) {
      // Transitional fallback for non-advance only.
      yield* this.legacyAdapter.execute(envelope);
      return;
    }
    yield {
      type: 'rejected',
      commandId: envelope.commandId,
      error: {
        code: 'not_implemented',
        message: 'turn.reroll is not implemented on NativeKernel (Phase 2)',
        details: { turnId: envelope.command.turnId },
      },
    };
  }

  private async *executeCreateSession(
    envelope: CreateSessionEnvelope,
  ): AsyncIterable<ExecutionFrame> {
    if (this.legacyAdapter) {
      yield* this.legacyAdapter.execute(envelope);
      return;
    }
    yield {
      type: 'rejected',
      commandId: envelope.commandId,
      error: {
        code: 'not_implemented',
        message: 'session.create is not implemented on NativeKernel (Phase 2)',
        details: { presetId: envelope.command.presetId },
      },
    };
  }
}
