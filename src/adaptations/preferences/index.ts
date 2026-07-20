import type { PreferenceStore } from '@/src/kernel/ports/PreferenceStore';
import { createIndexedDbPreferenceStore } from '@/src/kernel/adapters/browser';

/**
 * Preference clients go straight to the device-plane store. The kernel no
 * longer exposes arbitrary key/value preference methods (Phase 2 exit gate);
 * typed access is kernel.device — these raw helpers remain only until the
 * per-slice Phase 3 migration replaces their call sites.
 */
let storePromise: Promise<PreferenceStore> | null = null;

function getStore(): Promise<PreferenceStore> {
  if (!storePromise) storePromise = createIndexedDbPreferenceStore();
  return storePromise;
}

export async function getPreference<T>(key: string): Promise<T | null> {
  return (await getStore()).get<T>(key);
}

export async function setPreference(key: string, value: unknown): Promise<void> {
  await (await getStore()).set(key, value);
}

export async function deletePreference(key: string): Promise<void> {
  await (await getStore()).delete(key);
}
