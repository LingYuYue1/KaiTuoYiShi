/**
 * LegacyKernelAdapter — Phase 1 temporary seam.
 *
 * Translates CommandEnvelope ↔ existing legacy workflow ports.
 * Must NOT introduce new business rules; translation only.
 */

import {
  createEmptyKnowledgeView,
  createEmptyNewsView,
  createEmptyPhoneView,
  createTravelerVariablesView,
} from '@/src/kernel/contract';
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
  SessionView,
} from '@/src/kernel/contract';

/**
 * Injectable ports into the old workflow / host-owned state.
 * Composition root supplies these; the adapter does not reach ambient globals.
 */
export type LegacyAdvanceTurnPort = (
  envelope: AdvanceTurnEnvelope,
) => AsyncIterable<ExecutionFrame>;

export type LegacyReadProjectionPort = (query: KernelQuery) => Promise<QueryResult>;

export type LegacyKernelDependencies = Readonly<{
  /**
   * Translates turn.advance into progress / committed / rejected frames by
   * wrapping the existing send path (or a test double). Adapter yields these
   * frames as-is — no extra domain logic.
   */
  advanceTurn: LegacyAdvanceTurnPort;
  /**
   * Optional projection read. Defaults to a narrow unsupported rejection path
   * when the host has not wired a reader yet.
   */
  readProjection?: LegacyReadProjectionPort;
}>;

function rejectFrame(
  commandId: CommandEnvelope['commandId'],
  code: 'unsupported_command' | 'not_implemented' | 'unknown',
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ExecutionFrame {
  return {
    type: 'rejected',
    commandId,
    error: { code, message, details },
  };
}

export class LegacyKernelAdapter implements IKernel {
  constructor(private readonly legacy: LegacyKernelDependencies) {}

  async *execute(envelope: CommandEnvelope): AsyncIterable<ExecutionFrame> {
    // CreateSessionEnvelope has no sessionId; SessionCommandEnvelope does.
    if (envelope.command.type === 'session.create') {
      yield* this.executeCreateSession(envelope as CreateSessionEnvelope);
      return;
    }

    const sessionEnvelope = envelope as SessionCommandEnvelope;
    switch (sessionEnvelope.command.type) {
      case 'turn.advance':
        yield* this.executeAdvanceTurn(sessionEnvelope as AdvanceTurnEnvelope);
        return;
      case 'turn.reroll':
        yield* this.executeReroll(sessionEnvelope as RerollTurnEnvelope);
        return;
      default: {
        const unknownType = (sessionEnvelope.command as { type: string }).type;
        yield rejectFrame(
          sessionEnvelope.commandId,
          'unsupported_command',
          `Unsupported command type: ${unknownType}`,
          { commandType: unknownType },
        );
      }
    }
  }

  async read(query: KernelQuery): Promise<QueryResult> {
    if (this.legacy.readProjection) {
      return this.legacy.readProjection(query);
    }
    throw new Error(
      `LegacyKernelAdapter.read: no readProjection port wired for query ${query.type}`,
    );
  }

  private async *executeAdvanceTurn(
    envelope: AdvanceTurnEnvelope,
  ): AsyncIterable<ExecutionFrame> {
    // Translation only: delegate to host-provided legacy advanceTurn port.
    yield* this.legacy.advanceTurn(envelope);
  }

  private async *executeReroll(
    envelope: RerollTurnEnvelope,
  ): AsyncIterable<ExecutionFrame> {
    // Phase 1: reroll is not first-class on the legacy adapter.
    yield rejectFrame(
      envelope.commandId,
      'not_implemented',
      'turn.reroll is not implemented on LegacyKernelAdapter (Phase 1 stub)',
      { turnId: envelope.command.turnId },
    );
  }

  private async *executeCreateSession(
    envelope: CreateSessionEnvelope,
  ): AsyncIterable<ExecutionFrame> {
    // Phase 1: session.create is not first-class on the legacy adapter.
    yield rejectFrame(
      envelope.commandId,
      'not_implemented',
      'session.create is not implemented on LegacyKernelAdapter (Phase 1 stub)',
      { presetId: envelope.command.presetId },
    );
  }
}

/**
 * Helper for hosts that already own formal chat state and only need a
 * SessionView projection for committed frames / read().
 * Pure mapping — no domain rules.
 */
export function sessionViewFromHost(input: {
  sessionId: SessionView['sessionId'];
  revision: SessionView['revision'];
  turnCount: number;
  turns?: SessionView['turns'];
  messages: SessionView['messages'];
  lastProgressTexts?: readonly string[];
  travelerName?: string;
}): SessionView {
  const travelerName = input.travelerName ?? '开拓者';
  return {
    sessionId: input.sessionId,
    revision: input.revision,
    turnCount: input.turnCount,
    turns: input.turns ?? [],
    messages: input.messages,
    travelerName,
    travelerVariables: createTravelerVariablesView(travelerName),
    knowledge: createEmptyKnowledgeView(),
    phone: createEmptyPhoneView(),
    news: createEmptyNewsView(),
    ...(input.lastProgressTexts ? { lastProgressTexts: input.lastProgressTexts } : {}),
  };
}
