/**
 * Phase 3 — PreferenceStore ownership (not session CAS).
 */

import { describe, expect, it } from 'vitest';
import {
  MemoryPreferenceStore,
  createPreferenceStoreFromStorage,
  PreferenceKeys,
} from '@/src/ui/preferences';
import type { SettingsStorage } from '@/src/ui/preferences';

describe('PreferenceStore', () => {
  it('MemoryPreferenceStore get/set/delete', async () => {
    const store = new MemoryPreferenceStore();
    expect(await store.get('theme')).toBeNull();

    await store.set(PreferenceKeys.theme, { mode: 'dark' });
    expect(await store.get<{ mode: string }>(PreferenceKeys.theme)).toEqual({
      mode: 'dark',
    });

    await store.delete(PreferenceKeys.theme);
    expect(await store.get(PreferenceKeys.theme)).toBeNull();
  });

  it('IndexedDbPreferenceStore wraps settings storage without CAS', async () => {
    const map = new Map<string, unknown>();
    const storage: SettingsStorage = {
      async loadSetting<T>(key: string) {
        if (!map.has(key)) return null;
        return map.get(key) as T;
      },
      async saveSetting(key, value) {
        map.set(key, value);
      },
      async deleteSetting(key) {
        map.delete(key);
      },
    };

    const store = createPreferenceStoreFromStorage(storage);
    await store.set(PreferenceKeys.apiSettings, { endpoint: 'https://x' });
    expect(await store.get(PreferenceKeys.apiSettings)).toEqual({
      endpoint: 'https://x',
    });
    await store.delete(PreferenceKeys.apiSettings);
    expect(map.has(PreferenceKeys.apiSettings)).toBe(false);
  });

  it('preference keys are independent of session revision', async () => {
    // Document ownership: preferences never carry revision/commandId.
    const store = new MemoryPreferenceStore();
    await store.set('gameSettings', { autoSave: true });
    const value = await store.get<{ autoSave: boolean }>('gameSettings');
    expect(value).toEqual({ autoSave: true });
    expect(value).not.toHaveProperty('revision');
    expect(value).not.toHaveProperty('commandId');
  });
});
