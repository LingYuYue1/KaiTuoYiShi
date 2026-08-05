import type { 智库系统 } from '@/models/zhiku';
import { 归一化智库系统 } from '@/models/zhiku';
import { loadSetting, saveSetting } from '@/services/dbService';
import {
  loadAllBundledZhikuPresets,
  validateBundledZhikuCatalog,
  ZHIKU_BUNDLED_CATALOG_CACHE_KEY,
  type LoadBundledZhikuOptions,
} from './zhikuPreset';

export interface BundledZhikuCatalogLoadResult {
  system: 智库系统;
  source: 'network' | 'cache';
  loadError?: Error;
}

export async function saveValidatedBundledZhikuCatalog(system: 智库系统): Promise<void> {
  const normalized = 归一化智库系统(system);
  validateBundledZhikuCatalog(normalized);
  await saveSetting(ZHIKU_BUNDLED_CATALOG_CACHE_KEY, normalized);
}

export async function loadBundledZhikuCatalogWithFallback(
  options: LoadBundledZhikuOptions = {},
): Promise<BundledZhikuCatalogLoadResult> {
  return resolveBundledZhikuCatalog({
    loadFresh: () => loadAllBundledZhikuPresets(options),
    loadCached: () => loadSetting<智库系统>(ZHIKU_BUNDLED_CATALOG_CACHE_KEY),
    saveCache: saveValidatedBundledZhikuCatalog,
  });
}

export async function resolveBundledZhikuCatalog(input: {
  loadFresh: () => Promise<智库系统>;
  loadCached: () => Promise<智库系统 | null>;
  saveCache: (system: 智库系统) => Promise<void>;
}): Promise<BundledZhikuCatalogLoadResult> {
  try {
    const system = await input.loadFresh();
    validateBundledZhikuCatalog(system);
    await input.saveCache(system);
    return { system, source: 'network' };
  } catch (error) {
    const loadError = error instanceof Error ? error : new Error(String(error));
    const cached = await input.loadCached();
    if (!cached) throw loadError;
    const system = 归一化智库系统(cached);
    try {
      validateBundledZhikuCatalog(system);
    } catch (cacheError) {
      throw new AggregateError([loadError, cacheError], '智库新目录与最后完整缓存均不可用。');
    }
    return { system, source: 'cache', loadError };
  }
}
