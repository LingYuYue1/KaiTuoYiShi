/**
 * IKernel projection contract (Phase 1 / Stage 5.1).
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

/** Stage 5.1 traveler variable slice for UI display / Variable Manager. */
export type TravelerVariablesView = Readonly<{
  姓名: string;
  身份: string;
  外貌: string;
  性格: string;
  背景: string;
  数值属性: Readonly<Record<string, number>>;
}>;

export function createTravelerVariablesView(
  姓名 = '开拓者',
): TravelerVariablesView {
  return { 姓名, 身份: '', 外貌: '', 性格: '', 背景: '', 数值属性: {} };
}

/**
 * Session projection for UI / characterization.
 * turnCount + messages + traveler variables so native UI can render
 * without importing kernel domain or utils/variableExecutor reducers.
 */
export type SessionView = Readonly<{
  sessionId: SessionId;
  revision: Revision;
  turns: readonly TurnView[];
  turnCount: number;
  messages: readonly SessionMessageView[];
  /** Mirror of formal traveler name. */
  travelerName: string;
  /** Formal traveler variable slice. */
  travelerVariables: TravelerVariablesView;
  /** Optional: last progress texts observed during a successful stream (not formal). */
  lastProgressTexts?: readonly string[];
}>;

export type SettingsView = Readonly<{
  sessionId: SessionId;
  revision: Revision;
}>;

export type QueryResult = SessionView | SettingsView;
