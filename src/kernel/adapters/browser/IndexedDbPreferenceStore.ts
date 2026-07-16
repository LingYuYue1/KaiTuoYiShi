import type { PreferenceStore } from '@/src/kernel/ports';

export async function createIndexedDbPreferenceStore(): Promise<PreferenceStore> {
  const storage = await import('@/services/dbService');
  return {
    get: storage.loadSetting,
    set: storage.saveSetting,
    delete: storage.deleteSetting,
  };
}
