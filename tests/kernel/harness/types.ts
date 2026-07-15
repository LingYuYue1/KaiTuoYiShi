/**
 * Phase-0 harness re-exports production IKernel contract (Phase 1 source of truth).
 *
 * SessionSnapshot remains harness-only (repository shape for CAS tests).
 * Do not import SessionSnapshot from App / composition root.
 */

export type {
  AdvanceTurn,
  CommandEnvelope,
  CommandId,
  ExecutionFrame,
  IKernel,
  KernelError,
  KernelErrorCode,
  KernelQuery,
  QueryResult,
  Revision,
  SessionCommand,
  SessionCommandEnvelope,
  SessionId,
  SessionView,
  TurnView,
} from '@/src/kernel/contract';

export {
  asCommandId,
  asRevision,
  asSessionId,
} from '@/src/kernel/contract';

import type { Revision, SessionId, TurnView } from '@/src/kernel/contract';

/**
 * Harness-only formal snapshot used by InMemorySessionRepository.
 * Not part of the production IKernel projection surface.
 */
export type SessionSnapshot = Readonly<{
  sessionId: SessionId;
  revision: Revision;
  turnCount: number;
  messages: readonly Readonly<{
    role: 'user' | 'assistant';
    content: string;
  }>[];
  turns: readonly TurnView[];
  /** Formal domain slice used for illegal-variable characterization. */
  travelerName: string;
}>;
