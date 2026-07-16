/**
 * UI projection of the one committed runtime graph.
 */

import type { Revision, SessionId } from './commands';
import type { RuntimeGameState } from '@/src/kernel/domain/session/runtimeState';

export type TurnView = Readonly<{
  id: string;
  createdAt: number;
  playerText: string;
  narrativeText: string;
}>;

/** One committed projection: the runtime graph and its derived turn identities. */
export type SessionView = Readonly<{
  runtime: RuntimeGameState;
  sessionId: SessionId;
  revision: Revision;
  turns: readonly TurnView[];
}>;

export type SessionExistenceView = Readonly<{
  sessionId: SessionId;
  exists: boolean;
}>;

export type QueryResult = SessionView | SessionExistenceView;
