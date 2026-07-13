import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

const RELOAD_QUERY_KEY = 'kty_chunk_retry';

export type PreloadableLazyComponent<T extends ComponentType<any>> = LazyExoticComponent<T> & {
  preload: () => Promise<void>;
};

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /dynamically imported module|failed to fetch|loading chunk|chunkloaderror/i.test(message);
}

function clearReloadMarker(): void {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has(RELOAD_QUERY_KEY)) return;
    url.searchParams.delete(RELOAD_QUERY_KEY);
    window.history.replaceState(window.history.state, '', url.toString());
  } catch {
    // URL cleanup is best-effort only.
  }
}

function reloadOnce(): boolean {
  const url = new URL(window.location.href);
  if (url.searchParams.get(RELOAD_QUERY_KEY) === '1') {
    clearReloadMarker();
    return false;
  }
  url.searchParams.set(RELOAD_QUERY_KEY, '1');
  window.location.replace(url.toString());
  return true;
}

export function lazyWithRetry<T extends ComponentType<any>>(
  loader: () => Promise<{ default: T }>,
): PreloadableLazyComponent<T> {
  let modulePromise: Promise<{ default: T }> | null = null;

  const loadModule = () => {
    if (!modulePromise) {
      modulePromise = loader().catch((error) => {
        modulePromise = null;
        throw error;
      });
    }
    return modulePromise;
  };

  const component = lazy(async () => {
    try {
      const module = await loadModule();
      clearReloadMarker();
      return module;
    } catch (error) {
      if (!isChunkLoadError(error)) throw error;
      if (reloadOnce()) return await new Promise<never>(() => {});
      throw error;
    }
  }) as PreloadableLazyComponent<T>;

  component.preload = async () => {
    try {
      await loadModule();
    } catch {
      // An idle preload must not reload the app or leak an unhandled rejection.
    }
  };

  return component;
}
