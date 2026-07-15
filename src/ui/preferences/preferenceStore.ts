/**
 * Frontend PreferenceStore port (Phase 3 Stage 3.1).
 *
 * Owns UI preferences, provider credential keys, and other non-session
 * settings. Does NOT participate in SessionRepository CAS / revision.
 *
 * Ownership split:
 * - PreferenceStore: theme, apiSettings, gameSettings, worldbooks, …
 * - SessionRepository: formal turn/session GameState (revision + commandId)
 *
 * Subagent B should migrate UI/hooks off dbService.loadSetting/saveSetting
 * onto this port; the IndexedDB adapter wraps those keys internally.
 */

export interface PreferenceStore {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Known preference keys used by the host app.
 * Not exhaustive — callers may use additional string keys.
 * Documented so Subagent B can migrate call sites without inventing names.
 */
export const PreferenceKeys = {
  theme: 'theme',
  apiSettings: 'apiSettings',
  gameSettings: 'gameSettings',
  storyWeavingSystem: 'storyWeavingSystem',
  zhikuSystem: 'zhikuSystem',
  githubCloudSaveConfig: 'githubCloudSaveConfig',
} as const;

export type PreferenceKey =
  | (typeof PreferenceKeys)[keyof typeof PreferenceKeys]
  | (string & {});
