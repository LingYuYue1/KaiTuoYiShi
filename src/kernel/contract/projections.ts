/**
 * UI projection of the one committed runtime graph.
 */

import type { Revision, SessionId } from './commands';
import type { StoryState } from '@/src/kernel/domain/session/storyState';

export type TurnView = Readonly<{
  id: string;
  createdAt: number;
  playerText: string;
  narrativeText: string;
}>;

export type MessageProjection = Readonly<{
  id: string;
  role: 'assistant';
  content: string;
  timestamp: number;
  gameTime?: string;
}>;

/** One committed projection: the runtime graph and its derived turn identities. */
export type SessionView = Readonly<{
  story: StoryState;
  sessionId: SessionId;
  revision: Revision;
  turns: readonly TurnView[];
}>;

export type SessionExistenceView = Readonly<{
  sessionId: SessionId;
  exists: boolean;
}>;

export type QueryResult = SessionView | SessionExistenceView;
