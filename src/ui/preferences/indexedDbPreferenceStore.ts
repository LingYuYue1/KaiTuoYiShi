/**
 * PreferenceStore adapter backed by the existing settings storage path.
 *
 * Wraps dbService loadSetting/saveSetting/deleteSetting so UI code can depend
 * on PreferenceStore without importing dbService directly.
 *
 * Kernel formal session state must NOT go through this adapter.
 */

import type { PreferenceStore } from './preferenceStore';

export type SettingsStorage = Readonly<{
  loadSetting: <T>(key: string) => Promise<T | null>;
  saveSetting: (key: string, value: unknown) => Promise<void>;
  deleteSetting: (key: string) => Promise<void>;
}>;

export class IndexedDbPreferenceStore implements PreferenceStore {
  constructor(private readonly storage: SettingsStorage) {}

  get<T>(key: string): Promise<T | null> {
    return this.storage.loadSetting<T>(key);
  }

  set(key: string, value: unknown): Promise<void> {
    return this.storage.saveSetting(key, value);
  }

  delete(key: string): Promise<void> {
    return this.storage.deleteSetting(key);
  }
}

/**
 * Production factory: lazy-imports dbService so kernel/unit tests do not
 * pull IndexedDB unless they construct this store.
 */
export async function createIndexedDbPreferenceStore(): Promise<PreferenceStore> {
  const db = await import('@/services/dbService');
  return new IndexedDbPreferenceStore({
    loadSetting: db.loadSetting,
    saveSetting: db.saveSetting,
    deleteSetting: db.deleteSetting,
  });
}

/** Test / host injection without dynamic import. */
export function createPreferenceStoreFromStorage(
  storage: SettingsStorage,
): PreferenceStore {
  return new IndexedDbPreferenceStore(storage);
}
