/**
 * Frontend preference ownership (Phase 3 Stage 3.1).
 *
 * Not session CAS. Not formal GameState.
 */

export type { PreferenceStore, PreferenceKey } from './preferenceStore';
export { PreferenceKeys } from './preferenceStore';
export {
  IndexedDbPreferenceStore,
  createIndexedDbPreferenceStore,
  createPreferenceStoreFromStorage,
  type SettingsStorage,
} from './indexedDbPreferenceStore';
export { MemoryPreferenceStore } from './memoryPreferenceStore';
export {
  getPreferenceStore,
  setPreference,
  setPreferenceAsync,
  getPreference,
  deletePreference,
  setDefaultPreferenceStore,
} from './defaultPreferenceStore';
