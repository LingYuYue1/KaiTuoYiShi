/**
 * IKernel command envelope contract (Phase 1).
 * Must not import old models, services, hooks, or UI types.
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

export type RerollTurn = Readonly<{
  type: 'turn.reroll';
  turnId: string;
}>;

export type CreateSession = Readonly<{
  type: 'session.create';
  presetId: string;
}>;

export type SessionCommand = AdvanceTurn | RerollTurn;

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
  command: CreateSession;
}>;

export type CommandEnvelope = CreateSessionEnvelope | SessionCommandEnvelope;

export type AdvanceTurnEnvelope = SessionCommandEnvelope & {
  readonly command: AdvanceTurn;
};

export type RerollTurnEnvelope = SessionCommandEnvelope & {
  readonly command: RerollTurn;
};
