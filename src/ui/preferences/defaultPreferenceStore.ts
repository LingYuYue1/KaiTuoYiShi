/**
 * Composition-root singleton for PreferenceStore.
 *
 * Presentation code (components / App / UI-facing hooks) imports this module
 * instead of `@/services/dbService`. The IndexedDB adapter is constructed once
 * and only lives inside src/ui/preferences/.
 */

import { createIndexedDbPreferenceStore } from './indexedDbPreferenceStore';
import type { PreferenceStore } from './preferenceStore';

let storePromise: Promise<PreferenceStore> | null = null;
let storeOverride: PreferenceStore | null = null;

/**
 * Production accessor. Lazily constructs the IndexedDB-backed store.
 * Tests may inject via `setDefaultPreferenceStore`.
 */
export function getPreferenceStore(): Promise<PreferenceStore> {
  if (storeOverride) return Promise.resolve(storeOverride);
  if (!storePromise) {
    storePromise = createIndexedDbPreferenceStore();
  }
  return storePromise;
}

/**
 * Fire-and-forget preference write used by many settings tabs that previously
 * called `void saveSetting(...)` without awaiting.
 */
export function setPreference(key: string, value: unknown): void {
  void getPreferenceStore().then((store) => store.set(key, value));
}

/**
 * Awaitable preference write.
 */
export async function setPreferenceAsync(
  key: string,
  value: unknown,
): Promise<void> {
  const store = await getPreferenceStore();
  await store.set(key, value);
}

/**
 * Awaitable preference read.
 */
export async function getPreference<T>(key: string): Promise<T | null> {
  const store = await getPreferenceStore();
  return store.get<T>(key);
}

/**
 * Awaitable preference delete.
 */
export async function deletePreference(key: string): Promise<void> {
  const store = await getPreferenceStore();
  await store.delete(key);
}

/**
 * Test / host injection. Pass null to clear override and re-lazy-init.
 */
export function setDefaultPreferenceStore(store: PreferenceStore | null): void {
  storeOverride = store;
  if (store === null) {
    storePromise = null;
  }
}
