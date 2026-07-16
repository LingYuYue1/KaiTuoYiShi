/**
 * Complete public mutation protocol. Every command is asynchronous and revisioned.
 */

import type { RuntimeGameState } from '@/src/kernel/domain/session/runtimeState';

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
    createdAt: number;
  }>;
}>;

export type RerollTurn = Readonly<{
  type: 'turn.reroll';
  turnId: string;
  createdAt: number;
}>;

export type ResetSession = Readonly<{
  type: 'session.reset';
  runtime: RuntimeGameState;
}>;

export type CheckpointSession = Readonly<{
  type: 'session.checkpoint';
  runtime: RuntimeGameState;
}>;

export type RegenerateNarrativeImage = Readonly<{
  type: 'message.image.regenerate';
  messageId: string;
}>;

export type RetryQueueTask = Readonly<{
  type: 'queue.retry';
  taskId: string;
  mode: 'retry' | 'reroll';
}>;

export type CreateSession = Readonly<{
  type: 'session.create';
  runtime: RuntimeGameState;
}>;

export type SessionCommand =
  | ResetSession
  | CheckpointSession
  | RegenerateNarrativeImage
  | RetryQueueTask
  | AdvanceTurn
  | RerollTurn;

export type SessionCommandEnvelope = Readonly<{
  protocolVersion: 1;
  commandId: CommandId;
  sessionId: SessionId;
  expectedRevision: Revision;
  command: SessionCommand;
}>;

export type CreateSessionEnvelope = Readonly<{
  protocolVersion: 1;
  commandId: CommandId;
  sessionId: SessionId;
  command: CreateSession;
}>;

export type CommandEnvelope = CreateSessionEnvelope | SessionCommandEnvelope;

export type AdvanceTurnEnvelope = SessionCommandEnvelope & {
  readonly command: AdvanceTurn;
};

export type RerollTurnEnvelope = SessionCommandEnvelope & {
  readonly command: RerollTurn;
};

export type ResetSessionEnvelope = SessionCommandEnvelope & {
  readonly command: ResetSession;
};

export type CheckpointSessionEnvelope = SessionCommandEnvelope & {
  readonly command: CheckpointSession;
};

export type RegenerateNarrativeImageEnvelope = SessionCommandEnvelope & {
  readonly command: RegenerateNarrativeImage;
};

export type RetryQueueTaskEnvelope = SessionCommandEnvelope & {
  readonly command: RetryQueueTask;
};
