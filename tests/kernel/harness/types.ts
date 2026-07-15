/**
 * Phase-0 provisional IKernel contract shapes.
 *
 * These mirror IKernelRefac.md §6 for behavior tests only.
 * Production `src/kernel/contract/*` lands in Phase 1 — do not import this
 * module from App / composition root / production hooks.
 */

export type CommandId = string & { readonly __brand: 'CommandId' };
export type SessionId = string & { readonly __brand: 'SessionId' };
export type Revision = number & { readonly __brand: 'Revision' };

export function asCommandId(value: string): CommandId {
  return value as CommandId;
}

export function asSessionId(value: string): SessionId {
  return value as SessionId;
}

export function asRevision(value: number): Revision {
  return value as Revision;
}

export type AdvanceTurn = Readonly<{
  type: 'turn.advance';
  input: Readonly<{
    text: string;
  }>;
}>;

export type SessionCommand = AdvanceTurn;

export type SessionCommandEnvelope = Readonly<{
  protocolVersion: 1;
  commandId: CommandId;
  sessionId: SessionId;
  expectedRevision: Revision;
  command: SessionCommand;
}>;

export type CommandEnvelope = SessionCommandEnvelope;

export type TurnView = Readonly<{
  id: string;
  playerText: string;
  narrativeText: string;
}>;

export type SessionView = Readonly<{
  sessionId: SessionId;
  revision: Revision;
  turns: readonly TurnView[];
  /** Provisional: mirrors legacy turnCount for characterization. */
  turnCount: number;
  /** Observable chat lines after formal commit (user + assistant pairs). */
  messages: readonly Readonly<{
    role: 'user' | 'assistant';
    content: string;
  }>[];
  /** Last progress texts observed during the most recent successful stream (not formal). */
  lastProgressTexts?: readonly string[];
}>;

export type KernelErrorCode =
  | 'revision_conflict'
  | 'duplicate_command'
  | 'model_failure'
  | 'illegal_variable'
  | 'cancelled'
  | 'unknown';

export type KernelError = Readonly<{
  code: KernelErrorCode;
  message: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export type ExecutionFrame =
  | Readonly<{
      type: 'progress';
      commandId: CommandId;
      delta: Readonly<{
        kind: 'narrative';
        text: string;
      }>;
    }>
  | Readonly<{
      type: 'committed';
      commandId: CommandId;
      revision: Revision;
      view: SessionView;
    }>
  | Readonly<{
      type: 'rejected';
      commandId: CommandId;
      error: KernelError;
    }>;

export type KernelQuery = Readonly<{
  type: 'session.read';
  sessionId: SessionId;
}>;

export type QueryResult = SessionView;

/**
 * Provisional IKernel surface used by Phase-0 tests.
 * Production interface is Phase 1.
 */
export interface IKernel {
  execute(command: CommandEnvelope): AsyncIterable<ExecutionFrame>;
  read(query: KernelQuery): Promise<QueryResult>;
}

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
