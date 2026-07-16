import type { RuntimeGameState } from '@/src/kernel/domain/session/runtimeState';

export type TurnEngineRequest = Readonly<{
  state: RuntimeGameState;
  text: string;
}>;

export type TurnEngineFrame =
  | Readonly<{ type: 'progress'; text: string }>
  | Readonly<{ type: 'completed'; state: RuntimeGameState }>;

/** Host-specific full narrative workflow. It cannot commit session state. */
export interface TurnEngine {
  advance(request: TurnEngineRequest, signal: AbortSignal): AsyncIterable<TurnEngineFrame>;
}
