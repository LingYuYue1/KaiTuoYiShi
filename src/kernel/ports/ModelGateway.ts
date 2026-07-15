/**
 * ModelGateway port (Phase 2).
 *
 * Deep async port for narrative model completion.
 * Phone/News/Variable/Story are application use cases — not methods here.
 */

/** Minimal model request for the AdvanceTurn vertical slice. */
export type ModelRequest = Readonly<{
  /** Player input for this turn. */
  playerText: string;
  /** Formal turn counter from base session state. */
  turnCount: number;
  /** Prior formal messages (user/assistant only). */
  messages: readonly Readonly<{
    role: 'user' | 'assistant';
    content: string;
  }>[];
  /**
   * Phase 2 vertical-slice prompt.
   * Full tavern/system-prompt chain is Phase 3+; this is intentionally minimal.
   */
  prompt: string;
}>;

export type ModelFrame =
  | Readonly<{ type: 'delta'; text: string }>
  | Readonly<{ type: 'completed'; text: string }>;

export interface ModelGateway {
  complete(request: ModelRequest): AsyncIterable<ModelFrame>;
}
