import type { 智库系统 } from '@/models/zhiku';
import { 归一化智库系统 } from '@/models/zhiku';
import { loadSetting, saveSetting } from '@/services/storage/settings';
import {
  ZHIKU_BUNDLED_CATALOG_CACHE_KEY,
  loadAllBundledZhikuPresets,
  validateBundledZhikuCatalog,
  type LoadBundledZhikuOptions,
} from './zhikuPreset';

export interface BundledZhikuCatalogLoadResult {
  system: 智库系统;
  source: 'network' | 'cache';
  loadError?: Error;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/** 只有通过完整性校验的目录才允许写缓存，保证缓存永远是「最后一份可用档案」。 */
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

/**
 * 新目录优先、最后完整缓存兜底。新目录缺失或损坏时返回缓存并附带加载错误；
 * 两份都不可用时抛出 AggregateError，由调用方保留当前内存中的档案。
 */
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
    const loadError = toError(error);
    const cached = await input.loadCached();
    if (!cached) throw loadError;
    const system = 归一化智库系统(cached);
    try {
      validateBundledZhikuCatalog(system);
    } catch (cacheError) {
      throw new AggregateError([loadError, toError(cacheError)], '智库新目录与最后完整缓存均不可用。', { cause: cacheError });
    }
    return { system, source: 'cache', loadError };
  }
}
