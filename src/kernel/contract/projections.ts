/**
 * IKernel projection contract (Phase 1).
 * Narrow UI-facing views — not a dump of Kernel private state.
 * Must not import old models, services, hooks, or UI types.
 */

import type { Revision, SessionId } from './commands';

export type TurnView = Readonly<{
  id: string;
  playerText: string;
  narrativeText: string;
}>;

export type SessionMessageView = Readonly<{
  role: 'user' | 'assistant';
  content: string;
}>;

/**
 * Session projection for UI / characterization.
 * turnCount + messages are included so the first cut can mirror chat identity
 * without exposing full game state.
 */
export type SessionView = Readonly<{
  sessionId: SessionId;
  revision: Revision;
  turns: readonly TurnView[];
  turnCount: number;
  messages: readonly SessionMessageView[];
  /** Optional: last progress texts observed during a successful stream (not formal). */
  lastProgressTexts?: readonly string[];
}>;

export type SettingsView = Readonly<{
  sessionId: SessionId;
  revision: Revision;
}>;

export type QueryResult = SessionView | SettingsView;
