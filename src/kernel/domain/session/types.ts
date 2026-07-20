/** The repository owns one nested StoryState. */

import type { Revision, SessionId } from '@/src/kernel/contract';
import type { StoryState } from './storyState';

export type GameState = Readonly<{
  story: StoryState;
}>;

/** Immutable identity, revision and complete state. */
export type SessionSnapshot = Readonly<{
  sessionId: SessionId;
  revision: Revision;
  state: GameState;
}>;

/** Deep-clone GameState so repository callers cannot mutate storage. */
export function cloneGameState(state: GameState): GameState {
  return {
    story: structuredClone(state.story),
  };
}

/** Deep-clone SessionSnapshot. */
export function cloneSessionSnapshot(snapshot: SessionSnapshot): SessionSnapshot {
  return {
    sessionId: snapshot.sessionId,
    revision: snapshot.revision,
    state: cloneGameState(snapshot.state),
  };
}
