/**
 * NativeKernel — Phase 2+ vertical slice.
 *
 * - turn.advance → executeTurn only (never legacy)
 * - turn.reroll → rerollTurn only (Phase 4; never legacy rewrite chain)
 * - variables.apply → applyVariables only (Stage 5.1; pure reduce + single CAS)
 * - other commands: optional transitional legacy fallback, else not_implemented
 * - read → SessionRepository projection
 *
 * Transitional: legacy dependency is ONLY for non-advance/non-reroll/non-variables commands.
 * Do not dual-write formal session.
 */

import type {
  AdvanceTurnEnvelope,
  ApplyVariablesEnvelope,
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
import { rerollTurn } from '@/src/kernel/application/rerollTurn';
import { applyVariables } from '@/src/kernel/application/applyVariables';
import { projectSession } from '@/src/kernel/domain/turn/projectSession';

export type NativeKernelDependencies = Readonly<{
  sessions: SessionRepository;
  model: ModelGateway;
  /**
   * Transitional: non-advance/non-reroll/non-variables commands may route here.
   * AdvanceTurn, RerollTurn, and ApplyVariables never use this.
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
        // Native only (Phase 4) — Option B fork + single CAS; no UI rewrite chain.
        yield* rerollTurn(sessionEnvelope as RerollTurnEnvelope, {
          sessions: this.sessions,
          model: this.model,
        });
        return;
      case 'variables.apply':
        // Native only (Stage 5.1) — pure reduce + single CAS; no React setters.
        yield* applyVariables(sessionEnvelope as ApplyVariablesEnvelope, {
          sessions: this.sessions,
        });
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
