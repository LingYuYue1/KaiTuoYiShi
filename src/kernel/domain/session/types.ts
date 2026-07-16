/** The repository owns one complete runtime graph. No mirrored domain slices exist. */

import type { Revision, SessionId } from '@/src/kernel/contract';
import type { RuntimeGameState } from './runtimeState';
import { cloneRuntimeGameState } from './runtimeState';

export type GameState = Readonly<{
  runtime: RuntimeGameState;
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
    runtime: cloneRuntimeGameState(state.runtime),
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
