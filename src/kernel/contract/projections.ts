/**
 * IKernel projection contract (Phase 1 / Stage 5.1 / 5.2 / 5.3).
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
 * Stage 5.2 narrow knowledge projection for UI / diagnostics.
 * Counts + unlocked titles only — not full entry bodies.
 */
export type KnowledgeView = Readonly<{
  yitingEntryCount: number;
  zhikuEntryCount: number;
  storyArchiveCount: number;
  unlockedZhikuTitles: readonly string[];
}>;

export function createEmptyKnowledgeView(): KnowledgeView {
  return {
    yitingEntryCount: 0,
    zhikuEntryCount: 0,
    storyArchiveCount: 0,
    unlockedZhikuTitles: [],
  };
}

/**
 * Stage 5.3 narrow phone projection — counts + last message previews.
 */
export type PhoneView = Readonly<{
  threadCount: number;
  messageCount: number;
  lastMessages: readonly Readonly<{
    contactId: string;
    contactName: string;
    content: string;
    role: 'user' | 'contact' | 'system';
  }>[];
}>;

export function createEmptyPhoneView(): PhoneView {
  return {
    threadCount: 0,
    messageCount: 0,
    lastMessages: [],
  };
}

/**
 * Stage 5.3 narrow news projection — counts + latest titles.
 */
export type NewsView = Readonly<{
  entryCount: number;
  latestTitles: readonly string[];
}>;

export function createEmptyNewsView(): NewsView {
  return {
    entryCount: 0,
    latestTitles: [],
  };
}

/**
 * Session projection for UI / characterization.
 * turnCount + messages + traveler variables + knowledge/phone/news summary so
 * native UI can render without importing kernel domain reducers.
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
  /** Stage 5.2 knowledge summary projection. */
  knowledge: KnowledgeView;
  /** Stage 5.3 phone summary projection. */
  phone: PhoneView;
  /** Stage 5.3 news summary projection. */
  news: NewsView;
  /** Optional: last progress texts observed during a successful stream (not formal). */
  lastProgressTexts?: readonly string[];
}>;

export type SettingsView = Readonly<{
  sessionId: SessionId;
  revision: Revision;
}>;

export type QueryResult = SessionView | SettingsView;
